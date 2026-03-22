import { drawButton, inRect } from '../utils/ui';
const { pieceConfig, pieceMap } = require('../config/game-data');
const { getPieceDef } = require('../engine/piece-engine');

const ctx = canvas.getContext('2d');
const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const SCREEN_WIDTH = windowInfo.windowWidth || canvas.width;
const SCREEN_HEIGHT = windowInfo.windowHeight || canvas.height;

export default class CardSelectScene {
  constructor(sceneManager, goGameScene) {
    this.sceneManager = sceneManager;
    this.goGameScene = goGameScene;
    this.boardSelectScene = null;
    this.bgm = 'audio/bgm_title.mp3';

    this.pieceConfig = pieceConfig;
    this.pieceMap = pieceMap;
    this.maxSlots = 3;
    this.pool = (pieceConfig.pieces || []).filter((piece) => piece.selectable && piece.id !== 'normal');
    this.selectedTypes = [];
    this.selectedBoard = null;

    this.scrollY = 0;
    this.maxScrollY = 0;
    this.touchStartY = 0;
    this.touchStartScrollY = 0;
    this.isDraggingPool = false;
    this.didDrag = false;

    this.initLayout();
  }

  initLayout() {
    const menuButton = wx.getMenuButtonBoundingClientRect
      ? wx.getMenuButtonBoundingClientRect()
      : null;

    const safeTop = menuButton ? Math.max(12, menuButton.top - 8) : 24;
    const capsuleBottom = menuButton ? menuButton.bottom : safeTop + 32;

    this.backBtn = { x: 24, y: capsuleBottom + 12, w: 100, h: 40 };
    this.titleY = this.backBtn.y + 60;

    this.slotAreaY = this.titleY + 80;
    this.slotW = 96;
    this.slotH = 118;
    this.slotGap = 14;
    const totalW = this.maxSlots * this.slotW + (this.maxSlots - 1) * this.slotGap;
    const startX = (SCREEN_WIDTH - totalW) / 2;
    this.slotRects = Array.from({ length: this.maxSlots }, (_, i) => ({
      x: startX + i * (this.slotW + this.slotGap),
      y: this.slotAreaY,
      w: this.slotW,
      h: this.slotH
    }));

    this.poolTitleY = this.slotAreaY + this.slotH + 40;
    this.poolViewport = {
      x: 24,
      y: this.poolTitleY + 20,
      w: SCREEN_WIDTH - 48,
      h: Math.max(120, SCREEN_HEIGHT - (this.poolTitleY + 20) - 108)
    };

    this.cardW = this.poolViewport.w - 16;
    this.cardH = 70;
    this.cardGap = 14;
    this.cardX = this.poolViewport.x + 8;
    this.poolContentTop = this.poolViewport.y + 8;

    this.startBtn = {
      x: 40,
      y: SCREEN_HEIGHT - 88,
      w: SCREEN_WIDTH - 80,
      h: 56
    };

    this.updateScrollBounds();
  }

  updateScrollBounds() {
    const contentH = this.pool.length > 0
      ? this.pool.length * this.cardH + (this.pool.length - 1) * this.cardGap + 16
      : 16;
    this.maxScrollY = Math.max(0, contentH - this.poolViewport.h);
    this.scrollY = Math.max(0, Math.min(this.scrollY, this.maxScrollY));
  }

  onEnter() {
    if (this.goGameScene) {
      this.selectedTypes = (this.goGameScene.getEnabledCardTypes() || []).slice(0, this.maxSlots);
    }
    this.updateScrollBounds();
  }

  setSelectedBoard(board) {
    this.selectedBoard = board;
  }

  isSelected(type) {
    return this.selectedTypes.includes(type);
  }

  toggleType(type) {
    const index = this.selectedTypes.indexOf(type);
    if (index >= 0) {
      this.selectedTypes.splice(index, 1);
      return;
    }

    if (this.selectedTypes.length >= this.maxSlots) {
      wx.showToast({ title: '最多选择三张卡', icon: 'none' });
      return;
    }

    this.selectedTypes.push(type);
  }

