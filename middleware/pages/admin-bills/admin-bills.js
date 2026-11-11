const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { fmtMoney, BILL_STATUS, BILL_STATUS_CLASS } = require('../../utils/util.js');
const { buildSearchKey, filterByKeyword } = require('../../utils/search.js');

Page({
  data: {
    bills: [],
    visible: [],
    keyword: '',
    searchPlaceholder: '搜租客 / 房源 / 房号 / 账期',
    stat: [],
    filter: 'all',
    filters: [
      { key: 'all', text: '全部' },
      { key: 'unpaid', text: '待缴' },
      { key: 'overdue', text: '逾期' },
      { key: 'paid', text: '已缴' },
      { key: 'void', text: '作废' }
    ],
    statText: { unpaid: '0.00', paid: '0.00', overdue: '0.00' },
    pushCount: 0,      // 当前列表中未缴且未提醒过的账单数
    pushing: false
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
      const res = await request('/api/bills' + query, 'GET');
      const bills = (res.rows || []).map(b => {
        const rm = b.reminder || {};
        const unpaid = b.status === 'unpaid' || b.status === 'overdue';
        return {
          ...b,
          statusText: BILL_STATUS[b.status] || b.status,
          statusClass: BILL_STATUS_CLASS[b.status] || 'st-void',
          remain: Math.max(0, (Number(b.total) || 0) - (Number(b.paid_amount) || 0)),
          canPush: unpaid,
          reminded: !!rm.reminded,
          remindText: rm.reminded ? ('已提醒 ' + (rm.created_at || '').slice(5, 16)) : '',
          search_key: buildSearchKey([
            b.tenant_name, b.property_name, b.room_no, b.period, b.title
          ])
        };
      });
      this.setData({ bills, stat: res.stat || [] });
      this.calcStat();
      this.applySearch();
    } catch (e) {
      console.error('加载账单失败', e);
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
    this.setData({ visible: filterByKeyword(this.data.bills, this.data.keyword) });
    this.calcPushable();
  },

  calcStat() {
    const find = (s) => {
      const row = this.data.stat.find(x => x.status === s);
      return row ? Number(row.v || 0) : 0;
    };
    this.setData({
      statText: {
        unpaid: fmtMoney(find('unpaid')),
        paid: fmtMoney(find('paid')),
        overdue: fmtMoney(find('overdue'))
      }
    });
  },

  // 可批量推送的账单：当前搜索结果里未缴/逾期且还没提醒过
  calcPushable() {
    const list = (this.data.visible || []).filter(b => b.canPush && !b.reminded);
    this.setData({ pushCount: list.length });
  },

  onPullDownRefresh() {
    this.fetchBills().finally(() => wx.stopPullDownRefresh());
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/bill-detail/bill-detail?id=' + id + '&role=admin' });
  },

  // ===== 推送账单给租客 =====
  // 服务端 POST /api/reminders/manual：写 reminders 表（租客端「消息」可见）
  // 同时按订阅消息模板推送微信通知（租客已订阅且模板已配置时才会真的收到）
  pushOne(e) {
    const id = Number(e.currentTarget.dataset.id);
    const bill = (this.data.visible || this.data.bills).find(b => Number(b.id) === id);
    if (!bill) return;
    if (bill.reminded) {
      wx.showToast({ title: '该账单已提醒过了', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '推送账单',
      content: `向 ${bill.tenant_name} 推送 ${bill.period} 账单（合计 ¥${bill.total}）催缴提醒？`,
      success: (r) => {
        if (r.confirm) this.doPush([id]);
      }
    });
  },

  pushBatch() {
    const ids = (this.data.visible || []).filter(b => b.canPush && !b.reminded).map(b => Number(b.id));
    if (!ids.length) {
      wx.showToast({ title: '当前没有需要推送的账单', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '批量推送',
      content: `将向 ${ids.length} 位租客推送未缴账单催缴提醒，确定？`,
      success: (r) => {
        if (r.confirm) this.doPush(ids);
      }
    });
  },

  async doPush(ids) {
    if (this.data.pushing) return;
    this.setData({ pushing: true });
    wx.showToast({ title: '推送中...', icon: 'loading', duration: 10000 });
    try {
      const res = await request('/api/reminders/manual', 'POST', { bill_ids: ids });
      wx.hideToast();
      const created = Number(res.created || 0);
      const skipped = Number(res.skipped || 0);
      const denied = Number(res.denied || 0);
      let msg = '已推送 ' + created + ' 条';
      if (skipped) msg += '，' + skipped + ' 条此前已提醒';
      if (denied) msg += '，' + denied + ' 条无权操作';
      wx.showModal({
        title: '推送完成',
        content: msg + '。租客可在小程序「消息」中看到催缴提醒；已订阅微信通知的租客还会收到服务通知。',
        showCancel: false
      });
      this.fetchBills();
    } catch (e) {
      wx.hideToast();
      wx.showModal({ title: '推送失败', content: (e && e.message) || '请求失败，请稍后重试', showCancel: false });
    }
    this.setData({ pushing: false });
  }
});
