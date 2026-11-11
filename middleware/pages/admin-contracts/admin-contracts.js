const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { fmtMoney, maskPhone, PAY_MODE } = require('../../utils/util.js');
const { buildSearchKey, filterByKeyword } = require('../../utils/search.js');

const STATUS_TEXT = { active: '生效中', ended: '已结束', void: '已作废' };
const STATUS_CLASS = { active: 'st-paid', ended: 'st-info', void: 'st-void' };

Page({
  data: {
    contracts: [],
    visible: [],
    keyword: '',
    searchPlaceholder: '搜租客 / 手机号 / 房源 / 房号',
    filter: 'active',
    filterText: '生效中',
    filters: [
      { key: 'active', text: '生效中' },
      { key: 'ended', text: '已结束' },
      { key: 'void', text: '已作废' },
      { key: 'all', text: '全部' }
    ]
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadContracts();
  },

  async loadContracts() {
    const { filter } = this.data;
    wx.showNavigationBarLoading();
    try {
      const res = await request('/api/contracts?status=' + filter, 'GET');
      const contracts = (res || []).map(c => ({
        id: c.id,
        tenant_name: c.tenant_name || '—',
        tenant_phone: maskPhone(c.tenant_phone),
        room_text: (c.property_name || '') + ' · ' + (c.room_no || ''),
        rent_text: fmtMoney(c.monthly_rent),
        deposit_text: fmtMoney(c.deposit),
        date_text: (c.start_date || '') + ' 至 ' + (c.end_date || ''),
        pay_text: (PAY_MODE[c.rent_cycle] || '月付') + ' · 每月 ' + (c.pay_day || 1) + ' 日',
        unpaid_text: Number(c.unpaid_amount) > 0 ? fmtMoney(c.unpaid_amount) : '',
        statusText: STATUS_TEXT[c.status] || c.status,
        statusClass: STATUS_CLASS[c.status] || 'st-info',
        // 手机号用原始号码参与搜索（列表上显示的是脱敏号）
        search_key: buildSearchKey([
          c.tenant_name, c.tenant_phone, c.property_name, c.room_no,
          STATUS_TEXT[c.status], PAY_MODE[c.rent_cycle]
        ])
      }));
      this.setData({
        contracts,
        filterText: this.data.filters.find(f => f.key === filter).text
      });
      this.applySearch();
    } catch (e) {
      console.error('加载合同列表失败', e);
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
    this.setData({ visible: filterByKeyword(this.data.contracts, this.data.keyword) });
  },

  onPullDownRefresh() {
    this.loadContracts().finally(() => wx.stopPullDownRefresh());
  },

  switchFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.key });
    this.loadContracts();
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/contract-edit/contract-edit?id=' + id });
  },

  goTemplate() {
    wx.navigateTo({ url: '/pages/admin-contract/admin-contract' });
  }
});
