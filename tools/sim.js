/* Симулятор боёв для настройки баланса. Запуск: node tools/sim.js [--help]
   Бой идёт по тем же правилам, что и в игре: поле и каскады — engine.js, урон и приёмы — combat.js,
   числа — balance.js, существа — bestiary.js, противник — тот же ИИ (ai.js).
   Героя ведёт модель игрока (см. PLAYERS): «средний» видит ближайшие линии, но не просчитывает каскады
   и ответ противника; иногда выбирает не лучший ход. */

const path = require('path');
const J = (f) => path.join(__dirname, '..', 'js', f);

// ---------- детерминированный генератор случайных чисел (подменяет Math.random, в т. ч. для ИИ) ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = mulberry32(1);
Math.random = () => rand();
const seed = (s) => { rand = mulberry32(s); };

global.Tiers = require(J('tiers.js'));
global.Balance = require(J('balance.js'));
global.Gear = require(J('items.js'));
global.Engine = require(J('engine.js'));
global.Bestiary = require(J('bestiary.js'));
global.Factions = require(J('factions.js'));
global.Combat = require(J('combat.js'));
global.Elixirs = require(J('elixirs.js'));
global.Stones = require(J('stones.js'));
const Runes = require(J('runes.js'));
const Pets = require(J('pets.js'));
global.Medals = require(J('medals.js'));
let Hero = null;
try { Hero = require(J('hero.js')); global.Hero = Hero; } catch (e) { /* уровни героя ещё не подключены */ }
const AI = require(J('ai.js'));

// Подмена чисел для экспериментов: BAL_OVERRIDE=файл.json — { monsters: { id: {...} }, balance: {...}, factions: { id: {...} } }.
if (process.env.BAL_OVERRIDE) {
  const o = JSON.parse(require('fs').readFileSync(process.env.BAL_OVERRIDE, 'utf8'));
  const merge = (dst, src) => { for (const k in src) { if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') merge(dst[k], src[k]); else dst[k] = src[k]; } };
  if (o.monsters) for (const id in o.monsters) Object.assign(Bestiary.MONSTERS[id], o.monsters[id]);   // stats заменяются целиком
  if (o.balance) merge(Balance, o.balance);
  if (o.factions) for (const id in o.factions) { const f = Factions.LIST[id]; if (o.factions[id].stats) f.stats = o.factions[id].stats; }
  if (o.tiers) for (const k in o.tiers) Tiers[k].splice(0, Tiers[k].length, ...o.tiers[k]);
}

const N = 6, ONYX = 3;
let CHAOS_DMG = 0;
let TUNE = null;    // правила для опытов: { delay: {thr, ticks}, decay, lightOnce, burnLoot: { fire, square }, fullSpells, economic, squareCascade, tacticalLightning, utility, freeSpells, exclusiveBuffs } (доля возвращённых камней, 0..1)
let BOOST = null;   // опыт «всё усиление»: { strike, familyPct, style, daily, streak } — умения и коллекции медалей
const TYPES = ['sapphire', 'ruby', 'emerald', 'onyx'];
const MAGIC_T = [0, 1, 2];
const MAGIC_NAMES = ['sapphire', 'ruby', 'emerald'];
const B = Balance;
const stormMultiplier = f => f.stormMult || B.magic.lightning.mult;
const simFree = kind => (TUNE?.freeSpells ?? B.magic.freePrep ?? []).includes(kind);
const other = (s) => (s === 'left' ? 'right' : 'left');
const ri = (n) => Math.floor(rand() * n);

/* ---------- бойцы ---------- */
function makeHero(o) {
  const fac = o.faction === 'none' ? { hero: 'Без фракции', stats: {}, gem: null, ability: { id: 'none' } }
    : (Factions.get(o.faction) || Factions.get('dwarf'));
  const gear = o.gear || Gear.emptyLoadout();
  const facStats = o.faction === 'none' ? {} : Factions.statsAt(o.faction, Hero ? Hero.tierFloat(o.level || 1) : 1);
  let stats = Gear.combine(Gear.statsFor(gear,o.level||1), facStats);
  stats = Gear.combine(stats, Runes.bonusForGear(gear));
  if (o.extra) stats = Gear.combine(stats, o.extra);   // руны, огранка, медали и прочие усиления сверх вещей
  // 1.6.0: эликсиры { вид: цвет } — по одному каждого вида в сумке; героя «пьёт» их по правилам игры (см. elxStep в Battle)
  const elx = o.elixirs || {};
  const base = o.baseHp != null ? o.baseHp : (Hero ? Hero.baseHp(o.level || 1) : 100);
  const max = base + stats.health;
  const dmg = o.dmg != null ? o.dmg : (Hero ? Hero.dmgMult(o.level || 1) : 1);
  return { side: 'left', heroLevel: o.level || 1, level: o.level || 1, name: fac.hero, faction: o.faction, fac, gear, stats, weaponPerk: Gear.weaponPerk(gear), base, max, hp: max, dmg, buffs: [], haste: false, magic: false,
    counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 }, charge: 0, ability: null, bag: o.bag ? { ...o.bag } : {},
    stats0: stats, elx: {}, elxUsed: {}, elxPlan: { ...elx }, elxCds: {}, turnNo: 0, noFx: o.elxFx === false, critExtra: 0 };
}
function makeMonster(id, tier, o = {}) {
  const m = Bestiary.MONSTERS[id];
  let sc = o.mlvl > 0 ? Bestiary.scaledAt(id, o.mlvl, o.swarm || 1, o.level) : Bestiary.scaled(id, tier, o.swarm || 1, o.level);   // 2.4.0: mlvl — уровень существа 1–100
  // 1.7.3: хозяин зоны — крупнее и злее (World.scaleZone) и с добавочными приёмами; o.affixes — любые свойства для опытов
  let affixes = o.affixes || [];
  if (o.zone) {
    const World = require(J('world.js')), ZB = World.ZONE_BOSSES[o.zone];
    sc = World.scaleZone(sc, o.zone);
    affixes = ZB.affixes.filter((a) => a !== m.ability);
  }
  const gear = sc.gearBudget ? Gear.randomLoadout(sc.gearBudget, rand, tier) : Gear.emptyLoadout();
  const stats = Gear.combine(Gear.stats(gear), sc.stats);
  const max = Math.round((sc.hp + stats.health) * (o.elite ? 1.25 : 1));
  const level = o.aiLevel || sc.ai;
  const mon = { side: 'right', name: m.name, id, monsterId: id, tier, gear, stats, weaponPerk: Gear.weaponPerk(gear), base: sc.hp, max, hp: max, dmg: (sc.dmg || 1) * (o.elite ? 1.05 : 1), buffs: [], haste: false, magic: false,
    counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 }, ability: m.ability, level, bag: Combat.enemyBag(level), stoneMode: process.env.MOBSTONES !== '0', mobTypes: ['sapphire', 'ruby', 'emerald'],
    turnNo: 0, revived: false, charged: false, poison: null, spores: 0, clonesMade: 0, clone: null, ward: 0, stunned: false, affixes };
  Combat.startStones(mon);
  return mon;
}
function C_B_hp() { return global.Balance && global.Balance.mobHpMul; }

