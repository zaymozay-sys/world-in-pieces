// Тесты фракций, их снаряжения и врагов на карте. Запуск: node tests/factions.test.js
const assert = require('assert');
const Tiers = require('../js/tiers.js');
global.Tiers = Tiers;
const Balance = require('../js/balance.js');
global.Balance = Balance;
const Gear = require('../js/items.js');
global.Gear = Gear;
const Bestiary = require('../js/bestiary.js');
global.Bestiary = Bestiary;
const Factions = require('../js/factions.js');
const HexMap = require('../js/hexmap.js');

// четыре фракции: люди, гномы, эльфы, ящеры; у каждой свой родной камень
assert.deepStrictEqual(Factions.ORDER, ['human', 'dwarf', 'elf', 'lizard']);
assert.deepStrictEqual(Factions.ORDER.map((id) => Factions.get(id).name), ['Люди', 'Гномы', 'Эльфы', 'Ящеры']);
const gems = Factions.ORDER.map((id) => Factions.get(id).gem);
assert.strictEqual(new Set(gems).size, 4, 'родные камни не повторяются');
for (const g of gems) assert.ok(['sapphire', 'ruby', 'emerald', 'onyx'].includes(g), g);
for (const id of Factions.ORDER) {
  const f = Factions.get(id);
  assert.ok(f.hero && f.figure && f.color && f.desc && f.perkText, id);
  assert.ok(f.ability && f.ability.id && f.ability.name && f.ability.desc, id);
  for (const [k, v] of Object.entries(f.stats)) assert.ok(k in Gear.blankStats() && v > 0, id + ': ' + k);
}
assert.strictEqual(new Set(Factions.ORDER.map((id) => Factions.get(id).ability.id)).size, 4, 'приёмы разные');
assert.strictEqual(Factions.get('orc'), null);
assert.ok(Factions.CHARGE > 0);

// у каждой фракции — фигура и звание на оба пола, разные
for (const id of Factions.ORDER) {
  const f = Factions.get(id);
  assert.ok(f.heroF && f.heroF !== f.hero, id);
  assert.strictEqual(Factions.heroKind(id, 'm'), f.figure + '-m');
  assert.strictEqual(Factions.heroKind(id, 'f'), f.figure + '-f');
  assert.strictEqual(Factions.heroTitle(id, 'm'), f.hero);
  assert.strictEqual(Factions.heroTitle(id, 'f'), f.heroF);
}
assert.strictEqual(Factions.heroKind('orc', 'm'), null);

// бонусы вне боя: по умолчанию без изменений
assert.strictEqual(Factions.perk('human', 'shop'), 0.9);
assert.strictEqual(Factions.perk('human', 'coins'), 1.1);
assert.strictEqual(Factions.perk('dwarf', 'forge'), 0.85);
assert.strictEqual(Factions.perk('elf', 'shop'), 1);
assert.strictEqual(Factions.perk(null, 'shop'), 1);

// яд ящеров растёт с Силой и ростом урона
assert.strictEqual(Factions.venomTick(0), Math.ceil(Balance.faction.venom.base));
assert.ok(Factions.venomTick(50) > Factions.venomTick(0));
assert.ok(Factions.venomTick(0, 4) > Factions.venomTick(0, 1));
assert.strictEqual(Factions.CHARGE, Balance.faction.charge);

// врождённые бонусы растут с уровнем героя: Здоровье — быстро, шансы — медленно
const l1 = Factions.statsAt('lizard', 1), l10 = Factions.statsAt('lizard', 10);
assert.deepStrictEqual(l1, Factions.get('lizard').stats);
assert.ok(l10.health >= l1.health * 8 && l10.power > l1.power && l10.power < l1.power * 3);
const e10 = Factions.statsAt('elf', 10);
assert.ok(e10.initiative > Factions.get('elf').stats.initiative && e10.initiative <= Factions.get('elf').stats.initiative * 2.2);

// у каждой фракции свой набор из 5 вещей
for (const id of Factions.ORDER) {
  const own = Gear.ITEMS.filter((i) => i.faction === id);
  assert.strictEqual(own.length, 5, id);
  const set = own[0].set;
  assert.ok(own.every((i) => i.set === set) && Gear.SETS[set].faction === id, id);
  // itemsFor: общие вещи и только свои
  const pool = Gear.itemsFor(id);
  assert.ok(pool.every((i) => !i.faction || i.faction === id));
  assert.ok(pool.some((i) => !i.faction) && own.every((i) => pool.includes(i)));
}

// чужую вещь надеть нельзя, свою — можно
const empty = Gear.emptyLoadout();
assert.strictEqual(Gear.canEquip(empty, 'grove-bow', 'main', 'elf').ok, true);
const alien = Gear.canEquip(empty, 'grove-bow', 'main', 'dwarf');
assert.strictEqual(alien.ok, false);
assert.ok(/фракци/.test(alien.reason));
assert.strictEqual(Gear.canEquip(empty, 'rune-hammer', 'main', 'dwarf').ok, true);

// снаряжение монстров — без фракционных вещей
for (let i = 0; i < 200; i++) {
  const r = Gear.randomLoadout(40, Math.random, 3);
  for (const it of Gear.equipped(r)) assert.ok(!it.faction, it.id);
}

// врождённые бонусы фракции складываются со снаряжением и не выходят за потолки
for (const id of Factions.ORDER) {
  const s = Gear.combine(Factions.get(id).stats, Gear.stats(empty));
  for (const [k, cap] of Object.entries(Gear.CAPS)) assert.ok(s[k] <= cap, id + ': ' + k);
}

// орки и нежить — враги на карте: живут в средних и дальних зонах
for (const id of ['orc', 'orcShaman', 'ghoul', 'skeleton', 'wraith']) assert.ok(HexMap.SPAWN[id], id);
const seen = new Set();
for (const seed of [1, 42, 777, 2026]) {
  for (const s of HexMap.generate(seed).spawns) seen.add(s.species);
}
for (const id of ['orc', 'orcShaman', 'ghoul', 'skeleton', 'wraith']) assert.ok(seen.has(id), 'на карте нет ' + id);
assert.ok(HexMap.SPAWN.orc.tiers[0] >= 3 && HexMap.SPAWN.ghoul.tiers[0] >= 3, 'у стен деревни орков и нежити нет');

console.log('factions: все тесты пройдены');
