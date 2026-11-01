// Отчёты тестировщиков (2.0.9): бои, ошибки, сообщения о проблемах. Хранятся 30 дней, читаются только по ключу STATS_KEY.
// Ник — публичное имя героя; другие личные данные (почта, внешние id, адрес) сюда не попадают.
const KINDS = ['battle', 'error', 'report'];
const MAX_ITEMS = 20, MAX_ITEM_BYTES = 40000, KEEP_MS = 30 * 86400000, KEEP_ROWS = 20000;
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
// приводим пачку от клиента к безопасному виду; негодные записи молча пропускаем
function clean(items) {
  const out = [];
  for (const it of (Array.isArray(items) ? items : []).slice(0, MAX_ITEMS)) {
    if (!it || typeof it !== 'object' || !KINDS.includes(it.kind) || !it.data || typeof it.data !== 'object' || Array.isArray(it.data)) continue;
    let s; try { s = JSON.stringify(it.data); } catch (e) { continue; }
    if (s.length > MAX_ITEM_BYTES) continue;
    out.push({ kind: it.kind, ver: str(it.ver, 16), who: str(it.who, 40), at: Number.isFinite(it.at) ? it.at : 0, data: JSON.parse(s) });
  }
  return out;
}
module.exports = { KINDS, MAX_ITEMS, MAX_ITEM_BYTES, KEEP_MS, KEEP_ROWS, clean };
