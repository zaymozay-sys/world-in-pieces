if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
if (typeof LHGames === 'undefined' && typeof require === 'function') globalThis.LHGames = require('./lhgames.js');
/* Головоломка дня (1.8.9): одно и то же поле у всех, 8 ходов, цель — набрать побольше очков (1–3 звезды).
   Поле строится из даты (отбирается такое, где «жадный» игрок набирает не меньше 150 — звёзды достижимы). Правила и камни — как в «Обвале»
   (LHGames.av*). Состояние — Profile.data.puzzle = { day, moves:[[a,b],…], done, stars, paid, total, best }: партия восстанавливается
   повторным проигрыванием ходов, поэтому вкладку можно закрыть посреди решения. Чистый модуль без DOM. */
const Puzzle = (() => {
  const MOVES = 8, STARS = [100, 140, 185], COINS = [40, 90, 160];
  const num = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  function clean(p) {
    p = p && typeof p === 'object' ? p : {};
    const moves = Array.isArray(p.moves) ? p.moves.filter((m) => Array.isArray(m) && m.length === 2 && m.every((v) => Number.isInteger(v) && v >= 0 && v < 36)).slice(0, MOVES) : [];
    return { day: typeof p.day === 'string' ? p.day : '', moves, done: !!p.done, stars: Math.min(3, num(p.stars)), paid: Math.min(3, num(p.paid)), total: num(p.total), best: num(p.best) };
  }
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) || 1; };
  const stars = (score) => STARS.filter((t) => score >= t).length;
  function greedy(seed) {
    const s = LHGames.avNew(seed); let n = 0;
    while (n < MOVES && !s.done) {
      const mv = LHGames.avMoves(s); if (!mv.length) break;
      let best = -1, pick = mv[0];
      for (const m of mv) { const c = LHGames.avClone(s); LHGames.avMove(c, m.a, m.b); if (c.score > best) { best = c.score; pick = m; } }
      if (!LHGames.avMove(s, pick.a, pick.b).ok) break; n++;
    }
    return s.score;
  }
  const seedCache = {};
  function seedFor(day) {
    if (seedCache[day]) return seedCache[day];
    let seed = hash('puzzle:' + day);
    for (let i = 0; i < 40; i++, seed = (Math.imul(seed, 1103515245) + 12345) >>> 1 || 1) if (greedy(seed) >= 150) break;
    return (seedCache[day] = seed);
  }
  // чистая партия дня с уже сделанными ходами
  function game(p, day) {
    const s = LHGames.avNew(seedFor(day));
    for (const [a, b] of p.moves) LHGames.avMove(s, a, b);
    if (p.moves.length >= MOVES) s.done = true;
    return s;
  }
  // новый день — новая головоломка (звёзды и рекорд сохраняются, ходы и оплата сбрасываются)
  function sync(p, day) { if (p.day !== day) { p.day = day; p.moves = []; p.done = false; p.stars = 0; p.paid = 0; } return p; }
  // ход игрока: { ok, s, done, stars, coins } — coins выдаются один раз за каждую новую звезду в этот день
  function move(p, day, a, b) {
    sync(p, day);
    if (p.done) return { ok: false };
    const s = game(p, day), r = LHGames.avMove(s, a, b);
    if (!r.ok) return { ok: false };
    p.moves.push([a, b]);
    const left = MOVES - p.moves.length;
    if (left <= 0 || s.done || !LHGames.avMoves(s).length) { s.done = true; p.done = true; }
    p.stars = Math.max(p.stars, stars(s.score)); p.best = Math.max(p.best, s.score);
    let coins = 0;
    while (p.paid < p.stars) { coins += COINS[p.paid]; p.paid++; }
    if (p.done) p.total++;
    return { ok: true, s, done: p.done, stars: p.stars, coins, left };
  }
  const movesLeft = (p) => Math.max(0, MOVES - p.moves.length);
  return { MOVES, STARS, COINS, clean, sync, game, move, stars, seedFor, movesLeft, greedy };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Puzzle;
