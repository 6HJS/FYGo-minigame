import './render';
import Music from './runtime/music';

import SceneManager from './scene/scene-manager';
import HomeScene from './scene/home-scene';
import TutorialScene from './scene/tutorial-scene';
import GoGameScene from './scene/go-game-scene';

GameGlobal.musicManager = new Music();

export default class Main {
  constructor() {
    this.bindLoop = this.loop.bind(this);

    this.sceneManager = new SceneManager();

    this.goGameScene = new GoGameScene(this.sceneManager);
    this.tutorialScene = new TutorialScene(
      this.sceneManager,
      null,
      this.goGameScene
    );

    this.homeScene = new HomeScene(
      this.sceneManager,
      this.tutorialScene,
      this.goGameScene
    );

    this.tutorialScene.homeScene = this.homeScene;
    this.goGameScene.homeScene = this.homeScene;

    this.sceneManager.switchTo(this.homeScene);

    this.initEvent();
    this.aniId = requestAnimationFrame(this.bindLoop);
  }

  initEvent() {
    wx.onTouchStart((e) => {
      this.sceneManager.onTouchStart(e);
    });

    wx.onTouchMove((e) => {
      this.sceneManager.onTouchMove(e);
    });

    wx.onTouchEnd((e) => {
      this.sceneManager.onTouchEnd(e);
    });
  }

  loop() {
    this.sceneManager.update();
    this.sceneManager.render();
    this.aniId = requestAnimationFrame(this.bindLoop);
  }
}