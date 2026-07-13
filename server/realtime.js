// ============================================================================
// server/realtime.js — WebSocket 实时层
// 职责：在线状态(presence)、聊天、房间/匹配/组队、对局状态同步、断线重连。
// 同步模型：权威客户端 + 服务端转发。每个玩家以 ~20Hz 上报自身快照，服务端广播。
// ============================================================================
'use strict';

const { WebSocketServer } = require('ws');
const { verifySessionToken } = require('./auth');
const { stmts, db, applyMatchResult, applyMatchXp } = require('./db');

// 对局模式（A2）：tdm=团队竞技、dom=占点、defuse=爆破、pve=合作闯关
const ALLOWED_MODES = ['tdm', 'dom', 'defuse', 'infection', 'pve'];
function normMode(m) { return ALLOWED_MODES.indexOf(m) >= 0 ? m : 'tdm'; }

// 连接表：userId -> Set<ws>（同一账号可多端登录）
const connsByUser = new Map();
// 房间表：roomCode -> Room
const rooms = new Map();
// 匹配队列：[{ userId, ws, mapKey, teamSize, teamMembers:[] }]
const matchQueue = [];
// 组队表：teamId -> { leaderId, members:Set<userId>, inviteCode }
const teams = new Map();
// userId -> teamId
const userTeam = new Map();

function onlineIds() {
  const s = new Set();
  for (const id of connsByUser.keys()) s.add(id);
  return s;
}

// 全局广播：向所有已连接的游戏 WS 客户端推送（用于后台配置热更新）
let _wss = null;
function broadcastAll(obj) {
  if (!_wss) return;
  const s = JSON.stringify(obj);
  _wss.clients.forEach(c => { if (c.readyState === 1) { try { c.send(s); } catch(e){} } });
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch (e) {}
  }
}

// 给某用户所有在线连接发消息
function sendToUser(userId, obj) {
  const set = connsByUser.get(userId);
  if (!set) return;
  for (const ws of set) send(ws, obj);
}

// 广播在线状态变化给该用户的所有好友
function broadcastPresence(userId, online) {
  const me = userId;
  // 找出该用户的好友
  const friends = stmts.listFriends.all(me, me, me);
  for (const f of friends) {
    const fid = f.id === me ? f.id : f.id;
    sendToUser(fid, { type: 'presence', userId: me, online });
  }
}

// ==================== Room ====================
function genRoomCode() {
  let c; do { c = Math.random().toString(36).slice(2, 7).toUpperCase(); } while (rooms.has(c));
  return c;
}
function createRoom(hostUser, mapKey, teamSize, mode) {
  const code = genRoomCode();
  const room = {
    code, hostId: hostUser.id, mapKey: mapKey || 'port', teamSize: teamSize || 3,
    mode: normMode(mode), // 对局模式：tdm/dom/defuse/pve
    state: 'lobby', // lobby / loading / playing / ended
    players: new Map(), // userId -> { user, team, slot, ws, lastSnap, connected }
    createdAt: Date.now(),
    chatScope: code,
  };
  rooms.set(code, room);
  return room;
}
function roomPlayerList(room) {
  const out = [];
  for (const p of room.players.values()) {
    out.push({ userId: p.user.id, username: p.user.username, displayName: p.user.displayName, team: p.team, slot: p.slot, connected: p.connected });
  }
  return out;
}
function broadcastRoom(room, obj, exceptUserId) {
  for (const p of room.players.values()) {
    if (exceptUserId && p.user.id === exceptUserId) continue;
    send(p.ws, obj);
  }
}
function removePlayerFromRoom(room, userId, reason) {
  const p = room.players.get(userId);
  if (!p) return;
  room.players.delete(userId);
  if (p.ws) p.ws._roomCode = null;
  broadcastRoom(room, { type: 'room_player_left', roomCode: room.code, userId, reason });
  // 空房：保留 60s 后清理（用于断线重连窗口由 loading/playing 时单独处理）
  if (room.players.size === 0 && room.state !== 'playing') {
    rooms.delete(room.code);
  } else {
    // 房主转移
    if (room.hostId === userId && room.players.size > 0) {
      room.hostId = [...room.players.values()][0].user.id;
      broadcastRoom(room, { type: 'room_update', room: roomSummary(room) });
    }
    broadcastRoom(room, { type: room.mode === 'pve' ? 'pve_roster' : 'roster', players: roomPlayerList(room) });
  }
}
function roomSummary(room) {
  return { code: room.code, hostId: room.hostId, mapKey: room.mapKey, teamSize: room.teamSize, mode: room.mode || 'tdm', state: room.state };
}

