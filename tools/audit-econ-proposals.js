/* Варианты правок экономики для решения владельца (полный проход, этап 6/8). НИЧЕГО не внедряет: считает «до/после» на настоящих
   формулах, чтобы выбор был по цифрам. Коэффициент цикла = выручка / вложение (больше 1 — деньги из воздуха, меньше 1 — безопасно).
   Запуск: node tools/audit-econ-proposals.js [--json=file] */
const fs = require('fs');
global.window = undefined;
require('../js/i18n.js');
global.Tiers = require('../js/tiers.js'); global.Gear = require('../js/items.js'); global.Balance = require('../js/balance.js');
global.Hero = require('../js/hero.js'); const Factions = global.Factions = require('../js/factions.js'); const Bestiary = global.Bestiary = require('../js/bestiary.js');
global.Village = require('../js/village.js'); const Market = global.Market = require('../js/market.js'); const Ammo = global.Ammo = require('../js/ammo.js');

const perks = Factions.ORDER.map((f) => Factions.perk(f, 'shop')), BEST = Math.min(...perks), WORST = Math.max(...perks);
const RES_MARKUP = 3, fee = 0.05;
const out = { E01: [], E02: [], notes: [] };

// ---------- E-01: Лавка → ряды ----------
// «Вход» — цена покупки в Лавке с лучшим перком (самый опасный игрок). «Выход» — выручка на верхней кнопке за вычетом сбора.
const itemSample = Gear.item(Gear.makeEntry('sword-novice', 5)).price;
const resSample = Bestiary.resPrice('ore', 5);
const consUnit = Hero.consumablePrice(Gear.CONSUMABLES.potion.price, Hero.itemLevel(5));
const KINDS = [
  { id: 'вещь', lavka: Math.round(itemSample * BEST), fair: (v) => v.fairItem * itemSample },
  { id: 'ресурс', lavka: Math.round(resSample * RES_MARKUP * BEST), fair: (v) => v.fairRes * resSample },
  { id: 'расходник', lavka: Math.round(consUnit * BEST), fair: (v) => v.fairCons * consUnit },
];
const VARIANTS = [
  { id: 'сейчас', steps: [0.8, 1, 1.3, 1.7, 2.3], fairItem: 0.7, fairRes: 1.8, fairCons: 0.75 },
  { id: 'A: те же цены, шаги до ×1,3', steps: [0.6, 0.8, 1, 1.15, 1.3], fairItem: 0.7, fairRes: 1.8, fairCons: 0.75 },
  { id: 'B: шаги до ×1,15 (почти без заработка)', steps: [0.6, 0.8, 0.95, 1.05, 1.15], fairItem: 0.7, fairRes: 1.8, fairCons: 0.75 },
  { id: 'C: справедливая цена ниже, шаги прежние', steps: [0.8, 1, 1.3, 1.7, 2.3], fairItem: 0.45, fairRes: 1.15, fairCons: 0.45 },
];
for (const v of VARIANTS) {
  const top = v.steps[v.steps.length - 1];
  for (const k of KINDS) {
    const fair = Math.round(k.fair(v)), price = Math.round(fair * top), rev = price - Math.max(1, Math.round(price * fee));
    const mid = v.steps[2] * fair, midRev = mid - Math.max(1, Math.round(mid * fee));
    out.E01.push({ variant: v.id, kind: k.id, lavkaCostBestPerk: k.lavka, fair, topPrice: price, revenueTop: rev, loopTop: +(rev / k.lavka).toFixed(2), loopFair: +(midRev / k.lavka).toFixed(2), waitTopMin: Math.round(Market.meanMinutes(price, fair)) });
  }
}
// «Цена продажи в рядах не выше цены покупки в Лавке» (закрывает цикл при любом перке): верхняя цена ≤ Лавка(худший перк) × 0.95 / (1 − сбор)...
// минимальное безопасное значение верхней кнопки для каждого вида при справедливой цене «сейчас»
for (const k of KINDS) {
  const fair = Math.round(k.fair(VARIANTS[0])), maxStep = (k.lavka * (1 - 1e-9)) / (fair * (1 - fee));
  out.notes.push(`E-01 «${k.id}»: чтобы цикл Лавка→ряды не давал прибыли при справедливой цене как сейчас, верхняя кнопка должна быть ≤ ×${maxStep.toFixed(2)} (сейчас ×2,3)`);
}

