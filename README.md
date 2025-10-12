# 墨客 · WordWar (MVP)

多人在线文字聊天室网页游戏（Next.js + Node WebSocket + SQLite）。

## 快速开始

1. 安装依赖

```
npm install
```

2. 启动开发（前端 3000 + WS 3001）

```
npm run dev:all
```

3. 打开浏览器访问 `http://localhost:3000`

4. 注册/登录后进入 `/chat` 聊天室。

WebSocket 服务将自动定时触发：

- 金币雨：每 5 分钟一次；
- 普通怪：每 3 分钟一次；

也可手动触发（可选设置环境变量 `ADMIN_KEY`）：

- 触发金币雨：`curl "http://localhost:3001/admin/coinrain?key=你的key"`
- 生成怪物：`curl "http://localhost:3001/admin/monster?key=你的key"`

## 实现对照

- 登录/注册：`POST /api/auth/login`、`POST /api/auth/register`（MVP 增补注册）
- 获取角色：`GET /api/player`
- 存点：`POST /api/exp/store`（冷却 60s，±5s 宽限）
- 心跳：客户端每 30s 发送 `ping`，服务端 `pong`
- 聊天：WebSocket `chat.message` 广播
- 被动金钱：每分钟结算（在线玩家）
- 金币雨：`coinrain.spawn` / `coinrain.hit` / `coinrain.end`，每人上限 5 枚
- 怪物：`monster.spawn` / `monster.update` / `monster.end`，按伤害占比分配，阈值 0.3%
- 切磋：`pvp.challenge` → `pvp.update` / `pvp.result`（仅双方收到）

## 数据库

启动时自动创建 `data.sqlite` 并初始化表结构，WAL 模式。SQLite 文件默认忽略提交。

## 注意

- 当前为单机 MVP，未做分布式与复杂风控。
- 生产部署建议使用 `pm2` 等守护进程分别拉起 `next start` 与 `node server/ws.js`。

