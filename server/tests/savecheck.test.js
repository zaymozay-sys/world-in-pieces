const assert = require('assert');
const http = require('http');
const sc = require('../src/savecheck');
const rating = require('../src/rating');
const { load } = require('../src/config');
const { create } = require('../src/app');
const H = 3600000;

// правила
const prev = { at: 0, xp: 1000, wins: 10 };
assert.strictEqual(sc.check({ coins: 500, xp: 5000, wins: 12 }, prev, H).reason, '', 'обычная игра');
assert.strictEqual(sc.check({ coins: 500, xp: 3000000, wins: 12 }, prev, H).reason, 'xp-jump', 'весь опыт за час');
assert.strictEqual(sc.check({ coins: 500, xp: 3000000, wins: 12 }, prev, 10 * H).reason, '', 'за 10 часов такой рост укладывается в лимит');
assert.strictEqual(sc.check({ xp: 1000, wins: 5000 }, prev, H).reason, 'wins-jump');
assert.strictEqual(sc.check({ xp: -5, wins: 1 }, null, H).reason, 'xp-range');
assert.strictEqual(sc.check({ coins: -1, xp: 1 }, null, H).reason, 'coins-range');
assert.strictEqual(sc.check({ xp: 1, wins: 1.5 }, null, H).reason, 'wins-range');
assert.strictEqual(sc.check({ xp: 20000, wins: 3 }, null, H).reason, '', 'первое сохранение: сравнивать не с чем');
assert.strictEqual(sc.check({}, prev, H).reason, '', 'пустой профиль не помечаем');

(async () => {
  const memory = require('../src/store-memory'), st = memory.create();
  const cfg = Object.assign(load({}), { platforms: ['site'], allowedOrigins: ['https://game.test'], rateAuth: 1000, rateIp: 1000 });
  let T = 1e12; const P = ['p-aaaaaaaa-aaaaaaaa-aaaaaaaa', 'p-bbbbbbbb-bbbbbbbb-bbbbbbbb'];
  const srv = http.createServer(create({ cfg, store: st, now: () => T }).handler);
  await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
  const call = (method, path, body, token) => new Promise((resolve, reject) => {
    const d = body ? JSON.stringify(body) : null;
    const r = http.request({ port, method, path, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(d ? { 'Content-Type': 'application/json' } : {}) } }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) { /* не JSON */ } resolve({ code: res.statusCode, json: j }); }); });
    r.on('error', reject); if (d) r.write(d); r.end();
  });
  const tok = [];
  for (let i = 0; i < 2; i++) tok.push((await call('POST', '/auth', { platform: 'site', guest: 'xy'[i].repeat(40), pid: P[i] })).json.token);
  const put = (i, ver, p) => call('PUT', '/snapshot', { version: ver, snapshot: JSON.stringify(p) }, tok[i]);
  assert.strictEqual((await put(0, 1, { coins: 1, xp: 100, wins: 1 })).code, 200);
  T += H; assert.strictEqual((await put(0, 2, { coins: 1, xp: 500, wins: 2 })).code, 200);
  assert.strictEqual(await st.isFlagged(P[0], T), false);
  // читерский скачок: сохранение принято (ничего не теряем), но игрок помечен
  T += H; assert.strictEqual((await put(0, 3, { coins: 1, xp: 3000000, wins: 2 })).code, 200, 'сохранение не отклоняется');
  assert.strictEqual(await st.isFlagged(P[0], T), true);
  assert.strictEqual((await call('GET', '/snapshot', null, tok[0])).code, 200);
  T += H; await put(0, 4, { coins: 1, xp: 3000100, wins: 2 });
  assert.strictEqual(await st.isFlagged(P[0], T), true, 'следующий нормальный шаг не снимает пометку сразу');
  assert.strictEqual(await st.isFlagged(P[0], T + 8 * 86400000), false, 'через 7 суток пометка истекает');
  // бой помеченного игрока в рейтинг не идёт и квитанций нет
  await put(1, 1, { coins: 1, xp: 100, wins: 1 });
  const got = [];
  rating.hook(st, () => T, (pid, m) => got.push(pid))({ winner: 'A', reason: 'played', acts: 10, actsA: 5, actsB: 5, ms: 60000, A: P[0], B: P[1], nickA: 'А', nickB: 'Б' });
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(got.length, 0); assert.deepStrictEqual(await st.leaderboard('all', 5, T), []);
  assert.deepStrictEqual(await st.claimVouchers(P[1], T), []);
  // а честные — идут
  await put(1, 2, { coins: 1, xp: 200, wins: 1 });
  const P2 = 'p-cccccccc-cccccccc-cccccccc'; const t2 = (await call('POST', '/auth', { platform: 'site', guest: 'z'.repeat(40), pid: P2 })).json.token;
  await call('PUT', '/snapshot', { version: 1, snapshot: JSON.stringify({ xp: 10, wins: 0 }) }, t2);
  rating.hook(st, () => T, (pid) => got.push(pid))({ winner: 'A', reason: 'played', acts: 10, actsA: 5, actsB: 5, ms: 60000, A: P2, B: P[1], nickA: 'В', nickB: 'Б' });
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(got.length, 2, 'бой честных игроков засчитан');
  srv.close(); console.log('savecheck: ок'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
