// Тесты Спороносца Дикого гриба (combat.js): споры, двойник с ХП оригинала, лимиты, порядок ходов,
// кого бьют (двойник прикрывает оригинал), условие победы; плюс прогон боя в симуляторе (tools/sim.js).
// Запуск: node tests/clone.test.js
const assert = require('assert');
global.Tiers = require('../js/tiers.js');
global.Balance = require('../js/balance.js');
global.Gear = require('../js/items.js');
const Combat = require('../js/combat.js');
const B = global.Balance;
const CL = B.abilities.clone;

const stats = (s = {}) => ({ ...Gear.blankStats(), ...s });
const fighter = (o = {}) => ({ hp: 100, max: 100, dmg: 1, stats: stats(o.stats), buffs: [], haste: false, magic: false,
  counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 }, ability: null, charged: false, revived: false, turnNo: 0, ...o, stats: stats(o.stats) });
const never = () => 0.999;

// числа в balance.js на месте
assert.ok(CL.charge > 0 && CL.max >= 1 && CL.stones > 0, 'clone: { charge, max, stones }');
assert.strictEqual(CL.every, undefined, 'старый «раз в N ходов» (every) больше не используется');

// --- споры: копятся только у гриба, до порога ---
let h = fighter(), m = fighter({ ability: 'clone', hp: 80, max: 80, stats: { defense: 10 } });
assert.strictEqual(Combat.addSpores(fighter({ ability: 'regen' }), 50), 0, 'у других существ спор нет');
assert.strictEqual(Combat.addSpores(m, 0), 0);
assert.strictEqual(Combat.addSpores(m, CL.charge - 1), CL.charge - 1);
assert.strictEqual(Combat.cloneReady(m), false, 'порог ещё не набран');
m.turnNo = 1;
assert.strictEqual(Combat.monsterTurnStart(m, h, [], never), null, 'без спор двойника нет');
assert.strictEqual(m.clone, undefined);
assert.strictEqual(Combat.addSpores(m, 100), CL.charge, 'споры не копятся выше порога');
assert.strictEqual(Combat.cloneReady(m), true);

// --- двойник: ХП = ТЕКУЩЕЕ ХП оригинала (не полное), остальное — копия; споры обнуляются ---
m.hp = 37;
let act = Combat.monsterTurnStart(m, h, [], never);
assert.deepStrictEqual(act, { kind: 'clone', hp: 37 });
assert.ok(Combat.cloneAlive(m));
assert.strictEqual(m.clone.hp, 37); assert.strictEqual(m.clone.max, 37, 'максимум двойника — ХП оригинала в момент клонирования');
assert.strictEqual(m.hp, 37, 'оригинал не лечится'); assert.strictEqual(m.max, 80, 'и не теряет максимум (старое поведение f.max = f.hp убрано)');
assert.strictEqual(m.clone.stats.defense, 10); assert.strictEqual(m.clone.dmg, m.dmg);
assert.strictEqual(m.clone.ability, null, 'двойник сам не клонируется');
assert.notStrictEqual(m.clone.stats, m.stats, 'статы — копия, крошение брони двойника не трогает оригинал');
assert.strictEqual(m.spores, 0); assert.strictEqual(m.clonesMade, 1);

// --- только один живой двойник сразу ---
Combat.addSpores(m, CL.charge);
assert.strictEqual(Combat.cloneReady(m), false, 'пока двойник жив, второй не встаёт');
assert.strictEqual(Combat.monsterTurnStart(m, h, [], never), null);
assert.strictEqual(m.spores, 0, 'пока двойник жив, споры не копятся (новый не встанет сразу после гибели старого)');

// --- кого бьют: двойник прикрывает оригинал, перебор на оригинал не переходит ---
assert.strictEqual(Combat.enemyTarget(m), m.clone);
const r = Combat.hit(fighter({ dmg: 10 }), Combat.enemyTarget(m), 100, true, never);   // raw 100 > 37
assert.strictEqual(r.amount, 100);
assert.strictEqual(m.clone.hp, 0); assert.strictEqual(m.hp, 37, 'лишний урон на оригинал не переходит');
assert.strictEqual(Combat.cloneAlive(m), false);
assert.strictEqual(Combat.enemyTarget(m), m, 'двойник пал — удары снова по оригиналу');
assert.strictEqual(Combat.enemyDefeated(m), false, 'двойник пал первым — бой продолжается');

