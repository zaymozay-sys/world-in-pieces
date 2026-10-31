// Сравнение полных комплектов с типичным снаряжением того же цвета: node tools/set-sim.js [n=8] [c=3,6,9] [off=4]
process.chdir(require('path').join(__dirname, '..'));
const sim = require('./sim.js');
const Hero = global.Hero || require('../js/hero.js'), Gear = global.Gear || require('../js/items.js'), HexMap = require('../js/hexmap.js');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const N = Number(args.n || 8), COLORS = (args.c || '3,6,9').split(',').map(Number), OFF = Number(args.off || 4);
const FACTIONS = ['human', 'dwarf', 'elf', 'lizard'];
const speciesFor = (t) => Object.keys(HexMap.SPAWN).filter((id) => { const z = HexMap.SPAWN[id].tiers; return z[0] <= t && t <= z[z.length - 1] && !HexMap.SPAWN[id].rare && !HexMap.SPAWN[id].tower; }).slice(0, 4);
const slotOf = (it) => (it.type === 'weapon1' || it.type === 'weapon2' ? 'main' : it.type === 'shield' ? 'off' : it.type);
const setGear = (id, t) => { const g = Gear.emptyLoadout(); for (const it of Gear.ITEMS.filter((i) => i.set === id)) g[slotOf(it)] = { uid: 'x' + it.id, id: it.id, tier: t }; return g; };
const sets = Object.keys(Gear.SETS).filter((id) => Gear.ITEMS.some((i) => i.set === id) && (!args.only || args.only.split(',').includes(id)));
if (process.env.NOB) for (const id in Gear.SETS) { const b = Gear.SETS[id].bonuses; if (b) { delete b[6]; delete b[7]; } }
for (const t of COLORS) {
  const L = Math.min(100, Hero.itemLevel(t) + OFF), mons = speciesFor(t);
  const run = (gf, factions) => { let w = 0, k = 0; for (const faction of factions) for (const monster of mons) { w += sim.simulate({ faction, level: L, monster, tier: t, n: N, gear: gf, seedBase: 11 }).win; k++; } return w / k; };
  const base = run(() => sim.typicalGear(L, 1), FACTIONS);
  console.log(`цвет ${t} ур.${L}: типичное (бюджет 100%) ${(100 * base).toFixed(0)}%`);
  for (const id of sets) {
    const S = Gear.SETS[id], fs = S.faction ? [S.faction] : FACTIONS, n = Gear.ITEMS.filter((i) => i.set === id).length;
    const g = setGear(id, t), st = Gear.stats(g), w = run(() => setGear(id, t), fs);
    const tag = (Gear.LOCKED_SETS instanceof Set ? Gear.LOCKED_SETS.has(id) : Gear.LOCKED_SETS && Gear.LOCKED_SETS[id]) ? ' [закрытый]' : '';
    console.log(`  ${id.padEnd(8)} ${n} вещ.  ${(100 * w).toFixed(0).padStart(3)}% (${w - base >= 0 ? '+' : ''}${(100 * (w - base)).toFixed(0)})  С${st.power} Бр${st.defense} Бл${st.block} Рк${st.ricochet} Пр${st.initiative} Яр${st.fury} ХП+${st.health}${tag}`);
  }
}
