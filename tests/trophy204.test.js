const assert = require('assert');
global.Growth = require('../js/growth.js');
const Trophy = require('../js/trophy.js');
// сколько забирается: от 1 до 10 по цвету существа
assert.strictEqual(Trophy.count(1), 1); assert.strictEqual(Trophy.count(7), 7); assert.strictEqual(Trophy.count(10), 10); assert.strictEqual(Trophy.count(15), 10); assert.strictEqual(Trophy.count(0), 1);
// сумка героя: лишнее (рикошет, ярость, камни) существо не берёт
const bag = { 'power:3': 2, 'power:8': 1, 'defense:9': 2, 'block:5': 3, 'health:10': 1, 'health:2': 4, 'ricochet:10': 5, 'fury:9': 3, 'stones:9': 2 };
const t3 = Trophy.steal(bag, 3);
assert.strictEqual(Trophy.total(t3), 3, 'существо 3-го цвета забирает 3 штуки');
assert.deepStrictEqual(t3, { 'health:10': 1, 'defense:9': 2 }, 'самое ценное для себя: жизнь 10 (8,5), броня 9 (8,1), сила 8 (8) — по убыванию ценности');
const t10 = Trophy.steal(bag, 10);
assert.strictEqual(Trophy.total(t10), 10);
assert.ok(!Object.keys(t10).some((k) => /^(ricochet|fury|stones)/.test(k)), 'неподходящие виды не берутся');
assert.ok(t10['health:10'] === 1, 'жизнь существу полезна');
assert.deepStrictEqual(Trophy.steal({ 'ricochet:3': 4 }, 5), {}, 'нечего брать — ничего не забирает');
assert.deepStrictEqual(Trophy.steal({}, 5), {});
// не больше, чем есть в сумке
assert.strictEqual(Trophy.total(Trophy.steal({ 'power:2': 2 }, 10)), 2);
// запас складывается и тратится
assert.deepStrictEqual(Trophy.add({ 'power:3': 1 }, { 'power:3': 2, 'block:1': 1 }), { 'power:3': 3, 'block:1': 1 });
// что пить: жизнь при малом ХП, затем сила, броня, блок — по одному виду, пока не действует
const loot = { 'power:2': 1, 'power:5': 1, 'defense:4': 1, 'block:3': 1, 'health:6': 1 };
assert.strictEqual(Trophy.pick(loot, {}, 0.9), 'power:5', 'сначала сильнейшая сила');
assert.strictEqual(Trophy.pick(loot, {}, 0.3), 'health:6', 'ХП мало — жизнь');
assert.strictEqual(Trophy.pick(loot, { power: { tier: 5, left: 1 } }, 0.9), 'defense:4');
assert.strictEqual(Trophy.pick(loot, { power: { tier: 5, left: 1 }, defense: { tier: 4, left: 5 } }, 0.9), 'block:3');
assert.strictEqual(Trophy.pick({ 'health:6': 1 }, {}, 0.9), null, 'жизнь при полном ХП не пьют');
assert.strictEqual(Trophy.pick({}, {}, 0.1), null);
// те же существа, что и у роста
assert.ok(Trophy.eligible({ id: 'a', tier: 3 }) && !Trophy.eligible({ boss: 1 }) && !Trophy.eligible({ rare: 1 }) && !Trophy.eligible(null));
console.log('trophy 2.0.4 ok');
