if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Шахматы с Бобром (1.9.7): полные правила (рокировка, взятие на проходе, превращение пешки в ферзя, шах/мат/пат,
   ничья по правилу 50 ходов, недостатку материала и троекратному повторению), играет Бобёр — перебор с альфа-бета отсечением.
   Игрок — белые. Партия хранится списком ходов в Profile.data.chess и восстанавливается проигрыванием.
   Клетки 0..63: 0 = a8, 63 = h1 (строка = floor(i/8), колонка = i%8). Фигуры: PNBRQK — белые, pnbrqk — чёрные. Чистый модуль. */
const Chess = (() => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const isW = (p) => p !== null && p < 'a';
  const sqName = (i) => 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8));
  const sqOf = (s) => (8 - Number(s[1])) * 8 + 'abcdefgh'.indexOf(s[0]);
  function fromFen(fen) {
    const [pl, t, c, ep, h, f] = fen.split(' '), b = [];
    for (const ch of pl) { if (ch === '/') continue; if (ch >= '1' && ch <= '8') for (let k = 0; k < +ch; k++) b.push(null); else b.push(ch); }
    return { b, turn: t, castle: { K: c.includes('K'), Q: c.includes('Q'), k: c.includes('k'), q: c.includes('q') }, ep: ep === '-' ? -1 : sqOf(ep), half: +h || 0, full: +f || 1 };
  }
  const clone = (s) => ({ b: s.b.slice(), turn: s.turn, castle: { K: s.castle.K, Q: s.castle.Q, k: s.castle.k, q: s.castle.q }, ep: s.ep, half: s.half, full: s.full });
  const N_OFF = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const K_OFF = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const B_DIR = [[-1, -1], [-1, 1], [1, -1], [1, 1]], R_DIR = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  // клетка sq атакована фигурами цвета byW
  function attacked(b, sq, byW) {
    const r = Math.floor(sq / 8), c = sq % 8, at = (rr, cc) => (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 ? b[rr * 8 + cc] : null);
    const P = byW ? 'P' : 'p', Nn = byW ? 'N' : 'n', K = byW ? 'K' : 'k', Bb = byW ? 'B' : 'b', Rr = byW ? 'R' : 'r', Q = byW ? 'Q' : 'q';
    const pr = byW ? r + 1 : r - 1;
    if (at(pr, c - 1) === P || at(pr, c + 1) === P) return true;
    for (const [dr, dc] of N_OFF) if (at(r + dr, c + dc) === Nn) return true;
    for (const [dr, dc] of K_OFF) if (at(r + dr, c + dc) === K) return true;
    for (const [dr, dc] of B_DIR) for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < 8 && cc >= 0 && cc < 8; rr += dr, cc += dc) { const p = b[rr * 8 + cc]; if (p) { if (p === Bb || p === Q) return true; break; } }
    for (const [dr, dc] of R_DIR) for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < 8 && cc >= 0 && cc < 8; rr += dr, cc += dc) { const p = b[rr * 8 + cc]; if (p) { if (p === Rr || p === Q) return true; break; } }
    return false;
  }
  const kingSq = (b, w) => b.indexOf(w ? 'K' : 'k');
  const inCheck = (s) => attacked(s.b, kingSq(s.b, s.turn === 'w'), s.turn !== 'w');
  function pseudo(s) {
    const out = [], b = s.b, w = s.turn === 'w';
    const add = (from, to, extra) => out.push(Object.assign({ from, to }, extra || null));
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p || isW(p) !== w) continue;
      const r = Math.floor(i / 8), c = i % 8, t = p.toLowerCase();
      if (t === 'p') {
        const dir = w ? -1 : 1, start = w ? 6 : 1, last = w ? 0 : 7, r1 = r + dir;
        const push = (to, extra) => { if (Math.floor(to / 8) === last) for (const pr of ['q', 'r', 'b', 'n']) add(i, to, Object.assign({ promo: pr }, extra)); else add(i, to, extra); };
        if (r1 >= 0 && r1 < 8 && !b[r1 * 8 + c]) { push(r1 * 8 + c); if (r === start && !b[(r + 2 * dir) * 8 + c]) add(i, (r + 2 * dir) * 8 + c, { dbl: true }); }
        for (const dc of [-1, 1]) { const cc = c + dc; if (cc < 0 || cc > 7 || r1 < 0 || r1 > 7) continue; const to = r1 * 8 + cc, q = b[to];
          if (q && isW(q) !== w) push(to); else if (to === s.ep) add(i, to, { ep: true }); }
      } else if (t === 'n' || t === 'k') {
        for (const [dr, dc] of (t === 'n' ? N_OFF : K_OFF)) { const rr = r + dr, cc = c + dc; if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue; const q = b[rr * 8 + cc]; if (!q || isW(q) !== w) add(i, rr * 8 + cc); }
        if (t === 'k') {
          const home = w ? 60 : 4, ks = w ? s.castle.K : s.castle.k, qs = w ? s.castle.Q : s.castle.q, rk = w ? 'R' : 'r';
          if (i === home && !attacked(b, home, !w)) {
            if (ks && b[home + 3] === rk && !b[home + 1] && !b[home + 2] && !attacked(b, home + 1, !w) && !attacked(b, home + 2, !w)) add(i, home + 2, { castle: 'k' });
            if (qs && b[home - 4] === rk && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(b, home - 1, !w) && !attacked(b, home - 2, !w)) add(i, home - 2, { castle: 'q' });
          }
        }
      } else {
        const dirs = t === 'b' ? B_DIR : t === 'r' ? R_DIR : B_DIR.concat(R_DIR);
        for (const [dr, dc] of dirs) for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < 8 && cc >= 0 && cc < 8; rr += dr, cc += dc) { const q = b[rr * 8 + cc]; if (!q) add(i, rr * 8 + cc); else { if (isW(q) !== w) add(i, rr * 8 + cc); break; } }
      }
    }
    return out;
  }
  function make(s, m) {
    const n = clone(s), b = n.b, w = s.turn === 'w', p = b[m.from];
    const cap = b[m.to] || (m.ep ? b[m.to + (w ? 8 : -8)] : null);
    b[m.to] = m.promo ? (w ? m.promo.toUpperCase() : m.promo) : p; b[m.from] = null;
    if (m.ep) b[m.to + (w ? 8 : -8)] = null;
    if (m.castle) { const home = w ? 60 : 4; if (m.castle === 'k') { b[home + 1] = b[home + 3]; b[home + 3] = null; } else { b[home - 1] = b[home - 4]; b[home - 4] = null; } }
    n.ep = m.dbl ? (m.from + m.to) / 2 : -1;
    if (p === 'K') { n.castle.K = n.castle.Q = false; } else if (p === 'k') { n.castle.k = n.castle.q = false; }
    for (const [sq, k] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) if (m.from === sq || m.to === sq) n.castle[k] = false;
    n.half = (p.toLowerCase() === 'p' || cap) ? 0 : s.half + 1;
    if (!w) n.full++;
    n.turn = w ? 'b' : 'w';
    return n;
  }
  function legal(s) {
    const w = s.turn === 'w', out = [];
    for (const m of pseudo(s)) { const n = make(s, m); if (!attacked(n.b, kingSq(n.b, w), !w)) out.push(m); }
    return out;
  }
  const mvStr = (m) => sqName(m.from) + sqName(m.to) + (m.promo || '');
  function parseMove(s, str) { return legal(s).find((m) => mvStr(m) === str) || null; }
  function insufficient(b) {
    const rest = b.filter((p) => p && p.toLowerCase() !== 'k');
    if (!rest.length) return true;
    if (rest.length === 1 && 'nbNB'.includes(rest[0])) return true;
    return false;
  }
  const key = (s) => s.b.map((p) => p || '1').join('') + s.turn + (s.castle.K ? 'K' : '') + (s.castle.Q ? 'Q' : '') + (s.castle.k ? 'k' : '') + (s.castle.q ? 'q' : '') + s.ep;
  // статус позиции: { over, result:'w'|'b'|'draw'|'', why, check }
  function status(s, history) {
    const mv = legal(s), chk = inCheck(s);
    if (!mv.length) return chk ? { over: true, result: s.turn === 'w' ? 'b' : 'w', why: 'mate', check: true } : { over: true, result: 'draw', why: 'stalemate', check: false };
    if (s.half >= 100) return { over: true, result: 'draw', why: '50', check: chk };
    if (insufficient(s.b)) return { over: true, result: 'draw', why: 'material', check: chk };
    if (history) { const k = key(s); if (history.filter((x) => x === k).length >= 3) return { over: true, result: 'draw', why: 'repeat', check: chk }; }
    return { over: false, result: '', why: '', check: chk };
  }
  // ---------- Бобёр играет ----------
  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const PST_P = [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0];
  const PST_N = [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50];
  function evaluate(s) {   // с точки зрения стороны, чей ход
    let sc = 0;
    for (let i = 0; i < 64; i++) {
      const p = s.b[i]; if (!p) continue; const w = isW(p), t = p.toLowerCase(), idx = w ? i : 63 - i;
      let v = VAL[t] + (t === 'p' ? PST_P[idx] : t === 'n' ? PST_N[idx] : 0);
      sc += w ? v : -v;
    }
    return s.turn === 'w' ? sc : -sc;
  }
  const order = (s, ms) => ms.map((m) => ({ m, k: (s.b[m.to] || m.ep ? 10 * VAL[(s.b[m.to] || 'p').toLowerCase()] - VAL[s.b[m.from].toLowerCase()] : 0) + (m.promo === 'q' ? 800 : 0) })).sort((a, c) => c.k - a.k).map((x) => x.m);
  const NLEV = 10;
  let deadline = 0;
  function qsearch(s, alpha, beta, left) {          // «тихий» поиск: только взятия, чтобы не зевать фигуры на последнем ходу
    const stand = evaluate(s); if (stand >= beta || left <= 0) return stand;
    if (stand > alpha) alpha = stand;
    for (const m of order(s, legal(s).filter((x) => s.b[x.to] || x.ep || x.promo))) {
      const v = -qsearch(make(s, m), -beta, -alpha, left - 1);
      if (v >= beta) return v; if (v > alpha) alpha = v;
    }
    return alpha;
  }
  function search(s, depth, alpha, beta, ply, q) {
    if (deadline && Date.now() > deadline) throw new Error('time');
    const ms = legal(s);
    if (!ms.length) return inCheck(s) ? -30000 + ply : 0;
    if (depth <= 0) return q ? qsearch(s, alpha, beta, 4) : evaluate(s);
    let best = -Infinity;
    for (const m of order(s, ms)) {
      const v = -search(make(s, m), depth - 1, -beta, -alpha, ply + 1, q);
      if (v > best) best = v; if (v > alpha) alpha = v; if (alpha >= beta) break;
    }
    return best;
  }
  // 10 уровней (по цветам из Tiers): от «почти случайных» ходов до перебора на 5 ходов с ограничением по времени
  const LEVELS = [
    { depth: 1, noise: 300 }, { depth: 1, noise: 160 }, { depth: 1, noise: 70 }, { depth: 2, noise: 80 }, { depth: 2, noise: 30 },
    { depth: 2, noise: 0, q: true }, { depth: 3, noise: 40, q: true }, { depth: 3, noise: 0, q: true }, { depth: 4, noise: 0, q: true, ms: 2500 }, { depth: 5, noise: 0, q: true, ms: 4000 },
  ];
  function scoreRoot(s, ms, depth, q, rnd, noise) {
    const out = [];
    for (const m of ms) out.push({ m, v: -search(make(s, m), depth - 1, -Infinity, Infinity, 1, q) + (noise ? (rnd() - 0.5) * 2 * noise : 0) });
    return out;
  }
  function choose(s, level, rnd = Math.random) {
    const L = LEVELS[Math.max(0, Math.min(NLEV - 1, (level | 0) - 1))], ms = order(s, legal(s)); if (!ms.length) return null;
    const pick = (list) => list.reduce((a, x) => (x.v > a.v ? x : a), list[0]).m;
    if (!L.ms) return pick(scoreRoot(s, ms, L.depth, L.q, rnd, L.noise));
    let best = pick(scoreRoot(s, ms, 1, L.q, rnd, 0));            // углубляем по одному ходу, пока хватает времени
    deadline = Date.now() + L.ms;
    try { for (let d = 2; d <= L.depth; d++) { const r = scoreRoot(s, ms, d, L.q, rnd, 0); best = pick(r); ms.sort((a, c) => (r.find((x) => x.m === c).v - r.find((x) => x.m === a).v)); } }
    catch (e) { if (e.message !== 'time') throw e; } finally { deadline = 0; }
    return best;
  }
  function perft(s, d) { if (d === 0) return 1; let n = 0; for (const m of legal(s)) n += perft(make(s, m), d - 1); return n; }
  // ---------- партия игрока ----------
  // награда символическая и только за ПЕРВУЮ победу на уровне — иначе монеты можно накручивать партиями с ботом
  const COINS = [5, 8, 10, 15, 20, 30, 40, 60, 80, 120], DRAW_COINS = COINS.map(() => 0);
  const num = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  function clean(p) {
    p = p && typeof p === 'object' ? p : {};
    const g = p.game && typeof p.game === 'object' ? p.game : null;
    const lv = (x) => Math.max(1, Math.min(NLEV, num(x) || 1));
    const rec = (a) => Array.from({ length: NLEV }, (_, i) => num(a && a[i]));
    return { level: lv(p.level), game: g && Array.isArray(g.moves) ? { level: lv(g.level), moves: g.moves.filter((m) => typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)).slice(0, 600), over: !!g.over, result: ['w', 'b', 'draw'].includes(g.result) ? g.result : '', paid: !!g.paid } : null,
      wins: rec(p.wins), draws: rec(p.draws), losses: rec(p.losses), first: rec(p.first) };
  }
  function newGame(p, level) { p.level = level; p.game = { level, moves: [], over: false, result: '', paid: false }; return p.game; }
  // позиция партии и история ключей
  function replay(g) {
    let s = fromFen(START); const hist = [key(s)];
    for (const str of g.moves) { const m = parseMove(s, str); if (!m) break; s = make(s, m); hist.push(key(s)); }
    return { s, hist };
  }
  // ход игрока (белые): { ok, status }
  function playerMove(p, str) {
    const g = p.game; if (!g || g.over) return { ok: false };
    const { s, hist } = replay(g); if (s.turn !== 'w') return { ok: false };
    const m = parseMove(s, str); if (!m) return { ok: false };
    const n = make(s, m); g.moves.push(mvStr(m)); hist.push(key(n));
    return { ok: true, status: finish(p, n, hist) };
  }
  // ход Бобра: { ok, move, status }
  function bobMove(p, rnd) {
    const g = p.game; if (!g || g.over) return { ok: false };
    const { s, hist } = replay(g); if (s.turn !== 'b') return { ok: false };
    const m = choose(s, g.level, rnd); if (!m) return { ok: false };
    const n = make(s, m); g.moves.push(mvStr(m)); hist.push(key(n));
    return { ok: true, move: mvStr(m), status: finish(p, n, hist) };
  }
  function finish(p, s, hist) {
    const st = status(s, hist), g = p.game;
    if (st.over) { g.over = true; g.result = st.result; }
    return st;
  }
  function resign(p) { const g = p.game; if (!g || g.over) return false; g.over = true; g.result = 'b'; return true; }
  // подводим итог законченной партии один раз: { coins, first }
  function settle(p) {
    const g = p.game; if (!g || !g.over || g.paid) return { coins: 0, first: false };
    g.paid = true; const i = g.level - 1; let coins = 0, first = false;
    if (g.result === 'w') { p.wins[i]++; if (!p.first[i]) { p.first[i] = 1; coins = COINS[i]; first = true; } }
    else if (g.result === 'draw') { p.draws[i]++; } else p.losses[i]++;
    return { coins, first };
  }
  return { START, fromFen, legal, make, status, choose, perft, mvStr, parseMove, sqName, sqOf, isW, inCheck, key, LEVELS, NLEV, COINS, DRAW_COINS, clean, newGame, replay, playerMove, bobMove, resign, settle };
})();

if (typeof module !== 'undefined') module.exports = Chess;
