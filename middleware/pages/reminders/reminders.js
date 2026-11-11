const { request } = require('../../utils/request.js');
const { ensureLogin, setUnread } = require('../../utils/auth.js');
const { buildSearchKey, filterByKeyword } = require('../../utils/search.js');

Page({
  data: {
    reminders: [],
    visible: [],
    keyword: '',
    searchPlaceholder: '搜提醒内容 / 房号 / 账期'
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadReminders();
  },

  async loadReminders() {
    wx.showNavigationBarLoading();
    try {
      const res = await request('/api/tenant/reminders', 'GET');
      const reminders = (res || []).map(r => ({
        ...r,
        unread: r.status === 'pending',
        kindText: r.kind === 'auto' ? '系统提醒' : '房东催缴',
        search_key: buildSearchKey([r.kind === 'auto' ? '系统提醒' : '房东催缴', r.title, r.content, r.period, r.room_no])
      }));
      this.setData({ reminders });
      this.applySearch();
      setUnread(reminders.filter(r => r.unread).length);
    } catch (e) {
      console.error('加载提醒失败', e);
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
    this.setData({ visible: filterByKeyword(this.data.reminders, this.data.keyword) });
  },

  onPullDownRefresh() {
    this.loadReminders().finally(() => wx.stopPullDownRefresh());
  },

  // 点击提醒 → 标记已读并跳转账单详情
  async openReminder(e) {
    // 按 id 定位（搜索过滤后列表下标会变）
    const id = Number(e.currentTarget.dataset.id);
    const index = this.data.reminders.findIndex(r => Number(r.id) === id);
    if (index < 0) return;
    const item = this.data.reminders[index];
    if (item.unread) {
      try {
        await request('/api/tenant/reminders/read', 'POST', { id: item.id });
        const reminders = this.data.reminders.map((r, i) => i === index ? { ...r, unread: false, status: 'read' } : r);
        this.setData({ reminders });
        this.applySearch();
        setUnread(reminders.filter(r => r.unread).length);
      } catch (e) { /* 忽略 */ }
    }
    if (item.bill_id) {
      wx.navigateTo({ url: '/pages/bill-detail/bill-detail?id=' + item.bill_id + '&role=tenant' });
    }
  },

  // 全部已读
  async readAll() {
    const hasUnread = this.data.reminders.some(r => r.unread);
    if (!hasUnread) {
      wx.showToast({ title: '暂无未读消息', icon: 'none' });
      return;
    }
    try {
      await request('/api/tenant/reminders/read', 'POST', {});
      const reminders = this.data.reminders.map(r => ({ ...r, unread: false, status: 'read' }));
      this.setData({ reminders });
      this.applySearch();
      setUnread(0);
      wx.showToast({ title: '已全部标记为已读', icon: 'success' });
    } catch (e) {
      console.error('标记已读失败', e);
    }
  }
});
