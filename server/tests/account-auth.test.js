// HTTP integration test: guest migration, password+email, recovery, second-device cloud save, stale writes.
const assert = require('node:assert/strict');
const http = require('node:http');
const { create } = require('../src/app');
const { load } = require('../src/config');
const { create: memory } = require('../src/store-memory');
const mail = [];
const cfg = Object.assign(load({}), { platforms: ['site'], rateIp: 1000, rateAuth: 1000, allowedOrigins: ['https://game.test'],
  mailApiKey: 'test-key', mailFrom: 'Game <noreply@example.com>', publicSiteUrl: 'https://game.test/' });
function request(port, method, pathname, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const headers = { Origin: 'https://game.test' };
    const body = data ? JSON.stringify(data) : '';
    if (body) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(body); }
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = http.request({ port, method, path: pathname, headers }, (resp) => {
      let raw = ''; resp.on('data', c => raw += c); resp.on('end', () => resolve({ code: resp.statusCode, json: JSON.parse(raw) }));
    });
    r.on('error', reject); r.end(body);
  });
}
(async () => {
  const store = memory();
  const { handler } = create({ cfg, store, mailer: async (email, purpose, token) => mail.push({ email, purpose, token }) });
  const server = http.createServer(handler); await new Promise(r => server.listen(0, r));
  const port = server.address().port, ask = (method, path, body, token) => request(port, method, path, body, token);
  try {
    const pid = 'p-aaaaaaaa-bbbbbbbb-cccccccc';
    let guest = await ask('POST', '/auth', { platform: 'site', guest: 'g'.repeat(40), pid });
    assert.equal(guest.code, 200);
    const guestToken = guest.json.token;
    const save = { pid, coins: 77, wins: 3, xp: 1234 };
    const first = await ask('PUT', '/snapshot', { snapshot: JSON.stringify(save), version: 1000 }, guestToken);
    assert.equal(first.code, 200);
    const email = 'player@example.com', password = 'troubadour44secret';
    let create = await ask('POST', '/account/register', { email, password }, guestToken);
    assert.equal(create.code, 200); assert.equal(create.json.pending, true); assert.equal(mail.length, 1);
    assert.equal(mail[0].email, email); assert.equal(mail[0].purpose, 'verify');
    assert.equal((await ask('POST', '/account/register', { email, password }, guestToken)).code, 409);
    const verified = await ask('POST', '/account/verify', { token: mail[0].token });
    assert.equal(verified.code, 200); assert.equal(verified.json.pid, pid);
    assert.equal(verified.json.snapshot, JSON.stringify(save)); assert.equal(verified.json.version, 1000);
    assert.equal((await ask('POST', '/account/verify', { token: mail[0].token })).code, 400); // one-time token
    assert.equal((await ask('GET', '/account/status', null, guestToken)).code, 401); // guest session revoked
    assert.equal((await ask('POST', '/auth', { platform: 'site', guest: 'g'.repeat(40), pid })).code, 401); // no guest bypass
    const bad = await ask('POST', '/account/login', { email, password: 'incorrect password' }); assert.equal(bad.code, 401);
    const unknown = await ask('POST', '/account/login', { email: 'none@example.com', password }); assert.equal(unknown.code, 401);
    const a = await ask('POST', '/account/login', { email, password }); assert.equal(a.code, 200); assert.equal(a.json.pid, pid);
    const b = await ask('POST', '/account/login', { email, password }); assert.equal(b.code, 200); assert.notEqual(a.json.token, b.json.token);
    assert.equal((await ask('GET', '/account/status', null, b.json.token)).json.verified, true);
    const expected = { pid, coins: 99, wins: 4, xp: 1280 };
    const write = await ask('PUT', '/snapshot', { snapshot: JSON.stringify(expected), version: 2000, expectedVersion: 1000 }, a.json.token);
    assert.equal(write.code, 200);
    const stale = await ask('PUT', '/snapshot', { snapshot: JSON.stringify({ pid, coins: 1 }), version: 3000, expectedVersion: 1000 }, b.json.token);
    assert.equal(stale.code, 409); assert.equal(stale.json.serverVersion, 2000);
    assert.equal((await ask('PUT', '/snapshot', { snapshot: JSON.stringify(expected), version: 3000 }, b.json.token)).code, 428);
    assert.equal((await ask('GET', '/snapshot', null, b.json.token)).json.snapshot, JSON.stringify(expected));
    assert.equal((await ask('POST', '/account/reset/request', { email: 'none@example.com' })).json.accepted, true);
    assert.equal((await ask('POST', '/account/reset/request', { email })).json.accepted, true);
    assert.equal(mail[1].purpose, 'reset');
    assert.equal((await ask('POST', '/account/reset/confirm', { token: mail[1].token, password: 'super-secure-new-password' })).code, 200);
    assert.equal((await ask('GET', '/account/status', null, a.json.token)).code, 401); // reset revokes old tokens
    assert.equal((await ask('POST', '/account/login', { email, password })).code, 401);
    assert.equal((await ask('POST', '/account/login', { email, password: 'super-secure-new-password' })).code, 200);
    console.log('account-auth: passed guest linking, 2 devices, cloud progress, conflict, password reset, revoked sessions');
  } finally { server.close(); await store.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
