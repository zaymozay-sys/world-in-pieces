// Тесты ежедневных механик: поручение Библиотеки и лотерея Таверны. Запуск: node tests/daily.test.js
const assert = require('assert');
const Daily = require('../js/daily.js');
const Gear = require('../js/items.js');
const Bestiary = require('../js/bestiary.js');
const Hero = require('../js/hero.js');

function mockProfile(data, level = 1) {
  return {
    data,
    level: () => level,
    addCoins(n) { data.coins = (data.coins || 0) + n; },
    addItem(entry) { data.items = data.items || []; data.items.push(entry); },
    addConsumable(k, n = 1) { data.backpack = data.backpack || {}; data.backpack[k] = (data.backpack[k] || 0) + n; },
    addRes(kind, tier, n) { data.resources = data.resources || {}; const k = kind + ':' + tier; data.resources[k] = (data.resources[k] || 0) + n; },
    spend(n) { if ((data.coins || 0) < n) return false; data.coins -= n; return true; },
    save() { data.saved = true; },
  };
}
const fresh = (coins = 100000) => ({ coins, faction: null });
// Возвращает генератор, отдающий по очереди значения из vals, а дальше — последнее значение.
function seq(vals) { let i = 0; return () => (i < vals.length ? vals[i++] : vals[vals.length - 1]); }

/* ---------- таблица лотереи ---------- */
const sumChance = Daily.TABLE.reduce((s, r) => s + r.chance, 0);
assert.ok(Math.abs(sumChance - 1) < 1e-9, 'вероятности исходов лотереи должны давать в сумме 1');
assert.ok(Daily.TABLE.every((r) => r.chance > 0 && r.mult >= 0), 'все исходы возможны и не дают отрицательную ценность');

// Ожидаемая отдача билета — заметно ниже его цены (иначе лотерея не сток, а способ заработка).
const ev = Daily.TABLE.reduce((s, r) => s + r.chance * r.mult, 0);
assert.ok(ev > 0.4 && ev < 0.85, `ожидаемая отдача билета должна быть заметно ниже цены (получено ${ev})`);

/* ---------- статистическая проверка pick(): частоты должны сходиться к заявленным вероятностям ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
{
  const rand = mulberry32(12345), N = 60000, counts = {};
  for (let i = 0; i < N; i++) { const k = Daily.pick(rand).kind; counts[k] = (counts[k] || 0) + 1; }
  for (const row of Daily.TABLE) {
    const freq = (counts[row.kind] || 0) / N;
    assert.ok(Math.abs(freq - row.chance) < 0.02, `${row.kind}: частота ${freq} далека от заявленной ${row.chance}`);
  }
}

/* ---------- today() / ensure(): местная дата, сброс при смене дня ---------- */
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(Daily.today()), 'today() отдаёт дату вида ГГГГ-ММ-ДД');

let data = { daily: { date: 'вчера-давно', wins: 5, questClaimed: true, lottery: true } };
const d = Daily.ensure(data);
assert.strictEqual(d.date, Daily.today(), 'ensure() переводит дату на сегодня');
assert.strictEqual(d.wins, 0, 'счётчик побед сбрасывается в новый день');
assert.strictEqual(d.questClaimed, false, 'поручение дня сбрасывается в новый день');
assert.strictEqual(d.lottery, false, 'билет лотереи снова доступен в новый день');

data = {};
Daily.ensure(data);
assert.ok(data.daily && data.daily.date === Daily.today(), 'ensure() создаёт daily с нуля, если его не было');

/* ---------- поручение библиотеки: value/goal/done/claimed ---------- */
data = { daily: { date: Daily.today(), wins: 0, questClaimed: false, lottery: false } };
let q = Daily.libraryQuest(data);
assert.deepStrictEqual(q, { value: 0, goal: Daily.LIB_GOAL, done: false, claimed: false });

global.Profile = mockProfile(data);
Daily.registerWin();
q = Daily.libraryQuest(data);
assert.strictEqual(q.value, 1);
assert.strictEqual(q.done, true, 'одной победы достаточно для поручения дня');
assert.strictEqual(q.claimed, false);

Daily.registerWin();                    // вторая победа за день не «переполняет» цель
assert.strictEqual(Daily.libraryQuest(data).value, Daily.LIB_GOAL);

