# Checklist

## 武器射速平衡
- [x] 9 把枪械射速常量数值已按目标表修改（metalstorm/whitenight/dragonlyknight/zeushand/phasewalker/tumo/parasite/moonbow/thousandumbrella）
- [x] thunder/shadow/dawnlight/近战/手雷常量未变
- [x] `WEAPON_DISPLAY_DATA` 中 9 把武器的 fireRate 字符串已同步更新
- [x] 狙击枪（tumo/parasite）射速 ≤ 5 发/秒
- [x] 双持手枪（shadow/metalstorm）射速 ≤ 14 发/秒

## 图鉴与商城数据同步
- [x] `buildEquipCodex` 已删除硬编码 weapons 数组，改为动态渲染
- [x] 图鉴每件武器 baseDmg 与 `getWeaponBaseDmg()` 返回值一致
- [x] 图鉴 fireRate 与 `WEAPON_DISPLAY_DATA` 一致
- [x] 商城已改为 JS 动态渲染，无静态 .shop-item 卡片残留
- [x] 商城标题计数与实际商品数一致
- [x] 商城 baseDmg / fireRate 与图鉴、仓库三面板一致
- [x] 商城购买/拥有/筛选逻辑仍正常工作

## 背景音乐与音量控制
- [x] `musicGainNode` 已创建并 connect 到 masterGainNode
- [x] BGM 含鼓点/bass/lead 三个声部，循环播放
- [x] 离线环境 BGM 正常播放，无网络请求无外部音频文件
- [x] 音乐静音勾选后 BGM 立即停止，音效不受影响
- [x] 主音量滑块同时影响 BGM 与音效
- [x] 音乐独立音量滑块已新增并实时生效
- [x] 音乐音量/静音偏好写入 `cs_save_v2` 存档
- [x] "当前版本无背景音乐"提示文案已删除

## UI 全面重塑
- [ ] `:root` 变量已补齐所有语义色，无冲突裸色值残留 <!-- FAIL: inline style 裸色值残留 320 处（仅替换 Premium 层 5 处 + open-shop-btn 1 处） -->
- [x] `.btn` 基类 + modifier 体系已建立并应用于所有按钮（Task 16 已补完 .diff-btn）
- [x] `.hud-indicator` 基类已建立并应用于指示器群
- [ ] v4 原始层重复样式已删除 <!-- FAIL: 20-919 行 v4 原始层仍在（刻意保守处理，因有同选择器竞争） -->
- [ ] 全部 `!important` 已移除（60+ 处） <!-- FAIL: 仍残留 276 处 !important（刻意保守处理） -->
- [x] 商城 `#shop-modal` 走 `.modal-box` 体系，恢复圆角玻璃拟态
- [~] 设置/充值/关卡/难度/结算弹窗 inline style 已清除（部分：.diff-btn 已清理冗余属性保留身份色；结算按钮无 inline 色值；设置 flex:1 与 shop-modal 尺寸 inline 为布局必需保留；充值按钮品牌色 inline 保留） <!-- PARTIAL: 布局必需的 inline 保留，色值类已清理 -->
- [x] HUD 血条配色不再在 JS 内硬编码渐变，改用 class 切换
- [ ] HUD 指示器无魔法数字 top/left <!-- FAIL: 10 个指示器仍含 top:50%/80px/110px/120px/148px、left:50%/16px、bottom:120px/140px/155px 等魔法数字 -->
- [ ] 整体配色克制统一、层次分明，视觉割裂消除 <!-- FAIL: 裸色值 320 处 + !important 276 处 + 大量 inline style，视觉割裂未消除 -->

## 全量验证
- [x] 离线打开 index.html 无控制台报错
- [x] BGM 循环播放、音量/静音生效、刷新页面偏好保留
- [x] 三面板（图鉴/仓库/商城）数据与游戏常量逐一核对一致
- [~] 各弹窗视觉统一，无 `!important` 残留（276 处 !important 为与 v4 同选择器竞争的保守保留，Premium 层已 override v4 视觉） <!-- PARTIAL: 保守保留 !important，视觉由 Premium 层统一 -->
- [x] 各武器射速手感符合类型与品质档位设定
