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
  assert.strictEqual(r.amount, Combat.mitigate(Math.ceil(10 + 50 + Combat.levelPower(2)), Combat.armorOf(t)), 'формула урона: Броня вычитается цифрой (1.6.0)');
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

// 1.4.8: опыт, ум и допинг питомца
{
  const ints = [0, 50, 200, 500, 1500, 4000, 9000, 50000].map((xp) => Pets.intellect({ xp }));
  assert.strictEqual(ints[0], 1, 'без опыта ум = 1');
  assert.strictEqual(ints[ints.length - 1], 100, 'ум упирается в 100');
  for (let i = 1; i < ints.length; i++) assert.ok(ints[i] >= ints[i - 1], 'ум не падает с опытом');
  assert.ok(ints.every((v) => v >= 1 && v <= 100));
  assert.strictEqual(Pets.intellect(null), 1);
  // допинг не выше 100
  assert.strictEqual(Pets.dopedIntellect({ xp: 0 }, 8), 9);
  assert.strictEqual(Pets.dopedIntellect({ xp: 50000 }, 25), 100);
  assert.strictEqual(Pets.dopedIntellect({ xp: 0 }), 1);
  // цвет растёт от опыта, но не выше цвета героя
  const p = Pets.makePet('dog', 1);
  assert.strictEqual(Pets.addXp(p, 10, 5), 0); assert.strictEqual(p.tier, 1);
  assert.ok(Pets.addXp(p, 1000, 2) === 1 && p.tier === 2, 'потолок — цвет героя');
  assert.ok(Pets.addXp(p, 100000, 4) === 2 && p.tier === 4);
  assert.ok(p.xp > 100000);
  // награда за опыт: победа больше поражения, старший цвет больше
  assert.ok(Pets.xpGain(1, true) > Pets.xpGain(1, false));
  assert.ok(Pets.xpGain(5, true) > Pets.xpGain(1, true));
  // угощения: допинг уму, и они тратятся
  const t = Pets.makePet('dog', 1);
  Pets.giveTreat(t, 'honey'); Pets.giveTreat(t, 'apple');
  const left0 = Pets.treatLeft(t, 'apple');
  const tr = Pets.useTreats(t);
  assert.strictEqual(tr.int, 8 + 25);
  assert.strictEqual(Pets.treatLeft(t, 'apple'), left0 - 1);
  assert.strictEqual(Pets.useTreats(Pets.makePet('dog', 1)).int, 0);
  assert.ok(Pets.BOARD_HP > 1);
}
console.log('pets 1.4.8 ok');

// 1.5.0: учёба в питомнике
{
  const pet = { speciesId: Object.keys(Pets.HOME || {})[0] || 'dog', tier: 1, xp: 0 };
  assert.strictEqual(Pets.studyLeft(pet, 0), -1, 'не учится');
  assert.ok(Pets.studyStart(pet, 1000), 'начать можно');
  assert.ok(!Pets.studyStart(pet, 1000), 'второй раз нельзя');
  assert.strictEqual(Pets.studyLeft(pet, 1000), Pets.STUDY_MS);
  assert.strictEqual(Pets.studyCollect(pet, 3, 1000 + Pets.STUDY_MS - 1), null, 'рано');
  const r = Pets.studyCollect(pet, 3, 1000 + Pets.STUDY_MS);
  assert.ok(r && r.after > r.before, 'ум вырос');
  assert.strictEqual(pet.study, 0);
  pet.xp = 2000;                                     // ум выше потолка учёбы
  assert.ok(!Pets.studyOpen(pet) && !Pets.studyStart(pet, 5), 'выше потолка — только бои');
  assert.ok(!Pets.battleReady({ xp: 0 }) && Pets.battleReady({ xp: 100 }), 'готовность к бою');
}

