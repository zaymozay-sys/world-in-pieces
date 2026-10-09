/* Баланс питомцев: питомец (ИИ с умом N) против копии противника на своём поле, как в бою вдвоём.
   Запуск: node tools/pet-balance.js [--n=80] [--tiers=1,3,6,10]
   Считает долю побед питомца и какую долю ХП противника он снимает за бой — по видам, цветам и уму.
   Приёмы питомца (ум ≥ 5) здесь не моделируются: цифры — нижняя оценка для зверей с приёмом. */
const sim = require('./sim.js');
global._t = global._t || ((s, a) => (a ? s.replace(/\{(\d+)\}/g, (m, i) => a[i]) : s));
const Pets = require('../js/pets.js');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const n = +arg('n', 80), tiers = arg('tiers', '1,3,6,10').split(',').map(Number);
const species = ['dog', 'cat', 'hamster', 'turtle', 'griffinchick', 'dragonling', 'phoenixchick'];
const ints = [1, 5, 10, 20, 35, 50, 75, 100];
// ум → опыт (обратная функция к Pets.intellect)
const xpFor = (i) => Math.ceil(-Pets.INT_XP * Math.log(1 - (i - 1) / 99));

function duel(sp, tier, intel) {
  const pet = { speciesId: sp, tier, xp: intel >= 100 ? 1e6 : xpFor(intel), durability: 3, maxDurability: 3 };
  const pf = Pets.petFighter(pet), mult = (process.env.PET_HP ? +process.env.PET_HP * (intel < Pets.NOVICE_INT ? 1.2 : 1) : Pets.boardHp(pet)), dm = +(process.env.PET_DMG || Pets.boardDmg(pet));
  let wins = 0, removed = 0, rounds = 0;
  const donor = Pets.donorOf(sp);
  for (let k = 0; k < n; k++) {
    sim.seed((k + 1) * 7919 + tier * 131 + intel);
    const hero = sim.makeHero({ faction: 'none', level: 1, gear: Gear.emptyLoadout() });
    Object.assign(hero, { name: sp, max: Math.round(pf.max * mult), hp: Math.round(pf.max * mult), dmg: pf.dmg * dm, stats: pf.stats, ability: pf.ability, base: pf.max, heroLevel: 1 });
    const mon = sim.makeMonster(donor, tier);
    const base = sim.aiPlayer(intel);
    const player = { choose: (S, h, canMagic, locked) => base.choose(S, h, {}, locked) };
    const S = sim.Battle(hero, mon, player).run();
    if (S.winner === 'left') wins++;
    removed += 1 - Math.max(0, mon.hp) / mon.max;
    rounds += S.stats.rounds;
  }
  return { win: wins / n, removed: removed / n, rounds: rounds / n };
}

const rows = [];
for (const tier of tiers) {
  console.log(`\n== Цвет ${tier}: победа питомца / доля ХП врага, снятая за бой (%) ==`);
  console.log('вид'.padEnd(14) + ints.map((i) => ('ум' + i).padStart(10)).join(''));
  for (const sp of species) {
    const cells = ints.map((i) => { const r = duel(sp, tier, i); rows.push({ sp, tier, int: i, ...r }); return `${Math.round(r.win * 100)}/${Math.round(r.removed * 100)}`.padStart(10); });
    console.log(sp.padEnd(14) + cells.join(''));
  }
}
const avg = (f) => { const a = rows.filter(f); return a.reduce((s, r) => s + r.removed, 0) / (a.length || 1); };
console.log('\nСреднее по видам и цветам, доля ХП врага за бой:', ints.map((i) => `ум${i}: ${Math.round(avg((r) => r.int === i) * 100)}%`).join('  '));
console.log('Победы питомца в среднем:', ints.map((i) => { const a = rows.filter((r) => r.int === i); return `ум${i}: ${Math.round(100 * a.reduce((s, r) => s + r.win, 0) / a.length)}%`; }).join('  '));
