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
function build(seed, kind, floor) {
  const map = H.generate(seed, kind, floor);
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
for(const seed of [H.sharedSeed('tower'),...Array.from({length:100},(_,i)=>i+1)]) {
  for(const [floor,tier] of [[3,8],[7,9],[8,10]]) {
    const m=build(seed,'tower',floor);
    for(const kind of B.DEEP_RESOURCES)assert(m.spawns.some(s=>ordinary(s)&&s.tier===tier&&hasDrop(s.species,kind)),'missing mineral: seed '+seed+' floor '+floor+' '+kind);
  }
}
// The first floors not marked as mineral floors are unaffected.
for(const floor of [1,2,4,5,6,9,10]) assert.strictEqual(H.ensureCoverage(H.generate(H.sharedSeed('tower'),'tower',floor)).length,0);
// Check actual crafting choices against the sources players can reach at each color.
{
  const Gear=require('../js/items.js'),Forge=require('../js/forge.js'),Elixirs=require('../js/elixirs.js');
  const main=build(H.sharedSeed());
  const deep=new Map([[8,3],[9,7],[10,8]].map(([t,f])=>[t,build(H.sharedSeed('tower'),'tower',f)]));
  for(let t=1;t<=10;t++){
    const spawns=[...main.spawns,...(deep.get(t)?.spawns||[])];
    const available=new Set(spawns.filter(s=>s.tier===t).flatMap(s=>B.MONSTERS[s.species].drops.filter(d=>d[1]>0&&d[2]>0).map(d=>d[0])));
    for(const k of Elixirs.ORDER.filter(k=>!Elixirs.KINDS[k].noBrew)) assert(Forge.ownList(k,t).some(r=>available.has(r)),'elixir source: '+t+' '+k);
    const items=new Set(['human','dwarf','elf','lizard'].flatMap(f=>Gear.craftFor(f,t).map(i=>i.id)));
    for(const id of items){
      const recipe=Forge.recipe(id,t);
      assert(recipe,'missing recipe: '+id+' '+t);
      for(const slot of recipe.slots||[]) assert(slot.opts.some(o=>available.has(o.kind)),'recipe slot: '+id+' '+t+' '+slot.role);
      for(const r of recipe.res||[]) assert(available.has(r.kind),'recipe default: '+id+' '+t+' '+r.kind);
    }
  }
}
console.log('Map: canonical seeds, legacy IDs, surface/island/tower resources and recipes OK');
