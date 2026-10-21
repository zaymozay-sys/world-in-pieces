// Слой связи с площадками (js/net.js). Запуск: node tests/net.test.js
const assert = require('assert');
const Net = require('../js/net.js');

assert.strictEqual(Net.detect({}), 'site');
assert.strictEqual(Net.detect({ YaGames: {} }), 'yandex');
assert.strictEqual(Net.detect({ vkBridge: {} }), 'vk');
assert.strictEqual(Net.detect({ search: '?vk_user_id=123&sign=x' }), 'vk');
assert.strictEqual(Net.detect({ search: '?lang=ru' }), 'site');

// внутренний номер: формат, уникальность, сохраняется
const a = Net.newPid(), b = Net.newPid();
assert.ok(Net.validPid(a) && Net.validPid(b) && a !== b);
assert.ok(!Net.validPid('') && !Net.validPid(null) && !Net.validPid('p-1') && !Net.validPid(123));
const n = Net.create({}, { adapter: Net.siteAdapter() });
const d = {}; const pid = n.pidFor(d);
assert.ok(Net.validPid(pid)); assert.strictEqual(n.pidFor(d), pid, 'номер не меняется');
d.pid = 'мусор'; assert.ok(Net.validPid(n.pidFor(d)), 'битый номер заменяется');

