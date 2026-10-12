/* Модель экономики по коду (полный проход, этап 6/8). Ничего в игре не меняет, баланс не трогает.
   Считает на настоящих формулах: сколько боёв на уровень, сколько монет/опыта/ресурсов в среднем даёт победа,
   сколько стоит комплект снаряжения цвета и сколько боёв нужно, чтобы его купить; добавляет «что будет», если ввести
   износ (1.6.5) с разными вариантами цены ремонта. Запуск: node tools/audit-econ-model.js [--json=file] [--seed=1] */
const fs = require('fs');
global.window = undefined;
require('../js/i18n.js');
const Tiers = global.Tiers = require('../js/tiers.js');
const Gear = global.Gear = require('../js/items.js');
const Balance = global.Balance = require('../js/balance.js');
const Hero = global.Hero = require('../js/hero.js');
const Factions = global.Factions = require('../js/factions.js');
const Bestiary = global.Bestiary = require('../js/bestiary.js');
const World = global.World = require('../js/world.js');

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
let seed = Number(arg('seed', 1)) >>> 0;
const rand = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const R = Balance.rewards, C = Balance.hero;
const species = Bestiary.ORDER.filter((id) => !Bestiary.MONSTERS[id].boss);
const SLOTS_WORN = Gear.SLOTS.filter((s) => s !== 'bag');                   // «всё надетое, кроме сумки» (решение владельца для 1.6.5)
const shopPerk = Math.min(...Factions.ORDER.map((f) => Factions.perk(f, 'shop')));
const coinPerk = Math.max(...Factions.ORDER.map((f) => Factions.perk(f, 'coins')));
const out = { params: { coinK: R.coinK, itemChance: R.itemChance, consumableChance: R.consumableChance, shopPerk, coinPerk, levelsPerTier: C.levelsPerTier }, tiers: [] };

// сколько стоит «полный комплект цвета»: на каждый слот — средняя цена обычной вещи (и редкой/эпической) этого цвета
function slotPrice(slot, tier, rarity) {
  const pool = Gear.ITEMS.filter((i) => !i.relic && !i.faction && i.set !== 'sea' && (Gear.SLOT_OF ? Gear.SLOT_OF(i) === slot : (i.type === 'weapon1' ? slot === 'main' : i.type === 'weapon2' ? slot === 'main' : i.type === 'shield' ? slot === 'off' : i.type === slot)) && (!rarity || i.rarity === rarity));
  if (!pool.length) return null;
  return pool.reduce((s, i) => s + Gear.item(Gear.makeEntry(i.id, tier)).price, 0) / pool.length;
}