// ==================== 匹配 ====================
function tryMatchmake() {
  // 按规模分组尝试凑齐 teamSize*2
  while (true) {
    const groups = {};
    for (const e of matchQueue) {
      const k = e.teamSize + ':' + e.mapKey + ':' + (e.mode || 'tdm');
      (groups[k] = groups[k] || []).push(e);
    }
    let matched = null;
    for (const k in groups) {
      const arr = groups[k];
      const teamSize = arr[0].teamSize;
      const need = teamSize * 2;
      if (arr.length >= need) {
        matched = arr.slice(0, need);
        break;
      }
    }
    if (!matched) break;

    // 从队列移除
    for (const e of matched) {
      const idx = matchQueue.indexOf(e);
      if (idx >= 0) matchQueue.splice(idx, 1);
    }
    // 建房开局
    const { mapKey, teamSize, mode } = matched[0];
    const fakeUser = matched[0].teamMembers.length ? { id: matched[0].leaderId, username: matched[0].leaderName, displayName: matched[0].leaderName } : matched[0].user;
    const room = createRoom(fakeUser, mapKey, teamSize, mode);
    room.state = 'playing';
    // 分队：偶数下标->team A(ally 视角的"我方"由各自客户端决定),这里统一分配 team 0/1
    matched.forEach((e, i) => {
      const team = i < teamSize ? 0 : 1;
      const u = e.user || { id: e.userId, username: (e.teamMembers[0]||{}).username||('user'+e.userId), displayName: (e.teamMembers[0]||{}).displayName||('user'+e.userId) };
      room.players.set(e.userId, { user: u, team, slot: i, ws: e.ws, lastSnap: null, connected: true });
      if (e.ws) e.ws._roomCode = room.code;
    });
    // 通知所有匹配到的玩家
    for (const e of matched) {
      const rp = room.players.get(e.userId);
      const mates = matched.filter(m => m.userId !== e.userId).map(m => {
        const mp = room.players.get(m.userId);
        return { userId: m.userId, username: mp.user.username, displayName: mp.user.displayName, team: mp.team };
      });
      send(e.ws, { type: 'match_found', roomCode: room.code, mapKey, teamSize, mode: room.mode || 'tdm', team: rp.team, players: mates });
    }
  }

  // 通知仍在队列中的玩家当前等待人数
  const counts = {};
  for (const e of matchQueue) { const k = e.teamSize + ':' + e.mapKey + ':' + (e.mode || 'tdm'); counts[k] = (counts[k]||0)+1; }
  for (const e of matchQueue) {
    send(e.ws, { type: 'match_waiting', mapKey: e.mapKey, teamSize: e.teamSize, mode: e.mode || 'tdm', inQueue: counts[e.teamSize + ':' + e.mapKey + ':' + (e.mode || 'tdm')] || 0, need: e.teamSize*2 });
  }
}

