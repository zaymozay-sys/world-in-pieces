// Номер версии в js/version.js совпадает с package.json, дата — в формате ДД.ММ.ГГГГ. Запуск: node tests/version.test.js
const assert = require('assert');
const fs = require('fs'), path = require('path');
const V = require('../js/version.js');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
assert.strictEqual(V.GAME_VERSION, pkg.version, 'версия в js/version.js и package.json совпадает');
assert.ok(/^\d{2}\.\d{2}\.\d{4}$/.test(V.GAME_UPDATED), 'дата вида ДД.ММ.ГГГГ');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(html.indexOf('js/version.js') > 0 && html.indexOf('js/version.js') < html.indexOf('js/mapview.js'), 'version.js подключён до карты');
console.log('version: все тесты пройдены');
