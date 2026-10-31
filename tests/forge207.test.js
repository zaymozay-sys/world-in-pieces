// 2.0.7: этап B+C — Forge.plan, таблица рецептов, новые ресурсы и существа, призы. Запуск: node tests/forge207.test.js
const assert = require('assert'), fs = require('fs');
global.window = undefined;
const Gear = require('../js/items.js'), Forge = require('../js/forge.js'), Bestiary = require('../js/bestiary.js'), HexMap = require('../js/hexmap.js'), D = require('../js/forge-data.js');
const P = (k, t) => Bestiary.resPrice(k, t), SHARE = { common: 0.5, rare: 0.4, epic: 0.4 };
const COINMAX = 0.40, ALTCAP = 0.05, K1 = 0.84;
let recipes = 0, combos = 0, worstCoin = 0;
function eachCombo(slots, fn) { const rec = (i, ch) => { if (i === slots.length) return fn(ch); for (let k = 0; k < slots[i][2].length; k++) { ch.push(k); rec(i + 1, ch); ch.pop(); } }; rec(0, []); }
// --- изготовление: каждый предмет × цвет × каждая комбинация выбора ---
for (const [id, byTier] of Object.entries(D.craft)) {
  const base = Gear.ITEMS.find((i) => i.id === id); assert.ok(base && !base.relic && base.rarity !== 'legendary', id);
  for (let t = 1; t <= 10; t++) {
    const rec = byTier[t]; assert.ok(rec && rec.slots.length >= 1, id + ' ц' + t); recipes++;
    const price = Gear.item({ id, tier: t }).price;
    assert.strictEqual(rec.total, Math.round(price * SHARE[base.rarity] * (t === 1 ? K1 : 1)), `${id} ц${t}: бюджет`);
    for (const s of rec.slots) {
      const costs = s[2].map((o) => o[1] * P(o[0], t));
      assert.ok(Math.max(...costs) - Math.min(...costs) <= ALTCAP * rec.total + 1e-9, `${id} ц${t}: варианты позиции разнятся больше 5%`);
      assert.strictEqual(new Set(s[2].map((o) => o[0])).size, s[2].length, 'варианты позиции различны');
      for (const o of s[2]) { assert.ok(Bestiary.RESOURCES[o[0]] && Number.isInteger(o[1]) && o[1] >= 1); assert.ok(Forge.sourceOf(o[0], t), `${id} ц${t}: ${o[0]} без источника на цвете`); }
    }
    eachCombo(rec.slots, (ch) => {
      combos++;
      const p = Forge.plan({ mode: 'craft', itemId: id, tier: t }, ch);
      assert.ok(p.ok, `${id} ц${t} [${ch}]: ${p.err}`);
      assert.strictEqual(p.res.reduce((s, r) => s + r.n * P(r.kind, t), 0) + p.coins, p.total, 'полная стоимость = бюджет');
      assert.ok(p.coins >= Math.max(1, Math.ceil(0.05 * p.total)), 'минимум монет');
      if (!(id === 'scale-belt' && t === 1)) worstCoin = Math.max(worstCoin, p.coins / p.total);   // единственное исключение: крошечный рецепт (бюджет 25 м), монеты 52%
      else assert.ok(p.coins / p.total <= 0.55);
      assert.strictEqual(new Set(p.res.map((r) => r.kind)).size, p.res.length, 'строки расхода различны');
    });
  }
}
assert.strictEqual(recipes, 1650); assert.ok(combos >= 1700, 'комбинаций ' + combos);
assert.ok(worstCoin <= COINMAX + 1e-9, 'доля монет в худшей комбинации ' + worstCoin.toFixed(2));
// --- улучшение: бюджет = стоимость 2.0.5 (материалы + монеты), та же функция plan ---
let ups = 0;
for (const [id, byTier] of Object.entries(D.upgrade)) for (let t = 1; t <= 9; t++) {
  const rec = byTier[t]; if (!rec) continue; ups++;
  const e = Gear.makeEntry(id, t), old = Gear.upgradeCostLegacy(e);
  assert.strictEqual(rec.total, old.res.reduce((s, r) => s + r.n * P(r.kind, t), 0) + old.coins, `${id} ${t}→${t + 1}: бюджет улучшения`);
  assert.ok(rec.slots.length <= 2 && rec.slots.every((s) => s[2].length <= 2));
  eachCombo(rec.slots, (ch) => { const p = Forge.plan({ mode: 'upgrade', entry: e }, ch); assert.ok(p.ok, `${id} ${t}: ${p.err}`); assert.strictEqual(p.spent, p.total); });
  assert.deepStrictEqual(Gear.upgradeCost(e).total, rec.total);
}
assert.strictEqual(ups, 1485);
// --- проверка входа: клиент передаёт только индексы ---
const ref = { mode: 'craft', itemId: 'guard-chest', tier: 3 };
for (const bad of [[9, 0], [-1, 0], [0.5, 0], ['0', 0], [NaN, 0], [null, 0], [0], [0, 0, 0], 'x', {}]) assert.strictEqual(Forge.plan(ref, bad).ok, false, JSON.stringify(bad));
assert.strictEqual(Forge.plan({ mode: 'craft', itemId: 'nope', tier: 3 }).ok, false);
assert.strictEqual(Forge.plan(ref).ok, true, 'по умолчанию — первый вариант');
assert.deepStrictEqual(Forge.plan(ref, undefined).choice, Forge.plan(ref, Forge.autopick(ref)).choice);
// autopick берёт тот вариант, который игрок может оплатить
{ const two = Object.entries(D.craft).find(([, b]) => b[5] && b[5].slots.some((s) => s[2].length > 1)); const r = { mode: 'craft', itemId: two[0], tier: 5 };
  const slot = two[1][5].slots.findIndex((s) => s[2].length > 1), alt = two[1][5].slots[slot][2][1];
  const ch = Forge.autopick(r, (k) => (k === alt[0] ? 999 : 0)); assert.strictEqual(ch[slot], 1); }
