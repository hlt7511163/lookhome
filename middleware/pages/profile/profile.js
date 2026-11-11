const { request } = require('../../utils/request.js');
const { ensureLogin, clearLogin } = require('../../utils/auth.js');
const { maskPhone, VERIFY_STATUS } = require('../../utils/util.js');

Page({
  data: {
    tenant: null,
    avatarChar: '租',
    phoneMasked: '',
    verifyText: '待审核',
    sitePhone: '',
    subscribeOn: false
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadMe();
  },

  async loadMe() {
    try {
      const me = await request('/api/tenant/me', 'GET');
      const userInfo = wx.getStorageSync('userInfo') || {};
      const t = me.tenant || userInfo;
      this.setData({
        tenant: t,
        avatarChar: (t.name || '租').charAt(0),
        phoneMasked: maskPhone(t.phone),
        verifyText: VERIFY_STATUS[t.verify_status] || '待审核',
        sitePhone: me.site_phone || ''
      });
    } catch (e) {
      console.error('加载我的信息失败', e);
    }
    // 订阅状态
    try {
      const sub = await request('/api/tenant/subscribe-status', 'GET');
      this.setData({ subscribeOn: !!sub.subscribed });
    } catch (e) { /* 忽略 */ }
  },

  goApplications() { wx.navigateTo({ url: '/pages/applications/applications' }); },
  goRefund() { wx.navigateTo({ url: '/pages/refund/refund' }); },

  callLandlord() {
    const phone = String(this.data.sitePhone || '').replace(/\s/g, '');
    if (!phone) {
      wx.showToast({ title: '房东暂未配置联系电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phone });
  },

  // 开启/关闭缴费提醒订阅（微信订阅消息）
  async toggleSubscribe() {
    if (this.data.subscribeOn) {
      // 取消订阅
      try {
        await request('/api/tenant/subscribe', 'POST', { pay: false });
        this.setData({ subscribeOn: false });
        wx.showToast({ title: '已关闭缴费提醒', icon: 'none' });
      } catch (e) { /* 忽略 */ }
      return;
    }
    // 申请订阅授权
    try {
      const cfg = await request('/api/tenant/subscribe-config', 'GET');
      const tmplId = cfg.template_pay || '';
      if (!tmplId) {
        wx.showToast({ title: '缴费提醒未配置，请联系房东', icon: 'none' });
        return;
      }
      wx.requestSubscribeMessage({
        tmplIds: [tmplId],
        success: async (res) => {
          if (res[tmplId] === 'accept') {
            await request('/api/tenant/subscribe', 'POST', { pay: true });
            this.setData({ subscribeOn: true });
            wx.showToast({ title: '缴费提醒已开启', icon: 'success' });
          } else {
            wx.showToast({ title: '你拒绝了订阅授权', icon: 'none' });
          }
        },
        fail: () => wx.showToast({ title: '订阅失败', icon: 'none' })
      });
    } catch (e) {
      console.error('订阅失败', e);
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