/* ---------- бой ---------- */
function Battle(hero, mon, player) {
  const S = {
    petF: hero.petF || null,
    typ: new Array(36).fill(-1), val: new Array(36).fill(0),
    f: { left: hero, right: mon }, over: false, winner: null,
    locks: { cols: new Set(), forSide: null }, veiled: new Set(),
    stats: { bySpell: {}, areaImpact: {}, burst: {maxShare:0,halfHits:0,fullHits:0,totalHits:0}, heroActions: 0, monActions: 0, heroDmg: 0, monDmg: 0, spells: 0, abilities: 0, rounds: 0 },
  };
  const fill = () => Engine.fillEmpty(S.typ, S.val, rand, B.board.multiplierChance);
  fill();

  const checkEnd = () => {
    if (S.over) return true;
    if (Combat.enemyDefeated(S.f.right)) { S.over = true; S.winner = 'left'; return true; }   // и оригинал, и двойник гриба
    if (S.f.left.hp <= 0) { S.over = true; S.winner = 'right'; return true; }
    return false;
  };
  const canAfford = (side, kind = 'lightning') => { const f = S.f[side], c = Combat.spellCost(f, kind); return MAGIC_NAMES.every((t) => f.counts[t] >= c); };
  const spend = (side, kind = 'lightning') => {
    if (side === 'left') S.stats.bySpell[kind] = (S.stats.bySpell[kind] || 0) + 1;
    const f = S.f[side], c = Combat.spellCost(f, kind);
    for (const t of MAGIC_NAMES) f.counts[t] -= c;
  };
  const baseSpells = ['lightning', 'fire', 'square', 'transmute', 'heal', 'chaos'];
  const extraSpells = ['strike', 'mirror', 'sacrifice', 'fury', 'tide', 'temper', 'pierce'];
  const afford = (side) => {
    const f = S.f[side], kinds = f.isPet ? Object.keys(B.petMagic.costs) : side === 'left' && TUNE && TUNE.fullSpells ? baseSpells.concat(extraSpells) : baseSpells;
    const A = Object.fromEntries(kinds.map(kind => [kind, (f.isPet || side !== 'left' || !Hero || Hero.isSpellUnlocked(kind, hero.heroLevel)) && canAfford(side, kind)]));
    if (side === 'left') {
      for (const kind of kinds) if (simFree(kind) && f.prepUsed?.[kind]) A[kind] = false;
      if (f.prepUsed?.chaosFailed) A.chaos = false;
      if ((TUNE?.exclusiveBuffs ?? B.magic.exclusiveBuffs) && (f.tripleNext || f.doubleNext)) A.fury = A.sacrifice = false;
    }
    if (A.fury) A.fury = Engine.dominantType(S.typ, S.val) === TYPES.indexOf(hero.fac.gem) && !f.doubleNext;
    if (A.mirror) A.mirror = !f.mirrorReady;
    if (A.sacrifice) A.sacrifice = f.hp > 1 && !f.tripleNext;
    return A;
  };
  const aimOnly = () => ({});   // под Молнией ИИ может добавить Крест или Захват
  const anyAfford = (side) => Object.values(afford(side)).some(Boolean);
  const hit = (side, amount, raw = false, mult = 1) => {
    // Удары героя сначала принимает живой двойник Дикого гриба (см. Combat.enemyTarget); у прочих — сам противник.
    const att = S.f[side], tgt = side === 'left' ? Combat.enemyTarget(S.f.right) : S.f.left;
    const H = S.f.left, fire = (k) => { const a = H.elx[k]; if (H.noFx || !a || a.left <= 0 || a.tier < Elixirs.FX_MIN || H.elxUsed[k]) return null; H.elxUsed[k] = true; return Elixirs.effect(k, a.tier); };
    if (!raw && side === 'right') { const fx = fire('defense'); if (fx) mult *= Math.max(0.01, 1 - fx.v / 100); }
    if (BOOST && !raw && side === 'left') {
      if (BOOST.familyPct) mult *= 1 + BOOST.familyPct / 100;
      if (BOOST.strike && tgt.hp < tgt.max * 0.3) mult *= 1.25;
    }
    const r = Combat.hit(att, tgt, amount, raw, rand, mult);
    if (TUNE && TUNE.delay && r.kind === 'hit' && tgt.max) {      // удар сверх порога достаётся цели не сразу, а долями в её ходы
      const ex = r.amount - Math.round(TUNE.delay.thr * tgt.max);
      if (ex > 0) { tgt.hp = Math.min(tgt.max, tgt.hp + ex); tgt.pend = (tgt.pend || 0) + ex; tgt.pendN = TUNE.delay.ticks; r.amount -= ex; }
    }
    if (side === 'right') {                                   // эффекты эликсиров на получаемый героем удар (как в game.js dealDamage)
      if (r.kind === 'block' || r.kind === 'blockreflect') { const fx = fire('block'); if (fx) Combat.loseHp(att, Math.max(1, Math.round(amount * fx.v / 100))); }
      if (r.kind === 'reflect' || r.kind === 'blockreflect') { const fx = fire('ricochet'); if (fx) H.hp = Math.min(H.max, H.hp + Math.max(1, Math.round((H.dmg || 1) * B.damage.stone * fx.v))); }
    }
    if (r.critExtra) H.elxUsed.fury = true;
    if (r.kind === 'hit') {
      S.stats[side === 'left' ? 'heroDmg' : 'monDmg'] += r.amount;
      if(side==='left'&&r.amount>0&&tgt.max>0){const share=r.amount/tgt.max,b=S.stats.burst;b.totalHits++;b.maxShare=Math.max(b.maxShare,share);if(share>=.5)b.halfHits++;if(share>=1)b.fullHits++;}
    }
    return r;
  };
  const addCharge = (n) => { const h = S.f.left; h.charge = Math.min(B.faction.charge, h.charge + n); };
  const empty = () => S.typ.every((t) => t < 0);
  const refillIfNeeded = () => { if (empty() || !Engine.hasMoves(S.typ)) fill(); };

  // Собирает совпадения, начисляет камни и урон, падение и сдвиг, каскады. Возвращает, была ли линия 4+.
  function resolve(side, cascadeMult = 1, impact = null) {
    const f = S.f[side], tgt = S.f[other(side)];
    const home = side === 'left' ? TYPES.indexOf(hero.fac.gem) : -1;
    // как в игре: собранный обсидиан x5 убирает соседей в радиусе 1 (Engine.obsidianBurst)
    const burst = () => Engine.obsidianBurst(S.typ, Engine.bonusMap(S.typ), ONYX, S.val);
    let extra = false, bon = burst();
    const gained = {};                              // магические камни за проход — для Хитрости противника
    let pass = 0;
    while (bon) {
      pass++;
      let dmg = 0, charge = 0;
      for (let i = 0; i < 36; i++) {
        if (!bon[i]) continue;
        const amount = S.val[i] * bon[i];
        if (side === 'left' && S.f.right.ability === 'wisp' && S.val[i] < 3) continue;   // Блуждающий огонь: x1 не засчитываются
        f.counts[TYPES[S.typ[i]]] += amount;
        if (S.typ[i] !== ONYX) gained[TYPES[S.typ[i]]] = (gained[TYPES[S.typ[i]]] || 0) + amount;
        if (S.typ[i] === home) charge += amount;
        if (S.typ[i] === ONYX || f.magic) dmg += S.val[i] * bon[i];
        if (bon[i] > 1) extra = true;
      }
      if (charge) addCharge(charge);
      if (side === 'right') { let got = 0; for (let i = 0; i < 36; i++) if (bon[i]) got += S.val[i] * bon[i]; Combat.addSpores(f, got); }   // споры гриба
      const dealt = hit(side, dmg, false, cascadeMult * (f.magic ? stormMultiplier(f) : 1) * (TUNE && TUNE.decay ? Math.pow(TUNE.decay, pass - 1) : 1));
      if (impact) { impact.waves++; if (dealt.kind === 'hit') impact.cascadeDamage += dealt.amount; }
      for (let i = 0; i < 36; i++) if (bon[i]) { S.typ[i] = -1; S.val[i] = 0; }
      if ((side === 'left' ? Combat.enemyDefeated(S.f.right) : tgt.hp <= 0) || f.hp <= 0) return extra;
      Engine.gravity(S.typ, S.val);
      Engine.shiftRight(S.typ, S.val);
      bon = burst();
    }
    Combat.cunningSteal(tgt, f, gained, rand);        // без Хитрости шанс 0 — ГСЧ не трогается
    return extra;
  }

  // Хвост действия: разбор поля, конец боя, новые камни, усиления. Возвращает 2 — дополнительный ход, 1 — нет.
  function after(side, finish = true, extraIn = false, cascadeMult = 1, impact = null) {
    const extra = resolve(side, cascadeMult, impact) || extraIn;
    if (impact && extra) impact.extra = true;
    if (finish) S.f[side].magic = Combat.continueMagic(S.f[side].magic, extra);
    if (checkEnd()) return 1;
    refillIfNeeded();
    if (!finish) return extra ? 2 : 1;
    return Combat.finishAction(S.f[side], extra).extra ? 2 : 1;
  }

  function doMove(side, a, b) {
    [S.typ[a], S.typ[b]] = [S.typ[b], S.typ[a]];
    [S.val[a], S.val[b]] = [S.val[b], S.val[a]];
    if (!Engine.bonusMap(S.typ)) {                 // неверный ход — обмен возвращается
      [S.typ[a], S.typ[b]] = [S.typ[b], S.typ[a]];
      [S.val[a], S.val[b]] = [S.val[b], S.val[a]];
      return 0;
    }
    const extra = resolve(side);
    S.f[side].magic = TUNE && TUNE.lightOnce ? false : Combat.continueMagic(S.f[side].magic, extra);   // как в игре: Молния держится на доп. ходах
    if (checkEnd()) return 1;
    refillIfNeeded();
    return Combat.finishAction(S.f[side], extra).extra ? 2 : 1;
  }

  const FIRE_RADIUS = 2;    // Огненный крест ('cross') ограничен областью 5x5 вокруг цели; 'row' (дыхание дракона) — нет.
  function burn(side, idx, shape = 'cross', mult = 1, free = false) {
    if (!free) spend(side, shape === 'square' ? 'square' : 'fire');
    const r0 = Math.floor(idx / N), c0 = idx % N;
    let dmg = 0, obs = 0, spellMul = 1;
    const gain = [0, 0, 0, 0];
    const cells = [];
    for (let i = 0; i < 36; i++) {
      if (S.typ[i] < 0) continue;
      const r = Math.floor(i / N), c = i % N;
      if (shape === 'row' ? r !== r0 : shape === 'square' ? (Math.abs(r - r0) > 1 || Math.abs(c - c0) > 1) : (r !== r0 && c !== c0)) continue;
      if (shape === 'cross' && (Math.abs(r - r0) > FIRE_RADIUS || Math.abs(c - c0) > FIRE_RADIUS)) continue;
      if (shape === 'row') dmg += S.val[i] * mult;
      else {                                          // крест/квадрат: копилка; урон = фикс + базовый + обсидианы (или все под Молнией)
        if (side === 'left' && S.f.right.ability === 'wisp' && S.val[i] < 3) { cells.push(i); continue; }
        gain[S.typ[i]] += S.val[i];
        if (S.typ[i] === ONYX) obs += S.val[i];
      }
      cells.push(i);
    }
    if (shape !== 'row') {
      const fl = S.f[side];
      const share = Math.max(0, Math.min(1, (!free && TUNE && TUNE.burnLoot ? TUNE.burnLoot[shape === 'square' ? 'square' : 'fire'] : undefined) ?? (Combat.areaSpellRules(shape, free).collect ? 1 : 0)));
      for (let i = 0; i < 4; i++) {
        const n = Math.floor(gain[i] * share);
        fl.counts[TYPES[i]] += n;
        if (side === 'left' && TYPES[i] === hero.fac.gem) addCharge(n);
      }
      dmg = (shape === 'square' ? B.magic.square : B.magic.cross).fixed + obs;
      spellMul = (shape === 'square' ? B.magic.square : B.magic.cross).mult * mult;
    }
    const kind = shape === 'square' ? 'square' : 'fire';
    const direct = hit(side, dmg, false, spellMul);
    const impact = side === 'left' && !free && shape !== 'row' ? { directDamage: direct.kind === 'hit' ? direct.amount : 0, cascadeDamage: 0, waves: 0, extra: false } : null;
    const recordImpact = () => {
      if (!impact) return;
      const aggregate = S.stats.areaImpact[kind] || (S.stats.areaImpact[kind] = { casts: 0, directDamage: 0, cascadeDamage: 0, waves: 0, withCascade: 0, withExtra: 0 });
      aggregate.casts++;
      for (const k of ['directDamage', 'cascadeDamage', 'waves']) aggregate[k] += impact[k];
      if (impact.waves) aggregate.withCascade++;
      if (impact.extra) aggregate.withExtra++;
    };
    for (const i of cells) { S.typ[i] = -1; S.val[i] = 0; }
    if (S.f.left.hp <= 0 || Combat.enemyDefeated(S.f.right)) { recordImpact(); checkEnd(); return 1; }
    Engine.gravity(S.typ, S.val);
    Engine.shiftRight(S.typ, S.val);
    // Бонус только в каскадах этого Захвата, никогда не переносится на следующий ход.
    const cascadeMult = shape === 'square' && !free ? (TUNE?.squareCascade ?? Combat.areaSpellRules('square').cascadeMult) : 1;
    const result = after(side, !free, false, cascadeMult, impact);
    recordImpact();
    return result;
  }
  function transmute(side, idx) {
    spend(side, 'transmute');
    const ct = S.typ[idx], r0 = Math.floor(idx / N), c0 = idx % N;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || c < 0 || r >= N || c >= N) continue;
      if (S.typ[r * N + c] === ct) S.typ[r * N + c] = ONYX;
    }
    return after(side);
  }
  function heal(side) {
    spend(side, 'heal');
    const f = S.f[side];
    let sum = 0;
    for (let i = 0; i < 36; i++) if (S.typ[i] === 2) sum += S.val[i];
    f.hp += Combat.rainHeal(f, sum);
    for (let i = 0; i < 36; i++) if (S.typ[i] === 2 && S.val[i] > 1) S.val[i] -= 2;
    return after(side);
  }
  const freeUtility = (side, kind) => side === 'left' && simFree(kind);
  function chaos(side, idx) {
    if (side === 'left') {
      const chosen = Number.isInteger(idx) ? idx : 14;
      const cells = zoneCells(chosen).filter(i=>S.typ[i]>=0), tiles=cells.map(i=>[S.typ[i],S.val[i]]);
      if(tiles.length<2)return 0;
      const place=p=>cells.forEach((i,j)=>{S.typ[i]=p[j][0];S.val[i]=p[j][1];});
      const value=p=>{place(p);return AI.layoutValue(S.typ,S.val);};
      let best=tiles.slice(), bestV=value(best), cur=best, curV=bestV;
      for(let k=0;k<120;k++) {
        const p=k%3?cur.slice():tiles.slice();
        if(k%3) {const a=ri(p.length), b=ri(p.length);[p[a],p[b]]=[p[b],p[a]];}
        else for(let a=p.length-1;a>0;a--){const b=ri(a+1);[p[a],p[b]]=[p[b],p[a]];}
        const v=value(p);if(v>curV){cur=p;curV=v;}if(v>bestV){best=p;bestV=v;}
      }
      if(bestV===-Infinity) for(let k=0;k<200&&bestV===-Infinity;k++){
        const p=tiles.slice();for(let a=p.length-1;a>0;a--){const b=ri(a+1);[p[a],p[b]]=[p[b],p[a]];}
        const v=value(p);if(v>bestV){best=p;bestV=v;}
      }
      place(best);
      if(best.every((a,i)=>a[0]===tiles[i][0]&&a[1]===tiles[i][1]))return 0;
      spend(side,'chaos');
      if(freeUtility(side,'chaos')){S.f[side].prepUsed.chaos=true;after(side,false);return S.over?1:2;}
      return after(side);
    }
    spend(side, 'chaos');
    { const e = S.typ.filter((x) => x < 0).length * (CHAOS_DMG || B.magic.chaos.perEmpty); if (e > 0) hit(side, e); }   // Хаос бьёт за каждую пустую клетку (Balance.magic.chaos.perEmpty)
    const cells = [];
    for (let i = 0; i < 36; i++) if (S.typ[i] >= 0) cells.push(i);
    const tiles = cells.map((i) => [S.typ[i], S.val[i]]);
    let fallback = null;
    for (let k = 0; k < 200; k++) {
      const perm = tiles.slice();
      for (let i = perm.length - 1; i > 0; i--) { const j = ri(i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }
      cells.forEach((c, i) => { S.typ[c] = perm[i][0]; S.val[c] = perm[i][1]; });
      fallback = fallback || perm;
      if (!Engine.bonusMap(S.typ) && Engine.hasMoves(S.typ)) { fallback = null; break; }
    }
    if (fallback) cells.forEach((c, i) => { S.typ[c] = fallback[i][0]; S.val[c] = fallback[i][1]; });
    return after(side);
  }
  // Расширенная модель героя для аудита магии (tune.fullSpells). Эффекты повторяют game.js.
  function extraSpell(side, act) {
    const f = S.f[side], kind = act.kind;
    if (kind === 'temper' || kind === 'pierce') {
      const i = act.idx;
      if (!Number.isInteger(i) || i < 0 || i >= 36 || S.typ[i] < 0) return 0;
      if (kind === 'temper') {
        const cells = [i, i-6, i+6].concat(i%6>0 ? [i-1] : [], i%6<5 ? [i+1] : [])
          .filter(j => j >= 0 && j < 36 && S.typ[j] >= 0 && S.val[j] < 5);
        if (!cells.length) return 0;
        spend(side, kind);
        for (const j of cells) S.val[j] += 2;
        if(freeUtility(side,'temper')){f.prepUsed.temper=true;return 2;}
        return after(side);
      }
      spend(side, kind);
      if (!(side === 'left' && S.f.right.ability === 'wisp' && S.val[i] < 3)) {
        f.counts[TYPES[S.typ[i]]] += S.val[i];
        if (side === 'left' && TYPES[S.typ[i]] === hero.fac.gem) addCharge(S.val[i]);
      }
      S.typ[i] = -1; S.val[i] = 0;
      Engine.gravity(S.typ, S.val); Engine.shiftRight(S.typ, S.val);
      after(side, false);
      return S.over ? 1 : 2;
    }
    spend(side, kind);
    if (kind === 'strike') hit(side, Combat.strikeDamage(f), true);
    else if (kind === 'mirror') Combat.applyMirror(f);
    else if (kind === 'sacrifice') Combat.applySacrifice(f);
    else if (kind === 'fury') Combat.applyFury(f);
    else if (kind === 'tide') {
      const present = MAGIC_T.filter(t => S.typ.includes(t));
      if (present.length) {
        const from = present[ri(present.length)], rest = MAGIC_T.filter(t => t !== from), to = rest[ri(rest.length)];
        for (let i = 0; i < 36; i++) if (S.typ[i] === from) S.typ[i] = to;
      }
    }
    if(checkEnd()) return 1;
    if(freeUtility(side,kind) && (kind==='fury'||kind==='sacrifice'||kind==='mirror')) { f.prepUsed[kind]=true; return 2; }
    return after(side);
  }
  function prankSwap() {
    const cells = [];
    for (let i = 0; i < 36; i++) if (S.typ[i] >= 0) cells.push(i);
    for (let k = 0; k < 40 && cells.length > 1; k++) {
      const a = cells[ri(cells.length)], b = cells[ri(cells.length)];
      if (S.typ[a] === S.typ[b]) continue;
      [S.typ[a], S.typ[b]] = [S.typ[b], S.typ[a]]; [S.val[a], S.val[b]] = [S.val[b], S.val[a]];
      if (!Engine.bonusMap(S.typ) && Engine.hasMoves(S.typ)) return true;
      [S.typ[a], S.typ[b]] = [S.typ[b], S.typ[a]]; [S.val[a], S.val[b]] = [S.val[b], S.val[a]];
    }
    return false;
  }
  const lockedCells = (side) => {
    const out = [];
    if(S.locks.forSide===side)for (const c of S.locks.cols) for (let r = 0; r < N; r++) out.push(r * N + c);
    if(side==='right'&&S.foeVeiled)out.push(...S.foeVeiled);
    return out.length?out:null;
  };
  const useItem = (side, kind) => {
    const f = S.f[side];
    if (!(f.bag[kind] > 0)) return false;
    if (!Combat.useConsumable(f, kind, MAGIC_NAMES)) return false;
    f.bag[kind]--;
    return true;
  };

  /* ---------- ход существа ---------- */
  const tickPend = (f) => { if (f.pend > 0 && f.pendN > 0) { const d = Math.ceil(f.pend / f.pendN); f.pendN--; f.pend -= d; f.hp -= d; if (f.pendN <= 0) f.pend = 0; } };
  function monsterTurn() {
    const f = S.f.right, h = S.f.left;
    f.turnNo++; tickPend(f); if (checkEnd()) return;
    if (f.poison && f.poison.turns > 0) {
      const dmg=Combat.tickPoison(f.poison);
      Combat.hit(h, f, dmg, true, rand);
      S.stats.heroDmg += dmg;
      if (checkEnd()) return;
    }
    if (f.hp <= 0) { cloneTurn(); return; }           // оригинал гриба пал, но его двойник ещё стоит
    const applyAct = (act) => {
    if (act) {
      if (act.kind === 'prank') prankSwap();
      else if (act.kind === 'petrify') {
        const cols = [...Array(N).keys()].filter((c) => [...Array(N).keys()].some((r) => S.typ[r * N + c] >= 0));
        if (cols.length) S.locks = { cols: new Set([cols[ri(cols.length)]]), forSide: 'left' };
      } else if (act.kind === 'veil') {
        const cells = [];
        for (let i = 0; i < 36; i++) if (S.typ[i] >= 0) cells.push(i);
        for (let k = 0; k < act.stones && cells.length; k++) S.veiled.add(cells.splice(ri(cells.length), 1)[0]);
      } else if (act.kind === 'breath') {
        let best = -1, bestN = 0;
        for (let r = 0; r < N; r++) { let n = 0; for (let c = 0; c < N; c++) if (S.typ[r * N + c] >= 0) n++; if (n > bestN) { bestN = n; best = r; } }
        if (best >= 0) { burn('right', best * N, 'row', act.mult, true); if (S.over) return; }
      }
    }
    };
    applyAct(Combat.monsterTurnStart(f, h, MAGIC_NAMES, rand));
    if (S.over) return;
    for (const ax of f.affixes || []) {          // 1.7.3: свойства — вторым действием в начале хода (как в game.js)
      const keep = f.ability;
      let a2 = null;
      f.ability = ax;
      try { a2 = Combat.monsterTurnStart(f, h, MAGIC_NAMES, rand); } finally { f.ability = keep; }
      applyAct(a2);
      if (S.over) return;
    }
    for (let guard = 0; guard < 20; guard++) {
      for (const k of Combat.enemyItemPlan(f, anyAfford('right'), rand)) useItem('right', k);
      const v = Combat.aiView(f, h);
      const mv = AI.choose(S.typ.slice(), S.val.slice(), v.hpMe, v.hpOpp, f.level + Combat.intelBonus(f), f.magic ? aimOnly() : afford('right'),
        { maxMe: v.maxMe, healMult: v.healMult, want: Combat.wantGems(f), locked: lockedCells('right'), strike: Combat.strikeDamage(f), lightning: f.magic ? stormMultiplier(f) : 0 });
      if (!mv) break;
      S.stats.monActions++;
      let res;
      if (mv.kind === 'fire') res = burn('right', mv.idx);
      else if (mv.kind === 'square') res = burn('right', mv.idx, 'square');
      else if (mv.kind === 'transmute') res = transmute('right', mv.idx);
      else if (mv.kind === 'heal') res = heal('right');
      else if (mv.kind === 'chaos') res = chaos('right');
      else {
        if (mv.kind === 'lightning') { f.magic = true; spend('right', 'lightning'); }
        res = doMove('right', mv.a, mv.b);
      }
      if (S.over) return;
      if (res !== 2 || f.hp <= 0) break;
    }
    if (S.locks.forSide === 'right') S.locks = { cols: new Set(), forSide: null };
    S.foeVeiled?.clear();
    cloneTurn();
    // 1.7.3: Оглушение — герой пропускает ход, существо ходит ещё раз; Отрава — яд жжёт героя в начале его хода
    if (h.stunned && !S.over) { h.stunned = false; S.stats.stuns = (S.stats.stuns || 0) + 1; monsterTurn(); return; }
    if (h.poison && h.poison.turns > 0 && !S.over) {
      const dmg=Combat.tickPoison(h.poison);
      Combat.hit(f, h, dmg, true, rand);
      S.stats.monDmg += dmg;
      checkEnd();
    }
  }

  // Двойник Дикого гриба ходит сразу после оригинала (Combat.turnOrder): автоатака героя без поля, как питомец.
  function cloneTurn() {
    const f = S.f.right;
    if (S.over || !Combat.cloneAlive(f)) return;
    const r = Combat.hit(f.clone, S.f.left, Combat.cloneAttackAmount(f.clone), false, rand);
    if (r.kind === 'hit') S.stats.monDmg += r.amount;
    checkEnd();
  }

  // Питомец (как в game.js petTurn): после хода героя бьёт противника автоатакой, пока жив; монстр бьёт только героя.
  function petTurn() {
    const pf = S.petF;
    if (!pf || pf.hp <= 0 || S.over) return;
    const r = Combat.hit(pf, Combat.enemyTarget(S.f.right), Pets.petAttackAmount(pf), false, rand);
    if (r.kind === 'hit') S.stats.petDmg = (S.stats.petDmg || 0) + r.amount;
    checkEnd();
  }

  /* ---------- ход героя ---------- */
  // 1.6.0: эликсиры по правилам игры: длинные — в первом ходе; Сила — в первом ходе, где есть крупный ход (или в 6-м);
  // Жизнь — при ХП ниже половины; Камни — со 2-го хода; Жизнь, Камни и Превращение делят «раз в ход»
  function recalcElixir(h) {
    h.stats=Gear.combine(h.stats0,Elixirs.bonusStats(h.elx));
    for(const [key,field] of [['venom','tempVenom'],['leech','tempLeech'],['leechPower','tempLeechP'],['defense','tempDef']]) h.stats[key]=(h.stats[key]||0)+(h[field]||0);
    h.elxPct=Elixirs.activePct(h.elx);
    h.max=Math.round((h.base+(h.stats.health||0))*(h.elx.road?.left>0?1+Elixirs.ROAD_HP:1))+(h.tempMax||0);
    h.hp=Math.min(h.hp,h.max);
  }
  function drinkElixir(kind) {
    const h = S.f.left, t = h.elxPlan[kind]; delete h.elxPlan[kind];
    const K = Elixirs.KINDS[kind];
    const fx=!h.noFx&&Elixirs.effect(kind,t);
    if(fx?.venom)h.tempVenom=(h.tempVenom||0)+fx.venom;
    if(fx?.leech){h.tempLeech=(h.tempLeech||0)+fx.leech;h.tempLeechP=(h.tempLeechP||0)+(fx.leechPower||0);}
    if (K.mode === 'instant') {
      h.elxCds[kind] = Elixirs.cdOf(kind);
      if (kind === 'health') h.hp = Math.min(h.max, h.hp + Elixirs.heal(t));
      else if (kind === 'swap') {
        let hi = MAGIC_NAMES[0], lo = MAGIC_NAMES[0];
        for (const m of MAGIC_NAMES) { if (h.counts[m] > h.counts[hi]) hi = m; if (h.counts[m] < h.counts[lo]) lo = m; }
        const n = Elixirs.swapMove(t, h.counts[hi], h.counts[lo]); h.counts[hi] -= n; h.counts[lo] += n;
      } else for (const m of MAGIC_NAMES) h.counts[m] += Elixirs.stonesGain(t);
      recalcElixir(h); return;
    }
    if (kind === 'endure') { h.endure = true; return; }              // 2.0.7: «Стойкость»; «Вкусный корм» в симуляторе без питомца не действует
    if (kind === 'food') return;
    Elixirs.drink(h.elx, kind, t, 0); h.elxUsed[kind] = false;
    if (K.haste) h.haste = true;                                       // 2.0.7: «Тоник скорости» — дополнительный ход
    if (K.road) { const m = Math.round(h.max * Elixirs.ROAD_HP); h.max += m; h.hp += m; }   // «Тоник дороги»: +10% к максимуму ХП
    recalcElixir(h);
  }
  function elxStep() {
    const h = S.f.left, plan = h.elxPlan;
    for (const kind of Object.keys(plan)) {
      const K = Elixirs.KINDS[kind];
      if (K.mode === 'long' || kind === 'endure') drinkElixir(kind);
      else if (kind === 'power') {
        const mv = heroMoves(S, null, false, -1);
        if ((mv.length && mv[0].dmg >= (S.bigHit || 6)) || h.turnNo >= 6) drinkElixir(kind);
      } else if (!(h.elxCds[kind] > 0)) {
        if (kind === 'health' && h.hp < h.max * 0.5) drinkElixir(kind);
        else if (kind === 'stones' && h.turnNo >= 2) drinkElixir(kind);
        else if (kind === 'swap' && h.turnNo >= 3) {                  // когда есть что менять и разница заметна
          const c = MAGIC_NAMES.map((m) => h.counts[m]);
          if (Math.max(...c) - Math.min(...c) >= 4) drinkElixir(kind);
        }
      }
    }
  }
  function elxEndTurn() {
    const h = S.f.left;
    if (!Object.keys(h.elx).length) return;
    Elixirs.tick(h.elx);
    if (!h.elx.fury) h.critExtra = 0;
    recalcElixir(h);
  }
  function petBoardAbility(h){
    if(!h.isPet||h.petInt<5||!['regen','steal','howl','drum','weaken','pinch','mire','sap','petrify','veil','breath','prank'].includes(h.ability))return;
    const a=Combat.monsterTurnStart(h,S.f.right,MAGIC_NAMES,rand);if(!a)return;
    if(a.kind==='steal')h.counts[a.type]+=a.stones;
    else if(a.kind==='petrify'){const cols=[0,1,2,3,4,5].filter(c=>S.typ.some((t,i)=>i%6===c&&t>=0));if(cols.length)S.locks={cols:new Set([cols[ri(cols.length)]]),forSide:'right'};}
    else if(a.kind==='veil'){const cells=S.typ.map((t,i)=>t>=0?i:-1).filter(i=>i>=0);S.foeVeiled=new Set();for(let i=0;i<a.stones&&cells.length;i++)S.foeVeiled.add(cells.splice(ri(cells.length),1)[0]);}
    else if(a.kind==='prank')h.petPrank=true;
    else if(a.kind==='breath'){const row=Pets.petBestRow(S.typ,S.val,h,S.f.right,false);if(row.r>=0)burn('left',row.r*6,'row',a.mult,true);}
  }
  function castPet(kind){
    const h=S.f.left,K=B.petMagic;
    if(!h.isPet||!canAfford('left',kind))return 0;
    if(kind==='lick'&&h.hp>=h.max)return 0;
    const row=kind==='claw'?Pets.petBestRow(S.typ,S.val,h,S.f.right):null;
    if(row&&row.r<0)return 0;
    spend('left',kind);
    if(kind==='fang')hit('left',K.fangStones);
    else if(kind==='lick'){
      h.hp+=Math.min(h.max-h.hp,Math.max(1,Math.round(h.max*K.lickHp)));
      h.petLastHealTurn=h.turnNo||0;
    }
    else if(kind==='claw'){
      let obs=0;
      for(let i=row.r*6;i<row.r*6+6;i++)if(S.typ[i]>=0){if(!(S.f.right.ability==='wisp'&&S.val[i]<3)){h.counts[TYPES[S.typ[i]]]+=S.val[i];if(S.typ[i]===ONYX)obs+=S.val[i];}S.typ[i]=-1;S.val[i]=0;}
      hit('left',K.clawDamage.fixed+obs,false,K.clawDamage.mult);
      Engine.gravity(S.typ,S.val);Engine.shiftRight(S.typ,S.val);
    }
    return checkEnd()?1:after('left');
  }
  function heroTurn() {
    const h = S.f.left;
    h.prepUsed = {}; h.turnNo++; for (const k of Object.keys(h.elxCds)) if (h.elxCds[k] > 0) h.elxCds[k]--; tickPend(h); if (checkEnd()) return;
    if(h.isPet){petBoardAbility(h);if(checkEnd())return;}
    for (let guard = 0; guard < 20; guard++) {
      elxStep();
      if (player.items) player.items(S, h, useItem);
      if (h.fac.ability.id !== 'none' && h.charge >= B.faction.charge) useFaction();
      if (S.over) return;
      const available = h.isPet ? afford('left') : h.magic ? aimOnly() : afford('left');
      const act = player.choose(S, h, available, lockedCells('left'));
      S.stats.heroActions++;
      let res;
      if (!act) { Combat.hit(S.f.right, h, Combat.invalidPenalty(h), true, rand); res = 1; if (checkEnd()) return; }
      else if (h.isPet && B.petMagic.costs[act.kind]!==undefined) { res=castPet(act.kind); if(res)S.stats.spells++; else res=1; }
      else if (act.kind === 'fire') { S.stats.spells++; res = burn('left', act.idx); }
      else if (act.kind === 'square') { S.stats.spells++; res = burn('left', act.idx, 'square'); }
      else if (act.kind === 'transmute') { S.stats.spells++; res = transmute('left', act.idx); }
      else if (act.kind === 'heal') { S.stats.spells++; res = heal('left'); }
      else if (act.kind === 'chaos') { res = chaos('left',act.idx); if(res) S.stats.spells++; else {h.prepUsed.chaosFailed=true;res=2;} }
      else if (extraSpells.includes(act.kind) && available[act.kind]) { res = extraSpell('left', act); if (res) S.stats.spells++; else res = 1; }
      else {
        if (act.kind === 'lightning') { S.stats.spells++; h.magic = true; spend('left', 'lightning'); }
        res = doMove('left', act.a, act.b);
      }
      if (!(act && (simFree(act.kind) || (act.kind==='chaos'&&h.prepUsed.chaosFailed)))) {
        if (S.locks.forSide === 'left') S.locks = { cols: new Set(), forSide: null };
        S.veiled.clear();
      }
      if (S.over) return;
      if (res !== 2) break;
    }
    if(h.petPrank&&!S.over){h.petPrank=false;prankSwap();}
  }

  function useFaction() {
    const h = S.f.left, id = h.fac.ability.id, F = B.faction;
    S.stats.abilities++;
    if (id === 'growth') {                      // Дикий рост: центр — где больше родных изумрудов рядом; линии собираются сразу
      const gi = TYPES.indexOf(h.fac.gem), G = F.growth;
      let value = G.value;
      for (const [lvl, v] of Object.entries(G.valueFrom)) if ((h.heroLevel || 1) >= Number(lvl)) value = v;
      let best = -1, bestV = -1;
      for (let i = 0; i < 36; i++) {
        if (S.typ[i] < 0) continue;
        const r = Math.floor(i / N), c = i % N;
        let v = (S.typ[i] === gi ? 0 : 1);
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < N && cc < N && S.typ[rr * N + cc] === gi) v += 2; }
        if (v > bestV) { bestV = v; best = i; }
      }
      const r0 = Math.floor(best / N), c0 = best % N, picks = [best];
      const near = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => [r0 + dr, c0 + dc]).filter(([r, c]) => r >= 0 && c >= 0 && r < N && c < N && S.typ[r * N + c] >= 0);
      while (picks.length < G.stones && near.length) { const [r, c] = near.splice(ri(near.length), 1)[0]; picks.push(r * N + c); }
      for (const i of picks) { S.typ[i] = gi; S.val[i] = value; }
      h.charge = 0;
      if (Engine.bonusMap(S.typ)) { resolve('left'); if(checkEnd())return; }
      if (!S.over && !Engine.hasMoves(S.typ)) fill();
      return;
    } else if (id === 'banner') {
      h.buffs.push({ kind: 'banner', pct: F.banner.pct, turns: F.banner.turns });
    } else if (id === 'venom') {
      Combat.addVenomLayer(S.f.right, Combat.venomTick(Combat.power(h), h.dmg), F.venom.turns);
    } else if (id === 'hammer') {
      const cand = [];
      for (let i = 0; i < 36; i++) if (S.typ[i] >= 0 && S.typ[i] !== ONYX) cand.push(i);
      let n = 0;
      while (n < F.hammer.stones && cand.length) {
        const i = cand.splice(ri(cand.length), 1)[0];
        if (Engine.makesLine(S.typ, i, ONYX)) continue;
        S.typ[i] = ONYX; S.val[i] = F.hammer.value; n++;
      }
      if (!Engine.hasMoves(S.typ)) fill();
    }
    h.charge = 0;
  }

  function run(maxRounds = 150) {
    const first = rand() * 100 < Combat.firstMoveChance(S.f.left, S.f.right) ? 'left' : 'right';
    let side = first;
    S.first = first;
    while (!S.over && S.stats.rounds < maxRounds) {
      if (side === 'left') { heroTurn(); elxEndTurn(); petTurn(); } else { monsterTurn(); S.stats.rounds++; }
      // как в игре (setTurn): при передаче хода гаснут баффы «до конца хода» и Шаровая молния
      Combat.clearTurnEndBuffs(S.f[side]); S.f[side].magic = false; S.f[side].stormMult=0; S.f[side].magicFree=false;
      side = other(side);
    }
    if (!S.over) { S.over = true; S.winner = 'draw'; }
    return S;
  }
  return { run, S };
}

