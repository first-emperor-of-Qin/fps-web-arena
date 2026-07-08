# 枪战突击 v5.0 全面升级 Spec

## Why
当前游戏界面存在 v4/v5 双层 CSS 互相覆盖、`!important` 滥用、inline style 满天飞、配色十几种近似色未归一，视觉割裂粗糙；完全无背景音乐，`musicMuted` 是死变量；武器射速不符合类型与品质设定（神级狙击 10 发/秒、双持手枪 16.67 发/秒等失衡）；武器图鉴与商城各自硬编码，baseDmg 虚高 10~10000 倍与实战严重脱节。需一次性解决这四类问题。

## What Changes
- **UI 全面重塑**：删除 v4 原始层重复样式，统一到 Premium 设计系统；归并所有硬编码颜色到 `:root` 变量；建立 `.btn` 按钮基类与 modifier 体系；重构商城/设置/充值/结算等 inline 严重界面走 `.modal-box` 体系；统一 HUD 指示器基类消除魔法数字；移除 60+ 处 `!important`。
- **背景音乐 + 音量控制**：用 Web Audio 程序合成一段循环 BGM（鼓点 + bass + lead），新增独立 `musicGainNode`；让 `musicMuted` 真正生效；新增音乐独立音量滑块；主音量统一管全局、音乐静音只叠加音乐支路。保持单 HTML 文件零外部依赖。
- **武器射速重新平衡**：按"武器类型基准档位 + 品质修正"原则重排全部射速常量，修正狙击枪过快、双持手枪过高、神级能量枪过低等失衡。
- **图鉴与商城数据同步**：废弃 `buildEquipCodex` 硬编码数组与商城静态 HTML 中的属性字段，改为统一从 `WEAPON_DISPLAY_DATA` / `getWeaponBaseDmg()` 动态读取，确保 fireRate 与 baseDmg 与平衡后的实际常量一致。

## Impact
- Affected specs: 武器系统、音频系统、UI/视觉系统、商城/图鉴面板
- Affected code:
  - CSS：`index.html` 12–1704 行（`<style>` 全区）
  - HTML：开始界面 1708、充值 1770/1780、关卡/难度选择 1898/1918、设置 1959、图鉴 2086/2096、HUD 2106–2267、暂停 2268、结算 2276/2290、个人面板 2305、商城 2425–2753
  - 武器常量：4158、4595、4602、4613、4644、4669、4696、4720、4741、4747、4812–4813、5348、5364、5367、5383、5390、5409、6054
  - 武器展示数据：`WEAPON_DISPLAY_DATA` 4420–4440、`WEAPON_CATALOG` 4446–4466
  - 图鉴：`buildEquipCodex` 3205–3383
  - 商城：静态 HTML 2457–2750、`updateShopState` 30379、`applyShopFilter` 29946
  - 音频：变量 6420–6426、`initAudio` 6983–6991、`applyMasterVolume` 6497–6501、音效函数 7016–7030、setter 4327–4343、UI 绑定 3718–3732、设置 HTML 1991–2002

## ADDED Requirements

### Requirement: 程序合成背景音乐
系统 SHALL 用 Web Audio API 合成一段循环背景音乐（含鼓点、bass、lead 至少三个声部），在游戏启动后循环播放，且不引入任何外部音频文件或网络依赖。

#### Scenario: 游戏启动播放 BGM
- **WHEN** 玩家完成首关启动（`initAudio` 之后）
- **THEN** BGM 调度器开始循环播放，三个声部按节拍序列触发

#### Scenario: BGM 不依赖外部资源
- **WHEN** 在完全离线环境打开 index.html
- **THEN** BGM 仍能正常合成播放，无网络请求、无 base64 内嵌音频文件

### Requirement: 音乐独立音量控制
系统 SHALL 提供独立于音效的音乐音量控制，包含音乐音量滑块与音乐静音开关，二者实时生效并持久化到存档。

#### Scenario: 音乐静音立即生效
- **WHEN** 玩家勾选"音乐静音"
- **THEN** `musicGainNode.gain` 立即置 0，BGM 停止发声；音效不受影响
- **AND** 偏好写入 `cs_save_v2`

#### Scenario: 主音量同时影响 BGM 与音效
- **WHEN** 玩家拖动主音量滑块
- **THEN** 音效与 BGM 音量按主音量等比例缩放（音乐支路 = 主音量 × 音乐音量 × 静音系数）

### Requirement: 射速类型档位
系统 SHALL 按武器类型设定射速基准档位，同类型内按品质（神级 > 传说级 > 英雄级）做 ±10~20% 修正。

#### Scenario: 狙击枪低速
- **WHEN** 武器类型为狙击枪（tumo / parasite）
- **THEN** 射速落在 3–5 发/秒档位，不得高于 5

