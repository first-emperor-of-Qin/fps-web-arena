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

const router = express.Router();

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

router.put('/weapons/:id', requireAdmin, (req, res) => {
  try {
    const w = req.body;
    adminStmts.upsertWeapon.run(w.id, w.name||'', w.quality||'common', w.category||'primary', w.base_dmg||0, w.fire_rate||10, w.magazine||30, w.reserve||180, w.skill_dmg||0, w.price||0, w.id);
    logAction(req.admin, 'edit_weapon', 'weapon:'+w.id, JSON.stringify(w), req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/weapons', requireAdmin, (req, res) => {
  try {
    const w = req.body;
    if (!w.id) return res.status(400).json({ ok: false, error: '缺少武器 ID' });
    adminStmts.upsertWeapon.run(w.id, w.name||w.id, w.quality||'common', w.category||'primary', w.base_dmg||0, w.fire_rate||10, w.magazine||30, w.reserve||180, w.skill_dmg||0, w.price||0, w.id);
    logAction(req.admin, 'create_weapon', 'weapon:'+w.id, '', req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/weapons/:id/toggle', requireAdmin, (req, res) => {
  try {
    adminStmts.toggleWeapon.run(req.body.active ? 1 : 0, req.params.id);
    logAction(req.admin, req.body.active ? 'enable_weapon' : 'disable_weapon', 'weapon:'+req.params.id, '', req.ip);
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
    adminStmts.upsertCharacter.run(c.id, c.name||'', c.star||1, c.hp_bonus||0, c.shield_bonus||0, c.soul_bonus||0, c.crit_bonus||0, c.speed_bonus||0, c.price||0, c.is_active!=null?c.is_active:1);
    logAction(req.admin, 'edit_character', 'character:'+c.id, JSON.stringify(c), req.ip);
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
    adminStmts.upsertLevel.run(parseInt(req.params.no), l.name, l.boss_name, l.boss_hp, l.hp_mult, l.small_hp_ratio, l.wave_count, l.is_boss_only?1:0, l.map_theme);
    logAction(req.admin, 'edit_level', 'level:'+req.params.no, JSON.stringify(l), req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
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
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/shop/:id', requireAdmin, (req, res) => {
  try {
    adminStmts.deleteShopItem.run(parseInt(req.params.id));
    logAction(req.admin, 'delete_shop', 'shop:'+req.params.id, '', req.ip);
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
  return r;
}
module.exports.gameConfigRouter = gameConfigRouter;
