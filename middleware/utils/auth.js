// 登录态与角色工具
// token 为后端 JWT：payload 含 role（admin / tenant），本地解码仅用于界面分流

function base64UrlDecode(str) {
  try {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    // 小程序无 atob：用 wx.arrayBufferToBase64 的逆运算不可用，改为手动 UTF-8 解码
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
  return wx.getStorageSync('role') || '';
}

function getToken() {
  return wx.getStorageSync('token') || '';
}

// 登录成功后统一落地登录态
function saveLogin(token, extra) {
  const payload = decodeToken(token);
  const role = (payload && payload.role) || (extra && extra.role) || '';
  wx.setStorageSync('token', token);
  wx.setStorageSync('role', role);
  const app = getApp();
  app.globalData.token = token;
  app.globalData.role = role;
  if (extra && extra.user) {
    wx.setStorageSync('userInfo', extra.user);
    app.globalData.userInfo = extra.user;
  }
  return role;
}

function clearLogin() {
  wx.removeStorageSync('token');
  wx.removeStorageSync('role');
  wx.removeStorageSync('userInfo');
  const app = getApp();
  app.globalData.token = '';
  app.globalData.role = '';
  app.globalData.userInfo = null;
}

// 页面守卫：未登录则跳转登录页
function ensureLogin() {
  if (!getToken()) {
    wx.reLaunch({ url: '/pages/login/login' });
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

module.exports = { decodeToken, getRole, getToken, saveLogin, clearLogin, ensureLogin, setUnread };