// 1.5.0: занятия (мяч, клад), защита новичка, опыт за поражение
{
  const mk = () => ({ speciesId: 'dog', tier: 2, xp: 0 });
  let p = mk();
  assert.ok(Pets.studyStart(p, 0, 'ball'));
  assert.ok(!Pets.studyStart(p, 0, 'hunt'), 'одно занятие за раз');
  assert.strictEqual(Pets.studyCollect(p, 3, 1000), null, 'рано');
  let r = Pets.studyCollect(p, 3, Pets.ACTS.ball.ms);
  assert.strictEqual(r.kind, 'ball'); assert.strictEqual(p.fed, 2, 'бодрость на 2 боя');
  p = mk();
  assert.ok(Pets.studyStart(p, 0, 'hunt'));
  r = Pets.studyCollect(p, 3, Pets.ACTS.hunt.ms);
  assert.strictEqual(r.kind, 'hunt'); assert.ok(r.coins > 0 && r.coins === Pets.huntCoins(p));
  assert.ok(!Pets.studyStart(mk(), 0, 'nonsense'), 'неизвестное занятие');
  // ум выше потолка учёбы: мяч и клад всё равно доступны
  const wise = { speciesId: 'dog', tier: 2, xp: 5000 };
  assert.ok(!Pets.studyStart(wise, 0, 'study') && Pets.studyStart(wise, 0, 'ball'));
  // защита новичка
  assert.ok(Pets.boardHp({ xp: 0 }) > Pets.boardHp({ xp: 2000 }), 'новичок крепче');
  assert.strictEqual(Pets.boardHp({ xp: 2000 }), Pets.BOARD_HP);
  assert.ok(Pets.xpGain(1, false) >= 10, 'за поражение опыта больше, чем раньше');
  assert.ok(Pets.xpGain(1, true) > Pets.xpGain(1, false));
}
console.log('pets 1.5.0 ok');

// 1.5.1: дрессировка, отдых, разведка, серия дней
{
  const DAY = 86400000, T0 = 20000 * DAY + 12 * 3600000;
  let p = Pets.makePet('dog', 2); p.xp = 0;
  assert.ok(Pets.studyStart(p, T0, 'drill'));
  let r = Pets.studyCollect(p, 3, T0 + Pets.ACTS.drill.ms);
  assert.strictEqual(r.kind, 'drill'); assert.strictEqual(p.drill, 2);
  assert.strictEqual(Pets.useTreats(p).int, Pets.DRILL_INT); assert.strictEqual(p.drill, 1);
  Pets.useTreats(p); assert.strictEqual(p.drill, 0);
  assert.strictEqual(Pets.useTreats(p).int, 0, 'дрессировка кончилась');
  // отдых
  p = Pets.makePet('dog', 2); p.durability = 1;
  assert.ok(Pets.studyStart(p, T0, 'rest'));
  r = Pets.studyCollect(p, 3, T0 + Pets.ACTS.rest.ms);
  assert.strictEqual(r.gain, 1); assert.strictEqual(p.durability, 2);
  p.durability = p.maxDurability; Pets.studyStart(p, T0, 'rest');
  assert.strictEqual(Pets.studyCollect(p, 3, T0 + Pets.ACTS.rest.ms).gain, 0, 'выше максимума не растёт');
  // разведка
  p = Pets.makePet('dog', 2);
  assert.ok(Pets.studyStart(p, T0, 'scout'));
  r = Pets.studyCollect(p, 3, T0 + Pets.ACTS.scout.ms, () => 0);
  assert.ok(r.res && r.res.n >= 1 && r.res.tier >= 1 && r.res.tier <= 2);
  // серия: день 1, 2 подряд, 3-й — бонус; пропуск сбрасывает
  p = Pets.makePet('dog', 2); p.xp = 0;
  const go = (t) => { Pets.studyStart(p, t, 'ball'); return Pets.studyCollect(p, 3, t + Pets.ACTS.ball.ms); };
  assert.strictEqual(go(T0).streakInfo.streak, 1);
  assert.strictEqual(go(T0 + DAY).streakInfo.streak, 2);
  const x0 = p.xp; r = go(T0 + 2 * DAY);
  assert.strictEqual(r.streakInfo.streak, 3); assert.strictEqual(r.streakInfo.bonus, Pets.STREAK_BONUS[3]); assert.ok(p.xp > x0);
  assert.strictEqual(go(T0 + 2 * DAY + 3600000).streakInfo.bonus, 0, 'в тот же день серия не растёт');
  assert.strictEqual(go(T0 + 5 * DAY).streakInfo.streak, 1, 'пропуск сбрасывает серию');
}
console.log('pets 1.5.1 ok');

