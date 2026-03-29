import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import RoomManager from './room-manager.js';

const PORT = Number(process.env.PORT || 3000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ROOM_EXPIRE_MS = Number(process.env.ROOM_EXPIRE_MS || 7200000);
const MATCH_QUEUE_EXPIRE_MS = Number(process.env.MATCH_QUEUE_EXPIRE_MS || 60000);

const app = express();
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

const rooms = new RoomManager({ roomExpireMs: ROOM_EXPIRE_MS, matchQueueExpireMs: MATCH_QUEUE_EXPIRE_MS });

function safeJson(ws, payload) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify(payload));
}

function broadcastRoom(room, payload) {
  room.subscribers.forEach((ws) => safeJson(ws, payload));
}

app.get('/healthz', (req, res) => {
  res.json({ ok: true, now: Date.now() });
});

app.post('/api/rooms', (req, res) => {
  try {
    const { room, playerColor } = rooms.createRoom(req.body || {});
    res.status(201).json({ roomId: room.roomId, playerColor, room: rooms.getRoomPublic(room) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/rooms/:roomId/join', (req, res) => {
  try {
    const roomId = String(req.params.roomId || '').trim().toUpperCase();
    const { room, playerColor, rejoin } = rooms.joinRoom(roomId, req.body || {});
    const publicRoom = rooms.getRoomPublic(room);
    broadcastRoom(room, { type: 'room_state', room: publicRoom });
    res.json({ roomId, playerColor, rejoin, room: publicRoom });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/matchmaking/quick', (req, res) => {
  try {
    const { room, playerColor, matched } = rooms.enqueueQuickMatch(req.body || {});
    const publicRoom = rooms.getRoomPublic(room);
    broadcastRoom(room, { type: 'room_state', room: publicRoom });
    res.json({ roomId: room.roomId, playerColor, matched, room: publicRoom });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`FYGo authoritative server listening on :${PORT}`);
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const playerId = url.searchParams.get('playerId') || '';
  const playerToken = url.searchParams.get('playerToken') || '';
  ws.playerId = playerId;
  ws.playerToken = playerToken;
  ws.roomId = '';
  ws.isAlive = true;

  safeJson(ws, { type: 'hello', playerId });

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (buffer) => {
    let message = null;
    try {
      message = JSON.parse(buffer.toString());
    } catch (err) {
      safeJson(ws, { type: 'error', message: '消息不是合法 JSON' });
      return;
    }

    try {
      if (message.type === 'ping') {
        safeJson(ws, { type: 'pong', ts: Date.now() });
        return;
      }

      if (message.type === 'subscribe_room') {
        const roomId = String(message.roomId || '').trim().toUpperCase();
        const auth = rooms.authenticateRoomPlayer(roomId, ws.playerId, ws.playerToken);
        rooms.attachSocketToPlayer(roomId, auth.color, ws);
        rooms.subscribeRoom(roomId, ws);
        ws.roomId = roomId;
        safeJson(ws, { type: 'room_joined', roomId, color: auth.color });
        safeJson(ws, { type: 'room_state', room: rooms.getRoomPublic(auth.room) });
        broadcastRoom(auth.room, { type: 'presence', roomId, playerId: ws.playerId, online: true });
        return;
      }

      if (message.type === 'action') {
        const roomId = String(message.roomId || ws.roomId || '').trim().toUpperCase();
        const { room, snapshot } = rooms.applyAction(roomId, ws.playerId, ws.playerToken, message.action || {});
        broadcastRoom(room, { type: 'room_state', room: rooms.getRoomPublic(room), actionAccepted: true, snapshotVersion: snapshot.version });
        return;
      }

      safeJson(ws, { type: 'error', message: `未知消息类型: ${message.type}` });
    } catch (err) {
      safeJson(ws, { type: 'error', message: err.message || '服务器处理失败' });
    }
  });

  ws.on('close', () => {
    const roomId = ws.roomId;
    rooms.unsubscribeSocket(ws);
    if (roomId && rooms.rooms.has(roomId)) {
      const room = rooms.rooms.get(roomId);
      broadcastRoom(room, { type: 'presence', roomId, playerId: ws.playerId, online: false });
      broadcastRoom(room, { type: 'room_state', room: rooms.getRoomPublic(room) });
    }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }

  const updates = rooms.tickTimeouts();
  updates.forEach((room) => {
    broadcastRoom(room, { type: 'room_state', room: rooms.getRoomPublic(room) });
  });
  rooms.cleanup();
}, 5000);
