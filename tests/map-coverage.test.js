// Shared-world seed and resource availability regression (including legacy saves).
const assert = require('assert');
const H = require('../js/hexmap.js');
const B = require('../js/bestiary.js');
const W = require('../js/world.js');
const eligible = Object.keys(H.SPAWN).filter(id => {
  const s = H.SPAWN[id], m = B.MONSTERS[id];
  return m && !s.fixed && !s.rare && !m.boss && !m.hidden;
});
const ordinary = s => !s.boss && !s.zone && !s.guard && !s.guest && !s.rare;
const hasDrop = (id, k) => B.MONSTERS[id].drops.some(d => d[0] === k && d[1] > 0 && d[2] > 0);
const resources = Object.keys(B.RESOURCES).filter(k => !B.DEEP_RESOURCES.includes(k));
function build(seed, kind) {
  const map = H.generate(seed, kind);
  const old = JSON.stringify(map.spawns);
  const world = kind ? { events: [], lairs: [], landmarks: [] } : W.place(map);
  const reserved = [...world.events, ...world.lairs, ...world.landmarks].map(x => x.idx);
  const added = H.ensureCoverage(map, reserved);
  assert.strictEqual(JSON.stringify(map.spawns.slice(0, map.spawns.length - added.length)), old, 'existing spawn IDs and positions changed');
  assert.strictEqual(new Set(added.map(s => s.idx)).size, added.length);
  const occupied = new Set([...reserved, ...map.spawns.slice(0, map.spawns.length - added.length).map(s => s.idx)]);
  for (const s of added) {
    assert(!occupied.has(s.idx), 'new spawn overlaps existing content');
    assert(map.reachable.has(s.idx) && H.passable(map, s.idx), 'unreachable spawn');
    assert(!map.cells[s.idx].building && !map.cells[s.idx].road);
    assert.strictEqual(map.spawns[s.id], s);
    assert(s.lvl >= (s.tier - 1) * 10 + 1 && s.lvl <= s.tier * 10);
  }
  assert.strictEqual(H.ensureCoverage(map, reserved).length, 0, 'not idempotent');
  return map;
}
assert.strictEqual(H.sharedSeed(), H.sharedSeed('mainland'));
assert.strictEqual(new Set(['mainland','island','castle','tower'].map(H.sharedSeed)).size, 4);
for (const seed of [H.sharedSeed(), ...Array.from({length: 50}, (_, i) => i + 1)]) {
  const map = build(seed), reg = map.spawns.filter(ordinary);
  for (const id of eligible) assert(reg.some(s => s.species === id), 'missing species: ' + seed + ' ' + id);
  for (let tier = 1; tier <= 10; tier++) for (const k of resources) {
    if (!eligible.some(id => H.SPAWN[id].tiers[0] <= tier && H.SPAWN[id].tiers[1] >= tier && hasDrop(id, k))) continue;
    assert(reg.some(s => s.tier === tier && hasDrop(s.species, k)), 'missing resource: ' + seed + ' tier ' + tier + ' ' + k);
  }
  const island = build(seed, 'island');
  for (const id of ['glowmaw','coralhulk','stormray','tidecaller','thornback']) assert(island.spawns.some(s => s.species === id), 'missing island species: ' + seed + ' ' + id);
}
assert.deepStrictEqual(build(H.sharedSeed()).spawns, build(H.sharedSeed()).spawns);
assert.deepStrictEqual(build(H.sharedSeed('island'), 'island').spawns, build(H.sharedSeed('island'), 'island').spawns);
console.log('Shared map: canonical seeds, legacy IDs, reachable resource and island coverage OK');
