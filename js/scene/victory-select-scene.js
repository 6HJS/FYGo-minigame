import { drawButton, inRect } from '../utils/ui';

const ctx = canvas.getContext('2d');
const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const SCREEN_WIDTH = windowInfo.windowWidth || canvas.width;
const SCREEN_HEIGHT = windowInfo.windowHeight || canvas.height;

export default class VictorySelectScene {
  constructor(sceneManager, goGameScene) {
    this.sceneManager = sceneManager;
    this.goGameScene = goGameScene;
    this.boardSelectScene = null;
    this.cardSelectScene = null;
    this.homeScene = null;
    this.bgm = 'audio/bgm_title.mp3';

    this.boardConfig = null;
    this.victoryOptions = [
      { label: '不限', captureTarget: 0, desc: '按普通规则游玩，不设置提子数胜利门槛。' },
      { label: '先提3子获胜', captureTarget: 3, desc: '适合超快节奏对局。' },
      { label: '先提5子获胜', captureTarget: 5, desc: '推荐默认模式，节奏较平衡。' },
      { label: '先提7子获胜', captureTarget: 7, desc: '更偏中盘作战。' },
      { label: '先提10子获胜', captureTarget: 10, desc: '更耐玩，适合大一些的异形棋盘。' }
    ];
    this.selectedIndex = 2;

    this.initLayout();
  }

  initLayout() {
    const menuButton = wx.getMenuButtonBoundingClientRect
      ? wx.getMenuButtonBoundingClientRect()
      : null;

    const safeTop = menuButton ? Math.max(12, menuButton.top - 8) : 24;
    const capsuleBottom = menuButton ? menuButton.bottom : safeTop + 32;

    this.safeTop = safeTop;
    this.backBtn = { x: 24, y: capsuleBottom + 18, w: 100, h: 40 };
    this.titleY = this.backBtn.y + 80;

    this.boardInfoRect = {
      x: 32,
      y: this.titleY + 54,
      w: SCREEN_WIDTH - 64,
      h: 86
    };

    this.listTop = this.boardInfoRect.y + 24;
    this.optionH = 74;
    this.optionGap = 14;
    this.optionRects = this.victoryOptions.map((_, i) => ({
      x: 32,
      y: this.listTop + i * (this.optionH + this.optionGap),
      w: SCREEN_WIDTH - 64,
      h: this.optionH
    }));

    this.confirmBtn = {
      x: 40,
      y: SCREEN_HEIGHT - 88,
      w: SCREEN_WIDTH - 80,
      h: 56
    };
  }

  onEnter() {
    if (this.goGameScene && this.goGameScene.getCaptureTarget) {
      const target = Number(this.goGameScene.getCaptureTarget() || 0);
      const index = this.victoryOptions.findIndex((item) => Number(item.captureTarget || 0) === target);
      if (index >= 0) this.selectedIndex = index;
    }
  }

  setSelectedBoard(board) {
    this.boardConfig = board;
  }

  getSelectedVictoryOption() {
    return this.victoryOptions[this.selectedIndex] || this.victoryOptions[0];
  }

  confirmSelection() {
    const board = this.boardConfig || (this.goGameScene && this.goGameScene.boardConfig);
    const option = this.getSelectedVictoryOption();
    const condition = {
      type: 'capture',
      captureTarget: Number(option.captureTarget || 0)
    };

    if (this.goGameScene) {
      this.goGameScene.setBoardConfig(board);
      this.goGameScene.setVictoryCondition(condition);
    }

    if (this.cardSelectScene) {
      this.cardSelectScene.setSelectedBoard(board);
      this.cardSelectScene.setVictoryCondition(condition);
      this.sceneManager.switchTo(this.cardSelectScene);
    }
  }

  onTouchStart(e) {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    if (inRect(x, y, this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h)) {
      if (this.boardSelectScene) this.sceneManager.switchTo(this.boardSelectScene);
      return;
    }

    for (let i = 0; i < this.optionRects.length; i++) {
      const rect = this.optionRects[i];
      if (inRect(x, y, rect.x, rect.y, rect.w, rect.h)) {
        this.selectedIndex = i;
        return;
      }
    }

    if (inRect(x, y, this.confirmBtn.x, this.confirmBtn.y, this.confirmBtn.w, this.confirmBtn.h)) {
      this.confirmSelection();
    }
  }

  onTouchMove() {}
  onTouchEnd() {}
  update() {}

  drawBoardInfo() {
    const board = this.boardConfig || (this.goGameScene && this.goGameScene.boardConfig);

    ctx.save();
    ctx.fillStyle = '#e7d1a1';
    ctx.strokeStyle = '#8e6e3b';
    ctx.lineWidth = 3;
    ctx.fillRect(this.boardInfoRect.x, this.boardInfoRect.y, this.boardInfoRect.w, this.boardInfoRect.h);
    ctx.strokeRect(this.boardInfoRect.x, this.boardInfoRect.y, this.boardInfoRect.w, this.boardInfoRect.h);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5b3a1f';
    ctx.font = 'bold 18px Arial';
    ctx.fillText('当前棋盘', this.boardInfoRect.x + 16, this.boardInfoRect.y + 24);
    ctx.font = 'bold 26px Arial';
    ctx.fillText(board ? board.name : '未选择', this.boardInfoRect.x + 16, this.boardInfoRect.y + 56);
    ctx.restore();
  }

  drawVictoryOption(rect, option, selected) {
    ctx.save();
    ctx.fillStyle = selected ? '#f7d794' : '#f3e5c8';
    ctx.strokeStyle = selected ? '#2d6a4f' : '#8e6e3b';
    ctx.lineWidth = selected ? 4 : 3;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5b3a1f';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(option.label, rect.x + 18, rect.y + 28);
    ctx.font = '14px Arial';
    ctx.fillStyle = '#6b4f2c';
    ctx.fillText(option.desc, rect.x + 18, rect.y + 54);

    if (selected) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#2d6a4f';
      ctx.font = 'bold 18px Arial';
      ctx.fillText('已选', rect.x + rect.w - 18, rect.y + rect.h / 2);
    }

    ctx.restore();
  }

  render() {
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    ctx.fillStyle = '#1f2940';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    drawButton(this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h, '#5b667a', '返回', 20);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2e4a5';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('选择胜利条件', SCREEN_WIDTH / 2, this.titleY);
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.restore();

    for (let i = 0; i < this.optionRects.length; i++) {
      this.drawVictoryOption(this.optionRects[i], this.victoryOptions[i], i === this.selectedIndex);
    }

    drawButton(this.confirmBtn.x, this.confirmBtn.y, this.confirmBtn.w, this.confirmBtn.h, '#2db15f', '确认条件', 24);
  }
}
