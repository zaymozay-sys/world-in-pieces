// Тесты медалей (js/medals.js): за первую победу над видом и за вехи линий из 5 камней. Запуск: node tests/medals.test.js
const assert = require('assert');
global.Tiers = require('../js/tiers.js');
global.Balance = require('../js/balance.js');
const Gear = require('../js/items.js');
global.Gear = Gear;
const Bestiary = require('../js/bestiary.js');
global.Bestiary = Bestiary;
const Medals = require('../js/medals.js');

/* ---------- медали за первую победу над видом ---------- */

// нет победы — медали нет
assert.strictEqual(Medals.checkKillMedal('rat', {}), null);
assert.strictEqual(Medals.checkKillMedal('rat', { rat: { wins: 0, tier: 1 } }), null);
// одна победа — медаль положена
assert.strictEqual(Medals.checkKillMedal('rat', { rat: { wins: 1, tier: 1 } }), 'kill:rat');
// уже получена — второй раз не выдаётся
assert.strictEqual(Medals.checkKillMedal('rat', { rat: { wins: 3, tier: 1 } }, [{ id: 'kill:rat', tier: 1 }]), null);
// на каждый вид бестиария есть своя медаль
for (const id of Bestiary.ORDER) {
  assert.strictEqual(Medals.checkKillMedal(id, { [id]: { wins: 1, tier: 1 } }), Medals.killMedalId(id), id);
}
// неизвестный вид — null, не падает
assert.strictEqual(Medals.checkKillMedal('unicorn', { unicorn: { wins: 1 } }), null);

/* ---------- вехи по линиям из 5 камней ---------- */

// серия возрастает и проверяется тестами: числа должны идти строго по возрастанию
for (let i = 1; i < Medals.STREAK_MILESTONES.length; i++) {
  assert.ok(Medals.STREAK_MILESTONES[i] > Medals.STREAK_MILESTONES[i - 1], 'вехи должны расти');
}
// не достигнута первая веха
assert.strictEqual(Medals.checkFiveStreakMedal(Medals.STREAK_MILESTONES[0] - 1, []), null);
// достигнута первая — выдаётся её id
assert.strictEqual(Medals.checkFiveStreakMedal(Medals.STREAK_MILESTONES[0], []), Medals.streakMedalId(Medals.STREAK_MILESTONES[0]));
// первая уже получена, вторая ещё не достигнута — ничего не выдаётся
{
  const earned = [{ id: Medals.streakMedalId(Medals.STREAK_MILESTONES[0]), tier: 1 }];
  assert.strictEqual(Medals.checkFiveStreakMedal(Medals.STREAK_MILESTONES[0] + 1, earned), null);
}
// перескочили сразу несколько вех (например, импорт сохранения) — выдаётся самая МЛАДШАЯ неполученная
assert.strictEqual(Medals.checkFiveStreakMedal(Medals.STREAK_MILESTONES[2], []), Medals.streakMedalId(Medals.STREAK_MILESTONES[0]));
// все вехи получены — больше ничего не выдаётся
{
  const earned = Medals.STREAK_MILESTONES.map((n) => ({ id: Medals.streakMedalId(n), tier: 1 }));
  assert.strictEqual(Medals.checkFiveStreakMedal(999999, earned), null);
}

/* ---------- бонусы характеристик ---------- */

// бонус одной медали — небольшой (много меньше, чем типичная вещь высокого цвета)
for (const id of Bestiary.ORDER) {
  const b = Medals.bonusFor(Medals.killMedalId(id));
  const [stat, val] = Object.entries(b)[0];
  assert.ok(val > 0 && val <= 3, `${id}: бонус медали должен быть небольшим (${stat} +${val})`);
}
// суммарный бонус растёт с числом медалей и складывается по характеристикам (combine-совместим)
const one = Medals.bonusStats([{ id: 'kill:rat', tier: 1 }]);
const two = Medals.bonusStats([{ id: 'kill:rat', tier: 1 }, { id: 'kill:wolf', tier: 1 }]);
const totalOne = Object.values(one).reduce((a, b) => a + b, 0);
const totalTwo = Object.values(two).reduce((a, b) => a + b, 0);
assert.ok(totalTwo > totalOne, 'бонус растёт с числом медалей');
assert.deepStrictEqual(Medals.bonusStats([]), Gear.blankStats());
// бонус вехи растёт для более далёких вех (награда весомее)
const firstStreak = Object.values(Medals.bonusFor(Medals.streakMedalId(Medals.STREAK_MILESTONES[0]))).reduce((a, b) => a + b, 0);
const lastStreak = Object.values(Medals.bonusFor(Medals.streakMedalId(Medals.STREAK_MILESTONES[Medals.STREAK_MILESTONES.length - 1]))).reduce((a, b) => a + b, 0);
assert.ok(lastStreak > firstStreak, 'дальние вехи должны награждать весомее ближних');

