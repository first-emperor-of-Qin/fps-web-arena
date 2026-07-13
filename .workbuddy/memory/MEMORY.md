# 项目长期记忆 · fps-web-arena（枪战突击 COMBAT STRIKE v6 联机版）

## 工作室阶段模型与当前定位
- 阶段阶梯：P0原型 → P1垂直切片 → P2内容/系统 → P3联机/社交 → P4打磨&上线就绪 → P5软启动/公测 → P6持续运营
- 当前（2026-07-14）：P0–P3 实质完成，处于「P4 中段 + 内容扩张」并行。
- 用户决策：不走 P4 收口、暂不上线，优先「扩内容/玩法」。全部 4 支柱已实现（A1–A3/B/C/D + 性能/背包/面板）：
  - A 多模式PVP ✅ A1 3v3/5v5、A2 占点dom+爆破defuse、A3 段位榜
  - B 武器/角色/关卡扩量 ✅ admin 系统 + seed_config 自动浮现（19武器/10角色/10关卡）
  - C 成长线/Meta ✅ user_progression 表 + 经验等级 + 个人面板 XP 条
  - D 特殊玩法 ✅ 生化 infection 上线（大逃杀/生存待做）

## 关键架构事实（避免重复踩坑）
- 单体前端 index.html（~31k 行/2MB），CSS/HTML/JS 全内联。存在多层带 !important 的覆盖层（联机样式 ~3000行、NEXUS REDESIGN ~1843行起、premium、responsive）。改 UI 必须 grep 全文件找最后一条获胜的 !important 规则并在那里改（详见 2026-07-13 修正笔记）。
- 后端 realtime.js 已支持 teamSize（默认 3）+ 分队（match_found 下发 team）；但前端 WZLB 弹窗被简化为仅 1v1。恢复 3v3/5v5 是纯前端工作。
- 联机代码铁律：游戏逻辑函数（handlePrimaryFire / checkWaveComplete / startNextWave / killEnemy 等）必须保持纯净，联机扩展一律走 window.__netHooks / window.MP 事件处理（见 HANDOFF.md）。
- 部署：GitHub Pages 流水线监听 main 分支，但工作在 zcode 分支，且 Pages 静态跑不了 Node 后端；真上线需 Render/Railway/VPS 跑 Node。已于 2026-07-14 提交 zcode 分支（8 文件 + seed_config.json + 项目记忆）。
- 起服须 Node 26（better-sqlite3 ABI 匹配）；命令 npm start → http://localhost:3000。

## 联机消息/房间要点（来自 realtime.js）
- createRoom(host, mapKey, teamSize) 默认 teamSize=3；匹配队列按 `${teamSize}:${mapKey}` 分组凑 teamSize*2；房间加入上限 teamSize*2。
- match_found 下发 { roomCode, mapKey, teamSize, team, players }；前端按 team 分队（p.team===myTeam?'ally':'enemy'）。
- 消息类型含 room_create/join/leave/start、match_queue/cancel/found、team_*、snap/hit/death/respawn、pve_*、reconnect、kicked。
- ⚠️ `realtime.js` 的 `ALLOWED_MODES` 必须含前端所有 mode（tdm/dom/defuse/infection/pve）；漏写会令 `normMode()` 静默回退 tdm，导致特殊模式匹配不到（D 生化曾因此 FAIL，已修）。
