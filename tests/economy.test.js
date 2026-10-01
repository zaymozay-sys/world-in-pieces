// Тесты уровней-цветов, денег, кузницы и бестиария. Запуск: node tests/economy.test.js
const assert = require('assert');
const Tiers = require('../js/tiers.js');
global.Tiers = Tiers;
const Gear = require('../js/items.js');
global.Gear = Gear;
const Bestiary = require('../js/bestiary.js');

// десять уровней: сначала радуга, затем серебро, золото и обсидиановый
assert.strictEqual(Tiers.LIST.length, 10);
assert.deepStrictEqual(Tiers.LIST.map((t) => t.name),
  ['Красный', 'Оранжевый', 'Жёлтый', 'Зелёный', 'Голубой', 'Синий', 'Фиолетовый', 'Серебро', 'Золото', 'Обсидиановый']);
// у каждого уровня есть цвет обводки (edge) и цвет текста на плашке (ink); тёмный обсидиан обведён светлым
for (const t of Tiers.LIST) assert.ok(t.edge && t.ink, t.name);
assert.notStrictEqual(Tiers.get(10).edge, Tiers.get(10).color);
for (let i = 1; i < 10; i++) {
  assert.ok(Tiers.GROWTH[i] > Tiers.GROWTH[i - 1] && Tiers.PCT_MULT[i] > Tiers.PCT_MULT[i - 1] && Tiers.PRICE_MULT[i] > Tiers.PRICE_MULT[i - 1]);
  assert.notStrictEqual(Tiers.LIST[i].color, Tiers.LIST[i - 1].color);
}
assert.strictEqual(Tiers.clamp(0), 1);
assert.strictEqual(Tiers.clamp(99), 10);

// деньги: 100 медных = 1 серебряная, 100 серебряных = 1 золотая
assert.deepStrictEqual(Tiers.splitMoney(1), { gold: 0, silver: 0, copper: 1 });
assert.deepStrictEqual(Tiers.splitMoney(12345), { gold: 1, silver: 23, copper: 45 });
assert.strictEqual(Tiers.moneyText(0), '0 мед.');

// характеристики и цена предмета растут с уровнем
const lo = Gear.item({ id: 'guard-shield', tier: 1 }), hi = Gear.item({ id: 'guard-shield', tier: 10 });
assert.ok(hi.stats.block > lo.stats.block && hi.stats.defense > lo.stats.defense);
assert.ok(hi.cost > lo.cost && hi.price > lo.price);
assert.strictEqual(Gear.item('guard-shield').tier, 1);           // строка = первый уровень (Красный)
assert.ok(Gear.sellValue(hi.price) < hi.price);                  // продавать невыгодно

// экземпляры: одинаковые вещи допустимы, но один экземпляр нельзя надеть дважды
const a = Gear.makeEntry('wand-dagger', 1), b = Gear.makeEntry('wand-dagger', 1);
let g = Gear.equip(Gear.emptyLoadout(), a, 'main');
assert.strictEqual(Gear.canEquip(g, b, 'off').ok, true);
assert.strictEqual(Gear.canEquip(g, a, 'off').ok, false);

// врождённые способности складываются с предметами и ограничены потолками
const merged = Gear.combine({ block: 40, power: 10 }, { block: 30, power: 5 });
assert.strictEqual(merged.block, Gear.CAPS.block);
assert.strictEqual(merged.power, 15);

// кузница: улучшение требует ресурсы ТЕКУЩЕГО цвета; на максимуме улучшать нельзя
const up1 = Gear.upgradeCost({ id: 'sword-novice', tier: 1 });
assert.ok(up1.coins > 0 && up1.res.every((r) => r.tier === 1));
const up5 = Gear.upgradeCost({ id: 'sword-novice', tier: 5 });
assert.ok(up5.res.every((r) => r.tier === 5) && up5.res[0].n > up1.res[0].n);
assert.strictEqual(Gear.upgradeCost({ id: 'sword-novice', tier: 10 }), null);
// ресурсы зависят от типа вещи
assert.deepStrictEqual(up1.res.map((r) => r.kind), ['ore', 'fang']);
assert.deepStrictEqual(Gear.upgradeCost({ id: 'amulet-copper', tier: 1 }).res.map((r) => r.kind), ['crystal', 'essence']);
// создание вещи нужного цвета: ресурсы того же цвета, цена растёт с цветом
const c3 = Gear.craftCost('leather-head', 3);
assert.ok(c3.res.every((r) => r.tier === 3) && c3.coins > Gear.craftCost('leather-head', 1).coins);
// создание: редкие вещи дороже обычных
assert.ok(Gear.craftCost('berserk-amulet').res[0].n > Gear.craftCost('leather-head').res[0].n);

