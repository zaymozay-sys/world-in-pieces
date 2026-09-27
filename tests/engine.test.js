// Тесты правил поля. Запуск: node tests/engine.test.js
const assert = require('assert');
const Engine = require('../js/engine.js');

const N = Engine.N;
const empty = () => ({ typ: new Array(N * N).fill(-1), val: new Array(N * N).fill(0) });
const put = (b, r, c, t, v = 1) => { b.typ[r * N + c] = t; b.val[r * N + c] = v; };
const gains = () => [0, 0, 0, 0];

// бонусы за длину линии
assert.strictEqual(Engine.bonusFor(3), 1);
assert.strictEqual(Engine.bonusFor(4), 2);
assert.strictEqual(Engine.bonusFor(5), 3);
assert.strictEqual(Engine.bonusFor(6), 10);

// линия из 3 — без бонуса, из 4 — x2, из 6 — x10
for (const [len, expected] of [[3, 3], [4, 8], [5, 15], [6, 60]]) {
  const b = empty();
  for (let c = 0; c < len; c++) put(b, N - 1, c, 2);
  const g = Engine.resolve(b.typ, b.val, gains());
  assert.strictEqual(g[2], expected, `линия ${len}`);
}

// номинал камня умножается на бонус линии
{
  const b = empty();
  for (let c = 0; c < 4; c++) put(b, N - 1, c, 3, c === 0 ? 5 : 1);   // 5+1+1+1 = 8, x2
  assert.strictEqual(Engine.resolve(b.typ, b.val, gains())[3], 16);
}

// дополнительный ход — только за линию из 4+
{
  const b3 = empty(); for (let c = 0; c < 3; c++) put(b3, N - 1, c, 0);
  assert.ok(!Engine.resolve(b3.typ, b3.val, gains()).extra);
  const b4 = empty(); for (let c = 0; c < 4; c++) put(b4, N - 1, c, 0);
  assert.ok(Engine.resolve(b4.typ, b4.val, gains()).extra);
}

// падение вниз, затем сдвиг вправо
{
  const b = empty();
  put(b, 0, 0, 1); put(b, 3, 0, 2);          // два камня в столбце 0 с зазором
  Engine.gravity(b.typ, b.val);
  assert.strictEqual(b.typ[(N - 1) * N], 2);
  assert.strictEqual(b.typ[(N - 2) * N], 1);
  Engine.shiftRight(b.typ, b.val);           // ряды уезжают к правому краю
  assert.strictEqual(b.typ[(N - 1) * N + N - 1], 2);
  assert.strictEqual(b.typ[(N - 2) * N + N - 1], 1);
  assert.strictEqual(b.typ[(N - 1) * N], -1);
}

// ходы: обмен, дающий линию, находится; без ходов — пусто
{
  const b = empty();
  put(b, N - 1, 0, 0); put(b, N - 1, 1, 0); put(b, N - 1, 2, 1); put(b, N - 2, 2, 0);
  const moves = Engine.legalMoves(b.typ);
  assert.ok(moves.some((m) => m.a === (N - 2) * N + 2 && m.b === (N - 1) * N + 2));
  const none = empty(); put(none, 5, 0, 0); put(none, 5, 1, 1);
  assert.strictEqual(Engine.legalMoves(none.typ).length, 0);
}

// каскад: после падения собирается новая линия
{
  const b = empty();
  put(b, 5, 0, 1); put(b, 5, 1, 1); put(b, 5, 2, 1);      // линия внизу
  put(b, 4, 0, 2); put(b, 4, 1, 2);                        // над ней
  put(b, 3, 2, 2);                                          // после падения и сдвига окажутся рядом
  const g = Engine.resolve(b.typ, b.val, gains());
  assert.strictEqual(g[1], 3);
  assert.ok(g[2] >= 3, 'каскад должен собрать группу типа 2');
}

console.log('engine: все тесты пройдены');
