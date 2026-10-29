// Тесты эликсиров (js/elixirs.js). Запуск: node tests/elixirs.test.js
const assert = require('assert');
const E = require('../js/elixirs.js');
assert.strictEqual(E.ORDER.length, 14);   // 2.0.7: + тоники дороги, скорости, хитрости, корм и «Стойкость»
assert.strictEqual(E.bonus(1, 'fury'), 19);   // 3,6 + добавка низких цветов 15 assert.strictEqual(E.bonus(10, 'health'), 0, 'Жизнь и Камни — мгновенные, без прибавки к характеристике');
assert.strictEqual(E.bonus(10, 'power'), 100); assert.strictEqual(E.bonus(10, 'block'), 16); assert.strictEqual(E.bonus(3, 'ricochet'), 5); assert.strictEqual(E.bonus(10, 'ricochet'), 9); assert.strictEqual(E.bonus(10, 'defense'), 23); assert.strictEqual(E.bonus(10, 'cunning'), 30);
// Лечение — цифрой ХП, кратной 10: 1-й цвет 30, 10-й 350, растёт с цветом
const H = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(E.heal);
assert.strictEqual(H[0], 30); assert.strictEqual(H[9], 350);
for (let t = 0; t < 10; t++) { assert.strictEqual(H[t] % 10, 0, 'кратно 10: ' + H[t]); if (t) assert.ok(H[t] > H[t - 1]); }
// Камни (1.8.0): 4 каждого вида на 1-м цвете, дальше не больше (чем выше цвет, тем дешевле заклинания героя — камни и так ценнее), от 2 до 4
const S = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(E.stonesGain);
assert.strictEqual(S[0], 4); assert.strictEqual(S[9], 2);
for (let t = 1; t < 10; t++) assert.ok(S[t] <= S[t - 1] && S[t] >= 2 && S[t] <= 4, `камни по цвету ${t + 1}: ${S[t]}`);
// Превращение: 5 камней на 1-м цвете, растёт медленно
assert.strictEqual(E.swapAmount(1), 5); assert.ok(E.swapAmount(10) > 5 && E.swapAmount(10) <= 9);
// 1.8.0: переносим не больше половины разницы (иначе самый частый вид опустел бы и стал самым редким)
assert.strictEqual(E.swapMove(1, 9, 2), 3); assert.strictEqual(E.swapMove(1, 30, 2), 5); assert.strictEqual(E.swapMove(1, 3, 0), 1);
assert.strictEqual(E.swapMove(1, 5, 4), 0); assert.strictEqual(E.swapMove(1, 4, 4), 0); assert.strictEqual(E.swapMove(10, 40, 0), 8);
assert.strictEqual(E.swapMove(1, 40, 0, 1.2), 6, 'улучшение Алхимика увеличивает потолок переноса');
for (const [hi, lo] of [[9, 2], [7, 6], [30, 1], [4, 0]]) { const n = E.swapMove(5, hi, lo); assert.ok(hi - n >= lo + n, 'после переноса самый частый вид не оказывается позади самого редкого'); }
assert.strictEqual(E.KINDS.swap.mode, 'instant'); assert.strictEqual(E.bonus(10, 'swap'), 0);
assert.ok(/до 5 камней/.test(E.describe('swap', 1)) && /больше всего/.test(E.describe('swap', 1)) && /половины разницы/.test(E.describe('swap', 1)));
assert.ok(/30 ХП/.test(E.describe('health', 1)) && /350 ХП/.test(E.describe('health', 10)));
assert.ok(/4 камня/.test(E.describe('stones', 1)) && /2 камня/.test(E.describe('stones', 10)));
// Инициативы среди эликсиров нет: она решает только первый ход, а эликсиры пьются уже в бою
assert.ok(!E.KINDS.initiative && E.KINDS.cunning, 'вместо Инициативы — Хитрость');
// Каждому виду есть цена и карточка; алхимик: прибавка на 5% за уровень улучшения
assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(E.price), [6, 16, 43, 120, 300, 740, 1800, 6400, 14000, 36000].map((x) => Math.max(1, Math.round(x * require("../js/balance.js").rewards.coinK))));
for (let i = 2; i <= 10; i++) assert.ok(E.price(i) > E.price(i - 1));
for (const k of E.ORDER) assert.strictEqual(E.price(5, k), E.price(5), 'цена не зависит от вида: ' + k);
for (const k of E.ORDER) { assert.ok(E.KINDS[k].name && E.describe(k, 3), 'описание: ' + k); assert.ok(['turn', 'long', 'instant', 'pet'].includes(E.KINDS[k].mode)); }
// Сила — до конца хода (1), остальные длинные виды — 10 своих ходов, мгновенные не «пьются» через drink()
assert.strictEqual(E.turns('power'), 1); assert.strictEqual(E.turns('defense'), 10); assert.strictEqual(E.turns('health'), 0); assert.strictEqual(E.turns('swap'), 0);
const a = {};
assert.ok(E.drink(a, 'power', 3)); assert.strictEqual(a.power.left, 1);
assert.ok(!E.drink(a, 'power', 2), 'слабее действующего — нельзя');
assert.ok(E.drink(a, 'power', 5)); assert.strictEqual(a.power.left, 1);
assert.deepStrictEqual(E.bonusStats(a), {}); assert.strictEqual(E.activePct(a), 50, 'эликсир силы 5-го цвета: +50% к суммарной Силе'); assert.strictEqual(E.powerPct(1), 10);
assert.ok(!E.drink(a, 'health', 5) && !E.drink(a, 'stones', 5) && !E.drink(a, 'swap', 5), 'мгновенные эликсиры действуют сразу, в списке действующих их нет');
assert.ok(E.drink(a, 'fury', 10)); assert.strictEqual(a.fury.left, 10);
for (const k of ['power', 'fury', 'cunning', 'defense', 'block', 'ricochet']) for (let t = 2; t <= 10; t++) assert.ok(E.bonus(t, k) >= E.bonus(t - 1, k), 'прибавка не падает с цветом: ' + k + t);
assert.strictEqual(E.bonusStats(a).fury, 36); assert.strictEqual(E.bonusStats(a).power, 5, 'Великий: вторая характеристика на пятую часть силы');
E.tick(a);
assert.ok(!a.power, 'Сила кончилась вместе с ходом'); assert.strictEqual(a.fury.left, 9);
for (let i = 0; i < 9; i++) E.tick(a);
assert.deepStrictEqual(E.bonusStats(a), {}, 'срок вышел — бонуса нет');
console.log('elixirs: все тесты пройдены');