// бестиарий: 21 вид, характеристики и ХП растут с цветом; у каждого вида есть семейство и приём
assert.strictEqual(Bestiary.ORDER.length, 21);
for (const id of ['orc', 'orcShaman', 'ghoul', 'crab', 'bolotnik', 'shadow', 'treant', 'mushroom', 'wildbees', 'lynx', 'hedgehog']) assert.ok(Bestiary.ORDER.includes(id), id);
for (const id of Bestiary.ORDER) {
  const m = Bestiary.MONSTERS[id];
  assert.ok(m.family, id);
  assert.ok(Bestiary.ABILITIES[m.ability], id + ': приём ' + m.ability);
  assert.strictEqual(Bestiary.ability(id), Bestiary.ABILITIES[m.ability]);
}
assert.deepStrictEqual(Bestiary.ORDER.filter((id) => Bestiary.MONSTERS[id].family === 'Нежить').sort(), ['ghoul', 'skeleton', 'wraith']);
assert.deepStrictEqual(Bestiary.ORDER.filter((id) => Bestiary.MONSTERS[id].family === 'Орки').sort(), ['orc', 'orcShaman']);
for (const id of Bestiary.ORDER) {
  const s1 = Bestiary.scaled(id, 1), s10 = Bestiary.scaled(id, 10);
  assert.ok(s10.hp > s1.hp && s10.ai >= s1.ai && s10.ai <= 100);
  assert.ok(Bestiary.MONSTERS[id].drops.length > 0);
  for (const [kind] of Bestiary.MONSTERS[id].drops) assert.ok(Bestiary.RESOURCES[kind], kind);
}
assert.deepStrictEqual(Bestiary.unlockedSpecies(0), ['rat', 'wolf']);
assert.strictEqual(Bestiary.unlockedSpecies(999).length, 21);
// снаряжение только у дракона
assert.ok(Bestiary.scaled('dragon', 3).gearBudget > 0 && Bestiary.scaled('wolf', 3).gearBudget === 0);

// добыча: ресурсы выпадают того же цвета, что и монстр; монеты растут с цветом
const always = () => 0.0001;
const d3 = Bestiary.rollDrops('wolf', 3, always);
assert.ok(d3.resources.length && d3.resources.every((r) => r.tier === 3));
assert.ok(d3.item && d3.item.tier >= 2);
const never = () => 0.9999;
const none = Bestiary.rollDrops('wolf', 3, never);
assert.strictEqual(none.item, null);
assert.ok(Bestiary.rollDrops('wolf', 8, () => 0.5).coins > Bestiary.rollDrops('wolf', 1, () => 0.5).coins);
// вещи других фракций с монстров не падают: без фракции — только общие, с фракцией — общие и свои
let seed = 7;
const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
let elfItems = 0;
for (let i = 0; i < 3000; i++) {
  const plain = Bestiary.rollDrops('troll', 4, rng);
  if (plain.item) assert.ok(!Gear.item(plain.item).faction, plain.item.id);
  const elf = Bestiary.rollDrops('troll', 4, rng, 'elf');
  if (elf.item) {
    const f = Gear.item(elf.item).faction;
    assert.ok(!f || f === 'elf', elf.item.id);
    if (f === 'elf') elfItems++;
  }
}
assert.ok(elfItems > 0, 'эльфу должны иногда падать эльфийские вещи');

// Дикие пчёлы: рой — размер (1/3/5) выпадает случайно и умножает ХП/урон, но не другие характеристики
assert.deepStrictEqual(Bestiary.rollSwarmSize('wolf', () => 0.5), 1, 'у вида без swarm всегда 1');
const sizes = new Set();
for (let i = 0; i < 500; i++) sizes.add(Bestiary.rollSwarmSize('wildbees', () => i / 500));
assert.deepStrictEqual([...sizes].sort((a, b) => a - b), [1, 3, 5]);
const bee1 = Bestiary.scaled('wildbees', 1, 1), bee3 = Bestiary.scaled('wildbees', 1, 3), bee5 = Bestiary.scaled('wildbees', 1, 5);
assert.ok(bee3.hp > bee1.hp && bee5.hp > bee3.hp, 'рой крупнее — существо живучее');
assert.ok(bee3.dmg > bee1.dmg && bee5.dmg > bee3.dmg, 'рой крупнее — бьёт больнее');
assert.strictEqual(bee1.ai, bee3.ai, 'размер роя не меняет уровень ИИ');
assert.ok(Bestiary.RESOURCES.honey, 'ресурс «Мёд» добавлен');
assert.ok(Bestiary.MONSTERS.wildbees.drops.some(([kind]) => kind === 'honey'));

// Лавка: покупка партией (стерперы ×1/×5/×10/×25) — цена = единичная × количество
assert.strictEqual(Gear.bulkPrice(37, 5), 185);
assert.strictEqual(Gear.bulkPrice(37, 1), 37);
assert.strictEqual(Gear.bulkPrice(37.6, 3), Math.round(37.6) * 3);
assert.strictEqual(Gear.bulkPrice(10, 0), 10);            // меньше 1 не бывает — трактуем как 1

// Пикер «Отточить мастерство» у бобра (screens.js) должен читать список заклинаний из
// Balance.magic.costs каждый раз заново, а не хранить отдельный захардкоженный список —
// иначе список рассинхронизируется, когда кто-то добавляет новое заклинание в Balance.
const screensSrc = require('fs').readFileSync(require('path').join(__dirname, '../js/screens.js'), 'utf8');
assert.ok(/Object\.keys\(Balance\.magic\.costs\)/.test(screensSrc),
  'пикер заклинаний бобра читает ключи прямо из Balance.magic.costs');

console.log('economy: все тесты пройдены');
