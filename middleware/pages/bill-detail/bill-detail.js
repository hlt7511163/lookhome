const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { fmtMoney, toMoney, BILL_STATUS, BILL_STATUS_CLASS, BILL_TYPE } = require('../../utils/util.js');

Page({
  data: {
    role: 'tenant',
    bill: null,
    items: [],
    payments: [],
    payModal: false,       // 租客支付弹窗
    manualModal: false,    // 管理端手工收款弹窗
    manualAmount: '',
    manualRemark: '',
    paying: false,
    payStage: ''           // '' | 'requesting' | 'confirming'
  },

  onLoad(options) {
    this.setData({ role: options.role || 'tenant' });
    wx.setNavigationBarTitle({
      title: (options.role === 'admin' ? '账单详情（管理）' : '账单详情')
    });
  },

  onShow() {
    if (!ensureLogin()) return;
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
      const total = Number(bill.total) || 0;
      const paid = Number(bill.paid_amount) || 0;
      const remain = Math.max(0, total - paid);
      this.setData({
        bill: {
          ...bill,
          totalText: fmtMoney(total),
          paidText: fmtMoney(paid),
          remainText: fmtMoney(remain),
          typeText: BILL_TYPE[bill.bill_type] || '账单',
          statusText: BILL_STATUS[bill.status] || bill.status,
          statusClass: BILL_STATUS_CLASS[bill.status] || 'st-void',
          remain
        },
        items: res.items || [],
        payments: (res.payments || []).map(p => ({
          ...p,
          amountText: fmtMoney(p.amount),
          confirmText: p.confirm_status === 'confirmed' ? '已确认' : '待确认'
        })),
        manualAmount: String(toMoney(remain))
      });
    } catch (e) {
      console.error('加载账单详情失败', e);
    }
    wx.hideNavigationBarLoading();
  },

  // ===== 租客：发起支付 =====
  // 支付金额由服务端按账单计算，前端只传 bill_id，不接受改价（防篡改）
  openPay() {
    if (this.data.paying) return;
    this.setData({ payModal: true });
  },
  closePay() { this.setData({ payModal: false }); },

  async confirmPay() {
    const { bill, paying } = this.data;
    if (paying) return;
    if (!bill || !(bill.remain > 0)) {
      wx.showToast({ title: '当前没有待付金额', icon: 'none' });
      return;
    }
    this.setData({ paying: true, payStage: 'requesting' });
    try {
      const res = await request('/api/pay/jsapi', 'POST', { bill_id: bill.id });
      if (res.mode === 'manual') {
        // 未开通微信支付 → 线下转账指引
        this.setData({ payModal: false, paying: false, payStage: '' });
        wx.showModal({
          title: '线下支付',
          content: (res.notice || '线上支付未开通') + '。应付金额 ¥' + fmtMoney(res.amount || bill.remain) + '，到账后由房东在后台确认。',
          confirmText: '知道了',
          showCancel: false
        });
        return;
      }
      if (res.mode !== 'wechat' || !res.pay_params) {
        this.setData({ payModal: false, paying: false, payStage: '' });
        wx.showModal({
          title: '支付暂不可用',
          content: '服务端未返回可用的微信支付参数，请稍后重试或联系房东线下支付。',
          showCancel: false
        });
        return;
      }
      const p = res.pay_params;
      if (!p.timeStamp || !p.nonceStr || !p.package || !p.paySign) {
        this.setData({ payModal: false, paying: false, payStage: '' });
        wx.showModal({
          title: '支付暂不可用',
          content: '服务端支付参数不完整（缺少 paySign），请先完成微信支付配置，或按房东指引线下转账后由房东确认。',
          showCancel: false
        });
        return;
      }
      wx.requestPayment({
        timeStamp: p.timeStamp,
        nonceStr: p.nonceStr,
        package: p.package,
        signType: p.signType || 'RSA',
        paySign: p.paySign,
        success: () => {
          // 付款动作完成 ≠ 已到账，等支付平台回调后账单才转为已缴
          this.setData({ payStage: 'confirming' });
          wx.showToast({ title: '支付已提交，正在确认', icon: 'none' });
          this.pollPaid();
        },
        fail: (err) => {
          this.setData({ paying: false, payStage: '' });
          const msg = (err && err.errMsg) || '';
          if (msg.indexOf('cancel') >= 0) return;
          wx.showToast({ title: '支付未完成，可稍后重试', icon: 'none' });
        }
      });
      // 注意：requestPayment 是异步回调，paid 状态由 pollPaid 统一收口
      setTimeout(() => {
        if (this.data.payStage === 'requesting') {
          this.setData({ paying: false, payStage: '' });
        }
      }, 8000);
    } catch (e) {
      this.setData({ paying: false, payStage: '' });
      // 服务端 429（防重复提交）/ 403 等错误已由 request 统一提示
      console.error('支付请求失败', e);
    }
  },

  // 轮询账单状态，最多 6 次、间隔 1.5s
  async pollPaid(maxTimes = 6) {
    const billId = this.data.bill && this.data.bill.id;
    for (let i = 0; i < maxTimes; i++) {
      await this.sleep(1500);
      try {
        const res = await request('/api/tenant/bills/' + billId, 'GET', {}, { silent: true });
        const bill = res.bill || res;
        if (bill && bill.status === 'paid') {
          this.setData({ payModal: false, paying: false, payStage: '' });
          wx.showToast({ title: '支付成功', icon: 'success' });
          this.loadDetail();
          return;
        }
      } catch (e) { /* 单次失败继续重试 */ }
    }
    this.setData({ payModal: false, paying: false, payStage: '' });
    wx.showModal({
      title: '支付结果确认中',
      content: '微信支付结果可能有所延迟，请稍后在账单列表刷新查看，切勿重复付款。若长时间未更新，请联系房东核对。',
      showCancel: false
    });
    this.loadDetail();
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // ===== 管理端：手工确认收款 =====
  openManual() {
    this.setData({ manualModal: true, manualAmount: String(toMoney(this.data.bill.remain)), manualRemark: '' });
  },
  closeManual() { this.setData({ manualModal: false }); },
  onManualAmount(e) { this.setData({ manualAmount: e.detail.value }); },
  onManualRemark(e) { this.setData({ manualRemark: e.detail.value }); },

  async confirmManual() {
    const { bill, paying } = this.data;
    if (paying) return;
    const amount = toMoney(this.data.manualAmount);
    if (!(amount > 0)) {
      wx.showToast({ title: '金额不正确', icon: 'none' });
      return;
    }
    if (amount > bill.remain + 0.005) {
      wx.showToast({ title: '超过待收金额', icon: 'none' });
      return;
    }
    this.setData({ paying: true });
    try {
      await request(`/api/bills/${bill.id}/pay-manual`, 'POST', {
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
