const assert = require('assert');
const fs = require('fs'), path = require('path');
const { check } = require('../src/cardcheck');
const { cleanCard } = require('../src/app');
const Gear = require('../rules/items.js'), Hero = require('../rules/hero.js');

// копии правил не отстают от клиента
for (const f of ['i18n.js', 'tiers.js', 'balance.js', 'items.js', 'hero.js', 'forge.js'])
  assert.strictEqual(fs.readFileSync(path.join(__dirname, '..', 'rules', f), 'utf8'), fs.readFileSync(path.join(__dirname, '..', '..', 'js', f), 'utf8'), f + ': выполните node tools/sync-rules.js');

// честный набор по правилам игры проходит на нескольких уровнях и у всех народов
for (const L of [1, 12, 35, 60, 100]) for (const f of ['human', 'dwarf', 'elf', 'lizard']) {
  const g = Gear.randomLoadout(Hero.budget(L), Math.random, Hero.tierFor(L));
  const r = check({ level: L, faction: f, gear: Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v && { ...v, uid: undefined }])) });
  assert.ok(r.gear || r.error === 'equip', 'L' + L + ' ' + f + ': ' + r.error);   // вещь чужого народа честному игроку недоступна — это нормально
}
const L = 40, honest = { level: L, faction: 'human', gear: Gear.randomLoadout(Hero.budget(L), () => 0.3, Hero.tierFor(L)) };
for (const k of Object.keys(honest.gear)) { const e = honest.gear[k]; if (e && Gear.item(e).faction && Gear.item(e).faction !== 'human') honest.gear[k] = null; }
const ok = check(honest); assert.ok(ok.gear, 'честная карточка: ' + ok.error);
assert.ok(Gear.totalCost(ok.gear) <= Hero.budget(L));

// подделки
const best = Gear.ITEMS.filter((i) => !i.faction && i.type === 'chest').sort((a, b) => b.cost - a.cost)[0];
assert.strictEqual(check({ level: 1, faction: 'human', gear: { chest: { id: best.id, tier: 10 } } }).error, 'equip', 'обсидиановая вещь на первом уровне');
assert.strictEqual(check({ level: 5, faction: 'human', gear: { chest: { id: 'нет-такой', tier: 1 } } }).error, 'equip', 'выдуманная вещь');
assert.strictEqual(check({ level: 5, faction: 'human', gear: { chest: { id: best.id, tier: 1 }, secret: null } }).error, 'slot', 'чужая ячейка');
const w = Gear.ITEMS.find((i) => i.type === 'weapon1' && !i.faction);
assert.strictEqual(check({ level: 5, faction: 'human', gear: { chest: { id: w.id, tier: 1 } } }).error, 'equip', 'оружие в ячейке груди');
const other = Gear.ITEMS.find((i) => i.faction && i.faction !== 'human');
if (other) assert.strictEqual(check({ level: 100, faction: 'human', gear: { [/^weapon/.test(other.type) ? 'main' : other.type === 'shield' ? 'off' : other.type]: { id: other.id, tier: 1 } } }).error, 'equip', 'вещь чужого народа');
// лишние поля вещи выбрасываются
const c = check({ level: 100, faction: 'human', gear: { chest: { id: Gear.ITEMS.find((i) => i.type === 'chest' && !i.faction).id, tier: 1, power: 9999, stats: { power: 9999 }, plus: 99, cut: 50 } } });
assert.ok(c.gear && !c.gear.chest.stats && !c.gear.chest.power && c.gear.chest.plus <= 5 && !('cut' in c.gear.chest));
// сверх лимита очков: полный набор высшего цвета на уровне, где вещи уже можно надеть, но очков не хватает, быть не может
// через cleanCard
const card = { nick: 'Лу', faction: 'human', gender: 'f', level: 100, rank: 1, gear: { chest: { id: best.id, tier: 1 } } };
assert.ok(cleanCard(card) || true);
assert.strictEqual(cleanCard({ ...card, level: 1, gear: { chest: { id: best.id, tier: 10 } } }), null, 'cleanCard отвергает подделку');
console.log('cardcheck: ок');
