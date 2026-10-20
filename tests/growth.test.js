const assert = require('assert');
const G = require('../js/growth.js');
const st = { grow: {} }, sp = { id: 7, tier: 4 }, early = { id: 8, tier: 1 };
assert.strictEqual(G.steps(st, sp), 0);
for (let i = 1; i <= 12; i++) G.bump(st, sp);
assert.strictEqual(G.steps(st, sp), 9, 'не выше девяти шагов');
for (let i = 1; i <= 12; i++) G.bump(st, early);
assert.strictEqual(G.steps(st, early), 5, 'у стартовых зон — не выше пяти');
assert.ok(Math.abs(G.mul(9) - 1.315) < 1e-9 && G.mul(0) === 1);
assert.ok(G.xpMul(5) > 1.1);
G.reset(st, sp); assert.strictEqual(G.steps(st, sp), 0, 'убитое существо обнуляется');
for (const bad of [{ id: 1, tier: 5, boss: 'x' }, { id: 2, tier: 5, zone: 'z' }, { id: 3, tier: 5, guest: true }, { id: 4, tier: 5, rare: true }, { id: 5, tier: 5, castle: true }]) {
  assert.strictEqual(G.bump(st, bad), 0); assert.strictEqual(G.steps(st, bad), 0);
}
assert.strictEqual(G.bump(null, sp), 0);
console.log('growth: все тесты пройдены');
