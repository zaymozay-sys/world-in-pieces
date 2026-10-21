const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const { load } = require('../src/config');
const { create } = require('../src/app');
const { verifyVk, verifyYandex, verifySite, b64url } = require('../src/verify');

const Gear = require('../rules/items.js');
const WEAPON = Gear.ITEMS.find((i) => i.type === 'weapon1' && !i.faction && i.cost <= 40).id;
const VK = 'vk-test-secret', YA = 'ya-test-secret';
const cfg = Object.assign(load({}), { platforms: ['site', 'yandex', 'vk'], vkSecret: VK, yandexSecret: YA, allowedOrigins: ['https://game.test'], maxBody: 20000, rateAuth: 1000, rateIp: 1000 });
const guest = 'g'.repeat(40);
const pidA = 'p-aaaaaaaa-bbbbbbbb-cccccccc', pidB = 'p-11111111-22222222-33333333';

const vkParams = (id, ts) => {
  const p = { vk_user_id: String(id), vk_app_id: '1', vk_ts: String(ts) };
  const str = Object.keys(p).sort().map(k => k + '=' + encodeURIComponent(p[k])).join('&');
  p.sign = b64url(crypto.createHmac('sha256', VK).update(str).digest());
  return p;
};
const yaSig = (id, secret = YA) => { const j = JSON.stringify({ data: { uniqueID: id } }); return crypto.createHmac('sha256', secret).update(j).digest('base64') + '.' + Buffer.from(j).toString('base64'); }; // подпись — от раскодированного JSON, как в документации

const call = (port, method, path, body, token, extra) => new Promise((resolve, reject) => {
  const data = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
  const headers = Object.assign({}, token ? { Authorization: 'Bearer ' + token } : {}, data ? { 'Content-Type': 'application/json' } : {}, extra || {});
  const r = http.request({ port, method, path, headers }, (res) => { let s = ''; res.on('data', c => s += c); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) {} resolve({ code: res.statusCode, json: j, headers: res.headers }); }); });
  r.on('error', reject); if (data) r.write(data); r.end();
});

