const { isSessionValid, clearLogin } = require('./utils/auth.js');

App({
  globalData: {
    token: '',
    role: '',        // admin=管理端 / tenant=租客端
    userInfo: null,
    unread: 0        // 租客端未读消息数（tabBar 角标）
  },

  onLaunch() {
    // 恢复登录态
    this.globalData.token = wx.getStorageSync('token') || '';
    this.globalData.role = wx.getStorageSync('role') || '';
    this.globalData.userInfo = wx.getStorageSync('userInfo') || null;
    // 启动时即剔除过期 / 超时会话，避免带着失效 token 进页面
    if (this.globalData.token && !isSessionValid()) {
      clearLogin();
    }
  },

  onShow() {
    // 从后台切回前台时再次校验会话（token 过期或超过 2 小时无操作则退出）
    if (this.globalData.token && !isSessionValid()) {
      clearLogin();
      wx.reLaunch({ url: '/pages/login/login' });
    }
  }
});
