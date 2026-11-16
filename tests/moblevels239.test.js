// 2.4.0: уровни существ 1–100. Запуск: node tests/moblevels239.test.js
const assert = require('assert');
global.Tiers = require('../js/tiers.js'); global.Balance = require('../js/balance.js');
global.Hero = require('../js/hero.js'); global.Gear = require('../js/items.js');
const Bestiary = global.Bestiary = require('../js/bestiary.js'); global.HexMap = require('../js/hexmap.js');
const ids = Object.keys(Bestiary.MONSTERS).slice(0, 12);
for (const id of ids) {
  let prev = 0;
  for (let L = 1; L <= 100; L++) {
    const s = Bestiary.scaledAt(id, L), t = Tiers.tierOfLevel(L);
    assert.ok(s.hp >= prev, id + ' сила не убывает ' + L); prev = s.hp;
    if (Tiers.firstLevel(t) === L) assert.strictEqual(s.hp, Bestiary.scaled(id, t).hp, id + ' 1-й уровень цвета = прежние числа');
  }
}
for (let L = 1; L < 100; L++) assert.ok(Hero.xpReward(Bestiary.MONSTERS[ids[0]], Tiers.tierOfLevel(L), 30, L + 1) >= Hero.xpReward(Bestiary.MONSTERS[ids[0]], Tiers.tierOfLevel(L), 30, L) - 1e-9, 'опыт не убывает');
const map = HexMap.generate(7);
for (const sp of (map.spawns || [])) { const l = HexMap.lvlOf(sp); assert.strictEqual(Tiers.tierOfLevel(l), sp.tier, 'уровень внутри цвета'); }
console.log('moblevels239.test.js: OK');