  startMatch() {
    const board = this.selectedBoard || (this.goGameScene && this.goGameScene.boardConfig);
    this.goGameScene.prepareMatch({
      boardConfig: board,
      cardTypes: this.selectedTypes
    });
    this.sceneManager.switchTo(this.goGameScene);
  }

  getPoolCardRect(index) {
    return {
      x: this.cardX,
      y: this.poolContentTop + index * (this.cardH + this.cardGap) - this.scrollY,
      w: this.cardW,
      h: this.cardH
    };
  }

  drawSlot(rect, type, index) {
    ctx.save();
    ctx.fillStyle = '#f3e5c8';
    ctx.strokeStyle = '#8e6e3b';
    ctx.lineWidth = 3;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (!type) {
      ctx.fillStyle = '#8a7b63';
      ctx.font = 'bold 18px Arial';
      ctx.fillText('空槽', rect.x + rect.w / 2, rect.y + rect.h / 2 - 8);
      ctx.font = '12px Arial';
      ctx.fillText(`槽位 ${index + 1}`, rect.x + rect.w / 2, rect.y + rect.h / 2 + 18);
      ctx.restore();
      return;
    }

    const def = getPieceDef(this.pieceMap, type);
    ctx.fillStyle = '#5b3a1f';
    ctx.font = '30px Arial';
    ctx.fillText(def.symbol || '●', rect.x + rect.w / 2, rect.y + 30);
    ctx.font = 'bold 18px Arial';
    ctx.fillText(def.name, rect.x + rect.w / 2, rect.y + 64);
    ctx.font = '12px Arial';
    ctx.fillText('点击移除', rect.x + rect.w / 2, rect.y + 92);
    ctx.restore();
  }

  drawPoolCard(rect, piece) {
    const selected = this.isSelected(piece.id);

    ctx.save();
    ctx.fillStyle = selected ? '#f7d794' : '#f3e5c8';
    ctx.strokeStyle = selected ? '#c0392b' : '#8e6e3b';
    ctx.lineWidth = selected ? 4 : 3;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5b3a1f';
    ctx.font = '30px Arial';
    ctx.fillText(piece.symbol || '●', rect.x + 18, rect.y + rect.h / 2);

    ctx.font = 'bold 20px Arial';
    ctx.fillText(piece.name, rect.x + 62, rect.y + 26);

    ctx.font = '13px Arial';
    ctx.fillStyle = '#6b4f2c';
    ctx.fillText(piece.needsDirection ? '先点落点，再定方向' : '直接生效', rect.x + 62, rect.y + 48);

    ctx.textAlign = 'right';
    ctx.fillStyle = selected ? '#c0392b' : '#2d6a4f';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(selected ? '已选择' : '点此加入', rect.x + rect.w - 16, rect.y + rect.h / 2);
    ctx.restore();
  }

  drawScrollBar() {
    if (this.maxScrollY <= 0) return;

    const trackX = this.poolViewport.x + this.poolViewport.w - 6;
    const trackY = this.poolViewport.y + 8;
    const trackH = this.poolViewport.h - 16;
    const thumbH = Math.max(28, trackH * (this.poolViewport.h / (this.poolViewport.h + this.maxScrollY)));
    const thumbTravel = trackH - thumbH;
    const thumbY = trackY + (this.scrollY / this.maxScrollY) * thumbTravel;

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(trackX, trackY, 4, trackH);
    ctx.fillStyle = 'rgba(245,230,169,0.75)';
    ctx.fillRect(trackX, thumbY, 4, thumbH);
    ctx.restore();
  }

