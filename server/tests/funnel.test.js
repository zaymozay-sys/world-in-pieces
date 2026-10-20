const assert = require('assert'); const http = require('http');
const { load } = require('../src/config'); const { create } = require('../src/app');
(async () => {
  const st = require('../src/store-memory').create();
  const cfg = Object.assign(load({}), { platforms: ['site'], allowedOrigins: ['https://game.test'], rateIp: 1000, statsKey: 'secret-key-123' });
  let T = Date.UTC(2026, 9, 20, 12);
  const srv = http.createServer(create({ cfg, store: st, now: () => T }).handler);
  await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
  const req = (method, path, body) => new Promise((res) => { const r = http.request({ port, method, path, headers: { 'Content-Type': 'application/json', Origin: 'https://game.test' } }, (x) => { let s = ''; x.on('data', (c) => (s += c)); x.on('end', () => res({ code: x.statusCode, json: s ? JSON.parse(s) : null })); }); r.end(body ? JSON.stringify(body) : undefined); });
  assert.strictEqual((await req('POST', '/funnel', { e: 'win1' })).code, 200);
  assert.strictEqual((await req('POST', '/funnel', { e: 'win1' })).code, 200);
  assert.strictEqual((await req('POST', '/funnel', { e: 'tut_done' })).code, 200);
  assert.strictEqual((await req('POST', '/funnel', { e: 'hack<script>' })).code, 400);
  assert.strictEqual((await req('POST', '/funnel', {})).code, 400);
  assert.strictEqual((await req('GET', '/funnel')).code, 404, 'без ключа чтения нет');
  assert.strictEqual((await req('GET', '/funnel?key=wrong-key-1234')).code, 404);
  const r = await req('GET', '/funnel?key=secret-key-123');
  assert.deepStrictEqual(r.json.days, { '2026-10-20': { win1: 2, tut_done: 1 } });
  T += 86400000; await req('POST', '/funnel', { e: 'win1' });
  assert.strictEqual((await req('GET', '/funnel?key=secret-key-123')).json.days['2026-10-21'].win1, 1);
  // ограничение частоты: 40 в час с адреса
  let last = 0; for (let i = 0; i < 45; i++) last = (await req('POST', '/funnel', { e: 'win3' })).code;
  assert.strictEqual(last, 429);
  // без ключа в конфиге чтение выключено
  const cfg2 = Object.assign(load({}), { platforms: ['site'], rateIp: 1000 });
  assert.strictEqual(cfg2.statsKey, '');
  srv.close(); console.log('funnel: все тесты пройдены');
})().catch((e) => { console.error(e); process.exit(1); });
