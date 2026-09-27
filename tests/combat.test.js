// Тесты правил боя (combat.js): урон, блок, броня, рикошет, приёмы существ и фракций, расходники, оценка опасности.
// Запуск: node tests/combat.test.js
const assert = require('assert');
global.Tiers = require('../js/tiers.js');
global.Balance = require('../js/balance.js');
global.Gear = require('../js/items.js');
const Combat = require('../js/combat.js');
const B = global.Balance;

const stats = (s = {}) => ({ ...Gear.blankStats(), ...s });
const fighter = (o = {}) => ({ hp: 100, max: 100, dmg: 1, stats: stats(o.stats), buffs: [], haste: false, magic: false,
  counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 }, ability: null, charged: false, revived: false, turnNo: 0, ...o, stats: stats(o.stats) });
const never = () => 0.999;           // шансы не срабатывают
const always = () => 0;              // шансы срабатывают

// урон: номинал × рост урона × (1 + Сила), затем Броня
let a = fighter({ dmg: 2, stats: { power: 50 } }), t = fighter({ stats: { defense: 20 } });
let r = Combat.hit(a, t, 10, false, never);
assert.strictEqual(r.kind, 'hit');
assert.strictEqual(r.amount, Math.round(Math.ceil(10 * 2 * 1.5) * 0.8));
assert.strictEqual(t.hp, 100 - r.amount);
// урон без модификаторов (яд, штраф)
t = fighter(); r = Combat.hit(a, t, 7, true, never);
assert.strictEqual(r.amount, 7); assert.strictEqual(t.hp, 93);
// блок гасит удар целиком
t = fighter({ stats: { block: 30 } }); r = Combat.hit(a, t, 10, false, always);
assert.strictEqual(r.kind, 'block'); assert.strictEqual(t.hp, 100);
// рикошет: удар отлетает в нападающего, цель ничего не теряет
a = fighter(); t = fighter({ stats: { ricochet: 100 } }); r = Combat.hit(a, t, 10, false, always);
assert.strictEqual(r.kind, 'reflect'); assert.strictEqual(t.hp, 100); assert.strictEqual(a.hp, 90);
// Броня ограничена потолком
t = fighter({ stats: { defense: 95 } }); r = Combat.hit(fighter(), t, 100, false, never);
assert.strictEqual(r.amount, Math.round(100 * (1 - Gear.MAX_DEFENSE / 100)));

// приёмы существ
// Натиск: только первый удар двойной
a = fighter({ ability: 'charge' }); t = fighter({ hp: 1000, max: 1000 });
assert.strictEqual(Combat.hit(a, t, 10, false, never).amount, 20);
assert.strictEqual(Combat.hit(a, t, 10, false, never).amount, 10);
// Ярость: раненый бьёт сильнее
a = fighter({ ability: 'rage', hp: 40 });
assert.strictEqual(Combat.power(a), B.abilities.rage.power);
a.hp = 80; assert.strictEqual(Combat.power(a), 0);
// Подлый удар не замечает Брони
a = fighter({ ability: 'backstab' }); t = fighter({ stats: { defense: 50 } });
assert.strictEqual(Combat.hit(a, t, 10, false, always).amount, 10);
// Кровопийца лечится на долю урона
a = fighter({ ability: 'vampire', hp: 50 }); Combat.hit(a, fighter(), 20, false, never);
assert.strictEqual(a.hp, 50 + Math.ceil(20 * B.abilities.vampire.share));
// Неупокоенный встаёт один раз
t = fighter({ ability: 'undying', hp: 10 });
r = Combat.hit(fighter(), t, 50, false, never);
assert.ok(r.revived); assert.strictEqual(t.hp, Math.ceil(100 * B.abilities.undying.hp));
Combat.hit(fighter(), t, 500, false, never); assert.strictEqual(t.hp, 0);

