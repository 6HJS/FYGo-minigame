import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import RoomManager from './room-manager.js';
import { log, warn, error, roomSummary } from './logger.js';

const PORT = Number(process.env.PORT || 3000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ROOM_EXPIRE_MS = Number(process.env.ROOM_EXPIRE_MS || 7200000);
const MATCH_QUEUE_EXPIRE_MS = Number(process.env.MATCH_QUEUE_EXPIRE_MS || 60000);

const app = express();
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

const rooms = new RoomManager({ roomExpireMs: ROOM_EXPIRE_MS, matchQueueExpireMs: MATCH_QUEUE_EXPIRE_MS });
const activeSocketsByPlayer = new Map();

function safeJson(ws, payload) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify(payload));
}

function broadcastRoom(room, payload) {
  log('BROADCAST_ROOM', { room: roomSummary(room), payloadType: payload && payload.type ? payload.type : null });
  room.subscribers.forEach((ws) => safeJson(ws, payload));
}

function handleRoomSubscribe(ws, roomId, trigger = 'subscribe_room') {
  const normalizedRoomId = String(roomId || '').trim().toUpperCase();
  const auth = rooms.authenticateRoomPlayer(normalizedRoomId, ws.playerId, ws.playerToken);
  rooms.attachSocketToPlayer(normalizedRoomId, auth.color, ws);
  rooms.subscribeRoom(normalizedRoomId, ws);
  ws.roomId = normalizedRoomId;
  log('WS_ROOM_HANDSHAKE_SUCCESS', { trigger, roomId: normalizedRoomId, playerId: ws.playerId || null, color: auth.color, room: roomSummary(auth.room) });
  safeJson(ws, { type: 'subscribe_ok', roomId: normalizedRoomId, color: auth.color, snapshot: auth.room.state.snapshot() });
  safeJson(ws, { type: 'room_state', room: rooms.getRoomPublic(auth.room) });
  broadcastRoom(auth.room, { type: 'presence', roomId: normalizedRoomId, room: rooms.getRoomPublic(auth.room) });
}

app.get('/healthz', (req, res) => res.json({ ok: true, now: Date.now() }));

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


app.post('/api/rooms/:roomId/actions', (req, res) => {
  try {
    const roomId = String(req.params.roomId || '').trim().toUpperCase();
    const body = req.body || {};
    const { room, snapshot } = rooms.applyAction(roomId, body.playerId, body.playerToken, body.action || {});
    const publicRoom = rooms.getRoomPublic(room);
    broadcastRoom(room, { type: 'room_state', room: publicRoom, actionAccepted: true, snapshotVersion: snapshot.version });
    res.json({ roomId, room: publicRoom, snapshotVersion: snapshot.version });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/rooms/:roomId', (req, res) => {
  const roomId = String(req.params.roomId || '').trim().toUpperCase();
  try {
    const playerId = req.query && req.query.playerId ? String(req.query.playerId) : '';
    const playerToken = req.query && req.query.playerToken ? String(req.query.playerToken) : '';
    const auth = rooms.authenticateRoomPlayer(roomId, playerId, playerToken);
    res.json({ roomId, playerColor: auth.color, room: rooms.getRoomPublic(auth.room) });
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
  log('SERVER_LISTENING', { port: PORT, corsOrigin: CORS_ORIGIN, roomExpireMs: ROOM_EXPIRE_MS, matchQueueExpireMs: MATCH_QUEUE_EXPIRE_MS });
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  ws.playerId = url.searchParams.get('playerId') || '';
  ws.playerToken = url.searchParams.get('playerToken') || '';
  ws.roomId = '';
  ws.isAlive = true;

  const previousWs = ws.playerId ? activeSocketsByPlayer.get(ws.playerId) : null;
  if (previousWs && previousWs !== ws) {
    try {
      rooms.unsubscribeSocket(previousWs);
      if (typeof previousWs.terminate === 'function') previousWs.terminate();
      else if (typeof previousWs.close === 'function') previousWs.close(4001, 'replaced_by_new_connection');
    } catch (err) {}
  }
  if (ws.playerId) activeSocketsByPlayer.set(ws.playerId, ws);

  log('WS_CONNECTION_OPEN', { playerId: ws.playerId, playerTokenPresent: !!ws.playerToken, remote: req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : null, replacedExisting: !!previousWs });
  safeJson(ws, { type: 'hello', playerId: ws.playerId });

  ws.on('pong', () => {
    ws.isAlive = true;
    log('WS_PONG', { playerId: ws.playerId || null, roomId: ws.roomId || null });
  });

  ws.on('message', (buffer) => {
    let message = null;
    try {
      message = JSON.parse(buffer.toString());
      log('WS_MESSAGE_RECEIVED', { playerId: ws.playerId || null, roomId: ws.roomId || null, type: message && message.type ? message.type : null, message });
    } catch (err) {
      safeJson(ws, { type: 'error', message: '消息不是合法 JSON' });
      return;
    }

    try {
      if (message.type === 'ping') {
        log('WS_PING', { playerId: ws.playerId || null, roomId: ws.roomId || null });
        safeJson(ws, { type: 'pong', ts: Date.now() });
        return;
      }
      if (message.type === 'auth') {
        safeJson(ws, { type: 'auth_ok', playerId: ws.playerId });
        return;
      }
      if (message.type === 'subscribe_room' || message.type === 'handshake') {
        const roomId = String(message.roomId || '').trim().toUpperCase();
        if (!roomId) throw new Error('缺少房间号');
        handleRoomSubscribe(ws, roomId, message.type);
        return;
      }
      if (message.type === 'action') {
        const roomId = String(message.roomId || ws.roomId || '').trim().toUpperCase();
        const { room, snapshot } = rooms.applyAction(roomId, ws.playerId, ws.playerToken, message.action || {});
        log('WS_ACTION_SUCCESS', { roomId, playerId: ws.playerId || null, snapshotVersion: snapshot.version });
        broadcastRoom(room, { type: 'room_state', room: rooms.getRoomPublic(room), actionAccepted: true, snapshotVersion: snapshot.version });
        return;
      }
      safeJson(ws, { type: 'error', message: `未知消息类型: ${message.type}` });
    } catch (err) {
      error('WS_MESSAGE_HANDLE_FAIL', { playerId: ws.playerId || null, roomId: ws.roomId || null, messageType: message && message.type ? message.type : null, error: err && err.message ? err.message : String(err) });
      safeJson(ws, { type: 'error', message: err && err.message ? err.message : '服务器处理消息失败' });
    }
  });

  ws.on('close', () => {
    log('WS_CONNECTION_CLOSE', { playerId: ws.playerId || null, roomId: ws.roomId || null });
    rooms.unsubscribeSocket(ws);
    if (ws.playerId && activeSocketsByPlayer.get(ws.playerId) === ws) {
      activeSocketsByPlayer.delete(ws.playerId);
    }
  });
});

setInterval(() => {
  log('SERVER_TICK_BEGIN', { clientCount: wss.clients.size, roomCount: rooms.rooms.size });
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      try { ws.terminate(); } catch (err) {}
      return;
    }
    ws.isAlive = false;
    try {
      log('WS_HEARTBEAT_PING', { playerId: ws.playerId || null, roomId: ws.roomId || null });
      ws.ping();
    } catch (err) {}
  });
  rooms.tickTimeouts().forEach((room) => {
    broadcastRoom(room, { type: 'room_state', room: rooms.getRoomPublic(room) });
  });
  rooms.cleanup();
  log('SERVER_TICK_END', { clientCount: wss.clients.size, roomCount: rooms.rooms.size });
}, 5000);
