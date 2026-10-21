if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Трофейные эликсиры существ (2.0.4): существо, победившее героя на карте, забирает у него эликсиры «на усмотрение» —
   по ценности для себя — и пьёт их в следующих боях, пока его не убьют (тогда всё, что не выпито, возвращается герою).
   Сколько забирается: от 1 до 10 штук, по цвету существа-победителя (цвет 1 → 1, цвет 10 → 10).
   Существа ценят: силу, броню, блок и жизнь (рикошет, ярость, хитрость, камни и превращение не используют).
   Пьют по одному за ход: жизнь — когда осталось меньше 40% ХП; сила — когда не действует; броня и блок — когда не действуют.
   Состояние — карта.loot = { идентификатор существа: { 'вид:цвет': штук } }; в бой уходит копией (Profile.data.monster.loot),
   выпитое вычитается из неё прямо в бою. Те же существа, что у Growth (обычные, не стражи/хозяева/логова/гости/редкие). */
const Trophy = (() => {
  const WEIGHT = { power: 1, defense: 0.9, health: 0.85, block: 0.7 };   // ценность вида для существа (умножается на цвет)
  const KINDS = Object.keys(WEIGHT);
  const MAX_TAKE = 10;
  const HEALTH_BELOW = 0.4;
  const eligible = (sp) => (typeof Growth !== 'undefined' ? Growth.eligible(sp) : !!sp && !sp.boss && !sp.zone && !sp.guest && !sp.rare && !sp.castle && !sp.siege);
  const count = (tier) => Math.max(1, Math.min(MAX_TAKE, Math.floor(tier) || 1));
  const num = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  const split = (k) => { const [kind, tier] = String(k).split(':'); return { kind, tier: Number(tier) }; };
  const value = (kind, tier) => (WEIGHT[kind] || 0) * tier;
  // Что существо цвета mobTier заберёт из сумки героя bag = { 'вид:цвет': штук }: самое ценное для себя, не больше count(mobTier) штук.
  function steal(bag, mobTier) {
    const list = Object.entries(bag || {}).map(([k, n]) => ({ k, n: num(n), ...split(k) })).filter((e) => e.n > 0 && WEIGHT[e.kind]);
    list.sort((a, b) => value(b.kind, b.tier) - value(a.kind, a.tier) || b.tier - a.tier || (a.k < b.k ? -1 : 1));
    let left = count(mobTier); const taken = {};
    for (const e of list) { if (left <= 0) break; const n = Math.min(e.n, left); taken[e.k] = n; left -= n; }
    return taken;
  }
  const add = (loot, extra) => { const out = { ...(loot || {}) }; for (const [k, n] of Object.entries(extra || {})) if (num(n)) out[k] = num(out[k]) + num(n); return out; };
  const total = (loot) => Object.values(loot || {}).reduce((s, n) => s + num(n), 0);
  const best = (loot, kind) => Object.keys(loot || {}).filter((k) => num(loot[k]) > 0 && split(k).kind === kind).sort((a, b) => split(b).tier - split(a).tier)[0] || null;
  // Что выпить сейчас: loot — запас, active — действующие эликсиры { вид: { tier, left } }, hpFrac — доля ХП. Возвращает ключ 'вид:цвет' или null.
  function pick(loot, active, hpFrac) {
    const on = (k) => active && active[k] && active[k].left > 0;
    if (hpFrac < HEALTH_BELOW && best(loot, 'health')) return best(loot, 'health');
    for (const kind of ['power', 'defense', 'block']) if (!on(kind) && best(loot, kind)) return best(loot, kind);
    return null;
  }
  return { WEIGHT, KINDS, MAX_TAKE, HEALTH_BELOW, eligible, count, value, steal, add, total, pick, split };
})();
if (typeof module !== 'undefined') module.exports = Trophy;
