// Тесты приручения и питомцев (pets.js) + связанного расширения боя (combat.js: turnOrder).
// Запуск: node tests/pets.test.js
const assert = require('assert');
global.Tiers = require('../js/tiers.js');
global.Balance = require('../js/balance.js');
global.Gear = require('../js/items.js');
global.Bestiary = require('../js/bestiary.js');
const Combat = require('../js/combat.js');
const Pets = require('../js/pets.js');
const B = global.Balance;

const stats = (s = {}) => ({ ...Gear.blankStats(), ...s });
const fighter = (o = {}) => ({ hp: 100, max: 100, dmg: 1, stats: stats(o.stats), buffs: [], haste: false, magic: false,
  counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 }, ability: null, charged: false, revived: false, turnNo: 0, ...o, stats: stats(o.stats) });
const never = () => 0.999;   // шансы (блок/рикошет/крит) не срабатывают

// --- Приручаемость по семействам ---
// Звери (крыса, волк, кабан) — приручаемы после нужного числа побед.
assert.ok(Pets.isTameableSpecies('rat'));
assert.ok(Pets.isTameableSpecies('wolf'));
assert.ok(Pets.isTameableSpecies('boar'));
// Разумные враги (орк, разбойник, гоблин) — никогда, сколько бы побед ни было.
assert.ok(!Pets.isTameableSpecies('orc'));
assert.ok(!Pets.isTameableSpecies('bandit'));
assert.ok(!Pets.isTameableSpecies('goblin'));
// Нежить/элементали (скелет, призрак, упырь) — тоже нет.
assert.ok(!Pets.isTameableSpecies('skeleton'));
assert.ok(!Pets.isTameableSpecies('wraith'));
assert.ok(!Pets.isTameableSpecies('ghoul'));

assert.strictEqual(Pets.TAME_WINS, 25);
assert.strictEqual(Pets.tameProgress({}, 'rat'), 0);
assert.strictEqual(Pets.tameProgress({ rat: { wins: 9 } }, 'rat'), 9);

// Порог: ровно на границе приручение появляется, на одну победу меньше — ещё нет.
assert.ok(!Pets.canTame({ rat: { wins: Pets.TAME_WINS - 1 } }, 'rat'));
assert.ok(Pets.canTame({ rat: { wins: Pets.TAME_WINS } }, 'rat'));
assert.ok(Pets.canTame({ rat: { wins: 999 } }, 'rat'));
// Даже с огромным числом побед разумного врага/нежити — не приручается.
assert.ok(!Pets.canTame({ orc: { wins: 999 } }, 'orc'));
assert.ok(!Pets.canTame({ skeleton: { wins: 999 } }, 'skeleton'));

// --- Питомец: создание, отображаемое имя, боец ---
const pet = Pets.makePet('wolf', 2);
assert.strictEqual(pet.speciesId, 'wolf');
assert.strictEqual(pet.tier, 2);
assert.strictEqual(pet.durability, Pets.MAX_DURABILITY);
assert.strictEqual(pet.maxDurability, Pets.MAX_DURABILITY);
assert.strictEqual(Pets.petDisplayName('wolf'), 'Боевой волк');
assert.ok(Pets.isUsable(pet));

const petF = Pets.petFighter(pet);
const scWolf = Bestiary.scaled('wolf', 2);
assert.strictEqual(petF.hp, scWolf.hp);
assert.strictEqual(petF.max, scWolf.hp);
assert.strictEqual(petF.ability, 'howl');   // приём вида-донора сохраняется у питомца

// --- Прочность: теряется при поражении, но питомец не исчезает ---
Pets.loseDurability(pet); assert.strictEqual(pet.durability, Pets.MAX_DURABILITY - 1); assert.ok(Pets.isUsable(pet));
Pets.loseDurability(pet); Pets.loseDurability(pet);
assert.strictEqual(pet.durability, 0);
assert.ok(!Pets.isUsable(pet), 'при 0 прочности питомец непригоден к бою');
assert.strictEqual(pet.speciesId, 'wolf', 'но сам питомец не удаляется — просто не выходит в бой');
Pets.loseDurability(pet); assert.strictEqual(pet.durability, 0, 'прочность не уходит в минус');
Pets.repair(pet); assert.strictEqual(pet.durability, pet.maxDurability); assert.ok(Pets.isUsable(pet));

// --- Порядок ходов 2 на 1 ---
// Без питомца (или питомец не в строю) — порядок в точности как в исходном 1-на-1 бою, без изменений.
assert.deepStrictEqual(Combat.turnOrder(true, false), ['hero', 'monster']);
assert.deepStrictEqual(Combat.turnOrder(false, false), ['monster', 'hero']);
// С живым питомцем оба бойца игрока успевают походить за раунд, монстр — один и тот же для обоих.
assert.deepStrictEqual(Combat.turnOrder(true, true), ['hero', 'pet', 'monster']);
assert.deepStrictEqual(Combat.turnOrder(false, true), ['monster', 'hero', 'pet']);

