// 1.5.1: улучшения деревни, закалка вещей, косметика — траты золота
const assert = require('assert');
require('../js/i18n.js');
const Village = require('../js/village.js');
const Gear = require('../js/items.js');
const Pets = require('../js/pets.js');
const Market = require('../js/market.js');
const Elixirs = require('../js/elixirs.js');
const G = 10000;

// цены и порядок
for (const id of Village.IDS) {
  for (let k = 1; k < Village.MAX; k++) assert.ok(Village.cost(id, k + 1) > Village.cost(id, k), 'цена растёт: ' + id);
  assert.strictEqual(Village.reqTier(Village.MAX), 10, 'последний уровень — с обсидианового цвета');
}
assert.ok(Village.cost('forge', 3) > Village.cost('hall', 3));
let total = 0; for (const id of Village.IDS) for (let k = 1; k <= 5; k++) total += Village.cost(id, k);
assert.ok(total > 1000 * G && total < 3000 * G, 'все улучшения — тысячи золотых, а не миллионы: ' + total / G);

// покупка
const v = {};
assert.strictEqual(Village.buy(v, 'hall', 1, 1e9), 0, 'цвет героя мал');
assert.strictEqual(Village.buy(v, 'hall', 2, 100), 0, 'не хватает монет');
assert.strictEqual(Village.buy(v, 'hall', 2, 1e9), Village.cost('hall', 1)); assert.strictEqual(v.hall, 1);
assert.strictEqual(Village.buy(v, 'hall', 2, 1e9), 0, 'второй уровень — с 4-го цвета');
assert.strictEqual(Village.buy(v, 'nonsense', 10, 1e9), 0);
for (let k = 0; k < 10; k++) Village.buy(v, 'mill', 10, 1e12);
assert.strictEqual(v.mill, 5); assert.strictEqual(Village.next(v, 'mill', 10), null);

// эффекты
const w = { hall: 5, kennel: 5, mill: 2, alchemist: 3, forge: 4 };
assert.strictEqual(Village.maxLots(w), 13); assert.ok(Village.feeRate(w) <= 0.011 && Village.feeRate({}) === 0.05);
assert.ok(Math.abs(Village.studyFactor(w) - 0.4) < 1e-9 && Village.studyFactor({}) === 1);
assert.strictEqual(Village.elixirExtra(w), 3); assert.strictEqual(Village.temperCap(w), 4); assert.ok(Math.abs(Village.granaryChance(w) - 0.2) < 1e-9);
// эффекты действительно доходят до модулей
assert.strictEqual(Market.fee(1000, 0.01), 10); assert.strictEqual(Market.fee(1000), 50);
const pet = { speciesId: 'dog', tier: 2, xp: 0 }; Pets.studyStart(pet, 0, 'ball', 0.5);
assert.strictEqual(pet.study, Pets.ACTS.ball.ms / 2, 'Питомник ускоряет занятие');
const act = {}; Elixirs.drink(act, 'power', 5, 3); assert.strictEqual(act.power.left, Elixirs.battles(5) + 3, 'Алхимик продлевает эликсир');

// закалка
{
  const e = Gear.makeEntry('sword-novice', 10), base = Gear.item(e);
  assert.strictEqual(base.plus, 0); assert.strictEqual(Gear.temperCost(e).plus, 1);
  let prev = base, prevCost = 0;
  for (let p = 1; p <= Gear.TEMPER_MAX; p++) {
    const tc = Gear.temperCost(e); assert.strictEqual(tc.plus, p); assert.ok(tc.coins > prevCost, 'шаги дороже');
    prevCost = tc.coins; e.plus = p;
    const it = Gear.item(e);
    assert.strictEqual(it.cost, base.cost, 'очки снаряжения не растут');
    if (p === 1 || p === Gear.TEMPER_MAX) assert.ok(Object.keys(it.stats).some((k) => it.stats[k] > base.stats[k]), 'вещь сильнее: +' + p);
    for (const k in it.stats) assert.ok(it.stats[k] >= prev.stats[k], 'ничего не слабеет');
    assert.ok(it.name.endsWith(' +' + p));
    prev = it;
  }
  assert.strictEqual(Gear.temperCost(e), null, 'выше +5 нельзя');
  assert.ok(Object.keys(prev.stats).some((k) => prev.stats[k] > base.stats[k]));
  assert.ok(Math.max(...Object.keys(prev.stats).map((k) => base.stats[k] > 0 ? prev.stats[k] / base.stats[k] : 1)) <= 1.5, '+5 не больше +50%');
  assert.strictEqual(Gear.temperCost('sword-novice'), null, 'строка-вещь без экземпляра не закаляется');
}

// косметика
{
  const c = Village.fresh();
  assert.strictEqual(Village.buyCosmetic(c, 'titles', 'wanderer', 1, false), 0, 'не хватает монет');
  assert.strictEqual(Village.buyCosmetic(c, 'titles', 'wanderer', 1e9, false), 5 * G); assert.ok(Village.owns(c, 'titles', 'wanderer'));
  assert.strictEqual(Village.buyCosmetic(c, 'titles', 'wanderer', 1e9, false), 0, 'второй раз нельзя');
  assert.strictEqual(Village.buyCosmetic(c, 'titles', 'heartbind', 1e9, false), 0, 'особый титул — только после финала');
  assert.ok(Village.buyCosmetic(c, 'titles', 'heartbind', 1e9, true) > 0);
  assert.ok(!Village.equip(c, 'frames', 'gold'), 'не купленное не надеть');
  assert.ok(Village.equip(c, 'titles', 'wanderer')); assert.strictEqual(Village.fullName('Лу', c), 'Странник Лу');
  assert.ok(Village.equip(c, 'titles', null)); assert.strictEqual(Village.fullName('Лу', c), 'Лу');
  Village.buyCosmetic(c, 'frames', 'gold', 1e9, false); Village.equip(c, 'frames', 'gold'); assert.strictEqual(Village.frameColor(c), '#f0c23c');
}
console.log('village 1.5.1: все тесты пройдены');
