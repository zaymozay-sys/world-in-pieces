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

// Ярость: шанс удвоить урон одним ударом, считается ДО Брони (Броня всё равно снижает уже удвоенный урон)
a = fighter({ stats: { fury: 100 } }); t = fighter();
r = Combat.hit(a, t, 10, false, always);
assert.ok(r.crit); assert.strictEqual(r.amount, 20, 'Ярость всегда срабатывает — урон удвоен');
a = fighter({ stats: { fury: 0 } }); t = fighter();
r = Combat.hit(a, t, 10, false, always);
assert.ok(!r.crit); assert.strictEqual(r.amount, 10, 'без Ярости удвоения нет');
a = fighter({ stats: { fury: 100 } }); t = fighter({ stats: { defense: 50 } });
r = Combat.hit(a, t, 10, false, always);
assert.ok(r.crit); assert.strictEqual(r.amount, 10, 'Броня снижает уже удвоенный Яростью урон');

// Особое оружие: арбалет иногда пробивает Блок насквозь
a = fighter({ weaponPerk: { type: 'pierceBlock' } }); t = fighter({ stats: { block: 100 } });
r = Combat.hit(a, t, 10, false, always);   // шанс пробить тоже срабатывает (always -> chance() true)
assert.strictEqual(r.kind, 'hit'); assert.ok(r.pierceBlock);
a = fighter({ weaponPerk: { type: 'pierceBlock' } }); t = fighter({ stats: { block: 100 } });
r = Combat.hit(a, t, 10, false, never);    // шанс пробить не срабатывает — блок остаётся в силе
assert.strictEqual(r.kind, 'block'); assert.ok(!r.pierceBlock);
// без Блока у цели пробивать нечего — пометка не выставляется
a = fighter({ weaponPerk: { type: 'pierceBlock' } }); t = fighter();
r = Combat.hit(a, t, 10, false, always);
assert.strictEqual(r.kind, 'hit'); assert.ok(!r.pierceBlock);

// Особое оружие: утренняя звезда крошит Броню цели с каждым ударом, не больше cap суммарно
a = fighter({ weaponPerk: { type: 'armorShred' }, shredDone: 0 }); t = fighter({ stats: { defense: 20 } });
r = Combat.hit(a, t, 10, false, never);
assert.strictEqual(r.shred, B.weaponPerks.armorShred.amount);
assert.strictEqual(t.stats.defense, 20 - B.weaponPerks.armorShred.amount);
assert.strictEqual(a.shredDone, B.weaponPerks.armorShred.amount);
a.shredDone = B.weaponPerks.armorShred.cap;   // предел уже выбран — дальше не крошит
r = Combat.hit(a, t, 10, false, never);
assert.strictEqual(r.shred, 0);
assert.strictEqual(t.stats.defense, 20 - B.weaponPerks.armorShred.amount);   // не изменилась

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

// новые приёмы: Тень, Рак, Болотник, Древень
// Морок: раз в weaken.every ходов слегка ослабляет героя на 1 его ход (это баф в hero.buffs с отрицательной amount)
let h = fighter(); m = fighter({ ability: 'weaken' }); m.turnNo = B.abilities.weaken.every;
let out = Combat.monsterTurnStart(m, h, [], never);
assert.strictEqual(out.kind, 'weaken'); assert.strictEqual(Combat.buffPower(h), B.abilities.weaken.power);
m.turnNo = B.abilities.weaken.every + 1;
assert.strictEqual(Combat.monsterTurnStart(m, h, [], never), null);
// Панцирь: Блок растёт с каждым разом и не превышает потолок
m = fighter({ ability: 'pinch' }); m.turnNo = B.abilities.pinch.every;
out = Combat.monsterTurnStart(m, hero, [], never);
assert.strictEqual(out.add, B.abilities.pinch.block); assert.strictEqual(m.stats.block, B.abilities.pinch.block);
m.stats.block = Gear.CAPS.block; m.turnNo = B.abilities.pinch.every * 2;
out = Combat.monsterTurnStart(m, hero, [], never);
assert.strictEqual(out.add, 0); assert.strictEqual(m.stats.block, Gear.CAPS.block);
// Трясина: раз в mire.every ходов удваивает штраф героя за неверный ход на один его ход
h = fighter({ max: 200 }); m = fighter({ ability: 'mire' }); m.turnNo = B.abilities.mire.every;
assert.strictEqual(Combat.monsterTurnStart(m, h, [], never).kind, 'mire');
assert.strictEqual(Combat.invalidPenalty(h), Math.max(1, Math.round(200 * B.invalid.penalty)) * 2);
// Смола: раз в sap.every ходов заклинание героя на его следующий ход дороже
h = fighter(); m = fighter({ ability: 'sap' }); m.turnNo = B.abilities.sap.every;
const before = Combat.spellCost(h);
assert.strictEqual(Combat.monsterTurnStart(m, h, [], never).extra, B.abilities.sap.extra);
assert.strictEqual(Combat.spellCost(h), before + B.abilities.sap.extra);