for (let t = 1; t <= 10; t++) {
  const L0 = Hero.itemLevel(t), Lmid = L0 + 4;
  // Монеты за победу над существом ЭТОГО цвета (герой на уровне цвета): среднее по видам, множитель разброса 0.8–1.2 даёт 1.0
  const coinsAvg = species.reduce((s, id) => s + Bestiary.MONSTERS[id].coins * R.coinK * Tiers.PRICE_MULT[t - 1], 0) / species.length;
  const coinsWin = coinsAvg * coinPerk;
  // Опыт за победу и боёв на 10 уровней цвета (из реальных need/xpReward для героя на каждом уровне цвета)
  let winsTier = 0, xpTier = 0;
  for (let L = L0; L < L0 + C.levelsPerTier && L < Hero.MAX_LEVEL; L++) {
    const xpWin = species.reduce((s, id) => s + Hero.xpReward(Bestiary.MONSTERS[id], t, L), 0) / species.length;
    winsTier += Hero.need(L) / xpWin; xpTier += Hero.need(L);
  }
  // Ресурсы за победу (в «лавочных» монетах продажи 1×) и ожидаемая вещь (цена продажи 0.4)
  let resVal = 0;
  for (const id of species) for (const [kind, chance, mn, mx] of Bestiary.MONSTERS[id].drops) resVal += chance / R.coinK * R.coinK * ((mn + mx) / 2) * Bestiary.resPrice(kind, t);
  resVal /= species.length;
  const itemsAvg = Gear.ITEMS.filter((i) => !i.relic && !i.faction && i.set !== 'sea');
  const itemPriceAvg = itemsAvg.reduce((s, i) => s + Gear.item(Gear.makeEntry(i.id, t)).price, 0) / itemsAvg.length;
  const itemDropSell = R.itemChance * Gear.sellValue(itemPriceAvg);
  // Комплект цвета
  const kinds = { main: 'main', off: 'off', head: 'head', shoulders: 'shoulders', chest: 'chest', arms: 'arms', gloves: 'gloves', legs: 'legs', amulet: 'amulet' };
  let setCommon = 0, setAll = 0, nSlots = 0;
  const typeSlot = { weapon1: 'main', weapon2: 'main', shield: 'off', head: 'head', shoulders: 'shoulders', chest: 'chest', arms: 'arms', gloves: 'gloves', legs: 'legs', amulet: 'amulet' };
  const byType = {};
  for (const i of itemsAvg) { const sl = typeSlot[i.type]; if (!sl) continue; (byType[sl] = byType[sl] || { c: [], a: [] }).a.push(Gear.item(Gear.makeEntry(i.id, t)).price); if (i.rarity === 'common') byType[sl].c.push(Gear.item(Gear.makeEntry(i.id, t)).price); }
  for (const sl of Object.keys(byType)) { const m = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length); setCommon += m(byType[sl].c.length ? byType[sl].c : byType[sl].a); setAll += m(byType[sl].a); nSlots++; }
  const setBuy = Math.round(setCommon * shopPerk), setBuyAll = Math.round(setAll * shopPerk);
  const incomePerWin = coinsWin + itemDropSell + resVal * 1;            // с продажей всего подряд (оптимистично)
  const potionUnit = Hero.consumablePrice(Gear.CONSUMABLES.potion.price, Lmid);
  const row = {
    tier: t, L0, winsPerTier: Math.round(winsTier), coinsPerWin: +coinsWin.toFixed(1), resValuePerWin: +resVal.toFixed(1), itemDropSellPerWin: +itemDropSell.toFixed(1),
    incomePerWinAll: +incomePerWin.toFixed(1), incomePerTierCoinsOnly: Math.round(coinsWin * winsTier), incomePerTierAll: Math.round(incomePerWin * winsTier),
    setCommonBuy: setBuy, setAvgBuy: setBuyAll, slots: nSlots,
    winsForSetCoinsOnly: Math.round(setBuy / coinsWin), winsForSetAll: Math.round(setBuy / incomePerWin),
    setShareOfTierIncomeCoinsOnly: +(setBuy / (coinsWin * winsTier)).toFixed(2),
    potion: potionUnit, potionsPerWinIncome: +(coinsWin / potionUnit).toFixed(2),
  };
  // Износ 1.6.5 (прикидка): −1 прочности на каждой надетой вещи (без сумки) за поражение; прочность по цвету D(t);
  // цена ремонта = ⅓ цены новой вещи (владелец). Варианты: (a) полный ремонт за ⅓ цены, (b) ⅓ цены × (потерянная доля прочности).
  const worn = SLOTS_WORN.length - 3;                                        // main, off, head, shoulders, chest, arms, gloves, legs, amulet (+ пр.) — реально надето ≈ 9
  const wornPriceSum = setAll * 1;                                           // цена комплекта цвета «в магазине» ≈ сумма цен надетого
  row.repairFullThirdSet = Math.round(wornPriceSum / 3);                     // ремонт всех вещей комплекта «до новья» за ⅓
  for (const D of [30, 50, 100]) {
    row['repairPerDefeat_prop_D' + D] = Math.round(wornPriceSum / 3 / D);    // (b) пропорционально потерянной прочности: ⅓ цены/D за один пункт на каждой вещи
  }
  row.defeatBreakEvenWinsPerDefeat_D50 = +((wornPriceSum / 3 / 50) / coinsWin).toFixed(2);   // сколько побед «съедает» одно поражение при модели (b), D=50
  out.tiers.push(row);
}

console.log('цвет | боёв на цвет | монет/победа | комплект (лавка) | боёв на комплект | доля дохода цвета | ремонт-(b) D=50 за поражение | = побед');
for (const r of out.tiers) console.log(String(r.tier).padStart(4), String(r.winsPerTier).padStart(12), String(r.coinsPerWin).padStart(13), String(r.setCommonBuy).padStart(17), String(r.winsForSetCoinsOnly).padStart(17), String(r.setShareOfTierIncomeCoinsOnly).padStart(18), String(r.repairPerDefeat_prop_D50).padStart(28), String(r.defeatBreakEvenWinsPerDefeat_D50).padStart(8));
console.log('\nдоп. колонки: ресурсы/победа, вещь/победа (продажа), доход/победа (все), боёв на комплект (все источники), зелье, зелий на монеты победы');
for (const r of out.tiers) console.log(r.tier, r.resValuePerWin, r.itemDropSellPerWin, r.incomePerWinAll, r.winsForSetAll, r.potion, r.potionsPerWinIncome);
const jf = process.argv.find((a) => a.startsWith('--json='));
if (jf) fs.writeFileSync(jf.slice(7), JSON.stringify(out, null, 1));
