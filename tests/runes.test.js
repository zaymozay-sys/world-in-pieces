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
const ITEM_TIER1_MAX = { power: 10, health: 15, defense: 6, magic: 4, initiative: 6, ricochet: 3, block: 10, fury: 10 };
for (const r of Object.values(Runes.CATALOG)) assert.ok(r.value <= ITEM_TIER1_MAX[r.stat], `${r.name}: не сильнее типичной вещи 1-го цвета`);

// Гнёзда: 2 — открыты Мастерской художника (было 1, пока руны временно продавались в Лавке).
assert.strictEqual(Runes.socketsFor({ type: 'chest' }), 2);
assert.strictEqual(Runes.socketsFor({ type: 'weapon2' }), 2);

// Вставка/извлечение: мутирует экземпляр вещи (entry.runes), как это уже делает Кузница с entry.tier.
let entry = Gear.makeEntry('leather-chest', 1);
assert.strictEqual(entry.runes, undefined);
assert.strictEqual(Runes.insert(entry, 'rune-vitality'), true);
assert.deepStrictEqual(entry.runes, ['rune-vitality']);
assert.strictEqual(Runes.insert(entry, 'not-a-rune'), false, 'неизвестная руна — вставка отклонена');
assert.deepStrictEqual(entry.runes, ['rune-vitality'], 'ничего не изменилось после неудачной вставки');
assert.deepStrictEqual(Runes.statsOf(entry), { ...Gear.blankStats(), health: 8 });
assert.strictEqual(Runes.remove(entry), true);
assert.deepStrictEqual(entry.runes, [undefined]);
assert.strictEqual(Runes.remove(entry), false, 'повторное извлечение ничего не делает');
assert.deepStrictEqual(Runes.statsOf(entry), Gear.blankStats());

// Второе гнездо: вставка без указания слота идёт в первое свободное — оба гнезда работают независимо.
Runes.insert(entry, 'rune-might');                 // слот 0 (пустой)
Runes.insert(entry, 'rune-haste');                 // слот 1 (первый свободный)
assert.deepStrictEqual(entry.runes, ['rune-might', 'rune-haste']);
assert.deepStrictEqual(Runes.statsOf(entry), { ...Gear.blankStats(), power: 4, initiative: 3 });
// Оба гнезда заняты — вставка без слота заменяет 0-е (как раньше при одном гнезде).
Runes.insert(entry, 'rune-ward');
assert.deepStrictEqual(entry.runes, ['rune-ward', 'rune-haste']);
// Явный выбор гнезда — извлечение и вставка по конкретному слоту.
assert.strictEqual(Runes.remove(entry, 1), true);
assert.deepStrictEqual(entry.runes, ['rune-ward', undefined]);
assert.strictEqual(Runes.insert(entry, 'rune-thorn', 1), true);
assert.deepStrictEqual(entry.runes, ['rune-ward', 'rune-thorn']);
// Миграция: старое поле entry.rune (одно гнездо, до Мастерской) читается как runes[0].
let legacy = Gear.makeEntry('leather-chest', 1);
legacy.rune = 'rune-fury';
assert.deepStrictEqual(Runes.statsOf(legacy), { ...Gear.blankStats(), fury: 4 });
assert.strictEqual(Runes.insert(legacy, 'rune-haste', 1), true);
assert.deepStrictEqual(legacy.runes, ['rune-fury', 'rune-haste']);
assert.strictEqual(legacy.rune, undefined, 'старое поле заменяется на runes при первом обращении');

// Сумма бонусов по всему снаряжению: руны в разных ячейках складываются, в т.ч. одна и та же характеристика.
let gear = Gear.emptyLoadout();
const main = Gear.makeEntry('sword-novice', 1);   // power 6
Runes.insert(main, 'rune-might');                 // +4 power
const chest = Gear.makeEntry('leather-chest', 1);
Runes.insert(chest, 'rune-might');                 // ещё +4 power
gear = Gear.equip(gear, main, 'main');
gear = Gear.equip(gear, chest, 'chest');
assert.strictEqual(Runes.bonusForGear(gear).power, 8, 'два rune-might в разных ячейках складываются');

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
