// Тесты эликсиров (js/elixirs.js). Запуск: node tests/elixirs.test.js
const assert = require('assert');
const E = require('../js/elixirs.js');
assert.strictEqual(E.ORDER.length, 7);
assert.strictEqual(E.bonus(1), 3); assert.strictEqual(E.bonus(10), 30);
assert.strictEqual(E.bonus(10, 'power'), 30); assert.strictEqual(E.bonus(10, 'block'), 20); assert.strictEqual(E.bonus(3, 'ricochet'), 6, 'защитные виды +2 за цвет');
assert.deepStrictEqual([1, 3, 4, 6, 7, 10].map(E.battles), [3, 3, 5, 5, 8, 8]);
const a = {};
assert.ok(E.drink(a, 'power', 3)); assert.strictEqual(a.power.left, 3);
assert.ok(!E.drink(a, 'power', 2), 'слабее действующего — нельзя');
assert.ok(E.drink(a, 'power', 5)); assert.strictEqual(a.power.left, 5);
assert.deepStrictEqual(E.bonusStats(a), { power: 15 });
E.drink(a, 'fury', 10);
assert.strictEqual(E.bonusStats(a).fury, 30); assert.strictEqual(E.bonusStats(a).power, 30);
for (let i = 0; i < 8; i++) E.tick(a);
assert.deepStrictEqual(E.bonusStats(a), {}, 'срок вышел — бонуса нет');
console.log('elixirs: все тесты пройдены');
