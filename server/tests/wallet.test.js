const assert = require('assert'); const http = require('http');
const { load } = require('../src/config'); const { create } = require('../src/app'); const premium = require('../src/premium'); const R = premium.RED;
// каталог: три топовых комплекта и эпика не продаются
assert.ok(!Object.keys(premium.FIXED).some((k) => premium.FORBIDDEN_SETS.some((s) => k.indexOf(s) >= 0)));
assert.strictEqual(premium.check({ kind: 'goods', item: 'hammer_helm', n: 5, ref: 'ref-12345678' }, new Set()).reason, 'forbidden');
assert.strictEqual(premium.check({ kind: 'fixed', item: 'stable_3', ref: 'ref-12345678' }, new Set()).reason, 'order', 'слоты по порядку');
assert.strictEqual(premium.check({ kind: 'convert', n: -5, ref: 'ref-12345678' }, new Set()).reason, 'n');
assert.strictEqual(premium.check({ kind: 'convert', n: 5, ref: 'x' }, new Set()).reason, 'ref');
(async () => {
  const st = require('../src/store-memory').create();
  const cfg = Object.assign(load({}), { platforms: ['site'], allowedOrigins: [], rateAuth: 1000, rateIp: 1000, statsKey: 'secret-key-123', testSparks: true });
  let T = 1e12; const pid = 'p-aaaaaaaa-aaaaaaaa-aaaaaaaa';
  const srv = http.createServer(create({ cfg, store: st, now: () => T }).handler);
  await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
  const call = (method, path, body, token) => new Promise((resolve, reject) => {
    const d = body ? JSON.stringify(body) : null;
    const r = http.request({ port, method, path, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}) } }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { /* пусто */ } resolve({ code: res.statusCode, json: j }); }); });
    r.on('error', reject); if (d) r.write(d); r.end();
  });
  const tok = (await call('POST', '/auth', { platform: 'site', guest: 'x'.repeat(40), pid })).json.token;
  assert.strictEqual((await call('GET', '/wallet')).code, 401);
  assert.strictEqual((await call('GET', '/wallet', null, tok)).json.balance, 0);
  assert.strictEqual((await call('POST', '/wallet/spend', { kind: 'convert', n: 10, ref: 'conv-00000001' }, tok)).code, 402, 'без искр тратить нельзя');
  // выдача разработчиком: только по ключу, повтор с тем же ref не удваивает
  assert.strictEqual((await call('POST', '/wallet/grant', { pid, n: 500 * R, ref: 'grant-0000001' })).code, 404);
  let r = await call('POST', '/wallet/grant?key=secret-key-123', { pid, n: 500 * R, ref: 'grant-0000001' });
  assert.strictEqual(r.json.balance, 500 * R);
  r = await call('POST', '/wallet/grant?key=secret-key-123', { pid, n: 500 * R, ref: 'grant-0000001' });
  assert.strictEqual(r.json.balance, 500 * R, 'повторная выдача с тем же номером не удваивается');
  // тестовые искры раз в сутки
  r = await call('POST', '/wallet/test-grant', null, tok); assert.strictEqual(r.json.balance, 1500 * R);
  assert.strictEqual((await call('POST', '/wallet/test-grant', null, tok)).code, 429);
  T += 86400000 + 1; assert.strictEqual((await call('POST', '/wallet/test-grant', null, tok)).json.balance, 2500 * R);
  // траты
  r = await call('POST', '/wallet/spend', { kind: 'convert', n: 100 * R, ref: 'conv-00000002' }, tok); assert.deepStrictEqual([r.code, r.json.balance], [200, 2400 * R]);
  r = await call('POST', '/wallet/spend', { kind: 'convert', n: 100 * R, ref: 'conv-00000002' }, tok); assert.deepStrictEqual([r.json.balance, r.json.dup], [2400 * R, true], 'повтор запроса не списывает дважды');
  assert.strictEqual((await call('POST', '/wallet/spend', { kind: 'goods', item: 'legend_sword', n: 5, ref: 'good-00000001' }, tok)).code, 400, 'топовые комплекты не продаются');
  assert.strictEqual((await call('POST', '/wallet/spend', { kind: 'fixed', item: 'stable_3', ref: 'stab-00000003' }, tok)).code, 400, 'слот 3 без слота 2');
  r = await call('POST', '/wallet/spend', { kind: 'fixed', item: 'stable_2', ref: 'stab-00000002' }, tok); assert.deepStrictEqual([r.code, r.json.balance, r.json.spent], [200, 2250 * R, 150 * R]);
  assert.strictEqual((await call('POST', '/wallet/spend', { kind: 'fixed', item: 'stable_2', ref: 'stab-00000009' }, tok)).code, 400, 'уже куплено');
  assert.deepStrictEqual((await call('GET', '/wallet', null, tok)).json.rights, ['stable_2']);
  r = await call('POST', '/wallet/spend', { kind: 'fixed', item: 'look_stonewall', ref: 'look-00000001' }, tok); assert.strictEqual(r.json.balance, 2250 * R, 'дорогой облик не по карману');
  // удаление игрока уносит баланс и права
  assert.strictEqual((await call('DELETE', '/me', null, tok)).code, 200);
  const w = await st.walletGet(pid); assert.deepStrictEqual([w.balance, w.rights.length], [0, 0]);
  srv.close(); console.log('wallet: все тесты пройдены');
})().catch((e) => { console.error(e); process.exit(1); });
