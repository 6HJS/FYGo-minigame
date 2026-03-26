export default class SceneManager {
  constructor() {
    this.currentScene = null;
  }

  switchTo(scene) {
    if (!scene) return;

    if (this.currentScene && this.currentScene.onLeave) {
      this.currentScene.onLeave();
    }

    this.currentScene = scene;

    // 自动切换场景BGM
    if (
      this.currentScene &&
      this.currentScene.bgm &&
      GameGlobal.musicManager
    ) {
      GameGlobal.musicManager.playBgm(this.currentScene.bgm);
    }

    if (this.currentScene && this.currentScene.onEnter) {
      this.currentScene.onEnter();
    }
  }

  update() {
    if (this.currentScene && this.currentScene.update) {
      this.currentScene.update();
    }
  }

  render() {
    if (this.currentScene && this.currentScene.render) {
      this.currentScene.render();
    }
  }

  onTouchStart(e) {
    if (this.currentScene && this.currentScene.onTouchStart) {
      this.currentScene.onTouchStart(e);
    }
  }

  onTouchMove(e) {
    if (this.currentScene && this.currentScene.onTouchMove) {
      this.currentScene.onTouchMove(e);
    }
  }

  onTouchEnd(e) {
    if (this.currentScene && this.currentScene.onTouchEnd) {
      this.currentScene.onTouchEnd(e);
    }
  }

  onWheel(e) {
    if (this.currentScene && this.currentScene.onWheel) {
      this.currentScene.onWheel(e);
    }
  }

}