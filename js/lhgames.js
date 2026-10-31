if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
if (typeof Engine === 'undefined' && typeof require === 'function') globalThis.Engine = require('./engine.js');
/* Мини-игры у смотрителя маяка (1.8.8): «Обвал», «Зеркала маяка», «Прилив», «Канаты» и «Кладоискатель», жетоны маяка, лимит в сутки, лавка.
   Чистый модуль без DOM. Состояние профиля: Profile.data.lh = { tokens, day, plays:{игра:n}, best:{игра:n}, tickets, bought:{id:true}, rounds }.
   Награда только косметическая (значки, рамка) и билеты на повторную игру — силы в боях она не даёт. */
const LHGames = (() => {
  const N = 6, KINDS = 4;
  const DAILY_PLAYS = 3;                       // раундов каждой игры в сутки, за которые платят жетоны
  const num = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  const GAMES = ['av', 'mr', 'td', 'rp', 'dg'];
  // пороги очков → жетоны: score ≥ T[i] даёт i+1 жетонов (1..5); подобраны симуляцией (tools/lh-sim.js)
  const TIERS = { av: [115, 135, 155, 180, 210], mr: [44, 56, 66, 76, 86], td: [130, 240, 380, 560, 800], rp: [12, 18, 24, 40, 50], dg: [20, 35, 50, 65, 80] };   // 2.0.9: пересчитаны ботами (tools/lh-sim.js): случайный игрок — 0–1 жетон, небрежный — около 2, толковый — 3–4, 5 — только почти безупречный раунд
  const GAME_NAME = { av: () => _t("Обвал"), mr: () => _t("Зеркала маяка"), td: () => _t("Прилив"), rp: () => _t("Канаты"), dg: () => _t("Кладоискатель") };

  // ---------- профиль ----------
  function clean(s) {
    s = s && typeof s === 'object' ? s : {};
    const two = (o) => Object.fromEntries(GAMES.map((g) => [g, num(o && o[g])]));
    const bought = {};
    if (s.bought && typeof s.bought === 'object') for (const k of Object.keys(s.bought)) if (s.bought[k] && SHOP.some((x) => x.id === k)) bought[k] = true;
    return { tokens: num(s.tokens), day: typeof s.day === 'string' ? s.day : '', plays: two(s.plays), best: two(s.best), tickets: Math.min(20, num(s.tickets)), bought, rounds: num(s.rounds), spent: num(s.spent) };
  }
  function left(s, game, day) {                // сколько раундов игры ещё идёт «в зачёт» сегодня
    if (s.day !== day) { s.day = day; s.plays = Object.fromEntries(GAMES.map((g) => [g, 0])); }
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

  // ---------- «Зеркала маяка»: направьте луч через все камни ----------
  // Лампа слева пускает луч вправо по выбранной строке. На поле зеркала «/» и «\» (нажатие переворачивает зеркало) и камни.
  // Раунд — до трёх полей подряд. Поле собирается из пути луча (решение есть всегда), затем часть зеркал на пути переворачивается.
  const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];             // вправо, вниз, влево, вверх
  const MR_BOARDS = 3;
  function mrTrace(s) {
    const lit = new Uint8Array(N * N), seen = new Set(), path = [];
    let r = s.lampRow, c = 0, d = 0;
    while (r >= 0 && r < N && c >= 0 && c < N) {
      const i = r * N + c, key = i * 4 + d;
      if (seen.has(key)) break;
      seen.add(key); path.push(i); lit[i] = 1;
      const m = s.mir[i]; if (m === 1) d ^= 3; else if (m === 2) d ^= 1;
      r += DIRS[d][0]; c += DIRS[d][1];
    }
    return { lit, path, end: [r, c], dir: d };
  }
  const mrSolved = (s) => { const t = mrTrace(s).lit; return s.gems.every((g, i) => g < 0 || t[i]); };
  function mrPuzzle(rand) {
    for (let attempt = 0; attempt < 600; attempt++) {
      const lampRow = Math.floor(rand() * N), used = new Set(), mir = new Int8Array(N * N), cells = [];
      let r = lampRow, c = 0, d = 0, ok = true;
      for (let step = 0; step < 40; step++) {
        const i = r * N + c; used.add(i); cells.push(i);
        if (step > 0 && rand() < 0.45 || step === 0 && rand() < 0.2) {
          const opts = (rand() < 0.5 ? [3, 1] : [1, 3]);          // «/» → d^3, «\» → d^1
          let placed = false;
          for (const x of opts) {
            const nd = d ^ x, nr = r + DIRS[nd][0], nc = c + DIRS[nd][1];
            if (nr >= 0 && nr < N && nc >= 0 && nc < N && used.has(nr * N + nc)) continue;
            mir[i] = x === 3 ? 1 : 2; d = nd; placed = true; break;
          }
          if (!placed) { ok = false; break; }
        }
        const nr = r + DIRS[d][0], nc = c + DIRS[d][1];
        if (nr < 0 || nr >= N || nc < 0 || nc >= N) break;            // луч вышел за поле
        if (used.has(nr * N + nc)) { ok = false; break; }
        r = nr; c = nc;
      }
      const onPath = cells.filter((i) => mir[i]), free = cells.slice(1).filter((i) => !mir[i]);
      if (!ok || cells.length < 10 || onPath.length < 3 || free.length < 4) continue;
      const gems = new Int8Array(N * N).fill(-1), want = Math.min(free.length, 3 + Math.floor(rand() * 3));
      const pool = free.slice(); for (let k = 0; k < want; k++) gems[pool.splice(Math.floor(rand() * pool.length), 1)[0]] = Math.floor(rand() * KINDS);
      // «ложные» зеркала вне пути решения
      const other = []; for (let i = 0; i < N * N; i++) if (!used.has(i) && gems[i] < 0) other.push(i);
      const decoys = Math.min(other.length, 2 + Math.floor(rand() * 3));
      for (let k = 0; k < decoys; k++) mir[other.splice(Math.floor(rand() * other.length), 1)[0]] = 1 + Math.floor(rand() * 2);
      // перемешиваем: переворачиваем часть зеркал пути
      const flip = Math.max(2, Math.floor(onPath.length / 2)), cand = onPath.slice();
      let flipped = 0; for (let k = 0; k < flip && cand.length; k++) { const j = cand.splice(Math.floor(rand() * cand.length), 1)[0]; mir[j] = 3 - mir[j]; flipped++; }
      const s = { lampRow, mir, gems, taps: 0, minTaps: flipped };
      if (mrSolved(s)) continue;
      return s;
    }
    throw new Error('mr: no puzzle');
  }
  function mrNew(seed) { const rand = rng(seed); return { rand, puz: mrPuzzle(rand), solved: 0, score: 0, done: false, boards: MR_BOARDS, last: 0 }; }
  // нажатие на клетку: переворачивает зеркало. Возвращает { ok, solved } (solved — поле решено, пришло новое)
  function mrTap(s, i) {
    if (s.done || !(i >= 0 && i < N * N) || !s.puz.mir[i]) return { ok: false };
    const p = s.puz; p.mir[i] = 3 - p.mir[i]; p.taps++;
    if (!mrSolved(p)) return { ok: true, solved: false };
    const gems = p.gems.filter((g) => g >= 0).length;
    s.last = 4 + 2 * gems + Math.max(0, 14 - 2 * (p.taps - p.minTaps));
    s.score += s.last; s.solved++;
    if (s.solved >= s.boards) s.done = true; else s.puz = mrPuzzle(s.rand);
    return { ok: true, solved: true };
  }

  // ---------- «Прилив»: собирайте линии, пока море не затопило поле ----------
  // Матч-3 с обменом соседних камней. Каждые три хода вода поднимается на ряд (камни под водой не двигаются и не собираются).
  // Линия из 4 камней отгоняет воду на ряд, из 5 и больше — на два. Вода дошла до 4-го ряда — раунд окончен.
  const TD_RISE = 3, TD_MAX = 4, TD_MOVES = 30;
  function tdRuns(typ, dry) {
    const clear = new Uint8Array(N * N); let longest = 0;
    for (let r = 0; r < dry; r++) {
      for (let c = 0; c < N; ) {
        let e = c + 1; const t = typ[r * N + c];
        while (e < N && t >= 0 && typ[r * N + e] === t) e++;
        if (t >= 0 && e - c >= 3) { for (let k = c; k < e; k++) clear[r * N + k] = 1; longest = Math.max(longest, e - c); }
        c = e;
      }
    }
    for (let c = 0; c < N; c++) {
      for (let r = 0; r < dry; ) {
        let e = r + 1; const t = typ[r * N + c];
        while (e < dry && t >= 0 && typ[e * N + c] === t) e++;
        if (t >= 0 && e - r >= 3) { for (let k = r; k < e; k++) clear[k * N + c] = 1; longest = Math.max(longest, e - r); }
        r = e;
      }
    }
    return { clear, longest };
  }
  function tdMovesList(typ, dry) {
    const out = [];
    for (let r = 0; r < dry; r++) for (let c = 0; c < N; c++) {
      const i = r * N + c;
      for (const j of [c < N - 1 ? i + 1 : -1, r < dry - 1 ? i + N : -1]) {
        if (j < 0 || typ[i] === typ[j]) continue;
        [typ[i], typ[j]] = [typ[j], typ[i]];
        const ok = tdRuns(typ, dry).longest >= 3;
        [typ[i], typ[j]] = [typ[j], typ[i]];
        if (ok) out.push({ a: i, b: j });
      }
    }
    return out;
  }
  function tdFill(s) {                                          // пустые клетки сухой части заполняются сверху случайными камнями
    const dry = N - s.water;
    for (let c = 0; c < N; c++) {
      let w = dry - 1;
      for (let r = dry - 1; r >= 0; r--) { const i = r * N + c; if (s.typ[i] >= 0) { if (r !== w) { s.typ[w * N + c] = s.typ[i]; s.typ[i] = -1; } w--; } }
      for (let r = w; r >= 0; r--) s.typ[r * N + c] = Math.floor(s.rand() * KINDS);
    }
  }
  function tdNew(seed) {
    const rand = rng(seed);
    for (let attempt = 0; attempt < 400; attempt++) {
      const typ = new Int8Array(N * N); for (let i = 0; i < N * N; i++) typ[i] = Math.floor(rand() * KINDS);
      if (tdRuns(typ, N).longest || !tdMovesList(typ, N).length) continue;
      return { typ, water: 0, moves: 0, sinceRise: 0, score: 0, cleared: 0, done: false, rand, last: null };
    }
    throw new Error('td: no board');
  }
  function tdMove(s, a, b) {
    const dry = N - s.water;
    if (s.done || a === b || !(a >= 0 && b >= 0 && a < N * N && b < N * N)) return { ok: false };
    const ra = Math.floor(a / N), rb = Math.floor(b / N), ca = a % N, cb = b % N;
    if (ra >= dry || rb >= dry || Math.abs(ra - rb) + Math.abs(ca - cb) !== 1 || s.typ[a] === s.typ[b]) return { ok: false };
    const sw = () => { const t = s.typ[a]; s.typ[a] = s.typ[b]; s.typ[b] = t; };
    sw();
    if (tdRuns(s.typ, dry).longest < 3) { sw(); return { ok: false }; }
    let combo = 0, best = 0, gained = 0;
    for (;;) {
      const { clear, longest } = tdRuns(s.typ, dry);
      if (longest < 3) break;
      combo++; best = Math.max(best, longest);
      let n = 0; for (let i = 0; i < N * N; i++) if (clear[i]) { s.typ[i] = -1; n++; }
      s.cleared += n; gained += n + (combo > 1 ? 2 * (combo - 1) : 0);
      tdFill(s);
    }
    s.score += gained;
    const back = best >= 5 ? 2 : best === 4 ? 1 : 0;
    if (back) { s.water = Math.max(0, s.water - back); s.score += 3 * back; s.sinceRise = 0; for (let i = 0; i < N * N; i++) if (s.typ[i] < 0) s.typ[i] = Math.floor(s.rand() * KINDS); }
    s.moves++; s.sinceRise++;
    let rose = false;
    if (s.sinceRise >= TD_RISE) { s.sinceRise = 0; s.water++; rose = true; }
    if (s.water >= TD_MAX || s.moves >= TD_MOVES) { s.done = true; return { ok: true, gained, combo, back, rose }; }
    // после отлива камни в освободившихся рядах уже есть; если ходов нет — перемешиваем сухую часть
    const dry2 = N - s.water;
    for (let t = 0; t < 100 && !tdMovesList(s.typ, dry2).length; t++) {
      for (let i = 0; i < dry2 * N; i++) s.typ[i] = Math.floor(s.rand() * KINDS);
      for (let g = 0; g < 20 && tdRuns(s.typ, dry2).longest >= 3; g++) { const x = tdRuns(s.typ, dry2).clear; for (let i = 0; i < dry2 * N; i++) if (x[i]) s.typ[i] = Math.floor(s.rand() * KINDS); }
    }
    if (!tdMovesList(s.typ, dry2).length) s.done = true;
    return { ok: true, gained, combo, back, rose };
  }

  // ---------- «Канаты»: соедините одноцветные узлы верёвками ----------
  // Поле 6×6, пять пар узлов. Верёвки идут по соседним клеткам и не пересекаются. Раунд — одно поле: 6 очков за пару,
  // +10 за все пары, +10, если верёвки заполнили всё поле. Решение есть всегда (поле режется из случайного обхода).
  const RP_PAIRS = 5;
  function rpWalk(rand) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const order = [Math.floor(rand() * N * N)], used = new Uint8Array(N * N); used[order[0]] = 1;
      const nb = (i) => { const r = Math.floor(i / N), c = i % N, o = []; if (c > 0) o.push(i - 1); if (c < N - 1) o.push(i + 1); if (r > 0) o.push(i - N); if (r < N - 1) o.push(i + N); return o; };
      let budget = 4000;
      const dfs = () => {
        if (order.length === N * N) return true;
        if (--budget < 0) return false;
        const cur = order[order.length - 1];
        const opts = nb(cur).filter((x) => !used[x]).sort((a, b) => nb(a).filter((y) => !used[y]).length - nb(b).filter((y) => !used[y]).length + (rand() - 0.5) * 1.2);
        for (const x of opts) { used[x] = 1; order.push(x); if (dfs()) return true; order.pop(); used[x] = 0; }
        return false;
      };
      if (dfs()) return order;
    }
    const snake = []; for (let r = 0; r < N; r++) for (let k = 0; k < N; k++) snake.push(r * N + (r % 2 ? N - 1 - k : k));
    return snake;
  }
  function rpNew(seed) {
    const rand = rng(seed), order = rpWalk(rand);
    const cuts = [0]; // длины сегментов ≥ 4
    let left = N * N; const lens = [];
    for (let k = 0; k < RP_PAIRS; k++) {
      const rest = RP_PAIRS - k - 1, minL = 4, maxL = left - rest * minL;
      const len = rest === 0 ? left : minL + Math.floor(rand() * Math.max(1, Math.min(maxL - minL, 9) + 1));
      lens.push(len); left -= len;
    }
    void cuts;
    const ends = []; let p = 0;
    for (const len of lens) { ends.push({ a: order[p], b: order[p + len - 1] }); p += len; }
    const node = new Int8Array(N * N).fill(-1);
    ends.forEach((e, k) => { node[e.a] = k; node[e.b] = k; });
    return { node, ends, paths: ends.map(() => []), active: -1, score: 0, done: false, moves: 0, solution: order.slice(), lens };
  }
  const rpAdj = (a, b) => (Math.abs(Math.floor(a / N) - Math.floor(b / N)) + Math.abs((a % N) - (b % N)) === 1);
  const rpOwner = (s, i) => s.paths.findIndex((pa) => pa.includes(i));
  const rpLinked = (s, k) => { const pa = s.paths[k], e = s.ends[k]; return pa.length > 1 && ((pa[0] === e.a && pa[pa.length - 1] === e.b) || (pa[0] === e.b && pa[pa.length - 1] === e.a)); };
  function rpScore(s) {
    const linked = s.ends.filter((_, k) => rpLinked(s, k)).length, covered = s.paths.reduce((n, pa) => n + pa.length, 0);
    return linked * 6 + (linked === s.ends.length ? 10 : 0) + (linked === s.ends.length && covered === N * N ? 10 : 0);
  }
  // нажатие на клетку i. Возвращает { ok, solved }
  function rpTap(s, i) {
    if (s.done || !(i >= 0 && i < N * N)) return { ok: false };
    const k = s.node[i];
    if (k >= 0) {                                              // узел: выбрать или завершить верёвку этого цвета
      if (s.active === k && s.paths[k].length) { const pa = s.paths[k], last = pa[pa.length - 1]; if (rpAdj(last, i) && !pa.includes(i)) pa.push(i); else if (pa[0] !== i) { s.paths[k] = [i]; } }
      else if (s.active >= 0 && s.active !== k && s.paths[s.active].length && !rpLinked(s, s.active) && rpAdj(s.paths[s.active][s.paths[s.active].length - 1], i) && s.paths[k].indexOf(i) < 0 && rpOwner(s, i) < 0) return { ok: false };
      else { s.active = k; s.paths[k] = [i]; }
    } else {
      const own = rpOwner(s, i);
      if (own >= 0) { const pa = s.paths[own], at = pa.indexOf(i); if (at >= 0 && at < pa.length - 1) { s.paths[own] = pa.slice(0, at + 1); s.active = own; } else if (at === pa.length - 1) s.active = own; }
      else if (s.active >= 0) {
        const pa = s.paths[s.active];
        if (!pa.length || rpLinked(s, s.active) || !rpAdj(pa[pa.length - 1], i)) return { ok: false };
        pa.push(i);
      } else return { ok: false };
    }
    s.moves++;
    const a = s.active;
    if (a >= 0 && s.paths[a].length > 1 && rpLinked(s, a)) { /* верёвка соединена */ }
    s.score = rpScore(s);
    const solved = s.ends.every((_, kk) => rpLinked(s, kk));
    if (solved) s.done = true;
    return { ok: true, solved };
  }
  function rpReset(s) { if (s.done) return; s.paths = s.ends.map(() => []); s.active = -1; s.score = 0; }

  // ---------- «Кладоискатель»: раскопки по подсказкам ----------
  // Поле 6×6 скрывает 7 самоцветов и 3 трещины. Копать можно 14 раз; открытая клетка пишет, сколько самоцветов и трещин
  // в соседних клетках. Самоцвет — 10 очков, трещина отнимает ещё две попытки, все самоцветы — +10, каждая оставшаяся попытка — +2.
  const DG_TREAS = 7, DG_TRAPS = 3, DG_DIGS = 14;
  function dgNew(seed) {
    const rand = rng(seed), idx = Array.from({ length: N * N }, (_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const kind = new Int8Array(N * N);                          // 0 пусто, 1 самоцвет, 2 трещина
    idx.slice(0, DG_TREAS).forEach((i) => { kind[i] = 1; }); idx.slice(DG_TREAS, DG_TREAS + DG_TRAPS).forEach((i) => { kind[i] = 2; });
    const gem = new Int8Array(N * N).fill(-1); for (let i = 0; i < N * N; i++) if (kind[i] === 1) gem[i] = Math.floor(rand() * KINDS);
    return { kind, gem, open: new Uint8Array(N * N), digs: DG_DIGS, found: 0, score: 0, done: false, traps: 0 };
  }
  function dgHint(s, i) {
    const r = Math.floor(i / N), c = i % N; let t = 0, x = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc; if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
      const k = s.kind[rr * N + cc]; if (k === 1) t++; else if (k === 2) x++;
    }
    return { t, x };
  }
  function dgFinish(s) {
    s.done = true; s.score = s.found * 10 + (s.found === DG_TREAS ? 10 : 0) + Math.max(0, s.digs) * 2;
  }
  function dgDig(s, i) {
    if (s.done || !(i >= 0 && i < N * N) || s.open[i]) return { ok: false };
    s.open[i] = 1; s.digs--;
    const k = s.kind[i];
    if (k === 1) s.found++; else if (k === 2) { s.digs -= 2; s.traps++; }
    if (s.found === DG_TREAS || s.digs <= 0) dgFinish(s); else s.score = s.found * 10;
    return { ok: true, kind: k };
  }

  return { N, DAILY_PLAYS, TIERS, GAMES, GAME_NAME, SHOP, AV_RESERVE, clean, left, canPlay, begin, tokensFor, finish, buy, badges,
    avNew, avClone, avMove, avMoves, mrNew, mrTap, mrTrace, mrSolved, MR_BOARDS, tdNew, tdMove, tdMovesList, TD_RISE, TD_MAX, TD_MOVES, rpNew, rpTap, rpReset, rpLinked, rpScore, RP_PAIRS, dgNew, dgDig, dgHint, DG_TREAS, DG_TRAPS, DG_DIGS };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LHGames;