/* ---------- модели игрока ---------- */
// Оценка обмена так, как видит человек: только первая волна совпадений (каскады — удача), скрытые туманом камни не видны.
function seenBoard(S) {
  const t = S.typ.slice();
  for (const i of S.veiled) t[i] = 10 + i;       // скрытый камень ни с чем не совпадает
  return t;
}
function firstWave(typ, val, a, b, magic) {
  const t = typ.slice();
  [t[a], t[b]] = [t[b], t[a]];
  const va = val.slice();
  [va[a], va[b]] = [va[b], va[a]];
  const bon = Engine.bonusMap(t);
  if (!bon) return null;
  const g = [0, 0, 0, 0];
  let extra = false;
  for (let i = 0; i < 36; i++) if (bon[i] && t[i] < 4) { g[t[i]] += va[i] * bon[i]; if (bon[i] > 1) extra = true; }
  const dmg = magic ? g[0] + g[1] + g[2] + g[3] : g[3];
  return { g, dmg, extra };
}
function heroMoves(S, locked, magic, homeT) {
  const typ = seenBoard(S), out = [];
  const lock = locked ? new Set(locked) : null;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const a = r * N + c;
    for (const b of [c + 1 < N ? a + 1 : -1, r + 1 < N ? a + N : -1]) {
      if (b < 0 || typ[a] < 0 || typ[b] < 0 || typ[a] === typ[b] || typ[a] >= 4 || typ[b] >= 4) continue;
      if (lock && (lock.has(a) || lock.has(b))) continue;
      const w = firstWave(typ, S.val, a, b, magic);
      if (!w) continue;
      const home = homeT >= 0 ? w.g[homeT] : 0;
      const s = w.dmg * 3 + (w.g[0] + w.g[1] + w.g[2]) * 0.35 + home * 0.3 + (w.extra ? 5 : 0);
      out.push({ a, b, s, dmg: w.dmg });
    }
  }
  return out.sort((x, y) => y.s - x.s);
}
// Resource-aware targeting for spell economy experiments. The value of a colour increases when it is scarce.
// Stronger tactical model: consider visible cascades and a known continuation of a 4+ line.
function economicLightning(S, h, locked) {
  const cost = Combat.spellCost(h, 'lightning');
  const weight = MAGIC_NAMES.map(t => h.counts[t] <= cost * 2 ? .7 : .15);
  let best = null;
  const visible = seenBoard(S);
  for (const m of Engine.legalMoves(visible.slice())) {
    if (locked && (locked.includes(m.a) || locked.includes(m.b))) continue;
    if (visible[m.a] >= 4 || visible[m.b] >= 4) continue;
    const t = S.typ.slice(), v = S.val.slice(), g = [0,0,0,0];
    [t[m.a],t[m.b]] = [t[m.b],t[m.a]]; [v[m.a],v[m.b]] = [v[m.b],v[m.a]];
    Engine.resolve(t,v,g,ONYX);
    const dmg = g.reduce((a,b)=>a+b,0) * B.magic.lightning.mult;
    let next = 0;
    if (g.extra && !(TUNE && TUNE.lightOnce)) {
      for (const a of Engine.legalMoves(t.slice())) {
        const tt=t.slice(),vv=v.slice(),gg=[0,0,0,0];
        [tt[a.a],tt[a.b]]=[tt[a.b],tt[a.a]]; [vv[a.a],vv[a.b]]=[vv[a.b],vv[a.a]];
        Engine.resolve(tt,vv,gg,ONYX);
        next = Math.max(next, gg.reduce((x,y)=>x+y,0) * B.magic.lightning.mult);
      }
    }
    const value = dmg + (g.extra ? 4 : 0) + next * .5 + weight.reduce((sum,w,i)=>sum+w*(g[i]-cost),0);
    if (!best || value > best.value) best = {kind:'lightning', a:m.a,b:m.b,value};
  }
  return best;
}
function economicArea(S, h, kind) {
  const rule = kind === 'fire' ? B.magic.cross : B.magic.square;
  const cost = Combat.spellCost(h, kind);
  const share = Math.max(0, Math.min(1, (TUNE && TUNE.burnLoot && TUNE.burnLoot[kind]) ?? (Combat.areaSpellRules(kind === 'fire' ? 'cross' : 'square').collect ? 1 : 0)));
  const weight = MAGIC_NAMES.map(t => h.counts[t] <= cost * 2 ? .7 : .15);
  let best = null;
  for (let idx = 0; idx < 36; idx++) {
    const r = Math.floor(idx / 6), c = idx % 6;
    if (S.typ[idx] < 0) continue;
    const t = S.typ.slice(), v = S.val.slice(), g = [0,0,0,0], direct = [0,0,0,0];
    for (let i = 0; i < 36; i++) {
      if (t[i] < 0) continue;
      const dr = Math.abs(Math.floor(i / 6)-r), dc = Math.abs(i % 6-c);
      if (kind === 'fire' ? (dr > 2 || dc > 2 || (dr && dc)) : (dr > 1 || dc > 1)) continue;
      if (!(S.f.right.ability === 'wisp' && v[i] < 3)) direct[t[i]] += v[i];
      t[i] = -1; v[i] = 0;
    }
    Engine.gravity(t,v); Engine.shiftRight(t,v); Engine.resolve(t,v,g,ONYX);
    const cascadeMult = kind === 'square' ? (TUNE?.squareCascade ?? 1) : 1;
    const d = (rule.fixed + direct[3]) * rule.mult + g[3] * cascadeMult;
    const value = d + (g.extra ? 4 : 0) + weight.reduce((sum,w,i)=>sum+w*(Math.floor(direct[i]*share)+g[i]-cost),0);
    if (!best || value > best.value) best = {idx,dmg:d,value};
  }
  return best;
}
function bestFire(S) {
  let best = null;
  for (let idx = 0; idx < 36; idx++) {
    if (S.typ[idx] < 0) continue;
    const r0 = Math.floor(idx / N), c0 = idx % N;
    let d = 0;
    for (let i = 0; i < 36; i++) if (S.typ[i] === ONYX && (Math.floor(i / N) === r0 || i % N === c0) && Math.abs(Math.floor(i/N)-r0)<=2 && Math.abs(i%N-c0)<=2) d += S.val[i];
    if (!best || d > best.dmg) best = { idx, dmg: d };
  }
  return best;
}

