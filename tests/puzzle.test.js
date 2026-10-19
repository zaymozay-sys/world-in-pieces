global._t = (s, a) => (a ? s.replace(/\{(\d+)\}/g, (_, i) => a[i]) : s);
global.Engine = require('../js/engine.js');
const Puzzle = require('../js/puzzle.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
// поле дня одно и то же и достаточно «богато»
const d1 = '2026-10-19', d2 = '2026-10-20';
ok(Puzzle.seedFor(d1) === Puzzle.seedFor(d1), 'seed stable');
ok(Puzzle.seedFor(d1) !== Puzzle.seedFor(d2), 'seed differs by day');
ok(Puzzle.greedy(Puzzle.seedFor(d1)) >= 150, 'puzzle is rich');
// партия: ходы жадным способом, 8 ходов, звёзды и монеты один раз
const p = Puzzle.clean(null); let coins = 0, last;
for (let i = 0; i < 20; i++) {
  const s = Puzzle.game(p, d1), mv = require('../js/lhgames.js').avMoves(s);
  if (!mv.length || p.done) break;
  let best = -1, pick = mv[0];
  for (const m of mv) { const c = require('../js/lhgames.js').avClone(s); require('../js/lhgames.js').avMove(c, m.a, m.b); if (c.score > best) { best = c.score; pick = m; } }
  last = Puzzle.move(p, d1, pick.a, pick.b); ok(last.ok, 'move ok'); coins += last.coins;
}
ok(p.done && p.moves.length <= Puzzle.MOVES, 'done after moves');
ok(p.stars >= 1, 'greedy gets a star');
ok(coins === Puzzle.COINS.slice(0, p.stars).reduce((a, b) => a + b, 0), 'coins once per star');
ok(!Puzzle.move(p, d1, 0, 1).ok, 'no moves after done');
// повторное проигрывание ходов даёт тот же счёт (можно закрыть вкладку)
const again = Puzzle.game(Puzzle.clean(JSON.parse(JSON.stringify(p))), d1);
ok(again.score === last.s.score, 'replay equals');
// следующий день — сброс, рекорд остаётся
const best = p.best; Puzzle.sync(p, d2);
ok(p.moves.length === 0 && !p.done && p.stars === 0 && p.best === best, 'new day resets');
// грязные данные
const c = Puzzle.clean({ moves: [[1, 2], [99, 3], 'x'], stars: 9, paid: -1, total: 'a' });
ok(c.moves.length === 1 && c.stars === 3 && c.paid === 0 && c.total === 0, 'clean');
console.log(fails ? 'puzzle: ' + fails + ' ошибок' : 'puzzle: все тесты пройдены'); process.exit(fails ? 1 : 0);
