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
assert.strictEqual(st.power, 6);
assert.strictEqual(st.defense, 5);

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
assert.ok(Gear.stats(d).defense <= Gear.MAX_DEFENSE);

// цена заклинаний: Магия снижает её, но не ниже 2
assert.strictEqual(Gear.spellCost(5, 0), 5);
assert.strictEqual(Gear.spellCost(5, 4), 4);
assert.strictEqual(Gear.spellCost(5, 12), 2);
assert.strictEqual(Gear.spellCost(5, 100), 2);

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
assert.strictEqual(xs.block, 2 + 3 + 10 + 0 + 3);     // шлем + наручи + щит + бонус набора (3 шт.: +3 блока)
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
