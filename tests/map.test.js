// Тесты карты из шестиугольников. Запуск: node tests/map.test.js
const assert = require('assert');
global.Tiers = require('../js/tiers.js');
global.Gear = require('../js/items.js');
global.Bestiary = require('../js/bestiary.js');
const HexMap = require('../js/hexmap.js');

// координаты: пиксели ↔ соты, расстояние
for (const [q, r] of [[0, 0], [3, -2], [-5, 7], [14, -14]]) {
  const p = HexMap.toPixel(q, r, 30);
  assert.deepStrictEqual(HexMap.fromPixel(p.x + 3, p.y - 4, 30), { q, r });
}
assert.strictEqual(HexMap.dist({ q: 0, r: 0 }, { q: 3, r: -1 }), 3);
assert.strictEqual(HexMap.dist({ q: -2, r: 2 }, { q: 2, r: -2 }), 4);

// цвет зоны растёт с расстоянием: у деревни Медь, на краю Фиолетовый
assert.strictEqual(HexMap.tierAt(0), 0);
assert.strictEqual(HexMap.tierAt(HexMap.VILLAGE_R + 1), 1);
assert.strictEqual(HexMap.tierAt(HexMap.RADIUS), 10);
for (let d = HexMap.VILLAGE_R + 2; d <= HexMap.RADIUS; d++) assert.ok(HexMap.tierAt(d) >= HexMap.tierAt(d - 1));

