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
  }
});
