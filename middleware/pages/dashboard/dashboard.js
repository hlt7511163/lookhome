const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { fmtMoney } = require('../../utils/util.js');

Page({
  data: {
    stats: null,
    trend: [],
    appPending: 0
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadDashboard();
  },

  async loadDashboard() {
    wx.showNavigationBarLoading();
    try {
      const res = await request('/api/dashboard', 'GET');
      const trend = (res.trend || []).slice(-6).map(t => ({
        ym: t.ym,
        v: Number(t.v || 0),
        width: 0
      }));
      const max = Math.max(1, ...trend.map(t => t.v));
      trend.forEach(t => { t.width = Math.round(t.v / max * 100); });
      this.setData({
        stats: {
          ...res,
          outstandingText: fmtMoney(res.outstanding),
          overdueText: fmtMoney(res.overdue),
          collectedText: fmtMoney(res.collected)
        },
        trend
      });
      // 待审核签约申请数（与「审核」tab 同源）
      try {
        const apps = await request('/api/lease-applications?status=pending', 'GET');
        this.setData({ appPending: (apps || []).length });
      } catch (e) { /* 忽略：不影响主流程 */ }
    } catch (e) {
      console.error('加载仪表盘失败', e);
    }
    wx.hideNavigationBarLoading();
  },

  onPullDownRefresh() {
    this.loadDashboard().finally(() => wx.stopPullDownRefresh());
  },

  goBills() { wx.switchTab({ url: '/pages/admin-bills/admin-bills' }); },
  goRooms() { wx.switchTab({ url: '/pages/admin-properties/admin-properties' }); },
  goTenants() { wx.switchTab({ url: '/pages/admin-tenants/admin-tenants' }); },
  goApplications() { wx.switchTab({ url: '/pages/admin-applications/admin-applications' }); },
  // 账号与设置（非 tab 子页：账号信息/修改密码/合同模板/退出登录）
  goProfile() { wx.navigateTo({ url: '/pages/admin-profile/admin-profile' }); },
  goContracts() { wx.navigateTo({ url: '/pages/admin-contracts/admin-contracts' }); },
  goContractTemplate() { wx.navigateTo({ url: '/pages/admin-contract/admin-contract' }); },

  fmtMoney(n) { return fmtMoney(n); }
});
