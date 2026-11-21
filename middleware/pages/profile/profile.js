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
  },

  // ===== 自助注销账号（微信审核要求）=====
  // 两步确认：先说明后果，再要求手输「注销」两个字，避免误触
  requestDelete() {
    wx.showModal({
      title: '注销账号',
      content: '注销后：姓名、手机号、身份证号将被清除且无法恢复；已签合同与账单按法规留存；有未结清账单时无法注销。',
      confirmText: '继续',
      success: (r) => {
        if (r.confirm) this.confirmDelete();
      }
    });
  },

  confirmDelete() {
    wx.showModal({
      title: '确认注销',
      editable: true,
      placeholderText: '请输入「注销」两个字确认',
      confirmText: '注销',
      success: async (r) => {
        if (!r.confirm) return;
        if (String(r.content || '').trim() !== '注销') {
          wx.showToast({ title: '输入不匹配，已取消', icon: 'none' });
          return;
        }
        wx.showToast({ title: '正在注销...', icon: 'loading', duration: 10000 });
        try {
          await request('/api/auth/delete-account', 'POST', { confirm: '注销' }, { silent: true });
          wx.hideToast();
          clearLogin();
          wx.showToast({ title: '账号已注销', icon: 'success' });
          setTimeout(() => wx.reLaunch({ url: '/pages/login/login' }), 800);
        } catch (e) {
          wx.hideToast();
          const msg = (e && (e.message || (e.data && e.data.error))) || '注销失败，请稍后重试';
          wx.showModal({
            title: '无法注销',
            content: msg + '\n\n如服务端尚未开放自助注销，可按《隐私政策》中的联系方式找房东协助处理。',
            showCancel: false
          });
        }
      }
    });
  }
});
