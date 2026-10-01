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

// ход в пустую соседнюю клетку: если над/под камнем нет камня, но сдвиг туда собирает линию —
// это законный ход (баг: раньше такие ходы не находились и не были доступны игроку)
{
  const b = empty();
  put(b, N - 1, 0, 0); put(b, N - 1, 1, 0); put(b, N - 2, 2, 0);   // (N-1,2) пусто
  const moves = Engine.legalMoves(b.typ);
  assert.ok(
    moves.some((m) => m.a === (N - 2) * N + 2 && m.b === (N - 1) * N + 2),
    'камень должен сдвигаться в пустую клетку, если это собирает линию из 3'
  );
  // обе клетки пусты — двигать нечего, ход не предлагается
  const bothEmpty = empty(); put(bothEmpty, N - 1, 0, 0); put(bothEmpty, N - 1, 1, 0);
  assert.ok(!Engine.legalMoves(bothEmpty.typ).some((m) => bothEmpty.typ[m.a] === -1 && bothEmpty.typ[m.b] === -1));
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

// Обсидиан x5 — камень обсидиана НОМИНАЛОМ x5: собранный в любую линию, убирает все камни вокруг себя
// на расстоянии 1 (до 8 соседей, с диагоналями). Взорванные клетки помечаются бонусом 1.
{
  const ONYX = 0;
  const b = empty();
  for (let c = 0; c < N; c++) for (let r = 0; r < N; r++) put(b, r, c, 1 + ((r + c) % 3));   // заполнитель без обсидиана
  put(b, 2, 0, ONYX); put(b, 2, 1, ONYX, 5); put(b, 2, 2, ONYX);                            // тройка, в середине x5
  const bon = Engine.bonusMap(b.typ);
  const burst = Engine.obsidianBurst(b.typ, bon, ONYX, b.val);
  for (const [r, c] of [[1, 0], [1, 1], [1, 2], [3, 0], [3, 1], [3, 2]]) assert.strictEqual(burst[r * N + c], 1, `сосед (${r},${c}) исчезает`);
  assert.strictEqual(burst[1 * N + 3], 0, 'клетка на расстоянии 2 не задета');
  assert.strictEqual(burst[2 * N + 3], 0, '(2,3) — на расстоянии 2 от x5, не задета');
  assert.strictEqual(burst[2 * N + 1], bon[2 * N + 1], 'сама линия не переписывается');
  // та же тройка без x5 — взрыва нет, возвращается тот же bon
  const b1 = empty();
  for (let c = 0; c < N; c++) for (let r = 0; r < N; r++) put(b1, r, c, 1 + ((r + c) % 3));
  put(b1, 2, 0, ONYX); put(b1, 2, 1, ONYX); put(b1, 2, 2, ONYX);
  const bon1 = Engine.bonusMap(b1.typ);
  assert.strictEqual(Engine.obsidianBurst(b1.typ, bon1, ONYX, b1.val), bon1, 'без камня x5 соседи остаются');
  // x5 другого цвета не взрывается
  const b2 = empty();
  for (let c = 0; c < N; c++) for (let r = 0; r < N; r++) put(b2, r, c, 1 + ((r + c) % 3));
  put(b2, 5, 0, 1); put(b2, 5, 1, 1, 5); put(b2, 5, 2, 1);
  const bon2 = Engine.bonusMap(b2.typ);
  assert.strictEqual(Engine.obsidianBurst(b2.typ, bon2, ONYX, b2.val), bon2, 'x5 не-обсидиана не взрывается');
  // несобранный x5 обсидиана не взрывается; null остаётся null
  assert.strictEqual(Engine.obsidianBurst(b.typ, null, ONYX, b.val), null);
  // Engine.resolve с индексом обсидиана учитывает взрыв (так ИИ видит эффект)
  const g = Engine.resolve(Array.from(b.typ), Array.from(b.val), [0, 0, 0, 0], ONYX);
  const g0 = Engine.resolve(Array.from(b.typ), Array.from(b.val), [0, 0, 0, 0]);
  assert.ok(g[1] + g[2] + g[3] > g0[1] + g0[2] + g0[3], 'с учётом взрыва собрано больше цветных камней');
}

// Огненный крест ограничен областью 5x5 (radius=2) вокруг цели — у края поля 6x6 область меньше,
// а с любой клетки не задевает противоположный край.
{
  const inBox = (r0, c0, cells) => cells.every(([r, c]) => Math.abs(r - r0) <= 2 && Math.abs(c - c0) <= 2);
  // из центра (2,2) на поле 6x6: 5 клеток по строке + 5 по столбцу − 1 общий центр = 9
  const center = Engine.fireCross(2, 2, 2);
  assert.strictEqual(center.length, 9, 'из центра выгорает максимум клеток креста в области 5x5');
  assert.ok(inBox(2, 2, center));
  // из угла (0,0): строка обрезана до колонок 0..2 (3 клетки), столбец — до строк 0..2 (3 клетки), минус общий центр = 5
  const corner = Engine.fireCross(0, 0, 2);
  assert.strictEqual(corner.length, 5, 'у угла область меньше, чем в центре');
  assert.ok(inBox(0, 0, corner));
  assert.ok(corner.length < center.length, 'у угла сгорает меньше клеток, чем у центра');
  // старое поведение (полная строка+столбец) захватывало бы противоположный край — теперь никогда
  for (const [r0, c0] of [[2, 2], [0, 0], [5, 5], [0, 5], [3, 1]]) {
    const cells = Engine.fireCross(r0, c0, 2);
    assert.ok(inBox(r0, c0, cells), `все клетки креста из (${r0},${c0}) должны быть внутри области 5x5`);
    assert.ok(cells.length <= 9, 'крест в области 5x5 не может задеть больше 9 клеток');
  }
}

/* ---------- Прилив: Engine.convertColor ---------- */
{
  const typ = new Int8Array([0, 1, 0, 2, 0, 1]);
  const n = Engine.convertColor(typ, 0, 3);
  assert.strictEqual(n, 3, 'вернул число превращённых камней');
  assert.deepStrictEqual(Array.from(typ), [3, 1, 3, 2, 3, 1]);
  // цвета, которого нет на поле — ничего не меняет, возвращает 0
  assert.strictEqual(Engine.convertColor(typ, 9, 1), 0);
}

/* ---------- Прорицание: Engine.fourPlusMoves ---------- */
{
  const N = Engine.N;
  const typ = new Int8Array(N * N).fill(-1);
  // строка 0: "1 0 0 0 -1 -1"; своп клетки (0,0)='1' с (1,0)='0' сделает строку 0 "0 0 0 0" — линия из 4.
  typ[0 * N + 0] = 1; typ[0 * N + 1] = 0; typ[0 * N + 2] = 0; typ[0 * N + 3] = 0;
  typ[1 * N + 0] = 0;
  const moves = Engine.fourPlusMoves(typ);
  assert.ok(moves.length >= 1, 'находит ход, дающий линию из 4+');
  assert.ok(moves.some((m) => m.a === 0 * N + 0 && m.b === 1 * N + 0), 'нашёл именно вертикальный своп (0,0)-(1,0)');
  // поле не изменилось после вызова (fourPlusMoves лишь пробует и откатывает свопы)
  assert.strictEqual(typ[0 * N + 0], 1);
  assert.strictEqual(typ[1 * N + 0], 0);
  // подмножество legalMoves: каждый 4+-ход обязан быть обычным законным ходом
  const legal = Engine.legalMoves(typ).map((m) => m.a + ':' + m.b);
  for (const m of moves) assert.ok(legal.includes(m.a + ':' + m.b));
  // пустое поле — ходов нет
  assert.deepStrictEqual(Engine.fourPlusMoves(new Int8Array(N * N).fill(-1)), []);
}

// Кулак ярости: господствующий тип по сумме номиналов
{
  let b = empty();
  put(b, 0, 0, 1); put(b, 0, 1, 1); put(b, 1, 0, 0);
  assert.strictEqual(Engine.dominantType(b.typ, b.val), 1, 'явный лидер');
  put(b, 1, 1, 0);
  assert.strictEqual(Engine.dominantType(b.typ, b.val), -1, 'ничья → -1');
  b = empty();
  put(b, 0, 0, 2, 5);
  for (let c = 0; c < 4; c++) put(b, 3, c, 0, 1);
  assert.strictEqual(Engine.dominantType(b.typ, b.val), 2, 'один x5 сильнее четырёх x1');
  assert.deepStrictEqual(Engine.typeValueSums(b.typ, b.val), [4, 0, 5]);
  b = empty();
  assert.strictEqual(Engine.dominantType(b.typ, b.val), -1, 'пустое поле → -1');
  put(b, 2, 2, 3, 3); put(b, 2, 3, 3, 1);
  assert.strictEqual(Engine.dominantType(b.typ, b.val), 3, 'обсидиан (родной цвет гномов) тоже может господствовать');
}

console.log('engine: все тесты пройдены');