// 2.0.4: лучший Квадрат 3×3 (сумма номиналов под ним) — для игрока симулятора (раньше Квадрат им не применялся вовсе)
function bestSquare(S) {
  let best = null;
  for (let idx = 0; idx < 36; idx++) {
    if (S.typ[idx] < 0) continue;
    const r0 = Math.floor(idx / N), c0 = idx % N;
    let d = 0;
    for (let i = 0; i < 36; i++) if (S.typ[i] === ONYX && Math.abs(Math.floor(i / N) - r0) <= 1 && Math.abs(i % N - c0) <= 1) d += S.val[i];
    if (!best || d > best.dmg) best = { idx, dmg: d };
  }
  return best;
}

// skill: вероятность выбрать лучший ход; top — из скольких лучших выбирает в остальных случаях.
// Tactical audit policy: score immediate effects and resource cost in the same approximate HP units.
// It is intentionally opt-in; it is not the live opponent AI.
const zoneCells = idx => Array.from({length:36},(_,i)=>i).filter(i=>Math.abs(Math.floor(i/6)-Math.floor(idx/6))<=1&&Math.abs(i%6-idx%6)<=1);
const temperZone = idx => [idx,idx-6,idx+6].concat(idx%6>0?[idx-1]:[],idx%6<5?[idx+1]:[]).filter(i=>i>=0&&i<36);
function previewHit(h, foe, raw, mult=1) {
  if(raw<=0) return 0;
  const pct=(h.buffs||[]).reduce((sum,b)=>sum+(b.pct||0),0);
  const d=Combat.mitigate(Math.ceil((raw+Combat.power(h))*mult*(1+pct/100)),Combat.armorOf(foe));
  return d*(1+Math.min(1,(h.stats.fury||0)/100))*(1-Math.min(.9,(foe.stats.block||0)/100));
}
function previewResolve(typ,val,h,foe,mult=1,all=false,firstMult=1) {
  const t=typ.slice(),v=val.slice(),g=[0,0,0,0];
  let damage=0,firstDamage=0,extra=false,used=false;
  for (;;) {
    const bon=Engine.obsidianBurst(t,Engine.bonusMap(t),ONYX,v);
    if(!bon) break;
    let raw=0;
    for(let i=0;i<36;i++) if(bon[i]) {
      const n=v[i]*bon[i],type=t[i];
      if(!(foe.ability==='wisp'&&v[i]<3)) {g[type]+=n;if(all||type===ONYX)raw+=n;if(bon[i]>1)extra=true;}
      t[i]=-1;v[i]=0;
    }
    if(raw>0){const hit=previewHit(h,foe,raw,mult*(used?1:firstMult));damage+=hit;if(!used)firstDamage=hit;used=true;}
    Engine.gravity(t,v);Engine.shiftRight(t,v);
  }
  return {t,v,g,damage,firstDamage,extra};
}
function tacticalUtility(S,h,A,locked) {
  const foe=Combat.enemyTarget(S.f.right),scale=Math.max(1,Combat.power(h)/6);
  const weights=MAGIC_NAMES.map(t=>h.counts[t]<9?.55:.18);
  const cost=k=>Combat.spellCost(h,k)*weights.reduce((a,b)=>a+b,0);
  const active=Combat.preparationDamageMult(h);
  const free=simFree;
  const score=r=>r.damage/scale+r.g.slice(0,3).reduce((a,n,i)=>a+n*weights[i],0)+(r.extra?5:0);
  const options=[], add=(kind,value,damage=0,params={})=>{if(Number.isFinite(value)) options.push({kind,value,damage,...params});};
  function bestMove(t,v,att=h,def=foe,magic=false,filter=false) {
    let best=null;
    for(const m of Engine.legalMoves(t.slice())){
      if(filter&&locked&&(locked.includes(m.a)||locked.includes(m.b)))continue;
      if(filter&&(S.veiled.has(m.a)||S.veiled.has(m.b)))continue;
      const tt=t.slice(),vv=v.slice();[tt[m.a],tt[m.b]]=[tt[m.b],tt[m.a]];[vv[m.a],vv[m.b]]=[vv[m.b],vv[m.a]];
      const r=previewResolve(tt,vv,att,def,magic?stormMultiplier(att):1,magic,att===h?active:1);
      let value=att===h?score(r):r.damage;
      if(att===h&&r.extra&&magic){
        const moves=Engine.legalMoves(r.t.slice());
        let next=0;
        for(const a of moves){const t2=r.t.slice(),v2=r.v.slice();[t2[a.a],t2[a.b]]=[t2[a.b],t2[a.a]];[v2[a.a],v2[a.b]]=[v2[a.b],v2[a.a]];
          next=Math.max(next,previewResolve(t2,v2,h,foe,stormMultiplier(h),true).damage/scale);}
        value+=next*.45;
      }
      if(!best||value>best.value)best={...m,value,damage:r.damage,firstDamage:r.firstDamage,extra:r.extra};
    }
    return best;
  }
  const base=bestMove(S.typ,S.val,h,foe,h.magic,true);
  if(base)add('move',base.value,base.damage,{a:base.a,b:base.b,firstDamage:base.firstDamage});
  const baseV=base?.value||0;
  if(h.magic) return options[0]||null;
  if(A.strike&&foe.hp<=Combat.strikeDamage(h))return {kind:'strike'};
  if(A.lightning){const r=bestMove(S.typ,S.val,h,foe,true,true);if(r)add('lightning',r.value-cost('lightning'),r.damage,{a:r.a,b:r.b,firstDamage:r.firstDamage});}
  for(const kind of ['fire','square']) if(A[kind]) {
    const rule=kind==='fire'?B.magic.cross:B.magic.square, shape=kind==='fire'?'cross':'square';
    let best=null;
    for(let idx=0;idx<36;idx++) {
      if(S.typ[idx]<0)continue;
      const t=S.typ.slice(),v=S.val.slice(),g=[0,0,0,0];
      for(let i=0;i<36;i++) {
        if(t[i]<0)continue;
        const dr=Math.abs(Math.floor(i/6)-Math.floor(idx/6)),dc=Math.abs(i%6-idx%6);
        if(kind==='fire'?(dr>2||dc>2||(dr&&dc)):(dr>1||dc>1))continue;
        if(!(foe.ability==='wisp'&&v[i]<3))g[t[i]]+=v[i];
        t[i]=-1;v[i]=0;
      }
      Engine.gravity(t,v);Engine.shiftRight(t,v);
      const r=previewResolve(t,v,h,foe,kind==='square'?Combat.areaSpellRules(shape).cascadeMult:1);
      const d=previewHit(h,foe,rule.fixed+g[ONYX],rule.mult*active);
      const share=(TUNE.burnLoot?.[kind]??(Combat.areaSpellRules(shape).collect?1:0));
      for(let i=0;i<3;i++)r.g[i]+=Math.floor(g[i]*share);
      r.damage+=d;const value=score(r)-cost(kind);
      if(!best||value>best.value)best={idx,value,damage:r.damage,firstDamage:d||r.firstDamage};
    }
    if(best)add(kind,best.value,best.damage,{idx:best.idx,firstDamage:best.firstDamage});
  }
  if(A.heal&&h.hp<h.max*.8){
    const sum=S.typ.reduce((a,t,i)=>a+(t===2?S.val[i]:0),0),healed=Combat.rainHeal(h,sum);
    if(healed>0)add('heal',healed/scale*(h.hp<h.max*.35?2.0:h.hp<h.max*.55?1.5:1.0)-cost('heal'));
  }
  let mirrorBenefit=0;
  if(A.mirror&&!h.mirrorReady){
    const opp=bestMove(S.typ,S.val,S.f.right,h,false,false);
    const potential=opp?.damage||0;
    if(potential>h.hp*.12 || h.hp<h.max*.45){
      mirrorBenefit=potential/scale*1.45-cost('mirror');
      if(!free('mirror'))add('mirror',mirrorBenefit);
    }
  }
  if(A.strike)add('strike',Combat.strikeDamage(h)/scale-cost('strike'),Combat.strikeDamage(h));
  if(A.tide){
    let value=0,damage=0,n=0;
    for(const from of MAGIC_T.filter(t=>S.typ.includes(t)))for(const to of MAGIC_T.filter(t=>t!==from)){
      const r=previewResolve(S.typ.map(t=>t===from?to:t),S.val,h,foe,1,false,active);
      value+=score(r);damage+=r.damage;n++;
    }
    if(n)add('tide',value/n-cost('tide'),damage/n);
  }
  for(const kind of ['transmute','pierce']) if(A[kind]){
    let cand=[];
    for(let idx=0;idx<36;idx++){
      if(S.typ[idx]<0||(kind==='transmute'&&S.typ[idx]===ONYX))continue;
      const t=S.typ.slice(),v=S.val.slice(),directType=t[idx],directValue=v[idx];
      if(kind==='pierce'){t[idx]=-1;v[idx]=0;Engine.gravity(t,v);Engine.shiftRight(t,v);}
      else for(const j of zoneCells(idx))if(S.typ[j]===directType)t[j]=ONYX;
      const r=previewResolve(t,v,h,foe,1,false,active);
      if(kind==='pierce'&&!(foe.ability==='wisp'&&directValue<3))r.g[directType]+=directValue;
      cand.push({idx,r,value:score(r)-cost(kind)});
    }
    cand.sort((a,b)=>b.value-a.value);
    if(kind==='pierce')for(const x of cand.slice(0,4)){const next=bestMove(x.r.t,x.r.v);x.value+=next?.value||0;}
    cand=cand.slice(0,kind==='pierce'?4:1).sort((a,b)=>b.value-a.value);
    if(cand.length)add(kind,cand[0].value,cand[0].r.damage,{idx:cand[0].idx,firstDamage:cand[0].r.firstDamage});
  }
  if(A.temper&&base){
    let best=null;
    for(let idx=0;idx<36;idx++){
      if(S.typ[idx]<0)continue;
      const v=S.val.slice(),cells=temperZone(idx).filter(j=>S.typ[j]>=0&&v[j]<5);
      if(!cells.length)continue;for(const j of cells)v[j]+=2;
      const t=S.typ.slice();[t[base.a],t[base.b]]=[t[base.b],t[base.a]];[v[base.a],v[base.b]]=[v[base.b],v[base.a]];
      const r=previewResolve(t,v,h,foe,1,false,active);
      const delta=Math.max(0,score(r)-baseV),value=(free('temper')?baseV+delta:delta*.35)-cost('temper');
      if(!best||value>best.value)best={idx,value,damage:r.damage};
    }
    if(best)add('temper',best.value,best.damage,{idx:best.idx});
  }
  if(A.chaos&&free('chaos')&&baseV<5){
    let best=null;
    for(const idx of [7,8,9,10,13,14,15,16,19,20,21,22,25,26,27,28]){
      const cells=zoneCells(idx).filter(j=>S.typ[j]>=0),t=S.typ.slice(),v=S.val.slice();
      if(cells.length<4)continue;
      for(let k=1;k<=2;k++){cells.forEach((j,i)=>{const source=cells[(i+k)%cells.length];t[j]=S.typ[source];v[j]=S.val[source];});
        if(Engine.bonusMap(t))continue;
        const r=bestMove(t,v);
        const value=(r?.value||0)-cost('chaos');
        if(!best||value>best.value)best={idx,value};
      }
    }
    if(best)add('chaos',best.value,0,{idx:best.idx});
  }
  options.sort((a,b)=>b.value-a.value);
  const best=options[0];
  if(!best)return null;
  if(best.damage>=foe.hp*1.05)return best;
  if(A.mirror&&free('mirror')&&mirrorBenefit>2)return {kind:'mirror'};
  // Buffs are valued as incremental damage, not as an attack that has already happened.
  if(!h.tripleNext&&!h.doubleNext&&best.damage>0&&best.kind!=='strike'&&best.kind!=='heal'){
    let prep=null;
    for(const kind of ['sacrifice','fury'])if(A[kind]){
      const rule=B.magic[kind],loss=kind==='sacrifice'?Math.max(1,Math.round(h.hp*rule.hpPct/100)):0;
      if(loss>=h.hp||kind==='sacrifice'&&h.hp<h.max*.35)continue;
      const value=((best.firstDamage??best.damage)*(rule.mult-1)/scale)*(free(kind)?1:.45)-cost(kind)-loss/scale*(h.hp<h.max*.6?2.0:1.4);
      if(value>(free(kind)?2:best.value+2)&&(!prep||value>prep.value))prep={kind,value};
    }
    if(prep)return prep;
  }
  return best;
}