// приёмы в начале хода существа
const hero = fighter({ counts: { sapphire: 5, ruby: 0, emerald: 0, onyx: 0 } });
let m = fighter({ ability: 'howl' });
for (let n = 1; n <= 6; n++) { m.turnNo = n; const act = Combat.monsterTurnStart(m, hero, ['sapphire', 'ruby', 'emerald'], never); assert.strictEqual(!!act, n % B.abilities.howl.every === 0); }
m = fighter({ ability: 'regen', hp: 50 }); m.turnNo = 1;
assert.strictEqual(Combat.monsterTurnStart(m, hero, [], never).heal, Math.round(100 * B.abilities.regen.heal));
m = fighter({ ability: 'steal' }); m.turnNo = 1;
const st = Combat.monsterTurnStart(m, hero, ['sapphire', 'ruby', 'emerald'], always);
assert.strictEqual(st.type, 'sapphire'); assert.strictEqual(hero.counts.sapphire, 5 - B.abilities.steal.stones);
m = fighter({ ability: 'drum' }); m.turnNo = B.abilities.drum.every;
assert.strictEqual(Combat.monsterTurnStart(m, hero, [], never).kind, 'drum'); assert.ok(m.magic);

// расходники и свиток спешки
let f = fighter({ hp: 40 });
assert.strictEqual(Combat.useConsumable(f, 'potion', []).heal, Math.ceil(100 * B.consumables.potion.heal));
assert.strictEqual(Combat.useConsumable(fighter(), 'potion', []), null);         // здоровье полное
f = fighter(); Combat.useConsumable(f, 'elixir', []);
assert.strictEqual(Combat.buffPower(f), B.consumables.elixir.power);
assert.strictEqual(Combat.useConsumable(f, 'elixir', []), null);                  // второй эликсир не складывается
for (let k = 0; k < B.consumables.elixir.turns; k++) Combat.finishAction(f, false);
assert.strictEqual(f.buffs.length, 0);
f = fighter(); Combat.useConsumable(f, 'scroll', []);
assert.deepStrictEqual(Combat.finishAction(f, false), { extra: true, haste: true });
assert.deepStrictEqual(Combat.finishAction(f, false), { extra: false, haste: false });

// Магия снижает цену заклинаний, но не ниже минимума
assert.strictEqual(Combat.spellCost(fighter()), B.magic.cost);
assert.strictEqual(Combat.spellCost(fighter({ stats: { magic: 4 } })), B.magic.cost - 1);
assert.strictEqual(Combat.spellCost(fighter({ stats: { magic: 100 } })), B.magic.minCost);

// инициатива
assert.strictEqual(Combat.firstMoveChance(fighter({ stats: { initiative: 20 } }), fighter()), 70);
assert.strictEqual(Combat.firstMoveChance(fighter({ stats: { initiative: 50 } }), fighter()), B.initiative.max);

// яд, лечение, штраф растут вместе с уроном
assert.ok(Combat.venomTick(0, 3) === Math.ceil(B.faction.venom.base * 3));
assert.strictEqual(Combat.rainHeal(fighter({ hp: 10, dmg: 2 }), 20), 40);
assert.strictEqual(Combat.invalidPenalty(fighter({ max: 400 })), 400 * B.invalid.penalty);

// ИИ считает в «камнях»: чем сильнее удар, тем меньше камней нужно
const me = fighter({ dmg: 1 }), foe = fighter({ dmg: 1 });
const v1 = Combat.aiView(me, foe); me.dmg = 3; const v3 = Combat.aiView(me, foe);
assert.ok(Math.abs(v1.hpOpp / v3.hpOpp - 3) < 1e-9);

// оценка опасности: разумный диапазон, растёт с силой героя, пороги по порядку
const H = { max: 125, dmg: 1.5, stats: stats({ power: 10, defense: 10 }) };
const mon = { max: 80, dmg: 1.5, stats: stats({ power: 25 }), ai: 30 };
const p0 = Combat.winChance(H, mon, 'orc');
assert.ok(p0 > 0.05 && p0 < 0.95);
assert.ok(Combat.winChance({ ...H, max: 250 }, mon, 'orc') > p0);
assert.ok(Combat.winChance({ ...H, dmg: 3 }, mon, 'orc') > p0);
assert.ok(Combat.winChance(H, { ...mon, ai: 70 }, 'orc') < p0);
assert.ok(Combat.winChance(H, mon, 'rat') > Combat.winChance(H, mon, 'dragon'));
assert.deepStrictEqual([0.9, 0.7, 0.4, 0.1].map(Combat.dangerBand), ['easy', 'even', 'hard', 'deadly']);

console.log('combat: все тесты пройдены');
