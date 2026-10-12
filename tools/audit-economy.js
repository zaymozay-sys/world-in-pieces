/* Аудит экономики (полный проход, этап 3/8): считает на настоящих формулах игры, где деньги можно «напечатать»
   циклами «купил → продал», «изготовил → продал», «улучшил → продал». Ничего в игре не меняет.
   Запуск: node tools/audit-economy.js [--json=file]
   Оценка: выход цикла / вход цикла. Больше 1 — цикл прибыльный (деньги берутся из воздуха). */
const fs = require('fs');
global.window = undefined;
require('../js/i18n.js');
const Tiers = global.Tiers = require('../js/tiers.js');
const Gear = global.Gear = require('../js/items.js');
const Balance = global.Balance = require('../js/balance.js');
const Hero = global.Hero = require('../js/hero.js');
const Factions = global.Factions = require('../js/factions.js');
const Bestiary = global.Bestiary = require('../js/bestiary.js');
const Village = global.Village = require('../js/village.js');
const Market = global.Market = require('../js/market.js');
const Ammo = global.Ammo = require('../js/ammo.js');

const out = { rows: [], notes: [] };
const row = (id, what, inV, outV, extra = '') => out.rows.push({ id, what, in: Math.round(inV), out: Math.round(outV), ratio: +(outV / Math.max(1, inV)).toFixed(3), extra });

const shopPerks = Factions.ORDER.map((f) => [f, Factions.perk(f, 'shop')]);
const bestShop = Math.min(...shopPerks.map(([, p]) => p));           // самая дешёвая покупка (лучший перк лавки)
const buyPrice = (p, perk = bestShop) => Math.round(p * perk);
const RES_BUY_MARKUP = 3;                                               // как в screens.js
const hallLv = [0, 5];                                                  // без и с полностью улучшенной Ратушей

