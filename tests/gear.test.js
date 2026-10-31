// Тесты предметов, наборов и характеристик. Запуск: node tests/gear.test.js
const assert = require('assert');
const Gear = require('../js/items.js');

// у каждого предмета есть цена, а id уникальны
const ids = new Set(Gear.ITEMS.map((i) => i.id));
assert.strictEqual(ids.size, Gear.ITEMS.length, 'id предметов уникальны');
assert.ok(Gear.ITEMS.every((i) => i.cost > 0));

// подбор ячеек: двуручное — только в правую руку, щит — только в левую
assert.ok(Gear.fits('main', 'weapon2') && !Gear.fits('off', 'weapon2'));
assert.ok(Gear.fits('off', 'shield') && !Gear.fits('main', 'shield'));
assert.ok(Gear.fits('off', 'weapon1') && Gear.fits('main', 'weapon1'));

// двуручное оружие освобождает левую руку и блокирует её
let g = Gear.emptyLoadout();
g = Gear.equip(g, 'shield-wood', 'off');
g = Gear.equip(g, 'sword-two', 'main');
assert.strictEqual(g.off, null);
assert.strictEqual(Gear.canEquip(g, 'shield-wood', 'off').ok, false);

// один предмет нельзя надеть дважды
let h = Gear.equip(Gear.emptyLoadout(), 'wand-dagger', 'main');
assert.strictEqual(Gear.canEquip(h, 'wand-dagger', 'off').ok, false);

// характеристики предметов складываются
let s = Gear.emptyLoadout();
s = Gear.equip(s, 'sword-novice', 'main');       // Сила 6
s = Gear.equip(s, 'shield-wood', 'off');         // Защита 5
let st = Gear.stats(s);
assert.strictEqual(st.power, Math.max(1, Math.round(6 * require('../js/tiers.js').POWER_ABS[0])));
assert.strictEqual(st.defense, Math.max(1, Math.round(5 * require('../js/tiers.js').ARMOR_ABS[0])));

// бонусы набора включаются по числу предметов (2 шт. Стража: +10 здоровья)
let a = Gear.emptyLoadout();
a = Gear.equip(a, 'guard-head', 'head');
a = Gear.equip(a, 'guard-chest', 'chest');
const withoutSet = 8 + 15;                       // здоровье двух предметов
assert.strictEqual(Gear.stats(a).health, withoutSet + 10);
const prog = Gear.setProgress(a).find((p) => p.id === 'guard');
assert.strictEqual(prog.count, 2);
assert.strictEqual(prog.active.length, 1);

// защита ограничена
let d = Gear.emptyLoadout();
for (const [slot, id] of [['off', 'guard-shield'], ['head', 'guard-head'], ['chest', 'guard-chest'], ['arms', 'guard-arms'], ['legs', 'guard-legs']]) d = Gear.equip(d, id, slot);
assert.ok(Gear.stats(d).defense >= 0);   // 2.0.7: потолка Брони нет

// цена заклинаний не зависит от характеристик, но не ниже 2
assert.strictEqual(Gear.spellCost(5), 5);
assert.strictEqual(Gear.spellCost(1), 2);

// случайное снаряжение противника укладывается в лимит очков и подчиняется правилам рук
for (const budget of [10, 40, 90, 150]) {
  for (let i = 0; i < 50; i++) {
    const r = Gear.randomLoadout(budget);
    assert.ok(Gear.totalCost(r) <= budget, `лимит ${budget}`);
    const main = Gear.item(r.main);
    if (main && main.type === 'weapon2') assert.strictEqual(r.off, null);
    const worn = Gear.equipped(r).map((x) => x.uid);   // экземпляры не повторяются (одинаковые вещи допустимы)
    assert.strictEqual(new Set(worn).size, worn.length);
  }
}

// у каждого предмета свой набор характеристик
const sigs = Gear.ITEMS.map((i) => JSON.stringify(Object.entries(i.stats).sort()));
assert.strictEqual(new Set(sigs).size, sigs.length, 'наборы характеристик предметов не повторяются');

// новые характеристики есть и ограничены потолками
let x = Gear.emptyLoadout();
for (const [slot, id] of [['off', 'guard-shield'], ['head', 'guard-head'], ['arms', 'guard-arms'], ['main', 'sword-novice']]) x = Gear.equip(x, id, slot);
const xs = Gear.stats(x);
assert.strictEqual(xs.block, ['guard-head', 'guard-arms', 'guard-shield', 'sword-novice'].reduce((a, id) => a + (Gear.item(id).stats.block || 0), 0) + 3);     // шлем + наручи + щит + бонус набора (3 шт.: +3 блока); 2.0.5: значения по цвету 1
assert.ok(xs.initiative >= 0 && xs.ricochet >= 0);
for (const k of Object.keys(Gear.CAPS)) assert.ok(xs[k] <= Gear.CAPS[k]);
// потолок блока
const many = Gear.emptyLoadout();
for (const slot of Gear.SLOTS) many[slot] = null;
assert.strictEqual(Gear.stats(many).block, 0);

// цена предмета учитывает новые характеристики
assert.ok(Gear.item('guard-shield').cost > Gear.item('shield-wood').cost);

// Хитрость: новая характеристика — имя, потолок, пустое значение, источник (Амулет лиса) и бонус набора Странник
assert.strictEqual(Gear.STAT_NAMES.cunning, 'Хитрость');
assert.strictEqual(Gear.CAPS.cunning, 30);
assert.strictEqual(Gear.blankStats().cunning, 0);
const fox = Gear.item('amulet-fox');
assert.ok(fox && fox.type === 'amulet' && fox.stats.cunning > 0, 'Амулет лиса даёт Хитрость');
assert.ok(fox.cost > Gear.item('amulet-spark').cost, 'Хитрость учитывается в цене');
assert.ok(Object.values(Gear.SETS.wanderer.bonuses).some((b) => b.cunning > 0), 'Странник даёт Хитрость бонусом набора');

console.log('gear: все тесты пройдены');

// 2.0.7: новые комплекты
{
  const N = ['swift', 'archer', 'ancient', 'tracker', 'hammer', 'bastion', 'legend'];
  for (const id of N) assert.strictEqual(Gear.ITEMS.filter((i) => i.set === id).length, 7, id + ': 7 вещей');   // 2.0.9: комплекты доведены до 7 вещей
  for (const id of ['hammer', 'bastion', 'legend']) assert.ok(!Gear.itemsFor('human').some((i) => i.set === id), id + ' не выпадает обычной добычей');
  assert.ok(Gear.itemsFor('human').some((i) => i.set === 'swift'));
  assert.ok(Gear.ITEMS.filter((i) => i.set === 'bastion').every((i) => !i.stats.power), 'Бастион без Силы');
  assert.ok(Gear.ITEMS.filter((i) => i.set === 'ancient').every((i) => !i.stats.block && !i.stats.ricochet), 'Древний панцирь без Блока и Рикошета');
  const tr = Gear.ITEMS.filter((i) => i.set === 'tracker');
  let g = Gear.emptyLoadout();
  for (const it of tr) { const slot = it.type === 'weapon1' ? 'main' : it.type; g = Gear.equip(g, Gear.makeEntry(it.id, 1), slot); }
  assert.strictEqual(Gear.petBonus(g), 1, 'Следопыт ×7 усиливает питомца');
  assert.ok(Number.isFinite(Gear.stats(g).power), 'бонус питомца не ломает характеристики');
}
