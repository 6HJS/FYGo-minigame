import './render';
import Music from './runtime/music';

import SceneManager from './scene/scene-manager';
import HomeScene from './scene/home-scene';
import TutorialScene from './scene/tutorial-scene';
import GoGameScene from './scene/go-game-scene';
import BoardSelectScene from './scene/board-select-scene';
import CardSelectScene from './scene/card-select-scene';
import VictorySelectScene from './scene/victory-select-scene';
import OnlineScene from './scene/online-scene';
import OnlineMatchScene from './scene/online-match-scene';
import OnlineClient from './runtime/online-client';

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

    this.onlineClient = new OnlineClient();
    this.onlineMatchScene = new OnlineMatchScene(this.sceneManager, this.onlineClient);
    this.onlineScene = new OnlineScene(this.sceneManager, this.onlineClient, this.onlineMatchScene);

    this.homeScene = new HomeScene(
      this.sceneManager,
      this.tutorialScene,
      this.boardSelectScene,
      this.onlineScene
    );

    this.tutorialScene.homeScene = this.homeScene;
    this.onlineScene.homeScene = this.homeScene;
    this.onlineMatchScene.onlineLobbyScene = this.onlineScene;
    this.onlineMatchScene.homeScene = this.homeScene;
    this.goGameScene.onlineScene = this.onlineScene;
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
    this.lastNativeTouchAt = 0;
    this.inputProfile = this.detectInputProfile();

    // 始终保留微信原生触摸通道。
    // 桌面端（尤其 Mac 桌面版 / 开发者工具）主界面按钮点击，
    // 本质上仍然依赖这一层事件；若只开鼠标回退，会导致非棋盘场景失灵。
    wx.onTouchStart((e) => {
      this.lastNativeTouchAt = Date.now();
      this.sceneManager.onTouchStart(e);
    });

    wx.onTouchMove((e) => {
      this.lastNativeTouchAt = Date.now();
      this.sceneManager.onTouchMove(e);
    });

    wx.onTouchEnd((e) => {
      this.lastNativeTouchAt = Date.now();
      this.sceneManager.onTouchEnd(e);
    });

    if (this.inputProfile.useMouse) {
      this.bindMouseClickFallback();
      this.bindMouseWheelZoom();
      this.bindKeyboardZoomFallback();
    }
  }

  detectInputProfile() {
    let platform = '';
    let model = '';
    try {
      const info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : null;
      platform = String(info && info.platform ? info.platform : '').toLowerCase();
      model = String(info && info.model ? info.model : '').toLowerCase();
    } catch (err) {}

    const isTouchOnly = (
      platform === 'ios' ||
      platform === 'android' ||
      platform === 'ipad' ||
      model.includes('ipad') ||
      model.includes('iphone') ||
      model.includes('android')
    );

    const isDesktop = (
      platform === 'windows' ||
      platform === 'mac' ||
      platform === 'devtools' ||
      model.includes('windows') ||
      model.includes('mac')
    );

    if (isTouchOnly) return { platform, model, useTouch: true, useMouse: false };
    if (isDesktop) return { platform, model, useTouch: false, useMouse: true };
    return { platform, model, useTouch: true, useMouse: true };
  }

  bindMouseClickFallback() {
    if (typeof canvas === 'undefined' || !canvas || !canvas.addEventListener) return;

    let mouseDown = false;
    const recentNativeTouchWindow = 700;

    const shouldIgnoreSyntheticMouse = () => (
      this.lastNativeTouchAt && (Date.now() - this.lastNativeTouchAt) < recentNativeTouchWindow
    );

    const normalizeMousePoint = (event) => {
      if (!event) return { clientX: 0, clientY: 0 };
      if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
        return { clientX: event.clientX, clientY: event.clientY };
      }
      const fallbackX = typeof event.pageX === 'number'
        ? event.pageX
        : (typeof event.offsetX === 'number' ? event.offsetX : canvas.width / 2);
      const fallbackY = typeof event.pageY === 'number'
        ? event.pageY
        : (typeof event.offsetY === 'number' ? event.offsetY : canvas.height / 2);
      return { clientX: fallbackX, clientY: fallbackY };
    };

    const makeTouchEvent = (event, includeTouch = true) => {
      const point = normalizeMousePoint(event);
      return {
        touches: includeTouch ? [point] : [],
        changedTouches: [point]
      };
    };

    const handleMouseDown = (event) => {
      if (shouldIgnoreSyntheticMouse()) return;
      mouseDown = true;
      this.sceneManager.onTouchStart(makeTouchEvent(event, true));
    };

    const handleMouseMove = (event) => {
      if (!mouseDown || shouldIgnoreSyntheticMouse()) return;
      this.sceneManager.onTouchMove(makeTouchEvent(event, true));
    };

    const handleMouseUp = (event) => {
      if (!mouseDown) return;
      mouseDown = false;
      if (shouldIgnoreSyntheticMouse()) return;
      this.sceneManager.onTouchEnd(makeTouchEvent(event, false));
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
      target.addEventListener('mousedown', handleMouseDown);
      target.addEventListener('mousemove', handleMouseMove);
      target.addEventListener('mouseup', handleMouseUp);
      target.addEventListener('mouseleave', handleMouseUp);
    });
  }

  bindMouseWheelZoom() {
    if (typeof canvas === 'undefined' || !canvas) return;

    const getFallbackPoint = () => {
      const scene = this.sceneManager && this.sceneManager.currentScene;
      if (scene && typeof scene.getBoardViewportCenter === 'function') {
        return scene.getBoardViewportCenter();
      }
      return {
        x: canvas.width / 2,
        y: canvas.height / 2
      };
    };

    const normalizeWheelEvent = (event) => {
      if (!event) return null;

      const fallbackPoint = getFallbackPoint();
      const x = typeof event.clientX === 'number'
        ? event.clientX
        : (typeof event.pageX === 'number'
          ? event.pageX
          : (typeof event.offsetX === 'number' ? event.offsetX : fallbackPoint.x));
      const y = typeof event.clientY === 'number'
        ? event.clientY
        : (typeof event.pageY === 'number'
          ? event.pageY
          : (typeof event.offsetY === 'number' ? event.offsetY : fallbackPoint.y));

      let deltaY = 0;
      if (typeof event.deltaY === 'number' && event.deltaY !== 0) {
        deltaY = event.deltaY;
      } else if (typeof event.wheelDeltaY === 'number' && event.wheelDeltaY !== 0) {
        deltaY = -event.wheelDeltaY;
      } else if (typeof event.wheelDelta === 'number' && event.wheelDelta !== 0) {
        deltaY = -event.wheelDelta;
      } else if (typeof event.detail === 'number' && event.detail !== 0) {
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
      if (event && event.preventDefault) event.preventDefault();
      if (event) event.returnValue = false;
    };

    const bindListener = (target, eventName, options) => {
      if (!target) return false;
      if (typeof target.addEventListener === 'function') {
        target.addEventListener(eventName, wheelHandler, options);
        return true;
      }
      return false;
    };

    const assignDomHandler = (target, propName) => {
      if (!target || !(propName in target)) return false;
      const prev = typeof target[propName] === 'function' ? target[propName] : null;
      target[propName] = (event) => {
        if (prev) prev.call(target, event);
        wheelHandler(event);
        return false;
      };
      return true;
    };

    const targets = [];
    if (typeof canvas !== 'undefined' && canvas) targets.push(canvas);
    if (typeof window !== 'undefined' && window) targets.push(window);
    if (typeof document !== 'undefined' && document) targets.push(document);
    if (typeof document !== 'undefined' && document && document.body) targets.push(document.body);
    if (typeof globalThis !== 'undefined' && globalThis) targets.push(globalThis);

    const attached = new Set();
    targets.forEach((target) => {
      if (!target || attached.has(target)) return;
      attached.add(target);
      bindListener(target, 'wheel', { passive: false, capture: true });
      bindListener(target, 'mousewheel', { passive: false, capture: true });
      bindListener(target, 'DOMMouseScroll', { passive: false, capture: true });
      assignDomHandler(target, 'onwheel');
      assignDomHandler(target, 'onmousewheel');
    });
  }


  bindKeyboardZoomFallback() {
    if (!wx || typeof wx.onKeyDown !== 'function') return;

    const makeWheelLikeEvent = (deltaY) => {
      const scene = this.sceneManager && this.sceneManager.currentScene;
      const center = scene && typeof scene.getBoardViewportCenter === 'function'
        ? scene.getBoardViewportCenter()
        : { x: canvas.width / 2, y: canvas.height / 2 };
      return {
        clientX: center.x,
        clientY: center.y,
        deltaY,
        preventDefault: () => {}
      };
    };

    wx.onKeyDown((event) => {
      const scene = this.sceneManager && this.sceneManager.currentScene;
      if (!scene || typeof scene.onWheel !== 'function') return;

      const key = String((event && (event.key || event.code || event.keyCode)) || '').toLowerCase();
      if (!key) return;

      if (key === '+' || key === '=' || key === 'equal' || key === 'numpadadd' || key === '187') {
        this.sceneManager.onWheel(makeWheelLikeEvent(-120));
        return;
      }
      if (key === '-' || key === '_' || key === 'minus' || key === 'numpadsubtract' || key === '189') {
        this.sceneManager.onWheel(makeWheelLikeEvent(120));
      }
    });
  }

  loop() {
    this.sceneManager.update();
    this.sceneManager.render();
    this.aniId = requestAnimationFrame(this.bindLoop);
  }
}
