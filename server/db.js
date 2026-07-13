// ============================================================================
// server/db.js — SQLite 数据层
// 文件型数据库，首次启动自动建表，零配置。数据文件位于 server/data/app.sqlite
// ============================================================================
'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'app.sqlite');
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

-- 段位榜 / ELO（A3）
CREATE TABLE IF NOT EXISTS user_rank (
  user_id    INTEGER PRIMARY KEY,
  elo        INTEGER NOT NULL DEFAULT 1000,    -- 初始 1000
  wins       INTEGER NOT NULL DEFAULT 0,
  losses     INTEGER NOT NULL DEFAULT 0,
  tier       TEXT NOT NULL DEFAULT '青铜',      -- 青铜/白银/黄金/铂金/钻石/大师/王者
  updated_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 成长线 / Meta（C）：等级与经验
CREATE TABLE IF NOT EXISTS user_progression (
  user_id    INTEGER PRIMARY KEY,
  xp         INTEGER NOT NULL DEFAULT 0,
  level      INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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

  // 段位榜 / ELO（A3）
  getRank:    db.prepare('SELECT * FROM user_rank WHERE user_id = ?'),
  topRank:    db.prepare('SELECT * FROM user_rank ORDER BY elo DESC LIMIT ?'),
  upsertRank: db.prepare(`INSERT INTO user_rank (user_id, elo, wins, losses, tier, updated_at)
    VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
      elo=excluded.elo, wins=excluded.wins, losses=excluded.losses, tier=excluded.tier, updated_at=excluded.updated_at`),
  // 成长线 / Meta（C）
  getProg:     db.prepare('SELECT * FROM user_progression WHERE user_id = ?'),
  upsertProg:  db.prepare(`INSERT INTO user_progression (user_id, xp, level, updated_at)
    VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
      xp=excluded.xp, level=excluded.level, updated_at=excluded.updated_at`),
};

// 定期清理过期会话
setInterval(() => { try { stmts.purgeSessions.run(Math.floor(Date.now()/1000)); } catch(e){} }, 60 * 60 * 1000).unref();

// ======================== 段位 / ELO（A3） ========================
// 段位阈值：<1000 青铜，<1200 白银，<1400 黄金，<1600 铂金，<1800 钻石，<2000 大师，>=2000 王者
function tierFromElo(elo) {
  if (elo >= 2000) return '王者';
  if (elo >= 1800) return '大师';
  if (elo >= 1600) return '钻石';
  if (elo >= 1400) return '铂金';
  if (elo >= 1200) return '黄金';
  if (elo >= 1000) return '白银';
  return '青铜';
}

// 应用一局对战结果，批量更新每位玩家的 ELO / 胜负数 / 段位。
// players: [{ userId, team, kills, deaths, win:bool }]
// 对手平均分取该玩家"敌队"成员当前 DB ELO 的均值；ELO 公式 K=32。
function applyMatchResult(players) {
  if (!Array.isArray(players) || players.length === 0) return;
  const K = 32;
  // 先快照所有参赛者的当前 ELO/胜负（保证同局内互算用赛前分，避免顺序偏差）
  const snap = {};
  for (const p of players) {
    const uid = Number(p.userId);
    if (!uid) continue;
    const row = stmts.getRank.get(uid);
    snap[uid] = row ? { elo: row.elo, wins: row.wins, losses: row.losses }
                    : { elo: 1000, wins: 0, losses: 0 };
  }
  const tx = db.transaction(() => {
    for (const p of players) {
      const uid = Number(p.userId);
      if (!uid) continue;
      const me = snap[uid];
      const enemies = players.filter(e => Number(e.userId) !== uid && e.team !== p.team);
      let oppAvg = 1000;
      if (enemies.length) {
        let sum = 0;
        for (const e of enemies) {
          const eid = Number(e.userId);
          sum += (snap[eid] ? snap[eid].elo : 1000);
        }
        oppAvg = sum / enemies.length;
      }
      const result = p.win ? 1 : 0;
      const expected = 1 / (1 + Math.pow(10, (oppAvg - me.elo) / 400));
      const newElo = Math.round(me.elo + K * (result - expected));
      const wins = me.wins + (p.win ? 1 : 0);
      const losses = me.losses + (p.win ? 0 : 1);
      const tier = tierFromElo(newElo);
      stmts.upsertRank.run(uid, newElo, wins, losses, tier, Date.now());
    }
  });
  tx();
}

// 成长线 / Meta（C）：每局结算后发放经验并更新等级。
// 经验规则：胜利 +30，失败 +12；每击杀 +3（单局封顶 +60）。等级 = floor(xp/100)+1（封顶 99）。
function applyMatchXp(players) {
  if (!Array.isArray(players) || players.length === 0) return;
  const tx = db.transaction(() => {
    for (const p of players) {
      const uid = Number(p.userId);
      if (!uid) continue;
      const row = stmts.getProg.get(uid);
      const curXp = row ? row.xp : 0;
      const winXp = p.win ? 30 : 12;
      const killXp = Math.min(60, (Number(p.kills) || 0) * 3);
      const xp = Math.max(0, curXp + winXp + killXp);
      const level = Math.min(99, Math.floor(xp / 100) + 1);
      stmts.upsertProg.run(uid, xp, level, Date.now());
    }
  });
  tx();
}

module.exports = { db, stmts, applyMatchResult, applyMatchXp, tierFromElo };