for (const seed of [1, 42, 777, 123456, 99991, 2024]) {
  const m = HexMap.generate(seed);
  const R = HexMap.RADIUS;
  assert.strictEqual(m.cells.length, 3 * R * (R + 1) + 1, 'средняя карта: шестиугольник радиуса 14');

  // одно и то же зерно — одна и та же карта
  const m2 = HexMap.generate(seed);
  assert.deepStrictEqual(m2.cells.map((c) => c.terrain + c.road), m.cells.map((c) => c.terrain + c.road));
  assert.deepStrictEqual(m2.spawns, m.spawns);

  // деревня: все здания на месте, внутри частокола — только деревня, ворота с дорогами
  for (const id of Object.keys(HexMap.BUILDINGS).filter((k) => !HexMap.BUILDINGS[k].castleOnly)) assert.ok(m.buildings.some((b) => b.id === id), id);
  for (const c of m.cells) if (c.d <= HexMap.VILLAGE_R) assert.strictEqual(c.terrain, 'village');
  assert.strictEqual(m.gates.length, 2);   // 1.2.7: ворота на западе и востоке
  for (const g of m.gates) assert.ok(m.cells[g].road);
  // дороги доходят почти до края карты
  assert.ok(m.cells.some((c) => c.road && c.d >= R - 1), 'дорога доходит до края');
  // рядом с деревней нет гор и озёр
  for (const c of m.cells) if (c.d <= HexMap.VILLAGE_R + 2) assert.ok(HexMap.passable(m, c.idx));

  // монстры: вне деревни, не на дороге, на проходимой и достижимой соте, не вплотную друг к другу
  assert.ok(m.spawns.length >= 90 && m.spawns.length <= 260, 'монстров: ' + m.spawns.length);   // 1.7.2: карта радиуса 30 (было 50–150 на радиусе 23)
  const at = new Set(m.spawns.map((s) => s.idx));
  for (const s of m.spawns) {
    const c = m.cells[s.idx];
    assert.ok(c.d > HexMap.VILLAGE_R && !c.road && HexMap.passable(m, s.idx) && m.reachable.has(s.idx));
    assert.ok(!HexMap.neighbors(m, s.idx).some((n) => at.has(n)), 'монстры не стоят вплотную');
    assert.ok(Bestiary.MONSTERS[s.species], s.species);
    const [lo, hi] = HexMap.SPAWN[s.species].tiers;
    assert.ok(s.tier >= lo && s.tier <= hi, `${s.species} цвета ${s.tier}`);
    if (s.species !== 'captain') assert.ok(Math.abs(s.tier - HexMap.tierAt(c.d)) <= 1, 'цвет монстра соответствует зоне');   // Капитан — босс с фиксированным цветом
  }
  // у деревни есть слабые монстры для новичка
  assert.ok(m.spawns.filter((s) => s.tier === 1).length >= 4, 'монстров Меди у деревни');

  // путь: из деревни к любому достижимому месту; через горы и озёра не проходит
  const home = HexMap.center(m), all = () => true, free = () => false;
  const far = [...m.reachable].filter((i) => m.cells[i].d === R - 1)[0];
  const path = HexMap.findPath(m, home, far, all, free);
  assert.ok(path && path.length >= R - 1);
  let prev = home;
  for (const i of path) {
    assert.ok(HexMap.passable(m, i), 'путь только по проходимым сотам');
    assert.strictEqual(HexMap.dist(m.cells[prev], m.cells[i]), 1, 'шаги по соседним сотам');
    prev = i;
  }
  // занятые монстрами соты обходятся (но цель может быть занята)
  const blockedSet = new Set(m.spawns.map((s) => s.idx));
  const p2 = HexMap.findPath(m, home, far, all, (i) => blockedSet.has(i));
  if (p2) for (const i of p2.slice(0, -1)) assert.ok(!blockedSet.has(i));
  // в гору пути нет
  const peak = m.cells.find((c) => c.terrain === 'mountain' && !c.road);
  if (peak) assert.strictEqual(HexMap.findPath(m, home, peak.idx, all, free), null);
  // по неизведанным сотам путь прокладывается «наугад»
  assert.ok(HexMap.findPath(m, home, far, () => false, free));

  // частокол: выйти из деревни можно только через ворота, не напрямую через границу.
  // (a) путь из центра деревни до соты сразу за одними из ворот идёт через эту саму соту-ворота.
  {
    const gate = m.gates[0];
    const outside = HexMap.neighbors(m, gate).find((n) => m.cells[n].d === HexMap.VILLAGE_R + 1 && m.cells[n].road);
    assert.ok(outside !== undefined, 'у ворот должен быть проходной сосед снаружи');
    const p = HexMap.findPath(m, home, outside, all, free);
    assert.ok(p, 'из деревни наружу через ворота есть путь');
    assert.ok(p.includes(gate), 'путь наружу проходит через саму соту ворот');
    assert.ok(!HexMap.fenceBlocks(m, gate, outside), 'шаг ворота → дорога наружу разрешён');
  }
  // (b) прямой шаг через частокол вне ворот запрещён, а найденный путь его не пересекает.
  {
    const fenceGap = [];
    for (const c of m.cells) {
      if (c.d !== HexMap.VILLAGE_R || m.gates.includes(c.idx)) continue;
      for (const n of HexMap.neighbors(m, c.idx)) if (m.cells[n].d === HexMap.VILLAGE_R + 1) fenceGap.push([c.idx, n]);
    }
    assert.ok(fenceGap.length, 'на границе деревни должны быть не-воротные соседние пары');
    for (const [inside, outside] of fenceGap) assert.ok(HexMap.fenceBlocks(m, inside, outside), 'граница вне ворот непроходима');
    // пары внутри деревни или снаружи неё частоколом не разделены
    assert.ok(!HexMap.fenceBlocks(m, home, HexMap.neighbors(m, home)[0]));
    // пикфайндер вместо прямого пересечения частокола обходит его через ближайшие ворота (не сообщает "нет пути")
    const [gapIn, gapOut] = fenceGap[0];
    const pFromInside = HexMap.findPath(m, home, gapOut, all, free);
    assert.ok(pFromInside, 'путь наружу существует (через ворота), даже если цель за не-воротным участком забора');
    for (let i = 1; i < pFromInside.length; i++) assert.ok(!HexMap.fenceBlocks(m, pFromInside[i - 1], pFromInside[i]), 'путь не пересекает частокол напрямую');
    void gapIn;
  }
}

