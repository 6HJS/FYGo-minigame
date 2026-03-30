import { drawButton, inRect } from '../utils/ui';

const ctx = canvas.getContext('2d');
const SCREEN_WIDTH = canvas.width;
const SCREEN_HEIGHT = canvas.height;

export default class OnlineMatchScene {
  constructor(sceneManager, onlineClient) {
    this.sceneManager = sceneManager;
    this.onlineClient = onlineClient;
    this.onlineLobbyScene = null;
    this.homeScene = null;
    this.bgm = 'audio/bgm_fight.mp3';
    this.room = null;
    this.playerColor = '';
    this.statusText = '等待房间状态...';
    this.boardRect = { x: 0, y: 0, size: 0, cell: 0 };

    if (this.onlineClient) {
      this.boundMessage = this.handleClientMessage.bind(this);
      this.boundStatus = this.handleClientStatus.bind(this);
      this.onlineClient.onMessage(this.boundMessage);
      this.onlineClient.onStatus(this.boundStatus);
    }
  }

  attachRoom(room, playerColor) {
    this.room = room || null;
    this.playerColor = playerColor || this.onlineClient.playerColor || '';
    this.refreshStatus();
  }

  onEnter() {
    if (this.onlineClient && this.onlineClient.currentRoom) {
      this.room = this.onlineClient.currentRoom;
    }
    if (!this.playerColor && this.onlineClient) {
      this.playerColor = this.onlineClient.playerColor || '';
    }
    this.refreshStatus();
  }

  onLeave() {}

  handleClientStatus(payload) {
    if (!payload) return;
    if (payload.type === 'reconnecting') this.statusText = '连接波动，正在恢复对局...';
    if (payload.type === 'reconnected') this.refreshStatus();
    if (payload.type === 'server_error') this.statusText = payload.message || '服务器返回错误';
  }

  handleClientMessage(payload) {
    if (!payload) return;
    if ((payload.type === 'room_state' || payload.type === 'presence') && payload.room) {
      const roomId = this.room && this.room.roomId ? this.room.roomId : '';
      if (!roomId || payload.room.roomId === roomId) {
        this.room = payload.room;
        this.refreshStatus();
      }
    }
    if (payload.type === 'error' || payload.type === 'action_reject') {
      this.statusText = payload.message || payload.reason || '动作被拒绝';
    }
  }

  refreshStatus() {
    const room = this.room;
    if (!room || !room.state) {
      this.statusText = '等待房间状态...';
      return;
    }
    const currentPlayer = room.state.currentPlayer;
    const turnText = currentPlayer === 'black' ? '黑' : '白';
    const seatText = this.playerColor === 'black' ? '黑' : '白';
    const myTurn = currentPlayer === this.playerColor && room.phase === 'playing';
    if (room.phase === 'waiting') {
      this.statusText = `房间 ${room.roomId}，等待另一位玩家加入`;
      return;
    }
    if (room.phase === 'ended') {
      const winner = room.state.winner ? (room.state.winner === 'black' ? '黑' : '白') : '无';
      this.statusText = `对局结束｜胜者：${winner}｜原因：${room.state.endedReason || '--'}`;
      return;
    }
    this.statusText = `房间 ${room.roomId}｜你执${seatText}｜当前轮到${turnText}${myTurn ? '（到你了）' : '（等待对手）'}`;
  }

  getBoardMetrics() {
    const size = (this.room && this.room.state && this.room.state.size) || this.onlineClient.getBoardSize() || 9;
    const boardPixel = Math.min(SCREEN_WIDTH - 60, SCREEN_HEIGHT - 240);
    const x = (SCREEN_WIDTH - boardPixel) / 2;
    const y = 150;
    const cell = boardPixel / (size - 1);
    this.boardRect = { x, y, size: boardPixel, cell };
    return { size, x, y, boardPixel, cell };
  }

