const assert = require('assert');
global._t = (s, a) => (a ? s.replace(/\{(\d+)\}/g, (_, i) => a[i]) : s);
const L = require('../js/lhgames.js');
const D = '2026-10-18';
// профиль
let s = L.clean(null);
assert.deepStrictEqual(s, { tokens: 0, day: '', plays: { av: 0, py: 0 }, best: { av: 0, py: 0 }, tickets: 0, bought: {}, rounds: 0, spent: 0 });
for (let i = 0; i < L.DAILY_PLAYS; i++) assert.ok(L.begin(s, 'av', D));
assert.ok(!L.begin(s, 'av', D), 'лимит суток');
assert.ok(L.begin(s, 'py', D), 'у каждой игры свой лимит');
assert.strictEqual(L.left(s, 'av', '2026-10-19'), L.DAILY_PLAYS, 'новые сутки');
s.day = D; s.tickets = 1; s.plays.av = 3; assert.ok(L.begin(s, 'av', D) && s.tickets === 0, 'билет даёт раунд');
assert.strictEqual(L.tokensFor('av', 0), 0); assert.strictEqual(L.tokensFor('av', 225), 5); assert.strictEqual(L.tokensFor('py', 18), 3);
const f = L.finish(s, 'py', 24); assert.ok(f.record && f.tokens === 4 && s.tokens === 4 && s.best.py === 24);
assert.ok(!L.finish(s, 'py', 10).record, 'рекорд не понижается');
assert.deepStrictEqual(L.clean({ tokens: -3, bought: { lamp: 1, hack: 1 }, tickets: 99 }).bought, { lamp: true });
assert.strictEqual(L.clean({ tickets: 99 }).tickets, 20);
// лавка
s.tokens = 10; assert.ok(L.buy(s, 'lamp').ok && s.tokens === 2 && s.bought.lamp);
assert.strictEqual(L.buy(s, 'lamp').why, 'have'); assert.strictEqual(L.buy(s, 'pearl').why, 'poor');
assert.ok(L.buy(s, 'ticket').ok && s.tickets === 1 && s.tokens === 0); assert.strictEqual(L.buy(s, 'nope').why, 'none');
assert.strictEqual(L.badges(s).length, 1);
// «Обвал»: запас конечен, поле без готовых линий, игра заканчивается
for (let seed = 1; seed <= 30; seed++) {
  const g = L.avNew(seed);
  assert.strictEqual(g.reserve.length, L.AV_RESERVE); assert.ok(g.typ.every((t) => t >= 0 && t < 4));
  let n = 0; while (!g.done && n++ < 500) { const mv = L.avMoves(g); if (!mv.length) break; const m = mv[0]; const r = L.avMove(g, m.a, m.b); assert.ok(r.ok); }
  assert.ok(g.done || n < 500, 'игра конечна');
  const stones = g.typ.reduce((k, t) => k + (t >= 0), 0);
  assert.ok(g.cleared + stones + g.reserve.length === 36 + L.AV_RESERVE, 'камни не теряются и не появляются: ' + seed);
  assert.ok(g.score >= g.cleared, 'очки не меньше числа убранных');
}
{ const g = L.avNew(5); const before = g.score; assert.ok(!L.avMove(g, 0, 0).ok); assert.ok(!L.avMove(g, 0, 8).ok, 'не соседние'); assert.strictEqual(g.score, before); }
// особые камни появляются
{ let found = false; for (let seed = 1; seed < 60 && !found; seed++) { const g = L.avNew(seed); let n = 0; while (!g.done && n++ < 200) { const mv = L.avMoves(g); if (!mv.length) break; const m = mv[n % mv.length]; L.avMove(g, m.a, m.b); if (g.sp.some((x) => x)) { found = true; break; } } } assert.ok(found, 'линия из 4+ делает особый камень'); }
// «Пирамида»
const p = L.pyNew(9);
assert.strictEqual(p.typ.filter((t) => t >= 0).length, 24); assert.deepStrictEqual(p.balls, [1, 2, 3]);
assert.ok(!L.pyThrow(p, 9, 'L', 1).ok); assert.ok(!L.pyThrow(p, 0, 'X', 1).ok); assert.ok(!L.pyThrow(p, 0, 'L', 5).ok, 'нет такого шара');
const h = L.pyThrow(p, 0, 'L', 3); assert.ok(h.ok && h.hit.length === 3 && p.balls.length === 2);
assert.ok(!L.pyThrow(p, 0, 'L', 3).ok, 'шар один раз');
L.pyThrow(p, 5, 'L', 2); L.pyThrow(p, 3, 'R', 1); assert.ok(p.done, 'три шара — конец');
{ const q = L.pyNew(4); for (let r = 0; r < 6; r++) { L.pyThrow(q, r, 'L', q.balls[0] || 1); if (q.done) break; } assert.ok(q.done); }
assert.ok(L.pyThrow(L.pyNew(1), 5, 'L', 1).ok, 'бросок мимо допустим');
console.log('lhgames: все тесты пройдены');
