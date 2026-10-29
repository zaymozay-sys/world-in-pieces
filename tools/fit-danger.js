/* Подгонка offset видов для оценки опасности (Balance.danger.offset) по симулятору.
   Запуск: node tools/fit-danger.js [--n=8] [--tiers=3,6,9]. Печатает JSON {вид: offset} для вставки в js/balance.js.
   offset = логит победы в симуляторе − среднее значение логита оценки без offset (по типичным вещам цвета). */
const sim = require('./sim.js');
const { Hero, Bestiary, Combat, Gear, Factions, Balance } = global;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
const N = Number(args.n || 8), TIERS = String(args.tiers || '3,6,9').split(',').map(Number);
const D = Balance.danger, off0 = { ...D.offset };
const clampP = (p) => Math.max(0.03, Math.min(0.97, p));
const logit = (p) => Math.log(clampP(p) / (1 - clampP(p)));
const res = {};
for (const id of (args.only ? String(args.only).split(',') : Object.keys(Bestiary.MONSTERS))) {
  const diffs = [];
  for (const T of TIERS) {
    const L = Hero.itemLevel(T);
    let w = 0, n = 0, zsum = 0, zn = 0;
    for (const faction of ['human', 'dwarf', 'elf', 'lizard']) {
      const r = sim.simulate({ faction, level: L, monster: id, tier: T, n: N, gear: () => sim.typicalGear(L), seedBase: 11 });
      w += r.win; n++;
    }
    D.offset[id] = 0;
    for (let k = 0; k < 12; k++) {
      sim.seed(500 + k);
      const g = sim.typicalGear(L), st = Gear.combine(Gear.stats(g), Factions.statsAt('elf', Hero.tierFloat(L))), sc = Bestiary.scaled(id, T);
      const p = Combat.winChance({ max: Hero.baseHp(L) + st.health, dmg: Hero.dmgMult(L), stats: st }, { max: sc.hp, dmg: sc.dmg, stats: sc.stats, ai: sc.ai }, id);
      zsum += logit(p); zn++;
    }
    diffs.push(logit(w / n) - zsum / zn);
  }
  res[id] = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length * 100) / 100;
  D.offset[id] = off0[id];
}
console.log(JSON.stringify(res));
