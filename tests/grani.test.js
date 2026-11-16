// «Грани» (2.4.0): рейтинг арены. Запуск: node tests/grani.test.js
const assert = require('assert');
const G = require('../js/grani.js');
// +200 Граней ≈ 3 боя из 4
assert.ok(Math.abs(G.expected(1200, 1000) - 0.76) < 0.01, 'ожидание при +200');
assert.strictEqual(G.expected(1000, 1000), 0.5);
// первые бои — шаг 40, потом 20
const a = G.fresh(), b = G.fresh();
assert.strictEqual(G.apply(a, b.g, 1), 20, 'победа над равным в первых боях: +20 (K=40, ожидание 0,5)');
const old = G.fresh(); old.fights = 20;
assert.strictEqual(G.apply(old, 1000, 1), 10, 'потом +10 при K=20');
// ничья между равными ничего не меняет
const x = G.fresh(), y = G.fresh(); assert.strictEqual(G.apply(x, y.g, 0.5), 0);
// победа над сильным даёт больше, чем над слабым
const m1 = G.fresh(), m2 = G.fresh(); const up = G.apply(m1, 1400, 1), down = G.apply(m2, 600, 1); assert.ok(up > down, 'над сильным больше');
// парный бой: сумма изменений равна нулю
{ const p = G.fresh(), q = G.fresh(); q.g = 1100; const [da, db] = G.pair(p, q, 1); assert.ok(Math.abs(da + db) <= 1, 'сумма ≈ 0: ' + da + ' ' + db); }
// не ниже нуля, потеря за бой не больше 30, за сутки не больше 100
{ const p = G.fresh(); p.fights = 50; p.g = 5; G.apply(p, 5, 0); assert.strictEqual(p.g, 0, 'ниже нуля не уходит'); }
{ const p = G.fresh(); p.fights = 50; let sum = 0; for (let i = 0; i < 20; i++) sum += G.apply(p, 3000, 0, { day: 'd1' }); assert.ok(sum >= -100, 'за сутки не больше 100: ' + sum); assert.ok(p.g >= 900); }
{ const p = G.fresh(); p.fights = 50; const d = G.apply(p, 3000, 0, { day: 'd1' }); assert.ok(d >= -G.LOSS_CAP, 'за бой не больше 30'); }
// выход по связи и бои с ботами Граней не меняют
{ const p = G.fresh(); assert.strictEqual(G.apply(p, 1000, 0, { dropEarly: true }), 0); assert.strictEqual(G.apply(p, 1000, 1, { rated: false }), 0); assert.strictEqual(p.fights, 0); }
// ранги по Граням
assert.strictEqual(G.rankOf(0), 0); assert.strictEqual(G.rankOf(999), 0); assert.strictEqual(G.rankOf(1000), 1); assert.strictEqual(G.rankOf(1399), 2); assert.strictEqual(G.rankOf(9999), 9);
// подбор: Сила ±15%, ближайший по Граням, одного соперника не чаще 3 раз в сутки
{
  const me = { id: 'me', g: 1000, power: 1000, state: G.fresh() };
  const c = [{ id: 'a', g: 1050, power: 1100 }, { id: 'b', g: 1010, power: 1300 }, { id: 'c', g: 1200, power: 900 }, { id: 'me', g: 1000, power: 1000 }];
  assert.strictEqual(G.pickOpponent(me, c, 'd1').id, 'a', 'b вне полосы Силы, c дальше по Граням');
  for (let i = 0; i < 3; i++) G.noteOpponent(me.state, 'a', 'd1');
  assert.strictEqual(G.pickOpponent(me, c, 'd1').id, 'c', 'a — лимит три раза в сутки');
  assert.strictEqual(G.pickOpponent(me, c, 'd2').id, 'a', 'на следующий день лимит сброшен');
  assert.strictEqual(G.pickOpponent(me, [{ id: 'z', g: 1000, power: 2000 }], 'd1'), null);
}
console.log('grani.test.js: OK');
