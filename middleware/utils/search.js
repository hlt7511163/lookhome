// 列表关键词搜索：空格分隔多个关键词，全部命中才算匹配（不区分大小写）
function norm(v) {
  return v === null || v === undefined ? '' : String(v).toLowerCase();
}

// 把若干字段拼成一条用于检索的字符串，挂在列表项上（如 item.search_key）
function buildSearchKey(fields) {
  return fields.map(f => norm(f)).join(' ');
}

function hasKeyword(keyword) {
  return norm(keyword).trim().length > 0;
}

/**
 * @param {Array} list 原始列表（每项需带 search_key，或由 fields 指定字段）
 * @param {String} keyword 用户输入
 * @param {Array<String>} [fields] 未提供 search_key 时用于匹配的字段名
 */
function filterByKeyword(list, keyword, fields) {
  const arr = list || [];
  const kws = norm(keyword).trim().split(/\s+/).filter(Boolean);
  if (!kws.length) return arr.slice();
  return arr.filter(item => {
    const hay = item && item.search_key !== undefined
      ? norm(item.search_key)
      : buildSearchKey((fields || []).map(f => item && item[f]));
    return kws.every(k => hay.indexOf(k) >= 0);
  });
}

module.exports = { buildSearchKey, filterByKeyword, hasKeyword };