// ==================== 组队 ====================
function genTeamCode() {
  let c; do { c = Math.random().toString(36).slice(2, 7).toUpperCase(); } while ([...teams.values()].some(t => t.inviteCode === c)); return c;
}
function createTeam(leader) {
  const team = { id: 'T' + Date.now() + Math.random().toString(36).slice(2,5), leaderId: leader.id, members: new Set([leader.id]), inviteCode: genTeamCode(), membersInfo: new Map([[leader.id, leader]]) };
  teams.set(team.id, team);
  userTeam.set(leader.id, team.id);
  return team;
}
function teamSummary(team) {
  return { teamId: team.id, leaderId: team.leaderId, inviteCode: team.inviteCode, members: [...team.membersInfo.values()].map(u => ({ id: u.id, username: u.username, displayName: u.displayName })) };
}
function broadcastTeam(team, obj) {
  for (const uid of team.members) sendToUser(uid, obj);
}
function dissolveTeam(team, reason) {
  for (const uid of team.members) userTeam.delete(uid);
  broadcastTeam(team, { type: 'team_dissolved', reason: reason || 'disbanded' });
  teams.delete(team.id);
}

// ==================== ws 安装 ====================
function attach(server, path = '/ws') {
  const wss = new WebSocketServer({ server, path });
  _wss = wss;
  wss.on('connection', (ws, req) => {
    // 从 query 或 Cookie 取 token（浏览器 ws 握手会自动携带同源 cookie）
    const url = new URL(req.url, 'http://x');
    let token = url.searchParams.get('token');
    if (!token && req.headers.cookie) {
      const m = req.headers.cookie.match(/(?:^|;\s*)fps_sid=([^;]+)/);
      if (m) token = decodeURIComponent(m[1]);
    }
    const user = verifySessionToken(token);
    if (!user) { send(ws, { type: 'auth_error', error: '会话无效，请重新登录' }); ws.close(); return; }
    // 封禁检查
    const banned = db.prepare('SELECT * FROM user_bans WHERE user_id = ?').get(user.id);
    if (banned) { send(ws, { type: 'auth_error', error: '该账户已被封禁：' + (banned.reason || '违规行为') }); ws.close(); return; }
    ws._userId = user.id;
    ws._user = user;
    ws._roomCode = null;
    ws._lastPong = Date.now();

    let firstConnect = !connsByUser.has(user.id);
    if (!connsByUser.has(user.id)) connsByUser.set(user.id, new Set());
    connsByUser.get(user.id).add(ws);
    if (firstConnect) broadcastPresence(user.id, true);

    send(ws, { type: 'hello', user: { id: user.id, username: user.username, displayName: user.displayName } });

    ws.on('message', (buf) => handleMessage(ws, user, buf));
    ws.on('close', () => handleClose(ws, user));
    ws.on('pong', () => { ws._lastPong = Date.now(); });
  });

  // 心跳：30s 探活，60s 超时关闭
  const pingTimer = setInterval(() => {
    for (const clients of connsByUser.values()) {
      for (const ws of clients) {
        if (ws.readyState !== ws.OPEN) continue;
        if (Date.now() - (ws._lastPong || 0) > 60000) { try { ws.terminate(); } catch(e){} }
        else { try { ws.ping(); } catch(e){} }
      }
    }
  }, 30000);
  pingTimer.unref();

  return wss;
}

