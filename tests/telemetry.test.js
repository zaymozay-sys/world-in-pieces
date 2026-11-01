// Клиент отчётов тестировщиков: очередь, отправка пачками, повтор после сбоя, выключатель, дедупликация ошибок.
const assert = require('assert');
require('../js/i18n.js');
global.GAME_VERSION = '2.2.4';
const store = {}; global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.Profile = { data: { name: 'Тестер', faction: 'dwarf', wins: 7, coins: 5 }, level: () => 12 };
global.Hero = { tierFor: () => 2 };
let calls = [], ok = true;
global.Net = { current: { remote: { enabled: true, telemetry: async (b) => { calls.push(b); return ok; } } } };
const T = require('../js/telemetry.js');
(async () => {
  const b = T.buildBattle({ n: 5, result: 'win', hero: { name: 'Тестер', hp: 40, max: 100 }, foe: { name: 'Крыса', tier: 1, hp: 0, max: 30 }, stats: { turns: 9 }, lines: Array.from({ length: 500 }, (_, i) => ({ side: i % 2 ? 'left' : 'right', text: 'x'.repeat(400) })) });
  assert.strictEqual(b.lines.length, T.LINES, 'журнал обрезан по числу строк');
  assert.ok(b.lines.every((l) => l.length <= 162), 'и по длине');
  assert.ok(JSON.stringify(b).length < 40000, 'запись влезает в лимит сервера');
  assert.deepStrictEqual([b.hero.level, b.hero.faction], [12, 'dwarf'], 'сводка о герое приложена');
  assert.strictEqual(T.battle({ n: 1, result: 'loss', lines: [] }), true);
  assert.strictEqual(T.pending(), 1);
  ok = false; assert.strictEqual(await T.flush(), false, 'сервер недоступен'); assert.strictEqual(T.pending(), 1, 'запись не потеряна');
  ok = true; assert.strictEqual(await T.flush(), true); assert.strictEqual(T.pending(), 0, 'после успеха очередь пуста');
  assert.strictEqual(calls[calls.length - 1][0].kind, 'battle');
  // выключатель
  T.setEnabled(false); assert.strictEqual(T.battle({ n: 2, lines: [] }), false); assert.strictEqual(T.pending(), 0);
  T.setEnabled(true);
  // ошибки: одинаковые не повторяются
  assert.strictEqual(T.error('boom', 'a.js', 10, 1, 'stack'), true);
  assert.strictEqual(T.error('boom', 'a.js', 10, 1, 'stack'), false);
  // очередь без сети ограничена
  global.Net.current.remote.enabled = false;
  for (let i = 0; i < 100; i++) T.report('проблема ' + i);
  assert.ok(T.pending() <= 60, 'очередь не растёт бесконечно');
  // пачки не больше 20
  global.Net.current.remote.enabled = true; calls = [];
  await T.flush(); assert.ok(calls.every((c) => c.length <= 20)); assert.strictEqual(T.pending(), 0);
  console.log('telemetry (клиент): все тесты пройдены');
})().catch((e) => { console.error(e); process.exit(1); });
