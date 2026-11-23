const { request } = require('../../utils/request.js');
const { saveLogin } = require('../../utils/auth.js');
const { isValidIdCard } = require('../../utils/util.js');

Page({
  data: {
    mode: 'admin',        // admin=管理员登录 / tenant=租客登录 / register=租客注册
    agreed: false,        // 是否已勾选同意用户协议与隐私政策
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
    // 服务端返回 429 时的锁定倒计时（秒）；>0 时禁止再次提交
    lockLeft: 0,
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

  onLoad() {
    this.setData({ agreed: !!wx.getStorageSync('privacyAgreed') });
  },

  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  openPrivacy(e) {
    const tab = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || 'privacy';
    wx.navigateTo({ url: '/pages/privacy/privacy?tab=' + tab });
  },

  // 登录/注册前置合规检查：勾选同意 + 微信隐私保护指引授权
  async guardConsent() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并勾选同意《用户协议与隐私政策》', icon: 'none' });
      return false;
    }
    try {
      if (typeof wx.getPrivacySetting === 'function' && typeof wx.requirePrivacyAuthorize === 'function') {
        const setting = await new Promise((resolve) => {
          wx.getPrivacySetting({ success: resolve, fail: () => resolve({}) });
        });
        if (setting && setting.needAuthorization) {
          await new Promise((resolve, reject) => {
            wx.requirePrivacyAuthorize({ success: resolve, fail: reject });
          });
        }
      }
    } catch (e) {
      wx.showToast({ title: '需同意隐私保护指引后才能继续', icon: 'none' });
      return false;
    }
    wx.setStorageSync('privacyAgreed', true);
    return true;
  },

  // ===== 登录失败 / 被锁定 的统一提示 =====
  // 说明：utils/request.js 里已经 toast 过一次错误，但页面 catch 里的 wx.hideToast()
  // 会把它立刻关掉，用户看不到任何反馈。这里统一改成显式提示 + 被锁时倒计时禁用按钮。
  showAuthError(error, fallback) {
    const status = (error && error.statusCode) || 0;
    const msg = (error && (error.message || (error.data && error.data.error))) || fallback || '登录失败';
    wx.hideToast(); // 关掉「登录中...」的 loading

    if (status === 429) {
      const mins = /(\d+)\s*分钟/.exec(msg);
      const sec = mins ? parseInt(mins[1], 10) * 60 : 60;
      this.startLock(sec);
      wx.showModal({
        title: '尝试次数过多',
        content: msg + '\n\n锁定期间无法继续尝试，请稍后再登录。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }

    // 400/403/网络失败：把服务端原话显示出来（不再吞掉）
    wx.showToast({ title: msg, icon: 'none', duration: 2500 });
  },

  // 锁定倒计时：按钮禁用 + 显示剩余时间
  startLock(sec) {
    if (this._lockTimer) clearInterval(this._lockTimer);
    this.setData({ lockLeft: sec > 0 ? sec : 60 });
    this._lockTimer = setInterval(() => {
      const left = this.data.lockLeft - 1;
      if (left <= 0) {
        clearInterval(this._lockTimer);
        this._lockTimer = null;
        this.setData({ lockLeft: 0 });
      } else {
        this.setData({ lockLeft: left });
      }
    }, 1000);
  },

  // 提交前的锁定检查
  checkLock() {
    if (this.data.lockLeft > 0) {
      const m = Math.floor(this.data.lockLeft / 60);
      const s = this.data.lockLeft % 60;
      const txt = m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
      wx.showToast({ title: `已锁定，请 ${txt}后再试`, icon: 'none' });
      return false;
    }
    return true;
  },

  onUnload() {
    if (this._lockTimer) clearInterval(this._lockTimer);
  },

  // ===== 管理员登录（原有功能，保持不变）=====
  async handleLogin() {
    if (!this.checkLock()) return;
    if (!this.data.username || !this.data.password) {
      wx.showToast({ title: '请输入账号密码', icon: 'none' });
      return;
    }
    if (!(await this.guardConsent())) return;
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
      this.setData({ submitting: false });
      console.error('登录失败', error);
      this.showAuthError(error, '账号或密码错误');
    }
  },

  // ===== 租客登录（手机号 + 身份证）=====
  async handleTenantLogin() {
    if (!this.checkLock()) return;
    const { phone, idCard } = this.data;
    if (!phone || !idCard) {
      wx.showToast({ title: '请输入手机号和身份证号', icon: 'none' });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }
    if (!isValidIdCard(idCard)) {
      wx.showToast({ title: '身份证号不正确', icon: 'none' });
      return;
    }
    if (!(await this.guardConsent())) return;
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
      this.setData({ submitting: false });
      console.error('租客登录失败', error);
      this.showAuthError(error, '手机号或身份证号不正确');
    }
  },

  // ===== 微信一键登录 =====
  async handleWxLogin() {
    if (!(await this.guardConsent())) return;
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
    if (!this.checkLock()) return;
    const { regName, phone, idCard } = this.data;
    if (!regName || !phone || !idCard) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }
    if (!isValidIdCard(idCard)) {
      wx.showToast({ title: '身份证号不正确', icon: 'none' });
      return;
    }
    if (!(await this.guardConsent())) return;
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
      this.setData({ submitting: false });
      console.error('注册失败', error);
      this.showAuthError(error, '注册失败，请稍后再试');
    }
  }
});
