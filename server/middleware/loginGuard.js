// 登录失败锁定（内存版，单进程；多实例部署请换成 Redis/数据库计数）
// 规则：同一账号 15 分钟内失败 5 次 → 锁 15 分钟；同一 IP 15 分钟内失败 20 次 → 锁 IP
// 通过环境变量可调：LOGIN_MAX_FAIL / LOGIN_WINDOW_MIN / LOGIN_LOCK_MIN / LOGIN_MAX_FAIL_IP

const WINDOW_MS = Number(process.env.LOGIN_WINDOW_MIN || 15) * 60 * 1000;
const LOCK_MS = Number(process.env.LOGIN_LOCK_MIN || 15) * 60 * 1000;
const MAX_FAIL = Number(process.env.LOGIN_MAX_FAIL || 5);
const MAX_FAIL_IP = Number(process.env.LOGIN_MAX_FAIL_IP || 20);

const store = new Map(); // key -> { count, firstAt, lockedUntil }

function slot(key) {
  const now = Date.now();
  let e = store.get(key);
  if (!e) {
    e = { count: 0, firstAt: now, lockedUntil: 0 };
    store.set(key, e);
  }
  // 窗口过期且不在锁定期 → 重置
  if (!e.lockedUntil && now - e.firstAt > WINDOW_MS) {
    e.count = 0;
    e.firstAt = now;
  }
  return e;
}

export function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.ip || req.socket?.remoteAddress || 'unknown';
}

function keys(req, account) {
  const acc = String(account || '').trim().toLowerCase();
  const out = [];
  if (acc) out.push('acc:' + acc);
  out.push('ip:' + clientIp(req));
  return out;
}

// 登录前检查：被锁 → 返回剩余锁定时长；未锁 → 返回本次窗口还剩几次机会
export function loginCheck(req, account) {
  const now = Date.now();
  const acc = String(account || '').trim().toLowerCase();

  for (const k of keys(req, account)) {
    const e = store.get(k);
    if (e && e.lockedUntil > now) {
      return {
        blocked: true,
        retryAfter: Math.ceil((e.lockedUntil - now) / 1000),
        lockedUntil: e.lockedUntil,
        remaining: 0,
        max: MAX_FAIL,
        key: k
      };
    }
  }

  const e = acc ? store.get('acc:' + acc) : null;
  const used = e && !e.lockedUntil ? e.count : 0;
  return { blocked: false, retryAfter: 0, remaining: Math.max(0, MAX_FAIL - used), max: MAX_FAIL };
}

// 记录一次失败；达到阈值立即上锁，并返回「还能试几次 / 要等多久」
export function loginFail(req, account) {
  const now = Date.now();
  let locked = false;
  let retryAfter = 0;
  let remaining = MAX_FAIL;

  for (const k of keys(req, account)) {
    const e = slot(k);
    if (e.lockedUntil > now) {
      locked = true;
      retryAfter = Math.max(retryAfter, Math.ceil((e.lockedUntil - now) / 1000));
      continue;
    }
    e.count += 1;
    const limit = k.startsWith('ip:') ? MAX_FAIL_IP : MAX_FAIL;
    if (e.count >= limit) {
      e.lockedUntil = now + LOCK_MS;
      e.count = 0;
      locked = true;
      retryAfter = Math.max(retryAfter, Math.ceil(LOCK_MS / 1000));
      console.warn(`[login-guard] 锁定 ${k} 至 ${new Date(e.lockedUntil).toISOString()}`);
    } else if (!k.startsWith('ip:')) {
      remaining = limit - e.count;
    }
  }
  return { locked, retryAfter, remaining, max: MAX_FAIL };
}

// 登录成功清除账号维度计数（IP 计数保留，防撞库轮换账号）
export function loginReset(req, account) {
  const acc = String(account || '').trim().toLowerCase();
  if (acc) store.delete('acc:' + acc);
}

export function _snapshot() {
  const now = Date.now();
  return [...store.entries()].map(([k, v]) => ({
    key: k,
    count: v.count,
    lockedSec: Math.max(0, Math.round((v.lockedUntil - now) / 1000))
  }));
}

export function _reset() {
  store.clear();
}

// 定期清理过期条目
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) {
    if (!v.lockedUntil && now - v.firstAt > WINDOW_MS) store.delete(k);
    else if (v.lockedUntil && v.lockedUntil < now - WINDOW_MS) store.delete(k);
  }
}, 10 * 60 * 1000);
sweeper.unref?.();
