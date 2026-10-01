/* Чистая логика поля (без DOM). Ей пользуются и игра, и ИИ противника.
   Поле — плоский массив из 36 клеток: индекс = строка * 6 + столбец.
   typ[i] — вид камня (0..3) или -1, если клетка пуста; val[i] — номинал (1, 3, 5). */

const Engine = (() => {
  const N = 6;
  const MIN_MATCH = 3;

  // Бонус за длину линии: 4 камня — x2, 5 — x3, 6 — x10.
  function bonusFor(len) {
    if (len >= 6) return 10;
    if (len === 5) return 3;
    if (len === 4) return 2;
    return 1;
  }

  // Возвращает массив множителей по клеткам (0 — клетка не собрана)
  // или null, если совпадений нет.
  function bonusMap(typ) {
    let bon = null;
    const mark = (idxs, len) => {
      if (!bon) bon = new Int8Array(N * N);
      const b = bonusFor(len);
      for (const i of idxs) if (b > bon[i]) bon[i] = b;
    };
    for (let r = 0; r < N; r++) {
      let c = 0;
      while (c < N) {
        const t = typ[r * N + c];
        if (t < 0) { c++; continue; }
        let e = c + 1;
        while (e < N && typ[r * N + e] === t) e++;
        if (e - c >= MIN_MATCH) {
          const idxs = [];
          for (let k = c; k < e; k++) idxs.push(r * N + k);
          mark(idxs, e - c);
        }
        c = e;
      }
    }
    for (let c = 0; c < N; c++) {
      let r = 0;
      while (r < N) {
        const t = typ[r * N + c];
        if (t < 0) { r++; continue; }
        let e = r + 1;
        while (e < N && typ[e * N + c] === t) e++;
        if (e - r >= MIN_MATCH) {
          const idxs = [];
          for (let k = r; k < e; k++) idxs.push(k * N + c);
          mark(idxs, e - r);
        }
        r = e;
      }
    }
    return bon;
  }

  function gravity(typ, val) {
    for (let c = 0; c < N; c++) {
      let w = N - 1;
      for (let r = N - 1; r >= 0; r--) {
        const i = r * N + c;
        if (typ[i] >= 0) {
          if (r !== w) {
            typ[w * N + c] = typ[i]; val[w * N + c] = val[i];
            typ[i] = -1; val[i] = 0;
          }
          w--;
        }
      }
    }
  }

  function shiftRight(typ, val) {
    for (let r = 0; r < N; r++) {
      let w = N - 1;
      for (let c = N - 1; c >= 0; c--) {
        const i = r * N + c;
        if (typ[i] >= 0) {
          if (c !== w) {
            typ[r * N + w] = typ[i]; val[r * N + w] = val[i];
            typ[i] = -1; val[i] = 0;
          }
          w--;
        }
      }
    }
  }

  // Полный разбор хода на копии поля: собирает совпадения, падение вниз,
  // сдвиг вправо, каскады. gains[вид] += номинал * бонус линии.
  // onyxTi (необязательно) — индекс обсидиана: тогда учитывается и взрыв обсидиана x5 (см. obsidianBurst),
  // чтобы ИИ видел этот эффект при оценке ходов.
  function resolve(typ, val, gains, onyxTi) {
    for (;;) {
      let bon = bonusMap(typ);
      if (bon && onyxTi !== undefined) bon = obsidianBurst(typ, bon, onyxTi, val);
      if (!bon) return gains;
      for (let i = 0; i < N * N; i++) {
        if (bon[i]) {
          gains[typ[i]] += val[i] * bon[i];
          if (bon[i] > 1) gains.extra = true;      // была линия из 4+ камней
          typ[i] = -1; val[i] = 0;
        }
      }
      gravity(typ, val);
      shiftRight(typ, val);
    }
  }

  // Все обмены соседних камней, после которых что-то собирается.
  function legalMoves(typ) {
    const moves = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const a = r * N + c;
        for (const b of [c + 1 < N ? a + 1 : -1, r + 1 < N ? a + N : -1]) {
          // Пропускаем: за краем поля, обе клетки пусты (typ[a]===typ[b]===-1) или одинаковые камни.
          // Если ровно одна клетка пуста — это законный ход: камень сдвигается в пустую соседнюю клетку.
          if (b < 0 || typ[a] === typ[b]) continue;
          [typ[a], typ[b]] = [typ[b], typ[a]];
          const ok = bonusMap(typ) !== null;
          [typ[a], typ[b]] = [typ[b], typ[a]];
          if (ok) moves.push({ a, b });
        }
      }
    }
    return moves;
  }

  const hasMoves = (typ) => legalMoves(typ).length > 0;

  // Прорицание: все обмены соседних камней, после которых собирается линия из 4+ (bonusFor(4) === 2,
  // а значит любая клетка с bon[i] >= 2 — часть такой линии). Возвращает те же { a, b }, что legalMoves,
  // только отфильтрованные до «длинных» ходов — подсказка для игрока, куда стоит ходить.
  function fourPlusMoves(typ) {
    const moves = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const a = r * N + c;
        for (const b of [c + 1 < N ? a + 1 : -1, r + 1 < N ? a + N : -1]) {
          if (b < 0 || typ[a] === typ[b]) continue;
          [typ[a], typ[b]] = [typ[b], typ[a]];
          const bon = bonusMap(typ);
          const ok = bon && (bon[a] >= 2 || bon[b] >= 2);
          [typ[a], typ[b]] = [typ[b], typ[a]];
          if (ok) moves.push({ a, b });
        }
      }
    }
    return moves;
  }

  // Прилив: все камни вида `from` становятся видом `to` (мутирует typ на месте). Возвращает, сколько
  // камней было превращено (0, если вида `from` на поле не было — вызывающий сам выбирает `from` среди
  // присутствующих цветов, см. game.js/castTide).
  function convertColor(typ, from, to) {
    let n = 0;
    for (let i = 0; i < typ.length; i++) if (typ[i] === from) { typ[i] = to; n++; }
    return n;
  }

  // Соберёт ли камень вида ti в клетке idx готовую линию из 3 (с уже стоящими камнями).
  function makesLine(typ, idx, ti) {
    const r = Math.floor(idx / N), c = idx % N;
    const at = (rr, cc) => (rr >= 0 && cc >= 0 && rr < N && cc < N ? typ[rr * N + cc] : -2);
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      for (let start = -2; start <= 0; start++) {
        let ok = true;
        for (let k = 0; k < 3; k++) {
          const rr = r + dr * (start + k), cc = c + dc * (start + k);
          if (!(rr === r && cc === c) && at(rr, cc) !== ti) { ok = false; break; }
        }
        if (ok) return true;
      }
    }
    return false;
  }

  // Номинал нового камня: x5, x3 или x1 (chance = { x5, x3 }).
  const randomValue = (rand, chance) => { const x = rand(); return x < chance.x5 ? 5 : x < chance.x5 + chance.x3 ? 3 : 1; };

  // Заполняет пустые клетки новыми камнями так, чтобы не было готовых линий и оставался ход.
  // Если оставшимися камнями этого не добиться — поле пересобирается целиком (rebuilt: true).
  // Возвращает { cells, rebuilt } — индексы заполненных клеток.
  function fillEmpty(typ, val, rand, chance, kinds = 4) {
    const tryFill = (cells) => {
      for (let attempt = 0; attempt < 300; attempt++) {
        for (const i of cells) { typ[i] = -1; val[i] = 0; }
        for (const i of cells) {
          const allowed = [];
          for (let t = 0; t < kinds; t++) if (!makesLine(typ, i, t)) allowed.push(t);
          typ[i] = allowed.length ? allowed[Math.floor(rand() * allowed.length)] : Math.floor(rand() * kinds);
          val[i] = randomValue(rand, chance);
        }
        if (!bonusMap(typ) && hasMoves(typ)) return true;
      }
      return false;
    };
    const empty = [];
    for (let i = 0; i < N * N; i++) if (typ[i] < 0) empty.push(i);
    if (empty.length && tryFill(empty)) return { cells: empty, rebuilt: false };
    const all = [];
    for (let i = 0; i < N * N; i++) { typ[i] = -1; val[i] = 0; all.push(i); }
    tryFill(all);
    return { cells: all, rebuilt: true };
  }

  // Обсидиан x5 — это КАМЕНЬ обсидиана с номиналом x5 (val[i] === 5), а не линия из пяти обсидианов
  // (уточнено пользователем 01.10.2026: «если при складывании используется обсидиан x5»). Если такой камень
  // собран в любую линию (bon[i] > 0), то сразу, в этом же проходе сбора, с поля исчезают все камни вокруг
  // него на расстоянии 1 (до 8 клеток, включая диагонали) — как будто их собрали в ряд. Только после этого
  // идёт падение/сдвиг оставшихся камней (это делает вызывающий код).
  // Взорванные клетки помечаются бонусом 1: ресурсы за них начисляются всегда, урон — только если сосед сам
  // обсидиан (или активна Магия) — см. resolveBoard в js/game.js.
  // Цепная реакция: если среди взорванных соседей есть ещё один обсидиан x5, он тоже взрывается.
  // Возвращает bon без изменений (тот же объект), если взрываться нечему.
  function obsidianBurst(typ, bon, onyxTi, val) {
    if (!bon || !val) return bon;
    let out = null;
    const queue = [];
    for (let i = 0; i < N * N; i++) if (bon[i] && typ[i] === onyxTi && val[i] === 5) queue.push(i);
    const done = new Set();
    while (queue.length) {
      const i = queue.shift();
      if (done.has(i)) continue;
      done.add(i);
      const r = Math.floor(i / N), c = i % N;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
          const j = rr * N + cc;
          if (typ[j] < 0) continue;                       // пустая клетка — взрывать нечего
          const cur = out ? out[j] : bon[j];
          if (!cur) {
            if (!out) out = Int8Array.from(bon);
            out[j] = 1;
            if (typ[j] === onyxTi && val[j] === 5) queue.push(j);   // цепная реакция
          }
        }
      }
    }
    return out || bon;
  }

  /* Клетки Огненного креста: строка и столбец клетки (r0, c0), но только внутри области (2·radius+1)²
     с центром в (r0, c0) — у края поля область меньше (естественно обрезается границей поля).
     radius=2 → область 5x5 (максимум 9 клеток: 5 по строке + 5 по столбцу − 1 общий центр).
     Возвращает массив [r, c] (без учёта того, есть ли там камень — проверяет вызывающий). */
  function fireCross(r0, c0, radius, n = N) {
    const cells = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (r !== r0 && c !== c0) continue;
        if (Math.abs(r - r0) > radius || Math.abs(c - c0) > radius) continue;
        cells.push([r, c]);
      }
    }
    return cells;
  }

  /* Кулак ярости: какой тип камня «господствует» на поле по сумме НОМИНАЛОВ (x3/x5 считаются как 3/5).
     typ — типы клеток (-1 — пусто), val — номиналы. typeValueSums → массив сумм номиналов по индексу типа;
     dominantType → индекс типа, чья сумма СТРОГО больше суммы любого другого, или -1 (ничья / пустое поле). */
  function typeValueSums(typ, val) {
    const sums = [];
    for (let i = 0; i < typ.length; i++) {
      const t = typ[i];
      if (t < 0) continue;
      sums[t] = (sums[t] || 0) + (val[i] || 0);
    }
    for (let t = 0; t < sums.length; t++) sums[t] = sums[t] || 0;
    return sums;
  }
  function dominantType(typ, val) {
    const sums = typeValueSums(typ, val);
    let best = -1, bestV = 0, tie = false;
    for (let t = 0; t < sums.length; t++) {
      if (sums[t] > bestV) { best = t; bestV = sums[t]; tie = false; }
      else if (sums[t] === bestV && bestV > 0) tie = true;
    }
    return tie ? -1 : best;
  }

  return { N, bonusFor, bonusMap, gravity, shiftRight, resolve, legalMoves, hasMoves, fourPlusMoves, convertColor, makesLine, randomValue, fillEmpty, obsidianBurst, fireCross, typeValueSums, dominantType };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Engine;
