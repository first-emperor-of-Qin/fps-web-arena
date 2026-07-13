# 交接文档 · HANDOFF v3 (最终版)

**项目**：枪战突击 · COMBAT STRIKE — 单机FPS → 联机FPS 改造
**日期**：2026-07-13
**版本**：v6.0 联机版
**分支**：`zcode`
**前端**：`index.html` (31,153 行 / 2.0MB)
**后端**：7个 JS 文件 + 1个 HTML 文件 — `server/` 目录

---

## ⚡ 5 秒快速启动

```bash
cd fps-web-arena
npm install        # 仅首次
npm start          # → http://localhost:3000
```

| 入口 | 地址 | 账户 | 密码 |
|------|------|------|------|
| 游戏 | `http://localhost:3000` | `gemetest` | `66668888xxx` |
| 后台 | `http://localhost:3000/admin` | `admin` | `admin123456` |

> ⚠️ 必须通过 `http://localhost:3000` 访问。`file://` 协议和 GitHub Pages 均不可用（联机需 Node 后端）。

---

## 📁 目录结构与文件职责

```
fps-web-arena/
├── index.html                  # 前端单体 (31,153行) — 全部内联：CSS + HTML + JS
├── package.json                # Node.js: express/ws/better-sqlite3/bcryptjs
├── server/
│   ├── index.js                # 启动入口 — Express路由 + ws挂载 + 静态托管
│   ├── db.js                   # SQLite — 用户/会话/好友/消息/房间表 + 预编译查询
│   ├── auth.js                 # 游戏认证 — 注册/登录/登出 + 轻量cookie解析 + 封禁检查
│   ├── social.js               # 好友REST — 搜索/申请/接受/删除/在线状态
│   ├── realtime.js             # ⭐ WebSocket核心 — 27种消息类型(聊天/匹配/组队/对局同步/PVE)
│   ├── admin-db.js             # 后台DB — 10张管理表 + 预设admin账户 + 种子数据
│   ├── admin-auth.js           # 后台认证 — 独立session + 改密 + 日志记录
│   ├── admin-api.js            # 后台API — 11组端点 + 公开配置API(/api/config/*)
│   ├── admin.html              # 后台前端 — 31KB单页(10个功能页)
│   └── data/app.sqlite         # 运行时数据库 (.gitignore)
├── README.md / DEPLOY.md       # 项目说明 + 部署指南
├── HANDOFF.md                  # ⬅ 你正在读的文件
└── CONVERSATION_LOG.md         # 完整对话日志 + 操作记录
```

---

## 🏗️ 架构概览

```
浏览器 ── HTTP ──→ Express (server/index.js)
  │                    ├─ /api/*          → 游戏 REST API
  │                    ├─ /admin          → 后台管理
  │                    ├─ /admin/api/*    → 后台 REST API
  │                    ├─ /api/config/*   → 公开配置 (武器/角色/关卡)
  │                    ├─ /ws             → WebSocket 实时层
  │                    └─ 静态文件        → index.html
  │
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
registerStartScreenButtons()  ─┐
initAll() (Three.js引擎)      ─┼─→ window.__fpsGate(fn) ─→ unlockBoot() 排空
角色系统 init()               ─┘                                ↑ 登录成功触发
```

---

## 🎮 前端关键代码位置 (index.html)

### CSS 注入点
- **联机样式** (~3000行)：`#auth-screen`/`.mp-panel`/`#chat-panel`/`#matchmaking-overlay`/`#room-lobby`/`#pve-lobby`/`#net-toast`/`.ban-banner`

### HTML 注入点
- **登录界面** `#auth-screen` — 含封禁横幅 `#ban-banner`
- **好友面板** `#friends-panel` — 搜索/申请列表/好友列表
- **聊天面板** `#chat-panel` — 频道切换/消息列表/输入框
- **组队面板** `#team-panel` — 创建/加入/邀请
- **PVE大厅** `#pve-lobby` — 房间码/关卡选择/好友邀请
- **匹配遮罩** `#matchmaking-overlay` / **房间大厅** `#room-lobby`
- **底部Dock** 新增：👥好友 / 💬聊天 / ⚔️组队联机
- **开始屏幕** 新增：🤝组队攻略卡片
- **WZLB弹窗** 简化：仅1v1联机(移除AI/3v3/5v5)

