const assert = require('assert');
global._t = (s, a) => (a ? s.replace(/\{(\d+)\}/g, (_, i) => a[i]) : s);
const P = require('../js/petdiary.js');
const H = 3600 * 1000, t0 = 1e12;
let r = P.tick([], 'dog', 'Рекс', 0, t0);
assert.strictEqual(r.added, 0); assert.strictEqual(r.last, t0, 'первый заход начинает отсчёт');
r = P.tick(r.diary, 'dog', 'Рекс', r.last, t0 + 2 * H);
assert.strictEqual(r.added, 0, 'меньше шага — записей нет'); assert.strictEqual(r.last, t0);
r = P.tick(r.diary, 'dog', 'Рекс', r.last, t0 + 7 * H);
assert.strictEqual(r.added, 2); assert.ok(r.diary.every((e) => /Рекс/.test(e.s)));
const far = P.tick([], 'cat', 'Мурка', t0, t0 + 1000 * H);
assert.strictEqual(far.added, P.MAX_NEW, 'не больше четырёх за заход');
assert.strictEqual(P.line('dog', 'А', 5), P.line('dog', 'А', 5), 'строка зависит только от времени и вида');
const many = []; let last = t0; for (let i = 1; i <= 30; i++) { const x = P.tick(many, 'dog', 'А', last, last + 20 * H); last = x.last; }
assert.ok(many.length <= P.KEEP);
assert.strictEqual(P.tick(null, null, 'x', t0, t0 + 10 * H).added, 0, 'без питомца записей нет');
console.log('petdiary: все тесты пройдены');
