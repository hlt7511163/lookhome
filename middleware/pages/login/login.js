const { request } = require('../../utils/request.js');
const { saveLogin } = require('../../utils/auth.js');

Page({
  data: {
    mode: 'admin',        // admin=管理员登录 / tenant=租客登录 / register=租客注册
    tabs: [
      { key: 'admin', text: '管理员' },
      { key: 'tenant', text: '租客登录' },
      { key: 'register', text: '租客注册' }
    ],
    // 管理员
    username: '',
    password: '',
    // 租客
    phone: '',
    idCard: '',
    // 注册
    regName: '',
    submitting: false,
    // 微信一键登录返回 need_bind 时携带的 openid，用于后续手机号+身份证登录/注册时完成绑定
    bindOpenid: ''
  },

  onInput(e) {
    this.setData({
      [e.currentTarget.dataset.field]: e.detail.value
    });
  },

  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  // ===== 管理员登录（原有功能，保持不变）=====
  async handleLogin() {
    if (!this.data.username || !this.data.password) {
      wx.showToast({ title: '请输入账号密码', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showToast({ title: '登录中...', icon: 'loading', duration: 10000 });

    try {
      const res = await request('/api/auth/login', 'POST', {
        username: this.data.username,
        password: this.data.password
      });
      wx.hideToast();
      this.setData({ submitting: false });

      const token = res.token || res.access_token || (res.data && res.data.token);
      if (token) {
        saveLogin(token, { role: 'admin', user: res.user || null });
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/dashboard/dashboard' });
        }, 800);
      } else {
        wx.showToast({ title: '格式不对，看控制台', icon: 'none' });
      }
    } catch (error) {
      wx.hideToast();
      this.setData({ submitting: false });
      console.error('登录失败', error);
    }
  },

  // ===== 租客登录（手机号 + 身份证）=====
  async handleTenantLogin() {
    const { phone, idCard } = this.data;
    if (!phone || !idCard) {
      wx.showToast({ title: '请输入手机号和身份证号', icon: 'none' });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }
    if (!/^\d{17}[\dXx]$/.test(idCard)) {
      wx.showToast({ title: '身份证号格式不正确', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showToast({ title: '登录中...', icon: 'loading', duration: 10000 });

    try {
      const res = await request('/api/tenant/login', 'POST', {
        phone,
        id_card: idCard,
        openid: this.data.bindOpenid || undefined
      });
      wx.hideToast();
      this.setData({ submitting: false });

      if (res.token) {
        const bound = !!this.data.bindOpenid;
        this.setData({ bindOpenid: '' });
        saveLogin(res.token, { role: 'tenant', user: res.tenant || null });
        wx.showToast({ title: bound ? '绑定成功' : '登录成功', icon: 'success' });
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/index/index' });
        }, 800);
      } else if (res.need_bind) {
        wx.showToast({ title: '请先用手机号+身份证完成绑定', icon: 'none' });
      } else {
        wx.showToast({ title: res.error || '登录失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideToast();
      this.setData({ submitting: false });
      console.error('租客登录失败', error);
    }
  },

  // ===== 微信一键登录 =====
  async handleWxLogin() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({ success: resolve, fail: reject });
      });
      if (!loginRes.code) {
        wx.showToast({ title: '微信登录失败', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }
      wx.showToast({ title: '登录中...', icon: 'loading', duration: 10000 });
      const res = await request('/api/tenant/wx-login', 'POST', { code: loginRes.code });
      wx.hideToast();
      this.setData({ submitting: false });

      if (res.token) {
        saveLogin(res.token, { role: 'tenant', user: res.tenant || null });
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 800);
      } else if (res.need_bind) {
        // 微信未绑定 → 记录 openid，引导用手机号+身份证登录/注册完成绑定
        this.setData({ bindOpenid: res.openid || '' });
        wx.showModal({
          title: '绑定账号',
          content: res.notice || '该微信尚未绑定租客账号，请使用手机号+身份证登录完成绑定',
          confirmText: '去绑定',
          success: (r) => {
            if (r.confirm) this.setData({ mode: 'tenant' });
          }
        });
      } else {
        wx.showToast({ title: res.error || '微信登录未开通', icon: 'none' });
      }
    } catch (error) {
      wx.hideToast();
      this.setData({ submitting: false });
      console.error('微信登录失败', error);
    }
  },

  // ===== 租客注册（实名）=====
  async handleRegister() {
    const { regName, phone, idCard } = this.data;
    if (!regName || !phone || !idCard) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }
    if (!/^\d{17}[\dXx]$/.test(idCard)) {
      wx.showToast({ title: '身份证号格式不正确', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showToast({ title: '提交中...', icon: 'loading', duration: 10000 });

    try {
      const res = await request('/api/tenant/register', 'POST', {
        name: regName,
        phone,
        id_card: idCard,
        openid: this.data.bindOpenid || undefined
      });
      wx.hideToast();
      this.setData({ submitting: false });

      // 匹配既有租客档案 / 在线核验通过 → 直接返回 token
      if (res.token) {
        this.setData({ bindOpenid: '' });
        saveLogin(res.token, { role: 'tenant', user: { name: regName, phone } });
        wx.showToast({ title: '注册成功', icon: 'success' });
        setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 800);
        return;
      }
      wx.showModal({
        title: '注册成功',
        content: res.notice || '注册成功，房东审核身份后即可查看账单',
        showCancel: false,
        confirmText: '知道了',
        success: () => this.setData({ mode: 'tenant' })
      });
    } catch (error) {
      wx.hideToast();
      this.setData({ submitting: false });
      console.error('注册失败', error);
    }
  }
});
