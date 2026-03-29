import { drawButton, inRect } from '../utils/ui';

const square9 = require('../data/boards/square9.js');
const square13 = require('../data/boards/square13.js');
const square15 = require('../data/boards/square15.js');
const square17 = require('../data/boards/square17.js');
const square19 = require('../data/boards/square19.js');

const ONLINE_BOARD_MAP = {
  board_9x9: square9,
  board_13x13: square13,
  board_15x15: square15,
  board_17x17: square17,
  board_19x19: square19
};

const ctx = canvas.getContext('2d');
const SCREEN_WIDTH = canvas.width;
const SCREEN_HEIGHT = canvas.height;

export default class OnlineScene {
  constructor(sceneManager, onlineClient, gameScene = null) {
    this.sceneManager = sceneManager;
    this.onlineClient = onlineClient;
    this.gameScene = gameScene;
    this.homeScene = null;
    this.bgm = 'audio/bgm_title.mp3';
    this.statusText = '服务器权威房间模式（云托管，已启用自动挂断与多设备测试）';
    this.roomId = '';
    this.playerColor = '';
    this.skipAutoHangupOnLeave = false;
    this.enteredGameRoomId = '';
    this.lastPresenceFetchAt = 0;

    if (this.onlineClient) {
      this.boundMessage = this.handleClientMessage.bind(this);
      this.boundStatus = this.handleClientStatus.bind(this);
      this.onlineClient.onMessage(this.boundMessage);
      this.onlineClient.onStatus(this.boundStatus);
    }
  }

  onLeave() {
    if (this.skipAutoHangupOnLeave) {
      this.skipAutoHangupOnLeave = false;
      return;
    }
    this.enteredGameRoomId = '';
    this.lastPresenceFetchAt = 0;
    if (this.onlineClient && typeof this.onlineClient.autoHangup === 'function') {
      this.onlineClient.autoHangup('leave_online_scene');
    }
  }

  onEnter() {
    this.enteredGameRoomId = '';
    this.lastPresenceFetchAt = 0;
    if (this.gameScene && this.gameScene.isOnlineMode && this.gameScene.onlineRoomId) {
      this.roomId = this.gameScene.onlineRoomId;
    }
  }

  enterGameScene(room) {
    if (!room || !room.roomId || !this.gameScene) return;
    if (this.enteredGameRoomId === room.roomId && this.sceneManager.currentScene === this.gameScene) return;

    this.enteredGameRoomId = room.roomId;
    this.skipAutoHangupOnLeave = true;

    if (typeof this.gameScene.setBoardConfig === 'function') {
      const boardId = room.boardId || 'board_9x9';
      const boardConfig = ONLINE_BOARD_MAP[boardId] || square9;
      if (boardConfig) {
        this.gameScene.setBoardConfig(boardConfig);
      } else if (typeof this.gameScene.resetGame === 'function') {
        this.gameScene.resetGame();
      }
    }

    if (typeof this.gameScene.configureOnlineMatch === 'function') {
      this.gameScene.configureOnlineMatch({
        room,
        onlineClient: this.onlineClient,
        playerColor: this.playerColor || ''
      });
    } else {
      this.gameScene.isOnlineMode = true;
      this.gameScene.onlineClient = this.onlineClient;
      this.gameScene.onlineRoomId = room.roomId;
      this.gameScene.onlinePlayerColor = this.playerColor || '';
      this.gameScene.statusMessage = room.phase === 'waiting'
        ? `在线房间 ${room.roomId}，等待对手加入`
        : `在线房间 ${room.roomId}，你执${this.playerColor === 'black' ? '黑' : '白'}`;
    }

    this.sceneManager.switchTo(this.gameScene);
  }

  handleClientStatus(payload) {
    if (!payload) return;
    if (payload.type === 'socket_open') this.statusText = `已连接服务器，房间 ${this.roomId || '--'}`;
    if (payload.type === 'socket_close') this.statusText = '连接已断开';
    if (payload.type === 'socket_error') this.statusText = 'WebSocket 连接失败';
  }

  handleClientMessage(payload) {
    if (!payload) return;
    if (payload.type === 'room_state' && payload.room) {
      const room = payload.room;
      this.roomId = room.roomId || this.roomId;
      const colorText = this.playerColor ? ` | 你执${this.playerColor === 'black' ? '黑' : '白'}` : '';
      this.statusText = `房间 ${this.roomId} | ${room.phase || 'waiting'}${colorText}`;
      if (this.gameScene && this.gameScene.isOnlineMode && this.gameScene.onlineRoomId === room.roomId && typeof this.gameScene.applyOnlineRoom === 'function') {
        this.gameScene.applyOnlineRoom(room, this.playerColor || '');
      }
      if (this.playerColor && room.phase === 'playing') {
        this.enterGameScene(room);
      }
    } else if (payload.type === 'presence') {
      const roomId = String(payload.roomId || (payload.room && payload.room.roomId) || '').trim().toUpperCase();
      const currentRoomId = String(this.roomId || '').trim().toUpperCase();
      if (payload.room && roomId && currentRoomId && roomId === currentRoomId) {
        const room = payload.room;
        this.statusText = `房间 ${room.roomId} | ${room.phase || 'waiting'}`;
        if (this.playerColor && room.phase === 'playing') {
          this.enterGameScene(room);
        }
        return;
      }
      if (
        roomId && currentRoomId && roomId === currentRoomId &&
        this.onlineClient && typeof this.onlineClient.fetchRoomState === 'function'
      ) {
        const now = Date.now();
        if (!this.lastPresenceFetchAt || now - this.lastPresenceFetchAt > 1500) {
          this.lastPresenceFetchAt = now;
          this.onlineClient.fetchRoomState(roomId).catch(() => {});
        }
      }
    } else if (payload.type === 'room_joined') {
      this.statusText = `加入房间 ${payload.roomId}`;
    } else if (payload.type === 'error') {
      this.statusText = payload.message || '服务器返回错误';
      if (this.gameScene && this.gameScene.isOnlineMode && typeof this.gameScene.handleOnlineError === 'function') {
        this.gameScene.handleOnlineError(payload.message || '服务器返回错误');
      }
    }
  }

