import ONLINE_CONFIG from '../config/online-config';

function randomId(prefix = 'guest') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export default class OnlineClient {
  constructor(config = ONLINE_CONFIG) {
    this.config = config;
    this.socketTask = null;
    this.playerToken = '';
    this.playerId = '';
    this.roomId = '';
    this.playerColor = '';
    this.lastError = '';
    this.lastState = null;
    this.lastEvent = null;
    this.heartbeatTimer = null;
    this.messageHandlers = new Set();
    this.statusHandlers = new Set();
    this.socketReady = false;
    this.pendingMessages = [];
    this.connectPromise = null;
  }

  setPlayerProfile(profile = {}) {
    this.playerId = profile.playerId || this.playerId || randomId('player');
    this.playerToken = profile.playerToken || this.playerToken || randomId('token');
  }

  onMessage(handler) {
    if (typeof handler === 'function') this.messageHandlers.add(handler);
  }

  onStatus(handler) {
    if (typeof handler === 'function') this.statusHandlers.add(handler);
  }

  offMessage(handler) {
    this.messageHandlers.delete(handler);
  }

  offStatus(handler) {
    this.statusHandlers.delete(handler);
  }

  emitMessage(payload) {
    this.messageHandlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {}
    });
  }

  emitStatus(payload) {
    this.statusHandlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {}
    });
  }

  request(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const fallbackToWxRequest = (originalErr) => {
        if (!this.config.httpBaseUrl || !wx || typeof wx.request !== 'function') {
          reject(originalErr || new Error('网络请求失败'));
          return;
        }
        wx.request({
          url: `${this.config.httpBaseUrl}${path}`,
          method,
          data,
          timeout: this.config.requestTimeoutMs,
          header: { 'content-type': 'application/json' },
          success: handleSuccess,
          fail: (fallbackErr) => reject(fallbackErr || originalErr || new Error('网络请求失败'))
        });
      };
      const preferCloudContainer = !!(
        this.config &&
        this.config.useCloudContainerForHttp &&
        wx &&
        wx.cloud &&
        typeof wx.cloud.callContainer === 'function' &&
        this.config.cloudEnv &&
        this.config.cloudService
      );

      const handleSuccess = (res) => {
        const statusCode = res && typeof res.statusCode === 'number' ? res.statusCode : 200;
        if (statusCode < 200 || statusCode >= 300) {
          const bodyMessage = res && res.data && (res.data.message || res.data.error);
          reject(new Error(bodyMessage || `HTTP ${statusCode}`));
          return;
        }
        resolve((res && res.data) || {});
      };

      if (preferCloudContainer) {
        wx.cloud.callContainer({
          config: { env: this.config.cloudEnv },
          path,
          header: {
            'X-WX-SERVICE': this.config.cloudService
          },
          method,
          data,
          success: handleSuccess,
          fail: (err) => fallbackToWxRequest(err)
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
        timeout: this.config.requestTimeoutMs,
        header: {
          'content-type': 'application/json'
        },
        success: handleSuccess,
        fail: (err) => reject(err || new Error('网络请求失败'))
      });
    });
  }

  async connectWebSocket() {
    if (this.socketReady && this.socketTask) return;
    if (this.connectPromise) return this.connectPromise;
    if (!wx || typeof wx.connectSocket !== 'function') {
      throw new Error('当前环境不支持 WebSocket');
    }
    const query = `playerId=${encodeURIComponent(this.playerId)}&playerToken=${encodeURIComponent(this.playerToken)}`;
    const url = `${this.config.wsUrl}?${query}`;

    this.connectPromise = new Promise((resolve, reject) => {
      let settled = false;
      this.socketReady = false;
      this.socketTask = wx.connectSocket({ url });

      this.socketTask.onOpen(() => {
        this.socketReady = true;
        settled = true;
        this.connectPromise = null;
        this.emitStatus({ type: 'socket_open' });
        this.startHeartbeat();
        this.flushPendingMessages();
        if (this.roomId) {
          this.send({ type: 'subscribe_room', roomId: this.roomId });
        }
        resolve();
      });

      this.socketTask.onClose(() => {
        this.stopHeartbeat();
        this.socketReady = false;
        this.socketTask = null;
        this.connectPromise = null;
        this.emitStatus({ type: 'socket_close' });
      });

      this.socketTask.onError((err) => {
        this.lastError = 'WebSocket 连接失败';
        this.socketReady = false;
        this.emitStatus({ type: 'socket_error', error: err || null });
        if (!settled) {
          settled = true;
          this.connectPromise = null;
          reject(err || new Error('WebSocket 连接失败'));
        }
      });

      this.socketTask.onMessage((res) => {
        let payload = null;
        try {
          payload = JSON.parse(res.data);
        } catch (err) {
          payload = { type: 'raw', data: res.data };
        }
        this.lastEvent = payload;
        if (payload && payload.type === 'room_state') {
          this.lastState = payload.room || null;
        }
        this.emitMessage(payload);
      });
    });

    return this.connectPromise;
  }

  flushPendingMessages() {
    if (!this.socketReady || !this.socketTask || typeof this.socketTask.send !== 'function') return;
    const queue = this.pendingMessages.slice();
    this.pendingMessages.length = 0;
    queue.forEach((payload) => {
      try {
        this.socketTask.send({ data: JSON.stringify(payload) });
      } catch (err) {
        this.pendingMessages.unshift(payload);
      }
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping', ts: Date.now() });
    }, this.config.heartbeatMs);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  send(payload) {
    if (!payload) return false;
    if (!this.socketTask || typeof this.socketTask.send !== 'function' || !this.socketReady) {
      this.pendingMessages.push(payload);
      return false;
    }
    try {
      this.socketTask.send({ data: JSON.stringify(payload) });
      return true;
    } catch (err) {
      this.pendingMessages.push(payload);
      return false;
    }
  }

  async ensureIdentity() {
    if (this.playerId && this.playerToken) return;
    this.setPlayerProfile({});
  }

  async createRoom(options = {}) {
    await this.ensureIdentity();
    const result = await this.request('/api/rooms', 'POST', {
      playerId: this.playerId,
      playerToken: this.playerToken,
      boardId: options.boardId || 'board_9x9',
      turnTimeMs: options.turnTimeMs || 30000,
      mode: 'room'
    });
    this.roomId = result.roomId || '';
    this.playerColor = result.playerColor || 'black';
    await this.connectWebSocket();
    this.send({ type: 'subscribe_room', roomId: this.roomId });
    return result;
  }

  async quickMatch(options = {}) {
    await this.ensureIdentity();
    const result = await this.request('/api/matchmaking/quick', 'POST', {
      playerId: this.playerId,
      playerToken: this.playerToken,
      boardId: options.boardId || 'board_9x9',
      turnTimeMs: options.turnTimeMs || 30000
    });
    this.roomId = result.roomId || '';
    this.playerColor = result.playerColor || '';
    await this.connectWebSocket();
    this.send({ type: 'subscribe_room', roomId: this.roomId });
    return result;
  }

  async joinRoom(roomId) {
    await this.ensureIdentity();
    const normalizedRoomId = String(roomId || '').trim().toUpperCase();
    const result = await this.request(`/api/rooms/${normalizedRoomId}/join`, 'POST', {
      playerId: this.playerId,
      playerToken: this.playerToken
    });
    this.roomId = result.roomId || normalizedRoomId;
    this.playerColor = result.playerColor || 'white';
    await this.connectWebSocket();
    this.send({ type: 'subscribe_room', roomId: this.roomId });
    return result;
  }
}
