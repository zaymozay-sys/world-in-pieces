// Тесты канала боя: ядро с поддельными часами (без сети) и один сквозной прогон по настоящему WebSocket.
const assert = require('assert');
const http = require('http');
const live = require('../src/live');

// --- ядро ---
let T = 0; const timers = [];
const setT = (fn, ms) => { const t = { fn, at: T + ms, off: false }; timers.push(t); return t; };
const clrT = (t) => { if (t) t.off = true; };
const adv = (ms) => { const end = T + ms; for (;;) { const n = timers.filter((x) => !x.off && x.at <= end).sort((a, b) => a.at - b.at)[0]; if (!n) break; T = n.at; n.off = true; n.fn(); } T = end; };
const out = new Map(); const sent = (c) => out.get(c) || [];
const mk = (cfg, onEnd) => { out.clear(); timers.length = 0; return live.create({ send: (c, m) => { if (!out.has(c)) out.set(c, []); out.get(c).push(m); }, now: () => T, setTimer: setT, clearTimer: clrT, cfg, onEnd, seedOf: () => 7 }); };
const last = (c, t) => sent(c).filter((m) => m.t === t).pop();
const card = (level) => ({ nick: 'n' + level, faction: 'elf', gender: 'm', level, rank: 0, gear: {} });

let ends = []; let L = mk({}, (e) => ends.push(e));
L.hello(1, 'p1'); L.hello(2, 'p2'); L.hello(3, 'p3');
L.message(1, { t: 'queue', card: card(10) });
assert.strictEqual(last(1, 'queued').t, 'queued');
L.message(3, { t: 'queue', card: card(30) });          // слишком далёкий уровень
L.message(2, { t: 'queue', card: card(12) });
const m1 = last(1, 'matched'), m2 = last(2, 'matched');
assert.ok(m1 && m2 && m1.room === m2.room && m1.seed === 7 && m1.role === 'A' && m2.role === 'B' && m1.first === 'A');
assert.strictEqual(m1.opp.level, 12); assert.strictEqual(m2.opp.level, 10);
assert.ok(!last(3, 'matched'));
adv(20000); L.tick(); assert.strictEqual(last(3, 'noopp').t, 'noopp');   // 3 — никого не нашлось

// порядок ходов: ходит A; B не может; номера по порядку
L.message(2, { t: 'act', n: 1, a: [1, 2], done: true }); assert.strictEqual(last(2, 'err').e, 'not-your-turn');
L.message(1, { t: 'act', n: 2, a: [1, 2], done: true }); assert.strictEqual(last(1, 'err').e, 'order');
L.message(1, { t: 'act', n: 1, a: [[0, 0], [0, 1]], done: false });     // дополнительный ход — владелец прежний
L.message(1, { t: 'act', n: 2, a: [[1, 0], [1, 1]], done: true });
assert.deepStrictEqual(sent(2).filter((m) => m.t === 'act').map((m) => m.n), [1, 2]);
L.message(1, { t: 'act', n: 3, a: [], done: true }); assert.strictEqual(last(1, 'err').e, 'not-your-turn');
L.message(2, { t: 'act', n: 3, a: [[2, 0], [2, 1]], done: true });
assert.strictEqual(sent(1).filter((m) => m.t === 'act').pop().n, 3);

// таймер хода: ходит A; через 32 с — пропуск, право хода у B; после 3 пропусков подряд — поражение
adv(32000); assert.strictEqual(last(1, 'timeout').side, 'A'); assert.strictEqual(last(2, 'timeout').strikes, 1);
L.message(2, { t: 'act', n: 4, a: [[3, 0], [3, 1]], done: true });      // B успел — ход снова у A
adv(32000); assert.strictEqual(last(1, 'timeout').strikes, 2);  // A не успел (второй пропуск подряд): пропуск, ход у B
L.message(2, { t: 'act', n: 5, a: [[3, 0], [3, 1]], done: true });
assert.strictEqual(sent(1).filter((m) => m.t === 'act').pop().n, 5);

// отдельная комната: проигрыш за 3 пропуска подряд
ends = []; L = mk({}, (e) => ends.push(e));
L.hello(1, 'p1'); L.hello(2, 'p2'); L.message(1, { t: 'queue', card: card(5) }); L.message(2, { t: 'queue', card: card(5) });
adv(32000); adv(32000); adv(32000); adv(32000); adv(32000); adv(32000);   // A,B,A,B,A,B — у каждого по 3
assert.strictEqual(ends.length, 1); assert.strictEqual(ends[0].reason, 'timeouts');
assert.strictEqual(last(1, 'end').reason, 'timeouts');
// A пропускал 1-й, 3-й, 5-й ходы; B — 2-й, 4-й, 6-й; но подряд у каждого счёт 1→2→3 без сброса: проигрывает тот, чей 3-й пропуск раньше (A)
assert.strictEqual(ends[0].winner, 'B');

// итог: оба согласны — победа; расходятся — ничья; один молчит — ничья по таймауту
ends = []; L = mk({}, (e) => ends.push(e));
L.hello(1, 'p1'); L.hello(2, 'p2'); L.message(1, { t: 'queue', card: card(5) }); L.message(2, { t: 'queue', card: card(5) });
L.message(1, { t: 'result', winner: 'A' }); L.message(2, { t: 'result', winner: 'A' });
assert.strictEqual(ends[0].winner, 'A'); assert.strictEqual(ends[0].reason, 'played');
ends = []; L = mk({}, (e) => ends.push(e));
L.hello(1, 'p1'); L.hello(2, 'p2'); L.message(1, { t: 'queue', card: card(5) }); L.message(2, { t: 'queue', card: card(5) });
L.message(1, { t: 'result', winner: 'A' }); L.message(2, { t: 'result', winner: 'B' });
assert.strictEqual(ends[0].winner, 'draw'); assert.strictEqual(ends[0].reason, 'desync');
ends = []; L = mk({}, (e) => ends.push(e));
L.hello(1, 'p1'); L.hello(2, 'p2'); L.message(1, { t: 'queue', card: card(5) }); L.message(2, { t: 'queue', card: card(5) });
L.message(1, { t: 'result', winner: 'A' }); adv(9000);
assert.strictEqual(ends[0].winner, 'draw'); assert.strictEqual(ends[0].reason, 'nores');