console.log('map: все тесты пройдены');

// Каждый вид бестиария обязан иметь запись в HexMap.SPAWN: экран бестиария читает SPAWN[id].tiers у закрытых видов.
{
  const assert2 = require('assert');
  const Bestiary = require('../js/bestiary.js');
  const HM = require('../js/hexmap.js');
  for (const id of Bestiary.ORDER.filter((x) => !Bestiary.MONSTERS[x].hidden)) assert2.ok(HM.SPAWN[id] && HM.SPAWN[id].tiers, 'SPAWN покрывает вид ' + id);
  console.log('map: SPAWN покрывает все виды бестиария');
}


// 1.1.10: большая карта с морем и достопримечательностями побережья
{
  assert.strictEqual(HexMap.RADIUS, 30);   // 1.7.2: было 23
  for (const seed of [1, 42, 777, 2024]) {
    const m = HexMap.generate(seed);
    assert.ok(m.cells.some((c) => c.terrain === 'sea') && m.cells.some((c) => c.terrain === 'beach'), 'море и пляж есть');
    for (const id of ['lighthouse', 'wreck']) {
      const b = m.buildings.find((x) => x.id === id);
      assert.ok(b && m.reachable.has(b.idx), id + ' достижим из деревни');
      assert.strictEqual(m.cells[b.idx].terrain, 'beach');
    }
    assert.ok(m.cells.filter((c) => c.terrain === 'sea').every((c) => !m.reachable.has(c.idx)), 'в море не зайти');
  }
}

// 1.2.0: сундук отдельной точкой рядом с бригантиной; Капитан-босс стоит рядом
for (const seed of [1, 42, 777, 2024]) {
  const m = HexMap.generate(seed);
  const ch = m.buildings.find((x) => x.id === 'chest'), wr = m.buildings.find((x) => x.id === 'wreck');
  assert.ok(ch && m.reachable.has(ch.idx), 'сундук достижим');
  assert.ok(HexMap.dist(m.cells[ch.idx], m.cells[wr.idx]) <= 1, 'сундук у бригантины');
  const cap = m.spawns.find((s) => s.species === 'captain');
  assert.ok(cap && HexMap.dist(m.cells[cap.idx], m.cells[ch.idx]) <= 2, 'Капитан охраняет сундук');
}


// 1.2.6: город из усадеб — Ратуша на 7 сотах, 18 зданий (1.8.6) по 3 соты, симметрично, с проходами и свободными улицами
{
  const m = HexMap.generate(42);
  const village = m.buildings.filter((b) => !HexMap.BUILDINGS[b.id].landmark && !HexMap.BUILDINGS[b.id].post);
  assert.strictEqual(village.length, 19);
  assert.strictEqual(village.find((b) => b.id === 'hall').cells.length, 7);
  const owner = new Map();
  for (const b of village) {
    if (b.id !== 'hall') assert.strictEqual(b.cells.length, 3, b.id + ': 3 соты');
    for (const i of b.cells) {
      assert.ok(!owner.has(i), 'соты зданий не пересекаются');
      owner.set(i, b.id);
      const c = m.cells[i];
      assert.ok(c.d < HexMap.VILLAGE_R, b.id + ': внутри частокола, не на последнем кольце');
      assert.ok(!c.road && !m.gates.includes(i), b.id + ': не на дороге и не в воротах');
      assert.strictEqual(c.building, b.id);
    }
    if (b.id !== 'hall') for (let k = 1; k < 3; k++) for (let j = 0; j < k; j++) assert.strictEqual(HexMap.dist(m.cells[b.cells[k]], m.cells[b.cells[j]]), 1, b.id + ': соты рядом');
  }
  // между разными зданиями — хотя бы одна свободная сота
  for (const [i, a] of owner) for (const [j, b] of owner) if (a !== b) assert.ok(HexMap.dist(m.cells[i], m.cells[j]) >= 2, `${a} и ${b} не вплотную`);
  // 1.2.7: город симметричен слева-направо и сверху-вниз (относительно главной улицы)
  const occ = new Set([...owner.keys()].map((i) => m.cells[i].q + ',' + m.cells[i].r));
  for (const k of occ) {
    const [q, r] = k.split(',').map(Number);
    assert.ok(occ.has((-q - r) + ',' + r), 'зеркально слева-направо: ' + k);
    assert.ok(occ.has((q + r) + ',' + (-r)), 'зеркально сверху-вниз: ' + k);
  }
  // из центра можно дойти до каждого здания
  for (const b of village) assert.ok(HexMap.findPath(m, HexMap.center(m), b.cells[0], () => true, () => false) || b.id === 'hall');
  console.log('map: город из усадеб — все тесты пройдены');
}

