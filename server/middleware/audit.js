// 全量审计日志：记录所有写操作（POST/PUT/PATCH/DELETE）与登录类接口
// 表结构见 server/schema.sql 的 audit_logs；写入失败只打日志，绝不影响业务响应
import { db } from '../db.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ALWAYS = [/^\/api\/auth\//, /^\/api\/tenant\/login/, /^\/api\/tenant\/register/];
const SKIP = [/^\/api\/health$/, /^\/uploads\//];

const SENSITIVE_KEYS = /password|passwd|pwd|id_card|idcard|token|secret|openid|phone|signature|private_key|api_key/i;

function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 3) return '[deep]';
  if (typeof value === 'string') return value.length > 200 ? value.slice(0, 200) + '…' : value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 5).map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEYS.test(k) ? '[masked]' : redact(v, depth + 1);
  }
  return out;
}

function safeJson(v) {
  try {
    const s = JSON.stringify(redact(v));
    return s && s.length > 2000 ? s.slice(0, 2000) + '…' : s;
  } catch {
    return '[unserializable]';
  }
}

function actorOf(req) {
  const u = req.user || req.tenant;
  if (!u) return { id: null, role: null };
  return { id: u.id ?? null, role: u.role ?? null };
}

let tableReady = false;
function ensureTable() {
  if (tableReady) return true;
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      actor_id INTEGER,
      actor_role TEXT,
      action TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status INTEGER,
      ip TEXT,
      ua TEXT,
      detail TEXT,
      duration_ms INTEGER
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_ts ON audit_logs(ts)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, ts)');
    tableReady = true;
    return true;
  } catch (e) {
    console.error('[audit] 建表失败', e.message);
    return false;
  }
}

export function auditLog() {
  ensureTable();
  return function (req, res, next) {
    if (SKIP.some((re) => re.test(req.path))) return next();
    const isWrite = WRITE_METHODS.has(req.method);
    const always = ALWAYS.some((re) => re.test(req.path));
    if (!isWrite && !always) return next();

    const started = Date.now();
    const snapshot = req.body ? safeJson(req.body) : null;

    const write = () => {
      try {
        const { id, role } = actorOf(req);
        db.prepare(
          `INSERT INTO audit_logs (ts, actor_id, actor_role, action, method, path, status, ip, ua, detail, duration_ms)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          new Date().toISOString(),
          id,
          role,
          `${req.method} ${req.route?.path || req.path}`,
          req.method,
          req.originalUrl?.slice(0, 200) || req.path,
          res.statusCode || 0,
          (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '',
          String(req.headers['user-agent'] || '').slice(0, 200),
          snapshot,
          Date.now() - started
        );
      } catch (e) {
        console.error('[audit] 写入失败', e.message);
      }
    };

    let done = false;
    const once = () => { if (!done) { done = true; write(); } };
    res.on('finish', once);
    res.on('close', once);
    next();
  };
}

// 手工写一条业务审计（如注销账号）
export function auditEvent(req, action, detail) {
  try {
    if (!ensureTable()) return;
    const { id, role } = actorOf(req);
    db.prepare(
      `INSERT INTO audit_logs (ts, actor_id, actor_role, action, method, path, status, ip, ua, detail, duration_ms)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      new Date().toISOString(), id, role, action, req.method,
      req.originalUrl?.slice(0, 200) || req.path, 200,
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '',
      String(req.headers['user-agent'] || '').slice(0, 200),
      safeJson(detail), 0
    );
  } catch (e) {
    console.error('[audit] 事件写入失败', e.message);
  }
}
