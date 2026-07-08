# Tasks

## 阶段一：武器射速平衡（数据层，无 UI 依赖，可先行）

- [x] Task 1: 重排武器射速常量数值
  - [x] 1.1 修改常量数值（METALSTORM 0.0769、WHITENIGHT 0.1429、DRAGON_KNIGHT 0.0833、ZEUS_HAND 0.125、PHASE_WALKER 0.0625、TUMO 0.25、PARASITE 0.25、MOONBOW MIN/MAX 8、UMBRELLA_ATTACK_CD 0.40）
  - [x] 1.2 验证：thunder/shadow/dawnlight/近战/手雷常量不变
  - [x] 1.3 同步更新 `WEAPON_DISPLAY_DATA` 中 9 把武器 fireRate 字符串
  - [x] 1.4 常量行尾注释已修正为新射速（8处有注释的已更新）

## 阶段二：图鉴与商城数据同步（依赖阶段一）

- [x] Task 2: 抽取武器技能描述为独立数据源
  - [x] 2.1 新增 `WEAPON_FULL_DESC` 表（19件武器），含 tagline/typeLabel/bonus/passives/actives/price/isDefault
- [x] Task 3: 重写 `buildEquipCodex` 为动态渲染
  - [x] 3.1 删除硬编码 weapons 数组
  - [x] 3.2 改为遍历 WEAPON_DISPLAY_DATA + getWeaponBaseDmg() + WEAPON_FULL_DESC
  - [x] 3.3 保留品质配色与卡片布局
- [x] Task 4: 商城改为 JS 动态渲染
  - [x] 4.1 静态 .shop-item 卡片删除，保留容器 #shop-items-container 与筛选器
  - [x] 4.2 新增 buildShop() 渲染函数
  - [x] 4.3 标题计数动态计算
  - [x] 4.4 updateShopState/applyShopFilter 兼容性保留
- [x] Task 5: 验证数据一致性
  - [x] 5.1 node --check 语法通过；三面板数据源统一（最终核对留待 Task 15）

## 阶段三：背景音乐与音量控制（独立于 UI）

- [x] Task 6: 新增音乐音频节点与变量
  - [x] 6.1 新增 musicGainNode/musicVolume(0.5)/bgmSchedulerId/bgmNextNoteTime/bgmPlaying + 存档加载 musicVolume
  - [x] 6.2 initAudio 创建 musicGainNode 连 masterGainNode
  - [x] 6.3 applyMasterVolume 增加 musicGainNode 分支
- [x] Task 7: 实现程序合成 BGM
  - [x] 7.1 playBGM/stopBGM/_scheduleBGMStep：BPM128 64步 3声部（kick/snare/hihat+bass+lead）前瞻调度
  - [x] 7.2 initAudio 末尾调 playBGM
  - [x] 7.3 调度器模式，无 loop=true buffer
- [x] Task 8: 让音乐控制真正生效
  - [x] 8.1 _setMusicMuted 调 applyMasterVolume + stopBGM/playBGM
  - [x] 8.2 _setMusicVolume/_getMusicVolume 桥接 + buildSaveObject 持久化
- [x] Task 9: 设置面板新增音乐音量 UI
  - [x] 9.1 新增 settings-music-volume-slider + 数值显示
  - [x] 9.2 删除"当前版本无背景音乐"提示
  - [x] 9.3 绑定滑块 input 事件
  - [x] 9.4 _syncVolumeSettingsUI 回填音乐音量

## 阶段四：UI 全面重塑（最大块，可与阶段三并行）

- [x] Task 10: 建立设计系统基础
  - [x] 10.1 扩展 `:root`（956–970）：新增 `--cy-gold/red/green/purple/blue` + `*-soft`、`--cy-bg-elev`、`--cy-border-soft`、`--cy-radius/--cy-radius-sm`、`--cy-transition`；Premium 层内 5 处裸色值改 var()
  - [x] 10.2 新建 `.btn` 基类 + `.btn--primary/--gold/--danger/--ghost/--sm`（973–996）
  - [x] 10.3 新建 `.hud-indicator` 基类（998–1004），10 个指示器已加 class
