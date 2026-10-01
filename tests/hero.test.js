// Тесты уровней героя: опыт, кривая уровней, ХП и урон, лимит снаряжения. Запуск: node tests/hero.test.js
const assert = require('assert');
global.Tiers = require('../js/tiers.js');
global.Balance = require('../js/balance.js');
const Hero = require('../js/hero.js');
global.Hero = Hero;
global.Gear = require('../js/items.js');
const Bestiary = require('../js/bestiary.js');

// опыта на уровень нужно всё больше
for (let L = 1; L < Hero.MAX_LEVEL - 1; L++) assert.ok(Hero.need(L + 1) > Hero.need(L), 'need растёт на ' + L);
assert.strictEqual(Hero.need(Hero.MAX_LEVEL), Infinity);
assert.ok(Hero.need(49) > Hero.need(1) * 20, 'к концу опыта нужно в десятки раз больше');

// уровень по опыту
for (let L = 1; L <= Hero.MAX_LEVEL; L++) {
  assert.strictEqual(Hero.levelOf(Hero.totalFor(L)).level, L);
  if (L > 1) assert.strictEqual(Hero.levelOf(Hero.totalFor(L) - 1).level, L - 1);
}
assert.deepStrictEqual(Hero.levelOf(0), { level: 1, into: 0, need: Hero.need(1), total: 0 });
assert.strictEqual(Hero.levelOf(1e12).level, Hero.MAX_LEVEL);

// 5 уровней на цвет; вещи цвета N — с уровня (N−1)×5+1
assert.strictEqual(Hero.tierFor(1), 1);
assert.strictEqual(Hero.tierFor(5), 1);
assert.strictEqual(Hero.tierFor(6), 2);
assert.strictEqual(Hero.tierFor(46), 10);
assert.strictEqual(Hero.tierFor(50), 10);
assert.deepStrictEqual([1, 2, 3, 10].map(Hero.itemLevel), [1, 6, 11, 46]);
assert.ok(Hero.canWear(2, 6) && !Hero.canWear(2, 5) && Hero.canWear(1, 1));

// ХП и урон героя растут тем же темпом, что ХП и урон существ его цвета
assert.strictEqual(Hero.baseHp(1), Balance.hero.baseHp);
for (const t of [1, 3, 6, 10]) {
  const L = Hero.itemLevel(t), sc = Bestiary.scaled('bandit', t);
  assert.strictEqual(Hero.dmgMult(L), Math.round(sc.dmg * 100) / 100, 'урон на цвете ' + t);
  assert.ok(Math.abs(Hero.baseHp(L) / Balance.hero.baseHp - Tiers.GROWTH[t - 1]) < 0.01, 'ХП на цвете ' + t);
}
for (let L = 1; L < 50; L++) assert.ok(Hero.baseHp(L + 1) > Hero.baseHp(L) && Hero.budget(L + 1) >= Hero.budget(L));
assert.strictEqual(Hero.budget(1), Balance.hero.budget);

// опыт за победу: сильнее вид и выше цвет — больше; слабых фармить бессмысленно
const M = Bestiary.MONSTERS;
assert.ok(Hero.xpReward(M.troll, 5, 21) > Hero.xpReward(M.bandit, 5, 21));
assert.ok(Hero.xpReward(M.bandit, 5, 21) > Hero.xpReward(M.rat, 5, 21));
assert.ok(Hero.xpReward(M.bandit, 6, 21) > Hero.xpReward(M.bandit, 5, 21) * 1.3);
assert.ok(Hero.xpReward(M.bandit, 1, 30) <= Hero.xpReward(M.bandit, 6, 30) / 20);
assert.strictEqual(Hero.xpReward(M.bandit, 1, 1), Balance.hero.xp.perWin);

// цены расходников растут вместе с доходом
assert.strictEqual(Hero.consumablePrice(50, 1), 50);
assert.ok(Hero.consumablePrice(50, 46) === 50 * Tiers.PRICE_MULT[9]);

/* ---------- разблокировка заклинаний по уровню (Balance.spellUnlock) ---------- */

// стартовая пятёрка и общий для всех фракций Удар не упомянуты в spellUnlock — доступны с 1-го уровня
for (const k of ['lightning', 'fire', 'transmute', 'heal', 'chaos', 'strike']) {
  assert.strictEqual(Hero.isSpellUnlocked(k, 1), true, k + ' доступен с 1-го уровня');
}
// заклинания более высокого уровня закрыты до своего порога и открываются с него
for (const [kind, lvl] of Object.entries(Balance.spellUnlock)) {
  assert.strictEqual(Hero.isSpellUnlocked(kind, lvl - 1), false, `${kind} закрыт до уровня ${lvl}`);
  assert.strictEqual(Hero.isSpellUnlocked(kind, lvl), true, `${kind} открыт на уровне ${lvl}`);
  assert.strictEqual(Hero.isSpellUnlocked(kind, Hero.MAX_LEVEL), true, `${kind} остаётся открытым на макс. уровне`);
}
// пороги валидны: позже 1-го уровня и не позже максимального
for (const lvl of Object.values(Balance.spellUnlock)) assert.ok(lvl > 1 && lvl <= Hero.MAX_LEVEL);

console.log('hero: все тесты пройдены');
