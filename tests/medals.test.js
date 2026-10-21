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
  A.strictEqual(M.bonusFor('shot:15').health, 8); A.strictEqual(M.bonusFor('shot:40').ricochet, 1); A.strictEqual(M.bonusFor('shot:40').health, 12); A.ok(M.nameFor('shot:5').includes('5')); console.log('shot medals ok'); }

/* ---------- 1.6.2: комплекты разделов ---------- */
{
  const none = Medals.bonusStats([]), part = Bestiary.ORDER.slice(1).map((s) => ({ id: Medals.killMedalId(s) }));
  assert.strictEqual(Medals.groupDone('kill', part), false);
  const full = part.concat([{ id: Medals.killMedalId(Bestiary.ORDER[0]) }]);
  assert.strictEqual(Medals.groupDone('kill', full), true);
  const sum = (e) => Object.values(e).reduce((a, v) => a + v, 0);
  const perMedal = full.reduce((a, m) => a + sum(Medals.bonusFor(m.id)), 0);
  assert.strictEqual(sum(Medals.bonusStats(full)), perMedal + sum(Medals.GROUPS.kill.bonus), 'комплект добавляет награду раздела');
  assert.deepStrictEqual(Medals.groupProgress('streak', []), { done: 0, total: Medals.STREAK_MILESTONES.length });
  assert.strictEqual(sum(none), 0);
}
console.log('medals 1.6.2: комплекты ok');

/* ---------- 1.6.2: ступени медали за вид ---------- */
{
  assert.deepStrictEqual([0, 1, 24, 25, 99, 100, 500].map(Medals.rankFor), [0, 1, 1, 2, 2, 3, 3]);
  assert.strictEqual(Medals.nextRankWins(1), 25); assert.strictEqual(Medals.nextRankWins(100), null);
  const id = Medals.killMedalId('wolf'), stat = Medals.KILL_STAT.wolf, one = Medals.bonusFor(id)[stat];
  assert.strictEqual(Medals.bonusFor(id, { wolf: { wins: 1 } })[stat], one);
  assert.strictEqual(Medals.bonusFor(id, { wolf: { wins: 30 } })[stat], one * 2);
  assert.strictEqual(Medals.bonusFor(id, { wolf: { wins: 120 } })[stat], one * 3);
  const earned = [{ id }];
  assert.strictEqual(Medals.bonusStats(earned, { wolf: { wins: 120 } })[stat], one * 3);
}
console.log('medals 1.6.2: ступени ok');

/* ---------- 1.6.2: медали за стиль боя ---------- */
{
  const ids = Medals.STYLE_ORDER.map(Medals.styleMedalId);
  assert.deepStrictEqual(Medals.checkStyleMedals({ fullHp: false, moves: 9, spells: 4, elixirs: 0 }, []), []);
  assert.deepStrictEqual(Medals.checkStyleMedals({ fullHp: true, moves: 3, spells: 0, elixirs: 0 }, []), ['style:flawless', 'style:swift', 'style:nomagic']);
  assert.deepStrictEqual(Medals.checkStyleMedals({ fullHp: false, moves: 8, spells: 1, elixirs: 3 }, []), ['style:onespell', 'style:alchemist']);
  assert.deepStrictEqual(Medals.checkStyleMedals({ fullHp: true, moves: 3, spells: 0, elixirs: 0 }, [{ id: 'style:flawless' }]), ['style:swift', 'style:nomagic'], 'уже полученная не выдаётся');
  for (const id of ids) { assert.ok(Object.keys(Medals.bonusFor(id)).length === 1, id); assert.ok(Medals.nameFor(id) !== id, id); }
  assert.strictEqual(Medals.groupDone('style', ids.map((id) => ({ id }))), true);
}
console.log('medals 1.6.2: стиль боя ok');

/* ---------- 1.6.2: медали за мир ---------- */
{
  const none = Medals.checkWorldMedals({ visited: {}, caches: 0, altars: 0 }, {}, []);
  assert.deepStrictEqual(none, []);
  const vis = {}; for (let i = 0; i < 12; i++) vis['b' + i] = 1;
  assert.deepStrictEqual(Medals.checkWorldMedals({ visited: vis, caches: 9, altars: 5 }, {}, []), ['world:visit', 'world:altars']);
  assert.deepStrictEqual(Medals.checkWorldMedals({ visited: vis, caches: 9, altars: 5 }, {}, [{ id: 'world:visit' }]), ['world:altars']);
  const d = { chestOpened: true, xchests: { ruby: true, emerald: true } };
  assert.ok(!Medals.checkWorldMedals({}, d, []).includes('world:chests'), 'нужны все четыре сундука');
  d.xchests.obsidian = true;
  assert.ok(Medals.checkWorldMedals({}, d, []).includes('world:chests'));
  for (const k of Medals.WORLD_ORDER) { const id = Medals.worldMedalId(k); assert.ok(Object.keys(Medals.bonusFor(id)).length === 1 && Medals.nameFor(id) !== id, id); }
}
console.log('medals 1.6.2: мир ok');

