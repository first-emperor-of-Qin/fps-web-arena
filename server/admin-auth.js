// ============================================================================
// server/admin-auth.js — 管理员鉴权
// 独立于游戏玩家的 auth 系统，使用不同的 cookie (admin_sid)
// ============================================================================
'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { adminStmts } = require('./admin-db');

const COOKIE_NAME = 'admin_sid';
const SESSION_TTL = 12 * 3600; // 12 小时
const SESSION_TTL_MS = SESSION_TTL * 1000;

function genToken() { return crypto.randomBytes(32).toString('hex'); }

function parseCookies(req) {
  const out = {};
  const h = req.headers && req.headers.cookie;
  if (!h) return out;
  for (const part of h.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

// Express 中间件：挂载 req.admin
function adminAuth(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME] || null;
  req.admin = null;
  req.adminToken = null;
  if (!token) return next();
  const row = adminStmts.getSession.get(token);
  if (!row || row.expires_at < Math.floor(Date.now()/1000)) { return next(); }
  req.admin = { id: row.id, username: row.username, role: row.role, must_reset: !!row.must_reset };
  req.adminToken = token;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.admin) return res.status(401).json({ ok: false, error: '未登录' });
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.admin || req.admin.role !== 'super_admin') return res.status(403).json({ ok: false, error: '权限不足，仅超级管理员可操作' });
  next();
}

// 登录
function adminLogin(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, error: '请输入用户名和密码' });
  const admin = adminStmts.getAdminByName.get(username);
  if (!admin) return res.status(401).json({ ok: false, error: '用户名或密码错误' });
  if (!bcrypt.compareSync(password, admin.password)) return res.status(401).json({ ok: false, error: '用户名或密码错误' });

  const token = genToken();
  const expiresAt = Math.floor(Date.now()/1000) + SESSION_TTL;
  adminStmts.insertSession.run(token, admin.id, expiresAt);
  adminStmts.updateAdminLogin.run(Math.floor(Date.now()/1000), admin.id);
  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_TTL_MS, path: '/' });
  res.json({ ok: true, admin: { id: admin.id, username: admin.username, role: admin.role, must_reset: !!admin.must_reset } });
}

// 登出
function adminLogout(req, res) {
  if (req.adminToken) {
    try { adminStmts.deleteSession.run(req.adminToken); } catch(e){}
  }
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
}

// 修改密码
function changePassword(req, res) {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ ok: false, error: '请输入旧密码和新密码' });
  if (newPassword.length < 6) return res.status(400).json({ ok: false, error: '密码至少 6 位' });
  const admin = adminStmts.getAdminById.get(req.admin.id);
  if (!bcrypt.compareSync(oldPassword, admin.password)) return res.status(400).json({ ok: false, error: '旧密码不正确' });
  const hash = bcrypt.hashSync(newPassword, 10);
  adminStmts.updateAdminPwd.run(hash, req.admin.id);
  res.json({ ok: true });
}

// 当前管理员信息
function getMe(req, res) {
  if (!req.admin) return res.json({ ok: false });
  res.json({ ok: true, admin: req.admin });
}

// 操作日志记录
function logAction(admin, action, target, detail, ip) {
  try {
    adminStmts.insertLog.run(admin.id, admin.username, action, target || null, detail || null, ip || null);
  } catch(e) {}
}

module.exports = { adminAuth, requireAdmin, requireSuperAdmin, adminLogin, adminLogout, changePassword, getMe, logAction, COOKIE_NAME };
