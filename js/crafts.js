if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Промыслы (1.8.9): «поставил — вернулся — забрал». Три дела в деревне: Мельница (помол), Питомник (корм), Библиотека (переписка).
   Каждое занимает время (в том числе пока игры нет открытой), стоит монет и возвращает чуть больше. В сутки — не более 3 сборов на дело.
   Чистый модуль: состояние Profile.data.crafts = { id: { at, day, n } }; цены считает экран из Profile.consumablePrice('potion') (P). */
const Crafts = (() => {
  const HOUR = 3600000, DAILY = 3;
  const JOBS = {
    mill:    { hours: 3, cost: 1, name: () => _t("Помол на мельнице"), desc: () => _t("Мельник смелет зерно: на выходе монет больше, чем вложено.") },
    kennel:  { hours: 6, cost: 1, name: () => _t("Корм в питомнике"), desc: () => _t("Заготовка корма: возвращается мёд — пригодится для банок и зелий.") },
    library: { hours: 8, cost: 2, name: () => _t("Переписка в библиотеке"), desc: () => _t("Бобёр перепишет свиток спешки — один готовый свиток на выходе.") },
  };
  const IDS = Object.keys(JOBS);
  const num = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  function clean(c) {
    c = c && typeof c === 'object' && !Array.isArray(c) ? c : {};
    const out = {};
    for (const id of IDS) { const e = c[id] || {}; out[id] = { at: num(e.at), day: typeof e.day === 'string' ? e.day : '', n: Math.min(DAILY, num(e.n)) }; }
    return out;
  }
  const cost = (id, P) => Math.max(1, Math.round(JOBS[id].cost * P));
  // что вернёт дело (P — цена зелья здоровья на этом уровне, tier — цвет героя)
  function reward(id, P, tier) {
    if (id === 'mill') return { coins: Math.round(P * 1.4) };
    if (id === 'kennel') return { res: ['honey', Math.max(1, Math.min(10, tier || 1)), 2] };
    return { cons: ['scroll', 1] };
  }
  const running = (c, id) => c[id].at > 0;
  const left = (c, id, day) => (c[id].day === day ? DAILY - c[id].n : DAILY);
  const msLeft = (c, id, now) => (running(c, id) ? Math.max(0, c[id].at + JOBS[id].hours * HOUR - now) : 0);
  const ready = (c, id, now) => running(c, id) && msLeft(c, id, now) === 0;
  function start(c, id, now, day) {
    if (!JOBS[id]) return { ok: false, why: 'none' };
    if (running(c, id)) return { ok: false, why: 'busy' };
    if (left(c, id, day) <= 0) return { ok: false, why: 'limit' };
    c[id].at = now; return { ok: true };
  }
  function collect(c, id, now, day) {
    if (!ready(c, id, now)) return { ok: false };
    if (c[id].day !== day) { c[id].day = day; c[id].n = 0; }
    c[id].n++; c[id].at = 0; return { ok: true };
  }
  return { HOUR, DAILY, JOBS, IDS, clean, cost, reward, running, left, msLeft, ready, start, collect };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Crafts;
