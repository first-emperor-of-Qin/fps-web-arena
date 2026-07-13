// ============================================================================
// server/admin-api.js — 后台管理系统全部 API
// 挂载到 /admin/api/
// ============================================================================
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { adminStmts } = require('./admin-db');
const { requireAdmin, requireSuperAdmin, adminLogin, adminLogout, changePassword, getMe, logAction } = require('./admin-auth');
const { stmts, db } = require('./db');
const realtime = require('./realtime');

// ============================================================================
// 武器 → 真实玩法常量 映射表（后台改武器数值 → 同步驱动战斗的 let 常量）
// 常量名来自游戏 WEAPON_CATALOG 取值器与各类武器射击冷却赋值
// ============================================================================
const WEAPON_TUNING = {
  thunder:        { base: 'BULLET_BASE_DMG', fireRate: 'SHOOT_INTERVAL', mag: 'AMMO_MAG_SIZE' },
  tumo:           { base: 'TUMO_BASE_DMG',            fireRate: 'TUMO_FIRE_RATE',            mag: 'TUMO_MAG_SIZE' },
  dragonlyknight: { base: 'DRAGON_KNIGHT_BASE_DMG',  fireRate: 'DRAGON_KNIGHT_FIRE_RATE',  mag: 'DRAGON_KNIGHT_MAG_SIZE' },
  dawnlight:      { base: 'DAWNLIGHT_BASE_DMG',       fireRate: 'DAWNLIGHT_FIRE_RATE',       mag: 'DAWNLIGHT_MAG_SIZE' },
  zeushand:       { base: 'ZEUS_HAND_BASE_DMG',       fireRate: 'ZEUS_HAND_FIRE_RATE',       mag: 'ZEUS_HAND_MAG_SIZE' },
  phasewalker:    { base: 'PHASE_WALKER_DAMAGE',      fireRate: 'PHASE_WALKER_FIRE_RATE' },
  parasite:       { base: 'PARASITE_BASE_DMG',        fireRate: 'PARASITE_FIRE_RATE',        mag: 'PARASITE_MAG_SIZE' },
  shadow:         { base: 'SECONDARY_BASE_DMG',        fireRate: 'SECONDARY_FIRE_RATE',        mag: 'SECONDARY_MAG_SIZE' },
  metalstorm:     { base: 'METALSTORM_BASE_DMG',      fireRate: 'METALSTORM_FIRE_RATE',      mag: 'METALSTORM_MAG_SIZE' },
  whitenight:     { base: 'WHITENIGHT_BASE_DMG',      fireRate: 'WHITENIGHT_FIRE_RATE',      mag: 'WHITENIGHT_MAG_SIZE', skill: 'WHITENIGHT_SKILL_BASE_DMG' },
  moonbow:        { base: 'MOONBOW_BASE_DMG',         fireRate: ['MOONBOW_MIN_FIRE_RATE', 'MOONBOW_MAX_FIRE_RATE'] },
  thousandumbrella:{ base: 'THOUSAND_UMBRELLA_BASE_DMG' },
  normalgrenade:  { base: 'GRENADE_BASE_DMG' },
  deathlight:     { base: 'DEATHLIGHT_BASE_DMG' },
  froststar:      { base: 'FROSTSTAR_FIRST_BASE_DMG' },
  tanglotus:      { base: 'TANGLOTUS_BASE_DMG' },
  hellscythe:     { base: 'HELLSCYTHE_WIND_BASE_DMG' },
  thunderblade:   { base: 'MELEE_LIGHT_BASE_DMG' },
};
function _num(v) { if (v === 'Infinity' || v === Infinity) return Infinity; const n = Number(v); return isNaN(n) ? 0 : n; }
function _replaceLeadingNumber(str, num) {
  if (str == null) return String(num);
  const s = String(str); const m = s.match(/^\s*[\d.]+/);
  if (!m) return String(num) + s;
  return String(num) + s.slice(m[0].length);
}
function _fmtFireRate(v) {
  const n = _num(v);
  if (!isFinite(n)) return '∞';
  // 间隔(秒) < 5 视为射速间隔，换算为 发/秒；否则已是 发/秒（如皓月神弓=8）
  const perSec = n < 5 ? Math.round(1 / n) : Math.round(n);
  return perSec + '发/秒';
}
function _applyTuningMap(tuning, id, base, fr, mag, skill) {
  const m = WEAPON_TUNING[id]; if (!m) return;
  if (m.base && base != null) tuning[m.base] = String(_num(base));
  if (m.fireRate && fr != null) {
    const arr = Array.isArray(m.fireRate) ? m.fireRate : [m.fireRate];
    const frNum = _num(fr);
    arr.forEach(k => {
      // 后台射速单位为 发/秒；多数武器射速常量=射击间隔(秒)=1/发每秒；
      // 仅皓月神弓(MOONBOW_*)常量本身就是 发/秒，1:1 写入
      const val = (k.indexOf('MOONBOW') === 0) ? frNum : (frNum > 0 ? 1 / frNum : 0);
      tuning[k] = String(val);
    });
  }
  if (m.mag && mag != null) tuning[m.mag] = (mag === 'Infinity' || mag === Infinity) ? 'Infinity' : String(_num(mag));
  if (m.skill && skill != null) tuning[m.skill] = String(_num(skill));
}
// 将武器编辑同步进 game_tuning.weaponConsts（战斗真源），使后台改→前台实战同步
function syncWeaponTuning(id, base, fr, mag, skill) {
  try {
    let wc = {};
    const row = db.prepare("SELECT data FROM game_tuning WHERE key='weaponConsts'").get();
    if (row && row.data) { try { wc = JSON.parse(row.data); } catch (e) { wc = {}; } }
    _applyTuningMap(wc, id, base, fr, mag, skill);
    db.prepare("INSERT OR REPLACE INTO game_tuning (key,data,updated_at) VALUES ('weaponConsts',?,?)").run(JSON.stringify(wc), Date.now());
  } catch (e) { console.error('syncWeaponTuning', e); }
}

