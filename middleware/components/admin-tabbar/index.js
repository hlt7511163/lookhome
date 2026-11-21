// 管理端底部导航
// 管理端页面不占用 tabBar.list 配额（微信 tabBar 最多 5 项），
// 因此不能用 wx.switchTab，统一用 wx.reLaunch 跳转到同级管理页。
const ADMIN_ITEMS = [
  { path: '/pages/dashboard/dashboard', text: '工作台', icon: '📊' },
  { path: '/pages/admin-bills/admin-bills', text: '账单', icon: '📋' },
  { path: '/pages/admin-properties/admin-properties', text: '房源', icon: '🏢' },
  { path: '/pages/admin-tenants/admin-tenants', text: '租客', icon: '👥' },
  { path: '/pages/admin-applications/admin-applications', text: '审核', icon: '✅' }
];

Component({
  data: {
    items: ADMIN_ITEMS,
    selected: -1
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
      const pages = getCurrentPages();
      const current = pages.length ? pages[pages.length - 1].route : '';
      const selected = ADMIN_ITEMS.findIndex(it => it.path === '/' + current);
      this.setData({ items: ADMIN_ITEMS, selected });
    },

    onTabTap(e) {
      const idx = Number(e.currentTarget.dataset.index);
      const path = e.currentTarget.dataset.path;
      if (idx === this.data.selected) {
        // 点当前页：回到顶部并刷新数据
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
      // 管理端页面不在 tabBar.list 中，只能 reLaunch
      wx.reLaunch({ url: path });
    }
  }
});
