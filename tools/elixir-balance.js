/* Эликсиры (1.5.1): насколько прибавка и эффект за бой меняют шанс победы.
   Запуск: node tools/elixir-balance.js [--n=120] [--levels=45,65,95]
   Для каждого уровня героя берём несколько существ его цвета с исходным шансом 30–85% и сравниваем:
   без эликсира; эликсир этого цвета только с прибавкой к характеристике; с прибавкой и эффектом; все семь сразу.
   Цель: один эликсир целиком (прибавка + эффект) меняет шанс победы на 3–10 пунктов, а сам эффект — не более ~5. */
const sim = require('./sim.js');
const HexMap = require('../js/hexmap.js');
const { Hero, Bestiary, Elixirs } = global;
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const n = +arg('n', 120), levels = arg('levels', '45,65,95').split(',').map(Number);
const KINDS = Elixirs.ORDER;
const pct = (x) => Math.round(x * 100);

const rows = [];
for (const L of levels) {
  const T = Hero.tierFor(L);
  const species = Bestiary.ORDER.filter((id) => HexMap.SPAWN[id] && T >= HexMap.SPAWN[id].tiers[0] && T <= HexMap.SPAWN[id].tiers[1]);
  const run = (id, elixirs, elxFx) => sim.simulate({ monster: id, tier: T, faction: 'dwarf', level: L, n, player: 'avg', gear: () => sim.typicalGear(L, 0.8), elixirs, elxFx }).win;
  const picks = [];
  for (const id of species) { const b = run(id); if (b >= 0.3 && b <= 0.85) picks.push({ id, base: b }); if (picks.length >= 3) break; }
  console.log(`\n== Уровень ${L}, цвет ${T}: существа ${picks.map((p) => p.id + ' ' + pct(p.base) + '%').join(', ')} ==`);
  console.log('эликсир'.padEnd(12) + 'только прибавка'.padStart(18) + 'прибавка+эффект'.padStart(18) + 'вклад эффекта'.padStart(15));
  const avg = (f) => picks.reduce((s, p) => s + f(p), 0) / picks.length;
  const base = avg((p) => p.base);
  for (const k of KINDS) {
    const stat = avg((p) => run(p.id, { [k]: T }, false)), full = avg((p) => run(p.id, { [k]: T }, true));
    console.log(k.padEnd(12) + `${pct(stat - base) >= 0 ? '+' : ''}${pct(stat - base)}`.padStart(18) + `${pct(full - base) >= 0 ? '+' : ''}${pct(full - base)}`.padStart(18) + `${pct(full - stat) >= 0 ? '+' : ''}${pct(full - stat)}`.padStart(15));
    rows.push({ L, k, stat: stat - base, full: full - base, fx: full - stat });
  }
  const all = Object.fromEntries(KINDS.map((k) => [k, T]));
  const aStat = avg((p) => run(p.id, all, false)), aFull = avg((p) => run(p.id, all, true));
  console.log('все семь'.padEnd(12) + `+${pct(aStat - base)}`.padStart(18) + `+${pct(aFull - base)}`.padStart(18) + `${pct(aFull - aStat) >= 0 ? '+' : ''}${pct(aFull - aStat)}`.padStart(15));
  console.log(`(исходный шанс ${pct(base)}%, n=${n} на существо)`);
}
