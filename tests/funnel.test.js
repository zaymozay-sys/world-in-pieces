const Funnel = require('../js/funnel.js'); let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const S = require('../server/src/funnel.js');
ok(JSON.stringify(Funnel.EVENTS) === JSON.stringify(S.EVENTS), 'списки событий клиента и сервера совпадают');
ok(JSON.stringify(Funnel.reached({})) === '["first_open"]', 'новое устройство');
ok(Funnel.reached({ tutorial: { done: true }, wins: 3, lessons: { done: { l1: true } } }).join() === 'first_open,tut_half,tut_done,win1,win3,lesson1', 'достигнуто');
ok(Funnel.reached({ tutorial: { step: 6 } }).includes('tut_half') && !Funnel.reached({ tutorial: { step: 5 } }).includes('tut_half'), 'середина обучения');
// отправка: по одному, один раз за событие; при отказе останавливаемся
const mem = {}; global.localStorage = { getItem: (k) => mem[k] || null, setItem: (k, v) => { mem[k] = v; } };
(async () => {
  const got = []; const remote = { enabled: true, funnel: async (e) => { got.push(e); return true; } };
  await Funnel.sync({ wins: 1 }, remote); await Funnel.sync({ wins: 1 }, remote);
  ok(got.join() === 'first_open,win1', 'один раз: ' + got.join());
  const bad = { enabled: true, funnel: async () => false }; await Funnel.sync({ wins: 3 }, bad);
  await Funnel.sync({ wins: 3 }, remote); ok(got.join() === 'first_open,win1,win3', 'после отказа повтор: ' + got.join());
  console.log(fails ? 'funnel client: ' + fails + ' ошибок' : 'funnel client: все тесты пройдены'); process.exit(fails ? 1 : 0);
})();
