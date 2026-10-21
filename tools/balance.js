/* Отчёт о балансе: прогоняет много боёв в симуляторе и печатает таблицы.
   Запуск: node tools/balance.js [--n=60] [--tiers=1,3,6,10] [--player=avg] [--out=docs/balance.md] [--json=file]
   Для каждого существа и цвета: герой в начале уровней этого цвета (уровень (цвет−1)×5+1) с «типичным»
   снаряжением своего цвета, все четыре фракции поровну. Считаются доля побед, длина боя (ходы героя). */

const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

// Сильный герой конца цвета: вещи на весь лимит очков, 14 рун (6 мощи, 4 оберега, 4 ярости), по огранённой вещи
// на 7 слотов (Сила самоцвета за каждую) и все медали-наборы. Питомцы и улучшения вещей в модель не входят.
function strongExtra(tier) {
  const g = global.Tiers.HERO_DMG[tier - 1], cut = Math.max(1, Math.round(tier * 0.045 * g));   // Сила самоцвета цвета tier (Stones.cutBonus)
  return { power: 6 * 2 + 7 * cut + Math.round(7 * 0.045 * g), defense: 4 * 2 + 3 + 4, fury: 4 * 4 + 6, ricochet: 3, health: 10 };
}
// 'full' — сильные вещи + все медали (убийства существ и награды групп), эликсиры всех видов цвета героя, умения медалей и бонус коллекций.
// 'medals' — только бонусы за победы над видами и 5% коллекции, без умений и эликсиров. Не учтены: руны, огранка, питомец, алтарь.
function medalExtra(full) {
  const M = global.Medals, B = global.Bestiary, G = global.Gear;
  let st = M.bonusStats(Object.keys(B.MONSTERS).map((s) => ({ id: M.killMedalId(s) })), B);
  if (full) for (const k of M.GROUP_ORDER) st = G.combine(st, M.GROUPS[k].bonus);
  return st;
}
// ---------- рабочий процесс: считает одну задачу ----------
if (process.argv[2] === '--worker') {
  const sim = require('./sim.js');
  process.on('message', (job) => {
    if (job === 'exit') process.exit(0);
    const H = global.Hero;
    const level = job.level || H.itemLevel(job.tier);
    const gear = job.gear === 'starter' ? () => sim.STARTER : () => sim.typicalGear(level, job.power === 'strong' || job.power === 'full' || job.power === 'medals' ? 1 : (job.share || 0.8));
    const full = job.power === 'full', med = job.power === 'medals';
    const xt = full || med ? global.Gear.combine(global.Gear.combine(strongExtra(job.tier), {}), medalExtra(full)) : (job.power === 'strong' ? strongExtra(job.tier) : undefined);
    const elixirs = full ? Object.fromEntries(['power', 'defense', 'block', 'ricochet', 'fury', 'health', 'cunning', 'stones', 'swap'].map((k) => [k, job.tier])) : undefined;
    const boost = full ? { strike: 1, style: 1, daily: 1, streak: 1, familyPct: 5 } : (med ? { familyPct: 5 } : null);
    const r = sim.simulate({ extra: xt, elixirs, boost, faction: job.faction, level, monster: job.monster, tier: job.tier, n: job.n, player: job.player || 'avg', gear, seedBase: job.seed || 1, zone: job.zone });
    process.send({ job, r });
  });
  return;
}

// ---------- главный процесс ----------
function runJobs(jobs, workers = 2) {
  return new Promise((resolve) => {
    const results = [];
    let next = 0, done = 0;
    const procs = Array.from({ length: Math.min(workers, jobs.length) }, () => fork(__filename, ['--worker']));
    const bye = (p) => { if (p.connected) p.send('exit'); };
    const feed = (p) => { if (next < jobs.length) p.send(jobs[next++]); else bye(p); };
    for (const p of procs) {
      p.on('message', (m) => {
        results.push(m);
        done++;
        if (process.stderr.isTTY) process.stderr.write(`\r${done}/${jobs.length}`);
        if (done === jobs.length) { for (const q of procs) bye(q); resolve(results); } else feed(p);
      });
      feed(p);
    }
  });
}

module.exports = { runJobs };

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
  global.Tiers = require('../js/tiers.js');
  global.Balance = require('../js/balance.js');
  global.Gear = require('../js/items.js');
  const Bestiary = require('../js/bestiary.js');
  const n = Number(args.n || 40);
  const tiers = String(args.tiers || '1,3,6,10').split(',').map(Number);
  const species = args.species ? String(args.species).split(',') : Bestiary.ORDER;
  const factions = args.faction ? String(args.faction).split(',') : ['human', 'dwarf', 'elf', 'lizard'];
  const jobs = [];
  for (const monster of species) for (const tier of tiers) for (const faction of factions)
    jobs.push({ monster, tier, faction, n, player: args.player || 'avg', gear: args.gear || 'typical', power: args.power || 'avg', seed: Number(args.seed || 1) });
  const t0 = Date.now();
  runJobs(jobs, Number(args.workers || 2)).then((res) => {
    const by = {};
    for (const { job, r } of res) {
      const k = job.monster + ':' + job.tier;
      const a = by[k] || (by[k] = { monster: job.monster, tier: job.tier, n: 0, win: 0, actions: 0, med: [], fac: {} });
      a.n += job.n; a.win += r.win * job.n; a.actions += r.actions * job.n; a.med.push(r.medianActionsWin);
      a.fac[job.faction] = r.win;
    }
    const lines = [];
    lines.push(`| Существо | ${tiers.map((t) => `ц${t} побед / ходов`).join(' | ')} |`);
    lines.push(`|---|${tiers.map(() => '---').join('|')}|`);
    for (const m of species) {
      const cells = tiers.map((t) => { const a = by[m + ':' + t]; return a ? `${Math.round(a.win / a.n * 100)}% / ${(a.actions / a.n).toFixed(1)}` : '—'; });
      lines.push(`| ${Bestiary.MONSTERS[m].name} | ${cells.join(' | ')} |`);
    }
    // по фракциям
    const facTot = {};
    for (const { job, r } of res) {
      const f = facTot[job.faction] || (facTot[job.faction] = { w: 0, n: 0, ab: 0, t: {} });
      f.w += r.win * job.n; f.n += job.n; f.ab += (r.abilities || 0) * job.n;
      const t = f.t[job.tier] || (f.t[job.tier] = { w: 0, n: 0 }); t.w += r.win * job.n; t.n += job.n;
    }
    lines.push('');
    lines.push('| Фракция | всего | ' + tiers.map((t) => 'ц' + t).join(' | ') + ' | приёмов за бой |');
    lines.push('|---|---|' + tiers.map(() => '---').join('|') + '|---|');
    for (const [f, v] of Object.entries(facTot)) lines.push(`| ${f} | ${Math.round(v.w / v.n * 100)}% | ${tiers.map((t) => v.t[t] ? Math.round(v.t[t].w / v.t[t].n * 100) + '%' : '—').join(' | ')} | ${(v.ab / v.n).toFixed(2)} |`);
    const text = lines.join('\n');
    console.log('\n' + text + `\n(${res.length} задач, ${((Date.now() - t0) / 1000).toFixed(0)} с)`);
    if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(res, null, 1));
    if (args.out) fs.writeFileSync(String(args.out), text + '\n');
  });
}
