import { drawButton, inRect } from '../utils/ui';

const ctx = canvas.getContext('2d');

const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const SCREEN_WIDTH = windowInfo.windowWidth || canvas.width;
const SCREEN_HEIGHT = windowInfo.windowHeight || canvas.height;

const BOARD_SIZE = 9;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

export default class GoGameScene {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;

    this.initSafeLayout();
    this.resetGame();
  }

  initSafeLayout() {
    const menuButton = wx.getMenuButtonBoundingClientRect
      ? wx.getMenuButtonBoundingClientRect()
      : null;

    const safeTop = menuButton ? Math.max(12, menuButton.top - 8) : 24;
    const capsuleBottom = menuButton ? menuButton.bottom : safeTop + 32;

    this.safeTop = safeTop;

    // 第1行：按钮，放在微信胶囊下方
    this.row1Y = capsuleBottom + 12;

    this.backBtn = {
      x: 24,
      y: this.row1Y,
      w: 100,
      h: 40
    };

    this.restartBtn = {
      x: SCREEN_WIDTH - 24 - 100,
      y: this.row1Y,
      w: 100,
      h: 40
    };

    // 第2行：标题
    this.titleY = this.row1Y + 40 + 26;

    // 第3行：当前落子 / 提示
    this.turnTextY = this.titleY + 42;
    this.msgTextY = this.turnTextY + 30;

    // 棋盘区域
    this.boardPaddingTop = this.msgTextY + 35;
    this.boardPaddingSide = 50;
  }

  resetGame() {
    this.board = Array.from({ length: BOARD_SIZE }, () =>
      Array(BOARD_SIZE).fill(EMPTY)
    );

    this.currentPlayer = BLACK;
    this.lastMove = null;
    this.lastCaptured = [];
    this.statusMessage = '';

    // 用于劫争：记录“上一个完整局面”
    this.previousBoardKey = this.getBoardKey(this.board);

    this.calcBoardLayout();
  }

  calcBoardLayout() {
    const boardPixelSize = SCREEN_WIDTH - this.boardPaddingSide * 2;
    const cellSize = boardPixelSize / (BOARD_SIZE - 1);

    this.boardX = this.boardPaddingSide;
    this.boardY = this.boardPaddingTop;
    this.cellSize = cellSize;
    this.boardPixelSize = boardPixelSize;
  }

  onTouchStart(e) {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    if (inRect(x, y, this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h)) {
      if (this.homeScene) {
        this.sceneManager.switchTo(this.homeScene);
      }
      return;
    }

    if (
      inRect(
        x,
        y,
        this.restartBtn.x,
        this.restartBtn.y,
        this.restartBtn.w,
        this.restartBtn.h
      )
    ) {
      this.resetGame();
      return;
    }

    const point = this.screenToBoard(x, y);
    if (!point) return;

    this.tryPlaceStone(point.row, point.col);
  }

  tryPlaceStone(row, col) {
    if (!this.isInside(row, col)) return false;

    if (this.board[row][col] !== EMPTY) {
      this.statusMessage = '此处已有棋子';
      return false;
    }

    const player = this.currentPlayer;
    const opponent = this.getOpponent(player);

    // 保存当前局面，用于劫争判断
    const beforeBoardKey = this.getBoardKey(this.board);

    // 模拟新棋盘
    const nextBoard = this.cloneBoard(this.board);
    nextBoard[row][col] = player;

    let totalCaptured = [];

    // 1. 检查相邻敌块是否无气，有则提掉
    const neighbors = this.getNeighbors(row, col);
    const visitedEnemyGroups = new Set();

    for (const [nr, nc] of neighbors) {
      if (nextBoard[nr][nc] !== opponent) continue;

      const enemyKey = `${nr},${nc}`;
      if (visitedEnemyGroups.has(enemyKey)) continue;

      const group = this.getGroup(nextBoard, nr, nc);
      for (const [gr, gc] of group) {
        visitedEnemyGroups.add(`${gr},${gc}`);
      }

      const liberties = this.getLiberties(nextBoard, group);
      if (liberties.size === 0) {
        totalCaptured = totalCaptured.concat(group);
      }
    }

    if (totalCaptured.length > 0) {
      this.removeGroup(nextBoard, totalCaptured);
    }

    // 2. 检查自己这块有没有气，没有则为自杀，禁入
    const selfGroup = this.getGroup(nextBoard, row, col);
    const selfLiberties = this.getLiberties(nextBoard, selfGroup);

    if (selfLiberties.size === 0) {
      this.statusMessage = '禁入点：不可自杀';
      return false;
    }

    // 3. 劫争：禁止回到“上一个局面”
    const nextBoardKey = this.getBoardKey(nextBoard);
    if (nextBoardKey === this.previousBoardKey) {
      this.statusMessage = '劫争：此处暂不可落子';
      return false;
    }

    // 4. 提交落子
    this.board = nextBoard;
    this.previousBoardKey = beforeBoardKey;
    this.lastMove = { row, col };
    this.lastCaptured = totalCaptured;
    this.currentPlayer = opponent;

    if (totalCaptured.length > 0) {
      this.statusMessage = `提子 ${totalCaptured.length} 枚`;
    } else {
      this.statusMessage = '';
    }

    return true;
  }

  isInside(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  getOpponent(player) {
    return player === BLACK ? WHITE : BLACK;
  }

  cloneBoard(board) {
    return board.map((row) => row.slice());
  }

  getBoardKey(board) {
    return board.map((row) => row.join('')).join('|');
  }

  getNeighbors(row, col) {
    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ];

    const result = [];
    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (this.isInside(nr, nc)) {
        result.push([nr, nc]);
      }
    }
    return result;
  }

  getGroup(board, row, col) {
    const color = board[row][col];
    if (color === EMPTY) return [];

    const stack = [[row, col]];
    const visited = new Set([`${row},${col}`]);
    const group = [];

    while (stack.length > 0) {
      const [cr, cc] = stack.pop();
      group.push([cr, cc]);

      const neighbors = this.getNeighbors(cr, cc);
      for (const [nr, nc] of neighbors) {
        if (board[nr][nc] !== color) continue;

        const key = `${nr},${nc}`;
        if (visited.has(key)) continue;

        visited.add(key);
        stack.push([nr, nc]);
      }
    }

    return group;
  }

  getLiberties(board, group) {
    const liberties = new Set();

    for (const [row, col] of group) {
      const neighbors = this.getNeighbors(row, col);
      for (const [nr, nc] of neighbors) {
        if (board[nr][nc] === EMPTY) {
          liberties.add(`${nr},${nc}`);
        }
      }
    }

    return liberties;
  }

  removeGroup(board, group) {
    for (const [row, col] of group) {
      board[row][col] = EMPTY;
    }
  }

  screenToBoard(x, y) {
    const minX = this.boardX - this.cellSize * 0.5;
    const maxX = this.boardX + this.boardPixelSize + this.cellSize * 0.5;
    const minY = this.boardY - this.cellSize * 0.5;
    const maxY = this.boardY + this.boardPixelSize + this.cellSize * 0.5;

    if (x < minX || x > maxX || y < minY || y > maxY) {
      return null;
    }

    const col = Math.round((x - this.boardX) / this.cellSize);
    const row = Math.round((y - this.boardY) / this.cellSize);

    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
      return null;
    }

    return { row, col };
  }

  update() {}

  render() {
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    this.drawBackground();
    this.drawTopBar();
    this.drawBoard();
    this.drawPieces();
    this.drawBottomInfo();
  }

  drawBackground() {
    ctx.fillStyle = '#cfa96a';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  drawTopBar() {
    // 第1行：按钮
    drawButton(
      this.backBtn.x,
      this.backBtn.y,
      this.backBtn.w,
      this.backBtn.h,
      '#34495e',
      '返回'
    );

    drawButton(
      this.restartBtn.x,
      this.restartBtn.y,
      this.restartBtn.w,
      this.restartBtn.h,
      '#27ae60',
      '重开'
    );

    // 第2行：标题
    ctx.fillStyle = '#1f1f1f';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('休闲模式', SCREEN_WIDTH / 2, this.titleY);

    // 第3行：当前落子
    ctx.font = '22px Arial';
    const text = this.currentPlayer === BLACK ? '当前落子：黑棋' : '当前落子：白棋';
    ctx.fillText(text, SCREEN_WIDTH / 2, this.turnTextY);

    // 第4行：提示
    ctx.font = '16px Arial';
    ctx.fillStyle = '#5b3a1f';
    ctx.fillText(this.statusMessage || ' ', SCREEN_WIDTH / 2, this.msgTextY);
  }

  drawBoard() {
    ctx.fillStyle = '#d8b16d';
    ctx.fillRect(
      this.boardX - 20,
      this.boardY - 20,
      this.boardPixelSize + 40,
      this.boardPixelSize + 40
    );

    ctx.strokeStyle = '#3b2a18';
    ctx.lineWidth = 2;

    for (let i = 0; i < BOARD_SIZE; i++) {
      const x = this.boardX + i * this.cellSize;
      const y = this.boardY + i * this.cellSize;

      ctx.beginPath();
      ctx.moveTo(this.boardX, y);
      ctx.lineTo(this.boardX + this.boardPixelSize, y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, this.boardY);
      ctx.lineTo(x, this.boardY + this.boardPixelSize);
      ctx.stroke();
    }

    this.drawStarPoints();
  }

  drawStarPoints() {
    const stars = [
      [2, 2],
      [2, 6],
      [4, 4],
      [6, 2],
      [6, 6]
    ];

    ctx.fillStyle = '#2c1e12';

    stars.forEach(([row, col]) => {
      const x = this.boardX + col * this.cellSize;
      const y = this.boardY + row * this.cellSize;

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawPieces() {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = this.board[row][col];
        if (cell === EMPTY) continue;

        const x = this.boardX + col * this.cellSize;
        const y = this.boardY + row * this.cellSize;
        const r = this.cellSize * 0.42;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);

        if (cell === BLACK) {
          ctx.fillStyle = '#111';
          ctx.fill();
        } else {
          ctx.fillStyle = '#f8f8f8';
          ctx.fill();
          ctx.strokeStyle = '#777';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        if (this.lastMove && this.lastMove.row === row && this.lastMove.col === col) {
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fillStyle = cell === BLACK ? '#fff' : '#111';
          ctx.fill();
        }
      }
    }
  }

  drawBottomInfo() {
    ctx.fillStyle = '#1f1f1f';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('双人同机轮流落子 · 已支持提子 / 禁入点 / 劫争', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 60);
  }
}