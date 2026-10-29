// Бюджет усиления (план развития, этап D1): вклад каждого источника в Силу и ХП «максимума» по цветам и уровням внутри цвета.
// Запуск: node tools/budget.js   (только отчёт, игру не меняет). Медали — потолок (все 125), реально набираются постепенно.
process.chdir(require('path').join(__dirname, '..'));
const sim = require('./sim.js');
const Hero = global.Hero || require('../js/hero.js'), Gear = global.Gear || require('../js/items.js'), Stones = require('../js/stones.js'), Runes = require('../js/runes.js');
const MEDALS = { power: 102, health: 309 };
const pct = (a, tot) => String(Math.round(100 * a / tot)).padStart(3) + '%';
for (const stat of ['power', 'health']) {
  console.log(`\n== ${stat === 'power' ? 'СИЛА' : 'ХП'} «максимума»: доля источников ==`);
  console.log('цвет ур.  всего | уровень вещи закалка руны+огр медали*');
  for (let t = 1; t <= 10; t++) for (const off of [0, 4, 9]) {
    const L = Hero.itemLevel(t) + off, gear = sim.typicalGear(L, 1), g = Gear.stats(gear);
    const lvl = stat === 'power' ? Hero.levelPower(L) : Hero.baseHp(L);
    const items = g[stat], temper = Math.ceil(items * 0.2);
    const S = Runes.socketsFor({ tier: t }), r = 9 * S, cut = Stones.cutBonus(t);
    const rune = stat === 'power' ? Math.ceil(r / 2) * 2 + (cut ? 9 * cut.power : 0) : Math.floor(r / 2) * 8;
    const med = MEDALS[stat], tot = lvl + items + temper + rune + med;
    console.log(`${String(t).padStart(3)} ${String(L).padStart(3)} ${String(tot).padStart(6)} | ${pct(lvl, tot)} ${pct(items, tot)} ${pct(temper, tot)} ${pct(rune, tot)} ${pct(med, tot)}`);
  }
}
console.log('\n* медали — потолок; плоские источники (руны, медали) показывают, где «умирают» на высоких цветах.');