(async () => {
  // сайт: ничего не зеркалит, но и не ломается
  const site = Net.create({});
  assert.strictEqual(site.platform, 'site');
  assert.strictEqual(await site.init(), true);
  assert.strictEqual(site.mirror('x'), false); assert.strictEqual(await site.flush(), false); assert.strictEqual(await site.pull(), null);

  // яндекс с поддельным SDK: сохраняет снимок раз в delay и отдаёт его обратно
  const store = {}; let sets = 0;
  const ysdk = { getPlayer: async () => ({ getUniqueID: () => 'ya-77', getData: async () => store, setData: async (o) => { Object.assign(store, o); sets++; } }) };
  const timers = []; const fakeSet = (f) => { timers.push(f); return timers.length; };
  const ya = Net.create({ YaGames: { init: async () => ysdk } }, { setTimeout: fakeSet, clearTimeout: () => {} });
  assert.strictEqual(ya.platform, 'yandex');
  assert.strictEqual(ya.mirror('до init'), false, 'до init не зеркалим');
  assert.strictEqual(await ya.init(), true);
  assert.strictEqual(ya.externalId(), 'ya-77');
  ya.mirror('v1'); ya.mirror('v2'); ya.mirror('v3');
  assert.strictEqual(timers.length, 1, 'один таймер на пачку сохранений');
  assert.strictEqual(await ya.flush(), true);
  assert.strictEqual(sets, 1); assert.strictEqual(store.snapshot, 'v3', 'отправлен последний снимок');
  assert.strictEqual(await ya.pull(), 'v3');
  assert.strictEqual(await ya.flush(), false, 'повторно нечего отправлять');

  // сбой площадки не роняет игру
  const bad = Net.create({ YaGames: { init: async () => { throw new Error('нет сети'); } } });
  assert.strictEqual(await bad.init(), false); assert.strictEqual(bad.failures, 1);
  assert.strictEqual(bad.mirror('x'), false); assert.strictEqual(await bad.pull(), null);
  const bad2 = Net.create({ YaGames: { init: async () => ({ getPlayer: async () => ({ setData: async () => { throw new Error('x'); }, getData: async () => { throw new Error('y'); } }) }) } }, { setTimeout: fakeSet, clearTimeout: () => {} });
  await bad2.init(); bad2.mirror('z'); assert.strictEqual(await bad2.flush(), false); assert.strictEqual(await bad2.pull(), null); assert.ok(bad2.failures >= 2);

  // ВК: номер пользователя, зеркала нет (хранилище ВК мало — снимок хранит свой сервер)
  const vk = Net.create({ vkBridge: { send: async (m) => (m === 'VKWebAppGetUserInfo' ? { id: 555 } : {}) } });
  assert.strictEqual(vk.platform, 'vk'); await vk.init();
  assert.strictEqual(vk.externalId(), '555'); assert.strictEqual(vk.mirror('x'), false);


  // свой сервер: вход, отправка, «на сервере новее», удаление (настоящий сервер из server/ в памяти)
  const http = require('http');
  const sApp = require('../server/src/app'), sCfg = Object.assign(require('../server/src/config').load({}), { platforms: ['site'], rateAuth: 1000, rateIp: 1000 });
  const srv = http.createServer(sApp.create({ cfg: sCfg, store: require('../server/src/store-memory').create() }).handler);
  await new Promise((r) => srv.listen(0, r));
  const url = 'http://127.0.0.1:' + srv.address().port;
  const doFetch = (u, o) => new Promise((res, rej) => { const rq = http.request(u, { method: o.method, headers: o.headers }, (x) => { let b = ''; x.on('data', (c) => b += c); x.on('end', () => res({ status: x.statusCode, json: async () => JSON.parse(b) })); }); rq.on('error', rej); if (o.body) rq.write(o.body); rq.end(); });
  const pidX = Net.newPid(); let saved = 0;
  const rn = Net.create({ serverUrl: url, fetch: doFetch, guest: 'q'.repeat(40), getPid: () => pidX, saveVersion: (v) => { saved = v; } }, { delay: 5, setTimeout: (f) => f(), clearTimeout: () => {} });
  await rn.init(); assert.ok(rn.remote && rn.remote.enabled);
  assert.strictEqual(rn.mirror(JSON.stringify({ a: 1, xp: 600, wins: 5 })), true);
  await new Promise((r) => setTimeout(r, 100)); assert.ok(saved > 0, 'версия сохранена после отправки');
  assert.strictEqual(await rn.remote.newer(), null, 'своё сохранение не новее');
  // второе устройство: тот же гость отправил более новое
  const rn2 = Net.create({ serverUrl: url, fetch: doFetch, guest: 'q'.repeat(40), getPid: () => pidX, lastVersion: 0 }, { now: () => saved + 5000, delay: 5, setTimeout: (f) => f(), clearTimeout: () => {} });
  await rn2.init(); assert.strictEqual(await rn2.remote.push(JSON.stringify({ a: 2 })), true);
  const nw = await rn.remote.newer(); assert.ok(nw && JSON.parse(nw.snapshot).a === 2, 'видим более новое');
  rn.remote.accept(nw.version); assert.strictEqual(await rn.remote.newer(), null);
  // боевая карточка и соперники
  assert.strictEqual(await rn.remote.putCard({ nick: 'Лу', faction: 'elf', gender: 'f', level: 5, rank: 1, gear: { main: null } }), true);
  assert.strictEqual(await rn.remote.putCard({ nick: 'Лу', faction: 'elf', gender: 'f', level: 9, rank: 1, gear: { main: null } }), false, 'уровень выше подтверждённого сервером не принимается');
  assert.strictEqual(await rn.remote.putCard({ nick: '', level: 9 }), false, 'плохая карточка не принимается');
  const rn3 = Net.create({ serverUrl: url, fetch: doFetch, guest: 'z'.repeat(40), getPid: () => 'p-zzzzzzzz-zzzzzzzz-zzzzzzzz' }, { delay: 5, setTimeout: (f) => f(), clearTimeout: () => {} });
  await rn3.init(); const lst = await rn3.remote.opponents(5);
  assert.ok(Array.isArray(lst) && lst.some((x) => x.card.nick === 'Лу'), 'видим соперника по уровню');
  // карточка уходит вместе со снимком, только если изменилась
  let cardPuts = 0; const cf = (u, o) => { if (/\/card$/.test(u) && o.method === 'PUT') cardPuts++; return doFetch(u, o); };
  const rn4 = Net.create({ serverUrl: url, fetch: cf, guest: 'y'.repeat(40), getPid: () => 'p-yyyyyyyy-yyyyyyyy-yyyyyyyy', getCard: () => ({ nick: 'Я', faction: 'dwarf', gender: 'm', level: 4, rank: 0, gear: {} }) }, { delay: 1, setTimeout: (f) => f(), clearTimeout: () => {} });
  await rn4.init(); rn4.mirror('{"a":1,"xp":600}'); await new Promise((r) => setTimeout(r, 100)); rn4.mirror('{"a":2,"xp":600}'); await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(cardPuts, 1, 'карточка не меняется — второй раз не отправляем');
  // без адреса сервера — как раньше
  const off = Net.create({}); assert.strictEqual(off.remote, null);
  // сервер недоступен — игра не страдает
  const dead = Net.create({ serverUrl: 'http://127.0.0.1:1', fetch: doFetch, guest: 'q'.repeat(40), getPid: () => pidX }, { delay: 1, setTimeout: (f) => f(), clearTimeout: () => {} });
  await dead.init(); dead.mirror('{}'); assert.strictEqual(await dead.flush(), false);
  let deletedFlag = false; rn.remote.constructor; assert.strictEqual(await rn.remote.deleteMe(), true);
  assert.strictEqual(rn.remote.enabled, false, 'после удаления копирование выключено'); assert.strictEqual(await rn.remote.push('{}'), false, 'и запись не создаётся заново');
  srv.close();

  // единственный экземпляр
  assert.strictEqual(Net.current, null);
  await Net.boot({}); assert.strictEqual(Net.current.platform, 'site');
  console.log('net: все тесты пройдены');
})().catch((e) => { console.error(e); process.exit(1); });
