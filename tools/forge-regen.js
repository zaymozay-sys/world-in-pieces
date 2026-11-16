/* 2.4.0: пересчёт ВСЕЙ таблицы рецептов Кузницы (js/forge-data.js) по правилам «ресурс по смыслу».
   Роль → виды ресурсов (BASE) и глубинные ресурсы цветов 8–10 (DEEP): каждый из 24 видов где-то нужен.
   Бюджет вещи (total) не меняется: он считается из цены вещи (как проверяет tests/forge207.test.js).
   Запуск: node tools/forge-regen.js   (перезаписывает js/forge-data.js; потом npm test, node tools/audit-economy.js) */
const fs = require('fs'), path = require('path');
global.window = undefined;
require('../js/i18n.js');
global.Tiers = require('../js/tiers.js'); const Gear = global.Gear = require('../js/items.js'); global.Balance = require('../js/balance.js');
const Bestiary = global.Bestiary = require('../js/bestiary.js'); global.HexMap = require('../js/hexmap.js'); require('../js/forge-data.js'); const Forge = require('../js/forge.js');
const FILE = path.join(__dirname, '..', 'js', 'forge-data.js');
const src = fs.readFileSync(FILE, 'utf8'), m = src.match(/const ForgeData = (.*?);\s*\n/);
const OLD = JSON.parse(m[1]);
const P = (k, t) => Bestiary.resPrice(k, t);
const SHARE = { common: 0.5, rare: 0.4, epic: 0.4 }, K1 = 0.84, ALT = 0.05, COINMAX = 0.40, MINCOIN = 0.05, RESFRAC = 0.8;

// Смысл ресурсов по ролям (порядок — предпочтение; недоступные на цвете и слишком дорогие для доли пропускаются)
const BASE = {
  metal: ['ore', 'scrap', 'fang'],                 // клинки и оковка: руда, лом, клыки
  plate: ['scrap', 'ore', 'chitin', 'scale'],      // доспехи: лом, руда, хитин, чешуя
  wood: ['splinter', 'resin', 'horn', 'bone'],     // древки, луки: щепа, смола, рог
  leather: ['hide', 'feather'],                    // кожа и подкладка
  bind: ['silk', 'bone', 'honey', 'shell', 'resin'], // скрепление: паутина, кость, мёд (клей), ракушка
  arcane: ['crystal', 'essence', 'shell'],         // магия: кристалл, эссенция
  trophy: ['scale', 'essence', 'fang', 'crystal'], // трофей: редкое с сильных существ
};
// Глубинные ресурсы (цвета 8–10, их приносят существа глубины): по ролям
const DEEP = {
  metal: ['graphite', 'nugget'],                   // графит — закалка, самородок — благородный металл
  plate: ['granite', 'mica'],                      // гранит — тяжёлая броня, слюда — лёгкие пластины
  arcane: ['quartz', 'fluorite', 'selenite', 'malachite'],
  trophy: ['selenite', 'malachite', 'fluorite', 'quartz', 'nugget', 'granite', 'mica', 'graphite'],
  bind: ['mica'],
};
const SHARES = { 1: [1], 2: [0.6, 0.4], 3: [0.45, 0.3, 0.25], 4: [0.35, 0.25, 0.25, 0.15] };
const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

