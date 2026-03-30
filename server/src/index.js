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
  if (!ws || ws.readyState !== 1) {
    warn('WS_SEND_SKIPPED', { playerId: ws && ws.playerId ? ws.playerId : null, roomId: ws && ws.roomId ? ws.roomId : null, reason: 'socket_not_open', payloadType: payload && payload.type ? payload.type : null });
    return;
  }
  ws.send(JSON.stringify(payload));
}

function broadcastRoom(room, payload) {
  log('BROADCAST_ROOM', { room: roomSummary(room), payloadType: payload && payload.type ? payload.type : null });
  room.subscribers.forEach((ws) => safeJson(ws, payload));
}

app.get('/healthz', (req, res) => {
  log('HTTP_HEALTHZ', { ip: req.ip });
  res.json({ ok: true, now: Date.now() });
});

app.post('/api/rooms', (req, res) => {
  log('HTTP_CREATE_ROOM_REQUEST', { body: req.body || {}, ip: req.ip });
  try {
    const { room, playerColor } = rooms.createRoom(req.body || {});
    log('HTTP_CREATE_ROOM_SUCCESS', { room: roomSummary(room), playerColor });
    res.status(201).json({ roomId: room.roomId, playerColor, room: rooms.getRoomPublic(room) });
  } catch (err) {
    warn('HTTP_CREATE_ROOM_FAIL', { message: err.message, body: req.body || {} });
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/rooms/:roomId/join', (req, res) => {
  log('HTTP_JOIN_ROOM_REQUEST', { roomId: String(req.params.roomId || '').trim().toUpperCase(), body: req.body || {}, ip: req.ip });
  try {
    const roomId = String(req.params.roomId || '').trim().toUpperCase();
    const { room, playerColor, rejoin } = rooms.joinRoom(roomId, req.body || {});
    const publicRoom = rooms.getRoomPublic(room);
    log('HTTP_JOIN_ROOM_SUCCESS', { room: roomSummary(room), playerColor, rejoin });
    broadcastRoom(room, { type: 'room_state', room: publicRoom });
    res.json({ roomId, playerColor, rejoin, room: publicRoom });
  } catch (err) {
    warn('HTTP_JOIN_ROOM_FAIL', { message: err.message, roomId: String(req.params.roomId || '').trim().toUpperCase(), body: req.body || {} });
    res.status(400).json({ error: err.message });
  }
});


app.get('/api/rooms/:roomId', (req, res) => {
  const roomId = String(req.params.roomId || '').trim().toUpperCase();
  log('HTTP_GET_ROOM_REQUEST', { roomId, query: req.query || {}, ip: req.ip });
  try {
    const playerId = req.query && req.query.playerId ? String(req.query.playerId) : '';
    const playerToken = req.query && req.query.playerToken ? String(req.query.playerToken) : '';
    const auth = rooms.authenticateRoomPlayer(roomId, playerId, playerToken);
    const publicRoom = rooms.getRoomPublic(auth.room);
    log('HTTP_GET_ROOM_SUCCESS', { room: roomSummary(auth.room), playerColor: auth.color });
    res.json({ roomId, playerColor: auth.color, room: publicRoom });
  } catch (err) {
    warn('HTTP_GET_ROOM_FAIL', { message: err.message, roomId, query: req.query || {} });
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/matchmaking/quick', (req, res) => {
  log('HTTP_QUICK_MATCH_REQUEST', { body: req.body || {}, ip: req.ip });
  try {
    const { room, playerColor, matched } = rooms.enqueueQuickMatch(req.body || {});
    const publicRoom = rooms.getRoomPublic(room);
    log('HTTP_QUICK_MATCH_SUCCESS', { room: roomSummary(room), playerColor, matched });
    broadcastRoom(room, { type: 'room_state', room: publicRoom });
    res.json({ roomId: room.roomId, playerColor, matched, room: publicRoom });
  } catch (err) {
    warn('HTTP_QUICK_MATCH_FAIL', { message: err.message, body: req.body || {} });
    res.status(400).json({ error: err.message });
  }
});

const server = app.listen(PORT, () => {
  log('SERVER_LISTENING', { port: PORT, corsOrigin: CORS_ORIGIN, roomExpireMs: ROOM_EXPIRE_MS, matchQueueExpireMs: MATCH_QUEUE_EXPIRE_MS });
});

const wss = new WebSocketServer({ server, path: '/ws' });


function tryAutoSubscribe(ws, trigger = 'connection_open') {
  const playerId = ws && ws.playerId ? String(ws.playerId) : '';
  const playerToken = ws && ws.playerToken ? String(ws.playerToken) : '';
  if (!playerId || !playerToken) return false;
  const mappedRoomId = rooms.playerRoom.get(playerId);
  log('WS_AUTO_SUBSCRIBE_CHECK', { trigger, playerId, mappedRoomId: mappedRoomId || null, currentRoomId: ws.roomId || null });
  if (!mappedRoomId) return false;
  try {
    const auth = rooms.authenticateRoomPlayer(mappedRoomId, playerId, playerToken);
    rooms.attachSocketToPlayer(mappedRoomId, auth.color, ws);
    rooms.subscribeRoom(mappedRoomId, ws);
    ws.roomId = mappedRoomId;
    log('WS_AUTO_SUBSCRIBE_SUCCESS', { trigger, roomId: mappedRoomId, playerId, color: auth.color, room: roomSummary(auth.room) });
    safeJson(ws, { type: 'room_joined', roomId: mappedRoomId, color: auth.color });
    safeJson(ws, { type: 'room_state', room: rooms.getRoomPublic(auth.room) });
    broadcastRoom(auth.room, { type: 'presence', roomId: mappedRoomId, playerId, online: true });
    return true;
  } catch (err) {
    warn('WS_AUTO_SUBSCRIBE_FAIL', { trigger, playerId, mappedRoomId, error: err && err.message ? err.message : String(err) });
    return false;
  }
}


wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const playerId = url.searchParams.get('playerId') || '';
  const playerToken = url.searchParams.get('playerToken') || '';
  ws.playerId = playerId;
  ws.playerToken = playerToken;
  ws.roomId = '';
  ws.isAlive = true;

  const previousWs = playerId ? activeSocketsByPlayer.get(playerId) : null;
  if (previousWs && previousWs !== ws) {
    try {
      rooms.unsubscribeSocket(previousWs);
      if (typeof previousWs.terminate === 'function') previousWs.terminate();
      else if (typeof previousWs.close === 'function') previousWs.close(4001, 'replaced_by_new_connection');
    } catch (err) {}
  }
  if (playerId) activeSocketsByPlayer.set(playerId, ws);

  log('WS_CONNECTION_OPEN', { playerId, playerTokenPresent: !!playerToken, remote: req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : null, replacedExisting: !!previousWs });
  safeJson(ws, { type: 'hello', playerId });
  tryAutoSubscribe(ws, 'connection_open');

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
      warn('WS_MESSAGE_PARSE_FAIL', { playerId: ws.playerId || null, raw: buffer.toString() });
      safeJson(ws, { type: 'error', message: '消息不是合法 JSON' });
      return;
    }

    try {
      if (message.type === 'ping') {
        log('WS_PING', { playerId: ws.playerId || null, roomId: ws.roomId || null });
        safeJson(ws, { type: 'pong', ts: Date.now() });
        return;
      }

      if (message.type === 'subscribe_room') {
        const roomId = String(message.roomId || '').trim().toUpperCase();
        if (ws.roomId && ws.roomId === roomId) {
          log('WS_SUBSCRIBE_ROOM_DUPLICATE_IGNORED', { roomId, playerId: ws.playerId || null });
          return;
        }
        const auth = rooms.authenticateRoomPlayer(roomId, ws.playerId, ws.playerToken);
        rooms.attachSocketToPlayer(roomId, auth.color, ws);
        rooms.subscribeRoom(roomId, ws);
        ws.roomId = roomId;
        log('WS_SUBSCRIBE_ROOM_SUCCESS', { roomId, playerId: ws.playerId || null, color: auth.color, room: roomSummary(auth.room) });
        safeJson(ws, { type: 'room_joined', roomId, color: auth.color });
        safeJson(ws, { type: 'room_state', room: rooms.getRoomPublic(auth.room) });
        broadcastRoom(auth.room, { type: 'presence', roomId, playerId: ws.playerId, online: true });
        return;
      }

      if (message.type === 'action') {
        const roomId = String(message.roomId || ws.roomId || '').trim().toUpperCase();
        const { room, snapshot } = rooms.applyAction(roomId, ws.playerId, ws.playerToken, message.action || {});
        log('WS_ACTION_SUCCESS', { roomId, playerId: ws.playerId || null, snapshotVersion: snapshot.version });
        broadcastRoom(room, { type: 'room_state', room: rooms.getRoomPublic(room), actionAccepted: true, snapshotVersion: snapshot.version });
        return;
      }

      warn('WS_UNKNOWN_MESSAGE_TYPE', { playerId: ws.playerId || null, type: message.type });
      safeJson(ws, { type: 'error', message: `未知消息类型: ${message.type}` });
    } catch (err) {
      error('WS_MESSAGE_HANDLE_FAIL', { playerId: ws.playerId || null, roomId: ws.roomId || null, message, error: err.message || String(err) });
      safeJson(ws, { type: 'error', message: err.message || '服务器处理失败' });
    }
  });

  ws.on('close', () => {
    if (ws.playerId && activeSocketsByPlayer.get(ws.playerId) === ws) {
      activeSocketsByPlayer.delete(ws.playerId);
    }
    log('WS_CONNECTION_CLOSE', { playerId: ws.playerId || null, roomId: ws.roomId || null });
    const roomId = ws.roomId;
    const releasedRooms = rooms.unsubscribeSocket(ws);
    const released = roomId ? releasedRooms.find((item) => item.roomId === roomId) : null;

    if (released && released.deleted) {
      log('WS_CLOSE_RELEASED_WAITING_ROOM', released);
      return;
    }

    if (roomId && rooms.rooms.has(roomId)) {
      const room = rooms.rooms.get(roomId);
      log('WS_CLOSE_ROOM_STILL_EXISTS', { roomId, room: roomSummary(room) });
      broadcastRoom(room, { type: 'presence', roomId, playerId: ws.playerId, online: false });
      broadcastRoom(room, { type: 'room_state', room: rooms.getRoomPublic(room) });
    }
  });

  ws.on('error', (err) => {
    error('WS_CONNECTION_ERROR', { playerId: ws.playerId || null, roomId: ws.roomId || null, error: err && err.message ? err.message : String(err) });
  });
});

setInterval(() => {
  log('SERVER_TICK_BEGIN', { clientCount: wss.clients.size, roomCount: rooms.rooms.size });
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      warn('WS_HEARTBEAT_TERMINATE', { playerId: ws.playerId || null, roomId: ws.roomId || null });
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    log('WS_HEARTBEAT_PING', { playerId: ws.playerId || null, roomId: ws.roomId || null });
    ws.ping();
  }

  const updates = rooms.tickTimeouts();
  updates.forEach((room) => {
    broadcastRoom(room, { type: 'room_state', room: rooms.getRoomPublic(room) });
  });
  rooms.cleanup();
  log('SERVER_TICK_END', { clientCount: wss.clients.size, roomCount: rooms.rooms.size });
}, 5000);
