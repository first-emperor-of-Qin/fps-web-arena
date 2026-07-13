# 枪战突击 · COMBAT STRIKE v6.0

<div align="center">

**赛博朋克风格第一人称射击网页游戏 · 联机版**

[![Version](https://img.shields.io/badge/version-6.0-blue)]()
[![Levels](https://img.shields.io/badge/levels-20-green)]()
[![Weapons](https://img.shields.io/badge/weapons-33-orange)]()
[![Multiplayer](https://img.shields.io/badge/multiplayer-online-cyan)]()

</div>

---

## 🎮 游戏介绍

《枪战突击》(COMBAT STRIKE) 是一款赛博朋克风格的第一人称射击网页游戏。游戏包含 20 个关卡，提供 33 种武器供玩家选择。

### v6.0 联机版新特性 🆕

- **用户系统**：注册/登录/注销，用户名+密码，密码 bcrypt 加密，会话管理
- **好友系统**：搜索玩家、发送/接受/拒绝好友申请、在线状态实时显示
- **聊天系统**：好友私聊、房间频道、队伍频道，WebSocket 实时推送
- **联机对战**：创建房间或快速匹配，多人在线射击对战，位置/状态/弹道实时同步，60 秒断线重连窗口
- **组队功能**：创建/加入队伍，队长带队匹配，队内频道交流
- **单机全保留**：所有 20 关 PVE 关卡、33 件武器、王者乱斗 AI 模式、角色系统、商城抽奖等完整保留

---

## 🚀 快速开始

### 本地运行

```bash
# 1. 安装依赖（仅首次）
npm install

# 2. 启动服务
npm start
```

3. 打开浏览器访问 **[http://localhost:3000](http://localhost:3000)**
4. 注册账号→登录→开始游戏！

> ⚠️ 必须通过 `http://localhost:3000` 访问（不能直接双击打开 index.html）。前后端合并为一个 Node.js 服务，同源无 CORS。

### 生产部署

详见 **[DEPLOY.md](./DEPLOY.md)**，支持 Render、Railway、VPS 等。

> GitHub Pages 可作为纯静态镜像（仅单机可玩，无联机功能），联机需要 Node.js 后端。

---

## 🎯 游戏特性

### 单机（离线可用）
- **20 个精心关卡**：城市废墟、地下仓库、山地雷达站等
- **33 种武器**：手枪、步枪、狙击、能量武器、投掷武器
- **4 个章节剧情**：完整的赛博朋克故事线
- **Boss 战**：每章节史诗级 Boss 对决
- **武器升级/品质系统**：英雄级、传说级、神级
- **角色系统**：10 个角色、星级养成、属性加成
- **成就系统 & 商城 & 抽奖**

### 联机（需要登录）
- **王者乱斗 PVP**：1v1 / 3v3 / 5v5，与其他玩家真实对战
- **快速匹配**：自动匹配同规模玩家，无需等待房间
- **自定义房间**：创建或加入房间，邀请好友
- **组队系统**：组建最多 5 人队伍，队长带队匹配
- **好友 & 聊天**：好友在线状态、私聊/队伍频道

---

## 🎛️ 操作说明

| 按键 | 功能 |
|------|------|
| W/A/S/D | 移动 |
| 鼠标 | 瞄准/视角 |
| 左键 | 射击 |
| 右键 | 瞄准镜/武器特殊 |
| R | 换弹 |
| 1-5 | 切换武器槽 |
| 空格 | 跳跃 |
| E | 武器专属技能 |
| X | 千机伞变形/雷霆万钧 |
| O | 第三人称视角 |
| Q | 个人面板(含商城) |
| Esc | 暂停菜单 |

---

## 📁 项目结构

```
fps-web-arena/
├── index.html                 # 前端单体（HTML+CSS+JS，包含联机UI）
├── server/
│   ├── index.js               # Express + ws 启动入口
│   ├── db.js                  # SQLite 数据库（自动建表）
│   ├── auth.js                # 注册/登录/注销/会话
│   ├── social.js              # 好友系统 REST
│   ├── realtime.js            # WebSocket 实时层
│   └── data/                  # 运行时数据库（不入库）
├── package.json               # Node.js 配置
├── DEPLOY.md                  # 部署说明
├── .github/workflows/         # GitHub Pages 自动部署
└── README.md                  # 本文件
```

---

## 🛠️ 技术栈

| 层面 | 技术 |
|------|------|
| 前端渲染 | Three.js v0.152 (WebGL) |
| 前端网络 | WebSocket + Fetch API |
| 后端框架 | Express |
| 实时通信 | ws (原生 WebSocket) |
| 数据库 | SQLite (better-sqlite3) |
| 密码加密 | bcryptjs |
| 会话 | httpOnly cookie + token |
| 字体 | Orbitron / Rajdhani / JetBrains Mono |

---

## 📄 许可证

© 2025 COMBAT STRIKE. All Rights Reserved.

---

<div align="center">

**准备好进入赛博战场了吗？**

🔫 **`npm start` → http://localhost:3000 → 注册 → 开战！** 🔫

</div>
