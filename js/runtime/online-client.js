import ONLINE_CONFIG from '../config/online-config';

function randomId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const STORAGE_KEYS = {
  profile: 'fygo_online_profile_v4',
  deviceId: 'fygo_online_device_id_v1'
};

function readStorage(key) {
  try {
    if (typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function') {
      return wx.getStorageSync(key);
    }
  } catch (err) {}
  return '';
}

function writeStorage(key, value) {
  try {
    if (typeof wx !== 'undefined' && wx && typeof wx.setStorageSync === 'function') {
      wx.setStorageSync(key, value);
    }
  } catch (err) {}
}

function getDeviceId() {
  let deviceId = readStorage(STORAGE_KEYS.deviceId);
  if (!deviceId) {
    deviceId = randomId('dev');
    writeStorage(STORAGE_KEYS.deviceId, deviceId);
  }
  return String(deviceId || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(-16);
}

function loadStoredProfile() {
  const raw = readStorage(STORAGE_KEYS.profile);
  if (!raw) return null;
  if (typeof raw === 'object' && raw) return raw;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function saveStoredProfile(profile) {
  if (!profile) return;
  writeStorage(STORAGE_KEYS.profile, profile);
}

function deepClone(data) {
  return data == null ? data : JSON.parse(JSON.stringify(data));
}

function boardIdToSize(boardId = 'board_9x9') {
  const match = String(boardId).match(/(\d+)/);
  const size = match ? Number(match[1]) : 9;
  return Number.isFinite(size) && size > 1 ? size : 9;
}

export default class OnlineClient {
  constructor(config = ONLINE_CONFIG) {
    this.config = config;
    this.deviceId = getDeviceId();
    this.forceTakeover = !this.config || this.config.forceTakeover !== false;

    this.playerId = '';
    this.playerToken = '';
    this.playerColor = '';

    this.desiredRoomId = '';
    this.activeRoomId = '';
    this.currentRoom = null;
    this.lastError = '';
    this.isPolling = false;
    this.pollTimer = null;
    this.pollInFlight = false;

    this.messageHandlers = new Set();
    this.statusHandlers = new Set();

    this.setPlayerProfile({});
  }

  setPlayerProfile(profile = {}) {
    const stored = loadStoredProfile() || {};
    const basePlayerId = profile.basePlayerId || stored.basePlayerId || this.playerId || randomId('player');
    const basePlayerToken = profile.basePlayerToken || stored.basePlayerToken || this.playerToken || randomId('token');
    const cleanId = String(basePlayerId).replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 24) || randomId('player');
    const cleanToken = String(basePlayerToken).replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 24) || randomId('token');
    this.playerId = `${cleanId}_${this.deviceId}`;
    this.playerToken = `${cleanToken}_${this.deviceId}`;
    saveStoredProfile({ basePlayerId: cleanId, basePlayerToken: cleanToken });
  }

  onMessage(handler) { if (typeof handler === 'function') this.messageHandlers.add(handler); }
  offMessage(handler) { this.messageHandlers.delete(handler); }
  onStatus(handler) { if (typeof handler === 'function') this.statusHandlers.add(handler); }
  offStatus(handler) { this.statusHandlers.delete(handler); }

  emitMessage(payload) {
    this.messageHandlers.forEach((handler) => { try { handler(payload); } catch (err) {} });
  }
  emitStatus(payload) {
    this.statusHandlers.forEach((handler) => { try { handler(payload); } catch (err) {} });
  }

  request(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const useContainer = !!(this.config && this.config.useCloudContainerForHttp);
      const timeout = this.config && this.config.requestTimeoutMs ? this.config.requestTimeoutMs : 8000;
      const commonHeader = {
        'content-type': 'application/json'
      };
      if (this.config && this.config.cloudService) {
        commonHeader['X-WX-SERVICE'] = this.config.cloudService;
      }

      const onSuccess = (res) => {
        const statusCode = res && typeof res.statusCode === 'number' ? res.statusCode : 200;
        if (statusCode < 200 || statusCode >= 300) {
          const bodyMessage = res && res.data && (res.data.message || res.data.error || res.data.errMsg);
          reject(new Error(bodyMessage || `HTTP ${statusCode}`));
          return;
        }
        resolve((res && res.data) || {});
      };

      const onFail = (err) => {
        reject(err || new Error('网络请求失败'));
      };

      if (useContainer) {
        if (!wx || !wx.cloud || typeof wx.cloud.callContainer !== 'function') {
          reject(new Error('当前环境不支持 wx.cloud.callContainer，请确认已初始化云能力'));
          return;
        }
        wx.cloud.callContainer({
          config: { env: this.config.cloudEnv },
          path,
          method,
          data,
          header: commonHeader,
          timeout,
          success: onSuccess,
          fail: onFail
        });
        return;
      }

      if (!wx || typeof wx.request !== 'function') {
        reject(new Error('当前环境不支持网络请求'));
        return;
      }
      wx.request({
        url: `${this.config.httpBaseUrl}${path}`,
        method,
        data,
        timeout,
        header: commonHeader,
        success: onSuccess,
        fail: onFail
      });
    });
  }

  resetSessionState({ clearDesiredRoom = false } = {}) {
    this.activeRoomId = '';
    this.currentRoom = null;
    this.playerColor = '';
    if (clearDesiredRoom) this.desiredRoomId = '';
  }

  stopPolling() {
    this.isPolling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  scheduleNextPoll() {
    if (!this.isPolling || !this.desiredRoomId) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    const delay = Math.max(500, Number(this.config.pollIntervalMs || 1000));
    this.pollTimer = setTimeout(() => this.pollLoop(), delay);
  }

  async pollLoop() {
    if (!this.isPolling || !this.desiredRoomId || this.pollInFlight) {
      this.scheduleNextPoll();
      return;
    }
    this.pollInFlight = true;
    try {
      const result = await this.fetchRoomState(this.desiredRoomId);
      if (result && result.room) {
        this.emitMessage({ type: 'room_state', room: result.room, via: 'poll' });
        this.emitStatus({ type: 'subscribed', roomId: this.activeRoomId, color: this.playerColor });
      }
    } catch (err) {
      this.lastError = err && err.message ? err.message : '同步失败';
      this.emitStatus({ type: 'server_error', message: this.lastError });
    } finally {
      this.pollInFlight = false;
      this.scheduleNextPoll();
    }
  }

  startPolling(roomId) {
    this.desiredRoomId = String(roomId || '').trim().toUpperCase();
    if (!this.desiredRoomId) return;
    this.isPolling = true;
    this.emitStatus({ type: 'socket_open' });
    this.emitStatus({ type: 'auth_ok' });
    this.scheduleNextPoll();
  }

  disconnect(reason = 'manual_disconnect') {
    this.stopPolling();
    this.resetSessionState({ clearDesiredRoom: false });
    this.emitStatus({ type: 'socket_close', reason, manual: true });
  }

  destroy() {
    this.stopPolling();
    this.desiredRoomId = '';
  }

  async fetchRoomState(roomId) {
    const normalizedRoomId = String(roomId || this.desiredRoomId || '').trim().toUpperCase();
    if (!normalizedRoomId) throw new Error('缺少房间号');
    const query = `playerId=${encodeURIComponent(this.playerId)}&playerToken=${encodeURIComponent(this.playerToken)}`;
    const result = await this.request(`/api/rooms/${normalizedRoomId}?${query}`, 'GET');
    if (result && result.room) {
      this.currentRoom = deepClone(result.room);
      this.activeRoomId = normalizedRoomId;
    }
    if (result && result.playerColor) this.playerColor = result.playerColor;
    return result;
  }

  async createRoom({ boardId = 'board_9x9', turnTimeMs = 30000 } = {}) {
    this.stopPolling();
    this.resetSessionState({ clearDesiredRoom: true });
    const result = await this.request('/api/rooms', 'POST', {
      playerId: this.playerId,
      playerToken: this.playerToken,
      boardId,
      turnTimeMs,
      mode: 'room',
      forceTakeover: this.forceTakeover,
      deviceId: this.deviceId,
      testMultiLogin: true
    });
    this.playerColor = result.playerColor || 'black';
    const roomId = result.roomId || (result.room && result.room.roomId) || '';
    this.startPolling(roomId);
    const state = await this.fetchRoomState(roomId);
    return {
      roomId,
      playerColor: this.playerColor,
      room: state && state.room ? state.room : (result.room || null)
    };
  }

  async joinRoom(roomId) {
    this.stopPolling();
    this.resetSessionState({ clearDesiredRoom: true });
    const normalizedRoomId = String(roomId || '').trim().toUpperCase();
    const result = await this.request(`/api/rooms/${normalizedRoomId}/join`, 'POST', {
      playerId: this.playerId,
      playerToken: this.playerToken,
      forceTakeover: this.forceTakeover,
      deviceId: this.deviceId,
      testMultiLogin: true
    });
    this.playerColor = result.playerColor || 'white';
    this.startPolling(normalizedRoomId);
    const state = await this.fetchRoomState(normalizedRoomId);
    return {
      roomId: normalizedRoomId,
      playerColor: this.playerColor,
      room: state && state.room ? state.room : (result.room || null)
    };
  }

  async quickMatch({ boardId = 'board_9x9', turnTimeMs = 30000 } = {}) {
    this.stopPolling();
    this.resetSessionState({ clearDesiredRoom: true });
    const result = await this.request('/api/matchmaking/quick', 'POST', {
      playerId: this.playerId,
      playerToken: this.playerToken,
      boardId,
      turnTimeMs,
      forceTakeover: this.forceTakeover,
      deviceId: this.deviceId,
      testMultiLogin: true
    });
    this.playerColor = result.playerColor || 'black';
    const roomId = result.roomId || (result.room && result.room.roomId) || '';
    this.startPolling(roomId);
    const state = await this.fetchRoomState(roomId);
    return {
      roomId,
      playerColor: this.playerColor,
      matched: !!result.matched,
      room: state && state.room ? state.room : (result.room || null)
    };
  }

  async sendAction(action) {
    const roomId = this.activeRoomId || this.desiredRoomId;
    if (!roomId) throw new Error('尚未进入房间');
    const result = await this.request(`/api/rooms/${roomId}/actions`, 'POST', {
      playerId: this.playerId,
      playerToken: this.playerToken,
      action
    });
    if (result && result.room) {
      this.currentRoom = deepClone(result.room);
      this.activeRoomId = roomId;
      this.emitMessage({ type: 'room_state', room: result.room, via: 'action' });
    }
    return result;
  }

  playMove(x, y) { return this.sendAction({ type: 'move', x, y }); }
  pass() { return this.sendAction({ type: 'pass' }); }
  resign() { return this.sendAction({ type: 'resign' }); }

  getBoardSize() {
    const room = this.currentRoom;
    if (room && room.state && room.state.size) return Number(room.state.size);
    return boardIdToSize(room && room.boardId ? room.boardId : 'board_9x9');
  }
}
