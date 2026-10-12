/* Симулятор «карьеры» героя: от 1-го уровня до 100-го. Проверяет вместе опыт, экономику и баланс.
   Запуск: node tools/career.js [--faction=dwarf] [--runs=3] [--battles=2500] [--seed=1]
   Герой ведёт себя как разумный игрок: выбирает существ по оценке опасности (обычно «Равных» и «Лёгких»,
   с наибольшим ожидаемым опытом), сражается моделью «среднего» игрока, после боя покупает в лавке
   вещи получше, улучшает надетое в кузнице, продаёт лишнее и держит в ранце пару зелий. */

const sim = require('./sim.js');
const HexMap = require('../js/hexmap.js');
const Village = global.Village = require('../js/village.js');
const { Tiers, Gear, Bestiary, Factions, Combat, Hero, Balance } = global;
const rnd = () => sim.rand();
const ri = (n) => Math.floor(rnd() * n);

// Какие виды живут на каком цвете (как на карте).
const SPECIES_AT = {};
for (let t = 1; t <= 10; t++) SPECIES_AT[t] = Bestiary.ORDER.filter((id) => HexMap.SPAWN[id] && t >= HexMap.SPAWN[id].tiers[0] && t <= HexMap.SPAWN[id].tiers[1]);

function heroView(P) {
  const gear = P.loadout, L = P.level;
  const stats = Gear.combine(Gear.stats(gear), Factions.statsAt(P.faction, Hero.tierFloat(L)));
  return { max: Hero.baseHp(L) + stats.health, dmg: Hero.dmgMult(L), stats };
}
function monView(id, t) {
  const sc = Bestiary.scaled(id, t);
  return { max: sc.hp, dmg: sc.dmg, stats: sc.stats, ai: sc.ai };
}
const refChance = (P, gear) => {                   // насколько хороша экипировка: шанс против орка своего цвета
  const save = P.loadout; P.loadout = gear;
  const p = Combat.winChance(heroView(P), monView('orc', Hero.tierFor(P.level)), 'orc');
  P.loadout = save;
  return p;
};

function makeShop(P) {
  const top = Hero.tierFor(P.level), pool = [];
  for (const it of Gear.itemsFor(P.faction)) for (let k = 0; k < { common: 6, rare: 3, epic: 1 }[it.rarity]; k++) pool.push(it);
  return Array.from({ length: 8 }, () => Gear.makeEntry(pool[ri(pool.length)].id, Math.max(1, top - ri(2) + (process.argv.includes('--refit') && ri(8) === 0 ? 1 : 0))));   // --refit: изредка попадается вещь цвета на один выше
}
const slotsFor = (it) => (it.type === 'weapon1' ? ['main', 'off'] : it.type === 'weapon2' ? ['main'] : it.type === 'shield' ? ['off'] : [it.type]);

// Лучшая замена: куда надеть вещь, чтобы стало лучше всего (в пределах лимита очков). null — не лучше.
function bestPlacement(P, entry) {
  const it = Gear.item(entry);
  if (!Hero.canWear(it.wt, P.level) || (it.faction && it.faction !== P.faction)) return null;
  const base = refChance(P, P.loadout);
  let best = null;
  for (const slot of slotsFor(it)) {
    if (!Gear.canEquip(P.loadout, entry, slot, P.faction).ok) continue;
    const g = Gear.equip(P.loadout, entry, slot);
    if (Gear.totalCost(g) > Hero.budget(P.level)) continue;
    const gain = refChance(P, g) - base;
    if (gain > 0.004 && (!best || gain > best.gain)) best = { slot, gain, gear: g };
  }
  return best;
}