function handleMessage(ws, user, buf) {
  let msg;
  try { msg = JSON.parse(buf); } catch (e) { return; }
  if (!msg || !msg.type) return;
  try {
  const t = msg.type;
  switch (t) {

    // ---------- 聊天 ----------
    case 'chat': {
      const { channel, scope, content } = msg;
      if (typeof content !== 'string' || content.length === 0 || content.length > 1000) return;
      const c = String(content).slice(0, 1000);
      if (channel === 'dm') {
        // scope = 对方 userId
        const toId = Number(scope);
        if (!toId) return;
        stmts.insertMsg.run('dm', String(toId), user.id, c);
        // 仅发给对方（客户端已本地回显，不重复发给自己）
        sendToUser(toId, { type: 'chat', channel: 'dm', scope: String(user.id), fromUser: user.id, fromName: user.username, content: c, ts: Date.now() });
      } else if (channel === 'room' || channel === 'team') {
        const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
        const realScope = (channel === 'team' && room) ? ('team:' + room.code + ':' + getTeamOfInRoom(room, user.id)) : scope;
        if (channel === 'room' && room) {
          stmts.insertMsg.run('room', room.code, user.id, c);
          broadcastRoom(room, { type: 'chat', channel: 'room', scope: room.code, fromUser: user.id, fromName: user.username, content: c, ts: Date.now() }, user.id);
        } else if (channel === 'team') {
          // 组队频道：发给本队其他成员（自己已本地回显）
          const teamId = userTeam.get(user.id);
          const team = teamId ? teams.get(teamId) : null;
          if (team) {
            const sc = 'team:' + team.id;
            stmts.insertMsg.run('team', sc, user.id, c);
            for (const uid of team.members) { if (uid !== user.id) sendToUser(uid, { type: 'chat', channel: 'team', scope: sc, fromUser: user.id, fromName: user.username, content: c, ts: Date.now() }); }
          }
        }
      }
      break;
    }

    // ---------- 房间：创建 ----------
    case 'room_create': {
      const mode = normMode(msg.mode);
      const room = createRoom(user, msg.mapKey, msg.teamSize, mode);
      room.players.set(user.id, { user, team: 0, slot: 0, ws, lastSnap: null, connected: true });
      ws._roomCode = room.code;
      send(ws, { type: 'room_created', room: roomSummary(room), players: roomPlayerList(room) });
      break;
    }

    // ---------- 房间：加入 ----------
    case 'room_join': {
      const code = String(msg.roomCode || '').toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, { type: 'room_error', error: '房间不存在或已关闭' });
      if (room.players.size >= room.teamSize * 2 && !room.players.has(user.id)) return send(ws, { type: 'room_error', error: '房间已满' });
      const team = [...room.players.values()].filter(p => p.team === 0).length <= [...room.players.values()].filter(p => p.team === 1).length ? 0 : 1;
      room.players.set(user.id, { user, team, slot: room.players.size, ws, lastSnap: null, connected: true });
      ws._roomCode = room.code;
      send(ws, { type: 'room_joined', room: roomSummary(room), players: roomPlayerList(room), chatScope: room.chatScope });
      broadcastRoom(room, { type: 'roster', players: roomPlayerList(room) }, user.id);
      broadcastRoom(room, { type: 'chat', channel: 'room', scope: room.code, fromUser: 0, fromName: '系统', content: user.username + ' 加入了房间', ts: Date.now() });
      break;
    }

    // ---------- 房间：离开 ----------
    case 'room_leave': {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if (room) removePlayerFromRoom(room, user.id, 'left');
      ws._roomCode = null;
      break;
    }

    // ---------- 房间：开始（房主） ----------
    case 'room_start': {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if (!room || room.hostId !== user.id) return;
      room.state = 'playing';
      broadcastRoom(room, { type: 'match_start', roomCode: room.code, mapKey: room.mapKey, teamSize: room.teamSize, players: roomPlayerList(room) });
      break;
    }

    // ---------- 房间：切换队伍 ----------
    case 'room_switch_team': {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if (!room) return;
      const p = room.players.get(user.id); if (!p) return;
      p.team = p.team === 0 ? 1 : 0;
      broadcastRoom(room, { type: 'roster', players: roomPlayerList(room) });
      break;
    }

    // ---------- 快速匹配 ----------
    case 'match_queue': {
      const mapKey = msg.mapKey || 'port';
      const teamSize = Number(msg.teamSize) || 3;
      const mapMode = normMode(msg.mode);
      // 若在组队中：队长带队匹配，所有在线队员一起入队
      let teamMembers = [];
      let leaderId = user.id, leaderName = user.username;
      const teamId = userTeam.get(user.id);
      const team = teamId ? teams.get(teamId) : null;
      if (team) {
        if (team.leaderId !== user.id) return send(ws, { type: 'match_error', error: '只有队长可以带队匹配' });
        teamMembers = [...team.membersInfo.values()].filter(u => connsByUser.has(u.id));
        leaderId = team.leaderId; leaderName = (team.membersInfo.get(team.leaderId)||{}).username || leaderName;
      } else {
        teamMembers = [{ id: user.id, username: user.username, displayName: user.displayName }];
      }
      matchQueue.push({ userId: user.id, user, ws, mapKey, teamSize, mode: mapMode, teamMembers, leaderId, leaderName });
      send(ws, { type: 'match_queued', mapKey, teamSize, mode: mapMode });
      tryMatchmake();
      break;
    }
    case 'match_cancel': {
      const i = matchQueue.findIndex(e => e.ws === ws);
      if (i >= 0) matchQueue.splice(i, 1);
      send(ws, { type: 'match_cancelled' });
      break;
    }

    // ---------- 组队 ----------
    case 'team_create': {
      // 离开旧队
      leaveTeam(user.id, 'switched');
      const team = createTeam(user);
      send(ws, { type: 'team_update', team: teamSummary(team) });
      break;
    }
    case 'team_invite': { // { inviteCode }
      const code = String(msg.inviteCode||'').toUpperCase();
      const team = [...teams.values()].find(tt => tt.inviteCode === code);
      if (!team) return send(ws, { type: 'team_error', error: '邀请码无效' });
      if (team.members.size >= 5) return send(ws, { type: 'team_error', error: '队伍已满（最多5人）' });
      sendToUser(team.leaderId, { type: 'team_join_request', from: { id: user.id, username: user.username, displayName: user.displayName } });
      break;
    }
    case 'team_accept_join': { // { userId }
      const tid = userTeam.get(user.id); const team = tid ? teams.get(tid) : null;
      if (!team || team.leaderId !== user.id) return;
      const joiner = Number(msg.userId);
      if (!joiner) return;
      // 加入者必须先离开旧队（由其客户端发起 team_create 或直接接受即可，这里直接加）
      leaveTeam(joiner, 'switched');
      team.members.add(joiner);
      team.membersInfo.set(joiner, { id: joiner, username: msg.username || ('user'+joiner), displayName: msg.displayName || ('user'+joiner) });
      userTeam.set(joiner, team.id);
      broadcastTeam(team, { type: 'team_update', team: teamSummary(team) });
      break;
    }
    case 'team_leave': {
      leaveTeam(user.id, msg.reason || 'left');
      break;
    }
    case 'team_kick': { // { userId }
      const tid = userTeam.get(user.id); const team = tid ? teams.get(tid) : null;
      if (!team || team.leaderId !== user.id) return;
      leaveTeam(Number(msg.userId), 'kicked');
      break;
    }

    // ---------- 对局状态同步 ----------
    case 'snap': { // 玩家上报自身状态
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if (!room) return;
      const p = room.players.get(user.id); if (!p) return;
      p.lastSnap = msg.data; p.connected = true;
      // 广播给房间其他人
      broadcastRoom(room, { type: 'snap', userId: user.id, data: msg.data }, user.id);
      break;
    }
    case 'hit': { // 我命中了 targetId
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if (!room) return;
      // 转发给目标客户端，由其权威扣血
      sendToUser(Number(msg.targetId), { type: 'hit', fromUser: user.id, fromName: user.username, dmg: msg.dmg, headshot: !!msg.headshot, crit: !!msg.crit, weapon: msg.weapon });
      // 同时广播给房间其他人做命中反馈（伤害飘字）
      broadcastRoom(room, { type: 'remote_hit', fromUser: user.id, targetId: Number(msg.targetId), dmg: msg.dmg, headshot: !!msg.headshot, crit: !!msg.crit }, user.id);
      break;
    }
    case 'death': { // 我死了
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if (!room) return;
      broadcastRoom(room, { type: 'remote_death', userId: user.id, killerId: msg.killerId || 0, killerName: msg.killerName || '' });
      break;
    }
    case 'respawn': {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if (!room) return;
      broadcastRoom(room, { type: 'remote_respawn', userId: user.id, pos: msg.pos });
      break;
    }
    case 'shoot': { // 开火事件（枪口火焰/弹道可视化）
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if (!room) return;
      broadcastRoom(room, { type: 'remote_shoot', userId: user.id, origin: msg.origin, dir: msg.dir, weapon: msg.weapon }, user.id);
      break;
    }
    case 'emote': {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if (!room) return;
      broadcastRoom(room, { type: 'remote_emote', userId: user.id, text: msg.text });
      break;
    }

    // ---------- 断线重连 ----------
    case 'reconnect': {
      const code = String(msg.roomCode||'').toUpperCase();
      const room = rooms.get(code);
      if (!room || !room.players.has(user.id)) return send(ws, { type: 'reconnect_failed', error: '房间已关闭或你不在其中' });
      const p = room.players.get(user.id);
      p.ws = ws; p.connected = true; ws._roomCode = room.code;
      // 补发房间当前快照
      const snaps = [];
      for (const [uid, pp] of room.players) { if (uid !== user.id && pp.lastSnap) snaps.push({ userId: uid, data: pp.lastSnap, user: { id: pp.user.id, username: pp.user.username, displayName: pp.user.displayName, team: pp.team } }); }
      send(ws, { type: 'reconnect_ok', room: roomSummary(room), players: roomPlayerList(room), snaps });
      broadcastRoom(room, { type: room.mode === 'pve' ? 'pve_roster' : 'roster', players: roomPlayerList(room) }, user.id);
      break;
    }

    // ========== PVE 关卡联机组队 ==========
    case 'pve_create': {
      const room = createRoom(user, msg.mapKey||'campaign', msg.teamSize||3, 'pve');
      room.levelNo = msg.level || 1;
      room.readyNext = new Set(); // [v7] 组队"进入下一关"就绪集合
      room.invited = new Map(); // userId -> true（已发送邀请、未接受的队友）
      room.players.set(user.id, { user, team: 0, slot: 0, ws, lastSnap: null, connected: true });
      ws._roomCode = room.code;
      send(ws, { type: 'pve_created', room: roomSummary(room), level: room.levelNo, players: roomPlayerList(room) });
      break;
    }
    case 'pve_join': {
      const code = String(msg.roomCode||'').toUpperCase();
      const room = rooms.get(code);
      if(!room || room.mode !== 'pve') return send(ws, { type: 'pve_error', error: 'PVE房间不存在或已关闭' });
      if(room.players.has(user.id)) return send(ws, { type: 'pve_error', error: '你已在房间中' });
      room.players.set(user.id, { user, team: 0, slot: room.players.size, ws, lastSnap: null, connected: true });
      ws._roomCode = room.code;
      send(ws, { type: 'pve_joined', room: roomSummary(room), level: room.levelNo, players: roomPlayerList(room) });
      broadcastRoom(room, { type: 'pve_roster', players: roomPlayerList(room) }, user.id);
      broadcastRoom(room, { type: 'chat', channel: 'room', scope: room.code, fromUser: 0, fromName: '系统', content: user.username + ' 加入了队伍', ts: Date.now() });
      break;
    }
    case 'pve_start': {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if(!room || room.mode !== 'pve' || room.hostId !== user.id) return;
      room.state = 'playing';
      room.readyNext = new Set();
      broadcastRoom(room, { type: 'pve_start', level: room.levelNo||1, players: roomPlayerList(room) });
      break;
    }
    // 队长切换攻略关卡 → 同步给房间内成员与待接受邀请者
    case 'pve_set_level': {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if(!room || room.mode !== 'pve' || room.hostId !== user.id) return;
      room.levelNo = parseInt(msg.level) || room.levelNo || 1;
      broadcastRoom(room, { type: 'pve_level', level: room.levelNo });
      if(room.invited) room.invited.forEach(function(_v, k){ sendToUser(k, { type: 'pve_level', level: room.levelNo }); });
      break;
    }
    // PVE 好友邀请
    case 'pve_invite': {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if(!room || room.mode !== 'pve' || room.hostId !== user.id) return send(ws, { type: 'pve_error', error: '只有队长可以邀请' });
      const toId = Number(msg.userId);
      if(!toId) return;
      room.invited = room.invited || new Map();
      room.invited.set(toId, true);
      sendToUser(toId, { type: 'pve_invite', roomCode: room.code, level: room.levelNo, fromUser: user.id, fromName: user.username });
      send(ws, { type: 'chat', channel: 'room', fromUser: 0, fromName: '系统', content: '已向好友发送邀请', ts: Date.now() });
      broadcastRoom(room, { type: 'pve_invites', invites: Array.from(room.invited.keys()) });
      break;
    }
    case 'pve_accept_invite': {
      const code = String(msg.roomCode||'').toUpperCase();
      const room = rooms.get(code);
      if(!room || room.mode !== 'pve') return send(ws, { type: 'pve_error', error: '房间已关闭' });
      if(room.players.has(user.id)) return send(ws, { type: 'pve_error', error: '已在房间中' });
      room.players.set(user.id, { user, team: 0, slot: room.players.size, ws, lastSnap: null, connected: true });
      ws._roomCode = room.code;
      if(room.invited) room.invited.delete(user.id);
      send(ws, { type: 'pve_joined', room: roomSummary(room), level: room.levelNo, players: roomPlayerList(room) });
      broadcastRoom(room, { type: 'pve_roster', players: roomPlayerList(room) }, user.id);
      broadcastRoom(room, { type: 'pve_invites', invites: room.invited ? Array.from(room.invited.keys()) : [] });
      broadcastRoom(room, { type: 'chat', channel: 'room', scope: code, fromUser: 0, fromName: '系统', content: user.username + ' 接受了邀请并加入队伍', ts: Date.now() });
      break;
    }
    // PVE 敌人/伤害同步
    case 'pve_sync': {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if(!room || room.mode !== 'pve') return;
      broadcastRoom(room, { type: 'pve_sync', fromUser: user.id, data: msg.data || msg }, user.id);
      break;
    }
    // PVE 射击特效同步
    case 'pve_shoot': {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if(!room || room.mode !== 'pve') return;
      broadcastRoom(room, { type: 'pve_shoot', userId: user.id, userName: user.username, origin: msg.origin, dir: msg.dir, weapon: msg.weapon, melee: msg.melee }, user.id);
      break;
    }
    // PVE 本局伤害排行同步（仅转发，权威由各客户端各自累计）
    case 'pve_dmg': {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if(!room || room.mode !== 'pve') return;
      broadcastRoom(room, { type: 'pve_dmg', userId: user.id, total: msg.total }, user.id);
      break;
    }
    case 'pve_wave': {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if(!room || room.mode !== 'pve') return;
      broadcastRoom(room, { type: 'pve_wave', wave: msg.wave, done: msg.done, total: msg.total });
      break;
    }
    case 'pve_complete': {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if(!room || room.mode !== 'pve') return;
      broadcastRoom(room, { type: 'pve_complete', level: msg.level, score: msg.score });
      break;
    }
    // [v7] 组队"进入下一关"：双方都点击后由服务器统一广播 pve_start，确保进入同一房间
    case 'pve_ready_next': {
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null;
      if(!room || room.mode !== 'pve') return;
      room.readyNext = room.readyNext || new Set();
      room.readyNext.add(user.id);
      broadcastRoom(room, { type: 'pve_ready_state', ready: Array.from(room.readyNext), total: room.players.size });
      if(room.readyNext.size >= room.players.size && room.players.size > 0){
        room.readyNext = new Set();
        room.levelNo = (room.levelNo||1) + 1;
        room.state = 'playing';
        broadcastRoom(room, { type: 'pve_start', level: room.levelNo, players: roomPlayerList(room) });
      }
      break;
    }

    // ========== 占点/爆破 目标状态（服务端纯转发，客户端权威） ==========
    case 'obj_update': { // { data } — 目标/占点/炸弹状态增量
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null; if (!room) return;
      broadcastRoom(room, { type: 'obj_update', userId: user.id, data: msg.data }, user.id);
      break;
    }
    case 'obj_event': { // { event, payload } — 占点/安包/拆包/胜负等关键事件
      const room = ws._roomCode ? rooms.get(ws._roomCode) : null; if (!room) return;
      broadcastRoom(room, { type: 'obj_event', userId: user.id, event: msg.event, payload: msg.payload }, user.id);
      break;
    }
    // 对局结算：客户端权威上报比分 → 服务端更新 ELO 并回执
    case 'match_result': { // { winnerTeam, players:[{userId, team, kills, deaths, win:bool}] }
      const players = Array.isArray(msg.players) ? msg.players : [];
      try {
        if (typeof applyMatchResult === 'function') applyMatchResult(players);
        if (typeof applyMatchXp === 'function') applyMatchXp(players);
      } catch (e) { console.error('[ws] match_result 更新失败:', e.message); }
      send(ws, { type: 'match_result_ack', ok: true });
      break;
    }

    case 'ping': send(ws, { type: 'pong', t: Date.now() }); break;
  }
  } catch(e) { console.error('[ws] 消息处理异常:', e.message, msg && msg.type || '?'); }
}

