const square9 = require('./boards/square9');

const B = 1;
const W = 2;

module.exports = [
  {
    id: 1,
    name: '骑兵教学',
    pieceType: 'cavalry',
    boardConfig: square9,
    cards: ['cavalry'],
    tips: '先使用骑兵卡，把骑兵朝右放下。教学里会自动演示一次冲锋。',
    autoAdvancePlacedPiece: true,
    presetPieces: [
      { row: 4, col: 6, color: W }
    ],
    goal: {
      allOf: [
        { type: 'card_used', pieceType: 'cavalry' },
        { type: 'cell_color', row: 4, col: 6, color: B, pieceType: 'cavalry', dir: 'R' },
        { type: 'cell_empty', row: 4, col: 5 },
        { type: 'piece_count', color: W, equals: 0 }
      ]
    }
  },
  {
    id: 2,
    name: '迷雾教学',
    pieceType: 'fog',
    boardConfig: square9,
    cards: ['fog'],
    tips: '把迷雾落在任意位置，让对手下一回合视野受限。',
    presetPieces: [],
    autoDelayWinMs: 1200,
    goal: {
      allOf: [
        { type: 'card_used', pieceType: 'fog' },
        { type: 'fog_active' }
      ]
    }
  },
  {
    id: 3,
    name: '重生教学',
    pieceType: 'rebirth',
    boardConfig: square9,
    cards: ['rebirth'],
    tips: '先把重生子落在天元，再选择一个重生点。除了天元右边紧挨着那一格，其他空位都能成功。',
    autoResolveRebirthTest: true,
    presetPieces: [
      { row: 5, col: 4, color: W },
      { row: 3, col: 4, color: W },
      { row: 4, col: 3, color: W }
    ],
    goal: {
      allOf: [
        { type: 'card_used', pieceType: 'rebirth' },
        { type: 'tutorial_flag', key: 'rebirthSucceeded' }
      ]
    }
  },
  {
    id: 4,
    name: '说客教学',
    pieceType: 'persuader',
    boardConfig: square9,
    cards: ['persuader'],
    tips: '把说客落在敌子旁边，再点击那枚敌子进行劝降。',
    presetPieces: [
      { row: 4, col: 5, color: W }
    ],
    goal: {
      allOf: [
        { type: 'card_used', pieceType: 'persuader' },
        { type: 'cell_color', row: 4, col: 5, color: B },
        { type: 'cell_type', row: 4, col: 4, pieceType: 'normal', color: B }
      ]
    }
  },
  {
    id: 5,
    name: '契约教学',
    pieceType: 'contract',
    boardConfig: square9,
    cards: ['contract'],
    tips: '先把契约子落在天元，再点击右侧的白棋建立契约。教学会自动让左侧白骑兵冲死黑子，引发同归于尽。',
    autoResolveContractTrigger: true,
    presetPieces: [
      { row: 4, col: 2, color: W, type: 'cavalry', dir: 'R' },
      { row: 4, col: 5, color: W }
    ],
    goal: {
      allOf: [
        { type: 'card_used', pieceType: 'contract' },
        { type: 'cell_exists', row: 4, col: 4, color: W, pieceType: 'cavalry', dir: 'R' },
        { type: 'cell_empty', row: 4, col: 5 },
        { type: 'piece_count', color: B, equals: 0 }
      ]
    }
  },
  {
    id: 6,
    name: '自爆兵教学',
    pieceType: 'bomber',
    boardConfig: square9,
    cards: ['bomber'],
    tips: '把自爆兵朝上放下，炸掉面前两排的白棋。',
    presetPieces: [
      { row: 3, col: 3, color: W },
      { row: 3, col: 4, color: W },
      { row: 3, col: 5, color: W },
      { row: 4, col: 3, color: W },
      { row: 4, col: 4, color: W },
      { row: 4, col: 5, color: W }
    ],
    goal: {
      allOf: [
        { type: 'card_used', pieceType: 'bomber' },
        { type: 'cell_destroyed', row: 5, col: 4 },
        { type: 'piece_count', color: W, equals: 0 }
      ]
    }
  },
  {
    id: 7,
    name: '逆转教学',
    pieceType: 'reverse',
    boardConfig: square9,
    cards: ['reverse'],
    tips: '把逆转子落在中央，翻转周围敌子的颜色。',
    presetPieces: [
      { row: 3, col: 4, color: W },
      { row: 4, col: 3, color: W },
      { row: 4, col: 5, color: W },
      { row: 5, col: 4, color: W }
    ],
    goal: {
      allOf: [
        { type: 'card_used', pieceType: 'reverse' },
        { type: 'piece_count', color: W, equals: 0 },
        { type: 'piece_count', color: B, min: 4 }
      ]
    }
  },
  {
    id: 8,
    name: '斥力教学',
    pieceType: 'repulsion',
    boardConfig: square9,
    cards: ['repulsion'],
    tips: '把斥力子落在中央，把上下左右最近的棋子全推出去。',
    presetPieces: [
      { row: 2, col: 4, color: W },
      { row: 6, col: 4, color: W },
      { row: 4, col: 2, color: W },
      { row: 4, col: 6, color: W }
    ],
    goal: {
      allOf: [
        { type: 'card_used', pieceType: 'repulsion' },
        { type: 'cell_empty', row: 2, col: 4 },
        { type: 'cell_empty', row: 6, col: 4 },
        { type: 'cell_empty', row: 4, col: 2 },
        { type: 'cell_empty', row: 4, col: 6 },
        { type: 'cell_exists', row: 1, col: 4, color: W },
        { type: 'cell_exists', row: 7, col: 4, color: W },
        { type: 'cell_exists', row: 4, col: 1, color: W },
        { type: 'cell_exists', row: 4, col: 7, color: W }
      ]
    }
  },
  {
    id: 9,
    name: '引力教学',
    pieceType: 'gravity',
    boardConfig: square9,
    cards: ['gravity'],
    tips: '把引力子落在中央，把上下左右最近的棋子都拉近一格。',
    presetPieces: [
      { row: 1, col: 4, color: W },
      { row: 7, col: 4, color: W },
      { row: 4, col: 1, color: W },
      { row: 4, col: 7, color: W }
    ],
    goal: {
      allOf: [
        { type: 'card_used', pieceType: 'gravity' },
        { type: 'cell_exists', row: 2, col: 4, color: W },
        { type: 'cell_exists', row: 6, col: 4, color: W },
        { type: 'cell_exists', row: 4, col: 2, color: W },
        { type: 'cell_exists', row: 4, col: 6, color: W }
      ]
    }
  },
  {
    id: 10,
    name: '弓箭手教学',
    pieceType: 'archer',
    boardConfig: square9,
    cards: ['archer'],
    tips: '把弓箭手朝右落下。教学会自动演示一次射箭。',
    presetPieces: [
      { row: 4, col: 6, color: W }
    ],
    autoResolveArcherShot: true,
    goal: {
      allOf: [
        { type: 'card_used', pieceType: 'archer' },
        { type: 'cell_empty', row: 4, col: 6 },
        { type: 'cell_type', row: 4, col: 4, pieceType: 'normal', color: B }
      ]
    }
  },
  {
    id: 11,
    name: '交响教学',
    pieceType: 'symphony',
    boardConfig: square9,
    cards: ['symphony'],
    tips: '把交响子落在天元，让横竖两线黑白数量相等并同数清场。',
    presetPieces: [
      { row: 4, col: 2, color: B },
      { row: 4, col: 3, color: W },
      { row: 4, col: 5, color: B },
      { row: 4, col: 6, color: W },
      { row: 2, col: 4, color: B },
      { row: 3, col: 4, color: W },
      { row: 5, col: 4, color: B },
      { row: 6, col: 4, color: W }
    ],
    goal: {
      allOf: [
        { type: 'card_used', pieceType: 'symphony' },
        { type: 'piece_count', color: W, equals: 0 },
        { type: 'cell_type', row: 4, col: 4, pieceType: 'normal', color: B }
      ]
    }
  },
  {
    id: 12,
    name: '堡垒兵教学',
    pieceType: 'fortress',
    boardConfig: square9,
    cards: ['fortress'],
    tips: '把堡垒兵朝上落下，在自己前方挖出三格废墟。',
    presetPieces: [],
    goal: {
      allOf: [
        { type: 'card_used', pieceType: 'fortress' },
        { type: 'cell_destroyed', row: 3, col: 3 },
        { type: 'cell_destroyed', row: 3, col: 4 },
        { type: 'cell_destroyed', row: 3, col: 5 },
        { type: 'cell_type', row: 4, col: 4, pieceType: 'normal', color: B }
      ]
    }
  }
];
