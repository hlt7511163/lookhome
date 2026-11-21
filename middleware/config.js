// LookHome 小程序 API 地址（租客端/管理端共用）
// 1) 默认指向项目演示服务器；你自己的部署请改这里，或在同目录新建 config.local.js（已被 .gitignore 排除）
// 2) 必须是 HTTPS，且该域名要加到微信小程序后台「request 合法域名」
// 3) 本地联调：http://127.0.0.1:3001（开发者工具勾选「不校验合法域名」）
let BASE_URL = 'https://lookhome.hanlongtao.top';

try {
  // 本地/私有配置优先，避免每次 pull 都改这个文件
  const local = require('./config.local.js');
  if (local && local.BASE_URL) BASE_URL = local.BASE_URL;
} catch (e) {
  // 没有 config.local.js 属正常情况
}

module.exports = { BASE_URL };
