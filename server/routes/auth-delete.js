// 租客自助注销账号：POST /api/auth/delete-account（微信审核「账号注销入口」硬门槛）
// 规则：仅租客可自助注销；必须手输「注销」二字确认；有未结清账单时拒绝并给条数；注销为匿名化，保留账单/合同以便对账与法规留存
import { Router } from 'express';
import { db } from '../db.js';
import { tenantAuth } from '../middleware/auth.js';
import { auditEvent } from '../middleware/audit.js';

const r = Router();

r.post('/delete-account', tenantAuth, (req, res) => {
  const confirm = String((req.body || {}).confirm || '').trim();
  if (confirm !== '注销') {
    return res.status(400).json({ error: '请输入「注销」两个字确认' });
  }

  const t = db.prepare('SELECT id, name, phone, status FROM tenants WHERE id=?').get(req.tenant.id);
  if (!t) return res.status(404).json({ error: '账号不存在' });
  if (t.status === 'deleted') return res.json({ ok: true, already: true });

  // 未结清账单拦截：避免把债务注销掉
  const unpaid = db
    .prepare("SELECT COUNT(*) c FROM bills WHERE tenant_id=? AND status IN ('unpaid','overdue')")
    .get(t.id).c;
  if (unpaid > 0) {
    return res.status(400).json({ error: `还有 ${unpaid} 笔未结清账单，结清后才能注销` });
  }

  const cols = db.prepare('PRAGMA table_info(tenants)').all().map((c) => c.name);
  const sets = [
    "name='已注销用户'",
    'phone=NULL',
    'wechat_openid=NULL',
    "id_card_enc=NULL",
    "id_card_photo=NULL",
    "verify_status='deleted'",
    "status='deleted'"
  ];
  if (cols.includes('deleted_at')) sets.push('deleted_at=datetime(\'now\',\'localtime\')');

  db.prepare(`UPDATE tenants SET ${sets.join(', ')} WHERE id=?`).run(t.id);
  auditEvent(req, 'tenant.deleteAccount', { tenant_id: t.id, unpaid_checked: true });
  res.json({ ok: true });
});

export default r;