// 1.3.0: стражи осколков — по одному на каждую главу сюжета, в зоне своего цвета
{
  const Story = require('../js/story.js');
  for (const seed of [1, 42, 777, 2024, 99]) {
    const m = HexMap.generate(seed);
    for (const ch of Story.CHAPTERS) {
      const sp = m.spawns.filter((x) => x.boss === ch.id);
      assert.strictEqual(sp.length, 1, `страж ${ch.id} ровно один (зерно ${seed})`);
      assert.strictEqual(sp[0].species, ch.species);
      assert.strictEqual(sp[0].tier, ch.tier);
      if (!ch.existing) assert.strictEqual(HexMap.tierAt(m.cells[sp[0].idx].d), ch.tier, 'страж в зоне своего цвета');
      assert.ok(m.reachable.has(sp[0].idx));
    }
  }
  const sc = Story.scaleBoss({ hp: 100, stats: { power: 5 } }, 'b1');
  assert.strictEqual(sc.hp, 300); assert.strictEqual(sc.stats.power, 45);
  assert.strictEqual(Story.scaleBoss({ hp: 100, stats: {} }, 'b4').hp, 100, 'Капитан не усиливается повторно');
  assert.ok(!Story.finalOpen({ shards: { b1: true, b2: true, b3: true } }) && Story.finalOpen({ shards: { b1: true, b2: true, b3: true, b4: true } }));
  console.log('map: стражи осколков — все тесты пройдены');
}
// 1.5.1: реплики стражей, вести, концовка, новый поход
{
  const Story = require('../js/story.js');
  for (const ch of Story.CHAPTERS) assert.ok(ch.taunt && ch.defeat, 'у стража есть реплики: ' + ch.id);
  assert.strictEqual(Story.newsAll({ shards: {} }).length, 0);
  assert.strictEqual(Story.newsAll({ shards: { b1: true, b2: true } }).length, 2);
  assert.strictEqual(Story.news({ shards: { b1: true, b2: true } }), Story.NEWS[1]);
  const done = { shards: { b1: true, b2: true, b3: true, b4: true, b5: true } };
  assert.strictEqual(Story.newsAll(done).length, 5);
  assert.ok(!Story.newCycle({ shards: { b1: true } }), 'новый поход только после финала');
  assert.ok(Story.newCycle(done)); assert.strictEqual(Story.cycle(done), 1); assert.strictEqual(Story.shards(done), 0);
  const base = Story.scaleBoss({ hp: 100, stats: { power: 5 } }, 'b1', 0), c1 = Story.scaleBoss({ hp: 100, stats: { power: 5 } }, 'b1', 1);
  assert.ok(c1.hp > base.hp && c1.stats.power > base.stats.power, 'в новом походе страж крепче');
  assert.ok(Story.scaleBoss({ hp: 100, stats: {} }, 'b4', 1).hp > 100, 'Капитан в новом походе тоже крепче');
  assert.ok(Story.shardReward('b1', 1).coins > Story.shardReward('b1', 0).coins);
  console.log('story 1.5.1 ok');
}
// 1.3.0: торговые ряды — продажа по цене
{
  const Market = require('../js/market.js');
  assert.ok(!isFinite(Market.meanMinutes(300, 100)), 'втрое дороже — не купят');
  assert.ok(Market.meanMinutes(80, 100) < Market.meanMinutes(130, 100));
  const lots = [Market.makeLot('res', 'fang:1', 3, 100, 100, null, 0)];
  const r1 = Market.tick(lots, 0, () => 0); assert.strictEqual(r1.sold.length, 0, 'без прошедшего времени не продаётся');
  const r2 = Market.tick(lots, 60 * 60000, () => 0.5); assert.strictEqual(r2.sold.length, 1, 'за час при справедливой цене — продано');
  const lots2 = [Market.makeLot('res', 'fang:1', 3, 400, 100, null, 0)];
  assert.strictEqual(Market.tick(lots2, 24 * 3600000, () => 0).sold.length, 0);
  console.log('market: все тесты пройдены');
}
// 1.3.0: боеприпасы
{
  const Ammo = require('../js/ammo.js');
  assert.deepStrictEqual(['human', 'dwarf', 'elf', 'lizard'].map(Ammo.forFaction), ['bolt', 'bomb', 'moonarrow', 'dart']);
  assert.strictEqual(Ammo.boltDamage(10), 40); assert.strictEqual(Ammo.arrowDamage(10), 30);
  // 1.5.1: слабости семейств
  assert.strictEqual(Ammo.mult('bolt', 'Нежить'), 1.5); assert.strictEqual(Ammo.mult('bolt', 'Звери'), 1);
  assert.strictEqual(Ammo.mult('dart', 'Нежить'), 0.7); assert.strictEqual(Ammo.mult('bomb', 'Каменные стражи'), 1.5);
  const Bst = require('../js/bestiary.js'), fams = new Set(Object.values(Bst.MONSTERS).map((m) => m.family));
  for (const f of fams) assert.ok(Ammo.ORDER.some((k) => Ammo.mult(k, f) > 1), 'у семейства есть слабость: ' + f);
  for (const k of Ammo.ORDER) for (const f of fams) assert.ok(!(Ammo.WEAK[k] || []).some((n) => n === f) || !(Ammo.RESIST[k] || []).some((n) => n === f), 'не слабость и стойкость сразу');
  assert.ok(/слабое место/.test(Ammo.hint('bolt', 'Нежить')) && Ammo.hint('bolt', 'Звери') === '');
  assert.deepStrictEqual(Ammo.steal({ sapphire: 5, ruby: 1, emerald: 0 }, ['sapphire', 'ruby', 'emerald']), { sapphire: 2, ruby: 1 });
  console.log('ammo: все тесты пройдены');
}

