// 1.7.1: новые местности и реки — детерминизм, проходимость, старые сохранения. Запуск: node tests/terrain171.test.js
const assert = require('assert');
global._t = global._t || ((x, a) => (a ? x.replace(/\{(\d+)\}/g, (_, i) => a[+i]) : x));
global.Tiers = require('../js/tiers.js');
global.Gear = require('../js/items.js');
global.Bestiary = require('../js/bestiary.js');
const HexMap = require('../js/hexmap.js');
global.HexMap = HexMap;
const World = require('../js/world.js');

const NEW = ['field', 'tundra', 'snow', 'sand', 'badlands', 'darkwood', 'ash'];
const total = {};
for (const seed of [1, 7, 42, 777, 2024, 31337, 987654, 12345]) {
  const old = HexMap.generate(seed);                       // карта до оформления (как у старых сохранений)
  const oldTerr = old.cells.map((c) => c.terrain), oldSpawns = JSON.stringify(old.spawns), oldReach = new Set(old.reachable);
  const map = HexMap.generate(seed), w = World.place(map);
  const again = HexMap.generate(seed); World.place(again);

  // детерминизм
  assert.deepStrictEqual(map.cells.map((c) => c.terrain), again.cells.map((c) => c.terrain), 'местность по зерну одинакова: ' + seed);
  assert.deepStrictEqual(map.rivers, again.rivers, 'реки по зерну одинаковы');
  // существа, события и логова на своих местах
  assert.strictEqual(JSON.stringify(map.spawns), oldSpawns, 'существа не сдвинулись: ' + seed);
  const bad = new Set([...map.spawns.map((s) => s.idx), ...w.events.map((e) => e.idx), ...w.lairs.map((l) => l.idx)]);
  for (const i of bad) { assert.notStrictEqual(map.cells[i].terrain, 'river', 'на реке никого нет'); assert.ok(HexMap.passable(map, i), 'стоянка проходима'); }
  // всё, что было достижимо, достижимо и теперь
  for (const i of oldReach) if (HexMap.passable(map, i)) assert.ok(map.reachable.has(i), `соту ${i} отрезало рекой (зерно ${seed})`);
  for (const i of bad) assert.ok(map.reachable.has(i), 'существа и события достижимы');
  // деревня и дороги не тронуты
  for (const c of map.cells) {
    if (c.building || c.road) assert.ok(NEW.indexOf(c.terrain) < 0 || c.terrain === 'field' || c.terrain === 'river' || c.road, 'постройки на месте');
    if (c.building) assert.ok(c.terrain !== 'river', 'река не течёт сквозь дома');
  }
  // реки
  assert.ok(map.rivers.length >= 1, 'хотя бы одна река: ' + seed);
  for (const rv of map.rivers) {
    assert.ok(rv.cells.length >= 9, 'река не короче девяти сот');
    assert.ok(['sea', 'water', 'river'].includes(rv.end), 'река впадает в море, озеро или другую реку: ' + rv.end);
    for (let k = 1; k < rv.cells.length; k++) assert.ok(HexMap.neighbors(map, rv.cells[k - 1]).includes(rv.cells[k]), 'русло сплошное');
  }
  let fords = 0;
  for (const c of map.cells) {
    if (c.terrain !== 'river') { assert.ok(!c.ford, 'брод только на реке'); continue; }
    assert.ok(c.base, 'под рекой запомнена прежняя местность (для берегов)');
    const open = !!(c.ford || c.bridge);
    assert.strictEqual(HexMap.passable(map, c.idx), open, 'река проходима только по броду и мосту');
    if (c.bridge) assert.ok(c.road, 'мост только там, где дорога');
    if (c.ford) { fords++; assert.ok(HexMap.moveCost(map, c.idx) > HexMap.TERRAIN.meadow.cost, 'брод дороже луга'); assert.strictEqual(HexMap.moveCost(map, c.idx), HexMap.FORD_COST); assert.strictEqual(HexMap.terrainName(map, c.idx), 'Брод'); }
  }
  assert.ok(fords >= 1, 'броды есть: ' + seed);
  for (const c of map.cells) total[c.terrain] = (total[c.terrain] || 0) + 1;
  // повторное оформление ничего не меняет
  const snap = JSON.stringify(map.cells.map((c) => [c.terrain, c.ford, c.bridge]));
  HexMap.decorate(map, []);
  assert.strictEqual(JSON.stringify(map.cells.map((c) => [c.terrain, c.ford, c.bridge])), snap, 'второй вызов — без изменений');
}
for (const t of [...NEW, 'river']) assert.ok(total[t] > 0, 'местность встречается на картах: ' + t);
// у новых местностей есть цена шага и проходимость
for (const t of NEW) { assert.ok(HexMap.TERRAIN[t] && HexMap.TERRAIN[t].cost >= 1 && HexMap.TERRAIN[t].pass !== false, t); }
assert.strictEqual(HexMap.TERRAIN.river.pass, false);
console.log('terrain171: ok');