function getTeamOfInRoom(room, userId) {
  const p = room.players.get(userId); return p ? p.team : 0;
}

function leaveTeam(userId, reason) {
  const tid = userTeam.get(userId);
  if (!tid) return;
  const team = teams.get(tid); if (!team) { userTeam.delete(userId); return; }
  team.members.delete(userId); team.membersInfo.delete(userId); userTeam.delete(userId);
  if (team.members.size === 0) { teams.delete(tid); return; }
  if (team.leaderId === userId) {
    team.leaderId = [...team.members][0];
  }
  broadcastTeam(team, { type: 'team_update', team: teamSummary(team), leftUserId: userId, reason });
}

function handleClose(ws, user) {
  const set = connsByUser.get(user.id);
  if (set) { set.delete(ws); if (set.size === 0) { connsByUser.delete(user.id); broadcastPresence(user.id, false); } }
  // 房间内标记断线（保留 60s 以便重连）
  if (ws._roomCode) {
    const room = rooms.get(ws._roomCode);
    if (room) {
      const p = room.players.get(user.id);
      if (p) {
        p.connected = false;
        // 若在 lobby：直接移除；若 playing：保留 60s
        if (room.state === 'lobby' || room.state === 'ended') {
          removePlayerFromRoom(room, user.id, 'disconnected');
        } else {
          // 60s 后若仍未重连，踢出
          const code = room.code;
          setTimeout(() => {
            const r = rooms.get(code);
            if (!r) return;
            const pp = r.players.get(user.id);
            if (pp && !pp.connected && connsClosed(user.id)) {
              removePlayerFromRoom(r, user.id, 'timeout');
            }
          }, 60000).unref();
          broadcastRoom(room, { type: 'player_disconnect', userId: user.id });
        }
      }
    }
  }
  // 从匹配队列移除
  const i = matchQueue.findIndex(e => e.ws === ws);
  if (i >= 0) matchQueue.splice(i, 1);
}
function connsClosed(userId) { return !connsByUser.has(userId); }

module.exports = { attach, onlineIds, sendToUser, kickUser, broadcastAll };
function kickUser(userId){
  const set = connsByUser.get(userId);
  if(!set) return;
  for(const ws of set){
    try { send(ws, { type: 'kicked', reason: '账户已被管理员封禁' }); } catch(e){}
    try { ws.close(); } catch(e){}
  }
  connsByUser.delete(userId);
}
