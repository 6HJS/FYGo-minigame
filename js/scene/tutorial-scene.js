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
      unlocked: i === 0,
      completed: false,       // 是否完成教学
      rewardClaimed: false    // 是否已领取宝箱
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

  claimReward(level) {
    if (!level.completed) {
      wx.showToast({
        title: '请先完成教学关卡',
        icon: 'none'
      });
      return;
    }

    if (level.rewardClaimed) {
      wx.showToast({
        title: '宝箱已领取',
        icon: 'none'
      });
      return;
    }

    level.rewardClaimed = true;

    wx.showToast({
      title: `已领取第${level.id}关皮肤宝箱`,
      icon: 'success'
    });
  }

  enterLevel(index) {
    const level = this.levels[index];

    if (!level.unlocked) {
      wx.showToast({
        title: `第${index + 1}关暂未开放`,
        icon: 'none'
      });
      return;
    }

    if (index === 0) {
      this.gameScene.startLevel1();
      this.sceneManager.switchTo(this.gameScene);
    } else {
      wx.showToast({
        title: `第${index + 1}关暂未开放`,
        icon: 'none'
      });
    }
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
    const leftW = btnW * 0.68;
    const rightW = btnW - leftW;
    const btnH = 56;
    const gap = 16;
    const startY = SAFE_TOP + 90;

    for (let i = 0; i < this.levels.length; i++) {
      const itemY = startY + i * (btnH + gap) - this.scrollY;

      if (itemY + btnH < SAFE_TOP + 80 || itemY > SCREEN_HEIGHT) continue;

      // 左半：进入关卡
      if (inRect(x, y, btnX, itemY, leftW, btnH)) {
        this.enterLevel(i);
        return;
      }

      // 右半：领取宝箱
      if (inRect(x, y, btnX + leftW, itemY, rightW, btnH)) {
        this.claimReward(this.levels[i]);
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

    // 顶部标题区
    ctx.fillStyle = '#f5f1e8';
    ctx.fillRect(0, 0, SCREEN_WIDTH, headerBottom);

    ctx.fillStyle = '#333333';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('玩法教学', SCREEN_WIDTH / 2, SAFE_TOP + 35);

    const btnX = 30;
    const btnW = SCREEN_WIDTH - 60;
    const leftW = btnW * 0.68;
    const rightW = btnW - leftW;
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

      // 左半颜色和文字
      const leftBg = level.unlocked ? '#ffffff' : '#d9d9d9';
      const leftText = level.unlocked
        ? `第${level.id}关`
        : `第${level.id}关（未解锁）`;
      const leftTextColor = level.unlocked ? '#333333' : '#888888';

      // 右半颜色和文字
      let rightBg = '#d9d9d9';
      let rightText = '未完成';
      let rightTextColor = '#888888';

      if (level.completed && !level.rewardClaimed) {
        rightBg = '#ffe08a';
        rightText = '领取宝箱';
        rightTextColor = '#6b4b00';
      } else if (level.completed && level.rewardClaimed) {
        rightBg = '#cdeccf';
        rightText = '已领取';
        rightTextColor = '#2d6a34';
      }

      // 左半按钮
      drawButton(
        btnX,
        y,
        leftW,
        btnH,
        leftBg,
        leftText,
        20,
        leftTextColor
      );

      // 右半按钮
      drawButton(
        btnX + leftW,
        y,
        rightW,
        btnH,
        rightBg,
        rightText,
        18,
        rightTextColor
      );

      // 中间分隔线
      ctx.strokeStyle = '#bbbbbb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(btnX + leftW, y + 6);
      ctx.lineTo(btnX + leftW, y + btnH - 6);
      ctx.stroke();
    }

    ctx.restore();

    drawButton(20, SAFE_TOP + 10, 100, 50, '#666666', '返回', 20);
  }
}