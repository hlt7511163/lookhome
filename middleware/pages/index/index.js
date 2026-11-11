const { request } = require('../../utils/request.js');
const { ensureLogin, setUnread } = require('../../utils/auth.js');
const { fmtMoney, maskPhone, VERIFY_STATUS } = require('../../utils/util.js');

Page({
  data: {
    tenant: null,
    contract: null,
    unpaidTotal: '0.00',
    sitePhone: '',
    unread: 0,
    avatarChar: '租',
    tenantName: '租客',
    userSub: '',
    verifyText: '待审核',
    verifyTagClass: 'vt-wait'
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadAll();
  },

  async loadAll() {
    wx.showNavigationBarLoading();
    try {
      const me = await request('/api/tenant/me', 'GET');
      const userInfo = wx.getStorageSync('userInfo') || {};
      const t = me.tenant || userInfo;
      this.setData({
        tenant: t,
        avatarChar: (t.name || '租').charAt(0),
        tenantName: t.name || '租客',
        userSub: maskPhone(t.phone) + ' · ' + (VERIFY_STATUS[t.verify_status] || '待审核'),
        verifyText: VERIFY_STATUS[t.verify_status] || '待审核',
        verifyTagClass: t.verify_status === 'approved' ? 'vt-ok' : 'vt-wait',
        contract: me.contract || null,
        unpaidTotal: fmtMoney(me.unpaid_total),
        sitePhone: me.site_phone || ''
      });
    } catch (e) {
      console.error('加载我的信息失败', e);
    }
    // 未读消息数（tabBar 角标）
    try {
      const reminders = await request('/api/tenant/reminders', 'GET');
      const unread = (reminders || []).filter(r => r.status === 'pending').length;
      setUnread(unread);
      this.setData({ unread });
    } catch (e) { /* 忽略 */ }
    wx.hideNavigationBarLoading();
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh());
  },

  goBills() { wx.switchTab({ url: '/pages/bills/bills' }); },
  goProperties() { wx.switchTab({ url: '/pages/properties/properties' }); },
  goReminders() { wx.switchTab({ url: '/pages/reminders/reminders' }); },
  goRefund() { wx.navigateTo({ url: '/pages/refund/refund' }); },
  goApplications() { wx.navigateTo({ url: '/pages/applications/applications' }); },

  callLandlord() {
    const phone = String(this.data.sitePhone || '').replace(/\s/g, '');
    if (!phone) {
      wx.showToast({ title: '房东暂未配置联系电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phone });
  }
});
