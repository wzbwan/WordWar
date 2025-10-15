# 墨客（WordWar）Version 1 概览与技术说明

本文档梳理当前版本（version1）的整体架构、数据结构、主要业务逻辑、接口与事件、前端界面、管理后台，以及已知限制，帮助后续开发者快速上手本项目。

---

## 1. 架构与技术栈
- 前端：Next.js 14 + React 18 + TypeScript + TailwindCSS
- 实时：独立 Node WebSocket 服务（`server/ws.js`）
- 后端 API：Next.js Route Handlers（`app/api/*`）
- 数据库：SQLite（better-sqlite3，WAL 模式）
- 前端状态：Zustand
- 部署：单机 Node 进程（Next + WS），1～2 核 VPS 可满足 MVP

---

## 2. 运行与部署
- 安装依赖：`npm install`
- 开发联动（Next 3000 + WS 3001）：`npm run dev:all`
- 生产建议：分别 `npm run start` 与 `node server/ws.js`（可使用 pm2）
- 关键环境变量：
  - `JWT_SECRET`：JWT 签名密钥
  - `WS_PORT`：WebSocket 监听端口（默认 3001）
  - `ADMIN_KEY`：管理端接口鉴权（HTTP 头 `x-admin-key` 或 WS 管理路由 `?key=`）

---

## 3. 数据库结构（SQLite）
- `users`：id, username, password_hash, created_at
- `characters`：
  - user_id（UNIQUE）, level, exp, money, atk, def, hp, hp_max
  - dodge_index, crit_index（指数，出生 10；装备与等级叠加）
  - last_exp_time, last_passive_money_ts
  - exp_bank（在线存点池，分钟数）
  - dead_remaining_ms（阵亡复活倒计时，毫秒）
  - job（职业 code，e.g. `swordsman`/`knifeman`）
- `messages`：id, user_id, content, type, ts（聊天/系统消息）
- `monsters`：id, hp, max_hp, atk, def, reward_pool, started_at, ended_at
- `monster_templates`：
  - id, name, hp, atk, def, exp_pool, money_pool, counter_chance
  - last_hit_reward_item_id（保留）
  - last_hit_reward_items（CSV 随机池，例如 `1,2,4,4`）
  - url（怪物图片）
- `monster_damage`：monster_id, user_id, damage
- `coinrain_events` / `coinrain_claims` / `coinrain_templates`：金币雨活动及模板（duration_ms, coin_count, coin_value, per_user_cap）
- `scheduled_events`：type（monster/coinrain）, template_id, interval_sec, enabled, last_run_at
- `item_templates`：
  - id, name, category（weapon/hat/clothes/shoes/necklace/ring/consumable）
  - add_atk, add_def, add_max_hp, add_dodge, add_attack_speed, add_crit, add_current_hp
  - url（物品图 64x64）
- `inventory`：id, user_id, template_id, count, bag_slot(0..23), equipped_slot（六槽）
- `jobs`：id, code, name, idle_url, hurt_url, attack_url, walk_url, die_url（职业动作 WebP）

---

## 4. 服务端模块（WS）
- 在线状态：`online: Map<userId, { ws, username }>`
- 广播工具：`broadcast(type, payload)` / `sendTo(userId, type, payload)`
- WebSocket 事件：
  - `connect { token }`：建立连接与用户鉴权
  - `chat.message { content }`：公共聊天
  - `ping`/`pong`：心跳
  - `user.list`：在线用户（S→C）
  - `player.update`：角色属性变更推送（S→C）
  - `coinrain.spawn`/`coinrain.result`/`coinrain.end`
  - `monster.spawn`/`monster.state`/`monster.end`
  - `pvp.challenge { targetId }` / `pvp.result { summary, log[] }`
- 游戏循环（1Hz）：
  - `tickMonster()`：九宫格位置移动；超时逃跑；击杀结算
  - `tickExpBank()`：
    - 在线每分钟累加 `exp_bank`；
    - 阵亡读秒 `dead_remaining_ms`（仅在线时扣减），归零立即复活 HP=MaxHP；
- 调度器：轮询 `scheduled_events`，按模板触发怪物/金币雨（避免重复）

---

## 5. 业务逻辑
### 5.1 登录 / 聊天 / 在线列表
- 注册/登录：`/api/auth/register`、`/api/auth/login`（JWT）
- 在线列表：WS 广播 `user.list`；前端合并全量玩家（`/api/players`）呈现在线优先、绿色标识、离线灰色
- 聊天：`chat.message` 广播；系统文本同流显示

### 5.2 存点 / 升级 / 金钱
- 存点池（在线分钟数）：
  - 在线每满 1 分钟，`exp_bank+1`；断线清零（`ws.close` 置 0）
  - 前端每 60s 拉取 `/api/player` 刷新 bank；按钮仅在 `bank>0` 且未阵亡时可用
