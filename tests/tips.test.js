const Tips = require('../js/tips.js'); let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const d = {};
const t = Tips.once(d, 'four'); ok(typeof t === 'string' && t.length > 10, 'текст');
ok(Tips.once(d, 'four') === null, 'второй раз — нет'); ok(Tips.once(d, 'wrong') !== null, 'другая подсказка — да');
ok(Tips.once(d, 'zzz') === null, 'неизвестная'); ok(JSON.stringify(Tips.clean({ four: 1, x: 1 })) === '{"four":true}', 'clean');
console.log(fails ? 'tips: ' + fails + ' ошибок' : 'tips: все тесты пройдены'); process.exit(fails ? 1 : 0);
