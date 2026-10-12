// Тесты эликсиров (js/elixirs.js). Запуск: node tests/elixirs.test.js
const assert = require('assert');
const E = require('../js/elixirs.js');
assert.strictEqual(E.ORDER.length, 9);
assert.strictEqual(E.bonus(1, 'fury'), 4); assert.strictEqual(E.bonus(10, 'health'), 0, 'Жизнь и Камни — мгновенные, без прибавки к характеристике');
assert.strictEqual(E.bonus(10, 'power'), 140); assert.strictEqual(E.bonus(10, 'block'), 20); assert.strictEqual(E.bonus(3, 'ricochet'), 3); assert.strictEqual(E.bonus(10, 'ricochet'), 11);
// Лечение — цифрой ХП, кратной 10: 1-й цвет 30, 10-й 350, растёт с цветом
const H = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(E.heal);
assert.strictEqual(H[0], 30); assert.strictEqual(H[9], 350);
for (let t = 0; t < 10; t++) { assert.strictEqual(H[t] % 10, 0, 'кратно 10: ' + H[t]); if (t) assert.ok(H[t] > H[t - 1]); }
// Камни: 3 каждого вида на 1-м цвете, 8 на 10-м, шаг за цвет 0–1 (не больше одного заклинания «сверху»)
const S = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(E.stonesGain);
assert.strictEqual(S[0], 3); assert.strictEqual(S[9], 8);
for (let t = 1; t < 10; t++) { const d = S[t] - S[t - 1]; assert.ok(d >= 0 && d <= 1, `прирост камней за цвет ${t + 1}: ${d}`); }
// Превращение: 5 камней на 1-м цвете, растёт медленно
assert.strictEqual(E.swapAmount(1), 5); assert.ok(E.swapAmount(10) > 5 && E.swapAmount(10) <= 9);
assert.strictEqual(E.KINDS.swap.mode, 'instant'); assert.strictEqual(E.bonus(10, 'swap'), 0);
assert.ok(/5 камней/.test(E.describe('swap', 1)) && /больше всего/.test(E.describe('swap', 1)));
assert.ok(/30 ХП/.test(E.describe('health', 1)) && /350 ХП/.test(E.describe('health', 10)));
assert.ok(/3 камня/.test(E.describe('stones', 1)) && /8 камней/.test(E.describe('stones', 10)));
// Инициативы среди эликсиров нет: она решает только первый ход, а эликсиры пьются уже в бою
assert.ok(!E.KINDS.initiative && E.KINDS.cunning, 'вместо Инициативы — Хитрость');
// Каждому виду есть цена и карточка; алхимик: прибавка на 5% за уровень улучшения
assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(E.price), [6, 16, 43, 120, 300, 740, 1800, 6400, 14000, 36000].map((x) => Math.max(1, Math.round(x * require("../js/balance.js").rewards.coinK))));
for (let i = 2; i <= 10; i++) assert.ok(E.price(i) > E.price(i - 1));
for (const k of E.ORDER) assert.strictEqual(E.price(5, k), E.price(5), 'цена не зависит от вида: ' + k);
for (const k of E.ORDER) { assert.ok(E.KINDS[k].name && E.describe(k, 3), 'описание: ' + k); assert.ok(['turn', 'long', 'instant'].includes(E.KINDS[k].mode)); }
// Сила — до конца хода (1), остальные длинные виды — 10 своих ходов, мгновенные не «пьются» через drink()
assert.strictEqual(E.turns('power'), 1); assert.strictEqual(E.turns('defense'), 10); assert.strictEqual(E.turns('health'), 0); assert.strictEqual(E.turns('swap'), 0);
const a = {};
assert.ok(E.drink(a, 'power', 3)); assert.strictEqual(a.power.left, 1);
assert.ok(!E.drink(a, 'power', 2), 'слабее действующего — нельзя');
assert.ok(E.drink(a, 'power', 5)); assert.strictEqual(a.power.left, 1);
assert.deepStrictEqual(E.bonusStats(a), { power: 70 });
assert.ok(!E.drink(a, 'health', 5) && !E.drink(a, 'stones', 5) && !E.drink(a, 'swap', 5), 'мгновенные эликсиры действуют сразу, в списке действующих их нет');
assert.ok(E.drink(a, 'fury', 10)); assert.strictEqual(a.fury.left, 10);
assert.strictEqual(E.bonusStats(a).fury, 40); assert.strictEqual(E.bonusStats(a).power, 70 + 20);
E.tick(a);
assert.ok(!a.power, 'Сила кончилась вместе с ходом'); assert.strictEqual(a.fury.left, 9);
for (let i = 0; i < 9; i++) E.tick(a);
assert.deepStrictEqual(E.bonusStats(a), {}, 'срок вышел — бонуса нет');
console.log('elixirs: все тесты пройдены');