- 点击“存点”（`POST /api/exp/store`）：
  - 经验 += `12*bank`；金钱 += `(55 + 18*(等级-1))*bank`
  - 升级规则：每级 +4 Atk / +18 HP / +2 Def，HP=MaxHP；dodge_index/crit_index 每升 1 级各 +1
  - 清零 `exp_bank`

### 5.3 金币雨（可配置模板）
- 模板：`coinrain_templates`（持续时间、数量、价值、每人上限）
- 事件流：
  - spawn → 客户端按钮“抢金币” → `coinrain.hit` → S 端判定 & 发钱 → `coinrain.result`
  - end 结束广播
- 管理端：可定时或手动触发（HTTP `/api/admin/spawn` 或 WS `/admin/coinrain?tpl=`）

### 5.4 怪物（群体击杀 / 九宫格打地鼠）
- 模板：`monster_templates`（属性、奖励池、反击概率、`last_hit_reward_items` 随机池、`url` 图片）
- 行为：
  - 怪物以九宫格随机出现；玩家点击格子命中即攻击一次
  - 玩家伤害：`max(1, atk - def)`；玩家可“暴击”（2.2x）
  - 怪物反击：按 `counter_chance`；玩家可“闪避”（指数换算为概率）
  - 被击中 HP 可到 0（可死亡），进入复活读秒；读秒期间禁止一切活动
  - 击杀：按伤害占比从 money_pool 分金币；从 exp_pool 分经验（<0.3%无奖励）；“最后一击”从随机池发一件物品（有背包空位）并广播
- 广播：
  - `monster.spawn` 文本、`monster.state { hp, max_hp, cell, endsAt, url }`
  - `monster.end` 文本（包含功劳榜与最后一击奖励）

### 5.5 PVP 切磋（动画回放）
- 规则：
  - 回合制（每轮 1 次），伤害 `max(1, atk-def)`；
  - 防守方先判定“闪避”，未闪避再判定“暴击”（2.2x）
  - 文本战报仍保留，用于回放数据源（`pvp.result { summary, log[] }`）
- 动画化：
  - 进入弹窗“战斗窗口”：左侧自己，右侧对手（镜像 flipX）
  - 动作：walk→attack→hurt→walk back；顶部 HP 条动态变化
  - 底部左右状态栏：显示“造成X伤害、闪避、暴击X伤害、受到X伤害、阵亡”
  - 点击消息流 `[查看详情]` 可观看回放
- 职业与动作贴图：
  - `jobs` 表维护职业与五个动作 WebP URL（idle/hurt/attack/walk/die）
  - 左侧使用本人的 job 贴图；右侧调用 `/api/player/:id` 获取对方 job

### 5.6 装备 / 物品 / 背包
- 物品：`item_templates`（各项加成与图片 url）
- 背包：24 格；六槽装备（weapon/hat/clothes/shoes/necklace/ring）
- 操作：
  - `GET /api/inventory`：背包与装备
  - `POST /api/inventory/equip`：装备（槽位占用则自动挪回背包）
  - `POST /api/inventory/unequip`：卸下（要求背包有空位）
  - `POST /api/inventory/use`：仅 `consumable` 可使用（即时恢复 HP，受“有效 MaxHP=基础+装备加成”约束）
  - `POST /api/inventory/drop`：丢弃
- 前端：
  - 物品栏按钮 → 弹窗展示装备与背包；物品悬浮提示仅展示“非零”的增益项；64x64 图片
  - 装备/卸下/使用后接口立即返回“生效后”角色属性，前端即时合并刷新

### 5.7 玩家列表 / 详情
- 左侧“玩家列表”：全员（`/api/players`）+ 在线（WS）；在线在上绿色，离线灰色，离线不可切磋
- 点击用户名：详情弹窗（含“装备”六槽与悬浮属性提示）
- 闪避/暴击指数：前端通过装备加成重新计算展示，确保准确

### 5.8 阵亡 / 复活
- HP 可降至 0，进入 `dead_remaining_ms`
- 复活时间：`15 + 5*等级` 秒（仅在线读秒），归零立即复活（HP=MaxHP）
- 阵亡提示：本人收到“你已阵亡”，全局广播“玩家 X 阵亡”
- 阵亡期间禁止：切磋、打怪、金币雨点击、存点（禁按钮）

---

## 6. 管理后台与管理接口
- 管理页面：
  - `/admin`：模板/调度入口（怪物、金币雨、自动事件、物品模板）
  - `/admin/users`：用户管理（查看/编辑/删除）
  - `/admin/jobs`：职业管理（增删改、动作 URL）
- 主要管理 API：
  - 怪物模板：`GET/POST/DELETE /api/admin/monster_templates`
  - 金币雨模板：`GET/POST /api/admin/coinrain_templates`
  - 自动事件：`GET/POST/DELETE /api/admin/schedule`
  - 物品模板：`GET/POST/DELETE /api/admin/items`
  - 用户：`GET/POST/DELETE /api/admin/users`
  - 职业：`GET/POST/DELETE /api/admin/jobs`
  - 手动触发：`POST /api/admin/spawn { type:'monster'|'coinrain', template_id }`
  - WS 管理路由（无需 Next）：`/admin/monster?tpl=ID[&key=]`、`/admin/coinrain?tpl=ID[&key=]`

