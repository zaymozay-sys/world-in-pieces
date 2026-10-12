// Обсидиан x5 не должен обнулять множитель длинной линии у соседних камней (проверка гипотезы из внешнего аудита: «бонус 2/3 становится 1»).
// Запуск: node tests/obsidian-keep.test.js
const assert = require('assert');
const Engine = require('../js/engine.js');
const N = Engine.N, ONYX = 3;
const typ = new Array(N * N).fill(0), val = new Array(N * N).fill(1);
// обсидиан x5 в (2,2); рядом (2,3) и (3,3) уже в линиях с бонусом 2 и 3; (1,1) — обычный камень вне линий
const at = (r, c) => r * N + c;
typ[at(2, 2)] = ONYX; val[at(2, 2)] = 5;
const bon = new Int8Array(N * N);
bon[at(2, 2)] = 1; bon[at(2, 3)] = 2; bon[at(3, 3)] = 3;
const out = Engine.obsidianBurst(typ, bon, ONYX, val);
assert.strictEqual(out[at(2, 3)], 2, 'бонус 2 у соседа сохранён');
assert.strictEqual(out[at(3, 3)], 3, 'бонус 3 у соседа сохранён');
assert.strictEqual(out[at(1, 1)], 1, 'сосед без линии взорван с бонусом 1');
assert.strictEqual(bon[at(1, 1)], 0, 'исходный массив бонусов не изменён');
console.log('obsidian-keep: все тесты пройдены');
