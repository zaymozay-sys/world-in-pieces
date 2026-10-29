// Тесты рун (runes.js): каталог, вставка/извлечение, гнёзда, сумма бонусов по снаряжению.
// Запуск: node tests/runes.test.js
const assert = require('assert');
global.Tiers = require('../js/tiers.js');
const Gear = require('../js/items.js');
global.Gear = Gear;
const Runes = require('../js/runes.js');

// Каталог: у каждой руны — валидная характеристика (та же система, что у вещей) и положительный бонус.
const statKeys = Object.keys(Gear.blankStats());
for (const [id, r] of Object.entries(Runes.CATALOG)) {
  assert.ok(statKeys.includes(r.stat), `${id}: характеристика ${r.stat} существует в Gear`);
  assert.ok(r.value > 0, `${id}: бонус положительный`);
  assert.ok(r.name && r.desc && r.color, `${id}: есть название, описание и цвет`);
}
assert.deepStrictEqual(Runes.ORDER, Object.keys(Runes.CATALOG));

// Руны не «ломают» баланс: бонус заметно меньше типичного вклада одной вещи 1-го уровня того же стата
// (ориентир — Кираса стража: +5% Броня, +3 Блок и т.п. — сравним максимум по каждой характеристике).
const ITEM_TIER1_MAX = { power: 10, health: 15, defense: 6, initiative: 6, ricochet: 3, block: 10, fury: 10 };
for (const r of Object.values(Runes.CATALOG)) assert.ok(r.value <= ITEM_TIER1_MAX[r.stat], `${r.name}: не сильнее типичной вещи 1-го цвета`);

// Гнёзда (2.0.5): цвета 1–2 — нет, 3–5 — одно, с 6-го — два.
assert.strictEqual(Runes.socketsFor({ type: 'chest' }), 0);
assert.strictEqual(Runes.socketsFor({ type: 'chest', tier: 3 }), 1);
assert.strictEqual(Runes.socketsFor({ type: 'weapon2', tier: 6 }), 2);
assert.strictEqual(Runes.socketsFor({ type: 'weapon2', tier: 10 }), 2, 'третье гнездо — самоцвет, не руна');
// рост с цветом: чем выше цвет вещи, тем сильнее руна; на 1-м уровне прежние значения
assert.ok(Runes.valueOf('rune-vitality', 10) > Runes.valueOf('rune-vitality', 3));
assert.strictEqual(Runes.valueOf('rune-might', 1), 2);
// ранг руны хранится в вещи (rr), а не берётся из цвета вещи; обновление поднимает ранг
const rx = Gear.makeEntry('leather-chest', 6); Runes.insert(rx, 'rune-vitality', 0, 4);
assert.strictEqual(Runes.rankOf(rx, 0), 4); assert.strictEqual(Runes.statsOf(rx).health, Runes.valueOf('rune-vitality', 4));
assert.strictEqual(Runes.upgrade(rx, 0, 7), true); assert.strictEqual(Runes.statsOf(rx).health, Runes.valueOf('rune-vitality', 7));
assert.strictEqual(Runes.upgrade(rx, 1, 7), false, 'пустое место не обновить');
const rtier = Gear.makeEntry('leather-chest', 10); Runes.insert(rtier, 'rune-vitality', 0, 1);
assert.strictEqual(Runes.statsOf(rtier).health, 8, 'цвет вещи руну не усиливает');

// Вставка/извлечение: мутирует экземпляр вещи (entry.runes), как это уже делает Кузница с entry.tier.
let entry = Gear.makeEntry('leather-chest', 6);
assert.strictEqual(entry.runes, undefined);
assert.strictEqual(Runes.insert(entry, 'rune-vitality'), true);
assert.deepStrictEqual(entry.runes, ['rune-vitality']);
assert.strictEqual(Runes.insert(entry, 'not-a-rune'), false, 'неизвестная руна — вставка отклонена');
assert.deepStrictEqual(entry.runes, ['rune-vitality'], 'ничего не изменилось после неудачной вставки');
assert.deepStrictEqual(Runes.statsOf(entry), { ...Gear.blankStats(), health: Runes.valueOf('rune-vitality', 1) });
assert.strictEqual(Runes.remove(entry), true);
assert.deepStrictEqual(entry.runes, [undefined]);
assert.strictEqual(Runes.remove(entry), false, 'повторное извлечение ничего не делает');
assert.deepStrictEqual(Runes.statsOf(entry), Gear.blankStats());