function humanPlayer({ skill = 0.55, top = 4, useMagic = true, items = false, onlySpells = null } = {}) {
  return {
    choose(S, h, afford, locked) {
      // afford: { lightning, fire, transmute, heal, chaos } — хватает ли камней на каждое заклинание отдельно
      // (true/false тоже допустимо — «хватает на всё»/«ни на что»).
      const A = typeof afford === 'boolean' ? { lightning: afford, fire: afford, transmute: afford, heal: afford, chaos: afford } : afford;
      if (onlySpells) for (const kind of Object.keys(A)) if (!onlySpells.includes(kind)) A[kind] = false;
      const canMagic = Object.values(A).some(Boolean);
      if (useMagic && TUNE?.utility) return tacticalUtility(S,h,A,locked);
      const homeT = TYPES.indexOf(h.fac.gem);
      const pick = (list) => (rand() < skill ? list[0] : list[ri(Math.min(top, list.length))]);
      const normal = heroMoves(S, locked, h.magic, homeT);
      if (useMagic && canMagic) {
        // Ситуативные решения для расширенного набора: не спамить активными флагами.
        const foe = S.f.right, dmg = Combat.strikeDamage(h);
        if (A.strike && (foe.hp <= dmg || (onlySpells && onlySpells.includes('strike') && normal[0]?.dmg < 2))) return { kind: 'strike' };
        if (!(TUNE && TUNE.tacticalLightning)) {
          if (A.mirror && h.hp < h.max * .45 && heroMoves(S, null, false, -1)[0]?.dmg >= 6) return { kind: 'mirror' };
          if (A.sacrifice && h.hp > h.max * .65 && normal[0]?.dmg >= 5) return { kind: 'sacrifice' };
          if (A.fury && normal[0]?.dmg >= 4) return { kind: 'fury' };
        }
        // лечение, если здоровья мало и дождь заметно лечит
        if (A.heal) {
          let sum = 0;
          for (let i = 0; i < 36; i++) if (S.typ[i] === 2) sum += S.val[i];
          if (h.hp < h.max * 0.4 && Math.min(sum * (h.dmg || 1), h.max - h.hp) >= h.max * 0.15) return { kind: 'heal' };
        }
        if (TUNE && TUNE.economic) {
          const options = [];
          for (const kind of ['fire','square']) if (A[kind]) {
            const x = economicArea(S,h,kind);
            if (x) options.push({kind,idx:x.idx,value:x.value});
          }
          if (A.lightning && TUNE.tacticalLightning) {
            const action = economicLightning(S,h,locked);
            if (action) options.push(action);
          } else if (A.lightning) {
            const mg = heroMoves(S,locked,true,homeT);
            const cost = Combat.spellCost(h,'lightning');
            if (mg.length) options.push({kind:'lightning',a:mg[0].a,b:mg[0].b,value:mg[0].dmg*B.magic.lightning.mult-cost*1.3+(mg[0].s-mg[0].dmg*3)*.4});
          }
          options.sort((a,b)=>b.value-a.value);
          if (options.length && options[0].value > (normal[0]?.s || 0)/3 + 2) return options[0];
        } else {
          const mg = A.lightning ? heroMoves(S, locked, true, homeT) : [];
          const fire = A.fire ? bestFire(S) : null;
          const lightDmg = mg.length ? mg[0].dmg * B.magic.lightning.mult : 0;
          const normDmg = normal.length ? normal[0].dmg : 0;
          const sq = A.square ? bestSquare(S) : null;
          const fireV = fire ? (fire.dmg+B.magic.cross.fixed) * B.magic.cross.mult : -1, sqV = sq ? (sq.dmg+B.magic.square.fixed) * B.magic.square.mult : -1;
          if (sq && sqV > fireV && sqV >= lightDmg && sqV > normDmg + 3) return { kind: 'square', idx: sq.idx };
          if (fire && fireV >= lightDmg && fireV > normDmg + 3) return { kind: 'fire', idx: fire.idx };
          if (A.lightning && lightDmg > normDmg + 3) { const m = pick(mg); return { kind: 'lightning', a: m.a, b: m.b }; }
        }
      }
      if (useMagic && TUNE && TUNE.tacticalLightning && !h.magic) {
        if (A.mirror && h.hp < h.max * .45 && heroMoves(S, null, false, -1)[0]?.dmg >= 6) return { kind: 'mirror' };
        if (A.sacrifice && h.hp > h.max * .65 && normal[0]?.dmg >= 5) return { kind: 'sacrifice' };
        if (A.fury && normal[0]?.dmg >= 4) return { kind: 'fury' };
      }
      if (useMagic && TUNE && TUNE.fullSpells && !h.magic && (normal[0]?.dmg || 0) < 3) {
        if (A.tide && (normal[0]?.dmg || 0) === 0) return { kind: 'tide' };
        if (A.temper || A.pierce || A.transmute) {
          let best = null;
          for (let i = 0; i < 36; i++) {
            if (S.typ[i] < 0) continue;
            for (const kind of ['pierce', 'transmute']) {
              if (!A[kind] || (kind === 'transmute' && S.typ[i] === ONYX)) continue;
              const t = S.typ.slice(), v = S.val.slice();
              if (kind === 'pierce') { t[i] = -1; v[i] = 0; Engine.gravity(t,v); Engine.shiftRight(t,v); }
              else {
                for (let j=0;j<36;j++) if (t[j]===S.typ[i] && Math.abs(Math.floor(j/6)-Math.floor(i/6))<=1 && Math.abs(j%6-i%6)<=1) t[j]=ONYX;
              }
              const g = [0,0,0,0];
              Engine.resolve(t,v,g,ONYX);
              const score = g[3] * 2 + (g[0]+g[1]+g[2]) * .3 + (g.extra ? 4 : 0);
              if (score >= 6 && (!best || score > best.score)) best = {kind,idx:i,score};
            }
          }
          if (best) return best;
          if (A.temper) {
            let best = null;
            for (let i=0;i<36;i++) {
              if (S.typ[i]<0) continue;
              const cells=[i,i-6,i+6].concat(i%6>0?[i-1]:[],i%6<5?[i+1]:[]).filter(j=>j>=0&&j<36&&S.typ[j]>=0&&S.val[j]<5);
              if (cells.length>=4 && (!best || cells.length>best.n)) best={kind:'temper',idx:i,n:cells.length};
            }
            if (best) return best;
          }
        }
      }
      if (!normal.length) return (useMagic && A.chaos) ? { kind: 'chaos' } : null;
      const m = pick(normal);
      return { kind: 'move', a: m.a, b: m.b };
    },
    items: items ? (S, h, use) => {
      if (h.hp < h.max * 0.35) use('left', 'potion');
      if (S.stats.heroActions === 0) use('left', 'elixir');
    } : null,
  };
}
// Сильный игрок: тот же ИИ, что у существ (просчитывает ответ противника).
function aiPlayer(level) {
  return {
    choose(S, h, canMagic, locked) {
      const v = Combat.aiView(h, S.f.right);
      const mv = AI.choose(S.typ.slice(), S.val.slice(), v.hpMe, v.hpOpp, level, canMagic, { maxMe: v.maxMe, healMult: v.healMult, locked, lightning: h.magic ? stormMultiplier(h) : 0 });
      if (!mv) return null;
      return mv.kind === 'move' || mv.kind === 'lightning' ? mv : mv;
    },
  };
}
const PLAYERS = {
  weak: () => humanPlayer({ skill: 0.3, top: 6 }),
  avg: () => humanPlayer({ skill: 0.55, top: 4 }),
  good: () => humanPlayer({ skill: 0.85, top: 3 }),
  strong: () => aiPlayer(80),
};