  boardCoordFromPoint(px, py) {
    const metrics = this.getBoardMetrics();
    const { size, x, y, boardPixel, cell } = metrics;
    const col = Math.round((px - x) / cell);
    const row = Math.round((py - y) / cell);
    if (col < 0 || col >= size || row < 0 || row >= size) return null;
    const cx = x + col * cell;
    const cy = y + row * cell;
    if (Math.abs(px - cx) > cell * 0.45 || Math.abs(py - cy) > cell * 0.45) return null;
    return { x: col, y: row };
  }

  handleBoardTap(x, y) {
    if (!this.room || !this.room.state || this.room.phase !== 'playing') return;
    if (this.room.state.currentPlayer !== this.playerColor) {
      this.statusText = '现在不是你的回合';
      return;
    }
    const coord = this.boardCoordFromPoint(x, y);
    if (!coord) return;
    this.statusText = `已提交落子：(${coord.x + 1}, ${coord.y + 1})，等待服务器裁定`;
    this.onlineClient.playMove(coord.x, coord.y).catch((err) => {
      this.statusText = err && err.message ? err.message : '发送落子失败';
    });
  }

  onTouchStart(e) {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    if (inRect(x, y, 20, 20, 120, 50)) {
      if (this.onlineLobbyScene) this.sceneManager.switchTo(this.onlineLobbyScene);
      return;
    }
    if (inRect(x, y, SCREEN_WIDTH - 160, 20, 140, 50)) {
      this.statusText = '已请求停一手，等待服务器裁定';
      this.onlineClient.pass().catch((err) => {
        this.statusText = err && err.message ? err.message : '停一手失败';
      });
      return;
    }
    if (inRect(x, y, SCREEN_WIDTH - 160, SCREEN_HEIGHT - 70, 140, 50)) {
      this.statusText = '已请求认输';
      this.onlineClient.resign().catch((err) => {
        this.statusText = err && err.message ? err.message : '认输失败';
      });
      return;
    }
    this.handleBoardTap(x, y);
  }

  update() {}

  renderBoard() {
    const room = this.room;
    const state = room && room.state ? room.state : null;
    const board = state && Array.isArray(state.board) ? state.board : [];
    const metrics = this.getBoardMetrics();
    const { size, x, y, boardPixel, cell } = metrics;

    ctx.fillStyle = '#d9b36c';
    ctx.fillRect(x - 18, y - 18, boardPixel + 36, boardPixel + 36);

    ctx.strokeStyle = '#4d341c';
    ctx.lineWidth = 2;
    for (let i = 0; i < size; i += 1) {
      const offset = i * cell;
      ctx.beginPath();
      ctx.moveTo(x, y + offset);
      ctx.lineTo(x + boardPixel, y + offset);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + offset, y);
      ctx.lineTo(x + offset, y + boardPixel);
      ctx.stroke();
    }

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const stone = board[row] && board[row][col] ? board[row][col] : null;
        if (!stone) continue;
        const cx = x + col * cell;
        const cy = y + row * cell;
        ctx.beginPath();
        ctx.fillStyle = stone === 'black' ? '#111111' : '#f5f5f5';
        ctx.strokeStyle = stone === 'black' ? '#000000' : '#999999';
        ctx.lineWidth = 2;
        ctx.arc(cx, cy, Math.max(8, cell * 0.35), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  render() {
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    ctx.fillStyle = '#1b1f24';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    drawButton(20, 20, 120, 50, '#5d6d7e', '返回', 22);
    drawButton(SCREEN_WIDTH - 160, 20, 140, 50, '#8e44ad', '停一手', 22);
    drawButton(SCREEN_WIDTH - 160, SCREEN_HEIGHT - 70, 140, 50, '#922b21', '认输', 22);

    ctx.fillStyle = '#f5e6a9';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('联机 MVP（服务器权威）', SCREEN_WIDTH / 2, 44);

    this.renderBoard();

    ctx.fillStyle = '#ecf0f1';
    ctx.font = '18px Arial';
    ctx.textAlign = 'left';
    const status = this.statusText || '--';
    const lines = [status.slice(0, 34), status.slice(34, 68)].filter(Boolean);
    lines.forEach((line, index) => {
      ctx.fillText(line, 24, SCREEN_HEIGHT - 110 + index * 24);
    });
  }
}
