import jwt from 'jsonwebtoken';
import { db } from '../db.js';

const SECRET = process.env.JWT_SECRET || 'lookhome-secret-change-me';
// 服务端会话时效（等保要求：会话必须有明确超时；不依赖客户端）
// 管理员：默认 12 小时；租客：默认 30 天（token 本身 exp 分别为 7d / 30d，取两者更短者生效）
const MAX_AGE_ADMIN = Number(process.env.SESSION_MAX_AGE_ADMIN_SEC || 12 * 3600);
const MAX_AGE_TENANT = Number(process.env.SESSION_MAX_AGE_TENANT_SEC || 30 * 24 * 3600);
const nowSec = () => Math.floor(Date.now() / 1000);
function expiredByAge(payload, maxAge) {
  const iat = Number(payload.iat || 0);
  if (!iat) return true;              // 无签发时间的旧 token 一律视为失效
  return nowSec() - iat > maxAge;
}

export function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '7d' });
}

export function signTenantToken(tenant) {
  return jwt.sign({ id: tenant.id, phone: tenant.phone, role: 'tenant' }, SECRET, { expiresIn: '30d' });
}

export function tenantAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const u = jwt.verify(token, SECRET);
    if (u.role !== 'tenant') return res.status(403).json({ error: '权限不足' });
    if (expiredByAge(u, MAX_AGE_TENANT)) return res.status(401).json({ error: '登录已超时，请重新登录' });
    // 已注销/停用租客的旧 token 立即失效
    const t = db.prepare('SELECT status FROM tenants WHERE id=?').get(u.id);
    if (!t || t.status === 'deleted') return res.status(401).json({ error: '账号已注销' });
    req.tenant = u;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
}

export function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
  if (req.user.role !== 'tenant' && expiredByAge(req.user, MAX_AGE_ADMIN)) {
    return res.status(401).json({ error: '登录已超时，请重新登录' });
  }
  // 校验账号状态：停用用户即使持有旧 token 也立即失效
  if (req.user.role !== 'tenant') {
    const u = db.prepare('SELECT status FROM admin_users WHERE id=?').get(req.user.id);
    if (!u || u.status !== 1) return res.status(401).json({ error: '账号已停用' });
  }
  next();
}

// 仅主管理员
export function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '仅主管理员可操作' });
  next();
}

// 项目范围过滤条件：admin 返回空；操作员返回按授权项目过滤
// alias 为 property_id 所在表的别名（如 p / r / rm）
export function grantedScope(req, alias) {
  if (req.user.role === 'admin') return { cond: '', args: [] };
  return {
    cond: ` AND ${alias}.property_id IN (SELECT property_id FROM property_grants WHERE admin_user_id=?)`,
    args: [req.user.id]
  };
}

// 校验某项目是否在操作员权限内（admin 恒 true）
export function canAccessProject(req, projectId) {
  if (req.user.role === 'admin') return true;
  return db.prepare('SELECT COUNT(*) c FROM property_grants WHERE admin_user_id=? AND property_id=?')
    .get(req.user.id, projectId).c > 0;
}
