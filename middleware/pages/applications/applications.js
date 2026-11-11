const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { APP_STATUS, PAY_MODE } = require('../../utils/util.js');
const { buildSearchKey, filterByKeyword } = require('../../utils/search.js');

Page({
  data: {
    applications: [],
    visible: [],
    keyword: '',
    searchPlaceholder: '搜房源 / 房号 / 状态'
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadApplications();
  },

  async loadApplications() {
    wx.showNavigationBarLoading();
    try {
      const res = await request('/api/tenant/my-applications', 'GET');
      const applications = (res || []).map(a => ({
        ...a,
        statusText: APP_STATUS[a.status] || a.status,
        payModeText: PAY_MODE[a.pay_mode] || a.pay_mode,
        statusClass: a.status === 'approved' ? 'st-paid' : (a.status === 'rejected' ? 'st-overdue' : 'st-unpaid'),
        search_key: buildSearchKey([a.property_name, a.room_no, APP_STATUS[a.status], a.reject_reason])
      }));
      this.setData({ applications });
      this.applySearch();
    } catch (e) {
      console.error('加载申请失败', e);
    }
    wx.hideNavigationBarLoading();
  },

  // ===== 搜索 =====
  onSearchInput(e) {
    this.setData({ keyword: e.detail.value || '' });
    this.applySearch();
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this.applySearch();
  },

  applySearch() {
    this.setData({ visible: filterByKeyword(this.data.applications, this.data.keyword) });
  },

  onPullDownRefresh() {
    this.loadApplications().finally(() => wx.stopPullDownRefresh());
  },

  goProperties() {
    wx.switchTab({ url: '/pages/properties/properties' });
  }
});
