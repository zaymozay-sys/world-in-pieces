// 1.7.0: осада деревни — расписание (раз в сутки), размер волны, оборона по Ратуше, добыча и похитители. Запуск: node tests/siege.test.js
const assert = require('assert');
const Siege = require('../js/siege.js');

const T0 = new Date(2026, 9, 13, 10, 0, 0).getTime(), DAY = 86400000;

// расписание: не раньше пятой победы; только раз в календарные сутки (без «раз в 10 побед»)
assert.strictEqual(Siege.due(null, T0, 4), false, 'новичка не трогаем');
assert.strictEqual(Siege.due(null, T0, 5), true, 'первая осада с пятой победы');
const last = Siege.started(null, T0, 5);
assert.deepStrictEqual(last, { day: Siege.dayKey(T0), wins: 5 });
assert.strictEqual(Siege.due(last, T0 + 3600e3, 9), false, 'в тот же день — нет');
assert.strictEqual(Siege.due(last, T0 + 3600e3, 500), false, 'сколько ни побеждай — в тот же день второй осады нет');
assert.strictEqual(Siege.due(last, T0 + DAY, 6), true, 'на следующий день — снова');
assert.strictEqual(Siege.due(Siege.started(last, T0 + DAY, 6), T0 + DAY + 3600e3, 99), false);
assert.strictEqual(Siege.due({ day: 'мусор' }, T0, 50), true, 'битое расписание не ломает');
assert.strictEqual(Siege.due('x', T0, 50), true);

// размер волны
assert.deepStrictEqual([1, 3, 4, 7, 8, 10].map(Siege.size), [3, 3, 4, 4, 5, 5]);

// оборона растёт с Ратушей; значения в разумных рамках
let prev = null;
for (let L = 0; L <= 5; L++) {
  const D = Siege.defense(L);
  assert.ok(D.volley >= 0.08 && D.volley <= 0.23 + 1e-9, 'выстрел башен 8…23%: ' + D.volley);
  assert.ok(D.minutes >= 8 && D.minutes <= 13);
  assert.ok(D.theft >= 0.05 - 1e-9 && D.theft <= 0.10 + 1e-9);
  if (prev) { assert.ok(D.volley > prev.volley && D.minutes > prev.minutes && D.theft < prev.theft, 'каждый уровень Ратуши усиливает защиту'); }
  prev = D;
}
assert.deepStrictEqual(Siege.defense(-3), Siege.defense(0));
assert.deepStrictEqual(Siege.defense(99), Siege.defense(5));
assert.deepStrictEqual(Siege.defense('мусор'), Siege.defense(0));

// волна
let seq = 0;
const rand = () => ((seq++ * 0.37) % 1);
const pick = (tier, r) => ['wolf', 'boar', 'rat'][Math.floor(r() * 3)];
const cells = [10, 11, 12, 13, 14, 15];
const s = Siege.make(rand, 5, cells, pick, T0, 2);
assert.strictEqual(s.total, 4);
assert.strictEqual(s.raiders.length, 4);
assert.deepStrictEqual(s.raiders.map((r) => r.idx), [10, 11, 12, 13]);
assert.ok(s.raiders.every((r) => r.tier === 5 && !r.dead && typeof r.id === 'string'));
assert.strictEqual(new Set(s.raiders.map((r) => r.id)).size, 4, 'id уникальны');
assert.strictEqual(s.t1 - s.t0, Siege.defense(2).minutes * 60000);
assert.ok(Siege.active(s));
assert.strictEqual(Siege.make(rand, 10, [1, 2], pick, T0, 0).total, 2, 'не больше, чем свободных сот');
assert.strictEqual(Siege.make(rand, 10, [], pick, T0, 0).total, 0);
assert.strictEqual(Siege.active(Siege.make(rand, 10, [], pick, T0, 0)), false);

// ход осады
assert.strictEqual(Siege.timeLeft(s, T0), s.t1 - T0);
assert.strictEqual(Siege.expired(s, T0 + 1000), false);
assert.strictEqual(Siege.expired(s, s.t1), true);
for (const r of s.raiders.slice(0, 3)) assert.deepStrictEqual(Siege.kill(s, r.id), { won: false, ok: true });
assert.strictEqual(Siege.remaining(s), 1);
assert.deepStrictEqual(Siege.kill(s, s.raiders[0].id), { won: false, ok: false }, 'повторно нельзя');
assert.deepStrictEqual(Siege.kill(s, 'нет такого'), { won: false, ok: false });
assert.deepStrictEqual(Siege.kill(s, s.raiders[3].id), { won: true, ok: true });
assert.strictEqual(Siege.active(s), false);
assert.ok(Siege.rewardCoins(100, 4) > Siege.rewardCoins(100, 3));

