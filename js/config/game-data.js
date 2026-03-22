const boardConfig = require('../data/boards/square9.js');
const pieceConfig = require('../data/pieces/pieces.js');

function buildPieceMap(pieceList) {
  const map = {};
  for (const piece of pieceList) {
    map[piece.id] = piece;
  }
  return map;
}

const pieceMap = buildPieceMap(pieceConfig.pieces);

module.exports = {
  boardConfig,
  pieceConfig,
  pieceMap
};