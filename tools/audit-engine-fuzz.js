/* Аудит поля Match-3 (полный проход, этап 4): фаззинг чистой логики поля (js/engine.js) с воспроизводимыми зёрнами.
   Запуск: node tools/audit-engine-fuzz.js [--seed=1] [--boards=100000] [--games=3000] [--moves=120] [--json=file]
   Проверяет: (A) fillEmpty на пустом и дырявом поле даёт поле без готовых линий и с ходом; (B) legalMoves совпадает с
   независимой переборной проверкой; (C) resolve: нет оставшихся линий, «лесенка» (камни внизу-справа), сумма собранного
   совпадает с эталонным подсчётом; (D) obsidianBurst совпадает с эталоном, цепная реакция завершается; (E) цепочка
   «ход → сбор → заполнение» не оставляет поле без ходов; (F) распределения цветов, номиналов, длина каскадов.
   Любая ошибка печатается вместе с зерном и номером хода — достаточно запустить с тем же --seed, чтобы повторить. */
require('../js/i18n.js');
const fs = require('fs');
const E = require('../js/engine.js');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const SEED = Number(arg('seed', 1)), BOARDS = Number(arg('boards', 100000)), GAMES = Number(arg('games', 3000)), MOVES = Number(arg('moves', 120));
const N = E.N, CELLS = N * N, CHANCE = { x5: 0.05, x3: 0.12 };
const rng = (s) => { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const fails = [];
const fail = (kind, info) => { if (fails.length < 60) fails.push({ kind, ...info }); counts[kind] = (counts[kind] || 0) + 1; };
const counts = {};

/* ---------- эталоны (написаны отдельно от engine.js) ---------- */
const runAt = (typ, r, c, dr, dc) => {          // длина линии одинаковых камней через клетку в направлении (dr,dc)
  const t = typ[r * N + c]; if (t < 0) return 0;
  let n = 1;
  for (let k = 1; ; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || cc < 0 || rr >= N || cc >= N || typ[rr * N + cc] !== t) break; n++; }
  for (let k = 1; ; k++) { const rr = r - dr * k, cc = c - dc * k; if (rr < 0 || cc < 0 || rr >= N || cc >= N || typ[rr * N + cc] !== t) break; n++; }
  return n;
};
const bonRef = (typ) => {
  const out = new Array(CELLS).fill(0); let any = false;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const h = runAt(typ, r, c, 0, 1), v = runAt(typ, r, c, 1, 0);
    const best = Math.max(h >= 3 ? h : 0, v >= 3 ? v : 0);
    if (best) { out[r * N + c] = best >= 6 ? 10 : best === 5 ? 3 : best === 4 ? 2 : 1; any = true; }
  }
  return any ? out : null;
};
const hasLineRef = (typ) => bonRef(typ) !== null;
const legalRef = (typ) => {
  const set = new Set();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
    const rr = r + dr, cc = c + dc; if (rr >= N || cc >= N) continue;
    const a = r * N + c, b = rr * N + cc;
    if (typ[a] === typ[b]) continue;
    const t = typ.slice(); t[a] = typ[b]; t[b] = typ[a];
    if (hasLineRef(t)) set.add(a + ':' + b);
  }
  return set;
};
const staircase = (typ) => {                    // после падения вниз и сдвига вправо: клетка занята → клетка снизу и клетка справа заняты
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (typ[r * N + c] >= 0) {
    if (r + 1 < N && typ[(r + 1) * N + c] < 0) return false;
    if (c + 1 < N && typ[r * N + c + 1] < 0) return false;
  }
  return true;
};
const sumGains = (g) => g.reduce((a, b) => a + b, 0);
const mkBoard = (rand, kinds = 4) => { const typ = new Int8Array(CELLS).fill(-1), val = new Int8Array(CELLS); E.fillEmpty(typ, val, rand, CHANCE, kinds); return { typ, val }; };

