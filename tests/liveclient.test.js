// Клиент боя (js/live.js) против настоящего сервера (server/src/live.js): очередь, ходы по порядку, пропуск хода, возврат после обрыва.
const assert = require('assert');
const http = require('http');
const WebSocket = require('../server/node_modules/ws');
const Live = require('../js/live.js');
const live = require('../server/src/live');
const { cleanCard, sha } = require('../server/src/app');

const wait = async (f, ms = 4000) => { const t0 = Date.now(); for (;;) { const v = f(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('ожидание'); await new Promise((r) => setTimeout(r, 15)); } };
const card = (n, l) => ({ nick: n, faction: 'elf', gender: 'm', level: l, rank: 0, gear: {} });

(async () => {
  const store = require('../server/src/store-memory').create();
  const toks = { a: 'a'.repeat(64), b: 'b'.repeat(64) };
  for (const [k, p] of [['a', 'p-aaaaaaaa-aaaaaaaa-aaaaaaaa'], ['b', 'p-bbbbbbbb-bbbbbbbb-bbbbbbbb']]) { await store.findOrCreatePlayer('site', k, p); await store.createSession(sha(toks[k]), p, Date.now() + 1e6); }
  const srv = http.createServer((q, r) => r.end('{}'));
  const lv = live.attach({ server: srv, store, cfg: {}, sha, live: { cleanCard, cfg: { spread: 5, turnMs: 600, graceMs: 100, resultMs: 800 } } });
  await new Promise((r) => srv.listen(0, r));
  const url = 'ws://127.0.0.1:' + srv.address().port + '/live';
  const mk = (t) => { const c = Live.create({ url, token: toks[t], WS: WebSocket, retryMs: 50 }); const ev = []; for (const e of ['ready', 'matched', 'end', 'away', 'back', 'resumed', 'lost', 'timeout', 'noopp', 'auth-fail']) c.on(e, (m) => ev.push(e)); c.ev = ev; return c; };
  const A = mk('a'), B = mk('b'); A.on('queued', () => {}); B.on('queued', () => {});
  A.connect(); B.connect(); await wait(() => A.ev.includes('ready') && B.ev.includes('ready'));
  A.queue(card('Аня', 10)); B.queue(card('Боря', 11));
  await wait(() => A.ev.includes('matched') && B.ev.includes('matched'));
  assert.notStrictEqual(A.role, B.role);
  const first = A.role === A.first ? A : B, second = first === A ? B : A;
  // ходы идут по порядку; соперник получает их через next()
  first.act({ k: 'move', a: 1, b: 2 }); first.act({ k: 'lightning', on: true });
  first.act({ k: 'end' }, true);
  assert.deepStrictEqual((await second.next()).act, { k: 'move', a: 1, b: 2 });
  assert.deepStrictEqual((await second.next()).act, { k: 'lightning', on: true });
  assert.deepStrictEqual((await second.next()).act, { k: 'end' });
  // обрыв у второго: ходы, посланные первым в это время, дойдут после возвращения
  second.act({ k: 'move', a: 5, b: 6 });
  { const m = await first.next(); if (!m.act) console.log('GOT', JSON.stringify(m), first.role); assert.deepStrictEqual(m.act, { k: 'move', a: 5, b: 6 }); }
  second.act({ k: 'end' }, true); await first.next();
  // первый ходит, второй в этот момент теряет связь (закрываем сокет «снизу»)
  lv.wss.clients.forEach((c) => { /* найдём сокет второго по порядку подключения нельзя — закроем все: оба вернутся */ c.terminate(); });
  await wait(() => !first.up && !second.up);
  first.act({ k: 'move', a: 7, b: 8 }); first.act({ k: 'end' }, true);   // пока связи нет — в очереди отправки
  await wait(() => first.ev.includes('resumed') && second.ev.includes('resumed'));
  { const m = await second.next(); if (!m.act) console.log('GOT', JSON.stringify(m), second.role); assert.deepStrictEqual(m.act, { k: 'move', a: 7, b: 8 }); }
  assert.deepStrictEqual((await second.next()).act, { k: 'end' });
  // второй не успевает — таймаут виден обоим
  const to = await first.next(); assert.ok(to.timeout, 'ждём пропуск хода');
  assert.strictEqual(to.side === first.role, false);
  // итог
  first.result(first.role); second.result(first.role);
  const e = await first.next(); assert.ok(e.end); assert.strictEqual(e.winner, first.role);
  A.close(); B.close(); lv.close(); srv.close();
  console.log('liveclient: все тесты пройдены');
})().catch((e) => { console.error(e); process.exit(1); });
