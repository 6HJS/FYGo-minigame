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
      symbol: '♞',
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
      symbol: '≋',
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
      symbol: '☘',
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
      symbol: '☞',
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
      id: 'plague',
      name: '瘟疫',
      symbol: '☣',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#6b8e23',
      advanceOrder: 17,
      behavior: { type: 'none' }
    },
    {
      id: 'thief',
      name: '盗贼',
      symbol: '⌘',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#455a64',
      advanceOrder: 17,
      behavior: { type: 'none' }
    },
    {
      id: 'swap_card',
      name: '换牌',
      symbol: '♤',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#1565c0',
      advanceOrder: 17,
      behavior: { type: 'none' }
    },
    {
      id: 'relocate',
      name: '挪移',
      symbol: '↔',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#27ae60',
      advanceOrder: 17,
      behavior: { type: 'none' }
    },


    {
      id: 'trap',
      name: '陷阱',
      symbol: '☒',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#8b4513',
      advanceOrder: 17,
      behavior: { type: 'none' }
    },
    {
      id: 'auspice',
      name: '祥瑞',
      symbol: '☥',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#2ecc71',
      advanceOrder: 17,
      behavior: { type: 'none' }
    },
    {
      id: 'nightmare',
      name: '梦魇',
      symbol: 'ᶻᶻ',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#6a1b9a',
      advanceOrder: 17,
      behavior: { type: 'none' }
    },
    {
      id: 'time_limit',
      name: '限时',
      symbol: '⏱',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#8b0000',
      advanceOrder: 19,
      behavior: { type: 'none' }
    },
    {
      id: 'teleport',
      name: '瞬移',
      symbol: '⚡',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#1e90ff',
      advanceOrder: 18,
      behavior: { type: 'none' }
    },

    {
      id: 'yinyang',
      name: '阴阳',
      symbol: '☯',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#37474f',
      advanceOrder: 18,
      behavior: { type: 'none' }
    },

    {
      id: 'sacrifice',
      name: '献祭',
      symbol: '☠',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#5d4037',
      advanceOrder: 16,
      behavior: { type: 'none' }
    },
    {
      id: 'bomber',
      name: '自爆兵',
      symbol: '✹',
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
      symbol: '↺',
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
      symbol: '⇱',
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
      symbol: '⇲',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#4b2e83',
      advanceOrder: 12,
      behavior: { type: 'none' }
    },

    {
      id: 'spearman',
      name: '长矛兵',
      symbol: '矛',
      needsDirection: true,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#7f8c8d',
      advanceOrder: 13,
      behavior: { type: 'none' }
    },
    {
      id: 'immortal',
      name: '不朽',
      symbol: '🏆',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#d4af37',
      advanceOrder: 13,
      behavior: { type: 'none' }
    },
    {
      id: 'godofwealth',
      name: '财神',
      symbol: '$',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#2ecc71',
      advanceOrder: 13,
      behavior: { type: 'none' }
    },
    {
      id: 'archer',
      name: '弓箭手',
      symbol: '➶',
      needsDirection: true,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#b5651d',
      advanceOrder: 13,
      behavior: { type: 'none' }
    },

    {
      id: 'symphony',
      name: '交响',
      symbol: '♬',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#c2185b',
      advanceOrder: 14,
      behavior: { type: 'none' }
    },
    {
      id: 'clone',
      name: '克隆',
      symbol: 'x2',
      needsDirection: false,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#00897b',
      advanceOrder: 17,
      behavior: { type: 'none' }
    },
    {
      id: 'mountain',
      name: '山地兵',
      symbol: '⛰',
      needsDirection: true,
      selectable: true,
      buttonColor: '#8e6e3b',
      buttonActiveColor: '#6d4c41',
      advanceOrder: 18,
      behavior: {
        type: 'raise_front_cells',
        degradeTo: 'normal',
        offsetsByDir: {
          U: [[-1,-1],[-1,0],[-1,1]],
          D: [[1,-1],[1,0],[1,1]],
          L: [[-1,-1],[0,-1],[1,-1]],
          R: [[-1,1],[0,1],[1,1]]
        }
      }
    },


    {
      id: 'fortress',
      name: '堡垒兵',
      symbol: '▣',
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