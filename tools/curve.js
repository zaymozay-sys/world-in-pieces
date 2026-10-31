// Кривая развития героя (2.0.5): для каждого цвета — характеристики и победы трёх героев:
//   голый (только уровень и фракция), средний (типичное снаряжение), максимум (всё снаряжение, закалка +5, руны, огранка).
// Цель: голый ≈15%, средний ≈50%, максимум ≈85% против существ своего цвета.
// Запуск: node tools/curve.js [n=6] [c=1,2,...,10] [off=0..9 — смещение уровня внутри цвета: 0 начало, 4 середина, 9 конец]
process.chdir(require('path').join(__dirname, '..'));
const sim = require('./sim.js');
const Hero = global.Hero || require('../js/hero.js'), Gear = global.Gear || require('../js/items.js'), Stones = require('../js/stones.js'), Runes = require('../js/runes.js'), HexMap = require('../js/hexmap.js');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const N = Number(args.n || 6), COLORS = (args.c || '1,2,3,4,5,6,7,8,9,10').split(',').map(Number);
const FACTIONS = ['human', 'dwarf', 'elf', 'lizard'];
const speciesFor = (t) => Object.keys(HexMap.SPAWN).filter((id) => { const z = HexMap.SPAWN[id].tiers; return z[0] <= t && t <= z[z.length - 1] && !HexMap.SPAWN[id].rare && !HexMap.SPAWN[id].tower; });
const pickSpecies = (t) => { const s = speciesFor(t); const out = []; for (let i = 0; i < Math.min(4, s.length); i++) out.push(s[Math.floor(i * s.length / Math.min(4, s.length))]); return out; };
// «максимум»: полный набор по очкам, закалка +5 (+20% ко всем характеристикам), 9 вещей × (1 руна мощи + 1 руна жизни), огранка цвета t на 9 вещах
const maxExtra = (gear, t) => {
  const base = Gear.stats(gear), ex = { ...Gear.blankStats() };
  for (const k in base) ex[k] = Math.ceil(base[k] * Number(args.temper || 0.2));
  // гнёзда по цвету вещи (2.0.5): 1 гнездо на цветах 1–3, 2 — с 4-го; руны: половина мощи (+2 Сила), половина жизни (+8 ХП)
  const S = Runes.socketsFor({ tier: t }), runes = 9 * S;
  // 2.0.8: руна мощи — только в оружие (одно- и двуручное); остальные места занимают руны жизни
  const wt = ['main', 'off'].map((sl) => gear[sl] && Gear.item(gear[sl])).filter((it) => it && (it.type === 'weapon1' || it.type === 'weapon2')), two = wt.some((it) => it.type === 'weapon2'), W = wt.length, might = Math.min(runes, W * S), mval = (t2) => Runes.valueOf(two ? 'rune-might2' : 'rune-might', t2);
  if (args.norunes) return ex;
  ex.power += might * mval(args.flat ? 1 : t); ex.health += (runes - might) * Runes.valueOf('rune-vitality', args.flat ? 1 : t);   // 2.0.7: руны под цвет героя
  const cut = Stones.cutBonus(t); if (cut && !args.nocut) ex.power += 9 * cut.power;
  return ex;
};
if (args.hp) { const B = global.Balance || require('../js/balance.js'); args.hp.split(',').forEach((v, i) => { B.monsters.hpBoost[i] = Number(v); }); }   // hp=1.8,1.7,... — проверка набора множителей без правки файла
if (args.dmg) { const B = global.Balance || require('../js/balance.js'); args.dmg.split(',').forEach((v, i) => { B.monsters.dmgScale[i] = Number(v); }); }   // dmg=1,1,... — то же для урона
const rows = [];
for (const t of COLORS) {
  const L = Math.min(100, Hero.itemLevel(t) + Number(args.off || 0)), mons = pickSpecies(t);
  const res = {};
  for (const build of ['голый', 'средний', 'максимум']) {
    let w = 0, k = 0, st = null;
    for (const faction of FACTIONS) for (const monster of mons) {
      const g = () => (build === 'голый' ? Gear.emptyLoadout() : sim.typicalGear(L, build === 'максимум' ? 1 : 0.8));
      const gear0 = g();
      const extra = build === 'максимум' && !args.noextra ? maxExtra(gear0, t) : undefined;
      const r = sim.simulate({ faction, level: L, monster, tier: t, n: N, gear: g, extra, seedBase: 11 });
      w += r.win; k++;
      if (!st) { const hero = sim.makeHero({ faction, level: L, gear: gear0, extra }); st = hero.stats; res.hp = res.hp || {}; res.hp[build] = hero.max; }
    }
    res[build] = { win: w / k, st };
  }
  rows.push({ t, L, mons, res });
  const f = (b) => `${(100 * res[b].win).toFixed(0).padStart(3)}%`;
  const s = (b) => { const x = res[b].st; return `С${x.power} Бр${x.defense} Бл${x.block} Рк${x.ricochet} Пр${x.initiative} Яр${x.fury}`; };
  console.log(`цвет ${String(t).padStart(2)} ур.${String(L).padStart(2)} [${mons.join(',')}]\n   голый ${f('голый')} ХП ${res.hp['голый']} | средний ${f('средний')} ХП ${res.hp['средний']} ${s('средний')} | максимум ${f('максимум')} ХП ${res.hp['максимум']} ${s('максимум')}`);
}
