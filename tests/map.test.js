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
  for (const id of Object.keys(HexMap.BUILDINGS)) assert.ok(m.buildings.some((b) => b.id === id), id);
  for (const c of m.cells) if (c.d <= HexMap.VILLAGE_R) assert.strictEqual(c.terrain, 'village');
  assert.strictEqual(m.gates.length, 3);
  for (const g of m.gates) assert.ok(m.cells[g].road);
  // дороги доходят почти до края карты
  assert.ok(m.cells.some((c) => c.road && c.d >= R - 1), 'дорога доходит до края');
  // рядом с деревней нет гор и озёр
  for (const c of m.cells) if (c.d <= HexMap.VILLAGE_R + 2) assert.ok(HexMap.passable(m, c.idx));

  // монстры: вне деревни, не на дороге, на проходимой и достижимой соте, не вплотную друг к другу
  assert.ok(m.spawns.length >= 40 && m.spawns.length <= 110, 'монстров: ' + m.spawns.length);
  const at = new Set(m.spawns.map((s) => s.idx));
  for (const s of m.spawns) {
    const c = m.cells[s.idx];
    assert.ok(c.d > HexMap.VILLAGE_R && !c.road && HexMap.passable(m, s.idx) && m.reachable.has(s.idx));
    assert.ok(!HexMap.neighbors(m, s.idx).some((n) => at.has(n)), 'монстры не стоят вплотную');
    assert.ok(Bestiary.MONSTERS[s.species], s.species);
    const [lo, hi] = HexMap.SPAWN[s.species].tiers;
    assert.ok(s.tier >= lo && s.tier <= hi, `${s.species} цвета ${s.tier}`);
    assert.ok(Math.abs(s.tier - HexMap.tierAt(c.d)) <= 1, 'цвет монстра соответствует зоне');
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