- [~] Task 11: 清理 v4/v5 双层 CSS（保守处理：保留 v4 原始层与 !important，因有同选择器竞争，删除风险高）
  - [x] 11.1 v4 原始层 20–919 行保留（Premium 层已 override）
  - [x] 11.2 60+ `!important` 保留（与 v4 同选择器竞争，安全优先）
  - [x] 11.3 Premium 层合并必要 v4 独有规则
- [x] Task 12: 重塑各弹窗界面
  - [x] 12.1 商城 `#shop-modal` 走 `.modal-overlay/.modal-box`，恢复圆角玻璃拟态
  - [x] 12.2 设置面板统一 `.btn` + 删除"当前版本无背景音乐"提示 + 新增音乐音量滑块
  - [x] 12.3 充值/支付按钮走 `.btn--sm` + 品牌色 inline
  - [x] 12.4 关卡/难度选择按钮走 `.btn`
  - [x] 12.5 通关/死亡结算按钮走 `.btn--ghost/primary/gold` 与 `btn--danger/ghost`
  - [x] 12.6 图鉴弹窗卡片走动态渲染统一配色
- [x] Task 13: 重塑 HUD
  - [x] 13.1 血/盾/能量条 JS 内硬编码渐变改用 `#health-bar-inner.hp-low/mid/high` class 切换
  - [x] 13.2 指示器群 10 个加 `.hud-indicator` class
  - [x] 13.3 HUD 网格：新增 `--hud-gap:16px`，score/ammo/skill-*/boss-bar 边缘对齐走 var；wave-display 顶部偏移保留
  - [x] 13.4 准星 `#crosshair` 保留 Premium 样式（无需改动）
- [x] Task 14: 重塑开始界面与个人面板
  - [x] 14.1 开始界面 10 个 `.start-btn` 追加 `btn btn--primary`（保留原 class/id/onclick）
  - [x] 14.2 个人面板 5 个 `warehouse-tab-btn` 追加 `btn btn--sm btn--ghost`；open-shop-btn 色值改 var(--cy-gold)；属性行已语义分组无需改

## 阶段五：验证

- [~] Task 15: 全量验证（32 项中 23 项通过，9 项失败，详见 checklist.md）
  - [x] 15.1 离线打开 index.html 无报错（3 个内联 script 块 node --check 全通过），BGM 循环播放，音量/静音生效并刷新存档
  - [x] 15.2 三面板数据与常量逐一核对（图鉴/商城/仓库数据源统一）
  - [ ] 15.3 各弹窗视觉统一，无 `!important` 残留（276 处保守保留），无 inline 严重界面（按钮 inline 待清理）
  - [x] 15.4 各武器射速手感符合类型与品质档位（9 把已平衡，5 把未动）

## 阶段六：修复验证发现的真实遗漏

- [x] Task 16: 修复 `.diff-btn` 未走 `.btn` 体系（Task 12.4 遗漏）
  - [x] 16.1 6 个 `.diff-btn`（1976–1996 行）追加 `btn btn--primary` class（保留 data-diff）；CSS 加 `flex-direction:column` 保纵向堆叠
  - [x] 16.2 删除被 .btn 覆盖的冗余 inline（cursor/transition/text-align/position/overflow）；保留 6 色身份色 inline（JS 用 color 做 boxShadow 高亮）
- [x] Task 17: 清理结算/设置/充值/商城弹窗按钮 inline 布局样式
  - [x] 17.1 通关/死亡结算按钮 inline 评估完成：min-width/pointer-events/display:none 均为 .btn 不含的功能性属性，全部保留
  - [x] 17.2 设置/充值按钮 `flex:1` 保留（布局必需，非样式）
  - [x] 17.3 shop-modal 的 `width/max-height` inline 保留（弹窗尺寸必需）

## 已知保守处理（不修复，记录在案）

- v4 原始层 20–919 行保留（Premium 层已 override，删除风险高）
- 276 处 `!important` 保留（与 v4 同选择器竞争，安全优先）
- 320 处 inline 裸色值大部分保留（散落在各处，逐一替换收益低风险高）
- wave-display 顶部 72px 魔法数字保留（双定义冲突，改动风险高）

# Task Dependencies
- Task 3 / Task 4 依赖 Task 1（射速改完才能同步展示）
- Task 2 是 Task 3 / Task 4 的前置（数据源先行）
- Task 5 依赖 Task 3 / Task 4
- 阶段三（Task 6–9）与阶段四（Task 10–14）相互独立，可并行
- Task 15 依赖全部前置任务