// сдача: победа соперника
ends = []; L = mk({}, (e) => ends.push(e));
L.hello(1, 'p1'); L.hello(2, 'p2'); L.message(1, { t: 'queue', card: card(5) }); L.message(2, { t: 'queue', card: card(5) });
L.message(2, { t: 'forfeit' }); assert.strictEqual(ends[0].winner, 'A'); assert.strictEqual(ends[0].reason, 'forfeit'); assert.strictEqual(last(1, 'end').winner, 'A');

// обрыв и возвращение: получает пропущенные ходы
L = mk({}, () => {});
L.hello(1, 'p1'); L.hello(2, 'p2'); L.message(1, { t: 'queue', card: card(5) }); L.message(2, { t: 'queue', card: card(5) });
const room = last(1, 'matched').room;
L.message(1, { t: 'act', n: 1, a: [1], done: true });
L.close(2); assert.strictEqual(last(1, 'opp-away').t, 'opp-away');
L.message(2, { t: 'act', n: 2, a: [2], done: true });          // закрытое соединение ничего не делает
L.hello(5, 'p2'); L.message(5, { t: 'resume', room, have: 0 });
const rs = last(5, 'resumed'); assert.strictEqual(rs.role, 'B'); assert.strictEqual(rs.acts.length, 1); assert.strictEqual(rs.owner, 'B');
assert.strictEqual(last(1, 'opp-back').t, 'opp-back');
L.hello(6, 'p9'); L.message(6, { t: 'resume', room, have: 0 }); assert.strictEqual(last(6, 'gone').t, 'gone');   // чужой в комнату не попадёт
// тот, кто в бою, в очередь не встаёт
L.message(5, { t: 'queue', card: card(5) }); assert.ok(!last(5, 'queued'));

// --- настоящий WebSocket ---
(async () => {
  const { create: mkApp, cleanCard, sha } = require('../src/app');
  const store = require('../src/store-memory').create();
  const tokA = 'a'.repeat(64), tokB = 'b'.repeat(64);
  await store.findOrCreatePlayer('site', 'x1', 'p-aaaaaaaa-aaaaaaaa-aaaaaaaa'); await store.findOrCreatePlayer('site', 'x2', 'p-bbbbbbbb-bbbbbbbb-bbbbbbbb');
  await store.createSession(sha(tokA), 'p-aaaaaaaa-aaaaaaaa-aaaaaaaa', Date.now() + 1e6); await store.createSession(sha(tokB), 'p-bbbbbbbb-bbbbbbbb-bbbbbbbb', Date.now() + 1e6);
  const srv = http.createServer((q, r) => { r.end('{}'); });
  const lv = live.attach({ server: srv, store, cfg: {}, sha, live: { cleanCard, cfg: { spread: 5 } } });
  await new Promise((r) => srv.listen(0, r));
  const WebSocket = require('ws'); const port = srv.address().port;
  const open = (tok) => new Promise((res) => { const ws = new WebSocket('ws://127.0.0.1:' + port + '/live'); const got = []; ws.on('message', (d) => got.push(JSON.parse(String(d)))); ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', token: tok })); res({ ws, got }); }); });
  const wait = async (f, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = f(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); } throw new Error('ожидание'); };
  const A = await open(tokA), B = await open(tokB), X = await open('c'.repeat(64));
  await wait(() => A.got.find((m) => m.t === 'hello-ok')); await wait(() => B.got.find((m) => m.t === 'hello-ok'));
  await wait(() => X.got.find((m) => m.t === 'auth-fail'));                       // чужой токен не пускают
  const c = (n, lvl) => ({ nick: n, faction: 'dwarf', gender: 'f', level: lvl, rank: 0, gear: {} });
  A.ws.send(JSON.stringify({ t: 'queue', card: c('Аня', 10) })); B.ws.send(JSON.stringify({ t: 'queue', card: c('Боря', 11) }));
  const ma = await wait(() => A.got.find((m) => m.t === 'matched')), mb = await wait(() => B.got.find((m) => m.t === 'matched'));
  assert.strictEqual(ma.seed, mb.seed); assert.strictEqual(ma.opp.nick, 'Боря'); assert.strictEqual(mb.opp.nick, 'Аня');
  const first = ma.first === 'A' ? A : B, second = ma.first === 'A' ? B : A;
  first.ws.send(JSON.stringify({ t: 'act', n: 1, a: [[0, 0], [0, 1]], done: true }));
  const got = await wait(() => second.got.find((m) => m.t === 'act')); assert.deepStrictEqual(got.a, [[0, 0], [0, 1]]);
  A.ws.send(JSON.stringify({ t: 'result', winner: ma.first })); B.ws.send(JSON.stringify({ t: 'result', winner: ma.first }));
  const e = await wait(() => A.got.find((m) => m.t === 'end')); assert.strictEqual(e.winner, ma.first);
  A.ws.close(); B.ws.close(); lv.close(); srv.close();
  console.log('live: все тесты пройдены');
})().catch((e) => { console.error(e); process.exit(1); });
