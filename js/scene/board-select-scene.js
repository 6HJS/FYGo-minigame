import { drawButton, inRect } from '../utils/ui';

const square9 = require('../data/boards/square9.js');
const heart = require('../data/boards/heart.js');
const dumbbell = require('../data/boards/dumbbell.js');
const poll = require('../data/boards/poll.js');
const diamond = require('../data/boards/diamond.js');
const cross = require('../data/boards/cross.js');
const butterfly = require('../data/boards/butterfly.js');
const hourglass = require('../data/boards/hourglass.js');
const ring = require('../data/boards/ring.js');
const arrow = require('../data/boards/arrow.js');
const clover = require('../data/boards/clover.js');
const crown = require('../data/boards/crown.js');
const crescent = require('../data/boards/crescent.js');
const star = require('../data/boards/star.js');
const temple = require('../data/boards/temple.js');
const doublemoon = require('../data/boards/doublemoon.js');
const trident = require('../data/boards/trident.js');
const fan = require('../data/boards/fan.js');
const gear = require('../data/boards/gear.js');
const lantern = require('../data/boards/lantern.js');
const bridge = require('../data/boards/bridge.js');
const snowflake = require('../data/boards/snowflake.js');
const anchor = require('../data/boards/anchor.js');
const iris = require('../data/boards/iris.js');

const ctx = canvas.getContext('2d');
const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const SCREEN_WIDTH = windowInfo.windowWidth || canvas.width;
const SCREEN_HEIGHT = windowInfo.windowHeight || canvas.height;

export default class BoardSelectScene {
  constructor(sceneManager, goGameScene) {
    this.sceneManager = sceneManager;
    this.goGameScene = goGameScene;
    this.homeScene = null;
    this.cardSelectScene = null;
    this.bgm = 'audio/bgm_title.mp3';

    this.boards = [square9, heart, dumbbell, poll, diamond, cross, butterfly, hourglass, ring, arrow, clover, crown, crescent, star, temple, doublemoon, trident, fan, gear, lantern, bridge, snowflake, anchor, iris];
    this.currentIndex = 0;

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
    this.titleY = this.backBtn.y + 78;

    this.previewRect = {
      x: 44,
      y: this.titleY + 64,
      w: SCREEN_WIDTH - 88,
      h: 360
    };

    this.leftArrowRect = {
      x: 18,
      y: this.previewRect.y + this.previewRect.h / 2 - 30,
      w: 44,
      h: 60
    };

    this.rightArrowRect = {
      x: SCREEN_WIDTH - 62,
      y: this.previewRect.y + this.previewRect.h / 2 - 30,
      w: 44,
      h: 60
    };

    this.confirmBtn = {
      x: 40,
      y: SCREEN_HEIGHT - 120,
      w: SCREEN_WIDTH - 80,
      h: 62
    };
  }

  onEnter() {
    if (this.goGameScene && this.goGameScene.boardConfig) {
      const index = this.boards.findIndex((board) => board.id === this.goGameScene.boardConfig.id);
      if (index >= 0) this.currentIndex = index;
    }
  }

  getCurrentBoard() {
    return this.boards[this.currentIndex] || this.boards[0];
  }

  moveSelection(step) {
    const total = this.boards.length;
    this.currentIndex = (this.currentIndex + step + total) % total;
  }

  confirmBoard() {
    const board = this.getCurrentBoard();
    if (this.goGameScene) {
      this.goGameScene.setBoardConfig(board);
    }
    if (this.cardSelectScene) {
      this.cardSelectScene.setSelectedBoard(board);
      this.sceneManager.switchTo(this.cardSelectScene);
    }
  }

  onTouchStart(e) {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    if (inRect(x, y, this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h)) {
      if (this.homeScene) this.sceneManager.switchTo(this.homeScene);
      return;
    }

    if (inRect(x, y, this.leftArrowRect.x, this.leftArrowRect.y, this.leftArrowRect.w, this.leftArrowRect.h)) {
      this.moveSelection(-1);
      return;
    }

    if (inRect(x, y, this.rightArrowRect.x, this.rightArrowRect.y, this.rightArrowRect.w, this.rightArrowRect.h)) {
      this.moveSelection(1);
      return;
    }

    if (inRect(x, y, this.confirmBtn.x, this.confirmBtn.y, this.confirmBtn.w, this.confirmBtn.h)) {
      this.confirmBoard();
    }
  }

  update() {}

  renderArrow(rect, symbol) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.restore();
  }

  drawBoardPreview(board) {
    const shape = board.shape;
    const rows = shape.length;
    const cols = shape[0].length;
    const cellSize = Math.min(
      (this.previewRect.w - 44) / cols,
      (this.previewRect.h - 70) / rows
    );

    const offsetX = this.previewRect.x + (this.previewRect.w - cols * cellSize) / 2;
    const offsetY = this.previewRect.y + 38 + (this.previewRect.h - 76 - rows * cellSize) / 2;

    ctx.save();
    ctx.fillStyle = '#f1d6a2';
    ctx.fillRect(this.previewRect.x, this.previewRect.y, this.previewRect.w, this.previewRect.h);
    ctx.strokeStyle = '#8e6e3b';
    ctx.lineWidth = 3;
    ctx.strokeRect(this.previewRect.x, this.previewRect.y, this.previewRect.w, this.previewRect.h);

    ctx.fillStyle = '#5b3a1f';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(board.name, SCREEN_WIDTH / 2, this.previewRect.y + 24);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (shape[r][c] !== 1) continue;
        const x = offsetX + c * cellSize;
        const y = offsetY + r * cellSize;
        ctx.fillStyle = '#e8bf79';
        ctx.fillRect(x, y, cellSize, cellSize);
        ctx.strokeStyle = '#7a5a2b';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellSize, cellSize);

        const cx = x + cellSize / 2;
        const cy = y + cellSize / 2;
        const radius = Math.max(1.5, cellSize * 0.08);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#2c1e12';
        ctx.fill();
      }
    }

    ctx.restore();
  }

  render() {
    const board = this.getCurrentBoard();

    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    ctx.fillStyle = '#1f2430';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    drawButton(this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h, '#4a5568', '返回', 20);

    ctx.fillStyle = '#f5e6a9';
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('选择棋盘', SCREEN_WIDTH / 2, this.titleY);

    ctx.fillStyle = '#d8d8d8';
    ctx.font = '18px Arial';
    ctx.fillText('左右切换预览，确认后进入卡组选择', SCREEN_WIDTH / 2, this.titleY + 36);

    this.drawBoardPreview(board);
    this.renderArrow(this.leftArrowRect, '‹');
    this.renderArrow(this.rightArrowRect, '›');

    ctx.fillStyle = '#c8ccd6';
    ctx.font = '16px Arial';
    ctx.fillText(`${this.currentIndex + 1} / ${this.boards.length}`, SCREEN_WIDTH / 2, this.previewRect.y + this.previewRect.h + 24);

    drawButton(this.confirmBtn.x, this.confirmBtn.y, this.confirmBtn.w, this.confirmBtn.h, '#27ae60', '确认地图', 24);
  }
}