// Второе гнездо: вставка без указания слота идёт в первое свободное — оба гнезда работают независимо.
assert.strictEqual(Runes.insert(entry, 'rune-might'), false, '2.0.8: руна мощи не вставляется в нагрудник');
Runes.insert(entry, 'rune-fury');                  // слот 0 (пустой)
Runes.insert(entry, 'rune-haste');                 // слот 1 (первый свободный)
assert.deepStrictEqual(entry.runes, ['rune-fury', 'rune-haste']);
assert.deepStrictEqual(Runes.statsOf(entry), { ...Gear.blankStats(), fury: Runes.valueOf('rune-fury', 1), initiative: Runes.valueOf('rune-haste', 1) });
// Оба гнезда заняты — вставка без слота заменяет 0-е (как раньше при одном гнезде).
Runes.insert(entry, 'rune-ward');
assert.deepStrictEqual(entry.runes, ['rune-ward', 'rune-haste']);
// Явный выбор гнезда — извлечение и вставка по конкретному слоту.
assert.strictEqual(Runes.remove(entry, 1), true);
assert.deepStrictEqual(entry.runes, ['rune-ward', undefined]);
assert.strictEqual(Runes.insert(entry, 'rune-thorn', 1), true);
assert.deepStrictEqual(entry.runes, ['rune-ward', 'rune-thorn']);
// Миграция: старое поле entry.rune (одно гнездо, до Мастерской) читается как runes[0].
let legacy = Gear.makeEntry('leather-chest', 6);
legacy.rune = 'rune-fury';
assert.deepStrictEqual(Runes.statsOf(legacy), { ...Gear.blankStats(), fury: Runes.valueOf('rune-fury', 1) });
assert.strictEqual(Runes.insert(legacy, 'rune-haste', 1), true);
assert.deepStrictEqual(legacy.runes, ['rune-fury', 'rune-haste']);
assert.strictEqual(legacy.rune, undefined, 'старое поле заменяется на runes при первом обращении');

// Сумма бонусов по всему снаряжению: руны в разных ячейках складываются, в т.ч. одна и та же характеристика.
let gear = Gear.emptyLoadout();
const main = Gear.makeEntry('sword-novice', 3);   // power 6
Runes.insert(main, 'rune-might');                 // +2 Сила
const off = Gear.makeEntry('sword-novice', 3);
Runes.insert(off, 'rune-might');                  // ещё +2 Сила (одноручное в левой руке)
gear = Gear.equip(gear, main, 'main');
gear = Gear.equip(gear, off, 'off');
assert.strictEqual(Runes.bonusForGear(gear).power, Runes.valueOf('rune-might', 1) + Runes.valueOf('rune-might', 1), 'два rune-might в разных ячейках складываются');

// Пустая ячейка / вещь без руны не даёт бонуса; снаряжение без рун — нулевые бонусы.
let plain = Gear.equip(Gear.emptyLoadout(), Gear.makeEntry('shield-wood', 1), 'off');
assert.deepStrictEqual(Runes.bonusForGear(plain), Gear.blankStats());
assert.deepStrictEqual(Runes.bonusForGear(Gear.emptyLoadout()), Gear.blankStats());

// Подробности о предмете (значок «i», см. ItemInfo в inventory.js) читают название типа/редкости
// из тех же справочников, что и остальной интерфейс — убедимся, что для каждой вещи они найдутся.
for (const it of Gear.ITEMS) {
  assert.ok(Gear.TYPE_NAMES[it.type], `${it.id}: есть название типа`);
  assert.ok(Gear.RARITY_NAMES[it.rarity], `${it.id}: есть название редкости`);
}

console.log('runes: все тесты пройдены');

// 2.0.8: руна мощи — только в оружие (одно- и двуручное); в остальные вещи не вставляется и не считается
{
  const hammer = Gear.makeEntry('rune-hammer', 6), cuirass = Gear.makeEntry('leather-chest', 6);
  const sword = Gear.makeEntry('sword-novice', 3);
  assert.ok(Runes.allows(sword, 'rune-might') && !Runes.allows(hammer, 'rune-might'), 'обычная руна мощи — только в одноручное');
  assert.ok(Runes.allows(hammer, 'rune-might2') && !Runes.allows(sword, 'rune-might2') && !Runes.allows(cuirass, 'rune-might2'), 'двойная — только в двуручное');
  assert.ok(!Runes.allows(cuirass, 'rune-might') && !Runes.allows(Gear.makeEntry('shield-wood', 3), 'rune-might'));
  for (const k of [1, 3, 6, 9, 10]) assert.strictEqual(Runes.valueOf('rune-might2', k), 2 * Runes.valueOf('rune-might', k), 'двойная руна ровно вдвое сильнее, ранг ' + k);
  { const two = Gear.makeEntry('rune-hammer', 6), one = Gear.makeEntry('sword-novice', 6);
    Runes.insert(two, 'rune-might2', 0, 5); Runes.insert(two, 'rune-might2', 1, 5); Runes.insert(one, 'rune-might', 0, 5); Runes.insert(one, 'rune-might', 1, 5);
    assert.strictEqual(Runes.statsOf(two).power, 2 * Runes.statsOf(one).power, 'двуручное с рунами = два одноручных с рунами'); }
  assert.ok(Runes.SHOP.includes('rune-might') && !Runes.SHOP.includes('rune-might2'), 'двойная руна не продаётся');
  assert.ok(Runes.allows(cuirass, 'rune-vitality'), 'остальные руны — в любую вещь');
  assert.strictEqual(Runes.insert(cuirass, 'rune-might'), false);
  const forced = Object.assign(Gear.makeEntry('leather-chest', 6), { runes: ['rune-might'] });
  assert.strictEqual(Runes.statsOf(forced).power, 0, 'старая руна мощи вне оружия силы не даёт');
}
console.log('runes 2.0.8: руна мощи только в оружие — ok');
