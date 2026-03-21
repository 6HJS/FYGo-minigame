import { drawButton, inRect } from '../utils/ui';

const ctx = canvas.getContext('2d');

const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const SCREEN_WIDTH = windowInfo.windowWidth || canvas.width;
const SCREEN_HEIGHT = windowInfo.windowHeight || canvas.height;

const EMPTY = null;
const INVALID = -1;
const DESTROYED = -2;

const BLACK = 1;
const WHITE = 2;

const PIECE_NORMAL = 'normal';
const PIECE_CAVALRY = 'cavalry';
const PIECE_BOMBER = 'bomber';

const DIRS = {
  U: { dr: -1, dc: 0 },
  D: { dr: 1, dc: 0 },
  L: { dr: 0, dc: -1 },
  R: { dr: 0, dc: 1 }
};

const BOARD_SHAPE = [
  [0,0,0,1,1,0,0,0,1,1,0,0,0],
  [0,0,1,1,1,1,0,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1],
  [0,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,0,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,1,1,1,1,1,0,0,0,0],
  [0,0,0,0,0,1,1,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,0,0,0,0]
];

const BOARD_ROWS = BOARD_SHAPE.length;
const BOARD_COLS = BOARD_SHAPE[0].length;

function createPiece(color, type = PIECE_NORMAL, dir = null) {
  return { color, type, dir };
}

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

    this.titleY = this.row1Y + 40 + 26;
    this.turnTextY = this.titleY + 42;
    this.msgTextY = this.turnTextY + 30;

    this.boardPaddingTop = this.msgTextY + 35;
    this.boardPaddingSide = 36;
    this.boardPaddingBottom = 150;

    this.cavalryBtn = {
      x: SCREEN_WIDTH / 2 - 150,
      y: SCREEN_HEIGHT - 96,
      w: 120,
      h: 42
    };

    this.bomberBtn = {
      x: SCREEN_WIDTH / 2 + 30,
      y: SCREEN_HEIGHT - 96,
      w: 120,
      h: 42
    };
  }

  resetGame() {
    this.board = Array.from({ length: BOARD_ROWS }, (_, row) =>
      Array.from({ length: BOARD_COLS }, (_, col) =>
        BOARD_SHAPE[row][col] === 1 ? EMPTY : INVALID
      )
    );

    this.currentPlayer = BLACK;
    this.lastMove = null;
    this.lastCaptured = [];
    this.statusMessage = '';

    this.previousBoardKey = this.getBoardKey(this.board);

    this.nextPieceType = PIECE_NORMAL;
    this.pendingPlacement = null;
    this.directionButtons = null;

    this.calcBoardLayout();
  }

  calcBoardLayout() {
    const validPoints = this.getAllValidPoints();

    let minRow = Infinity;
    let maxRow = -Infinity;
    let minCol = Infinity;
    let maxCol = -Infinity;

    for (const [row, col] of validPoints) {
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }

    this.minRow = minRow;
    this.maxRow = maxRow;
    this.minCol = minCol;
    this.maxCol = maxCol;

    const usableWidth = SCREEN_WIDTH - this.boardPaddingSide * 2;
    const usableHeight = SCREEN_HEIGHT - this.boardPaddingTop - this.boardPaddingBottom;

    const spanCols = Math.max(1, maxCol - minCol);
    const spanRows = Math.max(1, maxRow - minRow);

    this.cellSize = Math.min(
      usableWidth / spanCols,
      usableHeight / spanRows
    );

    const centerCol = (minCol + maxCol) / 2;
    const centerRow = (minRow + maxRow) / 2;

    this.boardCenterX = SCREEN_WIDTH / 2;
    this.boardCenterY = this.boardPaddingTop + usableHeight / 2;

    this.originX = this.boardCenterX - centerCol * this.cellSize;
    this.originY = this.boardCenterY - centerRow * this.cellSize;
  }

  getAllValidPoints() {
    const points = [];
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (BOARD_SHAPE[row][col] === 1) {
          points.push([row, col]);
        }
      }
    }
    return points;
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

    if (inRect(x, y, this.restartBtn.x, this.restartBtn.y, this.restartBtn.w, this.restartBtn.h)) {
      this.resetGame();
      return;
    }

    if (inRect(x, y, this.cavalryBtn.x, this.cavalryBtn.y, this.cavalryBtn.w, this.cavalryBtn.h)) {
      this.toggleNextSpecialPiece(PIECE_CAVALRY);
      return;
    }

    if (inRect(x, y, this.bomberBtn.x, this.bomberBtn.y, this.bomberBtn.w, this.bomberBtn.h)) {
      this.toggleNextSpecialPiece(PIECE_BOMBER);
      return;
    }

    if (this.pendingPlacement && this.directionButtons) {
      const dir = this.hitDirectionButton(x, y);
      if (dir) {
        this.confirmSpecialPlacement(dir);
        return;
      }
    }

    const point = this.screenToBoard(x, y);
    if (!point) {
      if (this.pendingPlacement) {
        this.pendingPlacement = null;
        this.directionButtons = null;
        this.statusMessage = '已取消方向选择';
      }
      return;
    }

    if (this.nextPieceType === PIECE_CAVALRY || this.nextPieceType === PIECE_BOMBER) {
      this.startSpecialPlacement(point.row, point.col, this.nextPieceType);
      return;
    }

    this.tryPlacePiece(point.row, point.col, {
      color: this.currentPlayer,
      type: PIECE_NORMAL,
      dir: null
    });
  }

  toggleNextSpecialPiece(type) {
    if (this.pendingPlacement) {
      this.pendingPlacement = null;
      this.directionButtons = null;
    }

    this.nextPieceType =
      this.nextPieceType === type ? PIECE_NORMAL : type;

    if (this.nextPieceType === PIECE_CAVALRY) {
      this.statusMessage = '下一手为骑兵：先点落点，再选方向';
    } else if (this.nextPieceType === PIECE_BOMBER) {
      this.statusMessage = '下一手为自爆兵：先点落点，再选方向';
    } else {
      this.statusMessage = '已切回普通棋子';
    }
  }

  startSpecialPlacement(row, col, type) {
    if (!this.isPlayablePoint(row, col)) return;

    if (this.board[row][col] !== EMPTY) {
      this.statusMessage = '此处已有棋子';
      return;
    }

    this.pendingPlacement = {
      row,
      col,
      color: this.currentPlayer,
      type
    };

    this.directionButtons = this.buildDirectionButtons(row, col);

    this.statusMessage =
      type === PIECE_CAVALRY
        ? '请选择骑兵方向'
        : '请选择自爆兵方向';
  }

  confirmSpecialPlacement(dir) {
    if (!this.pendingPlacement) return;

    const { row, col, color, type } = this.pendingPlacement;

    const ok = this.tryPlacePiece(row, col, {
      color,
      type,
      dir
    });

    this.pendingPlacement = null;
    this.directionButtons = null;

    if (ok) {
      this.nextPieceType = PIECE_NORMAL;
    }
  }

  tryPlacePiece(row, col, piece) {
    const result = this.simulatePlacePiece(this.board, row, col, piece, this.currentPlayer);

    if (!result.ok) {
      this.statusMessage = result.message || '落子失败';
      return false;
    }

    this.board = result.board;
    this.previousBoardKey = result.beforeBoardKey;
    this.lastMove = { row, col };
    this.lastCaptured = result.captured || [];

    const skipKey = piece.type === PIECE_CAVALRY ? `${row},${col}` : null;
    this.advanceCavalryPhase(skipKey);

    const bombResult = this.advanceBomberPhase();
    if (bombResult.exploded.length > 0) {
      this.lastCaptured = this.lastCaptured.concat(bombResult.exploded);
    }

    this.currentPlayer = this.getOpponent(this.currentPlayer);

    if (bombResult.triggeredCount > 0) {
      this.statusMessage = `自爆兵引爆 ${bombResult.triggeredCount} 枚，并清空 ${bombResult.destroyedCellsCount} 格`;
    } else if (bombResult.disabledCount > 0) {
      this.statusMessage = `有 ${bombResult.disabledCount} 枚自爆兵失去爆炸能力`;
    } else if (result.captured.length > 0) {
      this.statusMessage = `提子 ${result.captured.length} 枚`;
    } else if (piece.type === PIECE_CAVALRY) {
      this.statusMessage = `骑兵已落子，方向 ${piece.dir}`;
    } else if (piece.type === PIECE_BOMBER) {
      this.statusMessage = `自爆兵已落子，方向 ${piece.dir}`;
    } else {
      this.statusMessage = '';
    }

    return true;
  }

  simulatePlacePiece(sourceBoard, row, col, piece, player) {
    if (!this.isPlayablePoint(row, col)) {
      return { ok: false, message: '不可落子' };
    }

    if (sourceBoard[row][col] !== EMPTY) {
      return { ok: false, message: '此处已有棋子' };
    }

    const opponent = this.getOpponent(player);
    const beforeBoardKey = this.getBoardKey(sourceBoard);

    const nextBoard = this.cloneBoard(sourceBoard);
    nextBoard[row][col] = createPiece(piece.color, piece.type, piece.dir);

    let totalCaptured = [];

    const neighbors = this.getNeighborsForBoard(nextBoard, row, col);
    const visitedEnemyGroups = new Set();

    for (const [nr, nc] of neighbors) {
      const neighbor = nextBoard[nr][nc];
      if (!this.isPiece(neighbor) || neighbor.color !== opponent) continue;

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

    const selfGroup = this.getGroup(nextBoard, row, col);
    const selfLiberties = this.getLiberties(nextBoard, selfGroup);

    if (selfLiberties.size === 0) {
      return { ok: false, message: '禁入点：不可自杀' };
    }

    const nextBoardKey = this.getBoardKey(nextBoard);
    if (nextBoardKey === this.previousBoardKey) {
      return { ok: false, message: '劫争：此处暂不可落子' };
    }

    return {
      ok: true,
      board: nextBoard,
      captured: totalCaptured,
      beforeBoardKey
    };
  }

  advanceCavalryPhase(skipKey = null) {
    const cavalryList = [];

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (this.isPiece(cell) && cell.type === PIECE_CAVALRY) {
          const key = `${row},${col}`;
          if (key !== skipKey) {
            cavalryList.push({ row, col, dir: cell.dir, color: cell.color });
          }
        }
      }
    }

    for (const item of cavalryList) {
      this.advanceSingleCavalry(item.row, item.col, item.dir);
    }

    this.previousBoardKey = this.getBoardKey(this.board);
  }

  advanceSingleCavalry(row, col, dir) {
    const cell = this.board[row][col];
    if (!this.isPiece(cell)) return;
    if (cell.type !== PIECE_CAVALRY) return;
    if (cell.dir !== dir) return;

    const move = DIRS[dir];
    if (!move) return;

    const nr = row + move.dr;
    const nc = col + move.dc;

    if (!this.isPlayablePoint(nr, nc)) {
      this.board[row][col] = createPiece(cell.color, PIECE_NORMAL, null);
      return;
    }

    if (this.isPiece(this.board[nr][nc])) {
      this.board[nr][nc] = EMPTY;
    }

    this.board[nr][nc] = createPiece(cell.color, PIECE_CAVALRY, dir);
    this.board[row][col] = EMPTY;

    this.lastMove = { row: nr, col: nc };
  }

  advanceBomberPhase() {
    const bomberList = [];

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (this.isPiece(cell) && cell.type === PIECE_BOMBER) {
          bomberList.push({ row, col, dir: cell.dir, color: cell.color });
        }
      }
    }

    const exploded = [];
    let triggeredCount = 0;
    let disabledCount = 0;
    let destroyedCellsCount = 0;

    for (const item of bomberList) {
      const cell = this.board[item.row][item.col];
      if (!this.isPiece(cell)) continue;
      if (cell.type !== PIECE_BOMBER) continue;

      if (this.bomberHasEnemyAdjacent(item.row, item.col, cell.color)) {
        this.board[item.row][item.col] = createPiece(cell.color, PIECE_NORMAL, null);
        disabledCount++;
        continue;
      }

      const area = this.getBomberBlastArea(item.row, item.col, cell.dir);
      for (const [r, c] of area) {
        if (this.isPiece(this.board[r][c])) {
          exploded.push([r, c]);
        }
        if (this.board[r][c] !== DESTROYED) {
          destroyedCellsCount++;
        }
        this.board[r][c] = DESTROYED;
      }

      triggeredCount++;
      this.lastMove = { row: item.row, col: item.col };
    }

    this.previousBoardKey = this.getBoardKey(this.board);

    return {
      exploded,
      triggeredCount,
      disabledCount,
      destroyedCellsCount
    };
  }

  bomberHasEnemyAdjacent(row, col, color) {
    const enemy = this.getOpponent(color);
    const neighbors = this.getNeighborsForBoard(this.board, row, col);

    for (const [nr, nc] of neighbors) {
      const cell = this.board[nr][nc];
      if (this.isPiece(cell) && cell.color === enemy) {
        return true;
      }
    }

    return false;
  }

  getBomberBlastArea(row, col, dir) {
    const offsetsByDir = {
      U: [
        [0, -1], [0, 0], [0, 1],
        [-1, -1], [-1, 0], [-1, 1]
      ],
      D: [
        [0, -1], [0, 0], [0, 1],
        [1, -1], [1, 0], [1, 1]
      ],
      L: [
        [-1, 0], [0, 0], [1, 0],
        [-1, -1], [0, -1], [1, -1]
      ],
      R: [
        [-1, 0], [0, 0], [1, 0],
        [-1, 1], [0, 1], [1, 1]
      ]
    };

    const offsets = offsetsByDir[dir] || offsetsByDir.U;
    const result = [];
    const seen = new Set();

    for (const [dr, dc] of offsets) {
      const nr = row + dr;
      const nc = col + dc;
      if (!this.isBoardShapeCell(nr, nc)) continue;

      const key = `${nr},${nc}`;
      if (seen.has(key)) continue;
      seen.add(key);

      result.push([nr, nc]);
    }

    return result;
  }

  isInside(row, col) {
    return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
  }

  isBoardShapeCell(row, col) {
    return this.isInside(row, col) && BOARD_SHAPE[row][col] === 1;
  }

  isPlayablePoint(row, col) {
    return this.isBoardShapeCell(row, col) && this.board[row][col] !== DESTROYED;
  }

  isPiece(cell) {
    return !!cell && cell !== INVALID && cell !== DESTROYED;
  }

  getOpponent(player) {
    return player === BLACK ? WHITE : BLACK;
  }

  cloneBoard(board) {
    return board.map((row) =>
      row.map((cell) => {
        if (cell === INVALID) return INVALID;
        if (cell === DESTROYED) return DESTROYED;
        if (cell === EMPTY) return EMPTY;
        return { ...cell };
      })
    );
  }

  getBoardKey(board) {
    return board
      .map((row) =>
        row
          .map((cell) => {
            if (cell === INVALID) return 'X';
            if (cell === DESTROYED) return '#';
            if (cell === EMPTY) return '.';

            let typeCode = 'N';
            if (cell.type === PIECE_CAVALRY) typeCode = 'C';
            if (cell.type === PIECE_BOMBER) typeCode = 'B';

            return `${cell.color}${typeCode}${cell.dir || '_'}`;
          })
          .join(',')
      )
      .join('|');
  }

  getNeighborsForBoard(board, row, col) {
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
      if (
        this.isInside(nr, nc) &&
        BOARD_SHAPE[nr][nc] === 1 &&
        board[nr][nc] !== DESTROYED
      ) {
        result.push([nr, nc]);
      }
    }
    return result;
  }

  getGroup(board, row, col) {
    const start = board[row][col];
    if (!this.isPiece(start)) return [];

    const color = start.color;
    const stack = [[row, col]];
    const visited = new Set([`${row},${col}`]);
    const group = [];

    while (stack.length > 0) {
      const [cr, cc] = stack.pop();
      group.push([cr, cc]);

      const neighbors = this.getNeighborsForBoard(board, cr, cc);
      for (const [nr, nc] of neighbors) {
        const cell = board[nr][nc];
        if (!this.isPiece(cell) || cell.color !== color) continue;

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
      const neighbors = this.getNeighborsForBoard(board, row, col);
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

  boardToScreen(row, col) {
    return {
      x: this.originX + col * this.cellSize,
      y: this.originY + row * this.cellSize
    };
  }

  screenToBoard(x, y) {
    let nearest = null;
    let minDist = Infinity;
    const threshold = this.cellSize * 0.45;

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (!this.isPlayablePoint(row, col)) continue;

        const pos = this.boardToScreen(row, col);
        const dx = x - pos.x;
        const dy = y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minDist) {
          minDist = dist;
          nearest = { row, col };
        }
      }
    }

    if (nearest && minDist <= threshold) {
      return nearest;
    }

    return null;
  }

  buildDirectionButtons(row, col) {
    const center = this.boardToScreen(row, col);
    const offset = this.cellSize * 0.9;
    const size = this.cellSize * 0.34;

    return {
      U: { x: center.x, y: center.y - offset, size, dir: 'U' },
      D: { x: center.x, y: center.y + offset, size, dir: 'D' },
      L: { x: center.x - offset, y: center.y, size, dir: 'L' },
      R: { x: center.x + offset, y: center.y, size, dir: 'R' }
    };
  }

  hitDirectionButton(x, y) {
    if (!this.directionButtons) return null;

    for (const dir of ['U', 'D', 'L', 'R']) {
      const btn = this.directionButtons[dir];
      const dx = x - btn.x;
      const dy = y - btn.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= btn.size * 1.2) return dir;
    }

    return null;
  }

  update() {}

  render() {
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    this.drawBackground();
    this.drawTopBar();
    this.drawBoard();
    this.drawPieces();
    this.drawPendingPlacement();
    this.drawBottomUI();
  }

  drawBackground() {
    ctx.fillStyle = '#cfa96a';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  drawTopBar() {
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

    ctx.fillStyle = '#1f1f1f';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('爱心棋盘', SCREEN_WIDTH / 2, this.titleY);

    ctx.font = '22px Arial';
    const text = this.currentPlayer === BLACK ? '当前落子：黑棋' : '当前落子：白棋';
    ctx.fillText(text, SCREEN_WIDTH / 2, this.turnTextY);

    ctx.font = '16px Arial';
    ctx.fillStyle = '#5b3a1f';
    ctx.fillText(this.statusMessage || ' ', SCREEN_WIDTH / 2, this.msgTextY);
  }

  drawBoard() {
    this.drawHeartBackground();
    this.drawBoardLines();
    this.drawBoardPoints();
    this.drawDestroyedCells();
  }

  drawHeartBackground() {
    const padding = this.cellSize * 0.7;

    const left = this.originX + this.minCol * this.cellSize - padding;
    const top = this.originY + this.minRow * this.cellSize - padding;
    const right = this.originX + this.maxCol * this.cellSize + padding;
    const bottom = this.originY + this.maxRow * this.cellSize + padding;

    ctx.fillStyle = '#d8b16d';
    ctx.fillRect(left, top, right - left, bottom - top);
  }

  drawBoardLines() {
    ctx.strokeStyle = '#3b2a18';
    ctx.lineWidth = 2;

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (!this.canDrawConnection(row, col)) continue;

        const current = this.boardToScreen(row, col);

        if (this.canDrawConnection(row, col + 1)) {
          const right = this.boardToScreen(row, col + 1);
          ctx.beginPath();
          ctx.moveTo(current.x, current.y);
          ctx.lineTo(right.x, right.y);
          ctx.stroke();
        }

        if (this.canDrawConnection(row + 1, col)) {
          const down = this.boardToScreen(row + 1, col);
          ctx.beginPath();
          ctx.moveTo(current.x, current.y);
          ctx.lineTo(down.x, down.y);
          ctx.stroke();
        }
      }
    }
  }

  canDrawConnection(row, col) {
    return this.isBoardShapeCell(row, col) && this.board[row][col] !== DESTROYED;
  }

  drawBoardPoints() {
    ctx.fillStyle = '#2c1e12';

    const centerRow = Math.round((this.minRow + this.maxRow) / 2);
    const centerCol = Math.round((this.minCol + this.maxCol) / 2);

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (!this.isPlayablePoint(row, col)) continue;

        const { x, y } = this.boardToScreen(row, col);
        const isTengen = (row === centerRow && col === centerCol);
        const radius = isTengen ? Math.max(4.5, this.cellSize * 0.16) : 0;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawDestroyedCells() {
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (this.board[row][col] !== DESTROYED) continue;

        const { x, y } = this.boardToScreen(row, col);
        const size = this.cellSize * 1.08;

        ctx.save();
        ctx.fillStyle = '#cfa96a';
        ctx.fillRect(
          x - size / 2,
          y - size / 2,
          size,
          size
        );
        ctx.restore();
      }
    }
  }

  drawPieces() {
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (!this.isPiece(cell)) continue;

        const { x, y } = this.boardToScreen(row, col);
        this.drawOnePiece(x, y, cell, row, col);
      }
    }
  }

  drawOnePiece(x, y, cell, row, col, isPreview = false) {
    const r = this.cellSize * 0.36;

    ctx.save();

    if (isPreview) {
      ctx.globalAlpha = 0.65;
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);

    if (cell.color === BLACK) {
      ctx.fillStyle = '#111';
      ctx.fill();
    } else {
      ctx.fillStyle = '#f8f8f8';
      ctx.fill();
      ctx.strokeStyle = '#777';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (cell.type === PIECE_CAVALRY || cell.type === PIECE_BOMBER) {
      ctx.font = `${Math.max(14, this.cellSize * 0.42)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = cell.color === BLACK ? '#fff' : '#222';

      const symbol = cell.type === PIECE_CAVALRY ? '🐴' : '💥';
      ctx.fillText(symbol, x, y + 1);

      this.drawDirectionMarker(x, y, r, cell.dir, cell.color);
    }

    if (
      !isPreview &&
      this.lastMove &&
      this.lastMove.row === row &&
      this.lastMove.col === col
    ) {
      const t = Date.now() / 200;
      const pulse = 4 + Math.sin(t) * 2;

      ctx.beginPath();
      ctx.arc(x, y, Math.max(3, pulse), 0, Math.PI * 2);
      ctx.fillStyle = 'red';
      ctx.fill();
    }

    ctx.restore();
  }

  drawDirectionMarker(x, y, r, dir, color) {
    if (!dir) return;

    const size = Math.max(5, this.cellSize * 0.14);
    const offset = r * 0.82;

    ctx.beginPath();

    if (dir === 'U') {
      ctx.moveTo(x, y - offset - size);
      ctx.lineTo(x - size, y - offset + size * 0.6);
      ctx.lineTo(x + size, y - offset + size * 0.6);
    } else if (dir === 'D') {
      ctx.moveTo(x, y + offset + size);
      ctx.lineTo(x - size, y + offset - size * 0.6);
      ctx.lineTo(x + size, y + offset - size * 0.6);
    } else if (dir === 'L') {
      ctx.moveTo(x - offset - size, y);
      ctx.lineTo(x - offset + size * 0.6, y - size);
      ctx.lineTo(x - offset + size * 0.6, y + size);
    } else if (dir === 'R') {
      ctx.moveTo(x + offset + size, y);
      ctx.lineTo(x + offset - size * 0.6, y - size);
      ctx.lineTo(x + offset - size * 0.6, y + size);
    }

    ctx.closePath();
    ctx.fillStyle = color === BLACK ? '#ffda44' : '#d35400';
    ctx.fill();
  }

  drawPendingPlacement() {
    if (!this.pendingPlacement) return;

    const { row, col, color, type } = this.pendingPlacement;
    const { x, y } = this.boardToScreen(row, col);

    this.drawOnePiece(
      x,
      y,
      createPiece(color, type, null),
      row,
      col,
      true
    );

    this.drawDirectionButtons();
  }

  drawDirectionButtons() {
    if (!this.directionButtons) return;

    for (const dir of ['U', 'D', 'L', 'R']) {
      const btn = this.directionButtons[dir];
      this.drawTriangleButton(btn.x, btn.y, btn.size, dir);
    }
  }

  drawTriangleButton(x, y, size, dir) {
    ctx.save();

    ctx.beginPath();
    if (dir === 'U') {
      ctx.moveTo(x, y - size);
      ctx.lineTo(x - size, y + size);
      ctx.lineTo(x + size, y + size);
    } else if (dir === 'D') {
      ctx.moveTo(x, y + size);
      ctx.lineTo(x - size, y - size);
      ctx.lineTo(x + size, y - size);
    } else if (dir === 'L') {
      ctx.moveTo(x - size, y);
      ctx.lineTo(x + size, y - size);
      ctx.lineTo(x + size, y + size);
    } else if (dir === 'R') {
      ctx.moveTo(x + size, y);
      ctx.lineTo(x - size, y - size);
      ctx.lineTo(x - size, y + size);
    }
    ctx.closePath();

    ctx.fillStyle = 'rgba(52, 152, 219, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  drawBottomUI() {
    const cavalryOn = this.nextPieceType === PIECE_CAVALRY;
    const bomberOn = this.nextPieceType === PIECE_BOMBER;

    drawButton(
      this.cavalryBtn.x,
      this.cavalryBtn.y,
      this.cavalryBtn.w,
      this.cavalryBtn.h,
      cavalryOn ? '#c0392b' : '#8e6e3b',
      cavalryOn ? '骑兵：开' : '骑兵'
    );

    drawButton(
      this.bomberBtn.x,
      this.bomberBtn.y,
      this.bomberBtn.w,
      this.bomberBtn.h,
      bomberOn ? '#8e44ad' : '#8e6e3b',
      bomberOn ? '自爆兵：开' : '自爆兵'
    );

    ctx.fillStyle = '#1f1f1f';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      '骑兵会推进；自爆兵若相邻敌军则降级，否则按朝向炸 2x3 并把格子彻底清空',
      SCREEN_WIDTH / 2,
      SCREEN_HEIGHT - 28
    );
  }
}