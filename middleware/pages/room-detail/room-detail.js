const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { ROOM_STATUS } = require('../../utils/util.js');

Page({
  data: {
    room: null,
    statusText: ''
  },

  onLoad(options) {
    if (!ensureLogin()) return;
    this.roomId = options.id;
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadRoom();
  },

  async loadRoom() {
    wx.showNavigationBarLoading();
    try {
      const res = await request('/api/tenant/properties', 'GET');
      const room = (res.rooms || []).find(r => String(r.id) === String(this.roomId));
      if (room) {
        this.setData({
          room: { ...room, statusText: ROOM_STATUS[room.status] || room.status, vacant: room.status === 'vacant' }
        });
        wx.setNavigationBarTitle({ title: room.property_name + ' ' + room.room_no });
      } else {
        this.setData({ room: null });
      }
    } catch (e) {
      console.error('加载房间失败', e);
    }
    wx.hideNavigationBarLoading();
  },

  goSign() {
    const room = this.data.room;
    wx.navigateTo({
      url: '/pages/sign/sign?room_id=' + this.roomId,
      // 把已加载的房间数据顺带传过去，签约页无需再拉全量房源
      success: (res) => {
        if (room && res && res.eventChannel) res.eventChannel.emit('room', room);
      }
    });
  },

  callLandlord() {
    const phone = String((this.data.room && this.data.room.site_phone) || '').replace(/\s/g, '');
    if (!phone) {
      wx.showToast({ title: '房东暂未配置联系电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phone });
  }
});
