const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { REFUND_STATUS } = require('../../utils/util.js');

Page({
  data: {
    contract: null,
    refunds: [],
    amount: '',
    remark: '',
    submitting: false
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadAll();
  },

  async loadAll() {
    wx.showNavigationBarLoading();
    try {
      const me = await request('/api/tenant/me', 'GET');
      this.setData({ contract: me.contract || null });
    } catch (e) { /* 忽略 */ }
    try {
      const res = await request('/api/tenant/refunds', 'GET');
      const refunds = (res || []).map(r => ({
        ...r,
        statusText: REFUND_STATUS[r.status] || r.status,
        statusClass: r.status === 'done' ? 'st-paid' : (r.status === 'rejected' ? 'st-overdue' : 'st-unpaid')
      }));
      this.setData({ refunds });
    } catch (e) {
      console.error('加载退款记录失败', e);
    }
    wx.hideNavigationBarLoading();
  },

  onAmountInput(e) { this.setData({ amount: e.detail.value }); },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }); },

  fillDeposit() {
    if (this.data.contract && this.data.contract.deposit) {
      this.setData({ amount: String(this.data.contract.deposit) });
    }
  },

  async submitApply() {
    const { amount, remark, contract } = this.data;
    if (!contract) {
      wx.showToast({ title: '当前没有生效合同', icon: 'none' });
      return;
    }
    const amt = Number(amount);
    if (!(amt > 0)) {
      wx.showToast({ title: '退款金额必须大于 0', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showToast({ title: '提交中...', icon: 'loading', duration: 10000 });
    try {
      const res = await request('/api/tenant/refunds/apply', 'POST', {
        amount: amt,
        apply_remark: remark
      });
      wx.hideToast();
      this.setData({ submitting: false, amount: '', remark: '' });
      wx.showModal({
        title: '申请已提交',
        content: res.notice || '退押金申请已提交，等待房东确认',
        showCancel: false,
        success: () => this.loadAll()
      });
    } catch (e) {
      wx.hideToast();
      this.setData({ submitting: false });
      console.error('申请退押金失败', e);
    }
  }
});
