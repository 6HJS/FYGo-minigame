import { customAlphabet } from 'nanoid';
import AuthoritativeEngine, { COLORS } from './game/engine.js';
import { log, warn, roomSummary, mapEntries } from './logger.js';

const roomIdGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

function now() {
  return Date.now();
}

function cloneData(data) {
  return data == null ? data : JSON.parse(JSON.stringify(data));
}

class FullSyncState {
  constructor({ turnTimeMs = 30000, snapshot = null, version = 1 } = {}) {
    this.turnTimeMs = Number(turnTimeMs || 30000);
    this.version = Number(version || 1);
    this.data = snapshot && typeof snapshot === 'object'
      ? cloneData(snapshot)
      : {
          size: 9,
          board: [],
          currentPlayer: 'black',
          turnNumber: 1,
          moveNumber: 0,
          captures: { black: 0, white: 0 },
          passCount: 0,
          phase: 'waiting',
          winner: null,
          endedReason: null,
          deadlineAt: null,
          version: this.version
        };
    if (!this.data.version) this.data.version = this.version;
  }

  snapshot() {
    return cloneData(this.data);
  }

  start() {
    this.data.phase = 'playing';
    if (!this.data.deadlineAt) this.data.deadlineAt = Date.now() + this.turnTimeMs;
    this.version = Math.max(this.version, Number(this.data.version || 0));
    this.data.version = this.version;
    return this.snapshot();
  }

  applySyncState(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('缺少完整状态快照');
    const next = cloneData(snapshot);
    this.version = Math.max(this.version + 1, Number(next.version || 0) || 0);
    next.version = this.version;
    if (next.phase === 'playing' && !next.deadlineAt) {
      next.deadlineAt = Date.now() + this.turnTimeMs;
    }
    this.data = next;
    return this.snapshot();
  }

  applyAction(action) {
    if (!action || typeof action !== 'object') throw new Error('非法 action');
    if (action.type !== 'sync_state') throw new Error(`未知 action: ${action.type}`);
    return this.applySyncState(action.snapshot || action.state || action.fullState);
  }

  forceTimeoutLose(color) {
    if (this.data.phase !== 'playing') return this.snapshot();
    this.version += 1;
    this.data.phase = 'ended';
    this.data.endedReason = 'timeout';
    this.data.winner = color === 'black' ? 'white' : 'black';
    this.data.deadlineAt = null;
    this.data.version = this.version;
    return this.snapshot();
  }
}

export default class RoomManager {
  constructor({ roomExpireMs = 2 * 60 * 60 * 1000, matchQueueExpireMs = 60000 } = {}) {
    this.rooms = new Map();
    this.playerRoom = new Map();
    this.queue = [];
    this.roomExpireMs = roomExpireMs;
    this.matchQueueExpireMs = matchQueueExpireMs;
    log('ROOM_MANAGER_INIT', { roomExpireMs, matchQueueExpireMs });
  }

  normalizePlayer(playerId, playerToken) {
    if (!playerId || !playerToken) {
      warn('NORMALIZE_PLAYER_FAIL', { playerId: !!playerId, playerToken: !!playerToken });
      throw new Error('缺少 playerId 或 playerToken');
    }
    return { playerId: String(playerId), playerToken: String(playerToken) };
  }


  forceDisconnectPlayer(playerId, reason = 'force_takeover') {
    const normalizedPlayerId = playerId ? String(playerId) : '';
    if (!normalizedPlayerId) return null;
    const roomId = this.playerRoom.get(normalizedPlayerId);
    log('FORCE_DISCONNECT_PLAYER_REQUEST', { playerId: normalizedPlayerId, roomId: roomId || null, reason });
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerRoom.delete(normalizedPlayerId);
      log('FORCE_DISCONNECT_PLAYER_STALE_MAPPING_CLEARED', { playerId: normalizedPlayerId, roomId, reason, playerRoom: mapEntries(this.playerRoom) });
      return { roomId, deleted: false, stale: true };
    }

    let targetColor = null;
    if (room.players.black && room.players.black.playerId === normalizedPlayerId) {
      targetColor = COLORS.BLACK;
    } else if (room.players.white && room.players.white.playerId === normalizedPlayerId) {
      targetColor = COLORS.WHITE;
    }

