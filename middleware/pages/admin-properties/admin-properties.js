const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { ROOM_STATUS } = require('../../utils/util.js');
const { buildSearchKey, filterByKeyword } = require('../../utils/search.js');

Page({
  data: {
    properties: [],
    visibleProperties: [],
    rooms: [],
    visibleRooms: [],
    keyword: '',
    searchPlaceholder: '搜项目 / 地址 / 房号 / 租客',
    stat: []
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadAll();
  },

  async loadAll() {
    wx.showNavigationBarLoading();
    try {
      const [props, roomsRes] = await Promise.all([
        request('/api/properties', 'GET'),
        request('/api/rooms', 'GET')
      ]);
      const stat = roomsRes.stat || [];
      const cnt = (s) => { const row = stat.find(x => x.status === s); return row ? row.c : 0; };
      this.setData({
        properties: (props || []).map(p => ({
          ...p,
          search_key: buildSearchKey([p.name, p.address])
        })),
        rooms: (roomsRes.rows || []).map(r => ({
          ...r,
          statusText: ROOM_STATUS[r.status] || r.status,
          statusClass: r.status === 'vacant' ? 'st-paid' : (r.status === 'rented' ? 'st-info' : 'st-void'),
          search_key: buildSearchKey([r.room_no, r.property_name, r.layout, r.tenant_name, ROOM_STATUS[r.status]])
        })),
        stat,
        statLine: `空置 ${cnt('vacant')} · 在租 ${cnt('rented')}`
      });
      this.applySearch();
    } catch (e) {
      console.error('加载房源失败', e);
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
    const { keyword, properties, rooms } = this.data;
    this.setData({
      visibleProperties: filterByKeyword(properties, keyword),
      visibleRooms: filterByKeyword(rooms, keyword)
    });
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh());
  },

  statCount(status) {
    const row = this.data.stat.find(x => x.status === status);
    return row ? row.c : 0;
  }
});
