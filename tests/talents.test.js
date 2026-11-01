// Тесты талантов (talents.js): очки, ступени, бонус, сброс, чистка сохранения.
const assert = require('assert');
global.Balance = require('../js/balance.js'); global.Hero = require('../js/hero.js');
const T = require('../js/talents.js');
assert.strictEqual(T.pointsFor(4), 0); assert.strictEqual(T.pointsFor(5), 1); assert.strictEqual(T.pointsFor(95), 19);
let t = {}; assert.ok(!T.canAdd(t, 4, 'power'), 'до 5-го уровня очков нет');
t = T.add(t, 5, 'power'); assert.strictEqual(t.power, 1); assert.ok(!T.canAdd(t, 5, 'fury'), 'очко одно');
for (let i = 0; i < 20; i++) t = T.add(t, 95, 'power'); assert.strictEqual(t.power, T.RANK_MAX, 'не больше ступеней, чем положено');
assert.deepStrictEqual(T.bonus({ power: 2, health: 1 }), { power: 2 * Balance.talents.per.power, health: Balance.talents.per.health });
assert.deepStrictEqual(T.clean({ power: 99, nothing: 5, fury: 2 }, 10), { power: 2 }, 'чистка: лишнее и неизвестное убирается');
assert.ok(T.respecCost(30) > T.respecCost(1), 'сброс дорожает с уровнем');
for (const id of T.IDS) assert.ok(Balance.talents.per[id] > 0 && T.NAMES[id], id);
console.log('talents: все тесты пройдены');
