// 2.3.8: Регенерация (вампиризм): шанс срабатывания и сила (доля нанесённого урона)
const assert = require('assert');
global.Tiers = require('../js/tiers.js'); global.Balance = require('../js/balance.js'); global.Gear = require('../js/items.js');
const Combat = require('../js/combat.js');
const stats = (s = {}) => ({ ...Gear.blankStats(), ...s });
const fighter = (o = {}) => ({ hp: 500, max: 500, dmg: 1, stats: stats(o.stats), buffs: [], haste: false, magic: false, counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 }, ability: null, charged: false, revived: false, turnNo: 0, ...o, stats: stats(o.stats) });
const always = () => 0, never = () => 0.999;
// срабатывание: 100 урона, сила 40% → лечит на 40 (тут урон 100 без Брони)
let a = fighter({ hp: 200, stats: { leech: 50, leechPower: 40 } }), t = fighter();
let r = Combat.hit(a, t, 100, false, always);
assert.strictEqual(t.hp, 400, 'цель потеряла 100');
assert.strictEqual(r.leech, 40, 'вылечено 40% урона'); assert.strictEqual(a.hp, 240);
// без шанса — не лечит
a = fighter({ hp: 200, stats: { leech: 50, leechPower: 40 } }); t = fighter(); r = Combat.hit(a, t, 100, false, never);
assert.ok(!r.leech && a.hp === 200, 'без срабатывания нет лечения');
// без характеристики и с нулевой силой — не лечит и не тратит бросок
let calls = 0; const counting = () => { calls++; return 0; };
a = fighter({ hp: 200 }); t = fighter(); Combat.hit(a, t, 100, false, counting); const base = calls;
a = fighter({ hp: 200, stats: { leech: 50, leechPower: 0 } }); t = fighter(); calls = 0; Combat.hit(a, t, 100, false, counting);
assert.strictEqual(calls, base, 'при нулевой силе лишних бросков нет'); assert.strictEqual(a.hp, 200);
// не выше максимума
a = fighter({ hp: 490, stats: { leech: 50, leechPower: 40 } }); t = fighter(); r = Combat.hit(a, t, 100, false, always);
assert.strictEqual(a.hp, 500); assert.strictEqual(r.leech, 10, 'лечит только до максимума');
// считается от реально снятого здоровья: у цели осталось 30 ХП, удар 100 → лечит от 30
a = fighter({ hp: 100, stats: { leech: 50, leechPower: 40 } }); t = fighter({ hp: 30 }); r = Combat.hit(a, t, 100, false, always);
assert.strictEqual(r.leech, 12, 'лечение от фактически снятого здоровья');
// блок: нет урона — нет лечения
a = fighter({ hp: 100, stats: { leech: 50, leechPower: 40 } }); t = fighter({ stats: { block: 50 } }); r = Combat.hit(a, t, 100, false, always);
assert.ok(!r.leech && a.hp === 100, 'заблокированный удар не лечит');
// броня уменьшает урон, значит и лечение
a = fighter({ hp: 100, stats: { leech: 50, leechPower: 40 } }); t = fighter({ stats: { defense: 30 } }); r = Combat.hit(a, t, 100, false, always);
assert.ok(r.leech > 0 && r.leech <= Math.round(r.amount * 0.4) + 1, 'лечение считается от урона после Брони');
// потолки и пустой профиль
assert.strictEqual(Gear.CAPS.leech, 50); assert.strictEqual(Gear.CAPS.leechPower, 30);
const s = Gear.capStats ? Gear.capStats({ ...Gear.blankStats(), leech: 99, leechPower: 99 }) : null; if (s) { assert.strictEqual(s.leech, 50); assert.strictEqual(s.leechPower, 30); }
assert.strictEqual(Gear.blankStats().leech, 0); assert.strictEqual(Gear.blankStats().leechPower, 0);
// старый боец без полей характеристики не ломается
const old = fighter(); delete old.stats.leech; delete old.stats.leechPower; assert.doesNotThrow(() => Combat.hit(old, fighter(), 50, false, always));
// детерминизм: одинаковый ряд бросков — одинаковый результат
const seq = (seed) => { let x = seed; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
const run = () => { const rr = seq(7); let aa = fighter({ hp: 100, stats: { leech: 40, leechPower: 25 } }), tt = fighter({ hp: 2000, max: 2000 }); for (let i = 0; i < 30; i++) Combat.hit(aa, tt, 37, false, rr); return aa.hp + ':' + tt.hp; };
assert.strictEqual(run(), run(), 'детерминизм');
console.log('leech238: все тесты пройдены');
