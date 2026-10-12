// 1.6.0: «длина игры» G растягивает игру, не ломая экономику за уровень. Запуск: node tests/gamelength.test.js
const assert = require('assert');
const { execFileSync } = require('child_process');
const probe = `
global.Tiers = require('./js/tiers.js'); const Balance = global.Balance = require('./js/balance.js'); global.Gear = require('./js/items.js');
const Hero = global.Hero = require('./js/hero.js'); const B = require('./js/bestiary.js');
let wins = 0; for (let L = 1; L < 95; L++) wins += Hero.winsFor ? Hero.winsFor(L) : 0;
let coins = 0, n = 4000; for (let i = 0; i < n; i++) coins += B.rollDrops('wolf', 3, Math.random).coins;
console.log(JSON.stringify({ G: Balance.gameLength, totalXp: Hero.totalFor(95), coin: coins / n, itemChance: Balance.rewards.itemChance, base: Balance.rewards.coinBase }));`;
const run = (g) => JSON.parse(execFileSync('node', ['-e', probe], { cwd: __dirname + '/..', env: { ...process.env, GAME_LENGTH: String(g) } }).toString());
const a = run(1), b = run(30);
assert.strictEqual(a.G, 1); assert.strictEqual(b.G, 30);
assert.ok(Math.abs(b.totalXp / a.totalXp - 30) < 1.5, 'опыта до 95-го уровня в 30 раз больше: ' + b.totalXp / a.totalXp);
assert.ok(Math.abs(a.coin / b.coin - 30) < 3, 'монет с моба в 30 раз меньше: ' + a.coin / b.coin);
assert.ok(Math.abs(a.itemChance / b.itemChance - 30) < 0.01 && a.base === b.base, 'шанс вещи делится на G, coinBase — нет');
console.log('gamelength: все тесты пройдены');
