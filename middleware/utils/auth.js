// 登录态、角色与会话管理
// token 为后端 JWT：payload 含 role（admin / tenant）与 exp（秒级时间戳）
// 本地只做界面分流与"会话是否还活着"的粗判，权限最终以服务端校验为准。

const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 小时无操作自动退出

function base64UrlDecode(str) {
  try {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    // 小程序无 atob：手动 base64 + UTF-8 解码
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = [];
    let buffer = 0, bits = 0;
    for (const ch of s) {
      if (ch === '=') break;
      const idx = chars.indexOf(ch);
      if (idx < 0) continue;
      buffer = (buffer << 6) | idx;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((buffer >> bits) & 0xff);
      }
    }
    // UTF-8 解码
    const bytes = new Uint8Array(out);
    let result = '';
    let i = 0;
    while (i < bytes.length) {
      const b = bytes[i];
      if (b < 0x80) { result += String.fromCharCode(b); i++; }
      else if (b < 0xe0) { result += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2; }
      else if (b < 0xf0) { result += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)); i += 3; }
      else { result += String.fromCharCode(((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f)); i += 4; }
    }
    return result;
  } catch (e) {
    return null;
  }
}

function decodeToken(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const json = base64UrlDecode(parts[1]);
    return json ? JSON.parse(json) : null;
  } catch (e) {
    return null;
  }
}

function getRole() {
  // 以本地存储为准，缺失时从 JWT payload 兜底解码（避免角色信息丢失导致误判）
  const saved = wx.getStorageSync('role');
  if (saved) return saved;
  const payload = decodeToken(getToken());
  return (payload && payload.role) || '';
}

function getToken() {
  return wx.getStorageSync('token') || '';
}

// 手机号脱敏（本地兜底，避免把明文手机号写进缓存）
function maskPhone(p) {
  const s = String(p || '');
  return s.length === 11 ? s.slice(0, 3) + '****' + s.slice(7) : s;
}

// 只缓存展示必需字段，剔除身份证号等敏感信息（等保：敏感数据不留存客户端）
function sanitizeUser(u) {
  if (!u) return null;
  return {
    name: u.name || u.display_name || '租客',
    phone: maskPhone(u.phone),
    verify_status: u.verify_status || '',
    username: u.username || '',
    role: u.role || ''
  };
}

// 记录最近活动时间（供无操作超时判断）
function touch() {
  try { wx.setStorageSync('lastActiveAt', Date.now()); } catch (e) { /* 忽略 */ }
}

function isTokenExpired(payload) {
  if (!payload || !payload.exp) return false;
  return payload.exp * 1000 <= Date.now();
}

// 会话是否有效：token 存在 + 未过 exp + 未被无操作超时
function isSessionValid() {
  const token = getToken();
  if (!token) return false;
  if (isTokenExpired(decodeToken(token))) return false;
  const last = Number(wx.getStorageSync('lastActiveAt') || 0);
  if (last && Date.now() - last > IDLE_TIMEOUT_MS) return false;
  return true;
}

// 登录成功后统一落地登录态
function saveLogin(token, extra) {
  const payload = decodeToken(token);
  const role = (payload && payload.role) || (extra && extra.role) || '';
  wx.setStorageSync('token', token);
  wx.setStorageSync('role', role);
  wx.setStorageSync('lastActiveAt', Date.now());
  const app = getApp();
  app.globalData.token = token;
  app.globalData.role = role;
  if (extra && extra.user) {
    const safe = sanitizeUser(extra.user);
    wx.setStorageSync('userInfo', safe);
    app.globalData.userInfo = safe;
  }
  return role;
}

function clearLogin() {
  wx.removeStorageSync('token');
  wx.removeStorageSync('role');
  wx.removeStorageSync('userInfo');
  wx.removeStorageSync('lastActiveAt');
  wx.removeStorageSync('bindOpenid');
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.token = '';
    app.globalData.role = '';
    app.globalData.userInfo = null;
  }
}

function goLogin() {
  wx.reLaunch({ url: '/pages/login/login' });
}

// 页面守卫：未登录 / 已过期 / 长时间无操作 → 跳登录页
function ensureLogin() {
  if (!isSessionValid()) {
    clearLogin();
    goLogin();
    return false;
  }
  touch();
  return true;
}

// 角色守卫：角色不符时回到自己那一侧首页（服务端仍会做二次校验）
function ensureRole(expected) {
  if (!ensureLogin()) return false;
  const role = getRole();
  if (!role) return true; // 老 token 未带 role，交给服务端判定，不误伤
  if (role !== expected) {
    wx.reLaunch({ url: role === 'admin' ? '/pages/dashboard/dashboard' : '/pages/index/index' });
    return false;
  }
  return true;
}

// 未读消息数（租客端 tabBar 角标用）
function setUnread(n) {
  const app = getApp();
  app.globalData.unread = Number(n) || 0;
  return app.globalData.unread;
}

module.exports = {
  decodeToken, getRole, getToken, saveLogin, clearLogin,
  ensureLogin, ensureRole, setUnread, touch, isSessionValid, sanitizeUser
};
