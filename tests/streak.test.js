const Streak = require('../js/streak.js'); let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const s = Streak.clean(null);
ok(Streak.visit(s, '2026-10-20') && s.run === 1 && s.best === 1, 'первый заход');
const r1 = Streak.claim(s, '2026-10-20'); ok(r1.coins === 30 && s.pos === 1 && s.total === 1, 'первая награда');
ok(Streak.claim(s, '2026-10-20') === null && !Streak.visit(s, '2026-10-20'), 'второй раз в тот же день — нет');
ok(Streak.visit(s, '2026-10-21') && s.run === 2, 'следующий день: серия 2'); const r2 = Streak.claim(s, '2026-10-21'); ok(r2.cons && r2.cons.potion === 1 && s.pos === 2, 'вторая награда — зелье');
// пропуск не наказывает: лента идёт дальше, серия начинается заново
ok(Streak.visit(s, '2026-10-25') && s.run === 1 && s.best === 2, 'пропуск: серия 1, рекорд сохранён'); const r3 = Streak.claim(s, '2026-10-25'); ok(r3.coins === 60 && s.pos === 3, 'пропуск не сбрасывает ленту');
// неделя подряд и круг ленты
const w = Streak.clean(null); let got = [];
for (let i = 0; i < 7; i++) { const d = '2026-11-' + String(1 + i).padStart(2, '0'); Streak.visit(w, d); got.push(Streak.claim(w, d)); }
ok(w.run === 7 && got[6].coins === 200 + Streak.WEEK_BONUS && got[6].cons.luck === 1 && w.pos === 0, 'седьмой день: награда и недельная добавка, лента по кругу');
ok(Streak.visit(w, '2026-11-08') && Streak.claim(w, '2026-11-08').coins === 30, 'новый круг');
// границы месяца и года, часы назад
ok(Streak.gap('2026-12-31', '2027-01-01') === 1 && Streak.gap('2026-02-28', '2026-03-01') === 1, 'разница дат');
const z = Streak.clean({ last: '2026-11-10', run: 3, best: 3 }); Streak.visit(z, '2026-11-09'); ok(z.run >= 1 && z.last === '2026-11-09', 'часы назад не ломают');
ok(JSON.stringify(Streak.clean({ pos: 99, last: 'xx', run: -5 })) === JSON.stringify({ last: '', run: 0, best: 0, total: 0, claimed: '', pos: 1 }), 'clean');
console.log(fails ? 'streak: ' + fails + ' ошибок' : 'streak: все тесты пройдены'); process.exit(fails ? 1 : 0);
