// 1.6.6: рецепты Кузницы по ролям. Запуск: node tests/forge166.test.js
const assert = require('assert');
global.window = undefined;
const Gear = require('../js/items.js'), Forge = require('../js/forge.js'), Bestiary = require('../js/bestiary.js');
let n = 0;
for (const b of Gear.ITEMS) {
  if (b.relic || !Gear.FORGE_KINDS[b.type]) continue;
  for (let t = 1; t <= 10; t++) {
    const c = Gear.craftCost(b.id, t), price = Gear.item({ id: b.id, tier: t }).price;
    assert.ok(c.res.length >= 1 && c.res.every((r) => r.tier === t && r.n >= 1 && Bestiary.RESOURCES[r.kind]), b.id + ' ц' + t);
    assert.strictEqual(new Set(c.res.map((r) => r.kind)).size, c.res.length, 'виды ресурсов не повторяются');
    assert.ok(c.res.length <= 4, 'не больше четырёх видов');
    // каждый ресурс рецепта добывается на этом цвете (или это запасная роль); полная цена: монеты + ресурсы ≈ 40–50% Лавки (округление)
    const val = c.coins + c.res.reduce((s, r) => s + r.n * Bestiary.resPrice(r.kind, t), 0), share = { common: 0.5, rare: 0.4, epic: 0.4 }[b.rarity];
    if (price > 200) assert.ok(val >= price * share * 0.6 && val <= price * share * 1.2, `${b.id} ц${t}: цена ${val} против ${Math.round(price * share)}`);
    n++;
  }
}
// 2.0.7: число видов зависит от позиций рецепта (этап B+C), см. tests/forge207.test.js
// каждый нужный ресурс имеет источник на своём цвете
for (const t of [1, 3, 6, 10]) for (const r of Gear.craftCost(Gear.ITEMS.find((i) => i.type === 'weapon1' && i.rarity === 'common').id, t).res) assert.ok(Forge.sourceOf(r.kind, t), `${r.kind} на ц${t} без источника`);
// «свой» ресурс эликсиров: у каждого вида есть хотя бы запасной
for (const k of Object.keys(Forge.OWN)) for (let t = 1; t <= 10; t++) assert.ok(Forge.ownList(k, t).length > 0);
// диапазоны видов (1.6.7: прежние у шести видов, плюс новые существа)
const HexMap = require('../js/hexmap.js');
for (const [id, lo, hi] of [['hermit', 2, 6], ['wildbees', 6, 10], ['wisp', 3, 6], ['golem', 6, 10], ['spider', 1, 5], ['mushroom', 6, 10], ['ironscarab', 1, 5], ['firetail', 4, 7], ['weaver', 6, 10], ['boneknight', 8, 10]]) assert.deepStrictEqual(HexMap.SPAWN[id].tiers, [lo, hi], id);
// 1.6.7: у каждого ресурса есть родной источник на каждом цвете (кроме перечисленных исключений — их закрывает рынок)
const EXC = { scrap: [], crystal: [], scale: [], shell: [], horn: [8, 9, 10], resin: [7, 8, 9, 10], ...Object.fromEntries(Bestiary.DEEP_RESOURCES.map((k) => [k, [1, 2, 3, 4, 5, 6, 7]])) };   // 2.0.7: минералы подземелья — только цвета 8–10   // 2.0.7: рог — цвета 1–7, смола — 1–6 (дальше effective-покрытие ниже порога, в рецепты не берутся)
for (const k of Object.keys(Bestiary.RESOURCES)) for (let t = 1; t <= 10; t++) if (!(EXC[k] || []).includes(t)) assert.ok(Forge.sourceOf(k, t), `ресурс ${k}: на цвете ${t} нет источника`);
console.log('forge166: все тесты пройдены (' + n + ' рецептов)');