// Спороносец (настоящий двойник Дикого гриба) — см. tests/clone.test.js.
let act;

// Изворотливость: с шансом evasion.chance% повышает Блок на несколько ходов; срабатывания складываются
h = fighter(); m = fighter({ ability: 'evasion', stats: { block: 5 } });
act = Combat.monsterTurnStart(m, h, [], never);   // never() -> rand()=0.999, шанс не срабатывает
assert.strictEqual(act, null);
act = Combat.monsterTurnStart(m, h, [], always);
assert.strictEqual(act.kind, 'evasion'); assert.strictEqual(act.amount, B.abilities.evasion.block);
assert.strictEqual(m.buffs.length, 1); assert.strictEqual(Combat.buffStat(m, 'evasion'), B.abilities.evasion.block);
act = Combat.monsterTurnStart(m, h, [], always);   // срабатывает второй раз подряд — складывается
assert.strictEqual(m.buffs.length, 2);
assert.strictEqual(Combat.buffStat(m, 'evasion'), B.abilities.evasion.block * 2, 'два срабатывания подряд складываются');
// эффективный Блок в hit() учитывает буст сверх базового (amount=100 гарантирует блок)
{
  const attacker = fighter(); const target = fighter({ stats: { block: 0 }, buffs: [{ kind: 'evasion', amount: 100, turns: 3 }] });
  const r = Combat.hit(attacker, target, 20, false, never);
  assert.strictEqual(r.kind, 'block', 'buffStat добавляет Блок сверх базового и гарантирует блок при amount=100');
}
// буфф тает по ходам существа (finishAction decrement, не untilTurnEnd)
m = fighter({ ability: 'evasion' }); m.buffs.push({ kind: 'evasion', amount: 10, turns: 1 });
Combat.finishAction(m, false);
assert.strictEqual(Combat.buffStat(m, 'evasion'), 0, 'таймер buff истёк через 1 finishAction');

// Возмездие: аналогично, но повышает Рикошет
h = fighter(); m = fighter({ ability: 'retribution' });
assert.strictEqual(Combat.monsterTurnStart(m, h, [], never), null);
act = Combat.monsterTurnStart(m, h, [], always);
assert.strictEqual(act.kind, 'retribution'); assert.strictEqual(act.amount, B.abilities.retribution.ricochet);
act = Combat.monsterTurnStart(m, h, [], always);
assert.strictEqual(Combat.buffStat(m, 'retribution'), B.abilities.retribution.ricochet * 2, 'складывается при повторном срабатывании');
{
  const attacker = fighter(); const target = fighter({ stats: { ...fighter().stats, ricochet: 0, defense: 0 }, buffs: [{ kind: 'retribution', amount: 100, turns: 3 }] });
  const r = Combat.hit(attacker, target, 20, false, never);
  assert.strictEqual(r.kind, 'reflect', 'buffStat добавляет Рикошет сверх базового и гарантирует отражение при amount=100');
}

// расходники и свиток спешки
let f = fighter({ hp: 40 });
assert.strictEqual(Combat.useConsumable(f, 'potion', []).heal, Math.ceil(100 * B.consumables.potion.heal));
assert.strictEqual(Combat.useConsumable(fighter(), 'potion', []), null);         // здоровье полное
f = fighter(); Combat.useConsumable(f, 'elixir', []);
assert.strictEqual(Combat.buffPower(f), B.consumables.elixir.power);
assert.strictEqual(Combat.useConsumable(f, 'elixir', []), null);                  // второй эликсир не складывается
for (let k = 0; k < 10; k++) Combat.finishAction(f, false);                       // "до конца хода" — действия его не снимают
assert.strictEqual(f.buffs.length, 1);
Combat.clearTurnEndBuffs(f);                                                      // снимается только при смене хода
assert.strictEqual(f.buffs.length, 0);
f = fighter(); Combat.useConsumable(f, 'scroll', []);
assert.deepStrictEqual(Combat.finishAction(f, false), { extra: true, haste: true });
assert.deepStrictEqual(Combat.finishAction(f, false), { extra: false, haste: false });