// 1.5.1: эликсиры — один заметный эффект за бой, растёт с цветом
{
  const Elixirs = require('../js/elixirs.js');
  assert.strictEqual(Elixirs.effect('power', 10), null, '2.0.4: у эликсира силы нет «первого удара ×», он даёт проценты Силы'); assert.strictEqual(Elixirs.effect('fury', 10), null, '2.0.4: у эликсира ярости нет побочного эффекта');
  for (const k of ['defense', 'block', 'ricochet']) {
    assert.strictEqual(Elixirs.effect(k, 4), null, 'до 5-го цвета эффекта нет: ' + k);
    assert.ok(Elixirs.effect(k, 5) && Elixirs.sideText(k, 5), 'есть текст: ' + k);
    if (k !== 'initiative') assert.ok(Elixirs.effect(k, 10).v >= Elixirs.effect(k, 5).v, 'растёт с цветом: ' + k);
  }
  assert.ok(/%/.test(Elixirs.describe('power', 7)) && /Сил/.test(Elixirs.describe('power', 7)));
  assert.ok(Elixirs.effect('defense', 10).v <= 90, 'первый удар не обнуляется');
  assert.ok(Elixirs.effect('health', 5) === null && Elixirs.effect('initiative', 9) === null, 'Жизнь и Инициатива без побочного эффекта');
  assert.ok(/ХП/.test(Elixirs.describe('health', 10)) && /%/.test(Elixirs.describe('fury', 7)));
  // крит с добавкой от эликсира ярости
  const Combat = require('../js/combat.js');
  const mk = (extra) => ({ hp: 1000, max: 1000, dmg: 1, stats: { power: 0, fury: 100, defense: 0, block: 0, ricochet: 0 }, buffs: [], critExtra: extra });
  const t = mk(0); t.stats.fury = 0;
  const a1 = mk(0), r1 = Combat.hit(a1, { ...t, buffs: [] }, 100, false, () => 0);
  const a2 = mk(1), r2 = Combat.hit(a2, { ...t, buffs: [] }, 100, false, () => 0);
  assert.ok(r1.crit && r2.crit && r2.amount > r1.amount, 'эликсир ярости усиливает первый крит');
  assert.strictEqual(a2.critExtra, 0, 'добавка расходуется');
  console.log('elixirs 1.5.1 ok');
}

// 2.1.5: черты и кличка
{
  const T = Pets;
  assert.strictEqual(T.makePet('wolf', 1).traits, undefined, 'без rng черт нет');
  let seed = 7; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 200; i++) { const p = T.makePet('wolf', 1, rng); assert.strictEqual(p.traits.length, 2); assert.notStrictEqual(p.traits[0], p.traits[1], 'две разные черты'); assert.ok(p.traits.every((t) => T.TRAITS[t])); }
  const base = { speciesId: 'wolf', tier: 1, durability: 3, maxDurability: 3 };
  const brave = { ...base, traits: ['brave'] }, none = { ...base };
  assert.ok(T.petAttackAmount(T.petFighter(brave)) >= T.petAttackAmount(T.petFighter(none)), 'смелый бьёт не слабее');
  assert.ok(T.petFighter(brave).max < T.petFighter(none).max, 'у смелого здоровья меньше');
  assert.ok(T.huntCoins({ ...base, traits: ['greedy'] }) > T.huntCoins(none), 'жадный находит больше');
  const slow = { ...base, traits: ['sturdy'] }, fast = { ...base, traits: ['swift'] };
  T.studyStart(slow, 0, 'hunt'); T.studyStart(fast, 0, 'hunt'); assert.ok(fast.study < slow.study, 'шустрый занят меньше');
  const clever = { ...base, traits: ['clever'] }; T.addXp(clever, 100, 5); T.addXp(none, 100, 5); assert.ok(clever.xp > none.xp);
  const careful = { ...base, traits: ['careful'] }; T.loseDurability(careful, () => 0.1); assert.strictEqual(careful.durability, 3, 'осторожный уберёг прочность');
  T.loseDurability(careful, () => 0.9); assert.strictEqual(careful.durability, 2);
  // кличка
  assert.strictEqual(T.cleanName('  Рекс   Второй '), 'Рекс Второй'); assert.strictEqual(T.cleanName('<b>x</b>'), null); assert.strictEqual(T.cleanName(''), null); assert.strictEqual(T.cleanName('x'.repeat(17)), null);
  const named = { ...base }; assert.ok(T.setName(named, "Д'Артаньян")); assert.strictEqual(T.petTitle(named), "Д'Артаньян"); assert.strictEqual(T.petTitle(none), T.petDisplayName('wolf'));
  console.log('pets 2.1.5: черты и кличка ок');
}