/* ---------- 1.6.2: коллекции семейств ---------- */
{
  const C = Medals.collections(), und = C.find((c) => c.family === 'Нежить'), beasts = C.find((c) => c.family === 'Звери');
  assert.ok(und && und.species.length >= 2 && und.pct === 5 && beasts.pct === 8 && !C.some((c) => c.species.length < 2));
  const part = und.species.slice(1).map((s) => ({ id: Medals.killMedalId(s) }));
  assert.strictEqual(Medals.familyBonus(part, 'Нежить'), 0);
  assert.strictEqual(Medals.familyBonus(part.concat([{ id: Medals.killMedalId(und.species[0]) }]), 'Нежить'), 5);
  assert.strictEqual(Medals.familyBonus([], 'Нет такого'), 0);
  assert.strictEqual(Medals.collectionProgress(und, part), und.species.length - 1);
}
console.log('medals 1.6.2: коллекции ok');

/* ---------- 1.6.2: скрытые медали ---------- */
{
  assert.deepStrictEqual(Medals.checkSecretMedals({ win: true, hpLeft: 5, tier: 2, heroTier: 2 }, []), []);
  assert.deepStrictEqual(Medals.checkSecretMedals({ win: true, hpLeft: 1, tier: 4, heroTier: 2 }, []), ['secret:hair', 'secret:giant']);
  assert.deepStrictEqual(Medals.checkSecretMedals({ win: false, lossStreak: 10 }, []), ['secret:stubborn']);
  assert.deepStrictEqual(Medals.checkSecretMedals({ win: false, lossStreak: 9 }, []), []);
  assert.deepStrictEqual(Medals.checkSecretMedals({ spent: 100 * 10000 }, [{ id: 'secret:spender' }]), []);
  assert.deepStrictEqual(Medals.checkSecretMedals({ spent: 100 * 10000 - 1 }, []), []);
  for (const k of Medals.SECRET_ORDER) { const id = Medals.secretMedalId(k); assert.ok(Object.keys(Medals.bonusFor(id)).length === 1 && Medals.nameFor(id) !== id, id); }
}
console.log('medals 1.6.2: скрытые ok');

/* ---------- 1.6.2: серия дней в Испытании дня ---------- */
{
  let s = Medals.dailyStep(null, '2026-10-30'); assert.deepStrictEqual(s, { last: '2026-10-30', n: 1 });
  s = Medals.dailyStep(s, '2026-10-30'); assert.strictEqual(s.n, 1, 'тот же день не считается дважды');
  s = Medals.dailyStep(s, '2026-10-31'); assert.strictEqual(s.n, 2);
  s = Medals.dailyStep(s, '2026-11-01'); assert.strictEqual(s.n, 3, 'переход через месяц');
  s = Medals.dailyStep(s, '2026-11-03'); assert.strictEqual(s.n, 1, 'пропущенный день сбрасывает серию');
  s = Medals.dailyStep({ last: '2026-12-31', n: 6 }, '2027-01-01'); assert.strictEqual(s.n, 7, 'переход через год');
  assert.strictEqual(Medals.checkDailyMedal(2, []), null);
  assert.strictEqual(Medals.checkDailyMedal(3, []), 'daily:3');
  assert.strictEqual(Medals.checkDailyMedal(7, [{ id: 'daily:3' }]), 'daily:7');
  assert.strictEqual(Medals.checkDailyMedal(3, [{ id: 'daily:3' }]), null);
  for (const n of Medals.DAILY_MILESTONES) assert.ok(Object.keys(Medals.bonusFor(Medals.dailyMedalId(n))).length >= 1 && Medals.nameFor('daily:' + n) !== 'daily:' + n);
}
console.log('medals 1.6.2: серия дней ok');

/* ---------- 1.6.3: умения и реликвии за комплекты ---------- */
{
  for (const k of Medals.GROUP_ORDER) {
    if (k === 'strike') assert.ok(!Medals.PERKS[k], '2.0.4: умения «Добивание» больше нет');   // комплект остаётся: бонусы и реликвия
    else assert.ok(Medals.PERKS[k] && Medals.PERKS[k].name && Medals.PERKS[k].desc, 'умение раздела ' + k);
    const rel = Gear.item({ id: Medals.relicId(k), tier: 1 });
    assert.ok(rel && rel.type === 'amulet' && rel.rarity === 'epic', 'реликвия ' + k);
    assert.ok(!Gear.ITEMS.some((i) => i.id === rel.id), 'реликвия не в каталоге добычи');
    assert.ok(!Gear.itemsFor('human').some((i) => i.id === rel.id));
  }
  const all = Medals.GROUPS.daily.ids().map((id) => ({ id, tier: 1 }));
  assert.ok(Medals.hasPerk(all, 'daily') && !Medals.hasPerk([], 'daily'));
  assert.deepStrictEqual(Medals.perksOf(all), ['daily']);
}
console.log('medals 1.6.3: ok');
