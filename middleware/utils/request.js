const { BASE_URL } = require('../config.js');

// 统一请求封装
// request(url, method, data, { silent })
// - 自动附带 Authorization: Bearer <token>
// - 401 → 清理登录态并跳登录页
// - silent=true 时不自动弹错误 toast（由页面自行处理）
const request = (url, method = 'GET', data = {}, options = {}) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token') || '';

    wx.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(res.data);
        } else if (res.statusCode === 401) {
          if (!options.silent) wx.showToast({ title: '登录已过期', icon: 'none' });
          wx.removeStorageSync('token');
          wx.removeStorageSync('role');
          setTimeout(() => wx.reLaunch({ url: '/pages/login/login' }), 600);
          reject({ statusCode: 401, data: res.data });
        } else {
          const msg = (res.data && res.data.error) || (res.data && res.data.message) || '请求失败';
          if (!options.silent) wx.showToast({ title: msg, icon: 'none' });
          reject({ statusCode: res.statusCode, data: res.data, message: msg });
        }
      },
      fail: (err) => {
        if (!options.silent) wx.showToast({ title: '网络连接失败', icon: 'none' });
        reject({ statusCode: -1, data: err, message: '网络连接失败' });
      }
    });
  });
};

module.exports = { request };
