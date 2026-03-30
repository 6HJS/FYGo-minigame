import ONLINE_CONFIG from '../config/online-config';


function debugLog(tag, payload) {
  try {
    if (typeof payload === 'undefined') {
      console.log(`[OnlineClient][${tag}]`);
      return;
    }
    console.log(`[OnlineClient][${tag}]`, payload);
  } catch (err) {}
}

function randomId(prefix = 'guest') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}


const STORAGE_KEYS = {
  profile: 'fygo_online_profile_v2',
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

export default class OnlineClient {
  constructor(config = ONLINE_CONFIG) {
    this.config = config;
    this.socketTask = null;
    this.playerToken = '';
    this.playerId = '';
    this.roomId = '';
    this.desiredRoomId = '';
    this.playerColor = '';
    this.lastError = '';
    this.lastState = null;
    this.lastEvent = null;
    this.heartbeatTimer = null;
    this.messageHandlers = new Set();
    this.statusHandlers = new Set();
    this.pendingMessages = [];
    this.isSocketOpen = false;
    this.socketOpenPromise = null;
    this.socketOpenResolve = null;
    this.socketOpenReject = null;
    this.wsConnectInFlight = false;
    this.wsSessionId = 0;
    this.socketErrorAfterOpenIgnored = 0;
    this.deviceId = getDeviceId();
    this.forceTakeover = !this.config || this.config.forceTakeover !== false;
    this.subscribedRoomId = '';
    this.subscribeInFlight = null;
    this.roomSubscribeResolve = null;
    debugLog('INIT', { httpBaseUrl: this.config && this.config.httpBaseUrl, wsUrl: this.config && this.config.wsUrl, useCloudContainerForHttp: !!(this.config && this.config.useCloudContainerForHttp), deviceId: this.deviceId, forceTakeover: this.forceTakeover });
  }

  setPlayerProfile(profile = {}) {
    const stored = loadStoredProfile() || {};
    const basePlayerId = profile.basePlayerId || stored.basePlayerId || this.playerId || randomId('player');
    const basePlayerToken = profile.basePlayerToken || stored.basePlayerToken || this.playerToken || randomId('token');
    const sanitizedBasePlayerId = String(basePlayerId).replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 24) || randomId('player');
    const sanitizedBasePlayerToken = String(basePlayerToken).replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 24) || randomId('token');
    this.playerId = `${sanitizedBasePlayerId}_${this.deviceId}`;
    this.playerToken = `${sanitizedBasePlayerToken}_${this.deviceId}`;
    saveStoredProfile({ basePlayerId: sanitizedBasePlayerId, basePlayerToken: sanitizedBasePlayerToken });
    debugLog('SET_PLAYER_PROFILE', { basePlayerId: sanitizedBasePlayerId, playerId: this.playerId, deviceId: this.deviceId, playerTokenPreview: this.playerToken ? `${String(this.playerToken).slice(0, 10)}...` : '' });
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
      debugLog('HTTP_REQUEST_BEGIN', { path, method, data, preferCloudContainer: !!(this.config && this.config.useCloudContainerForHttp) });
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
          debugLog('HTTP_REQUEST_FAIL_STATUS', { path, method, statusCode, body: res && res.data ? res.data : null });
          reject(new Error(bodyMessage || `HTTP ${statusCode}`));
          return;
        }
        debugLog('HTTP_REQUEST_SUCCESS', { path, method, statusCode, data: (res && res.data) || {} });
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
          fail: (err) => {
            if (!this.config.httpBaseUrl || typeof wx.request !== 'function') {
              debugLog('HTTP_REQUEST_CLOUD_FAIL_NO_FALLBACK', { path, method, error: err || null });
              reject(err || new Error('云托管请求失败'));
              return;
            }
            debugLog('HTTP_REQUEST_CLOUD_FAIL_FALLBACK_TO_WX_REQUEST', { path, method, error: err || null });
            wx.request({
              url: `${this.config.httpBaseUrl}${path}`,
              method,
              data,
              timeout: this.config.requestTimeoutMs,
              header: { 'content-type': 'application/json' },
              success: handleSuccess,
              fail: (fallbackErr) => reject(fallbackErr || err || new Error('网络请求失败'))
            });
          }
        });
        return;
      }

      if (!wx || typeof wx.request !== 'function') {
        debugLog('HTTP_REQUEST_ENV_UNSUPPORTED', { path, method });
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
    if (this.isSocketOpen && this.socketTask) {
      debugLog('WS_CONNECT_SKIP_ALREADY_OPEN', { roomId: this.roomId || null, sessionId: this.wsSessionId });
      return true;
    }
    if (this.socketTask) {
      if (this.socketOpenPromise) {
        debugLog('WS_CONNECT_REUSE_PROMISE', { roomId: this.roomId || null, sessionId: this.wsSessionId });
        return this.socketOpenPromise;
      }
      debugLog('WS_CONNECT_SKIP_EXISTING_SOCKET_TASK', { roomId: this.roomId || null, sessionId: this.wsSessionId, isSocketOpen: this.isSocketOpen });
      return this.isSocketOpen;
    }
    if (this.wsConnectInFlight) {
      debugLog('WS_CONNECT_SKIP_INFLIGHT', { roomId: this.roomId || null, sessionId: this.wsSessionId });
      return this.socketOpenPromise || false;
    }
    if (!wx || typeof wx.connectSocket !== 'function') {
      throw new Error('当前环境不支持 WebSocket');
    }

    this.wsConnectInFlight = true;
    this.wsSessionId += 1;
    const sessionId = this.wsSessionId;
    this.socketOpenPromise = new Promise((resolve, reject) => {
      this.socketOpenResolve = resolve;
      this.socketOpenReject = reject;
    });

    const query = `playerId=${encodeURIComponent(this.playerId)}&playerToken=${encodeURIComponent(this.playerToken)}`;
    const url = `${this.config.wsUrl}?${query}`;
    debugLog('WS_CONNECT_BEGIN', { url, playerId: this.playerId, roomId: this.roomId || null, sessionId });
    const socketTask = wx.connectSocket({ url });
    this.socketTask = socketTask;

    socketTask.onOpen(() => {
      if (sessionId !== this.wsSessionId || socketTask !== this.socketTask) {
        debugLog('WS_OPEN_STALE_SESSION_IGNORED', { sessionId, activeSessionId: this.wsSessionId });
        try { socketTask.close({ code: 1000, reason: 'stale_session' }); } catch (err) {}
        return;
      }
      this.isSocketOpen = true;
      this.wsConnectInFlight = false;
      debugLog('WS_OPEN', { roomId: this.roomId || null, pendingMessages: this.pendingMessages.length, sessionId });
      this.emitStatus({ type: 'socket_open' });
      this.startHeartbeat();
      this.flushPendingMessages();
      if (this.desiredRoomId || this.roomId) {
        this.beginRoomSubscriptionLoop(this.desiredRoomId || this.roomId);
      }
      if (this.socketOpenResolve) {
        this.socketOpenResolve(true);
      }
      this.socketOpenResolve = null;
      this.socketOpenReject = null;
      this.socketOpenPromise = null;
    });

    socketTask.onClose(() => {
      if (sessionId !== this.wsSessionId || socketTask !== this.socketTask) {
        debugLog('WS_CLOSE_STALE_SESSION_IGNORED', { sessionId, activeSessionId: this.wsSessionId });
        return;
      }
      debugLog('WS_CLOSE', { roomId: this.roomId || null, pendingMessages: this.pendingMessages.length, sessionId });
      this.stopHeartbeat();
      const pendingReject = this.socketOpenReject;
      this.socketTask = null;
      this.isSocketOpen = false;
      this.wsConnectInFlight = false;
      this.socketOpenPromise = null;
      this.socketOpenResolve = null;
      this.socketOpenReject = null;
      this.stopRoomSubscriptionLoop(false);
      this.subscribedRoomId = '';
      if (pendingReject) {
        try { pendingReject(new Error('WebSocket 已关闭')); } catch (err) {}
      }
      this.socketOpenPromise = null;
      this.socketOpenResolve = null;
      this.socketOpenReject = null;
      this.emitStatus({ type: 'socket_close' });
    });

    socketTask.onError((err) => {
      if (sessionId !== this.wsSessionId || socketTask !== this.socketTask) {
        debugLog('WS_ERROR_STALE_SESSION_IGNORED', { sessionId, activeSessionId: this.wsSessionId, error: err || null });
        return;
      }
      if (this.isSocketOpen) {
        this.socketErrorAfterOpenIgnored += 1;
        debugLog('WS_ERROR_IGNORED_AFTER_OPEN', { sessionId, ignoredCount: this.socketErrorAfterOpenIgnored, error: err || null });
        this.emitStatus({ type: 'socket_warning', error: err || null });
        return;
      }
      this.lastError = 'WebSocket 连接失败';
      debugLog('WS_ERROR_BEFORE_OPEN_WAIT_CLOSE', { sessionId, error: err || null });
      // 某些端会先收到 error，随后才 close；这里不能立刻清空 socketTask 并重开新连接，
      // 否则会产生并发连接风暴。真正的失效统一等 onClose 处理。
      this.emitStatus({ type: 'socket_error', error: err || null });
    });

    socketTask.onMessage((res) => {
      if (sessionId !== this.wsSessionId || socketTask !== this.socketTask) {
        debugLog('WS_MESSAGE_STALE_SESSION_IGNORED', { sessionId, activeSessionId: this.wsSessionId });
        return;
      }
      let payload = null;
      try {
        payload = JSON.parse(res.data);
      } catch (err) {
        payload = { type: 'raw', data: res.data };
      }
      debugLog('WS_MESSAGE', payload);
      this.lastEvent = payload;
      const payloadRoomId = String(
        (payload && payload.roomId) ||
        (payload && payload.room && payload.room.roomId) ||
        ''
      ).trim().toUpperCase();
      const expectedRoomId = String(this.desiredRoomId || this.roomId || '').trim().toUpperCase();

      if (payload && (payload.type === 'room_joined' || payload.type === 'handshake_ack')) {
        this.subscribedRoomId = payloadRoomId || expectedRoomId || '';
        this.desiredRoomId = this.subscribedRoomId || this.desiredRoomId || '';
        this.stopRoomSubscriptionLoop(true);
        debugLog('WS_ROOM_HANDSHAKE_CONFIRMED', { roomId: this.subscribedRoomId || null, color: payload.color || null, type: payload.type });
      }
      if (payload && payload.type === 'room_state') {
        this.lastState = payload.room || null;
      }
      if (
        payload &&
        expectedRoomId &&
        payloadRoomId &&
        payloadRoomId === expectedRoomId &&
        (payload.type === 'room_state' || payload.type === 'presence')
      ) {
        this.subscribedRoomId = payloadRoomId;
        this.desiredRoomId = payloadRoomId;
        this.stopRoomSubscriptionLoop(true);
        debugLog('WS_ROOM_SYNC_CONFIRMED', { roomId: payloadRoomId, payloadType: payload.type });
      }
      this.emitMessage(payload);
    });

    return this.socketOpenPromise;
  }



  flushPendingMessages() {
    if (!this.isSocketOpen || !this.socketTask || typeof this.socketTask.send !== 'function') {
      debugLog('WS_FLUSH_SKIPPED', { isSocketOpen: this.isSocketOpen, hasSocketTask: !!this.socketTask, pendingMessages: this.pendingMessages.length });
      return;
    }
    const queue = this.pendingMessages.slice();
    debugLog('WS_FLUSH_BEGIN', { count: queue.length });
    this.pendingMessages.length = 0;
    queue.forEach((payload) => {
      try {
        debugLog('WS_FLUSH_SEND', payload);
        this.socketTask.send({ data: JSON.stringify(payload) });
      } catch (err) {
        debugLog('WS_FLUSH_REQUEUE', payload);
        this.pendingMessages.unshift(payload);
      }
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      debugLog('WS_HEARTBEAT_PING', { roomId: this.roomId || null });
      this.send({ type: 'ping', ts: Date.now() });
    }, this.config.heartbeatMs);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      debugLog('WS_HEARTBEAT_STOP');
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  stopRoomSubscriptionLoop(success = false) {
    if (success && this.roomSubscribeResolve) {
      try {
        this.roomSubscribeResolve(true);
      } catch (err) {}
    }
    this.roomSubscribeResolve = null;
  }

  beginRoomSubscriptionLoop(targetRoomId = this.roomId) {
    const roomId = String(targetRoomId || '').trim().toUpperCase();
    if (!roomId) {
      debugLog('ROOM_SUBSCRIBE_LOOP_SKIP_NO_ROOM');
      return;
    }
    this.desiredRoomId = roomId;
    if (this.subscribedRoomId === roomId) {
      debugLog('ROOM_SUBSCRIBE_LOOP_ALREADY_CONFIRMED', { roomId });
      this.stopRoomSubscriptionLoop(true);
      return;
    }
    if (!this.isSocketOpen) {
      debugLog('ROOM_SUBSCRIBE_LOOP_WAIT_SOCKET', { roomId });
      return;
    }
    debugLog('ROOM_HANDSHAKE_SEND', { roomId });
    this.send({
      type: 'handshake',
      roomId,
      playerId: this.playerId,
      playerToken: this.playerToken
    });
  }

  async ensureRoomSubscribed(targetRoomId = this.roomId) {
    const roomId = String(targetRoomId || '').trim().toUpperCase();
    if (!roomId) {
      debugLog('ENSURE_ROOM_SUBSCRIBED_SKIPPED_NO_ROOM');
      return false;
    }
    this.desiredRoomId = roomId;
    if (this.subscribedRoomId === roomId) {
      debugLog('ENSURE_ROOM_SUBSCRIBED_ALREADY', { roomId });
      return true;
    }
    if (this.subscribeInFlight) {
      debugLog('ENSURE_ROOM_SUBSCRIBED_REUSE_INFLIGHT', { roomId });
      return this.subscribeInFlight;
    }

    this.subscribeInFlight = (async () => {
      await this.connectWebSocket();
      return await new Promise((resolve, reject) => {
        let finished = false;
        const timeoutId = setTimeout(() => {
          if (finished) return;
          finished = true;
          this.roomSubscribeResolve = null;
          reject(new Error(`房间订阅失败：${roomId}`));
        }, 5000);
        this.roomSubscribeResolve = (ok) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeoutId);
          resolve(!!ok);
        };
        this.beginRoomSubscriptionLoop(roomId);
      });
    })();

    try {
      return await this.subscribeInFlight;
    } finally {
      this.subscribeInFlight = null;
    }
  }

  send(payload) {
    if (!payload) return false;
    debugLog('WS_SEND_ATTEMPT', { payload, isSocketOpen: this.isSocketOpen, hasSocketTask: !!this.socketTask, pendingMessages: this.pendingMessages.length });
    if (!this.socketTask || typeof this.socketTask.send !== 'function') {
      this.pendingMessages.push(payload);
      debugLog('WS_SEND_QUEUED_NO_SOCKET', { payload, pendingMessages: this.pendingMessages.length });
      return false;
    }
    if (!this.isSocketOpen) {
      this.pendingMessages.push(payload);
      debugLog('WS_SEND_QUEUED_NOT_OPEN', { payload, pendingMessages: this.pendingMessages.length });
      return false;
    }
    try {
      this.socketTask.send({ data: JSON.stringify(payload) });
      debugLog('WS_SEND_SUCCESS', payload);
      return true;
    } catch (err) {
      this.pendingMessages.push(payload);
      debugLog('WS_SEND_FAIL_REQUEUED', { payload, pendingMessages: this.pendingMessages.length });
      return false;
    }
  }


  disconnectSocket() {
    debugLog('WS_DISCONNECT_REQUEST', { roomId: this.roomId || null, playerId: this.playerId || null });
    this.stopHeartbeat();
    this.pendingMessages.length = 0;
    this.subscribedRoomId = '';
    this.desiredRoomId = '';
    this.subscribeInFlight = null;
    this.stopRoomSubscriptionLoop(false);
    this.isSocketOpen = false;
    this.socketOpenPromise = null;
    this.socketOpenResolve = null;
    this.socketOpenReject = null;
    this.wsConnectInFlight = false;
    this.wsSessionId += 1;
    const socketTask = this.socketTask;
    this.socketTask = null;
    if (socketTask && typeof socketTask.close === 'function') {
      try {
        socketTask.close({ code: 1000, reason: 'client_switch_room' });
      } catch (err) {
        debugLog('WS_DISCONNECT_CLOSE_FAIL', err || null);
      }
    }
  }

  async autoHangup(reason = 'switch_room') {
    debugLog('AUTO_HANGUP_BEGIN', { reason, roomId: this.roomId || null, playerId: this.playerId || null });
    this.disconnectSocket();
    this.roomId = '';
    this.desiredRoomId = '';
    this.playerColor = '';
    this.lastState = null;
    this.lastEvent = null;
    this.lastError = '';
  }

  async ensureIdentity() {
    if (this.playerId && this.playerToken) {
      debugLog('ENSURE_IDENTITY_ALREADY_PRESENT', { playerId: this.playerId });
      return;
    }
    this.setPlayerProfile({});
  }

  async createRoom(options = {}) {
    await this.ensureIdentity();
    await this.autoHangup('before_create_room');
    debugLog('CREATE_ROOM_BEGIN', options);
    const result = await this.request('/api/rooms', 'POST', {
      playerId: this.playerId,
      playerToken: this.playerToken,
      boardId: options.boardId || 'board_9x9',
      turnTimeMs: options.turnTimeMs || 30000,
      mode: 'room',
      forceTakeover: options.forceTakeover !== false && this.forceTakeover,
      deviceId: this.deviceId,
      testMultiLogin: true
    });
    const authoritativeRoom = result.room || null;
    this.roomId = result.roomId || (authoritativeRoom && authoritativeRoom.roomId) || '';
    this.playerColor = result.playerColor || 'black';
    if (authoritativeRoom) {
      this.lastState = authoritativeRoom;
      this.emitMessage({ type: 'room_state', room: authoritativeRoom, source: 'http_create_room' });
    }
    try {
      await this.ensureRoomSubscribed(this.roomId);
      result.subscriptionPending = false;
    } catch (err) {
      result.subscriptionPending = !authoritativeRoom;
      result.subscriptionWarning = err && err.message ? err.message : '房间订阅确认超时';
      debugLog('CREATE_ROOM_SUBSCRIBE_DEFERRED', { roomId: this.roomId || null, warning: result.subscriptionWarning, httpRoomReady: !!authoritativeRoom });
    }
    debugLog('CREATE_ROOM_DONE', result);
    return result;
  }

  async quickMatch(options = {}) {
    await this.ensureIdentity();
    await this.autoHangup('before_quick_match');
    debugLog('QUICK_MATCH_BEGIN', options);
    const result = await this.request('/api/matchmaking/quick', 'POST', {
      playerId: this.playerId,
      playerToken: this.playerToken,
      boardId: options.boardId || 'board_9x9',
      turnTimeMs: options.turnTimeMs || 30000,
      forceTakeover: options.forceTakeover !== false && this.forceTakeover,
      deviceId: this.deviceId,
      testMultiLogin: true
    });
    const authoritativeRoom = result.room || null;
    this.roomId = result.roomId || (authoritativeRoom && authoritativeRoom.roomId) || '';
    this.playerColor = result.playerColor || '';
    if (authoritativeRoom) {
      this.lastState = authoritativeRoom;
      this.emitMessage({ type: 'room_state', room: authoritativeRoom, source: 'http_quick_match' });
    }
    try {
      await this.ensureRoomSubscribed(this.roomId);
      result.subscriptionPending = false;
    } catch (err) {
      result.subscriptionPending = !authoritativeRoom;
      result.subscriptionWarning = err && err.message ? err.message : '房间订阅确认超时';
      debugLog('QUICK_MATCH_SUBSCRIBE_DEFERRED', { roomId: this.roomId || null, warning: result.subscriptionWarning, httpRoomReady: !!authoritativeRoom });
    }
    debugLog('QUICK_MATCH_DONE', result);
    return result;
  }


  async fetchRoomState(roomId = this.roomId) {
    await this.ensureIdentity();
    const normalizedRoomId = String(roomId || '').trim().toUpperCase();
    if (!normalizedRoomId) throw new Error('缺少房间号');
    const result = await this.request(`/api/rooms/${normalizedRoomId}?playerId=${encodeURIComponent(this.playerId)}&playerToken=${encodeURIComponent(this.playerToken)}`, 'GET');
    const authoritativeRoom = result && result.room ? result.room : null;
    if (authoritativeRoom) {
      this.roomId = authoritativeRoom.roomId || normalizedRoomId;
      if (result.playerColor) this.playerColor = result.playerColor;
      this.lastState = authoritativeRoom;
      this.emitMessage({ type: 'room_state', room: authoritativeRoom, source: 'http_get_room' });
    }
    return result;
  }

  async sendAction(action = {}) {
    await this.ensureIdentity();
    const roomId = String(this.roomId || '').trim().toUpperCase();
    if (!roomId) throw new Error('当前不在在线房间中');
    await this.ensureRoomSubscribed(roomId);
    const payload = { type: 'action', roomId, action };
    this.send(payload);
    debugLog('ACTION_SENT', payload);
    return true;
  }

  async joinRoom(roomId) {
    await this.ensureIdentity();
    await this.autoHangup('before_join_room');
    const normalizedRoomId = String(roomId || '').trim().toUpperCase();
    debugLog('JOIN_ROOM_BEGIN', { roomId: normalizedRoomId });
    const result = await this.request(`/api/rooms/${normalizedRoomId}/join`, 'POST', {
      playerId: this.playerId,
      playerToken: this.playerToken,
      forceTakeover: this.forceTakeover,
      deviceId: this.deviceId,
      testMultiLogin: true
    });
    const authoritativeRoom = result.room || null;
    this.roomId = result.roomId || (authoritativeRoom && authoritativeRoom.roomId) || normalizedRoomId;
    this.playerColor = result.playerColor || 'white';
    if (authoritativeRoom) {
      this.lastState = authoritativeRoom;
      this.emitMessage({ type: 'room_state', room: authoritativeRoom, source: 'http_join_room' });
    }
    try {
      await this.ensureRoomSubscribed(this.roomId);
      result.subscriptionPending = false;
    } catch (err) {
      result.subscriptionPending = !authoritativeRoom;
      result.subscriptionWarning = err && err.message ? err.message : '房间订阅确认超时';
      debugLog('JOIN_ROOM_SUBSCRIBE_DEFERRED', { roomId: this.roomId || null, warning: result.subscriptionWarning, httpRoomReady: !!authoritativeRoom });
    }
    debugLog('JOIN_ROOM_DONE', result);
    return result;
  }
}