    if (!targetColor) {
      this.playerRoom.delete(normalizedPlayerId);
      log('FORCE_DISCONNECT_PLAYER_MAPPING_ONLY_CLEARED', { playerId: normalizedPlayerId, roomId, reason, playerRoom: mapEntries(this.playerRoom) });
      return { roomId, deleted: false, detachedOnly: true };
    }

    const seat = room.players[targetColor];
    const seatWs = seat && seat.ws ? seat.ws : null;
    if (seatWs) {
      room.subscribers.delete(seatWs);
      seatWs.roomId = '';
      if (typeof seatWs.close === 'function') {
        try {
          seatWs.close(4001, 'force_takeover');
        } catch (err) {
          warn('FORCE_DISCONNECT_PLAYER_SOCKET_CLOSE_FAIL', { playerId: normalizedPlayerId, roomId, reason, error: err && err.message ? err.message : String(err) });
        }
      }
    }
    seat.online = false;
    seat.ws = null;
    room.updatedAt = now();

    this.playerRoom.delete(normalizedPlayerId);
    this.queue = this.queue.filter((item) => item.playerId !== normalizedPlayerId);

    if (room.phase === 'waiting') {
      if (room.players.black) this.playerRoom.delete(room.players.black.playerId);
      if (room.players.white) this.playerRoom.delete(room.players.white.playerId);
      room.subscribers.clear();
      this.rooms.delete(roomId);
      log('FORCE_DISCONNECT_PLAYER_WAITING_ROOM_DELETED', { playerId: normalizedPlayerId, roomId, reason, playerRoom: mapEntries(this.playerRoom), queueLength: this.queue.length });
      return { roomId, deleted: true, waiting: true };
    }

