// Тесты заданий собеседников (Таверна и Мельница). Запуск: node tests/quests.test.js
const assert = require('assert');
const Gear = require('../js/items.js');
global.Gear = Gear;
const Quests = require('../js/quests.js');

// десять заданий (пять от трактирщика, пять от мыши), у каждого — цель, описание и понятная награда
assert.strictEqual(Quests.LIST.length, 10);
assert.strictEqual(new Set(Quests.LIST.map((q) => q.id)).size, 10, 'id заданий уникальны');
assert.strictEqual(Quests.LIST.filter((q) => q.giver === 'tavern').length, 5, 'у трактирщика пять заданий');
assert.strictEqual(Quests.LIST.filter((q) => q.giver === 'mill').length, 5, 'у мыши пять заданий');
for (const q of Quests.LIST) {
  assert.ok(q.giver === 'tavern' || q.giver === 'mill', q.id);
  assert.ok(q.title && q.desc && q.rewardText, q.id);
  assert.ok(q.goal > 0, q.id);
  if (q.reward.item) assert.ok(Gear.ITEMS.some((i) => i.id === q.reward.item), 'нет такой вещи: ' + q.reward.item);
  if (q.reward.cons) for (const k of Object.keys(q.reward.cons)) assert.ok(Gear.CONSUMABLES[k], 'нет такого расходника: ' + k);
  if (q.reward.coins) assert.ok(q.reward.coins > 0, q.id);
}

// прогресс считается из профиля и не превышает цель
const fresh = () => ({ wins: 0, xp: 0, loadout: { amulet: null }, bestiary: {}, resources: {}, seen: {}, items: [], quests: {} });
let d = fresh();
let list = Quests.list(d);
assert.ok(list.every((q) => !q.done && !q.claimed && q.value === 0));

// list(data, giver) фильтрует по собеседнику
assert.strictEqual(Quests.list(d, 'tavern').length, 5);
assert.strictEqual(Quests.list(d, 'mill').length, 5);
assert.ok(Quests.list(d, 'tavern').every((q) => q.giver === 'tavern'));
assert.ok(Quests.list(d, 'mill').every((q) => q.giver === 'mill'));

d.wins = 1;
list = Quests.list(d);
assert.strictEqual(list.find((q) => q.id === 'first-blood').done, true);
assert.strictEqual(list.find((q) => q.id === 'veteran').done, false);

d.wins = 20;                             // прогресс не должен «перехлёстывать» цель
assert.strictEqual(Quests.list(d).find((q) => q.id === 'veteran').value, Quests.find('veteran').goal);

d = fresh();
d.loadout.amulet = 'some-uid';
assert.strictEqual(Quests.list(d).find((q) => q.id === 'amulet').done, true);

d = fresh();
d.bestiary = { rat: { wins: 1, tier: 1 }, wolf: { wins: 1, tier: 1 }, boar: { wins: 1, tier: 1 } };
assert.strictEqual(Quests.list(d).find((q) => q.id === 'bestiary-3').done, true);

d = fresh();
d.resources = { 'hide:1': 4, 'fang:1': 6 };
assert.strictEqual(Quests.list(d).find((q) => q.id === 'resources-10').done, true);

// задания мыши (Мельница): свои поля профиля
d = fresh();
d.xp = 999999;                          // с большим запасом хватит на 2-й уровень
assert.strictEqual(Quests.list(d).find((q) => q.id === 'level-2').done, true);

d = fresh();
d.items = Array.from({ length: 10 }, (_, i) => ({ uid: String(i) }));
assert.strictEqual(Quests.list(d).find((q) => q.id === 'collector').done, true);

d = fresh();
d.resources = { 'hide:1': 1, 'fang:1': 1, 'bone:2': 1 };
assert.strictEqual(Quests.list(d).find((q) => q.id === 'resource-kinds').done, true, 'три разных вида ресурса');
d.resources = { 'hide:1': 5, 'hide:2': 5 };                // один вид ('hide'), просто на разных уровнях
assert.strictEqual(Quests.list(d).find((q) => q.id === 'resource-kinds').done, false);

d = fresh();
d.wins = 10;
assert.strictEqual(Quests.list(d).find((q) => q.id === 'ten-wins').done, true);

d = fresh();
d.seen = { rat: 1, wolf: 1, boar: 2, skeleton: 3, bandit: 1 };
assert.strictEqual(Quests.list(d).find((q) => q.id === 'scout').done, true);

// canClaim: только когда цель достигнута и награда ещё не забрана
d = fresh();
assert.strictEqual(Quests.canClaim(d, 'first-blood'), false);
d.wins = 1;
assert.strictEqual(Quests.canClaim(d, 'first-blood'), true);
d.quests['first-blood'] = true;
assert.strictEqual(Quests.canClaim(d, 'first-blood'), false, 'уже получено — второй раз нельзя');
assert.strictEqual(Quests.canClaim(d, 'no-such-quest'), false);

// claim(): выдаёт награду через Profile один раз и помечает задание полученным
function mockProfile(data) {
  return {
    data,
    addCoins(n) { data.coins = (data.coins || 0) + n; },
    addItem(entry) { data.items = data.items || []; data.items.push(entry); },
    addConsumable(k, n) { data.backpack = data.backpack || {}; data.backpack[k] = (data.backpack[k] || 0) + n; },
    save() { data.saved = true; },
  };
}
d = fresh();
d.wins = 1;
global.Profile = mockProfile(d);
assert.strictEqual(Quests.claim('first-blood'), true);
assert.strictEqual(d.coins, 60, 'первая кровь даёт 60 монет');
assert.strictEqual(d.quests['first-blood'], true);
assert.strictEqual(Quests.claim('first-blood'), false, 'повторно забрать нельзя');
assert.strictEqual(d.coins, 60, 'награда не выдалась второй раз');

d = fresh();
d.bestiary = { rat: {}, wolf: {}, boar: {} };
global.Profile = mockProfile(d);
assert.strictEqual(Quests.claim('bestiary-3'), true);
assert.ok(d.items && d.items.some((e) => e.id === 'amulet-copper'), 'награда — медный амулет');

d = fresh();
d.wins = 6;
global.Profile = mockProfile(d);
assert.strictEqual(Quests.claim('veteran'), true);
assert.strictEqual(d.backpack.elixir, 1);
assert.strictEqual(d.backpack.potion, 2);

d = fresh();
d.wins = 10;
global.Profile = mockProfile(d);
assert.strictEqual(Quests.claim('ten-wins'), true);
assert.ok(d.items && d.items.some((e) => e.id === 'amulet-power'), 'награда мыши — амулет силы');
assert.strictEqual(Quests.claim('ten-wins'), false, 'повторно забрать нельзя');

console.log('quests: все тесты пройдены');
