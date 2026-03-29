import { customAlphabet } from 'nanoid';
import AuthoritativeEngine, { COLORS } from './game/engine.js';

const roomIdGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

function now() {
  return Date.now();
}

export default class RoomManager {
  constructor({ roomExpireMs = 2 * 60 * 60 * 1000, matchQueueExpireMs = 60000 } = {}) {
    this.rooms = new Map();
    this.playerRoom = new Map();
    this.queue = [];
    this.roomExpireMs = roomExpireMs;
    this.matchQueueExpireMs = matchQueueExpireMs;
  }

  normalizePlayer(playerId, playerToken) {
    if (!playerId || !playerToken) throw new Error('缺少 playerId 或 playerToken');
    return { playerId: String(playerId), playerToken: String(playerToken) };
  }

  createRoom({ playerId, playerToken, boardId = 'board_9x9', turnTimeMs = 30000 }) {
    const player = this.normalizePlayer(playerId, playerToken);
    this.cleanup();
    if (this.playerRoom.has(player.playerId)) throw new Error('该玩家已经在房间中');

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
    return { room, playerColor: COLORS.BLACK };
  }

  joinRoom(roomId, { playerId, playerToken }) {
    const player = this.normalizePlayer(playerId, playerToken);
    this.cleanup();
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('房间不存在');
    if (room.phase === 'ended') throw new Error('房间已结束');
    if (this.playerRoom.has(player.playerId) && this.playerRoom.get(player.playerId) !== roomId) {
      throw new Error('该玩家已经在其他房间中');
    }

    if (room.players.black && room.players.black.playerId === player.playerId) {
      return { room, playerColor: COLORS.BLACK, rejoin: true };
    }
    if (room.players.white && room.players.white.playerId === player.playerId) {
      return { room, playerColor: COLORS.WHITE, rejoin: true };
    }

    if (room.players.white) throw new Error('房间已满');
    room.players.white = { playerId: player.playerId, playerToken: player.playerToken, online: false };
    room.phase = 'playing';
    room.state.start();
    room.updatedAt = now();
    this.playerRoom.set(player.playerId, roomId);
    return { room, playerColor: COLORS.WHITE, rejoin: false };
  }

  enqueueQuickMatch({ playerId, playerToken, boardId = 'board_9x9', turnTimeMs = 30000 }) {
    const player = this.normalizePlayer(playerId, playerToken);
    this.cleanup();
    if (this.playerRoom.has(player.playerId)) throw new Error('该玩家已经在房间中');

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
      return {
        room: joinResult.room,
        playerColor: joinResult.playerColor,
        matched: true
      };
    }

    this.queue.push({ ...player, boardId, turnTimeMs, queuedAt: now() });
    const { room, playerColor } = this.createRoom({ playerId: player.playerId, playerToken: player.playerToken, boardId, turnTimeMs });
    return { room, playerColor, matched: false };
  }

  authenticateRoomPlayer(roomId, playerId, playerToken) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('房间不存在');
    if (room.players.black && room.players.black.playerId === playerId && room.players.black.playerToken === playerToken) {
      return { room, color: COLORS.BLACK };
    }
    if (room.players.white && room.players.white.playerId === playerId && room.players.white.playerToken === playerToken) {
      return { room, color: COLORS.WHITE };
    }
    throw new Error('玩家鉴权失败');
  }

  subscribeRoom(roomId, ws) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('房间不存在');
    room.subscribers.add(ws);
    return room;
  }

  unsubscribeSocket(ws) {
    for (const room of this.rooms.values()) {
      room.subscribers.delete(ws);
      if (room.players.black && room.players.black.ws === ws) {
        room.players.black.online = false;
        room.players.black.ws = null;
      }
      if (room.players.white && room.players.white.ws === ws) {
        room.players.white.online = false;
        room.players.white.ws = null;
      }
    }
  }

  attachSocketToPlayer(roomId, color, ws) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('房间不存在');
    const seat = room.players[color];
    if (!seat) throw new Error('该座位没有玩家');
    seat.ws = ws;
    seat.online = true;
    room.subscribers.add(ws);
    room.updatedAt = now();
    return room;
  }

  applyAction(roomId, playerId, playerToken, action) {
    const { room, color } = this.authenticateRoomPlayer(roomId, playerId, playerToken);
    const snapshot = room.state.applyAction({ ...action, playerColor: color });
    room.updatedAt = now();
    if (snapshot.phase === 'ended') room.phase = 'ended';
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
      state: room.state.snapshot()
    };
  }

  cleanup() {
    const threshold = now() - this.matchQueueExpireMs;
    this.queue = this.queue.filter((item) => item.queuedAt >= threshold);

    for (const [roomId, room] of this.rooms.entries()) {
      if (room.updatedAt >= now() - this.roomExpireMs) continue;
      this.rooms.delete(roomId);
      if (room.players.black) this.playerRoom.delete(room.players.black.playerId);
      if (room.players.white) this.playerRoom.delete(room.players.white.playerId);
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
