import { drawButton, inRect } from '../utils/ui';
const { boardConfig, pieceConfig, pieceMap } = require('../config/game-data');
const { createPiece, getPieceDef, runAdvanceForPiece } = require('../engine/piece-engine');

const ctx = canvas.getContext('2d');

const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const SCREEN_WIDTH = windowInfo.windowWidth || canvas.width;
const SCREEN_HEIGHT = windowInfo.windowHeight || canvas.height;

function detectDesktopLikePlatform() {
  try {
    const info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : null;
    const platform = String(info && info.platform ? info.platform : '').toLowerCase();
    const model = String(info && info.model ? info.model : '').toLowerCase();
    return (
      platform === 'windows' ||
      platform === 'mac' ||
      platform === 'devtools' ||
      model.includes('windows') ||
      model.includes('mac')
    );
  } catch (err) {
    return false;
  }
}

const EMPTY = null;
const INVALID = -1;
const DESTROYED = -2;

const BLACK = 1;
const WHITE = 2;

const DIRS = {
  U: { dr: -1, dc: 0 },
  D: { dr: 1, dc: 0 },
  L: { dr: 0, dc: -1 },
  R: { dr: 0, dc: 1 }
};

let BOARD_SHAPE = boardConfig.shape;
let BOARD_ROWS = BOARD_SHAPE.length;
let BOARD_COLS = BOARD_SHAPE[0].length;

export default class GoGameScene {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.isDesktopLike = detectDesktopLikePlatform();
    this.EMPTY = EMPTY;
    this.INVALID = INVALID;
    this.DESTROYED = DESTROYED;
    this.DIRS = DIRS;

    this.boardConfig = boardConfig;
    this.baseBoardShape = this.cloneBoardShape(boardConfig.shape);
    this.boardConfig.shape = this.cloneBoardShape(this.baseBoardShape);
    BOARD_SHAPE = this.boardConfig.shape;
    BOARD_ROWS = BOARD_SHAPE.length;
    BOARD_COLS = BOARD_SHAPE[0].length;
    this.pieceConfig = pieceConfig;
    this.pieceMap = pieceMap;

    this.maxCardSlots = 3;
    this.blackEnabledCardTypes = ['contract', 'bomber', 'reverse'];
    this.whiteEnabledCardTypes = ['contract', 'bomber', 'reverse'];
    this.contractDuration = 3;
    this.bgm = "audio/bgm_fight.mp3"

    this.isTutorialMode = false;
    this.tutorialLevel = null;
    this.tutorialScene = null;
    this.tutorialIndex = -1;
    this.tutorialPlayerColor = BLACK;
    this.returnScene = null;
    this.pendingTutorialRebirthTimeout = null;
    this.victoryCondition = { type: 'capture', captureTarget: 0 };
    this.niuCrossOpeningEnabled = false;
    this.captureCounts = { black: 0, white: 0 };
    this.komi = 6.5;
    this.undoRequestState = null;
    this.undoHistory = [];
    this.replayMode = false;
    this.replayHistory = [];
    this.replayCurrentIndex = 0;
    this.scoreRequestState = null;
    this.scoreSummary = null;
    this.scoreTerritoryMap = null;
    this.scoreReviewBoard = null;
    this.scoreReviewMode = false;
    this.winner = null;
    this.gameOver = false;
    this.victoryDialog = null;
    this.scoreRequestState = null;
    this.undoRequestState = null;
    this.undoHistory = [];
    this.scoreSummary = null;
    this.undoRequestDialog = null;
    this.replayMode = false;
    this.replayHistory = [];
    this.replayCurrentIndex = 0;
    this.replayControls = null;

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

    this.backBtn = { x: 24, y: this.row1Y, w: 100, h: 40 };
    this.scoreRequestBtn = { x: (SCREEN_WIDTH - 110) / 2, y: this.row1Y, w: 110, h: 40 };
    this.restartBtn = { x: SCREEN_WIDTH - 24 - 100, y: this.row1Y, w: 100, h: 40 };
    this.undoRequestBtn = { x: (SCREEN_WIDTH - 110) / 2, y: this.row1Y + 48, w: 110, h: 40 };

    this.previewRowY = this.row1Y + 138;
    this.previewRowH = 56;
    this.previewInfoGap = 12;
    this.previewInfoLineH = 22;
    this.previewExtraInfoH = this.previewInfoGap + this.previewInfoLineH * 4 + 6;

    this.titleY = this.previewRowY + this.previewRowH + this.previewExtraInfoH + 14;
    this.turnTextY = this.titleY;
    this.timerTextY = this.titleY;
    this.msgTextY = this.titleY + 30;

    this.boardPaddingTop = this.msgTextY + 34;
    this.boardPaddingSide = 36;
    this.boardPaddingBottom = 210;

