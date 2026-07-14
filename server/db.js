// ============================================================================
// server/db.js — SQLite 数据层
// 文件型数据库，首次启动自动建表，零配置。数据文件位于 server/data/app.sqlite
// ============================================================================
'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
// 部署时可通过环境变量 DB_PATH 指向挂载的持久盘（如 /data/app.sqlite），避免免费实例重启丢库
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.sqlite');
const _dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(_dbDir)) fs.mkdirSync(_dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // 并发读写更稳

// ----- 建表（IF NOT EXISTS，幂等） -----
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token     TEXT PRIMARY KEY,
  user_id   INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user  INTEGER NOT NULL,
  to_user    INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending / accepted / rejected
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(from_user, to_user),
  FOREIGN KEY(from_user) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(to_user)   REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS friendships (
  user_a     INTEGER NOT NULL,
  user_b     INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b),
  FOREIGN KEY(user_a) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(user_b) REFERENCES users(id) ON DELETE CASCADE
);

-- 聊天消息：channel = 'dm' | 'room' | 'team'
-- scope 用于路由：dm 用 to_user(对方id)；room/team 用 room_code
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  channel    TEXT NOT NULL,           -- dm / room / team
  scope      TEXT NOT NULL,           -- 对方 userId(字符串) 或 房间码
  from_user  INTEGER NOT NULL,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY(from_user) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rooms_meta (
  code       TEXT PRIMARY KEY,
  host_id    INTEGER NOT NULL,
  map_key    TEXT NOT NULL DEFAULT 'port',
  team_size  INTEGER NOT NULL DEFAULT 3,
  state      TEXT NOT NULL DEFAULT 'lobby',  -- lobby / playing / ended
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY(host_id) REFERENCES users(id) ON DELETE CASCADE
);
`);
// rooms_meta 仅作历史记录；房间的实时玩家/队伍归属由内存状态
// (realtime.js 的 Room 对象) 维护，以保证低延迟。

// ----- 预编译常用查询 -----
const stmts = {
  getUserById:    db.prepare('SELECT * FROM users WHERE id = ?'),
  getUserByName:  db.prepare('SELECT * FROM users WHERE username = ?'),
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserByLogin: db.prepare('SELECT * FROM users WHERE username = ? OR email = ?'),
  insertUser:     db.prepare('INSERT INTO users (username, email, password_hash, display_name) VALUES (?,?,?,?)'),

  insertSession:  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)'),
  deleteSession:  db.prepare('DELETE FROM sessions WHERE token = ?'),
  getSession:     db.prepare('SELECT s.token, s.user_id, s.expires_at, u.username, u.email, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'),
  purgeSessions:  db.prepare('DELETE FROM sessions WHERE expires_at < ?'),

  // 好友
  searchUsers:    db.prepare("SELECT id, username, display_name FROM users WHERE username LIKE ? COLLATE NOCASE OR email LIKE ? COLLATE NOCASE LIMIT 20"),
  getFriendship:  db.prepare('SELECT * FROM friendships WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)'),
  addFriendship:  db.prepare('INSERT OR IGNORE INTO friendships (user_a, user_b) VALUES (?,?)'),
  removeFriendship: db.prepare('DELETE FROM friendships WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)'),
  listFriends:    db.prepare(`
    SELECT u.id, u.username, u.display_name FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
    WHERE f.user_a = ? OR f.user_b = ?`),
  insertReq:      db.prepare("INSERT OR IGNORE INTO friend_requests (from_user, to_user) VALUES (?,?)"),
  getPendingReq:  db.prepare('SELECT r.id, r.from_user, r.to_user, r.created_at, u.username, u.display_name FROM friend_requests r JOIN users u ON u.id = r.from_user WHERE r.to_user = ? AND r.status = ?'),
  setReqStatus:   db.prepare('UPDATE friend_requests SET status = ? WHERE id = ?'),
  getRequest:     db.prepare('SELECT * FROM friend_requests WHERE id = ?'),

  // 消息
  insertMsg:      db.prepare('INSERT INTO messages (channel, scope, from_user, content) VALUES (?,?,?,?)'),
  getDMHistory:   db.prepare(`SELECT * FROM messages WHERE channel='dm' AND (
        (scope = ? AND from_user = ?) OR (scope = ? AND from_user = ?)
      ) ORDER BY id ASC LIMIT 100`),
  getRoomHistory: db.prepare("SELECT * FROM messages WHERE channel = ? AND scope = ? ORDER BY id ASC LIMIT 100"),
};

// 定期清理过期会话
setInterval(() => { try { stmts.purgeSessions.run(Math.floor(Date.now()/1000)); } catch(e){} }, 60 * 60 * 1000).unref();

module.exports = { db, stmts };
