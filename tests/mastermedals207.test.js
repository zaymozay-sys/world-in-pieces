// 2.0.7: мастерские серии медалей (Кузнец, Глубина, Огранщик, Рунописец)
const assert = require('assert');
global.window = undefined;
global.Tiers = require('./../js/tiers.js'); global.Gear = require('../js/items.js');
const Medals = require('../js/medals.js');
for (const k of Medals.MASTER_ORDER) {
  const M = Medals.MASTER[k];
  assert.strictEqual(M.ms.length, 10, k + ': 10 вех'); assert.ok(M.ms.every((n, i) => i === 0 || n > M.ms[i - 1]), k + ': пороги растут');
  assert.deepStrictEqual(Medals.checkMaster(k, 0, []), []);
  const first = Medals.checkMaster(k, M.ms[2], []); assert.strictEqual(first.length, 3, 'сразу все достигнутые пороги');
  const all = M.ms.map((n) => ({ id: Medals.masterMedalId(k, n), tier: 1 }));
  assert.ok(Medals.masterDone(k, all) && !Medals.masterDone(k, all.slice(1)));
  for (let i = 0; i < 10; i++) {
    const id = Medals.masterMedalId(k, M.ms[i]), b = Medals.bonusFor(id); assert.ok(Object.keys(b).length && Object.values(b).every((v) => v >= 1), k + ' бонус ' + i);
    assert.ok(Medals.nameFor(id) !== id); assert.strictEqual(Medals.tierUnlockLevel(id), 1 + i * 10);
  }
  const base = Medals.bonusStats([]), full = Medals.bonusStats(all);
  assert.ok(Object.keys(full).some((s) => full[s] > base[s]), k + ': бонус растёт');
}
assert.strictEqual(Medals.masterOf('m:craft:999'), null); assert.strictEqual(Medals.masterOf('drunk:50'), null);
console.log('mastermedals207: все тесты пройдены');
