const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { fmtMoney, BILL_STATUS, BILL_STATUS_CLASS } = require('../../utils/util.js');
const { buildSearchKey, filterByKeyword } = require('../../utils/search.js');

Page({
  data: {
    bills: [],
    visible: [],
    keyword: '',
    searchPlaceholder: '搜账期 / 房源 / 房号',
    filter: 'all',
    filters: [
      { key: 'all', text: '全部' },
      { key: 'unpaid', text: '待缴' },
      { key: 'overdue', text: '逾期' },
      { key: 'paid', text: '已缴' }
    ],
    stat: { unpaidCount: 0, unpaidAmount: '0.00', paidCount: 0 }
  },

  onShow() {
    if (!ensureLogin()) return;
    this.fetchBills();
  },

  switchFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.key });
    this.fetchBills();
  },

  async fetchBills() {
    wx.showNavigationBarLoading();
    try {
      const query = this.data.filter === 'all' ? '' : '?status=' + this.data.filter;
      const res = await request('/api/tenant/bills' + query, 'GET');
      const bills = (res || []).map(b => ({
        ...b,
        statusText: BILL_STATUS[b.status] || b.status,
        statusClass: BILL_STATUS_CLASS[b.status] || 'st-void',
        remain: Math.max(0, (Number(b.total) || 0) - (Number(b.paid_amount) || 0)),
        search_key: buildSearchKey([b.period, b.title, b.property_name, b.room_no])
      }));
      this.setData({ bills });
      this.applySearch();

      // 统计（不过滤）
      const all = await request('/api/tenant/bills', 'GET');
      const unpaid = all.filter(b => b.status === 'unpaid' || b.status === 'overdue');
      const paid = all.filter(b => b.status === 'paid');
      this.setData({
        stat: {
          unpaidCount: unpaid.length,
          unpaidAmount: fmtMoney(unpaid.reduce((s, b) => s + Number(b.total || 0), 0)),
          paidCount: paid.length
        }
      });
    } catch (error) {
      console.error('获取账单失败', error);
    }
    wx.hideNavigationBarLoading();
  },

  onPullDownRefresh() {
    this.fetchBills().finally(() => wx.stopPullDownRefresh());
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
    this.setData({ visible: filterByKeyword(this.data.bills, this.data.keyword) });
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/bill-detail/bill-detail?id=' + id + '&role=tenant' });
  },

  fmtMoney(n) { return fmtMoney(n); }
});