### JS 注入点
- **登录守卫 + MP客户端** (~900行) — `window.__fpsGate` + `window.MP` + `window.net`
- **引擎桥接** (initAll 末尾) — `window.__startOnlineMatch` / `window.__startPveCoop` / `window.__netHooks`
- **变量声明** (initAll 开头) — `let pveCoopActive = false`

### ⚠️ 关键设计原则
**单机游戏逻辑函数中没有任何 PVE 联机代码**。以下函数已被完全还原到原始状态：
- `handlePrimaryFire` — 无 PVE 代码
- `checkWaveComplete` — 无 PVE 代码
- `startNextWave` — 无 PVE 代码
- `killEnemy` — 无 PVE 代码
- 主命中伤害应用 — 无 PVE 代码

PVE 联机功能全部封装在 `window.__netHooks` 中，仅在 `pveCoopActive === true` 时由 WebSocket 消息触发。

---

## 🔌 WebSocket 消息类型表

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

---

## 🔧 已修复的 BUG 清单

| # | 现象 | 根因 | 修复 |
|---|------|------|------|
| 1 | 登录后闪现首页又跳回 | ws鉴权只读URL token | 服务端支持Cookie header |
| 2 | 1v1匹配不成功 | 匹配队列缺`user`对象 | 补`user`字段+防御性兜底 |
| 3 | 组队一方直接胜利 | 队伍映射逻辑错(team=1反转) | `p.team===myTeam?'ally':'enemy'` |
| 4 | 聊天消息重复 | 服务端relay+客户端回显 | 排除发送者 |
| 5 | 怪物0血不死 | `window.MP.send`不存在 | 添加`MP.send`方法 |
| 6 | PVE击杀广播死循环 | `killEnemy`收到sync又广播 | `_pveKillSynced`标记 |
| 7 | **单机无怪物** | PVE代码嵌入游戏逻辑函数 | **全部移除，仅保留独立包装** |

---

## 📋 当前状态矩阵

| 模块 | 状态 | 备注 |
|------|------|------|
| 用户系统 (注册/登录/登出) | ✅ | bcrypt + httpOnly cookie |
| 好友系统 | ✅ | 搜索/申请/在线状态 |
| 聊天系统 | ✅ | 私聊/房间/队伍频道 |
| WZLB 1v1联机 | ✅ | 仅1v1，30Hz帧同步 |
| 组队系统 | ✅ | 创建/邀请/带队匹配 |
| 后台管理系统 | ✅ | 10模块，数据已填充 |
| 封禁系统 | ✅ | 实时生效+红色横幅 |
| 配置API | ✅ | /api/config/* 就绪 |
| 单机关卡PVE (20关) | ✅ | 完全正常 |
| 单机王者乱斗 | ✅ | AI bot正常 |
| PVE联机同步基础 | ✅ | 架构就绪(需测试) |
| 前端动态配置接入 | ⬜ | API就绪，引擎未接入 |
| 特殊武器PVE伤害广播 | ⬜ | 仅主子弹路径覆盖 |

---

## 🧪 双窗口联机测试

```bash
# 终端：启动服务
npm start

# 浏览器窗口1：登录 gemetest / 66668888xxx
http://localhost:3000

# 浏览器窗口2：登录 tester2 / pass123
http://localhost:3000
```

**WZLB 1v1**：两个窗口都点"王者乱斗" → 选地图 → "⚡ 快速匹配1v1"

**PVE 组队**：窗口1点"🤝 组队攻略" → 取消(创建房间) → 复制房间码 → 窗口2点"组队攻略" → 输入房间码加入 → 队长选关卡 → "⚔️ 开始攻略"

**后台测试**：`http://localhost:3000/admin` → admin/admin123456 → 封禁 gemetest → 游戏窗口立即跳转红色横幅

---

## 📞 给新 AI 的建议

1. **先跑通** `npm start` → `http://localhost:3000` → 登录 → 进单机关卡确认怪物正常
2. **不要**在 `handlePrimaryFire`/`checkWaveComplete`/`startNextWave`/`killEnemy` 等游戏逻辑函数中添加代码——它们必须保持原始状态
3. **联机功能**扩展应全部通过 `window.__netHooks` 或 `window.MP` 的事件处理完成
4. **PVE联机测试**需要实际两个浏览器窗口同时操作
5. 修改 `server/realtime.js` 后需重启 Node 服务才能生效