// 2.1.6: доверие и таланты
{
  const T = Pets; const mk = (o = {}) => ({ speciesId: 'wolf', tier: 1, durability: 3, maxDurability: 3, ...o });
  assert.strictEqual(T.talentPoints(mk()), 0, 'на 1-м цвете очков нет');
  assert.strictEqual(T.talentPoints(mk({ tier: 4 })), 3); assert.strictEqual(T.talentPoints(mk({ tier: 1, trust: 100 })), 2, 'каждые 50 доверия — очко');
  const p = mk({ tier: 4 });
  assert.ok(T.talentUp(p, 'fang') && T.talentUp(p, 'fang') && !T.talentUp(p, 'fang'), 'не больше 2 уровней');
  assert.strictEqual(T.talentPoints(p), 1); assert.ok(!T.talentUp(p, 'нет'));
  assert.ok(T.talentUp(p, 'hide') && !T.talentUp(p, 'nose'), 'очки кончились');
  assert.ok(T.petAttackAmount(T.petFighter(p)) > T.petAttackAmount(T.petFighter(mk({ tier: 4 }))), 'таланты усиливают удар');
  assert.strictEqual(T.talentResetCost(mk()), 0); assert.ok(T.talentResetCost(p) > 0); T.talentReset(p); assert.strictEqual(T.talentPoints(p), 3);
  // доверие
  const q = mk(); T.addTrust(q, 5); assert.strictEqual(q.trust, 5); T.addTrust(q, -50); assert.strictEqual(q.trust, 0, 'не ниже нуля'); T.addTrust(q, 500); assert.strictEqual(q.trust, 100, 'не выше 100');
  const b = mk({ tier: 3, talents: { bond: 2 } }); T.addTrust(b, 4); assert.strictEqual(b.trust, 8, 'Привязанность: +100% при двух уровнях');
  assert.ok(T.petFighter(mk({ trust: 100 })).max > T.petFighter(mk()).max, 'доверие усиливает здоровье');
  assert.strictEqual(T.trustName(mk({ trust: 80 })), T.trustName(mk({ trust: 100 })));
  const g = mk({ tier: 4, talents: { guard: 2 } }); assert.ok(Math.abs(T.saveChance(g) - 0.2) < 1e-9); T.loseDurability(g, () => 0.1); assert.strictEqual(g.durability, 3);
  const both = mk({ traits: ['careful'], talents: { guard: 2 } }); assert.ok(T.saveChance(both) > 0.35 && T.saveChance(both) < 0.4, '0.2 и 0.2 складываются как независимые шансы: 0.36');
  const fed = mk(); T.feed(fed); assert.strictEqual(fed.trust, 1); T.giveTreat(fed, 'bone'); assert.strictEqual(fed.trust, 3);
  console.log('pets 2.1.6: доверие и таланты ок');
}

// 2.1.8: эволюция и снаряжение
{
  const T = Pets; const mk = (o = {}) => ({ speciesId: 'wolf', tier: 1, durability: 3, maxDurability: 3, ...o });
  assert.ok(!T.canEvolve(mk({ tier: 4 })) && T.canEvolve(mk({ tier: 5 })), 'эволюция с 5-го цвета');
  const p = mk({ tier: 5 }); assert.ok(!T.evolve(p, 'нет')); assert.ok(T.evolve(p, 'hunter')); assert.strictEqual(T.evoStage(p), 1);
  assert.ok(!T.canEvolve(p), 'вторая ступень только с 10-го цвета');
  assert.ok(T.petAttackAmount(T.petFighter(p)) > T.petAttackAmount(T.petFighter(mk({ tier: 5 }))), 'охотник бьёт сильнее');
  assert.strictEqual(T.talentPoints(p), 5, 'очки: цвет−1 + ступень');
  const w = mk({ tier: 5 }); T.evolve(w, 'warden'); assert.ok(T.petFighter(w).max > T.petFighter(mk({ tier: 5 })).max, 'защитник крепче');
  const q = mk({ tier: 10, evo: 'hunter', evoStage: 1 }); assert.ok(T.canEvolve(q)); T.evolve(q, 'warden'); assert.strictEqual(q.evo, 'hunter', 'путь не меняется'); assert.strictEqual(T.evoStage(q), 2);
  assert.ok(/Вожак/.test(T.evoTitle(q)));
  // снаряжение
  const g = mk({ tier: 2 }); assert.strictEqual(T.gearTier(g, 'collar'), 0); assert.ok(T.gearUpCost(g, 'collar') > 0);
  assert.ok(T.gearUp(g, 'collar') && T.gearUp(g, 'collar') && !T.gearUp(g, 'collar'), 'цвет вещи не выше цвета питомца'); assert.strictEqual(T.gearUpCost(g, 'collar'), null);
  assert.ok(T.petMul(g, 'hit') > T.petMul(mk({ tier: 2 }), 'hit'), 'ошейник усиливает удар');
  T.gearUp(g, 'harness'); assert.ok(T.petFighter(g).max > T.petFighter(mk({ tier: 2 })).max);
  const c = mk({ tier: 2 }); T.gearUp(c, 'charm'); const base = mk({ tier: 2 }); T.addXp(c, 100, 5); T.addXp(base, 100, 5); assert.ok(c.xp >= base.xp);
  console.log('pets 2.1.8: эволюция и снаряжение ок');
}

