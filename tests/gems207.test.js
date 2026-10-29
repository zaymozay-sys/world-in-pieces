// 2.0.7: гнёзда самоцветов, скорпионы подземелья. Запуск: node tests/gems207.test.js
const assert = require('assert');
global.window = undefined;
global.Tiers = require('../js/tiers.js'); global.Gear = require('../js/items.js');
const Stones = require('../js/stones.js'); global.Stones = Stones;
const Runes = require('../js/runes.js');
const Bestiary = require('../js/bestiary.js'); const HexMap = require('../js/hexmap.js');
const SG = require('../js/saveguard.js');

// бонус самоцвета: есть у каждого цвета, растёт с цветом, не пустой, характеристики известны
const stats = Object.keys(Gear.blankStats());
let prevPower = 0;
for (let c = 1; c <= 10; c++) {
  const b = Stones.gemBonus(c); assert.ok(b && Object.keys(b).length, 'бонус цвета ' + c);
  for (const [k, v] of Object.entries(b)) { assert.ok(stats.includes(k) && v >= 1, `${c}: ${k}=${v}`); }
}
assert.strictEqual(Stones.gemBonus(0), null); assert.strictEqual(Stones.gemBonus(11), null);
assert.ok(Stones.gemBonus(9).health > Stones.gemBonus(4).health, 'здоровье растёт с цветом');
// суммирование: самоцвет в гнезде даёт бонус сверх огранки; без гнезда — ничего
const e = { uid: 1, id: 'granite-chest', tier: 5 };
const gear = { chest: e };
const base = Runes.bonusForGear(gear).health;
e.gems = [4]; delete e.gem; const withGem = Runes.bonusForGear(gear).health;
assert.strictEqual(withGem - base, Stones.gemBonus(4).health, 'бонус изумруда в гнезде');
e.cut = 3; const withCut = Runes.bonusForGear(gear); assert.ok(withCut.power >= 2 && withCut.health === withGem, 'огранка и самоцвет складываются');
// сверление и цены
const d1 = Stones.drillCost(1), f1 = Stones.fixCost(1), f10 = Stones.fixCost(10);
assert.strictEqual(d1.punch, 1); assert.ok(f10.resin > f1.resin && f10.resinTier <= 6, 'смола крепления растёт, но ниже 7-го цвета её нет');
assert.ok(Stones.punchPrice(10) > Stones.punchPrice(1) && Stones.punchPrice(1) > 0);
// шанс скорпиона: 1,5% на 1-м этаже, растёт с глубиной, потолок 5%, героя не касается
assert.strictEqual(Stones.scorpChance(1), 0.015); assert.ok(Stones.scorpChance(30) > Stones.scorpChance(1)); assert.strictEqual(Stones.scorpChance(5000), 0.05);
assert.strictEqual(Stones.scorpChance.length, 1, 'шанс зависит только от этажа');
// скорпионы: 10 цветов, имена, редкость, крепче обычных существ подземелья
for (let c = 1; c <= 10; c++) {
  const m = Bestiary.MONSTERS['scorp' + c]; assert.ok(m && m.scorp === c && m.name && m.desc && m.drops.length, 'скорпион ' + c);
  assert.ok(m.hp >= 2 * Bestiary.MONSTERS.golem.hp, 'скорпион крепче голема'); assert.ok(HexMap.SPAWN['scorp' + c].fixed && HexMap.SPAWN['scorp' + c].tower);
  assert.ok(require('../js/balance.js').danger.offset['scorp' + c] !== undefined);
}
assert.strictEqual(new Set(Array.from({ length: 10 }, (_, i) => Bestiary.MONSTERS['scorp' + (i + 1)].name)).size, 10, 'имена разные');
// генерация: скорпион на этаже — не больше одного, только в проходах, цвет 1–10; доля этажей близка к 70%
let n = 0, total = 400; const colours = new Set();
for (let seed = 1; seed <= total; seed++) {
  const m = HexMap.generate(seed * 104729, 'tower', 1 + (seed % 40)), sc = m.spawns.filter((s) => s.scorp);
  assert.ok(sc.length <= 1); if (sc.length) { n++; const s = sc[0]; colours.add(s.scorp); assert.ok(m.reachable.has(s.idx) && s.species === 'scorp' + s.scorp && s.tower); }
}
assert.ok(n > total * 0.55 && n < total * 0.85, 'доля этажей со скорпионом: ' + n / total); assert.strictEqual(colours.size, 10, 'встречаются все цвета');
console.log('gems207: все тесты пройдены (скорпионов на ' + Math.round(100 * n / total) + '% этажей)');

// гнёзда: массив gems, два на вещь, третье — за заслуги; старые hole/gem читаются как одно гнездо
assert.deepStrictEqual(Stones.gemList({ hole: true, gem: 3 }), [3]); assert.deepStrictEqual(Stones.gemList({ hole: true }), [0]); assert.deepStrictEqual(Stones.gemList({}), []);
assert.strictEqual(Stones.maxHoles(false), 2); assert.strictEqual(Stones.maxHoles(true), 3);
{ const e2 = { uid: 2, id: 'granite-chest', tier: 5, gems: [4, 4] }; const one = Runes.bonusForGear({ chest: { ...e2, gems: [4] } }).health, two = Runes.bonusForGear({ chest: e2 }).health, none = Runes.bonusForGear({ chest: { ...e2, gems: [0, 0] } }).health;
  assert.strictEqual(two - none, 2 * (one - none), 'два камня дают двойной бонус'); }
{ const d = SG.normalize ? null : null; }
console.log('gems207 gems[] ok');
