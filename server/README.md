# FYGo 服务器权威房间对局服务

这是一个 Node.js + WebSocket 的服务器权威后端原型，目标是给微信小游戏提供：

- 创建房间 / 输入房间码加入
- 快速匹配
- 服务器权威回合、落子、提子、超时判负
- 房间状态广播、断线重连

## 当前实现范围

已实现：

- 房间管理
- WebSocket 实时广播
- 服务器保存完整棋盘状态
- 标准围棋基础落子 / 提子 / pass / resign
- 每手倒计时，超时自动判负
- 黑白双方鉴权与回合校验

尚未接入：

- 你项目中的全部特殊兵种与复杂地形
- 与现有 `go-game-scene.js` 的 action 全量对接
- 点目、悔棋、教学、复盘、排位结算

也就是说：**现在这套后端已经是“服务器权威房间骨架 + 标准落子权威实现”**，
你下一步要做的是把前端每种特殊兵种 action 逐步迁到服务端的 `engine.js`。

## 目录

- `src/index.js` 入口，HTTP + WebSocket
- `src/room-manager.js` 房间与匹配
- `src/game/engine.js` 服务器权威规则核心

## 本地启动

```bash
cd server
npm install
npm start
```

默认监听：

- HTTP: `http://127.0.0.1:3000`
- WS: `ws://127.0.0.1:3000/ws`

健康检查：

```bash
curl http://127.0.0.1:3000/healthz
```

## HTTP API

### 创建房间

`POST /api/rooms`

```json
{
  "playerId": "player_a",
  "playerToken": "token_a",
  "boardId": "board_9x9",
  "turnTimeMs": 30000
}
```

### 加入房间

`POST /api/rooms/:roomId/join`

### 快速匹配

`POST /api/matchmaking/quick`

## WebSocket

连接地址：

```txt
ws://host:3000/ws?playerId=xxx&playerToken=yyy
```

消息示例：

### 订阅房间

```json
{
  "type": "subscribe_room",
  "roomId": "ABC123"
}
```

### 发送 action

```json
{
  "type": "action",
  "roomId": "ABC123",
  "action": {
    "type": "move",
    "x": 4,
    "y": 4
  }
}
```

### pass

```json
{
  "type": "action",
  "roomId": "ABC123",
  "action": {
    "type": "pass"
  }
}
```

### resign

```json
{
  "type": "action",
  "roomId": "ABC123",
  "action": {
    "type": "resign"
  }
}
```

## 接入现有小游戏的建议

你目前前端已经很大，最稳的迁移方式是：

1. **先只把在线大厅、建房、入房、匹配接通**
2. 对局阶段先只开放“普通落子”
3. 再按兵种逐个把逻辑迁到服务端
4. 等服务端和前端对同一 action 的结果完全一致后，再去掉前端本地裁决

## 为什么要服务器权威

必须坚持下面这条：

- 客户端只负责“输入”与“表现”
- 服务端负责“合法性”“结果”“胜负”“计时”“随机数种子”

否则玩家很容易通过改包、抓包、改 JS 代码实现作弊。

## 下一步最关键的工程改造

建议把你现在前端中所有“会改变棋盘结果”的逻辑抽成共享 action：

- `place_piece`
- `select_card`
- `card_target`
- `confirm_direction`
- `request_undo`
- `respond_undo`
- `request_score`
- `respond_score`
- `resign`

然后前端只发 action，服务端执行 action，广播新的 snapshot。
