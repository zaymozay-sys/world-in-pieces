// Бесконечные анимации должны идти на видеокарте (только transform и opacity) — см. tools/audit-anim.js. Запуск: node tests/anim.test.js
const assert = require('assert');
const { bad } = require('../tools/audit-anim.js');
assert.deepStrictEqual(Object.keys(bad), [], 'тяжёлые бесконечные анимации: ' + Object.keys(bad).join(', ') + ' — переведите на transform/opacity или внесите в ALLOW с объяснением');
console.log('anim: тест пройден');
