# 在线模式重构基线（2026-03-30）

本版目标：

- 保留微信云托管内网 `callContainer` 作为 HTTP 接入方式
- 在线模式改为 **服务器权威**
- 客户端只发送动作，不再上传完整快照
- 只有收到 `subscribe_ok / room_state` 后才进入对局场景

## 当前联机 MVP 能力

- 创建房间
- 输入房间码加入
- 快速匹配
- 9x9 普通落子
- 停一手
- 认输
- WebSocket 断线后自动重连并恢复房间订阅

## 当前协议

### HTTP
- `POST /api/rooms`
- `POST /api/rooms/:roomId/join`
- `POST /api/matchmaking/quick`
- `GET /api/rooms/:roomId`

### WebSocket
客户端发送：
- `auth`
- `subscribe_room`
- `action: { type: 'move' | 'pass' | 'resign' }`
- `ping`

服务端返回：
- `hello`
- `auth_ok`
- `subscribe_ok`
- `room_state`
- `presence`
- `pong`
- `error`

## 下一步建议

1. 先把 9x9 在线普通落子跑稳定
2. 再加“预览后确认”
3. 再把特殊兵种逐个迁移到服务端规则层
4. 最后补排名 / 观战 / 断线宽限 / 重连倒计时