/* ---------- A. fillEmpty ---------- */
const stat = { fills: 0, rebuilt: 0, colorHist: [0, 0, 0, 0], valHist: { 1: 0, 3: 0, 5: 0 }, posColor: Array.from({ length: CELLS }, () => [0, 0, 0, 0]) };
{
  const rand = rng(SEED * 7919);
  for (let b = 0; b < BOARDS; b++) {
    const seed = SEED * 1000003 + b, r = rng(seed);
    const typ = new Int8Array(CELLS).fill(-1), val = new Int8Array(CELLS);
    const mode = b % 3;
    if (mode > 0) {                                  // дырявое поле: случайная «лесенка» из оставшихся камней (как после сбора)
      const heights = Array.from({ length: N }, () => Math.floor(r() * (N + 1)));
      const base = mkBoard(r); for (let c = 0; c < N; c++) for (let k = 0; k < heights[c]; k++) { const i = (N - 1 - k) * N + c; typ[i] = base.typ[i]; val[i] = base.val[i]; }
      if (mode === 2) E.shiftRight(typ, val);
      // оставшиеся камни могли бы уже образовать линию — игра так не оставляет, поэтому пропускаем такие случаи
      if (hasLineRef(typ)) continue;
    }
    const res = E.fillEmpty(typ, val, r, CHANCE, 4);
    stat.fills++; if (res.rebuilt) stat.rebuilt++;
    if (typ.some((t) => t < 0)) fail('A:остались пустые клетки', { seed, mode });
    if (hasLineRef(typ)) fail('A:после заполнения есть готовая линия', { seed, mode, rebuilt: res.rebuilt });
    if (legalRef(typ).size === 0) fail('A:после заполнения нет ни одного хода', { seed, mode, rebuilt: res.rebuilt });
    if (val.some((v, i) => typ[i] >= 0 && ![1, 3, 5].includes(v))) fail('A:недопустимый номинал', { seed });
    if (mode === 0) for (let i = 0; i < CELLS; i++) { stat.colorHist[typ[i]]++; stat.valHist[val[i]]++; stat.posColor[i][typ[i]]++; }
  }
  void rand;
}

/* ---------- B. legalMoves против эталона ---------- */
{
  let boards = 0;
  for (let b = 0; b < Math.min(BOARDS, 40000); b++) {
    const seed = SEED * 99991 + b, r = rng(seed);
    const typ = new Int8Array(CELLS);
    const holes = b % 2 ? Math.floor(r() * 10) : 0;
    for (let i = 0; i < CELLS; i++) typ[i] = Math.floor(r() * 4);
    for (let h = 0; h < holes; h++) typ[Math.floor(r() * CELLS)] = -1;
    if (b % 4 === 3) E.shiftRight(typ, new Int8Array(CELLS)), E.gravity(typ, new Int8Array(CELLS));
    const mine = new Set(E.legalMoves(typ.slice()).map((m) => m.a + ':' + m.b)), ref = legalRef(typ);
    boards++;
    if (mine.size !== ref.size || [...ref].some((x) => !mine.has(x))) fail('B:legalMoves ≠ эталон', { seed, extra: [...mine].filter((x) => !ref.has(x)).slice(0, 3), missing: [...ref].filter((x) => !mine.has(x)).slice(0, 3) });
    const four = E.fourPlusMoves(typ.slice());
    for (const m of four) if (!mine.has(m.a + ':' + m.b)) fail('B:fourPlusMoves вне legalMoves', { seed, m });
  }
  stat.legalBoards = boards;
}

