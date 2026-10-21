// 1.8.6: банк — вклад, ставка по серии заходов, чеки
const assert = require('assert');
const Bank = require('../js/bank.js');
const DAY = Bank.DAY, T0 = new Date(2026, 9, 18, 12, 0, 0).getTime();
const b = Bank.blank();
assert.strictEqual(Bank.visit(b, T0), 0); assert.strictEqual(b.streak, 1);
assert.ok(Bank.deposit(b, 1000) && b.dep === 1000);
assert.strictEqual(Bank.visit(b, T0 + 3600000), 0, 'в тот же день ничего');
assert.strictEqual(Bank.rate(0), 0);
assert.ok(Bank.rate(1) > 0 && Bank.rate(1) < Bank.rate(5) && Bank.rate(500) === Bank.RATE_MAX, 'ставка растёт медленно до потолка');
assert.strictEqual(Bank.visit(b, T0 + DAY), 4, 'второй день подряд: 0,4% от 1000 = 4');
assert.strictEqual(b.streak, 2);
const g = Bank.visit(b, T0 + 2 * DAY); assert.ok(g >= 6 && b.streak === 3);
const dep = b.dep;
assert.strictEqual(Bank.visit(b, T0 + 5 * DAY), 0, 'пропуск суток — процентов нет'); assert.strictEqual(b.streak, 1); assert.strictEqual(b.dep, dep);
assert.ok(!Bank.deposit(b, Bank.CAP) && !Bank.withdraw(b, 1e9) && Bank.withdraw(b, dep) && b.dep === 0);
assert.deepStrictEqual(Bank.clean({ dep: -5, cheques: [] }), { dep: 0, day: 0, streak: 0, cheques: {} });
assert.strictEqual(Bank.clean({ dep: 1e12 }).dep, Bank.CAP);
const code = Bank.makeCheque(250, 'T01');
assert.deepStrictEqual(Bank.parseCheque(code), { amount: 250, id: 'T01' });
assert.strictEqual(Bank.parseCheque(code.replace('250', '999')), null, 'подделка суммы');
const r1 = Bank.redeem(b, code), r2 = Bank.redeem(b, code);
assert.ok(r1.ok && r1.amount === 250 && !r2.ok && r2.why === 'used', 'чек гасится один раз');
console.log('bank: все тесты пройдены');

// потолок вклада растёт с ценами цвета героя; по умолчанию — базовый
{
  assert.strictEqual(Bank.capFor(), Bank.CAP); assert.strictEqual(Bank.capFor(1), Bank.CAP);
  assert.strictEqual(Bank.capFor(10), Bank.CAP * 10); assert.strictEqual(Bank.capFor(0.1), Bank.CAP);
  const big = Bank.capFor(73);
  assert.strictEqual(Bank.clean({ dep: big * 2 }, big).dep, big);
  const b = Bank.blank(); assert.ok(Bank.deposit(b, Bank.CAP * 5, big) && !Bank.deposit(b, Bank.CAP * 5, Bank.CAP));
  console.log('bank: потолок по цвету ок');
}
