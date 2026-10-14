/* Подбор чисел эликсиров (1.8.0): как elixir-balance.js, но на выбранных цветах/видах и с подстановкой таблиц без правки кода.
   node tools/elixir-tune.js --levels=5,25,45 --kinds=stones,swap --n=200 --set='{"STONES":[2,2,3,3,4,4,5,5,6,6],"PER_TIER":{"defense":3}}'
   Печатает по каждому цвету и виду: «прибавка» (без побочного эффекта) и «всё» (с эффектом) в пунктах шанса победы. */
const sim = require('./sim.js');
const HexMap = require('../js/hexmap.js');
const { Hero, Bestiary, Elixirs } = global;
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const n = +arg('n', 200), levels = arg('levels', '5,25,45,65,85,95').split(',').map(Number);
const kinds = arg('kinds', Elixirs.ORDER.join(',')).split(',');
const set = JSON.parse(arg('set', '{}'));
for (const [k, v] of Object.entries(set)) { if (Array.isArray(v)) v.forEach((x, i) => { Elixirs[k][i] = x; }); else Object.assign(Elixirs[k], v); }
const pct = (x) => Math.round(x * 100), sg = (x) => (pct(x) >= 0 ? '+' : '') + pct(x);
for (const L of levels) {
  const T = Hero.tierFor(L);
  const species = Bestiary.ORDER.filter((id) => HexMap.SPAWN[id] && T >= HexMap.SPAWN[id].tiers[0] && T <= HexMap.SPAWN[id].tiers[1]);
  const run = (id, elixirs, elxFx) => sim.simulate({ monster: id, tier: T, faction: 'dwarf', level: L, n, player: 'avg', gear: () => sim.typicalGear(L, 0.8), elixirs, elxFx }).win;
  const picks = [];
  for (const id of species) { const b = run(id); if (b >= 0.3 && b <= 0.85) picks.push({ id, base: b }); if (picks.length >= 3) break; }
  if (!picks.length) { console.log(`L${L} цвет ${T}: нет подходящих существ`); continue; }
  const avg = (f) => picks.reduce((s, p) => s + f(p), 0) / picks.length, base = avg((p) => p.base);
  const out = [];
  for (const k of kinds) {
    const stat = avg((p) => run(p.id, { [k]: T }, false)), full = avg((p) => run(p.id, { [k]: T }, true));
    out.push(`${k} ${sg(stat - base)}/${sg(full - base)}`);
  }
  console.log(`L${L} цвет ${T} (${picks.map((p) => p.id + ' ' + pct(p.base)).join(', ')}; база ${pct(base)}%): ` + out.join(' | '));
}