// ~10-20 медалей не должны перевешивать обычную прокачку снаряжением: сумма стат-очков заметно
// меньше типичного бюджета снаряжения уже на 1-м уровне героя (Balance.hero.budget = 110)
{
  const ids = Bestiary.ORDER.slice(0, 15).map((id) => ({ id: Medals.killMedalId(id), tier: 1 }));
  const sum = Object.values(Medals.bonusStats(ids)).reduce((a, b) => a + b, 0);
  assert.ok(sum < global.Balance.hero.budget / 2, `сумма бонусов ${sum} очков медалей должна быть заметно меньше бюджета снаряжения`);
}

/* ---------- названия ---------- */
assert.ok(Medals.nameFor('kill:rat').includes(Bestiary.MONSTERS.rat.name));
assert.ok(Medals.nameFor('streak:150').includes('150'));

/* ---------- серия «Удар» (добивания заклинанием Удар) ---------- */

for (let i = 1; i < Medals.STRIKE_MILESTONES.length; i++) {
  assert.ok(Medals.STRIKE_MILESTONES[i] > Medals.STRIKE_MILESTONES[i - 1], 'вехи Удара должны расти');
}
assert.strictEqual(Medals.checkStrikeMedal(Medals.STRIKE_MILESTONES[0] - 1, []), null);
assert.strictEqual(Medals.checkStrikeMedal(Medals.STRIKE_MILESTONES[0], []), Medals.strikeMedalId(Medals.STRIKE_MILESTONES[0]));
{
  const earned = [{ id: Medals.strikeMedalId(Medals.STRIKE_MILESTONES[0]), tier: 1 }];
  assert.strictEqual(Medals.checkStrikeMedal(Medals.STRIKE_MILESTONES[0] + 1, earned), null);
}
assert.strictEqual(Medals.checkStrikeMedal(Medals.STRIKE_MILESTONES[2], []), Medals.strikeMedalId(Medals.STRIKE_MILESTONES[0]), 'выдаёт самую младшую неполученную веху');
{
  const earned = Medals.STRIKE_MILESTONES.map((n) => ({ id: Medals.strikeMedalId(n), tier: 1 }));
  assert.strictEqual(Medals.checkStrikeMedal(999999, earned), null);
}
// бонус серии небольшой и растёт для дальних вех, как и у streak:
{
  const b0 = Medals.bonusFor(Medals.strikeMedalId(Medals.STRIKE_MILESTONES[0]));
  const bLast = Medals.bonusFor(Medals.strikeMedalId(Medals.STRIKE_MILESTONES[Medals.STRIKE_MILESTONES.length - 1]));
  const v0 = Object.values(b0).reduce((a, b) => a + b, 0), vLast = Object.values(bLast).reduce((a, b) => a + b, 0);
  assert.ok(v0 > 0 && v0 <= 3, 'бонус первой вехи Удара небольшой');
  assert.ok(vLast > v0, 'дальняя веха Удара весомее ближней');
}
assert.ok(Medals.nameFor(Medals.strikeMedalId(50)).includes('50'));

/* ---------- Стена доблести: тир открывается не раньше уровня героя (Medals.tierUnlockLevel) ---------- */

// медали за первую победу видны сразу — им не нужно достигать уровня, чтобы показать свой тир
for (const id of Bestiary.ORDER) assert.strictEqual(Medals.tierUnlockLevel(Medals.killMedalId(id)), 1);
// серии streak:/strike: — требуемый уровень растёт с индексом вехи (дальше веха — выше требуемый уровень)
for (const list of [Medals.STREAK_MILESTONES, Medals.STRIKE_MILESTONES]) {
  const ids = list.map((n) => (list === Medals.STREAK_MILESTONES ? Medals.streakMedalId(n) : Medals.strikeMedalId(n)));
  for (let i = 1; i < ids.length; i++) {
    assert.ok(Medals.tierUnlockLevel(ids[i]) >= Medals.tierUnlockLevel(ids[i - 1]), 'требуемый уровень не убывает с вехой');
  }
  assert.strictEqual(Medals.tierUnlockLevel(ids[0]), 1, 'первая веха открыта с самого начала');
}
// неизвестный id — безопасный дефолт, не падает
assert.strictEqual(Medals.tierUnlockLevel('unknown:1'), 1);

console.log('medals: все тесты пройдены');
{ const M = require('../js/medals.js'); const A = require('assert');
  A.strictEqual(M.checkShotMedal(5, []), 'shot:5'); A.strictEqual(M.checkShotMedal(4, []), null);
  A.strictEqual(M.bonusFor('shot:15').initiative, 2); A.ok(M.nameFor('shot:5').includes('5')); console.log('shot medals ok'); }
