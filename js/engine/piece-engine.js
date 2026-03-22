function createPiece(color, type = 'normal', dir = null) {
  return { color, type, dir };
}

function getPieceDef(pieceMap, type) {
  return pieceMap[type] || pieceMap.normal;
}

function getOffsetsByDir(offsetsByDir, dir) {
  if (!offsetsByDir) return [];
  return offsetsByDir[dir] || offsetsByDir.U || [];
}

function getAreaByOffsets(scene, row, col, offsets) {
  const result = [];
  const seen = new Set();

  for (const [dr, dc] of offsets) {
    const nr = row + dr;
    const nc = col + dc;
    if (!scene.isBoardShapeCell(nr, nc)) continue;

    const key = `${nr},${nc}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push([nr, nc]);
  }

  return result;
}

function handleMoveForward(scene, row, col, piece, pieceDef) {
  const dirMap = scene.DIRS;
  const move = dirMap[piece.dir];
  if (!move) return null;

  const nr = row + move.dr;
  const nc = col + move.dc;

  if (!scene.isPlayablePoint(nr, nc)) {
    const fallbackType = pieceDef.behavior.transformOnBlocked || 'normal';
    scene.board[row][col] = createPiece(piece.color, fallbackType, null);
    return {
      moved: false,
      transformed: true
    };
  }

  if (pieceDef.behavior.killOccupant && scene.isPiece(scene.board[nr][nc])) {
    scene.board[nr][nc] = null;
  }

  scene.board[nr][nc] = createPiece(piece.color, piece.type, piece.dir);
  scene.board[row][col] = null;
  scene.lastMove = { row: nr, col: nc };

  return {
    moved: true,
    transformed: false
  };
}

function handleBlastArea(scene, row, col, piece, pieceDef) {
  const rule = pieceDef.behavior;
  GameGlobal.musicManager.playExplosion(); // 播放爆炸音效

  if (rule.disableIfEnemyAdjacent && scene.hasEnemyAdjacent(row, col, piece.color)) {
    const downgrade = rule.degradeTo || 'normal';
    scene.board[row][col] = createPiece(piece.color, downgrade, null);
    return {
      exploded: [],
      triggeredCount: 0,
      disabledCount: 1,
      destroyedCellsCount: 0
    };
  }

  const offsets = getOffsetsByDir(rule.offsetsByDir, piece.dir);
  const area = getAreaByOffsets(scene, row, col, offsets);

  const exploded = [];
  let destroyedCellsCount = 0;

  for (const [r, c] of area) {
    if (scene.isPiece(scene.board[r][c])) {
      exploded.push([r, c]);
    }

    if (rule.destroyCells) {
      if (scene.board[r][c] !== scene.DESTROYED) {
        destroyedCellsCount++;
      }
      scene.board[r][c] = scene.DESTROYED;
    } else {
      scene.board[r][c] = null;
    }
  }

  scene.lastMove = { row, col };

  return {
    exploded,
    triggeredCount: 1,
    disabledCount: 0,
    destroyedCellsCount
  };
}

function runAdvanceForPiece(scene, row, col, piece, pieceDef) {
  const behaviorType = pieceDef.behavior?.type || 'none';

  switch (behaviorType) {
    case 'move_forward':
      return handleMoveForward(scene, row, col, piece, pieceDef);

    case 'blast_area':
      return handleBlastArea(scene, row, col, piece, pieceDef);

    case 'none':
    default:
      return null;
  }
}

module.exports = {
  createPiece,
  getPieceDef,
  runAdvanceForPiece
};