// кража: доля зависит от Ратуши и числа ушедших; ресурс — одна пачка не меньше трёх
const stacks = [{ kind: 'hide', tier: 2, n: 10 }, { kind: 'fang', tier: 2, n: 1 }];
const t0 = Siege.theft(0, 4, 4, 1000, stacks, () => 0);
assert.strictEqual(t0.coins, 100, '10% монет при Ратуше 0 и полном провале');
assert.deepStrictEqual(t0.res, { kind: 'hide', tier: 2, n: 1 });
assert.strictEqual(Siege.theft(5, 4, 4, 1000, stacks, () => 0).coins, 50, '5% при Ратуше 5');
assert.strictEqual(Siege.theft(0, 2, 4, 1000, stacks, () => 0).coins, 50, 'половина осталась — половина потерь');
assert.strictEqual(Siege.theft(0, 0, 4, 1000, stacks).coins, 0, 'всех отбили — ничего не унесли');
assert.strictEqual(Siege.theft(0, 4, 4, 0, [], () => 0).coins, 0);
assert.strictEqual(Siege.theft(0, 4, 4, 0, [], () => 0).res, null);
assert.strictEqual(Siege.theft(0, 4, 4, 1000, [{ kind: 'fang', tier: 1, n: 2 }], () => 0).res, null, 'пачка меньше трёх не трогается');
assert.strictEqual(Siege.theft(0, 4, 4, NaN, null).coins, 0);
for (const coins of [1, 9, 77, 12345]) assert.ok(Siege.theft(0, 4, 4, coins, [], () => 0).coins <= Math.floor(coins * 0.1), 'не больше 10%');

// деление добычи сохраняет сумму
for (const k of [1, 2, 3, 5]) {
  const parts = Siege.split({ coins: 101, res: { kind: 'hide', tier: 2, n: 7 } }, k);
  assert.strictEqual(parts.length, k);
  assert.strictEqual(parts.reduce((a, p) => a + p.coins, 0), 101);
  assert.strictEqual(parts.reduce((a, p) => a + (p.res ? p.res.n : 0), 0), 7);
}
assert.deepStrictEqual(Siege.split({ coins: 5, res: null }, 0), []);

// срок вышел: оставшиеся становятся похитителями
const s2 = Siege.make(rand, 6, cells, pick, T0, 0);
Siege.kill(s2, s2.raiders[0].id);
const loot = Siege.theft(0, Siege.remaining(s2), s2.total, 2000, stacks, () => 0);
Siege.expire(s2, T0 + 20 * 60000, loot);
assert.strictEqual(s2.over, true);
assert.strictEqual(s2.looters.length, 3);
assert.strictEqual(s2.looters.reduce((a, l) => a + l.loot.coins, 0), loot.coins, 'добыча распределена полностью');
assert.strictEqual(Siege.active(s2), false);
assert.strictEqual(Siege.liveLooters(s2, T0 + 21 * 60000).length, 3);
assert.strictEqual(Siege.liveLooters(s2, s2.lootEnds).length, 0, 'через полчаса похитители уходят');
const back = Siege.killLooter(s2, s2.looters[1].id);
assert.ok(back && back.coins >= 0);
assert.strictEqual(Siege.killLooter(s2, s2.looters[1].id), null, 'повторно добычу не вернуть');
assert.strictEqual(Siege.liveLooters(s2, T0 + 21 * 60000).length, 2);
assert.strictEqual(Siege.expire(s2, T0, loot), s2, 'второй раз ничего не меняет');
assert.strictEqual(s2.looters.length, 3);

// проверка сохранённого состояния
assert.strictEqual(Siege.sane(JSON.parse(JSON.stringify(s))) !== null, true);
assert.strictEqual(Siege.sane(JSON.parse(JSON.stringify(s2))) !== null, true);
for (const bad of [null, 5, 'x', {}, { raiders: 'x' }, { raiders: [{ id: 1 }], t0: 0, t1: 1 }, { raiders: [], t0: 'a', t1: 1 },
  { raiders: [{ id: 'a', idx: -1, species: 'wolf', tier: 1 }], t0: 0, t1: 1 }, { raiders: [{ id: 'a', idx: 1, species: 'wolf', tier: 99 }], t0: 0, t1: 1 }]) {
  assert.strictEqual(Siege.sane(bad), null, 'битое состояние отвергается: ' + JSON.stringify(bad));
}
console.log('siege: все тесты пройдены');

// 1.8.6: плата страже — дешевле кражи, не меньше 25, при пустой осаде 0
{
  const S = require('../js/siege.js');
  assert.strictEqual(S.guardFee(0, 0, 3, 1000), 0);
  assert.strictEqual(S.guardFee(0, 3, 3, 0), 25);
  const fee = S.guardFee(0, 3, 3, 5000);
  assert.ok(fee > 25 && fee < S.theft(0, 3, 3, 5000, null).coins, 'стража дешевле кражи');
  console.log('siege: плата страже — ок');
}
