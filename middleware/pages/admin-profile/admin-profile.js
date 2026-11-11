const { request } = require('../../utils/request.js');
const { ensureLogin, clearLogin } = require('../../utils/auth.js');

Page({
  data: {
    user: null,
    pwdModal: false,
    oldPwd: '',
    newPwd: '',
    confirmPwd: '',
    submitting: false
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadMe();
  },

  async loadMe() {
    try {
      const res = await request('/api/auth/me', 'GET');
      this.setData({ user: res });
    } catch (e) {
      console.error('加载账号信息失败', e);
    }
  },

  openPwd() { this.setData({ pwdModal: true, oldPwd: '', newPwd: '', confirmPwd: '' }); },
  noop() { /* 阻止弹窗遮罩穿透点击 */ },
  goContract() { wx.navigateTo({ url: '/pages/admin-contract/admin-contract' }); },
  goContracts() { wx.navigateTo({ url: '/pages/admin-contracts/admin-contracts' }); },
  closePwd() { this.setData({ pwdModal: false }); },
  onOldPwd(e) { this.setData({ oldPwd: e.detail.value }); },
  onNewPwd(e) { this.setData({ newPwd: e.detail.value }); },
  onConfirmPwd(e) { this.setData({ confirmPwd: e.detail.value }); },

  async submitPwd() {
    const { oldPwd, newPwd, confirmPwd } = this.data;
    if (!oldPwd || !newPwd) {
      wx.showToast({ title: '请填写完整', icon: 'none' });
      return;
    }
    if (newPwd.length < 6) {
      wx.showToast({ title: '新密码至少 6 位', icon: 'none' });
      return;
    }
    if (newPwd !== confirmPwd) {
      wx.showToast({ title: '两次输入的新密码不一致', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await request('/api/auth/password', 'POST', { oldPwd, newPwd });
      this.setData({ submitting: false, pwdModal: false });
      wx.showToast({ title: '密码已修改', icon: 'success' });
    } catch (e) {
      this.setData({ submitting: false });
      console.error('修改密码失败', e);
    }
  },

  handleLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (r) => {
        if (!r.confirm) return;
        clearLogin();
        wx.reLaunch({ url: '/pages/login/login' });
      }
    });
  }
});