/* ---------- серия боёв ---------- */
function simulate({ mlvl, faction = 'dwarf', level = 1, gear, baseHp, monster, tier, n = 200, player = 'avg', seedBase = 1, aiLevel, extra, chaosDmg, bag, swarm, elixirs, elxFx, elite, zone, affixes, boost, tune, pet, duo } = {}) {
  CHAOS_DMG = chaosDmg || 0;
  BOOST = boost || null; TUNE = tune || null;
  const bySpell = {}, petBoardSpells = {}, areaImpact = {}, burst = {maxShare:0,halfHits:0,fullHits:0,totalHits:0};
  let petBoardWins=0;
  let duoKills = 0, strictWins = 0, wins = 0, draws = 0, actions = 0, rounds = 0, hpLeft = 0, spells = 0, heroDmg = 0, monDmg = 0, monActs = 0, abil = 0;
  const actWin = [];
  // Своё зерно для каждого сочетания (фракция, уровень, существо, цвет, номер боя): выборки независимы.
  const key = `${elite ? 'E' : ''}${zone ? 'Z' + zone : ''}${seedBase}|${faction}|${level}|${monster}|${tier}|${typeof player === 'string' ? player : 'p'}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  for (let k = 0; k < n; k++) {
    seed((h ^ Math.imul(k + 1, 2654435761)) >>> 0);
    const g = typeof gear === 'function' ? gear() : gear;
    const hero = makeHero({ faction, level, gear: g, baseHp, extra, bag, elixirs, elxFx });
    if (pet) { hero.petF = Pets.petFighter(Pets.makePet(pet.species, pet.tier)); hero.petF.fedBonus = (pet.fed ? (Pets.FEED_BONUS || 1.25) : 1) * (pet.scale || 1); }
    if (BOOST) { if (BOOST.style) hero.shield = 1; if (BOOST.daily) hero.secondWind = true; if (BOOST.streak) hero.charge = Math.floor(B.faction.charge / 2); }
    const mon = makeMonster(monster, tier, { aiLevel, swarm, elite, zone, affixes, level, mlvl });
    const pl = typeof player === 'string' ? PLAYERS[player]() : typeof player === 'function' ? player() : player;
    let S;
    if (duo) {
      const D = duoBattle(hero, mon, pl, { monster, tier, aiLevel, swarm, elite, level, duo });
      S = D.S; if (D.strict) strictWins++; duoKills += D.kills;
    } else S = Battle(hero, mon, pl).run();
    if (S.winner === 'left') { wins++; hpLeft += hero.hp / hero.max; actWin.push(S.stats.heroActions); }
    if (S.winner === 'draw') draws++;
    for (const [k, v] of Object.entries(S.stats.bySpell)) bySpell[k] = (bySpell[k] || 0) + v;
    for(const [k,v] of Object.entries(S.stats.petBoardSpells||{}))petBoardSpells[k]=(petBoardSpells[k]||0)+v;
    if(S.stats.petBoardWin)petBoardWins++;
    for (const [kind, values] of Object.entries(S.stats.areaImpact)) {
      const total = areaImpact[kind] || (areaImpact[kind] = {});
      for (const [key, value] of Object.entries(values)) total[key] = (total[key] || 0) + value;
    }
    burst.maxShare=Math.max(burst.maxShare,S.stats.burst.maxShare);
    for(const k of ['halfHits','fullHits','totalHits'])burst[k]+=S.stats.burst[k];
    actions += S.stats.heroActions; rounds += S.stats.rounds; spells += S.stats.spells; abil += S.stats.abilities;
    heroDmg += S.stats.heroDmg; monDmg += S.stats.monDmg; monActs += S.stats.monActions;
  }
  actWin.sort((a, b) => a - b);
  return {
    bySpell, petBoardSpells, petBoardWin:duo?petBoardWins/n:0, areaImpact, burst, win: wins / n, strictWin: strictWins / n, killsPerBattle: duo ? duoKills / n : wins / n, draws: draws / n, actions: actions / n, rounds: rounds / n, spells: spells / n, abilities: abil / n,
    hpLeft: wins ? hpLeft / wins : 0, heroDmgPerAct: heroDmg / Math.max(1, actions), monDmgPerAct: monDmg / Math.max(1, monActs),
    medianActionsWin: actWin.length ? actWin[Math.floor(actWin.length / 2)] : 0,
  };
}

/* ---------- бой вдвоём (Duo в game.js): герой и питомец играют каждый свою доску против своей копии врага ----------
   Победа боя — только если герой выжил и оба врага повержены (Duo.evaluate).
   Питомец на своей доске: ХП ×boardHp, урон ×boardDmg, без вещей, играет ИИ с умом duo.int (по умолчанию 50). Выживший добивает
   врага павшего с тем здоровьем, что у того осталось; своё здоровье выживший не восстанавливает. */
function petAsHero(spec, level) {
  const mk=Pets.makePet(spec.species,spec.tier);
  const intl=spec.int??50;
  mk.xp=Math.round(-Pets.INT_XP*Math.log(Math.max(.0001,1-(intl-1)/99)));
  const pf=Pets.petFighter(mk), hp=Math.round(pf.max*Pets.boardHp(mk)), dmg=(pf.dmg||1)*Pets.boardDmg(mk);
  const h=makeHero({faction:'none',level,gear:Gear.emptyLoadout(),baseHp:hp,dmg});
  h.stats=h.stats0=pf.stats; h.max=h.hp=hp;
  h.name = 'pet'; h.petBoard = true; h.isPet=true; h.petInt=intl; h.ability=pf.ability;
  h.secondWind=pf.secondWind; h.secondWindFrac=pf.secondWindFrac;
  return { h, intl };
}
function petPlayer(intl,only=null){return {choose(S,h,A,locked){const k=Pets.petSpellPlan(h,S.f.right,S.typ,S.val,intl,only);if(k&&A[k])return {kind:k};const v=Combat.aiView(h,S.f.right);return AI.choose(S.typ.slice(),S.val.slice(),v.hpMe,v.hpOpp,intl,{}, {locked,maxMe:v.maxMe,healMult:v.healMult,lightning:h.magic?stormMultiplier(h):0});}};}
function duoBattle(hero, monA, plHero, o) {
  const spec = o.duo, { h: pet, intl } = petAsHero(spec, o.level);
  const monB=JSON.parse(JSON.stringify(monA));
  Object.assign(monB,{hp:monB.max,buffs:[],clone:null,counts:{sapphire:0,ruby:0,emerald:0,onyx:0}});
  const A = Battle(hero, monA, plHero).run();
  const Bt = Battle(pet, monB, petPlayer(intl)).run();
  A.stats.petBoardSpells={...Bt.stats.bySpell}; A.stats.petBoardWin=Bt.winner==='left';
  const heroWon = A.winner === 'left', petWon = Bt.winner === 'left';
  const res = (S, win) => { S.winner = win ? 'left' : 'right'; return S; };
  const rev = (f) => { f.buffs = []; f.haste = false; f.magic = false; f.stunned = false; f.charge = 0; };
  if (!heroWon) return { S: res(A, false), strict: false, kills: 0 };
  if (heroWon && petWon) return { S: res(A, true), strict: true, kills: 2 };
  if (heroWon) {                                    // герой добивает врага питомца
    rev(hero); rev(monB); const C = Battle(hero, monB, plHero).run();
    return { S: res(A, C.winner === 'left'), strict: C.winner === 'left', kills: C.winner === 'left' ? 2 : 0 };
  }
  return { S: res(A, false), strict: false, kills: 0 };
}

// Снаряжение «типичного» героя уровня L: случайные вещи его цвета примерно на share от лимита очков.
function typicalGear(level, share = 0.8) {
  const t = Hero.tierFor(level);
  return Gear.randomLoadout(Math.round(Hero.budget(level) * share), rand, t);
}
const STARTER = { main: 'sword-novice', off: 'shield-wood', head: 'leather-head', chest: 'leather-chest', arms: 'leather-arms', legs: 'leather-legs', amulet: null };

module.exports = { typicalGear, STARTER, simulate, Battle, makeHero, makeMonster, petAsHero, petPlayer, PLAYERS, humanPlayer, aiPlayer, seed, get rand() { return rand; } };

/* ---------- командная строка ---------- */
if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
  if (args.help) {
    console.log('node tools/sim.js --monster=wolf --tier=1 --faction=dwarf --level=1 --n=200 --player=avg|weak|good|strong');
    process.exit(0);
  }
  const START = { main: 'sword-novice', off: 'shield-wood', head: 'leather-head', chest: 'leather-chest', arms: 'leather-arms', legs: 'leather-legs', amulet: null };
  const r = simulate({
    monster: args.monster || 'rat', tier: Number(args.tier || 1), faction: args.faction || 'dwarf', level: Number(args.level || 1),
    n: Number(args.n || 200), player: args.player || 'avg', gear: START,
  });
  console.log(JSON.stringify(r, null, 1));
}