// 2.1.9: амулеты
{
  const T = Pets; const mk = (o = {}) => ({ speciesId: 'wolf', tier: 3, durability: 3, maxDurability: 3, ...o });
  assert.strictEqual(T.amuletId(mk()), null, 'без вещи амулета нет');
  const old = mk({ gear: { charm: 2 } }); assert.strictEqual(T.amuletId(old), 'scholar', 'прежний амулет — «учёба»');
  const l = mk({ gear: { charm: 3 }, amulet: 'loyal' }); assert.strictEqual(T.amuletId(l), 'loyal');
  const f = T.petFighter(l); assert.ok(f.secondWind && Math.abs(f.secondWindFrac - 0.29) < 1e-9, 'верность: встаёт с долей 20% + 3% за цвет');
  assert.ok(!T.petFighter(mk({ gear: { charm: 3 }, amulet: 'healer' })).secondWind, 'у целителя нет «встаёт»');
  assert.ok(T.amuletPower(mk({ gear: { charm: 3 }, amulet: 'healer' }), 'healer') > 0 && T.amuletPower(l, 'healer') === 0);
  assert.ok(T.petMul(mk({ gear: { charm: 3 }, amulet: 'scholar' }), 'xp') > 1 && T.petMul(l, 'xp') === 1, 'опыт даёт только «учёба»');
  const s = mk(); assert.ok(T.setAmulet(s, 'fortune') && !T.setAmulet(s, 'нет'));
  assert.ok(T.AMULET_IDS.every((id) => typeof T.AMULETS[id].desc(3) === 'string'));
  // «верность» работает в бою: второй смертельный удар питомца убивает
  global.Combat = global.Combat || require('../js/combat.js'); const C = Combat;
  const pf = T.petFighter(l); pf.hp = 5; const foe = { hp: 100, max: 100, dmg: 1, stats: Gear.blankStats(), buffs: [], counts: {}, turnNo: 0 };
  C.hit(foe, pf, 50, () => 0.999); assert.ok(pf.hp > 5, 'встал'); pf.hp = 1; C.hit(foe, pf, 50, () => 0.999); assert.strictEqual(pf.hp, 0, 'второй раз не встаёт');
  console.log('pets 2.1.9: амулеты ок');
}

{   // 2.2.2: поручения
  const p = { speciesId: 'wolf', tier: 2, trust: 120 };
  assert.ok(Pets.sendErrand(p, 'coins') && !Pets.sendErrand(p, 'forage'), 'одно поручение за раз');
  for (let i = 0; i < Pets.ERRANDS.coins.battles; i++) { assert.ok(!Pets.errandReady(p), 'ещё идёт'); Pets.errandTick(p); }
  assert.ok(Pets.errandReady(p), 'готов');
  const r = Pets.errandTake(p); assert.ok(r && r.coins > 0 && !p.errand, 'монеты, поручение снято');
  Pets.sendErrand(p, 'forage'); for (let i = 0; i < 5; i++) Pets.errandTick(p);
  const f = Pets.errandTake(p, () => 0.5); assert.ok(f && f.res && f.tier === 2 && f.n >= 3, 'ресурс цвета питомца');
}
console.log('pets 2.2.2: поручения ок');
