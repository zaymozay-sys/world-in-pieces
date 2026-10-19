const assert = require('assert');
const R = require('../js/rarehunt.js');
const D = R.DAY, base = 20000 * D;                 // 20000-й день: начало цикла (20000 = 7 × 2857 + 1)
const w0 = R.at(base - ((20000 % 7) * D), 0);      // день 0 цикла
assert.ok(w0.active && w0.endsAt - (base - (20000 % 7) * D) === R.STAY * D);
const startOfCycle = w0.endsAt - R.STAY * D;
assert.ok(R.at(startOfCycle + 2.9 * D, 0).active && !R.at(startOfCycle + 3.1 * D, 0).active, 'три дня зверь на карте, потом ушёл');
assert.strictEqual(R.at(startOfCycle + 6.5 * D, 0).cycle, w0.cycle); assert.strictEqual(R.at(startOfCycle + 7.1 * D, 0).cycle, w0.cycle + 1);
assert.notStrictEqual(R.at(startOfCycle, 0).species, R.at(startOfCycle + 7 * D, 0).species, 'на следующей неделе другой зверь');
assert.ok(R.SPECIES.includes(w0.species));
assert.strictEqual(R.at(startOfCycle, 0).nextAt - startOfCycle, 7 * D);
const tz = R.at(startOfCycle - 180 * 60000, -180); assert.ok(tz.cycle === w0.cycle || tz.cycle === w0.cycle - 1);
const cands = [3, 8, 15, 22, 40, 41];
assert.strictEqual(R.pick(cands, 123, 5), R.pick(cands, 123, 5)); assert.ok(cands.includes(R.pick(cands, 123, 5)));
assert.strictEqual(R.pick([], 1, 1), null);
const seen = new Set(); for (let c = 0; c < 40; c++) seen.add(R.pick(cands, 123, c)); assert.ok(seen.size >= 3, 'клетка меняется от недели к неделе');
const d = {}; assert.strictEqual(R.trophy(d, 'griffin'), 1); assert.strictEqual(R.trophy(d, 'griffin'), 2); R.trophy(d, 'mimic');
assert.strictEqual(R.trophyCount(d), 3); assert.strictEqual(R.trophyCount({ trophies: [1] }), 1 * 0 + R.trophyCount({ trophies: [1] }));
assert.strictEqual(R.trophyCount({}), 0); assert.strictEqual(R.reward(100).coins, 300);
console.log('rarehunt: все тесты пройдены');