// --- не больше clone.max двойников за бой ---
for (let k = m.clonesMade; k < CL.max; k++) {
  Combat.addSpores(m, CL.charge);
  act = Combat.monsterTurnStart(m, h, [], never);
  assert.strictEqual(act.kind, 'clone');
  m.clone.hp = 0;
}
Combat.addSpores(m, CL.charge);
assert.strictEqual(Combat.cloneReady(m), false, `лимит ${CL.max} двойников за бой`);
assert.strictEqual(Combat.monsterTurnStart(m, h, [], never), null);
assert.strictEqual(m.clonesMade, CL.max);

// мёртвый оригинал не клонируется
let d = fighter({ ability: 'clone', hp: 0 }); Combat.addSpores(d, CL.charge);
assert.strictEqual(Combat.monsterTurnStart(d, h, [], never), null);

// --- победа: оба мертвы ---
let v = fighter({ ability: 'clone', hp: 20 }); Combat.addSpores(v, CL.charge); Combat.monsterTurnStart(v, h, [], never);
v.hp = 0;
assert.strictEqual(Combat.enemyDefeated(v), false, 'оригинал пал, но двойник стоит — бой не окончен');
v.clone.hp = 0;
assert.strictEqual(Combat.enemyDefeated(v), true);
assert.strictEqual(Combat.enemyDefeated(fighter({ hp: 0 })), true, 'обычное существо без двойника');
assert.strictEqual(Combat.enemyDefeated(fighter({ hp: 5 })), false);

// --- удар двойника: clone.stones «камней» через обычный Combat.hit ---
assert.strictEqual(Combat.cloneAttackAmount(v.clone), CL.stones);
const hero = fighter(), cl = Combat.makeClone(fighter({ hp: 50, dmg: 2 }));
const hr = Combat.hit(cl, hero, Combat.cloneAttackAmount(cl), false, never);
assert.strictEqual(hr.amount, CL.stones * 2);
assert.strictEqual(hero.hp, 100 - CL.stones * 2);

// --- порядок ходов: двойник сразу после оригинала; старые вызовы не меняются ---
assert.deepStrictEqual(Combat.turnOrder(true, false), ['hero', 'monster']);
assert.deepStrictEqual(Combat.turnOrder(false, false), ['monster', 'hero']);
assert.deepStrictEqual(Combat.turnOrder(true, true), ['hero', 'pet', 'monster']);
assert.deepStrictEqual(Combat.turnOrder(false, true), ['monster', 'hero', 'pet']);
assert.deepStrictEqual(Combat.turnOrder(true, false, false), ['hero', 'monster']);
assert.deepStrictEqual(Combat.turnOrder(true, false, true), ['hero', 'monster', 'clone']);
assert.deepStrictEqual(Combat.turnOrder(false, true, true), ['monster', 'clone', 'hero', 'pet']);
assert.deepStrictEqual(Combat.turnOrder(true, true, true), ['hero', 'pet', 'monster', 'clone']);

// --- симулятор: гриб копит споры и выпускает двойников, бои заканчиваются, лимит соблюдается ---
const sim = require('../tools/sim.js');
let made = 0, finished = 0;
for (let k = 0; k < 12; k++) {
  sim.seed(1000 + k);
  const lvl = global.Hero.itemLevel(6);
  const hr2 = sim.makeHero({ faction: 'dwarf', level: lvl, gear: sim.typicalGear(lvl, 0.8) });
  const mon = sim.makeMonster('mushroom', 6);
  const S = sim.Battle(hr2, mon, sim.PLAYERS.avg()).run();
  assert.ok(mon.clonesMade <= CL.max);
  made += mon.clonesMade;
  if (S.winner !== 'draw') finished++;
  if (S.winner === 'left') assert.ok(Combat.enemyDefeated(mon), 'победа героя — и оригинал, и двойник мертвы');
}
assert.ok(made > 0, 'за 12 боёв гриб хоть раз выпустил двойника');
assert.strictEqual(finished, 12, 'все бои закончились');
// у других существ двойников не бывает
sim.seed(7);
const wolf = sim.makeMonster('wolf', 3);
sim.Battle(sim.makeHero({ faction: 'elf', level: 11 }), wolf, sim.PLAYERS.avg()).run();
assert.ok(!wolf.clone && !wolf.clonesMade);

console.log('clone: все тесты пройдены');
