export const COLORS = {
  BLACK: 'black',
  WHITE: 'white'
};

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function createEmptyBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function inBounds(size, x, y) {
  return x >= 0 && x < size && y >= 0 && y < size;
}

function keyOf(x, y) {
  return `${x},${y}`;
}

function getNeighbors(size, x, y) {
  return [
    [x, y - 1],
    [x + 1, y],
    [x, y + 1],
    [x - 1, y]
  ].filter(([nx, ny]) => inBounds(size, nx, ny));
}

function collectGroup(board, x, y) {
  const size = board.length;
  const color = board[y][x];
  if (!color) return { stones: [], liberties: [] };
  const stack = [[x, y]];
  const visited = new Set([keyOf(x, y)]);
  const stones = [];
  const liberties = new Set();

  while (stack.length) {
    const [cx, cy] = stack.pop();
    stones.push([cx, cy]);
    for (const [nx, ny] of getNeighbors(size, cx, cy)) {
      const value = board[ny][nx];
      if (!value) {
        liberties.add(keyOf(nx, ny));
        continue;
      }
      if (value !== color) continue;
      const k = keyOf(nx, ny);
      if (visited.has(k)) continue;
      visited.add(k);
      stack.push([nx, ny]);
    }
  }

  return { stones, liberties: Array.from(liberties).map((item) => item.split(',').map(Number)) };
}

function boardHash(board) {
  return board.map((row) => row.map((cell) => cell ? (cell === COLORS.BLACK ? 'b' : 'w') : '.').join('')).join('/');
}

export default class AuthoritativeEngine {
  constructor({ size = 9, turnTimeMs = 30000, boardMask = null } = {}) {
    this.size = size;
    this.turnTimeMs = turnTimeMs;
    this.board = createEmptyBoard(size);
    this.boardMask = boardMask;
    this.currentPlayer = COLORS.BLACK;
    this.turnNumber = 1;
    this.moveNumber = 0;
    this.captures = { black: 0, white: 0 };
    this.passCount = 0;
    this.phase = 'waiting';
    this.winner = null;
    this.endedReason = null;
    this.history = [];
    this.lastMoveAt = null;
    this.deadlineAt = null;
    this.version = 1;
  }

  start() {
    this.phase = 'playing';
    this.lastMoveAt = Date.now();
    this.deadlineAt = this.lastMoveAt + this.turnTimeMs;
  }

  canPlace(x, y) {
    if (!inBounds(this.size, x, y)) return false;
    if (this.boardMask && this.boardMask[y] && this.boardMask[y][x] === 0) return false;
    return this.board[y][x] === null;
  }

  switchTurn() {
    this.currentPlayer = this.currentPlayer === COLORS.BLACK ? COLORS.WHITE : COLORS.BLACK;
    this.turnNumber += 1;
    this.deadlineAt = Date.now() + this.turnTimeMs;
  }

  snapshot() {
    return {
      size: this.size,
      board: cloneBoard(this.board),
      currentPlayer: this.currentPlayer,
      turnNumber: this.turnNumber,
      moveNumber: this.moveNumber,
      captures: { ...this.captures },
      passCount: this.passCount,
      phase: this.phase,
      winner: this.winner,
      endedReason: this.endedReason,
      deadlineAt: this.deadlineAt,
      version: this.version,
      boardHash: boardHash(this.board)
    };
  }

  applyAction(action) {
    if (this.phase !== 'playing') {
      throw new Error('对局尚未开始或已结束');
    }
    if (!action || typeof action !== 'object') throw new Error('非法 action');
    if (action.playerColor !== this.currentPlayer) throw new Error('未到该玩家回合');

    if (action.type === 'move') return this.applyMove(action);
    if (action.type === 'pass') return this.applyPass(action);
    if (action.type === 'resign') return this.applyResign(action);
    throw new Error(`未知 action: ${action.type}`);
  }

  applyMove(action) {
    const x = Number(action.x);
    const y = Number(action.y);
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error('坐标非法');
    if (!this.canPlace(x, y)) throw new Error('该位置不可落子');

    const nextBoard = cloneBoard(this.board);
    nextBoard[y][x] = this.currentPlayer;
    const opponent = this.currentPlayer === COLORS.BLACK ? COLORS.WHITE : COLORS.BLACK;
    let captured = 0;

    for (const [nx, ny] of getNeighbors(this.size, x, y)) {
      if (nextBoard[ny][nx] !== opponent) continue;
      const group = collectGroup(nextBoard, nx, ny);
      if (group.liberties.length === 0) {
        group.stones.forEach(([sx, sy]) => {
          nextBoard[sy][sx] = null;
          captured += 1;
        });
      }
    }

    const selfGroup = collectGroup(nextBoard, x, y);
    if (selfGroup.liberties.length === 0) {
      throw new Error('不允许自杀');
    }

    const nextHash = boardHash(nextBoard);
    const lastHash = this.history.length ? this.history[this.history.length - 1].boardHashAfter : null;
    if (lastHash && lastHash === nextHash) {
      throw new Error('触发简化劫争保护');
    }

    this.board = nextBoard;
    this.moveNumber += 1;
    this.passCount = 0;
    this.captures[this.currentPlayer] += captured;
    this.history.push({
      type: 'move',
      playerColor: this.currentPlayer,
      x,
      y,
      captured,
      boardHashAfter: nextHash,
      at: Date.now()
    });
    this.version += 1;
    this.switchTurn();
    return this.snapshot();
  }

  applyPass() {
    this.moveNumber += 1;
    this.passCount += 1;
    this.history.push({
      type: 'pass',
      playerColor: this.currentPlayer,
      at: Date.now(),
      boardHashAfter: boardHash(this.board)
    });
    this.version += 1;

    if (this.passCount >= 2) {
      this.phase = 'ended';
      this.endedReason = 'double_pass';
      this.winner = null;
      this.deadlineAt = null;
      return this.snapshot();
    }

    this.switchTurn();
    return this.snapshot();
  }

  applyResign() {
    const loser = this.currentPlayer;
    this.phase = 'ended';
    this.endedReason = 'resign';
    this.winner = loser === COLORS.BLACK ? COLORS.WHITE : COLORS.BLACK;
    this.deadlineAt = null;
    this.version += 1;
    this.history.push({
      type: 'resign',
      playerColor: loser,
      at: Date.now(),
      boardHashAfter: boardHash(this.board)
    });
    return this.snapshot();
  }

  forceTimeoutLose(color) {
    if (this.phase !== 'playing') return this.snapshot();
    this.phase = 'ended';
    this.endedReason = 'timeout';
    this.winner = color === COLORS.BLACK ? COLORS.WHITE : COLORS.BLACK;
    this.deadlineAt = null;
    this.version += 1;
    return this.snapshot();
  }
}
