// Клиент турнира: награда по итогам (чистая функция).
const assert = require('assert');
const Tourney = require('../js/tourney.js');
const view = (o) => ({ state: 'done', rounds: [[1, 1], [1]], championPid: 'p1', entrants: [], ...o });
// победитель: за все раунды + большая награда и титул
let r = Tourney.reward(view({ me: { out: 0 } }), 'p1', 100);
assert.deepStrictEqual(r, { champion: true, roundsWon: 2, rounds: 2, coins: 100 * (6 + 8), title: 'tourneyChamp' });
// финалист (вылетел во 2-м раунде): выиграл 1 раунд
r = Tourney.reward(view({ me: { out: 2 } }), 'p2', 100); assert.strictEqual(r.champion, false); assert.strictEqual(r.roundsWon, 1); assert.strictEqual(r.coins, 200); assert.strictEqual(r.title, null);
// вылет в 1-м раунде: 0 раундов — монет нет, но запись о участии есть
r = Tourney.reward(view({ me: { out: 1 } }), 'p3', 100); assert.strictEqual(r.roundsWon, 0); assert.strictEqual(r.coins, 0);
// не участвовал / турнир не завершён
assert.strictEqual(Tourney.reward(view({ me: null }), 'p4', 100), null);
assert.strictEqual(Tourney.reward(view({ state: 'running' }), 'p1', 100), null);
assert.strictEqual(Tourney.reward(null, 'p1', 100), null);
console.log('tourney: все тесты пройдены');
{
  const a = require('assert'), T = require('../js/tourney.js');
  a.deepStrictEqual(T.seasonReward({ kind: 'week', place: 1 }, 10), { coins: 80, title: 'ratingWeek', kind: 'week', place: 1 });
  a.strictEqual(T.seasonReward({ kind: 'month', place: 3 }, 10).coins, 80); a.strictEqual(T.seasonReward({ kind: 'month', place: 2 }, 10).title, null);
  a.strictEqual(T.folkReward(10), 50);
  a.strictEqual(T.seasonReward({ kind: 'month', place: 4 }, 10), null); a.strictEqual(T.seasonReward({ kind: 'year', place: 1 }, 10), null);
  console.log('tourney: награды сезона ок');
}
{
  const a = require('assert'), T = require('../js/tourney.js');
  a.strictEqual(T.pvpRank(0).index, -1); a.strictEqual(T.pvpRank(0).next.id, 'pvp1'); a.strictEqual(T.pvpRank(0).left, 1);
  a.strictEqual(T.pvpRank(1).rank.id, 'pvp1'); a.strictEqual(T.pvpRank(14).rank.id, 'pvp2'); a.strictEqual(T.pvpRank(15).rank.id, 'pvp3'); a.strictEqual(T.pvpRank(14).left, 1);
  a.strictEqual(T.pvpRank(250).rank.id, 'pvp6'); a.strictEqual(T.pvpRank(250).next, null); a.strictEqual(T.pvpRank(9999).index, 5);
  a.ok(T.PVP_RANKS.every((r, i) => i === 0 || (r.at > T.PVP_RANKS[i - 1].at && r.mult > T.PVP_RANKS[i - 1].mult)), 'пороги и награды растут');
  console.log('tourney: ранги живых боёв ок');
}
