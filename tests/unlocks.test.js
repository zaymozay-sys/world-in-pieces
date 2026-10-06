const assert = require('assert');
const Unlocks = require('../js/unlocks.js');
const Quests = require('../js/quests.js');

// здания открываются по победам
assert.strictEqual(Unlocks.isOpen({ wins: 0 }, 'tavern'), true, 'таверна всегда открыта');
assert.strictEqual(Unlocks.isOpen({ wins: 2 }, 'junker'), false);
assert.strictEqual(Unlocks.isOpen({ wins: 3 }, 'junker'), true);
assert.deepStrictEqual(Unlocks.openIds({ wins: 5 }).sort(), ['alchemist', 'junker', 'lighthouse']);
assert.ok(/откроется после 8 побед \(сейчас 2\)/.test(Unlocks.reason({ wins: 2 }, 'kennel')));

// строка цели
const g = (d) => Unlocks.goal(d, Quests.list(d));
assert.ok(/первое существо/.test(g({ wins: 0 })));
assert.ok(/Возьмите задание/.test(g({ wins: 1, bestiary: {}, seen: {} })));
const taken = { wins: 1, accepted: { 'first-blood': true }, bestiary: {}, seen: {}, quests: {} };
assert.ok(/Заберите награду за «Первая кровь»/.test(g(taken)), g(taken));
const act = { wins: 1, accepted: { amulet: true }, bestiary: {}, seen: {}, quests: { 'first-blood': true } };
assert.ok(/Задание «Оберег в дорогу»: 0 из 1/.test(g(act)), g(act));
console.log('unlocks: все тесты пройдены');
assert.ok(/Алхимик — варит/.test(Unlocks.hint('alchemist')));
console.log('unlocks: подсказки ок');