// свиток удачи: один раз за бой, метка не сгорает по ходам (в отличие от эликсира/спешки)
f = fighter();
assert.strictEqual(Combat.useConsumable(f, 'luck', []).pct, B.consumables.luck.pct);
assert.strictEqual(f.luck, B.consumables.luck.pct);
assert.strictEqual(Combat.useConsumable(f, 'luck', []), null, 'второй свиток удачи за бой не действует');
Combat.finishAction(f, false);
assert.strictEqual(f.luck, B.consumables.luck.pct, 'метка держится весь бой, а не несколько ходов');

// Банка мёда: наугад — либо +% к максимуму ХП до конца боя, либо заряд гарантированного блока
f = fighter({ hp: 100, max: 100 });
let ef = Combat.useConsumable(f, 'honeyjar', [], never);   // never() -> rand() = 0.999, hpChance не срабатывает -> блок
assert.strictEqual(ef.mode, 'shield');
assert.strictEqual(f.shield, B.consumables.honeyjar.shieldHits);
r = Combat.hit(fighter(), f, 10, false, never);             // блок цели (0%) сам не сработает, но заряд мёда есть
assert.strictEqual(r.kind, 'block'); assert.ok(r.shieldUsed);
assert.strictEqual(f.shield, 0, 'заряд одноразовый');
r = Combat.hit(fighter(), f, 10, false, never);
assert.strictEqual(r.kind, 'hit', 'без заряда следующий удар проходит как обычно');

f = fighter({ hp: 100, max: 100 });
ef = Combat.useConsumable(f, 'honeyjar', [], always);        // always() -> rand() = 0, hpChance срабатывает -> ХП
assert.strictEqual(ef.mode, 'hp');
assert.strictEqual(ef.amount, Math.round(100 * B.consumables.honeyjar.hpPct));
assert.strictEqual(f.max, 100 + ef.amount);
assert.strictEqual(f.hp, 100 + ef.amount);

// Магия снижает цену заклинаний, но не ниже минимума; у каждого заклинания своя базовая цена (Balance.magic.costs)
assert.strictEqual(Combat.spellCost(fighter()), B.magic.costs.lightning);           // по умолчанию — молния
for (const kind of Object.keys(B.magic.costs)) {
  assert.strictEqual(Combat.spellCost(fighter(), kind), B.magic.costs[kind]);
  assert.strictEqual(Combat.spellCost(fighter({ stats: { magic: 4 } }), kind), B.magic.costs[kind] - 1);
  assert.strictEqual(Combat.spellCost(fighter({ stats: { magic: 100 } }), kind), B.magic.minCost);
}
// Заклинания стоят по-разному, и это относится к их относительной силе (см. docs/balance.md)
assert.ok(B.magic.costs.lightning >= B.magic.costs.fire, 'Шаровая молния не дешевле Огненного креста');
assert.ok(B.magic.costs.chaos <= B.magic.costs.heal, 'Хаос не дороже Целебного дождя');

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

// Шаровая молния держится, пока ход продолжается (линии 4+), и гаснет, когда ход реально кончается
assert.strictEqual(Combat.continueMagic(true, true), true, 'молния + доп. ход — остаётся включена');
assert.strictEqual(Combat.continueMagic(true, false), false, 'молния, но хода без доп. хода — гаснет');
assert.strictEqual(Combat.continueMagic(false, true), false, 'молния не была включена — доп. ход её не включает');
assert.strictEqual(Combat.continueMagic(false, false), false);

// Таймер хода: 3 пропуска подряд — поражение, до этого — просто счёт
assert.deepStrictEqual(Combat.registerSkip(0), { skips: 1, defeated: false });
assert.deepStrictEqual(Combat.registerSkip(1), { skips: 2, defeated: false });
assert.deepStrictEqual(Combat.registerSkip(2), { skips: 3, defeated: true });
assert.strictEqual(Combat.TURN_TIMER.seconds, 30);
assert.strictEqual(Combat.TURN_TIMER.skipLimit, 3);

