const { request } = require('../../utils/request.js');
const { ensureRole } = require('../../utils/auth.js');
const { fmtMoney, toMoney, REFUND_STATUS, maskPhone } = require('../../utils/util.js');

const STATUS_CLASS = {
  pending: 'st-unpaid',
  processing: 'st-info',
  done: 'st-paid',
  rejected: 'st-overdue'
};

Page({
  data: {
    filter: 'pending',
    filters: [
      { key: 'pending', text: '待审批' },
      { key: 'processing', text: '处理中' },
      { key: 'done', text: '已退还' },
      { key: 'rejected', text: '已驳回' },
      { key: 'all', text: '全部' }
    ],
    all: [],
    visible: [],
    counts: {},
    // 通过表单
    approveId: -1,
    approveRemark: '',
    // 驳回表单
    rejectId: -1,
    rejectReason: '',
    submitting: false,
    loadError: ''
  },

  onShow() {
    if (!ensureRole('admin')) return;
    this.loadRefunds();
  },

  async loadRefunds() {
    wx.showNavigationBarLoading();
    try {
      const res = await request('/api/refunds', 'GET');
      const list = Array.isArray(res) ? res : (res.rows || res.refunds || []);
      const all = list.map(r => {
        const amount = toMoney(r.amount);
        return {
          ...r,
          amountText: fmtMoney(amount),
          amount,
          tenantName: r.tenant_name || r.name || '—',
          initial: (r.tenant_name || r.name || '?').charAt(0),
          phoneText: r.tenant_phone ? maskPhone(r.tenant_phone) : '',
          roomText: [r.property_name, r.room_no].filter(Boolean).join(' · ') || '—',
          statusText: REFUND_STATUS[r.status] || r.status,
          statusClass: STATUS_CLASS[r.status] || 'st-void',
          canAct: r.status === 'pending' || r.status === 'processing'
        };
      });
      const counts = {};
      all.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
      this.setData({ all, counts, loadError: '', approveId: -1, rejectId: -1 });
      this.applyFilter();
    } catch (e) {
      this.setData({ loadError: (e && e.message) || '退款列表加载失败' });
      console.error('加载退款申请失败', e);
    }
    wx.hideNavigationBarLoading();
  },

  switchFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.key, approveId: -1, rejectId: -1 });
    this.applyFilter();
  },

  applyFilter() {
    const { all, filter } = this.data;
    this.setData({ visible: filter === 'all' ? all.slice() : all.filter(r => r.status === filter) });
  },

  onPullDownRefresh() {
    this.loadRefunds().finally(() => wx.stopPullDownRefresh());
  },

  // ===== 通过 / 驳回 =====
  openApprove(e) {
    this.setData({ approveId: Number(e.currentTarget.dataset.id), rejectId: -1, approveRemark: '' });
  },
  closeApprove() { this.setData({ approveId: -1 }); },
  onApproveRemark(e) { this.setData({ approveRemark: e.detail.value }); },

  openReject(e) {
    this.setData({ rejectId: Number(e.currentTarget.dataset.id), approveId: -1, rejectReason: '' });
  },
  closeReject() { this.setData({ rejectId: -1 }); },
  onRejectReason(e) { this.setData({ rejectReason: e.detail.value }); },

  async submitApprove() {
    if (this.data.submitting) return;
    const item = this.data.all.find(r => Number(r.id) === this.data.approveId);
    if (!item) return;
    this.setData({ submitting: true });
    try {
      await request('/api/refunds/' + item.id + '/approve', 'POST', {
        amount: item.amount,
        remark: this.data.approveRemark
      });
      this.setData({ submitting: false, approveId: -1 });
      wx.showToast({ title: '已通过', icon: 'success' });
      this.loadRefunds();
    } catch (e) {
      this.setData({ submitting: false });
      wx.showModal({
        title: '审批失败',
        content: (e && e.message) || '请求失败，请稍后重试',
        showCancel: false
      });
    }
  },

  async submitReject() {
    if (this.data.submitting) return;
    const item = this.data.all.find(r => Number(r.id) === this.data.rejectId);
    if (!item) return;
    this.setData({ submitting: true });
    try {
      await request('/api/refunds/' + item.id + '/reject', 'POST', {
        reason: this.data.rejectReason
      });
      this.setData({ submitting: false, rejectId: -1 });
      wx.showToast({ title: '已驳回', icon: 'success' });
      this.loadRefunds();
    } catch (e) {
      this.setData({ submitting: false });
      wx.showModal({
        title: '驳回失败',
        content: (e && e.message) || '请求失败，请稍后重试',
        showCancel: false
      });
    }
  },

  noop() { /* 阻止弹窗遮罩穿透点击 */ }
});
