# 交接文档 · HANDOFF（当前真实状态）

**项目**：枪战突击 · COMBAT STRIKE — 单机 FPS → 联机 FPS 改造
**日期**：2026-07-14
**版本**：v6.0 联机版（已回退扩展）
**分支**：`zcode`
**前端**：`index.html`（31,898 行 / 2.0MB，全部内联：CSS + HTML + JS）
**后端**：5 个 JS 文件 — `server/` 目录

---

## ⚡ 5 秒快速启动

```bash
cd fps-web-arena
npm install        # 仅首次
npm start          # → http://localhost:3000
```

| 入口 | 地址 | 账户 | 密码 |
|------|------|------|------|
| 游戏 | `http://localhost:3000` | `gametest` | `66668888xxx` |

> ⚠️ 必须通过 `http://localhost:3000` 访问。`file://` 协议和 GitHub Pages 均不可用（联机需 Node 后端）。

---

## 📁 目录结构与文件职责

```
fps-web-arena/
├── index.html                  # 前端单体 (31,898行) — 全部内联：CSS + HTML + JS
├── package.json                # Node.js: express/ws/better-sqlite3/bcryptjs
├── server/
│   ├── index.js                # 启动入口 — Express路由 + ws挂载 + 静态托管
│   ├── db.js                   # SQLite — 用户/会话/好友/消息/房间表 + DB_PATH 可配置
│   ├── auth.js                 # 游戏认证 — 注册/登录/登出 + 轻量cookie解析 + 封禁检查
│   ├── social.js               # 好友REST — 搜索/申请/接受/删除/在线状态
│   └── realtime.js             # ⚡ WebSocket核心 — 聊天/匹配/组队/对局同步/PV
├── README.md / DEPLOY.md       # 项目说明 + 部署指南
├── HANDOFF.md                # ⬅ 你正在读的文件
└── CONVERSATION_LOG.md       # 完整对话日志 + 操作记录
```

> 已删除（用户要求回退）：`server/admin-*`、`server/admin.html`、`server/seed_config.json`、`/api/config/*`、`/admin` 后台系统，以及 A1(3v3/5v5规模)/A2(占点·爆破)/A3(段位榜)/C(成长线)/D(生化 infection) 全部扩展代码与 UI。内容回退到 `index.html` 内联内置常量（19 武器 / 10 角色 / 10 关卡）。

---

## 🏗️ 架构概览

```
浏览器 ── HTTP ──→ Express (server/index.js)
  │                    ├─ /api/*          → 游戏 REST API（注册/登录/好友）
  │                    ├─ /ws             → WebSocket 实时层
  │                    └─ 静态文件        → index.html
  └── WebSocket ──────→ realtime.js
                          ├─ 聊天 (私聊/房间/队伍频道)
                          ├─ 匹配 (1v1 队列撮合)
                          ├─ 组队 (创建/邀请/带队匹配)
                          ├─ 对局同步 (WZLB 30Hz快照 + 命中/死亡/复活)
                          ├─ PVE联机 (伤害/波次/射击特效同步)
                          └─ 断线重连 (60s窗口)
```

### 登录守卫 (`window.__fpsGate`)
三个游戏入口在登录前被锁定：
```
registerStartScreenButtons()  ┐
initAll() (Three.js引擎)      ┼─→ window.__fpsGate(fn) ─→ unlockBoot() 排空
角色系统 init()               ┘                                ↑ 登录成功触发
```

---

## 🎮 前端关键代码位置 (index.html)

### CSS 注入点
- **联机样式**（~3000行）：`#auth-screen`/`.mp-panel`/`#chat-panel`/`#matchmaking-overlay`/`#room-lobby`/`#pve-lobby`/`#net-toast`/`.ban-banner`
- **个人面板**（最后获胜的 `!important` 层「个人面板 · 简洁大气重构」）：`#player-panel`/`#panel-inner`/`#panel-body`/`#panel-left`/`#panel-right` — 已修复 flex `min-height:0` 滚动被裁切问题

### HTML 注入点
- **登录界面** `#auth-screen` — 含封禁横幅 `#ban-banner`
- **好友面板** `#friends-panel` / **聊天面板** `#chat-panel` / **组队面板** `#team-panel`
- **PV大厅** `#pve-lobby` — 房间码/关卡选择/好友邀请
- **匹配遮罩** `#matchmaking-overlay` / **房间大厅** `#room-lobby`
- **底部Dock**：👥好友 / 💬聊天 / ⚔️组队联机
- **开始屏幕**：🤝组队攻略卡片
- **WZLB弹窗** 简化：仅 1v1 联机（移除 AI/3v3/5v5）

### JS 注入点
- **登录守卫 + MP客户端**（~900行）— `window.__fpsGate` + `window.MP` + `window.net`
- **引擎桥接**（initAll 末尾）— `window.__startOnlineMatch` / `window.__startPveCoop` / `window.__netHooks`
- **变量声明**（initAll 开头）— `let pveCoopActive = false`