/* ---------- новые заклинания: Зеркало, Жертва, Удар ---------- */

// Зеркало: следующий удар по f отражается целиком атакующему, цель урона не получает; флаг одноразовый.
{
  a = fighter(); t = fighter();
  Combat.applyMirror(t);
  assert.strictEqual(t.mirrorReady, true);
  r = Combat.hit(a, t, 10, false, never);
  assert.strictEqual(r.kind, 'mirror');
  assert.strictEqual(t.hp, 100, 'цель под Зеркалом урона не получает');
  assert.ok(a.hp < 100, 'урон улетает в атакующего');
  assert.strictEqual(t.mirrorReady, false, 'флаг одноразовый');
  const hpBefore = a.hp;
  r = Combat.hit(a, t, 10, false, never);
  assert.strictEqual(r.kind, 'hit', 'без взведённого Зеркала — обычный удар');
  assert.strictEqual(a.hp, hpBefore, 'второй раз Зеркало уже не срабатывает');
}
// Зеркало ловит удар раньше Блока — даже 100%-й Блок цели не мешает отражению
{
  a = fighter(); t = fighter({ stats: { block: 100 } });
  Combat.applyMirror(t);
  r = Combat.hit(a, t, 10, false, always);
  assert.strictEqual(r.kind, 'mirror');
}

// Жертва: сжигает долю ТЕКУЩЕГО (не максимального) ХП заклинателя и утраивает урон следующего удара.
{
  const f = fighter({ hp: 50, max: 100 });
  const res = Combat.applySacrifice(f);
  assert.strictEqual(res.loss, Math.max(1, Math.round(50 * B.magic.sacrifice.hpPct / 100)), 'доля текущего, не максимального ХП');
  assert.strictEqual(f.hp, 50 - res.loss);
  assert.strictEqual(f.tripleNext, true);
  t = fighter();
  const plain = fighter();
  const rNormal = Combat.hit(plain, fighter(), 10, false, never);
  const rTriple = Combat.hit(f, t, 10, false, never);
  assert.strictEqual(rTriple.amount, rNormal.amount * B.magic.sacrifice.mult);
  assert.strictEqual(f.tripleNext, false, 'усиление одноразовое');
  const after = Combat.hit(f, fighter(), 10, false, never);
  assert.strictEqual(after.amount, rNormal.amount, 'второй удар уже обычный');
}
// Жертва не уходит в минус и не роняет ниже 0 (loseHp сам не даёт уйти ниже нуля)
{
  const f = fighter({ hp: 1, max: 100 });
  const res = Combat.applySacrifice(f);
  assert.ok(res.loss >= 1);
  assert.strictEqual(f.hp, 0);
}

// Удар: фиксированный «сырой» урон по dmg бойца, без Силы/крита/Блока/Брони.
{
  assert.strictEqual(Combat.strikeDamage(fighter({ dmg: 3.6 })), 4);
  assert.strictEqual(Combat.strikeDamage(fighter({ dmg: 0.2 })), 1, 'минимум 1');
  const attacker = fighter({ dmg: 5, stats: { power: 999 } });
  const blocked = fighter({ stats: { block: 100, defense: 100 } });
  r = Combat.hit(attacker, blocked, Combat.strikeDamage(attacker), true, always);
  assert.strictEqual(r.kind, 'hit', 'raw-урон Удара не блокируется и не режется Бронёй');
  assert.strictEqual(r.amount, 5);
}

// Цена новых заклинаний задана и участвует в общей проверке снижения Магией (см. цикл выше по всем costs)
for (const k of ['mirror', 'sacrifice', 'tide', 'divination', 'strike']) assert.ok(B.magic.costs[k] >= B.magic.minCost);

