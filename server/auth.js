// ============================================================================
// server/auth.js — 注册 / 登录 / 注销 / 会话中间件
// 密码用 bcryptjs 哈希；会话用 crypto 随机 token 存库 + httpOnly cookie。
// ============================================================================
'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { stmts, db } = require('./db');

const router = express.Router();
const COOKIE_NAME = 'fps_sid';
const SESSION_TTL = 30 * 24 * 3600; // 30 天（秒）
const SESSION_TTL_MS = SESSION_TTL * 1000;

function genToken() { return crypto.randomBytes(32).toString('hex'); }

// 轻量 cookie 解析（不引入 cookie-parser 依赖）
function parseCookies(req) {
  const out = {};
  const h = req.headers && req.headers.cookie;
  if (!h) return out;
  for (const part of h.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

// 用户名/邮箱合法性
function validUsername(s) { return typeof s === 'string' && /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(s); }
function validEmail(s) { return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 80; }
function validPassword(s) { return typeof s === 'string' && s.length >= 6 && s.length <= 64; }

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, displayName: u.display_name || u.username };
}

// 从 cookie 解析当前用户（挂在 req.user）
function authMiddleware(req, res, next) {
  req.cookies = parseCookies(req);
  const token = req.cookies[COOKIE_NAME] || null;
  req.user = null;
  if (!token) return next();
  const row = stmts.getSession.get(token);
  if (!row || row.expires_at < Math.floor(Date.now()/1000)) { return next(); }
  req.user = { id: row.user_id, username: row.username, email: row.email, displayName: row.display_name || row.username };
  req.sessionToken = token;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: '未登录或会话已过期，请重新登录' });
  next();
}

// ---------- POST /api/register ----------
router.post('/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!validUsername(username)) return res.status(400).json({ ok: false, error: '用户名需为 2-20 位字母/数字/下划线/中文' });
  if (!validEmail(email))       return res.status(400).json({ ok: false, error: '邮箱格式不正确' });
  if (!validPassword(password)) return res.status(400).json({ ok: false, error: '密码至少 6 位' });

  if (stmts.getUserByName.get(username))  return res.status(409).json({ ok: false, error: '该用户名已被注册' });
  if (stmts.getUserByEmail.get(email))    return res.status(409).json({ ok: false, error: '该邮箱已被注册' });

  const hash = bcrypt.hashSync(password, 10);
  let info;
  try { info = stmts.insertUser.run(username, email, hash, username); }
  catch (e) { return res.status(409).json({ ok: false, error: '用户名或邮箱已存在' }); }

  const user = stmts.getUserById.get(info.lastInsertRowid);
  const token = issueSession(user.id, res);
  res.json({ ok: true, user: publicUser(user) });
});

// ---------- POST /api/login ----------
router.post('/login', (req, res) => {
  const { account, password } = req.body || {};
  if (!account || !password) return res.status(400).json({ ok: false, error: '请输入账号与密码' });
  const user = stmts.getUserByLogin.get(account, account);
  if (!user) return res.status(401).json({ ok: false, error: '账号或密码错误' });
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ ok: false, error: '账号或密码错误' });

  // 封禁检查
  const banned = db.prepare('SELECT * FROM user_bans WHERE user_id = ?').get(user.id);
  if (banned) return res.status(403).json({ ok: false, error: '该账户已被封禁：' + (banned.reason || '违规行为') });

  issueSession(user.id, res);
  res.json({ ok: true, user: publicUser(user) });
});

// ---------- POST /api/logout ----------
router.post('/logout', (req, res) => {
  if (req.sessionToken) { try { stmts.deleteSession.run(req.sessionToken); } catch(e){} }
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// ---------- GET /api/me ----------
router.get('/me', (req, res) => {
  if (!req.user) return res.json({ ok: false });
  res.json({ ok: true, user: req.user });
});

// ======================== 段位榜 / ELO（A3） ========================
// ---------- GET /api/rank?limit=50 （公开排行榜，按 elo 降序） ----------
router.get('/rank', (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const rows = db.prepare(`
      SELECT r.user_id AS userId, u.username AS username, u.display_name AS displayName,
             r.elo AS elo, r.wins AS wins, r.losses AS losses, r.tier AS tier
      FROM user_rank r JOIN users u ON u.id = r.user_id
      ORDER BY r.elo DESC LIMIT ?`).all(limit);
    const list = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      username: r.username,
      displayName: r.displayName || r.username,
      elo: r.elo,
      wins: r.wins,
      losses: r.losses,
      tier: r.tier,
    }));
    res.json({ ok: true, list });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ---------- GET /api/rank/me （需登录，返回本人 rank/elo/wins/losses/tier） ----------
router.get('/rank/me', requireAuth, (req, res) => {
  try {
    const uid = req.user.id;
    const row = db.prepare('SELECT elo, wins, losses, tier FROM user_rank WHERE user_id = ?').get(uid);
    const elo = row ? row.elo : 1000;
    const prog = db.prepare('SELECT xp, level FROM user_progression WHERE user_id = ?').get(uid);
    const higher = db.prepare('SELECT COUNT(*) AS cnt FROM user_rank WHERE elo > ?').get(elo).cnt;
    const level = prog ? prog.level : 1;
    const xp = prog ? prog.xp : 0;
    const xpNext = level * 100; // 本级满经验阈值
    res.json({
      ok: true,
      rank: 1 + higher,
      elo,
      wins: row ? row.wins : 0,
      losses: row ? row.losses : 0,
      tier: row ? row.tier : '青铜',
      level,
      xp,
      xpNext,
    });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

function issueSession(userId, res) {
  const token = genToken();
  const expiresAt = Math.floor(Date.now()/1000) + SESSION_TTL;
  stmts.insertSession.run(token, userId, expiresAt);
  if (res) res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_TTL_MS, path: '/' });
  return token;
}

// 供 realtime.js 校验 ws 上的 token（复用同一张表）
function verifySessionToken(token) {
  if (!token) return null;
  const row = stmts.getSession.get(token);
  if (!row || row.expires_at < Math.floor(Date.now()/1000)) return null;
  return { id: row.user_id, username: row.username, email: row.email, displayName: row.display_name || row.username };
}

module.exports = { router, authMiddleware, requireAuth, COOKIE_NAME, verifySessionToken, publicUser };
