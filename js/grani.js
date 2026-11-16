/* «Грани» (2.4.0): рейтинг игроков для боёв на арене с живыми соперниками (как Эло в шахматах).
   Чистые функции, без интерфейса и сервера: сервер и клиент считают одним и тем же кодом.
   Правила:
   — старт 1000 Граней; ожидаемый шанс победы — логистическая кривая с масштабом 400 (+200 Граней ≈ 3 боя из 4);
   — первые 10 боёв шаг до ±40 (K=40), потом до ±20 (K=20); ничья считается половиной победы;
   — Грани не уходят ниже 0; потеря за бой не больше 30, за сутки не больше 100;
   — выход по связи в первые 30 с без хода не наказывается;
   — подбор: Сила соперника в пределах ±15%, внутри — ближайший по Граням; одного соперника не чаще 3 раз в сутки;
   — Грани — один показатель игрока, при росте уровня не меняются; соперников подбирает Сила (±15%), а не лига;
   — Грани не дают Силы: награды косметические (рамка, титул, питомец, значок). Бои с ботами и обучение Граней не меняют. */
const Grani = (() => {
  const START = 1000, SCALE = 400, K_NEW = 40, K_NORMAL = 20, NEW_FIGHTS = 10;
  const LOSS_CAP = 30, DAY_LOSS_CAP = 100, SAME_PER_DAY = 3, POWER_BAND = 0.15, EARLY_DROP_SEC = 30;
  const RANK_FROM = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600];   // порог Граней для рангов арены 0…9

  const fresh = () => ({ g: START, fights: 0, dayLoss: 0, day: '', met: {} });
  const expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / SCALE));
  const kOf = (fights) => (fights < NEW_FIGHTS ? K_NEW : K_NORMAL);
  const rankOf = (g) => { let r = 0; for (let i = 0; i < RANK_FROM.length; i++) if (g >= RANK_FROM[i]) r = i; return r; };

  // Изменение Граней игрока p (его состояние) против соперника с Гранями opp. outcome: 1 победа, 0.5 ничья, 0 поражение.
  // opts: { rated = true, dropEarly = false, day = 'ГГГГ-ММ-ДД' }. Возвращает изменение; состояние p обновляется.
  function apply(p, opp, outcome, opts = {}) {
    if (opts.rated === false || opts.dropEarly) return 0;
    const day = opts.day || '';
    if (p.day !== day) { p.day = day; p.dayLoss = 0; p.met = {}; }
    let d = Math.round(kOf(p.fights) * (outcome - expected(p.g, opp)));
    if (d < 0) d = -Math.min(-d, LOSS_CAP, Math.max(0, DAY_LOSS_CAP - p.dayLoss), p.g);
    if (d < 0) p.dayLoss += -d;
    p.g = Math.max(0, p.g + d); p.fights++;
    return d;
  }
  // Результат боя двух игроков сразу: [изменение a, изменение b]. outcome — для a.
  function pair(a, b, outcome, opts = {}) {
    const ga = a.g, gb = b.g, snapA = { ...a }, snapB = { ...b };
    const da = apply(a, gb, outcome, opts);
    const db = apply(b, ga, 1 - outcome, opts);
    return [da, db, snapA, snapB];
  }
  function sameOpponentOk(p, opponentId, day) { return !(p.day === day && (p.met[opponentId] || 0) >= SAME_PER_DAY); }
  function noteOpponent(p, opponentId, day) { if (p.day !== day) { p.day = day; p.dayLoss = 0; p.met = {}; } p.met[opponentId] = (p.met[opponentId] || 0) + 1; }
  // Подбор: из кандидатов [{ id, g, power }] — Сила в пределах ±15% от моей, ближайший по Граням; null, если никого.
  function pickOpponent(me, candidates, day = '') {
    let best = null, bd = Infinity;
    for (const c of candidates) {
      if (c.id === me.id || !sameOpponentOk(me.state || me, c.id, day)) continue;
      if (Math.abs(c.power - me.power) > POWER_BAND * me.power) continue;
      const d = Math.abs(c.g - me.g);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  return { START, SCALE, K_NEW, K_NORMAL, NEW_FIGHTS, LOSS_CAP, DAY_LOSS_CAP, SAME_PER_DAY, POWER_BAND, EARLY_DROP_SEC, RANK_FROM,
    fresh, expected, kOf, rankOf, apply, pair, sameOpponentOk, noteOpponent, pickOpponent };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Grani;
