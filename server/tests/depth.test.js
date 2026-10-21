const assert = require('assert');
const http = require('http');
const sc = require('../src/savecheck');
const { load } = require('../src/config');
const { create } = require('../src/app');
const H = 3600000;

// правила: этаж подземелья
const prev = { at: 0, xp: 100, wins: 1, floor: 10 };
assert.strictEqual(sc.check({ xp: 100, tower: { best: 12 } }, prev, H).reason, '', 'обычный шаг вглубь');
assert.strictEqual(sc.check({ xp: 100, tower: { best: 400 } }, prev, H).reason, 'floor-jump', 'скачок на сотни этажей');
assert.strictEqual(sc.check({ xp: 100, tower: { best: 400 } }, { ...prev, floor: 0 }, H).reason, 'floor-jump', 'прежнее значение 0 тоже сравнивается: с нуля сразу на сотни этажей нельзя');
assert.strictEqual(sc.check({ tower: { best: 99999 } }, null, H).reason, 'floor-range');
assert.strictEqual(sc.check({ tower: { best: 2.5 } }, null, H).reason, 'floor-range');
assert.strictEqual(sc.check({ tower: null, xp: 1 }, prev, H).reason, '', 'без подземелья — не помечаем');

(async () => {
  const st = require('../src/store-memory').create();
  const cfg = Object.assign(load({}), { platforms: ['site'], allowedOrigins: ['https://game.test'], rateAuth: 1000, rateIp: 1000 });
  let T = 1e12; const P = ['p-aaaaaaaa-aaaaaaaa-aaaaaaaa', 'p-bbbbbbbb-bbbbbbbb-bbbbbbbb', 'p-cccccccc-cccccccc-cccccccc', 'p-dddddddd-dddddddd-dddddddd'];
  const srv = http.createServer(create({ cfg, store: st, now: () => T }).handler);
  await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
  const call = (method, path, body, token) => new Promise((resolve, reject) => {
    const d = body ? JSON.stringify(body) : null;
    const r = http.request({ port, method, path, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}) } }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ code: res.statusCode, json: b ? JSON.parse(b) : null })); });
    r.on('error', reject); if (d) r.write(d); r.end();
  });
  const tok = [];
  for (let i = 0; i < 3; i++) tok.push((await call('POST', '/auth', { platform: 'site', guest: 'xyz'[i].repeat(40), pid: P[i] })).json.token);
  const put = (i, ver, p) => call('PUT', '/snapshot', { version: ver, snapshot: JSON.stringify(p) }, tok[i]);
  const nicks = ['Аня', 'Боря', 'Вася'];
  for (let i = 0; i < 3; i++) await st.putCard(P[i], 20, JSON.stringify({ nick: nicks[i] }));
  assert.strictEqual((await put(0, 1, { xp: 10, wins: 0, tower: { best: 12 } })).code, 200);
  assert.strictEqual((await put(1, 1, { xp: 10, wins: 0, tower: { best: 31 } })).code, 200);
  assert.strictEqual((await put(2, 1, { xp: 10, wins: 0 })).code, 200);
  // 2.0.2: первое сохранение подтверждает только стартовый этаж; остальное нарастает со временем, не быстрее честной игры
  let r = await call('GET', '/depth', null, tok[0]);
  assert.strictEqual(r.code, 200); assert.deepStrictEqual(r.json.list.map((x) => [x.place, x.nick, x.floor, x.me]), [[1, 'Аня', 3, true], [2, 'Боря', 3, false]], 'первое сохранение: только стартовые этажи; без подземелья в списке нет');
  // регрессия P0-02: новый аккаунт с рекордом 5000 не занимает первое место, серия быстрых сохранений ничего не накапливает
  const tokC = (await call('POST', '/auth', { platform: 'site', guest: 'w'.repeat(40), pid: P[3] })).json.token;
  await st.putCard(P[3], 20, JSON.stringify({ nick: 'Читер' }));
  assert.strictEqual((await call('PUT', '/snapshot', { version: 1, snapshot: JSON.stringify({ xp: 0, wins: 0, coins: 0, tower: { best: 5000 } }) }, tokC)).code, 200, 'сохранение принимается — его можно восстановить');
  for (let v = 2; v < 8; v++) await call('PUT', '/snapshot', { version: v, snapshot: JSON.stringify({ xp: 0, wins: 0, tower: { best: 5000 } }) }, tokC);
  r = await call('GET', '/depth', null, tok[0]);
  assert.ok(!r.json.list.some((x) => x.floor > 40), 'фиктивный рекорд не виден в рейтинге: ' + JSON.stringify(r.json.list));
  assert.ok(!r.json.list.some((x) => x.nick === 'Читер') || r.json.list.find((x) => x.nick === 'Читер').floor <= 3, 'читер — не выше стартового этажа');
  // честный рост со временем: через три часа Боря подтверждает 31 этаж
  T += 3 * H; await put(1, 2, { xp: 10, wins: 0, tower: { best: 31 } });
  r = await call('GET', '/depth', null, tok[0]);
  assert.strictEqual(r.json.list[0].nick, 'Боря'); assert.strictEqual(r.json.list[0].floor, 31);
  assert.strictEqual((await call('GET', '/depth')).code, 401);
  // читерский скачок: сохранение принято, но в рейтинг глубины игрок не попадает
  T += H; assert.strictEqual((await put(0, 2, { xp: 10, wins: 0, tower: { best: 900 } })).code, 200);
  r = await call('GET', '/depth', null, tok[1]);
  assert.ok(!r.json.list.some((x) => x.nick === 'Аня'), 'помеченный игрок скрыт');
  // честный рост
  T += H; await put(1, 3, { xp: 10, wins: 0, tower: { best: 35 } });
  r = await call('GET', '/depth', null, tok[1]); assert.strictEqual(r.json.list[0].floor, 35);
  srv.close(); console.log('depth: ок'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
