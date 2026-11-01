// Склонение числа со словом: «{0 бой|боя|боёв}» (рус.) и «{0 fight|fights}» (англ.).
const assert = require('assert'), { execFileSync } = require('child_process');
const run = (lang, code) => execFileSync(process.execPath, ['-e', code], { env: { ...process.env, WIP_LANG: lang }, cwd: __dirname + '/..' }).toString().trim();
const t = "require('./js/i18n.js');process.stdout.write([1,2,5,11,21,102].map(n=>_t('{0 бой|боя|боёв} подряд',[n])).join('|'))";
assert.strictEqual(run('ru', t), '1 бой подряд|2 боя подряд|5 боёв подряд|11 боёв подряд|21 бой подряд|102 боя подряд');
// в английском берётся перевод из словаря: «Хранятся последние {0 бой|боя|боёв}…»
const e = "require('./js/i18n.js');process.stdout.write([1,3].map(n=>_t('Не больше {0 лота|лотов|лотов} одновременно.',[n])).join('|'))";
assert.ok(/^.*1 lot[^s].*\|.*3 lots/.test(run('en', "require('./js/i18n.js');process.stdout.write([1,3].map(n=>_t('<p class=\"hint warn\">Не больше {0 лота|лотов|лотов} одновременно.</p>',[n])).join('|'))")), 'английское склонение');
console.log('plural: все тесты пройдены');