#### Scenario: 双持手枪不超步枪
- **WHEN** 武器类型为双持手枪（shadow / metalstorm）
- **THEN** 射速不超过 14 发/秒

### Requirement: 图鉴商城数据单一真相源
系统 SHALL 让武器图鉴与商城的展示属性（baseDmg / fireRate / magazine / 品质 / 价格）统一从 `WEAPON_DISPLAY_DATA` 与 `getWeaponBaseDmg()` 动态读取，禁止在面板中硬编码属性字符串。

#### Scenario: 图鉴展示真实数值
- **WHEN** 打开装备图鉴
- **THEN** 每件武器的 baseDmg 与 fireRate 与游戏逻辑常量 100% 一致，无虚高

#### Scenario: 商城展示真实数值
- **WHEN** 打开商城
- **THEN** 每件武器的属性与图鉴、仓库面板完全一致

## MODIFIED Requirements

### Requirement: UI 视觉系统
删除 v4 原始层与 Premium 层的双层覆盖，统一为单一设计系统：所有颜色归并到 `:root` CSS 变量；所有按钮统一为 `.btn` + modifier；所有弹窗统一走 `.modal-overlay` + `.modal-box`（含商城，恢复圆角与玻璃拟态）；所有 HUD 指示器统一 `.hud-indicator` 基类；移除全部 `!important`。整体保持赛博朋克风格但配色克制统一、层次分明。

### Requirement: 武器射速常量
按下表重排全部武器射速常量（秒/发 = 1 / 目标发每秒）：

| 武器 | 类型 | 品质 | 现射速 | 目标射速 | 常量名 |
|---|---|---|---|---|---|
| thunder 突击步枪 | 英雄级 | 10 | 10 | `shootInterval` |
| shadow 双持手枪 | 英雄级 | 12.5 | 12.5 | `SECONDARY_FIRE_RATE` |
| metalstorm 双持手枪 | 英雄级 | 16.67 | 13 | `METALSTORM_FIRE_RATE` |
| whitenight 铳刃手枪 | 传说级 | 5 | 7 | `WHITENIGHT_FIRE_RATE` |
| dragonlyknight AK47 | 传说级 | 15 | 12 | `DRAGON_KNIGHT_FIRE_RATE` |
| dawnlight 激光枪 | 传说级 | 10 | 10 | `DAWNLIGHT_FIRE_RATE` |
| zeushand 能量枪 | 神级 | 6 | 8 | `ZEUS_HAND_FIRE_RATE` |
| phasewalker 相位步枪 | 神级 | 20 | 16 | `PHASE_WALKER_FIRE_RATE` |
| tumo 狙击枪 | 神级 | 10 | 4 | `TUMO_FIRE_RATE` |
| parasite 狙击枪 | 神级 | 5 | 4 | `PARASITE_FIRE_RATE` |
| moonbow 神弓 | 神级 | 10 | 8 | `MOONBOW_MIN/MAX_FIRE_RATE` |
| thousandumbrella 伞刃 | 神级 | 2 | 2.5 | `UMBRELLA_ATTACK_CD` |
| thunderblade 近战 | 英雄级 | 轻击2.5/重击1.25 | 不变 | `MELEE_LIGHT_CD/HEAVY_CD` |
| hellscythe 近战 | 英雄级 | 连发/15sCD | 不变 | `HELLSCYTHE_*` |
| 手雷 | 英雄/神级 | 0.5 | 0.5 | `GRENADE_THROW_CD` |

近战与手雷维持现状（已合理）。同步更新 `WEAPON_DISPLAY_DATA` 中对应 fireRate 字符串。

## REMOVED Requirements

### Requirement: buildEquipCodex 硬编码武器数组
**Reason**: `buildEquipCodex` 函数体内 3208–3361 行硬编码的 `weapons` 数组与商城 HTML、`WEAPON_DISPLAY_DATA` 三方分叉，baseDmg 虚高 10~10000 倍，注释自称走 `getWeaponBaseDmg()` 但实际未走，是数据脱节根源。
**Migration**: 重写 `buildEquipCodex` 改为遍历 `WEAPON_DISPLAY_DATA` + 调用 `getWeaponBaseDmg()` 动态渲染，删除硬编码数组。被动/主动技能描述迁移到 `WEAPON_DISPLAY_DATA` 新增字段（或独立 `WEAPON_SKILL_DESC` 表）。

### Requirement: 商城静态 HTML 武器卡片
**Reason**: 商城 2457–2750 行的 15 件武器属性硬编码在 `<ul class="shop-feature">` 中，baseDmg 全部虚高，且标题写"12件商品"实际 15 件计数错误。
**Migration**: 将商城武器列表改为 JS 动态渲染（从 `WEAPON_DISPLAY_DATA` + 价格表 + 技能描述表读取），静态 HTML 仅保留容器与筛选器。购买按钮、价格、拥有状态逻辑保留。