(async () => {
  // подписи
  assert.strictEqual(verifyVk(vkParams(77, 1000), VK, { now: 1100, maxAgeSec: 3600 }), '77');
  assert.strictEqual(verifyVk(Object.assign(vkParams(77, 1000), { vk_user_id: '78' }), VK), null, 'подмена id');
  assert.strictEqual(verifyVk(vkParams(77, 1000), 'другой'), null);
  assert.strictEqual(verifyVk(vkParams(77, 1000), VK, { now: 1000 + 99999, maxAgeSec: 3600 }), null, 'устарело');
  assert.strictEqual(verifyYandex(yaSig('u1'), YA), 'u1');
  assert.strictEqual(verifyYandex(yaSig('u1', 'x'), YA), null);
  assert.strictEqual(verifyYandex('мусор', YA), null);
  assert.ok(verifySite(guest)); assert.strictEqual(verifySite('коротко'), null);

  const store = require('../src/store-memory').create();
  const srv = http.createServer(create({ cfg, store }).handler);
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;

  assert.strictEqual((await call(port, 'GET', '/health')).code, 200);
  // вход гостя
  let r = await call(port, 'POST', '/auth', { platform: 'site', guest, pid: pidA });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.json.pid, pidA); assert.strictEqual(r.json.created, true);
  const tok = r.json.token; assert.ok(/^[0-9a-f]{64}$/.test(tok));
  // повторный вход того же гостя: pid прежний, даже если игра прислала другой
  r = await call(port, 'POST', '/auth', { platform: 'site', guest, pid: pidB });
  assert.strictEqual(r.json.pid, pidA); assert.strictEqual(r.json.created, false);
  // чужой гость хочет занятый pid
  r = await call(port, 'POST', '/auth', { platform: 'site', guest: 'h'.repeat(40), pid: pidA });
  assert.strictEqual(r.code, 409);
  // плохие данные
  assert.strictEqual((await call(port, 'POST', '/auth', { platform: 'site', guest: 'x' })).code, 401);
  assert.strictEqual((await call(port, 'POST', '/auth', { platform: 'ok' })).code, 400);
  assert.strictEqual((await call(port, 'POST', '/auth', { platform: 'site', guest: 'h'.repeat(40), pid: 'не pid' })).code, 400);
  assert.strictEqual((await call(port, 'POST', '/auth', '{не json')).code, 400);
  // ВК и Яндекс
  r = await call(port, 'POST', '/auth', { platform: 'vk', params: vkParams(5, Math.floor(Date.now() / 1000)), pid: pidB });
  assert.strictEqual(r.code, 200); const tokVk = r.json.token;
  assert.strictEqual((await call(port, 'POST', '/auth', { platform: 'vk', params: Object.assign(vkParams(5, 1), { sign: 'bad' }), pid: pidB })).code, 401);
  r = await call(port, 'POST', '/auth', { platform: 'yandex', signature: yaSig('yy'), pid: 'p-zzzzzzzz-zzzzzzzz-zzzzzzzz' });
  assert.strictEqual(r.code, 200);
  // снимки
  assert.strictEqual((await call(port, 'GET', '/snapshot')).code, 401);
  assert.strictEqual((await call(port, 'GET', '/snapshot', null, tok)).code, 404);
  const snap = JSON.stringify({ hero: 'Лу', pid: pidA });
  assert.strictEqual((await call(port, 'PUT', '/snapshot', { version: 1, snapshot: snap }, tok)).code, 200);
  assert.strictEqual((await call(port, 'PUT', '/snapshot', { version: 1, snapshot: snap }, tok)).code, 409, 'старая версия');
  for (const v of [2, 3, 4]) await call(port, 'PUT', '/snapshot', { version: v, snapshot: snap }, tok);
  r = await call(port, 'GET', '/snapshot', null, tok); assert.strictEqual(r.json.version, 4); assert.strictEqual(r.json.snapshot, snap);
  assert.strictEqual((await call(port, 'PUT', '/snapshot', { version: 5, snapshot: 'не json' }, tok)).code, 400);
  assert.strictEqual((await call(port, 'PUT', '/snapshot', { version: 5, snapshot: '[1]' }, tok)).code, 400);
  assert.strictEqual((await call(port, 'PUT', '/snapshot', { version: 5, snapshot: JSON.stringify({ a: 'x'.repeat(30000) }) }, tok)).code, 413, 'слишком большой');
  // игроки не видят чужое
  assert.strictEqual((await call(port, 'GET', '/snapshot', null, tokVk)).code, 404);
  assert.strictEqual((await call(port, 'GET', '/snapshot', null, 'f'.repeat(64))).code, 401);
  // CORS
  r = await call(port, 'GET', '/health', null, null, { Origin: 'https://game.test' });
  assert.strictEqual(r.headers['access-control-allow-origin'], 'https://game.test');
  r = await call(port, 'GET', '/health', null, null, { Origin: 'https://evil.test' });
  assert.strictEqual(r.headers['access-control-allow-origin'], undefined);
  // удаление
  assert.strictEqual((await call(port, 'DELETE', '/me', null, tok)).code, 200);
  assert.strictEqual((await call(port, 'GET', '/snapshot', null, tok)).code, 401, 'сессия удалена вместе с игроком');
  assert.strictEqual(await store.pidFor('site', verifySite(guest)), null);
  assert.ok(store._audit.some(a => a.kind === 'delete'));
  // боевые карточки и подбор соперников по уровню
  const card = (nick, level, extra) => Object.assign({ nick, faction: 'dwarf', gender: 'f', level, rank: 2, gear: { main: { id: WEAPON, tier: 1 }, off: null } }, extra || {});
  const mk = async (g, pid) => (await call(port, 'POST', '/auth', { platform: 'site', guest: g.repeat(40), pid })).json.token;
  const tA = await mk('a', 'p-aaaaaaa1-aaaaaaaa-aaaaaaaa'), tB = await mk('b', 'p-bbbbbbb1-bbbbbbbb-bbbbbbbb'), tC = await mk('c', 'p-ccccccc1-cccccccc-cccccccc'), tD = await mk('d', 'p-ddddddd1-dddddddd-dddddddd');
  // подтверждённый прогресс задан напрямую: уровень карточки не может превышать подтверждённый (см. savecheck.trust)
  for (const p of ['p-aaaaaaa1-aaaaaaaa-aaaaaaaa', 'p-bbbbbbb1-bbbbbbbb-bbbbbbbb', 'p-ccccccc1-cccccccc-cccccccc', 'p-ddddddd1-dddddddd-dddddddd']) await store.setCheck(p, { at: Date.now(), xp: 1e5, wins: 50, floor: 0, tx: 1e5, tw: 50, tf: 0 });
  assert.strictEqual((await call(port, 'PUT', '/card', { card: card('Аня', 10) })).code, 401);
  assert.strictEqual((await call(port, 'PUT', '/card', { card: card('Аня', 10) }, tA)).code, 200);
  assert.strictEqual((await call(port, 'PUT', '/card', { card: card('Боря', 12) }, tB)).code, 200);
  assert.strictEqual((await call(port, 'PUT', '/card', { card: card('Вера', 30) }, tC)).code, 200);
  for (const bad of [card('', 5), card('x', 0), card('x', 101), card('x', 5, { faction: 'orc' }), card('x', 5, { gender: 'z' }), card('x', 5, { gear: [] }), card('x', 5, { gear: { main: 5 } }), null, 'строка']) assert.strictEqual((await call(port, 'PUT', '/card', { card: bad }, tD)).code, 400);
  r = await call(port, 'PUT', '/card', { card: card('<b>Хитрец</b>&', 11) }, tD); assert.strictEqual(r.code, 200);
  r = await call(port, 'GET', '/opponents?level=10', null, tA);
  assert.strictEqual(r.code, 200); assert.deepStrictEqual(r.json.list.map((x) => x.card.nick), ['bХитрец/b', 'Боря'], 'ближайший по уровню первым');
  assert.ok(r.json.list.every((x) => x.id !== 'p-aaaaaaa1-aaaaaaaa-aaaaaaaa'), 'себя не предлагаем');
  assert.ok(!r.json.list.some((x) => x.card.nick === 'Вера'), 'слишком далёкий уровень не предлагаем');
  assert.ok(r.json.list.every((x) => !/[<>&]/.test(x.card.nick)), 'ник очищен');
  assert.strictEqual((await call(port, 'GET', '/opponents?level=abc', null, tA)).code, 400);
  assert.strictEqual((await call(port, 'GET', '/opponents?level=10')).code, 401);
  await call(port, 'DELETE', '/me', null, tB);
  r = await call(port, 'GET', '/opponents?level=10', null, tA); assert.ok(!r.json.list.some((x) => x.card.nick === 'Боря'), 'удалённый игрок пропал из подбора');

  // очистка: просроченные сессии и старый журнал
  const st3 = require('../src/store-memory').create();
  await st3.findOrCreatePlayer('site', 'e', pidA);
  await st3.createSession('old', pidA, 1000); await st3.createSession('new', pidA, Date.now() + 99999);
  await st3.log('x', pidA, 'старое'); st3._audit[0].at = Date.now() - 200 * 86400000; await st3.log('y', pidA, 'свежее');
  assert.strictEqual(await st3.purge(Date.now(), 183 * 86400000), 2);
  assert.strictEqual(await st3.sessionPid('new', Date.now()), pidA); assert.strictEqual(st3._audit.length, 1);
  srv.close();

  // лимит входов
  const cfg2 = Object.assign({}, cfg, { rateAuth: 2 });
  const s2 = http.createServer(create({ cfg: cfg2, store: require('../src/store-memory').create() }).handler);
  await new Promise(r => s2.listen(0, r));
  const codes = []; for (let i = 0; i < 4; i++) codes.push((await call(s2.address().port, 'POST', '/auth', { platform: 'site', guest: 'x' })).code);
  assert.deepStrictEqual(codes, [401, 401, 429, 429]);
  s2.close();
  console.log('server: все тесты пройдены');
})().catch(e => { console.error(e); process.exit(1); });