for (const hall of hallLv) {
  const v = { hall }, feeRate = Village.feeRate(v), pre = hall ? 'ратуша 5' : 'ратуша 0';
  const fee = (p) => Market.fee(p, feeRate);
  const top = Market.PRICE_STEPS[Market.PRICE_STEPS.length - 1];
  // 1. Лавка → Торговые ряды: вещи, ресурсы, расходники, боеприпасы (каждый цвет)
  for (const tier of [1, 4, 7, 10]) {
    // вещь: цена в лавке = it.price; ряды: fair = 0.7·price, кнопка 2.3×
    const e = Gear.makeEntry('sword-novice', tier), it = Gear.item(e);
    const cost = buyPrice(it.price);
    const fair = Market.fairUnit('item', e.uid, e), price = Math.round(fair * top);
    row('E-01a', `${pre}: вещь, цвет ${tier}: лавка → ряды ×2,3 (-сбор)`, cost, price - fee(price), `средн. ожидание ${Math.round(Market.meanMinutes(price, fair))} мин`);
    // ресурс
    const rp = Bestiary.resPrice('ore', tier), rcost = buyPrice(rp * RES_BUY_MARKUP);
    const rfair = Market.fairUnit('res', 'ore:' + tier), rprice = Math.round(rfair * top);
    row('E-01b', `${pre}: ресурс, цвет ${tier}: лавка → ряды ×2,3`, rcost, rprice - fee(rprice), `${Math.round(Market.meanMinutes(rprice, rfair))} мин`);
    // расходник (потом цена растёт с уровнем героя; берём героя на старте цвета)
    const L = Hero.itemLevel(tier), unit = Hero.consumablePrice(Gear.CONSUMABLES.potion.price, L);
    const cfair = Market.fairUnit('cons', 'potion', null, unit), cprice = Math.round(cfair * top);
    row('E-01c', `${pre}: зелье, цвет ${tier}: лавка → ряды ×2,3`, buyPrice(unit), cprice - fee(cprice), `${Math.round(Market.meanMinutes(cprice, cfair))} мин`);
  }
}
// сравнение «справедливых» цен: ряды платят выше, чем покупка в лавке?
// 2. Обычная лавка: купил → продал тут же (должно быть < 1)
for (const tier of [1, 5, 10]) {
  const it = Gear.item(Gear.makeEntry('sword-novice', tier));
  row('E-02a', `лавка: купить вещь и продать, цвет ${tier}`, buyPrice(it.price), Gear.sellValue(it.price));
  row('E-02b', `старьёвщик: купить вещь и сдать, цвет ${tier}`, buyPrice(it.price), Gear.junkValue(it.price));
  const rp = Bestiary.resPrice('ore', tier);
  row('E-02c', `лавка: ресурс купить/продать, цвет ${tier}`, buyPrice(rp * RES_BUY_MARKUP), rp);
  const L = Hero.itemLevel(tier), unit = Hero.consumablePrice(50, L);
  for (const n of [1, 5, 10, 25]) row('E-02d', `лавка: зелье ×${n} купить/продать, цвет ${tier}`, buyPrice(Gear.bulkPrice(unit, n)), Gear.sellValue(unit) * n);
}
// 3. Кузница: изготовить → продать. Ресурсы считаем по цене продажи в лавку (упущенная выгода).
const rarOf = (id) => Gear.ITEMS.find((x) => x.id === id);
const sample = { common: null, rare: null, epic: null };
for (const b of Gear.ITEMS) if (!b.relic && !sample[b.rarity] && Gear.FORGE_KINDS[b.type]) sample[b.rarity] = b;
for (const [rar, b] of Object.entries(sample)) {
  if (!b) continue;
  for (const tier of [1, 4, 7, 10]) {
    const cc = Gear.craftCost(b.id, tier), resVal = cc.res.reduce((s, r) => s + r.n * Bestiary.resPrice(r.kind, r.tier), 0);
    const it = Gear.item(Gear.makeEntry(b.id, tier));
    row('E-03a', `кузница: изготовить ${rar} «${b.id}» цв.${tier} → лавка (ресурсы по цене продажи)`, cc.coins + resVal, Gear.sellValue(it.price));
    const fair = Market.fairUnit('item', 'x', Gear.makeEntry(b.id, tier)), price = Math.round(fair * 2.3);
    row('E-03b', `кузница: изготовить ${rar} «${b.id}» цв.${tier} → ряды ×2,3 (ресурсы по цене продажи, ратуша 0)`, cc.coins + resVal, price - Market.fee(price, Village.feeRate({})), `${Math.round(Market.meanMinutes(price, fair))} мин`);
  }
}
// 4. Улучшение: улучшить на цвет и продать
for (const tier of [1, 4, 7, 9]) {
  const e = Gear.makeEntry('sword-novice', tier), uc = Gear.upgradeCost(e), resVal = uc.res.reduce((s, r) => s + r.n * Bestiary.resPrice(r.kind, r.tier), 0);
  const before = Gear.item(e), after = Gear.item({ ...e, tier: tier + 1 });
  row('E-04', `улучшить «sword-novice» ${tier}→${tier + 1}, прирост цены продажи в лавку`, uc.coins + resVal, Gear.sellValue(after.price) - Gear.sellValue(before.price));
  const fair = Market.fairUnit('item', 'x', { ...e, tier: tier + 1 }), p2 = Math.round(fair * 2.3), fair1 = Market.fairUnit('item', 'x', e), p1 = Math.round(fair1 * 2.3);
  row('E-04b', `улучшить ${tier}→${tier + 1}, прирост выручки в рядах ×2,3`, uc.coins + resVal, p2 - p1);
}
// 5. Боеприпасы: кузница 2 любых ресурса цвета героя → 3 боеприпаса, сравнение со сдачей/покупкой
for (const tier of [1, 5, 10]) {
  const L = Hero.itemLevel(tier), unit = Hero.consumablePrice(Ammo.CATALOG.bolt.price, L), rp = Bestiary.resPrice('feather', tier);
  row('E-05', `боеприпасы: 2 ресурса (дешёвый «перо») → 3 шт. против покупки, цвет ${tier}`, rp * Ammo.CRAFT.res, buyPrice(unit) * Ammo.CRAFT.out, 'выход — стоимость покупки в лавке');
  const fair = Market.fairUnit('ammo', 'bolt', null, unit) * Ammo.CRAFT.out, price = Math.round(fair * 2.3);
  row('E-05b', `боеприпасы: 2 ресурса → 3 шт. → ряды ×2,3, цвет ${tier}`, rp * Ammo.CRAFT.res, price - Market.fee(price, Village.feeRate({})), `${Math.round(Market.meanMinutes(price, fair))} мин`);
}

const bad = out.rows.filter((r) => r.ratio > 1);
const ok = out.rows.filter((r) => r.ratio <= 1);
console.log(`Проверено сценариев: ${out.rows.length}; выход больше входа: ${bad.length}; не больше: ${ok.length}`);
const show = (list) => list.forEach((r) => console.log(`${r.id.padEnd(6)} вход ${String(r.in).padStart(9)}  выход ${String(r.out).padStart(9)}  ×${String(r.ratio).padEnd(6)} ${r.what} ${r.extra ? '(' + r.extra + ')' : ''}`));
console.log('\n--- ПРИБЫЛЬНЫЕ ЦИКЛЫ (выход > вход) ---'); show(bad);
console.log('\n--- безопасные (выход ≤ вход) ---'); show(ok);
const jf = process.argv.find((a) => a.startsWith('--json='));
if (jf) fs.writeFileSync(jf.slice(7), JSON.stringify(out, null, 1));
