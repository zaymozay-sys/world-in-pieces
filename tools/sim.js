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
const TYPES = ['sapphire', 'ruby', 'emerald', 'onyx'];
const MAGIC_T = [0, 1, 2];
const MAGIC_NAMES = ['sapphire', 'ruby', 'emerald'];
const B = Balance;
const other = (s) => (s === 'left' ? 'right' : 'left');
const ri = (n) => Math.floor(rand() * n);

/* ---------- бойцы ---------- */
function makeHero(o) {
  const fac = o.faction === 'none' ? { hero: 'Без фракции', stats: {}, gem: null, ability: { id: 'none' } }
    : (Factions.get(o.faction) || Factions.get('dwarf'));
  const gear = o.gear || Gear.emptyLoadout();
  const facStats = o.faction === 'none' ? {} : Factions.statsAt(o.faction, Hero ? Hero.tierFloat(o.level || 1) : 1);
  let stats = Gear.combine(Gear.stats(gear), facStats);
  // 1.5.1: эликсиры { вид: цвет } — прибавка к характеристикам и (если o.elxFx !== false) эффект за бой
  const elx = o.elixirs || {};
  if (Object.keys(elx).length) stats = Gear.combine(stats, Elixirs.bonusStats(Object.fromEntries(Object.entries(elx).map(([k, t]) => [k, { tier: t, left: 1 }]))));
  const base = o.baseHp != null ? o.baseHp : (Hero ? Hero.baseHp(o.level || 1) : 100);
  const max = base + stats.health;
  const dmg = o.dmg != null ? o.dmg : (Hero ? Hero.dmgMult(o.level || 1) : 1);
  return { side: 'left', heroLevel: o.level || 1, name: fac.hero, faction: o.faction, fac, gear, stats, base, max, hp: max, dmg, buffs: [], haste: false, magic: false,
    counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 }, charge: 0, ability: null, bag: o.bag ? { ...o.bag } : {},
    elx: o.elxFx === false ? {} : Object.fromEntries(Object.entries(elx).filter(([, t]) => t >= Elixirs.FX_MIN)), elxUsed: {},
    critExtra: (o.elxFx !== false && elx.fury >= Elixirs.FX_MIN) ? Elixirs.effect('fury', elx.fury).v - 2 : 0 };
}
function makeMonster(id, tier, o = {}) {
  const m = Bestiary.MONSTERS[id], sc = Bestiary.scaled(id, tier, o.swarm || 1);
  const gear = sc.gearBudget ? Gear.randomLoadout(sc.gearBudget, rand, tier) : Gear.emptyLoadout();
  const stats = Gear.combine(Gear.stats(gear), sc.stats);
  const max = Math.round((sc.hp + stats.health) * (o.elite ? 1.25 : 1));
  const level = o.aiLevel || sc.ai;
  return { side: 'right', name: m.name, id, tier, gear, stats, base: sc.hp, max, hp: max, dmg: (sc.dmg || 1) * (o.elite ? 1.05 : 1), buffs: [], haste: false, magic: false,
    counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 }, ability: m.ability, level, bag: Combat.enemyBag(level),
    turnNo: 0, revived: false, charged: false, poison: null, spores: 0, clonesMade: 0, clone: null };
}