// --- 2 на 1: и герой, и питомец реально наносят урон ОДНОМУ и тому же монстру через Combat.hit ---
{
  const heroF = fighter({ dmg: 1, stats: { power: 0 } });
  const p = Pets.makePet('rat', 1);
  const pF = Pets.petFighter(p);
  const monster = fighter({ hp: 1000, max: 1000 });
  const order = Combat.turnOrder(true, Pets.isUsable(p));
  assert.deepStrictEqual(order, ['hero', 'pet', 'monster']);

  const beforeHp = monster.hp;
  const heroHit = Combat.hit(heroF, monster, 10, false, never);
  const petHit = Combat.hit(pF, monster, Pets.petAttackAmount(pF), false, never);
  assert.strictEqual(heroHit.kind, 'hit');
  assert.strictEqual(petHit.kind, 'hit');
  assert.ok(petHit.amount > 0, 'питомец наносит настоящий урон, а не просто множит урон героя');
  assert.strictEqual(monster.hp, beforeHp - heroHit.amount - petHit.amount, 'урон обоих бойцов реально суммируется на одном и том же монстре');
}

// --- Питомец может погибнуть посреди боя — герой продолжает биться с тем же монстром один ---
{
  const heroF = fighter({ hp: 200, max: 200 });
  const p = Pets.makePet('rat', 1);
  const pF = Pets.petFighter(p);
  const monster = fighter({ hp: 500, max: 500, dmg: 1, stats: { power: 0 } });

  // Монстр одним ударом валит питомца (raw-урон, чтобы не зависеть от брони/блока в тесте).
  Combat.hit(monster, pF, pF.max + 50, true, never);
  assert.strictEqual(pF.hp, 0, 'питомец погиб');
  for (let i = 0; i < p.maxDurability; i++) Pets.loseDurability(p);
  assert.ok(!Pets.isUsable(p), 'мёртвый в бою питомец теряет прочность и временно непригоден');

  // Дальше порядок хода уже не включает питомца — герой продолжает тот же бой один на один с монстром.
  const soloOrder = Combat.turnOrder(true, Pets.isUsable(p));
  assert.deepStrictEqual(soloOrder, ['hero', 'monster'], 'без сообщника герой добивает ТОГО ЖЕ монстра в одиночку');
  const r = Combat.hit(heroF, monster, 30, false, never);
  assert.strictEqual(r.kind, 'hit');
  assert.ok(monster.hp < 500, 'бой продолжается на том же противнике, никакого второго/зеркального моба не появляется');
}

// --- Обратная совместимость: обычный бой без питомца ведёт себя ТОЧНО как раньше ---
{
  const a = fighter({ dmg: 2, stats: { power: 50 } }), t = fighter({ stats: { defense: 20 } });
  const r = Combat.hit(a, t, 10, false, never);
  assert.strictEqual(r.kind, 'hit');
  assert.strictEqual(r.amount, Math.round(Math.ceil(10 * 2 * 1.5) * 0.8), 'формула урона 1-на-1 не изменилась');
  assert.strictEqual(t.hp, 100 - r.amount);
}

console.log('pets: все тесты пройдены');

// 1.3.8: угощения Питомника
{
  const P = require('../js/pets.js');
  const pet = P.makePet('wolf', 1);
  assert.deepStrictEqual(P.TREAT_ORDER, ['bone', 'biscuit', 'honey', 'apple']);
  assert.ok(P.treatCost(pet, 'apple') > P.treatCost(pet, 'bone'));
  P.giveTreat(pet, 'honey'); P.giveTreat(pet, 'biscuit');
  assert.strictEqual(P.treatLeft(pet, 'honey'), 3);
  const t = P.useTreats(pet);
  assert.strictEqual(t.hpMult, 1.3); assert.strictEqual(t.defense, 15);
  assert.strictEqual(P.treatLeft(pet, 'honey'), 2, 'угощение тратит один бой');
  P.giveTreat(pet, 'apple');
  const t2 = P.useTreats(pet);
  assert.ok(t2.power > 1 && t2.defense >= 15);
}

// 1.3.9: домашние питомцы фракций и яйца
{
  assert.strictEqual(Pets.homeFor('human'), 'dog'); assert.strictEqual(Pets.homeFor('elf'), 'cat');
  assert.strictEqual(Pets.homeFor('dwarf'), 'hamster'); assert.strictEqual(Pets.homeFor('lizard'), 'turtle');
  assert.strictEqual(Pets.petDisplayName('turtle'), 'Боевая черепаха');
  const h = Pets.makePet('dog', 2), f = Pets.petFighter(h);
  assert.ok(f.max > 0 && Pets.petAttackAmount(f) >= 1);
  assert.strictEqual(Pets.eggFrom('griffin'), 'griffin'); assert.strictEqual(Pets.eggFrom('rat'), null);
  assert.ok(Pets.petFighter(Pets.makePet('phoenixchick', 3)).max > 0);
  assert.strictEqual(Pets.petDisplayName('dragonling'), 'Дракончик');
}
console.log('pets 1.3.9 ok');
