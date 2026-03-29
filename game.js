import Main from './js/main';
import ONLINE_CONFIG from './js/config/online-config';

if (typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.init === 'function') {
  try {
    wx.cloud.init({
      env: ONLINE_CONFIG.cloudEnv,
      traceUser: true
    });
  } catch (err) {}
}

new Main();
