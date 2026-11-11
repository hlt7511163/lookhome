// 自定义 tabBar：按登录角色渲染租客端 / 管理端两套导航
const TENANT_ITEMS = [
  { path: '/pages/index/index', text: '首页', icon: '🏠' },
  { path: '/pages/bills/bills', text: '账单', icon: '📋' },
  { path: '/pages/properties/properties', text: '找房', icon: '🔍' },
  { path: '/pages/reminders/reminders', text: '消息', icon: '🔔', badge: true },
  { path: '/pages/profile/profile', text: '我的', icon: '👤' }
];

const ADMIN_ITEMS = [
  { path: '/pages/dashboard/dashboard', text: '工作台', icon: '📊' },
  { path: '/pages/admin-bills/admin-bills', text: '账单', icon: '📋' },
  { path: '/pages/admin-properties/admin-properties', text: '房源', icon: '🏢' },
  { path: '/pages/admin-tenants/admin-tenants', text: '租客', icon: '👥' },
  { path: '/pages/admin-applications/admin-applications', text: '审核', icon: '✅' }
];

Component({
  data: {
    items: TENANT_ITEMS,
    selected: 0,
    unread: 0
  },

  lifetimes: {
    attached() {
      this.refresh();
    }
  },

  pageLifetimes: {
    show() {
      this.refresh();
    }
  },

  methods: {
    refresh() {
      const app = getApp();
      const role = app.globalData.role || wx.getStorageSync('role') || 'tenant';
      const items = role === 'admin' ? ADMIN_ITEMS : TENANT_ITEMS;
      const pages = getCurrentPages();
      const current = pages.length ? pages[pages.length - 1].route : '';
      // 非 tab 页（如账号设置子页）不高亮任何 tab：findIndex 返回 -1
      const selected = items.findIndex(it => it.path === '/' + current);
      this.setData({
        items,
        selected,
        unread: app.globalData.unread || 0
      });
    },

    onTabTap(e) {
      const { index, path } = e.currentTarget.dataset;
      const idx = Number(index);
      if (idx === this.data.selected) {
        // 点击当前 tab：滚动到顶并刷新页面数据（原生 tabBar 的既有体验）
        wx.pageScrollTo({ scrollTop: 0, duration: 200 });
        const pages = getCurrentPages();
        const page = pages[pages.length - 1];
        if (page && typeof page.onPullDownRefresh === 'function') {
          page.onPullDownRefresh();
        } else if (page && typeof page.onShow === 'function') {
          page.onShow();
        }
        return;
      }
      wx.switchTab({ url: path });
    }
  }
});
