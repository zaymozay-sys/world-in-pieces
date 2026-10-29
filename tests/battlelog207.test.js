// 2.0.7: номера боёв и журнал последних боёв. Запуск: node tests/battlelog207.test.js
const assert = require('assert');
const mem = {}; global.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const BL = require('../js/battlelog.js');
assert.strictEqual(BL.next(), 1); assert.strictEqual(BL.next(), 2);
for (let i = 3; i <= 40; i++) { const n = BL.next(); BL.save({ n, foe: 'Крыса', tier: 1, result: 'win', hero: 'Гном', lines: [{ side: 'left', text: 'ход ' + n }] }); }
assert.strictEqual(BL.list().length, BL.MAX, 'хранятся последние ' + BL.MAX);
assert.strictEqual(BL.list().pop().n, 40); assert.strictEqual(BL.list()[0].n, 40 - BL.MAX + 1, 'старые вытеснены, порядок по возрастанию');
assert.strictEqual(BL.get(40).lines[0], 'L|ход 40'); assert.strictEqual(BL.get(2), null);
// номера не повторяются и не сбрасываются очисткой журналов
const before = BL.next(); BL.clear(); assert.strictEqual(BL.list().length, 0); assert.strictEqual(BL.next(), before + 1);
// длинный бой обрезается до LINES последних строк; повторная запись заменяет
const lines = Array.from({ length: 1000 }, (_, i) => ({ side: i % 2 ? 'right' : 'left', text: 'x' + i }));
BL.save({ n: 500, foe: 'Тролль', tier: 5, result: 'loss', hero: 'Эльф', lines }); BL.save({ n: 500, foe: 'Тролль', tier: 5, result: 'win', hero: 'Эльф', lines });
const e = BL.get(500); assert.strictEqual(e.lines.length, BL.LINES); assert.strictEqual(e.result, 'win'); assert.strictEqual(BL.list().filter((x) => x.n === 500).length, 1);
assert.ok(BL.text(e).startsWith('Бой № 500'));
// испорченное хранилище не ломает игру
mem['wip-battle-logs'] = '{плохо'; assert.deepStrictEqual(BL.list(), []); BL.save({ n: 501, lines: [] }); assert.strictEqual(BL.list().length, 1);
// валидный JSON неправильной формы (не массив, строка, запись без строк) и испорченный счётчик
for (const bad of ['{"a":1}', '"текст"', '123', 'null', '[{"n":7},{"n":8,"lines":"x"},null,5]']) { mem['wip-battle-logs'] = bad; assert.deepStrictEqual(BL.list(), [], 'форма: ' + bad); }
mem['wip-battle-seq'] = '"abc"'; assert.ok(Number.isInteger(BL.next()), 'счётчик-строка не даёт NaN'); mem['wip-battle-seq'] = '{"x":1}'; assert.ok(Number.isInteger(BL.next()));
// переполнение хранилища: setItem бросает QuotaExceededError, пока объём больше предела — самые старые журналы вытесняются, исключений нет
BL.clear(); const LIMIT = 60000; const realSet = global.localStorage.setItem;
global.localStorage.setItem = (k, v) => { if (String(v).length > LIMIT) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } realSet(k, v); };
const big = Array.from({ length: BL.LINES }, (_, i) => ({ side: 'left', text: 'строка '.repeat(8) + i }));
for (let n = 1000; n < 1020; n++) assert.doesNotThrow(() => BL.save({ n, foe: 'Огр', tier: 3, result: 'win', hero: 'Гном', lines: big }));
const kept = BL.list(); assert.ok(kept.length >= 1 && kept.length < 20, 'при нехватке места осталось ' + kept.length); assert.strictEqual(kept[kept.length - 1].n, 1019, 'самый новый сохранён');
assert.ok(JSON.stringify(kept).length <= LIMIT);
// запись вообще невозможна (хранилище полностью закрыто): бой идёт дальше, номера растут в пределах сессии
global.localStorage.setItem = () => { throw new Error('denied'); };
const m1 = BL.next(), m2 = BL.next(); assert.strictEqual(m2, m1 + 1); assert.doesNotThrow(() => BL.save({ n: 2000, lines: [] }));
// localStorage отсутствует (приватный режим / вставка в iframe): ничего не падает
const saved = global.localStorage; delete global.localStorage;
assert.doesNotThrow(() => { BL.next(); BL.save({ n: 3000, lines: [] }); BL.list(); BL.clear(); }); global.localStorage = saved;
console.log('battlelog207: все тесты пройдены');
