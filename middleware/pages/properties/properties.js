const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { ROOM_STATUS } = require('../../utils/util.js');
const { buildSearchKey, filterByKeyword } = require('../../utils/search.js');

Page({
  data: {
    properties: [],
    rooms: [],
    filteredRooms: [],
    keyword: '',
    searchPlaceholder: '搜房号 / 项目 / 户型',
    sitePhone: '',
    filter: 'all',
    filterText: '',
    filters: [
      { key: 'all', text: '全部' },
      { key: 'vacant', text: '空置' },
      { key: 'rented', text: '已租' }
    ]
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadProperties();
  },

  async loadProperties() {
    wx.showNavigationBarLoading();
    try {
      const res = await request('/api/tenant/properties', 'GET');
      const rooms = (res.rooms || []).map(r => ({
        ...r,
        statusText: ROOM_STATUS[r.status] || r.status,
        vacant: r.status === 'vacant',
        search_key: buildSearchKey([r.room_no, r.property_name, r.layout])
      }));
      this.setData({
        properties: res.properties || [],
        rooms,
        sitePhone: res.site_phone || ''
      });
      this.applyFilter();
    } catch (e) {
      console.error('加载房源失败', e);
    }
    wx.hideNavigationBarLoading();
  },

  switchFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.key });
    this.applyFilter();
  },

  applyFilter() {
    const { rooms, filter, keyword } = this.data;
    const byStatus = filter === 'all' ? rooms : rooms.filter(r => r.status === filter);
    const filtered = filterByKeyword(byStatus, keyword);
    const filterText = filter === 'vacant' ? '空置' : (filter === 'rented' ? '在租' : '');
    this.setData({ filteredRooms: filtered, filterText });
  },

  // ===== 搜索 =====
  onSearchInput(e) {
    this.setData({ keyword: e.detail.value || '' });
    this.applyFilter();
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this.applyFilter();
  },

  onPullDownRefresh() {
    this.loadProperties().finally(() => wx.stopPullDownRefresh());
  },

  goRoomDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/room-detail/room-detail?id=' + id });
  },

  callLandlord() {
    const phone = String(this.data.sitePhone || '').replace(/\s/g, '');
    if (!phone) {
      wx.showToast({ title: '房东暂未配置联系电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phone });
  }
});