const split = (role, t) => ({ deep: t >= 8 && DEEP[role] ? DEEP[role].filter((x) => Forge.sourceOf(x, t)) : [], base: (BASE[role] || []).filter((x) => Forge.sourceOf(x, t)) });
const combos = (slots) => { const out = []; const rec = (i, ch) => { if (i === slots.length) return out.push(ch.slice()); for (let k = 0; k < slots[i][2].length; k++) { ch.push(k); rec(i + 1, ch); ch.pop(); } }; rec(0, []); return out; };
const ok = (slots, total, tier, craft) => {
  for (const s of slots) { const c = s[2].map((o) => o[1] * P(o[0], tier)); if (Math.max(...c) - Math.min(...c) > ALT * total + 1e-9) return false; }
  for (const ch of combos(slots)) {
    let sum = 0; slots.forEach((s, i) => { sum += s[2][ch[i]][1] * P(s[2][ch[i]][0], tier); });
    const coins = total - sum;
    if (coins < Math.max(1, Math.ceil(MINCOIN * total))) return false;
    if (craft && coins / total > COINMAX + 1e-9) return false;
  }
  return true;
};
// Количества: вокруг цели перебор с минимальным отклонением
function solve(slots, total, tier, craft) {
  const flat = []; slots.forEach((sl) => sl[2].forEach((o) => { const base = Math.max(1, o[1]); flat.push({ o, target: o[1] * P(o[0], tier), cand: [...new Set([base - 1, base, base + 1, base + 2].filter((n) => n >= 1))] }); }));
  if (flat.length > 7) return null;
  let best = null;
  const rec = (i) => {
    if (i === flat.length) { if (ok(slots, total, tier, craft)) { const d = flat.reduce((a, f) => a + Math.abs(f.o[1] * P(f.o[0], tier) - f.target), 0); if (!best || d < best.d) best = { d, v: flat.map((f) => f.o[1]) }; } return; }
    for (const n of flat[i].cand) { flat[i].o[1] = n; rec(i + 1); }
  };
  rec(0);
  if (!best) return null;
  flat.forEach((f, i) => { f.o[1] = best.v[i]; });
  return slots;
}
// Построение рецепта: attempt 0 — с запасным видом в позиции скрепления, 1 — без запасных, 2 — только дешёвые виды
function build(it, t, total, nSlots, roles, attempt, craft) {
  const resValue = total * RESFRAC, rs = roles.slice(0, nSlots), used = [], slots = [];
  let rest = resValue;
  const tIdx = rs.indexOf('trophy'); let trophy = null;
  if (tIdx >= 0 && attempt < 2) {      // трофей — самое редкое: одна-две штуки могут занять до 55% бюджета ресурсов, остальное делится между прочими позициями
    const g = split('trophy', t), e = g.deep.concat(g.base).filter((x) => P(x, t) <= 0.55 * resValue && P(x, t) >= 0.1 * resValue);
    const grp = g.deep.filter((x) => e.includes(x)).length ? g.deep.filter((x) => e.includes(x)) : e;
    if (grp.length) { const k = grp[hash(it.id + 'trophy') % grp.length]; const n = Math.max(1, Math.round(0.25 * resValue / P(k, t))); trophy = [k, n]; used.push(k); rest -= n * P(k, t); }
  }
  const others = rs.filter((r, i) => i !== tIdx || !trophy), base = SHARES[others.length], sum = base.reduce((a, c) => a + c, 0);
  others.forEach((role, i) => {
    const g = split(role, t), share = base[i] / sum * rest;
    const lim = attempt === 2 ? 0.3 : 0.6, cheap = (x) => P(x, t) <= lim * share && !used.includes(x);
    const pick = (list, salt) => { const e = list.filter(cheap); return e.length ? e[hash(it.id + role + salt) % e.length] : null; };
    let k = (role === 'plate' && g.base.includes('scale') && !used.includes('scale') && P('scale', t) <= 1.3 * share && attempt < 2 ? 'scale' : null) || pick(g.deep, 'd') || pick(g.base, 'b');   // броня: чешуя, где хватает бюджета
    if (!k) k = g.deep.concat(g.base).filter((x) => !used.includes(x)).sort((a, b) => P(a, t) - P(b, t))[0];
    if (!k) return;
    used.push(k);
    const opts = [[k, Math.max(1, Math.round(share / P(k, t)))]];
    if (attempt === 0 && (role === 'bind' || role === 'leather' || role === 'wood')) {
      const k2 = pick(g.base, 'x');
      if (k2) { used.push(k2); opts.push([k2, Math.max(1, Math.round(opts[0][1] * P(k, t) / P(k2, t)))]); }
    }
    slots.push([role, 0, opts]);
  });
  if (trophy) slots.push(['trophy', 0, [trophy]]);
  return slots.length ? solve(slots, total, t, craft) : null;
}
const rolesOf = (it) => { const r = Forge.TYPE_ROLES[it.type].slice(); return it.rarity === 'epic' ? r.concat('trophy') : r; };

const out = { craft: {}, upgrade: {} };
let kept = 0, made = 0; const used = {};
for (const id of Object.keys(OLD.craft)) {
  const it = Gear.ITEMS.find((i) => i.id === id);
  const roles = rolesOf(it), nS = it.rarity === 'common' ? 2 : it.rarity === 'rare' ? 3 : 4;
  const craft = [0], up = [0];
  for (let t = 1; t <= 10; t++) {
    const total = Math.round(Gear.item({ id, tier: t }).price * SHARE[it.rarity] * (t === 1 ? K1 : 1));
    let rec = null;
    for (const ns of [nS, nS === 4 ? 3 : 2, 2, 1]) { for (const a of [0, 1, 2]) { const s = build(it, t, total, ns, roles.length >= ns ? roles : roles.concat('leather'), a, true); if (s) { rec = { total, slots: s }; break; } } if (rec) break; }
    if (!rec) { rec = OLD.craft[id][t]; rec.total = total; kept++; console.log('СТАРЫЙ рецепт', id, 'ц' + t); } else made++;
    craft.push(rec);
  }
  for (let t = 1; t <= 9; t++) {
    const e = Gear.makeEntry(id, t), old = Gear.upgradeCostLegacy(e);
    const total = old.res.reduce((s, r) => s + r.n * P(r.kind, t), 0) + old.coins;
    let rec = null;
    for (const a of [0, 1, 2]) { const s = build(it, t, total, 2, roles.slice(0, 2), a, false); if (s) { rec = { total, slots: s }; break; } }
    if (!rec) { rec = OLD.upgrade[id][t]; if (rec) rec.total = total; kept++; console.log('СТАРОЕ улучшение', id, t + '→' + (t + 1)); } else made++;
    up.push(rec);
  }
  up.push(null);
  out.craft[id] = craft; out.upgrade[id] = up;
  for (const r of craft.slice(1)) for (const s of r.slots) for (const o of s[2]) used[o[0]] = (used[o[0]] || 0) + 1;
}
fs.writeFileSync(FILE, src.slice(0, m.index) + 'const ForgeData = ' + JSON.stringify(out) + ';\n' + src.slice(m.index + m[0].length));
console.log('новых', made, 'оставлено старых', kept); console.log('использование ресурсов в рецептах Кузницы:', JSON.stringify(used));
const unused = Object.keys(Bestiary.RESOURCES).filter((k) => !used[k]); console.log('не нужны:', unused.join(', ') || 'нет');
