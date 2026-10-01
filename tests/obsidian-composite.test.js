// Обсидиан x5: цепная реакция и края поля. Запуск: node tests/obsidian-composite.test.js
// (Раньше здесь проверялась пересекающаяся «линия из пяти обсидианов» — это была неверная трактовка:
//  «обсидиан x5» — это камень обсидиана номиналом x5, см. Engine.obsidianBurst.)
const assert = require('assert');
const Engine = require('../js/engine.js');
const N = Engine.N, ONYX = 3;

const board = () => {
  const typ = new Array(N * N), val = new Array(N * N).fill(1);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) typ[r * N + c] = (r + c) % 3;   // без обсидиана и без линий
  return { typ, val };
};
const at = (r, c) => r * N + c;

// 1. Цепная реакция: среди взорванных соседей есть ещё один обсидиан x5 — он тоже взрывается.
{
  const b = board();
  b.typ[at(5, 0)] = ONYX; b.typ[at(5, 1)] = ONYX; b.typ[at(5, 2)] = ONYX; b.val[at(5, 1)] = 5;   // тройка внизу, x5 в (5,1)
  b.typ[at(4, 2)] = ONYX; b.val[at(4, 2)] = 5;                                                    // сосед — тоже обсидиан x5
  assert.strictEqual(Engine.bonusMap(b.typ)[at(4, 2)], 0, '(4,2) сам в линию не попал');
  const out = Engine.obsidianBurst(b.typ, Engine.bonusMap(b.typ), ONYX, b.val);
  assert.strictEqual(out[at(4, 2)], 1, 'соседний x5 сгорает от первого взрыва');
  assert.strictEqual(out[at(3, 3)], 1, '…и сам взрывается: (3,3) — сосед второго x5');
  assert.strictEqual(out[at(3, 1)], 1);
  assert.strictEqual(out[at(2, 2)], 0, 'на расстоянии 2 от обоих — не задето');
}

// 2. Угол поля: у x5 в углу только 3 соседа, за край ничего не выходит.
{
  const b = board();
  b.typ[at(0, 0)] = ONYX; b.typ[at(0, 1)] = ONYX; b.typ[at(0, 2)] = ONYX; b.val[at(0, 0)] = 5;
  const bon = Engine.bonusMap(b.typ);
  const out = Engine.obsidianBurst(b.typ, bon, ONYX, b.val);
  const added = [];
  for (let i = 0; i < N * N; i++) if (out[i] && !bon[i]) added.push(i);
  assert.deepStrictEqual(added.sort((x, y) => x - y), [at(1, 0), at(1, 1)], 'у углового x5 сгорают (1,0) и (1,1); (0,1) уже в линии');
}

// 3. Пустые клетки не помечаются (взрывать нечего).
{
  const b = board();
  b.typ[at(5, 0)] = ONYX; b.typ[at(5, 1)] = ONYX; b.typ[at(5, 2)] = ONYX; b.val[at(5, 1)] = 5;
  b.typ[at(4, 1)] = -1; b.val[at(4, 1)] = 0;
  const out = Engine.obsidianBurst(b.typ, Engine.bonusMap(b.typ), ONYX, b.val);
  assert.strictEqual(out[at(4, 1)], 0);
  assert.strictEqual(out[at(4, 0)], 1);
}

console.log('obsidian-composite: все тесты пройдены');
