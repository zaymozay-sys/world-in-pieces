/* 2.0.9: дописывает рецепты Кузницы (js/forge-data.js) для вещей, которых в таблице ещё нет.
   Берёт «образец» — вещь того же типа и класса редкости, копирует роли и виды материалов, пересчитывает бюджет
   (по тем же правилам, что проверяет tests/forge207.test.js) и подбирает количества так, чтобы любая комбинация
   выбора проходила проверки: варианты позиции в пределах 5% бюджета, монет не меньше 5% и не больше 40%.
   Запуск: node tools/forge-fill.js [id …]   (без аргументов — все вещи без рецепта)  */
const fs = require('fs'), path = require('path');
global.window = undefined;
const Gear = global.Gear = require('../js/items.js'); require('../js/forge.js');
const Bestiary = require('../js/bestiary.js');
const FILE = path.join(__dirname, '..', 'js', 'forge-data.js');
const src = fs.readFileSync(FILE, 'utf8'), m = src.match(/const ForgeData = (.*?);\s*\n/);
const D = JSON.parse(m[1]);
const P = (k, t) => Bestiary.resPrice(k, t), SHARE = { common: 0.5, rare: 0.4, epic: 0.4 }, K1 = 0.84, ALT = 0.05, COINMAX = 0.40, MINCOIN = 0.05;
const want = process.argv.slice(2);
const todo = Gear.ITEMS.filter((i) => !D.craft[i.id] && (!want.length || want.includes(i.id)));
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
// подбор количеств: для каждого варианта кандидаты вокруг цели, перебор с отбором по сумме отклонений
function fit(tpl, total, tier, craft) {
  const s = total / tpl.total;
  const slots = tpl.slots.map((sl) => [sl[0], sl[1], sl[2].map((o) => [o[0], o[1]])]);
  const flat = []; slots.forEach((sl) => sl[2].forEach((o) => { const target = o[1] * P(o[0], tier) * s, base = Math.max(1, Math.round(target / P(o[0], tier))); flat.push({ o, target, cand: [...new Set([base - 1, base, base + 1, base + 2].filter((n) => n >= 1))] }); }));
  let best = null;
  const rec = (i) => {
    if (i === flat.length) { if (ok(slots, total, tier, craft)) { const d = flat.reduce((a, f) => a + Math.abs(f.o[1] * P(f.o[0], tier) - f.target), 0); if (!best || d < best.d) best = { d, v: flat.map((f) => f.o[1]) }; } return; }
    for (const n of flat[i].cand) { flat[i].o[1] = n; rec(i + 1); }
  };
  if (flat.length <= 7) rec(0); else return null;
  if (!best) return null;
  flat.forEach((f, i) => { f.o[1] = best.v[i]; });
  const out = { total, slots }; if (tpl.min) out.min = Math.round(tpl.min * s);
  return out;
}
let failed = 0;
for (const X of todo) {
  const cands = Object.keys(D.craft).map((k) => Gear.ITEMS.find((i) => i.id === k)).filter((c) => c && c.type === X.type && D.upgrade[c.id]);
  cands.sort((a, b) => (((a.rarity === 'common') === (X.rarity === 'common')) ? 0 : 1) - (((b.rarity === 'common') === (X.rarity === 'common')) ? 0 : 1) || Math.abs(a.cost - X.cost) - Math.abs(b.cost - X.cost));
  let done = false;
  for (const T of cands.slice(0, 12)) {
    const craft = [0], up = [0];
    let good = true;
    for (let t = 1; t <= 10 && good; t++) {
      const total = Math.round(Gear.item({ id: X.id, tier: t }).price * SHARE[X.rarity] * (t === 1 ? K1 : 1));
      const r = fit(D.craft[T.id][t], total, t, true); if (!r) good = false; else craft.push(r);
    }
    for (let t = 1; t <= 9 && good; t++) {
      const e = Gear.makeEntry(X.id, t), old = Gear.upgradeCostLegacy(e);
      const total = old.res.reduce((s, r) => s + r.n * P(r.kind, t), 0) + old.coins;
      const tp = D.upgrade[T.id][t]; if (!tp) { up.push(null); continue; }
      const r = fit(tp, total, t, false); if (!r) good = false; else up.push(r);
    }
    if (good) { up.push(null); D.craft[X.id] = craft; D.upgrade[X.id] = up; console.log('ok  ', X.id, '<-', T.id); done = true; break; }
  }
  if (!done) { failed++; console.log('FAIL', X.id); }
}
fs.writeFileSync(FILE, src.slice(0, m.index) + 'const ForgeData = ' + JSON.stringify(D) + ';\n' + src.slice(m.index + m[0].length));
console.log(failed ? 'не удалось: ' + failed : 'готово: ' + todo.length);
