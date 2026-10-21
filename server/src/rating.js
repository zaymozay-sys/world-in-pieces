// Рейтинг Эло для живых боёв. Чистые функции: хранилища (память и PG) берут расчёт отсюда.
const PAID_DAILY = 10, VOUCHER_KEEP_MS = 14 * 86400000;   // 10 боёв в сутки с монетами — как в игре (World.ARENA_DAILY)
const START = 1000, K = 32, PAIR_DAILY = 3, MIN_MS = 12000;   // бой короче 12 секунд не бой: людям на настоящую партию нужно больше времени
const PERIODS = { week: 7 * 86400000, month: 30 * 86400000, year: 365 * 86400000 };
const expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));
// ra, rb — рейтинги до боя; aWon — победил ли первый. Возвращает изменения для обоих.
const change = (ra, rb, aWon, k = K) => {
  const da = Math.round(k * ((aWon ? 1 : 0) - expected(ra, rb)));
  return { a: da, b: -da };
};
// Считается ли бой в рейтинг: итог согласован или решён сервером (сдача/пропуски) и бой действительно состоялся.
// Признаки настоящей партии, не зависящие от «числа ходов» (честная быстрая победа сильного героя может уложиться в пару ходов):
//  — прошло не меньше MIN_MS по часам сервера;
//  — победитель сам делал ходы; в сыгранном бою и при сдаче ходил и проигравший (иначе это «победа» над не игравшим);
//  — при пропусках хода достаточно, чтобы ходил победитель (проигравший мог просто уйти).
// Сервер бой не считает, поэтому сговор с выдуманными ходами это не исключает; полная защита — повтор партии на сервере.
const counts = (e) => {
  if (!e || (e.winner !== 'A' && e.winner !== 'B') || !['played', 'forfeit', 'timeouts'].includes(e.reason) || (e.meta && e.meta.tourney)) return false;
  if (!(e.ms >= MIN_MS)) return false;
  const win = e.winner === 'A' ? e.actsA : e.actsB, lose = e.winner === 'A' ? e.actsB : e.actsA;
  if (!(win >= 1)) return false;
  return e.reason === 'timeouts' || lose >= 1;
};
// Хук для итога боя: пишет рейтинг в хранилище; сбой хранилища бой не ломает
const hook = (store, now = Date.now, notify = () => {}) => (e) => {
  if (!counts(e)) return;
  const nick = (v) => String(v || 'Игрок').slice(0, 24), at = now();
  Promise.all([store.isFlagged(e.A, at), store.isFlagged(e.B, at)]).then(([fa, fb]) => (fa || fb ? null : store.recordMatch({ a: { pid: e.A, nick: nick(e.nickA) }, b: { pid: e.B, nick: nick(e.nickB) }, winner: e.winner, at })))
    .then(async (r) => {
      if (!r) return;
      const lv = (x) => Math.max(1, Math.min(100, Math.round(Number(x)) || 1));
      const ids = await Promise.all([
        store.addVoucher(e.A, { at, win: e.winner === 'A', level: lv(e.levelA) }),
        store.addVoucher(e.B, { at, win: e.winner === 'B', level: lv(e.levelB) }),
      ]);
      try { notify(e.A, { t: 'rating', elo: r.a.elo, delta: r.a.delta, voucher: !!ids[0] }); notify(e.B, { t: 'rating', elo: r.b.elo, delta: r.b.delta, voucher: !!ids[1] }); } catch (x) { /* игрок мог уйти */ }
    }).catch(() => {});
};
// Календарные периоды (UTC): неделя с понедельника, месяц с 1-го числа. previous — последний закончившийся.
const DAYMS = 86400000, TOP = 3, MIN_GAMES = 3;
const periodAt = (kind, t) => {
  const d = new Date(t);
  if (kind === 'month') { const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), b = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); return { kind, id: 'm-' + new Date(a).toISOString().slice(0, 7), start: a, end: b }; }
  const day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), a = day0 - ((d.getUTCDay() + 6) % 7) * DAYMS;
  return { kind: 'week', id: 'w-' + new Date(a).toISOString().slice(0, 10), start: a, end: a + 7 * DAYMS };
};
const previous = (kind, now) => periodAt(kind, periodAt(kind, now).start - 1);
module.exports = { PAID_DAILY, VOUCHER_KEEP_MS, hook, periodAt, previous, TOP, MIN_GAMES, START, K, PAIR_DAILY, MIN_MS, PERIODS, expected, change, counts };
