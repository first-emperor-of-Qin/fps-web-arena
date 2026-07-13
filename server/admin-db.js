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
-- data_json 存放与游戏内部完全同构的全量配置（展示+完整描述+真实玩法常量）
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
  data_json  TEXT,                         -- 全量武器配置（展示/描述/真实常量）
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- 角色配置表
-- data_json 存放角色完整定义（CHARACTERS 条目 + 星级倍率）
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
  data_json  TEXT,
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- 关卡配置表
-- data_json 存放关卡全量配置（与游戏 LEVELS/BOSS 同步）
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
  data_json  TEXT,
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- 全局调参表（玩法常量真源：武器常量 / 星级倍率 / 难度 / Boss血量表 / 波次 / 上限）
CREATE TABLE IF NOT EXISTS game_tuning (
  key        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- 元数据（迁移/一次性 seed 标记）
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
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

// ----- 游戏配置初始 seed（幂等：INSERT OR IGNORE，不覆盖后台后续编辑） -----
function parseBase(s){ if(!s) return 0; const m=String(s).match(/^([\d.]+)/); return m?parseFloat(m[1]):0; }
function parseFire(s){ if(!s) return 10; const m=String(s).match(/([\d.]+)\s*发\/秒/); return m?parseFloat(m[1]):10; }
function parseMag(s){ if(!s) return 0; const m=String(s).match(/^(\d+)/); return m?parseInt(m[1]):0; }
// 兼容旧库：为已存在的表补列（重复列错误忽略）
['weapon_config','character_config','level_config'].forEach(t => { try { db.exec('ALTER TABLE '+t+' ADD COLUMN data_json TEXT'); } catch(e){} });
function seedGameConfig(){
  try {
    const SEED = require('./seed_config.json');
    const already = db.prepare("SELECT value FROM app_meta WHERE key='config_seeded_v1'").get();
    if (already) { console.log('[admin] 游戏配置已存在，跳过初始 seed（保留后台编辑）'); return; }
    // 首次：清空配置表，以规范真源重建（避免旧 schema 残留脏数据）
    db.exec('DELETE FROM weapon_config; DELETE FROM character_config; DELETE FROM level_config; DELETE FROM game_tuning; DELETE FROM shop_config;');
    const insW = db.prepare('INSERT OR IGNORE INTO weapon_config (id,name,quality,category,base_dmg,fire_rate,magazine,skill_dmg,price,is_active,data_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const insC = db.prepare('INSERT OR IGNORE INTO character_config (id,name,star,hp_bonus,shield_bonus,soul_bonus,crit_bonus,speed_bonus,price,is_active,data_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const insL = db.prepare('INSERT OR IGNORE INTO level_config (level_no,name,boss_name,boss_hp,hp_mult,small_hp_ratio,wave_count,is_boss_only,map_theme,data_json) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const insT = db.prepare("INSERT OR IGNORE INTO game_tuning (key,data,updated_at) VALUES (?,?,strftime('%s','now'))");
    const insS = db.prepare('INSERT OR IGNORE INTO shop_config (item_type,item_key,price,is_active) VALUES (?,?,?,?)');
    const tx = db.transaction(() => {
      for (const k in SEED.weapons) {
        const w = SEED.weapons[k]; const d = w.display || {}; const f = w.full || {};
        insW.run(w.id, d.name||k, d.quality||'common', d.category||'primary', parseBase(d.baseDmg), parseFire(d.fireRate), parseMag(d.magazine), 0, f.price||0, 1, JSON.stringify(w));
      }
      for (const c of SEED.characters) {
        const sm = (SEED.tuning && SEED.tuning.starMeta && SEED.tuning.starMeta[c.star]) || {};
        const b = sm.bonus || {};
        insC.run(c.id, c.name||c.id, c.star||1, b.hpPct||0, b.shieldPct||0, b.soulPowerPct||0, b.critAdd||0, b.moveSpeedPct||0, sm.price||0, 1, JSON.stringify(c));
      }
      for (const l of SEED.levels) {
        insL.run(l.level_no, l.name||'', l.boss_name||'', l.boss_hp||100000000, l.hp_mult||1, l.small_hp_ratio||0.01, l.wave_count||3, l.is_boss_only?1:0, l.map_theme||'', JSON.stringify(l));
      }
      insT.run('weaponConsts', JSON.stringify(SEED.tuning.consts));
      insT.run('starMeta', JSON.stringify(SEED.tuning.starMeta));
      insT.run('difficulty', JSON.stringify(SEED.tuning.difficulty));
      insT.run('bossHpTable', JSON.stringify(SEED.tuning.bossHpTable));
      insT.run('levelWaveCounts', JSON.stringify(SEED.tuning.levelWaveCounts));
      insT.run('maxLevel', JSON.stringify(SEED.tuning.maxLevel));
      for (const s of (SEED.shop||[])) insS.run(s.item_type, s.item_key, s.price||0, s.is_active!=null?s.is_active:1);
    });
    tx();
    db.prepare("INSERT OR REPLACE INTO app_meta (key,value) VALUES ('config_seeded_v1','1')").run();
    console.log('[admin] 游戏配置已 seed（武器'+Object.keys(SEED.weapons).length+' / 角色'+SEED.characters.length+' / 关卡'+SEED.levels.length+' / 全局调参 6 项）');
  } catch(e) { console.error('[admin] seedGameConfig 失败:', e.message); }
}
seedGameConfig();

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
  // 仅更新 data_json（保留 bonus/技能描述等静态字段，不被 REPLACE 清掉）
  updateWeaponDataJson: db.prepare('UPDATE weapon_config SET data_json = ? WHERE id = ?'),
  toggleWeapon:   db.prepare('UPDATE weapon_config SET is_active = ? WHERE id = ?'),

  // 角色
  getCharacters:  db.prepare('SELECT * FROM character_config ORDER BY star'),
  getCharacter:   db.prepare('SELECT * FROM character_config WHERE id = ?'),
  upsertCharacter: db.prepare(`INSERT OR REPLACE INTO character_config (id,name,star,hp_bonus,shield_bonus,soul_bonus,crit_bonus,speed_bonus,price,is_active,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,strftime('%s','now'))`),

  updateCharacterDataJson: db.prepare('UPDATE character_config SET data_json = ? WHERE id = ?'),

  // 关卡
  getLevels:      db.prepare('SELECT * FROM level_config ORDER BY level_no'),
  upsertLevel:    db.prepare(`INSERT OR REPLACE INTO level_config (level_no,name,boss_name,boss_hp,hp_mult,small_hp_ratio,wave_count,is_boss_only,map_theme,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,strftime('%s','now'))`),

  getLevel:       db.prepare('SELECT * FROM level_config WHERE level_no = ?'),
  updateLevelDataJson: db.prepare('UPDATE level_config SET data_json = ? WHERE level_no = ?'),

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
