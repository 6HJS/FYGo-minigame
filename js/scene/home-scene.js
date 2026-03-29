import { drawButton, inRect } from '../utils/ui';

const ctx = canvas.getContext('2d');
const SCREEN_WIDTH = canvas.width;
const SCREEN_HEIGHT = canvas.height;

export default class HomeScene {
  constructor(sceneManager, tutorialScene, boardSelectScene, onlineScene) {
    this.sceneManager = sceneManager;
    this.tutorialScene = tutorialScene;
    this.boardSelectScene = boardSelectScene;
    this.onlineScene = onlineScene;
    this.bgm = "audio/bgm_title.mp3";
  }

  onTouchStart(e) {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    const btnX = 40;
    const btnW = SCREEN_WIDTH - 80;
    const btnH = 70;

    const btn1Y = 600;
    const btn2Y = 300;
    const btn3Y = 400;
    const btn4Y = 500;

    if (inRect(x, y, btnX, btn1Y, btnW, btnH)) {
      this.sceneManager.switchTo(this.tutorialScene);
      return;
    }

    if (inRect(x, y, btnX, btn2Y, btnW, btnH)) {
      this.sceneManager.switchTo(this.boardSelectScene);
      return;
    }

    if (inRect(x, y, btnX, btn3Y, btnW, btnH)) {
      if (this.onlineScene) {
        this.sceneManager.switchTo(this.onlineScene);
        return;
      }
    }

    if (inRect(x, y, btnX, btn4Y, btnW, btnH)) {
      wx.showToast({
        title: '江湖排位开发中',
        icon: 'none'
      });
    }
  }

  update() {}

  render() {
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.fillStyle = '#1f2430';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.fillStyle = '#f5e6a9';
    ctx.font = 'bold 56px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('飞扬围棋', SCREEN_WIDTH / 2, 100);

    ctx.fillStyle = '#d8d8d8';
    ctx.font = '20px Arial';
    ctx.fillText('请选择模式', SCREEN_WIDTH / 2, 150);

    drawButton(40, 600, SCREEN_WIDTH - 80, 70, '#4a90e2', '玩法教学');
    drawButton(40, 300, SCREEN_WIDTH - 80, 70, '#27ae60', '休闲模式');
    drawButton(40, 400, SCREEN_WIDTH - 80, 70, '#16a085', '在线对局');
    drawButton(40, 500, SCREEN_WIDTH - 80, 70, '#d68910', '江湖排位');
  }
}