module.exports = {
  defaultPieceType: 'normal',
  pieces: [
    {
      id: 'normal',
      name: '普通棋子',
      symbol: '',
      needsDirection: false,
      selectable: false,
      advanceOrder: 0,
      behavior: { type: 'none' }
    },
    {
      id: 'cavalry',
      name: '骑兵',
      symbol: '🐴',
      needsDirection: true,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#c0392b',
      advanceOrder: 10,
      behavior: {
        type: 'move_forward',
        transformOnBlocked: 'normal',
        killOccupant: true
      }
    },
    {
      id: 'bomber',
      name: '自爆兵',
      symbol: '💥',
      needsDirection: true,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#8e44ad',
      advanceOrder: 20,
      behavior: {
        type: 'blast_area',
        disableIfEnemyAdjacent: true,
        degradeTo: 'normal',
        destroyCells: true,
        offsetsByDir: {
          U: [[0,-1],[0,0],[0,1],[-1,-1],[-1,0],[-1,1]],
          D: [[0,-1],[0,0],[0,1],[1,-1],[1,0],[1,1]],
          L: [[-1,0],[0,0],[1,0],[-1,-1],[0,-1],[1,-1]],
          R: [[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]]
        }
      }
    }
  ]
};