  onTouchStart(e) {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    this.didDrag = false;
    this.isDraggingPool = inRect(
      x,
      y,
      this.poolViewport.x,
      this.poolViewport.y,
      this.poolViewport.w,
      this.poolViewport.h
    );

    if (this.isDraggingPool) {
      this.touchStartY = y;
      this.touchStartScrollY = this.scrollY;
      return;
    }

    if (inRect(x, y, this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h)) {
      if (this.boardSelectScene) this.sceneManager.switchTo(this.boardSelectScene);
      return;
    }

    for (let i = 0; i < this.slotRects.length; i++) {
      const rect = this.slotRects[i];
      if (!inRect(x, y, rect.x, rect.y, rect.w, rect.h)) continue;
      if (!this.selectedTypes[i]) return;
      this.selectedTypes.splice(i, 1);
      return;
    }

    if (inRect(x, y, this.startBtn.x, this.startBtn.y, this.startBtn.w, this.startBtn.h)) {
      this.startMatch();
    }
  }

  onTouchMove(e) {
    if (!this.isDraggingPool) return;

    const touch = e.touches[0];
    const deltaY = touch.clientY - this.touchStartY;
    const nextScrollY = this.touchStartScrollY - deltaY;
    this.scrollY = Math.max(0, Math.min(nextScrollY, this.maxScrollY));

    if (Math.abs(deltaY) > 6) {
      this.didDrag = true;
    }
  }

  onTouchEnd(e) {
    const touch = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (!touch) {
      this.isDraggingPool = false;
      return;
    }

    const x = touch.clientX;
    const y = touch.clientY;

    if (this.isDraggingPool && !this.didDrag) {
      for (let i = 0; i < this.pool.length; i++) {
        const rect = this.getPoolCardRect(i);
        const visible = rect.y + rect.h >= this.poolViewport.y && rect.y <= this.poolViewport.y + this.poolViewport.h;
        if (!visible) continue;
        if (!inRect(x, y, rect.x, rect.y, rect.w, rect.h)) continue;
        this.toggleType(this.pool[i].id);
        break;
      }
    }

    this.isDraggingPool = false;
  }

  update() {}

  render() {
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    ctx.fillStyle = '#1f2430';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    drawButton(this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h, '#4a5568', '返回', 20);

    ctx.fillStyle = '#f5e6a9';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('选择卡牌', SCREEN_WIDTH / 2, this.titleY);

    const boardText = this.selectedBoard ? `当前地图：${this.selectedBoard.name}` : '当前地图：未选择';
    ctx.fillStyle = '#d8d8d8';
    ctx.font = '17px Arial';
    ctx.fillText(boardText, SCREEN_WIDTH / 2, this.titleY + 32);

    ctx.fillStyle = '#d8d8d8';
    ctx.font = '16px Arial';
    ctx.fillText('从卡牌池中选择最多三张，点击上方卡槽也可移除', SCREEN_WIDTH / 2, this.slotAreaY - 18);

    for (let i = 0; i < this.slotRects.length; i++) {
      this.drawSlot(this.slotRects[i], this.selectedTypes[i], i);
    }

    ctx.fillStyle = '#f5e6a9';
    ctx.font = 'bold 22px Arial';
    ctx.fillText('卡牌池', SCREEN_WIDTH / 2, this.poolTitleY);

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(this.poolViewport.x, this.poolViewport.y, this.poolViewport.w, this.poolViewport.h);
    ctx.strokeStyle = 'rgba(245,230,169,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.poolViewport.x, this.poolViewport.y, this.poolViewport.w, this.poolViewport.h);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.poolViewport.x, this.poolViewport.y, this.poolViewport.w, this.poolViewport.h);
    ctx.clip();

    for (let i = 0; i < this.pool.length; i++) {
      const rect = this.getPoolCardRect(i);
      if (rect.y > this.poolViewport.y + this.poolViewport.h) continue;
      if (rect.y + rect.h < this.poolViewport.y) continue;
      this.drawPoolCard(rect, this.pool[i]);
    }
    ctx.restore();

    this.drawScrollBar();

    drawButton(this.startBtn.x, this.startBtn.y, this.startBtn.w, this.startBtn.h, '#27ae60', '进入对局', 24);
  }
}