// ---------- E-02: боеприпасы ----------
for (const tier of [1, 4, 7, 10]) {
  const L = Hero.itemLevel(tier), unit = Hero.consumablePrice(Ammo.CATALOG.bolt.price, L), rp = Bestiary.resPrice('feather', tier);
  const give = Ammo.CRAFT.out, resN = Ammo.CRAFT.res, feeCoins = Math.round(0.3 * unit);   // комиссия кузнеца — 0,3 цены ОДНОЙ штуки за изготовление (screens.js: fee = ammoPrice × 0,3), не за каждую
  const value = Math.round(unit * 0.4) * give;                          // продажа в Лавку (0,4×) — нижняя оценка выгоды изготовления
  const cost = rp * resN + feeCoins;
  const alt = (resN2, out2) => ({ resN: resN2, out: out2, cost: rp * resN2 + Math.round(0.3 * unit), sellLavka: Math.round(unit * 0.4) * out2 });
  const mk = (out2) => { const fair = Market.fairUnit('ammo', 'bolt', null, unit) * out2, price = Math.round(fair * 2.3); return price - Math.max(1, Math.round(price * fee)); };
  out.E02.push({ tier, ammoUnit: unit, now: { resN, out: give, cost, sellLavka: value, loop: +(value / cost).toFixed(2), market: mk(give), loopMarket: +(mk(give) / cost).toFixed(2), loopReplace: +(Math.round(unit * BEST) * give / cost).toFixed(2) },
    variants: [alt(4, 3), alt(6, 3), alt(8, 3), alt(12, 3)].map((x) => ({ ...x, loop: +(x.sellLavka / x.cost).toFixed(2), loopMarket: +(mk(3) / x.cost).toFixed(2), loopReplace: +(Math.round(unit * BEST) * 3 / x.cost).toFixed(2) })) });
}
// минимальное число ресурсов на 3 боеприпаса, при котором продажа в Лавку не окупает изготовление
for (const tier of [1, 4, 7, 10]) {
  const L = Hero.itemLevel(tier), unit = Hero.consumablePrice(Ammo.CATALOG.bolt.price, L), rp = Bestiary.resPrice('feather', tier);
  const need = Math.ceil((Math.round(unit * 0.4) * 3 - Math.round(0.3 * unit)) / rp);
  out.notes.push(`E-02 цвет ${tier}: самый дешёвый ресурс стоит ${rp}; чтобы «изготовить 3 → продать в Лавку» не давало прибыли, нужно ≥ ${need} таких ресурсов вместо ${Ammo.CRAFT.res} (комиссия 0,3 цены одной штуки за изготовление)`);
}

console.log('E-01 коэффициент «Лавка → ряды» на верхней кнопке (1.0 = ноль; >1 прибыль) — перк лавки 0,9 (лучший):');
for (const v of VARIANTS) console.log(' ', v.id.padEnd(40), out.E01.filter((r) => r.variant === v.id).map((r) => `${r.kind} ×${r.loopTop} (ждать ~${r.waitTopMin} мин)`).join('  |  '));
console.log('\nE-02 боеприпасы (самый дешёвый ресурс → 3 шт. → Лавка 0,4×):');
for (const r of out.E02) console.log(`  цвет ${r.tier}: сейчас: стоимость замены в Лавке ×${r.now.loopReplace}, продажа в Лавку ×${r.now.loop}, ряды ×${r.now.loopMarket} (${r.now.resN} рес. → ${r.now.out} шт.); ` + r.variants.map((x) => `${x.resN} рес.: замена ×${x.loopReplace}, Лавка ×${x.loop}, ряды ×${x.loopMarket}`).join('; '));
console.log('\n' + out.notes.join('\n'));
const jf = process.argv.find((a) => a.startsWith('--json='));
if (jf) fs.writeFileSync(jf.slice(7), JSON.stringify(out, null, 1));
