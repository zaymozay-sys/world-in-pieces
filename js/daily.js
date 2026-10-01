/* Ежедневные механики: поручение Библиотеки (бобёр-хранитель) и билет беспроигрышной лотереи Таверны.
   Обе завязаны на календарную дату по МЕСТНОМУ времени игрока (не UTC — иначе день менялся бы в полночь
   Гринвича, а не в полночь игрока). Дата и счётчики хранятся в Profile.data.daily и сбрасываются здесь же,
   при первом обращении в новый день — отдельно от обычных заданий трактирщика/мыши (js/quests.js), у
   которых прогресс копится за всё время игры, а не за один день.

   Баланс лотереи: билет «беспроигрышный» — любой исход даёт хоть что-то, но математическое ожидание
   отдачи заметно ниже цены билета (около 60%, см. TABLE), так что это настоящий сток монет и ресурсов,
   а не способ разбогатеть (тот же принцип, что у Свитка удачи и Хижины старьёвщика — см. дизайн-документ).
   Джекпот редок (2%) и остаётся приятным сюрпризом, а не стратегией заработка. Один билет в день ограничивает
   и общий эффект на экономику: даже щедрый разовый выигрыш не накапливается быстрее, чем раз в сутки. */

const D_G = (typeof Gear !== 'undefined') ? Gear : require('./items.js');
const D_B = (typeof Bestiary !== 'undefined') ? Bestiary : require('./bestiary.js');
const D_H = (typeof Hero !== 'undefined') ? Hero : require('./hero.js');

const Daily = (() => {
  const LIB_GOAL = 1;                 // поручение библиотеки: победить в стольких боях сегодня
  const TICKET_BASE = 120;            // цена билета на 1-м уровне; растёт вместе с ценами расходников (Hero.consumablePrice)

  // kind — что даёт исход, chance — вероятность, mult — ценность исхода как доля цены билета.
  // Сумма chance = 1 (проверяется тестами). Ожидаемая отдача = Σ chance × mult ≈ 0.6 цены билета.
  const TABLE = [
    { kind: 'res',     chance: 0.55, mult: 0.25 },   // немного ресурсов текущего цвета героя
    { kind: 'coins',   chance: 0.25, mult: 0.35 },   // монеты назад
    { kind: 'cons',    chance: 0.12, mult: 0.70 },   // случайный расходник
    { kind: 'item',    chance: 0.06, mult: 2.0 },    // вещь текущего цвета героя
    { kind: 'jackpot', chance: 0.02, mult: 9.0 },    // джекпот: вещь на цвет выше + монеты
  ];

  const pad = (n) => String(n).padStart(2, '0');
  // Локальная (не UTC) календарная дата.
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Возвращает Profile.data.daily, сбрасывая счётчики, если на календаре уже другой день.
  function ensure(data) {
    if (!data.daily || data.daily.date !== today()) data.daily = { date: today(), wins: 0, questClaimed: false, lottery: false };
    return data.daily;
  }

  // Прогресс сегодняшнего поручения библиотеки: { value, goal, done, claimed }.
  function libraryQuest(data) {
    const d = ensure(data);
    const value = Math.min(d.wins, LIB_GOAL);
    return { value, goal: LIB_GOAL, done: value >= LIB_GOAL, claimed: d.questClaimed };
  }

  // Вызывается после победы в бою (см. grantRewards в game.js) — считает победы для поручения дня.
  function registerWin() {
    if (typeof Profile === 'undefined') return;
    const d = ensure(Profile.data);
    d.wins++;
    Profile.save();
  }

  function canClaimLibrary(data) {
    const q = libraryQuest(data);
    return q.done && !q.claimed;
  }

  // Награда скромная и фиксированная — поручение приучает заглядывать в библиотеку каждый день, не более того.
  function claimLibrary() {
    if (typeof Profile === 'undefined' || !canClaimLibrary(Profile.data)) return null;
    const coins = D_H.consumablePrice(90, Profile.level());
    Profile.addCoins(coins);
    Profile.addConsumable('dust', 1);
    Profile.data.daily.questClaimed = true;
    Profile.save();
    return { coins, cons: 'dust' };
  }

  const ticketPrice = () => D_H.consumablePrice(TICKET_BASE, typeof Profile !== 'undefined' ? Profile.level() : 1);
  function canBuyTicket(data) { return !ensure(data).lottery; }

  function pick(rand) {
    const r = rand();
    let acc = 0;
    for (const row of TABLE) { acc += row.chance; if (r < acc) return row; }
    return TABLE[TABLE.length - 1];
  }

  // Покупает билет и сразу разыгрывает его. rand — генератор [0,1) (по умолчанию Math.random, подменяется в тестах).
  // Возвращает { ok:false, reason:'coins'|'already' } либо { ok:true, kind, price, text } с уже выданной наградой.
  function buyTicket(rand = Math.random) {
    if (typeof Profile === 'undefined') return { ok: false, reason: 'no-profile' };
    const data = Profile.data, d = ensure(data);
    if (d.lottery) return { ok: false, reason: 'already' };
    const price = ticketPrice();
    if (!Profile.spend(price)) return { ok: false, reason: 'coins' };
    d.lottery = true;
    const row = pick(rand), L = Profile.level(), tier = D_H.tierFor(L);
    let text;
    if (row.kind === 'res') {
      const kinds = Object.keys(D_B.RESOURCES), kind = kinds[Math.floor(rand() * kinds.length)];
      const n = Math.max(1, Math.round(price * row.mult / D_B.resPrice(kind, tier)));
      Profile.addRes(kind, tier, n);
      text = `${D_B.RESOURCES[kind].name} × ${n}`;
    } else if (row.kind === 'coins') {
      const n = Math.round(price * row.mult);
      Profile.addCoins(n);
      text = `${n} монет`;
    } else if (row.kind === 'cons') {
      const kinds = Object.keys(D_G.CONSUMABLES), kind = kinds[Math.floor(rand() * kinds.length)];
      Profile.addConsumable(kind, 1);
      text = D_G.CONSUMABLES[kind].name;
    } else if (row.kind === 'item') {
      const pool = D_G.itemsFor(data.faction);
      const base = pool[Math.floor(rand() * pool.length)];
      const e = D_G.makeEntry(base.id, Math.max(1, tier));
      Profile.addItem(e);
      text = D_G.item(e).name;
    } else {
      const pool = D_G.itemsFor(data.faction);
      const base = pool[Math.floor(rand() * pool.length)];
      const e = D_G.makeEntry(base.id, Math.min(10, tier + 1));
      Profile.addItem(e);
      const bonus = Math.round(price * 2);
      Profile.addCoins(bonus);
      text = `Джекпот! ${D_G.item(e).name} и ещё ${bonus} монет`;
    }
    Profile.save();
    return { ok: true, kind: row.kind, price, text };
  }

  return { today, ensure, libraryQuest, registerWin, canClaimLibrary, claimLibrary, ticketPrice, canBuyTicket, buyTicket, pick, TABLE, LIB_GOAL };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Daily;
