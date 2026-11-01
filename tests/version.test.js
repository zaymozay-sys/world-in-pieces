// Номер версии в js/version.js совпадает с package.json, дата — в формате ДД.ММ.ГГГГ. Запуск: node tests/version.test.js
const assert = require('assert');
const fs = require('fs'), path = require('path');
const V = require('../js/version.js');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
assert.strictEqual(V.GAME_VERSION, pkg.version, 'версия в js/version.js и package.json совпадает');
assert.ok(/^\d{2}\.\d{2}\.\d{4}$/.test(V.GAME_UPDATED), 'дата вида ДД.ММ.ГГГГ');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(html.indexOf('js/version.js') > 0 && html.indexOf('js/version.js') < html.indexOf('js/mapview.js'), 'version.js подключён до карты');
// Контроль нумерации: версия растёт только последней цифрой (после x.y.9 — следующая средняя); номер один и тот же везде.
const [ma, mi, pa] = V.GAME_VERSION.split('.').map(Number);
assert.ok(Number.isInteger(ma) && Number.isInteger(mi) && Number.isInteger(pa) && pa <= 9, 'номер вида X.Y.Z, где Z от 0 до 9');
const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
assert.ok(readme.indexOf('**Версия ' + V.GAME_VERSION + '.**') >= 0, 'в README та же версия');
const handoff = fs.readFileSync(path.join(__dirname, '..', 'HANDOFF.md'), 'utf8');
const rel = [...handoff.matchAll(/^## Выпуск (\d+\.\d+\.\d+)/gm)].map((m) => m[1]);
assert.strictEqual(rel[rel.length - 1], V.GAME_VERSION, 'последний «Выпуск» в HANDOFF.md — текущая версия');
const num = (v) => { const [a, b, c] = v.split('.').map(Number); return a * 10000 + b * 100 + c; };
for (let i = 1; i < rel.length; i++) { const x = rel[i - 1].split('.').map(Number), y = rel[i].split('.').map(Number); const nextOk = (y[0] === x[0] && y[1] === x[1] && y[2] === x[2] + 1) || (y[0] === x[0] && y[1] === x[1] + 1 && y[2] === 0 && x[2] === 9); assert.ok(nextOk, 'нумерация без скачков: ' + rel[i - 1] + ' → ' + rel[i]); }
global._t = global._t || ((s) => s); assert.ok(require('../js/whatsnew.js').NOTES[V.GAME_VERSION], 'в «Что нового» есть запись текущей версии');
console.log('version: все тесты пройдены');
