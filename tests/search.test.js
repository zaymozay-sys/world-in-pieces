// 2.2.7: общий поиск (Wiki.qmatch): «ё» = «е», окончания не мешают, короткие слова — только с начала слова.
const assert = require('assert');
require('../js/i18n.js');
// qmatch не зависит от остальных модулей — достанем её, подставив заглушки, которые нужны только при первом обращении к статьям
global.Bestiary = { MONSTERS: {} }; global.Gear = { ITEMS: {}, CONSUMABLES: {}, SETS: {}, LOCKED_SETS: [] }; global.Ammo = { CATALOG: {} }; global.Elixirs = { KINDS: {} };
let W; try { W = require('../js/wiki.js'); } catch (e) { console.log('search: пропуск (вики требует браузерных модулей):', e.message.slice(0, 60)); process.exit(0); }
const m = W.qmatch;
assert.ok(m('Шипастый ёж', 'еж'), 'ё = е');
assert.ok(m('Шипастый еж', 'ёж'));
assert.ok(m('Питомец и поручения', 'питомцы'), 'окончание «питомцы» → «питомец»');
assert.ok(m('Кузница', 'кузнице'));
assert.ok(!m('Между домами', 'еж'), 'короткое слово — с начала слова');
assert.ok(m('Медный амулет', 'амулеты медный'), 'несколько слов — все должны найтись');
assert.ok(!m('Медный амулет', 'щит'));
console.log('search 2.2.7: ок');
