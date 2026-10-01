/* Противник. Сила зависит от уровня 1..100:
   - глубина просчёта: сколько ходов вперёд (свой, ответ игрока, ...) — от 1 до 4;
   - ширина просчёта: сколько лучших вариантов на каждом шаге разбирается глубже;
   - точность выбора: на низких уровнях противник часто выбирает не лучший ход;
   - дополнительный ход: линия из 4+ камней ценится, а после неё тот же игрок ходит снова;
   - Магия (Шаровая молния, Огненный крест, Целебный дождь, Хаос, Превращение): чем выше уровень, тем лучше он замечает,
     когда её выгодно применить.

   Режимы оценки хода:
   NORMAL — урон наносит только обсидиан;
   MAGIC  — урон наносят камни любого цвета (номинал x бонус линии). */

const AI = (() => {
  const NORMAL = { w: [0.3, 0.3, 0.3, 3], dmg: (g) => g[3] };
  const MAGIC  = { w: [3, 3, 3, 3],       dmg: (g) => g[0] + g[1] + g[2] + g[3] };
  const ONYX = 3;                    // индекс обсидиана в GEM_TYPES
  const WIN = 100000;
  const TIME_BUDGET_MS = 1200;
  const EXTRA_VALUE = 4;             // цена дополнительного хода (линия из 4+ камней)
  const MAGIC_MARGIN = 6;            // насколько Магия должна быть лучше обычного хода

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function settings(level) {
    level = clamp(Math.round(level) || 1, 1, 100);
    return {
      level,
      maxDepth: Math.min(4, 1 + Math.floor((level - 1) / 25)),        // 1..4
      rootBeam: 6 + Math.floor(level / 10),                            // 6..16
      beams: [
        4 + Math.floor(level / 34),                                    // 4..6
        3 + Math.floor(level / 50),                                    // 3..5
        3,
      ],
    };
  }

  const score = (g, mode) => g[0] * mode.w[0] + g[1] * mode.w[1] + g[2] * mode.w[2] + g[3] * mode.w[3];

  function expand(typ, val, moves, mode = NORMAL) {
    return moves.map((m) => {
      const t = typ.slice(), v = val.slice();
      [t[m.a], t[m.b]] = [t[m.b], t[m.a]];
      [v[m.a], v[m.b]] = [v[m.b], v[m.a]];
      const g = [0, 0, 0, 0];
      Engine.resolve(t, v, g, ONYX);
      return { m, t, v, dmg: mode.dmg(g), s: score(g, mode) + (g.extra ? EXTRA_VALUE : 0), extra: !!g.extra };
    });
  }

  // Продолжение после хода c: при дополнительном ходе снова ходит тот же игрок (+),
  // иначе отвечает соперник (−).
  function follow(c, depth, hpMe, hpOpp, ply, cfg, deadline) {
    if (c.extra) return c.s + negamax(c.t, c.v, depth, hpMe, hpOpp - c.dmg, ply, cfg, deadline);
    return c.s - negamax(c.t, c.v, depth, hpOpp - c.dmg, hpMe, ply, cfg, deadline);
  }

  // Лучший результат для того, кто ходит: (его выигрыш) − (лучший ответ соперника).
  function negamax(typ, val, depth, hpMe, hpOpp, ply, cfg, deadline) {
    if (depth === 0) return 0;
    if (performance.now() > deadline) throw new Error('timeout');
    const moves = Engine.legalMoves(typ);
    if (!moves.length) return 0;

    let cand = expand(typ, val, moves).sort((x, y) => y.s - x.s);
    cand = cand.slice(0, cfg.beams[Math.min(ply, cfg.beams.length - 1)]);

    let best = -Infinity;
    for (const c of cand) {
      let v;
      if (c.dmg >= hpOpp) v = WIN + c.s;
      else v = follow(c, depth - 1, hpMe, hpOpp, ply + 1, cfg, deadline);
      if (v > best) best = v;
    }
    return best;
  }

  let rootFilter = null;             // скованные клетки: такие обмены противнику сейчас недоступны

  function rankRoot(typ, val, hpMe, hpOpp, depth, cfg, deadline, mode) {
    let moves = Engine.legalMoves(typ);
    if (rootFilter) moves = moves.filter((m) => !rootFilter.has(m.a) && !rootFilter.has(m.b));
    let cand = expand(typ, val, moves, mode).sort((x, y) => y.s - x.s);
    if (depth > 1) cand = cand.slice(0, cfg.rootBeam);
    return cand
      .map((c) => {
        let v;
        if (c.dmg >= hpOpp) v = WIN + c.s;
        else if (depth === 1) v = c.s;
        else v = follow(c, depth - 1, hpMe, hpOpp, 1, cfg, deadline);
        return { m: c.m, v };
      })
      .sort((x, y) => y.v - x.v);
  }

  // Итеративное углубление: берём результат самой глубокой полностью посчитанной глубины.
  function search(typ, val, hpMe, hpOpp, cfg, mode, budgetMs) {
    const deadline = performance.now() + budgetMs;
    let ranked = null;
    for (let d = 1; d <= cfg.maxDepth; d++) {
      try {
        ranked = rankRoot(typ, val, hpMe, hpOpp, d, cfg, deadline, mode);
      } catch (e) {
        break;
      }
    }
    return ranked;
  }


  // Огненный крест: сжигает строку и столбец клетки idx, затем падение, сдвиг и каскады.
  // Урон = сумма номиналов сожжённых камней + урон от онкса в каскаде.
  function burnSim(typ, val, idx) {
    const r0 = Math.floor(idx / Engine.N), c0 = idx % Engine.N;
    const t = typ.slice(), v = val.slice();
    let burn = 0;
    for (let i = 0; i < t.length; i++) {
      if ((Math.floor(i / Engine.N) === r0 || i % Engine.N === c0) && t[i] >= 0) {
        burn += v[i]; t[i] = -1; v[i] = 0;
      }
    }
    Engine.gravity(t, v);
    Engine.shiftRight(t, v);
    const g = [0, 0, 0, 0];
    Engine.resolve(t, v, g, ONYX);
    return { t, v, dmg: burn + g[3], s: burn * NORMAL.w[3] + score(g, NORMAL) + (g.extra ? EXTRA_VALUE : 0), extra: !!g.extra };
  }

  // Превращение: выбранный камень и все камни его цвета в области 3x3 становятся обсидианом.
  function transmuteSim(typ, val, idx) {
    const ct = typ[idx];
    if (ct < 0 || ct === ONYX) return null;
    const r0 = Math.floor(idx / Engine.N), c0 = idx % Engine.N;
    const t = typ.slice(), v = val.slice();
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || c < 0 || r >= Engine.N || c >= Engine.N) continue;
        if (t[r * Engine.N + c] === ct) { t[r * Engine.N + c] = ONYX; n++; }
      }
    }
    const g = [0, 0, 0, 0];
    Engine.resolve(t, v, g, ONYX);
    return { t, v, dmg: g[3], s: n * NORMAL.w[3] * 0.4 + score(g, NORMAL) + (g.extra ? EXTRA_VALUE : 0), extra: !!g.extra };
  }

  // Лучшая клетка для заклинания с выбором центра (sim — Огненный крест или Превращение).
  function cellBest(sim, typ, val, hpMe, hpOpp, cfg, deadline) {
    let cand = [];
    for (let idx = 0; idx < typ.length; idx++) {
      const r = sim(typ, val, idx);
      if (r) cand.push({ idx, ...r });
    }
    cand.sort((x, y) => y.s - x.s);
    cand = cand.slice(0, 4);
    let best = null;
    try {
      for (const c of cand) {
        let v;
        if (c.dmg >= hpOpp) v = WIN + c.s;
        else if (cfg.maxDepth === 1) v = c.s;
        else v = follow(c, cfg.maxDepth - 1, hpMe, hpOpp, 1, cfg, deadline);
        if (!best || v > best.v) best = { idx: c.idx, v };
      }
    } catch (e) { /* не хватило времени */ }
    return best;
  }

  // Выбор действия. Возвращает одно из:
  //   { kind: 'move' | 'lightning', a, b }    — обмен камней (под Шаровой молнией или без)
  //   { kind: 'fire' | 'transmute', idx }     — заклинание с центром в клетке idx
  //   { kind: 'heal' } | { kind: 'chaos' }    — лечение / перемешивание поля
  // или null, если ходов нет. afford — { lightning, fire, transmute, heal, chaos }: хватает ли камней на
  // каждое заклинание отдельно (у каждого своя цена, см. Balance.magic.costs); true/false вместо объекта
  // тоже допустимо (совместимость) — означает «хватает на всё»/«ни на что».
  // ctx.maxMe — максимум ХП противника (для решения о лечении).
  function choose(typ, val, hpMe, hpOpp, level, afford = {}, ctx = {}) {
    const A = typeof afford === 'boolean' ? { lightning: afford, fire: afford, transmute: afford, heal: afford, chaos: afford } : afford;
    const cfg = settings(level);
    rootFilter = ctx.locked && ctx.locked.length ? new Set(ctx.locked) : null;
    const canMagic = A.lightning || A.fire || A.transmute || A.heal || A.chaos;
    const considerMagic = canMagic && Math.random() < 0.3 + 0.7 * cfg.level / 100;
    const budget = considerMagic ? TIME_BUDGET_MS / 5 : TIME_BUDGET_MS;

    let ranked = search(typ, val, hpMe, hpOpp, cfg, NORMAL, budget);
    let kind = 'move';
    let best = ranked && ranked.length ? ranked[0].v : -Infinity;
    let spell = null;
    const bestNormal = best;

    if (considerMagic) {
      const offer = (sp, v) => { if (v > best + MAGIC_MARGIN) { best = v; spell = sp; } };

      if (A.lightning) {
        const rm = search(typ, val, hpMe, hpOpp, cfg, MAGIC, budget);
        if (rm && rm.length && rm[0].v > best + MAGIC_MARGIN) {
          ranked = rm; kind = 'lightning'; best = rm[0].v;
        }
      }
      if (A.fire) {
        const fb = cellBest(burnSim, typ, val, hpMe, hpOpp, cfg, performance.now() + budget);
        if (fb) offer({ kind: 'fire', idx: fb.idx }, fb.v);
      }
      if (A.transmute) {
        const tb = cellBest(transmuteSim, typ, val, hpMe, hpOpp, cfg, performance.now() + budget);
        if (tb) offer({ kind: 'transmute', idx: tb.idx }, tb.v);
      }

      // Целебный дождь: лечит на сумму номиналов сапфиров, рубинов и изумрудов на поле.
      // ctx.healMult переводит номиналы в те же единицы, что и hpMe (см. Combat.aiView).
      if (A.heal && ctx.maxMe) {
        let sum = 0;
        for (let i = 0; i < typ.length; i++) if (typ[i] >= 0 && typ[i] !== ONYX) sum += val[i];
        const healed = Math.min(sum * (ctx.healMult || 1), ctx.maxMe - hpMe);
        if (healed >= Math.max(3, ctx.maxMe * 0.08) && hpMe <= ctx.maxMe * 0.6) {
          let v = healed * 2;
          if (cfg.maxDepth > 1) {
            try {
              v -= negamax(typ, val, cfg.maxDepth - 1, hpOpp, hpMe + healed, 1, cfg, performance.now() + budget);
            } catch (e) { /* не хватило времени */ }
          }
          offer({ kind: 'heal' }, v);
        }
      }
      // Хаос: когда хороших ходов нет, перемешать поле.
      if (A.chaos && !spell && bestNormal < 2 && Math.random() < 0.6) spell = { kind: 'chaos' };
    }
    if (spell) return spell;
    if (!ranked || !ranked.length) return null;

    // Точность: чем ниже уровень, тем больше вариантов «в игре».
    const mistakes = Math.pow((100 - cfg.level) / 100, 2);
    const pool = Math.max(1, Math.round(1 + (ranked.length - 1) * mistakes));
    const pick = ranked[Math.floor(Math.random() * pool)].m;
    return { kind, a: pick.a, b: pick.b };
  }

  return { choose, settings };
})();

// Для симулятора и тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = AI;
