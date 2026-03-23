import './render';
import Music from './runtime/music';

import SceneManager from './scene/scene-manager';
import HomeScene from './scene/home-scene';
import TutorialScene from './scene/tutorial-scene';
import GoGameScene from './scene/go-game-scene';
import BoardSelectScene from './scene/board-select-scene';
import CardSelectScene from './scene/card-select-scene';
import VictorySelectScene from './scene/victory-select-scene';

GameGlobal.musicManager = new Music();

export default class Main {
  constructor() {
    this.bindLoop = this.loop.bind(this);

    this.sceneManager = new SceneManager();

    this.goGameScene = new GoGameScene(this.sceneManager);
    this.boardSelectScene = new BoardSelectScene(this.sceneManager, this.goGameScene);
    this.cardSelectScene = new CardSelectScene(this.sceneManager, this.goGameScene);
    this.victorySelectScene = new VictorySelectScene(this.sceneManager, this.goGameScene);
    this.tutorialScene = new TutorialScene(
      this.sceneManager,
      null,
      this.goGameScene
    );

    this.homeScene = new HomeScene(
      this.sceneManager,
      this.tutorialScene,
      this.boardSelectScene
    );

    this.tutorialScene.homeScene = this.homeScene;
    this.goGameScene.homeScene = this.homeScene;
    this.boardSelectScene.homeScene = this.homeScene;
    this.boardSelectScene.victorySelectScene = this.victorySelectScene;
    this.victorySelectScene.homeScene = this.homeScene;
    this.victorySelectScene.boardSelectScene = this.boardSelectScene;
    this.victorySelectScene.cardSelectScene = this.cardSelectScene;
    this.cardSelectScene.boardSelectScene = this.boardSelectScene;
    this.cardSelectScene.victorySelectScene = this.victorySelectScene;

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
