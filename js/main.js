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

    this.bindMouseWheelZoom();
  }

  bindMouseWheelZoom() {
    const normalizeWheelEvent = (event) => {
      if (!event) return null;

      const x = typeof event.clientX === 'number'
        ? event.clientX
        : (typeof event.pageX === 'number' ? event.pageX : (typeof event.offsetX === 'number' ? event.offsetX : canvas.width / 2));
      const y = typeof event.clientY === 'number'
        ? event.clientY
        : (typeof event.pageY === 'number' ? event.pageY : (typeof event.offsetY === 'number' ? event.offsetY : canvas.height / 2));

      let deltaY = 0;
      if (typeof event.deltaY === 'number') {
        deltaY = event.deltaY;
      } else if (typeof event.wheelDelta === 'number') {
        deltaY = -event.wheelDelta;
      } else if (typeof event.detail === 'number') {
        deltaY = event.detail;
      }

      return {
        clientX: x,
        clientY: y,
        deltaY,
        ctrlKey: !!event.ctrlKey,
        metaKey: !!event.metaKey,
        shiftKey: !!event.shiftKey,
        preventDefault: () => {
          if (event.preventDefault) event.preventDefault();
          event.returnValue = false;
        }
      };
    };

    const wheelHandler = (event) => {
      const normalized = normalizeWheelEvent(event);
      if (!normalized || !normalized.deltaY) return;
      this.sceneManager.onWheel(normalized);
    };

    const targets = [];
    if (typeof canvas !== 'undefined' && canvas && canvas.addEventListener) targets.push(canvas);
    if (typeof window !== 'undefined' && window && window.addEventListener) targets.push(window);
    if (typeof document !== 'undefined' && document && document.addEventListener) targets.push(document);
    if (typeof globalThis !== 'undefined' && globalThis && globalThis.addEventListener) targets.push(globalThis);

    const attached = new Set();
    targets.forEach((target) => {
      if (!target || attached.has(target) || !target.addEventListener) return;
      attached.add(target);
      target.addEventListener('wheel', wheelHandler, { passive: false });
      target.addEventListener('mousewheel', wheelHandler, { passive: false });
    });
  }

  loop() {
    this.sceneManager.update();
    this.sceneManager.render();
    this.aniId = requestAnimationFrame(this.bindLoop);
  }
}
