import { drawButton, inRect } from '../utils/ui';
const { boardConfig, pieceConfig, pieceMap } = require('../config/game-data');
const { createPiece, getPieceDef, runAdvanceForPiece } = require('../engine/piece-engine');

const ctx = canvas.getContext('2d');

const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const SCREEN_WIDTH = windowInfo.windowWidth || canvas.width;
const SCREEN_HEIGHT = windowInfo.windowHeight || canvas.height;

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
    this.EMPTY = EMPTY;
    this.INVALID = INVALID;
    this.DESTROYED = DESTROYED;
    this.DIRS = DIRS;

    this.boardConfig = boardConfig;
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
    this.scoreRequestState = null;
    this.scoreSummary = null;
    this.scoreTerritoryMap = null;
    this.scoreReviewBoard = null;
    this.scoreReviewMode = false;
    this.winner = null;
    this.gameOver = false;
    this.victoryDialog = null;
    this.scoreRequestState = null;
    this.scoreSummary = null;

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
    this.scoreRequestBtn = { x: (SCREEN_WIDTH - 100) / 2, y: this.row1Y, w: 100, h: 40 };
    this.restartBtn = { x: SCREEN_WIDTH - 24 - 100, y: this.row1Y, w: 100, h: 40 };

    this.previewRowY = this.row1Y + 52;
    this.previewRowH = 46;
    this.previewInfoGap = 8;
    this.previewInfoLineH = 16;
    this.previewExtraInfoH = this.previewInfoGap + this.previewInfoLineH * 2 + 4;

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

  buildVictoryDialogLayout() {
    const w = Math.min(SCREEN_WIDTH - 56, 360);
    const hasScoreReview = !!this.scoreSummary;
    const h = hasScoreReview ? 278 : 220;
    const x = (SCREEN_WIDTH - w) / 2;
    const y = (SCREEN_HEIGHT - h) / 2 - 12;
    return {
      x,
      y,
      w,
      h,
      confirmBtn: {
        x: x + 32,
        y: y + h - 132,
        w: w - 64,
        h: 46
      },
      reviewBtn: hasScoreReview ? {
        x: x + 32,
        y: y + h - 74,
        w: w - 64,
        h: 46
      } : null
    };
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
    BOARD_SHAPE = boardConfig.shape;
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
      reviewText: this.scoreSummary ? '查看点目结果' : ''
    };
  }

  closeVictoryDialogAndReturnHome() {
    this.victoryDialog = null;
    const targetScene = this.homeScene || this.returnScene;
    if (targetScene) {
      this.sceneManager.switchTo(targetScene);
    }
  }

  enterScoreReviewMode() {
    if (!this.scoreSummary || !this.scoreTerritoryMap) return;
    this.scoreReviewMode = true;
    this.victoryDialog = null;
    this.clearPendingSelection();
    this.clearPendingConfirmPlacement();
    this.clearPendingContractPlacement();
    this.clearPendingSacrificePlacement();
    this.clearPendingRebirthPlacement();
    this.clearPendingPersuaderPlacement();
    this.clearPendingThiefPlacement();
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
  }

  prepareMatch(options = {}) {
    this.isTutorialMode = false;
    this.tutorialLevel = null;
    this.tutorialScene = null;
    this.tutorialIndex = -1;
    this.returnScene = this.homeScene || null;
    if (options.boardConfig) {
      this.boardConfig = options.boardConfig;
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
    this.scoreSummary = null;
    this.scoreTerritoryMap = null;
    this.scoreReviewBoard = null;
    this.scoreReviewMode = false;

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

  onWheel(e) {
    if (!e) return;

    const x = typeof e.clientX === 'number' ? e.clientX : SCREEN_WIDTH / 2;
    const y = typeof e.clientY === 'number' ? e.clientY : this.boardCenterY;

    if (!this.isPointInBoardViewport(x, y)) return;

    const rawDelta = typeof e.deltaY === 'number'
      ? e.deltaY
      : (typeof e.wheelDelta === 'number' ? -e.wheelDelta : 0);
    if (!rawDelta) return;

    const { minScale, maxScale } = this.getBoardScaleLimits();
    const baseFactor = rawDelta > 0 ? 0.9 : 1.1;
    const intensity = Math.min(4, Math.max(1, Math.abs(rawDelta) / 120));
    const scaleFactor = Math.pow(baseFactor, intensity);
    const oldScale = this.boardScale;
    const newScale = this.clamp(oldScale * scaleFactor, minScale, maxScale);

    if (Math.abs(newScale - oldScale) < 0.0001) return;

    const anchorBoardX = (x - this.baseOriginX - this.boardOffsetX) / (this.baseCellSize * oldScale);
    const anchorBoardY = (y - this.baseOriginY - this.boardOffsetY) / (this.baseCellSize * oldScale);

    this.boardScale = newScale;
    this.boardOffsetX = x - this.baseOriginX - anchorBoardX * this.baseCellSize * newScale;
    this.boardOffsetY = y - this.baseOriginY - anchorBoardY * this.baseCellSize * newScale;
    this.applyBoardViewTransform();

    if (e.preventDefault) e.preventDefault();
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

  cancelPendingThiefPlacement() {
    const pending = this.pendingThiefPlacement;
    if (!pending) return false;

    this.clearPendingThiefPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.statusMessage = '已取消盗贼操作';
    return true;
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
      ? { persuadedCount: 0, vanishedCount: 0, archerShotCount: 0, archerKillCount: 0, archerDisabledCount: 0, plagueInfo: { infectedCount: 0, deathCount: 0, recoverCount: 0, vanishedCount: 0 } }
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

    if (piece.type === 'time_limit') {
      this.armTurnPressure(this.getOpponent(piece.color), 10, piece.color);
    }

    if (piece.type === 'gravity' || piece.type === 'repulsion' || piece.type === 'reverse') {
      this.normalizePieceAt(row, col);
    }

    this.advanceSpecialPieces({
      skipNewlyPlacedType: piece.type,
      skipNewlyPlacedKey: `${row},${col}`
    });

    const contractInfo = this.resolveContracts(advanceContracts);

    const wonByCapture = this.checkVictoryAfterCapture(piece.color);

    if (endTurn && !wonByCapture) {
      if (this.isTurnPressureActiveForPlayer(this.currentPlayer)) {
        this.clearTurnPressure(true);
      }
      this.setCurrentPlayer(this.getOpponent(this.currentPlayer));
    }

    const turnStartInfo = wonByCapture
      ? { persuadedCount: 0, vanishedCount: 0, archerShotCount: 0, archerKillCount: 0, archerDisabledCount: 0, plagueInfo: { infectedCount: 0, deathCount: 0, recoverCount: 0, vanishedCount: 0 } }
      : this.resolveTurnStartSpecials(this.currentPlayer);

    if (piece.type === 'rebirth' && !endTurn) {
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
    } else if (piece.type === 'plague') {
      this.statusMessage = plagueInfectedCount > 0
        ? `瘟疫扩散，感染 ${plagueInfectedCount} 枚棋子`
        : '瘟疫落下，但周围没有可感染的棋子块';
    } else if (piece.type === 'time_limit') {
      this.statusMessage = '限时生效：对手下一回合只有 10 秒可落子';
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

        if (Math.random() < 0.5) {
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

    const vanishedCount = deathCount > 0 ? this.resolveDeadGroupsAfterGravity(null, true) : 0;
    this.previousBoardKey = this.getBoardKey(this.board);
    this.lastPlagueResolution = { infectedCount, deathCount, recoverCount, vanishedCount };
    return this.lastPlagueResolution;
  }

  resolveTurnStartSpecials(player) {
    let persuadedCount = 0;
    let archerShotCount = 0;
    let archerKillCount = 0;
    let archerDisabledCount = 0;
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

    const vanishedCount = this.resolveDeadGroupsAfterGravity(null, true);
    this.previousBoardKey = this.getBoardKey(this.board);
    return { persuadedCount, vanishedCount, archerShotCount, archerKillCount, archerDisabledCount, plagueInfo };
  }

  isPointInBoardViewport(x, y) {
    const viewport = this.getBoardViewportRect();
    return x >= viewport.left && x <= viewport.right && y >= viewport.top && y <= viewport.bottom;
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
      canPanBoard: this.isPointInBoardViewport(touch.clientX, touch.clientY),
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
    if (dx * dx + dy * dy > 64) {
      this.pendingTap.moved = true;
      if (this.pendingTap.canPanBoard) {
        this.pendingTap.panStarted = true;
        this.boardOffsetX = this.pendingTap.panStartOffsetX + dx;
        this.boardOffsetY = this.pendingTap.panStartOffsetY + dy;
        this.applyBoardViewTransform();
      }
    }
  }

  handleTap(x, y) {
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
      this.victoryDialog.reviewBtn = dialog.reviewBtn;
      if (inRect(x, y, dialog.confirmBtn.x, dialog.confirmBtn.y, dialog.confirmBtn.w, dialog.confirmBtn.h)) {
        this.closeVictoryDialogAndReturnHome();
        return;
      }
      if (dialog.reviewBtn && inRect(x, y, dialog.reviewBtn.x, dialog.reviewBtn.y, dialog.reviewBtn.w, dialog.reviewBtn.h)) {
        this.enterScoreReviewMode();
        return;
      }
      return;
    }

    if (inRect(x, y, this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h)) {
      const targetScene = this.returnScene || this.homeScene;
      if (targetScene) this.sceneManager.switchTo(targetScene);
      return;
    }

    if (this.scoreReviewMode) {
      return;
    }

    if (inRect(x, y, this.scoreRequestBtn.x, this.scoreRequestBtn.y, this.scoreRequestBtn.w, this.scoreRequestBtn.h)) {
      this.requestScoreCount();
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

      if (this.pendingSacrificePlacement) {
        this.statusMessage = '献祭已经发动，必须先指定一枚敌子';
        return;
      }

      const card = this.getCardDataBySlot(slot.index);
      if (!card || card.used) return;

      this.toggleNextSpecialPiece(card.type);
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

    if (!this.isPlayablePoint(point.row, point.col) || this.board[point.row][point.col] !== EMPTY) {
      this.statusMessage = this.board[point.row][point.col] === EMPTY ? '此处不可落子' : '此处已有棋子';
      return;
    }

    this.startConfirmPlacement(point.row, point.col, this.nextPieceType, this.currentPlayer);
  }

  onTouchStart(e) {
    if (e.touches && e.touches.length >= 2) {
      this.cancelTapTracking();
      this.beginBoardGesture(e.touches);
      return;
    }

    if (this.activeGesture) return;
    if (this.lastGestureEndAt && Date.now() - this.lastGestureEndAt < 120) return;

    const touch = e.touches && e.touches[0];
    if (!touch) return;
    this.beginTapTracking(touch);
  }

  onTouchMove(e) {
    if (!e.touches || e.touches.length <= 0) return;

    if (e.touches.length >= 2) {
      this.cancelTapTracking();
      if (!this.activeGesture) {
        this.beginBoardGesture(e.touches);
        return;
      }
      this.updateBoardGesture(e.touches);
      return;
    }

    this.updateTapTracking(e.touches[0]);
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
    if (!pendingTap || pendingTap.cancelled || pendingTap.moved) return;
    if (this.lastGestureEndAt && Date.now() - this.lastGestureEndAt < 120) return;

    this.handleTap(pendingTap.lastX, pendingTap.lastY);
  }

  toggleNextSpecialPiece(type) {
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
    this.pendingContractPlacement = {
      row,
      col,
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
    this.pendingRebirthPlacement = {
      row,
      col,
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
    this.pendingFogPlacement = {
      row,
      col,
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
      ? { persuadedCount: 0, vanishedCount: 0, archerShotCount: 0, archerKillCount: 0, archerDisabledCount: 0, plagueInfo: { infectedCount: 0, deathCount: 0, recoverCount: 0, vanishedCount: 0 } }
      : this.resolveTurnStartSpecials(this.currentPlayer);

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
    }

    this.previousBoardKey = this.getBoardKey(this.board);

    if (totalDugCells > 0) {
      this.statusMessage = `堡垒兵挖掉 ${totalDugCells} 格`;
    } else if (totalDestroyedCells > 0) {
      this.statusMessage = `特殊兵种触发，清空 ${totalDestroyedCells} 格`;
    } else if (totalDisabled > 0) {
      this.statusMessage = `有 ${totalDisabled} 枚特殊兵种失去能力`;
    }
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
    const neighbors = this.getNeighborsForBoard(nextBoard, row, col);
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

    const selfGroup = this.getGroup(nextBoard, row, col);
    const selfLiberties = this.getLiberties(nextBoard, selfGroup);
    if (selfLiberties.size === 0) return { ok: false, message: '禁入点：不可自杀' };

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

  getLiberties(board, group) {
    const liberties = new Set();
    for (const [row, col] of group) {
      const neighbors = this.getNeighborsForBoard(board, row, col);
      for (const [nr, nc] of neighbors) {
        if (board[nr][nc] === EMPTY) liberties.add(`${nr},${nc}`);
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
    if (!this.directionButtons) return null;
    for (const dir of ['U', 'D', 'L', 'R']) {
      const btn = this.directionButtons[dir];
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
    this.drawPendingFogTargetHint();
    this.drawFogOverlay();
    this.drawPendingConfirmPlacement();
    this.drawPendingPlacement();

    // 顶部控件始终浮在棋盘之上。
    this.drawTopBar();
    this.drawBottomUI();
    this.drawTurnPressureOverlay();
    this.drawScoreRequestDialog();
    this.drawVictoryDialog();
  }

  drawBackground() {
    ctx.fillStyle = '#cfa96a';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  drawTopBar() {
    const backText = this.scoreReviewMode ? '返回主页' : '返回';
    drawButton(this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h, '#34495e', backText);
    if (this.scoreReviewMode) {
      drawButton(this.scoreRequestBtn.x, this.scoreRequestBtn.y, this.scoreRequestBtn.w, this.scoreRequestBtn.h, '#bdc3c7', '点目结果', 18, '#5f6a6a');
      drawButton(this.restartBtn.x, this.restartBtn.y, this.restartBtn.w, this.restartBtn.h, '#bdc3c7', '已结束', 18, '#5f6a6a');
    } else {
      drawButton(this.scoreRequestBtn.x, this.scoreRequestBtn.y, this.scoreRequestBtn.w, this.scoreRequestBtn.h, '#f1c40f', '申请点目', 20, '#3b2a18');
      drawButton(this.restartBtn.x, this.restartBtn.y, this.restartBtn.w, this.restartBtn.h, '#27ae60', '重开');
    }

    ctx.fillStyle = '#1f1f1f';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.boardConfig.name || '棋盘', SCREEN_WIDTH / 2, this.titleY);

    ctx.font = '16px Arial';
    ctx.fillStyle = '#5b3a1f';
    ctx.fillText(this.statusMessage || ' ', SCREEN_WIDTH / 2, this.msgTextY);

    this.drawMiniCardPreview('black');
    this.drawMiniCardPreview('white');
  }

  drawMiniCardPreview(color) {
    const isBlack = this.getColorKey(color) === 'black';
    const sideKey = isBlack ? 'black' : 'white';
    const sideColor = isBlack ? BLACK : WHITE;
    const loadout = this.cardLoadoutByColor ? this.cardLoadoutByColor[sideKey] : [];
    const x = isBlack ? 14 : SCREEN_WIDTH - 14 - 92;
    const y = this.previewRowY;
    const w = 92;
    const h = this.previewRowH;
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
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = isBlack ? '#f7f7f7' : '#3b2a18';
    ctx.fillText(isBlack ? '黑方卡槽' : '白方卡槽', x + w / 2, y + 9);

    const gap = 4;
    const cardW = 24;
    const cardH = 24;
    const startX = x + (w - (cardW * this.maxCardSlots + gap * (this.maxCardSlots - 1))) / 2;
    for (let i = 0; i < this.maxCardSlots; i++) {
      const card = loadout ? loadout[i] : null;
      const cx = startX + i * (cardW + gap);
      const cy = y + 17;
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
        ctx.font = '16px Arial';
        ctx.fillText(def.symbol || '●', cx + cardW / 2, cy + 12);
        const activeType = this.currentPlayer === sideColor
          ? this.nextPieceType
          : (this.nextPieceTypeByColor && this.nextPieceTypeByColor[sideKey]);
        if (activeType === card.type && !card.used) {
          ctx.strokeStyle = '#c0392b';
          ctx.lineWidth = 2;
          this.drawRoundedRect(cx + 1, cy + 1, cardW - 2, cardH - 2, 5);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    this.drawMiniTurnStone(sideColor, isBlack ? (x + w + 25) : (x - 25), y + h / 2, isCurrentTurn);

    const timer = this.turnTimers ? this.formatTimer(this.turnTimers[sideKey]) : '05:00';
    const captures = this.captureCounts ? this.captureCounts[sideKey] : 0;
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = '#2f2418';
    ctx.fillText(`提子 ${captures}`, x + w / 2, y + h + this.previewInfoGap + 6);
    ctx.fillText(`倒计时 ${timer}`, x + w / 2, y + h + this.previewInfoGap + this.previewInfoLineH + 6);

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
    this.drawDestroyedCells();
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

    ctx.fillStyle = '#1f1f1f';
    ctx.font = 'bold 34px Arial';
    ctx.fillText(dialog.message || '', rect.x + rect.w / 2, rect.y + 92);

    ctx.fillStyle = '#6b4f2c';
    ctx.font = '18px Arial';
    ctx.fillText(dialog.detail || '', rect.x + rect.w / 2, rect.y + rect.h / 2 - 6);

    drawButton(rect.confirmBtn.x, rect.confirmBtn.y, rect.confirmBtn.w, rect.confirmBtn.h, '#27ae60', dialog.confirmText || '确认');
    if (rect.reviewBtn) {
      drawButton(rect.reviewBtn.x, rect.reviewBtn.y, rect.reviewBtn.w, rect.reviewBtn.h, '#f1c40f', dialog.reviewText || '查看点目结果', 20, '#3b2a18');
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

    if (cell.color === BLACK) {
      ctx.fillStyle = '#111';
      ctx.fill();
    } else {
      ctx.fillStyle = '#f8f8f8';
      ctx.fill();
      ctx.strokeStyle = '#777';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (pieceDef.symbol) {
      ctx.font = `${Math.max(14, this.cellSize * 0.42)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = cell.color === BLACK ? '#fff' : '#222';
      ctx.fillText(pieceDef.symbol, x, y + 1);

      if (pieceDef.needsDirection) {
        this.drawDirectionMarker(x, y, r, cell.dir, cell.color);
      }
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
    if (!this.directionButtons) return;
    for (const dir of ['U', 'D', 'L', 'R']) {
      const btn = this.directionButtons[dir];
      this.drawTriangleButton(btn.x, btn.y, btn.size, dir);
    }
  }

  drawTriangleButton(x, y, size, dir) {
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
    ctx.fillStyle = 'rgba(52, 152, 219, 0.9)';
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
      ctx.fillText('当前仅可查看点目归属，点击左上角返回主页', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 20);
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

    ctx.save();

    if (isEmpty || isUsed) {
      ctx.globalAlpha = isUsed ? 0.2 : 0.35;
    }

    ctx.fillStyle = isActive ? '#f7d794' : '#f3e5c8';
    ctx.strokeStyle = isActive ? '#c0392b' : '#8e6e3b';
    ctx.lineWidth = isActive ? 4 : 3;

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