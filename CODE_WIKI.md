# Code Wiki · 枪战突击 COMBAT STRIKE v5.0

> 单 HTML 文件实现的浏览器第一人称射击游戏（FPS）。基于 Three.js，零后端、零本地依赖（仅 CDN 加载 Three.js），可直接部署到 Cloudflare Pages。
>
> 仓库根目录文件：`index.html`（约 32627 行，单文件承载全部 HTML/CSS/JS）、`README.md`、`wrangler.jsonc`、`.gitignore`。

---

## 目录

1. [项目概览](#1-项目概览)
2. [项目结构](#2-项目结构)
3. [技术架构总览](#3-技术架构总览)
4. [启动流程](#4-启动流程)
5. [CSS 设计系统](#5-css-设计系统)
6. [HTML UI 结构](#6-html-ui-结构)
7. [数据与常量层](#7-数据与常量层)
8. [渲染系统](#8-渲染系统)
9. [武器系统](#9-武器系统)
10. [战斗与伤害计算](#10-战斗与伤害计算)
11. [敌人系统](#11-敌人系统)
12. [波次与关卡系统](#12-波次与关卡系统)
13. [物品拾取系统](#13-物品拾取系统)
14. [音频系统](#14-音频系统)
15. [存档与持久化](#15-存档与持久化)
16. [输入系统](#16-输入系统)
17. [游戏流程与模式](#17-游戏流程与模式)
18. [元进度系统](#18-元进度系统)
19. [关键函数索引](#19-关键函数索引)
20. [已知技术债务](#20-已知技术债务)

---

## 1. 项目概览

| 项 | 值 |
|---|---|
| 项目名 | 枪战突击 · COMBAT STRIKE |
| 版本 | v5.0（赛博朋克 Premium Edition） |
| 类型 | 浏览器 FPS 单文件游戏 |
| 技术栈 | 原生 HTML/CSS/JS + Three.js 0.152.0（CDN） |
| 渲染 | WebGL（Three.js），Web Audio API（程序合成音效/BGM） |
| 部署 | Cloudflare Pages（静态资源，见 `wrangler.jsonc`） |
| 总关卡 | 20 关（4 章节 × 5 关） |
| 武器数 | 19 件（4 品质档位：默认 / 英雄级 / 传说级 / 神级） |
| 游戏模式 | 战役（Campaign）/ 无尽（Endless）/ Boss Rush |
| 难度 | 6 档：普通×1 / 困难×10 / 噩梦×100 / 地狱×1000 / 专家×1万 / 永恒×10万 |
| 存档 | `localStorage` 键 `cs_save_v2` |

**核心特征：** 数据单一真相源（武器属性、Boss 血量统一从常量动态渲染到图鉴/商城/仓库三面板）；程序合成 BGM（无外部音频文件）；动态画质降级（FPS 监视器自动切换阴影/像素比）。

---

## 2. 项目结构

```
/workspace/
├── index.html              # 全部游戏代码（HTML + CSS + JS，约 32627 行）
├── README.md               # 一行说明
├── wrangler.jsonc          # Cloudflare Pages 部署配置
├── .gitignore              # 忽略 node_modules / .wrangler / .dev.vars
└── .trae/specs/
    └── revamp-ui-audio-weapon-balance/
        ├── spec.md         # v5.0 升级规格（UI/音频/武器平衡）
        ├── checklist.md    # 验收清单
        └── tasks.md        # 任务分解与依赖
```

### index.html 内部分区（按行号）

| 行范围 | 内容 |
|---|---|
| 1–11 | `<head>`：meta、字体（Orbitron/Rajdhani/JetBrains Mono CDN） |
| 12–1727 | `<style>`：CSS 设计系统 |
| 1729–2461 | `<body>`：所有 UI 界面与 HUD |
| 2462–3554 | 第 1 个 `<script>`：图鉴/商城数据与渲染（不依赖 Three.js，首页按钮前置可用） |
| 3556 | Three.js CDN 引入 |
| 3559–3599 | 第 2 个 `<script>`：小型补丁脚本 |
| 3601–32625 | 第 3 个 `<script>`：主游戏逻辑（`initAll()` 闭包，约 29000 行） |
| 32626–32627 | `</body></html>` |

---

## 3. 技术架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    index.html (单文件)                       │
├──────────────┬──────────────────────────────────────────────┤
│  <style>     │  v4 原始层 + Premium 层（双层叠加）           │
│ (12–1727)    │  :root 变量 → .btn / .modal / .hud-indicator │
├──────────────┼──────────────────────────────────────────────┤
│  <body> UI   │  开始界面 / 模态弹窗 / HUD / 商城 / 图鉴      │
│ (1729–2461)  │  所有界面 ID 集中于此                        │
├──────────────┼──────────────────────────────────────────────┤
│  Script 1    │  图鉴/商城渲染 + 跨会话定时器 + 中文数字格式  │
│ (2462–3554)  │  数据表：__BOSS_HP_TABLE__                   │
├──────────────┼──────────────────────────────────────────────┤
│  Script 3    │  initAll() 闭包                             │
│ (3601–32625) │  ├─ 常量/数据（武器表、难度、玩家属性）       │
│              │  ├─ 存档系统（buildSaveObject/saveGameState） │
│              │  ├─ 武器系统（射击/换弹/技能/模型）          │
│              │  ├─ 敌人系统（80+ 类型、20 Boss）            │
│              │  ├─ 渲染（initScene/buildChapterRoom/animate）│
│              │  ├─ 音频（initAudio/playBGM/SFX）            │
│              │  ├─ 输入（键鼠/手柄/触控 + 按键重绑）        │
│              │  └─ 游戏流程（startLevel/重启/回家）         │
└──────────────┴──────────────────────────────────────────────┘
```

**数据流核心原则：** `window.__BOSS_HP_TABLE__`（Script 1，第 2469 行）是 Boss 血量的唯一真相源，图鉴（经 `baseHP` 引用）与主游戏（经 `BOSS_HP_TABLE` 引用，第 5824 行）共用。`WEAPON_DISPLAY_DATA` + `WEAPON_FULL_DESC` + `getWeaponBaseDmg`（均暴露到 `window`，第 4076–4078 行）是武器属性的单一真相源，图鉴与商城均从中动态渲染，确保三面板永不漂移。

---

## 4. 启动流程

```
浏览器加载 index.html
  │
  ├─ Script 1 执行（2462）：注册全局定时器工具、formatCN、build*Codex/buildShop
  │    └─ registerStartScreenButtons()：首页按钮可立即点击（不依赖 Three.js）
  │
  ├─ Script 2 执行（3559）：补丁
  │
  └─ Script 3 执行（3601）：
       └─ waitForThreeJS(cb)（3602）：轮询 THREE（100ms × 100 次超时）
            └─ initAll()（3620）：主闭包
                 ├─ 从 cs_save_v2 加载存档（金币/武器/天赋/设置/按键）
                 ├─ initScene()（6863）：创建场景/相机/渲染器 + buildRoom + createGun
                 ├─ initInputHandlers()（23656）：绑定键鼠/手柄/触控/全屏
                 └─ animate()（31580）：requestAnimationFrame 主循环
```

主循环 `animate()`（第 31580 行）每帧：计算 delta → FPS 计数与动态降级 → 仅在 `gameStarted && !isDead && !levelComplete && !isPanelOpen && !isPaused` 时执行游戏逻辑（移动/射击/敌人/投射物/波次）→ `renderer.render()`（第 32443 行）。

---

## 5. CSS 设计系统

`<style>` 块（第 12–1727 行）采用**双层叠加**策略。

### 5.1 v4 原始层（第 20–912 行）

负责布局、定位、尺寸与基础视觉。按组件分块：

| 行范围 | 组件 |
|---|---|
| 20–241 | `#start-screen` + 动画背景（六边形网格、扫描线、能量环、33 个余烬粒子） |
| 242–277 | 主角状态面板（血/护盾/能量/魂力/氧气条） |
| 278–303 | 分数/金币面板 |
| 304–315 | 弹药显示 |
| 316–435 | 技能图标槽 |
| 436–638 | Boss 血条（含双 Boss 镜像、`.hp-high/mid/low` 色阶） |
| 663–695 | 全武器技能显示面板 |
| 696–857 | Q 键个人面板（属性/仓库/天赋/成就/统计标签页） |
| 858–910 | 关卡加载界面 |

同时覆盖：准星、暂停菜单、死亡/胜利界面、全屏特效覆盖层（灼烧/毒/冰/沙/酸/无敌等）、关卡卡片、难度按钮、`.modal-overlay`/`.modal-box`、商城卡片。

### 5.2 Premium 层（第 914–1725 行）

v5 "CYBERPUNK+ EDITION" 重写，通过 `!important` 叠加覆盖（刻意保留 v4 的 `position`/`overflow`，见 `[Bugfix]` 注释）。

#### `:root` 变量（第 926–963 行）

- **背景/前景**：`--cy-bg-deep` `#03060d`、`--cy-bg-mid`、`--cy-bg-card`、`--cy-bg-elev`、`--cy-fg-primary/secondary`
- **强调色（5）**：`--cy-accent-cyan` `#00e5ff`、`--cy-accent-red` `#ff1744`、`--cy-accent-gold` `#ffd740`、`--cy-accent-purple` `#e040fb`、`--cy-accent-green` `#69f0ae`
- **语义别名**（Task 10.1 新增，归一散落裸色值）：`--cy-gold/red/green/purple/blue` + 各自 `-soft`
- **发光/阴影**：`--cy-glow-cyan/red/gold`、`--cy-shadow-deep`
- **字体（3）**：`--cy-font-display`（Orbitron）、`--cy-font-body`（Rajdhani）、`--cy-font-mono`（JetBrains Mono）
- **圆角/过渡/间距**：`--cy-radius` `10px`、`--cy-radius-sm` `6px`、`--cy-transition`、`--hud-gap` `16px`

#### 通用基类（第 966–1001 行）

- **`.btn` 体系**：基类 + 5 modifier（`--primary`/`--gold`/`--danger`/`--ghost`/`--sm`），玻璃拟态背景 + shimmer 扫光 + hover 上浮
- **`.hud-indicator`**：HUD 指示器基类（绝对定位 + 玻璃背景 + 模糊）
- **`#health-bar-inner.hp-low/mid/high`**：血条状态色阶（id 作用域，避免与 Boss `.hp-*` 冲突）

#### 组件重塑（第 1003–1671 行）

涵盖：全局电影感氛围、开始界面、模态弹窗、HUD 全部血条/弹药/分数/波次、武器槽、技能槽、准星、Boss 血条、暂停菜单、关卡卡片、难度按钮、加载界面、死亡/胜利界面、击杀提示、连杀计数、个人面板、商城、武器网格、伤害统计、FPS 计数器。

#### 全局工具与响应式（第 1641–1725 行）

- 滚动条美化、`::selection` 青色高亮
- `@media (prefers-reduced-motion)` 关闭动画
- `@media (max-width: 768px)` 开始界面单列布局
- 移动端触控覆盖层 `#touch-overlay`（第 1673–1725 行，`.touch-active` 显示）

---

## 6. HTML UI 结构

### 6.1 主要界面（按 DOM 顺序）

| ID | 行号 | 用途 |
|---|---|---|
| `#start-screen` | 1731 | 开始界面：标题 + 10 个入口按钮（关卡/无尽/Boss Rush/指南/图鉴/商城/装备/面板/活动/设置） |
| `#loading-screen` | 1773 | 关卡加载：粒子 + 进度条 + 提示 |
| `#guide-modal` | 1793 | 游戏指南（操作/设定/武器/关卡/更新日志） |
| `#levelselect-modal` | 1889 | 关卡选择（分页 4 章 × 5 卡） |
| `#difficulty-select-modal` | 1909 | 难度选择（6 个 `.diff-btn`） |
| `#settings-modal` | 1950 | 设置：存档管理/音量/显示/按键/手柄/操作速查 |
| `#touch-overlay` | 2069 | 移动端虚拟摇杆 + 6 按钮 |
| `#monster-codex-modal` | 2082 | 怪物图鉴（JS 填充） |
| `#equip-codex-modal` | 2092 | 装备图鉴（JS 填充） |
| `#fps-counter` | 2101 | FPS 计数 |
| `#hud` | 2102 | 游戏内 HUD 容器 |
| `#player-panel` | 2301 | Q 键个人面板（属性 + 5 标签页） |
| `#activity-modal` | 2378 | 活动中心（内测福利） |
| `#buy-confirm` / `#trade-success` | 2404 / 2415 | 购买确认 / 购买成功（独立于面板以避 z-index） |
| `#shop-modal` | 2421 | 商城（960px，筛选器 + 动态商品列表） |
| `#skip-wave-modal` | 2451 | M 键跳过 Boss 确认 |

### 6.2 HUD 内部结构（`#hud`，第 2102–2216 行）

- **状态条**：`#health-row` / `#shield-row` / `#energy-row` / `#soulpower-row`（隐藏）/ `#oxygen-row`（隐藏）
- **状态指示**：`#heat-warning`、`#time-effect-indicator`、`#time-shield-indicator`（均 `.hud-indicator`）
- **武器槽**：`#weapon-slot-1…5`（槽 1 默认 `.active`）
- **Boss 血条**：`#boss-bar-container` + `#boss2-bar-container`（双 Boss 镜像，含 25/50/75% 分割线）
- **资源面板**：`#score-display`、`#gold-display`、`#wave-display`、`#difficulty-display`
- **弹药**：`#ammo-display` + `#ammo-pack-hint`
- **武器专属指示**：`#moonbow-charge-bar`、`#dawnlight-power`、`#parasite-cannon-indicator`
- **技能槽**：`#skill-e`（闪电链）、`#skill-x`（雷霆万钧）、`#skill-storm`（锁敌风暴）
- **其他**：`#damage-stat-panel`、`#kill-feed`、`#streak-counter`、`#weapon-skills-panel`

### 6.3 弹出层与特效（`#hud` 兄弟节点，第 2218–2297 行）

- **弹出**：`#streak-popup`、`#headshot-popup`、`#true-dmg-popup`、`#crosshair`
- **全屏特效**：`#damage-overlay`、`#low-health-overlay`、`#heal-overlay`、`#burn-overlay`、`#stun-flash`、`#poison-overlay`、`#sand-overlay`、`#frost-overlay`、`#acid-overlay`、`#invincible-overlay`、`#tumo-shield-indicator`、`#invincible-bar-container`、`#pocket-dim-overlay`、`#flight-height-indicator`
- **电影式公告**：`#boss-warning`、`#boss-kill-flash`、`#wave-announce`、`#pause-hint`、`#pause-menu`
- **结束界面**：`#death-screen`（含复活币）、`#victory-screen`（含自动下一关倒计时）

### 6.4 模态约定

所有模态遵循 `.modal-overlay` > `.modal-box` > `.modal-close[data-close="<id>"]`。例外：`#shop-modal`（自定义 `.modal-box` 变体）、`#player-panel`（独立样式）、`#buy-confirm`/`#trade-success`/`#skip-wave-modal`（独立以避 z-index 堆叠）。

---

## 7. 数据与常量层

### 7.1 Script 1 全局工具（第 2462–3554 行）

| 符号 | 行 | 用途 |
|---|---|---|
| `window.__BOSS_HP_TABLE__` | 2469 | Boss 血量单一真相源（21 元素数组，索引 0 占位，1–20 对应关卡）。普通关 ×1.5 递增，章节 Boss 关（5/10/15/20）为前一关 4× |
| `window._activeTimers` | 2472 | 跨会话定时器注册表（Set） |
| `regTimeout` / `regInterval` | 2473 / 2478 | 包装 setTimeout/setInterval，自动注册 ID |
| `clearAllTimers` | 2483 | 清理所有定时器（restartGame/goToHomeScreen 调用） |
| `formatCN(n)` | 2487 | 中文数量级格式化（万/亿/兆/京/垓...极，10^4–10^48） |
| `buildMonsterCodex()` | 2510 | 渲染怪物图鉴，数据含 `levelNames`（61 关名）+ `levelMinions`（每关小怪表） |
| `buildEquipCodex()` | 2898 | 渲染装备图鉴，动态读 `WEAPON_DISPLAY_DATA` + `getWeaponBaseDmg`（无硬编码） |
| `buildShop()` | 2950 | 渲染商城，5 槽位分组（主武器/副武器/近战/手雷/战术），过滤默认装备 |
| `registerStartScreenButtons()` | 3040 | 首页按钮绑定（Three.js 加载前可用） |

### 7.2 武器数据表（主脚本内，暴露到 window）

| 表 | 行 | 暴露 | Schema |
|---|---|---|---|
| `WEAPON_DISPLAY_DATA` | 3988–4008 | window（4076） | `{name, icon, quality, qualityLabel, category, baseDmg(string), fireRate(string), magazine(string), activeSkill, passiveSkill, slot, slotType}`。quality ∈ heroic/legendary/divine |
| `WEAPON_FULL_DESC` | 4014–4034 | window（4077） | `{tagline, typeLabel, bonus, passives:[], actives:[], price, isDefault?}`。4 件默认武器带 `isDefault:true` |
| `WEAPON_CATALOG` | 4040–4060 | 否（内部） | 惰性 getter 引用实时伤害常量；多组件武器含额外 getter（thunderblade 的 baseDmgLight/Heavy 等） |

> **注意**：`WEAPON_SKILL_DESC` 在文件中**不存在**，技能描述内嵌于 `WEAPON_FULL_DESC.passives`/`actives` 数组。

**19 件武器键**：`thunder, tumo, dragonlyknight, dawnlight, zeushand, phasewalker, parasite, shadow, metalstorm, whitenight, moonbow, thunderblade, hellscythe, thousandumbrella, normalgrenade, deathlight, froststar, tanglotus, datacube`

### 7.3 难度系统（`DIFFICULTY_CONFIG`，第 3631 行）

| 键 | 标签 | 倍率 | 颜色 |
|---|---|---|---|
| normal | 普通 | ×1 | `#4caf50` |
| hard | 困难 | ×10 | `#ff9800` |
| nightmare | 噩梦 | ×100 | `#f44336` |
| hell | 地狱 | ×1000 | `#9c27b0` |
| expert | 专家 | ×10000 | `#e040fb` |
| eternal | 永恒 | ×100000 | `#ffd740` |

辅助函数：`getDiffMultiplier()`、`getDiffHP(baseHP)`、`getDiffDmg(baseDmg)`、`getBossHP(level)`（第 3642–3645 行）。无尽与 Boss Rush 模式强制 `normal`。

### 7.4 玩家属性常量（第 3622–3720 行）

| 常量 | 值 | 说明 |
|---|---|---|
| `BASE_MOVE_SPEED` | 10 | 基础移速 |
| `playerHeight` | 1.7 | 摄像机高度 |
| `gravity` | -20 | 重力 |
| `PLAYER_MAX_HP` | 10000 | 基础生命 |
| `PLAYER_MAX_SHIELD` | = HP | 护盾上限 = 生命上限 |
| `HP_REGEN_RATE` | 10/s | 生命回复 |
| `SHIELD_REGEN_RATE` | 10/s | 护盾回复 |
| `SHIELD_REGEN_DELAY` | 5s | 脱战回复延迟 |
| `PLAYER_MAX_ENERGY` | 100 | 基础能量 |
| `ENERGY_REGEN_RATE` | 1/s | 能量回复 |
| `ammoMagSize` | 150 | 默认弹夹 |
| `reloadTime` | 1.8s | 换弹时间 |
| `BULLET_DAMAGE` | 100 | 旧默认子弹伤害 |
| `HEADSHOT_MULTIPLIER` | 2.0 | 爆头倍率 |
| `CRIT_CHANCE` | 0.01 | 基础暴击 1% |
| `MAX_LEVEL` | 20 | 总关卡 |
| `WEAPON_UPGRADE_MAX_LEVEL` | 10 | 武器等级上限 |

有效值变体 `PLAYER_MAX_HP/SHIELD/ENERGY_EFFECTIVE`（第 4128–4130 行）由 `recalcWeaponBonuses()` 在装备变更时重算（含天赋百分比加成）。

### 7.5 武器射速常量

> **单位警告**：除 `MOONBOW_*` 外，所有 `*_FIRE_RATE` 常量单位是**秒/发**（值越小越快）；`MOONBOW_MIN/MAX_FIRE_RATE` 单位是**发/秒**（值越大越快）。

| 常量 | 行 | 值 | 武器 | 发/秒 |
|---|---|---|---|---|
| `shootInterval` | 3716 | 0.10 | thunder 突击步枪 | 10 |
| `SECONDARY_FIRE_RATE` | 4946 | 0.08 | shadow 双枪 | 12.5 |
| `METALSTORM_FIRE_RATE` | 4200 | 0.0769 | metalstorm | ~13 |
| `WHITENIGHT_FIRE_RATE` | 4211 | 0.1429 | whitenight | 7 |
| `DRAGON_KNIGHT_FIRE_RATE` | 4267 | 0.0833 | dragonlyknight AK47 | 12 |
| `DAWNLIGHT_FIRE_RATE` | 4294 | 0.1 | dawnlight 激光 | 10 |
| `ZEUS_HAND_FIRE_RATE` | 4339 | 0.125 | zeushand | 8 |
| `PHASE_WALKER_FIRE_RATE` | 4345 | 0.0625 | phasewalker | 16 |
| `TUMO_FIRE_RATE` | 4242 | 0.25 | tumo 狙击 | 4 |
| `PARASITE_FIRE_RATE` | 4318 | 0.25 | parasite 狙击 | 4 |
| `MOONBOW_MIN/MAX_FIRE_RATE` | 4410/4411 | 8 / 8 | moonbow 神弓 | 8（固定，蓄力机制已废） |
| `UMBRELLA_ATTACK_CD` | 5007 | 0.4 | thousandumbrella | 2.5 |
| `MELEE_LIGHT_CD` | 4962 | 0.4 | thunderblade 轻击 | 2.5 |
| `MELEE_HEAVY_CD` | 4965 | 0.8 | thunderblade 重击 | 1.25 |
| `GRENADE_THROW_CD` | 5652 | 2.0 | 手雷 | 0.5/s |

### 7.6 伤害平衡推导

`deriveBaseDmg(qualityTargetDPS, fireRate, mechanicMod)`（第 5036 行）：

```
baseDmg = qualityTargetDPS / fireRate × mechanicMod
```

- `QUALITY_DPS_TARGET`（第 5032 行）：heroic 100 / legendary 300 / divine 800
- `MECHANIC_MOD`（第 5034 行）：sustained 0.85 / burst 1.3 / aoe 1.2 / tracking 1.15 / default 1.0

`getWeaponBaseDmg(key)`（第 4063 行）返回**展示字符串**（非数字），对多组件武器特殊格式化（thunderblade "轻击X/重击Y"、normalgrenade "X(爆炸)+DPS Y(灼烧3s)" 等）。

### 7.7 关卡波次结构（`LEVEL_WAVE_COUNTS`，第 5800 行）

| 关卡 | 波次数组 | 模式 |
|---|---|---|
| 1–4, 6–9, 11–14, 16–19 | `[50, 100, 0]` | 3 波：50 小怪 → 100 小怪 → Boss（0 = 纯 Boss） |
| 5, 10, 15, 20 | `[0]` | 章节 Boss：1 波纯 Boss 战 |

---

## 8. 渲染系统

### 8.1 场景初始化（`initScene`，第 6863 行）

- `scene`：背景 `0x87CEEB`，雾 40–80
- `PerspectiveCamera`：75° 视角，近 0.1 / 远 500，初始 `(0, 1.7, 20)`
- `WebGLRenderer`：抗锯齿，`powerPreference:'high-performance'`，像素比上限 `MAX_PIXEL_RATIO=1.5`
- 阴影 `PCFShadowMap`，`ACESFilmicToneMapping`，曝光 1.2
- 灯光：半球光 + 环境光 + 主平行光（512² 阴影贴图，±60 视锥）+ 冷色补光
- 调用 `buildRoom()`、`createGun()`、各武器模型构建、`createInitialAmmoPacks/HealthPacks`

### 8.2 动态画质（`applyQualityLevel`，第 6897 行）

- `level===0`（低）：关阴影、像素比 1.0、`POINT_LIGHT_BUDGET=8`
- `level===1`（高）：开阴影、恢复像素比、`POINT_LIGHT_BUDGET=40`
- 由 `animate()` FPS 监视器驱动（3 秒 <40 FPS → 降级，5 秒 ≥55 FPS → 升级），`_appliedQuality` 守卫去重
- `enforcePointLightBudget`（第 6912 行）每 0.5 秒审计点光源，移除超额旧灯

### 8.3 关卡房间构建

**活动路径**（`startLevel` 唯一调用）：
- `CHAPTER_CONFIGS`（第 7027 行）：4 主题 — 余烬荒原（暖橙）/深渊裂谷（暗红熔岩）/霜寂冰原（冷蓝）/虚空核心（紫）
- `LEVEL_VARIANTS`（第 7084 行）：20 条目，每条映射章节 + `coverPattern`（散布/环形/走廊/迷宫/竞技场）+ `decoDensity` + `isBossLevel`
- `buildChapterRoom(chapterConfig, levelVariant)`（第 7113 行）：构建地板/墙/灯光 + 装饰器（`_decorateWasteland/Volcanic/Glacier/Void`）+ `_placeCoverPattern`

**死代码**：第 8244–11207 行约 60 个 `build*Room` 函数（森林/沙漠/深海/虚空等旧 60 关设计遗留），均未被 `startLevel` 调用，仅前 3 个使用共享辅助函数。

### 8.4 武器视图模型

- `createGun()`（第 6990 行）：构建 thunder 突击步枪视图模型（BoxGeometry 拼装），附加到摄像机 `(0.28, -0.24, -0.45)`，异步尝试 GLTF 升级
- GLTF 加载器 `loadWeaponGltf`（第 5198 行）：三级短路（失败缓存 → 命中克隆 → 队列）。CDN 上无武器 GLTF，实际走 `_applyQualityStyleToProcedural`（程序化模型 + 品质发光环/光环/点光源）
- `_createSimpleWeaponModel`（第 5395 行）：最后保底生成器

### 8.5 清理（`clearSceneForLevel`，第 7611 行）

销毁所有敌人（血条精灵、状态指示器、网格几何体）、投射物、特效、障碍物/墙、补给包，遍历 `scene.children` 移除非 camera 节点，处理共享几何体缓存，重置 `boss=null`。由 `startLevel` 和 `goToHomeScreen` 调用。

---

## 9. 武器系统

### 9.1 武器数据与加成

- `WEAPON_STATS`（第 3936 行）：每武器权威属性表（HP/护盾/魂力/移速/能量/暴击/再生加成）
- `WEAPON_WEIGHTS`（第 3965 行）：后坐力重量表，1.5（轻）到 12（重）
- `equippedWeaponBonuses`（第 4081 行）：5 槽位聚合加成对象
- `recalcWeaponBonuses()`（第 4093 行）：重算聚合加成 + 有效上限；游戏内切换裁剪当前值（防刷血），游戏外刷新满值

### 9.2 武器养成（P2 元进度，第 5473–5499 行）

| 函数 | 公式 |
|---|---|
| `getWeaponLevel(wId)` | `weaponLevel[wId] \|\| 1` |
| `getWeaponDamageMult` | `1 + 0.05 × (lv-1)`（每级 +5%） |
| `getWeaponCritBonus` | `0.01 × (lv-1)`（每级 +1%） |
| `getWeaponReloadMult` | `max(0.5, 1 - 0.03 × (lv-1))`（每级 -3%，上限 -50%） |
| `getWeaponXpForNextLevel` | `100 × level` |
| `grantWeaponXP(wId, isBoss)` | +10 小怪 / +50 Boss，支持多级连升，满级清零，自动保存 |

### 9.3 射击分发

武器键路由用 **`if/else if` 链**（文件中无 `switch`）。

- `switchWeapon(slot)`（第 27513 行）：换槽，隐藏所有武器组，切换时取消狙击镜/炮模式、取消装填
- `handlePrimaryFire()`（第 27932 行）：左键路由 — 空槽→近战；槽1→tumo/dragon/dawnlight/zeus/phase/parasite 各自射击 或 thunder `shoot()`；槽2→metalstorm/whitenight/moonbow 或 shadow；槽3→umbrella 或 轻击；槽4→投雷
- `handleSecondaryFire()`（第 27971 行）：右键路由 — 寄生者炮模式切换、枪托近战、扇火、白夜领域、地狱魔镰狂风、伞龙卷、重击

### 9.4 各武器射击函数

| 武器 | 函数 | 行 | 特性 |
|---|---|---|---|
| thunder | `shoot()` | 21664 | 射线检测，技能X 光束/技能E 闪电链覆盖，自动装填 |
| thunder 光束 | `fireThunderBeam()` | 21796 | 穿透光束（非最近命中） |
| thunder 闪电链 | `chainLightning()` | 7418 | 跳跃多次，10%/跳，跳过 Boss 护盾 |
| tumo 狙击 | `tumoShoot()` | 28005 | 无限弹药，重后坐力，固定微小散射 |
| dragonlyknight AK47 | `dragonKnightShoot()` | 26328 | 血怒 ×(1+缺失血量%)，龙怒 ×2 |
| dawnlight 激光 | `dawnlightShoot()` | 25659 | 连续激光，伤害 ×(1+层数×0.3)，解放 ×2 + 范围 |
| zeushand 能量球 | `zeusHandShoot()` | 25219 | 投射雷球 + PointLight |
| phasewalker 相位 | `phaseWalkerShoot()` | 24960 | 信标敌人 100% 爆头 |
| parasite 寄生 | `parasiteShoot()` | 25881 | 炮模式（右键切换）耗能 + 准星附近范围爆炸 |
| shadow 双枪 | `secondaryShoot()` | 28404 | 副武器通用射击 |
| metalstorm | `metalStormShoot()` | 28471 | 交替手枪踢枪动画 |
| whitenight 铳刃 | `whiteNightShoot()` | 24328 | 右键 `whiteNightSkillActivate()` 白夜领域 |
| moonbow 神弓 | `moonbowShoot()` | 4422 | 50% 减速 + 10% 冰冻，射速递增（实际固定 8） |
| thunderblade 战刃 | `meleeLightAttack()` | 28579 | 普通近战 |
| hellscythe 魔镰 | + `hellScytheWindAttack()` | 28715 | 右键狂风技能 |
| thousandumbrella 伞 | `umbrellaAttack()` | 27087 | 3 形态（刃/盾/羽），盾 80% 格挡 + 反伤 |
| 手雷系 | `throwGrenade()` | 29024 | 委托 `throwGrenadeOriginal()`（31432），`detonateGrenade()`（29054）按类型分发 |

### 9.5 后坐力（`applyWeaponRecoil`，第 6429 行）

基于 `getWeaponWeight`：踢枪位移 Z = `0.012 + weight×0.006`，旋转 X = `0.015 + weight×0.008`，恢复速率 `8.0/√weight`。**仅移动枪模型，绝不触碰摄像机旋转**（防晕动症）。`updateViewRecoil`（第 6450 行）指数衰减。

### 9.6 手雷物理与爆炸

- `updateThrownGrenades(delta)`（第 29028 行）：重力 9.8，地面反弹（0.3 弹性），0.3 秒引信或 2.5 秒计时
- `detonateGrenade()`（第 29054 行）：默认 6 米半径 + 距离衰减 + 3 秒燃烧（`GRENADE_BURN_BASE_DPS`），按 `isDeathlight/isFrostStar/isTangLotus` 分发特殊爆炸

---

## 10. 战斗与伤害计算

### 10.1 伤害管道

`calcDamage(baseDmg, weaponKey)`（第 5446 行）：

```
伤害 = round(有效魂力 × baseDmg)
       × 武器伤害倍率(1 + 0.05×(lv-1))
       × talentBonuses.damageMult
       × (1 + 魔方增幅/100)
```

- `getEffectiveSoulPower()`（第 4142 行）：基础 + 装备加成
- `getEffectiveCritChance()`（第 4146 行）：CRIT_CHANCE + 装备 + 武器等级 + 天赋
- `getDamageAmplify()`（第 5424 行）：仅装备 datacube 战术武器时返回 `cubeAmplifyPercent`
- `updateCubeAmplify(delta)`（第 5436 行）：每秒 +1%，上限 100%

### 10.2 命中反馈

- `triggerHitFeedback(enemy, isCrit)`（第 6467 行）：hit-stop（暴击 0.08s / 普通 0.04s）+ 挤压拉伸（暴击 0.12 / 普通 0.06，已下调防变形）
- `updateEnemyHitDeform(delta)`（第 6495 行）：ease-out 回复原缩放

### 10.3 爆头判定

`HEAD_Y_BOSS` / `HEAD_Y_NORMAL`（Y 阈值）+ `HEADSHOT_MULTIPLIER`（2.0×）。

### 10.4 敌人碰撞

`resolveEnemyCollisions()`（第 6528 行）：XZ 平面 AABB，Boss 半径 2.0 / 普通 0.65，选最小重叠轴。规则：双 Boss 不动；一 Boss 一普通 → 普通全推；双普通各推一半。

### 10.5 击杀处理

`killEnemy(enemy, isMelee)`（第 22736 行）：按类型分支特殊死亡效果（虚空行者留裂缝、熔岩留残渣、时间炸弹 3 秒爆炸等）→ 更新连杀/分数/波次计数 → `grantWeaponXP` 给当前武器。

---

## 11. 敌人系统

### 11.1 敌人创建

- `finalizeEnemy(group, cfg)`（第 11278 行）：共享收尾 — 8 方向边缘生成（避障，最多 30 次，半径 22），构建标准敌人对象，附加血条精灵
- `createEnemy()`（第 11310 行）：守卫（停止生成/配额/上限）。第 11315–11423 行按 `currentLevel` 选 `enemyType`（约 80 种 A→CCCCCC），第 11430 行起按类型建模
- `createBoss()`（第 12848 行）：默认 Boss（军事基地守卫），紫色角恶魔，`getBossHP(currentLevel)`
- `BOSS_CREATORS` 注册表（第 31558 行）：20 个关卡 → 创建者函数（createPoseidon/createNIDHOGG/createAXIS 等，第 10/20 关为双 Boss）

### 11.2 敌人 AI（`updateEnemies`，第 15244 行）

逆序迭代，每敌人依次：

1. **朝向玩家**（`atan2(dx,dz)`）
2. **状态效果**（每个提前 continue）：眩晕 / 冰冻（结束时二段爆破）/ 混乱（旋转指示器）/ 混乱 AI（攻击其他非混乱敌人）
3. **持续伤害**：燃烧 / 撕裂（屠魔割裂，仅移动生效）/ 击退（带墙检）/ 滞空重力 / 减速
4. **C 型自爆**：3 秒引信 + 5 米爆炸 300 伤害
5. **标准追击**：`dist > attackRange` → 移动（减速乘数 + 障碍/边界裁剪 + 手臂摆动）
6. **标准攻击**：按类型分发（B 近战 / D 毒雾 / F 回旋飞叶 / G 火瓶 / J 冰锥 / M 远程射击 / O 锁定光束传送眩晕 等，第 15537–16402 行）

`enemyShoot()`（第 21081 行）共享远程射击；`updateEnemyBullets(delta)`（第 21092 行）处理所有投射物类型标志（火箭/宝珠/火球/毒液/穿透/回血/流血/能量吸取/根须/分裂矛等）。

### 11.3 Boss 机制

Boss AI 在 `updateEnemies` 内按 `boss.enemyType` 分支：
- **Chronos**：30% 血量触发幻影阶段生成 2 幻影，倒计时失败 2× 伤害
- **Lilith**（双 Boss 之一）：12 米外追击，火箭弹三连发 + 宝珠扇形散射
- 各 Boss 共用对象模式（第 12891 行）：`{mesh, health, maxHealth, isBoss:true, speed, shootInterval, state, attackRange, enemyType, damage, ...}`

### 11.4 血条系统

| 函数 | 行 | 用途 |
|---|---|---|
| `createHealthBarSprite(maxHp, isBoss)` | 6313 | 创建画布精灵血条（Boss 4.0×0.9 / 普通 2.5×0.56，renderOrder 999，depthTest false） |
| `_drawHealthBarCanvas(hbData)` | 6333 | 绘制背景/边框/渐变色（绿→橙→红）/HP 文字，≤30% 红光，仅百分比变化时标脏 |
| `updateHealthBarSprite` | 6383 | 设置目标百分比 |
| `updateHealthBarAnimations` | 6403 | ease-out 衰减动画 |
| `disposeHealthBarSprite` | 6423 | 释放纹理/材质 |
| `updateBossBar()` / `updateBoss2Bar()` | 21304 / 13299 | HUD Boss 血条 |

---

## 12. 波次与关卡系统

### 12.1 波次控制

| 函数 | 行 | 用途 |
|---|---|---|
| `getMinionBaseHP(level, wave)` | 5828 | 无尽：`BOSS_HP_TABLE[1]×0.04×1.15^(wave-1)`；战役：`BOSS_HP_TABLE[level]×(wave===2?0.08:0.04)` |
| `getTotalWaves()` | 5838 | `LEVEL_WAVE_COUNTS[currentLevel].length`（默认 3） |
| `updateWaveUI()` | 5844 | 三模式分支显示（无尽/Boss Rush/战役） |
| `showWaveAnnounce()` | 5882 | 3 秒 DOM 横幅 |
| `startNextWave()` | 5891 | 增 currentWave，最后一波纯 Boss，否则激活生成 |
| `checkWaveComplete()` | 5916 | 双重判断：计数器满足 或 无存活非 Boss，3 秒 delay 进下一波 |

### 12.2 三种游戏模式

- **战役**（默认）：1–20 关，每关 2 波小怪 + 1 波 Boss（章节 Boss 关纯 Boss）
- **无尽**（`startEndlessWave`，第 7880 行）：无限波次，每 5 波精英 Boss（×1.25 缩放），小怪波 `min(80, 20+wave×5)`
- **Boss Rush**（`bossRushSpawnCurrent`，第 7921 行）：按索引顺序挑战 20 个 Boss，计时记录

### 12.3 关卡跳过

`skipToBossWave()`（第 7960 行，仅战役）：清非 Boss 敌人，跳最后一波。`showSkipWavePrompt()`（第 7951 行）打开 `#skip-wave-modal`。

---

## 13. 物品拾取系统

### 13.1 弹药包

- `createInitialAmmoPacks()`（第 7447 行）：3 个固定点位
- `spawnAmmoPack(x, z)`（第 7451 行）：蓝色环 + 发光盒 + "H" 符号 + 点光源
- `updateAmmoPacks(delta)`（第 7468 行）：旋转漂浮，`AMMO_PACK_RADIUS` 内补满所有弹药类型，停用 + `AMMO_PACK_REFRESH` 计时器

### 13.2 生命包

- `createInitialHealthPacks()`（第 7497 行）：3 个固定点位
- `spawnHealthPack(x, z)`（第 7501 行）：绿色环 + 红盒 + 白十字
- `updateHealthPacks(delta)`（第 7519 行）：`HEALTH_PACK_RADIUS` 内治疗 `MAX_HP × HEALTH_PACK_HEAL_PERCENT`

### 13.3 能量包

- `spawnEnergyPack()`（第 7543 行）：36×36 随机点，紫色环 + 八面体 + 闪电符号
- `updateEnergyPacks(delta)`（第 7567 行）：`energyPackSpawnTimer` 倒计时，归零刷新 5 个，拾取恢复 `MAX_ENERGY × ENERGY_PACK_RECOVER_PERCENT`

---

## 14. 音频系统

全程序合成，Web Audio API，零外部音频文件。

### 14.1 节点与路由

- `initAudio()`（第 6592 行）：`stopBGM()` → 建 `AudioContext` → `masterGainNode → destination` → `musicGainNode → masterGainNode` → `applyMasterVolume()` → `playBGM()`
- `applyMasterVolume()`（第 6104 行）：
  - `masterGainNode.gain = sfxMuted ? 0 : masterVolume`
  - `musicGainNode.gain = musicMuted ? 0 : (masterVolume × musicVolume)`
  - 主音量统管两条支路
- `withAudioCtx(fn)`（第 6626 行）：try/catch + 空值包装器
- `getNoiseBuffer()`（第 6610 行）：噪声 AudioBuffer 缓存

### 14.2 SFX（第 6630–6855 行，全合成）

playShootSound（雷霆附加电弧音）、playReloadSound（4 阶段机械音）、playEnemyDeathSound、playHurtSound、playImpactSound、playMeleeSwingSound、playHealSound、playLightningSound、playAmmoPickupSound、playHealthPickupSound、playFlameJetSound、playBossDeathSound、playCritSound、playExplosionSound、playBeepSound、playUIClickSound、playFootstepSound（左右脚交替）。

### 14.3 BGM 程序合成（第 6652–6769 行）

- 128 BPM，4/4，64 步 4 小节循环，A 小调
- 25ms `setInterval` 调度器 + 0.2 秒前瞻
- `BGM_BASS_ROOTS`（第 6652 行）：`[A2, F2, C3, G2]` 每小节根音
- `BGM_LEAD_PATTERN`（第 6655 行）：12 个 `[step, freq, dur]` 三元组
- `_scheduleBGMStep(step, t, secPerBeat)`（第 6662 行）：三声部 — 底鼓（正弦 150→50Hz）/ 军鼓（带通噪声）/ 踩镲（高通 7000Hz）/ 贝斯（锯齿 + 低通 600Hz）/ 主音（方波 + 低通 3500Hz）
- `playBGM()`（第 6748 行）：启动调度器；`stopBGM()`（第 6766 行）：清 interval，已调度音符自然衰减

### 14.4 音乐控制

- `_setMusicMuted(m)`（第 3899 行）：切换 → `applyMasterVolume` → `stopBGM`/`playBGM` → `saveGameState`
- `_setMusicVolume(v)`（第 3907 行）：钳制 0–1 → `applyMasterVolume` → `saveGameState`
- 偏好持久化到 `cs_save_v2`

---

## 15. 存档与持久化

### 15.1 存档键与加载

键：`'cs_save_v2'`（localStorage）。在多处独立读取（第 3731/3761/3791/6054 行），每处窄提取自身字段 + 类型守卫，容忍旧存档迁移。

### 15.2 核心 API

| 函数 | 行 | 用途 |
|---|---|---|
| `buildSaveObject()` | 3828 | 返回标准存档对象，暴露 `window._buildSaveObject`（3855） |
| `saveGameState()` | 3856 | `localStorage.setItem('cs_save_v2', JSON.stringify(buildSaveObject()))`，暴露 `window._saveGameState` |
| `importSaveObject(parsed)` | 3866 | 验证 + `Object.assign` 合并（导入优先）+ 强制类型回退 + 写入 |

### 15.3 持久化内容

金币、ownedWeapons（15 武器）、5 装备槽、无尽最佳波次、Boss Rush 最佳时间、每武器 XP/等级（1–10）、解锁天赋、成就点、解锁成就、统计（总击杀/爆头/最高连击/总游戏时长/武器使用/关卡清除次数/总死亡 + clearedLevel5/10/15/20 标志）、音频偏好（masterVolume/sfxMuted/musicMuted/musicVolume）、按键映射、时间戳。

### 15.4 存档导入/导出 UI

`_showIOStatus(msg, isErr)`（第 3385 行）、`_openIOArea(mode)`（第 3392 行）：导出（只读文本 + 复制/下载）、导入（可编辑文本 + 确认 + 文件按钮）。

---

## 16. 输入系统

### 16.1 按键映射

- `DEFAULT_KEYMAP`（第 6045 行）：WASD / Space=跳 / R=换弹 / E=武器技能 / X=武器特殊 / Q=面板 / O=第三人称 / M=跳过 Boss / Esc=暂停 / Digit1–5=武器槽
- `keymap`（第 6052 行）：默认 + 从存档合并（仅覆盖已知动作）
- `_actionForKey(code)`（第 6068 行）：反向查找
- `_setKeyBinding(action, code)`（第 6090 行）：验证 + 写入 + 保存

### 16.2 按键重绑 UI（第 3300–3382 行）

`_keybindCaptureAction` 捕获模式、`_syncKeybindUI` 渲染列表、捕获 `keydown` 监听器（Esc 取消 + 冲突检查）、重置按钮。

### 16.3 主输入处理器（`initInputHandlers`，第 23656 行）

- `keydown`（23657）：动作分发，死亡仅允许 reload，完成时丢弃
- `keyup`（23686）：清按键状态
- `mousemove`（23687）：仅 pointerLock 时累积 `mouseMovementX/Y`
- `mousedown`/`mouseup`（23689/23690）：左键射击、右键副射击/技能
- `pointerlockchange`（23692）：锁定/解锁状态管理，解锁时暂停
- `click`（23718/23729）：未锁定时取消暂停 + 全屏 + 请求 pointerLock
- `gamepadconnected/disconnected`（23741/23749）

### 16.4 手柄与触控

- `pollGamepad()`（第 23815 行）：左摇杆移动、右摇杆视角（无需 pointerLock）、扳机射击、按键映射动作
- `initTouchControls()`（第 23881 行）：虚拟摇杆 + 瞄准区 + 6 按钮，复用 `mouseMovementX/Y`
- `toggleFullscreen()`（第 6111）/ `requestFullscreen()`（第 6118）：全屏，`fullscreenchange` 监听器自动重入（300ms 防抖）

---

## 17. 游戏流程与模式

### 17.1 关卡生命周期

```
showLoadingScreen(level)（7703）
  ├─ 设置关卡名/难度/随机提示
  ├─ requestFullscreen()
  ├─ 2 秒非线性进度条（rAF）
  └─ initAudio() → startLevel(level)
        ├─ clearSceneForLevel()
        ├─ buildChapterRoom() 或 buildRoom() 回退
        ├─ 创建补给包
        ├─ restartGameState()
        ├─ recalcWeaponBonuses()
        ├─ 重置血/盾/能量/弹药到有效上限
        ├─ 显示 HUD
        └─ 模式分支逻辑
```

- `restartGameState()`（第 7988 行）：完全重置玩家/武器/Boss/波次状态（不清 `currentWeaponSlot`/装备槽，跨关卡持久）
- `goToHomeScreen()`（第 8201 行）：存档 + 清场 + 隐藏 HUD + 清定时器 + 重置模式 + 显示开始界面 + `restartGameState()`

### 17.2 替代模式

| 函数 | 行 | 模式 |
|---|---|---|
| `startEndlessMode()` | 7861 | endless，强制 normal 难度 |
| `startBossRushMode()` | 7870 | bossrush，计时，强制 normal |
| `startEndlessWave()` | 7880 | 每 5 波精英 Boss ×1.25 缩放 |
| `bossRushSpawnCurrent()` | 7921 | 按 `BOSS_CREATORS[bossRushIndex]` 生成 |
| `showBossRushVictory()` | 7936 | 显示用时 + 记录标记 |

### 17.3 难度倍率

`getDiffMultiplier()` / `getDiffHP()` / `getDiffDmg()` / `getBossHP()` 统一应用难度倍率到血量/伤害。无尽与 Boss Rush 强制 normal。

---

## 18. 元进度系统

### 18.1 天赋（`recalcTalentBonuses`，第 5534 行）

遍历 `TALENT_TREE`，将 `unlockedTalents` 效果汇总到 `talentBonuses`（maxHP/maxShield/damageMult/critAdd/moveSpeedMult/energy/maxHPPct）。`unlockTalent(talentId)`（第 5549 行）验证前置 + 扣金币/AP + 解锁 + 重算。

### 18.2 成就（`ACHIEVEMENTS`，第 5573 行）

16 个成就（击杀 100/1k/10k、爆头 100/500、连杀 10/25、clear5/10/15/20、收集全武器、武器满级、无尽 10/30、bossrush），每个含 `condition()` + `{gold, ap}` 奖励。`checkAchievements()`（第 5596 行）遍历未解锁评估。

### 18.3 统计追踪

- `trackKill(isBoss)`（第 5617 行）：总击杀 + 最高连杀 + 武器 XP + 武器使用 + 成就检查
- `trackHeadshot()`（第 5628 行）
- `trackLevelClear(level)`（第 5633 行）：章节 Boss 标志 + 关卡清除计数 + 存档

---

## 19. 关键函数索引

### 渲染
| 函数 | 行 |
|---|---|
| `initScene` | 6863 |
| `applyQualityLevel` | 6897 |
| `enforcePointLightBudget` | 6912 |
| `buildRoom`（回退） | 6961 |
| `buildChapterRoom` | 7113 |
| `createGun` | 6990 |
| `clearSceneForLevel` | 7611 |
| `animate`（主循环） | 31580 |

### 武器
| 函数 | 行 |
|---|---|
| `recalcWeaponBonuses` | 4093 |
| `getEffectiveMoveSpeed/SoulPower/CritChance` | 4133/4142/4146 |
| `loadWeaponGltf` | 5198 |
| `applyWeaponRecoil` / `updateViewRecoil` | 6429 / 6450 |
| `grantWeaponXP` | 5480 |
| `switchWeapon` | 27513 |
| `handlePrimaryFire` / `handleSecondaryFire` | 27932 / 27971 |
| `shoot`（thunder） | 21664 |
| `tumoShoot` / `parasiteShoot` | 28005 / 25881 |
| `moonbowShoot` | 4422 |
| `chainLightning` | 7418 |
| `throwGrenade` / `detonateGrenade` | 29024 / 29054 |
| `calcDamage` | 5446 |

### 敌人
| 函数 | 行 |
|---|---|
| `createEnemy` | 11310 |
| `createBoss` | 12848 |
| `finalizeEnemy` | 11278 |
| `updateEnemies` | 15244 |
| `enemyShoot` / `updateEnemyBullets` | 21081 / 21092 |
| `killEnemy` | 22736 |
| `resolveEnemyCollisions` | 6528 |
| `createHealthBarSprite` | 6313 |
| `BOSS_CREATORS` 注册表 | 31558 |

### 波次/关卡
| 函数 | 行 |
|---|---|
| `getMinionBaseHP` | 5828 |
| `startNextWave` / `checkWaveComplete` | 5891 / 5916 |
| `startLevel` | 7766 |
| `showLoadingScreen` | 7703 |
| `restartGameState` | 7988 |
| `goToHomeScreen` | 8201 |
| `startEndlessMode` / `startBossRushMode` | 7861 / 7870 |

### 音频
| 函数 | 行 |
|---|---|
| `initAudio` | 6592 |
| `applyMasterVolume` | 6104 |
| `_scheduleBGMStep` / `playBGM` / `stopBGM` | 6662 / 6748 / 6766 |
| `updateFootstepSystem` | 6812 |

### 存档
| 函数 | 行 |
|---|---|
| `buildSaveObject` / `saveGameState` / `importSaveObject` | 3828 / 3856 / 3866 |

### 输入
| 函数 | 行 |
|---|---|
| `initInputHandlers` | 23656 |
| `pollGamepad` | 23815 |
| `initTouchControls` | 23881 |
| `_setKeyBinding` / `_resetKeyBindings` | 6090 / 6097 |

### 元进度
| 函数 | 行 |
|---|---|
| `recalcTalentBonuses` / `unlockTalent` | 5534 / 5549 |
| `checkAchievements` | 5596 |
| `trackKill` / `trackHeadshot` / `trackLevelClear` | 5617 / 5628 / 5633 |

---

## 20. 已知技术债务

源自 `.trae/specs/revamp-ui-audio-weapon-balance/checklist.md` 与代码审查：

### 20.1 UI 层（保守保留，不修复）

- **v4 原始层未删除**（第 20–912 行）：与 Premium 层同选择器竞争，删除风险高，Premium 层已 override 视觉
- **276 处 `!important` 残留**：与 v4 同选择器竞争，安全优先保留
- **320 处 inline 裸色值**：散落各处，逐一替换收益低风险高
- **HUD 指示器魔法数字**：10 个指示器仍含 `top:50%/80px/110px`、`left:50%/16px`、`bottom:120px/140px` 等
- **wave-display 顶部 72px 魔法数字**：双定义冲突，改动风险高

### 20.2 死代码

- **约 60 个 `build*Room` 函数**（第 8244–11207 行）：旧 60 关设计遗留，`startLevel` 仅用 `buildChapterRoom`。仅前 3 个使用共享辅助函数，其余内联样板 + TODO 注释
- **`registerStartScreenButtons` 内章节折叠 IIFE**（第 3058–3118 行）：首行 `return;` 致死，被分页选择器取代

### 20.3 数据不一致警告

- **MOONBOW 射速单位错位**：`MOONBOW_MIN/MAX_FIRE_RATE` 是发/秒（=8），其余 `*_FIRE_RATE` 是秒/发。两者相等致蓄力递增代码（第 4481–4483 行）永不触发
- **`WEAPON_SKILL_DESC` 不存在**：技能描述内嵌于 `WEAPON_FULL_DESC.passives`/`actives`，非独立表
- **常量名**：无裸 `HEAVY_CD`，正确名为 `MELEE_HEAVY_CD`（第 4965 行）

### 20.4 存档读取分散

`cs_save_v2` 在 4 处独立读取（第 3731/3761/3791/6054 行）而非一次性加载，每处窄提取自身字段，为旧存档宽容迁移的刻意设计。

---

## 附录：部署

`wrangler.jsonc` 配置 Cloudflare Pages 静态部署：

```jsonc
{
  "name": "fps-web-arena",
  "compatibility_date": "2026-07-08",
  "observability": { "enabled": true },
  "assets": { "directory": "." },
  "compatibility_flags": ["nodejs_compat"]
}
```

根目录作为静态资源目录，`index.html` 即入口。无需构建步骤。
