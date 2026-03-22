import Player from '../player/index';
import Enemy from '../npc/enemy';
import BackGround from '../runtime/background';
import GameInfo from '../runtime/gameinfo';
import { drawButton, inRect } from '../utils/ui';

const ctx = canvas.getContext('2d');
const SCREEN_WIDTH = canvas.width;
const SCREEN_HEIGHT = canvas.height;

const ENEMY_GENERATE_INTERVAL = 30;

export default class GameScene {
  constructor(sceneManager, tutorialScene) {
    this.sceneManager = sceneManager;
    this.tutorialScene = tutorialScene;

    this.bg = new BackGround();
    this.player = new Player();
    this.gameInfo = new GameInfo();
    this.bgm = "audio/bgm_fight.mp3";

    this.gameInfo.on('restart', () => {
      this.startLevel1();
    });
  }

  startLevel1() {
    GameGlobal.databus.reset();
    this.player.init();
  }

  onTouchStart(e) {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    if (inRect(x, y, SCREEN_WIDTH - 120, 20, 100, 44)) {
      this.sceneManager.switchTo(this.tutorialScene);
      return;
    }

    if (GameGlobal.databus.isGameOver) {
      if (this.gameInfo.touchEventHandler) {
        this.gameInfo.touchEventHandler(e);
      }
      return;
    }

    if (this.player.checkIsFingerOnAir) {
      this.player.checkIsFingerOnAir(x, y);
    }
  }

  onTouchMove(e) {
    if (GameGlobal.databus.isGameOver) return;

    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    if (this.player.setAirPosAcrossFingerPosZ) {
      this.player.setAirPosAcrossFingerPosZ(x, y);
    }
  }

  enemyGenerate() {
    if (GameGlobal.databus.frame % ENEMY_GENERATE_INTERVAL === 0) {
      const enemy = GameGlobal.databus.pool.getItemByClass('enemy', Enemy);
      enemy.init();
      GameGlobal.databus.enemys.push(enemy);
    }
  }

  collisionDetection() {
    GameGlobal.databus.bullets.forEach((bullet) => {
      for (let i = 0, il = GameGlobal.databus.enemys.length; i < il; i++) {
        const enemy = GameGlobal.databus.enemys[i];

        if (enemy.isCollideWith(bullet)) {
          enemy.destroy();
          bullet.destroy();
          GameGlobal.databus.score += 1;
          break;
        }
      }
    });

    for (let i = 0, il = GameGlobal.databus.enemys.length; i < il; i++) {
      const enemy = GameGlobal.databus.enemys[i];

      if (this.player.isCollideWith(enemy)) {
        this.player.destroy();
        GameGlobal.databus.gameOver();
        break;
      }
    }
  }

  update() {
    GameGlobal.databus.frame++;

    if (GameGlobal.databus.isGameOver) return;

    this.bg.update();
    this.player.update();
    GameGlobal.databus.bullets.forEach((item) => item.update());
    GameGlobal.databus.enemys.forEach((item) => item.update());

    this.enemyGenerate();
    this.collisionDetection();
  }

  render() {
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    this.bg.render(ctx);
    this.player.render(ctx);
    GameGlobal.databus.bullets.forEach((item) => item.render(ctx));
    GameGlobal.databus.enemys.forEach((item) => item.render(ctx));
    this.gameInfo.render(ctx);

    GameGlobal.databus.animations.forEach((ani) => {
      if (ani.isPlaying) {
        ani.aniRender(ctx);
      }
    });

    drawButton(
      SCREEN_WIDTH - 120,
      20,
      100,
      44,
      '#444444',
      GameGlobal.databus.isGameOver ? '返回' : '退出',
      18
    );
  }
}