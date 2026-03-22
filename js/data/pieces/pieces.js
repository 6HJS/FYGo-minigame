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
      id: 'fog',
      name: '迷雾',
      symbol: '🌫',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#2f3640',
      advanceOrder: 7,
      behavior: { type: 'none' }
    },

    {
      id: 'rebirth',
      name: '重生',
      symbol: '🌱',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#2e8b57',
      advanceOrder: 8,
      behavior: { type: 'none' }
    },

    {
      id: 'persuader',
      name: '说客',
      symbol: '📢',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#16a085',
      advanceOrder: 9,
      behavior: { type: 'none' }
    },
    {
      id: 'contract',
      name: '契约',
      symbol: '✝',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#7e22ce',
      advanceOrder: 15,
      behavior: { type: 'none' }
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
        destroyOnlySelfCell: true,
        offsetsByDir: {
          U: [[0,-1],[0,0],[0,1],[-1,-1],[-1,0],[-1,1]],
          D: [[0,-1],[0,0],[0,1],[1,-1],[1,0],[1,1]],
          L: [[-1,0],[0,0],[1,0],[-1,-1],[0,-1],[1,-1]],
          R: [[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]]
        }
      }
    },

    {
      id: 'reverse',
      name: '逆转',
      symbol: '🔄',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#d35400',
      advanceOrder: 11,
      behavior: { type: 'none' }
    },


    {
      id: 'repulsion',
      name: '斥力',
      symbol: '⤡',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#1f6feb',
      advanceOrder: 12,
      behavior: { type: 'none' }
    },
    {
      id: 'gravity',
      name: '引力',
      symbol: '⤢',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#4b2e83',
      advanceOrder: 12,
      behavior: { type: 'none' }
    },
    {
      id: 'fortress',
      name: '堡垒兵',
      symbol: '🪏',
      needsDirection: true,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#6c5b3b',
      advanceOrder: 18,
      behavior: {
        type: 'dig_front',
        degradeTo: 'normal',
        offsetsByDir: {
          U: [[-1,-1],[-1,0],[-1,1]],
          D: [[1,-1],[1,0],[1,1]],
          L: [[-1,-1],[0,-1],[1,-1]],
          R: [[-1,1],[0,1],[1,1]]
        }
      }
    }
  ]
};