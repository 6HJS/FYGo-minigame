import { BLACK, WHITE } from './board';

export default class GoRenderer {
  constructor(ctx, canvas) {
    this.ctx = ctx;
    this.canvas = canvas;

    this.layout = {
      boardX: 0,
      boardY: 0,
      cellSize: 0,
      boardPixelSize: 0
    };
  }

  updateLayout() {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 棋盘尽量占据竖屏中上部区域
    const horizontalPadding = 40;
    const topArea = 140;
    const bottomPadding = 80;

    const boardPixelSize = Math.min(
      w - horizontalPadding * 2,
      h - topArea - bottomPadding
    );

    const cellSize = boardPixelSize / 8; // 9x9 有 8 个间隔
    const boardX = (w - boardPixelSize) / 2;
    const boardY = topArea;

    this.layout = {
      boardX,
      boardY,
      cellSize,
      boardPixelSize
    };
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawBackground() {
    const { ctx, canvas } = this;
    ctx.fillStyle = '#e6c48a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawHeader(currentPlayer) {
    const { ctx, canvas } = this;

    ctx.fillStyle = '#222';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('9x9 围棋', canvas.width / 2, 60);

    ctx.font = '22px Arial';
    const text = currentPlayer === BLACK ? '当前：黑棋' : '当前：白棋';
    ctx.fillText(text, canvas.width / 2, 100);
  }

  drawBoard(board) {
    const { ctx } = this;
    const { boardX, boardY, cellSize, boardPixelSize } = this.layout;

    // 木色棋盘面
    ctx.fillStyle = '#d8a45a';
    ctx.fillRect(boardX - 20, boardY - 20, boardPixelSize + 40, boardPixelSize + 40);

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;

    // 9x9 线
    for (let i = 0; i < board.size; i++) {
      const x = boardX + i * cellSize;
      const y = boardY + i * cellSize;

      // 横线
      ctx.beginPath();
      ctx.moveTo(boardX, y);
      ctx.lineTo(boardX + boardPixelSize, y);
      ctx.stroke();

      // 竖线
      ctx.beginPath();
      ctx.moveTo(x, boardY);
      ctx.lineTo(x, boardY + boardPixelSize);
      ctx.stroke();
    }

    this.drawStarPoints(board);
    this.drawStones(board);
  }

  drawStarPoints(board) {
    const { ctx } = this;
    const { boardX, boardY, cellSize } = this.layout;

    // 9路棋盘常用星位：3,3 / 3,7 / 5,5 / 7,3 / 7,7
    const stars = [
      [2, 2],
      [2, 6],
      [4, 4],
      [6, 2],
      [6, 6]
    ];

    ctx.fillStyle = '#222';

    stars.forEach(([row, col]) => {
      const x = boardX + col * cellSize;
      const y = boardY + row * cellSize;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawStones(board) {
    const { ctx } = this;
    const { boardX, boardY, cellSize } = this.layout;

    for (let row = 0; row < board.size; row++) {
      for (let col = 0; col < board.size; col++) {
        const stone = board.get(row, col);
        if (!stone) continue;

        const x = boardX + col * cellSize;
        const y = boardY + row * cellSize;
        const radius = cellSize * 0.42;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);

        if (stone === BLACK) {
          ctx.fillStyle = '#111';
          ctx.fill();
        } else if (stone === WHITE) {
          ctx.fillStyle = '#f7f7f7';
          ctx.fill();
          ctx.strokeStyle = '#666';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
  }

  drawButtons() {
    const { ctx, canvas } = this;

    // 悔棋按钮
    ctx.fillStyle = '#5b87ff';
    ctx.fillRect(60, canvas.height - 90, 140, 52);

    ctx.fillStyle = '#fff';
    ctx.font = '22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('悔棋', 130, canvas.height - 56);

    // 重新开始按钮
    ctx.fillStyle = '#34a853';
    ctx.fillRect(canvas.width - 200, canvas.height - 90, 140, 52);

    ctx.fillStyle = '#fff';
    ctx.fillText('重开', canvas.width - 130, canvas.height - 56);
  }

  render(board) {
    this.updateLayout();
    this.clear();
    this.drawBackground();
    this.drawHeader(board.currentPlayer);
    this.drawBoard(board);
    this.drawButtons();
  }

  screenToBoard(x, y, boardSize = 9) {
    const { boardX, boardY, cellSize, boardPixelSize } = this.layout;

    const minX = boardX - cellSize * 0.5;
    const maxX = boardX + boardPixelSize + cellSize * 0.5;
    const minY = boardY - cellSize * 0.5;
    const maxY = boardY + boardPixelSize + cellSize * 0.5;

    if (x < minX || x > maxX || y < minY || y > maxY) {
      return null;
    }

    const col = Math.round((x - boardX) / cellSize);
    const row = Math.round((y - boardY) / cellSize);

    if (row < 0 || row >= boardSize || col < 0 || col >= boardSize) {
      return null;
    }

    return { row, col };
  }

  hitUndoButton(x, y) {
    return x >= 60 && x <= 200 && y >= this.canvas.height - 90 && y <= this.canvas.height - 38;
  }

  hitResetButton(x, y) {
    return (
      x >= this.canvas.width - 200 &&
      x <= this.canvas.width - 60 &&
      y >= this.canvas.height - 90 &&
      y <= this.canvas.height - 38
    );
  }
}