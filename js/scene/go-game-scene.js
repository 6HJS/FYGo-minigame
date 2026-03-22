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
    this.enabledCardTypes = ['contract', 'bomber', 'reverse'];
    this.contractDuration = 3;
    this.bgm = "audio/bgm_fight.mp3"

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
    this.restartBtn = { x: SCREEN_WIDTH - 24 - 100, y: this.row1Y, w: 100, h: 40 };

    this.titleY = this.row1Y + 40 + 26;
    this.turnTextY = this.titleY + 42;
    this.msgTextY = this.turnTextY + 30;

    this.boardPaddingTop = this.msgTextY + 35;
    this.boardPaddingSide = 36;
    this.boardPaddingBottom = 210;

    this.cardSlotsLayout = this.buildCardSlotLayout();
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

  createInitialCardLoadout() {
    const loadout = [];

    for (let i = 0; i < this.maxCardSlots; i++) {
      const type = this.getEnabledCardTypes()[i];
      const def = type ? getPieceDef(this.pieceMap, type) : null;

      if (!type || !def || def.id !== type || type === (this.pieceConfig.defaultPieceType || 'normal')) {
        loadout.push(null);
        continue;
      }

      loadout.push({ type, used: false });
    }

    return loadout;
  }

  getEnabledCardTypes() {
    return Array.isArray(this.enabledCardTypes) ? this.enabledCardTypes : [];
  }

  setBoardConfig(boardConfig) {
    if (!boardConfig || !Array.isArray(boardConfig.shape) || !boardConfig.shape.length) return;

    this.boardConfig = boardConfig;
    BOARD_SHAPE = boardConfig.shape;
    BOARD_ROWS = BOARD_SHAPE.length;
    BOARD_COLS = BOARD_SHAPE[0].length;

    this.resetGame();
  }

  setEnabledCardTypes(cardTypes) {
    const nextTypes = Array.isArray(cardTypes)
      ? cardTypes
          .filter((type) => type && type !== (this.pieceConfig.defaultPieceType || 'normal'))
          .slice(0, this.maxCardSlots)
      : [];

    this.enabledCardTypes = nextTypes;
    this.cardLoadout = this.createInitialCardLoadout();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.clearPendingSelection();
    this.clearPendingContractPlacement();
  }

  prepareMatch(options = {}) {
    if (options.boardConfig) {
      this.boardConfig = options.boardConfig;
      BOARD_SHAPE = this.boardConfig.shape;
      BOARD_ROWS = BOARD_SHAPE.length;
      BOARD_COLS = BOARD_SHAPE[0].length;
    }

    if (options.cardTypes) {
      this.enabledCardTypes = options.cardTypes
        .filter((type) => type && type !== (this.pieceConfig.defaultPieceType || 'normal'))
        .slice(0, this.maxCardSlots);
    }

    this.resetGame();
  }

  resetGame() {
    this.board = Array.from({ length: BOARD_ROWS }, (_, row) =>
      Array.from({ length: BOARD_COLS }, (_, col) =>
        BOARD_SHAPE[row][col] === 1 ? EMPTY : INVALID
      )
    );

    this.currentPlayer = BLACK;
    this.lastMove = null;
    this.lastCaptured = [];
    this.statusMessage = '';

    this.previousBoardKey = this.getBoardKey(this.board);

    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.pendingPlacement = null;
    this.directionButtons = null;

    this.cardLoadout = this.createInitialCardLoadout();
    this.nextPieceId = 1;
    this.contractLinks = [];
    this.pendingContractPlacement = null;
    this.pendingRebirthPlacement = null;
    this.fogState = null;

    this.calcBoardLayout();
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

    this.cellSize = Math.min(usableWidth / spanCols, usableHeight / spanRows);

    const centerCol = (minCol + maxCol) / 2;
    const centerRow = (minRow + maxRow) / 2;

    this.boardCenterX = SCREEN_WIDTH / 2;
    this.boardCenterY = this.boardPaddingTop + usableHeight / 2;

    this.originX = this.boardCenterX - centerCol * this.cellSize;
    this.originY = this.boardCenterY - centerRow * this.cellSize;
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

  getCardDataBySlot(slotIndex) {
    return this.cardLoadout[slotIndex] || null;
  }

  findAvailableCardSlotByType(type) {
    for (let i = 0; i < this.cardLoadout.length; i++) {
      const card = this.cardLoadout[i];
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
    const target = allowRebirth && cell.rebirthReady ? cell.rebirthTarget : null;

    this.board[row][col] = EMPTY;

    if (
      cell.type === 'rebirth' &&
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

    return { removed: true, counted: true, reborn: false };
  }

  clearPendingContractPlacement() {
    this.pendingContractPlacement = null;
  }

  clearPendingRebirthPlacement() {
    this.pendingRebirthPlacement = null;
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

    this.clearPendingRebirthPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.currentPlayer = this.getOpponent(this.currentPlayer);
    this.previousBoardKey = this.getBoardKey(this.board);
    if (this.isFogActiveForPlayer(this.getOpponent(this.currentPlayer))) {
      this.clearFog();
    }
    this.statusMessage = `重生点已绑定：(${row + 1}, ${col + 1})`;
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
    this.currentPlayer = this.getOpponent(this.currentPlayer);
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.previousBoardKey = this.getBoardKey(this.board);
    this.clearFog();
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

    this.clearPendingContractPlacement();
    this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
    this.currentPlayer = this.getOpponent(this.currentPlayer);
    if (this.isFogActiveForPlayer(this.getOpponent(this.currentPlayer))) {
      this.clearFog();
    }
    this.statusMessage = `契约已生效：${this.contractDuration}回合内同生共死`;
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
          if (this.removePieceById(survivorId, { reason: 'special', allowRebirth: true })) {
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
    GameGlobal.musicManager.playDropStone();

    const pieceDef = getPieceDef(this.pieceMap, piece.type);
    if (pieceDef.selectable) {
      this.consumeCard(piece.type);
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

    this.advanceSpecialPieces({
      skipNewlyPlacedType: piece.type,
      skipNewlyPlacedKey: `${row},${col}`
    });

    const contractInfo = this.resolveContracts(advanceContracts);

    if (endTurn) {
      this.currentPlayer = this.getOpponent(this.currentPlayer);
    }

    if (piece.type === 'fog') {
      this.activateFog(row, col, piece.color);
    }

    if (piece.type === 'rebirth' && !endTurn) {
      this.statusMessage = '请选择一个空位作为重生点';
    } else if (contractInfo.chainKillCount > 0) {
      this.statusMessage = `契约触发，同归于尽 ${contractInfo.chainKillCount} 枚`;
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
    } else if (piece.type === 'fog') {
      this.statusMessage = '迷雾已展开：对手下一回合视野受限';
    } else if (result.captured.length > 0) {
      this.statusMessage = `提子 ${result.captured.length} 枚`;
    } else if (pieceDef.needsDirection) {
      this.statusMessage = `${pieceDef.name}已落子，方向 ${piece.dir}`;
    } else {
      this.statusMessage = '';
    }

    return true;
  }

  clearPendingSelection() {
    this.pendingPlacement = null;
    this.directionButtons = null;
  }

  onTouchStart(e) {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    if (inRect(x, y, this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h)) {
      if (this.homeScene) this.sceneManager.switchTo(this.homeScene);
      return;
    }

    if (inRect(x, y, this.restartBtn.x, this.restartBtn.y, this.restartBtn.w, this.restartBtn.h)) {
      this.resetGame();
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
      }
      return;
    }

    if (this.handleFogOccupiedAttempt(point.row, point.col)) {
      this.clearPendingSelection();
      this.nextPieceType = this.pieceConfig.defaultPieceType || 'normal';
      return;
    }

    const selectedDef = getPieceDef(this.pieceMap, this.nextPieceType);
    if (this.nextPieceType === 'contract') {
      this.startContractPlacement(point.row, point.col);
      return;
    }

    if (this.nextPieceType === 'rebirth') {
      this.startRebirthPlacement(point.row, point.col);
      return;
    }

    if (selectedDef.needsDirection) {
      this.startSpecialPlacement(point.row, point.col, this.nextPieceType);
      return;
    }

    this.tryPlacePiece(point.row, point.col, {
      color: this.currentPlayer,
      type: this.nextPieceType,
      dir: null
    });
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

    const vanishedCount = this.resolveDeadGroupsAfterGravity();
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

    const vanishedCount = this.resolveDeadGroupsAfterGravity();
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

    const vanishedCount = this.resolveDeadGroupsAfterGravity();
    this.previousBoardKey = this.getBoardKey(this.board);
    return { movedCount, vanishedCount };
  }

  resolveDeadGroupsAfterGravity() {
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
          allowRebirth: true
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
          return `${cell.color}${cell.type}${cell.dir || '_'}`;
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
    let nearest = null;
    let minDist = Infinity;
    const threshold = this.cellSize * 0.45;

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

  update() {}

  render() {
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.drawBackground();
    this.drawTopBar();
    this.drawBoard();
    this.drawPieces();
    this.drawRebirthTargets();
    this.drawContracts();
    this.drawFogOverlay();
    this.drawPendingPlacement();
    this.drawBottomUI();
  }

  drawBackground() {
    ctx.fillStyle = '#cfa96a';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  drawTopBar() {
    drawButton(this.backBtn.x, this.backBtn.y, this.backBtn.w, this.backBtn.h, '#34495e', '返回');
    drawButton(this.restartBtn.x, this.restartBtn.y, this.restartBtn.w, this.restartBtn.h, '#27ae60', '重开');

    ctx.fillStyle = '#1f1f1f';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.boardConfig.name || '棋盘', SCREEN_WIDTH / 2, this.titleY);

    ctx.font = '22px Arial';
    ctx.fillText(this.currentPlayer === BLACK ? '当前落子：黑棋' : '当前落子：白棋', SCREEN_WIDTH / 2, this.turnTextY);

    ctx.font = '16px Arial';
    ctx.fillStyle = '#5b3a1f';
    ctx.fillText(this.statusMessage || ' ', SCREEN_WIDTH / 2, this.msgTextY);
  }

  drawBoard() {
    this.drawBoardBackground();
    this.drawBoardLines();
    this.drawBoardPoints();
    this.drawDestroyedCells();
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

  canDrawConnection(row, col) {
    return this.isBoardShapeCell(row, col) && this.board[row][col] !== DESTROYED;
  }

  drawBoardPoints() {
    ctx.fillStyle = '#2c1e12';
    const centerRow = Math.round((this.minRow + this.maxRow) / 2);
    const centerCol = Math.round((this.minCol + this.maxCol) / 2);

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (!this.isPlayablePoint(row, col)) continue;
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
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (this.board[row][col] !== DESTROYED) continue;
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
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = this.board[row][col];
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
        ctx.strokeStyle = 'rgba(46, 139, 87, 0.75)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(to.x, to.y, Math.max(6, this.cellSize * 0.18), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(46, 139, 87, 0.95)';
        ctx.lineWidth = 2.5;
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

  drawFogOverlay() {
    if (!this.isFogActiveForPlayer(this.currentPlayer)) return;
    if (!this.fogState) return;
  
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
    ctx.font = `bold ${Math.max(11, this.cellSize * 0.24)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(remaining), 0, -size - 3);
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

    for (const slot of this.cardSlotsLayout) {
      const card = this.getCardDataBySlot(slot.index);
      this.drawCardSlot(slot, card);
    }

    ctx.fillStyle = '#1f1f1f';
    ctx.font = '16px Arial';
    ctx.fillText('卡片槽最多 3 张，特殊兵种每张只能用一次', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 24);
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