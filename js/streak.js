if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Лента заходов (1.9.10): за каждый день, когда игрок заходит в игру, можно забрать одну награду из ленты на 7 дней.
   Пропуск ничего не сбрасывает и не наказывает: лента просто продолжается с того места, где остановилась.
   Отдельно считается серия — сколько дней подряд игрок заходил; за каждую полную неделю подряд — небольшая добавка.
   Состояние — Profile.data.streak = { last:'ГГГГ-ММ-ДД', run, best, total, claimed:'ГГГГ-ММ-ДД', pos:0..6 }. Чистый модуль:
   даты передаются строками (Daily.today()), награды выдаёт вызывающий код через Profile. */
const Streak = (() => {
  const REWARDS = [
    { coins: 30 }, { cons: { potion: 1 } }, { coins: 60 }, { cons: { scroll: 1 } }, { coins: 100 }, { cons: { elixir: 1 } }, { coins: 200, cons: { luck: 1 } },
  ];
  const WEEK_BONUS = 150;
  const num = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  const dayRe = /^\d{4}-\d{2}-\d{2}$/;
  const day = (x) => (typeof x === 'string' && dayRe.test(x) ? x : '');
  function clean(s) {
    s = s && typeof s === 'object' ? s : {};
    return { last: day(s.last), run: num(s.run), best: num(s.best), total: num(s.total), claimed: day(s.claimed), pos: num(s.pos) % REWARDS.length };
  }
  const toNum = (d) => { const [y, m, dd] = d.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, dd) / 86400000); };
  const gap = (a, b) => toNum(b) - toNum(a);
  // отметить заход: вызывается при запуске; возвращает true, если награду за сегодня ещё не забрали
  function visit(s, today) {
    if (!day(today)) return false;
    if (s.last !== today) {
      s.run = s.last && gap(s.last, today) === 1 ? s.run + 1 : 1;
      if (s.last && gap(s.last, today) < 0) s.run = Math.max(1, s.run);   // часы переведены назад — серию не трогаем
      s.last = today; s.best = Math.max(s.best, s.run);
    }
    return s.claimed !== today;
  }
  const available = (s, today) => !!day(today) && s.claimed !== today;
  // награда, которую получит игрок за сегодня (с недельной добавкой, если серия кратна 7)
  function next(s) {
    const r = REWARDS[s.pos], bonus = s.run > 0 && s.run % 7 === 0 ? WEEK_BONUS : 0;
    return { coins: (r.coins || 0) + bonus, cons: r.cons ? Object.assign({}, r.cons) : null, bonus, pos: s.pos };
  }
  // забрать: сдвигает ленту; возвращает выданную награду или null, если сегодня уже забирали
  function claim(s, today) {
    if (!available(s, today)) return null;
    const r = next(s);
    s.claimed = today; s.total++; s.pos = (s.pos + 1) % REWARDS.length;
    return r;
  }
  return { REWARDS, WEEK_BONUS, clean, visit, available, next, claim, gap };
})();

if (typeof module !== 'undefined') module.exports = Streak;
