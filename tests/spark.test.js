const assert = require('assert');
global.Hero = require('../js/hero.js'); const Spark = require('../js/spark.js');
assert.strictEqual(Spark.rate(1), 1, '1 мелкая искра = 1 медная монета на 1-м уровне');
assert.strictEqual(Spark.rate(1) * Spark.RED, 10000, 'красная искра = 1 золотая монета на 1-м уровне');
assert.deepStrictEqual(Spark.split(10000 * 3 + 100 * 5 + 7), { red: 3, blue: 5, green: 7 });
assert.ok(!/spark-blue/.test(Spark.html(10007)) && /spark-red/.test(Spark.html(10007)) && /spark-green/.test(Spark.html(10007)), 'нулевые номиналы не показываются');
assert.ok(Spark.html(10007).indexOf('spark-red') < Spark.html(10007).indexOf('spark-green'), 'старшая слева');
assert.ok(/spark-green/.test(Spark.html(0)));
assert.ok(Spark.rate(100) > Spark.rate(50) && Spark.rate(50) > Spark.rate(1), 'курс растёт вместе с ценами');
assert.ok(Spark.sparksFor(1000, 1) * Spark.rate(1) >= 1000 * 1.1 - Spark.rate(1), 'за вещь надбавка 10%');
assert.deepStrictEqual(Spark.STABLE_PRICES, [150, 250, 400, 600, 900].map((p) => p * 10000));
assert.strictEqual(Spark.slotsOwned(), 1, 'первое место бесплатно');
assert.ok(!Spark.available(), 'без сервера траты недоступны');
console.log('spark: все тесты пройдены');
// зверинец: починка сохранения
global.window = undefined;
global.Tiers = require('../js/tiers.js'); global.Gear = require('../js/items.js'); global.Balance = require('../js/balance.js'); global.Bestiary = require('../js/bestiary.js'); global.Pets = require('../js/pets.js');
const SG = require('../js/saveguard.js'); const names = Object.keys(Bestiary.MONSTERS);
const mk = () => ({ speciesId: names[0], tier: 1, durability: 3, maxDurability: 3 });
const d = { stable: [mk(), { speciesId: 'нет-такого' }, null, mk(), mk(), mk(), mk(), mk()] };
const res = SG.normalize(d);
assert.strictEqual(d.stable.length, 5, 'в зверинце не больше 5 запасных, испорченные убраны');
assert.ok(d.stable.every((p) => p && p.speciesId === names[0]));
assert.ok(res.fixed > 0);
const d2 = { stable: 'мусор' }; SG.normalize(d2); assert.deepStrictEqual(d2.stable, []);
console.log('spark: зверинец проверен вместе с saveguard.test.js');
// черты и кличка в saveguard
{ const d = { pet: { speciesId: names[0], tier: 1, durability: 3, maxDurability: 3, traits: ['brave', 'нет', 'brave', 'fierce'], name: '<b>' } };
  SG.normalize(d); assert.deepStrictEqual(d.pet.traits, ['brave', 'fierce']); assert.strictEqual(d.pet.name, undefined);
  const d2 = { pet: { speciesId: names[0], tier: 1, durability: 3, maxDurability: 3, name: '  Рекс ' } }; SG.normalize(d2); assert.strictEqual(d2.pet.name, 'Рекс'); }
{ const d = { pet: { speciesId: names[0], tier: 2, durability: 3, maxDurability: 3, trust: 500, talents: { fang: 2, hide: 2, нет: 3 } } };
  SG.normalize(d); assert.strictEqual(d.pet.trust, 100); assert.deepStrictEqual(d.pet.talents, {}, 'потрачено больше очков, чем положено: таланты сброшены'); }
{ const d = { pet: { speciesId: names[0], tier: 3, durability: 3, maxDurability: 3, evo: 'hunter', evoStage: 2, gear: { collar: 9, мусор: 1, charm: 2 } } };
  SG.normalize(d); assert.strictEqual(d.pet.evoStage, undefined === d.pet.evoStage ? undefined : d.pet.evoStage); assert.ok(!d.pet.evo || d.pet.tier >= 5, 'эволюция без нужного цвета снята');
  assert.deepStrictEqual(d.pet.gear, { collar: 3, charm: 2 }, 'цвет вещи не выше цвета питомца, лишнего нет'); }
{ const d = { pet: { speciesId: names[0], tier: 3, durability: 3, maxDurability: 3, gear: { charm: 2 }, amulet: 'нет' } }; SG.normalize(d); assert.strictEqual(d.pet.amulet, undefined); }
{ const d = { stable: [{ ...mk(), errand: { kind: 'нет', left: 3 } }, { ...mk(), errand: { kind: 'coins', left: 99 } }, { ...mk(), errand: { kind: 'forage', left: 2 } }] }; SG.normalize(d);
  assert.strictEqual(d.stable[0].errand, undefined, 'неизвестное поручение убрано');
  assert.strictEqual(d.stable[1].errand.left, 4, 'остаток не больше длины поручения');
  assert.deepStrictEqual(d.stable[2].errand, { kind: 'forage', left: 2 }); }
