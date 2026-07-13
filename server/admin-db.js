// ============================================================================
// server/admin-db.js — 后台管理系统数据层
// 在 apps.sqlite 上新增 admin 相关表，与游戏数据库共存
// ============================================================================
'use strict';

const { db } = require('./db');

// ----- 建表 -----
db.exec(`
-- 管理员表
CREATE TABLE IF NOT EXISTS admins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'admin',   -- super_admin / admin / editor
  must_reset INTEGER NOT NULL DEFAULT 1,      -- 首次登录是否强制改密
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_login INTEGER
);

-- 管理员会话
CREATE TABLE IF NOT EXISTS admin_sessions (
  token      TEXT PRIMARY KEY,
  admin_id   INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

-- 武器配置表（覆盖/扩展游戏内 WEAPON_DISPLAY_DATA）
CREATE TABLE IF NOT EXISTS weapon_config (
  id         TEXT PRIMARY KEY,          -- weapon key: 'thunder','tumo','dragonlyknight'...
  name       TEXT NOT NULL,
  quality    TEXT DEFAULT 'common',     -- common/hero/legendary/divine
  category   TEXT DEFAULT 'primary',    -- primary/secondary/melee/grenade/tactical
  base_dmg   REAL DEFAULT 0,
  fire_rate  REAL DEFAULT 10,
  magazine   INTEGER DEFAULT 30,
  reserve    INTEGER DEFAULT 180,
  skill_dmg  REAL DEFAULT 0,
  price      INTEGER DEFAULT 0,
  is_active  INTEGER DEFAULT 1,
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- 角色配置表
CREATE TABLE IF NOT EXISTS character_config (
  id         TEXT PRIMARY KEY,          -- 'rookie','militia',...
  name       TEXT NOT NULL,
  star       INTEGER DEFAULT 1,
  hp_bonus   REAL DEFAULT 0,
  shield_bonus REAL DEFAULT 0,
  soul_bonus REAL DEFAULT 0,
  crit_bonus REAL DEFAULT 0,
  speed_bonus REAL DEFAULT 0,
  price      INTEGER DEFAULT 0,
  is_active  INTEGER DEFAULT 1,
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- 关卡配置表
CREATE TABLE IF NOT EXISTS level_config (
  level_no   INTEGER PRIMARY KEY,
  name       TEXT,
  boss_name  TEXT,
  boss_hp    REAL DEFAULT 100000000,
  hp_mult    REAL DEFAULT 1.5,
  small_hp_ratio REAL DEFAULT 0.005,
  wave_count INTEGER DEFAULT 3,
  is_boss_only INTEGER DEFAULT 0,
  map_theme  TEXT,
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- 王者乱斗地图配置
CREATE TABLE IF NOT EXISTS wzlb_map_config (
  map_key    TEXT PRIMARY KEY,          -- port/checkpoint/warehouse/radar/ruins
  name       TEXT NOT NULL,
  is_open    INTEGER DEFAULT 1,
  max_players INTEGER DEFAULT 2,
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- 商城商品配置
CREATE TABLE IF NOT EXISTS shop_config (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type  TEXT NOT NULL,             -- weapon / character / item / currency
  item_key   TEXT NOT NULL,             -- weapon id / character id
  price      INTEGER NOT NULL,
  is_active  INTEGER DEFAULT 1,
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- 运营活动
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  desc       TEXT,
  type       TEXT NOT NULL,             -- double_drop / exp_boost / special
  bonus_mult REAL DEFAULT 1,
  start_at   INTEGER NOT NULL,
  end_at     INTEGER NOT NULL,
  is_active  INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

-- 全服公告
CREATE TABLE IF NOT EXISTS notices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  content    TEXT NOT NULL,
  type       TEXT DEFAULT 'normal',     -- normal / urgent / marquee
  is_active  INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  expires_at INTEGER
);

-- 管理员操作日志
CREATE TABLE IF NOT EXISTS admin_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER NOT NULL,
  admin_name TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  ip         TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

-- 封禁记录
CREATE TABLE IF NOT EXISTS user_bans (
  user_id    INTEGER PRIMARY KEY,
  reason     TEXT,
  banned_at  INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// ----- 预设超级管理员 -----
const bcrypt = require('bcryptjs');
const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
if (!existing) {
  const hash = bcrypt.hashSync('admin123456', 10);
  db.prepare('INSERT INTO admins (username, password, role, must_reset) VALUES (?,?,?,?)').run('admin', hash, 'super_admin', 1);
  console.log('[admin] 已创建超级管理员: admin / admin123456 (首次登录需改密)');
}

// 初始化地图配置
const wzlbMaps = [
  {key:'port', name:'废弃港口'},{key:'checkpoint', name:'军事检查站'},
  {key:'warehouse', name:'地下仓库'},{key:'radar', name:'山地雷达站'},{key:'ruins', name:'城市废墟'}
];
const insertMap = db.prepare('INSERT OR IGNORE INTO wzlb_map_config (map_key, name) VALUES (?,?)');
wzlbMaps.forEach(m => insertMap.run(m.key, m.name));

// ----- 预编译管理查询 -----
const adminStmts = {
  getAdminByName: db.prepare('SELECT * FROM admins WHERE username = ?'),
  getAdminById:   db.prepare('SELECT * FROM admins WHERE id = ?'),
  updateAdminPwd: db.prepare('UPDATE admins SET password = ?, must_reset = 0 WHERE id = ?'),
  updateAdminLogin: db.prepare('UPDATE admins SET last_login = ? WHERE id = ?'),

  insertSession:  db.prepare('INSERT OR REPLACE INTO admin_sessions (token, admin_id, expires_at) VALUES (?,?,?)'),
  getSession:     db.prepare('SELECT s.token,s.expires_at,a.id,a.username,a.role,a.must_reset FROM admin_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token=?'),
  deleteSession:  db.prepare('DELETE FROM admin_sessions WHERE token = ?'),
  purgeSessions:  db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?'),

  insertLog:      db.prepare('INSERT INTO admin_logs (admin_id, admin_name, action, target, detail, ip) VALUES (?,?,?,?,?,?)'),
  getLogs:        db.prepare('SELECT * FROM admin_logs ORDER BY id DESC LIMIT ? OFFSET ?'),

  // 用户
  listUsers:      db.prepare('SELECT u.*, (SELECT 1 FROM user_bans b WHERE b.user_id=u.id) as banned FROM users u ORDER BY u.id DESC LIMIT ? OFFSET ?'),
  searchUsers:    db.prepare("SELECT u.*, (SELECT 1 FROM user_bans b WHERE b.user_id=u.id) as banned FROM users u WHERE u.username LIKE ? OR u.email LIKE ? ORDER BY u.id DESC LIMIT ? OFFSET ?"),
  countUsers:     db.prepare('SELECT COUNT(*) as cnt FROM users'),
  countTodayUsers: db.prepare("SELECT COUNT(*) as cnt FROM users WHERE created_at >= ?"),
  banUser:        db.prepare('INSERT OR REPLACE INTO user_bans (user_id, reason) VALUES (?,?)'),
  unbanUser:      db.prepare('DELETE FROM user_bans WHERE user_id = ?'),
  resetUserPwd:   db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  deleteSessionsForUser: db.prepare('DELETE FROM sessions WHERE user_id = ?'),

  // 武器
  getWeapons:     db.prepare('SELECT * FROM weapon_config ORDER BY category, quality'),
  getWeapon:      db.prepare('SELECT * FROM weapon_config WHERE id = ?'),
  upsertWeapon:   db.prepare(`INSERT OR REPLACE INTO weapon_config (id,name,quality,category,base_dmg,fire_rate,magazine,reserve,skill_dmg,price,is_active,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,(SELECT is_active FROM weapon_config WHERE id=?),strftime('%s','now'))`),
  toggleWeapon:   db.prepare('UPDATE weapon_config SET is_active = ? WHERE id = ?'),

  // 角色
  getCharacters:  db.prepare('SELECT * FROM character_config ORDER BY star'),
  getCharacter:   db.prepare('SELECT * FROM character_config WHERE id = ?'),
  upsertCharacter: db.prepare(`INSERT OR REPLACE INTO character_config (id,name,star,hp_bonus,shield_bonus,soul_bonus,crit_bonus,speed_bonus,price,is_active,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,strftime('%s','now'))`),

  // 关卡
  getLevels:      db.prepare('SELECT * FROM level_config ORDER BY level_no'),
  upsertLevel:    db.prepare(`INSERT OR REPLACE INTO level_config (level_no,name,boss_name,boss_hp,hp_mult,small_hp_ratio,wave_count,is_boss_only,map_theme,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,strftime('%s','now'))`),

  // 地图
  getWzlbMaps:    db.prepare('SELECT * FROM wzlb_map_config'),
  updateWzlbMap:  db.prepare('UPDATE wzlb_map_config SET is_open = ?, max_players = ?, updated_at = strftime(\'%s\',\'now\') WHERE map_key = ?'),

  // 商城
  getShopItems:   db.prepare('SELECT * FROM shop_config ORDER BY id'),
  upsertShopItem: db.prepare('INSERT OR REPLACE INTO shop_config (id,item_type,item_key,price,is_active,updated_at) VALUES ((SELECT id FROM shop_config WHERE id=?),?,?,?,?,strftime(\'%s\',\'now\'))'),
  deleteShopItem: db.prepare('DELETE FROM shop_config WHERE id = ?'),

  // 活动
  getEvents:      db.prepare('SELECT * FROM events ORDER BY id DESC'),
  upsertEvent:    db.prepare('INSERT OR REPLACE INTO events (id,title,desc,type,bonus_mult,start_at,end_at,is_active,created_at) VALUES ((SELECT id FROM events WHERE id=?),?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM events WHERE id=?),strftime(\'%s\',\'now\')))'),
  deleteEvent:    db.prepare('DELETE FROM events WHERE id = ?'),

  // 公告
  getNotices:     db.prepare('SELECT * FROM notices ORDER BY id DESC'),
  upsertNotice:   db.prepare('INSERT OR REPLACE INTO notices (id,content,type,is_active,created_at,expires_at) VALUES ((SELECT id FROM notices WHERE id=?),?,?,?,COALESCE((SELECT created_at FROM notices WHERE id=?),strftime(\'%s\',\'now\')),?)'),
  deleteNotice:   db.prepare('DELETE FROM notices WHERE id = ?'),

  // 统计
  countOnline:    null, // 由 realtime.onlineIds() 提供
  countTodayMatches: db.prepare("SELECT COUNT(*) as cnt FROM admin_logs WHERE action='match_end' AND created_at >= ?"),
};

// 定期清理过期会话
setInterval(() => {
  try { adminStmts.purgeSessions.run(Math.floor(Date.now()/1000)); } catch(e){}
}, 60 * 60 * 1000).unref();

module.exports = { adminStmts };
