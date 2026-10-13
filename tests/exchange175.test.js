// 1.7.5: обмен ресурсов между цветами и «где добыть».
const assert = require('assert');
global.Tiers = require('../js/tiers.js');
const B = require('../js/bestiary.js');
const up = B.exchangePlan('hide', 2, 'up'), dn = B.exchangePlan('hide', 2, 'down');
assert.deepStrictEqual([up.take, up.give, up.to], [3, 1, 3]);
assert.deepStrictEqual([dn.take, dn.give, dn.to], [1, 2, 1]);
assert.strictEqual(B.exchangePlan('hide', 1, 'down'), null, 'ниже первого цвета нельзя');
assert.strictEqual(B.exchangePlan('hide', Tiers.MAX, 'up'), null, 'выше последнего цвета нельзя');
assert.strictEqual(B.exchangePlan('нет', 2, 'up'), null);
// круг обмена не даёт прибыли: вверх 3→1, вниз 1→2 — теряем; вниз 1→2, вверх 3→1 — теряем
assert.ok(up.give * dn.give < up.take * dn.take, 'обмен туда-обратно невыгоден');
for (const k of Object.keys(B.RESOURCES)) assert.ok(B.sourcesOf(k).length > 0, 'у ресурса есть источник: ' + k);
assert.ok(B.sourcesOf('hide').every((id) => B.MONSTERS[id].drops.some((d) => d[0] === 'hide')));
console.log('exchange175: все тесты пройдены');
