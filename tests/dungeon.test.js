const assert = require('assert');
global._t = (s, a) => (a ? s.replace(/\{(\d+)\}/g, (_, i) => a[i]) : s);
const D = require('../js/dungeon.js');
const HexMap = require('../js/hexmap.js');
assert.ok(D.eliteShare(1) > 0.15 && D.eliteShare(1) < D.eliteShare(5) && D.eliteShare(500) === 0.6, 'доля элитных растёт до потолка');
assert.deepStrictEqual(D.reward(1), { coins: 150, res: [], cons: {}, egg: false, chest: false });
const r5 = D.reward(5); assert.ok(r5.chest && r5.coins === 750 && r5.res.length === 2 && r5.cons.elixir === 1 && !r5.cons.scroll && !r5.egg);
const r10 = D.reward(10); assert.ok(r10.cons.scroll === 1 && r10.cons.elixir === 2 && r10.res[0][1] === 4);
assert.ok(D.reward(25).egg && !D.reward(20).egg && !D.reward(5).egg, 'яйцо — каждый 25-й');
assert.ok(D.reward(30).coins > D.reward(29).coins, 'награда растёт');
assert.strictEqual(D.levelText(3), 'Уровень подземелья 3');
// элитные существа: хотя бы один с 3-го уровня
global.hash = undefined;
let World; try { World = require('../js/world.js'); } catch (e) { World = null; }
if (World && World.pickElites) {
  for (let f = 3; f <= 40; f++) { const m = HexMap.generate(123, 'tower', f); const el = World.pickElites(m, D.eliteShare(f), true); assert.ok(el.size >= 1, 'элитный есть: ' + f); for (const id of el.keys()) assert.ok(!m.spawns[id].guard, 'страж не элитный'); }
}
// 1.9.4: Хранитель глубин — каждый 10-й этаж, свой зверь и приём; 5-й этаж остаётся обычным стражем
for (const f of [5, 15]) { const g = HexMap.generate(7, 'tower', f).spawns.find((x) => x.guard); assert.ok(g && !g.deep && !g.trait, 'обычный страж: ' + f); }
const seen = new Set();
for (const f of [10, 20, 30, 40, 50]) { const g = HexMap.generate(7, 'tower', f).spawns.find((x) => x.guard); assert.ok(g && g.deep && ['ward', 'toxin', 'stun'].includes(g.trait), 'хранитель: ' + f); seen.add(g.species + g.trait); }
assert.ok(seen.size >= 4, 'хранители разные');
const d1 = D.deepReward(10), d2 = D.deepReward(30);
assert.ok(d2.coins > d1.coins && d2.res[0][1] > d1.res[0][1] && d1.cons.scroll === 0 && d2.cons.scroll === 1, 'награда хранителя растёт');
console.log('dungeon: все тесты пройдены');