// 2.0.7: новые эликсиры (тоники, корм, «Стойкость»)
{
  const A = require('assert'), E = require('../js/elixirs.js'), Combat = require('../js/combat.js');
  for (const k of ['road', 'speed', 'wit', 'food', 'endure']) A.ok(E.KINDS[k] && E.describe(k, 3), k);
  A.ok(E.KINDS.endure.noBrew && !E.KINDS.wit.noBrew, 'Стойкость не варится');
  const act = {}; A.ok(E.drink(act, 'wit', 4) && act.wit.left === 10, 'тоник хитрости — 10 ходов');
  A.ok(E.bonusStats(act).cunning > 0 && E.bonusStats({ speed: { tier: 6, left: 5 } }).initiative > 0, 'бонусы тоников');
  A.strictEqual(E.drink({}, 'endure', 1), false, 'Стойкость действует через флаг бойца');
  A.ok(E.FOOD_MULT(10) > E.FOOD_MULT(1));
  const f = { hp: 10, max: 100, endure: true, stats: {} };
  A.strictEqual(Combat.loseHp(f, 50), true); A.strictEqual(f.hp, 1, 'Стойкость оставляет 1 ХП'); A.strictEqual(f.endure, false);
  Combat.loseHp(f, 50); A.strictEqual(f.hp, 0, 'второй смертельный удар убивает');
}