const router = express.Router();

// 后台任意配置变更后，向所有已连接的游戏 WS 客户端推送 config_update
// 游戏端收到后会重新拉取 /api/config/all 并热应用（实时同步）
function pushConfigUpdate() {
  try { realtime.broadcastAll({ type: 'config_update', ts: Date.now() }); } catch (e) {}
}

// ---- 鉴权 ----
router.post('/login', adminLogin);
router.post('/logout', requireAdmin, adminLogout);
router.get('/me', getMe);
router.post('/change-password', requireAdmin, changePassword);

// ---- 获取在线人数（从 realtime 占位）----
let onlineCountFn = () => 0;
function setOnlineProvider(fn) { onlineCountFn = fn; }
router.get('/online-count', requireAdmin, (req, res) => res.json({ ok: true, online: onlineCountFn() }));

// ======================== 数据仪表盘 ========================
router.get('/dashboard', requireAdmin, (req, res) => {
  try {
    const now = Math.floor(Date.now()/1000);
    const todayStart = now - (now % 86400);
    const totalUsers = adminStmts.countUsers.get().cnt;
    const todayUsers = adminStmts.countTodayUsers.get(todayStart).cnt;
    const onlineCount = onlineCountFn();
    const todayMatches = adminStmts.countTodayMatches.get(todayStart).cnt;

    // 近7天注册趋势
    const regTrend = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = todayStart - i * 86400;
      const dayEnd = dayStart + 86400;
      const cnt = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE created_at >= ? AND created_at < ?').get(dayStart, dayEnd).cnt;
      regTrend.push({ date: new Date(dayStart*1000).toISOString().slice(0,10), count: cnt });
    }

    // 近7天对局趋势
    const matchTrend = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = todayStart - i * 86400;
      const dayEnd = dayStart + 86400;
      const cnt = db.prepare("SELECT COUNT(*) as cnt FROM admin_logs WHERE action='match_end' AND created_at >= ? AND created_at < ?").get(dayStart, dayEnd).cnt;
      matchTrend.push({ date: new Date(dayStart*1000).toISOString().slice(0,10), count: cnt });
    }

    res.json({ ok: true, totalUsers, todayUsers, onlineCount, todayMatches, regTrend, matchTrend });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ======================== 用户管理 ========================
router.get('/users', requireAdmin, (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();

    let rows, total;
    if (search) {
      const like = '%' + search.replace(/[%_]/g, m => '\\' + m) + '%';
      rows = adminStmts.searchUsers.all(like, like, limit, offset);
      total = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE username LIKE ? OR email LIKE ?').get(like, like).cnt;
    } else {
      rows = adminStmts.listUsers.all(limit, offset);
      total = adminStmts.countUsers.get().cnt;
    }
    rows = rows.map(u => ({ id: u.id, username: u.username, email: u.email, displayName: u.display_name, createdAt: u.created_at, banned: !!u.banned }));

    res.json({ ok: true, users: rows, total, page, limit });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/users/:id', requireAdmin, (req, res) => {
  try {
    const u = stmts.getUserById.get(parseInt(req.params.id));
    if (!u) return res.status(404).json({ ok: false, error: '用户不存在' });
    const banned = db.prepare('SELECT * FROM user_bans WHERE user_id = ?').get(u.id);
    const messages = db.prepare('SELECT COUNT(*) as cnt FROM messages WHERE from_user = ?').get(u.id);
    const friends = db.prepare('SELECT COUNT(*) as cnt FROM friendships WHERE user_a = ? OR user_b = ?').get(u.id, u.id);
    res.json({ ok: true, user: { id: u.id, username: u.username, email: u.email, displayName: u.display_name, createdAt: u.created_at, banned: !!banned, banReason: banned ? banned.reason : null, msgCount: messages.cnt, friendCount: friends.cnt } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/users/:id/ban', requireAdmin, (req, res) => {
  try {
    const uid = parseInt(req.params.id);
    const reason = (req.body && req.body.reason) || '违规行为';
    adminStmts.banUser.run(uid, reason);
    adminStmts.deleteSessionsForUser.run(uid);
    realtime.kickUser(uid); // 立即强制下线
    logAction(req.admin, 'ban_user', 'user:'+uid, reason, req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/users/:id/unban', requireAdmin, (req, res) => {
  try {
    adminStmts.unbanUser.run(parseInt(req.params.id));
    logAction(req.admin, 'unban_user', 'user:'+req.params.id, '', req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/users/:id/reset-pwd', requireAdmin, (req, res) => {
  try {
    const newPwd = (req.body && req.body.password) || 'reset123456';
    const hash = bcrypt.hashSync(newPwd, 10);
    adminStmts.resetUserPwd.run(hash, parseInt(req.params.id));
    adminStmts.deleteSessionsForUser.run(parseInt(req.params.id));
    logAction(req.admin, 'reset_password', 'user:'+req.params.id, '', req.ip);
    res.json({ ok: true, newPassword: newPwd });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ======================== 武器管理 ========================
router.get('/weapons', requireAdmin, (req, res) => {
  try {
    const rows = adminStmts.getWeapons.all();
    res.json({ ok: true, weapons: rows });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/weapons/:id', requireAdmin, (req, res) => {
  try {
    const w = adminStmts.getWeapon.get(req.params.id);
    if (!w) return res.status(404).json({ ok: false, error: '武器不存在' });
    res.json({ ok: true, weapon: w });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 编辑武器时：1) 更新标量列；2) 同步 data_json（保留 bonus/技能，仅覆盖动态数值）；
// 3) 同步 game_tuning.weaponConsts（战斗真源）→ 前台实战实时变化
function _applyWeaponEdit(w) {
  // 捕获旧 data_json（upsertWeapon 的 REPLACE 会清空它）
  const old = adminStmts.getWeapon.get(w.id);
  adminStmts.upsertWeapon.run(w.id, w.name||'', w.quality||'common', w.category||'primary', w.base_dmg||0, w.fire_rate||10, w.magazine||30, w.reserve||180, w.skill_dmg||0, w.price||0, w.id);
  let dj = (old && old.data_json) ? _safeParse(old.data_json) : null;
  if (!dj) dj = { id: w.id, display: { name: w.name||w.id, quality: w.quality||'common', category: w.category||'primary' }, full: { price: w.price||0 } };
  dj.display = dj.display || {};
  if (w.base_dmg != null) dj.display.baseDmg = _replaceLeadingNumber(dj.display.baseDmg, w.base_dmg);
  if (w.fire_rate != null) dj.display.fireRate = _fmtFireRate(w.fire_rate);
  if (w.magazine != null) dj.display.magazine = (w.magazine === 'Infinity' || w.magazine === Infinity) ? '无限' : _replaceLeadingNumber(dj.display.magazine, w.magazine);
  dj.tuning = dj.tuning || {};
  _applyTuningMap(dj.tuning, w.id, w.base_dmg, w.fire_rate, w.magazine, w.skill_dmg);
  adminStmts.updateWeaponDataJson.run(JSON.stringify(dj), w.id);
  // 战斗真源同步
  syncWeaponTuning(w.id, w.base_dmg, w.fire_rate, w.magazine, w.skill_dmg);
}
function _safeParse(s){ try { return JSON.parse(s); } catch(e){ return null; } }

router.put('/weapons/:id', requireAdmin, (req, res) => {
  try {
    const w = req.body;
    _applyWeaponEdit(w);
    logAction(req.admin, 'edit_weapon', 'weapon:'+w.id, JSON.stringify(w), req.ip);
    pushConfigUpdate();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/weapons', requireAdmin, (req, res) => {
  try {
    const w = req.body;
    if (!w.id) return res.status(400).json({ ok: false, error: '缺少武器 ID' });
    _applyWeaponEdit(w);
    logAction(req.admin, 'create_weapon', 'weapon:'+w.id, '', req.ip);
    pushConfigUpdate();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/weapons/:id/toggle', requireAdmin, (req, res) => {
  try {
    adminStmts.toggleWeapon.run(req.body.active ? 1 : 0, req.params.id);
    logAction(req.admin, req.body.active ? 'enable_weapon' : 'disable_weapon', 'weapon:'+req.params.id, '', req.ip);
    pushConfigUpdate();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ======================== 角色管理 ========================
router.get('/characters', requireAdmin, (req, res) => {
  try {
    res.json({ ok: true, characters: adminStmts.getCharacters.all() });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/characters/:id', requireAdmin, (req, res) => {
  try {
    const c = req.body;
    const old = adminStmts.getCharacter.get(c.id);
    adminStmts.upsertCharacter.run(c.id, c.name||'', c.star||1, c.hp_bonus||0, c.shield_bonus||0, c.soul_bonus||0, c.crit_bonus||0, c.speed_bonus||0, c.price||0, c.is_active!=null?c.is_active:1);
    // 保留 data_json（pal/en/bMul 等渲染与回退字段，不被 REPLACE 清掉）
    if (old && old.data_json) adminStmts.updateCharacterDataJson.run(old.data_json, c.id);
    logAction(req.admin, 'edit_character', 'character:'+c.id, JSON.stringify(c), req.ip);
    pushConfigUpdate();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ======================== 关卡管理 ========================
router.get('/levels', requireAdmin, (req, res) => {
  try {
    res.json({ ok: true, levels: adminStmts.getLevels.all() });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/levels/:no', requireAdmin, (req, res) => {
  try {
    const l = req.body;
    const old = adminStmts.getLevel.get(parseInt(req.params.no));
    adminStmts.upsertLevel.run(parseInt(req.params.no), l.name, l.boss_name, l.boss_hp, l.hp_mult, l.small_hp_ratio, l.wave_count, l.is_boss_only?1:0, l.map_theme);
    // 保留 data_json（map_theme 等字段，不被 REPLACE 清掉）
    if (old && old.data_json) adminStmts.updateLevelDataJson.run(old.data_json, parseInt(req.params.no));
    logAction(req.admin, 'edit_level', 'level:'+req.params.no, JSON.stringify(l), req.ip);
    pushConfigUpdate();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ======================== 全局调参（玩法常量真源） ========================
router.get('/tuning', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare('SELECT key,data FROM game_tuning').all();
    const out = {}; rows.forEach(r => { try { out[r.key] = JSON.parse(r.data); } catch(e){} });
    res.json({ ok: true, tuning: out });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});
router.put('/tuning/:key', requireAdmin, (req, res) => {
  try {
    const key = req.params.key;
    const data = JSON.stringify(req.body.data !== undefined ? req.body.data : req.body);
    db.prepare("INSERT OR REPLACE INTO game_tuning (key,data,updated_at) VALUES (?,?,strftime('%s','now'))").run(key, data);
    logAction(req.admin, 'edit_tuning', 'tuning:'+key, JSON.stringify(req.body).slice(0,200), req.ip);
    pushConfigUpdate();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ======================== 地图管理 ========================
router.get('/wzlb-maps', requireAdmin, (req, res) => {
  try {
    res.json({ ok: true, maps: adminStmts.getWzlbMaps.all() });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/wzlb-maps/:key', requireAdmin, (req, res) => {
  try {
    adminStmts.updateWzlbMap.run(req.body.is_open ? 1 : 0, req.body.max_players || 2, req.params.key);
    logAction(req.admin, 'edit_wzlb_map', 'map:'+req.params.key, '', req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ======================== 商城管理 ========================
router.get('/shop', requireAdmin, (req, res) => {
  try {
    res.json({ ok: true, items: adminStmts.getShopItems.all() });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/shop', requireAdmin, (req, res) => {
  try {
    const item = req.body;
    adminStmts.upsertShopItem.run(item.id||null, item.item_type, item.item_key, item.price, item.is_active!=null?item.is_active:1);
    logAction(req.admin, 'edit_shop', 'shop:'+(item.id||'new'), '', req.ip);
    pushConfigUpdate();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/shop/:id', requireAdmin, (req, res) => {
  try {
    adminStmts.deleteShopItem.run(parseInt(req.params.id));
    logAction(req.admin, 'delete_shop', 'shop:'+req.params.id, '', req.ip);
    pushConfigUpdate();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ======================== 运营活动 ========================
router.get('/events', requireAdmin, (req, res) => {
  try { res.json({ ok: true, events: adminStmts.getEvents.all() }); }
  catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/events', requireAdmin, (req, res) => {
  try {
    const ev = req.body;
    adminStmts.upsertEvent.run(ev.id||null, ev.title, ev.desc, ev.type, ev.bonus_mult, ev.start_at, ev.end_at, ev.is_active!=null?ev.is_active:1, ev.id||null);
    logAction(req.admin, 'edit_event', 'event:'+(ev.id||'new'), ev.title, req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/events/:id', requireAdmin, (req, res) => {
  try {
    adminStmts.deleteEvent.run(parseInt(req.params.id));
    logAction(req.admin, 'delete_event', 'event:'+req.params.id, '', req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ======================== 全服公告 ========================
router.get('/notices', requireAdmin, (req, res) => {
  try { res.json({ ok: true, notices: adminStmts.getNotices.all() }); }
  catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/notices', requireAdmin, (req, res) => {
  try {
    const n = req.body;
    adminStmts.upsertNotice.run(n.id||null, n.content, n.type||'normal', n.is_active!=null?n.is_active:1, n.id||null, n.expires_at||null);
    logAction(req.admin, 'edit_notice', 'notice:'+(n.id||'new'), n.content, req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/notices/:id', requireAdmin, (req, res) => {
  try {
    adminStmts.deleteNotice.run(parseInt(req.params.id));
    logAction(req.admin, 'delete_notice', 'notice:'+req.params.id, '', req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ======================== 操作日志 ========================
router.get('/logs', requireAdmin, (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    const rows = adminStmts.getLogs.all(limit, offset);
    res.json({ ok: true, logs: rows, page, limit });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = { router, setOnlineProvider };

// ======================== 公开配置 API（游戏前端加载，无需鉴权） ========================
// 在 server/index.js 中单独挂载到 /api/config
function gameConfigRouter() {
  const r = require('express').Router();
  // 武器配置
  r.get('/weapons', (req, res) => {
    const rows = adminStmts.getWeapons.all();
    const out = {};
    rows.filter(w => w.is_active).forEach(w => { out[w.id] = w; });
    res.json({ ok: true, weapons: out });
  });
  // 角色配置
  r.get('/characters', (req, res) => {
    const rows = adminStmts.getCharacters.all();
    const out = {};
    rows.filter(c => c.is_active).forEach(c => { out[c.id] = c; });
    res.json({ ok: true, characters: out });
  });
  // 关卡配置
  r.get('/levels', (req, res) => {
    const rows = adminStmts.getLevels.all();
    res.json({ ok: true, levels: rows });
  });
  // WZLB 地图
  r.get('/wzlb-maps', (req, res) => {
    const rows = adminStmts.getWzlbMaps.all();
    res.json({ ok: true, maps: rows.filter(m => m.is_open) });
  });
  // 全服公告
  r.get('/notices', (req, res) => {
    const rows = adminStmts.getNotices.all();
    res.json({ ok: true, notices: rows.filter(n => n.is_active) });
  });
  // 商城
  r.get('/shop', (req, res) => {
    const rows = adminStmts.getShopItems.all();
    res.json({ ok: true, items: rows.filter(s => s.is_active) });
  });
  // ===== 统一全量配置（游戏前端启动时一次拉取）=====
  r.get('/all', (req, res) => {
    try {
      const weapons = {};
      adminStmts.getWeapons.all().forEach(w => {
        let d; try { d = w.data_json ? JSON.parse(w.data_json) : null; } catch(e){ d = null; }
        if (!d) d = { id:w.id, display:{ name:w.name, quality:w.quality, category:w.category, baseDmg:String(w.base_dmg), fireRate:String(w.fire_rate), magazine:String(w.magazine) }, full:{ price:w.price } };
        // 动态数值（基础伤害/射速/弹匣）始终以标量列为准，保证后台改→文字展示同步
        if (d.display) {
          if (w.base_dmg != null) d.display.baseDmg = _replaceLeadingNumber(d.display.baseDmg, w.base_dmg);
          if (w.fire_rate != null) d.display.fireRate = _fmtFireRate(w.fire_rate);
          if (w.magazine != null) d.display.magazine = (w.magazine === 'Infinity' || w.magazine === Infinity) ? '无限' : _replaceLeadingNumber(d.display.magazine, w.magazine);
        }
        weapons[w.id] = d;
      });
      const characters = {};
      adminStmts.getCharacters.all().forEach(c => {
        let d; try { d = c.data_json ? JSON.parse(c.data_json) : null; } catch(e){ d = null; }
        if (!d) d = { id:c.id, name:c.name, star:c.star };
        // 合并后台可调加成字段（驱动 charBonus 战斗加成；pal/en/bMul 仍取自 data_json）
        d = Object.assign(d, { id:c.id, name:c.name, star:c.star,
          hp_bonus:c.hp_bonus, shield_bonus:c.shield_bonus, soul_bonus:c.soul_bonus,
          crit_bonus:c.crit_bonus, speed_bonus:c.speed_bonus });
        characters[c.id] = d;
      });
      const levels = adminStmts.getLevels.all().map(l => {
        let d; try { d = l.data_json ? JSON.parse(l.data_json) : null; } catch(e){ d = null; }
        if (!d) d = { level_no:l.level_no, name:l.name, boss_name:l.boss_name, boss_hp:l.boss_hp, hp_mult:l.hp_mult, wave_count:l.wave_count };
        // 合并后台可调战斗字段（boss_hp/wave_count 等以标量列为准，覆盖 data_json 中的旧值）
        d = Object.assign(d, { level_no:l.level_no, name:l.name, boss_name:l.boss_name, boss_hp:l.boss_hp, hp_mult:l.hp_mult, small_hp_ratio:l.small_hp_ratio, wave_count:l.wave_count, is_boss_only:l.is_boss_only, map_theme:l.map_theme });
        return d;
      });
      const tuning = {};
      db.prepare('SELECT key,data FROM game_tuning').all().forEach(rw => { try { tuning[rw.key] = JSON.parse(rw.data); } catch(e){} });
      const shop = adminStmts.getShopItems.all().filter(s => s.is_active).map(s => ({ item_type:s.item_type, item_key:s.item_key, price:s.price, is_active:s.is_active }));
      res.json({ ok: true, weapons, characters, levels, tuning, shop });
    } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
  });
  return r;
}
module.exports.gameConfigRouter = gameConfigRouter;