// 1.8.6: Замок — отдельная карта: руины зеркально, существа и хозяин достижимы, выход у западной стены
{
  const c = HexMap.generate(7, 'castle');
  assert.strictEqual(c.kind, 'castle');
  assert.ok(c.buildings.some((b) => b.id === 'castleExit') && c.buildings.some((b) => b.id === 'ruinHall'));
  const ruins = c.buildings.filter((b) => b.id === 'ruinHouse' || b.id === 'ruinTower');
  assert.strictEqual(ruins.length, 24, '24 руины');
  const key = (i) => `${c.cells[i].q},${c.cells[i].r}`;
  const set = new Set(ruins.map((b) => b.cells.map(key).sort().join('|')));
  for (const b of ruins) {   // зеркало слева-направо и сверху-вниз
    for (const f of [([q, r]) => [-q - r, r], ([q, r]) => [q + r, -r]]) {
      const m = b.cells.map((i) => f([c.cells[i].q, c.cells[i].r]).join(',')).sort().join('|');
      assert.ok(set.has(m), 'руины симметричны');
    }
  }
  assert.ok(c.spawns.length > 10 && c.spawns.every((s) => c.reachable.has(s.idx) && s.castle && ['skeleton', 'wraith'].includes(s.species)), 'духи на достижимых сотах');
  assert.strictEqual(c.spawns.filter((s) => s.boss === 'castleLord').length, 1, 'один хозяин замка');
  assert.ok(c.reachable.has(c.start) && HexMap.fenceBlocks(c, c.start, c.start) === false);
  assert.deepStrictEqual(HexMap.generate(7, 'castle').spawns, c.spawns, 'карта замка детерминирована');
  console.log('map: замок — все тесты пройдены');
}