    log('FORCE_DISCONNECT_PLAYER_PLAYING_ROOM_DETACHED', { playerId: normalizedPlayerId, roomId, color: targetColor, reason, room: roomSummary(room), playerRoom: mapEntries(this.playerRoom) });
    return { roomId, deleted: false, waiting: false, color: targetColor };
  }

  createRoom({ playerId, playerToken, boardId = 'board_9x9', turnTimeMs = 30000, forceTakeover = true }) {
    const player = this.normalizePlayer(playerId, playerToken);
    this.cleanup();
    log('CREATE_ROOM_REQUEST', { playerId: player.playerId, boardId, turnTimeMs, forceTakeover, currentPlayerRoom: this.playerRoom.get(player.playerId) || null });
    if (this.playerRoom.has(player.playerId)) {
      if (forceTakeover) {
        this.forceDisconnectPlayer(player.playerId, 'create_room_force_takeover');
      } else {
        warn('CREATE_ROOM_BLOCKED_ALREADY_IN_ROOM', { playerId: player.playerId, roomId: this.playerRoom.get(player.playerId) });
        throw new Error('该玩家已经在房间中');
      }
    }

    const roomId = roomIdGen();
    const size = this.getBoardSize(boardId);
    const room = {
      roomId,
      mode: 'room',
      phase: 'waiting',
      boardId,
      createdAt: now(),
      updatedAt: now(),
      turnTimeMs,
      players: {
        black: { playerId: player.playerId, playerToken: player.playerToken, online: false },
        white: null
      },
      state: new AuthoritativeEngine({ size, turnTimeMs }),
      subscribers: new Set()
    };
    this.rooms.set(roomId, room);
    this.playerRoom.set(player.playerId, roomId);
    log('CREATE_ROOM_SUCCESS', { room: roomSummary(room), playerRoom: mapEntries(this.playerRoom) });
    return { room, playerColor: COLORS.BLACK };
  }

  joinRoom(roomId, { playerId, playerToken, forceTakeover = true }) {
    const player = this.normalizePlayer(playerId, playerToken);
    this.cleanup();
    const room = this.rooms.get(roomId);
    log('JOIN_ROOM_REQUEST', { roomId, playerId: player.playerId, forceTakeover, existingPlayerRoom: this.playerRoom.get(player.playerId) || null });
    if (!room) throw new Error('房间不存在');
    if (room.phase === 'ended') throw new Error('房间已结束');
    if (this.playerRoom.has(player.playerId) && this.playerRoom.get(player.playerId) !== roomId) {
      if (forceTakeover) {
        this.forceDisconnectPlayer(player.playerId, 'join_room_force_takeover');
      } else {
        throw new Error('该玩家已经在其他房间中');
      }
    }

    if (room.players.black && room.players.black.playerId === player.playerId) {
      log('JOIN_ROOM_REJOIN_BLACK', { room: roomSummary(room), playerId: player.playerId });
      return { room, playerColor: COLORS.BLACK, rejoin: true };
    }
    if (room.players.white && room.players.white.playerId === player.playerId) {
      log('JOIN_ROOM_REJOIN_WHITE', { room: roomSummary(room), playerId: player.playerId });
      return { room, playerColor: COLORS.WHITE, rejoin: true };
    }

    if (room.players.white) throw new Error('房间已满');
    room.players.white = { playerId: player.playerId, playerToken: player.playerToken, online: false };
    room.phase = 'playing';
    room.state.start();
    room.updatedAt = now();
    this.playerRoom.set(player.playerId, roomId);
    log('JOIN_ROOM_SUCCESS', { room: roomSummary(room), playerId: player.playerId, playerRoom: mapEntries(this.playerRoom) });
    return { room, playerColor: COLORS.WHITE, rejoin: false };
  }

  enqueueQuickMatch({ playerId, playerToken, boardId = 'board_9x9', turnTimeMs = 30000, forceTakeover = true }) {
    const player = this.normalizePlayer(playerId, playerToken);
    this.cleanup();
    log('QUICK_MATCH_REQUEST', { playerId: player.playerId, boardId, turnTimeMs, forceTakeover, currentPlayerRoom: this.playerRoom.get(player.playerId) || null });
    if (this.playerRoom.has(player.playerId)) {
      if (forceTakeover) {
        this.forceDisconnectPlayer(player.playerId, 'quick_match_force_takeover');
      } else {
        warn('CREATE_ROOM_BLOCKED_ALREADY_IN_ROOM', { playerId: player.playerId, roomId: this.playerRoom.get(player.playerId) });
        throw new Error('该玩家已经在房间中');
      }
    }

    const candidateIndex = this.queue.findIndex((item) => item.boardId === boardId && item.turnTimeMs === turnTimeMs && item.playerId !== player.playerId);
    if (candidateIndex >= 0) {
      const candidate = this.queue.splice(candidateIndex, 1)[0];
      const { room } = this.createRoom({
        playerId: candidate.playerId,
        playerToken: candidate.playerToken,
        boardId,
        turnTimeMs
      });
      const joinResult = this.joinRoom(room.roomId, player);
      log('QUICK_MATCH_MATCHED', { candidatePlayerId: candidate.playerId, playerId: player.playerId, room: roomSummary(joinResult.room), queueLength: this.queue.length });
      return {
        room: joinResult.room,
        playerColor: joinResult.playerColor,
        matched: true
      };
    }

    this.queue.push({ ...player, boardId, turnTimeMs, queuedAt: now() });
    log('QUICK_MATCH_ENQUEUED', { playerId: player.playerId, queue: this.queue.map((item) => ({ playerId: item.playerId, boardId: item.boardId, turnTimeMs: item.turnTimeMs, queuedAt: item.queuedAt })) });
    const { room, playerColor } = this.createRoom({ playerId: player.playerId, playerToken: player.playerToken, boardId, turnTimeMs });
    return { room, playerColor, matched: false };
  }

  authenticateRoomPlayer(roomId, playerId, playerToken) {
    const room = this.rooms.get(roomId);
    log('AUTHENTICATE_ROOM_PLAYER_REQUEST', { roomId, playerId: playerId || null, existingPlayerRoom: playerId ? (this.playerRoom.get(playerId) || null) : null });
    if (!room) throw new Error('房间不存在');
    if (room.players.black && room.players.black.playerId === playerId && room.players.black.playerToken === playerToken) {
      return { room, color: COLORS.BLACK };
    }
    if (room.players.white && room.players.white.playerId === playerId && room.players.white.playerToken === playerToken) {
      return { room, color: COLORS.WHITE };
    }
    warn('AUTHENTICATE_ROOM_PLAYER_FAIL', { roomId, playerId });
    throw new Error('玩家鉴权失败');
  }

  subscribeRoom(roomId, ws) {
    const room = this.rooms.get(roomId);
    log('SUBSCRIBE_ROOM_REQUEST', { roomId, playerId: ws && ws.playerId ? ws.playerId : null, existingPlayerRoom: ws && ws.playerId ? (this.playerRoom.get(ws.playerId) || null) : null });
    if (!room) throw new Error('房间不存在');
    this.detachOtherSocketsForPlayer(ws && ws.playerId ? ws.playerId : '', ws);
    room.subscribers.delete(ws);
    room.subscribers.add(ws);
    log('SUBSCRIBE_ROOM', { roomId, playerId: ws.playerId || null, subscribers: room.subscribers.size });
    return room;
  }

  unsubscribeSocket(ws) {
    const releasedRooms = [];
    log('UNSUBSCRIBE_SOCKET_BEGIN', { playerId: ws.playerId || null, roomId: ws.roomId || null });
    for (const [roomId, room] of this.rooms.entries()) {
      room.subscribers.delete(ws);
      let disconnectedColor = '';
      if (room.players.black && room.players.black.ws === ws) {
        room.players.black.online = false;
        room.players.black.ws = null;
        disconnectedColor = COLORS.BLACK;
        log('SOCKET_DETACHED_BLACK', { roomId, playerId: ws.playerId || null });
      }
      if (room.players.white && room.players.white.ws === ws) {
        room.players.white.online = false;
        room.players.white.ws = null;
        disconnectedColor = COLORS.WHITE;
        log('SOCKET_DETACHED_WHITE', { roomId, playerId: ws.playerId || null });
      }

      if (!disconnectedColor) continue;

      room.updatedAt = now();

      if (room.phase === 'waiting') {
        if (room.players.black) this.playerRoom.delete(room.players.black.playerId);
        if (room.players.white) this.playerRoom.delete(room.players.white.playerId);
        this.queue = this.queue.filter((item) => item.playerId !== ws.playerId);
        this.rooms.delete(roomId);
        log('WAITING_ROOM_RELEASED_ON_DISCONNECT', { roomId, disconnectedColor, playerId: ws.playerId || null, playerRoom: mapEntries(this.playerRoom), queueLength: this.queue.length });
        releasedRooms.push({ roomId, disconnectedColor, deleted: true });
        continue;
      }

      log('PLAYING_ROOM_SOCKET_RELEASED', { roomId, disconnectedColor, playerId: ws.playerId || null, room: roomSummary(room) });
      releasedRooms.push({ roomId, disconnectedColor, deleted: false, room });
    }
    log('UNSUBSCRIBE_SOCKET_END', { playerId: ws.playerId || null, releasedRooms, playerRoom: mapEntries(this.playerRoom) });
    return releasedRooms;
  }


  detachOtherSocketsForPlayer(playerId, keepWs = null) {
    if (!playerId) return 0;
    let removed = 0;
    for (const [scanRoomId, scanRoom] of this.rooms.entries()) {
      for (const subscriber of Array.from(scanRoom.subscribers)) {
        if (!subscriber || subscriber === keepWs) continue;
        if (subscriber.playerId !== playerId) continue;
        scanRoom.subscribers.delete(subscriber);
        if (scanRoom.players.black && scanRoom.players.black.ws === subscriber) {
          scanRoom.players.black.ws = null;
          scanRoom.players.black.online = false;
        }
        if (scanRoom.players.white && scanRoom.players.white.ws === subscriber) {
          scanRoom.players.white.ws = null;
          scanRoom.players.white.online = false;
        }
        try {
          subscriber.roomId = '';
          if (typeof subscriber.terminate === 'function') subscriber.terminate();
          else if (typeof subscriber.close === 'function') subscriber.close(4001, 'replaced_by_new_socket');
        } catch (err) {}
        removed += 1;
      }
    }
    return removed;
  }

  attachSocketToPlayer(roomId, color, ws) {
    const room = this.rooms.get(roomId);
    log('ATTACH_SOCKET_TO_PLAYER_REQUEST', { roomId, color, playerId: ws && ws.playerId ? ws.playerId : null, existingPlayerRoom: ws && ws.playerId ? (this.playerRoom.get(ws.playerId) || null) : null });
    if (!room) throw new Error('房间不存在');
    const seat = room.players[color];
    if (!seat) throw new Error('该座位没有玩家');

    const removed = this.detachOtherSocketsForPlayer(ws && ws.playerId ? ws.playerId : '', ws);
    if (removed) {
      log('ATTACH_SOCKET_TO_PLAYER_CLEARED_OLD', { roomId, color, playerId: ws && ws.playerId ? ws.playerId : null, removed });
    }
    for (const scanRoom of this.rooms.values()) {
      scanRoom.subscribers.delete(ws);
    }

    seat.ws = ws;
    seat.online = true;
    room.subscribers.add(ws);
    room.updatedAt = now();
    log('ATTACH_SOCKET_TO_PLAYER', { roomId, color, playerId: seat.playerId, subscribers: room.subscribers.size });
    return room;
  }

  applyAction(roomId, playerId, playerToken, action) {
    const { room, color } = this.authenticateRoomPlayer(roomId, playerId, playerToken);
    log('APPLY_ACTION_REQUEST', { roomId, playerId, color, actionType: action && action.type ? action.type : null, action });
    let snapshot = null;

    if (action && action.type === 'sync_state') {
      if (!(room.state instanceof FullSyncState)) {
        room.state = new FullSyncState({
          turnTimeMs: room.turnTimeMs,
          snapshot: room.state && typeof room.state.snapshot === 'function' ? room.state.snapshot() : room.state
        });
      }
      snapshot = room.state.applySyncState(action.snapshot || action.state || action.fullState);
    } else {
      snapshot = room.state.applyAction({ ...action, playerColor: color });
    }

    room.updatedAt = now();
    room.phase = snapshot.phase === 'ended' ? 'ended' : (room.players.white ? 'playing' : room.phase);
    log('APPLY_ACTION_SUCCESS', { roomId, playerId, color, phase: room.phase, snapshotVersion: snapshot.version, currentPlayer: snapshot.currentPlayer });
    return { room, color, snapshot };
  }

  getRoomPublic(room) {
    return {
      roomId: room.roomId,
      mode: room.mode,
      phase: room.phase,
      boardId: room.boardId,
      turnTimeMs: room.turnTimeMs,
      players: {
        black: room.players.black ? { playerId: room.players.black.playerId, online: !!room.players.black.online } : null,
        white: room.players.white ? { playerId: room.players.white.playerId, online: !!room.players.white.online } : null
      },
      state: room.state && typeof room.state.snapshot === 'function' ? room.state.snapshot() : cloneData(room.state)
    };
  }

  cleanup() {
    const threshold = now() - this.matchQueueExpireMs;
    const oldQueueLength = this.queue.length;
    this.queue = this.queue.filter((item) => item.queuedAt >= threshold);
    if (this.queue.length !== oldQueueLength) {
      log('CLEANUP_QUEUE_EXPIRED', { before: oldQueueLength, after: this.queue.length, queue: this.queue.map((item) => ({ playerId: item.playerId, boardId: item.boardId, turnTimeMs: item.turnTimeMs, queuedAt: item.queuedAt })) });
    }

    for (const [roomId, room] of this.rooms.entries()) {
      if (room.updatedAt >= now() - this.roomExpireMs) continue;
      this.rooms.delete(roomId);
      if (room.players.black) this.playerRoom.delete(room.players.black.playerId);
      if (room.players.white) this.playerRoom.delete(room.players.white.playerId);
      log('CLEANUP_ROOM_EXPIRED', { roomId, playerRoom: mapEntries(this.playerRoom) });
    }
  }

  tickTimeouts() {
    const updates = [];
    for (const room of this.rooms.values()) {
      if (room.phase !== 'playing') continue;
      const state = room.state.snapshot();
      if (!state.deadlineAt || Date.now() < state.deadlineAt) continue;
      const loser = state.currentPlayer;
      room.state.forceTimeoutLose(loser);
      room.phase = 'ended';
      room.updatedAt = now();
      if (room.players.black && !room.players.black.online && !room.players.black.ws && this.playerRoom.get(room.players.black.playerId) === room.roomId) {
        this.playerRoom.delete(room.players.black.playerId);
      }
      if (room.players.white && !room.players.white.online && !room.players.white.ws && this.playerRoom.get(room.players.white.playerId) === room.roomId) {
        this.playerRoom.delete(room.players.white.playerId);
      }
      log('TURN_TIMEOUT_FORCE_LOSE', { roomId: room.roomId, loser, room: roomSummary(room), playerRoom: mapEntries(this.playerRoom) });
      updates.push(room);
    }
    return updates;
  }

  getBoardSize(boardId) {
    const normalized = String(boardId || '').toLowerCase();
    if (normalized.includes('13')) return 13;
    if (normalized.includes('15')) return 15;
    if (normalized.includes('17')) return 17;
    if (normalized.includes('19')) return 19;
    return 9;
  }
}