---

## 7. 公共 API 列表（简要）
- 认证：
  - `POST /api/auth/register { username, password }` → { token }
  - `POST /api/auth/login { username, password }` → { token }
- 角色：
  - `GET /api/player`（需 JWT）：{ player{ id, username, level, exp, money, atk, def, hp, maxHp, dodge_index, crit_index, deadRemaining, bank, job } }
  - `POST /api/player/job { job }`（需 JWT）：设置职业
  - `GET /api/player/:id`：获取他人角色（含 job 与“生效后”属性）
  - `GET /api/player/:id/inventory`：获取他人已装备
  - `GET /api/players`：全员（id, username, level）
  - `GET /api/jobs`：职业清单（code, name, 5 动作 URL）
- 存点：
  - `POST /api/exp/store`（需 JWT）：兑现 `exp_bank`，结算经验与金钱，升级与 HP 恢复
- 背包：
  - `GET /api/inventory` / `POST /api/inventory/equip|unequip|use|drop`

---

## 8. WebSocket 事件（简要）
- C→S：`connect { token }`、`chat.message { content }`、`ping`、`pvp.challenge { targetId }`、`coinrain.hit`、`monster.hit { cell }`
- S→C：
  - `system { id, type, content, ts }`、`chat.message`
  - `user.list [ { id, username, level } ]`
  - `player.update { level, exp, money, atk, def, hp, maxHp, dodge_index, crit_index, deadRemaining }`
  - `coinrain.spawn / .result / .end`
  - `monster.spawn / .state{ hp, max_hp, cell, endsAt, url } / .end`
  - `pvp.result { summary, log[] }`（文本战报，用于回放）

---

## 9. 前端界面说明
- 布局：
  - 左：玩家列表（在线绿色在上、离线灰色、不在线不可切磋、可查看详情与装备）
  - 中：聊天消息（固定高度、滚动到末尾）、输入框
  - 右：角色信息（用户名、等级、经验、HP 条、攻/防、闪避/暴击指数、存款、存点按钮）；活动区（金币雨按钮、怪物九宫格与 HP 条）
  - 弹窗：物品栏、职业选择、战斗窗口、查看详情、管理后台
- 体验细节：
  - 物品格 64x64 图；悬浮显示“非零属性”加成；已装备六槽同样显示
  - “存点”按钮仅 bank>0 且未阵亡可用；刷新每 60s
  - iPad/Safari 兼容：内置 UUID polyfill 替代 `crypto.randomUUID()`

---

## 10. 已实现的业务要点与修复记录（摘录）
- 怪物 ID 类型冲突（UUID/INTEGER）→ 使用自增整数修复
- 存点由“冷却 60s”改为“在线分钟累计池 + 断线清空 + 一次性兑现”
- 怪物支持随机“最后一击奖励物品”；金币雨/怪物模板化 + 调度器 DB 化
- HP 可至 0，阵亡读秒与复活；阵亡期间禁止活动；全局广播阵亡
- PVP 文本战报 + 图像化回放；动画位置修正与状态栏提示
- 背包与装备：接口返回“生效后”属性，前端合并显示；悬浮属性提示只展示非零项
- 玩家列表（全员+在线），查看他人详情与装备；指数根据装备准确显示
- 怪物图片（模板 url）；活动区九宫格显示
- 管理页面：模板/调度/物品 + 新增用户与职业管理页

---

## 11. 已知限制与下一步建议
- 贴图资源目前通过管理页可配置；BattleViewer 的 sprite() 已对接 jobs 表，但默认占位图仍使用；建议补充实际 WebP 资源
- PVP 动画可加入命中特效（粒子/闪光/飘字）与音效；行动节奏可更平滑
- 存点提示可在 UI 中增设“可存点 X 分钟”与“下一次就绪倒计时”
- 金币雨目前未做前端坐标随机点击命中（以按钮方式实现），可进一步图形化
- API 与 WS 需增加健壮性（限流、防刷、鉴权细化、输入校验）与日志
- 测试与监控：建议加入端到端与关键逻辑单测，添加运行日志与指标

---

## 12. 附：主要代码位置
- WebSocket 服务器：`server/ws.js`
- 数据库初始化与迁移：`server/db.js`
- 前端页面：
  - 登录页：`app/page.tsx`
  - 聊天室：`app/chat/page.tsx`（消息流、玩家列表、角色信息、活动、物品栏、职业选择、战斗窗口）
  - 管理页：`app/admin/page.tsx`、`/admin/users`、`/admin/jobs`
- API 路由：`app/api/*`

如需进一步的模块剖析（例如动画时间线、概率曲线、接口参数校验规范等），可在后续版本文档中扩展。