// --- роли и материалы (ТЗ §2.1) ---
for (const [id, byTier] of Object.entries(D.craft)) for (let t = 1; t <= 10; t++) for (const s of byTier[t].slots) for (const o of s[2]) {
  const roles = s[0].split('+');
  if (o[0] === 'horn') { assert.ok(t <= 7, `рог на цвете ${t}`); if (roles.includes('wood')) assert.strictEqual(id, 'grove-bow', 'рог в wood — только составной лук'); }
  if (o[0] === 'feather' && roles.includes('bind')) assert.ok(/grove-bow|crossbow-hunt|crossbow-repeater|crown-head|grove-head|mage-head|wand-head|crown-amulet|mage-amulet/.test(id), `перо в bind у ${id}`);
  if (o[0] === 'resin') assert.ok(t <= 6, 'смола на ц' + t);
  if (['scale', 'essence'].includes(o[0])) assert.ok(roles.includes('trophy') || roles.includes('arcane') || roles.includes('plate'), `${o[0]} в ${s[0]}`);
}
// --- новые ресурсы и существа ---
for (const [k, base] of [['resin', 14], ['horn', 18], ['chitin', 16]]) assert.strictEqual(Bestiary.RESOURCES[k].base, base);
for (const id of ['pinestump', 'ramtur', 'beetle', 'mantis']) {
  const m = Bestiary.MONSTERS[id]; assert.ok(m && m.name && m.family && m.desc && m.drops.length && m.hp > 0 && HexMap.SPAWN[id], id);
  assert.ok(require('../js/balance.js').danger.offset[id] !== undefined, 'смещение опасности ' + id);
}
assert.strictEqual(Bestiary.MONSTERS.beetle.name, 'Жук-точильщик');
assert.ok(Bestiary.MONSTERS.beetle.drops.some((d) => d[0] === 'hide') && !Bestiary.MONSTERS.beetle.drops.some((d) => d[0] === 'bone'), 'жук даёт шкуру, не кость');
// старые трофеи не падают ниже 0,89 за бой там, где были выше, и не ниже 0,80 прежнего шанса
const OLD = { forestling: [['splinter', 0.8, 1, 2], ['bone', 0.4, 1, 1]], treant: [['splinter', 0.9, 2, 4], ['essence', 0.3, 1, 1]], mushroom: [['splinter', 0.6, 1, 2], ['essence', 0.4, 1, 2]], goat: [['hide', 0.8, 1, 2], ['bone', 0.5, 1, 2]], ogre: [['hide', 0.9, 2, 3], ['bone', 0.6, 1, 2], ['ore', 0.5, 1, 2]], ironscarab: [['ore', 0.8, 1, 2], ['scrap', 0.6, 1, 2]], carapace: [['shell', 0.8, 1, 2], ['scale', 0.4, 1, 2]], hermit: [['shell', 0.8, 1, 2], ['scrap', 0.3, 1, 1]], crab: [['hide', 0.6, 1, 2], ['bone', 0.5, 1, 2]] };
for (const [id, old] of Object.entries(OLD)) for (const d of old) {
  const nw = Bestiary.MONSTERS[id].drops.find((x) => x[0] === d[0]), y0 = d[1] * (d[2] + d[3]) / 2, y1 = nw[1] * (nw[2] + nw[3]) / 2;
  assert.ok(nw[1] >= d[1] * 0.8 - 1e-9, `${id}/${d[0]}: шанс упал больше чем до 0,80`);
  if (y0 >= Forge.MINYIELD) assert.ok(y1 >= Forge.MINYIELD, `${id}/${d[0]}: добыча ${y1.toFixed(2)} ниже MINYIELD`);
}
// --- призы: лотерея и разведка питомца берут вид из замороженного списка всех 16 видов (смола, рог, хитин — в конце) ---
assert.ok(Object.isFrozen(Bestiary.PRIZE_RESOURCES));
assert.deepStrictEqual(Bestiary.PRIZE_RESOURCES, Object.keys(Bestiary.RESOURCES).filter((k) => !Bestiary.DEEP_RESOURCES.includes(k)), 'список призов = все виды, прежние 13 — в прежнем порядке');
assert.deepStrictEqual(Bestiary.PRIZE_RESOURCES.slice(0, 13), ['hide', 'fang', 'bone', 'scrap', 'ore', 'crystal', 'essence', 'scale', 'splinter', 'honey', 'silk', 'feather', 'shell']);
for (const f of ['daily.js', 'pets.js']) { const src = fs.readFileSync(__dirname + '/../js/' + f, 'utf8'); assert.ok(/PRIZE_RESOURCES/.test(src), f); }
// --- карта: версия поднята ---
assert.ok(/const MAP_VER = 8;/.test(fs.readFileSync(__dirname + '/../js/mapview.js', 'utf8')));
console.log(`forge207: все тесты пройдены (${recipes} рецептов, ${combos} комбинаций, ${ups} улучшений; худшая доля монет ${(worstCoin * 100).toFixed(0)}%)`);
