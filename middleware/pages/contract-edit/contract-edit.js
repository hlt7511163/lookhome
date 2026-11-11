const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { fmtMoney, maskPhone, PAY_MODE } = require('../../utils/util.js');

const STATUS_TEXT = { active: '生效中', ended: '已结束', void: '已作废' };
const STATUS_CLASS = { active: 'st-paid', ended: 'st-info', void: 'st-void' };

// 与服务端 PAY_MODES 对应（rent_cycle 只接受这四个值）
const PAY_MODES = [
  { key: 'monthly', text: '月付' },
  { key: 'quarterly', text: '季付（每 3 个月）' },
  { key: 'half', text: '半年付（每 6 个月）' },
  { key: 'yearly', text: '年付（每 12 个月）' }
];

Page({
  data: {
    id: 0,
    contract: null,
    loading: true,
    saving: false,
    // 可编辑字段
    form: { monthly_rent: '', deposit: '', end_date: '', rent_cycle: 'monthly', pay_day: '1', remark: '' },
    payModes: PAY_MODES.map(p => p.text),
    payIndex: 0,
    payText: '月付',
    // 合同正文
    showText: false,
    contractText: '',
    hasText: false
  },

  onLoad(options) {
    this.setData({ id: Number(options && options.id) || 0 });
  },

  onShow() {
    if (!ensureLogin()) return;
    if (!this.data.id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this.loadContract();
  },

  // 服务端无 GET /api/contracts/:id，从列表接口按 id 取（合同数量级小，开销可接受）
  async loadContract() {
    try {
      const list = await request('/api/contracts?status=all', 'GET');
      const c = (list || []).find(x => Number(x.id) === this.data.id);
      if (!c) {
        this.setData({ loading: false });
        wx.showModal({
          title: '合同不存在', content: '该合同可能已被删除或无权查看', showCancel: false,
          success: () => wx.navigateBack()
        });
        return;
      }
      const payIndex = Math.max(0, PAY_MODES.findIndex(p => p.key === c.rent_cycle));
      const contractText = c.contract_text || '';
      this.setData({
        loading: false,
        contract: {
          id: c.id,
          tenant_name: c.tenant_name || '—',
          tenant_phone: maskPhone(c.tenant_phone),
          room_text: (c.property_name || '') + ' · ' + (c.room_no || ''),
          date_text: (c.start_date || '') + ' 至 ' + (c.end_date || ''),
          deposit_text: fmtMoney(c.deposit),
          unpaid_text: Number(c.unpaid_amount) > 0 ? fmtMoney(c.unpaid_amount) : '',
          statusText: STATUS_TEXT[c.status] || c.status,
          statusClass: STATUS_CLASS[c.status] || 'st-info'
        },
        form: {
          monthly_rent: String(c.monthly_rent == null ? '' : c.monthly_rent),
          deposit: String(c.deposit == null ? '' : c.deposit),
          end_date: c.end_date || '',
          rent_cycle: c.rent_cycle || 'monthly',
          pay_day: String(c.pay_day || 1),
          remark: c.remark || ''
        },
        payIndex,
        payText: PAY_MODE[c.rent_cycle] || '月付',
        hasText: !!contractText,
        contractText,
        showText: false
      });
    } catch (e) {
      this.setData({ loading: false });
      console.error('加载合同失败', e);
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  onEndDateChange(e) {
    this.setData({ 'form.end_date': e.detail.value });
  },

  onPayChange(e) {
    const index = Number(e.detail.value) || 0;
    const mode = PAY_MODES[index] || PAY_MODES[0];
    this.setData({ payIndex: index, 'form.rent_cycle': mode.key, payText: PAY_MODE[mode.key] || mode.text });
  },

  toggleText() {
    if (!this.data.hasText) {
      wx.showToast({ title: '该合同没有正文快照（旧合同）', icon: 'none' });
      return;
    }
    this.setData({ showText: !this.data.showText });
  },

  async save() {
    const { form, saving, id, contract } = this.data;
    if (saving) return;
    if (!contract) return;
    const rent = Number(form.monthly_rent);
    const deposit = Number(form.deposit === '' ? 0 : form.deposit);
    const payDay = Number(form.pay_day);
    if (!(rent > 0)) {
      wx.showToast({ title: '月租金必须大于 0', icon: 'none' });
      return;
    }
    if (!(deposit >= 0)) {
      wx.showToast({ title: '押金不能为负', icon: 'none' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.end_date)) {
      wx.showToast({ title: '请选择结束日期', icon: 'none' });
      return;
    }
    if (!(payDay >= 1 && payDay <= 31)) {
      wx.showToast({ title: '缴费日需在 1-31 之间', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    wx.showToast({ title: '保存中...', icon: 'loading', duration: 10000 });
    try {
      await request('/api/contracts/' + id, 'PUT', {
        monthly_rent: rent,
        deposit,
        end_date: form.end_date,
        rent_cycle: form.rent_cycle,
        pay_day: payDay,
        remark: form.remark
      });
      wx.hideToast();
      wx.showToast({ title: '已保存', icon: 'success' });
      this.loadContract();
    } catch (e) {
      wx.hideToast();
      wx.showModal({
        title: '保存失败',
        content: (e && e.message) || '请求失败，请稍后重试',
        showCancel: false
      });
    }
    this.setData({ saving: false });
  }
});