// Хитрость: после сбора камней противником с шансом cunning% забирает половину (вниз, минимум 1) магических камней
{
  const cs = (thiefCunning, victimCounts, gained, rand) => {
    const th = fighter({ stats: { cunning: thiefCunning } }), vi = fighter();
    Object.assign(vi.counts, victimCounts);
    return { th, vi, res: Combat.cunningSteal(th, vi, gained, rand) };
  };
  let { th, vi, res } = cs(100, { sapphire: 7, ruby: 3, emerald: 1, onyx: 9 }, { sapphire: 7, ruby: 3, emerald: 1, onyx: 9 }, always);
  assert.deepStrictEqual(res.stolen, { sapphire: 3, ruby: 1, emerald: 1 }, 'половина вниз, минимум 1, без обсидиана');
  assert.strictEqual(res.total, 5);
  assert.deepStrictEqual(vi.counts, { sapphire: 4, ruby: 2, emerald: 0, onyx: 9 });
  assert.deepStrictEqual(th.counts, { sapphire: 3, ruby: 1, emerald: 1, onyx: 0 });
  // только обсидиан собран — красть нечего
  ({ res } = cs(100, { onyx: 6 }, { onyx: 6 }, always)); assert.strictEqual(res, null);
  // никогда не больше, чем есть у жертвы (камни уже потрачены) — счётчик не уходит в минус
  ({ vi, res } = cs(100, { ruby: 1 }, { ruby: 6 }, always));
  assert.strictEqual(res.stolen.ruby, 1); assert.strictEqual(vi.counts.ruby, 0);
  ({ vi, res } = cs(100, { ruby: 0 }, { ruby: 6 }, always)); assert.strictEqual(res, null); assert.strictEqual(vi.counts.ruby, 0);
  // шанс 0 — никогда, 100 — всегда (при always), и потолок 30% соблюдается
  ({ vi, res } = cs(0, { sapphire: 8 }, { sapphire: 8 }, always)); assert.strictEqual(res, null); assert.strictEqual(vi.counts.sapphire, 8);
  ({ res } = cs(100, { sapphire: 8 }, { sapphire: 8 }, never)); assert.strictEqual(res, null, 'шанс не выпал');
  ({ res } = cs(100, { sapphire: 8 }, { sapphire: 8 }, () => 0.31)); assert.strictEqual(res, null, 'даже 100% режется до 30%');
  ({ res } = cs(100, { sapphire: 8 }, { sapphire: 8 }, () => 0.29)); assert.strictEqual(res.stolen.sapphire, 4);
  assert.strictEqual(Gear.CAPS.cunning, 30);
  assert.strictEqual(Gear.stats({ ...Gear.emptyLoadout(), amulet: 'amulet-fox' }).cunning, Gear.item('amulet-fox').stats.cunning);
}

// Кулак ярости: doubleNext удваивает ровно один следующий удар; вместе с Жертвой множители перемножаются.
{
  const f = fighter();
  Combat.applyFury(f);
  assert.strictEqual(f.doubleNext, true);
  const base = Combat.hit(fighter(), fighter(), 10, false, never).amount;
  const r1 = Combat.hit(f, fighter(), 10, false, never);
  assert.strictEqual(r1.amount, base * B.magic.fury.mult);
  assert.strictEqual(r1.fury, true);
  assert.strictEqual(f.doubleNext, false, 'одноразово');
  assert.strictEqual(Combat.hit(f, fighter(), 10, false, never).amount, base, 'второй удар обычный');
  const g = fighter();
  g.tripleNext = true; Combat.applyFury(g);
  assert.strictEqual(Combat.hit(g, fighter(), 10, false, never).amount, base * B.magic.fury.mult * B.magic.sacrifice.mult);
  assert.ok(!g.tripleNext && !g.doubleNext);
  assert.strictEqual(B.magic.costs.fury, 4);
  assert.strictEqual(B.spellUnlock.fury, 19);   // 1.3.8: Кулак ярости открывается с 6-го цвета
}

console.log('combat: все тесты пройдены');

// 1.3.8: удар может быть и заблокирован, и отражён (Блок и Рикошет бросаются независимо)
{
  const mk = (st) => ({ hp: 100, max: 100, dmg: 1, stats: { ...Gear.blankStats(), ...st }, buffs: [], ability: null });
  const atk = mk({}), tgt = mk({ block: 50, ricochet: 40, defense: 0 });
  const rand = () => 0;   // Блок и Рикошет сработали
  const r = Combat.hit(atk, tgt, 10, false, rand);
  assert.strictEqual(r.kind, 'blockreflect');
  assert.strictEqual(tgt.hp, 100, 'цель урона не получила');
  assert.ok(atk.hp < 100, 'атакующий получил отражённый урон');
  const a2 = mk({}), t2 = mk({ block: 50, ricochet: 0 });
  assert.strictEqual(Combat.hit(a2, t2, 10, false, () => 0).kind, 'block');
}
