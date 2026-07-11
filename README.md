# 枪战突击 · COMBAT STRIKE v5.0

<div align="center">

**赛博朋克风格第一人称射击游戏**

[![Version](https://img.shields.io/badge/version-5.0-blue)]()
[![Levels](https://img.shields.io/badge/levels-20-green)]()
[![Weapons](https://img.shields.io/badge/weapons-33-orange)]()
[![Chapters](https://img.shields.io/badge/chapters-4-purple)]()
[![Play Online](https://img.shields.io/badge/play-online-success)](https://first-emperor-of-qin.github.io/fps-web-arena/)

</div>

---

## 🎮 游戏介绍

《枪战突击》(COMBAT STRIKE) 是一款赛博朋克风格的第一人称射击网页游戏。游戏包含 4 个章节、20 个关卡，提供 33 种武器供玩家选择。采用先进的 WebGL 技术，在浏览器中呈现沉浸式 FPS 体验。

### ✨ v5.0 CYBERPUNK+ EDITION 新特性

- **UI 全面重构**：玻璃拟态 + HDR 高对比 + 动态光效
- **Orbitron 显示字体**：所有界面升级为高端赛博朋克风格
- **增强视觉效果**：能量环、粒子特效、动态背景
- **优化移动端体验**：响应式设计，支持触控操作

---

## 🚀 快速开始

### 本地运行

1. 克隆或下载本项目
2. 使用任意 HTTP 服务器启动：

```bash
# 使用 Python
python -m http.server 8080

# 使用 Node.js (npx)
npx serve .

# 使用 PHP
php -S localhost:8080
```

3. 打开浏览器访问 `http://localhost:8080`

### Cloudflare Pages 部署

本项目已配置好 [Wrangler](https://developers.cloudflare.com/workers/wrangler/)，可直接部署到 Cloudflare Pages：

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 部署项目
wrangler pages deploy .
```

### GitHub Pages 部署（自动）

本项目已配置 GitHub Actions 工作流（`.github/workflows/deploy-pages.yml`），推送 `main` 分支即可自动部署到 GitHub Pages，无需手动操作。

- **线上地址**：https://first-emperor-of-qin.github.io/fps-web-arena/
- **触发条件**：修改 `index.html` 或 `assets/**` 并推送到 `main` 分支
- **手动触发**：仓库 `Actions` 页面 → `Deploy to GitHub Pages` → `Run workflow`

> 说明：GitHub Pages 免费版要求仓库为**公开（public）**状态。如需自定义域名，在仓库根目录添加 `CNAME` 文件（内容为你的域名），并在域名服务商处添加 CNAME 解析指向 `first-emperor-of-qin.github.io`，随后在仓库 `Settings → Pages` 中开启 `Enforce HTTPS` 即可。

---

## 🎯 游戏特性

- **20 个精心设计的关卡**：从城市废墟到赛博空间
- **33 种武器系统**：手枪、步枪、狙击枪、能量武器等
- **4 个章节剧情**：完整的赛博朋克故事线
- **多种敌人类型**：智能 AI，不同战斗风格
- **Boss 战**：每章结尾的史诗级 Boss 对决
- **武器升级系统**：解锁和强化你的装备
- **成就系统**：挑战自我，解锁全部成就

---

## 🎛️ 操作说明

### 键盘控制

| 按键 | 功能 |
|------|------|
| W/A/S/D | 移动 |
| 鼠标 | 瞄准/视角 |
| 左键 | 射击 |
| 右键 | 瞄准镜 |
| R | 换弹 |
| 1-9 | 切换武器 |
| Shift | 冲刺 |
| Ctrl | 蹲下 |
| Space | 跳跃 |
| E | 互动 |
| Tab | 任务/得分 |
| Esc | 暂停菜单 |

### 移动端控制

- 左侧虚拟摇杆：移动
- 右侧滑动区域：视角
- 射击按钮：开火
- 其他功能按钮：换弹、切换武器等

---

## 📁 项目结构

```
fps-web-arena/
├── index.html                      # 主游戏文件（包含所有 HTML/CSS/JS）
├── .github/
│   └── workflows/
│       └── deploy-pages.yml        # GitHub Pages 自动部署工作流
├── .nojekyll                       # 禁用 Jekyll 处理，以静态文件原样托管
├── wrangler.jsonc                  # Cloudflare Workers 配置
├── .gitignore                      # Git 忽略配置
└── README.md                       # 本文件
```

---

## 🛠️ 技术栈

- **HTML5 Canvas / WebGL**：渲染引擎
- **原生 JavaScript (ES6+)**：游戏逻辑
- **CSS3**：赛博朋克风格 UI
- **Google Fonts**：Orbitron, Rajdhani, JetBrains Mono
- **Cloudflare Pages**：静态资源托管与 CDN

---

## ⚙️ 开发配置

### Wrangler 配置说明

`wrangler.jsonc` 配置文件已设置：

```jsonc
{
  "name": "fps-web-arena",
  "compatibility_date": "2026-07-08",
  "assets": {
    "directory": "."
  },
  "compatibility_flags": ["nodejs_compat"]
}
```

---

## 📝 更新日志

### v5.0 (CYBERPUNK+ EDITION)
- [重构] UI 系统全面升级
- [新增] 玻璃拟态视觉效果
- [新增] HDR 高对比度模式
- [新增] 动态光效系统
- [优化] 字体渲染 (Orbitron)
- [修复] 移动端适配问题

### v4.x 及更早版本
- 基础游戏框架
- 关卡与武器系统
- AI 敌人系统

---

## 📄 许可证

© 2025 COMBAT STRIKE. All Rights Reserved.

---

## 🙏 致谢

感谢所有为开源社区做出贡献的开发者！

---

<div align="center">

**准备好进入赛博战场了吗？**

🔫 **现在就开始游戏！** 🔫

</div>
