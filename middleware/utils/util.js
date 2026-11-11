// 通用格式化工具
function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtInt(n) {
  return String(Number(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 日期：2026-09-01 12:00:00 -> 2026-09-01 12:00
function fmtDateTime(s) {
  if (!s) return '';
  return String(s).slice(0, 16);
}

// 手机号脱敏：13800138000 -> 138****8000
function maskPhone(p) {
  const s = String(p || '');
  return s.length === 11 ? s.slice(0, 3) + '****' + s.slice(7) : s;
}

// 身份证脱敏：610102199001011234 -> 6101**********1234
function maskIdCard(c) {
  const s = String(c || '');
  return s.length >= 8 ? s.slice(0, 4) + '**********' + s.slice(-4) : s;
}

const BILL_STATUS = { unpaid: '待缴', paid: '已缴', overdue: '逾期', void: '作废' };
const BILL_STATUS_CLASS = { unpaid: 'st-unpaid', paid: 'st-paid', overdue: 'st-overdue', void: 'st-void' };
const BILL_TYPE = { monthly: '月账单', deposit: '押金' };
const ROOM_STATUS = { vacant: '空置', rented: '在租', config: '配置中' };
const VERIFY_STATUS = { pending: '待审核', approved: '已认证', rejected: '未通过' };
const APP_STATUS = { pending: '审核中', approved: '已通过', rejected: '已驳回' };
const REFUND_STATUS = { pending: '待审批', processing: '处理中', done: '已退还', rejected: '已驳回' };
const PAY_MODE = { monthly: '月付', quarterly: '季付', half: '半年付', yearly: '年付' };

module.exports = {
  fmtMoney, fmtInt, fmtDateTime, maskPhone, maskIdCard,
  BILL_STATUS, BILL_STATUS_CLASS, BILL_TYPE, ROOM_STATUS,
  VERIFY_STATUS, APP_STATUS, REFUND_STATUS, PAY_MODE
};
