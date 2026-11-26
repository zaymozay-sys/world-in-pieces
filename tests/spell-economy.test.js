/* Regression smoke tests for the opt-in spell economy simulator. */
const assert = require('assert');
const sim = require('../tools/sim.js');
const B = require('../js/balance.js');
B.unlockAll = true;
const options = { monster: 'bandit', tier: 3, level: 21, n: 20, aiLevel: 10, gear: () => sim.typicalGear(21), tune: { fullSpells: true } };
for (const kind of ['strike', 'mirror', 'sacrifice', 'fury', 'tide', 'temper', 'pierce', 'transmute']) {
  const r = sim.simulate({ ...options, player: () => sim.humanPlayer({ onlySpells: [kind] }) });
  assert.ok(r.bySpell[kind] > 0, kind + ': spell exercised');
  assert.ok(Object.keys(r.bySpell).every(k => k === kind), kind + ': only selected spell');
  assert.strictEqual(r.bySpell[kind], Math.round(r.spells * options.n), kind + ': metrics match');
}
const r = sim.simulate({ ...options, tune: { fullSpells: true, economic: true, burnLoot: { fire: 0, square: 1 } } });
assert.ok(Number.isFinite(r.win) && r.win >= 0 && r.win <= 1);
assert.strictEqual(Object.values(r.bySpell).reduce((a,b)=>a+b,0), Math.round(r.spells*options.n));
console.log('spell economy: extended spells, strategy isolation and metrics OK');