function career({ faction = 'dwarf', battles = 2500, seed = 1, verbose = false, guards = false } = {}) {
  const opts = { guards }, guard = {};
  sim.seed(seed * 7777 + 1);
  const P = { faction, level: 1, xp: 0, coins: 500, loadout: Gear.emptyLoadout(), res: {}, bag: { potion: 2, elixir: 1, dust: 1, scroll: 1 } };
  for (const [slot, id] of Object.entries(sim.STARTER)) if (id) P.loadout[slot] = Gear.makeEntry(id, 1);
  const perLevel = {};
  const coinPerk = Factions.perk(faction, 'coins'), shopPerk = Factions.perk(faction, 'shop'), forgePerk = Factions.perk(faction, 'forge');
  const R = (k, t) => P.res[k + ':' + t] || 0;
  let b = 0;
  for (; b < battles && P.level < Hero.MAX_LEVEL; b++) {
    const L = P.level, tf = Hero.tierFor(L), hv = heroView(P);
    if (opts.guards && (L % 10 === 5 || L % 10 === 0) && L >= 15) {          // контрольные точки для стражей
      const ch = Story.CHAPTERS.find((c) => c.tier === (L % 10 === 5 ? tf + 1 : tf));
      const key = (L % 10 === 5 ? 'mid' : 'end');
      if (ch && !guard[ch.id + key]) guard[ch.id + key] = { id: ch.id, at: key, level: L, p: guardCheck(P, ch) };
    }
    const lv = perLevel[L] || (perLevel[L] = { battles: 0, wins: 0, coins: P.coins, gearTier: 0, chance: 0, buys: 0, forges: 0, spent: 0, budgetUse: 0 });
    // выбор противника
    const cand = [];
    for (let t = Math.max(1, tf - 1); t <= Math.min(10, tf + 1); t++) for (const id of SPECIES_AT[t]) {
      const p = Combat.winChance(hv, monView(id, t), id), xp = Hero.xpReward(Bestiary.MONSTERS[id], t, L);
      cand.push({ id, t, p, xp, v: p * xp });
    }
    let pool = cand.filter((c) => c.p >= Balance.danger.bands.even).sort((a, c) => c.v - a.v);
    if (!pool.length) pool = cand.sort((a, c) => c.p - a.p);
    const pick = pool[ri(Math.min(3, pool.length))];
    // бой
    // эликсиры (--elx=N): N видов цвета героя на бой, пока хватает монет сверх запаса; силу считает симулятор боя
    const elxN = Number((process.argv.find((x) => x.startsWith('--elx=')) || '--elx=0').split('=')[1]), plan = {};
    const elxPrice = Elixirs.price(tf), elxReserve = Math.round(Hero.consumablePrice(Gear.CONSUMABLES.potion.price, L) * shopPerk) * 4;
    for (const kind of ['power', 'fury', 'block', 'ricochet', 'health', 'cunning', 'stones', 'defense', 'swap'].slice(0, elxN)) {
      if (P.coins - elxPrice < elxReserve) break;
      P.coins -= elxPrice; lv.spent += elxPrice; global.__elxCoins = (global.__elxCoins || 0) + elxPrice; plan[kind] = tf;
    }
    const hero = sim.makeHero({ faction, level: L, gear: P.loadout, bag: P.bag, elixirs: plan });
    const mon = sim.makeMonster(pick.id, pick.t);
    const S = sim.Battle(hero, mon, sim.humanPlayer({ items: pick.p < 0.62 })).run();
    P.bag = hero.bag;
    lv.battles++; lv.chance += pick.p; lv.budgetUse += Gear.totalCost(P.loadout) / Hero.budget(L);
    lv.gearTier += Gear.SLOTS.map((s) => Gear.item(P.loadout[s])).filter(Boolean).reduce((s, it, _, a) => s + it.tier / a.length, 0);
    if (S.winner === 'left') {
      lv.wins++;
      P.xp += Hero.xpReward(Bestiary.MONSTERS[pick.id], pick.t, L);
      const d = Bestiary.rollDrops(pick.id, pick.t, rnd, faction);
      P.coins += Math.round(d.coins * coinPerk * Number((process.argv.find((x) => x.startsWith('--coinK=')) || '--coinK=1').split('=')[1]));
      for (const r of d.resources) P.res[r.kind + ':' + r.tier] = R(r.kind, r.tier) + r.n;
      if (d.item) { const pl = bestPlacement(P, d.item); if (pl) P.loadout = pl.gear; else P.coins += Gear.sellValue(Gear.item(d.item).price); }
      if (rnd() < Balance.rewards.consumableChance) { const k = Object.keys(Gear.CONSUMABLES)[ri(4)]; P.bag[k] = (P.bag[k] || 0) + 1; }
      const lvl = Hero.levelOf(P.xp).level;
      if (lvl > P.level) P.level = lvl;
    }
    // лавка: одна лучшая покупка за визит, запас на зелья
    const potionPrice = Math.round(Hero.consumablePrice(Gear.CONSUMABLES.potion.price, P.level) * shopPerk);
    const reserve = potionPrice * 2;
    const stock = makeShop(P);
    for (let k = 0; k < 3; k++) {                   // до трёх покупок за визит
      let best = null;
      for (const e of stock) {
        for (const refit of (process.argv.includes('--refit') ? [false, true] : [false])) {
          const fc = refit && Gear.fitCost(e, P.level);
          if (refit && !fc) continue;
          const price = Math.round(Gear.item(e).price * shopPerk) + (fc ? Math.round(fc.coins * forgePerk) : 0);
          if (P.coins - price < reserve) continue;
          const pl = bestPlacement(P, refit ? { ...e, fit: true } : e);
          if (pl && (!best || pl.gain / price > best.gain / best.price)) best = { ...pl, price, e, refit };
        }
      }
      if (!best) break;
      P.coins -= best.price; P.loadout = best.gear; stock.splice(stock.indexOf(best.e), 1); lv.buys++; lv.spent += best.price; if (best.refit) global.__refits = (global.__refits || 0) + 1;
    }
    // кузница: улучшить надетое, если хватает ресурсов и монет
    for (const slot of Gear.SLOTS) {
      const e = P.loadout[slot];
      if (!e || typeof e === 'string') continue;
      const it = Gear.item(e);
      if (!Hero.canWear(it.tier + 1, P.level)) continue;
      const c = Gear.upgradeCost(e);
      if (!c) continue;
      const coins = Math.round(c.coins * forgePerk);
      if (P.coins - coins < reserve || !c.res.every((r) => R(r.kind, r.tier) >= r.n)) continue;
      const g = { ...P.loadout, [slot]: { ...e, tier: it.tier + 1 } };
      if (Gear.totalCost(g) > Hero.budget(P.level)) continue;
      P.coins -= coins; lv.forges++; lv.spent += coins;
      for (const r of c.res) P.res[r.kind + ':' + r.tier] -= r.n;
      P.loadout = g;
    }
    // закалка (--temper=N: предел шага, 0..5): самые дешёвые шаги по всей экипировке, пока хватает монет сверх запаса
    const tcap = process.argv.includes('--village') ? Village.temperCap(P.village || {}) : Number((process.argv.find((x) => x.startsWith('--temper=')) || '--temper=0').split('=')[1]);
    for (let guard = 0; guard < 40 && tcap > 0; guard++) {
      let pick = null;
      for (const slot of Gear.SLOTS) {
        const e = P.loadout[slot];
        if (!e || typeof e === 'string') continue;
        const tc = Gear.temperCost(e);
        if (!tc || tc.plus > tcap || P.coins - tc.coins < reserve) continue;
        if (!pick || tc.coins < pick.tc.coins) pick = { slot, e, tc };
      }
      if (!pick) break;
      P.coins -= pick.tc.coins; lv.spent += pick.tc.coins; global.__tempers = (global.__tempers || 0) + 1;
      P.loadout = { ...P.loadout, [pick.slot]: { ...pick.e, plus: pick.tc.plus } };
    }
    // деревня (--village): самое дешёвое доступное улучшение, пока хватает монет сверх запаса
    if (process.argv.includes('--village')) {
      P.village = P.village || {};
      for (let g = 0; g < 5; g++) {
        let pk = null;
        for (const id of Village.IDS) { const nx = Village.next(P.village, id, tf); if (nx && nx.ok && P.coins - nx.cost >= reserve && (!pk || nx.cost < pk.nx.cost)) pk = { id, nx }; }
        if (!pk) break;
        P.coins -= pk.nx.cost; lv.spent += pk.nx.cost; Village.buy(P.village, pk.id, tf, 1e18); global.__village = (global.__village || 0) + 1; global.__villageCoins = (global.__villageCoins || 0) + pk.nx.cost;
      }
    }
    // зелья: держим два
    while ((P.bag.potion || 0) < 2 && P.coins >= potionPrice + reserve / 2) { P.coins -= potionPrice; P.bag.potion = (P.bag.potion || 0) + 1; }
    // старые ресурсы (цвет ниже на 2 и больше) продаём
    for (const k of Object.keys(P.res)) {
      const [kind, t] = k.split(':');
      if (Number(t) <= Hero.tierFor(P.level) - 2 && P.res[k] > 0) { P.coins += Math.round(Bestiary.resPrice(kind, Number(t)) * 0.5) * P.res[k]; P.res[k] = 0; }
    }
  }
  return { P, perLevel, battles: b, guard };
}

