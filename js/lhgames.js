if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
if (typeof Engine === 'undefined' && typeof require === 'function') globalThis.Engine = require('./engine.js');
/* Мини-игры у смотрителя маяка (1.8.8): «Обвал» и «Пирамида», жетоны маяка, лимит в сутки, лавка.
   Чистый модуль без DOM. Состояние профиля: Profile.data.lh = { tokens, day, plays:{av,py}, best:{av,py}, tickets, bought:{id:true}, rounds }.
   Награда только косметическая (значки, рамка) и билеты на повторную игру — силы в боях она не даёт. */
const LHGames = (() => {
  const N = 6, KINDS = 4;
  const DAILY_PLAYS = 3;                       // раундов каждой игры в сутки, за которые платят жетоны
  const num = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  const GAMES = ['av', 'py'];
  // пороги очков → жетоны: score ≥ T[i] даёт i+1 жетонов (1..5); подобраны симуляцией (tests/lhgames.test.js)
  const TIERS = { av: [110, 135, 160, 190, 225], py: [8, 13, 18, 24, 30] };
  const GAME_NAME = { av: () => _t("Обвал"), py: () => _t("Пирамида") };

  // ---------- профиль ----------
  function clean(s) {
    s = s && typeof s === 'object' ? s : {};
    const two = (o) => ({ av: num(o && o.av), py: num(o && o.py) });
    const bought = {};
    if (s.bought && typeof s.bought === 'object') for (const k of Object.keys(s.bought)) if (s.bought[k] && SHOP.some((x) => x.id === k)) bought[k] = true;
    return { tokens: num(s.tokens), day: typeof s.day === 'string' ? s.day : '', plays: two(s.plays), best: two(s.best), tickets: Math.min(20, num(s.tickets)), bought, rounds: num(s.rounds), spent: num(s.spent) };
  }
  function left(s, game, day) {                // сколько раундов игры ещё идёт «в зачёт» сегодня
    if (s.day !== day) { s.day = day; s.plays = { av: 0, py: 0 }; }
    return Math.max(0, DAILY_PLAYS - s.plays[game]);
  }
  const canPlay = (s, game, day) => left(s, game, day) > 0 || s.tickets > 0;
  // начало раунда: тратит суточную попытку, а когда они кончились — билет. Возвращает false, если играть нельзя
  function begin(s, game, day) {
    if (!GAMES.includes(game) || !canPlay(s, game, day)) return false;
    if (left(s, game, day) > 0) s.plays[game]++; else s.tickets--;
    s.rounds++;
    return true;
  }
  function tokensFor(game, score) { let n = 0; for (const t of TIERS[game]) if (score >= t) n++; return n; }
  // конец раунда: жетоны и рекорд. Возвращает { tokens, record }
  function finish(s, game, score) {
    score = num(score);
    const tokens = tokensFor(game, score), record = score > s.best[game];
    if (record) s.best[game] = score;
    s.tokens += tokens;
    return { tokens, record };
  }

  // ---------- лавка ----------
  const SHOP = [
    { id: 'ticket', cost: 2, repeat: true, name: () => _t("Билет на ещё один раунд"), desc: () => _t("Одна дополнительная игра сверх суточного лимита (копится до 20).") },
    { id: 'lamp', cost: 8, name: () => _t("Значок «Огонь маяка»"), desc: () => _t("Украшение визитки героя.") },
    { id: 'shell', cost: 12, name: () => _t("Значок «Ракушка»"), desc: () => _t("Украшение визитки героя.") },
    { id: 'frame', cost: 16, name: () => _t("Рамка визитки «Морской канат»"), desc: () => _t("Украшение визитки героя.") },
    { id: 'pearl', cost: 24, name: () => _t("Значок «Жемчужина»"), desc: () => _t("Самое редкое украшение визитки.") },
  ];
  function buy(s, id) {
    const it = SHOP.find((x) => x.id === id);
    if (!it) return { ok: false, why: 'none' };
    if (!it.repeat && s.bought[id]) return { ok: false, why: 'have' };
    if (it.id === 'ticket' && s.tickets >= 20) return { ok: false, why: 'full' };
    if (s.tokens < it.cost) return { ok: false, why: 'poor' };
    s.tokens -= it.cost; s.spent += it.cost;
    if (it.id === 'ticket') s.tickets++; else s.bought[id] = true;
    return { ok: true };
  }
  const badges = (s) => SHOP.filter((x) => !x.repeat && s && s.bought && s.bought[x.id]);

  // ---------- общее ----------
  function rng(seed) { let a = (seed | 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const bonusFor = (len) => (len >= 6 ? 10 : len === 5 ? 3 : len === 4 ? 2 : 1);
  function gravityCols(typ, sp) {
    for (let c = 0; c < N; c++) {
      let w = N - 1;
      for (let r = N - 1; r >= 0; r--) {
        const i = r * N + c;
        if (typ[i] >= 0) {
          if (r !== w) { typ[w * N + c] = typ[i]; sp[w * N + c] = sp[i]; typ[i] = -1; sp[i] = 0; }
          w--;
        }
      }
    }
  }

  // ---------- «Обвал»: конечный запас камней ----------
  // Поле 6×6 без случайного пополнения: убывшие камни заменяются только из «шахты» (запас 60). Камень из линии 4 становится
  // взрывным (убирает 8 соседей), из линии 5+ — линейным (убирает строку или столбец). Очки: камень × бонус линии + цепочки.
  const AV_RESERVE = 60;
  function avNew(seed) {
    const rand = rng(seed);
    for (let attempt = 0; attempt < 400; attempt++) {
      const all = []; for (let i = 0; i < N * N + AV_RESERVE; i++) all.push(Math.floor(rand() * KINDS));
      const typ = Int8Array.from(all.slice(0, N * N));
      if (Engine.bonusMap(typ) || !Engine.hasMoves(typ)) continue;
      return { typ, sp: new Uint8Array(N * N), reserve: all.slice(N * N), score: 0, moves: 0, cleared: 0, shuffles: 3, done: false, rand };
    }
    throw new Error('av: no board');
  }
  const avClone = (s) => ({ typ: Int8Array.from(s.typ), sp: Uint8Array.from(s.sp), reserve: s.reserve.slice(), score: s.score, moves: s.moves, cleared: s.cleared, shuffles: s.shuffles, done: s.done, rand: s.rand });
  function avRefill(s) {
    for (let c = 0; c < N; c++) for (let r = N - 1; r >= 0; r--) {
      const i = r * N + c;
      if (s.typ[i] < 0 && s.reserve.length) { s.typ[i] = s.reserve.shift(); s.sp[i] = 0; }
    }
  }
  const avMoves = (s) => Engine.legalMoves(s.typ);
  // ход — обмен соседних клеток a и b. Возвращает { ok, gained, combo } или { ok:false }
  function avMove(s, a, b) {
    if (s.done || a === b || a < 0 || b < 0 || a >= N * N || b >= N * N) return { ok: false };
    const ra = Math.floor(a / N), rb = Math.floor(b / N), ca = a % N, cb = b % N;
    if (Math.abs(ra - rb) + Math.abs(ca - cb) !== 1) return { ok: false };
    if (s.typ[a] === s.typ[b]) return { ok: false };
    const sw = (arr) => { const t = arr[a]; arr[a] = arr[b]; arr[b] = t; };
    sw(s.typ); sw(s.sp);
    if (!Engine.bonusMap(s.typ)) { sw(s.typ); sw(s.sp); return { ok: false }; }
    const before = s.score; let combo = 0, hint = [a, b];
    for (;;) {
      const bon = Engine.bonusMap(s.typ);
      if (!bon) break;
      combo++;
      const clear = new Uint8Array(N * N), mult = new Uint8Array(N * N);
      for (let i = 0; i < N * N; i++) if (bon[i]) { clear[i] = 1; mult[i] = bon[i]; }
      // новые особые камни: связные группы клеток с множителем ≥2 одного вида
      const keep = new Uint8Array(N * N), seen = new Uint8Array(N * N), made = [];
      for (let i = 0; i < N * N; i++) {
        if (seen[i] || bon[i] < 2) continue;
        const grp = [], stack = [i]; seen[i] = 1;
        while (stack.length) {
          const x = stack.pop(); grp.push(x);
          const r = Math.floor(x / N), c = x % N;
          for (const y of [c > 0 ? x - 1 : -1, c < N - 1 ? x + 1 : -1, r > 0 ? x - N : -1, r < N - 1 ? x + N : -1]) if (y >= 0 && !seen[y] && bon[y] >= 2 && s.typ[y] === s.typ[i]) { seen[y] = 1; stack.push(y); }
        }
        const pick = grp.find((x) => hint.includes(x)) ?? grp[0];
        made.push({ i: pick, kind: grp.length >= 5 ? 2 : 1 }); keep[pick] = 1;
      }
      hint = [];
      // взрывы особых камней, попавших под очистку (цепочкой)
      const queue = []; for (let i = 0; i < N * N; i++) if (clear[i] && s.sp[i] && !keep[i]) queue.push(i);
      while (queue.length) {
        const x = queue.pop(), r = Math.floor(x / N), c = x % N, add = [];
        if (s.sp[x] === 1) { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N) add.push(rr * N + cc); } }
        else if (r % 2 === c % 2) { for (let k = 0; k < N; k++) add.push(r * N + k); } else { for (let k = 0; k < N; k++) add.push(k * N + c); }
        s.sp[x] = 0;
        for (const y of add) if (s.typ[y] >= 0 && !clear[y] && !keep[y]) { clear[y] = 1; mult[y] = 1; if (s.sp[y]) queue.push(y); }
      }
      let n = 0;
      for (let i = 0; i < N * N; i++) if (clear[i] && !keep[i]) { s.score += mult[i] || 1; s.cleared++; n++; s.typ[i] = -1; s.sp[i] = 0; }
      for (const m of made) s.sp[m.i] = m.kind;
      if (combo > 1) s.score += (combo - 1) * 2;
      gravityCols(s.typ, s.sp);
      avRefill(s);
    }
    s.moves++;
    avSettle(s);
    return { ok: true, gained: s.score - before, combo };
  }
  // после хода: перемешивание, если ходов нет, и конец игры
  function avSettle(s) {
    const left = s.typ.reduce((n, t) => n + (t >= 0 ? 1 : 0), 0);
    if (!left && !s.reserve.length) { s.score += 20; s.done = true; return; }
    while (!Engine.hasMoves(s.typ)) {
      if (s.shuffles <= 0 || left < 4) { s.done = true; return; }
      s.shuffles--;
      const idx = [], vals = [];
      for (let i = 0; i < N * N; i++) if (s.typ[i] >= 0) { idx.push(i); vals.push([s.typ[i], s.sp[i]]); }
      let ok = false;
      for (let t = 0; t < 200 && !ok; t++) {
        for (let k = vals.length - 1; k > 0; k--) { const j = Math.floor(s.rand() * (k + 1)); [vals[k], vals[j]] = [vals[j], vals[k]]; }
        idx.forEach((p, k) => { s.typ[p] = vals[k][0]; s.sp[p] = vals[k][1]; });
        ok = !Engine.bonusMap(s.typ) && Engine.hasMoves(s.typ);
      }
      if (!ok) { s.done = true; return; }
      s.reshuffled = (s.reshuffled || 0) + 1;
    }
  }

  // ---------- «Пирамида»: три шара разного веса ----------
  // Ступенчатая пирамида 6×6 из ящиков четырёх цветов (высоты столбцов 2·4·6·6·4·2). Шары весом 1, 2 и 3 — каждый один раз, в любом
  // порядке: летят по выбранной строке слева или справа и выбивают столько ящиков, каков вес. Верхние падают вниз по столбцам;
  // три одноцветных в ряд сами исчезают (цепочка). Очки: выбитые + по 2 за каждый ящик цепочки; пустая пирамида — +10.
  const PY_HEIGHTS = [2, 4, 6, 6, 4, 2];
  function pyNew(seed) {
    const rand = rng(seed);
    for (let attempt = 0; attempt < 400; attempt++) {
      const typ = new Int8Array(N * N).fill(-1);
      for (let c = 0; c < N; c++) for (let h = 0; h < PY_HEIGHTS[c]; h++) typ[(N - 1 - h) * N + c] = Math.floor(rand() * KINDS);
      if (Engine.bonusMap(typ)) continue;
      return { typ, sp: new Uint8Array(N * N), balls: [1, 2, 3], score: 0, knocked: 0, done: false };
    }
    throw new Error('py: no pyramid');
  }
  const pyClone = (s) => ({ typ: Int8Array.from(s.typ), sp: new Uint8Array(N * N), balls: s.balls.slice(), score: s.score, knocked: s.knocked, done: s.done });
  // row — строка снизу (0..5), side — 'L' или 'R', weight — вес шара из s.balls. Возвращает { ok, hit:[клетки], chain }
  function pyThrow(s, row, side, weight) {
    if (s.done || !(row >= 0 && row < N) || (side !== 'L' && side !== 'R')) return { ok: false };
    const bi = s.balls.indexOf(weight);
    if (bi < 0) return { ok: false };
    s.balls.splice(bi, 1);
    const r = N - 1 - row, hit = [];
    for (let k = 0; k < N && hit.length < weight; k++) {
      const c = side === 'L' ? k : N - 1 - k, i = r * N + c;
      if (s.typ[i] >= 0) hit.push(i);
    }
    for (const i of hit) s.typ[i] = -1;
    s.score += hit.length; s.knocked += hit.length;
    gravityCols(s.typ, s.sp);
    let chain = 0;
    for (let combo = 0; ; combo++) {
      const bon = Engine.bonusMap(s.typ);
      if (!bon) break;
      for (let i = 0; i < N * N; i++) if (bon[i]) { s.typ[i] = -1; s.score += 2; chain++; }
      gravityCols(s.typ, s.sp);
    }
    if (s.typ.every((t) => t < 0)) { s.score += 10; s.done = true; } else if (!s.balls.length) s.done = true;
    return { ok: true, hit, chain };
  }

  return { N, DAILY_PLAYS, TIERS, GAMES, GAME_NAME, SHOP, AV_RESERVE, PY_HEIGHTS, clean, left, canPlay, begin, tokensFor, finish, buy, badges,
    avNew, avClone, avMove, avMoves, pyNew, pyClone, pyThrow };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LHGames;
