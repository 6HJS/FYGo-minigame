let instance;

/**
 * 统一的音效管理器
 */
export default class Music {
  constructor() {
    if (instance) return instance;
    instance = this;

    // 背景音乐
    this.bgmAudio = wx.createInnerAudioContext();
    this.bgmAudio.loop = true;
    this.bgmAudio.autoplay = false;

    // 短音效
    this.shootAudio = wx.createInnerAudioContext();
    this.boomAudio = wx.createInnerAudioContext();
    this.dropStone = wx.createInnerAudioContext();

    this.shootAudio.src = 'audio/bullet.mp3';
    this.boomAudio.src = 'audio/boom.mp3';
    this.dropStone.src = "audio/sound_drop_stone.mp3";

    // 当前播放的BGM
    this.currentBgm = '';
    this.bgmVolume = 0.6;
    this.sfxVolume = 1.0;

    this.bgmAudio.volume = this.bgmVolume;
    this.shootAudio.volume = this.sfxVolume;
    this.boomAudio.volume = this.sfxVolume;
  }

  /**
   * 播放/切换背景音乐
   * @param {string} src 音乐路径，例如 'audio/home.mp3'
   */
  playBgm(src) {
    if (!src) return;

    // 如果已经在播同一首，就不重复切换
    if (this.currentBgm === src) return;

    this.stopBgm();

    this.bgmAudio.src = src;
    this.bgmAudio.volume = this.bgmVolume;
    this.bgmAudio.play();

    this.currentBgm = src;
  }

  /**
   * 停止背景音乐
   */
  stopBgm() {
    this.bgmAudio.stop();
    this.currentBgm = '';
  }

  /**
   * 暂停背景音乐
   */
  pauseBgm() {
    this.bgmAudio.pause();
  }

  /**
   * 恢复背景音乐
   */
  resumeBgm() {
    if (this.currentBgm) {
      this.bgmAudio.play();
    }
  }

  /**
   * 设置背景音乐音量
   */
  setBgmVolume(volume) {
    this.bgmVolume = volume;
    this.bgmAudio.volume = volume;
  }

  /**
   * 设置音效音量
   */
  setSfxVolume(volume) {
    this.sfxVolume = volume;
    this.shootAudio.volume = volume;
    this.boomAudio.volume = volume;
  }

  /**
   * 播放射击/落子类短音效
   */
  playShoot() {
    this.shootAudio.stop();
    this.shootAudio.currentTime = 0;
    this.shootAudio.play();
  }
  playDropStone() {
    this.dropStone.stop();
    this.dropStone.currentTime = 0;
    this.dropStone.play();
  }
  /**
   * 播放爆炸短音效
   */
  playExplosion() {
    this.boomAudio.stop();
    this.boomAudio.currentTime = 0;
    this.boomAudio.play();
  }

  /**
   * 销毁，通常项目退出时才需要
   */
  destroy() {
    this.bgmAudio.destroy();
    this.shootAudio.destroy();
    this.boomAudio.destroy();
    instance = null;
  }
}