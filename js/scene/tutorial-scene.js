import { drawButton, inRect } from '../utils/ui';

const ctx = canvas.getContext('2d');
const SCREEN_WIDTH = canvas.width;
const SCREEN_HEIGHT = canvas.height;

const windowInfo = wx.getWindowInfo();
const SAFE_TOP = windowInfo.safeArea
  ? windowInfo.safeArea.top
  : windowInfo.statusBarHeight || 20;

export default class TutorialScene {
  constructor(sceneManager, homeScene, gameScene) {
    this.sceneManager = sceneManager;
    this.homeScene = homeScene;
    this.gameScene = gameScene;

    this.scrollY = 0;
    this.lastTouchY = null;

    this.levels = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      name: `教学关卡${i + 1}`,
      unlocked: i === 0
    }));
  }

  getContentHeight() {
    const btnH = 56;
    const gap = 16;
    const startY = SAFE_TOP + 90;
    return startY + this.levels.length * (btnH + gap);
  }

  onEnter() {
    this.scrollY = 0;
    this.lastTouchY = null;
  }

  onTouchStart(e) {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    this.lastTouchY = y;

    if (inRect(x, y, 20, SAFE_TOP + 10, 100, 50)) {
      this.sceneManager.switchTo(this.homeScene);
      return;
    }

    const btnX = 30;
    const btnW = SCREEN_WIDTH - 60;
    const btnH = 56;
    const gap = 16;
    const startY = SAFE_TOP + 90;

    for (let i = 0; i < this.levels.length; i++) {
      const itemY = startY + i * (btnH + gap) - this.scrollY;

      if (inRect(x, y, btnX, itemY, btnW, btnH)) {
        if (i === 0) {
          this.gameScene.startLevel1();
          this.sceneManager.switchTo(this.gameScene);
        } else {
          wx.showToast({
            title: `第${i + 1}关暂未开放`,
            icon: 'none'
          });
        }
        return;
      }
    }
  }

  onTouchMove(e) {
    const touch = e.touches[0];
    const y = touch.clientY;

    if (this.lastTouchY !== null) {
      const deltaY = y - this.lastTouchY;
      this.scrollY -= deltaY;

      const contentHeight = this.getContentHeight();
      const headerBottom = SAFE_TOP + 80;
      const visibleHeight = SCREEN_HEIGHT - headerBottom;
      const maxScroll = Math.max(0, contentHeight - visibleHeight);

      if (this.scrollY < 0) this.scrollY = 0;
      if (this.scrollY > maxScroll) this.scrollY = maxScroll;
    }

    this.lastTouchY = y;
  }

  onTouchEnd() {
    this.lastTouchY = null;
  }

  update() {}

  render() {
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.fillStyle = '#f5f1e8';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    const headerBottom = SAFE_TOP + 80;

    ctx.fillStyle = '#f5f1e8';
    ctx.fillRect(0, 0, SCREEN_WIDTH, headerBottom);

    ctx.fillStyle = '#333333';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('玩法教学', SCREEN_WIDTH / 2, SAFE_TOP + 35);

    const btnX = 30;
    const btnW = SCREEN_WIDTH - 60;
    const btnH = 56;
    const gap = 16;
    const startY = SAFE_TOP + 90;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, headerBottom, SCREEN_WIDTH, SCREEN_HEIGHT - headerBottom);
    ctx.clip();

    for (let i = 0; i < this.levels.length; i++) {
      const level = this.levels[i];
      const y = startY + i * (btnH + gap) - this.scrollY;

      if (y + btnH < headerBottom || y > SCREEN_HEIGHT) continue;

      const bgColor = level.unlocked ? '#ffffff' : '#d9d9d9';
      const text = level.unlocked
        ? `第${level.id}关`
        : `第${level.id}关（未解锁）`;

      drawButton(
        btnX,
        y,
        btnW,
        btnH,
        bgColor,
        text,
        20,
        level.unlocked ? '#333333' : '#888888'
      );
    }

    ctx.restore();

    drawButton(20, SAFE_TOP + 10, 100, 50, '#666666', '返回', 20);
  }
}