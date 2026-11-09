const assert = require('assert'); const http = require('http');
const { load } = require('../src/config'); const { create } = require('../src/app'); const tele = require('../src/telemetry');
// чистка пачки
assert.strictEqual(tele.clean([{ kind: 'battle', data: { a: 1 } }, { kind: 'x', data: {} }, { kind: 'error', data: [] }, null, { kind: 'report' }]).length, 1);
assert.strictEqual(tele.clean([{ kind: 'battle', data: { big: 'x'.repeat(tele.MAX_ITEM_BYTES) } }]).length, 0, 'слишком большая запись отбрасывается');
assert.strictEqual(tele.clean(Array.from({ length: 50 }, () => ({ kind: 'error', data: { m: 1 } }))).length, tele.MAX_ITEMS);
(async () => {
  const st = require('../src/store-memory').create();
  const cfg = Object.assign(load({}), { platforms: ['site'], allowedOrigins: [], rateAuth: 1000, rateIp: 1000, statsKey: 'secret-key-123' });
  let T = 1e12; const P = ['p-aaaaaaaa-aaaaaaaa-aaaaaaaa', 'p-bbbbbbbb-bbbbbbbb-bbbbbbbb'];
  const srv = http.createServer(create({ cfg, store: st, now: () => T }).handler);
  await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
  const call = (method, path, body, token) => new Promise((resolve, reject) => {
    const d = body ? JSON.stringify(body) : null;
    const r = http.request({ port, method, path, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}) } }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { /* пусто */ } resolve({ code: res.statusCode, json: j }); }); });
    r.on('error', reject); if (d) r.write(d); r.end();
  });
  const tok = [];
  for (let i = 0; i < 2; i++) tok.push((await call('POST', '/auth', { platform: 'site', guest: 'xy'[i].repeat(40), pid: P[i] })).json.token);
  await st.putCard(P[0], 20, JSON.stringify({ nick: 'Аня' }));
  assert.strictEqual((await call('POST', '/telemetry', { items: [] })).code, 401, 'без входа нельзя');
  assert.strictEqual((await call('POST', '/telemetry', { items: 5 }, tok[0])).code, 400);
  let r = await call('POST', '/telemetry', { items: [{ kind: 'battle', ver: '2.0.9', at: T, data: { result: 'win', turns: 12 } }, { kind: 'error', ver: '2.0.9', data: { msg: 'boom' } }, { kind: 'evil', data: {} }] }, tok[0]);
  assert.deepStrictEqual([r.code, r.json.n], [200, 2]);
  await call('POST', '/telemetry', { items: [{ kind: 'report', who: 'Боря', data: { note: 'не работает' } }] }, tok[1]);
  assert.strictEqual((await call('GET', '/telemetry')).code, 404, 'чтение без ключа выключено');
  assert.strictEqual((await call('GET', '/telemetry?key=wrong-key-1234')).code, 404);
  r = await call('GET', '/telemetry?key=secret-key-123');
  assert.strictEqual(r.json.list.length, 3);
  assert.strictEqual(r.json.list.find((x) => x.kind === 'battle').nick, 'Аня', 'ник берётся из карточки');
  assert.strictEqual(r.json.list.find((x) => x.kind === 'report').nick, 'Боря', 'без карточки — имя от клиента');
  assert.strictEqual((await call('GET', '/telemetry?key=secret-key-123&kind=error')).json.list.length, 1);
  assert.strictEqual((await call('GET', '/telemetry?key=secret-key-123&kind=zzz')).code, 400);
  // ограничение частоты: 120 в час на игрока
  let last = 0; for (let i = 0; i < 125; i++) last = (await call('POST', '/telemetry', { items: [] }, tok[1])).code;
  assert.strictEqual(last, 429);
  // удаление игрока уносит и отчёты
  assert.strictEqual((await call('DELETE', '/me', null, tok[0])).code, 200);
  assert.strictEqual((await call('GET', '/telemetry?key=secret-key-123&kind=battle')).json.list.length, 0);
  srv.close(); console.log('telemetry: все тесты пройдены');
})().catch((e) => { console.error(e); process.exit(1); });

// скриншот к сообщению: принимается только JPEG data-URL в пределах лимита, лежит рядом с текстом
{
  const T = require('../src/telemetry');
  const ok = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
  const r1 = T.clean([{ kind: 'report', ver: '1', who: 'x', at: 1, data: { note: 'hi', shot: ok } }]);
  if (r1.length !== 1 || r1[0].data.shot !== ok || r1[0].data.note !== 'hi') throw new Error('shot: должен сохраниться');
  const r2 = T.clean([{ kind: 'report', ver: '1', who: 'x', at: 1, data: { note: 'hi', shot: 'data:text/html;base64,AAAA' } }]);
  if (r2.length !== 1 || 'shot' in r2[0].data) throw new Error('shot: чужой тип должен отбрасываться');
  const r3 = T.clean([{ kind: 'report', ver: '1', who: 'x', at: 1, data: { note: 'hi', shot: 'data:image/jpeg;base64,' + 'A'.repeat(236000) } }]);
  if ('shot' in r3[0].data) throw new Error('shot: слишком большой должен отбрасываться');
  console.log('telemetry shot ok');
}
