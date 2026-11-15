// Экономика 2.3.8: модель дохода не должна уйти за разумные пределы. Запуск: node tests/econmodel238.test.js
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const f = path.join(os.tmpdir(), 'econmodel238.json');
cp.execFileSync('node', [path.join(__dirname, '../tools/audit-econ-model.js'), '--json=' + f], { stdio: 'ignore' });
const m = JSON.parse(fs.readFileSync(f, 'utf8')), T = m.tiers;
assert.strictEqual(T.length, 10);
for (const t of T) {
  assert.ok(t.winsForSetAll >= 10 && t.winsForSetAll <= 80, 'боёв на комплект, цвет ' + t.tier + ': ' + t.winsForSetAll);
  assert.ok(t.coinsPerWin > 0);
  assert.ok(t.setShareOfTierIncomeCoinsOnly >= 0.1 && t.setShareOfTierIncomeCoinsOnly <= 0.6, 'доля дохода цвета на комплект, цвет ' + t.tier + ': ' + t.setShareOfTierIncomeCoinsOnly);
}
assert.ok(T[9].coinsPerWin / T[0].coinsPerWin < 100, 'разница монет с моба 1→10 цвет должна быть < 100×');
for (let i = 1; i < 10; i++) assert.ok(T[i].coinsPerWin > T[i - 1].coinsPerWin, 'монеты растут с цветом');
console.log('econmodel238: все тесты пройдены');
