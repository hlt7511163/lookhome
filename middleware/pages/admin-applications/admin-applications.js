const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { APP_STATUS, PAY_MODE } = require('../../utils/util.js');
const { buildSearchKey, filterByKeyword } = require('../../utils/search.js');

Page({
  data: {
    applications: [],
    visible: [],
    keyword: '',
    searchPlaceholder: '搜租客 / 手机号 / 房源 / 房号',
    filter: 'pending',
    filterText: '待审核',
    filters: [
      { key: 'pending', text: '待审核' },
      { key: 'approved', text: '已通过' },
      { key: 'rejected', text: '已驳回' }
    ],
    // 通过审核表单（展开中的申请 id，-1 表示未展开）
    formId: -1,
    form: { start_date: '', end_date: '', monthly_rent: '', deposit: '' },
    // 拒绝表单
    rejectId: -1,
    rejectReason: '',
    submitting: false
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadApplications();
  },

  async loadApplications() {
    wx.showNavigationBarLoading();
    try {
      const res = await request('/api/lease-applications?status=' + this.data.filter, 'GET');
      const applications = (res || []).map(a => ({
        ...a,
        initial: (a.tenant_name || '?').charAt(0),
        statusText: APP_STATUS[a.status] || a.status,
        payModeText: PAY_MODE[a.pay_mode] || a.pay_mode,
        statusClass: a.status === 'approved' ? 'st-paid' : (a.status === 'rejected' ? 'st-overdue' : 'st-unpaid'),
        search_key: buildSearchKey([a.tenant_name, a.tenant_phone, a.property_name, a.room_no, a.remark])
      }));
      this.setData({
        applications,
        filterText: this.data.filters.find(f => f.key === this.data.filter).text,
        formId: -1,
        rejectId: -1
      });
      this.applySearch();
    } catch (e) {
      console.error('加载签约申请失败', e);
    }
    wx.hideNavigationBarLoading();
  },

  // ===== 搜索（只影响展示，表单仍按完整列表查 id） =====
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

  switchFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.key });
    this.loadApplications();
  },

  // ===== 通过审核（展开表单，预填起租日/租期/参考月租）=====
  openApprove(e) {
    const id = Number(e.currentTarget.dataset.id);
    const app = this.data.applications.find(a => a.id === id);
    if (!app) return;
    const start = app.expected_date || this.today();
    this.setData({
      formId: id,
      rejectId: -1,
      form: {
        start_date: start,
        end_date: this.addMonths(start, Number(app.term_months) || 12),
        monthly_rent: app.ref_rent != null ? String(app.ref_rent) : '',
        deposit: ''
      }
    });
  },

  closeForm() {
    this.setData({ formId: -1 });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  onStartDateChange(e) {
    // 改起租日时，结束日按租期顺延
    const app = this.data.applications.find(a => a.id === this.data.formId);
    const months = Number(app && app.term_months) || 12;
    this.setData({
      'form.start_date': e.detail.value,
      'form.end_date': this.addMonths(e.detail.value, months)
    });
  },

  onEndDateChange(e) {
    this.setData({ 'form.end_date': e.detail.value });
  },

  async submitApprove() {
    const { form, formId, submitting } = this.data;
    if (submitting) return;
    if (!form.start_date || !form.end_date) {
      wx.showToast({ title: '请选择合同起止日期', icon: 'none' });
      return;
    }
    if (!(Number(form.monthly_rent) > 0)) {
      wx.showToast({ title: '请设定月租金', icon: 'none' });
      return;
    }
    const app = this.data.applications.find(a => a.id === formId) || {};
    wx.showModal({
      title: '确认通过',
      content: '通过后将自动生成合同、房间转为已租，并生成押金账单',
      success: async (r) => {
        if (!r.confirm) return;
        this.setData({ submitting: true });
        wx.showToast({ title: '提交中...', icon: 'loading', duration: 10000 });
        try {
          await request('/api/lease-applications/' + formId + '/approve', 'POST', {
            start_date: form.start_date,
            end_date: form.end_date,
            monthly_rent: Number(form.monthly_rent),
            deposit: Number(form.deposit || 0),
            rent_cycle: app.pay_mode || 'monthly'
          });
          wx.hideToast();
          wx.showToast({ title: '已通过，合同已生成', icon: 'success' });
          this.loadApplications();
        } catch (err) {
          wx.hideToast();
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        }
        this.setData({ submitting: false });
      }
    });
  },

  // ===== 拒绝审核 =====
  openReject(e) {
    this.setData({ rejectId: Number(e.currentTarget.dataset.id), formId: -1, rejectReason: '' });
  },

  closeReject() {
    this.setData({ rejectId: -1 });
  },

  onReasonInput(e) {
    this.setData({ rejectReason: e.detail.value });
  },

  async submitReject() {
    const { rejectId, rejectReason, submitting } = this.data;
    if (submitting) return;
    wx.showModal({
      title: '确认拒绝',
      content: '拒绝后租客可修改信息重新提交申请',
      success: async (r) => {
        if (!r.confirm) return;
        this.setData({ submitting: true });
        wx.showToast({ title: '提交中...', icon: 'loading', duration: 10000 });
        try {
          await request('/api/lease-applications/' + rejectId + '/reject', 'POST', { reason: rejectReason });
          wx.hideToast();
          wx.showToast({ title: '已拒绝', icon: 'success' });
          this.loadApplications();
        } catch (err) {
          wx.hideToast();
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        }
        this.setData({ submitting: false });
      }
    });
  },

  // ===== 日期工具 =====
  today() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  },

  addMonths(dateStr, months) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1 + months, Math.min(d, 28));
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
});