/* ---------- C/D/E. партии: ход → resolve → заполнение ---------- */
const chain = { moves: 0, cascades: 0, hist: {}, stonesPerMove: 0, withFour: 0, withFive: 0, withSix: 0, noMoveAfterResolve: 0, maxCasc: 0, obsMoves: 0, obsBursts: 0 };
{
  for (let g = 0; g < GAMES; g++) {
    const seed = SEED * 7777777 + g, r = rng(seed), pick = rng(seed ^ 0x9e3779b9);
    const { typ, val } = mkBoard(r);
    const ONYX = 3;
    for (let mv = 0; mv < MOVES; mv++) {
      // включаем «обсидиан»: ~каждые 7 ходов делаем несколько камней обсидианом x5 (как Рунный молот)
      if (mv % 7 === 6) for (let k = 0; k < 3; k++) { const i = Math.floor(pick() * CELLS); if (typ[i] >= 0) { typ[i] = ONYX; val[i] = 5; } if (hasLineRef(typ)) { typ[i] = (typ[i] + 1) % 3; } }
      const moves = E.legalMoves(typ.slice());
      if (!moves.length) { fail('E:игра пришла к полю без ходов', { seed, mv }); break; }
      const m = moves[Math.floor(pick() * moves.length)];
      const before = Int8Array.from(typ), bval = Int8Array.from(val);
      [typ[m.a], typ[m.b]] = [typ[m.b], typ[m.a]]; [val[m.a], val[m.b]] = [val[m.b], val[m.a]];
      // пошаговый разбор (эталонный): считаем сумму собранного и число каскадов по эталону bonRef
      const refT = Int8Array.from(typ), refV = Int8Array.from(val), refGain = [0, 0, 0, 0]; let casc = 0, sawFour = false, sawFive = false, sawSix = false, burst = false;
      for (;;) {
        let bon = bonRef(refT);
        if (bon && refT.some((t, i) => bon[i] && t === ONYX && refV[i] === 5)) {     // обсидиан x5 собран → соседи тоже исчезают (бонус 1, только если ещё не собраны)
          const b2 = E.obsidianBurst(refT, Int8Array.from(bon), ONYX, refV);
          if (b2.some((x, i) => x !== bon[i])) burst = true;
          bon = Array.from(b2);
        }
        if (!bon) break;
        casc++;
        for (let i = 0; i < CELLS; i++) if (bon[i]) { refGain[refT[i]] += refV[i] * bon[i]; if (bon[i] === 2) sawFour = true; if (bon[i] === 3) sawFive = true; if (bon[i] === 10) sawSix = true; refT[i] = -1; refV[i] = 0; }
        E.gravity(refT, refV); E.shiftRight(refT, refV);
      }
      const gains = [0, 0, 0, 0];
      E.resolve(typ, val, gains, ONYX);
      if (gains.some((x, k) => x !== refGain[k])) fail('C:resolve: сумма собранного ≠ эталон', { seed, mv, gains: gains.slice(), refGain });
      if (hasLineRef(typ)) fail('C:после resolve остались линии', { seed, mv });
      if (!staircase(typ)) fail('C:после resolve камни не «лесенкой» (падение/сдвиг)', { seed, mv });
      if (typ.some((t, i) => (t < 0) !== (val[i] === 0))) fail('C:номинал не согласован с пустотой', { seed, mv });
      const left = typ.reduce((a, t) => a + (t >= 0 ? 1 : 0), 0);
      if (E.resolve.length >= 0 && E.bonusMap(typ)) fail('C:bonusMap после resolve не пуст', { seed, mv });
      chain.moves++; chain.cascades += casc; chain.hist[casc] = (chain.hist[casc] || 0) + 1; chain.maxCasc = Math.max(chain.maxCasc, casc);
      chain.stonesPerMove += CELLS - left; if (sawFour) chain.withFour++; if (sawFive) chain.withFive++; if (sawSix) chain.withSix++; if (burst) chain.obsBursts++;
      if (!E.hasMoves(typ.slice()) && left > 0) chain.noMoveAfterResolve++;
      if (left === 0 || !E.hasMoves(typ.slice())) { E.fillEmpty(typ, val, r, CHANCE, 4); }
      else E.fillEmpty(typ, val, r, CHANCE, 4);
      if (hasLineRef(typ)) fail('E:после заполнения есть линия', { seed, mv });
      if (!E.hasMoves(typ.slice())) fail('E:после заполнения нет хода', { seed, mv });
      void before; void bval;
    }
  }
}

