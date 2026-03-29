function ts() {
  return new Date().toISOString();
}

function stringifySafe(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

export function log(tag, payload = undefined) {
  if (typeof payload === 'undefined') {
    console.log(`[${ts()}][${tag}]`);
    return;
  }
  console.log(`[${ts()}][${tag}]`, typeof payload === 'string' ? payload : stringifySafe(payload));
}

export function warn(tag, payload = undefined) {
  if (typeof payload === 'undefined') {
    console.warn(`[${ts()}][${tag}]`);
    return;
  }
  console.warn(`[${ts()}][${tag}]`, typeof payload === 'string' ? payload : stringifySafe(payload));
}

export function error(tag, payload = undefined) {
  if (typeof payload === 'undefined') {
    console.error(`[${ts()}][${tag}]`);
    return;
  }
  console.error(`[${ts()}][${tag}]`, typeof payload === 'string' ? payload : stringifySafe(payload));
}

export function roomSummary(room) {
  if (!room) return null;
  return {
    roomId: room.roomId,
    phase: room.phase,
    mode: room.mode,
    boardId: room.boardId,
    turnTimeMs: room.turnTimeMs,
    subscribers: room.subscribers ? room.subscribers.size : 0,
    players: {
      black: room.players && room.players.black ? {
        playerId: room.players.black.playerId,
        online: !!room.players.black.online
      } : null,
      white: room.players && room.players.white ? {
        playerId: room.players.white.playerId,
        online: !!room.players.white.online
      } : null
    }
  };
}

export function mapEntries(mapLike) {
  if (!mapLike || typeof mapLike.entries !== 'function') return [];
  return Array.from(mapLike.entries());
}