{
  const assert = require('assert');
  const HexMap = require('../js/hexmap.js');
  for (const seed of [1, 7, 12345, 99999]) {
    const m = HexMap.generate(seed, 'island');
    assert.strictEqual(m.kind, 'island');
    assert.ok(m.buildings.some((b) => b.id === 'islandPier') && m.buildings.some((b) => b.id === 'islandChest'));
    const chest = m.buildings.find((b) => b.id === 'islandChest').idx, guard = m.spawns.filter((s) => s.guard);
    assert.strictEqual(guard.length, 1, 'один страж');
    assert.ok(HexMap.dist(m.cells[guard[0].idx], m.cells[chest]) === 1 && m.reachable.has(guard[0].idx), 'страж у сундука и достижим');
    assert.ok(m.reachable.has(m.start) && m.spawns.every((s) => m.reachable.has(s.idx) && s.island), 'мобы на достижимых сотах');
    assert.ok(m.cells.length < 260, 'остров малый');
    assert.deepStrictEqual(HexMap.generate(seed, 'island').spawns, m.spawns, 'детерминирован');
  }
  console.log('map: остров — все тесты пройдены');
}

{
  const assert = require('assert');
  const HexMap = require('../js/hexmap.js');
  for (const f of [1, 2, 5, 10, 25]) {
    const m = HexMap.generate(777, 'tower', f);
    assert.strictEqual(m.kind, 'tower'); assert.strictEqual(m.floor, f);
    assert.ok(m.buildings.some((b) => b.id === 'towerDoor') && m.buildings.some((b) => b.id === 'towerStairs'));
    assert.ok(m.spawns.every((s) => m.reachable.has(s.idx) && s.tower), 'мобы достижимы');
    assert.strictEqual(m.spawns.filter((s) => s.guard).length, f % 5 === 0 ? 1 : 0, 'страж на каждом 5-м этаже');
    assert.ok(m.cells.length === 127 && m.spawns.every((s) => s.tier >= 8 && s.tier <= 10));
    assert.deepStrictEqual(HexMap.generate(777, 'tower', f).spawns, m.spawns, 'этаж детерминирован');
  }
  assert.notDeepStrictEqual(HexMap.generate(777, 'tower', 1).spawns, HexMap.generate(777, 'tower', 2).spawns, 'этажи разные');
  console.log('map: Башня — все тесты пройдены');
}

// 1.9.3: у духов замка бывают свои приёмы; карта и расстановка от этого не меняются
{
  const a = require('assert'), HexMap = require('../js/hexmap.js');
  const m1 = HexMap.generate(12345, 'castle'), m2 = HexMap.generate(12345, 'castle');
  a.deepStrictEqual(m1.spawns, m2.spawns, 'карта замка детерминирована');
  const traits = new Set(m1.spawns.filter((s) => !s.boss).map((s) => s.trait || null));
  a.ok([...traits].every((t) => t === null || ['ward', 'toxin', 'stun'].includes(t)), 'приёмы только из списка');
  const all = new Set(); for (let seed = 1; seed <= 40; seed++) for (const s of HexMap.generate(seed, 'castle').spawns) if (!s.boss) all.add(s.trait || null);
  a.ok(all.has('ward') && all.has('toxin') && all.has('stun') && all.has(null), 'на разных картах встречаются все приёмы и обычные духи');
  a.ok(m1.spawns.filter((s) => s.boss).every((s) => !s.trait), 'у хозяина замка приёма духа нет');
  console.log('map: приёмы духов замка ок');
}