/* ---------- D. обсидиан: цепная реакция и граничные случаи ---------- */
{
  let t = 0, bad = 0;
  for (let b = 0; b < 20000; b++) {
    const r = rng(SEED * 31337 + b);
    const typ = new Int8Array(CELLS), val = new Int8Array(CELLS);
    for (let i = 0; i < CELLS; i++) { typ[i] = Math.floor(r() * 4); val[i] = [1, 3, 5][Math.floor(r() * 3)]; }
    const bon = bonRef(typ); if (!bon) continue; t++;
    const ref = Array.from(bon), seen = new Set();
    const q = []; for (let i = 0; i < CELLS; i++) if (bon[i] && typ[i] === 3 && val[i] === 5) q.push(i);
    while (q.length) { const i = q.shift(); if (seen.has(i)) continue; seen.add(i); for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const rr = Math.floor(i / N) + dr, cc = (i % N) + dc; if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue; const j = rr * N + cc; if (typ[j] < 0 || ref[j]) continue; ref[j] = 1; if (typ[j] === 3 && val[j] === 5) q.push(j); } }
    const got = E.obsidianBurst(typ, Int8Array.from(bon), 3, val);
    if (Array.from(got).some((x, i) => x !== ref[i])) { bad++; fail('D:obsidianBurst ≠ эталон', { seed: SEED * 31337 + b }); }
    // исходная карта бонусов не должна меняться, а бонус >1 у уже собранных клеток не должен затираться
    if (bon.some((x, i) => x > 1 && got[i] !== x)) fail('D:бонус линии 4+ затёрт взрывом', { seed: SEED * 31337 + b });
  }
  stat.obsTests = t; stat.obsBad = bad;
}

/* ---------- итоги ---------- */
const cellsTotal = stat.colorHist.reduce((a, b) => a + b, 0);
const share = (n, d) => +(100 * n / d).toFixed(2);
const posSpread = (() => { let worst = 0; for (let i = 0; i < CELLS; i++) { const s = stat.posColor[i].reduce((a, b) => a + b, 0); for (const c of stat.posColor[i]) worst = Math.max(worst, Math.abs(c / s - 0.25)); } return +(worst * 100).toFixed(2); })();
const summary = {
  seed: SEED,
  fillEmpty: { boards: stat.fills, rebuiltShare: share(stat.rebuilt, stat.fills) + '%', colorShare: stat.colorHist.map((c) => share(c, cellsTotal) + '%'), valueShare: Object.fromEntries(Object.entries(stat.valHist).map(([k, v]) => ['x' + k, share(v, cellsTotal) + '%'])), worstPositionColorBias: posSpread + ' п.п. от 25%' },
  legalMoves: { boardsCompared: stat.legalBoards },
  games: { games: GAMES, movesPlayed: chain.moves, avgCascadesPerMove: +(chain.cascades / chain.moves).toFixed(3), cascadeHistogram: chain.hist, maxCascade: chain.maxCasc, avgStonesPerMove: +(chain.stonesPerMove / chain.moves).toFixed(2), movesWithFour: share(chain.withFour, chain.moves) + '%', movesWithFive: share(chain.withFive, chain.moves) + '%', movesWithSix: share(chain.withSix, chain.moves) + '%', boardWithoutMovesBeforeRefill: share(chain.noMoveAfterResolve, chain.moves) + '%', obsidianBursts: chain.obsBursts },
  obsidian: { boardsWithLine: stat.obsTests, mismatches: stat.obsBad },
  failureCounts: counts, failures: fails.slice(0, 20),
};
console.log(JSON.stringify(summary, null, 1));
const jf = process.argv.find((a) => a.startsWith('--json='));
if (jf) fs.writeFileSync(jf.slice(7), JSON.stringify(summary, null, 1));
process.exit(Object.keys(counts).length ? 1 : 0);
