import { drawButton, inRect } from '../utils/ui';

const ctx = canvas.getContext('2d');
const SCREEN_WIDTH = canvas.width;
const SCREEN_HEIGHT = canvas.height;

export default class HomeScene {
  constructor(sceneManager, tutorialScene, goGameScene) {
    this.sceneManager = sceneManager;
    this.tutorialScene = tutorialScene;
    this.goGameScene = goGameScene;
  }

  onTouchStart(e) {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    const btnX = 40;
    const btnW = SCREEN_WIDTH - 80;
    const btnH = 70;

    const btn1Y = 520;
    const btn2Y = 320;
    const btn3Y = 420;

    if (inRect(x, y, btnX, btn1Y, btnW, btnH)) {
      this.sceneManager.switchTo(this.tutorialScene);
      return;
    }

    if (inRect(x, y, btnX, btn2Y, btnW, btnH)) {
      this.sceneManager.switchTo(this.goGameScene);
      return;
    }

    if (inRect(x, y, btnX, btn3Y, btnW, btnH)) {
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

    drawButton(40, 520, SCREEN_WIDTH - 80, 70, '#4a90e2', '玩法教学');
    drawButton(40, 320, SCREEN_WIDTH - 80, 70, '#27ae60', '休闲模式');
    drawButton(40, 420, SCREEN_WIDTH - 80, 70, '#d68910', '江湖排位');
  }
}