  async doCreateRoom() {
    try {
      this.statusText = '正在创建房间...';
      const result = await this.onlineClient.createRoom();
      this.roomId = result.roomId || '';
      this.playerColor = result.playerColor || '';
      this.statusText = `已创建房间 ${this.roomId}，执黑先行，等待白棋加入`;
    } catch (err) {
      this.statusText = `创建失败：${err && err.message ? err.message : '未知错误'}`;
    }
  }

  async doQuickMatch() {
    try {
      this.statusText = '正在快速匹配...';
      const result = await this.onlineClient.quickMatch();
      this.roomId = result.roomId || '';
      this.playerColor = result.playerColor || '';
      if (result.room && result.room.phase === 'playing') {
        this.statusText = `匹配成功：房间 ${this.roomId}，你执${this.playerColor === 'black' ? '黑' : '白'}`;
        this.enterGameScene(result.room);
      } else {
        this.statusText = `已进入匹配队列 / 房间 ${this.roomId}，等待对手加入`;
      }
    } catch (err) {
      this.statusText = `匹配失败：${err && err.message ? err.message : '未知错误'}`;
    }
  }

  async doJoinRoom() {
    if (!wx || typeof wx.showModal !== 'function') {
      this.statusText = '当前环境不支持输入房间号';
      return;
    }
    wx.showModal({
      title: '加入房间',
      editable: true,
      placeholderText: '输入 6 位房间码',
      success: async (res) => {
        if (!res.confirm) return;
        const roomId = String(res.content || '').trim().toUpperCase();
        if (!roomId) {
          this.statusText = '未输入房间码';
          return;
        }
        try {
          this.statusText = `正在加入 ${roomId}...`;
          const result = await this.onlineClient.joinRoom(roomId);
          this.roomId = result.roomId || roomId;
          this.playerColor = result.playerColor || '';
          this.statusText = result.subscriptionPending
            ? `已加入房间 ${this.roomId}，正在同步...`
            : `已加入房间 ${this.roomId}，你执${this.playerColor === 'black' ? '黑' : '白'}`;
          if (result.room && result.room.phase === 'playing') {
            this.enterGameScene(result.room);
          }
        } catch (err) {
          this.statusText = `加入失败：${err && err.message ? err.message : '未知错误'}`;
        }
      }
    });
  }

  onTouchStart(e) {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    const btnX = 50;
    const btnW = SCREEN_WIDTH - 100;
    const btnH = 64;
    const top = 250;
    const gap = 86;

    if (inRect(x, y, 20, 20, 120, 50)) {
      if (this.homeScene) this.sceneManager.switchTo(this.homeScene);
      return;
    }
    if (inRect(x, y, btnX, top, btnW, btnH)) {
      this.doCreateRoom();
      return;
    }
    if (inRect(x, y, btnX, top + gap, btnW, btnH)) {
      this.doJoinRoom();
      return;
    }
    if (inRect(x, y, btnX, top + gap * 2, btnW, btnH)) {
      this.doQuickMatch();
      return;
    }
  }

  update() {}

  render() {
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    ctx.fillStyle = '#16202a';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    drawButton(20, 20, 120, 50, '#5d6d7e', '返回', 22);

    ctx.fillStyle = '#f5e6a9';
    ctx.font = 'bold 44px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('在线对局', SCREEN_WIDTH / 2, 92);

    ctx.fillStyle = '#d6eaf8';
    ctx.font = '22px Arial';
    ctx.fillText('服务器权威 · 云托管房间对战', SCREEN_WIDTH / 2, 138);

    drawButton(50, 250, SCREEN_WIDTH - 100, 64, '#2471a3', '创建房间', 26);
    drawButton(50, 336, SCREEN_WIDTH - 100, 64, '#8e44ad', '输入房间码加入', 26);
    drawButton(50, 422, SCREEN_WIDTH - 100, 64, '#27ae60', '快速匹配', 26);

    ctx.fillStyle = '#ecf0f1';
    ctx.font = '20px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`当前房间：${this.roomId || '--'}`, 50, 540);
    ctx.fillText(`执子：${this.playerColor ? (this.playerColor === 'black' ? '黑' : '白') : '--'}`, 50, 572);

    ctx.fillStyle = '#f8c471';
    ctx.font = '18px Arial';
    const status = this.statusText || '尚未连接';
    const lines = [status.slice(0, 22), status.slice(22, 44), status.slice(44, 66)].filter(Boolean);
    lines.forEach((line, idx) => {
      ctx.fillText(line, 50, 620 + idx * 26);
    });

    ctx.fillStyle = '#95a5a6';
    ctx.font = '16px Arial';
    ctx.fillText('说明：这里只接入在线大厅与房间流程。', 50, SCREEN_HEIGHT - 64);
    ctx.fillText('真正落子同步请继续把对局内 action 接到服务器。', 50, SCREEN_HEIGHT - 38);
  }
}
