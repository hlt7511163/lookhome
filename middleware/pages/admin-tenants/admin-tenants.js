const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { maskPhone, VERIFY_STATUS } = require('../../utils/util.js');
const { buildSearchKey, filterByKeyword } = require('../../utils/search.js');

Page({
  data: {
    tenants: [],
    visible: [],
    keyword: '',
    searchPlaceholder: '搜租客姓名 / 手机号 / 房源'
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadTenants();
  },

  async loadTenants() {
    wx.showNavigationBarLoading();
    try {
      const res = await request('/api/tenants', 'GET');
      const tenants = (res || []).map(t => ({
        ...t,
        initial: (t.name || '?').charAt(0),
        phoneMasked: maskPhone(t.phone),
        verifyText: VERIFY_STATUS[t.verify_status] || t.verify_status,
        verifyClass: t.verify_status === 'approved' ? 'st-paid' : (t.verify_status === 'rejected' ? 'st-overdue' : 'st-unpaid'),
        search_key: buildSearchKey([t.name, t.phone, t.room_no, t.property_name, VERIFY_STATUS[t.verify_status]])
      }));
      this.setData({ tenants });
      this.applySearch();
    } catch (e) {
      console.error('加载租客失败', e);
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
    this.setData({ visible: filterByKeyword(this.data.tenants, this.data.keyword) });
  },

  onPullDownRefresh() {
    this.loadTenants().finally(() => wx.stopPullDownRefresh());
  },

  // ===== 身份审核（通过 / 拒绝）=====
  onVerify(e) {
    this.submitVerify(e.currentTarget.dataset.id, 'approved');
  },

  onReject(e) {
    this.submitVerify(e.currentTarget.dataset.id, 'rejected');
  },

  submitVerify(id, action) {
    const isOk = action === 'approved';
    wx.showModal({
      title: isOk ? '通过审核' : '拒绝审核',
      content: isOk ? '确认该租客实名信息无误，通过审核？' : '确定拒绝该租客的实名认证？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await request('/api/tenants/' + id + '/verify', 'POST', { action });
          wx.showToast({ title: isOk ? '已通过' : '已拒绝', icon: 'success' });
          this.loadTenants();
        } catch (err) {
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        }
      }
    });
  }
});