### ⚠️ 关键设计原则
**单机游戏逻辑函数中没有任何 PVE/联机代码**。以下函数已被完全还原到原始状态：
- `handlePrimaryFire` — 无联机代码
- `checkWaveComplete` — 无联机代码
- `startNextWave` — 无联机代码
- `killEnemy` — 无联机代码
- 主命中伤害应用 — 无联机代码

PV联机功能全部封装在 `window.__netHooks` 中，仅在 `pveCoopActive === true` 时由 WebSocket 消息触发。

---

## 🔌 WebSocket 消息类型表（当前保留）

| type | 方向 | 用途 |
|------|------|------|
| `hello` | S→C | 连接确认 |
| `chat` | 双向 | 聊天 (dm/room/team) |
| `presence` | S→C | 好友在线状态 |
| `room_create/join/leave/start` | 双向 | 房间管理 |
| `match_queue/cancel/found` | 双向 | 1v1 匹配 |
| `team_create/invite/accept_join/leave` | 双向 | 组队 |
| `snap` | C→S→C | WZLB 对局快照 (30Hz) |
| `hit` | C→S→C | WZLB 命中事件 |
| `death/respawn` | C→S→C | WZLB 死亡/复活 |
| `kicked` | S→C | 强制下线 (封禁) |
| `pve_create/join/start` | 双向 | PVE 组队 |
| `pve_sync` | C→S→C | PVE 敌人伤害同步 |
| `pve_shoot` | C→S→C | PVE 射击特效 |
| `pve_wave` | C→S→C | PVE 波次同步 |
| `pve_invite/accept_invite` | 双向 | PVE 好友邀请 |
| `reconnect` | C→S | 断线重连 |

> 注意：`realtime.js` 的 `ALLOWED_MODES = ['tdm','pve']`（仅保留基础 1v1 死斗 + PVE 合作）。`match_result` 现在只回 `match_result_ack`（不再落库）。

---

## 🧪 当前状态矩阵

| 模块 | 状态 | 备注 |
|------|------|------|
| 用户系统 (注册/登录/登出) | ✅ | bcrypt + httpOnly cookie |
| 好友系统 | ✅ | 搜索/申请/在线状态 |
| 聊天系统 | ✅ | 私聊/房间/队伍频道 |
| WZLB 1v1联机 | ✅ | 仅1v1，30Hz帧同步 |
| 组队系统 | ✅ | 创建/邀请/带队匹配 |
| 封禁系统 | ✅ | 实时生效+红色横幅 |
| 单机关卡PVE (10关) | ✅ | 完全正常 |
| 单机王者乱斗 | ✅ | AI bot正常 |
| PVE联机同步 | ✅ | 架构就绪，已多轮修复验证 |
| 个人面板 | ✅ | 滚动已修复 + 简洁大气重做 |

---

## 🖥️ 双窗口联机测试

```bash
# 终端：启动服务
npm start

# 浏览器窗口1：登录 gametest / 66668888xxx
http://localhost:3000

# 浏览器窗口2：登录 tester2 / pass123
http://localhost:3000
```

**WZLB 1v1**：两个窗口都点"王者乱斗" → 选地图 → "⚔️ 快速匹配1v1"

**PVE 组队**：窗口1点"🤝 组队攻略" → 取消(创建房间) → 复制房间码 → 窗口2点"组队攻略" → 输入房间码加入 → 队长选关卡 → "⚔️ 开始攻略"

---

## 📋 给新 AI 的建议
1. **先跑通** `npm start` → `http://localhost:3000` → 登录 → 进单机关卡确认怪物正常
2. **不要**在 `handlePrimaryFire`/`checkWaveComplete`/`startNextWave`/`killEnemy` 等游戏逻辑函数中添加代码——它们必须保持原始状态
3. **联机功能**扩展应全部通过 `window.__netHooks` 或 `window.MP` 的事件处理完成
4. **PV联机测试**需要实际两个浏览器窗口同时操作
5. 修改 `server/realtime.js` 后需重启 Node 服务才能生效
6. **本地起服**：用 Node 26（`/opt/homebrew/bin/node`），因为预编译 better-sqlite3 原生模块 ABI 与 Node 26 匹配；托管 Node 22 会 ABI 不匹配。但部署时已将 `package.json` 的 `engines.node` 锁为 `22.x`，托管平台（Render/Railway）用 Node 22 时 better-sqlite3 有对应预编译，无需现场编译。
7. **数据库持久化**：`server/db.js` 的 `DB_PATH` 支持 `process.env.DB_PATH` 环境变量。免费实例磁盘临时，重启会清库；部署时挂一个持久盘并设 `DB_PATH` 指向挂载点即可。

---

## 🚀 部署要点（详见 DEPLOY.md）
- GitHub Pages **不能**托管（需 Node 后端）。用 Render / Railway / VPS。
- `zcode` 分支需推到 `origin` 后，平台才能拉取。
- `package.json` 已锁 `engines.node: 22.x`；平台 Build `npm install`、Start `node server/index.js`。
- `server/index.js` 已读 `process.env.PORT || 3000`，平台注入 PORT 即可。
- 前端 WS 用 `location.host + '/ws'`（同源，HTTPS 下自动 `wss://`），无写死域名，任意部署域名直接可用。