    this.cardSlotsLayout = this.buildCardSlotLayout();
    this.victoryDialog = this.buildVictoryDialogLayout();
    this.scoreRequestDialog = this.buildScoreRequestDialogLayout();
    this.undoRequestDialog = this.buildUndoRequestDialogLayout();
    this.replayControls = this.buildReplayControlsLayout();
    this.zoomControls = this.buildZoomControlsLayout();
  }

  buildZoomControlsLayout() {
    const size = 42;
    const gap = 10;
    const x = SCREEN_WIDTH - 24 - size;
    const baseY = this.boardPaddingTop + 12;
    return {
      zoomInBtn: { x, y: baseY, w: size, h: size },
      zoomOutBtn: { x, y: baseY + size + gap, w: size, h: size },
      zoomResetBtn: { x, y: baseY + (size + gap) * 2, w: size, h: size }
    };
  }


  buildScoreRequestDialogLayout() {
    const w = Math.min(SCREEN_WIDTH - 56, 360);
    const h = 228;
    const x = (SCREEN_WIDTH - w) / 2;
    const y = (SCREEN_HEIGHT - h) / 2 - 12;
    const btnGap = 16;
    const btnW = (w - 64 - btnGap) / 2;
    return {
      x,
      y,
      w,
      h,
      refuseBtn: {
        x: x + 32,
        y: y + h - 74,
        w: btnW,
        h: 46
      },
      acceptBtn: {
        x: x + 32 + btnW + btnGap,
        y: y + h - 74,
        w: btnW,
        h: 46
      }
    };
  }

  buildUndoRequestDialogLayout() {
    const w = Math.min(SCREEN_WIDTH - 56, 360);
    const h = 236;
    const x = (SCREEN_WIDTH - w) / 2;
    const y = (SCREEN_HEIGHT - h) / 2 - 12;
    const btnGap = 16;
    const btnW = (w - 64 - btnGap) / 2;
    return {
      x,
      y,
      w,
      h,
      refuseBtn: {
        x: x + 32,
        y: y + h - 74,
        w: btnW,
        h: 46
      },
      acceptBtn: {
        x: x + 32 + btnW + btnGap,
        y: y + h - 74,
        w: btnW,
        h: 46
      }
    };
  }


  buildReplayControlsLayout() {
    const gap = 10;
    const btnW = 74;
    const btnH = 42;
    const rowW = btnW * 4 + gap * 3;
    const startX = (SCREEN_WIDTH - rowW) / 2;
    const row1Y = SCREEN_HEIGHT - 122;
    const row2Y = SCREEN_HEIGHT - 68;
    return {
      firstBtn: { x: startX, y: row1Y, w: btnW, h: btnH },
      prevBtn: { x: startX + (btnW + gap), y: row1Y, w: btnW, h: btnH },
      nextBtn: { x: startX + (btnW + gap) * 2, y: row1Y, w: btnW, h: btnH },
      lastBtn: { x: startX + (btnW + gap) * 3, y: row1Y, w: btnW, h: btnH },
      practiceBtn: { x: Math.max(24, (SCREEN_WIDTH - 220) / 2), y: row2Y, w: Math.min(220, SCREEN_WIDTH - 48), h: 44 }
    };
  }

  buildVictoryDialogLayout() {
    const w = Math.min(SCREEN_WIDTH - 56, 360);
    const hasScoreReview = !!(this.victoryDialog && this.victoryDialog.scoreReviewText);
    const hasReplayReview = !!(this.victoryDialog && this.victoryDialog.replayText);
    const buttonCount = 1 + (hasScoreReview ? 1 : 0) + (hasReplayReview ? 1 : 0);
    const messageLines = this.wrapDialogText(this.victoryDialog && this.victoryDialog.message ? this.victoryDialog.message : '', 9);
    const detailLines = this.wrapDialogText(this.victoryDialog && this.victoryDialog.detail ? this.victoryDialog.detail : '', 16);
    const topPadding = 32;
    const titleH = 28;
    const messageH = Math.max(1, messageLines.length) * 40;
    const detailGap = detailLines.length > 0 ? 12 : 0;
    const detailH = detailLines.length * 24;
    const btnGap = 12;
    const buttonsH = buttonCount * 46 + (buttonCount - 1) * btnGap;
    const bottomPadding = 26;
    const minH = buttonCount >= 3 ? 340 : (buttonCount === 2 ? 278 : 236);
    const h = Math.max(minH, topPadding + titleH + 26 + messageH + detailGap + detailH + 24 + buttonsH + bottomPadding);
    const x = (SCREEN_WIDTH - w) / 2;
    const y = (SCREEN_HEIGHT - h) / 2 - 12;
    const firstBtnY = y + h - bottomPadding - buttonsH;
    let cursorY = firstBtnY;
    const makeBtn = () => {
      const btn = { x: x + 32, y: cursorY, w: w - 64, h: 46 };
      cursorY += 46 + btnGap;
      return btn;
    };
    const confirmBtn = makeBtn();
    const scoreReviewBtn = hasScoreReview ? makeBtn() : null;
    const replayBtn = hasReplayReview ? makeBtn() : null;
    return {
      x,
      y,
      w,
      h,
      messageLines,
      detailLines,
      confirmBtn,
      scoreReviewBtn,
      replayBtn
    };
  }

  wrapDialogText(text, maxCharsPerLine = 14) {
    const raw = String(text || '').trim();
    if (!raw) return [];

    const lines = [];
    const paragraphs = raw.split(/\n+/);
    for (const paragraph of paragraphs) {
      if (!paragraph) continue;
      let line = '';
      for (const ch of paragraph) {
        line += ch;
        if (line.length >= maxCharsPerLine) {
          lines.push(line);
          line = '';
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  buildCardSlotLayout() {
    const list = [];
    const count = this.maxCardSlots;
    const gap = 14;
    const slotW = 96;
    const slotH = 126;
    const totalWidth = count * slotW + (count - 1) * gap;
    const startX = (SCREEN_WIDTH - totalWidth) / 2;
    const y = SCREEN_HEIGHT - slotH - 52;

    for (let i = 0; i < count; i++) {
      list.push({
        index: i,
        x: startX + i * (slotW + gap),
        y,
        w: slotW,
        h: slotH
      });
    }

    return list;
  }

  getColorKey(color) {
    if (color === BLACK || color === 'black') return 'black';
    if (color === WHITE || color === 'white') return 'white';
    return 'black';
  }

  getEnabledCardTypes(color = this.currentPlayer) {
    const key = this.getColorKey(color);
    const list = key === 'white' ? this.whiteEnabledCardTypes : this.blackEnabledCardTypes;
    return Array.isArray(list) ? list : [];
  }

  setEnabledCardTypesByColor(color, cardTypes) {
    const key = this.getColorKey(color);
    const nextTypes = Array.isArray(cardTypes)
      ? cardTypes
          .filter((type) => type && type !== (this.pieceConfig.defaultPieceType || 'normal'))
          .slice(0, this.maxCardSlots)
      : [];

    if (key === 'white') this.whiteEnabledCardTypes = nextTypes;
    else this.blackEnabledCardTypes = nextTypes;
  }

  createInitialCardLoadout(color = this.currentPlayer) {
    const loadout = [];
    const types = this.getEnabledCardTypes(color);

    for (let i = 0; i < this.maxCardSlots; i++) {
      const type = types[i];
      const def = type ? getPieceDef(this.pieceMap, type) : null;

      if (!type || !def || def.id !== type || type === (this.pieceConfig.defaultPieceType || 'normal')) {
        loadout.push(null);
        continue;
      }

      loadout.push({ type, used: false });
    }

    return loadout;
  }

  syncActivePlayerCardState() {
    if (!this.nextPieceTypeByColor) {
      const defaultType = this.pieceConfig.defaultPieceType || 'normal';
      this.nextPieceTypeByColor = { black: defaultType, white: defaultType };
    }
    if (!this.cardLoadoutByColor) {
      this.cardLoadoutByColor = { black: this.createInitialCardLoadout('black'), white: this.createInitialCardLoadout('white') };
    }

    const key = this.getColorKey(this.currentPlayer);
    this.cardLoadout = this.cardLoadoutByColor[key];
    this.enabledCardTypes = this.getEnabledCardTypes(key);
    this.nextPieceType = this.nextPieceTypeByColor[key] || (this.pieceConfig.defaultPieceType || 'normal');
  }

  cacheActivePlayerNextPieceType() {
    if (!this.nextPieceTypeByColor) return;
    const key = this.getColorKey(this.currentPlayer);
    this.nextPieceTypeByColor[key] = this.nextPieceType || (this.pieceConfig.defaultPieceType || 'normal');
  }

  setCurrentPlayer(player) {
    this.syncActiveTurnTimer();
    this.cacheActivePlayerNextPieceType();
    const previousPlayer = this.currentPlayer;
    if (previousPlayer && previousPlayer !== player && this.isTurnPressureActiveForPlayer(previousPlayer)) {
      this.clearTurnPressure(false);
    }
    this.currentPlayer = player;
    this.syncActivePlayerCardState();
    this.lastTimerUpdateAt = Date.now();
    this.activatePendingTurnPressureForPlayer(player);
  }


  makeTutorialCardLoadout(cardTypes = []) {
    const list = [];
    for (let i = 0; i < this.maxCardSlots; i++) {
      const type = cardTypes[i];
      list.push(type ? { type, used: false } : null);
    }
    return list;
  }

  startTutorial(level, tutorialScene, tutorialIndex = 0) {
    this.isTutorialMode = true;
    this.tutorialLevel = level;
    this.tutorialScene = tutorialScene || null;
    this.tutorialIndex = tutorialIndex;
    this.tutorialPlayerColor = level.playerColor || BLACK;
    this.returnScene = tutorialScene || this.homeScene || null;

    if (level.boardConfig) {
      this.boardConfig = level.boardConfig;
      BOARD_SHAPE = this.boardConfig.shape;
      BOARD_ROWS = BOARD_SHAPE.length;
      BOARD_COLS = BOARD_SHAPE[0].length;
    }

    this.resetGame();
    this.applyTutorialSetup(level);
  }

  applyTutorialSetup(level) {
    if (this.pendingTutorialRebirthTimeout) {
      clearTimeout(this.pendingTutorialRebirthTimeout);
      this.pendingTutorialRebirthTimeout = null;
    }
    this.currentPlayer = this.tutorialPlayerColor;
    this.syncActivePlayerCardState();
    this.blackEnabledCardTypes = (level.cards || [level.pieceType]).slice();
    this.whiteEnabledCardTypes = (level.cards || [level.pieceType]).slice();
    this.cardLoadoutByColor = {
      black: this.makeTutorialCardLoadout(level.cards || [level.pieceType]),
      white: this.makeTutorialCardLoadout(level.cards || [level.pieceType])
    };
    const defaultType = this.pieceConfig.defaultPieceType || 'normal';
    this.nextPieceTypeByColor = { black: defaultType, white: defaultType };
    this.syncActivePlayerCardState();
    this.clearPendingSelection();
    this.clearPendingConfirmPlacement();
    this.clearPendingContractPlacement();
    this.clearPendingSacrificePlacement();
    this.clearPendingRebirthPlacement();
    this.clearPendingPersuaderPlacement();
    this.clearPendingThiefPlacement();
    this.clearPendingTeleportPlacement();
    this.clearPendingRelocatePlacement();
    this.clearPendingSwapCardSelection();
    this.contractLinks = [];
    this.fogState = null;
    this.tutorialFogPreviewUntil = 0;
    this.tutorialFlags = {};

    const presetPieces = Array.isArray(level.presetPieces) ? level.presetPieces : [];
    for (const item of presetPieces) {
      if (!this.isBoardShapeCell(item.row, item.col)) continue;
      this.board[item.row][item.col] = createPiece(
        item.color,
        item.type || 'normal',
        item.dir || null,
        this.allocPieceId(),
        item.extra || null
      );
    }

    this.previousBoardKey = this.getBoardKey(this.board);
    this.statusMessage = level.tips || level.name || '';
    this.lastMove = null;
    this.lastCaptured = [];
  }

  reloadTutorialLevel() {
    if (!this.isTutorialMode || !this.tutorialLevel) {
      this.resetGame();
      return;
    }
    this.startTutorial(this.tutorialLevel, this.tutorialScene, this.tutorialIndex);
  }

  isTutorialCardUnused() {
    if (!this.isTutorialMode || !this.tutorialLevel) return false;
    const cards = this.tutorialLevel.cards || [this.tutorialLevel.pieceType];
    return cards.some((type) => this.findAvailableCardSlotByType(type) >= 0);
  }

  getBoardCell(row, col) {
    if (!this.isBoardShapeCell(row, col)) return INVALID;
    return this.board[row][col];
  }

  getPieceCountByColor(color) {
    let count = 0;
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (this.isPiece(cell) && (color == null || cell.color === color)) count += 1;
      }
    }
    return count;
  }

  matchesTutorialCondition(condition) {
    switch (condition.type) {
      case 'card_used':
        return !this.hasAvailableCard(condition.pieceType);

      case 'cell_empty':
        return this.getBoardCell(condition.row, condition.col) === EMPTY;

      case 'cell_destroyed':
        return this.getBoardCell(condition.row, condition.col) === DESTROYED;

      case 'cell_exists': {
        const cell = this.getBoardCell(condition.row, condition.col);
        if (!this.isPiece(cell)) return false;
        if (condition.color != null && cell.color !== condition.color) return false;
        if (condition.pieceType && cell.type !== condition.pieceType) return false;
        if (condition.dir && cell.dir !== condition.dir) return false;
        return true;
      }

      case 'cell_color': {
        const cell = this.getBoardCell(condition.row, condition.col);
        if (!this.isPiece(cell) || cell.color !== condition.color) return false;
        if (condition.pieceType && cell.type !== condition.pieceType) return false;
        if (condition.dir && cell.dir !== condition.dir) return false;
        return true;
      }

      case 'cell_type': {
        const cell = this.getBoardCell(condition.row, condition.col);
        if (!this.isPiece(cell) || cell.type !== condition.pieceType) return false;
        if (condition.color != null && cell.color !== condition.color) return false;
        return true;
      }

      case 'piece_count': {
        const count = this.getPieceCountByColor(condition.color);
        if (condition.equals != null) return count === condition.equals;
        if (condition.min != null && count < condition.min) return false;
        if (condition.max != null && count > condition.max) return false;
        return true;
      }

      case 'fog_center':
        return !!(this.fogState && this.fogState.row === condition.row && this.fogState.col === condition.col && this.fogState.active);

      case 'fog_active':
        return !!(this.fogState && this.fogState.active);

      case 'rebirth_target': {
        const cell = this.getBoardCell(condition.sourceRow, condition.sourceCol);
        return !!(this.isPiece(cell) && cell.rebirthReady && cell.rebirthTarget && cell.rebirthTarget.row === condition.targetRow && cell.rebirthTarget.col === condition.targetCol);
      }

      case 'contract_linked': {
        const a = this.getBoardCell(condition.a[0], condition.a[1]);
        const b = this.getBoardCell(condition.b[0], condition.b[1]);
        if (!this.isPiece(a) || !this.isPiece(b)) return false;
        return this.contractLinks.some((link) =>
          (link.contractId === a.id && link.targetId === b.id) ||
          (link.contractId === b.id && link.targetId === a.id)
        );
      }

      case 'tutorial_flag':
        return !!(this.tutorialFlags && this.tutorialFlags[condition.key]);

      default:
        return false;
    }
  }

  checkTutorialGoal() {
    if (!this.isTutorialMode || !this.tutorialLevel || !this.tutorialLevel.goal) return false;
    const list = Array.isArray(this.tutorialLevel.goal.allOf) ? this.tutorialLevel.goal.allOf : [];
    return list.every((condition) => this.matchesTutorialCondition(condition));
  }

  runTutorialRebirthTest() {
    if (!this.isTutorialMode || !this.tutorialLevel || !this.tutorialLevel.autoResolveRebirthTest) return;

    this.tutorialFlags = this.tutorialFlags || {};
    this.tutorialFlags.rebirthSucceeded = false;

    const center = this.getBoardCell(4, 4);
    if (!this.isPiece(center) || !center.rebirthReady || !center.rebirthTarget) {
      this.statusMessage = '重生教学中，请先把重生子落在天元，再选择重生点';
      return;
    }

    const target = { ...center.rebirthTarget };
    const savedPlayer = this.currentPlayer;
    this.currentPlayer = WHITE;
    const ok = this.tryPlacePiece(4, 5, { color: WHITE, type: 'normal', dir: null });
    this.currentPlayer = savedPlayer;

    const targetCell = this.getBoardCell(target.row, target.col);
    const rightCell = this.getBoardCell(4, 5);
    const success = ok &&
      !(target.row === 4 && target.col === 5) &&
      this.getBoardCell(4, 4) === EMPTY &&
      this.isPiece(rightCell) &&
      rightCell.color === WHITE &&
      this.isPiece(targetCell) &&
      targetCell.color === BLACK;

    this.tutorialFlags.rebirthSucceeded = success;

    if (success) {
      this.statusMessage = `白棋已在天元右侧提子，黑棋成功重生到（${target.row + 1}, ${target.col + 1}）`;
    } else if (ok && target.row === 4 && target.col === 5) {
      this.statusMessage = '白棋占住了你选的重生点，重生失败；请重开后改选别处';
    } else if (ok) {
      this.statusMessage = '白棋已在天元右侧提子，但黑棋没有成功重生；请重开后改选别处';
    }
  }

  handleTutorialPostAction(triggerType, piece = null) {
    if (!this.isTutorialMode || !this.tutorialLevel) return;

    if (piece && piece.type === 'cavalry' && this.tutorialLevel.autoAdvancePlacedPiece) {
      this.advanceSpecialPieces();
    }

    if (piece && piece.type === 'archer' && this.tutorialLevel.autoResolveArcherShot) {
      this.resolveTurnStartSpecials(this.tutorialPlayerColor);
      if (this.lastMove) {
        const cell = this.getBoardCell(this.lastMove.row, this.lastMove.col);
        if (this.isPiece(cell) && cell.type === 'archer') {
          this.normalizePieceAt(this.lastMove.row, this.lastMove.col);
        }
      }
    }

    if (piece && piece.type === 'fog' && this.isTutorialMode) {
      if (piece.fogCenter && this.fogState) {
        this.tutorialFogPreviewUntil = Date.now() + 1200;
      }
    }

    if (piece && piece.type === 'rebirth' && this.tutorialLevel.autoResolveRebirthTest) {
      if (this.pendingTutorialRebirthTimeout) {
        clearTimeout(this.pendingTutorialRebirthTimeout);
      }
      this.statusMessage = '重生点已绑定，2 秒后白棋会在天元右侧落子并检验重生';
      this.currentPlayer = this.tutorialPlayerColor;
    this.syncActivePlayerCardState();
      this.previousBoardKey = this.getBoardKey(this.board);
      this.pendingTutorialRebirthTimeout = setTimeout(() => {
        this.pendingTutorialRebirthTimeout = null;
        if (!this.isTutorialMode || !this.tutorialLevel || !this.tutorialLevel.autoResolveRebirthTest) return;
        this.runTutorialRebirthTest();
        this.currentPlayer = this.tutorialPlayerColor;
    this.syncActivePlayerCardState();
        this.previousBoardKey = this.getBoardKey(this.board);

        if (this.checkTutorialGoal()) {
          const delayMs = Number(this.tutorialLevel.autoDelayWinMs || 0);
          if (delayMs > 0) {
            setTimeout(() => {
              if (this.isTutorialMode && this.tutorialLevel && this.checkTutorialGoal()) {
                this.completeTutorialLevel();
              }
            }, delayMs);
          } else {
            this.completeTutorialLevel();
          }
        }
      }, 2000);
      return;
    }

    if (piece && piece.type === 'contract' && this.tutorialLevel.autoResolveContractTrigger) {
      this.statusMessage = '契约已建立，1 秒后左侧白骑兵会自动冲锋，触发同归于尽';
      this.currentPlayer = this.tutorialPlayerColor;
    this.syncActivePlayerCardState();
      this.previousBoardKey = this.getBoardKey(this.board);
      setTimeout(() => {
        if (!this.isTutorialMode || !this.tutorialLevel || !this.tutorialLevel.autoResolveContractTrigger) return;
        this.advanceSpecialPieces();
        const contractInfo = this.resolveContracts(false);
        if (contractInfo.chainKillCount > 0) {
          this.statusMessage = `契约触发，同归于尽 ${contractInfo.chainKillCount} 枚`;
        } else {
          this.statusMessage = '白骑兵已冲锋，请检查契约是否触发';
        }
        this.currentPlayer = this.tutorialPlayerColor;
    this.syncActivePlayerCardState();
        this.previousBoardKey = this.getBoardKey(this.board);
        if (this.checkTutorialGoal()) {
          const delayMs = Number(this.tutorialLevel.autoDelayWinMs || 0);
          if (delayMs > 0) {
            setTimeout(() => {
              if (this.isTutorialMode && this.tutorialLevel && this.checkTutorialGoal()) {
                this.completeTutorialLevel();
              }
            }, delayMs);
          } else {
            this.completeTutorialLevel();
          }
        }
      }, 1000);
      return;
    }

    this.currentPlayer = this.tutorialPlayerColor;
    this.syncActivePlayerCardState();
    this.previousBoardKey = this.getBoardKey(this.board);

    if (this.checkTutorialGoal()) {
      const delayMs = Number(this.tutorialLevel.autoDelayWinMs || 0);
      if (delayMs > 0) {
        setTimeout(() => {
          if (this.isTutorialMode && this.tutorialLevel && this.checkTutorialGoal()) {
            this.completeTutorialLevel();
          }
        }, delayMs);
      } else {
        this.completeTutorialLevel();
      }
    }
  }

  completeTutorialLevel() {
    if (!this.isTutorialMode || !this.tutorialLevel) return;

    if (this.tutorialScene && this.tutorialScene.markLevelCompleted) {
      this.tutorialScene.markLevelCompleted(this.tutorialLevel.id);
    }

    wx.showToast({
      title: `${this.tutorialLevel.name}通关`,
      icon: 'success'
    });

    const targetScene = this.returnScene || this.homeScene;
    if (targetScene) {
      setTimeout(() => {
        this.sceneManager.switchTo(targetScene);
      }, 600);
    }
  }

  setBoardConfig(boardConfig) {
    if (!boardConfig || !Array.isArray(boardConfig.shape) || !boardConfig.shape.length) return;

    this.boardConfig = boardConfig;
    this.baseBoardShape = this.cloneBoardShape(boardConfig.shape);
    this.boardConfig.shape = this.cloneBoardShape(this.baseBoardShape);
    BOARD_SHAPE = this.boardConfig.shape;
    BOARD_ROWS = BOARD_SHAPE.length;
    BOARD_COLS = BOARD_SHAPE[0].length;

    this.resetGame();
  }

  setNiuCrossOpeningEnabled(enabled) {
    this.niuCrossOpeningEnabled = !!enabled;
  }

  setVictoryCondition(condition) {
    this.victoryCondition = {
      type: 'capture',
      captureTarget: Number((condition && condition.captureTarget) || 0)
    };
  }

  getCaptureTarget() {
    return Number((this.victoryCondition && this.victoryCondition.captureTarget) || 0);
  }

  getCaptureCount(color) {
    return color === BLACK ? this.captureCounts.black : this.captureCounts.white;
  }

  getCaptureLabelText() {
    const target = this.getCaptureTarget();
    if (target > 0) {
      return `提子：黑 ${this.captureCounts.black}/${target} · 白 ${this.captureCounts.white}/${target}`;
    }
    return `提子：黑 ${this.captureCounts.black} · 白 ${this.captureCounts.white}`;
  }

  updateCaptureCounts(result, player) {
    const gained = Array.isArray(result && result.scoreCaptured) ? result.scoreCaptured.length : 0;
    if (gained <= 0) return 0;

    if (player === BLACK) this.captureCounts.black += gained;
    else this.captureCounts.white += gained;
    return gained;
  }

  checkVictoryAfterCapture(player) {
    const target = this.getCaptureTarget();
    if (target <= 0) return false;

    const current = this.getCaptureCount(player);
    if (current < target) return false;

    this.gameOver = true;
    this.winner = player;
    this.statusMessage = player === BLACK
      ? `黑棋先提到 ${target} 子，获胜`
      : `白棋先提到 ${target} 子，获胜`;
    this.openVictoryDialog();
    return true;
  }

  getColorName(color) {
    return color === BLACK ? '黑棋' : '白棋';
  }

  getCloneState(color) {
    if (!this.cloneStateByColor) {
      this.cloneStateByColor = {
        black: { pendingActivation: false, active: false, movesRemaining: 0, spawnedIds: [], expireAfterOpponentMove: false },
        white: { pendingActivation: false, active: false, movesRemaining: 0, spawnedIds: [], expireAfterOpponentMove: false }
      };
    }
    return this.cloneStateByColor[this.getColorKey(color)] || null;
  }

  isCloneTurnActive(color = this.currentPlayer) {
    const state = this.getCloneState(color);
    return !!(state && state.active && state.movesRemaining > 0);
  }

  armCloneForNextTurn(color) {
    const state = this.getCloneState(color);
    if (!state) return;
    state.pendingActivation = false;
    state.active = true;
    state.movesRemaining = 2;
    state.spawnedIds = [];
    state.expireAfterOpponentMove = false;
    const key = this.getColorKey(color);
    if (!this.nextPieceTypeByColor) this.nextPieceTypeByColor = { black: 'normal', white: 'normal' };
    this.nextPieceTypeByColor[key] = this.pieceConfig.defaultPieceType || 'normal';
    if (this.currentPlayer === color) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    }
  }

  activateCloneNow(color) {
    const state = this.getCloneState(color);
    if (!state) return false;
    state.pendingActivation = false;
    state.active = true;
    state.movesRemaining = 2;
    state.spawnedIds = [];
    state.expireAfterOpponentMove = false;
    const key = this.getColorKey(color);
    if (!this.nextPieceTypeByColor) this.nextPieceTypeByColor = { black: 'normal', white: 'normal' };
    this.nextPieceTypeByColor[key] = this.pieceConfig.defaultPieceType || 'normal';
    if (this.currentPlayer === color) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    }
    return true;
  }

  activateCloneTurnIfNeeded(color) {
    const state = this.getCloneState(color);
    if (!state || !state.pendingActivation) return { activated: false, movesRemaining: 0 };
    state.pendingActivation = false;
    state.active = true;
    state.movesRemaining = 2;
    state.spawnedIds = [];
    const key = this.getColorKey(color);
    if (!this.nextPieceTypeByColor) this.nextPieceTypeByColor = { black: 'normal', white: 'normal' };
    this.nextPieceTypeByColor[key] = this.pieceConfig.defaultPieceType || 'normal';
    if (this.currentPlayer === color) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    }
    return { activated: true, movesRemaining: 2 };
  }

  removeExpiredCloneSpawns(color) {
    const state = this.getCloneState(color);
    if (!state || !state.expireAfterOpponentMove) return { removedCount: 0 };
    let removedCount = 0;
    const ids = Array.isArray(state.spawnedIds) ? state.spawnedIds.slice() : [];
    for (const id of ids) {
      if (!id) continue;
      const found = this.findPiecePositionById(id);
      if (!found || !this.isPiece(found.cell)) continue;
      const out = this.resolvePieceRemovalAt(found.row, found.col, { allowRebirth: false, scoreForColor: null });
      if (out && out.removed) removedCount += 1;
    }
    state.spawnedIds = [];
    state.expireAfterOpponentMove = false;
    if (removedCount > 0) {
      this.previousBoardKey = this.getBoardKey(this.board);
    }
    return { removedCount };
  }

  handleClonePlacementAfterCommit(row, col) {
    const state = this.getCloneState(this.currentPlayer);
    if (!state || !state.active || state.movesRemaining <= 0) {
      return { consumed: false, keepTurn: false, remainingMoves: 0 };
    }

    const cell = this.isInside(row, col) ? this.board[row][col] : null;
    if (this.isPiece(cell)) {
      const extra = { ...cell, cloneSpawned: true };
      delete extra.color;
      delete extra.type;
      delete extra.dir;
      delete extra.id;
      this.board[row][col] = createPiece(cell.color, cell.type, cell.dir, cell.id, extra);
      if (cell.id) {
        state.spawnedIds.push(cell.id);
      }
    }

    state.movesRemaining = Math.max(0, Number(state.movesRemaining || 0) - 1);
    if (state.movesRemaining > 0) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      return { consumed: true, keepTurn: true, remainingMoves: state.movesRemaining };
    }

    state.active = false;
    state.expireAfterOpponentMove = true;
    return { consumed: true, keepTurn: false, remainingMoves: 0 };
  }

  deepCloneStateData(data) {
    if (data == null) return data;
    return JSON.parse(JSON.stringify(data));
  }

  cloneBoardShape(shape) {
    if (!Array.isArray(shape)) return [];
    return shape.map((row) => Array.isArray(row) ? row.slice() : []);
  }

  captureUndoSnapshot() {
    return {
      board: this.cloneBoard(this.board),
      boardShape: this.cloneBoardShape(BOARD_SHAPE),
      currentPlayer: this.currentPlayer,
      previousBoardKey: this.previousBoardKey,
      lastMove: this.lastMove ? { ...this.lastMove } : null,
      lastCaptured: this.deepCloneStateData(this.lastCaptured || []),
      captureCounts: { ...this.captureCounts },
      cardLoadoutByColor: this.deepCloneStateData(this.cardLoadoutByColor),
      nextPieceTypeByColor: this.deepCloneStateData(this.nextPieceTypeByColor),
      nextPieceType: this.nextPieceType,
      contractLinks: this.deepCloneStateData(this.contractLinks || []),
      trapState: this.deepCloneStateData(this.trapState || []),
      fogState: this.deepCloneStateData(this.fogState),
      lastPlagueResolution: this.deepCloneStateData(this.lastPlagueResolution),
      timeLimitEffect: this.deepCloneStateData(this.timeLimitEffect),
      turnPressure: this.deepCloneStateData(this.turnPressure),
      cloneStateByColor: this.deepCloneStateData(this.cloneStateByColor),
      nextPieceId: this.nextPieceId,
      turnTimers: this.deepCloneStateData(this.turnTimers),
      winner: this.winner,
      gameOver: this.gameOver,
      victoryDialog: this.deepCloneStateData(this.victoryDialog),
      scoreSummary: this.deepCloneStateData(this.scoreSummary),
      scoreTerritoryMap: this.deepCloneStateData(this.scoreTerritoryMap),
      scoreReviewBoard: this.scoreReviewBoard ? this.cloneBoard(this.scoreReviewBoard) : null,
      scoreReviewMode: !!this.scoreReviewMode
    };
  }

  markUndoSnapshot() {
    if (this.isTutorialMode || this.gameOver) return;
    if (!Array.isArray(this.undoHistory)) this.undoHistory = [];
    this.undoHistory.push(this.captureUndoSnapshot());
  }

  restoreUndoSnapshot(snapshot, options = {}) {
    if (!snapshot) return false;
    const preserveReplayState = !!options.preserveReplayState;

    if (snapshot.boardShape) {
      BOARD_SHAPE = this.cloneBoardShape(snapshot.boardShape);
      this.boardConfig.shape = BOARD_SHAPE;
      BOARD_ROWS = BOARD_SHAPE.length;
      BOARD_COLS = BOARD_SHAPE[0].length;
    }
    this.board = this.cloneBoard(snapshot.board);
    this.previousBoardKey = snapshot.previousBoardKey;
    this.lastMove = snapshot.lastMove ? { ...snapshot.lastMove } : null;
    this.lastCaptured = this.deepCloneStateData(snapshot.lastCaptured || []);
    this.captureCounts = { ...(snapshot.captureCounts || { black: 0, white: 0 }) };
    this.cardLoadoutByColor = this.deepCloneStateData(snapshot.cardLoadoutByColor) || {
      black: this.createInitialCardLoadout('black'),
      white: this.createInitialCardLoadout('white')
    };
    this.nextPieceTypeByColor = this.deepCloneStateData(snapshot.nextPieceTypeByColor) || {
      black: this.pieceConfig.defaultPieceType || 'normal',
      white: this.pieceConfig.defaultPieceType || 'normal'
    };
    this.currentPlayer = snapshot.currentPlayer || BLACK;
    this.nextPieceType = snapshot.nextPieceType || (this.pieceConfig.defaultPieceType || 'normal');
    this.contractLinks = this.deepCloneStateData(snapshot.contractLinks || []);
    this.trapState = this.deepCloneStateData(snapshot.trapState || []);
    this.fogState = this.deepCloneStateData(snapshot.fogState);
    this.lastPlagueResolution = this.deepCloneStateData(snapshot.lastPlagueResolution);
    this.timeLimitEffect = this.deepCloneStateData(snapshot.timeLimitEffect);
    this.turnPressure = this.deepCloneStateData(snapshot.turnPressure) || {
      active: false,
      targetPlayer: null,
      startedAt: 0,
      durationMs: 0,
      remainingMs: 0,
      displaySeconds: 0,
      pulsePhase: 0
    };
    this.cloneStateByColor = this.deepCloneStateData(snapshot.cloneStateByColor) || {
      black: { pendingActivation: false, active: false, movesRemaining: 0, spawnedIds: [], expireAfterOpponentMove: false },
      white: { pendingActivation: false, active: false, movesRemaining: 0, spawnedIds: [], expireAfterOpponentMove: false }
    };
    this.nextPieceId = snapshot.nextPieceId || 1;
    this.turnTimers = this.deepCloneStateData(snapshot.turnTimers) || { black: 300000, white: 300000 };
    this.winner = snapshot.winner || null;
    this.gameOver = !!snapshot.gameOver;
    this.victoryDialog = this.deepCloneStateData(snapshot.victoryDialog) || null;
    this.scoreSummary = this.deepCloneStateData(snapshot.scoreSummary) || null;
    this.scoreTerritoryMap = this.deepCloneStateData(snapshot.scoreTerritoryMap) || null;
    this.scoreReviewBoard = snapshot.scoreReviewBoard ? this.cloneBoard(snapshot.scoreReviewBoard) : null;
    this.scoreReviewMode = !!snapshot.scoreReviewMode;

    this.undoRequestState = null;
    this.scoreRequestState = null;
    if (!preserveReplayState) {
      this.replayMode = false;
      this.replayHistory = [];
      this.replayCurrentIndex = 0;
    }
    this.clearPendingSelection();
    this.clearPendingConfirmPlacement();
    this.clearPendingContractPlacement();
    this.clearPendingSacrificePlacement();
    this.clearPendingRebirthPlacement();
    this.clearPendingPersuaderPlacement();
    this.clearPendingThiefPlacement();
    this.clearPendingTeleportPlacement();
    this.clearPendingRelocatePlacement();
    this.clearPendingSwapCardSelection();
    this.clearPendingNightmarePlacement();
    this.pendingFogPlacement = null;
    this.syncActivePlayerCardState();
    this.lastTimerUpdateAt = Date.now();
    return true;
  }

  requestUndoTurn() {
    if (this.gameOver) return;
    if (this.isTutorialMode) {
      this.statusMessage = '教学关卡暂不支持申请悔棋';
      return;
    }
    if (this.scoreRequestState || this.undoRequestState) {
      this.statusMessage = '已有申请等待回应';
      return;
    }
    if (!Array.isArray(this.undoHistory) || this.undoHistory.length <= 0) {
      this.statusMessage = '当前还没有可悔的上一步';
      return;
    }

    const requester = this.currentPlayer;
    const responder = this.getOpponent(requester);
    this.undoRequestState = {
      requester,
      responder,
      dialogVisible: true
    };
    this.setCurrentPlayer(responder);
    this.statusMessage = `${this.getColorName(requester)}申请悔棋，等待${this.getColorName(responder)}决定`;
    this.clearPendingSelection();
    this.clearPendingConfirmPlacement();
    this.clearPendingContractPlacement();
    this.clearPendingSacrificePlacement();
    this.clearPendingRebirthPlacement();
    this.clearPendingPersuaderPlacement();
    this.clearPendingThiefPlacement();
    this.clearPendingTeleportPlacement();
    this.clearPendingRelocatePlacement();
    this.clearPendingSwapCardSelection();
    this.clearPendingNightmarePlacement();
    this.pendingFogPlacement = null;
  }

  refuseUndoRequest() {
    if (!this.undoRequestState) return;
    const requester = this.undoRequestState.requester;
    const responder = this.undoRequestState.responder;
    this.undoRequestState = null;
    this.statusMessage = `${this.getColorName(responder)}拒绝悔棋，${this.getColorName(requester)}本回合已跳过`;
  }

  acceptUndoRequest() {
    if (!this.undoRequestState) return;
    const requester = this.undoRequestState.requester;
    const snapshot = Array.isArray(this.undoHistory) ? this.undoHistory.pop() : null;
    this.undoRequestState = null;
    if (!snapshot || !this.restoreUndoSnapshot(snapshot)) {
      this.statusMessage = '悔棋失败：找不到可恢复的上一步';
      return;
    }
    this.statusMessage = `${this.getColorName(requester)}悔棋成功，已回到上一步`; 
  }

  requestScoreCount() {
    if (this.gameOver) return;
    if (this.isTutorialMode) {
      this.statusMessage = '教学关卡暂不支持申请点目';
      return;
    }
    if (this.scoreRequestState) {
      this.statusMessage = '已有点目申请等待回应';
      return;
    }

    const requester = this.currentPlayer;
    const responder = this.getOpponent(requester);
    this.scoreRequestState = {
      requester,
      responder,
      dialogVisible: true
    };
    this.setCurrentPlayer(responder);
    this.statusMessage = `${this.getColorName(requester)}申请点目，等待${this.getColorName(responder)}决定`;
    this.clearPendingSelection();
    this.clearPendingConfirmPlacement();
    this.clearPendingContractPlacement();
    this.clearPendingSacrificePlacement();
    this.clearPendingRebirthPlacement();
    this.clearPendingPersuaderPlacement();
    this.clearPendingThiefPlacement();
    this.clearPendingTeleportPlacement();
    this.clearPendingRelocatePlacement();
    this.clearPendingSwapCardSelection();
    this.replayMode = false;
    this.replayHistory = [];
    this.replayCurrentIndex = 0;
    this.pendingFogPlacement = null;
  }

  refuseScoreRequest() {
    if (!this.scoreRequestState) return;
    const responder = this.scoreRequestState.responder;
    this.scoreRequestState = null;
    this.statusMessage = `${this.getColorName(responder)}拒绝点目，对局继续`;
  }

  acceptScoreRequest() {
    if (!this.scoreRequestState) return;
    const summary = this.calculateTerritoryScore();
    this.scoreSummary = summary;
    this.scoreTerritoryMap = summary.territoryMap || null;
    this.scoreReviewBoard = summary.boardAfterDeadRemoval ? this.cloneBoard(summary.boardAfterDeadRemoval) : null;
    this.scoreReviewMode = false;
    this.scoreRequestState = null;
    this.captureCounts = {
      black: summary.blackCaptures,
      white: summary.whiteCaptures
    };
    this.gameOver = true;
    this.winner = summary.blackScore > summary.whiteScore ? BLACK : WHITE;
    this.statusMessage = summary.isEstimate
      ? `点目估算：黑 ${summary.blackScore} 目，白 ${summary.whiteScore} 目`
      : `点目结束：黑 ${summary.blackScore} 目，白 ${summary.whiteScore} 目`;
    this.openVictoryDialog();
  }

  calculateTerritoryScore() {
    const scoringState = this.prepareScoringState();
    const scoringBoard = scoringState.board;
    const captureCounts = scoringState.captureCounts;
    const visited = new Set();
    let blackTerritory = 0;
    let whiteTerritory = 0;
    let neutralTerritory = 0;
    const regionLogs = [];

    this.debugLogBoardForScoring(this.board, '原始棋盘');
    this.debugLogBoardForScoring(scoringBoard, '移除死子后的棋盘');

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (!this.isBoardShapeCell(row, col)) continue;
        if (scoringBoard[row][col] !== EMPTY) continue;

        const key = `${row},${col}`;
        if (visited.has(key)) continue;

        const info = this.collectEmptyRegion(scoringBoard, row, col, visited);
        let owner = 'neutral';
        if (!info.touchesOutside && info.borderColors.size === 1) {
          if (info.borderColors.has(BLACK)) {
            blackTerritory += info.points.length;
            owner = 'black';
          } else if (info.borderColors.has(WHITE)) {
            whiteTerritory += info.points.length;
            owner = 'white';
          } else {
            neutralTerritory += info.points.length;
          }
        } else {
          neutralTerritory += info.points.length;
        }

        regionLogs.push({
          start: `${row},${col}`,
          size: info.points.length,
          owner,
          borderColors: this.debugFormatBorderColors(info.borderColors),
          touchesOutside: info.touchesOutside,
          pointsArray: info.points.map(([r, c]) => [r, c]),
          points: info.points.map(([r, c]) => `(${r},${c})`).join(' ')
        });
      }
    }

    const blackCaptures = captureCounts.black || 0;
    const whiteCaptures = captureCounts.white || 0;
    const blackScore = blackTerritory + blackCaptures;
    const whiteScore = whiteTerritory + whiteCaptures + this.komi;

    const territoryMap = Array.from({ length: BOARD_ROWS }, (_, row) =>
      Array.from({ length: BOARD_COLS }, (_, col) => (this.isBoardShapeCell(row, col) ? 'none' : null))
    );

    regionLogs.forEach((item) => {
      if (!Array.isArray(item.pointsArray)) return;
      item.pointsArray.forEach(([r, c]) => {
        if (territoryMap[r] && territoryMap[r][c] != null) territoryMap[r][c] = item.owner;
      });
    });

    const emptyPoints = this.countEmptyPlayablePoints(scoringBoard);
    const isEstimate = false;

    const summary = {
      blackTerritory,
      whiteTerritory,
      neutralTerritory,
      blackCaptures,
      whiteCaptures,
      deadBlackRemoved: scoringState.deadBlackRemoved,
      deadWhiteRemoved: scoringState.deadWhiteRemoved,
      deadRemovedTotal: scoringState.deadRemovedTotal,
      komi: this.komi,
      blackScore,
      whiteScore,
      winner: blackScore > whiteScore ? BLACK : WHITE,
      margin: Math.abs(blackScore - whiteScore),
      territoryMap,
      boardAfterDeadRemoval: scoringBoard,
      isEstimate
    };

    this.debugLogScoreDetails(regionLogs, summary);
    return summary;
  }

  prepareScoringState() {
    const board = this.cloneBoard(this.board);
    const captureCounts = {
      black: this.captureCounts.black || 0,
      white: this.captureCounts.white || 0
    };
    const removedGroups = [];
    let deadBlackRemoved = 0;
    let deadWhiteRemoved = 0;
    let changed = true;
    let iteration = 0;

    while (changed && iteration < 6) {
      changed = false;
      iteration += 1;

      const groups = this.collectAllGroupsForBoard(board);
      const deadGroups = groups
        .map((item) => this.evaluateGroupLifeForScoring(board, item.group))
        .filter((item) => item && item.dead)
        .sort((a, b) => a.group.length - b.group.length);

      if (deadGroups.length === 0) break;

      for (const item of deadGroups) {
        const stillExists = item.group.every(([row, col]) => this.isPiece(board[row][col]) && board[row][col].color === item.color);
        if (!stillExists) continue;

        this.removeGroup(board, item.group);
        changed = true;
        if (item.color === BLACK) {
          captureCounts.white += item.group.length;
          deadBlackRemoved += item.group.length;
        } else {
          captureCounts.black += item.group.length;
          deadWhiteRemoved += item.group.length;
        }

        removedGroups.push({
          color: item.color,
          size: item.group.length,
          reason: item.reason,
          eyes: item.eyeCount,
          liberties: item.libertyCount,
          secureLiberties: item.secureLibertyCount
        });
      }
    }

    try {
      console.log('[点目] 自动死子判定', removedGroups.map((item) => ({
        color: item.color === BLACK ? 'black' : 'white',
        size: item.size,
        reason: item.reason,
        eyes: item.eyes,
        liberties: item.liberties,
        secureLiberties: item.secureLiberties
      })));
    } catch (err) {
      console.log('[点目] 自动死子判定输出失败', err);
    }

    return {
      board,
      captureCounts,
      deadBlackRemoved,
      deadWhiteRemoved,
      deadRemovedTotal: deadBlackRemoved + deadWhiteRemoved
    };
  }

  collectAllGroupsForBoard(board) {
    const visited = new Set();
    const groups = [];

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = board[row][col];
        if (!this.isPiece(cell)) continue;
        const key = `${row},${col}`;
        if (visited.has(key)) continue;

        const group = this.getGroup(board, row, col);
        group.forEach(([gr, gc]) => visited.add(`${gr},${gc}`));
        groups.push({ color: cell.color, group });
      }
    }

    return groups;
  }

  evaluateGroupLifeForScoring(board, group) {
    if (!group || group.length === 0) return null;
    const first = group[0];
    const cell = board[first[0]][first[1]];
    if (!this.isPiece(cell)) return null;

    const color = cell.color;
    const liberties = this.getLiberties(board, group);
    const libertyPoints = Array.from(liberties).map((key) => key.split(',').map(Number));
    const eyeRegions = this.getEyeRegionsForGroup(board, group, color);
    const eyeCount = eyeRegions.length;
    const secureLibertyCount = libertyPoints.filter(([row, col]) =>
      !this.isLibertyEnemyControlled(board, row, col, color, group)
    ).length;
    const libertyCount = liberties.size;
    const allControlled = libertyCount > 0 && secureLibertyCount === 0;
    const libertyThreshold = Math.max(4, Math.ceil(group.length / 3) + 1);

    let dead = false;
    let reason = '';

    if (eyeCount >= 2) {
      dead = false;
      reason = 'two-eyes';
    } else if (eyeCount >= 1 && libertyCount >= 3 && secureLibertyCount >= 2) {
      dead = false;
      reason = 'one-eye-and-liberties';
    } else if (secureLibertyCount >= libertyThreshold) {
      dead = false;
      reason = 'enough-liberties';
    } else if (eyeCount === 0 && libertyCount <= 1) {
      dead = true;
      reason = 'no-eye-and-atari';
    } else if (eyeCount === 0 && libertyCount <= 2) {
      dead = true;
      reason = allControlled ? 'controlled-two-liberties' : 'low-liberties';
    } else if (eyeCount < 2 && secureLibertyCount <= 1 && libertyCount <= 3) {
      dead = true;
      reason = allControlled ? 'fully-controlled' : 'insufficient-liberties';
    } else if (allControlled && eyeCount < 2) {
      dead = true;
      reason = 'all-liberties-controlled';
    }

    return {
      color,
      group,
      dead,
      reason,
      eyeCount,
      libertyCount,
      secureLibertyCount
    };
  }

  getEyeRegionsForGroup(board, group, color) {
    const libertySet = this.getLiberties(board, group);
    const visited = new Set();
    const eyes = [];

    libertySet.forEach((key) => {
      if (visited.has(key)) return;
      const [row, col] = key.split(',').map(Number);
      const info = this.collectEmptyRegion(board, row, col, visited);
      if (!info.points.length) return;
      if (!info.touchesOutside && info.borderColors.size === 1 && info.borderColors.has(color)) {
        eyes.push(info);
      }
    });

    return eyes;
  }

  isLibertyEnemyControlled(board, row, col, color, group) {
    const groupSet = new Set(group.map(([gr, gc]) => `${gr},${gc}`));
    const neighbors = this.getNeighborsForBoard(board, row, col);
    let enemyCount = 0;
    let friendlyCount = 0;
    let extraEmpty = 0;

    for (const [nr, nc] of neighbors) {
      const cell = board[nr][nc];
      if (cell === EMPTY) {
        extraEmpty += 1;
        continue;
      }
      if (!this.isPiece(cell)) continue;
      if (groupSet.has(`${nr},${nc}`) || cell.color === color) friendlyCount += 1;
      else enemyCount += 1;
    }

    return extraEmpty === 0 && enemyCount >= friendlyCount;
  }

  countEmptyPlayablePoints(board) {
    let count = 0;
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (!this.isBoardShapeCell(row, col)) continue;
        if (board[row][col] === EMPTY) count += 1;
      }
    }
    return count;
  }

  debugLogBoardForScoring(board = this.board, label = '当前棋盘') {
    try {
      const rows = [];
      for (let row = 0; row < BOARD_ROWS; row++) {
        const cells = [];
        for (let col = 0; col < BOARD_COLS; col++) {
          cells.push(this.debugGetBoardCellSymbol(board, row, col));
        }
        rows.push(`${String(row).padStart(2, '0')}: ${cells.join(' ')}`);
      }
      console.log(`[点目] ${label}：\n` + rows.join('\n'));
    } catch (err) {
      console.log(`[点目] ${label}输出失败`, err);
    }
  }

  debugGetBoardCellSymbol(board, row, col) {
    if (!this.isBoardShapeCell(row, col)) return '  ';
    const cell = board[row][col];
    if (cell === EMPTY) return '·';
    if (cell === DESTROYED) return 'X';
    if (!this.isPiece(cell)) return '?';

    const color = cell.color === BLACK ? 'B' : 'W';
    const type = cell.type && cell.type !== 'normal' ? `:${cell.type}` : '';
    return `${color}${type}`;
  }

  debugFormatBorderColors(borderColors) {
    return Array.from(borderColors).map((color) => {
      if (color === BLACK) return 'black';
      if (color === WHITE) return 'white';
      return String(color);
    }).join('|') || 'none';
  }

  debugLogScoreDetails(regionLogs, summary) {
    try {
      console.log('[点目] 空地连通区域明细开始');
      regionLogs.forEach((item, index) => {
        console.log(`[点目] 区域${index + 1} 起点=${item.start} 大小=${item.size} 归属=${item.owner} 边界=${item.borderColors} touchesOutside=${item.touchesOutside} 点=${item.points}`);
      });
      console.log('[点目] 结果汇总', {
        blackTerritory: summary.blackTerritory,
        whiteTerritory: summary.whiteTerritory,
        neutralTerritory: summary.neutralTerritory,
        blackCaptures: summary.blackCaptures,
        whiteCaptures: summary.whiteCaptures,
        komi: summary.komi,
        blackScore: summary.blackScore,
        whiteScore: summary.whiteScore,
        winner: summary.winner === BLACK ? 'black' : 'white',
        margin: summary.margin
      });
    } catch (err) {
      console.log('[点目] 结果输出失败', err);
    }
  }

  collectEmptyRegion(board, startRow, startCol, visited) {
    const stack = [[startRow, startCol]];
    const points = [];
    const borderColors = new Set();
    let touchesOutside = false;

    while (stack.length) {
      const [row, col] = stack.pop();
      const key = `${row},${col}`;
      if (visited.has(key)) continue;
      visited.add(key);

      if (!this.isBoardShapeCell(row, col)) {
        touchesOutside = true;
        continue;
      }

      const cell = board[row][col];
      if (cell !== EMPTY) continue;
      points.push([row, col]);

      for (const dir of Object.values(DIRS)) {
        const nr = row + dir.dr;
        const nc = col + dir.dc;

        if (!this.isBoardShapeCell(nr, nc)) {
          touchesOutside = true;
          continue;
        }

        const nextCell = board[nr][nc];
        if (nextCell === EMPTY) {
          const nextKey = `${nr},${nc}`;
          if (!visited.has(nextKey)) stack.push([nr, nc]);
        } else if (this.isPiece(nextCell)) {
          borderColors.add(nextCell.color);
        } else {
          touchesOutside = true;
        }
      }
    }

    return { points, borderColors, touchesOutside };
  }

  openVictoryDialog() {
    if (this.isTutorialMode || !this.gameOver) return;

    const winnerText = this.winner === BLACK ? '黑棋' : '白棋';
    let detail = `${winnerText}获胜。`;

    if (this.scoreSummary) {
      const summary = this.scoreSummary;
      const marginText = Number.isInteger(summary.margin) ? `${summary.margin}` : `${summary.margin.toFixed(1)}`;
      const estimatePrefix = summary.isEstimate ? '当前盘面估算：' : '';
      const deadText = summary.deadRemovedTotal > 0
        ? `，自动移除死子 ${summary.deadRemovedTotal} 枚`
        : '';
      detail = `${estimatePrefix}黑 ${summary.blackScore} 目，白 ${summary.whiteScore} 目，${winnerText}胜 ${marginText} 目${deadText}`;
    } else {
      const target = this.getCaptureTarget();
      detail = target > 0
        ? `${winnerText}率先达到提 ${target} 子的胜利条件。`
        : `${winnerText}获胜。`;
    }

    this.victoryDialog = {
      title: '对局结束',
      message: `${winnerText}赢了`,
      detail,
      confirmText: '确认返回主界面',
      scoreReviewText: this.scoreSummary ? '查看点目结果' : '',
      replayText: '进入复盘'
    };
  }

  closeVictoryDialogAndReturnHome() {
    this.victoryDialog = null;
    this.replayMode = false;
    this.replayHistory = [];
    this.replayCurrentIndex = 0;
    const targetScene = this.homeScene || this.returnScene;
    if (targetScene) {
      this.sceneManager.switchTo(targetScene);
    }
  }

  buildReplayStatusText(index = this.replayCurrentIndex, total = null) {
    const maxIndex = typeof total === 'number' ? total : Math.max(0, (Array.isArray(this.replayHistory) ? this.replayHistory.length - 1 : 0));
    if (maxIndex <= 0) return '复盘：当前为开局';
    if (index <= 0) return `复盘：开局（共 ${maxIndex} 步）`;
    if (index >= maxIndex) return `复盘：终局步（第 ${maxIndex}/${maxIndex} 步）`;
    return `复盘：第 ${index}/${maxIndex} 步`;
  }

  applyReplaySnapshot(index) {
    if (!Array.isArray(this.replayHistory) || this.replayHistory.length <= 0) return false;
    const maxIndex = this.replayHistory.length - 1;
    const safeIndex = Math.max(0, Math.min(index, maxIndex));
    const snapshot = this.deepCloneStateData(this.replayHistory[safeIndex]);
    if (!snapshot) return false;
    this.restoreUndoSnapshot(snapshot, { preserveReplayState: true });
    this.replayMode = true;
    this.replayCurrentIndex = safeIndex;
    this.victoryDialog = null;
    this.scoreReviewMode = false;
    this.statusMessage = this.buildReplayStatusText(safeIndex, maxIndex);
    return true;
  }

  enterReplayMode() {
    if (!this.gameOver) return false;
    const history = Array.isArray(this.undoHistory) ? this.undoHistory.map((item) => this.deepCloneStateData(item)) : [];
    history.push(this.captureUndoSnapshot());
    this.replayHistory = history;
    this.replayCurrentIndex = history.length - 1;
    this.scoreReviewMode = false;
    if (this.scoreRequestState) this.scoreRequestState.dialogVisible = false;
    if (this.undoRequestState) this.undoRequestState.dialogVisible = false;
    this.pendingTap = null;
    return this.applyReplaySnapshot(this.replayCurrentIndex);
  }

  jumpReplayToStart() {
    if (!this.replayMode) return false;
    return this.applyReplaySnapshot(0);
  }

  stepReplay(delta) {
    if (!this.replayMode) return false;
    return this.applyReplaySnapshot((this.replayCurrentIndex || 0) + delta);
  }

  jumpReplayToEnd() {
    if (!this.replayMode) return false;
    return this.applyReplaySnapshot(Math.max(0, this.replayHistory.length - 1));
  }

  startPracticeFromReplay() {
    if (!this.replayMode || !Array.isArray(this.replayHistory) || this.replayHistory.length <= 0) return false;
    const index = Math.max(0, Math.min(this.replayCurrentIndex || 0, this.replayHistory.length - 1));
    const snapshot = this.deepCloneStateData(this.replayHistory[index]);
    if (!snapshot) return false;
    this.restoreUndoSnapshot(snapshot);
    this.undoHistory = this.replayHistory.slice(0, index).map((item) => this.deepCloneStateData(item));
    this.replayMode = false;
    this.replayHistory = [];
    this.replayCurrentIndex = 0;
    this.gameOver = false;
    this.winner = null;
    this.victoryDialog = null;
    this.scoreSummary = null;
    this.scoreTerritoryMap = null;
    this.scoreReviewBoard = null;
    this.scoreReviewMode = false;
    this.statusMessage = index <= 0
      ? '已从开局进入残局对战'
      : `已从复盘第 ${index} 步进入残局对战`;
    return true;
  }

  enterScoreReviewMode() {
    if (!this.scoreSummary || !this.scoreTerritoryMap) return;
    this.scoreReviewMode = true;
    this.victoryDialog = null;
    if (this.scoreRequestState) this.scoreRequestState.dialogVisible = false;
    if (this.undoRequestState) this.undoRequestState.dialogVisible = false;
    this.clearPendingSelection();
    this.clearPendingConfirmPlacement();
    this.clearPendingContractPlacement();
    this.clearPendingSacrificePlacement();
    this.clearPendingRebirthPlacement();
    this.clearPendingPersuaderPlacement();
    this.clearPendingThiefPlacement();
    this.clearPendingTeleportPlacement();
    this.clearPendingRelocatePlacement();
    this.clearPendingSwapCardSelection();
    this.pendingFogPlacement = null;
    this.pendingPlacement = null;
    this.directionButtons = null;
    this.statusMessage = this.scoreSummary && this.scoreSummary.isEstimate
      ? '点目估算查看中：黑地、白地与中立地已高亮标注'
      : '点目结果查看中：黑地、白地与中立地已高亮标注';
  }

  setEnabledCardTypes(cardTypes, color = 'black') {
    this.setEnabledCardTypesByColor(color, cardTypes);
    if (!this.cardLoadoutByColor) this.cardLoadoutByColor = { black: [], white: [] };
    this.cardLoadoutByColor[this.getColorKey(color)] = this.createInitialCardLoadout(color);
    const defaultType = this.pieceConfig.defaultPieceType || 'normal';
    if (!this.nextPieceTypeByColor) this.nextPieceTypeByColor = { black: defaultType, white: defaultType };
    this.nextPieceTypeByColor[this.getColorKey(color)] = defaultType;
    this.syncActivePlayerCardState();
    this.clearPendingSelection();
    this.clearPendingConfirmPlacement();
    this.clearPendingContractPlacement();
    this.clearPendingSacrificePlacement();
    this.clearPendingTeleportPlacement();
    this.clearPendingRelocatePlacement();
    this.clearPendingSwapCardSelection();
  }

  prepareMatch(options = {}) {
    this.isTutorialMode = false;
    this.tutorialLevel = null;
    this.tutorialScene = null;
    this.tutorialIndex = -1;
    this.returnScene = this.homeScene || null;
    if (options.boardConfig) {
      this.boardConfig = options.boardConfig;
      this.baseBoardShape = this.cloneBoardShape(this.boardConfig.shape);
      this.boardConfig.shape = this.cloneBoardShape(this.baseBoardShape);
      BOARD_SHAPE = this.boardConfig.shape;
      BOARD_ROWS = BOARD_SHAPE.length;
      BOARD_COLS = BOARD_SHAPE[0].length;
    }

    this.setEnabledCardTypesByColor('black', options.blackCardTypes || options.cardTypes || this.blackEnabledCardTypes);
    this.setEnabledCardTypesByColor('white', options.whiteCardTypes || options.cardTypes || this.whiteEnabledCardTypes);

    if (options.victoryCondition) {
      this.setVictoryCondition(options.victoryCondition);
    }

    this.setNiuCrossOpeningEnabled(options.niuCrossOpeningEnabled);
    this.resetGame();
  }

  resetGame() {
    BOARD_SHAPE = this.cloneBoardShape(this.baseBoardShape || this.boardConfig.shape);
    this.boardConfig.shape = BOARD_SHAPE;
    BOARD_ROWS = BOARD_SHAPE.length;
    BOARD_COLS = BOARD_SHAPE[0].length;

    this.board = Array.from({ length: BOARD_ROWS }, (_, row) =>
      Array.from({ length: BOARD_COLS }, (_, col) =>
        BOARD_SHAPE[row][col] === 1 ? EMPTY : INVALID
      )
    );

    this.setCurrentPlayer(BLACK);
    this.lastMove = null;
    this.lastCaptured = [];
    this.statusMessage = '';
    this.captureCounts = { black: 0, white: 0 };
    this.winner = null;
    this.gameOver = false;
    this.victoryDialog = null;
    this.scoreRequestState = null;
    this.undoRequestState = null;
    this.undoHistory = [];
    this.scoreSummary = null;
    this.scoreTerritoryMap = null;
    this.scoreReviewBoard = null;
    this.scoreReviewMode = false;
    this.replayMode = false;
    this.replayHistory = [];
    this.replayCurrentIndex = 0;
    this.pendingTap = null;
    this.lastHandledTap = null;

    this.initTurnTimers();

    this.previousBoardKey = this.getBoardKey(this.board);

    const defaultType = this.pieceConfig.defaultPieceType || 'normal';
    this.nextPieceTypeByColor = { black: defaultType, white: defaultType };
    this.nextPieceType = defaultType;
    this.pendingPlacement = null;
    this.directionButtons = null;

    this.cardLoadoutByColor = {
      black: this.createInitialCardLoadout('black'),
      white: this.createInitialCardLoadout('white')
    };
    this.syncActivePlayerCardState();
    this.nextPieceId = 1;
    this.applyOpeningNiuCrossIfNeeded();
    this.contractLinks = [];
    this.pendingContractPlacement = null;
    this.pendingRebirthPlacement = null;
    this.pendingPersuaderPlacement = null;
    this.pendingFogPlacement = null;
    this.pendingSacrificePlacement = null;
    this.pendingThiefPlacement = null;
    this.pendingTeleportPlacement = null;
    this.pendingNightmarePlacement = null;
    this.nightmareDirectionButtons = null;
    this.pendingRelocatePlacement = null;
    this.pendingSwapCardSelection = null;
    this.pendingTrapPlacement = null;
    this.trapState = [];
    this.fogState = null;
    this.lastPlagueResolution = null;
    this.timeLimitEffect = null;
    this.turnPressure = {
      active: false,
      targetPlayer: null,
      startedAt: 0,
      durationMs: 0,
      remainingMs: 0,
      displaySeconds: 0,
      pulsePhase: 0
    };
    this.cloneStateByColor = {
      black: { pendingActivation: false, active: false, movesRemaining: 0, spawnedIds: [], expireAfterOpponentMove: false },
      white: { pendingActivation: false, active: false, movesRemaining: 0, spawnedIds: [], expireAfterOpponentMove: false }
    };

    this.calcBoardLayout();
    this.resetBoardViewTransform();
  }
  applyOpeningNiuCrossIfNeeded() {
    if (!this.niuCrossOpeningEnabled) return false;

    const anchor = this.findBestNiuCrossAnchor();
    if (!anchor) return false;

    const { row, col } = anchor;
    this.board[row][col] = createPiece(BLACK, 'normal', null, this.allocPieceId());
    this.board[row][col + 1] = createPiece(WHITE, 'normal', null, this.allocPieceId());
    this.board[row + 1][col] = createPiece(WHITE, 'normal', null, this.allocPieceId());
    this.board[row + 1][col + 1] = createPiece(BLACK, 'normal', null, this.allocPieceId());
    this.lastMove = null;
    return true;
  }

  findBestNiuCrossAnchor() {
    const distanceMap = this.buildEdgeDistanceMap();
    let best = null;

    for (let row = 0; row < BOARD_ROWS - 1; row++) {
      for (let col = 0; col < BOARD_COLS - 1; col++) {
        const cells = [
          [row, col],
          [row, col + 1],
          [row + 1, col],
          [row + 1, col + 1]
        ];

        let ok = true;
        let sum = 0;
        let minDist = Infinity;
        for (const [r, c] of cells) {
          if (!this.isPlayablePoint(r, c) || this.isPiece(this.board[r][c])) {
            ok = false;
            break;
          }
          const dist = distanceMap[r][c];
          if (!Number.isFinite(dist)) {
            ok = false;
            break;
          }
          sum += dist;
          if (dist < minDist) minDist = dist;
        }
        if (!ok) continue;

        const centerRow = row + 0.5;
        const centerCol = col + 0.5;
        const bias = -(Math.abs(centerRow - (BOARD_ROWS - 1) / 2) + Math.abs(centerCol - (BOARD_COLS - 1) / 2));
        const candidate = { row, col, score: sum / 4, minDist, bias };

        if (!best
          || candidate.score > best.score
          || (candidate.score === best.score && candidate.minDist > best.minDist)
          || (candidate.score === best.score && candidate.minDist === best.minDist && candidate.bias > best.bias)) {
          best = candidate;
        }
      }
    }

    return best;
  }

  buildEdgeDistanceMap() {
    const dist = Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => Infinity));
    const queue = [];
    let head = 0;

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (!this.isPlayablePoint(row, col)) continue;
        if (this.isEdgePlayablePoint(row, col)) {
          dist[row][col] = 0;
          queue.push([row, col]);
        }
      }
    }

    const offsets = [[1,0],[-1,0],[0,1],[0,-1]];
    while (head < queue.length) {
      const [row, col] = queue[head++];
      const nextDist = dist[row][col] + 1;
      for (const [dr, dc] of offsets) {
        const nr = row + dr;
        const nc = col + dc;
        if (!this.isPlayablePoint(nr, nc)) continue;
        if (nextDist >= dist[nr][nc]) continue;
        dist[nr][nc] = nextDist;
        queue.push([nr, nc]);
      }
    }

    return dist;
  }

  isEdgePlayablePoint(row, col) {
    if (!this.isPlayablePoint(row, col)) return false;
    const offsets = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dr, dc] of offsets) {
      const nr = row + dr;
      const nc = col + dc;
      if (!this.isPlayablePoint(nr, nc)) return true;
    }
    return false;
  }

  startLevel1() {
    this.resetGame();
    this.statusMessage = '进入教学关卡 1';
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

    this.baseCellSize = Math.min(usableWidth / spanCols, usableHeight / spanRows);

    const centerCol = (minCol + maxCol) / 2;
    const centerRow = (minRow + maxRow) / 2;

    this.boardCenterX = SCREEN_WIDTH / 2;
    this.boardCenterY = this.boardPaddingTop + usableHeight / 2;

    this.baseOriginX = this.boardCenterX - centerCol * this.baseCellSize;
    this.baseOriginY = this.boardCenterY - centerRow * this.baseCellSize;
  }

  resetBoardViewTransform() {
    this.boardScale = 1;
    this.boardOffsetX = 0;
    this.boardOffsetY = 0;
    this.activeGesture = null;
    this.lastGestureEndAt = 0;
    this.applyBoardViewTransform();
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  getBoardScaleLimits() {
    const totalPlayable = this.boardConfig && Array.isArray(this.boardConfig.shape)
      ? this.boardConfig.shape.reduce((sum, row) => sum + row.reduce((rSum, cell) => rSum + (cell === 1 ? 1 : 0), 0), 0)
      : 0;

    const spanCols = Math.max(1, this.maxCol - this.minCol);
    const spanRows = Math.max(1, this.maxRow - this.minRow);
    const maxSpan = Math.max(spanCols, spanRows);

    let minScale = 1;
    let maxScale = 2.8;

    if (totalPlayable >= 4500 || maxSpan >= 120) {
      maxScale = 18;
      minScale = 0.35;
    } else if (totalPlayable >= 2500 || maxSpan >= 90) {
      maxScale = 14;
      minScale = 0.45;
    } else if (totalPlayable >= 1200 || maxSpan >= 60) {
      maxScale = 10;
      minScale = 0.6;
    } else if (totalPlayable >= 500 || maxSpan >= 35) {
      maxScale = 7;
      minScale = 0.8;
    }

    return { minScale, maxScale };
  }

  getBoardViewportRect() {
    return {
      left: this.boardPaddingSide,
      top: this.boardPaddingTop,
      right: SCREEN_WIDTH - this.boardPaddingSide,
      bottom: SCREEN_HEIGHT - this.boardPaddingBottom
    };
  }

  getBoardViewportCenter() {
    const viewport = this.getBoardViewportRect();
    return {
      x: (viewport.left + viewport.right) / 2,
      y: (viewport.top + viewport.bottom) / 2
    };
  }

  clampBoardOffset(offsetX, offsetY, scale = this.boardScale) {
    const viewport = this.getBoardViewportRect();
    const margin = 36;

    const left = this.baseOriginX + this.minCol * this.baseCellSize * scale + offsetX;
    const right = this.baseOriginX + this.maxCol * this.baseCellSize * scale + offsetX;
    const top = this.baseOriginY + this.minRow * this.baseCellSize * scale + offsetY;
    const bottom = this.baseOriginY + this.maxRow * this.baseCellSize * scale + offsetY;

    const width = right - left;
    const height = bottom - top;
    const viewportWidth = viewport.right - viewport.left;
    const viewportHeight = viewport.bottom - viewport.top;

    let minOffsetX;
    let maxOffsetX;
    let minOffsetY;
    let maxOffsetY;

    if (width <= viewportWidth) {
      const targetLeft = viewport.left + (viewportWidth - width) / 2;
      minOffsetX = maxOffsetX = targetLeft - (this.baseOriginX + this.minCol * this.baseCellSize * scale);
    } else {
      minOffsetX = viewport.right - margin - (this.baseOriginX + this.maxCol * this.baseCellSize * scale);
      maxOffsetX = viewport.left + margin - (this.baseOriginX + this.minCol * this.baseCellSize * scale);
    }

    if (height <= viewportHeight) {
      const targetTop = viewport.top + (viewportHeight - height) / 2;
      minOffsetY = maxOffsetY = targetTop - (this.baseOriginY + this.minRow * this.baseCellSize * scale);
    } else {
      minOffsetY = viewport.bottom - margin - (this.baseOriginY + this.maxRow * this.baseCellSize * scale);
      maxOffsetY = viewport.top + margin - (this.baseOriginY + this.minRow * this.baseCellSize * scale);
    }

    return {
      x: this.clamp(offsetX, minOffsetX, maxOffsetX),
      y: this.clamp(offsetY, minOffsetY, maxOffsetY)
    };
  }

  applyBoardViewTransform() {
    const { minScale, maxScale } = this.getBoardScaleLimits();
    const scale = this.clamp(this.boardScale || 1, minScale, maxScale);
    const clamped = this.clampBoardOffset(this.boardOffsetX || 0, this.boardOffsetY || 0, scale);

    this.boardScale = scale;
    this.boardOffsetX = clamped.x;
    this.boardOffsetY = clamped.y;

    this.cellSize = this.baseCellSize * this.boardScale;
    this.originX = this.baseOriginX + this.boardOffsetX;
    this.originY = this.baseOriginY + this.boardOffsetY;

    this.refreshPendingBoardAnchors();
  }

  refreshPendingBoardAnchors() {
    if (this.pendingPlacement) {
      this.directionButtons = this.buildDirectionButtons(this.pendingPlacement.row, this.pendingPlacement.col);
    }
    if (this.pendingNightmarePlacement && this.pendingNightmarePlacement.targetRow != null && this.pendingNightmarePlacement.targetCol != null) {
      this.nightmareDirectionButtons = this.buildDirectionButtons(this.pendingNightmarePlacement.targetRow, this.pendingNightmarePlacement.targetCol);
    }
  }

  getTouchCenterAndDistance(touches) {
    if (!touches || touches.length < 2) return null;
    const a = touches[0];
    const b = touches[1];
    const dx = b.clientX - a.clientX;
    const dy = b.clientY - a.clientY;
    return {
      centerX: (a.clientX + b.clientX) / 2,
      centerY: (a.clientY + b.clientY) / 2,
      distance: Math.sqrt(dx * dx + dy * dy)
    };
  }

  beginBoardGesture(touches) {
    const info = this.getTouchCenterAndDistance(touches);
    if (!info) return;

    this.activeGesture = {
      startScale: this.boardScale,
      startOffsetX: this.boardOffsetX,
      startOffsetY: this.boardOffsetY,
      startCenterX: info.centerX,
      startCenterY: info.centerY,
      startDistance: Math.max(1, info.distance)
    };
  }

  updateBoardGesture(touches) {
    if (!this.activeGesture || !touches || touches.length < 2) return false;

    const info = this.getTouchCenterAndDistance(touches);
    if (!info) return false;

    const g = this.activeGesture;
    const { minScale, maxScale } = this.getBoardScaleLimits();
    const newScale = this.clamp(g.startScale * (info.distance / g.startDistance), minScale, maxScale);
    const anchorBoardX = (g.startCenterX - this.baseOriginX - g.startOffsetX) / (this.baseCellSize * g.startScale);
    const anchorBoardY = (g.startCenterY - this.baseOriginY - g.startOffsetY) / (this.baseCellSize * g.startScale);

    this.boardScale = newScale;
    this.boardOffsetX = info.centerX - this.baseOriginX - anchorBoardX * this.baseCellSize * newScale;
    this.boardOffsetY = info.centerY - this.baseOriginY - anchorBoardY * this.baseCellSize * newScale;
    this.applyBoardViewTransform();
    return true;
  }

  endBoardGesture() {
    if (!this.activeGesture) return;
    this.activeGesture = null;
    this.lastGestureEndAt = Date.now();
  }

  adjustBoardZoomByFactor(scaleFactor, anchorX, anchorY) {
    if (!scaleFactor || !isFinite(scaleFactor) || scaleFactor <= 0) return false;

    const { minScale, maxScale } = this.getBoardScaleLimits();
    const oldScale = this.boardScale;
    const newScale = this.clamp(oldScale * scaleFactor, minScale, maxScale);
    if (Math.abs(newScale - oldScale) < 0.0001) return false;

    const x = typeof anchorX === 'number' ? anchorX : this.getBoardViewportCenter().x;
    const y = typeof anchorY === 'number' ? anchorY : this.getBoardViewportCenter().y;

    const anchorBoardX = (x - this.baseOriginX - this.boardOffsetX) / (this.baseCellSize * oldScale);
    const anchorBoardY = (y - this.baseOriginY - this.boardOffsetY) / (this.baseCellSize * oldScale);

    this.boardScale = newScale;
    this.boardOffsetX = x - this.baseOriginX - anchorBoardX * this.baseCellSize * newScale;
    this.boardOffsetY = y - this.baseOriginY - anchorBoardY * this.baseCellSize * newScale;
    this.applyBoardViewTransform();
    return true;
  }

  zoomBoardByStep(direction, anchorX, anchorY) {
    if (!direction) return false;
    const factor = direction > 0 ? 1.18 : 1 / 1.18;
    return this.adjustBoardZoomByFactor(factor, anchorX, anchorY);
  }

  resetBoardZoom() {
    this.boardScale = 1;
    this.boardOffsetX = 0;
    this.boardOffsetY = 0;
    this.applyBoardViewTransform();
    return true;
  }

  onWheel(e) {
    if (!e) return;

    const x = typeof e.clientX === 'number' ? e.clientX : SCREEN_WIDTH / 2;
    const y = typeof e.clientY === 'number' ? e.clientY : this.getBoardViewportCenter().y;

    if (!this.isPointInBoardViewport(x, y)) return;

    const rawDelta = typeof e.deltaY === 'number'
      ? e.deltaY
      : (typeof e.wheelDelta === 'number' ? -e.wheelDelta : 0);
    if (!rawDelta) return;

    const baseFactor = rawDelta > 0 ? 0.9 : 1.1;
    const intensity = Math.min(4, Math.max(1, Math.abs(rawDelta) / 120));
    const scaleFactor = Math.pow(baseFactor, intensity);
    const changed = this.adjustBoardZoomByFactor(scaleFactor, x, y);

    if (changed && e.preventDefault) e.preventDefault();
  }

  getAllValidPoints() {
    const points = [];
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (BOARD_SHAPE[row][col] === 1) points.push([row, col]);
      }
    }
    return points;
  }

  getMiniCardPreviewLayout(color) {
    const isBlack = this.getColorKey(color) === 'black';
    const w = 112;
    const x = isBlack ? 22 : SCREEN_WIDTH - 22 - w;
    const y = this.previewRowY;
    const h = this.previewRowH;
    const gap = 6;
    const cardW = 28;
    const cardH = 28;
    const startX = x + (w - (cardW * this.maxCardSlots + gap * (this.maxCardSlots - 1))) / 2;
    const slots = [];

    for (let i = 0; i < this.maxCardSlots; i++) {
      slots.push({
        index: i,
        x: startX + i * (cardW + gap),
        y: y + 22,
        w: cardW,
        h: cardH
      });
    }

    return { x, y, w, h, slots };
  }

  getMiniCardPreviewSlotAt(x, y, color) {
    const layout = this.getMiniCardPreviewLayout(color);
    for (const slot of layout.slots) {
      if (inRect(x, y, slot.x, slot.y, slot.w, slot.h)) return slot;
    }
    return null;
  }

  getCardDataBySlot(slotIndex, color = this.currentPlayer) {
    const loadout = color === this.currentPlayer ? this.cardLoadout : (this.cardLoadoutByColor ? this.cardLoadoutByColor[this.getColorKey(color)] : null);
    return (loadout && loadout[slotIndex]) || null;
  }

  findAvailableCardSlotByType(type, color = this.currentPlayer) {
    const loadout = color === this.currentPlayer ? this.cardLoadout : (this.cardLoadoutByColor ? this.cardLoadoutByColor[this.getColorKey(color)] : []);
    for (let i = 0; i < loadout.length; i++) {
      const card = loadout[i];
      if (card && card.type === type && !card.used) return i;
    }
    return -1;
  }

  hasAvailableCard(type) {
    return this.findAvailableCardSlotByType(type) >= 0;
  }

  consumeCard(type) {
    const slotIndex = this.findAvailableCardSlotByType(type);
    if (slotIndex < 0) return false;

    this.cardLoadout[slotIndex].used = true;
    return true;
  }

  refundCard(type) {
    for (let i = this.cardLoadout.length - 1; i >= 0; i--) {
      const card = this.cardLoadout[i];
      if (card && card.type === type && card.used) {
        card.used = false;
        return true;
      }
    }
    return false;
  }

  clearPendingSwapCardSelection() {
    this.pendingSwapCardSelection = null;
  }

  canStartSwapCardSelection() {
    if (!this.hasAvailableCard('swap_card')) return { ok: false, message: '这张卡已经用掉了' };

    const loadout = this.cardLoadout || [];
    const ownCandidates = [];
    for (let i = 0; i < loadout.length; i++) {
      const card = loadout[i];
      if (!card || card.used || card.type === 'swap_card') continue;
      ownCandidates.push(i);
    }
    if (ownCandidates.length <= 0) return { ok: false, message: '没有可拿来交换的己方手牌' };

    const opponentKey = this.getColorKey(this.getOpponent(this.currentPlayer));
    const opponentLoadout = this.cardLoadoutByColor ? (this.cardLoadoutByColor[opponentKey] || []) : [];
    const enemyCandidates = [];
    for (let i = 0; i < opponentLoadout.length; i++) {
      const card = opponentLoadout[i];
      if (!card || card.used) continue;
      enemyCandidates.push(i);
    }
    if (enemyCandidates.length <= 0) return { ok: false, message: '对方没有可交换的手牌' };

    return { ok: true };
  }

  startSwapCardSelection() {
    const check = this.canStartSwapCardSelection();
    if (!check.ok) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = check.message;
      return false;
    }

    this.clearPendingSelection();
    this.clearPendingConfirmPlacement();
    this.clearPendingContractPlacement();
    this.clearPendingRebirthPlacement();
    this.clearPendingPersuaderPlacement();
    this.clearPendingFogPlacement();
    this.clearPendingThiefPlacement();
    this.clearPendingTeleportPlacement();
    this.clearPendingSacrificePlacement();

    this.pendingSwapCardSelection = { stage: 'own', ownSlotIndex: -1 };
    this.nextPieceType = 'swap_card';
    this.statusMessage = '换牌已选中：请先在下方选择自己的一张未使用手牌';
    return true;
  }

  selectOwnSwapCard(slotIndex) {
    const pending = this.pendingSwapCardSelection;
    if (!pending) return false;

    const card = this.getCardDataBySlot(slotIndex);
    if (!card || card.used) {
      this.statusMessage = '请选择一张未使用的己方手牌';
      return false;
    }
    if (card.type === 'swap_card') {
      this.statusMessage = '换牌卡自己不能作为被交换目标';
      return false;
    }

    pending.stage = 'enemy';
    pending.ownSlotIndex = slotIndex;
    const def = getPieceDef(this.pieceMap, card.type);
    this.statusMessage = `已选中己方 ${def.name}：请点击上方对方卡槽中的一张未使用手牌`;
    return true;
  }

  performSwapCard(enemySlotIndex) {
    const pending = this.pendingSwapCardSelection;
    if (!pending || pending.ownSlotIndex < 0) return false;

    const currentKey = this.getColorKey(this.currentPlayer);
    const opponentKey = this.getColorKey(this.getOpponent(this.currentPlayer));
    const ownLoadout = this.cardLoadoutByColor ? this.cardLoadoutByColor[currentKey] : null;
    const enemyLoadout = this.cardLoadoutByColor ? this.cardLoadoutByColor[opponentKey] : null;
    if (!ownLoadout || !enemyLoadout) return false;

    const ownCard = ownLoadout[pending.ownSlotIndex];
    const enemyCard = enemyLoadout[enemySlotIndex];
    if (!ownCard || ownCard.used || ownCard.type === 'swap_card') {
      this.statusMessage = '己方所选手牌已无效，请重新选择';
      this.pendingSwapCardSelection = { stage: 'own', ownSlotIndex: -1 };
      return false;
    }
    if (!enemyCard || enemyCard.used) {
      this.statusMessage = '对方所选手牌已无效，请重新选择';
      return false;
    }

    ownLoadout[pending.ownSlotIndex] = { ...enemyCard };
    enemyLoadout[enemySlotIndex] = { ...ownCard };
    this.consumeCard('swap_card');
    this.syncActivePlayerCardState();

    const ownDef = getPieceDef(this.pieceMap, ownCard.type);
    const enemyDef = getPieceDef(this.pieceMap, enemyCard.type);

    const wonByCapture = this.checkVictoryAfterCapture(this.currentPlayer);
    if (!wonByCapture) {
      this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
    }

    const turnStartInfo = wonByCapture
      ? { persuadedCount: 0, vanishedCount: 0, archerShotCount: 0, archerKillCount: 0, archerDisabledCount: 0, plagueInfo: { infectedCount: 0, deathCount: 0, recoverCount: 0, vanishedCount: 0 }, teleportInfo: { movedCount: 0, failedCount: 0, finishedCount: 0 } }
      : this.resolveTurnStartSpecials(this.currentPlayer);
    if (this.isFogActiveForPlayer(this.getOpponent(this.currentPlayer))) {
      this.clearFog();
    }

    if (turnStartInfo.plagueInfo && (turnStartInfo.plagueInfo.deathCount > 0 || turnStartInfo.plagueInfo.recoverCount > 0)) {
      this.statusMessage = `换牌完成：己方 ${ownDef.name} ↔ 对方 ${enemyDef.name}。瘟疫结算：病死 ${turnStartInfo.plagueInfo.deathCount} 枚，康复 ${turnStartInfo.plagueInfo.recoverCount} 枚`;
    } else if (turnStartInfo.archerDisabledCount > 0) {
      this.statusMessage = `换牌完成：己方 ${ownDef.name} ↔ 对方 ${enemyDef.name}。有 ${turnStartInfo.archerDisabledCount} 枚弓箭手被敌子贴身，失去射箭能力`;
    } else if (turnStartInfo.archerShotCount > 0) {
      this.statusMessage = turnStartInfo.archerKillCount > 0
        ? `换牌完成：己方 ${ownDef.name} ↔ 对方 ${enemyDef.name}。弓箭手放箭，击杀 ${turnStartInfo.archerKillCount} 枚`
        : `换牌完成：己方 ${ownDef.name} ↔ 对方 ${enemyDef.name}。弓箭手放箭，但前方没有目标`;
    } else if (turnStartInfo.persuadedCount > 0 || turnStartInfo.vanishedCount > 0) {
      this.statusMessage = `换牌完成：己方 ${ownDef.name} ↔ 对方 ${enemyDef.name}。说客发动，转化 ${turnStartInfo.persuadedCount} 枚${turnStartInfo.vanishedCount > 0 ? `，消失 ${turnStartInfo.vanishedCount} 枚` : ''}`;
    } else if (turnStartInfo.teleportInfo && turnStartInfo.teleportInfo.failedCount > 0) {
      this.statusMessage = `换牌完成：己方 ${ownDef.name} ↔ 对方 ${enemyDef.name}。瞬移受阻，失效 ${turnStartInfo.teleportInfo.failedCount} 枚`;
    } else if (turnStartInfo.teleportInfo && turnStartInfo.teleportInfo.movedCount > 0) {
      this.statusMessage = `换牌完成：己方 ${ownDef.name} ↔ 对方 ${enemyDef.name}。瞬移发动，移动 ${turnStartInfo.teleportInfo.movedCount} 枚`;
    } else {
      this.statusMessage = `换牌完成：己方 ${ownDef.name} 与对方 ${enemyDef.name} 已对换`;
    }

    this.clearPendingSwapCardSelection();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    return true;
  }

  cancelPendingContractPlacement() {
    const pending = this.pendingContractPlacement;
    if (!pending) return false;

    this.removePieceById(pending.contractId);
    this.contractLinks = this.contractLinks.filter((link) =>
      link.contractId !== pending.contractId && link.targetId !== pending.contractId
    );
    this.refundCard('contract');
    this.clearPendingContractPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.previousBoardKey = this.getBoardKey(this.board);
    this.lastMove = null;
    this.lastCaptured = [];
    this.statusMessage = '已取消契约落子';
    return true;
  }

  allocPieceId() {
    const id = this.nextPieceId;
    this.nextPieceId += 1;
    return id;
  }

  findPiecePositionById(pieceId) {
    if (!pieceId) return null;
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (this.isPiece(cell) && cell.id === pieceId) return { row, col, cell };
      }
    }
    return null;
  }

  removePieceById(pieceId, options = {}) {
    const found = this.findPiecePositionById(pieceId);
    if (!found) return false;
    this.resolvePieceRemovalAt(found.row, found.col, options);
    return true;
  }

  resolvePieceRemovalAt(row, col, options = {}) {
    const cell = this.board[row][col];
    if (!this.isPiece(cell)) {
      return { removed: false, counted: false, reborn: false };
    }

    const allowRebirth = options.allowRebirth !== false;
    const blockedRebirthKeys = options.blockedRebirthKeys || null;
    let scoreForColor = options.scoreForColor || null;
    const scoreByVictimOpposition = options.scoreByVictimOpposition === true;
    const target = allowRebirth && cell.rebirthReady ? cell.rebirthTarget : null;

    if (scoreByVictimOpposition) {
      scoreForColor = this.getOpponent(cell.color);
    }

    this.board[row][col] = EMPTY;

    if (
      cell.rebirthReady &&
      target &&
      this.isPlayablePoint(target.row, target.col) &&
      this.board[target.row][target.col] === EMPTY &&
      (!blockedRebirthKeys || !blockedRebirthKeys.has(`${target.row},${target.col}`))
    ) {
      this.board[target.row][target.col] = createPiece(
        cell.color,
        'normal',
        null,
        cell.id
      );
      return {
        removed: true,
        counted: false,
        reborn: true,
        target: { row: target.row, col: target.col }
      };
    }

    if (scoreForColor === BLACK) this.captureCounts.black += 1;
    else if (scoreForColor === WHITE) this.captureCounts.white += 1;

    return { removed: true, counted: true, reborn: false };
  }

  clearPendingContractPlacement() {
    this.pendingContractPlacement = null;
  }

  clearPendingRebirthPlacement() {
    this.pendingRebirthPlacement = null;
  }


  clearPendingTrapPlacement() {
    this.pendingTrapPlacement = null;
  }

  cancelPendingTrapPlacement() {
    if (!this.pendingTrapPlacement) return false;
    const pending = this.pendingTrapPlacement;
    if (pending && pending.pieceId) {
      const found = this.findPiecePositionById(pending.pieceId);
      if (found && this.isPiece(found.cell)) {
        this.removePieceById(pending.pieceId, { allowRebirth: false });
      }
    }
    this.refundCard('trap');
    this.clearPendingTrapPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.previousBoardKey = this.getBoardKey(this.board);
    this.lastMove = null;
    this.lastCaptured = [];
    this.statusMessage = '已取消陷阱落子';
    return true;
  }

  findTrapIndexAt(row, col) {
    const list = Array.isArray(this.trapState) ? this.trapState : [];
    for (let i = 0; i < list.length; i++) {
      const trap = list[i];
      if (trap && trap.row === row && trap.col === col) return i;
    }
    return -1;
  }

  getTrapAt(row, col) {
    const index = this.findTrapIndexAt(row, col);
    return index >= 0 ? this.trapState[index] : null;
  }

  isTrapVisibleToCurrentPlayer(trap) {
    return !!(trap && trap.ownerColor === this.currentPlayer);
  }

  placeHiddenTrap(row, col, ownerColor) {
    if (!this.isPlayablePoint(row, col)) return { ok: false, message: '请选择一个有效位置布设陷阱' };
    if (this.board[row][col] !== EMPTY) return { ok: false, message: '陷阱只能布设在空位' };
    const index = this.findTrapIndexAt(row, col);
    const entry = { row, col, ownerColor };
    if (index >= 0) this.trapState[index] = entry;
    else this.trapState.push(entry);
    return { ok: true };
  }

  finalizeManualTurn(message, tutorialPayload = null) {
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
    const turnStartInfo = this.resolveTurnStartSpecials(this.currentPlayer);
    if (this.isFogActiveForPlayer(this.getOpponent(this.currentPlayer))) {
      this.clearFog();
    }
    this.previousBoardKey = this.getBoardKey(this.board);
    if (message) {
      this.statusMessage = message;
    } else if (turnStartInfo.plagueInfo && (turnStartInfo.plagueInfo.deathCount > 0 || turnStartInfo.plagueInfo.recoverCount > 0)) {
      this.statusMessage = `瘟疫结算：病死 ${turnStartInfo.plagueInfo.deathCount} 枚，康复 ${turnStartInfo.plagueInfo.recoverCount} 枚`;
    } else if (turnStartInfo.archerDisabledCount > 0) {
      this.statusMessage = `有 ${turnStartInfo.archerDisabledCount} 枚弓箭手被敌子贴身，失去射箭能力`;
    } else if (turnStartInfo.archerShotCount > 0) {
      this.statusMessage = turnStartInfo.archerKillCount > 0
        ? `弓箭手放箭，击杀 ${turnStartInfo.archerKillCount} 枚`
        : '弓箭手放箭，但前方没有目标';
    } else if (turnStartInfo.persuadedCount > 0 || turnStartInfo.vanishedCount > 0) {
      this.statusMessage = `说客发动，转化 ${turnStartInfo.persuadedCount} 枚${turnStartInfo.vanishedCount > 0 ? `，消失 ${turnStartInfo.vanishedCount} 枚` : ''}`;
    } else if (turnStartInfo.teleportInfo && turnStartInfo.teleportInfo.failedCount > 0) {
      this.statusMessage = `瞬移受阻，失效 ${turnStartInfo.teleportInfo.failedCount} 枚`;
    } else if (turnStartInfo.teleportInfo && turnStartInfo.teleportInfo.movedCount > 0) {
      this.statusMessage = `瞬移发动，移动 ${turnStartInfo.teleportInfo.movedCount} 枚`;
    } else if (turnStartInfo.cloneExpiredInfo && turnStartInfo.cloneExpiredInfo.removedCount > 0) {
      this.statusMessage = `对手落子后，克隆出的 ${turnStartInfo.cloneExpiredInfo.removedCount} 子已自动死亡`;
    } else if (turnStartInfo.cloneActivationInfo && turnStartInfo.cloneActivationInfo.activated) {
      this.statusMessage = '克隆生效：本回合请连续落 2 个普通子';
    }
    if (tutorialPayload) this.handleTutorialPostAction(tutorialPayload.trigger || 'commit', tutorialPayload.piece || null);
    return turnStartInfo;
  }

  resolveTrapLandingAt(row, col, options = {}) {
    const trapIndex = this.findTrapIndexAt(row, col);
    if (trapIndex < 0) return { triggered: false };
    const victim = this.board[row][col];
    if (!this.isPiece(victim)) return { triggered: false };
    const trap = this.trapState[trapIndex];
    this.trapState.splice(trapIndex, 1);
    const removal = this.resolvePieceRemovalAt(row, col, {
      reason: 'capture',
      allowRebirth: true,
      scoreByVictimOpposition: true
    });
    this.lastCaptured = (this.lastCaptured || []).concat([[row, col]]);
    this.previousBoardKey = this.getBoardKey(this.board);
    return {
      triggered: true,
      trap,
      victimColor: victim.color,
      victimType: victim.type,
      counted: !!removal.counted,
      reborn: !!removal.reborn,
      message: options.message || `陷阱触发：${this.getColorName(victim.color)}落子即死`
    };
  }

  clearPendingPersuaderPlacement() {
    this.pendingPersuaderPlacement = null;
  }

  clearPendingFogPlacement() {
    this.pendingFogPlacement = null;
  }

  clearPendingSacrificePlacement() {
    this.pendingSacrificePlacement = null;
  }

  clearPendingThiefPlacement() {
    this.pendingThiefPlacement = null;
  }

  clearPendingTeleportPlacement() {
    this.pendingTeleportPlacement = null;
  }

  clearPendingNightmarePlacement() {
    this.pendingNightmarePlacement = null;
    this.nightmareDirectionButtons = null;
  }

  clearPendingRelocatePlacement() {
    this.pendingRelocatePlacement = null;
  }

  cancelPendingFogPlacement() {
    const pending = this.pendingFogPlacement;
    if (!pending) return false;

    this.removePieceById(pending.pieceId);
    this.refundCard('fog');
    this.clearPendingFogPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.previousBoardKey = this.getBoardKey(this.board);
    this.lastMove = null;
    this.lastCaptured = [];
    this.statusMessage = '已取消迷雾落子';
    return true;
  }

  cancelPendingPersuaderPlacement() {
    const pending = this.pendingPersuaderPlacement;
    if (!pending) return false;

    this.removePieceById(pending.pieceId);
    this.refundCard('persuader');
    this.clearPendingPersuaderPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.previousBoardKey = this.getBoardKey(this.board);
    this.lastMove = null;
    this.lastCaptured = [];
    this.statusMessage = '已取消说客落子';
    return true;
  }

  cancelPendingTeleportPlacement() {
    const pending = this.pendingTeleportPlacement;
    if (!pending) return false;

    this.removePieceById(pending.pieceId);
    this.refundCard('teleport');
    this.clearPendingTeleportPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.previousBoardKey = this.getBoardKey(this.board);
    this.lastMove = null;
    this.lastCaptured = [];
    this.statusMessage = '已取消瞬移落子';
    return true;
  }

  cancelPendingNightmarePlacement() {
    const pending = this.pendingNightmarePlacement;
    if (!pending) return false;

    this.removePieceById(pending.pieceId);
    this.refundCard('nightmare');
    this.clearPendingNightmarePlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.previousBoardKey = this.getBoardKey(this.board);
    this.lastMove = null;
    this.lastCaptured = [];
    this.statusMessage = '已取消梦魇落子';
    return true;
  }

  cancelPendingRelocatePlacement() {
    const pending = this.pendingRelocatePlacement;
    if (!pending) return false;

    this.clearPendingRelocatePlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.statusMessage = '已取消挪移操作';
    return true;
  }

  cancelPendingThiefPlacement() {
    const pending = this.pendingThiefPlacement;
    if (!pending) return false;

    this.clearPendingThiefPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.statusMessage = '已取消盗贼操作';
    return true;
  }


  startNightmarePlacement(row, col) {
    if (!this.isPlayablePoint(row, col) || this.board[row][col] !== EMPTY) {
      this.statusMessage = '梦魇必须落在有效空位';
      return false;
    }

    if (!this.hasAvailableCard('nightmare')) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = '这张卡已经用掉了';
      return false;
    }

    const pieceId = this.allocPieceId();
    this.board[row][col] = createPiece(this.currentPlayer, 'nightmare', null, pieceId);
    this.consumeCard('nightmare');
    this.pendingNightmarePlacement = {
      row,
      col,
      color: this.currentPlayer,
      pieceId,
      targetRow: null,
      targetCol: null,
      targetId: null
    };
    this.nightmareDirectionButtons = null;
    this.lastMove = { row, col };
    this.lastCaptured = [];
    this.previousBoardKey = this.getBoardKey(this.board);
    const nightmareTrapHit = this.resolveTrapLandingAt(row, col, { message: '梦魇子误踏陷阱：本回合结束' });
    if (nightmareTrapHit.triggered) {
      this.clearPendingNightmarePlacement();
      this.finalizeManualTurn(nightmareTrapHit.message, { trigger: 'commit', piece: { type: 'nightmare', color: this.currentPlayer } });
      return true;
    }
    this.nextPieceType = 'nightmare';
    this.statusMessage = '梦魇已落子：请选择任意一枚敌方棋子';
    return true;
  }

  selectNightmareTarget(row, col) {
    const pending = this.pendingNightmarePlacement;
    if (!pending) return false;

    const target = this.isPlayablePoint(row, col) ? this.board[row][col] : null;
    if (!this.isPiece(target) || target.color !== this.getOpponent(pending.color)) {
      this.statusMessage = '请选择任意一枚敌方棋子';
      return false;
    }

    pending.targetRow = row;
    pending.targetCol = col;
    pending.targetId = target.id || null;
    this.nightmareDirectionButtons = this.buildDirectionButtons(row, col);
    this.statusMessage = '请选择梦魇推进方向';
    return true;
  }

  bindPendingNightmareDirection(dir) {
    this.markUndoSnapshot();
    const pending = this.pendingNightmarePlacement;
    if (!pending) return false;

    let row = pending.targetRow;
    let col = pending.targetCol;
    let target = row != null && col != null && this.isInside(row, col) ? this.board[row][col] : null;

    if ((!this.isPiece(target) || target.color !== this.getOpponent(pending.color)) && pending.targetId) {
      const found = this.findPiecePositionById(pending.targetId);
      if (found && this.isPiece(found.cell) && found.cell.color === this.getOpponent(pending.color)) {
        row = found.row;
        col = found.col;
        target = found.cell;
      }
    }

    if (!this.isPiece(target) || target.color !== this.getOpponent(pending.color)) {
      this.clearPendingNightmarePlacement();
      this.statusMessage = '目标棋子已不存在';
      return false;
    }

    const source = this.findPiecePositionById(pending.pieceId);
    if (!source || !this.isPiece(source.cell) || source.cell.color !== pending.color) {
      this.clearPendingNightmarePlacement();
      this.statusMessage = '梦魇子已不存在';
      return false;
    }

    this.board[row][col] = createPiece(target.color, target.type, target.dir, target.id, {
      ...target,
      nightmareDir: dir,
      nightmareActive: true,
      nightmareOwnerColor: pending.color,
      nightmareSourceId: pending.pieceId
    });

    this.normalizePieceAt(source.row, source.col);
    this.clearPendingNightmarePlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
    this.previousBoardKey = this.getBoardKey(this.board);

    const turnStartInfo = this.resolveTurnStartSpecials(this.currentPlayer);
    if (this.isFogActiveForPlayer(this.getOpponent(this.currentPlayer))) {
      this.clearFog();
    }

    if (turnStartInfo.nightmareInfo && turnStartInfo.nightmareInfo.movedCount > 0) {
      this.statusMessage = `梦魇已附身并开始推进，同时本回合已有 ${turnStartInfo.nightmareInfo.movedCount} 枚梦魇目标移动`;
    } else {
      this.statusMessage = `梦魇已附身：目标将沿${dir === 'U' ? '上' : dir === 'D' ? '下' : dir === 'L' ? '左' : '右'}方向每回合移动一格，直到受阻`;
    }

    return true;
  }

  resolveNightmareMoves() {
    let movedCount = 0;
    let stoppedCount = 0;
    const queue = [];

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (!this.isPiece(cell) || !cell.nightmareActive || !cell.nightmareDir) continue;
        queue.push({ row, col, id: cell.id });
      }
    }

    for (const item of queue) {
      const live = this.board[item.row] ? this.board[item.row][item.col] : null;
      if (!this.isPiece(live) || live.id !== item.id || !live.nightmareActive || !live.nightmareDir) continue;

      const move = this.DIRS[live.nightmareDir];
      if (!move) {
        this.board[item.row][item.col] = createPiece(live.color, live.type, live.dir, live.id, {
          ...live,
          nightmareActive: false,
          nightmareDir: null,
          nightmareOwnerColor: undefined,
          nightmareSourceId: undefined
        });
        stoppedCount += 1;
        continue;
      }

      const nr = item.row + move.dr;
      const nc = item.col + move.dc;
      if (!this.isPlayablePoint(nr, nc) || this.board[nr][nc] !== EMPTY) {
        this.board[item.row][item.col] = createPiece(live.color, live.type, live.dir, live.id, {
          ...live,
          nightmareActive: false,
          nightmareDir: null,
          nightmareOwnerColor: undefined,
          nightmareSourceId: undefined
        });
        stoppedCount += 1;
        continue;
      }

      this.board[nr][nc] = createPiece(live.color, live.type, live.dir, live.id, {
        ...live,
        nightmareActive: true,
        nightmareDir: live.nightmareDir
      });
      this.board[item.row][item.col] = EMPTY;
      movedCount += 1;
    }

    this.previousBoardKey = this.getBoardKey(this.board);
    return { movedCount, stoppedCount };
  }

  getRelocateAreaAnchor(row, col) {
    if (!this.isInside(row, col)) return null;
    return {
      row: Math.max(0, Math.min(row, BOARD_ROWS - 2)),
      col: Math.max(0, Math.min(col, BOARD_COLS - 2))
    };
  }

  buildRelocateAreaCells(anchor) {
    if (!anchor) return [];
    const cells = [];
    for (let dr = 0; dr < 2; dr++) {
      for (let dc = 0; dc < 2; dc++) {
        const row = anchor.row + dr;
        const col = anchor.col + dc;
        if (!this.isInside(row, col)) return [];
        cells.push({ row, col });
      }
    }
    return cells;
  }

  isSameRelocateArea(a, b) {
    return !!a && !!b && a.row === b.row && a.col === b.col;
  }

  doRelocateAreasOverlap(a, b) {
    if (!a || !b) return false;
    return !(a.row + 1 < b.row || b.row + 1 < a.row || a.col + 1 < b.col || b.col + 1 < a.col);
  }

  startRelocateSelection() {
    if (!this.hasAvailableCard('relocate')) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = '这张卡已经用掉了';
      return false;
    }

    this.pendingRelocatePlacement = {
      stage: 'first_select',
      firstArea: null,
      secondArea: null,
      firstConfirmBtn: null,
      secondConfirmBtn: null
    };
    this.nextPieceType = 'relocate';
    this.statusMessage = '请选择第 1 块 2x2 区域，点右上角绿箭头确认';
    return true;
  }

  selectRelocateArea(row, col) {
    const pending = this.pendingRelocatePlacement;
    if (!pending) return false;

    const anchor = this.getRelocateAreaAnchor(row, col);
    const cells = this.buildRelocateAreaCells(anchor);
    if (cells.length !== 4) {
      this.statusMessage = '该位置无法形成 2x2 区域';
      return false;
    }

    if (pending.stage === 'first_select') {
      pending.firstArea = anchor;
      pending.firstConfirmBtn = null;
      this.statusMessage = '已预览第 1 块 2x2 区域，点击绿箭头确认';
      return true;
    }

    if (pending.stage === 'second_select') {
      if (this.isSameRelocateArea(anchor, pending.firstArea)) {
        this.statusMessage = '第二块区域不能与第一块相同';
        return false;
      }
      if (this.doRelocateAreasOverlap(anchor, pending.firstArea)) {
        this.statusMessage = '两块 2x2 区域不能重叠';
        return false;
      }
      pending.secondArea = anchor;
      pending.secondConfirmBtn = null;
      this.statusMessage = '已预览第 2 块 2x2 区域，点击绿箭头确认互换';
      return true;
    }

    return false;
  }

  confirmRelocateArea(which = 'first') {
    const pending = this.pendingRelocatePlacement;
    if (!pending) return false;

    if (which === 'first') {
      if (!pending.firstArea) {
        this.statusMessage = '请先框选第一块 2x2 区域';
        return false;
      }
      pending.stage = 'second_select';
      this.statusMessage = '第一块区域已确认，请选择第 2 块 2x2 区域';
      return true;
    }

    if (!pending.firstArea || !pending.secondArea) {
      this.statusMessage = '请先框选第二块 2x2 区域';
      return false;
    }

    return this.commitRelocateAreas(pending.firstArea, pending.secondArea);
  }

  commitRelocateAreas(firstArea, secondArea) {
    this.markUndoSnapshot();
    const firstCells = this.buildRelocateAreaCells(firstArea);
    const secondCells = this.buildRelocateAreaCells(secondArea);
    if (firstCells.length !== 4 || secondCells.length !== 4) {
      this.statusMessage = '挪移区域无效';
      return false;
    }
    if (this.doRelocateAreasOverlap(firstArea, secondArea)) {
      this.statusMessage = '两块 2x2 区域不能重叠';
      return false;
    }

    const temp = firstCells.map(({ row, col }) => this.board[row][col] === EMPTY ? EMPTY : (this.board[row][col] === INVALID || this.board[row][col] === DESTROYED ? this.board[row][col] : { ...this.board[row][col] }));
    for (let i = 0; i < 4; i++) {
      const a = firstCells[i];
      const b = secondCells[i];
      const srcB = this.board[b.row][b.col];
      this.board[a.row][a.col] = srcB === EMPTY ? EMPTY : (srcB === INVALID || srcB === DESTROYED ? srcB : { ...srcB });
    }
    for (let i = 0; i < 4; i++) {
      const b = secondCells[i];
      const srcA = temp[i];
      this.board[b.row][b.col] = srcA === EMPTY ? EMPTY : (srcA === INVALID || srcA === DESTROYED ? srcA : { ...srcA });
    }

    this.resolveRelocateBoardState();
    this.consumeCard('relocate');
    this.clearPendingRelocatePlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';

    const wonByCapture = this.checkVictoryAfterCapture(this.currentPlayer) || this.checkVictoryAfterCapture(this.getOpponent(this.currentPlayer));

    if (!wonByCapture) {
      this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
    }

    const turnStartInfo = wonByCapture
      ? { persuadedCount: 0, vanishedCount: 0, archerShotCount: 0, archerKillCount: 0, archerDisabledCount: 0, plagueInfo: { infectedCount: 0, deathCount: 0, recoverCount: 0, vanishedCount: 0 }, teleportInfo: { movedCount: 0, failedCount: 0, finishedCount: 0 } }
      : this.resolveTurnStartSpecials(this.currentPlayer);

    if (this.isFogActiveForPlayer(this.getOpponent(this.currentPlayer))) {
      this.clearFog();
    }

    if (wonByCapture) {
      return true;
    }

    if (turnStartInfo.teleportInfo && turnStartInfo.teleportInfo.failedCount > 0) {
      this.statusMessage = `挪移完成，同时有 ${turnStartInfo.teleportInfo.failedCount} 枚瞬移子受阻失效`;
    } else if (turnStartInfo.teleportInfo && turnStartInfo.teleportInfo.movedCount > 0) {
      this.statusMessage = `挪移完成，同时有 ${turnStartInfo.teleportInfo.movedCount} 枚瞬移子完成跳跃`;
    } else if (turnStartInfo.plagueInfo && (turnStartInfo.plagueInfo.deathCount > 0 || turnStartInfo.plagueInfo.recoverCount > 0)) {
      this.statusMessage = `挪移完成；瘟疫结算：病死 ${turnStartInfo.plagueInfo.deathCount} 枚，康复 ${turnStartInfo.plagueInfo.recoverCount} 枚`;
    } else if (turnStartInfo.archerDisabledCount > 0) {
      this.statusMessage = `挪移完成，同时有 ${turnStartInfo.archerDisabledCount} 枚弓箭手被敌子贴身，失去射箭能力`;
    } else if (turnStartInfo.archerShotCount > 0) {
      this.statusMessage = turnStartInfo.archerKillCount > 0
        ? `挪移完成，同时弓箭手放箭击杀 ${turnStartInfo.archerKillCount} 枚`
        : '挪移完成，同时弓箭手放箭但前方没有目标';
    } else {
      this.statusMessage = '挪移完成：两个 2x2 区域已互换';
    }

    return true;
  }

  isInstantResolvedPieceType(type) {
    return type === 'gravity' || type === 'repulsion' || type === 'reverse' || type === 'auspice' || type === 'symphony';
  }

  normalizeResolvedInstantPieces() {
    let changed = false;
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (!this.isPiece(cell) || !this.isInstantResolvedPieceType(cell.type)) continue;
        this.normalizePieceAt(row, col);
        changed = true;
      }
    }
    return changed;
  }

  resolveRelocateBoardState() {
    let loopGuard = 0;
    while (loopGuard < 24) {
      loopGuard += 1;
      let changed = false;

      if (this.normalizeResolvedInstantPieces()) {
        changed = true;
      }

      for (let row = 0; row < BOARD_ROWS; row++) {
        for (let col = 0; col < BOARD_COLS; col++) {
          const cell = this.board[row][col];
          if (!this.isYinYangPiece(cell)) continue;
          const targetColor = this.resolveYinYangTransformTarget(this.board, row, col);
          if (!targetColor) continue;
          this.board[row][col] = createPiece(targetColor, 'normal', null, cell.id);
          changed = true;
        }
      }

      const vanished = this.resolveDeadGroupsAfterGravity(null, true);
      if (vanished > 0) changed = true;
      if (!changed) break;
    }

    this.previousBoardKey = this.getBoardKey(this.board);
    this.lastMove = null;
    this.lastCaptured = [];
  }

  hasAdjacentEnemy(row, col, player) {
    const neighbors = this.getNeighborsForBoard(this.board, row, col);
    for (const [nr, nc] of neighbors) {
      const cell = this.board[nr][nc];
      if (this.isPiece(cell) && cell.color !== player) return true;
    }
    return false;
  }

  isSingletonEnemyAt(row, col, player) {
    if (!this.isPlayablePoint(row, col)) return false;
    const cell = this.board[row][col];
    if (!this.isPiece(cell) || cell.color === player) return false;

    const neighbors = this.getNeighborsForBoard(this.board, row, col);
    for (const [nr, nc] of neighbors) {
      const other = this.board[nr][nc];
      if (this.isPiece(other) && other.color === cell.color) return false;
    }
    return true;
  }

  hasAdjacentSingletonEnemy(row, col, player) {
    const neighbors = this.getNeighborsForBoard(this.board, row, col);
    for (const [nr, nc] of neighbors) {
      if (this.isSingletonEnemyAt(nr, nc, player)) return true;
    }
    return false;
  }

  hasFourAdjacentAllies(row, col, player) {
    const neighbors = this.getNeighborsForBoard(this.board, row, col);
    if (neighbors.length !== 4) return false;

    for (const [nr, nc] of neighbors) {
      const cell = this.board[nr][nc];
      if (!this.isPiece(cell) || cell.color !== player) return false;
    }
    return true;
  }

  hasAnyEnemyPiece(player) {
    const enemy = this.getOpponent(player);
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (this.isPiece(cell) && cell.color === enemy) return true;
      }
    }
    return false;
  }

  hasAdjacentAlly(row, col, player) {
    const neighbors = this.getNeighborsForBoard(this.board, row, col);
    for (const [nr, nc] of neighbors) {
      const cell = this.board[nr][nc];
      if (this.isPiece(cell) && cell.color === player) return true;
    }
    return false;
  }

  startSacrificePlacement(row, col) {
    if (!this.isPlayablePoint(row, col)) return;

    if (!this.hasAvailableCard('sacrifice')) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = '这张卡已经用掉了';
      return;
    }

    if (this.board[row][col] !== EMPTY) {
      this.statusMessage = '此处已有棋子';
      return;
    }

    if (!this.hasFourAdjacentAllies(row, col, this.currentPlayer)) {
      this.statusMessage = '献祭只能下在上下左右都是自己棋子的地方';
      return;
    }

    if (!this.hasAnyEnemyPiece(this.currentPlayer)) {
      this.statusMessage = '场上没有敌方棋子，无法发动献祭';
      return;
    }

    const pieceId = this.allocPieceId();
    this.board[row][col] = createPiece(this.currentPlayer, 'sacrifice', null, pieceId, {
      sacrificePending: true
    });

    const doomed = this.getNeighborsForBoard(this.board, row, col);
    for (const [r, c] of doomed) {
      this.resolvePieceRemovalAt(r, c, {
        reason: 'special',
        allowRebirth: false,
        scoreForColor: null
      });
    }

    this.consumeCard('sacrifice');
    this.pendingSacrificePlacement = {
      row,
      col,
      color: this.currentPlayer,
      pieceId
    };
    this.nextPieceType = 'sacrifice';
    this.lastMove = { row, col };
    this.lastCaptured = [];
    this.previousBoardKey = this.getBoardKey(this.board);
    const sacrificeTrapHit = this.resolveTrapLandingAt(row, col, { message: '献祭子误踏陷阱：本回合结束' });
    if (sacrificeTrapHit.triggered) {
      this.clearPendingSacrificePlacement();
      this.finalizeManualTurn(sacrificeTrapHit.message, { trigger: 'commit', piece: { type: 'sacrifice', color: this.currentPlayer } });
      return;
    }
    this.statusMessage = '献祭已发动：己方中心与四邻同归于尽，请指定任意一枚敌子提掉';
  }

  bindPendingSacrificeToTarget(row, col) {
    const pending = this.pendingSacrificePlacement;
    if (!pending) return false;

    const target = this.isPlayablePoint(row, col) ? this.board[row][col] : null;
    if (!this.isPiece(target) || target.color !== this.getOpponent(pending.color)) {
      this.statusMessage = '请选择局面中的任意一枚敌方棋子';
      return false;
    }

    const source = this.findPiecePositionById(pending.pieceId);
    if (!source || !this.isPiece(source.cell) || source.cell.color !== pending.color) {
      this.clearPendingSacrificePlacement();
      this.statusMessage = '献祭子已不存在';
      return false;
    }

    const out = this.resolvePieceRemovalAt(row, col, {
      reason: 'special',
      allowRebirth: true,
      scoreForColor: pending.color
    });

    this.resolvePieceRemovalAt(source.row, source.col, {
      reason: 'special',
      allowRebirth: false,
      scoreForColor: null
    });

    this.clearPendingSacrificePlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    const wonByCapture = this.checkVictoryAfterCapture(pending.color);

    if (!wonByCapture) {
      this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
    }
    this.previousBoardKey = this.getBoardKey(this.board);

    const turnStartInfo = wonByCapture
      ? { persuadedCount: 0, vanishedCount: 0, archerShotCount: 0, archerKillCount: 0, archerDisabledCount: 0, plagueInfo: { infectedCount: 0, deathCount: 0, recoverCount: 0, vanishedCount: 0 }, teleportInfo: { movedCount: 0, failedCount: 0, finishedCount: 0 } }
      : this.resolveTurnStartSpecials(this.currentPlayer);
    if (this.isFogActiveForPlayer(this.getOpponent(this.currentPlayer))) {
      this.clearFog();
    }

    if (wonByCapture) {
      return true;
    }

    if (out && out.reborn) {
      this.statusMessage = '献祭完成：已指定敌子，但对方触发重生';
    } else if (turnStartInfo.archerDisabledCount > 0) {
      this.statusMessage = `献祭完成，同时有 ${turnStartInfo.archerDisabledCount} 枚弓箭手被敌子贴身，失去射箭能力`;
    } else if (turnStartInfo.archerShotCount > 0) {
      this.statusMessage = turnStartInfo.archerKillCount > 0
        ? `献祭完成，同时弓箭手放箭击杀 ${turnStartInfo.archerKillCount} 枚`
        : '献祭完成，同时弓箭手放箭但前方没有目标';
    } else {
      this.statusMessage = '献祭完成：己方五枚已灭，额外提掉 1 枚敌子';
    }

    this.handleTutorialPostAction('sacrifice', { type: 'sacrifice' });
    return true;
  }

  bindPendingPersuaderToTarget(row, col) {
    const pending = this.pendingPersuaderPlacement;
    if (!pending) return false;

    const source = this.findPiecePositionById(pending.pieceId);
    if (!source || !this.isPiece(source.cell) || source.cell.color !== pending.color) {
      this.clearPendingPersuaderPlacement();
      this.statusMessage = '说客已不存在';
      return false;
    }

    const isAdjacent = Math.abs(source.row - row) + Math.abs(source.col - col) === 1;
    const target = this.isPlayablePoint(row, col) ? this.board[row][col] : null;

    if (!isAdjacent || !this.isPiece(target) || target.color !== this.getOpponent(pending.color)) {
      this.statusMessage = '请选择说客上下左右相邻的一枚敌子';
      return false;
    }

    if (!this.isSingletonEnemyAt(row, col, pending.color)) {
      this.statusMessage = '说客只能染色落单的敌子';
      return false;
    }

    const preservedTarget = { ...target };
    delete preservedTarget.color;
    delete preservedTarget.type;
    delete preservedTarget.dir;
    delete preservedTarget.id;
    this.board[row][col] = createPiece(pending.color, target.type, target.dir, target.id, preservedTarget);
    if (pending.color === BLACK) this.captureCounts.black += 1;
    else if (pending.color === WHITE) this.captureCounts.white += 1;
    this.normalizePieceAt(source.row, source.col);

    const vanishedCount = this.resolveDeadGroupsAfterGravity(null, true);
    this.clearPendingPersuaderPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
    this.previousBoardKey = this.getBoardKey(this.board);

    if (this.isFogActiveForPlayer(this.getOpponent(this.currentPlayer))) {
      this.clearFog();
    }

    this.statusMessage = vanishedCount > 0
      ? `说客生效，转化 1 枚，消失 ${vanishedCount} 枚`
      : '说客生效，转化 1 枚';
    this.handleTutorialPostAction('persuader', { type: 'persuader' });
    return true;
  }

  cancelPendingRebirthPlacement() {
    const pending = this.pendingRebirthPlacement;
    if (!pending) return false;

    this.removePieceById(pending.pieceId);
    this.refundCard('rebirth');
    this.clearPendingRebirthPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.previousBoardKey = this.getBoardKey(this.board);
    this.lastMove = null;
    this.lastCaptured = [];
    this.statusMessage = '已取消重生落子';
    return true;
  }

  bindPendingRebirthToTarget(row, col) {
    const pending = this.pendingRebirthPlacement;
    if (!pending) return false;

    if (!this.isPlayablePoint(row, col)) {
      this.statusMessage = '请选择一个可重生的位置';
      return false;
    }

    if (this.board[row][col] !== EMPTY) {
      this.statusMessage = '重生点必须为空位';
      return false;
    }

    const found = this.findPiecePositionById(pending.pieceId);
    if (!found) {
      this.clearPendingRebirthPlacement();
      this.statusMessage = '重生子已不存在';
      return false;
    }

    this.board[found.row][found.col] = createPiece(
      found.cell.color,
      found.cell.type,
      found.cell.dir,
      found.cell.id,
      {
        rebirthTarget: { row, col },
        rebirthReady: true
      }
    );

    this.normalizePieceAt(found.row, found.col, {
      rebirthTarget: { row, col },
      rebirthReady: true
    });

    this.clearPendingRebirthPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
    this.previousBoardKey = this.getBoardKey(this.board);
    const turnStartInfo = this.resolveTurnStartSpecials(this.currentPlayer);
    if (this.isFogActiveForPlayer(this.getOpponent(this.currentPlayer))) {
      this.clearFog();
    }
    this.statusMessage = turnStartInfo.persuadedCount > 0
      ? `重生点已绑定，同时说客转化 ${turnStartInfo.persuadedCount} 枚`
      : `重生点已绑定：(${row + 1}, ${col + 1})`;
    this.handleTutorialPostAction('rebirth', { type: 'rebirth' });
    return true;
  }

  activateFog(row, col, ownerColor) {
    this.fogState = {
      row,
      col,
      ownerColor,
      affectedPlayer: this.getOpponent(ownerColor),
      radius: 2,
      active: true
    };
  }

  clearFog() {
    this.fogState = null;
  }

  isFogActiveForPlayer(player = this.currentPlayer) {
    return !!(this.fogState && this.fogState.active && this.fogState.affectedPlayer === player);
  }

  isPointInsideFog(row, col) {
    if (!this.fogState || !this.fogState.active) return false;
    return Math.abs(row - this.fogState.row) <= this.fogState.radius && Math.abs(col - this.fogState.col) <= this.fogState.radius;
  }

  handleFogOccupiedAttempt(row, col) {
    if (!this.isFogActiveForPlayer(this.currentPlayer)) return false;
    if (!this.isPointInsideFog(row, col)) return false;
    if (!this.isPiece(this.board[row][col])) return false;

    this.lastMove = { row, col };
    this.lastCaptured = [];
    this.statusMessage = '迷雾中误落在已有棋子上：本回合作废';
    this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.previousBoardKey = this.getBoardKey(this.board);
    this.clearFog();
    this.handleTutorialPostAction('fog-occupied');
    return true;
  }

  bindPendingFogToTarget(row, col) {
    const pending = this.pendingFogPlacement;
    if (!pending) return false;

    if (!this.isPlayablePoint(row, col)) {
      this.statusMessage = '请选择棋盘上的一个点投掷烟雾弹';
      return false;
    }

    const source = this.findPiecePositionById(pending.pieceId);
    if (!source || !this.isPiece(source.cell) || source.cell.color !== pending.color) {
      this.clearPendingFogPlacement();
      this.statusMessage = '迷雾子已不存在';
      return false;
    }

    this.activateFog(row, col, pending.color);
    this.normalizePieceAt(source.row, source.col);
    this.clearPendingFogPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
    this.previousBoardKey = this.getBoardKey(this.board);

    this.statusMessage = `烟雾弹已投出：以（${row + 1}, ${col + 1}）为中心覆盖 5x5`;
    this.handleTutorialPostAction('fog', { type: 'fog', fogCenter: { row, col } });
    return true;
  }

  bindPendingContractToTarget(row, col) {
    const pending = this.pendingContractPlacement;
    if (!pending) return false;

    const target = this.board[row][col];
    if (!this.isPiece(target) || target.color !== this.getOpponent(pending.color)) {
      this.statusMessage = '请选择一个对方棋子作为契约对象';
      return false;
    }

    this.contractLinks = this.contractLinks.filter((link) =>
      link.contractId !== pending.contractId &&
      link.targetId !== pending.contractId &&
      link.contractId !== target.id &&
      link.targetId !== target.id
    );

    this.contractLinks.push({
      contractId: pending.contractId,
      targetId: target.id,
      remaining: this.contractDuration
    });

    if (this.isPiece(this.board[pending.row][pending.col])) {
      this.normalizePieceAt(pending.row, pending.col);
    }

    this.clearPendingContractPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
    const turnStartInfo = this.resolveTurnStartSpecials(this.currentPlayer);
    if (this.isFogActiveForPlayer(this.getOpponent(this.currentPlayer))) {
      this.clearFog();
    }
    this.statusMessage = turnStartInfo.persuadedCount > 0
      ? `契约已生效，同时说客转化 ${turnStartInfo.persuadedCount} 枚`
      : `契约已生效：${this.contractDuration}回合内同生共死`;
    this.handleTutorialPostAction('contract', { type: 'contract' });
    return true;
  }

  resolveContracts(stepCountdown = false) {
    let changed = false;
    let chainKillCount = 0;

    let stable = false;
    while (!stable) {
      stable = true;
      const survivors = [];

      for (const link of this.contractLinks) {
        const contractPos = this.findPiecePositionById(link.contractId);
        const targetPos = this.findPiecePositionById(link.targetId);

        if (!contractPos && !targetPos) {
          changed = true;
          stable = false;
          continue;
        }

        if (!contractPos || !targetPos) {
          const survivorId = contractPos ? link.contractId : link.targetId;
          if (this.removePieceById(survivorId, {
            reason: 'special',
            allowRebirth: true,
            scoreByVictimOpposition: true
          })) {
            chainKillCount += 1;
          }
          changed = true;
          stable = false;
          continue;
        }

        survivors.push(link);
      }

      this.contractLinks = survivors;
    }

    if (stepCountdown && this.contractLinks.length > 0) {
      const nextLinks = [];
      for (const link of this.contractLinks) {
        const contractPos = this.findPiecePositionById(link.contractId);
        const targetPos = this.findPiecePositionById(link.targetId);
        if (!contractPos || !targetPos) continue;

        const remaining = link.remaining - 1;
        if (remaining <= 0) {
          const piece = this.board[contractPos.row][contractPos.col];
          if (this.isPiece(piece)) {
            this.board[contractPos.row][contractPos.col] = createPiece(piece.color, 'normal', null, piece.id);
          }
          changed = true;
          continue;
        }

        nextLinks.push({ ...link, remaining });
      }
      this.contractLinks = nextLinks;
    }

    if (changed) {
      this.previousBoardKey = this.getBoardKey(this.board);
    }

    return { changed, chainKillCount, expiredCount: 0 };
  }

  commitPlacement(row, col, piece, result, options = {}) {
    this.markUndoSnapshot();
    const endTurn = options.endTurn !== false;
    const advanceContracts = options.advanceContracts !== false;

    this.board = result.board;
    this.previousBoardKey = result.beforeBoardKey;
    this.lastMove = { row, col };
    this.lastCaptured = result.captured || [];
    const gainedCaptures = this.updateCaptureCounts(result, piece.color);
    GameGlobal.musicManager.playDropStone();

    const pieceDef = getPieceDef(this.pieceMap, piece.type);
    if (pieceDef.selectable) {
      this.consumeCard(piece.type);
    }

    this.armPlacedPiece(row, col, piece);

    const trapHit = this.resolveTrapLandingAt(row, col);
    if (trapHit.triggered) {
      const trapWonByCapture = this.checkVictoryAfterCapture(BLACK) || this.checkVictoryAfterCapture(WHITE);
      if (endTurn && !trapWonByCapture) {
        if (this.isTurnPressureActiveForPlayer(this.currentPlayer)) {
          this.clearTurnPressure(true);
        }
        this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
      }
      this.statusMessage = trapHit.message;
      return true;
    }

    const gravityInfo = piece.type === 'gravity'
      ? this.applyGravityEffect(row, col)
      : { movedCount: 0, vanishedCount: 0 };
    const repulsionInfo = piece.type === 'repulsion'
      ? this.applyRepulsionEffect(row, col)
      : { movedCount: 0, vanishedCount: 0 };
    const reverseInfo = piece.type === 'reverse'
      ? this.applyReverseEffect(row, col)
      : { flippedCount: 0, vanishedCount: 0 };
    const symphonyInfo = piece.type === 'symphony'
      ? this.applySymphonyEffect(row, col)
      : { horizontalTriggered: false, verticalTriggered: false, killedCount: 0, vanishedCount: 0 };
    const plagueInfectedCount = piece.type === 'plague'
      ? this.infectConnectedBlocksFrom(row, col, piece.color)
      : 0;
    const auspiceInfo = piece.type === 'auspice'
      ? this.resolveAuspiceDispels()
      : { plagueCleared: 0, nightmareCleared: 0, trapCleared: 0, totalCleared: 0 };

    if (piece.type === 'time_limit') {
      this.armTurnPressure(this.getOpponent(piece.color), 10, piece.color);
    }

    if (piece.type === 'gravity' || piece.type === 'repulsion' || piece.type === 'reverse' || piece.type === 'auspice') {
      this.normalizePieceAt(row, col);
    }
    if (piece.type === 'clone') {
      this.normalizePieceAt(row, col);
      this.armCloneForNextTurn(piece.color);
    }

    const advancedInfo = this.advanceSpecialPieces({
      skipNewlyPlacedType: piece.type,
      skipNewlyPlacedKey: `${row},${col}`
    });
    const mountainInfo = { createdCellsCount: Number((advancedInfo && advancedInfo.totalRaisedCells) || 0) };

    const contractInfo = this.resolveContracts(advanceContracts);

    const stabilizeOut = this.stabilizeBoardState(this.board);
    if (stabilizeOut.changed) {
      const extraRemoved = stabilizeOut.removed || [];
      const extraCounted = stabilizeOut.counted || [];
      if (extraRemoved.length > 0) {
        this.lastCaptured = (this.lastCaptured || []).concat(extraRemoved);
      }
      if (extraCounted.length > 0 && (piece.color === BLACK || piece.color === WHITE)) {
        const bonus = this.updateCaptureCounts({ captured: extraRemoved, scoreCaptured: extraCounted, reborn: extraRemoved.length - extraCounted.length }, piece.color);
      }
      this.previousBoardKey = this.getBoardKey(this.board);
    }

    const wonByCapture = this.checkVictoryAfterCapture(piece.color);
    const cloneTurnOut = (endTurn && !wonByCapture)
      ? (piece.type === 'clone'
          ? { consumed: true, keepTurn: true, remainingMoves: 2 }
          : this.handleClonePlacementAfterCommit(row, col))
      : { consumed: false, keepTurn: false, remainingMoves: 0 };

    if (endTurn && !wonByCapture && !cloneTurnOut.keepTurn) {
      if (this.isTurnPressureActiveForPlayer(this.currentPlayer)) {
        this.clearTurnPressure(true);
      }
      this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
    }

    const turnStartInfo = (wonByCapture || cloneTurnOut.keepTurn)
      ? {
          persuadedCount: 0,
          vanishedCount: 0,
          archerShotCount: 0,
          archerKillCount: 0,
          archerDisabledCount: 0,
          plagueInfo: { infectedCount: 0, deathCount: 0, recoverCount: 0, vanishedCount: 0 },
          teleportInfo: { movedCount: 0, failedCount: 0, finishedCount: 0 },
          nightmareInfo: { movedCount: 0, vanishedCount: 0 },
          cloneExpiredInfo: { removedCount: 0 },
          cloneActivationInfo: { activated: false, movesRemaining: 0 }
        }
      : this.resolveTurnStartSpecials(this.currentPlayer);

    if (cloneTurnOut.keepTurn) {
      this.statusMessage = `克隆生效：已落下 1 个克隆子，还可再落 ${cloneTurnOut.remainingMoves} 子`;
    } else if (piece.type === 'rebirth' && !endTurn) {
      this.statusMessage = '请选择一个空位作为重生点';
    } else if (piece.type === 'archer') {
      this.statusMessage = '弓箭手已架弓，下一次轮到你时将朝指定方向射箭';
    } else if (contractInfo.chainKillCount > 0) {
      this.statusMessage = `契约触发，同归于尽 ${contractInfo.chainKillCount} 枚`;
    } else if (turnStartInfo.plagueInfo && (turnStartInfo.plagueInfo.deathCount > 0 || turnStartInfo.plagueInfo.recoverCount > 0)) {
      this.statusMessage = `瘟疫结算：病死 ${turnStartInfo.plagueInfo.deathCount} 枚，康复 ${turnStartInfo.plagueInfo.recoverCount} 枚`;
    } else if (turnStartInfo.archerDisabledCount > 0) {
      this.statusMessage = `有 ${turnStartInfo.archerDisabledCount} 枚弓箭手被敌子贴身，失去射箭能力`;
    } else if (turnStartInfo.archerShotCount > 0) {
      this.statusMessage = turnStartInfo.archerKillCount > 0
        ? `弓箭手放箭，击杀 ${turnStartInfo.archerKillCount} 枚`
        : '弓箭手放箭，但前方没有目标';
    } else if (turnStartInfo.persuadedCount > 0 || turnStartInfo.vanishedCount > 0) {
      this.statusMessage = `说客发动，转化 ${turnStartInfo.persuadedCount} 枚${turnStartInfo.vanishedCount > 0 ? `，消失 ${turnStartInfo.vanishedCount} 枚` : ''}`;
    } else if (turnStartInfo.teleportInfo && turnStartInfo.teleportInfo.failedCount > 0) {
      this.statusMessage = `瞬移受阻，失效 ${turnStartInfo.teleportInfo.failedCount} 枚`;
    } else if (turnStartInfo.teleportInfo && turnStartInfo.teleportInfo.movedCount > 0) {
      this.statusMessage = `瞬移发动，移动 ${turnStartInfo.teleportInfo.movedCount} 枚`;
    } else if (piece.type === 'clone') {
      this.statusMessage = '克隆生效：请立刻连续落 2 个普通子；这两个克隆子会在对手落子后自动死亡';
    } else if (turnStartInfo.cloneExpiredInfo && turnStartInfo.cloneExpiredInfo.removedCount > 0) {
      this.statusMessage = `对手落子后，克隆出的 ${turnStartInfo.cloneExpiredInfo.removedCount} 子已自动死亡`;
    } else if (turnStartInfo.cloneActivationInfo && turnStartInfo.cloneActivationInfo.activated) {
      this.statusMessage = '克隆生效：本回合请连续落 2 个普通子';
    } else if (piece.type === 'plague') {
      this.statusMessage = plagueInfectedCount > 0
        ? `瘟疫扩散，感染 ${plagueInfectedCount} 枚棋子`
        : '瘟疫落下，但周围没有可感染的棋子块';
    } else if (piece.type === 'auspice') {
      this.statusMessage = auspiceInfo.totalCleared > 0
        ? `祥瑞降临，驱散瘟疫 ${auspiceInfo.plagueCleared} 枚、梦魇 ${auspiceInfo.nightmareCleared} 枚、陷阱 ${auspiceInfo.trapCleared} 处`
        : '祥瑞降临，但场上没有可驱散的瘟疫、梦魇或陷阱';
    } else if (piece.type === 'time_limit') {
      this.statusMessage = '限时生效：对手下一回合只有 10 秒可落子';
    } else if (piece.type === 'teleport') {
      this.statusMessage = '请选择第 1 个瞬移空位';
    } else if (piece.type === 'gravity') {
      if (gravityInfo.movedCount > 0 || gravityInfo.vanishedCount > 0) {
        this.statusMessage = `引力触发，拉动 ${gravityInfo.movedCount} 枚${gravityInfo.vanishedCount > 0 ? `，消失 ${gravityInfo.vanishedCount} 枚` : ''}`;
      } else {
        this.statusMessage = '引力触发，但没有棋子被拉动';
      }
    } else if (piece.type === 'repulsion') {
      if (repulsionInfo.movedCount > 0 || repulsionInfo.vanishedCount > 0) {
        this.statusMessage = `斥力触发，推出 ${repulsionInfo.movedCount} 枚${repulsionInfo.vanishedCount > 0 ? `，消失 ${repulsionInfo.vanishedCount} 枚` : ''}`;
      } else {
        this.statusMessage = '斥力触发，但没有棋子被推出';
      }
    } else if (piece.type === 'reverse') {
      if (reverseInfo.flippedCount > 0 || reverseInfo.vanishedCount > 0) {
        this.statusMessage = `逆转触发，翻转 ${reverseInfo.flippedCount} 枚${reverseInfo.vanishedCount > 0 ? `，消失 ${reverseInfo.vanishedCount} 枚` : ''}`;
      } else {
        this.statusMessage = '逆转触发，但周围没有可翻转的棋子';
      }
    } else if (piece.type === 'symphony') {
      const triggeredAxes = [];
      if (symphonyInfo.horizontalTriggered) triggeredAxes.push('横线');
      if (symphonyInfo.verticalTriggered) triggeredAxes.push('竖线');
      if (triggeredAxes.length > 0) {
        this.statusMessage = `交响触发：${triggeredAxes.join('＋')}同数清场，击杀 ${symphonyInfo.killedCount} 枚${symphonyInfo.vanishedCount > 0 ? `，消失 ${symphonyInfo.vanishedCount} 枚` : ''}`;
      } else {
        this.statusMessage = '交响未触发：横线与竖线黑白数量都不相等';
      }
    } else if (piece.type === 'mountain') {
      this.statusMessage = mountainInfo.createdCellsCount > 0
        ? `山地兵造地 ${mountainInfo.createdCellsCount} 格`
        : '山地兵发动，但前方没有可修补或扩展的空白';
    } else if (piece.type === 'persuader' && !endTurn) {
      this.statusMessage = '请选择说客上下左右相邻的一枚敌子';
    } else if (piece.type === 'fog' && !endTurn) {
      this.statusMessage = '请选择棋盘上的任意一点投掷烟雾弹';
    } else if (piece.type === 'fog') {
      this.statusMessage = '烟雾弹已投出：对手下一回合视野受限';
    } else if (gainedCaptures > 0) {
      this.statusMessage = `提子 ${gainedCaptures} 枚`;
    } else if (pieceDef.needsDirection) {
      this.statusMessage = `${pieceDef.name}已落子，方向 ${piece.dir}`;
    } else {
      this.statusMessage = '';
    }

    this.handleTutorialPostAction('commit', piece);
    return true;
  }

  clearPendingSelection() {
    this.pendingPlacement = null;
    this.directionButtons = null;
  }

  clearPendingConfirmPlacement() {
    this.pendingConfirmPlacement = null;
  }

  startConfirmPlacement(row, col, type = this.nextPieceType, color = this.currentPlayer) {
    if (type === 'swap_card') {
      this.clearPendingConfirmPlacement();
      this.startSwapCardSelection();
      return;
    }

    this.pendingConfirmPlacement = { row, col, type, color };
    const pieceDef = getPieceDef(this.pieceMap, type);
    this.statusMessage = `再次点击闪烁${pieceDef.name}确认落子，点其他有效位置可移动，点棋盘外取消`;
  }

  confirmPendingPlacement() {
    const pending = this.pendingConfirmPlacement;
    if (!pending) return false;

    const { row, col, type, color } = pending;
    this.clearPendingConfirmPlacement();

    if (type === 'contract') {
      this.startContractPlacement(row, col);
      return true;
    }

    if (type === 'rebirth') {
      this.startRebirthPlacement(row, col);
      return true;
    }

    if (type === 'persuader') {
      this.startPersuaderPlacement(row, col);
      return true;
    }

    if (type === 'sacrifice') {
      this.startSacrificePlacement(row, col);
      return true;
    }

    if (type === 'fog') {
      this.startFogPlacement(row, col);
      return true;
    }

    if (type === 'teleport') {
      this.startTeleportPlacement(row, col);
      return true;
    }

    if (type === 'trap') {
      this.startTrapPlacement(row, col);
      return true;
    }

    if (type === 'swap_card') {
      this.startSwapCardSelection();
      return true;
    }

    const selectedDef = getPieceDef(this.pieceMap, type);
    if (selectedDef.needsDirection) {
      this.startSpecialPlacement(row, col, type);
      return true;
    }

    return this.tryPlacePiece(row, col, {
      color,
      type,
      dir: null
    });
  }

  normalizePieceAt(row, col, extra = null) {
    const cell = this.board[row][col];
    if (!this.isPiece(cell)) return false;

    const preserved = { ...cell, ...(extra || {}) };
    delete preserved.color;
    delete preserved.type;
    delete preserved.dir;
    delete preserved.id;

    this.board[row][col] = createPiece(cell.color, 'normal', null, cell.id, preserved);
    return true;
  }

  armPlacedPiece(row, col, piece) {
    if (piece.type === 'archer') {
      const cell = this.board[row][col];
      if (!this.isPiece(cell)) return;
      this.board[row][col] = createPiece(cell.color, cell.type, cell.dir, cell.id, {
        archerCooldown: 1,
        archerReady: true
      });
      return;
    }

    if (piece.type === 'teleport') {
      const cell = this.board[row][col];
      if (!this.isPiece(cell)) return;
      this.board[row][col] = createPiece(cell.color, cell.type, cell.dir, cell.id, {
        teleportTargets: [],
        teleportStep: 0,
        teleportCooldown: 1,
        teleportReady: false
      });
      return;
    }

    if (piece.type !== 'persuader') return;
  }

  resolveArcherShot(row, col, cell) {
    const dirMove = this.DIRS[cell.dir];
    if (!dirMove) {
      this.normalizePieceAt(row, col);
      return { shot: false, killed: false, disabled: false, blockedByEnemy: false };
    }

    if (this.hasAdjacentEnemy(row, col, cell.color)) {
      this.normalizePieceAt(row, col);
      return { shot: false, killed: false, disabled: true, blockedByEnemy: true };
    }

    if ((cell.archerCooldown || 0) > 0) {
      const nextCooldown = Math.max(0, cell.archerCooldown - 1);
      if (nextCooldown > 0) {
        this.board[row][col] = createPiece(cell.color, cell.type, cell.dir, cell.id, {
          archerCooldown: nextCooldown,
          archerReady: true
        });
        return { shot: false, killed: false, disabled: false, blockedByEnemy: false };
      }
    }

    let target = null;
    let nr = row + dirMove.dr;
    let nc = col + dirMove.dc;
    while (this.isPlayablePoint(nr, nc)) {
      if (this.isPiece(this.board[nr][nc])) {
        target = { row: nr, col: nc };
        break;
      }
      nr += dirMove.dr;
      nc += dirMove.dc;
    }

    let killed = false;
    if (target) {
      const out = this.resolvePieceRemovalAt(target.row, target.col, {
        reason: 'special',
        allowRebirth: true,
        scoreByVictimOpposition: true
      });
      killed = !!out.removed;
    }

    this.normalizePieceAt(row, col);
    return { shot: true, killed, disabled: false, blockedByEnemy: false };
  }


  infectConnectedBlocksFrom(row, col, sourceColor) {
    const start = this.board[row] && this.board[row][col];
    if (!this.isPiece(start)) {
      this.previousBoardKey = this.getBoardKey(this.board);
      return 0;
    }

    const visited = new Set();
    const stack = [[row, col]];
    let infectedCount = 0;

    while (stack.length > 0) {
      const [cr, cc] = stack.pop();
      const key = `${cr},${cc}`;
      if (visited.has(key)) continue;
      visited.add(key);

      if (!this.isPlayablePoint(cr, cc)) continue;
      const live = this.board[cr][cc];
      if (!this.isPiece(live)) continue;

      if (!live.infected) infectedCount += 1;
      this.board[cr][cc] = createPiece(live.color, live.type, live.dir, live.id, {
        ...live,
        infected: true,
        infectionPendingTurns: 1,
        infectionSourceColor: sourceColor,
        infectionSeedId: live.id
      });

      const neighbors = this.getNeighborsForBoard(this.board, cr, cc);
      for (const [nr, nc] of neighbors) {
        if (visited.has(`${nr},${nc}`)) continue;
        const next = this.board[nr][nc];
        if (!this.isPiece(next)) continue;
        stack.push([nr, nc]);
      }
    }

    this.previousBoardKey = this.getBoardKey(this.board);
    return infectedCount;
  }

  resolvePlagueInfections() {
    let infectedCount = 0;
    let deathCount = 0;
    let recoverCount = 0;
    const toRemove = [];

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (!this.isPiece(cell) || !cell.infected) continue;
        infectedCount += 1;

        const pendingTurns = Math.max(0, Number(cell.infectionPendingTurns || 0));
        if (pendingTurns > 0) {
          this.board[row][col] = createPiece(cell.color, cell.type, cell.dir, cell.id, {
            ...cell,
            infectionPendingTurns: pendingTurns - 1
          });
          continue;
        }

        if (Math.random() < 0.1) {
          toRemove.push([row, col]);
        } else {
          this.board[row][col] = createPiece(cell.color, cell.type, cell.dir, cell.id, {
            ...cell,
            infected: false,
            infectionPendingTurns: undefined,
            infectionSourceColor: undefined,
            infectionSeedId: undefined
          });
          recoverCount += 1;
        }
      }
    }

    for (const [row, col] of toRemove) {
      const out = this.resolvePieceRemovalAt(row, col, {
        reason: 'special',
        allowRebirth: true,
        scoreByVictimOpposition: true
      });
      if (out.removed) deathCount += 1;
    }

    let vanishedCount = deathCount > 0 ? this.resolveDeadGroupsAfterGravity(null, true) : 0;
    const stabilizeOut = this.stabilizeBoardState(this.board);
    if (stabilizeOut.changed) {
      vanishedCount += (stabilizeOut.counted || []).length;
    }
    this.previousBoardKey = this.getBoardKey(this.board);
    this.lastPlagueResolution = { infectedCount, deathCount, recoverCount, vanishedCount };
    return this.lastPlagueResolution;
  }


  resolveAuspiceDispels() {
    let plagueCleared = 0;
    let nightmareCleared = 0;
    let trapCleared = 0;

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (!this.isPiece(cell)) continue;

        let changed = false;
        const extra = { ...cell };

        if (cell.infected) {
          plagueCleared += 1;
          changed = true;
          extra.infected = false;
          extra.infectionPendingTurns = undefined;
          extra.infectionSourceColor = undefined;
          extra.infectionSeedId = undefined;
        }

        if (cell.nightmareActive || cell.nightmareDir || cell.nightmareOwnerColor || cell.nightmareSourceId) {
          nightmareCleared += 1;
          changed = true;
          extra.nightmareActive = false;
          extra.nightmareDir = null;
          extra.nightmareOwnerColor = undefined;
          extra.nightmareSourceId = undefined;
        }

        if (changed) {
          this.board[row][col] = createPiece(cell.color, cell.type, cell.dir, cell.id, extra);
        }
      }
    }

    if (Array.isArray(this.trapState) && this.trapState.length > 0) {
      trapCleared = this.trapState.length;
      this.trapState = [];
    }

    if (plagueCleared > 0 || nightmareCleared > 0 || trapCleared > 0) {
      this.previousBoardKey = this.getBoardKey(this.board);
    }

    return {
      plagueCleared,
      nightmareCleared,
      trapCleared,
      totalCleared: plagueCleared + nightmareCleared + trapCleared
    };
  }

  resolveTurnStartSpecials(player) {
    let persuadedCount = 0;
    let archerShotCount = 0;
    let archerKillCount = 0;
    let archerDisabledCount = 0;
    const cloneExpiredInfo = this.removeExpiredCloneSpawns(player);
    const cloneActivationInfo = this.activateCloneTurnIfNeeded(player);
    const nightmareInfo = this.resolveNightmareMoves();
    const teleportInfo = this.resolveTeleportMoves();
    const plagueInfo = this.resolvePlagueInfections();

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const live = this.board[row][col];
        if (!this.isPiece(live) || live.color !== player) continue;

        if (live.type === 'archer' && live.archerReady) {
          const out = this.resolveArcherShot(row, col, live);
          if (out.shot) archerShotCount += 1;
          if (out.killed) archerKillCount += 1;
          if (out.disabled) archerDisabledCount += 1;
          continue;
        }

        if (false && live.type === 'persuader' && live.armed) {
          const neighbors = this.getNeighborsForBoard(this.board, row, col);
          for (const [nr, nc] of neighbors) {
            const target = this.board[nr][nc];
            if (!this.isPiece(target) || target.color === player) continue;
            this.board[nr][nc] = createPiece(player, target.type, target.dir, target.id, { ...target, color: undefined, type: undefined, dir: undefined, id: undefined });
            persuadedCount += 1;
          }
          this.normalizePieceAt(row, col, { armed: false });
        }
      }
    }

    let vanishedCount = this.resolveDeadGroupsAfterGravity(null, true);
    const stabilizeOut = this.stabilizeBoardState(this.board);
    if (stabilizeOut.changed) {
      vanishedCount += (stabilizeOut.counted || []).length;
    }
    this.previousBoardKey = this.getBoardKey(this.board);
    return { persuadedCount, vanishedCount, archerShotCount, archerKillCount, archerDisabledCount, plagueInfo, teleportInfo, nightmareInfo, cloneExpiredInfo, cloneActivationInfo };
  }


  resolveTeleportMoves() {
    let movedCount = 0;
    let failedCount = 0;
    let finishedCount = 0;
    const queue = [];

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (!this.isPiece(cell) || cell.type !== 'teleport') continue;
        if (!Array.isArray(cell.teleportTargets) || cell.teleportTargets.length === 0) continue;
        queue.push({ row, col, cell: { ...cell } });
      }
    }

    for (const item of queue) {
      const live = this.board[item.row][item.col];
      if (!this.isPiece(live) || live.type !== 'teleport' || live.id !== item.cell.id) continue;

      const targets = Array.isArray(live.teleportTargets) ? live.teleportTargets.filter(Boolean) : [];
      const step = Math.max(0, Number(live.teleportStep || 0));
      if (step >= targets.length) {
        this.normalizePieceAt(item.row, item.col);
        finishedCount += 1;
        continue;
      }

      const cooldown = Math.max(0, Number(live.teleportCooldown || 0));
      if (cooldown > 0) {
        this.board[item.row][item.col] = createPiece(live.color, live.type, live.dir, live.id, {
          ...live,
          teleportCooldown: cooldown - 1,
          teleportReady: cooldown - 1 <= 0
        });
        continue;
      }

      const target = targets[step];
      if (!target || !this.isPlayablePoint(target.row, target.col) || this.board[target.row][target.col] !== EMPTY) {
        this.normalizePieceAt(item.row, item.col);
        failedCount += 1;
        continue;
      }

      const nextStep = step + 1;
      const extra = {
        ...live,
        teleportStep: nextStep,
        teleportCooldown: 1,
        teleportReady: false
      };
      delete extra.color;
      delete extra.type;
      delete extra.dir;
      delete extra.id;

      this.board[target.row][target.col] = createPiece(live.color, live.type, live.dir, live.id, extra);
      this.board[item.row][item.col] = EMPTY;
      this.lastMove = { row: target.row, col: target.col };
      movedCount += 1;

      if (nextStep >= targets.length) {
        this.normalizePieceAt(target.row, target.col);
        finishedCount += 1;
      }
    }

    return { movedCount, failedCount, finishedCount };
  }

  isPointInBoardViewport(x, y) {
    const viewport = this.getBoardViewportRect();
    return x >= viewport.left && x <= viewport.right && y >= viewport.top && y <= viewport.bottom;
  }

  isPointInStaticUi(x, y) {
    const rects = [this.backBtn, this.scoreRequestBtn, this.undoRequestBtn, this.restartBtn];
    if (this.zoomControls) {
      rects.push(this.zoomControls.zoomInBtn, this.zoomControls.zoomOutBtn, this.zoomControls.zoomResetBtn);
    }
    if (this.replayMode && this.replayControls) {
      rects.push(
        this.replayControls.firstBtn,
        this.replayControls.prevBtn,
        this.replayControls.nextBtn,
        this.replayControls.lastBtn,
        this.replayControls.practiceBtn
      );
    }
    for (const rect of rects) {
      if (rect && inRect(x, y, rect.x, rect.y, rect.w, rect.h)) return true;
    }
    return false;
  }

  beginTapTracking(touch) {
    if (!touch) return;
    this.pendingTap = {
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      moved: false,
      cancelled: false,
      startedAt: Date.now(),
      canPanBoard: this.isPointInBoardViewport(touch.clientX, touch.clientY) && !this.isPointInStaticUi(touch.clientX, touch.clientY),
      panStarted: false,
      panStartOffsetX: this.boardOffsetX,
      panStartOffsetY: this.boardOffsetY
    };
  }

  cancelTapTracking() {
    this.pendingTap = null;
  }

  updateTapTracking(touch) {
    if (!this.pendingTap || !touch) return;
    this.pendingTap.lastX = touch.clientX;
    this.pendingTap.lastY = touch.clientY;
    const dx = touch.clientX - this.pendingTap.startX;
    const dy = touch.clientY - this.pendingTap.startY;
    const dist2 = dx * dx + dy * dy;

    if (this.pendingTap.canPanBoard) {
      if (dist2 > 64) {
        this.pendingTap.moved = true;
        this.pendingTap.panStarted = true;
        this.boardOffsetX = this.pendingTap.panStartOffsetX + dx;
        this.boardOffsetY = this.pendingTap.panStartOffsetY + dy;
        this.applyBoardViewTransform();
      }
      return;
    }

    // 静态按钮区域在手机端按下时，手指会有轻微滑动。
    // 这里给 UI 点击更大的容差，避免底部复盘按钮被误判为拖动。
    if (dist2 > 576) {
      this.pendingTap.moved = true;
    }
  }

  handleZoomControlTap(x, y) {
    if (!this.zoomControls || !this.isDesktopLike) return false;
    const z = this.zoomControls;
    if (inRect(x, y, z.zoomInBtn.x, z.zoomInBtn.y, z.zoomInBtn.w, z.zoomInBtn.h)) {
      this.zoomBoardByStep(1);
      return true;
    }
    if (inRect(x, y, z.zoomOutBtn.x, z.zoomOutBtn.y, z.zoomOutBtn.w, z.zoomOutBtn.h)) {
      this.zoomBoardByStep(-1);
      return true;
    }
    if (inRect(x, y, z.zoomResetBtn.x, z.zoomResetBtn.y, z.zoomResetBtn.w, z.zoomResetBtn.h)) {
      this.resetBoardZoom();
      return true;
    }
    return false;
  }

  handleTap(x, y) {
    const now = Date.now();
    if (this.lastHandledTap && now - this.lastHandledTap.time < 320) {
      const dx = x - this.lastHandledTap.x;
      const dy = y - this.lastHandledTap.y;
      if (dx * dx + dy * dy <= 100) return;
    }
    this.lastHandledTap = { x, y, time: now };

    if (this.scoreReviewMode) {
      if (this.handleZoomControlTap(x, y)) {
        return;
      }
      if (inRect(x, y, this.restartBtn.x, this.restartBtn.y, this.restartBtn.w, this.restartBtn.h)) {
        this.enterReplayMode();
        return;
      }
      if (inRect(x, y, this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h)) {
        const targetScene = this.returnScene || this.homeScene;
        if (targetScene) this.sceneManager.switchTo(targetScene);
      }
      return;
    }

    if (this.replayMode && this.replayControls) {
      if (this.handleZoomControlTap(x, y)) {
        return;
      }
      if (this.scoreSummary && inRect(x, y, this.scoreRequestBtn.x, this.scoreRequestBtn.y, this.scoreRequestBtn.w, this.scoreRequestBtn.h)) {
        this.enterScoreReviewMode();
        return;
      }
      if (inRect(x, y, this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h)) {
        const targetScene = this.returnScene || this.homeScene;
        if (targetScene) this.sceneManager.switchTo(targetScene);
        return;
      }
      if (inRect(x, y, this.restartBtn.x, this.restartBtn.y, this.restartBtn.w, this.restartBtn.h)) {
        this.jumpReplayToEnd();
        return;
      }
      const controls = this.replayControls;
      if (inRect(x, y, controls.firstBtn.x, controls.firstBtn.y, controls.firstBtn.w, controls.firstBtn.h)) {
        this.jumpReplayToStart();
        return;
      }
      if (inRect(x, y, controls.prevBtn.x, controls.prevBtn.y, controls.prevBtn.w, controls.prevBtn.h)) {
        this.stepReplay(-1);
        return;
      }
      if (inRect(x, y, controls.nextBtn.x, controls.nextBtn.y, controls.nextBtn.w, controls.nextBtn.h)) {
        this.stepReplay(1);
        return;
      }
      if (inRect(x, y, controls.lastBtn.x, controls.lastBtn.y, controls.lastBtn.w, controls.lastBtn.h)) {
        this.jumpReplayToEnd();
        return;
      }
      if (inRect(x, y, controls.practiceBtn.x, controls.practiceBtn.y, controls.practiceBtn.w, controls.practiceBtn.h)) {
        this.startPracticeFromReplay();
        return;
      }
      return;
    }

    if (this.undoRequestState && this.undoRequestState.dialogVisible && this.undoRequestDialog) {
      const dialog = this.undoRequestDialog;
      if (inRect(x, y, dialog.refuseBtn.x, dialog.refuseBtn.y, dialog.refuseBtn.w, dialog.refuseBtn.h)) {
        this.refuseUndoRequest();
        return;
      }
      if (inRect(x, y, dialog.acceptBtn.x, dialog.acceptBtn.y, dialog.acceptBtn.w, dialog.acceptBtn.h)) {
        this.acceptUndoRequest();
        return;
      }
      return;
    }

    if (this.scoreRequestState && this.scoreRequestState.dialogVisible && this.scoreRequestDialog) {
      const dialog = this.scoreRequestDialog;
      if (inRect(x, y, dialog.refuseBtn.x, dialog.refuseBtn.y, dialog.refuseBtn.w, dialog.refuseBtn.h)) {
        this.refuseScoreRequest();
        return;
      }
      if (inRect(x, y, dialog.acceptBtn.x, dialog.acceptBtn.y, dialog.acceptBtn.w, dialog.acceptBtn.h)) {
        this.acceptScoreRequest();
        return;
      }
      return;
    }

    if (this.gameOver && this.victoryDialog) {
      const dialog = this.buildVictoryDialogLayout();
      this.victoryDialog.confirmBtn = dialog.confirmBtn;
      this.victoryDialog.scoreReviewBtn = dialog.scoreReviewBtn;
      this.victoryDialog.replayBtn = dialog.replayBtn;
      if (inRect(x, y, dialog.confirmBtn.x, dialog.confirmBtn.y, dialog.confirmBtn.w, dialog.confirmBtn.h)) {
        this.closeVictoryDialogAndReturnHome();
        return;
      }
      if (dialog.scoreReviewBtn && inRect(x, y, dialog.scoreReviewBtn.x, dialog.scoreReviewBtn.y, dialog.scoreReviewBtn.w, dialog.scoreReviewBtn.h)) {
        this.enterScoreReviewMode();
        return;
      }
      if (dialog.replayBtn && inRect(x, y, dialog.replayBtn.x, dialog.replayBtn.y, dialog.replayBtn.w, dialog.replayBtn.h)) {
        this.enterReplayMode();
        return;
      }
      return;
    }

    if (inRect(x, y, this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h)) {
      const targetScene = this.returnScene || this.homeScene;
      if (targetScene) this.sceneManager.switchTo(targetScene);
      return;
    }

    if (this.handleZoomControlTap(x, y)) {
      return;
    }

    if (inRect(x, y, this.scoreRequestBtn.x, this.scoreRequestBtn.y, this.scoreRequestBtn.w, this.scoreRequestBtn.h)) {
      this.requestScoreCount();
      return;
    }

    if (inRect(x, y, this.undoRequestBtn.x, this.undoRequestBtn.y, this.undoRequestBtn.w, this.undoRequestBtn.h)) {
      this.requestUndoTurn();
      return;
    }

    if (inRect(x, y, this.restartBtn.x, this.restartBtn.y, this.restartBtn.w, this.restartBtn.h)) {
      if (this.isTutorialMode) this.reloadTutorialLevel();
      else this.resetGame();
      return;
    }

    if (this.gameOver) {
      return;
    }

    for (const slot of this.cardSlotsLayout) {
      if (!inRect(x, y, slot.x, slot.y, slot.w, slot.h)) continue;

      if (this.pendingSwapCardSelection) {
        if (this.pendingSwapCardSelection.stage === 'own') {
          this.selectOwnSwapCard(slot.index);
        } else {
          this.clearPendingSwapCardSelection();
          this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
          this.statusMessage = '已取消换牌';
        }
        return;
      }

      if (this.pendingTrapPlacement) {
        this.cancelPendingTrapPlacement();
        return;
      }

      if (this.pendingContractPlacement) {
        this.cancelPendingContractPlacement();
        return;
      }

      if (this.pendingRebirthPlacement) {
        this.cancelPendingRebirthPlacement();
        return;
      }

      if (this.pendingPersuaderPlacement) {
        this.cancelPendingPersuaderPlacement();
        return;
      }

      if (this.pendingFogPlacement) {
        this.cancelPendingFogPlacement();
        return;
      }

      if (this.pendingThiefPlacement) {
        this.cancelPendingThiefPlacement();
        return;
      }

      if (this.pendingTeleportPlacement) {
        this.cancelPendingTeleportPlacement();
        return;
      }

      if (this.pendingRelocatePlacement) {
        this.cancelPendingRelocatePlacement();
        return;
      }

      if (this.pendingSacrificePlacement) {
        this.statusMessage = '献祭已经发动，必须先指定一枚敌子';
        return;
      }

      const card = this.getCardDataBySlot(slot.index);
      if (!card || card.used) return;

      if (card.type === 'swap_card') {
        this.startSwapCardSelection();
        return;
      }

      this.toggleNextSpecialPiece(card.type);
      return;
    }

    if (this.pendingSwapCardSelection && this.pendingSwapCardSelection.stage === 'enemy') {
      const enemyColor = this.getOpponent(this.currentPlayer);
      const enemySlot = this.getMiniCardPreviewSlotAt(x, y, enemyColor);
      if (enemySlot) {
        this.performSwapCard(enemySlot.index);
      } else {
        this.statusMessage = '请点击上方对方卡槽中的一张未使用手牌';
      }
      return;
    }

    if (this.pendingTrapPlacement) {
      const point = this.screenToBoard(x, y);
      if (!point) {
        this.statusMessage = '请选择一个空位布设隐藏陷阱，或点下方卡牌取消';
        return;
      }
      this.bindPendingTrapToTarget(point.row, point.col);
      return;
    }

    if (this.pendingContractPlacement) {
      const point = this.screenToBoard(x, y);
      if (!point) {
        this.statusMessage = '请选择一个对方棋子作为契约对象，或点下方卡牌取消';
        return;
      }
      this.bindPendingContractToTarget(point.row, point.col);
      return;
    }

    if (this.pendingRebirthPlacement) {
      const point = this.screenToBoard(x, y);
      if (!point) {
        this.statusMessage = '请选择一个空位作为重生点，或点下方卡牌取消';
        return;
      }
      this.bindPendingRebirthToTarget(point.row, point.col);
      return;
    }

    if (this.pendingPersuaderPlacement) {
      const point = this.screenToBoard(x, y);
      if (!point) {
        this.statusMessage = '请选择说客上下左右相邻的一枚敌子，或点下方卡牌取消';
        return;
      }
      this.bindPendingPersuaderToTarget(point.row, point.col);
      return;
    }

    if (this.pendingFogPlacement) {
      const point = this.screenToBoard(x, y);
      if (!point) {
        this.statusMessage = '请选择棋盘上的一个点投掷烟雾弹，或点下方卡牌取消';
        return;
      }
      this.bindPendingFogToTarget(point.row, point.col);
      return;
    }

    if (this.pendingSacrificePlacement) {
      const point = this.screenToBoard(x, y);
      if (!point) {
        this.statusMessage = '请选择局面中的任意一枚敌方棋子';
        return;
      }
      this.bindPendingSacrificeToTarget(point.row, point.col);
      return;
    }

    if (this.pendingThiefPlacement) {
      const point = this.screenToBoard(x, y);
      if (!point) {
        this.statusMessage = '请选择一个空位，或点下方卡牌取消';
        return;
      }

      const cell = this.board[point.row][point.col];
      if (cell === EMPTY) {
        this.commitThiefPlacement(this.pendingThiefPlacement.sourceRow, this.pendingThiefPlacement.sourceCol, point.row, point.col);
      } else if (this.isPiece(cell) && cell.color !== this.currentPlayer) {
        this.selectThiefSource(point.row, point.col);
      } else if (this.isPiece(cell) && cell.color === this.currentPlayer) {
        this.statusMessage = '盗贼不能搬到己方棋子所在位置';
      } else {
        this.statusMessage = '盗贼只能把目标棋子搬到空位';
      }
      return;
    }

    if (this.pendingTeleportPlacement) {
      const point = this.screenToBoard(x, y);
      if (!point) {
        const count = (this.pendingTeleportPlacement.targets || []).length;
        this.statusMessage = count > 0 ? '还需要再选 1 个空位，或点下方卡牌取消' : '请选择第 1 个瞬移空位，或点下方卡牌取消';
        return;
      }
      this.bindPendingTeleportToTarget(point.row, point.col);
      return;
    }

    if (this.pendingNightmarePlacement) {
      const dir = this.hitCustomDirectionButton(x, y, this.nightmareDirectionButtons);
      if (dir) {
        this.bindPendingNightmareDirection(dir);
        return;
      }
      const point = this.screenToBoard(x, y);
      if (!point) {
        this.statusMessage = this.nightmareDirectionButtons ? '请选择一个方向三角，或点下方卡牌取消' : '请选择任意一枚敌方棋子，或点下方卡牌取消';
        return;
      }
      this.selectNightmareTarget(point.row, point.col);
      return;
    }

    if (this.pendingRelocatePlacement) {
      const pending = this.pendingRelocatePlacement;
      const hitFirst = pending.firstConfirmBtn && inRect(x, y, pending.firstConfirmBtn.x, pending.firstConfirmBtn.y, pending.firstConfirmBtn.w, pending.firstConfirmBtn.h);
      const hitSecond = pending.secondConfirmBtn && inRect(x, y, pending.secondConfirmBtn.x, pending.secondConfirmBtn.y, pending.secondConfirmBtn.w, pending.secondConfirmBtn.h);
      if (hitFirst) {
        this.confirmRelocateArea('first');
        return;
      }
      if (hitSecond) {
        this.confirmRelocateArea('second');
        return;
      }

      const point = this.screenToBoard(x, y);
      if (!point) {
        this.statusMessage = pending.stage === 'first_select'
          ? '请选择第 1 块 2x2 区域，或点下方卡牌取消'
          : '请选择第 2 块 2x2 区域，或点下方卡牌取消';
        return;
      }
      this.selectRelocateArea(point.row, point.col);
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
        this.clearPendingSelection();
        this.statusMessage = '已取消方向选择';
        return;
      }

      if (this.pendingConfirmPlacement) {
        this.clearPendingConfirmPlacement();
        this.statusMessage = '已取消待确认落子';
      }
      return;
    }

    if (this.pendingConfirmPlacement) {
      if (this.pendingConfirmPlacement.row === point.row && this.pendingConfirmPlacement.col === point.col) {
        this.confirmPendingPlacement();
      } else if (this.isPlayablePoint(point.row, point.col) && this.board[point.row][point.col] === EMPTY) {
        this.startConfirmPlacement(point.row, point.col, this.nextPieceType, this.currentPlayer);
      } else {
        this.statusMessage = '只能移动到其他有效空位';
      }
      return;
    }

    if (this.handleFogOccupiedAttempt(point.row, point.col)) {
      this.clearPendingSelection();
      this.clearPendingConfirmPlacement();
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      return;
    }

    if (this.nextPieceType === 'thief') {
      const cell = this.board[point.row][point.col];
      if (this.isPiece(cell) && cell.color !== this.currentPlayer) {
        this.selectThiefSource(point.row, point.col);
      } else {
        this.statusMessage = '盗贼需要先点一枚对方棋子';
      }
      return;
    }

    if (this.nextPieceType === 'swap_card') {
      this.startSwapCardSelection();
      return;
    }

    if (this.nextPieceType === 'relocate') {
      this.startRelocateSelection();
      this.selectRelocateArea(point.row, point.col);
      return;
    }

    if (this.nextPieceType === 'nightmare') {
      this.startNightmarePlacement(point.row, point.col);
      return;
    }

    if (this.nextPieceType === 'trap') {
      this.startConfirmPlacement(point.row, point.col, 'trap', this.currentPlayer);
      return;
    }

    if (!this.isPlayablePoint(point.row, point.col) || this.board[point.row][point.col] !== EMPTY) {
      this.statusMessage = this.board[point.row][point.col] === EMPTY ? '此处不可落子' : '此处已有棋子';
      return;
    }

    this.startConfirmPlacement(point.row, point.col, this.nextPieceType, this.currentPlayer);
  }

  normalizePointerPoint(point) {
    if (!point) return null;
    const x = typeof point.clientX === 'number'
      ? point.clientX
      : (typeof point.x === 'number'
        ? point.x
        : (typeof point.pageX === 'number' ? point.pageX : null));
    const y = typeof point.clientY === 'number'
      ? point.clientY
      : (typeof point.y === 'number'
        ? point.y
        : (typeof point.pageY === 'number' ? point.pageY : null));
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    return { clientX: x, clientY: y };
  }

  getEventPoint(list, index = 0) {
    if (!list || !list[index]) return null;
    return this.normalizePointerPoint(list[index]);
  }

  getPrimaryTouchFromEvent(e) {
    return this.getEventPoint(e && e.touches, 0) || this.getEventPoint(e && e.changedTouches, 0);
  }

  onTouchStart(e) {
    if (e.touches && e.touches.length >= 2) {
      this.cancelTapTracking();
      this.beginBoardGesture(e.touches);
      return;
    }

    const touch = this.getPrimaryTouchFromEvent(e);
    if (!touch) return;

    if (this.activeGesture) {
      if (this.isPointInStaticUi(touch.clientX, touch.clientY)) {
        this.endBoardGesture();
      } else {
        return;
      }
    }
    if (this.lastGestureEndAt && Date.now() - this.lastGestureEndAt < 120) return;
    this.beginTapTracking(touch);
  }

  onTouchMove(e) {
    if (e.touches && e.touches.length >= 2) {
      this.cancelTapTracking();
      if (!this.activeGesture) {
        this.beginBoardGesture(e.touches);
        return;
      }
      this.updateBoardGesture(e.touches);
      return;
    }

    const touch = this.getPrimaryTouchFromEvent(e);
    if (!touch) return;
    this.updateTapTracking(touch);
  }

  onTouchEnd(e) {
    if (this.activeGesture && (!e.touches || e.touches.length < 2)) {
      this.endBoardGesture();
      this.cancelTapTracking();
      return;
    }

    if (e.touches && e.touches.length > 0) {
      this.cancelTapTracking();
      return;
    }

    const pendingTap = this.pendingTap;
    this.pendingTap = null;
    if (!pendingTap || pendingTap.cancelled) return;
    if (this.lastGestureEndAt && Date.now() - this.lastGestureEndAt < 120) return;

    const releasePoint = this.getEventPoint(e && e.changedTouches, 0);
    if (releasePoint) {
      pendingTap.lastX = releasePoint.clientX;
      pendingTap.lastY = releasePoint.clientY;
    }

    const dx = pendingTap.lastX - pendingTap.startX;
    const dy = pendingTap.lastY - pendingTap.startY;
    const dist2 = dx * dx + dy * dy;
    const uiTolerance = 576;

    if (pendingTap.moved) {
      if (pendingTap.canPanBoard || dist2 > uiTolerance) return;
    }

    this.handleTap(pendingTap.lastX, pendingTap.lastY);
  }

  toggleNextSpecialPiece(type) {
    if (this.isCloneTurnActive(this.currentPlayer)) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.clearPendingSelection();
      this.statusMessage = '克隆生效回合只能落普通子';
      return;
    }

    if (!this.hasAvailableCard(type)) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.clearPendingSelection();
      this.statusMessage = '这张卡已经用掉了';
      return;
    }

    if (this.pendingPlacement) {
      this.clearPendingSelection();
    }
    if (this.pendingConfirmPlacement) {
      this.clearPendingConfirmPlacement();
    }

    const defaultType = this.pieceConfig.defaultPieceType || 'normal';
    if (type === 'clone') {
      this.markUndoSnapshot();
      this.consumeCard('clone');
      this.activateCloneNow(this.currentPlayer);
      this.nextPieceType = defaultType;
      this.statusMessage = '克隆生效：请立刻连续落 2 个带 x2 标记的克隆子；它们会在对手落子后自动死亡';
      this.handleTutorialPostAction('commit', { type: 'clone', color: this.currentPlayer });
      return;
    }

    this.nextPieceType = this.nextPieceType === type ? defaultType : type;

    const pieceDef = getPieceDef(this.pieceMap, this.nextPieceType);
    if (type === 'contract' && this.nextPieceType === type) {
      this.statusMessage = `已选中${pieceDef.name}卡：先落下契约子，再点敌子绑定`;
      return;
    }

    if (type === 'rebirth' && this.nextPieceType === type) {
      this.statusMessage = `已选中${pieceDef.name}卡：先落子，再点空位绑定重生点`;
      return;
    }

    if (type === 'persuader' && this.nextPieceType === type) {
      this.statusMessage = `已选中${pieceDef.name}卡：先落子，再点上下左右相邻的一枚敌子`;
      return;
    }

    if (type === 'fog' && this.nextPieceType === type) {
      this.statusMessage = `已选中${pieceDef.name}卡：先落子，再点棋盘任意一点投掷烟雾弹`;
      return;
    }

    if (type === 'sacrifice' && this.nextPieceType === type) {
      this.statusMessage = `已选中${pieceDef.name}卡：落在上下左右都是己子的空点，再指定任意一枚敌子`;
      return;
    }

    if (type === 'thief' && this.nextPieceType === type) {
      this.statusMessage = `已选中${pieceDef.name}卡：先点一枚对方棋子，再点空位搬运过去`;
      return;
    }

    if (type === 'teleport' && this.nextPieceType === type) {
      this.statusMessage = `已选中${pieceDef.name}卡：先落子，再依次点 2 个空位作为瞬移点`;
      return;
    }

    if (type === 'swap_card' && this.nextPieceType === type) {
      this.statusMessage = `已选中${pieceDef.name}卡：先选自己一张手牌，再点对方手牌完成交换`;
      return;
    }

    if (type === 'relocate' && this.nextPieceType === type) {
      this.statusMessage = `已选中${pieceDef.name}卡：依次确认两块 2x2 区域后互换`;
      return;
    }

    if (type === 'nightmare' && this.nextPieceType === type) {
      this.statusMessage = `已选中${pieceDef.name}卡：先落子，再选敌子与推进方向`;
      return;
    }

    if (type === 'trap' && this.nextPieceType === type) {
      this.statusMessage = `已选中${pieceDef.name}卡：先落子，再点一个空位布设隐藏陷阱`;
      return;
    }

    this.statusMessage = pieceDef.needsDirection
      ? `已选中${pieceDef.name}卡：先点落点，再选方向`
      : `已切回${pieceDef.name}`;
  }

  startSpecialPlacement(row, col, type) {
    if (!this.isPlayablePoint(row, col)) return;

    if (!this.hasAvailableCard(type)) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = '这张卡已经用掉了';
      return;
    }

    if (this.board[row][col] !== EMPTY) {
      this.statusMessage = '此处已有棋子';
      return;
    }

    if (type === 'archer' && this.hasAdjacentAlly(row, col, this.currentPlayer)) {
      this.statusMessage = '弓箭手不能与自己棋子相连';
      return;
    }

    this.pendingPlacement = {
      row,
      col,
      color: this.currentPlayer,
      type
    };

    this.directionButtons = this.buildDirectionButtons(row, col);
    const pieceDef = getPieceDef(this.pieceMap, type);
    this.statusMessage = `请选择${pieceDef.name}方向`;
  }


  startContractPlacement(row, col) {
    if (!this.isPlayablePoint(row, col)) return;

    if (!this.hasAvailableCard('contract')) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = '这张卡已经用掉了';
      return;
    }

    if (this.board[row][col] !== EMPTY) {
      this.statusMessage = '此处已有棋子';
      return;
    }

    const piece = {
      color: this.currentPlayer,
      type: 'contract',
      dir: null,
      id: this.allocPieceId()
    };

    const result = this.simulatePlacePiece(this.board, row, col, piece, this.currentPlayer);
    if (!result.ok) {
      this.statusMessage = result.message || '落子失败';
      return;
    }

    this.commitPlacement(row, col, piece, result, { endTurn: false, advanceContracts: true });
    const contractSource = this.findPiecePositionById(piece.id);
    if (!contractSource || !this.isPiece(contractSource.cell)) {
      this.finalizeManualTurn('契约子误踏陷阱：本回合结束');
      return;
    }
    this.pendingContractPlacement = {
      row: contractSource.row,
      col: contractSource.col,
      color: this.currentPlayer,
      contractId: piece.id
    };
    this.nextPieceType = 'contract';
    this.statusMessage = '请选择一个对方棋子绑定契约，或点下方卡牌取消';
  }

  startRebirthPlacement(row, col) {
    if (!this.isPlayablePoint(row, col)) return;

    if (!this.hasAvailableCard('rebirth')) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = '这张卡已经用掉了';
      return;
    }

    if (this.board[row][col] !== EMPTY) {
      this.statusMessage = '此处已有棋子';
      return;
    }

    const piece = {
      color: this.currentPlayer,
      type: 'rebirth',
      dir: null,
      id: this.allocPieceId()
    };

    const result = this.simulatePlacePiece(this.board, row, col, piece, this.currentPlayer);
    if (!result.ok) {
      this.statusMessage = result.message || '落子失败';
      return;
    }

    this.commitPlacement(row, col, piece, result, { endTurn: false, advanceContracts: true });
    const rebirthSource = this.findPiecePositionById(piece.id);
    if (!rebirthSource || !this.isPiece(rebirthSource.cell)) {
      this.finalizeManualTurn('重生子误踏陷阱：本回合结束');
      return;
    }
    this.pendingRebirthPlacement = {
      row: rebirthSource.row,
      col: rebirthSource.col,
      color: this.currentPlayer,
      pieceId: piece.id
    };
    this.nextPieceType = 'rebirth';
    this.statusMessage = '请选择一个空位作为重生点，或点下方卡牌取消';
  }

  startFogPlacement(row, col) {
    if (!this.isPlayablePoint(row, col)) return;

    if (!this.hasAvailableCard('fog')) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = '这张卡已经用掉了';
      return;
    }

    if (this.board[row][col] !== EMPTY) {
      this.statusMessage = '此处已有棋子';
      return;
    }

    const piece = {
      color: this.currentPlayer,
      type: 'fog',
      dir: null,
      id: this.allocPieceId()
    };

    const result = this.simulatePlacePiece(this.board, row, col, piece, this.currentPlayer);
    if (!result.ok) {
      this.statusMessage = result.message || '落子失败';
      return;
    }

    this.commitPlacement(row, col, piece, result, { endTurn: false, advanceContracts: true });
    const fogSource = this.findPiecePositionById(piece.id);
    if (!fogSource || !this.isPiece(fogSource.cell)) {
      this.finalizeManualTurn('迷雾子误踏陷阱：本回合结束');
      return;
    }
    this.pendingFogPlacement = {
      row: fogSource.row,
      col: fogSource.col,
      color: this.currentPlayer,
      pieceId: piece.id
    };
    this.nextPieceType = 'fog';
    this.statusMessage = '请选择棋盘上的任意一点投掷烟雾弹，或点下方卡牌取消';
  }

  startPersuaderPlacement(row, col) {
    if (!this.isPlayablePoint(row, col)) return;

    if (!this.hasAvailableCard('persuader')) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = '这张卡已经用掉了';
      return;
    }

    if (this.board[row][col] !== EMPTY) {
      this.statusMessage = '此处已有棋子';
      return;
    }

    if (!this.hasAdjacentSingletonEnemy(row, col, this.currentPlayer)) {
      this.statusMessage = '说客必须落在至少贴邻一枚落单敌子的地方';
      return;
    }

    const piece = {
      color: this.currentPlayer,
      type: 'persuader',
      dir: null,
      id: this.allocPieceId()
    };

    const result = this.simulatePlacePiece(this.board, row, col, piece, this.currentPlayer);
    if (!result.ok) {
      this.statusMessage = result.message || '落子失败';
      return;
    }

    this.commitPlacement(row, col, piece, result, { endTurn: false, advanceContracts: true });

    const source = this.findPiecePositionById(piece.id);
    if (!source || !this.isPiece(source.cell)) {
      this.finalizeManualTurn('说客误踏陷阱：本回合结束');
      return;
    }
    if (!source || !this.hasAdjacentSingletonEnemy(source.row, source.col, this.currentPlayer)) {
      this.removePieceById(piece.id);
      this.refundCard('persuader');
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.previousBoardKey = this.getBoardKey(this.board);
      this.statusMessage = '说客落下后周围没有可说服的落单敌子';
      return;
    }

    this.pendingPersuaderPlacement = {
      row: source.row,
      col: source.col,
      color: this.currentPlayer,
      pieceId: piece.id
    };
    this.nextPieceType = 'persuader';
    this.statusMessage = '请选择说客上下左右相邻的一枚敌子，或点下方卡牌取消';
  }


  startTeleportPlacement(row, col) {
    if (!this.isPlayablePoint(row, col)) return;

    if (!this.hasAvailableCard('teleport')) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = '这张卡已经用掉了';
      return;
    }

    if (this.board[row][col] !== EMPTY) {
      this.statusMessage = '此处已有棋子';
      return;
    }

    const piece = {
      color: this.currentPlayer,
      type: 'teleport',
      dir: null,
      id: this.allocPieceId()
    };

    const result = this.simulatePlacePiece(this.board, row, col, piece, this.currentPlayer);
    if (!result.ok) {
      this.statusMessage = result.message || '落子失败';
      return;
    }

    this.commitPlacement(row, col, piece, result, { endTurn: false, advanceContracts: true });
    const teleportSource = this.findPiecePositionById(piece.id);
    if (!teleportSource || !this.isPiece(teleportSource.cell)) {
      this.finalizeManualTurn('瞬移子误踏陷阱：本回合结束');
      return;
    }
    this.pendingTeleportPlacement = {
      row: teleportSource.row,
      col: teleportSource.col,
      color: this.currentPlayer,
      pieceId: piece.id,
      targets: []
    };
    this.nextPieceType = 'teleport';
    this.statusMessage = '请选择第 1 个瞬移空位，或点下方卡牌取消';
  }


  startTrapPlacement(row, col) {
    if (!this.isPlayablePoint(row, col)) return;

    if (!this.hasAvailableCard('trap')) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = '这张卡已经用掉了';
      return;
    }

    if (this.board[row][col] !== EMPTY) {
      this.statusMessage = '此处已有棋子';
      return;
    }

    const piece = {
      color: this.currentPlayer,
      type: 'trap',
      dir: null,
      id: this.allocPieceId()
    };

    const result = this.simulatePlacePiece(this.board, row, col, piece, this.currentPlayer);
    if (!result.ok) {
      this.statusMessage = result.message || '落子失败';
      return;
    }

    this.commitPlacement(row, col, piece, result, { endTurn: false, advanceContracts: true });
    const trapSource = this.findPiecePositionById(piece.id);
    if (!trapSource || !this.isPiece(trapSource.cell)) {
      this.finalizeManualTurn('陷阱子误踏陷阱：本回合结束，且无法布设新陷阱', { trigger: 'commit', piece: { type: 'trap', color: piece.color } });
      return;
    }

    this.pendingTrapPlacement = {
      row,
      col,
      color: this.currentPlayer,
      pieceId: piece.id
    };
    this.nextPieceType = 'trap';
    this.statusMessage = '请选择一个空位布设隐藏陷阱，或点下方卡牌取消';
  }

  bindPendingTrapToTarget(row, col) {
    const pending = this.pendingTrapPlacement;
    if (!pending) return false;

    const source = this.findPiecePositionById(pending.pieceId);
    if (!source || !this.isPiece(source.cell) || source.cell.color !== pending.color) {
      this.clearPendingTrapPlacement();
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = '陷阱子已不存在';
      return false;
    }

    const placed = this.placeHiddenTrap(row, col, pending.color);
    if (!placed.ok) {
      this.statusMessage = placed.message;
      return false;
    }

    this.normalizePieceAt(source.row, source.col);
    this.clearPendingTrapPlacement();
    this.finalizeManualTurn(`隐藏陷阱已布设在（${row + 1}, ${col + 1}）`, { trigger: 'commit', piece: { type: 'trap', color: pending.color } });
    return true;
  }

  bindPendingTeleportToTarget(row, col) {
    const pending = this.pendingTeleportPlacement;
    if (!pending) return false;

    if (!this.isPlayablePoint(row, col)) {
      this.statusMessage = '请选择一个有效空位';
      return false;
    }

    const found = this.findPiecePositionById(pending.pieceId);
    if (!found) {
      this.clearPendingTeleportPlacement();
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = '瞬移棋子已不存在';
      return false;
    }

    if (!(this.board[row][col] === EMPTY)) {
      this.statusMessage = '瞬移点必须是空位';
      return false;
    }

    if (found.row === row && found.col === col) {
      this.statusMessage = '瞬移点不能选在棋子当前所在位置';
      return false;
    }

    const targets = Array.isArray(pending.targets) ? pending.targets.slice() : [];
    if (targets.some((item) => item.row === row && item.col === col)) {
      this.statusMessage = '两个瞬移点不能重复';
      return false;
    }

    targets.push({ row, col });
    pending.targets = targets;

    if (targets.length < 2) {
      this.statusMessage = '已选第 1 个瞬移点，请再选第 2 个空位';
      return true;
    }

    this.markUndoSnapshot();
    this.board[found.row][found.col] = createPiece(found.cell.color, found.cell.type, found.cell.dir, found.cell.id, {
      ...found.cell,
      teleportTargets: targets,
      teleportStep: 0,
      teleportCooldown: 1,
      teleportReady: false
    });

    const contractInfo = this.resolveContracts(true);
    const wonByCapture = this.checkVictoryAfterCapture(found.cell.color);

    if (!wonByCapture) {
      if (this.isTurnPressureActiveForPlayer(this.currentPlayer)) {
        this.clearTurnPressure(true);
      }
      this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
    }

    const turnStartInfo = wonByCapture
      ? { persuadedCount: 0, vanishedCount: 0, archerShotCount: 0, archerKillCount: 0, archerDisabledCount: 0, plagueInfo: { infectedCount: 0, deathCount: 0, recoverCount: 0, vanishedCount: 0 }, teleportInfo: { movedCount: 0, failedCount: 0, finishedCount: 0 } }
      : this.resolveTurnStartSpecials(this.currentPlayer);
    if (this.isFogActiveForPlayer(this.getOpponent(this.currentPlayer))) {
      this.clearFog();
    }

    if (contractInfo.chainKillCount > 0) {
      this.statusMessage = `契约触发，同归于尽 ${contractInfo.chainKillCount} 枚`;
    } else if (turnStartInfo.teleportInfo && turnStartInfo.teleportInfo.failedCount > 0) {
      this.statusMessage = `瞬移受阻，失效 ${turnStartInfo.teleportInfo.failedCount} 枚`;
    } else if (turnStartInfo.teleportInfo && turnStartInfo.teleportInfo.movedCount > 0) {
      this.statusMessage = `瞬移发动，移动 ${turnStartInfo.teleportInfo.movedCount} 枚`;
    } else if (turnStartInfo.plagueInfo && (turnStartInfo.plagueInfo.deathCount > 0 || turnStartInfo.plagueInfo.recoverCount > 0)) {
      this.statusMessage = `瘟疫结算：病死 ${turnStartInfo.plagueInfo.deathCount} 枚，康复 ${turnStartInfo.plagueInfo.recoverCount} 枚`;
    } else if (turnStartInfo.archerDisabledCount > 0) {
      this.statusMessage = `有 ${turnStartInfo.archerDisabledCount} 枚弓箭手被敌子贴身，失去射箭能力`;
    } else if (turnStartInfo.archerShotCount > 0) {
      this.statusMessage = turnStartInfo.archerKillCount > 0
        ? `弓箭手放箭，击杀 ${turnStartInfo.archerKillCount} 枚`
        : '弓箭手放箭，但前方没有目标';
    } else if (turnStartInfo.persuadedCount > 0 || turnStartInfo.vanishedCount > 0) {
      this.statusMessage = `说客发动，转化 ${turnStartInfo.persuadedCount} 枚${turnStartInfo.vanishedCount > 0 ? `，消失 ${turnStartInfo.vanishedCount} 枚` : ''}`;
    } else {
      this.statusMessage = '瞬移路径已设定：该棋子将每回合跳向下一个蓝色虚线点';
    }

    this.clearPendingTeleportPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    return true;
  }

  selectThiefSource(row, col) {
    if (!this.hasAvailableCard('thief')) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = '这张卡已经用掉了';
      return false;
    }

    if (!this.isPlayablePoint(row, col)) {
      this.statusMessage = '请选择一枚对方棋子';
      return false;
    }

    const cell = this.board[row][col];
    if (!this.isPiece(cell) || cell.color === this.currentPlayer) {
      this.statusMessage = '盗贼只能选择一枚对方棋子';
      return false;
    }

    this.pendingThiefPlacement = {
      sourceRow: row,
      sourceCol: col,
      pieceId: cell.id,
      victimColor: cell.color
    };
    this.nextPieceType = 'thief';
    this.statusMessage = '已选中目标棋子：请点击一个空位，把它搬过去';
    return true;
  }

  simulateRelocatePiece(sourceBoard, fromRow, fromCol, toRow, toCol) {
    if (!this.isPlayablePoint(fromRow, fromCol)) return { ok: false, message: '原位置无效' };
    if (!this.isPlayablePoint(toRow, toCol)) return { ok: false, message: '不可落子' };
    if (sourceBoard[toRow][toCol] !== EMPTY) return { ok: false, message: '目标处已有棋子' };

    const sourcePiece = sourceBoard[fromRow][fromCol];
    if (!this.isPiece(sourcePiece)) return { ok: false, message: '请选择一枚棋子' };

    const player = sourcePiece.color;
    const opponent = this.getOpponent(player);
    const beforeBoardKey = this.getBoardKey(sourceBoard);
    const nextBoard = this.cloneBoard(sourceBoard);
    const movingPiece = { ...nextBoard[fromRow][fromCol] };
    nextBoard[fromRow][fromCol] = EMPTY;
    nextBoard[toRow][toCol] = movingPiece;

    let totalCaptured = [];
    let scoreCaptured = [];
    const neighbors = this.getNeighborsForBoard(nextBoard, toRow, toCol);
    const visitedEnemyGroups = new Set();

    for (const [nr, nc] of neighbors) {
      const neighbor = nextBoard[nr][nc];
      if (!this.isPiece(neighbor) || neighbor.color !== opponent) continue;

      const enemyKey = `${nr},${nc}`;
      if (visitedEnemyGroups.has(enemyKey)) continue;

      const group = this.getGroup(nextBoard, nr, nc);
      for (const [gr, gc] of group) visitedEnemyGroups.add(`${gr},${gc}`);

      const liberties = this.getLiberties(nextBoard, group);
      if (liberties.size === 0) {
        const processed = this.processCapturedGroup(nextBoard, group);
        totalCaptured = totalCaptured.concat(processed.removed);
        scoreCaptured = scoreCaptured.concat(processed.counted);
      }
    }

    const selfGroup = this.getGroup(nextBoard, toRow, toCol);
    const selfLiberties = this.getLiberties(nextBoard, selfGroup);
    if (selfLiberties.size === 0) return { ok: false, message: '搬过去会自杀，不能这样放' };

    const nextBoardKey = this.getBoardKey(nextBoard);
    if (nextBoardKey === this.previousBoardKey) {
      return { ok: false, message: '劫争：此处暂不可落子' };
    }

    return {
      ok: true,
      board: nextBoard,
      movedPiece: movingPiece,
      captured: totalCaptured,
      scoreCaptured,
      reborn: totalCaptured.length - scoreCaptured.length,
      beforeBoardKey
    };
  }

  commitThiefPlacement(fromRow, fromCol, toRow, toCol) {
    this.markUndoSnapshot();
    const sourcePiece = this.board[fromRow][fromCol];
    if (!this.isPiece(sourcePiece) || sourcePiece.color === this.currentPlayer) {
      this.statusMessage = '所选目标棋子已无效，请重新选择';
      this.clearPendingThiefPlacement();
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      return false;
    }

    const result = this.simulateRelocatePiece(this.board, fromRow, fromCol, toRow, toCol);
    if (!result.ok) {
      this.statusMessage = result.message || '盗贼搬运失败';
      return false;
    }

    this.board = result.board;
    this.previousBoardKey = result.beforeBoardKey;
    this.lastMove = { row: toRow, col: toCol };
    this.lastCaptured = result.captured || [];
    const gainedCaptures = this.updateCaptureCounts(result, result.movedPiece.color);
    GameGlobal.musicManager.playDropStone();
    this.consumeCard('thief');

    this.advanceSpecialPieces({ skipNewlyPlacedKey: `${toRow},${toCol}` });
    const contractInfo = this.resolveContracts(true);
    const wonByCapture = this.checkVictoryAfterCapture(result.movedPiece.color);

    if (!wonByCapture) {
      this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
    }

    const turnStartInfo = wonByCapture
      ? { persuadedCount: 0, vanishedCount: 0, archerShotCount: 0, archerKillCount: 0, archerDisabledCount: 0, plagueInfo: { infectedCount: 0, deathCount: 0, recoverCount: 0, vanishedCount: 0 }, teleportInfo: { movedCount: 0, failedCount: 0, finishedCount: 0 } }
      : this.resolveTurnStartSpecials(this.currentPlayer);
    if (this.isFogActiveForPlayer(this.getOpponent(this.currentPlayer))) {
      this.clearFog();
    }

    if (contractInfo.chainKillCount > 0) {
      this.statusMessage = `契约触发，同归于尽 ${contractInfo.chainKillCount} 枚`;
    } else if (turnStartInfo.plagueInfo && (turnStartInfo.plagueInfo.deathCount > 0 || turnStartInfo.plagueInfo.recoverCount > 0)) {
      this.statusMessage = `瘟疫结算：病死 ${turnStartInfo.plagueInfo.deathCount} 枚，康复 ${turnStartInfo.plagueInfo.recoverCount} 枚`;
    } else if (turnStartInfo.archerDisabledCount > 0) {
      this.statusMessage = `有 ${turnStartInfo.archerDisabledCount} 枚弓箭手被敌子贴身，失去射箭能力`;
    } else if (turnStartInfo.archerShotCount > 0) {
      this.statusMessage = turnStartInfo.archerKillCount > 0
        ? `弓箭手放箭，击杀 ${turnStartInfo.archerKillCount} 枚`
        : '弓箭手放箭，但前方没有目标';
    } else if (turnStartInfo.persuadedCount > 0 || turnStartInfo.vanishedCount > 0) {
      this.statusMessage = `说客发动，转化 ${turnStartInfo.persuadedCount} 枚${turnStartInfo.vanishedCount > 0 ? `，消失 ${turnStartInfo.vanishedCount} 枚` : ''}`;
    } else if (turnStartInfo.teleportInfo && turnStartInfo.teleportInfo.failedCount > 0) {
      this.statusMessage = `瞬移受阻，失效 ${turnStartInfo.teleportInfo.failedCount} 枚`;
    } else if (turnStartInfo.teleportInfo && turnStartInfo.teleportInfo.movedCount > 0) {
      this.statusMessage = `瞬移发动，移动 ${turnStartInfo.teleportInfo.movedCount} 枚`;
    } else if (gainedCaptures > 0) {
      this.statusMessage = `盗贼搬运完成，并造成提子 ${gainedCaptures} 枚`;
    } else {
      this.statusMessage = '盗贼得手：目标棋子已被搬运';
    }

    this.clearPendingThiefPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.handleTutorialPostAction('commit', { type: 'thief', color: this.currentPlayer });
    return true;
  }

  confirmSpecialPlacement(dir) {
    if (!this.pendingPlacement) return;

    const { row, col, color, type } = this.pendingPlacement;
    const ok = this.tryPlacePiece(row, col, { color, type, dir });

    this.clearPendingSelection();

    if (ok) {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    }
  }

  tryPlacePiece(row, col, piece) {
    if (this.isTutorialMode && piece.type === (this.pieceConfig.defaultPieceType || 'normal') && this.isTutorialCardUnused()) {
      this.statusMessage = '本关要先使用下方指定的特殊兵种卡';
      return false;
    }

    if (piece.type === 'archer' && this.hasAdjacentAlly(row, col, this.currentPlayer)) {
      this.statusMessage = '弓箭手不能与自己棋子相连';
      return false;
    }

    if (piece.type === 'clone') {
      this.markUndoSnapshot();
      this.consumeCard('clone');
      this.activateCloneNow(this.currentPlayer);
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      this.statusMessage = '克隆生效：请立刻连续落 2 个带 x2 标记的克隆子；它们会在对手落子后自动死亡';
      this.handleTutorialPostAction('commit', { type: 'clone', color: this.currentPlayer });
      return true;
    }

    const finalPiece = { ...piece, id: piece.id || this.allocPieceId() };
    const result = this.simulatePlacePiece(this.board, row, col, finalPiece, this.currentPlayer);

    if (!result.ok) {
      this.statusMessage = result.message || '落子失败';
      return false;
    }

    const fogWasActiveForPlayer = this.isFogActiveForPlayer(this.currentPlayer);
    const ok = this.commitPlacement(row, col, finalPiece, result);
    if (ok && finalPiece.type !== 'contract') {
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    }
    if (ok && fogWasActiveForPlayer) {
      this.clearFog();
    }
    return ok;
  }

  collectLineTargets(row, col, dr, dc) {
    const targets = [];

    let nr = row + dr;
    let nc = col + dc;
    while (this.isPlayablePoint(nr, nc)) {
      if (this.isPiece(this.board[nr][nc])) {
        targets.push([nr, nc]);
      }
      nr += dr;
      nc += dc;
    }

    nr = row - dr;
    nc = col - dc;
    while (this.isPlayablePoint(nr, nc)) {
      if (this.isPiece(this.board[nr][nc])) {
        targets.push([nr, nc]);
      }
      nr -= dr;
      nc -= dc;
    }

    return targets;
  }

  getLineBalanceInfo(row, col, dr, dc) {
    const targets = this.collectLineTargets(row, col, dr, dc);
    let black = 0;
    let white = 0;

    for (const [r, c] of targets) {
      const cell = this.board[r][c];
      if (!this.isPiece(cell)) continue;
      if (cell.color === BLACK) black += 1;
      else if (cell.color === WHITE) white += 1;
    }

    return {
      targets,
      black,
      white,
      triggered: black > 0 && black === white
    };
  }

  applySymphonyEffect(centerRow, centerCol) {
    const horizontal = this.getLineBalanceInfo(centerRow, centerCol, 0, 1);
    const vertical = this.getLineBalanceInfo(centerRow, centerCol, 1, 0);
    const killMap = new Map();

    if (horizontal.triggered) {
      for (const [r, c] of horizontal.targets) {
        killMap.set(`${r},${c}`, [r, c]);
      }
    }

    if (vertical.triggered) {
      for (const [r, c] of vertical.targets) {
        killMap.set(`${r},${c}`, [r, c]);
      }
    }

    let killedCount = 0;
    for (const [r, c] of killMap.values()) {
      const out = this.resolvePieceRemovalAt(r, c, {
        reason: 'special',
        allowRebirth: true,
        scoreByVictimOpposition: true
      });
      if (out.removed) killedCount += 1;
    }

    this.normalizePieceAt(centerRow, centerCol);
    const vanishedCount = this.resolveDeadGroupsAfterGravity(null, true);
    this.previousBoardKey = this.getBoardKey(this.board);

    return {
      horizontalTriggered: horizontal.triggered,
      verticalTriggered: vertical.triggered,
      killedCount,
      vanishedCount
    };
  }


  applyRepulsionEffect(centerRow, centerCol) {
    const dirs = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 }
    ];

    let movedCount = 0;

    for (const { dr, dc } of dirs) {
      let row = centerRow + dr;
      let col = centerCol + dc;

      while (this.isPlayablePoint(row, col)) {
        const cell = this.board[row][col];
        if (this.isPiece(cell)) {
          const targetRow = row + dr;
          const targetCol = col + dc;
          if (this.isPlayablePoint(targetRow, targetCol) && this.board[targetRow][targetCol] === EMPTY) {
            this.board[targetRow][targetCol] = cell;
            this.board[row][col] = EMPTY;
            movedCount += 1;
          }
          break;
        }
        row += dr;
        col += dc;
      }
    }

    const vanishedCount = this.resolveDeadGroupsAfterGravity(null, true);
    this.previousBoardKey = this.getBoardKey(this.board);
    return { movedCount, vanishedCount };
  }

  applyReverseEffect(centerRow, centerCol) {
    let flippedCount = 0;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;

        const row = centerRow + dr;
        const col = centerCol + dc;
        if (!this.isPlayablePoint(row, col)) continue;

        const cell = this.board[row][col];
        if (!this.isPiece(cell)) continue;

        cell.color = this.getOpponent(cell.color);
        flippedCount += 1;
      }
    }

    const vanishedCount = this.resolveDeadGroupsAfterGravity(null, true);
    this.previousBoardKey = this.getBoardKey(this.board);
    return { flippedCount, vanishedCount };
  }


  applyGravityEffect(centerRow, centerCol) {
    const dirs = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 }
    ];

    let movedCount = 0;

    for (const { dr, dc } of dirs) {
      let row = centerRow + dr;
      let col = centerCol + dc;

      while (this.isPlayablePoint(row, col)) {
        const cell = this.board[row][col];
        if (this.isPiece(cell)) {
          const targetRow = row - dr;
          const targetCol = col - dc;
          if ((targetRow !== centerRow || targetCol !== centerCol) && this.board[targetRow][targetCol] === EMPTY) {
            this.board[targetRow][targetCol] = cell;
            this.board[row][col] = EMPTY;
            movedCount += 1;
          }
          break;
        }
        row += dr;
        col += dc;
      }
    }

    const vanishedCount = this.resolveDeadGroupsAfterGravity(null, true);
    this.previousBoardKey = this.getBoardKey(this.board);
    return { movedCount, vanishedCount };
  }

  resolveDeadGroupsAfterGravity(scoreForColor = null, scoreByVictimOpposition = false) {
    let vanishedCount = 0;

    while (true) {
      const toRemove = [];
      const visited = new Set();

      for (let row = 0; row < BOARD_ROWS; row++) {
        for (let col = 0; col < BOARD_COLS; col++) {
          const cell = this.board[row][col];
          if (!this.isPiece(cell)) continue;

          const key = `${row},${col}`;
          if (visited.has(key)) continue;

          const group = this.getGroup(this.board, row, col);
          for (const [gr, gc] of group) {
            visited.add(`${gr},${gc}`);
          }

          const liberties = this.getLiberties(this.board, group);
          if (liberties.size === 0) {
            toRemove.push(...group);
          }
        }
      }

      if (toRemove.length === 0) break;

      const unique = new Set();
      for (const [row, col] of toRemove) {
        const key = `${row},${col}`;
        if (unique.has(key)) continue;
        unique.add(key);
        this.resolvePieceRemovalAt(row, col, {
          reason: 'capture',
          allowRebirth: true,
          scoreForColor,
          scoreByVictimOpposition
        });
        vanishedCount += 1;
      }
    }

    return vanishedCount;
  }

  advanceSpecialPieces(options = {}) {
    const queue = [];

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (!this.isPiece(cell)) continue;

        const pieceDef = getPieceDef(this.pieceMap, cell.type);
        const order = pieceDef.advanceOrder || 0;
        const key = `${row},${col}`;

        if (
          options.skipNewlyPlacedType === cell.type &&
          options.skipNewlyPlacedKey === key &&
          pieceDef.behavior?.type === 'move_forward'
        ) {
          continue;
        }

        if (pieceDef.behavior?.type && pieceDef.behavior.type !== 'none') {
          queue.push({ row, col, piece: { ...cell }, pieceDef, order });
        }
      }
    }

    queue.sort((a, b) => a.order - b.order);

    let totalExploded = 0;
    let totalDisabled = 0;
    let totalDestroyedCells = 0;
    let totalDugCells = 0;
    let totalRaisedCells = 0;

    for (const item of queue) {
      const cell = this.board[item.row][item.col];
      if (!this.isPiece(cell)) continue;
      if (cell.type !== item.piece.type) continue;

      const out = runAdvanceForPiece(this, item.row, item.col, cell, item.pieceDef);
      if (!out) continue;

      if (out.exploded) totalExploded += out.exploded.length;
      if (out.disabledCount) totalDisabled += out.disabledCount;
      if (out.destroyedCellsCount) totalDestroyedCells += out.destroyedCellsCount;
      if (out.dugCount) totalDugCells += out.dugCount;
      if (out.raisedCount) totalRaisedCells += out.raisedCount;
    }

    this.previousBoardKey = this.getBoardKey(this.board);

    if (totalDugCells > 0) {
      this.statusMessage = `堡垒兵挖掉 ${totalDugCells} 格`;
    } else if (totalRaisedCells > 0) {
      this.statusMessage = `山地兵造地 ${totalRaisedCells} 格`;
    } else if (totalDestroyedCells > 0) {
      this.statusMessage = `特殊兵种触发，清空 ${totalDestroyedCells} 格`;
    } else if (totalDisabled > 0) {
      this.statusMessage = `有 ${totalDisabled} 枚特殊兵种失去能力`;
    }

    return { totalExploded, totalDisabled, totalDestroyedCells, totalDugCells, totalRaisedCells };
  }

  simulatePlacePiece(sourceBoard, row, col, piece, player) {
    if (!this.isPlayablePoint(row, col)) return { ok: false, message: '不可落子' };
    if (sourceBoard[row][col] !== EMPTY) return { ok: false, message: '此处已有棋子' };

    const opponent = this.getOpponent(player);
    const beforeBoardKey = this.getBoardKey(sourceBoard);

    const nextBoard = this.cloneBoard(sourceBoard);
    nextBoard[row][col] = createPiece(piece.color, piece.type, piece.dir, piece.id || this.allocPieceId());

    let totalCaptured = [];
    let scoreCaptured = [];

    const stabilized = this.stabilizeBoardState(nextBoard);
    totalCaptured = stabilized.removed || [];
    scoreCaptured = stabilized.counted || [];

    const placedCell = nextBoard[row][col];
    if (piece.type !== 'yinyang') {
      if (!this.isPiece(placedCell) || placedCell.id !== piece.id) {
        return { ok: false, message: '禁入点：不可自杀' };
      }
      const selfGroup = this.getGroup(nextBoard, row, col);
      const selfLiberties = this.getLiberties(nextBoard, selfGroup);
      if (selfLiberties.size === 0) return { ok: false, message: '禁入点：不可自杀' };
    }

    const nextBoardKey = this.getBoardKey(nextBoard);
    if (nextBoardKey === this.previousBoardKey) {
      return { ok: false, message: '劫争：此处暂不可落子' };
    }

    return {
      ok: true,
      board: nextBoard,
      captured: totalCaptured,
      scoreCaptured,
      reborn: totalCaptured.length - scoreCaptured.length,
      beforeBoardKey
    };
  }

  processCapturedGroup(board, group) {
    const removed = [];
    const counted = [];

    const originalBoard = this.board;
    this.board = board;

    try {
      for (const [row, col] of group) {
        const cell = board[row][col];
        if (!this.isPiece(cell)) continue;

        removed.push([row, col]);
        const out = this.resolvePieceRemovalAt(row, col, {
          reason: 'capture',
          allowRebirth: true
        });

        if (out.counted) {
          counted.push([row, col]);
        }
      }
    } finally {
      this.board = originalBoard;
    }

    return { removed, counted };
  }

  hasEnemyAdjacent(row, col, color) {
    const enemy = this.getOpponent(color);
    const neighbors = this.getNeighborsForBoard(this.board, row, col);

    for (const [nr, nc] of neighbors) {
      const cell = this.board[nr][nc];
      if (this.isPiece(cell) && cell.color === enemy) return true;
    }
    return false;
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

  restorePlayableCell(row, col) {
    if (!this.isInside(row, col)) return false;

    if (BOARD_SHAPE[row][col] !== 1) {
      BOARD_SHAPE[row][col] = 1;
      this.boardConfig.shape = BOARD_SHAPE;
      this.board[row][col] = EMPTY;
      return true;
    }

    if (this.board[row][col] === DESTROYED) {
      this.board[row][col] = EMPTY;
      return true;
    }

    return false;
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
        row.map((cell) => {
          if (cell === INVALID) return 'X';
          if (cell === DESTROYED) return '#';
          if (cell === EMPTY) return '.';
          return `${cell.color}${cell.type}${cell.dir || '_'}${cell.armed ? 'A' : ''}${cell.archerReady ? 'H' : ''}${cell.archerCooldown != null ? `C${cell.archerCooldown}` : ''}${cell.rebirthReady && cell.rebirthTarget ? `@${cell.rebirthTarget.row}_${cell.rebirthTarget.col}` : ''}`;
        }).join(',')
      )
      .join('|');
  }


  isYinYangPiece(cell) {
    return this.isPiece(cell) && cell.type === 'yinyang';
  }

  getYinYangSideCells(row, col, color) {
    if (color === BLACK) {
      return [
        [row, col - 1],
        [row - 1, col]
      ];
    }
    if (color === WHITE) {
      return [
        [row, col + 1],
        [row + 1, col]
      ];
    }
    return [];
  }

  isYinYangLinkedForColor(yRow, yCol, neighborRow, neighborCol, color) {
    const dr = neighborRow - yRow;
    const dc = neighborCol - yCol;
    if (color === BLACK) {
      return (dr === 0 && dc === -1) || (dr === -1 && dc === 0);
    }
    if (color === WHITE) {
      return (dr === 0 && dc === 1) || (dr === 1 && dc === 0);
    }
    return false;
  }

  getYinYangSideLibertyKeys(board, row, col, color, visited = null) {
    const visit = visited || new Set();
    const visitKey = `${row},${col},${color}`;
    if (visit.has(visitKey)) return new Set();
    visit.add(visitKey);

    const liberties = new Set();
    const sideCells = this.getYinYangSideCells(row, col, color);
    for (const [sr, sc] of sideCells) {
      if (!this.isInside(sr, sc) || !this.isBoardShapeCell(sr, sc) || board[sr][sc] === DESTROYED) continue;
      const cell = board[sr][sc];
      if (cell === EMPTY) {
        liberties.add(`${sr},${sc}`);
        continue;
      }
      if (this.isPiece(cell) && cell.color === color) {
        const group = this.getGroup(board, sr, sc);
        const groupLiberties = this.getLiberties(board, group, { color, yinyangVisited: visit });
        groupLiberties.forEach((key) => liberties.add(key));
      }
    }
    return liberties;
  }

  resolveYinYangTransformTarget(board, row, col) {
    const cell = board[row][col];
    if (!this.isYinYangPiece(cell)) return null;
    const blackLibs = this.getYinYangSideLibertyKeys(board, row, col, BLACK).size;
    const whiteLibs = this.getYinYangSideLibertyKeys(board, row, col, WHITE).size;

    if (blackLibs <= 0 && whiteLibs > 0) return WHITE;
    if (whiteLibs <= 0 && blackLibs > 0) return BLACK;
    return null;
  }

  stabilizeBoardState(board, options = {}) {
    const removed = [];
    const counted = [];
    let changed = false;
    let loopGuard = 0;

    while (loopGuard < 24) {
      loopGuard += 1;
      let localChanged = false;

      for (let row = 0; row < BOARD_ROWS; row++) {
        for (let col = 0; col < BOARD_COLS; col++) {
          const cell = board[row][col];
          if (!this.isYinYangPiece(cell)) continue;
          const targetColor = this.resolveYinYangTransformTarget(board, row, col);
          if (!targetColor) continue;
          board[row][col] = createPiece(targetColor, 'normal', null, cell.id);
          localChanged = true;
          changed = true;
        }
      }

      const visited = new Set();
      const originalBoard = this.board;
      this.board = board;
      try {
        for (let row = 0; row < BOARD_ROWS; row++) {
          for (let col = 0; col < BOARD_COLS; col++) {
            const cell = board[row][col];
            if (!this.isPiece(cell) || cell.color !== BLACK && cell.color !== WHITE) continue;
            const key = `${row},${col}`;
            if (visited.has(key)) continue;
            const group = this.getGroup(board, row, col);
            for (const [gr, gc] of group) visited.add(`${gr},${gc}`);
            const liberties = this.getLiberties(board, group);
            if (liberties.size !== 0) continue;
            const out = this.processCapturedGroup(board, group);
            removed.push(...out.removed);
            counted.push(...out.counted);
            localChanged = true;
            changed = true;
          }
        }
      } finally {
        this.board = originalBoard;
      }

      if (!localChanged) break;
    }

    return { board, removed, counted, changed };
  }

  getNeighborsForBoard(board, row, col) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    const result = [];

    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (this.isInside(nr, nc) && BOARD_SHAPE[nr][nc] === 1 && board[nr][nc] !== DESTROYED) {
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

  getLiberties(board, group, options = null) {
    const liberties = new Set();
    if (!group || group.length === 0) return liberties;

    const first = board[group[0][0]][group[0][1]];
    const color = options && options.color ? options.color : (this.isPiece(first) ? first.color : null);
    const yinyangVisited = options && options.yinyangVisited ? options.yinyangVisited : new Set();

    for (const [row, col] of group) {
      const neighbors = this.getNeighborsForBoard(board, row, col);
      for (const [nr, nc] of neighbors) {
        const cell = board[nr][nc];
        if (cell === EMPTY) {
          liberties.add(`${nr},${nc}`);
          continue;
        }
        if ((color === BLACK || color === WHITE) && this.isYinYangPiece(cell) && this.isYinYangLinkedForColor(nr, nc, row, col, color)) {
          const sideLiberties = this.getYinYangSideLibertyKeys(board, nr, nc, color, yinyangVisited);
          sideLiberties.forEach((key) => liberties.add(key));
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
    const approxCol = Math.round((x - this.originX) / this.cellSize);
    const approxRow = Math.round((y - this.originY) / this.cellSize);

    let nearest = null;
    let minDist = Infinity;
    const threshold = Math.max(12, this.cellSize * 0.6);

    for (let row = approxRow - 2; row <= approxRow + 2; row++) {
      for (let col = approxCol - 2; col <= approxCol + 2; col++) {
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

    if (!nearest) {
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
    }

    return nearest && minDist <= threshold ? nearest : null;
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
    return this.hitCustomDirectionButton(x, y, this.directionButtons);
  }

  hitCustomDirectionButton(x, y, buttons) {
    if (!buttons) return null;
    for (const dir of ['U', 'D', 'L', 'R']) {
      const btn = buttons[dir];
      if (!btn) continue;
      const dx = x - btn.x;
      const dy = y - btn.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= btn.size * 1.2) return dir;
    }
    return null;
  }

  initTurnTimers() {
    const totalMs = 5 * 60 * 1000;
    this.turnTimers = { black: totalMs, white: totalMs };
    this.lastTimerUpdateAt = Date.now();
  }

  syncActiveTurnTimer() {
    if (!this.turnTimers || this.gameOver || !this.currentPlayer) {
      this.lastTimerUpdateAt = Date.now();
      return;
    }

    const now = Date.now();
    const last = this.lastTimerUpdateAt || now;
    const delta = Math.max(0, now - last);
    if (delta <= 0) {
      this.lastTimerUpdateAt = now;
      return;
    }

    const key = this.getColorKey(this.currentPlayer);
    const remain = Math.max(0, (this.turnTimers[key] || 0) - delta);
    this.turnTimers[key] = remain;
    this.lastTimerUpdateAt = now;

    if (remain <= 0) {
      this.handleTimeoutLoss(this.currentPlayer);
    }
  }

  handleTimeoutLoss(loser) {
    if (this.gameOver) return;
    const loserKey = this.getColorKey(loser);
    this.turnTimers[loserKey] = 0;
    this.clearTurnPressure(false);
    this.gameOver = true;
    this.winner = this.getOpponent(loser);
    this.clearPendingSelection();
    this.clearPendingConfirmPlacement();
    this.clearPendingContractPlacement();
    this.clearPendingSacrificePlacement();
    this.clearPendingRebirthPlacement();
    this.clearPendingPersuaderPlacement();
    this.clearPendingThiefPlacement();
    this.clearPendingTeleportPlacement();
    this.clearPendingRelocatePlacement();
    this.clearPendingSwapCardSelection();
    this.pendingFogPlacement = null;
    this.pendingPlacement = null;
    this.directionButtons = null;
    this.scoreRequestState = null;
    this.scoreSummary = null;
    this.scoreTerritoryMap = null;
    this.scoreReviewMode = false;
    const loserText = this.getColorName(loser);
    const winnerText = this.getColorName(this.winner);
    this.statusMessage = `${loserText}超时，${winnerText}获胜`;
    this.victoryDialog = {
      title: '对局结束',
      message: `${winnerText}赢了`,
      detail: `${loserText}5分钟倒计时耗尽，判负。`,
      confirmText: '确认返回主界面',
      reviewText: ''
    };
  }

  armTurnPressure(targetPlayer, seconds = 10, ownerColor = null) {
    this.timeLimitEffect = {
      targetPlayer,
      seconds,
      ownerColor,
      armed: true
    };
  }

  isTurnPressureActiveForPlayer(player) {
    return !!(this.turnPressure && this.turnPressure.active && this.turnPressure.targetPlayer === player);
  }

  activatePendingTurnPressureForPlayer(player) {
    if (!this.timeLimitEffect || !this.timeLimitEffect.armed) return false;
    if (this.timeLimitEffect.targetPlayer !== player) return false;

    const seconds = Math.max(1, Number(this.timeLimitEffect.seconds || 10));
    const now = Date.now();
    this.turnPressure = {
      active: true,
      targetPlayer: player,
      startedAt: now,
      durationMs: seconds * 1000,
      remainingMs: seconds * 1000,
      displaySeconds: seconds,
      pulsePhase: 0
    };
    this.timeLimitEffect.armed = false;
    return true;
  }

  clearTurnPressure(clearEffect = true) {
    if (this.turnPressure) {
      this.turnPressure.active = false;
      this.turnPressure.targetPlayer = null;
      this.turnPressure.remainingMs = 0;
      this.turnPressure.displaySeconds = 0;
      this.turnPressure.startedAt = 0;
      this.turnPressure.durationMs = 0;
      this.turnPressure.pulsePhase = 0;
    }
    if (clearEffect) {
      this.timeLimitEffect = null;
    }
  }

  updateTurnPressure() {
    if (!this.turnPressure || !this.turnPressure.active || this.gameOver || !this.currentPlayer) return;
    if (this.turnPressure.targetPlayer !== this.currentPlayer) {
      this.clearTurnPressure(false);
      return;
    }

    const now = Date.now();
    const elapsed = Math.max(0, now - (this.turnPressure.startedAt || now));
    const remainingMs = Math.max(0, (this.turnPressure.durationMs || 0) - elapsed);
    this.turnPressure.remainingMs = remainingMs;
    this.turnPressure.displaySeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    this.turnPressure.pulsePhase = now;

    if (remainingMs <= 0) {
      this.handleTurnPressureTimeout();
    }
  }

  handleTurnPressureTimeout() {
    if (!this.turnPressure || !this.turnPressure.active || this.gameOver) return false;
    const skippedPlayer = this.turnPressure.targetPlayer || this.currentPlayer;
    if (skippedPlayer !== this.currentPlayer) {
      this.clearTurnPressure(true);
      return false;
    }

    this.clearPendingSelection();
    this.clearPendingConfirmPlacement();
    this.clearPendingContractPlacement();
    this.clearPendingSacrificePlacement();
    this.clearPendingRebirthPlacement();
    this.clearPendingPersuaderPlacement();
    this.clearPendingThiefPlacement();
    this.clearPendingTeleportPlacement();
    this.clearPendingRelocatePlacement();
    this.clearPendingSwapCardSelection();
    this.pendingFogPlacement = null;
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.clearTurnPressure(true);

    const nextPlayer = this.getOpponent(skippedPlayer);
    this.setCurrentPlayer(nextPlayer);
    const turnStartInfo = this.resolveTurnStartSpecials(this.currentPlayer);
    if (this.isFogActiveForPlayer(this.getOpponent(this.currentPlayer))) {
      this.clearFog();
    }

    const skippedText = this.getColorName(skippedPlayer);
    if (turnStartInfo.plagueInfo && (turnStartInfo.plagueInfo.deathCount > 0 || turnStartInfo.plagueInfo.recoverCount > 0)) {
      this.statusMessage = `${skippedText}10秒超时，回合被跳过；瘟疫结算：病死 ${turnStartInfo.plagueInfo.deathCount} 枚，康复 ${turnStartInfo.plagueInfo.recoverCount} 枚`;
    } else if (turnStartInfo.archerDisabledCount > 0) {
      this.statusMessage = `${skippedText}10秒超时，回合被跳过；同时有 ${turnStartInfo.archerDisabledCount} 枚弓箭手被敌子贴身，失去射箭能力`;
    } else if (turnStartInfo.archerShotCount > 0) {
      this.statusMessage = turnStartInfo.archerKillCount > 0
        ? `${skippedText}10秒超时，回合被跳过；同时弓箭手放箭击杀 ${turnStartInfo.archerKillCount} 枚`
        : `${skippedText}10秒超时，回合被跳过；同时弓箭手放箭但前方没有目标`;
    } else if (turnStartInfo.teleportInfo && turnStartInfo.teleportInfo.failedCount > 0) {
      this.statusMessage = `${skippedText}10秒超时，回合被跳过；同时有 ${turnStartInfo.teleportInfo.failedCount} 枚瞬移子受阻失效`;
    } else if (turnStartInfo.teleportInfo && turnStartInfo.teleportInfo.movedCount > 0) {
      this.statusMessage = `${skippedText}10秒超时，回合被跳过；同时有 ${turnStartInfo.teleportInfo.movedCount} 枚瞬移子完成跳跃`;
    } else {
      this.statusMessage = `${skippedText}10秒超时，自动跳过本回合`;
    }

    return true;
  }

  drawTurnPressureOverlay() {
    if (!this.turnPressure || !this.turnPressure.active || this.gameOver) return;

    const remaining = Math.max(0, this.turnPressure.displaySeconds || 0);
    const now = Date.now();
    const critical = remaining <= 3;
    const pulse = 1 + 0.16 * Math.sin(now / 180);
    const shake = critical ? 4 : 1.5;
    const dx = (Math.random() - 0.5) * shake;
    const dy = (Math.random() - 0.5) * shake;
    const alpha = critical ? (0.78 + 0.22 * Math.sin(now / 65)) : 0.92;
    const baseSize = critical ? 158 : 142;
    const ringAlpha = critical
      ? (0.16 + 0.06 * (0.5 + 0.5 * Math.sin(now / 120)))
      : 0.10;

    ctx.save();
    ctx.translate(dx, dy);

    ctx.fillStyle = 'rgba(20, 0, 0, 0.18)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = SCREEN_WIDTH / 2;
    const centerY = SCREEN_HEIGHT * 0.30;

    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(centerX, centerY + 8, 118 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.shadowColor = '#ff2d2d';
    ctx.shadowBlur = critical ? 32 : 24;
    ctx.lineWidth = critical ? 8 : 6;
    ctx.strokeStyle = critical ? 'rgba(255, 110, 110, 0.72)' : 'rgba(255, 110, 110, 0.62)';
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(150, 0, 0, ${ringAlpha})`;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 106 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    ctx.stroke();

    ctx.fillStyle = '#ff1a1a';
    ctx.font = `bold ${Math.floor(baseSize * pulse)}px Arial`;
    ctx.fillText(String(remaining), centerX, centerY + 4);

    ctx.shadowBlur = critical ? 22 : 14;
    ctx.font = `bold ${Math.floor(34 + 4 * Math.sin(now / 220))}px Arial`;
    ctx.fillStyle = '#ffd6d6';
    ctx.fillText('限时', centerX, centerY - 102 * pulse);

    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#ffe0e0';
    ctx.fillText('秒内落子，否则本回合跳过', centerX, centerY + 128 * pulse);

    ctx.restore();
  }

  formatTimer(ms) {
    const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  update() {
    this.syncActiveTurnTimer();
    this.updateTurnPressure();
  }

  render() {
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.drawBackground();

    // 先绘制所有棋盘相关内容，再绘制顶部控件，避免缩放后的棋盘遮挡顶部 UI。
    this.drawBoard();
    this.drawScoreTerritoryOverlay();
    this.drawPieces();
    this.drawRebirthTargets();
    this.drawContracts();
    this.drawTeleportPaths();
    this.drawPendingTeleportTargetHint();
    this.drawPendingNightmareTargetHint();
    this.drawPendingFogTargetHint();
    this.drawPendingRelocateAreas();
    this.drawFogOverlay();
    this.drawPendingConfirmPlacement();
    this.drawPendingPlacement();

    // 顶部控件始终浮在棋盘之上。
    this.drawTopBar();
    this.drawDesktopZoomControls();
    this.drawBottomUI();
    this.drawTurnPressureOverlay();
    this.drawScoreRequestDialog();
    this.drawUndoRequestDialog();
    this.drawVictoryDialog();
  }

  drawBackground() {
    ctx.fillStyle = '#cfa96a';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  drawTopBar() {
    const backText = (this.scoreReviewMode || this.replayMode) ? '返回主页' : '返回';
    drawButton(this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h, '#34495e', backText);
    if (this.scoreReviewMode) {
      drawButton(this.scoreRequestBtn.x, this.scoreRequestBtn.y, this.scoreRequestBtn.w, this.scoreRequestBtn.h, '#f1c40f', '点目结果', 18, '#3b2a18');
      drawButton(this.undoRequestBtn.x, this.undoRequestBtn.y, this.undoRequestBtn.w, this.undoRequestBtn.h, '#bdc3c7', '已锁定', 18, '#5f6a6a');
      drawButton(this.restartBtn.x, this.restartBtn.y, this.restartBtn.w, this.restartBtn.h, '#8e44ad', '终局复盘', 18, '#ffffff');
    } else if (this.replayMode) {
      const scoreBtnColor = this.scoreSummary ? '#f1c40f' : '#bdc3c7';
      const scoreBtnTextColor = this.scoreSummary ? '#3b2a18' : '#5f6a6a';
      drawButton(this.scoreRequestBtn.x, this.scoreRequestBtn.y, this.scoreRequestBtn.w, this.scoreRequestBtn.h, scoreBtnColor, this.scoreSummary ? '点目结果' : '无点目结果', 18, scoreBtnTextColor);
      drawButton(this.undoRequestBtn.x, this.undoRequestBtn.y, this.undoRequestBtn.w, this.undoRequestBtn.h, '#bdc3c7', '复盘中', 18, '#5f6a6a');
      drawButton(this.restartBtn.x, this.restartBtn.y, this.restartBtn.w, this.restartBtn.h, '#8e44ad', '终局复盘', 18, '#ffffff');
    } else {
      drawButton(this.scoreRequestBtn.x, this.scoreRequestBtn.y, this.scoreRequestBtn.w, this.scoreRequestBtn.h, '#f1c40f', '申请点目', 20, '#3b2a18');
      drawButton(this.undoRequestBtn.x, this.undoRequestBtn.y, this.undoRequestBtn.w, this.undoRequestBtn.h, '#e67e22', '申请悔棋', 20, '#3b2a18');
      drawButton(this.restartBtn.x, this.restartBtn.y, this.restartBtn.w, this.restartBtn.h, '#27ae60', '重开');
    }


    ctx.font = '16px Arial';
    ctx.fillStyle = '#5b3a1f';
    ctx.fillText(this.statusMessage || ' ', SCREEN_WIDTH / 2, this.msgTextY);

    this.drawMiniCardPreview('black');
    this.drawMiniCardPreview('white');
  }


  drawDesktopZoomControls() {
    if (!this.zoomControls || !this.isDesktopLike) return;
    const z = this.zoomControls;
    drawButton(z.zoomInBtn.x, z.zoomInBtn.y, z.zoomInBtn.w, z.zoomInBtn.h, '#2c3e50', '+', 26, '#ffffff');
    drawButton(z.zoomOutBtn.x, z.zoomOutBtn.y, z.zoomOutBtn.w, z.zoomOutBtn.h, '#2c3e50', '−', 28, '#ffffff');
    drawButton(z.zoomResetBtn.x, z.zoomResetBtn.y, z.zoomResetBtn.w, z.zoomResetBtn.h, '#7f8c8d', '1:1', 14, '#ffffff');
  }

  drawMiniCardPreview(color) {
    const isBlack = this.getColorKey(color) === 'black';
    const sideKey = isBlack ? 'black' : 'white';
    const sideColor = isBlack ? BLACK : WHITE;
    const loadout = this.cardLoadoutByColor ? this.cardLoadoutByColor[sideKey] : [];
    const layout = this.getMiniCardPreviewLayout(sideKey);
    const { x, y, w, h } = layout;
    const isCurrentTurn = this.currentPlayer === sideColor;

    ctx.save();
    ctx.fillStyle = isBlack ? 'rgba(0,0,0,0.58)' : 'rgba(255,255,255,0.72)';
    ctx.strokeStyle = isCurrentTurn ? '#f1c40f' : '#8e6e3b';
    ctx.lineWidth = isCurrentTurn ? 3 : 2;
    this.drawRoundedRect(x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = isBlack ? '#f7f7f7' : '#3b2a18';
    ctx.fillText(isBlack ? '黑方卡槽' : '白方卡槽', x + w / 2, y + 11);

    for (let i = 0; i < this.maxCardSlots; i++) {
      const card = loadout ? loadout[i] : null;
      const slot = layout.slots[i];
      const cx = slot.x;
      const cy = slot.y;
      const cardW = slot.w;
      const cardH = slot.h;
      ctx.save();
      ctx.globalAlpha = !card ? 0.28 : (card.used ? 0.35 : 1);
      ctx.fillStyle = '#f3e5c8';
      ctx.strokeStyle = '#8e6e3b';
      ctx.lineWidth = 1.5;
      this.drawRoundedRect(cx, cy, cardW, cardH, 6);
      ctx.fill();
      ctx.stroke();
      if (card) {
        const def = getPieceDef(this.pieceMap, card.type);
        ctx.fillStyle = '#5b3a1f';
        ctx.font = '18px Arial';
        ctx.fillText(def.symbol || '●', cx + cardW / 2, cy + 14);
        const activeType = this.currentPlayer === sideColor
          ? this.nextPieceType
          : (this.nextPieceTypeByColor && this.nextPieceTypeByColor[sideKey]);
        if (activeType === card.type && !card.used) {
          ctx.strokeStyle = '#c0392b';
          ctx.lineWidth = 2;
          this.drawRoundedRect(cx + 1, cy + 1, cardW - 2, cardH - 2, 5);
          ctx.stroke();
        }
        if (this.pendingSwapCardSelection && this.pendingSwapCardSelection.stage === 'enemy' && this.currentPlayer !== sideColor && !card.used) {
          ctx.strokeStyle = '#1e90ff';
          ctx.lineWidth = 2;
          this.drawRoundedRect(cx + 2, cy + 2, cardW - 4, cardH - 4, 4);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    this.drawMiniTurnStone(sideColor, x + w / 2, y - 25, isCurrentTurn);

    const timer = this.turnTimers ? this.formatTimer(this.turnTimers[sideKey]) : '05:00';
    const captures = this.captureCounts ? this.captureCounts[sideKey] : 0;
    ctx.fillStyle = '#2f2418';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('提子', x + w / 2, y + h + this.previewInfoGap + 2);
    ctx.font = 'bold 20px Arial';
    ctx.fillText(String(captures), x + w / 2, y + h + this.previewInfoGap + this.previewInfoLineH);
    ctx.font = 'bold 16px Arial';
    ctx.fillText('倒计时', x + w / 2, y + h + this.previewInfoGap + this.previewInfoLineH * 2 + 12);
    ctx.font = 'bold 20px Arial';
    ctx.fillText(timer, x + w / 2, y + h + this.previewInfoGap + this.previewInfoLineH * 3 + 10);

    ctx.restore();
  }

  drawScoreTerritoryOverlay() {
    if (!this.scoreReviewMode || !this.scoreTerritoryMap) return;

    const board = this.getDisplayBoard();
    ctx.save();
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (!this.isBoardShapeCell(row, col)) continue;
        if (board[row][col] !== EMPTY) continue;

        const owner = this.scoreTerritoryMap[row] ? this.scoreTerritoryMap[row][col] : null;
        if (!owner || owner === 'none') continue;

        const { x, y } = this.boardToScreen(row, col);
        const radius = Math.max(8, this.cellSize * 0.28);

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);

        if (owner === 'black') {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
        } else if (owner === 'white') {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
          ctx.strokeStyle = 'rgba(120, 90, 40, 0.9)';
        } else {
          ctx.fillStyle = 'rgba(241, 196, 15, 0.30)';
          ctx.strokeStyle = 'rgba(160, 110, 20, 0.85)';
        }

        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawMiniTurnStone(color, cx, cy, isActive) {
    const radius = 20;
    const pulse = isActive ? (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(Date.now() / 180))) : 1;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = color === BLACK ? '#111' : '#f7f7f7';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = color === BLACK ? '#f1c40f' : '#8e6e3b';
    ctx.stroke();
    if (color === WHITE) {
      ctx.beginPath();
      ctx.arc(cx - radius * 0.28, cy - radius * 0.28, radius * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fill();
    }
    ctx.restore();
  }

  drawBoard() {
    this.drawBoardBackground();
    this.drawBoardLines();
    this.drawBoardPoints();
    this.drawVisibleTraps();
    this.drawDestroyedCells();
  }

  drawVisibleTraps() {
    const traps = Array.isArray(this.trapState) ? this.trapState : [];
    const pieceDef = getPieceDef(this.pieceMap, 'trap');
    for (const trap of traps) {
      if (!this.isTrapVisibleToCurrentPlayer(trap)) continue;
      if (!this.isPlayablePoint(trap.row, trap.col)) continue;
      const cell = this.getDisplayBoard()[trap.row][trap.col];
      if (cell !== EMPTY) continue;
      const { x, y } = this.boardToScreen(trap.row, trap.col);
      const boxSize = this.cellSize * 0.72;
      const half = boxSize / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(160, 160, 160, 0.14)';
      ctx.fillRect(x - half, y - half, boxSize, boxSize);
      ctx.strokeStyle = 'rgba(110, 110, 110, 0.95)';
      ctx.lineWidth = Math.max(1.5, this.cellSize * 0.04);
      if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([Math.max(4, this.cellSize * 0.12), Math.max(3, this.cellSize * 0.08)]);
      }
      ctx.strokeRect(x - half, y - half, boxSize, boxSize);
      if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([]);
      }
      ctx.fillStyle = '#555';
      ctx.font = `bold ${Math.max(12, this.cellSize * 0.24)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pieceDef.symbol || '☒', x, y - this.cellSize * 0.13);
      ctx.font = `bold ${Math.max(10, this.cellSize * 0.18)}px Arial`;
      ctx.fillText('陷阱', x, y + this.cellSize * 0.16);
      ctx.restore();
    }
  }

  drawScoreRequestDialog() {
    if (!this.scoreRequestState || !this.scoreRequestState.dialogVisible || !this.scoreRequestDialog) return;

    const dialog = this.scoreRequestDialog;
    const requesterText = this.getColorName(this.scoreRequestState.requester);
    const responderText = this.getColorName(this.scoreRequestState.responder);

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.fillStyle = '#f7e8c6';
    ctx.strokeStyle = '#6b4f2c';
    ctx.lineWidth = 4;
    ctx.fillRect(dialog.x, dialog.y, dialog.w, dialog.h);
    ctx.strokeRect(dialog.x, dialog.y, dialog.w, dialog.h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3b2a18';
    ctx.font = 'bold 28px Arial';
    ctx.fillText('申请点目', dialog.x + dialog.w / 2, dialog.y + 42);

    ctx.fillStyle = '#1f1f1f';
    ctx.font = '20px Arial';
    ctx.fillText(`${requesterText}申请点目`, dialog.x + dialog.w / 2, dialog.y + 92);
    ctx.fillText(`${responderText}是否接受？`, dialog.x + dialog.w / 2, dialog.y + 124);

    drawButton(dialog.refuseBtn.x, dialog.refuseBtn.y, dialog.refuseBtn.w, dialog.refuseBtn.h, '#95a5a6', '拒绝', 20);
    drawButton(dialog.acceptBtn.x, dialog.acceptBtn.y, dialog.acceptBtn.w, dialog.acceptBtn.h, '#f1c40f', '接受', 20, '#3b2a18');
    ctx.restore();
  }

  drawUndoRequestDialog() {
    if (!this.undoRequestState || !this.undoRequestState.dialogVisible || !this.undoRequestDialog) return;

    const dialog = this.undoRequestDialog;
    const requesterText = this.getColorName(this.undoRequestState.requester);
    const responderText = this.getColorName(this.undoRequestState.responder);

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.fillStyle = '#f7e8c6';
    ctx.strokeStyle = '#6b4f2c';
    ctx.lineWidth = 4;
    ctx.fillRect(dialog.x, dialog.y, dialog.w, dialog.h);
    ctx.strokeRect(dialog.x, dialog.y, dialog.w, dialog.h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3b2a18';
    ctx.font = 'bold 28px Arial';
    ctx.fillText('申请悔棋', dialog.x + dialog.w / 2, dialog.y + 42);

    ctx.fillStyle = '#1f1f1f';
    ctx.font = '20px Arial';
    ctx.fillText(`${requesterText}申请悔棋`, dialog.x + dialog.w / 2, dialog.y + 92);
    ctx.fillText(`${responderText}是否同意？`, dialog.x + dialog.w / 2, dialog.y + 124);

    drawButton(dialog.refuseBtn.x, dialog.refuseBtn.y, dialog.refuseBtn.w, dialog.refuseBtn.h, '#95a5a6', '不同意', 20);
    drawButton(dialog.acceptBtn.x, dialog.acceptBtn.y, dialog.acceptBtn.w, dialog.acceptBtn.h, '#e67e22', '同意', 20, '#3b2a18');
    ctx.restore();
  }


  drawVictoryDialog() {
    if (!this.gameOver || this.isTutorialMode || !this.victoryDialog) return;

    const dialog = this.victoryDialog;
    const rect = this.buildVictoryDialogLayout();
    dialog.confirmBtn = rect.confirmBtn;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.fillStyle = '#f7e8c6';
    ctx.strokeStyle = '#6b4f2c';
    ctx.lineWidth = 4;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3b2a18';
    ctx.font = 'bold 28px Arial';
    ctx.fillText(dialog.title || '对局结束', rect.x + rect.w / 2, rect.y + 42);

    let currentY = rect.y + 96;
    const messageLines = rect.messageLines || [];
    if (messageLines.length > 0) {
      ctx.fillStyle = '#1f1f1f';
      ctx.font = 'bold 34px Arial';
      for (const line of messageLines) {
        ctx.fillText(line, rect.x + rect.w / 2, currentY);
        currentY += 40;
      }
    }

    const detailLines = rect.detailLines || [];
    if (detailLines.length > 0) {
      currentY += 6;
      ctx.fillStyle = '#6b4f2c';
      ctx.font = '18px Arial';
      for (const line of detailLines) {
        ctx.fillText(line, rect.x + rect.w / 2, currentY);
        currentY += 24;
      }
    }

    drawButton(rect.confirmBtn.x, rect.confirmBtn.y, rect.confirmBtn.w, rect.confirmBtn.h, '#27ae60', dialog.confirmText || '确认');
    if (rect.scoreReviewBtn) {
      drawButton(rect.scoreReviewBtn.x, rect.scoreReviewBtn.y, rect.scoreReviewBtn.w, rect.scoreReviewBtn.h, '#f1c40f', dialog.scoreReviewText || '查看点目结果', 20, '#3b2a18');
    }
    if (rect.replayBtn) {
      drawButton(rect.replayBtn.x, rect.replayBtn.y, rect.replayBtn.w, rect.replayBtn.h, '#8e44ad', dialog.replayText || '进入复盘', 20, '#ffffff');
    }
    ctx.restore();
  }

  drawBoardBackground() {
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

  getDisplayBoard() {
    return this.scoreReviewMode && this.scoreReviewBoard ? this.scoreReviewBoard : this.board;
  }

  canDrawConnection(row, col) {
    const board = this.getDisplayBoard();
    return this.isBoardShapeCell(row, col) && board[row][col] !== DESTROYED;
  }

  drawBoardPoints() {
    const board = this.getDisplayBoard();
    ctx.fillStyle = '#2c1e12';
    const centerRow = Math.round((this.minRow + this.maxRow) / 2);
    const centerCol = Math.round((this.minCol + this.maxCol) / 2);

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (!this.isBoardShapeCell(row, col) || board[row][col] === DESTROYED) continue;
        const { x, y } = this.boardToScreen(row, col);
        const isTengen = row === centerRow && col === centerCol;
        const radius = isTengen ? Math.max(4.5, this.cellSize * 0.16) : Math.max(0.2, this.cellSize * 0.04);

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawDestroyedCells() {
    const board = this.getDisplayBoard();
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (board[row][col] !== DESTROYED) continue;
        const { x, y } = this.boardToScreen(row, col);
        const size = this.cellSize * 1.08;

        ctx.save();
        ctx.fillStyle = '#cfa96a';
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        ctx.restore();
      }
    }
  }

  drawPieces() {
    const board = this.getDisplayBoard();
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = board[row][col];
        if (!this.isPiece(cell)) continue;
        const { x, y } = this.boardToScreen(row, col);
        this.drawOnePiece(x, y, cell, row, col);
      }
    }
  }

  drawRebirthTargets() {
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (!this.isPiece(cell) || !cell.rebirthReady || !cell.rebirthTarget) continue;

        const from = this.boardToScreen(row, col);
        const to = this.boardToScreen(cell.rebirthTarget.row, cell.rebirthTarget.col);

        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.95)';
        ctx.lineWidth = 4;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(to.x, to.y, Math.max(6, this.cellSize * 0.18), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 255, 136, 1)';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = '#2e8b57';
        ctx.font = `${Math.max(10, this.cellSize * 0.3)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🌱', to.x, to.y + 1);
        ctx.restore();
      }
    }
  }


  drawTeleportPaths() {
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
        if (!this.isPiece(cell) || cell.type !== 'teleport') continue;
        const targets = Array.isArray(cell.teleportTargets) ? cell.teleportTargets.slice(Math.max(0, Number(cell.teleportStep || 0))) : [];
        if (targets.length === 0) continue;

        let from = this.boardToScreen(row, col);
        ctx.save();
        ctx.strokeStyle = 'rgba(80, 170, 255, 0.9)';
        ctx.lineWidth = Math.max(2, this.cellSize * 0.08);
        ctx.setLineDash([8, 6]);
        for (const target of targets) {
          const to = this.boardToScreen(target.row, target.col);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(to.x, to.y, Math.max(7, this.cellSize * 0.2), 0, Math.PI * 2);
          ctx.stroke();
          from = to;
        }
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }

  drawPendingRelocateAreas() {
    const pending = this.pendingRelocatePlacement;
    if (!pending) return;

    const pulse = 0.3 + (Math.sin(Date.now() / 180) + 1) * 0.18;
    pending.firstConfirmBtn = null;
    pending.secondConfirmBtn = null;

    if (pending.firstArea) {
      pending.firstConfirmBtn = this.drawRelocateAreaOverlay(pending.firstArea, {
        color: 'rgba(255, 140, 0, 0.95)',
        fill: `rgba(255, 165, 0, ${pulse})`,
        label: pending.stage === 'first_select' ? '区域1' : '已确认1',
        showConfirm: pending.stage === 'first_select'
      });
    }

    if (pending.secondArea) {
      pending.secondConfirmBtn = this.drawRelocateAreaOverlay(pending.secondArea, {
        color: 'rgba(60, 140, 255, 0.98)',
        fill: `rgba(64, 156, 255, ${pulse})`,
        label: '区域2',
        showConfirm: pending.stage === 'second_select'
      });
    }
  }

  drawRelocateAreaOverlay(anchor, options = {}) {
    const cells = this.buildRelocateAreaCells(anchor);
    if (cells.length !== 4) return null;

    const xs = [];
    const ys = [];
    for (const cell of cells) {
      const p = this.boardToScreen(cell.row, cell.col);
      xs.push(p.x);
      ys.push(p.y);
    }

    const left = Math.min(...xs) - this.cellSize * 0.5;
    const right = Math.max(...xs) + this.cellSize * 0.5;
    const top = Math.min(...ys) - this.cellSize * 0.5;
    const bottom = Math.max(...ys) + this.cellSize * 0.5;

    ctx.save();
    ctx.fillStyle = options.fill || 'rgba(255,165,0,0.25)';
    ctx.strokeStyle = options.color || 'rgba(255,140,0,0.95)';
    ctx.lineWidth = Math.max(3, this.cellSize * 0.1);
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.strokeRect(left, top, right - left, bottom - top);

    if (options.label) {
      ctx.fillStyle = options.color || '#ff8c00';
      ctx.font = `bold ${Math.max(10, this.cellSize * 0.26)}px Arial`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(options.label, left + 4, top - 4);
    }
    ctx.restore();

    if (!options.showConfirm) return null;

    const btnSize = Math.max(22, this.cellSize * 0.5);
    const btn = {
      x: right - btnSize * 0.5,
      y: top - btnSize * 0.6,
      w: btnSize,
      h: btnSize
    };
    const hitBtn = {
      x: btn.x - Math.max(8, btnSize * 0.2),
      y: btn.y - Math.max(8, btnSize * 0.2),
      w: btn.w + Math.max(16, btnSize * 0.4),
      h: btn.h + Math.max(16, btnSize * 0.4)
    };

    ctx.save();
    ctx.fillStyle = '#2ecc71';
    ctx.strokeStyle = '#145a32';
    ctx.lineWidth = 2;
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(12, btnSize * 0.62)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✓', btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
    ctx.restore();

    return hitBtn;
  }

  drawPendingTeleportTargetHint() {
    const pending = this.pendingTeleportPlacement;
    if (!pending) return;

    const found = this.findPiecePositionById(pending.pieceId);
    if (!found) return;

    const points = [{ row: found.row, col: found.col }, ...(pending.targets || [])];
    ctx.save();
    ctx.strokeStyle = 'rgba(80, 170, 255, 0.95)';
    ctx.lineWidth = Math.max(2, this.cellSize * 0.08);
    ctx.setLineDash([8, 6]);
    for (let i = 0; i < points.length - 1; i++) {
      const a = this.boardToScreen(points[i].row, points[i].col);
      const b = this.boardToScreen(points[i + 1].row, points[i + 1].col);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let i = 1; i < points.length; i++) {
      const p = this.boardToScreen(points[i].row, points[i].col);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(7, this.cellSize * 0.2), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(80, 170, 255, 0.16)';
      ctx.fill();
    }
    ctx.setLineDash([]);
    const src = this.boardToScreen(found.row, found.col);
    ctx.fillStyle = 'rgba(20, 60, 120, 0.9)';
    ctx.font = `${Math.max(10, this.cellSize * 0.28)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((pending.targets || []).length === 0 ? '选第1点' : '选第2点', src.x, src.y - this.cellSize * 0.65);
    ctx.restore();
  }

  drawPendingNightmareTargetHint() {
    const pending = this.pendingNightmarePlacement;
    if (!pending) return;
    if (pending.targetRow == null || pending.targetCol == null) return;

    let row = pending.targetRow;
    let col = pending.targetCol;
    const found = pending.targetId ? this.findPiecePositionById(pending.targetId) : null;
    if (found && this.isPiece(found.cell)) {
      row = found.row;
      col = found.col;
      pending.targetRow = row;
      pending.targetCol = col;
    }

    this.nightmareDirectionButtons = this.buildDirectionButtons(row, col);
    const center = this.boardToScreen(row, col);

    ctx.save();
    ctx.strokeStyle = 'rgba(150, 50, 220, 0.95)';
    ctx.lineWidth = Math.max(2, this.cellSize * 0.08);
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, Math.max(12, this.cellSize * 0.5), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(90, 20, 140, 0.9)';
    ctx.font = `${Math.max(10, this.cellSize * 0.28)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('选方向', center.x, center.y - this.cellSize * 0.72);
    ctx.restore();

    this.drawDirectionButtonsSet(this.nightmareDirectionButtons, 'rgba(150, 50, 220, 0.9)');
  }

  drawPendingFogTargetHint() {
    const pending = this.pendingFogPlacement;
    if (!pending) return;

    const found = this.findPiecePositionById(pending.pieceId);
    if (!found) return;

    const { x, y } = this.boardToScreen(found.row, found.col);
    ctx.save();
    ctx.strokeStyle = 'rgba(120, 120, 120, 0.95)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(12, this.cellSize * 0.44), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(40, 40, 40, 0.82)';
    ctx.font = `${Math.max(10, this.cellSize * 0.28)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('选烟雾点', x, y - this.cellSize * 0.62);
    ctx.restore();
  }

  drawFogOverlay() {
    if (!this.fogState) return;

    const tutorialPreview =
      this.isTutorialMode &&
      this.tutorialLevel &&
      this.tutorialLevel.pieceType === 'fog' &&
      Date.now() < (this.tutorialFogPreviewUntil || 0);

    if (!tutorialPreview && !this.isFogActiveForPlayer(this.currentPlayer)) return;
  
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (!this.isPointInsideFog(row, col)) continue;
        if (!this.isBoardShapeCell(row, col)) continue;
  
        const { x, y } = this.boardToScreen(row, col);
        const size = this.cellSize * 0.96;
  
        ctx.save();
        ctx.fillStyle = '#111';
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
  
        ctx.fillStyle = '#bbb';
        ctx.font = `${Math.max(12, this.cellSize * 0.34)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('☁', x, y);
        ctx.restore();
      }
    }
  }

  drawOnePiece(x, y, cell, row, col, isPreview = false) {
    const r = this.cellSize * 0.36;
    const pieceDef = getPieceDef(this.pieceMap, cell.type);

    ctx.save();
    if (isPreview) ctx.globalAlpha = 0.65;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);

    if (cell.type === 'yinyang') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = '#f8f8f8';
      ctx.fillRect(x - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4);

      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(x - r * 2, y - r * 2);
      ctx.lineTo(x + r * 2, y - r * 2);
      ctx.lineTo(x - r * 2, y + r * 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#5c5c5c';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (cell.color === BLACK) {
      ctx.fillStyle = '#111';
      ctx.fill();
    } else {
      ctx.fillStyle = '#f8f8f8';
      ctx.fill();
      ctx.strokeStyle = '#777';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (pieceDef.symbol && cell.type !== 'yinyang') {
      ctx.font = `${Math.max(14, this.cellSize * 0.42)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = cell.color === BLACK ? '#fff' : '#222';
      ctx.fillText(pieceDef.symbol, x, y + 1);

      if (pieceDef.needsDirection) {
        this.drawDirectionMarker(x, y, r, cell.dir, cell.color);
      }
    }

    if (!isPreview && cell.cloneSpawned) {
      ctx.save();
      ctx.fillStyle = cell.color === BLACK ? '#ffd54f' : '#c62828';
      ctx.font = `bold ${Math.max(11, this.cellSize * 0.24)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('x2', x, y + r * 0.95);
      ctx.restore();
    }

    if (!isPreview && cell.nightmareActive) {
      const alpha = 0.18 + (Math.sin(Date.now() / 180) + 1) * 0.16;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.16, 0, Math.PI * 2);
      ctx.fillStyle = '#b266ff';
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(12, this.cellSize * 0.3)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ᶻ', x, y - r * 0.95);
      ctx.restore();
    }

    if (!isPreview && cell.infected) {
      const alpha = 0.18 + (Math.sin(Date.now() / 220) + 1) * 0.12;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.12, 0, Math.PI * 2);
      ctx.fillStyle = '#b7ff2a';
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = Math.min(0.95, alpha + 0.22);
      ctx.strokeStyle = 'rgba(196, 255, 60, 0.9)';
      ctx.lineWidth = Math.max(2, this.cellSize * 0.08);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.02, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (!isPreview && cell.sacrificePending) {
      const alpha = 0.45 + (Math.sin(Date.now() / 180) + 1) * 0.22;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ff2d2d';
      ctx.font = `bold ${Math.max(72, this.cellSize * 0.5)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☠', x, y + 1);
      ctx.restore();
    }

    if (!isPreview && this.pendingThiefPlacement && this.pendingThiefPlacement.sourceRow === row && this.pendingThiefPlacement.sourceCol === col) {
      const alpha = 0.32 + (Math.sin(Date.now() / 180) + 1) * 0.16;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#4dd0e1';
      ctx.lineWidth = Math.max(3, this.cellSize * 0.1);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (!isPreview && this.lastMove && this.lastMove.row === row && this.lastMove.col === col) {
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


  drawContracts() {
    if (!this.contractLinks || this.contractLinks.length === 0) return;

    const t = Date.now() / 260;
    const pulse = 1 + Math.sin(t) * 0.16;

    for (const link of this.contractLinks) {
      const a = this.findPiecePositionById(link.contractId);
      const b = this.findPiecePositionById(link.targetId);
      if (!a || !b) continue;

      const pa = this.boardToScreen(a.row, a.col);
      const pb = this.boardToScreen(b.row, b.col);

      ctx.save();
      ctx.strokeStyle = 'rgba(155, 89, 182, 0.45)';
      ctx.lineWidth = Math.max(2, this.cellSize * 0.08);
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      this.drawContractMark(pa.x, pa.y, link.remaining, pulse);
      this.drawContractMark(pb.x, pb.y, link.remaining, pulse);
    }
  }

  drawContractMark(x, y, remaining, pulse) {
    const size = Math.max(9, this.cellSize * 0.22) * pulse;

    ctx.save();
    ctx.translate(x, y - this.cellSize * 0.56);
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = Math.max(2, this.cellSize * 0.08);
    ctx.shadowColor = 'rgba(168, 85, 247, 0.55)';
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(0, size);
    ctx.moveTo(-size * 0.75, 0);
    ctx.lineTo(size * 0.75, 0);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#7e22ce';
    ctx.font = `bold ${Math.max(24, this.cellSize * 0.24)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(String(remaining), 0, -size + 20);
    ctx.restore();
  }

  drawPendingConfirmPlacement() {
    if (!this.pendingConfirmPlacement) return;

    const { row, col, color, type } = this.pendingConfirmPlacement;
    const { x, y } = this.boardToScreen(row, col);
    const pulse = 0.35 + (Math.sin(Date.now() / 180) + 1) * 0.25;

    ctx.save();
    ctx.globalAlpha = pulse + 0.25;
    this.drawOnePiece(x, y, createPiece(color, type, null), row, col, true);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, this.cellSize * 0.46, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, this.cellSize * 0.08);
    ctx.strokeStyle = color === BLACK ? 'rgba(255,80,80,0.95)' : 'rgba(200,30,30,0.95)';
    ctx.stroke();
    ctx.restore();
  }

  drawPendingPlacement() {
    if (!this.pendingPlacement) return;

    const { row, col, color, type } = this.pendingPlacement;
    const { x, y } = this.boardToScreen(row, col);

    this.drawOnePiece(x, y, createPiece(color, type, null), row, col, true);
    this.drawDirectionButtons();
  }

  drawDirectionButtons() {
    this.drawDirectionButtonsSet(this.directionButtons);
  }

  drawDirectionButtonsSet(buttons, fillStyle = 'rgba(52, 152, 219, 0.9)') {
    if (!buttons) return;
    for (const dir of ['U', 'D', 'L', 'R']) {
      const btn = buttons[dir];
      if (!btn) continue;
      this.drawTriangleButton(btn.x, btn.y, btn.size, dir, fillStyle);
    }
  }

  drawTriangleButton(x, y, size, dir, fillStyle = 'rgba(52, 152, 219, 0.9)') {
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
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawRoundedRect(x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }

  drawBottomUI() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (this.scoreReviewMode && this.scoreSummary) {
      const legendY = SCREEN_HEIGHT - 108;
      const itemGap = 106;
      const startX = SCREEN_WIDTH / 2 - itemGap;
      const items = [
        { label: '黑地', fill: 'rgba(0, 0, 0, 0.26)', stroke: 'rgba(0, 0, 0, 0.65)' },
        { label: '白地', fill: 'rgba(255, 255, 255, 0.72)', stroke: 'rgba(120, 90, 40, 0.9)' },
        { label: '中立', fill: 'rgba(241, 196, 15, 0.30)', stroke: 'rgba(160, 110, 20, 0.85)' }
      ];

      items.forEach((item, index) => {
        const cx = startX + index * itemGap;
        ctx.beginPath();
        ctx.arc(cx, legendY, 12, 0, Math.PI * 2);
        ctx.fillStyle = item.fill;
        ctx.strokeStyle = item.stroke;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1f1f1f';
        ctx.font = 'bold 15px Arial';
        ctx.fillText(item.label, cx, legendY + 28);
      });

      const s = this.scoreSummary;
      ctx.fillStyle = '#1f1f1f';
      ctx.font = '16px Arial';
      const extraText = s.isEstimate
        ? `（估算）自动移除死子 ${s.deadRemovedTotal} 枚`
        : `自动移除死子 ${s.deadRemovedTotal} 枚`;
      ctx.fillText(`黑 ${s.blackScore} 目  白 ${s.whiteScore} 目`, SCREEN_WIDTH / 2, SCREEN_HEIGHT - 64);
      ctx.fillText(extraText, SCREEN_WIDTH / 2, SCREEN_HEIGHT - 42);
      ctx.fillText('右上角可返回终局复盘，左上角返回主页', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 20);
      return;
    }

    if (this.replayMode && this.replayControls) {
      const controls = this.replayControls;
      ctx.fillStyle = '#1f1f1f';
      ctx.font = 'bold 18px Arial';
      ctx.fillText(this.buildReplayStatusText(), SCREEN_WIDTH / 2, controls.firstBtn.y - 18);
      drawButton(controls.firstBtn.x, controls.firstBtn.y, controls.firstBtn.w, controls.firstBtn.h, '#3498db', '第一步', 18);
      drawButton(controls.prevBtn.x, controls.prevBtn.y, controls.prevBtn.w, controls.prevBtn.h, '#3498db', '上一步', 18);
      drawButton(controls.nextBtn.x, controls.nextBtn.y, controls.nextBtn.w, controls.nextBtn.h, '#3498db', '下一步', 18);
      drawButton(controls.lastBtn.x, controls.lastBtn.y, controls.lastBtn.w, controls.lastBtn.h, '#8e44ad', '终局步', 18);
      drawButton(controls.practiceBtn.x, controls.practiceBtn.y, controls.practiceBtn.w, controls.practiceBtn.h, '#27ae60', '玩残局', 20);
      return;
    }

    for (const slot of this.cardSlotsLayout) {
      const card = this.getCardDataBySlot(slot.index);
      this.drawCardSlot(slot, card);
    }

    ctx.fillStyle = '#1f1f1f';
    ctx.font = 'bold 18px Arial';
    if (!this.isTutorialMode) {
      ctx.fillText(this.currentPlayer === BLACK ? '黑方手牌' : '白方手牌', SCREEN_WIDTH / 2, this.cardSlotsLayout[0].y - 18);
    }
    ctx.font = '16px Arial';
    const bottomText = this.isTutorialMode && this.tutorialLevel
      ? (this.tutorialLevel.tips || '请按提示完成教学目标')
      : '下方显示当前回合的大卡牌，上方左右显示黑白双方的微缩卡槽';
    ctx.fillText(bottomText, SCREEN_WIDTH / 2, SCREEN_HEIGHT - 24);
  }

  drawCardSlot(slot, card) {
    const isEmpty = !card;
    const isUsed = !!card && card.used;
    const isActive = !!card && !isUsed && this.nextPieceType === card.type;
    const isSwapOwnChosen = !!card && this.pendingSwapCardSelection && this.pendingSwapCardSelection.ownSlotIndex === slot.index;

    ctx.save();

    if (isEmpty || isUsed) {
      ctx.globalAlpha = isUsed ? 0.2 : 0.35;
    }

    ctx.fillStyle = (isActive || isSwapOwnChosen) ? '#f7d794' : '#f3e5c8';
    ctx.strokeStyle = isSwapOwnChosen ? '#1e90ff' : (isActive ? '#c0392b' : '#8e6e3b');
    ctx.lineWidth = (isActive || isSwapOwnChosen) ? 4 : 3;

    this.drawRoundedRect(slot.x, slot.y, slot.w, slot.h, 12);
    ctx.fill();
    ctx.stroke();

    if (isEmpty) {
      ctx.fillStyle = '#8a7b63';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('空槽', slot.x + slot.w / 2, slot.y + slot.h / 2 - 8);
      ctx.font = '12px Arial';
      ctx.fillText(`槽位 ${slot.index + 1}`, slot.x + slot.w / 2, slot.y + slot.h / 2 + 20);
      ctx.restore();
      return;
    }

    const def = getPieceDef(this.pieceMap, card.type);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#5b3a1f';
    ctx.font = '12px Arial';
    ctx.fillText(`卡槽 ${slot.index + 1}`, slot.x + slot.w / 2, slot.y + 14);

    ctx.font = '32px Arial';
    ctx.fillText(def.symbol || '●', slot.x + slot.w / 2, slot.y + 42);

    ctx.font = 'bold 18px Arial';
    ctx.fillText(def.name, slot.x + slot.w / 2, slot.y + 72);

    ctx.font = '12px Arial';
    ctx.fillStyle = '#6b4f2c';
    ctx.fillText(def.needsDirection ? '落点后选方向' : '直接落子', slot.x + slot.w / 2, slot.y + 94);

    if (isUsed) {
      ctx.fillStyle = '#7f8c8d';
      ctx.font = 'bold 16px Arial';
      ctx.fillText('已使用', slot.x + slot.w / 2, slot.y + 112);
    } else if (isSwapOwnChosen) {
      ctx.fillStyle = '#1e90ff';
      ctx.font = 'bold 16px Arial';
      ctx.fillText('换牌目标', slot.x + slot.w / 2, slot.y + 112);
    } else if (isActive) {
      ctx.fillStyle = '#c0392b';
      ctx.font = 'bold 16px Arial';
      ctx.fillText('已选中', slot.x + slot.w / 2, slot.y + 112);
    } else {
      ctx.fillStyle = '#2d6a4f';
      ctx.font = 'bold 16px Arial';
      ctx.fillText('可使用', slot.x + slot.w / 2, slot.y + 112);
    }

    ctx.restore();
  }
}