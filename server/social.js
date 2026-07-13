// ============================================================================
// server/social.js — 好友系统 REST
// 搜索 / 申请 / 接受 / 拒绝 / 删除好友，列表含在线状态（由 presence 提供）。
// ============================================================================
'use strict';

const express = require('express');
const { stmts } = require('./db');
const { requireAuth } = require('./auth');

const router = express.Router();

// 在线状态由 realtime.js 维护，这里通过 require 注入一个查询函数。
let presenceOnlineIdsFn = () => new Set();
function setPresenceProvider(fn) { presenceOnlineIdsFn = fn; }

// 统一好友对的顺序（小 id 在前）
function pair(a, b) { return a < b ? [a, b] : [b, a]; }

// ---------- GET /api/friends/search?q= ----------
router.get('/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ ok: true, users: [] });
  const like = '%' + q.replace(/[%_]/g, m => '\\' + m) + '%';
  const rows = stmts.searchUsers.all(like, like);
  const online = presenceOnlineIdsFn();
  const meId = req.user.id;
  res.json({ ok: true, users: rows.filter(r => r.id !== meId).map(r => ({
    id: r.id, username: r.username, displayName: r.display_name || r.username,
    online: online.has(r.id)
  })) });
});

// ---------- POST /api/friends/request { toUserId } ----------
router.post('/request', requireAuth, (req, res) => {
  const toId = Number(req.body && req.body.toUserId);
  const fromId = req.user.id;
  if (!toId || toId === fromId) return res.status(400).json({ ok: false, error: '无效的目标用户' });
  const target = stmts.getUserById.get(toId);
  if (!target) return res.status(404).json({ ok: false, error: '用户不存在' });

  // 已是好友
  const [a, b] = pair(fromId, toId);
  if (stmts.getFriendship.get(a, b, a, b)) return res.status(409).json({ ok: false, error: '你们已经是好友了' });

  // 防止重复申请
  stmts.insertReq.run(fromId, toId);
  // 实时推送给对方（若在线）
  pushNotice(toId, { type: 'friend_request', from: { id: fromId, username: req.user.username, displayName: req.user.displayName } });
  res.json({ ok: true });
});

// ---------- POST /api/friends/accept { requestId } ----------
router.post('/accept', requireAuth, (req, res) => {
  const reqId = Number(req.body && req.body.requestId);
  const row = stmts.getRequest.get(reqId);
  if (!row || row.to_user !== req.user.id) return res.status(400).json({ ok: false, error: '申请不存在或无权操作' });
  stmts.setReqStatus.run('accepted', reqId);
  const [a, b] = pair(row.from_user, row.to_user);
  stmts.addFriendship.run(a, b);
  pushNotice(row.from_user, { type: 'friend_accepted', by: { id: req.user.id, username: req.user.username, displayName: req.user.displayName } });
  res.json({ ok: true });
});

// ---------- POST /api/friends/reject { requestId } ----------
router.post('/reject', requireAuth, (req, res) => {
  const reqId = Number(req.body && req.body.requestId);
  const row = stmts.getRequest.get(reqId);
  if (!row || row.to_user !== req.user.id) return res.status(400).json({ ok: false, error: '申请不存在或无权操作' });
  stmts.setReqStatus.run('rejected', reqId);
  res.json({ ok: true });
});

// ---------- POST /api/friends/remove { friendId } ----------
router.post('/remove', requireAuth, (req, res) => {
  const fid = Number(req.body && req.body.friendId);
  const [a, b] = pair(req.user.id, fid);
  const info = stmts.removeFriendship.run(a, b, a, b);
  res.json({ ok: true, removed: info.changes > 0 });
});

// ---------- GET /api/friends （列表 + 在线 + 待处理申请） ----------
router.get('/', requireAuth, (req, res) => {
  const me = req.user.id;
  const friends = stmts.listFriends.all(me, me, me).map(f => ({
    id: f.id, username: f.username, displayName: f.display_name || f.username
  }));
  const pending = stmts.getPendingReq.all(me, 'pending').map(r => ({
    requestId: r.id, fromUserId: r.from_user, username: r.username, displayName: r.display_name || r.username
  }));
  const online = presenceOnlineIdsFn();
  res.json({ ok: true, friends: friends.map(f => ({ ...f, online: online.has(f.id) })), pending });
});

// ---------- GET /api/messages/dm?with=  (私聊历史) ----------
router.get('/messages/dm', requireAuth, (req, res) => {
  const withId = Number(req.query.with);
  if (!withId) return res.json({ ok: true, messages: [] });
  const me = String(req.user.id);
  const them = String(withId);
  const rows = stmts.getDMHistory.all(them, Number(me), me, Number(them));
  res.json({ ok: true, messages: rows.map(formatMsg) });
});

function formatMsg(m) {
  return { id: m.id, channel: m.channel, scope: m.scope, fromUser: m.from_user, content: m.content, createdAt: m.created_at };
}

// presence/notice 注入点（realtime.js 调用 setPushNotice / setPresenceProvider）
let pushNoticeFn = () => {};
function setPushNotice(fn) { pushNoticeFn = fn; }
function pushNotice(userId, payload) { try { pushNoticeFn(userId, payload); } catch(e){} }

module.exports = { router, setPresenceProvider, setPushNotice };
