// Подбор множителя здоровья существ (Balance.monsters.hpBoost) по цветам: «средний» герой выигрывает ≈target%.
// Запуск: node tools/calibrate-hp.js c=1,2,3 target=0.5 n=10
process.chdir(require('path').join(__dirname, '..'));
const sim = require('./sim.js');
const Hero = global.Hero || require('../js/hero.js'), HexMap = require('../js/hexmap.js'), Balance = global.Balance || require('../js/balance.js');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const COLORS = (args.c || '1,2,3,4,5,6,7,8,9,10').split(',').map(Number), TARGET = Number(args.target || 0.5), N = Number(args.n || 10);
const speciesFor = (t) => Object.keys(HexMap.SPAWN).filter((id) => { const z = HexMap.SPAWN[id].tiers; return z[0] <= t && t <= z[z.length - 1] && !HexMap.SPAWN[id].rare; });
const pick = (t) => { const s = speciesFor(t), k = Math.min(4, s.length); return Array.from({ length: k }, (_, i) => s[Math.floor(i * s.length / k)]); };
const winAt = (t, mult) => {
  Balance.monsters.hpBoost[t - 1] = mult;
  const L = Hero.itemLevel(t); let w = 0, k = 0;
  for (const faction of ['human', 'dwarf', 'elf', 'lizard']) for (const monster of pick(t)) {
    const r = sim.simulate({ faction, level: L, monster, tier: t, n: N, gear: () => sim.typicalGear(L, 0.8), seedBase: 11 }); w += r.win; k++;
  }
  return w / k;
};
for (const t of COLORS) {
  let lo = Math.log(0.25), hi = Math.log(12), best = null;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2, m = Math.exp(mid), w = winAt(t, m);
    if (!best || Math.abs(w - TARGET) < Math.abs(best.w - TARGET)) best = { m, w };
    if (w > TARGET) lo = mid; else hi = mid;
  }
  console.log(`цвет ${t}: hpBoost ${best.m.toFixed(2)} (победы ${(100 * best.w).toFixed(0)}%), было ${[1, 1, 1, 1, 1.1, 1.15, 2.8, 3.1, 3.5, 3.5][t - 1]}`);
}
