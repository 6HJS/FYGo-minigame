export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export default class GoBoard {
  constructor(size = 9) {
    this.size = size;
    this.grid = [];
    this.currentPlayer = BLACK;
    this.history = [];

    this.reset();
  }

  reset() {
    this.grid = Array.from({ length: this.size }, () =>
      Array(this.size).fill(EMPTY)
    );
    this.currentPlayer = BLACK;
    this.history = [];
  }

  isInside(row, col) {
    return row >= 0 && row < this.size && col >= 0 && col < this.size;
  }

  get(row, col) {
    if (!this.isInside(row, col)) return null;
    return this.grid[row][col];
  }

  canPlace(row, col) {
    if (!this.isInside(row, col)) return false;
    return this.grid[row][col] === EMPTY;
  }

  place(row, col) {
    if (!this.canPlace(row, col)) return false;

    this.grid[row][col] = this.currentPlayer;

    this.history.push({
      row,
      col,
      player: this.currentPlayer
    });

    this.currentPlayer = this.currentPlayer === BLACK ? WHITE : BLACK;
    return true;
  }

  undo() {
    const last = this.history.pop();
    if (!last) return false;

    this.grid[last.row][last.col] = EMPTY;
    this.currentPlayer = last.player;
    return true;
  }
}