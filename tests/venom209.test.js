// 2.0.9: Отрава как бонус комплекта; вещи подземелья — только в новых комнатах
const assert = require('assert');
global.Tiers = require('../js/tiers.js'); global.Balance = require('../js/balance.js'); global.Gear = require('../js/items.js');
const Combat = require('../js/combat.js');
const stats = (s = {}) => ({ ...Gear.blankStats(), ...s });
const fighter = (o = {}) => ({ hp: 500, max: 500, dmg: 1, stats: stats(o.stats), buffs: [], haste: false, magic: false, counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 }, ability: null, charged: false, revived: false, turnNo: 0, ...o, stats: stats(o.stats) });
const always = () => 0, never = () => 0.999;
let a = fighter({ stats: { venom: 10 } }), t = fighter();
let r = Combat.hit(a, t, 20, false, always);
assert.ok(r.venom && t.poison && t.poison.turns === Balance.faction.setVenom.turns && t.poison.dmg >= 1, 'удар отравляет');
a = fighter({ stats: { venom: 10 } }); t = fighter(); Combat.hit(a, t, 20, false, never); assert.ok(!t.poison, 'без шанса яда нет');
a = fighter(); t = fighter(); Combat.hit(a, t, 20, false, always); assert.ok(!t.poison, 'без бонуса яда нет');
assert.strictEqual(Gear.CAPS.venom, 30, 'потолок Отравы');
// комплект «Легенда Подземелий» даёт Отраву: на 3 и 5 вещах
const bon = Gear.SETS.legend.bonuses;
assert.ok(bon[3].venom > 0 && bon[5].venom > 0, 'Легенда Подземелий: Отрава на ступенях 3 и 5');
assert.ok(Object.values(Gear.SETS).every((s) => Object.values(s.bonuses).every((b) => Object.keys(b).every((k) => k === 'pet' || k in Gear.blankStats()))), 'все бонусы комплектов — известные характеристики');
console.log('venom209: все тесты пройдены');
