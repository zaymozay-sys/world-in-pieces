// Площадка народа: правила записей. Чистый модуль (без хранилища и HTTP).
const MAX_LEN = 140, MIN_GAP_MS = 20000, DAILY = 15, KEEP_MS = 7 * 86400000, SHOW = 30, ONLINE_MS = 5 * 60000;
const LINK_RE = /(https?:|www\.|[a-zа-я0-9-]+\.(ru|com|net|org|io|me|su|рф|xyz|gg|tv)\b|t\.me|@[a-z0-9_]{3,})/i;
// очистка текста: управляющие символы и разметка долой, пробелы схлопнуты; ссылки и контакты не допускаются
const clean = (t) => {
  if (typeof t !== 'string') return { e: 'text' };
  const s = t.replace(/[\u0000-\u001f\u007f<>&"]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return { e: 'empty' };
  if (s.length > MAX_LEN) return { e: 'long' };
  if (LINK_RE.test(s)) return { e: 'link' };
  return { text: s };
};
// проверка частоты: last — время последней записи игрока (или 0), today — сколько записей за сутки UTC
const allowed = (last, today, now) => (now - last < MIN_GAP_MS ? 'slow' : today >= DAILY ? 'daily' : '');
// модерация: запись исчезает у всех после HIDE_AT жалоб; автор, на которого пожаловались HIDE_AT разных игроков за MUTE_MS, не может писать MUTE_MS
const HIDE_AT = 3, MUTE_MS = 3 * 86400000, REPORTS_DAILY = 10;
module.exports = { HIDE_AT, MUTE_MS, REPORTS_DAILY, MAX_LEN, MIN_GAP_MS, DAILY, KEEP_MS, SHOW, ONLINE_MS, clean, allowed };
