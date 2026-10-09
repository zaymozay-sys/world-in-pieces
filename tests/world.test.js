// 1.5.4: «живой мир» — события, логова, элитные, Арена теней, Испытание дня. Запуск: node tests/world.test.js
const assert = require('assert');
global.Tiers = require('../js/tiers.js');
global.Gear = require('../js/items.js');
global.Bestiary = require('../js/bestiary.js');
const HexMap = require('../js/hexmap.js');
global.HexMap = HexMap;
const World = require('../js/world.js');

for (const seed of [1, 777, 424242]) {
  const map = HexMap.generate(seed);
  const spawnsBefore = JSON.stringify(map.spawns);
  const w = World.place(map), w2 = World.place(HexMap.generate(seed));
  assert.strictEqual(JSON.stringify(map.spawns), spawnsBefore, 'существа на карте не меняются');
  assert.deepStrictEqual(w.events, w2.events, 'события по зерну одинаковы');
  assert.deepStrictEqual(w.lairs, w2.lairs, 'логова по зерну одинаковы');
  assert.deepStrictEqual([...w.elites], [...w2.elites], 'элитные по зерну одинаковы');
  assert.strictEqual(w.lairs.length, World.LAIR_TIERS.length, 'логово на каждый цвет');
  assert.deepStrictEqual(w.lairs.map((l) => l.tier), World.LAIR_TIERS);
  assert.ok(w.events.length >= 20, 'событий хватает: ' + w.events.length);
  const spawnCells = new Set(map.spawns.map((s) => s.idx));
  const used = new Set();
  for (const e of [...w.events, ...w.lairs]) {
    const c = map.cells[e.idx];
    assert.ok(!spawnCells.has(e.idx) && !c.building && !c.road && HexMap.passable(map, e.idx) && map.reachable.has(e.idx), 'событие на свободной проходимой соте');
    assert.ok(c.d > HexMap.VILLAGE_R + 2, 'не в деревне');
    assert.ok(!used.has(e.idx), 'по одному событию на соту'); used.add(e.idx);
  }
  for (const e of w.events) assert.ok(World.EVENTS[e.kind], 'известный вид события');
  const normal = map.spawns.filter((s) => !s.boss && s.tier >= 2).length;
  assert.ok(w.elites.size > 0 && w.elites.size < normal * 0.25, 'элитных около 10%: ' + w.elites.size + '/' + normal);
  for (const [id, ax] of w.elites) { assert.ok(World.AFFIXES[ax]); assert.ok(!map.spawns[id].boss); }
}
// свойство не совпадает с приёмом вида
for (const a of World.AFFIX_IDS) assert.notStrictEqual(World.affixFor(a, a), a);
assert.strictEqual(World.affixFor('veil', 'howl'), 'veil');
for (const g of Object.values(World.GUARDIANS)) for (const a of g.affixes) assert.ok(World.AFFIXES[a]);

// быстрый бой: только слабые, побеждённые, не стражи и не элитные
assert.ok(World.quickAllowed({ tier: 1 }, 3, true, null));
assert.ok(!World.quickAllowed({ tier: 2 }, 3, true, null), 'на 1 цвет ниже — нельзя');
assert.ok(!World.quickAllowed({ tier: 1 }, 3, false, null), 'не побеждённый вид — нельзя');
assert.ok(!World.quickAllowed({ tier: 1, boss: 'b1' }, 5, true, null), 'страж — нельзя');
assert.ok(!World.quickAllowed({ tier: 1 }, 5, true, 'veil'), 'элитный — нельзя');

// логова
assert.deepStrictEqual([2, 6, 9].map(World.lairLength), [3, 4, 5]);
assert.ok(World.lairChestCoins(9, 5) > World.lairChestCoins(2, 3));

// арена: звёзды и ранги
const a = World.freshArena();
World.arenaResult(a, false); assert.strictEqual(a.stars, 0, 'звёзды не уходят в минус');
World.arenaResult(a, true); World.arenaResult(a, true);
const up = World.arenaResult(a, true);
assert.ok(up.rankUp && a.rank === 1 && a.stars === 0, 'три звезды — новый ранг');
World.arenaResult(a, false); assert.strictEqual(a.rank, 1, 'поражение ранг не отнимает');
const top = Object.assign(World.freshArena(), { rank: World.RANKS.length - 1 });
World.arenaResult(top, true); assert.strictEqual(top.rank, World.RANKS.length - 1, 'выше легенды некуда');
const sh = World.shadow(5, 40, () => 0.3);
assert.ok(sh.level === 42 && sh.ai === 65 && ['human', 'dwarf', 'elf', 'lizard'].includes(sh.faction));
assert.strictEqual(World.shadow(0, 1, () => 0.5).level, 1, 'уровень тени не ниже 1');
for (const id of Object.values(World.RANK_TITLES)) assert.ok(require('../js/village.js').TITLES.find((t) => t.id === id && t.arena), 'титул ранга есть в Гардеробе и не продаётся');

// испытание дня: одно на всех в этот день
const c1 = World.challengeFor('2026-10-09'), c2 = World.challengeFor('2026-10-09');
assert.deepStrictEqual(c1, c2);
assert.ok(Bestiary.MONSTERS[c1.species] && c1.tier === 2 && c1.seed > 0);
const days = new Set(Array.from({ length: 30 }, (_, i) => World.challengeFor('2026-11-' + String(i + 1).padStart(2, '0')).species));
assert.ok(days.size >= 5, 'противники меняются по дням');
for (const id of World.CH_POOL) assert.ok(Bestiary.MONSTERS[id], 'вид испытания есть: ' + id);
assert.ok(World.challengeScore(true, 1, 10, 1) > World.challengeScore(true, 0.2, 30, 1));
assert.ok(World.challengeScore(false, 0, 40, 0.99) < World.challengeScore(true, 0, 40, 1), 'любая победа выше поражения');

console.log('world 1.5.4: все тесты пройдены');

// 1.5.4: Врата подземелья стоят на любой карте, закрыты и не сдвигают монстров
{
  const m = HexMap.generate(7), d = m.buildings.find((b) => b.id === 'dungeon');
  assert.ok(d && HexMap.BUILDINGS.dungeon.soon, 'врата подземелья есть и закрыты');
  assert.ok(!m.spawns.some((x) => x.idx === d.idx), 'на воротах нет существа');
}

// 1.5.4: платное воскрешение — недорого в начале, дороже с каждым цветом, растёт плавно
{
  const c = (tf) => World.reviveCost(tf);
  assert.ok(c(1) <= 60, 'в начале недорого: ' + c(1));
  for (let t = 1; t < 10.9; t += 0.25) assert.ok(c(t + 0.25) >= c(t), 'цена не падает: ' + t);
  assert.ok(c(5) > c(2) * 5, 'к 5-му цвету заметно дороже');
}