// 1.5.1: шанс победить стража осколка на середине и в конце «его» цвета (по 12 боёв)
const Story = require('../js/story.js');
function guardCheck(P, chapter, N = 12) {
  let wins = 0;
  for (let k = 0; k < N; k++) {
    const hero = sim.makeHero({ faction: P.faction, level: P.level, gear: P.loadout, bag: { ...P.bag } });
    const mon = sim.makeMonster(chapter.species, chapter.tier);
    if (!chapter.existing) { mon.max = mon.hp = Math.round(mon.max * (+process.env.STORY_HP || Story.HP_MULT)); mon.stats = { ...mon.stats, power: (mon.stats.power || 0) + (process.env.STORY_PW ? +process.env.STORY_PW : Story.POWER) }; }
    if (sim.Battle(hero, mon, sim.humanPlayer({ items: true })).run().winner === 'left') wins++;
  }
  return wins / N;
}

module.exports = { career, guardCheck };

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
  const runs = Number(args.runs || 2), factions = String(args.faction || 'human,dwarf,elf,lizard').split(',');
  const agg = {};
  let totalBattles = [], finalLevels = [];
  const guardAgg = {};
  for (const f of factions) for (let r = 0; r < runs; r++) {
    const { P, perLevel, battles, guard } = career({ faction: f, battles: Number(args.battles || 2500), seed: Number(args.seed || 1) * 100 + r, guards: !!args.guards });
    for (const g of Object.values(guard)) (guardAgg[g.id + g.at] = guardAgg[g.id + g.at] || { id: g.id, at: g.at, level: g.level, ps: [] }).ps.push(g.p);
    totalBattles.push(battles); finalLevels.push(P.level);
    for (const [L, v] of Object.entries(perLevel)) {
      const t = Hero.tierFor(Number(L)), a = agg[t] || (agg[t] = { levels: 0, battles: 0, wins: 0, coins: 0, gear: 0, chance: 0, buys: 0, forges: 0, spent: 0, budget: 0 });
      a.levels++; a.battles += v.battles; a.wins += v.wins; a.coins += v.coins; a.gear += v.gearTier; a.chance += v.chance;
      a.buys += v.buys; a.forges += v.forges; a.spent += v.spent; a.budget += v.budgetUse;
    }
  }
  console.log('| Цвет уровней | боёв на уровень | побед | ожидалось | монет в начале уровня | средний цвет вещей | покупок / ковок за уровень | лимит очков занят |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const [t, a] of Object.entries(agg)) {
    console.log(`| ${Tiers.get(Number(t)).name} | ${(a.battles / a.levels).toFixed(1)} | ${Math.round(a.wins / a.battles * 100)}% | ${Math.round(a.chance / a.battles * 100)}% | ${Tiers.moneyText(a.coins / a.levels)} | ${(a.gear / a.battles).toFixed(2)} | ${(a.buys / a.levels).toFixed(1)} / ${(a.forges / a.levels).toFixed(1)} | ${Math.round(a.budget / a.battles * 100)}% |`);
  }
  if (args.guards) {
    console.log('\n| Страж | точка | уровень героя | шанс победы (средний по прогонам) | худший |\n|---|---|---|---|---|');
    for (const g of Object.values(guardAgg)) console.log(`| ${Story.BY_ID[g.id].title} | ${g.at === 'mid' ? 'середина цвета до стража' : 'конец цвета стража'} | ${g.level} | ${Math.round(g.ps.reduce((a, x) => a + x, 0) / g.ps.length * 100)}% | ${Math.round(Math.min(...g.ps) * 100)}% |`);
  }
  console.log(`\nПерековок: ${global.__refits || 0}, шагов закалки: ${global.__tempers || 0}, улучшений деревни: ${global.__village || 0} (на ${Math.round((global.__villageCoins || 0) / 10000)} зол.), эликсиры: ${Math.round((global.__elxCoins || 0) / 10000)} зол.`);
  console.log(`\nБоёв до конца: ${totalBattles.join(', ')}; уровень в конце: ${finalLevels.join(', ')}`);
}
