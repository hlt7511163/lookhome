const { request } = require('../../utils/request.js');
const { fmtMoney, BILL_STATUS, BILL_STATUS_CLASS, BILL_TYPE } = require('../../utils/util.js');

Page({
  data: {
    role: 'tenant',
    bill: null,
    items: [],
    payments: [],
    payModal: false,       // 租客支付弹窗
    manualModal: false,    // 管理端手工收款弹窗
    payAmount: '',
    manualAmount: '',
    manualRemark: '',
    paying: false
  },

  onLoad(options) {
    this.setData({ role: options.role || 'tenant' });
    wx.setNavigationBarTitle({
      title: (options.role === 'admin' ? '账单详情（管理）' : '账单详情')
    });
  },

  onShow() {
    this.loadDetail();
  },

  async loadDetail() {
    const pages = getCurrentPages();
    const id = pages[pages.length - 1].options.id;
    if (!id) return;
    wx.showNavigationBarLoading();
    try {
      const url = this.data.role === 'admin'
        ? '/api/bills/' + id
        : '/api/tenant/bills/' + id;
      const res = await request(url, 'GET');
      const bill = res.bill || res;
      const showFooter = this.data.role === 'tenant' && bill.status !== 'paid' && bill.status !== 'void';
      this.setData({
        pageClass: showFooter ? 'has-footer' : '',
        bill: {
          ...bill,
          typeText: BILL_TYPE[bill.bill_type] || '账单',
          statusText: BILL_STATUS[bill.status] || bill.status,
          statusClass: BILL_STATUS_CLASS[bill.status] || 'st-void',
          remain: Math.max(0, (Number(bill.total) || 0) - (Number(bill.paid_amount) || 0))
        },
        items: res.items || [],
        payments: (res.payments || []).map(p => ({
          ...p,
          confirmText: p.confirm_status === 'confirmed' ? '已确认' : '待确认'
        })),
        manualAmount: String(Number(bill.total || 0) - Number(bill.paid_amount || 0))
      });
    } catch (e) {
      console.error('加载账单详情失败', e);
    }
    wx.hideNavigationBarLoading();
  },

  // ===== 租客：发起支付 =====
  openPay() {
    this.setData({ payModal: true, payAmount: String(this.data.bill.remain) });
  },
  closePay() { this.setData({ payModal: false }); },
  onPayAmount(e) { this.setData({ payAmount: e.detail.value }); },

  async confirmPay() {
    const amount = Number(this.data.payAmount);
    if (!(amount > 0)) {
      wx.showToast({ title: '金额不正确', icon: 'none' });
      return;
    }
    if (amount > this.data.bill.remain + 0.001) {
      wx.showToast({ title: '不能超过待付金额', icon: 'none' });
      return;
    }
    this.setData({ paying: true });
    try {
      const res = await request('/api/pay/jsapi', 'POST', { bill_id: this.data.bill.id });
      this.setData({ paying: false });
      if (res.mode === 'manual') {
        // 未开通微信支付 → 线下转账指引
        this.setData({ payModal: false });
        wx.showModal({
          title: '线下支付',
          content: (res.notice || '线上支付未开通') + '。支付金额 ¥' + fmtMoney(res.amount || amount) + '，到账后由房东在后台确认。',
          confirmText: '知道了',
          showCancel: false
        });
        return;
      }
      if (res.mode === 'wechat' && res.pay_params) {
        const p = res.pay_params;
        if (!p.timeStamp || !p.nonceStr || !p.package || !p.paySign) {
          // 服务端未返回完整支付参数（缺 paySign：多为服务端未部署 JSAPI 签名逻辑）
          this.setData({ payModal: false });
          wx.showModal({
            title: '支付暂不可用',
            content: '服务端支付参数不完整，请先完成微信支付配置，或按房东指引线下转账后由房东确认。',
            showCancel: false
          });
          return;
        }
        // 调起微信支付
        wx.requestPayment({
          timeStamp: p.timeStamp,
          nonceStr: p.nonceStr,
          package: p.package,
          signType: p.signType || 'RSA',
          paySign: p.paySign,
          success: () => {
            wx.showToast({ title: '支付成功', icon: 'success' });
            this.loadDetail();
          },
          fail: (err) => {
            if (err.errMsg && err.errMsg.includes('cancel')) return;
            wx.showToast({ title: '支付未完成', icon: 'none' });
          }
        });
      }
    } catch (e) {
      this.setData({ paying: false });
      console.error('支付失败', e);
    }
  },

  // ===== 管理端：手工确认收款 =====
  openManual() {
    this.setData({ manualModal: true, manualAmount: String(this.data.bill.remain), manualRemark: '' });
  },
  closeManual() { this.setData({ manualModal: false }); },
  onManualAmount(e) { this.setData({ manualAmount: e.detail.value }); },
  onManualRemark(e) { this.setData({ manualRemark: e.detail.value }); },

  async confirmManual() {
    const amount = Number(this.data.manualAmount);
    if (!(amount > 0)) {
      wx.showToast({ title: '金额不正确', icon: 'none' });
      return;
    }
    if (amount > this.data.bill.remain + 0.001) {
      wx.showToast({ title: '超过待收金额', icon: 'none' });
      return;
    }
    this.setData({ paying: true });
    try {
      await request(`/api/bills/${this.data.bill.id}/pay-manual`, 'POST', {
        amount,
        remark: this.data.manualRemark
      });
      this.setData({ paying: false, manualModal: false });
      wx.showToast({ title: '已确认收款', icon: 'success' });
      this.loadDetail();
    } catch (e) {
      this.setData({ paying: false });
      console.error('收款失败', e);
    }
  },

  fmtMoney(n) { return fmtMoney(n); },
  noop() { /* 阻止弹窗遮罩穿透点击 */ }
});
