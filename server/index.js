// ============================================================================
// server/index.js — 启动入口
// Express 托管静态前端(index.html) + REST API + WebSocket
// 用法： npm install && npm start  →  http://localhost:3000
// ============================================================================
'use strict';

const path = require('path');
const http = require('http');
const express = require('express');

const { authMiddleware, router: authRouter } = require('./auth');
const social = require('./social');
const realtime = require('./realtime');

const app = express();
const PORT = process.env.PORT || 3000;

// ----- 基础中间件 -----
app.use(express.json());

// ----- 游戏鉴权 -----
app.use(authMiddleware);

// ----- 游戏 API 路由 -----
app.use('/api', authRouter);
app.use('/api/friends', social.router);

// 把在线人数注入 social
social.setPresenceProvider(realtime.onlineIds);
social.setPushNotice(realtime.sendToUser);

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, online: realtime.onlineIds().size }));

// ----- 静态前端（单体 index.html） -----
const STATIC_DIR = path.join(__dirname, '..');
app.use(express.static(STATIC_DIR, { index: 'index.html', extensions: ['html'] }));
// SPA 兜底
app.get('*', (req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));

// ----- HTTP + WS 同一端口 -----
const server = http.createServer(app);
realtime.attach(server, '/ws');

server.listen(PORT, () => {
  console.log('========================================================');
  console.log('  枪战突击 · COMBAT STRIKE — 联机服务已启动');
  console.log('  前端游戏:  http://localhost:' + PORT);
  console.log('  WebSocket: ws://localhost:' + PORT + '/ws');
  console.log('  数据库:    server/data/app.sqlite');
  console.log('========================================================');
});

// 优雅退出
process.on('SIGINT', () => { console.log('\n正在关闭...'); process.exit(0); });
process.on('SIGTERM', () => process.exit(0));

// 未捕获异常防护
process.on('uncaughtException', (err) => {
  console.error('[致命] 未捕获异常:', err.message, err.stack && err.stack.split('\n')[1] || '');
  if (err.code === 'EADDRINUSE') { console.error('端口被占用，请先关闭其他实例'); process.exit(1); }
});
