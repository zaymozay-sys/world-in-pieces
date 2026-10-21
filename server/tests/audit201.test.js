// Регрессия независимого аудита 2.0.1: P0-01 (победа без игры), P0-02 (рекорд Башни с первого сохранения),
// P1-03 (карточка уровня выше подтверждённого). Каждый случай воспроизводит сценарий из аудита и проверяет исправление.
const assert = require('assert');
const http = require('http');
const live = require('../src/live');
const rating = require('../src/rating');
const savecheck = require('../src/savecheck');
const { create, cleanCard, trustedLevel } = require('../src/app');
const { load } = require('../src/config');
const H = 3600000;

(async () => {
  /* P0-01: оба клиента объявляют «победил A» без единого хода */
  let clock = 1000; const ends = [], sent = [];
  const C = live.create({ send: (who, msg) => sent.push({ who, ...msg }), setTimer: () => 1, clearTimer: () => {}, seedOf: () => 123, now: () => clock, onEnd: (e) => ends.push(e) });
  C.hello('c1', 'p-a'); C.hello('c2', 'p-b');
  const card = (n) => ({ level: 10, nick: n, gear: {} });
  C.message('c1', { t: 'queue', card: card('A') }); C.message('c2', { t: 'queue', card: card('B') });
  clock += 60000;
  C.message('c1', { t: 'result', winner: 'A' }); C.message('c2', { t: 'result', winner: 'A' });
  assert.strictEqual(ends.length, 1); assert.strictEqual(ends[0].acts, 0);
  assert.strictEqual(rating.counts(ends[0]), false, 'P0-01: бой без ходов не идёт в рейтинг');
  // честный бой: ходят обе стороны, ходы считаются по сторонам
  const ends2 = []; const C2 = live.create({ send: () => {}, setTimer: () => 1, clearTimer: () => {}, seedOf: () => 123, now: () => clock, onEnd: (e) => ends2.push(e) });
  C2.hello('c1', 'p-a'); C2.hello('c2', 'p-b');
  C2.message('c1', { t: 'queue', card: card('A') }); C2.message('c2', { t: 'queue', card: card('B') });
  const first = 123 % 2 ? 'c1' : 'c2', second = first === 'c1' ? 'c2' : 'c1';
  clock += 5000;
  for (let n = 1; n <= 8; n++) C2.message(n % 2 ? first : second, { t: 'act', n, a: { x: n }, done: true });
  clock += 20000;
  C2.message('c1', { t: 'result', winner: 'A' }); C2.message('c2', { t: 'result', winner: 'A' });
  assert.strictEqual(ends2[0].actsA + ends2[0].actsB, 8); assert.ok(ends2[0].actsA >= 2 && ends2[0].actsB >= 2);
  assert.strictEqual(rating.counts(ends2[0]), true, 'честный бой с ходами обеих сторон засчитывается');
  // ходы делает только одна сторона (второй клиент ничего не играл) или бой слишком короткий
  assert.strictEqual(rating.counts({ winner: 'A', reason: 'played', acts: 9, actsA: 9, actsB: 0, ms: 60000 }), false);
  assert.strictEqual(rating.counts({ ...ends2[0], ms: 2000 }), false);
  // честная быстрая победа за два хода (по одному у каждой стороны), но не быстрее 12 секунд
  assert.strictEqual(rating.counts({ ...ends2[0], acts: 2, actsA: 1, actsB: 1 }), true);

  /* P0-02 и P1-03 через настоящий HTTP-обработчик */
  let T = 1e12; const st = require('../src/store-memory').create();
  const cfg = { ...load({}), platforms: ['site'], rateIp: 1000, rateAuth: 1000 };
  const srv = http.createServer(create({ cfg, store: st, now: () => T }).handler);
  await new Promise((r) => srv.listen(0, r));
  const call = (method, path, body, token) => new Promise((resolve, reject) => {
    const d = body ? JSON.stringify(body) : null;
    const r = http.request({ port: srv.address().port, method, path, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}) } }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) { /* пусто */ } resolve({ code: res.statusCode, json: j }); }); });
    r.on('error', reject); if (d) r.write(d); r.end();
  });
  const P = ['p-aaaaaaaa-aaaaaaaa-aaaaaaaa', 'p-bbbbbbbb-bbbbbbbb-bbbbbbbb'];
  const tok = []; for (let i = 0; i < 2; i++) tok.push((await call('POST', '/auth', { platform: 'site', guest: 'xy'[i].repeat(40), pid: P[i] })).json.token);
  const mkCard = (nick, level) => ({ nick, faction: 'dwarf', gender: 'm', level, rank: 0, gear: {} });

  // P1-03: новый аккаунт публикует карточку 100-го уровня — отклоняется, соперники её не видят
  assert.strictEqual((await call('PUT', '/card', { card: mkCard('Фальшь', 100) }, tok[0])).code, 400, 'P1-03: карточка выше подтверждённого уровня');
  assert.strictEqual((await call('PUT', '/card', { card: mkCard('Новичок', 1) }, tok[0])).code, 200, 'карточка 1-го уровня разрешена');
  assert.deepStrictEqual((await call('GET', '/opponents?level=100', null, tok[1])).json.list, [], 'соперники не видят уровень 100');
  // сохранение с огромным опытом принимается, но подтверждается только стартовая часть
  const snap = (p) => ({ version: p.v, snapshot: JSON.stringify(p.s) });
  assert.strictEqual((await call('PUT', '/snapshot', snap({ v: 1, s: { xp: 9e6, wins: 5000, coins: 0, tower: { best: 5000 } } }), tok[0])).code, 200, 'сохранение принято: его можно восстановить');
  const ck = await st.getCheck(P[0]);
  assert.strictEqual(ck.tx, savecheck.START.xp); assert.strictEqual(ck.tf, savecheck.START.floor);
  assert.strictEqual(await trustedLevel(st, P[0]) < 10, true, 'подтверждённый уровень — стартовый');
  assert.strictEqual((await call('PUT', '/card', { card: mkCard('Фальшь', 100) }, tok[0])).code, 400, 'после «сохранения со 100-м уровнем» карточка всё ещё отклоняется');
  // P0-02: рекорд 5000 не виден в рейтинге глубины, серия сохранений за одну секунду ничего не добавляет
  for (let v = 2; v < 8; v++) await call('PUT', '/snapshot', snap({ v, s: { xp: 9e6, wins: 5000, tower: { best: 5000 } } }), tok[0]);
  const dep = (await call('GET', '/depth', null, tok[1])).json.list;
  assert.ok(!dep.some((x) => x.floor > savecheck.START.floor), 'P0-02: фиктивный этаж не в рейтинге: ' + JSON.stringify(dep));
  // рост подтверждается со временем: не быстрее TRUST в час
  T += 2 * H; await call('PUT', '/snapshot', snap({ v: 8, s: { xp: 9e6, wins: 5000, tower: { best: 5000 } } }), tok[0]);
  const ck2 = await st.getCheck(P[0]);
  assert.ok(ck2.tf <= savecheck.START.floor + 2 * savecheck.TRUST.floorPerHour + 1 && ck2.tf > savecheck.START.floor, 'этажи растут со скоростью не быстрее лимита: ' + ck2.tf);
  assert.ok(ck2.tx <= savecheck.START.xp + 2 * savecheck.TRUST.xpPerHour + 1);
  // честный игрок: прогресс в разумном темпе подтверждается сразу целиком
  const t = savecheck.trust({ xp: 700, wins: 12, floor: 5 }, { at: 0, xp: 600, wins: 10, floor: 3, tx: 600, tw: 10, tf: 3 }, H);
  assert.deepStrictEqual(t, { xp: 700, wins: 12, floor: 5 });
  // старая запись без подтверждённых полей (до этого исправления) считается подтверждённой как есть
  const legacy = savecheck.trust({ xp: 5000, wins: 50, floor: 20 }, { at: 0, xp: 4800, wins: 48, floor: 19 }, H);
  assert.deepStrictEqual(legacy, { xp: 5000, wins: 50, floor: 20 });
  // уровень карточки не выше подтверждённого, но в пределах — разрешён
  const lvl = await trustedLevel(st, P[1]); assert.strictEqual(lvl, 1);
  assert.ok(cleanCard(mkCard('Ок', 1), 1) && cleanCard(mkCard('Ок', 2), 1) === null && cleanCard(mkCard('Ок', 50)) !== null, 'cleanCard без ограничения работает как раньше');
  srv.close();

  /* P1-03 для живых боёв: карточка в очереди поиска тоже проверяется по подтверждённому уровню */
  const { sha } = require('../src/app');
  const st2 = require('../src/store-memory').create();
  const pid = 'p-eeeeeeee-eeeeeeee-eeeeeeee', tk = 'e'.repeat(64);
  await st2.findOrCreatePlayer('site', 'x1', pid); await st2.createSession(sha(tk), pid, Date.now() + 1e6);
  const hs = http.createServer((q, r) => r.end('{}'));
  const lv = live.attach({ server: hs, store: st2, cfg: {}, sha, live: { cleanCard, cleanCardFor: async (p, c) => cleanCard(c, await trustedLevel(st2, p)), cfg: { spread: 5 } } });
  await new Promise((r) => hs.listen(0, r));
  const WebSocket = require('ws'), got = [];
  const ws = new WebSocket('ws://127.0.0.1:' + hs.address().port + '/live');
  ws.on('message', (d) => got.push(JSON.parse(String(d)))); await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'hello', token: tk }));
  const wait = async (f) => { for (let i = 0; i < 150; i++) { const v = f(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); } throw new Error('ожидание'); };
  await wait(() => got.find((m) => m.t === 'hello-ok'));
  ws.send(JSON.stringify({ t: 'queue', card: { nick: 'Фальшь', faction: 'dwarf', gender: 'm', level: 100, rank: 0, gear: {} } }));
  assert.strictEqual((await wait(() => got.find((m) => m.t === 'err'))).e, 'card', 'P1-03: очередь боя отвергает карточку выше подтверждённого уровня');
  ws.send(JSON.stringify({ t: 'queue', card: { nick: 'Честный', faction: 'dwarf', gender: 'm', level: 1, rank: 0, gear: {} } }));
  await wait(() => got.find((m) => m.t === 'queued'));
  ws.close(); lv.close(); hs.close();
  console.log('audit201: все тесты пройдены'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
