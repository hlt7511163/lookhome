const { request } = require('../../utils/request.js');
const { ensureLogin } = require('../../utils/auth.js');
const { DEFAULT_TEMPLATE } = require('../../utils/contract-default.js');

// 预览用示例数据（与服务端 renderContract 占位符一致）
const SAMPLE = {
  site_name: 'LookHome', site_phone: '13800138000',
  property_name: '阳光家园', property_address: 'XX市XX区XX路1号',
  room_no: '888', layout: '两室一厅', area: '20',
  tenant_name: '张伟', id_card: '110101199001011234', tenant_phone: '138****8000',
  monthly_rent: '1500', deposit: '0', term_months: '12',
  pay_mode_text: '☑ 月付（每月一付）', first_payment: '1500',
  start_date: '2026-11-10', end_date: '2027-11-10', sign_date: '2026-11-10'
};

const PLACEHOLDERS = [
  '{property_name}', '{property_address}', '{room_no}', '{layout}', '{area}',
  '{tenant_name}', '{id_card}', '{tenant_phone}',
  '{monthly_rent}', '{deposit}', '{term_months}', '{pay_mode_text}', '{first_payment}',
  '{start_date}', '{end_date}', '{sign_date}', '{site_name}', '{site_phone}'
];

Page({
  data: {
    template: '',           // 服务端已保存的自定义模板（空 = 使用内置默认）
    editorText: '',         // 编辑器当前内容
    isDefault: true,        // 当前是否使用内置默认模板
    supported: true,        // 服务端是否返回 contract_template 字段（未部署补丁时为 false）
    dirty: false,
    saving: false,
    len: 0,
    showPreview: false,
    previewText: '',
    placeholders: PLACEHOLDERS
  },

  onShow() {
    if (!ensureLogin()) return;
    if (!this.data.dirty) this.loadTemplate();
  },

  async loadTemplate() {
    try {
      const res = await request('/api/settings', 'GET');
      const tpl = res.contract_template;
      const supported = tpl !== undefined;
      const saved = tpl || '';
      this.setData({
        supported,
        template: saved,
        isDefault: !saved,
        editorText: saved || DEFAULT_TEMPLATE,
        len: (saved || DEFAULT_TEMPLATE).length,
        dirty: false,
        showPreview: false,
        previewText: ''
      });
    } catch (e) {
      console.error('加载合同模板失败', e);
    }
  },

  onInput(e) {
    const v = e.detail.value;
    this.setData({ editorText: v, len: v.length, dirty: true });
  },

  async save() {
    const { editorText, saving, supported, isDefault } = this.data;
    if (saving) return;
    if (!supported) {
      wx.showModal({
        title: '服务端未支持',
        content: '服务器还没部署 settings 补丁（GET 返回 contract_template、PUT 白名单加 contract_template、PUT 改 upsert），现在保存会静默失效。请先按《服务端补丁部署说明.md》补丁二部署后再保存。',
        showCancel: false
      });
      return;
    }
    if (!editorText.trim()) {
      wx.showToast({ title: '内容不能为空，恢复默认请用「恢复内置模板」', icon: 'none' });
      return;
    }
    if (isDefault && editorText === DEFAULT_TEMPLATE) {
      wx.showToast({ title: '当前就是内置默认模板，无需保存', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      await request('/api/settings', 'PUT', { contract_template: editorText });
      this.setData({ template: editorText, isDefault: false, dirty: false });
      wx.showToast({ title: '已保存，新签约即用新模板', icon: 'success' });
    } catch (e) {
      wx.showModal({ title: '保存失败', content: (e && e.message) || '请求失败，请检查服务端补丁是否已部署', showCancel: false });
    }
    this.setData({ saving: false });
  },

  resetDefault() {
    wx.showModal({
      title: '恢复内置模板',
      content: '将清空已保存的自定义模板，签约时使用系统内置标准合同，确定？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await request('/api/settings', 'PUT', { contract_template: '' });
          this.setData({
            template: '', isDefault: true, editorText: DEFAULT_TEMPLATE,
            len: DEFAULT_TEMPLATE.length, dirty: false, showPreview: false, previewText: ''
          });
          wx.showToast({ title: '已恢复内置模板', icon: 'success' });
        } catch (e) {
          wx.showModal({ title: '恢复失败', content: (e && e.message) || '请求失败', showCancel: false });
        }
      }
    });
  },

  togglePreview() {
    const show = !this.data.showPreview;
    this.setData({
      showPreview: show,
      previewText: show ? this.render(this.data.editorText) : ''
    });
  },

  // 客户端预览渲染（与服务端同规则：{key} 占位符替换）
  render(tpl) {
    if (!tpl) return '（当前为空，将使用内置默认模板）';
    return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in SAMPLE ? SAMPLE[k] : m));
  }
});
