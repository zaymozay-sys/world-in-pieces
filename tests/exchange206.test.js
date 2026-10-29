// 2.0.6 (этап A): обмен ресурсов между соседними цветами по фактическим ценам. Запуск: node tests/exchange206.test.js
const assert = require('assert');
global.Tiers = require('../js/tiers.js');
const B = require('../js/bestiary.js');
const kinds = Object.keys(B.RESOURCES), P = B.resPrice;
// 1) правило потери ≥ 10%: все виды × все направленные пары соседних и далёких цветов × take = 1…20 (формулу даёт exchangeQuote, но она допускает только соседей)
let cases = 0, ok = 0;
for (const k of kinds) for (let f = 1; f <= 10; f++) for (let t = 1; t <= 10; t++) {
  if (f === t) continue;
  for (let n = 1; n <= 20; n++) {
    const q = B.exchangeQuote(k, f, t, n);
    if (Math.abs(f - t) !== 1) { assert.strictEqual(q, null, 'не соседние цвета нельзя'); continue; }
    cases++;
    assert.strictEqual(q.give, Math.floor((9 * n * P(k, f)) / (10 * P(k, t))));
    if (q.give < 1) { assert.strictEqual(q.ok, false); continue; }
    ok++;
    assert.ok(q.give * P(k, t) <= 0.9 * n * P(k, f) + 1e-9, `потеря ≥10%: ${k} ${f}→${t} ×${n}`);
    assert.ok(q.keepPct <= 90.0 + 1e-9);
  }
}
assert.ok(cases >= 4400 && ok > 2000, `проверено ${cases} соседних случаев, годных ${ok}`);
// 2) minTake: меньше — обмен недоступен, ровно minTake — доступен, принудительной «1 штуки» нет
for (const k of kinds) for (let f = 1; f <= 10; f++) for (const t of [f - 1, f + 1]) {
  if (t < 1 || t > 10) continue;
  const m = B.exchangeQuote(k, f, t, 1).minTake;
  assert.ok(m >= 1);
  assert.strictEqual(B.exchangeQuote(k, f, t, m).ok, true, `minTake ${k} ${f}→${t}`);
  if (m > 1) assert.strictEqual(B.exchangeQuote(k, f, t, m - 1).ok, false, `${k} ${f}→${t}: на ${m - 1} шт. выдавать нечего`);
}
assert.ok(B.exchangeQuote('ore', 6, 7, 1).minTake > 1, 'дорогой цвет нельзя получить за одну штуку дешёвого');
assert.strictEqual(B.exchangeQuote('ore', 6, 7, 2).ok, false, 'руда 6→7 ×2 — старая «минимум 1» нарушала потерю');
// 3) недопустимый ввод
assert.strictEqual(B.exchangeQuote('нет', 2, 3, 3), null);
assert.strictEqual(B.exchangeQuote('hide', 2, 2, 3), null, 'один и тот же цвет');
assert.strictEqual(B.exchangeQuote('hide', 1, 0, 3), null, 'ниже первого цвета');
assert.strictEqual(B.exchangeQuote('hide', Tiers.MAX, Tiers.MAX + 1, 3), null, 'выше последнего цвета');
assert.strictEqual(B.exchangeQuote('hide', 2.5, 3.5, 3), null, 'дробный цвет');
assert.strictEqual(B.exchangeQuote('hide', 2, 4, 3), null, 'не соседний цвет');
for (const bad of [0, -1, 1.5, NaN, Infinity, '3', null, undefined, 1000]) assert.strictEqual(B.exchangeQuote('hide', 2, 3, bad).ok, false, 'недопустимое количество: ' + String(bad));
assert.strictEqual(B.exchangeQuote('hide', 2, 3, 999).ok, true, 'предел 999');
assert.ok(999 * P('essence', 10) < Number.MAX_SAFE_INTEGER);
// 4) круг обмена туда-обратно всегда в убыток; прибыльных денежных циклов (покупка в Лавке ×3 → обмен → продажа в Лавку ×1 / Ряды ×1,71) нет
for (const k of kinds) for (let f = 1; f < 10; f++) for (let n = 1; n <= 60; n++) {
  const up = B.exchangeQuote(k, f, f + 1, n); if (!up.ok) continue;
  const back = B.exchangeQuote(k, f + 1, f, up.give);
  assert.ok(!back.ok || back.give < n || back.give * P(k, f) <= up.give * P(k, f + 1), 'туда-обратно не выгодно');
  const buy = 3 * P(k, f) * n;
  assert.ok(up.give * P(k, f + 1) <= buy && up.give * 1.8 * 0.95 * P(k, f + 1) < buy, 'цикл через Лавку не прибылен');
}
for (const k of Object.keys(B.RESOURCES)) assert.ok(B.sourcesOf(k).length > 0, 'у ресурса есть источник: ' + k);
assert.ok(B.sourcesOf('hide').every((id) => B.MONSTERS[id].drops.some((d) => d[0] === 'hide')));
assert.strictEqual(B.exchangePlan, undefined, 'старая схема 3→1 / 1→2 удалена');
console.log('exchange206: все тесты пройдены (' + cases + ' случаев)');
