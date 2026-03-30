import { drawButton, inRect } from '../utils/ui';

const ctx = canvas.getContext('2d');
const SCREEN_WIDTH = canvas.width;
const SCREEN_HEIGHT = canvas.height;

export default class OnlineScene {
  constructor(sceneManager, onlineClient, onlineMatchScene = null) {
    this.sceneManager = sceneManager;
    this.onlineClient = onlineClient;
    this.onlineMatchScene = onlineMatchScene;
    this.homeScene = null;
    this.bgm = 'audio/bgm_title.mp3';
    this.statusText = '新联机骨架：服务器权威 / 客户端只发动作';
    this.roomId = '';
    this.playerColor = '';
    this.pendingNavigation = false;

    if (this.onlineClient) {
      this.boundMessage = this.handleClientMessage.bind(this);
      this.boundStatus = this.handleClientStatus.bind(this);
      this.onlineClient.onMessage(this.boundMessage);
      this.onlineClient.onStatus(this.boundStatus);
    }
  }

  onEnter() {
    this.pendingNavigation = false;
    if (this.onlineClient && this.onlineClient.currentRoom) {
      this.roomId = this.onlineClient.currentRoom.roomId || this.roomId;
      this.playerColor = this.onlineClient.playerColor || this.playerColor;
    }
  }

  onLeave() {}

  handleClientStatus(payload) {
    if (!payload) return;
    if (payload.type === 'socket_open') this.statusText = '实时连接已建立，正在认证...';
    if (payload.type === 'auth_ok') this.statusText = '认证成功，正在订阅房间...';
    if (payload.type === 'subscribed') {
      this.roomId = payload.roomId || this.roomId;
      this.playerColor = this.onlineClient.playerColor || this.playerColor;
      this.statusText = `已订阅房间 ${this.roomId}`;
    }
    if (payload.type === 'reconnecting') this.statusText = '连接波动，正在重连并恢复房间...';
    if (payload.type === 'reconnected') this.statusText = `连接已恢复：${payload.roomId || this.roomId || '--'}`;
    if (payload.type === 'socket_error') this.statusText = payload.message || '连接失败';
    if (payload.type === 'server_error') this.statusText = payload.message || '服务器返回错误';
  }

  handleClientMessage(payload) {
    if (!payload) return;
    if ((payload.type === 'room_state' || payload.type === 'presence') && payload.room) {
      const room = payload.room;
      this.roomId = room.roomId || this.roomId;
      this.playerColor = this.onlineClient.playerColor || this.playerColor;
      const phase = room.phase || 'waiting';
      const seatText = this.playerColor ? `，你执${this.playerColor === 'black' ? '黑' : '白'}` : '';
      this.statusText = `房间 ${this.roomId}｜${phase}${seatText}`;
      if (phase === 'playing' && this.onlineClient.activeRoomId === this.roomId) {
        this.enterMatchScene(room);
      }
    } else if (payload.type === 'error') {
      this.statusText = payload.message || '服务器返回错误';
    }
  }

  enterMatchScene(room) {
    if (!room || !room.roomId || !this.onlineMatchScene || this.pendingNavigation) return;
    this.pendingNavigation = true;
    this.onlineMatchScene.attachRoom(room, this.playerColor || this.onlineClient.playerColor || '');
    this.sceneManager.switchTo(this.onlineMatchScene);
  }

  async doCreateRoom() {
    try {
      this.pendingNavigation = false;
      this.statusText = '正在创建房间并建立实时连接...';
      const result = await this.onlineClient.createRoom({ boardId: 'board_9x9', turnTimeMs: 30000 });
      this.roomId = result.roomId || '';
      this.playerColor = result.playerColor || 'black';
      this.statusText = `已创建房间 ${this.roomId}，等待白棋加入`;
    } catch (err) {
      this.statusText = `创建失败：${err && err.message ? err.message : '未知错误'}`;
    }
  }

  async doQuickMatch() {
    try {
      this.pendingNavigation = false;
      this.statusText = '正在快速匹配并建立实时连接...';
      const result = await this.onlineClient.quickMatch({ boardId: 'board_9x9', turnTimeMs: 30000 });
      this.roomId = result.roomId || '';
      this.playerColor = result.playerColor || '';
      this.statusText = result.matched
        ? `匹配成功：房间 ${this.roomId}`
        : `已进入匹配池 / 房间 ${this.roomId}，等待对手加入`;
      if (result.room && result.room.phase === 'playing' && this.onlineClient.activeRoomId === this.roomId) {
        this.enterMatchScene(result.room);
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
          this.pendingNavigation = false;
          this.statusText = `正在加入 ${roomId} 并建立实时连接...`;
          const result = await this.onlineClient.joinRoom(roomId);
          this.roomId = result.roomId || roomId;
          this.playerColor = result.playerColor || 'white';
          this.statusText = `已加入房间 ${this.roomId}，等待实时状态确认`;
          if (result.room && result.room.phase === 'playing' && this.onlineClient.activeRoomId === this.roomId) {
            this.enterMatchScene(result.room);
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
    if (inRect(x, y, btnX, top, btnW, btnH)) return void this.doCreateRoom();
    if (inRect(x, y, btnX, top + gap, btnW, btnH)) return void this.doJoinRoom();
    if (inRect(x, y, btnX, top + gap * 2, btnW, btnH)) return void this.doQuickMatch();
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
    ctx.fillText('新设计：服务器权威 / 房间订阅确认后再入局', SCREEN_WIDTH / 2, 138);

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
    const lines = [status.slice(0, 24), status.slice(24, 48), status.slice(48, 72)].filter(Boolean);
    lines.forEach((line, index) => {
      ctx.fillText(line, 50, 620 + index * 28);
    });
  }
}
