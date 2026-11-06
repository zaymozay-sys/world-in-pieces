// 2.2.9: варка зарядов — группы ресурсов, расчёт расхода, экономика. Запуск: node tests/brew.test.js
const assert = require('assert');
global.window = undefined;
const Ammo = require('../js/ammo.js'), Balance = require('../js/balance.js'), Bestiary = require('../js/bestiary.js'), Hero = require('../js/hero.js'), Market = require('../js/market.js');

// каждый из видов ресурсов входит ровно в одну группу
const kinds = Object.keys(Bestiary.RESOURCES);
for (const k of kinds) {
  const gs = Object.keys(Balance.brew.groups).filter((g) => Balance.brew.groups[g].res.includes(k));
  assert.strictEqual(gs.length, 1, `ресурс ${k}: групп ${gs.length}`);
  assert.strictEqual(Ammo.groupOf(k), gs[0]);
}
for (const g of Object.values(Balance.brew.groups)) for (const k of g.res) assert.ok(Bestiary.RESOURCES[k], 'неизвестный ресурс ' + k);

// мастерство
assert.strictEqual(Ammo.brewLevel(0), 1); assert.strictEqual(Ammo.brewLevel(9), 1); assert.strictEqual(Ammo.brewLevel(10), 2); assert.strictEqual(Ammo.brewLevel(150), 5); assert.strictEqual(Ammo.brewLevel(undefined), 1);
assert.strictEqual(Ammo.brewOut('hard', 1), 3); assert.strictEqual(Ammo.brewOut('hard', 3), 4); assert.strictEqual(Ammo.brewOut(null, 5), 3);
assert.strictEqual(Ammo.unlocked('hard', 1), false); assert.strictEqual(Ammo.unlocked('hard', 2), true); assert.strictEqual(Ammo.unlocked('light', 3), false); assert.strictEqual(Ammo.unlocked(null, 1), true);

// экономика: перебор уровней героя × цветов × видов ресурсов × групп
let combos = 0, worstRatio = 0;
const groups = [null, ...Object.keys(Balance.brew.groups)];
for (let L = 1; L <= 60; L += 1) {
  const unit = Hero.consumablePrice(Ammo.CATALOG.bolt.price, L);
  for (let t = 1; t <= 10; t++) for (const k of kinds) {
    const rp = Bestiary.resPrice(k, t), base = Ammo.brewNeed(null, unit, rp);
    for (const g of groups) for (const lvl of [1, 3, 5]) {
      const need = Ammo.brewNeed(g, unit, rp, lvl), input = need * rp + Ammo.brewFee(unit), out = Ammo.brewOut(g, lvl);
      assert.ok(need >= base, `усиленный не дешевле обычного: ${g} ${k} ц${t}`);
      if (need > Ammo.CRAFT.res) {
        // Ряды: справедливая цена × верхняя кнопка, минус сбор — не больше входа (с запасом округления)
        const price = Math.round(Market.fairUnit('ammo', 'bolt', null, unit) * out * Math.max(...Market.PRICE_STEPS));
        const net = price - Market.fee(price, Market.FEE);
        assert.ok(net <= input + 2, `Ряды: ${g || 'обычный'} ${k} ц${t} ур${L}: выручка ${net} > вход ${input}`);
        // обычный заряд дешевле покупки в Лавке
        if (!g) assert.ok(input <= 0.7 * out * unit + rp, `обычный дороже 0,7 покупки: ${k} ц${t} ур${L}`);
        worstRatio = Math.max(worstRatio, net / input);
      }
      combos++;
    }
  }
}
console.log(`brew: все тесты пройдены (${combos} сочетаний, худшая выручка/вход ${worstRatio.toFixed(2)})`);

// ---- этап 2: свойства зарядов в бою (чистые функции) ----
{
  const P = Ammo.parse('bolt:hard'); assert.deepStrictEqual([P.kind, P.variant, P.ok], ['bolt', 'hard', true]);
  assert.strictEqual(Ammo.parse('bolt').variant, null); assert.strictEqual(Ammo.parse('bolt:xx').ok, false); assert.strictEqual(Ammo.parse('bolt:').ok, false); assert.strictEqual(Ammo.parse('bolt:hard:x').ok, false); assert.strictEqual(Ammo.parse('gun').ok, false);
  assert.strictEqual(Ammo.keyOf('dart', 'heal'), 'dart:heal'); assert.strictEqual(Ammo.keyOf('dart', null), 'dart');
  assert.strictEqual(Ammo.dmgMul('hard'), 1.25); assert.strictEqual(Ammo.dmgMul(null), 1);
  const weakFam = 'Нежить', resistFam = 'Каменные стражи';
  assert.strictEqual(Ammo.multV('bolt', weakFam, null), 1.5); assert.strictEqual(Ammo.multV('bolt', weakFam, 'hunt'), 1.75);
  assert.strictEqual(Ammo.multV('bolt', resistFam, null), 0.7); assert.strictEqual(Ammo.multV('bolt', resistFam, 'hunt'), 0.85);
  assert.strictEqual(Ammo.multV('bolt', 'Звери', 'hunt'), 1);
  assert.strictEqual(Ammo.healAmount('heal', 100), 40); assert.strictEqual(Ammo.healAmount('hard', 100), 0);
  assert.strictEqual(Ammo.charmStones('bolt', 'charm'), 1); assert.strictEqual(Ammo.charmStones('moonarrow', 'charm'), 0);
  assert.strictEqual(Ammo.stealCount('moonarrow', 'charm'), 3); assert.strictEqual(Ammo.stealCount('moonarrow', null), 2); assert.strictEqual(Ammo.stealCount('bolt', 'charm'), 2);
  for (const v of Ammo.VARIANTS) assert.ok(Ammo.VNAME[v], v);
  console.log('brew: свойства зарядов — ok');
}
