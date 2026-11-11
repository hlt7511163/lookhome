const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');

Page({
  data: {
    roomId: '',
    room: null,
    // 租期选项（月）
    terms: [3, 6, 12, 24],
    termMonths: 12,
    // 支付方式
    payModes: [
      { key: 'monthly', text: '月付' },
      { key: 'quarterly', text: '季付' },
      { key: 'half', text: '半年付' },
      { key: 'yearly', text: '年付' }
    ],
    payMode: 'monthly',
    // 起租日期（默认明天）
    startDate: '',
    // 合同预览
    previewText: '',
    previewInfo: null,
    loadingPreview: false,
    // 同意
    agreed: false,
    submitting: false
  },

  onLoad(options) {
    if (!ensureLogin()) return;
    this.setData({ roomId: options.room_id || '' });
    const t = new Date(Date.now() + 86400000);
    this.setData({ startDate: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` });
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadRoom();
  },

  async loadRoom() {
    try {
      const res = await request('/api/tenant/properties', 'GET');
      const room = (res.rooms || []).find(r => String(r.id) === String(this.data.roomId));
      if (room) {
        // API 返回 status 字段，需映射为 vacant 供页面使用
        this.setData({ room: { ...room, vacant: room.status === 'vacant' } });
        if (room.status !== 'vacant') {
          wx.showModal({
            title: '不可签约',
            content: `房间 ${room.room_no} 当前不可签约（非空置）`,
            showCancel: false,
            success: () => wx.navigateBack()
          });
        }
      } else {
        this.setData({ room: null });
      }
    } catch (e) {
      console.error('加载房间失败', e);
    }
  },

  pickTerm(e) {
    this.setData({ termMonths: Number(e.currentTarget.dataset.value) });
  },

  pickPayMode(e) {
    this.setData({ payMode: e.currentTarget.dataset.key });
  },

  onDateChange(e) {
    this.setData({ startDate: e.detail.value });
  },

  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  // 拉取合同预览文本
  async loadPreview() {
    if (this.data.loadingPreview) return;
    this.setData({ loadingPreview: true });
    try {
      const res = await request(
        `/api/tenant/contract-preview?room_id=${this.data.roomId}&term_months=${this.data.termMonths}&pay_mode=${this.data.payMode}&start_date=${this.data.startDate}`,
        'GET'
      );
      this.setData({
        previewText: res.text || '',
        previewInfo: {
          start_date: res.start_date,
          end_date: res.end_date,
          monthly_rent: res.monthly_rent,
          deposit: res.deposit
        }
      });
      wx.pageScrollTo({ selector: '.preview-block', duration: 300 });
    } catch (e) {
      console.error('合同预览失败', e);
    }
    this.setData({ loadingPreview: false });
  },

  async submitApply() {
    const { roomId, termMonths, payMode, startDate, agreed } = this.data;
    if (!agreed) {
      wx.showToast({ title: '请先阅读并勾选同意合同', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showToast({ title: '提交中...', icon: 'loading', duration: 10000 });
    try {
      const res = await request('/api/tenant/apply-sign', 'POST', {
        room_id: Number(roomId),
        term_months: termMonths,
        pay_mode: payMode,
        expected_date: startDate,
        agreed: true
      });
      wx.hideToast();
      this.setData({ submitting: false });
      wx.showModal({
        title: '申请已提交',
        content: res.notice || '签约申请已提交，房东确认后即生成合同并提醒您支付租金及押金',
        showCancel: false,
        confirmText: '查看申请',
        success: () => {
          wx.redirectTo({ url: '/pages/applications/applications' });
        }
      });
    } catch (e) {
      wx.hideToast();
      this.setData({ submitting: false });
      console.error('提交签约申请失败', e);
      wx.showToast({ title: (e && e.message) || '提交失败，请稍后重试', icon: 'none' });
    }
  }
});
