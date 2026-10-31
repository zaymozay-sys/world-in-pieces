// 2.0.9: симуляция раундов мини-игр маяка ботами разной силы: сколько очков и жетонов получает «случайный», «небрежный», «толковый» игрок.
// Запуск: node tools/lh-sim.js [--n=300]
global._t = global._t || ((s) => s);
const L = require('../js/lhgames.js');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? Number(a.slice(k.length + 3)) : d; };
const N = arg('n', 300), SZ = L.N;
let seed = 1; const R = () => Math.random();
const pick = (a) => a[Math.floor(R() * a.length)];
const stats = (xs) => { xs = xs.slice().sort((a, b) => a - b); const q = (p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]; return { p10: q(.1), p50: q(.5), p90: q(.9), max: xs[xs.length - 1] }; };

// ---- Обвал ----
function avRound(skill) {
  const s = L.avNew(seed++);
  let guard = 0;
  while (!s.done && guard++ < 400) {
    const mv = L.avMoves(s); if (!mv.length) break;
    let m;
    if (skill === 'random' || (skill === 'casual' && R() < 0.5)) m = pick(mv);
    else {
      let best = -1, bm = null;
      for (const x of (skill === 'good' ? mv : mv.slice().sort(() => R() - .5).slice(0, 12))) { const c = L.avClone(s); const r = L.avMove(c, x.a ?? x[0], x.b ?? x[1]); const g = r.ok ? r.gained : -1; if (g > best) { best = g; bm = x; } }
      m = bm || pick(mv);
    }
    L.avMove(s, m.a ?? m[0], m.b ?? m[1]);
  }
  return s.score;
}
// ---- Прилив ----
function tdClone(s) { return { ...s, typ: Int8Array.from(s.typ), rand: () => Math.random() }; }
function tdRound(skill) {
  const s = L.tdNew(seed++); let guard = 0;
  while (!s.done && guard++ < 60) {
    const dry = SZ - s.water, mv = L.tdMovesList(s.typ, dry); if (!mv.length) break;
    let m;
    if (skill === 'random' || (skill === 'casual' && R() < 0.5)) m = pick(mv);
    else {
      let best = -1e9, bm = null;
      for (const x of mv) { const c = tdClone(s); const r = L.tdMove(c, x.a, x.b); const g = r.ok ? c.score - s.score + (c.water < s.water ? 6 : 0) - (c.done ? 30 : 0) : -1e9; if (g > best) { best = g; bm = x; } }
      m = bm || pick(mv);
    }
    L.tdMove(s, m.a, m.b);
  }
  return s.score;
}
// ---- Зеркала ----
function mrRound(skill) {
  const s = L.mrNew(seed++); let guard = 0;
  while (!s.done && guard++ < 400) {
    const p = s.puz, cells = []; for (let i = 0; i < SZ * SZ; i++) if (p.mir[i]) cells.push(i);
    let tap;
    if (skill === 'random') tap = pick(cells);
    else {
      const gems = () => { const t = L.mrTrace(p).lit; return p.gems.reduce((n, g, i) => n + (g >= 0 && t[i] ? 1 : 0), 0); };
      const base = gems(); let best = [];
      for (const i of cells) { p.mir[i] = 3 - p.mir[i]; const g = gems(); p.mir[i] = 3 - p.mir[i]; if (g > base) best.push(i); }
      tap = best.length && (skill === 'good' || R() < 0.6) ? pick(best) : pick(cells);
    }
    L.mrTap(s, tap);
  }
  return s.score;
}
// ---- Канаты: игрок-«небрежный» соединяет часть пар по готовому решению, «толковый» — все; «случайный» — одну ----
function rpRound(skill) {
  const s = L.rpNew(seed++); const order = s.solution; let p = 0; const segs = [];
  for (const len of s.lens) { segs.push(order.slice(p, p + len)); p += len; }
  const nLink = skill === 'random' ? 1 : skill === 'casual' ? 2 + Math.floor(R() * 3) : 5;
  const chosen = segs.map((x, k) => k).sort(() => R() - .5).slice(0, nLink);
  for (const k of chosen) { for (const i of segs[k]) L.rpTap(s, i); }
  return s.score;
}
// ---- Кладоискатель ----
function dgRound(skill) {
  const s = L.dgNew(seed++); let guard = 0;
  while (!s.done && guard++ < 40) {
    const closed = []; for (let i = 0; i < SZ * SZ; i++) if (!s.open[i]) closed.push(i);
    let i;
    if (skill === 'random') i = pick(closed);
    else {
      // оценка: открытая клетка с подсказкой t>0 «заряжает» соседние закрытые
      const w = new Float32Array(SZ * SZ);
      for (let j = 0; j < SZ * SZ; j++) if (s.open[j]) {
        const h = L.dgHint(s, j), r = Math.floor(j / SZ), c = j % SZ; const nb = [];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < SZ && cc >= 0 && cc < SZ && !s.open[rr * SZ + cc]) nb.push(rr * SZ + cc); }
        if (!nb.length) continue;
        for (const q of nb) { w[q] += h.t / nb.length; if (skill === 'good') w[q] -= 0.7 * h.x / nb.length; }
      }
      const top = closed.slice().sort((a, b) => w[b] - w[a] + (R() - .5) * (skill === 'good' ? 0.05 : 0.5));
      i = top[0];
    }
    L.dgDig(s, i);
  }
  return s.done ? s.score : s.score;
}
const games = { av: avRound, mr: mrRound, td: tdRound, rp: rpRound, dg: dgRound };
for (const g of L.GAMES) {
  console.log(`\n== ${g}  пороги ${L.TIERS[g].join('/')}`);
  for (const skill of ['random', 'casual', 'good']) {
    const xs = []; for (let k = 0; k < N; k++) xs.push(games[g](skill));
    const tok = xs.map((x) => L.tokensFor(g, x)), avg = tok.reduce((a, b) => a + b, 0) / tok.length;
    const dist = [0, 1, 2, 3, 4, 5].map((t) => Math.round(100 * tok.filter((x) => x === t).length / tok.length));
    const st = stats(xs);
    console.log(`  ${skill.padEnd(7)} очки p10 ${st.p10} · p50 ${st.p50} · p90 ${st.p90} · max ${st.max} | жетонов в среднем ${avg.toFixed(2)} | доли 0..5: ${dist.join('/')}%`);
  }
}
