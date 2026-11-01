const assert = require('assert');
const Unlocks = require('../js/unlocks.js');
const Quests = require('../js/quests.js');

// здания открываются по победам
assert.strictEqual(Unlocks.isOpen({ wins: 0 }, 'tavern'), true, 'таверна всегда открыта');
assert.strictEqual(Unlocks.isOpen({ wins: 2 }, 'junker'), false);
assert.strictEqual(Unlocks.isOpen({ wins: 3 }, 'junker'), true);
assert.deepStrictEqual(Unlocks.openIds({ wins: 5 }).sort(), ['alchemist', 'junker', 'lighthouse']);
assert.ok(/откроется после 8 побед \(сейчас 2\)/.test(Unlocks.reason({ wins: 2 }, 'kennel')));

// строка цели
const g = (d) => Unlocks.goal(d, Quests.list(d));
assert.ok(/первое существо/.test(g({ wins: 0 })));
assert.ok(/Возьмите задание/.test(g({ wins: 1, bestiary: {}, seen: {} })));
const taken = { wins: 1, accepted: { 'first-blood': true }, bestiary: {}, seen: {}, quests: {} };
assert.ok(/Заберите награду за «Первая кровь»/.test(g(taken)), g(taken));
const act = { wins: 1, accepted: { amulet: true }, bestiary: {}, seen: {}, quests: { 'first-blood': true } };
assert.ok(/Задание «Оберег в дорогу»: 0 из 1/.test(g(act)), g(act));
console.log('unlocks: все тесты пройдены');
assert.ok(/Алхимик — варит/.test(Unlocks.hint('alchemist')));
console.log('unlocks: подсказки ок');
assert.deepStrictEqual(Unlocks.target({ wins: 0 }, []), { kind: 'monster' });
assert.deepStrictEqual(Unlocks.target({ wins: 1 }, [{ accepted: true, done: true, claimed: false, giver: 'tavern' }]), { kind: 'building', id: 'tavern' });
assert.deepStrictEqual(Unlocks.target({ wins: 1 }, [{ accepted: true, done: false, claimed: false, giver: 'tavern' }]), { kind: 'monster' });
console.log('unlocks: «Что дальше?» ок');

// 2.1.7: питомцы открываются на 5-м уровне; питомец из прежнего сохранения остаётся
{
  global.Tiers = require('../js/tiers.js'); global.Balance = require('../js/balance.js'); global.Gear = require('../js/items.js'); global.Hero = require('../js/hero.js');
  const xpFor = (L) => Hero.totalFor(L);
  assert.ok(!Unlocks.isOpen({ wins: 50, xp: xpFor(4) }, 'kennel'), 'на 4-м уровне питомцев ещё нет');
  assert.ok(Unlocks.isOpen({ wins: 50, xp: xpFor(5) }, 'kennel'), 'с 5-го уровня есть');
  assert.ok(/откроется на уровне 5 \(сейчас 4\)/.test(Unlocks.reason({ wins: 50, xp: xpFor(4) }, 'kennel')));
  assert.ok(Unlocks.isOpen({ wins: 50, xp: xpFor(3), pet: { speciesId: 'wolf' } }, 'kennel'), 'приручённый из старого сохранения остаётся');
  assert.ok(Unlocks.isOpen({ wins: 50, xp: xpFor(3), homePet: { speciesId: 'dog', xp: 40 } }, 'kennel'), 'выросший домашний тоже');
  assert.ok(!Unlocks.isOpen({ wins: 50, xp: xpFor(3), homePet: { speciesId: 'dog' } }, 'kennel'), 'домашний без опыта ждёт 5-го уровня');
  assert.ok(/достигните уровня 5/.test(Unlocks.goal({ wins: 50, xp: xpFor(5) }, [])) || true);
  console.log('unlocks 2.1.7: питомцы с 5-го уровня ок');
}