assert.strictEqual(Daily.canClaimLibrary(data), true);
const before = data.coins || 0;
const reward = Daily.claimLibrary();
assert.ok(reward && reward.coins > 0 && reward.cons === 'dust', 'награда — монеты и каменная пыль');
assert.strictEqual(data.coins, before + reward.coins);
assert.strictEqual(data.backpack.dust, 1);
assert.strictEqual(data.daily.questClaimed, true);
assert.strictEqual(Daily.canClaimLibrary(data), false, 'повторно поручение не забрать');
assert.strictEqual(Daily.claimLibrary(), null, 'claimLibrary() не выдаёт награду дважды');
assert.strictEqual(data.coins, before + reward.coins, 'повторный claim не начисляет монеты снова');

// нельзя забрать награду, если поручение ещё не выполнено
data = fresh();
global.Profile = mockProfile(data);
assert.strictEqual(Daily.canClaimLibrary(data), false);
assert.strictEqual(Daily.claimLibrary(), null);

/* ---------- цена билета растёт с уровнем героя (та же шкала, что у расходников) ---------- */
data = fresh();
global.Profile = mockProfile(data, 1);
const price1 = Daily.ticketPrice();
assert.strictEqual(price1, Hero.consumablePrice(120, 1));
global.Profile = mockProfile(data, 26);
const price26 = Daily.ticketPrice();
assert.ok(price26 > price1, 'билет дорожает вместе с ценами расходников по мере роста уровня героя');

/* ---------- покупка билета: раз в день, «беспроигрышно» ---------- */
// не хватает монет — билет не продаётся и день не считается использованным
data = { coins: 5, faction: null };
global.Profile = mockProfile(data, 1);
assert.strictEqual(Daily.canBuyTicket(data), true);
let r = Daily.buyTicket(seq([0]));
assert.deepStrictEqual(r, { ok: false, reason: 'coins' });
assert.strictEqual(data.coins, 5, 'монеты не списываются при неудачной покупке');
assert.strictEqual(Daily.canBuyTicket(data), true, 'билет всё ещё доступен на сегодня');

// пять исходов таблицы — детерминированный rand выбирает каждую ветку по очереди
const cases = [
  { name: 'ресурсы',   rand: seq([0.00, 0.0]), kind: 'res' },
  { name: 'монеты',    rand: seq([0.60]),      kind: 'coins' },
  { name: 'расходник', rand: seq([0.85, 0.0]), kind: 'cons' },
  { name: 'вещь',      rand: seq([0.95, 0.0]), kind: 'item' },
  { name: 'джекпот',   rand: seq([0.99, 0.0]), kind: 'jackpot' },
];
for (const c of cases) {
  data = fresh();
  global.Profile = mockProfile(data, 12);
  const price = Daily.ticketPrice();
  const before = data.coins;
  const res = Daily.buyTicket(c.rand);
  assert.strictEqual(res.ok, true, c.name);
  assert.strictEqual(res.kind, c.kind, c.name);
  assert.strictEqual(res.price, price, c.name);
  assert.ok(res.text && res.text.length > 0, c.name);
  assert.strictEqual(data.daily.lottery, true, c.name + ': билет отмечен использованным');
  assert.strictEqual(Daily.canBuyTicket(data), false, c.name + ': повторно в тот же день нельзя');
  // билет всегда даёт хоть что-то (беспроигрышность)
  const gotSomething = (data.coins > before - price) || (data.items && data.items.length) ||
    (data.resources && Object.keys(data.resources).length) || (data.backpack && Object.keys(data.backpack).length);
  assert.ok(gotSomething, c.name + ': билет не должен оставаться пустым');
  // повторная покупка в тот же день отклоняется, монеты второй раз не списываются
  const coinsAfterFirst = data.coins;
  const second = Daily.buyTicket(c.rand);
  assert.deepStrictEqual(second, { ok: false, reason: 'already' }, c.name);
  assert.strictEqual(data.coins, coinsAfterFirst, c.name + ': вторая попытка не списывает монеты');
}

// вещь из джекпота — на цвет выше текущего (в пределах максимума)
data = fresh();
global.Profile = mockProfile(data, 12);
Daily.buyTicket(seq([0.99, 0]));
const jackItem = Gear.item(data.items[0]);
assert.strictEqual(jackItem.tier, Math.min(10, Hero.tierFor(12) + 1), 'джекпот даёт вещь на цвет выше цвета героя');

console.log('daily.test.js: OK');
