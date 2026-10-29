const assert = require('assert');
global._t = (s, a) => (a ? s.replace(/\{(\d+)\}/g, (_, i) => a[i]) : s);
const L = require('../js/lhgames.js');
const D = '2026-10-18';
// профиль
let s = L.clean(null);
assert.deepStrictEqual(s, { tokens: 0, day: '', plays: { av: 0, mr: 0, td: 0, rp: 0, dg: 0 }, best: { av: 0, mr: 0, td: 0, rp: 0, dg: 0 }, tickets: 0, bought: {}, rounds: 0, spent: 0 });
for (let i = 0; i < L.DAILY_PLAYS; i++) assert.ok(L.begin(s, 'av', D));
assert.ok(!L.begin(s, 'av', D), 'лимит суток');
assert.ok(L.begin(s, 'dg', D), 'у каждой игры свой лимит');
assert.strictEqual(L.left(s, 'av', '2026-10-19'), L.DAILY_PLAYS, 'новые сутки');
s.day = D; s.tickets = 1; s.plays.av = 3; assert.ok(L.begin(s, 'av', D) && s.tickets === 0, 'билет даёт раунд');
assert.strictEqual(L.tokensFor('av', 0), 0); assert.strictEqual(L.tokensFor('av', 225), 5); assert.strictEqual(L.tokensFor('dg', 50), 3);
const f = L.finish(s, 'dg', 65); assert.ok(f.record && f.tokens === 4 && s.tokens === 4 && s.best.dg === 65);
assert.ok(!L.finish(s, 'dg', 10).record, 'рекорд не понижается');
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
// «Зеркала маяка»
for (let k = 1; k <= 60; k++) { const g = L.mrNew(k); assert.ok(!L.mrSolved(g.puz), 'поле начинается нерешённым'); }
{ const g = L.mrNew(3); assert.ok(!L.mrTap(g, -1).ok); const i0 = g.puz.mir.findIndex((v) => v === 0); assert.ok(!L.mrTap(g, i0).ok, 'пустая клетка'); const m = g.puz.mir.findIndex((v) => v); const v = g.puz.mir[m]; L.mrTap(g, m); assert.strictEqual(g.puz.mir[m], 3 - v); L.mrTap(g, m); assert.strictEqual(g.puz.mir[m], v, 'второе нажатие возвращает'); }
{ let all = true;
  for (let k = 1; k <= 20; k++) {
    const g = L.mrNew(k); let guard = 0;
    while (!g.done && guard++ < 10) {
      const ms = []; g.puz.mir.forEach((v, i) => v && ms.push(i)); let found = null;
      for (let mask = 1; mask < (1 << ms.length) && !found; mask++) { const c = { ...g.puz, mir: Int8Array.from(g.puz.mir) }; ms.forEach((m, j) => { if (mask >> j & 1) c.mir[m] = 3 - c.mir[m]; }); if (L.mrSolved(c)) found = ms.filter((m, j) => mask >> j & 1); }
      if (!found) { all = false; break; }
      found.forEach((m) => L.mrTap(g, m));
    }
    all = all && g.done && g.solved === L.MR_BOARDS;
  }
  assert.ok(all, 'любое поле решаемо, раунд заканчивается'); }
// «Прилив»
for (let k = 1; k <= 40; k++) { const g = L.tdNew(k); assert.ok(L.tdMovesList(g.typ, 6).length > 0); }
{ const g = L.tdNew(5); const m = L.tdMovesList(g.typ, 6)[0]; assert.ok(!L.tdMove(g, m.a, m.a).ok); assert.ok(L.tdMove(g, m.a, m.b).ok && g.score >= 3 && g.moves === 1); }
{ const g = L.tdNew(8); let n = 0; while (!g.done && n++ < 200) { const ms = L.tdMovesList(g.typ, 6 - g.water); if (!ms.length) break; L.tdMove(g, ms[0].a, ms[0].b); } assert.ok(g.done && g.moves <= L.TD_MOVES && g.water <= L.TD_MAX, 'раунд конечен'); }
// «Канаты»
for (let k = 1; k <= 30; k++) {
  const g = L.rpNew(k); let p = 0; assert.strictEqual(g.lens.reduce((a, b) => a + b, 0), 36);
  for (const len of g.lens) { for (const c of g.solution.slice(p, p + len)) L.rpTap(g, c); p += len; }
  assert.ok(g.done && g.score === 50, 'полное решение: ' + g.score);
}
{ const g = L.rpNew(2); L.rpTap(g, g.ends[0].a); assert.ok(g.paths[0].length === 1); L.rpReset(g); assert.ok(g.paths.every((x) => !x.length)); assert.ok(!L.rpTap(g, 99).ok); }
// «Кладоискатель»
{ const g = L.dgNew(4); assert.strictEqual(g.kind.filter((v) => v === 1).length, L.DG_TREAS); assert.strictEqual(g.kind.filter((v) => v === 2).length, L.DG_TRAPS);
  const t = g.kind.findIndex((v) => v === 1); assert.ok(L.dgDig(g, t).ok && g.found === 1); assert.ok(!L.dgDig(g, t).ok, 'дважды нельзя');
  const x = g.kind.findIndex((v) => v === 2); const d0 = g.digs; L.dgDig(g, x); assert.strictEqual(d0 - g.digs, 3, 'трещина: попытка + 2');
  const all = L.dgNew(6); all.kind.forEach((v, i) => { if (v === 1) L.dgDig(all, i); }); assert.ok(all.done && all.score >= 80, 'все самоцветы'); }
console.log('lhgames: все тесты пройдены');
