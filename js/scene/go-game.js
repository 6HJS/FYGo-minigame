import GoBoard from '../go/board';
import GoRenderer from '../go/renderer';

export default class GoGameScene {
  constructor(ctx, canvas, onBack) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.onBack = onBack;

    this.board = new GoBoard(9);
    this.renderer = new GoRenderer(ctx, canvas);

    this.handleTouch = this.handleTouch.bind(this);

    wx.onTouchStart(this.handleTouch);
  }

  destroy() {
    wx.offTouchStart(this.handleTouch);
  }

  handleTouch(res) {
    const touch = res.touches[0] || res.changedTouches[0];
    if (!touch) return;

    const x = touch.clientX;
    const y = touch.clientY;

    // 顶部返回区域
    if (x >= 20 && x <= 120 && y >= 20 && y <= 70) {
      if (this.onBack) this.onBack();
      return;
    }

    if (this.renderer.hitUndoButton(x, y)) {
      this.board.undo();
      return;
    }

    if (this.renderer.hitResetButton(x, y)) {
      this.board.reset();
      return;
    }

    const point = this.renderer.screenToBoard(x, y, this.board.size);
    if (!point) return;

    this.board.place(point.row, point.col);
  }

  update() {
    // 当前版本没有动画逻辑
  }

  render() {
    this.renderer.render(this.board);
    this.drawBackButton();
  }

  drawBackButton() {
    const { ctx } = this;

    ctx.fillStyle = '#333';
    ctx.fillRect(20, 20, 100, 44);

    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('返回', 70, 48);
  }
}