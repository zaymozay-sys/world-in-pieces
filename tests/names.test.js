// Тесты генератора случайного «звёздного» ника (js/names.js). Запуск: node tests/names.test.js
const assert = require('assert');
const Names = require('../js/names.js');

// список непуст, без дублей, все строки непустые
assert.ok(Names.STAR_NAMES.length >= 30, 'имён должно быть достаточно много: ' + Names.STAR_NAMES.length);
assert.strictEqual(new Set(Names.STAR_NAMES).size, Names.STAR_NAMES.length, 'имена не должны повторяться');
assert.ok(Names.STAR_NAMES.every((n) => typeof n === 'string' && n.trim().length > 0), 'все имена непустые строки');

// randomStarName всегда отдаёт непустую строку из списка
for (let i = 0; i < 20; i++) {
  const n = Names.randomStarName();
  assert.ok(typeof n === 'string' && n.length > 0);
  assert.ok(Names.STAR_NAMES.includes(n));
}

// детерминированный генератор (как в tests/daily.test.js): повторные вызовы дают разные имена
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
{
  const rand = mulberry32(42);
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(Names.randomStarName(rand));
  assert.ok(seen.size > 1, 'повторные вызовы должны давать разные имена (получено ' + seen.size + ' разных)');
}

// с seed'ом, дающим всегда 0, выбирается первое имя списка
assert.strictEqual(Names.randomStarName(() => 0), Names.STAR_NAMES[0]);

console.log('names: все тесты пройдены');