/* ---------- бой ---------- */
function Battle(hero, mon, player) {
  const S = {
    typ: new Array(36).fill(-1), val: new Array(36).fill(0),
    f: { left: hero, right: mon }, over: false, winner: null,
    locks: { cols: new Set(), forSide: null }, veiled: new Set(),
    stats: { heroActions: 0, monActions: 0, heroDmg: 0, monDmg: 0, spells: 0, abilities: 0, rounds: 0 },
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
  const spend = (side, kind = 'lightning') => { const f = S.f[side], c = Combat.spellCost(f, kind); for (const t of MAGIC_NAMES) f.counts[t] -= c; };
  const afford = (side) => ({ lightning: canAfford(side, 'lightning'), fire: canAfford(side, 'fire'), square: canAfford(side, 'square'), transmute: canAfford(side, 'transmute'), heal: canAfford(side, 'heal'), chaos: canAfford(side, 'chaos') });
  const anyAfford = (side) => Object.values(afford(side)).some(Boolean);
  const hit = (side, amount, raw = false) => {
    // Удары героя сначала принимает живой двойник Дикого гриба (см. Combat.enemyTarget); у прочих — сам противник.
    const att = S.f[side], tgt = side === 'left' ? Combat.enemyTarget(S.f.right) : S.f.left;
    const H = S.f.left, fire = (k) => { if (!H.elx[k] || H.elxUsed[k]) return null; H.elxUsed[k] = true; return Elixirs.effect(k, H.elx[k]); };
    if (!raw && side === 'left') { const fx = fire('power'); if (fx) amount = Math.round(amount * fx.v); }
    if (!raw && side === 'right') { const fx = fire('defense'); if (fx) amount = Math.max(1, Math.round(amount * (1 - fx.v / 100))); }
    const r = Combat.hit(att, tgt, amount, raw, rand);
    if (side === 'right') {                                   // эффекты эликсиров на получаемый героем удар (как в game.js dealDamage)
      if (r.kind === 'block' || r.kind === 'blockreflect') { const fx = fire('block'); if (fx) Combat.loseHp(att, Math.max(1, Math.round(amount * fx.v / 100))); }
      if (r.kind === 'reflect' || r.kind === 'blockreflect') { const fx = fire('ricochet'); if (fx) H.hp = Math.min(H.max, H.hp + Math.max(1, Math.round(H.max * fx.v / 100))); }
      if (H.hp <= 0) { const fx = fire('health'); if (fx) H.hp = Math.max(1, Math.round(H.max * fx.v / 100)); }
    }
    if (r.critExtra) H.elxUsed.fury = true;
    if (r.kind === 'hit') S.stats[side === 'left' ? 'heroDmg' : 'monDmg'] += r.amount;
    return r;
  };
  const addCharge = (n) => { const h = S.f.left; h.charge = Math.min(B.faction.charge, h.charge + n); };
  const empty = () => S.typ.every((t) => t < 0);
  const refillIfNeeded = () => { if (empty() || !Engine.hasMoves(S.typ)) fill(); };

  // Собирает совпадения, начисляет камни и урон, падение и сдвиг, каскады. Возвращает, была ли линия 4+.
  function resolve(side) {
    const f = S.f[side], tgt = S.f[other(side)];
    const home = side === 'left' ? TYPES.indexOf(hero.fac.gem) : -1;
    // как в игре: собранный обсидиан x5 убирает соседей в радиусе 1 (Engine.obsidianBurst)
    const burst = () => Engine.obsidianBurst(S.typ, Engine.bonusMap(S.typ), ONYX, S.val);
    let extra = false, bon = burst();
    const gained = {};                              // магические камни за проход — для Хитрости противника
    while (bon) {
      let dmg = 0, charge = 0;
      for (let i = 0; i < 36; i++) {
        if (!bon[i]) continue;
        const amount = S.val[i] * bon[i];
        if (side === 'left' && S.f.right.ability === 'wisp' && S.val[i] < 3) continue;   // Блуждающий огонь: x1 не засчитываются
        f.counts[TYPES[S.typ[i]]] += amount;
        if (S.typ[i] !== ONYX) gained[TYPES[S.typ[i]]] = (gained[TYPES[S.typ[i]]] || 0) + amount;
        if (S.typ[i] === home) charge += amount;
        if (S.typ[i] === ONYX || f.magic) dmg += amount;
        if (bon[i] > 1) extra = true;
      }
      if (charge) addCharge(charge);
      if (side === 'right') { let got = 0; for (let i = 0; i < 36; i++) if (bon[i]) got += S.val[i] * bon[i]; Combat.addSpores(f, got); }   // споры гриба
      hit(side, f.magic ? Math.round(dmg * B.magic.lightning.mult) : dmg);
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
  function after(side, finish = true, extraIn = false) {
    const extra = resolve(side) || extraIn;
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
    S.f[side].magic = Combat.continueMagic(S.f[side].magic, extra);   // как в игре: Молния держится на доп. ходах
    if (checkEnd()) return 1;
    refillIfNeeded();
    return Combat.finishAction(S.f[side], extra).extra ? 2 : 1;
  }

  const FIRE_RADIUS = 2;    // Огненный крест ('cross') ограничен областью 5x5 вокруг цели; 'row' (дыхание дракона) — нет.
  function burn(side, idx, shape = 'cross', mult = 1, free = false) {
    if (!free) spend(side, shape === 'square' ? 'square' : 'fire');
    const r0 = Math.floor(idx / N), c0 = idx % N;
    let dmg = 0, all = 0, obs = 0;
    const cells = [];
    for (let i = 0; i < 36; i++) {
      if (S.typ[i] < 0) continue;
      const r = Math.floor(i / N), c = i % N;
      if (shape === 'row' ? r !== r0 : shape === 'square' ? (Math.abs(r - r0) > 1 || Math.abs(c - c0) > 1) : (r !== r0 && c !== c0)) continue;
      if (shape === 'cross' && (Math.abs(r - r0) > FIRE_RADIUS || Math.abs(c - c0) > FIRE_RADIUS)) continue;
      if (shape === 'row') dmg += S.val[i] * mult;
      else {                                          // крест/квадрат: копилка; урон = фикс + базовый + обсидианы (или все под Молнией)
        const f = S.f[side];
        if (side === 'left' && S.f.right.ability === 'wisp' && S.val[i] < 3) { cells.push(i); continue; }
        f.counts[TYPES[S.typ[i]]] += S.val[i];
        all += S.val[i];
        if (S.typ[i] === ONYX) obs += S.val[i];
      }
      cells.push(i);
    }
    if (shape !== 'row') {
      const fl = S.f[side];
      dmg = (shape === 'square' ? B.magic.square : B.magic.cross).fixed + Combat.strikeDamage(fl) + (fl.magic ? Math.round(all * B.magic.lightning.mult) : obs);
    }
    hit(side, dmg);
    for (const i of cells) { S.typ[i] = -1; S.val[i] = 0; }
    if (S.f.left.hp <= 0 || Combat.enemyDefeated(S.f.right)) { checkEnd(); return 1; }
    Engine.gravity(S.typ, S.val);
    Engine.shiftRight(S.typ, S.val);
    return after(side, !free);
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
    for (let i = 0; i < 36; i++) if (S.typ[i] >= 0 && S.typ[i] !== ONYX) sum += S.val[i];
    f.hp += Combat.rainHeal(f, sum);
    return after(side);
  }
  function chaos(side) {
    spend(side, 'chaos');
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
    if (S.locks.forSide !== side) return null;
    const out = [];
    for (const c of S.locks.cols) for (let r = 0; r < N; r++) out.push(r * N + c);
    return out;
  };
  const useItem = (side, kind) => {
    const f = S.f[side];
    if (!(f.bag[kind] > 0)) return false;
    if (!Combat.useConsumable(f, kind, MAGIC_NAMES)) return false;
    f.bag[kind]--;
    return true;
  };

  /* ---------- ход существа ---------- */
  function monsterTurn() {
    const f = S.f.right, h = S.f.left;
    f.turnNo++;
    if (f.poison && f.poison.turns > 0) {
      f.poison.turns--;
      Combat.hit(h, f, f.poison.dmg, true, rand);
      S.stats.heroDmg += f.poison.dmg;
      if (checkEnd()) return;
    }
    if (f.hp <= 0) { cloneTurn(); return; }           // оригинал гриба пал, но его двойник ещё стоит
    const act = Combat.monsterTurnStart(f, h, MAGIC_NAMES, rand);
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
    for (let guard = 0; guard < 20; guard++) {
      for (const k of Combat.enemyItemPlan(f, anyAfford('right'), rand)) useItem('right', k);
      const v = Combat.aiView(f, h);
      const mv = AI.choose(S.typ.slice(), S.val.slice(), v.hpMe, v.hpOpp, f.level, f.magic ? {} : afford('right'),
        { maxMe: v.maxMe, healMult: v.healMult, locked: lockedCells('right') });
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
    cloneTurn();
  }

  // Двойник Дикого гриба ходит сразу после оригинала (Combat.turnOrder): автоатака героя без поля, как питомец.
  function cloneTurn() {
    const f = S.f.right;
    if (S.over || !Combat.cloneAlive(f)) return;
    const r = Combat.hit(f.clone, S.f.left, Combat.cloneAttackAmount(f.clone), false, rand);
    if (r.kind === 'hit') S.stats.monDmg += r.amount;
    checkEnd();
  }

  /* ---------- ход героя ---------- */
  function heroTurn() {
    const h = S.f.left;
    for (let guard = 0; guard < 20; guard++) {
      if (player.items) player.items(S, h, useItem);
      if (h.fac.ability.id !== 'none' && h.charge >= B.faction.charge) useFaction();
      if (S.over) return;
      const act = player.choose(S, h, afford('left'), lockedCells('left'));
      S.stats.heroActions++;
      let res;
      if (!act) { Combat.hit(S.f.right, h, Combat.invalidPenalty(h), true, rand); res = 1; if (checkEnd()) return; }
      else if (act.kind === 'fire') { S.stats.spells++; res = burn('left', act.idx); }
      else if (act.kind === 'square') { S.stats.spells++; res = burn('left', act.idx, 'square'); }
      else if (act.kind === 'transmute') { S.stats.spells++; res = transmute('left', act.idx); }
      else if (act.kind === 'heal') { S.stats.spells++; res = heal('left'); }
      else if (act.kind === 'chaos') { S.stats.spells++; res = chaos('left'); }
      else {
        if (act.kind === 'lightning') { S.stats.spells++; h.magic = true; spend('left', 'lightning'); }
        res = doMove('left', act.a, act.b);
      }
      if (S.locks.forSide === 'left') S.locks = { cols: new Set(), forSide: null };
      S.veiled.clear();
      if (S.over) return;
      if (res !== 2) break;
    }
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
      if (Engine.bonusMap(S.typ)) resolve('left');
      if (!S.over && !Engine.hasMoves(S.typ)) fill();
      return;
    } else if (id === 'banner') {
      h.buffs.push({ kind: 'banner', amount: F.banner.power, turns: F.banner.turns });
    } else if (id === 'venom') {
      S.f.right.poison = { turns: F.venom.turns, dmg: Combat.venomTick(Combat.power(h), h.dmg) };
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
    const first = (S.f.left.elx && S.f.left.elx.initiative) || rand() * 100 < Combat.firstMoveChance(S.f.left, S.f.right) ? 'left' : 'right';
    let side = first;
    S.first = first;
    while (!S.over && S.stats.rounds < maxRounds) {
      if (side === 'left') heroTurn(); else { monsterTurn(); S.stats.rounds++; }
      // как в игре (setTurn): при передаче хода гаснут баффы «до конца хода» и Шаровая молния
      Combat.clearTurnEndBuffs(S.f[side]); S.f[side].magic = false;
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
function bestFire(S) {
  let best = null;
  for (let idx = 0; idx < 36; idx++) {
    if (S.typ[idx] < 0) continue;
    const r0 = Math.floor(idx / N), c0 = idx % N;
    let d = 0;
    for (let i = 0; i < 36; i++) if (S.typ[i] >= 0 && (Math.floor(i / N) === r0 || i % N === c0)) d += S.val[i];
    if (!best || d > best.dmg) best = { idx, dmg: d };
  }
  return best;
}

// skill: вероятность выбрать лучший ход; top — из скольких лучших выбирает в остальных случаях.
function humanPlayer({ skill = 0.55, top = 4, useMagic = true, items = false } = {}) {
  return {
    choose(S, h, afford, locked) {
      // afford: { lightning, fire, transmute, heal, chaos } — хватает ли камней на каждое заклинание отдельно
      // (true/false тоже допустимо — «хватает на всё»/«ни на что»).
      const A = typeof afford === 'boolean' ? { lightning: afford, fire: afford, transmute: afford, heal: afford, chaos: afford } : afford;
      const canMagic = A.lightning || A.fire || A.transmute || A.heal || A.chaos;
      const homeT = TYPES.indexOf(h.fac.gem);
      const pick = (list) => (rand() < skill ? list[0] : list[ri(Math.min(top, list.length))]);
      const normal = heroMoves(S, locked, false, homeT);
      if (useMagic && canMagic) {
        // лечение, если здоровья мало и дождь заметно лечит
        if (A.heal) {
          let sum = 0;
          for (let i = 0; i < 36; i++) if (S.typ[i] >= 0 && S.typ[i] !== ONYX) sum += S.val[i];
          if (h.hp < h.max * 0.4 && Math.min(sum * (h.dmg || 1), h.max - h.hp) >= h.max * 0.15) return { kind: 'heal' };
        }
        const mg = A.lightning ? heroMoves(S, locked, true, homeT) : [];
        const fire = A.fire ? bestFire(S) : null;
        const lightDmg = mg.length ? mg[0].dmg : 0;
        const normDmg = normal.length ? normal[0].dmg : 0;
        if (fire && fire.dmg >= lightDmg && fire.dmg > normDmg + 3) return { kind: 'fire', idx: fire.idx };
        if (A.lightning && lightDmg > normDmg + 3) { const m = pick(mg); return { kind: 'lightning', a: m.a, b: m.b }; }
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
      const mv = AI.choose(S.typ.slice(), S.val.slice(), v.hpMe, v.hpOpp, level, canMagic, { maxMe: v.maxMe, healMult: v.healMult, locked });
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
function simulate({ faction = 'dwarf', level = 1, gear, baseHp, monster, tier, n = 200, player = 'avg', seedBase = 1, aiLevel, bag, swarm, elixirs, elxFx, elite } = {}) {
  let wins = 0, draws = 0, actions = 0, rounds = 0, hpLeft = 0, spells = 0, heroDmg = 0, monDmg = 0, monActs = 0, abil = 0;
  const actWin = [];
  // Своё зерно для каждого сочетания (фракция, уровень, существо, цвет, номер боя): выборки независимы.
  const key = `${elite ? 'E' : ''}${seedBase}|${faction}|${level}|${monster}|${tier}|${typeof player === 'string' ? player : 'p'}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  for (let k = 0; k < n; k++) {
    seed((h ^ Math.imul(k + 1, 2654435761)) >>> 0);
    const g = typeof gear === 'function' ? gear() : gear;
    const hero = makeHero({ faction, level, gear: g, baseHp, bag, elixirs, elxFx });
    const mon = makeMonster(monster, tier, { aiLevel, swarm, elite });
    const pl = typeof player === 'string' ? PLAYERS[player]() : typeof player === 'function' ? player() : player;
    const S = Battle(hero, mon, pl).run();
    if (S.winner === 'left') { wins++; hpLeft += hero.hp / hero.max; actWin.push(S.stats.heroActions); }
    if (S.winner === 'draw') draws++;
    actions += S.stats.heroActions; rounds += S.stats.rounds; spells += S.stats.spells; abil += S.stats.abilities;
    heroDmg += S.stats.heroDmg; monDmg += S.stats.monDmg; monActs += S.stats.monActions;
  }
  actWin.sort((a, b) => a - b);
  return {
    win: wins / n, draws: draws / n, actions: actions / n, rounds: rounds / n, spells: spells / n, abilities: abil / n,
    hpLeft: wins ? hpLeft / wins : 0, heroDmgPerAct: heroDmg / Math.max(1, actions), monDmgPerAct: monDmg / Math.max(1, monActs),
    medianActionsWin: actWin.length ? actWin[Math.floor(actWin.length / 2)] : 0,
  };
}

// Снаряжение «типичного» героя уровня L: случайные вещи его цвета примерно на share от лимита очков.
function typicalGear(level, share = 0.8) {
  const t = Hero.tierFor(level);
  return Gear.randomLoadout(Math.round(Hero.budget(level) * share), rand, t);
}
const STARTER = { main: 'sword-novice', off: 'shield-wood', head: 'leather-head', chest: 'leather-chest', arms: 'leather-arms', legs: 'leather-legs', amulet: null };

module.exports = { typicalGear, STARTER, simulate, Battle, makeHero, makeMonster, PLAYERS, humanPlayer, aiPlayer, seed, get rand() { return rand; } };

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
