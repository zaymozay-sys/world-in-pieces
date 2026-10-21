const assert = require('assert');
const http = require('http');
const rating = require('../src/rating');
const { load } = require('../src/config');
const { create } = require('../src/app');

const P = ['p-aaaaaaaa-aaaaaaaa-aaaaaaaa', 'p-bbbbbbbb-bbbbbbbb-bbbbbbbb', 'p-cccccccc-cccccccc-cccccccc'];
const DAY = 86400000;

// Общие проверки хранилища — их же гоняет tools/pg-tourney-check.js на настоящем PostgreSQL
const storeChecks = async (store, now) => {
  for (let i = 0; i < 3; i++) await store.findOrCreatePlayer('site', 'x' + i, P[i]);
  const m = (a, b, w, at) => ({ a: { pid: P[a], nick: 'N' + a }, b: { pid: P[b], nick: 'N' + b }, winner: w, at });
  const r1 = await store.recordMatch(m(0, 1, 'A', now));
  assert.deepStrictEqual([r1.a.elo, r1.b.elo, r1.a.delta], [1016, 984, 16], 'равные: +16/−16');
  await store.recordMatch(m(0, 1, 'A', now + 1));
  await store.recordMatch(m(0, 1, 'A', now + 2));
  assert.strictEqual(await store.recordMatch(m(0, 1, 'A', now + 3)), null, 'один и тот же соперник — не больше трёх раз в сутки');
  assert.ok(await store.recordMatch(m(2, 1, 'A', now + 4)), 'другой соперник считается');
  assert.strictEqual(await store.recordMatch({ a: { pid: P[0], nick: 'x' }, b: { pid: 'p-zzzzzzzz-zzzzzzzz-zzzzzzzz', nick: 'y' }, winner: 'A', at: now }), null, 'неизвестный игрок не засчитывается');
  const all = await store.leaderboard('all', 10, now + 10);
  assert.strictEqual(all[0].pid, P[0]); assert.strictEqual(all[0].place, 1);
  assert.deepStrictEqual(all.map((x) => x.place), [1, 2, 3]);
  // старый бой попадает в год, но не в неделю
  const old = now - 20 * DAY;
  await store.recordMatch(m(1, 2, 'A', old));
  const wk = await store.leaderboard('week', 10, now + 10), yr = await store.leaderboard('year', 10, now + 10), mo = await store.leaderboard('month', 10, now + 10);
  const sc = (l, p) => (l.find((x) => x.pid === P[p]) || {}).score;
  assert.ok(sc(yr, 1) > sc(wk, 1) || sc(yr, 1) !== sc(wk, 1), 'год включает старый бой, неделя — нет');
  assert.strictEqual(wk.length, 3); assert.ok(mo.length >= 3);
  assert.strictEqual((await store.rankOf(P[0], 'week', now + 10)).place, 1);
  assert.strictEqual(await store.rankOf('p-zzzzzzzz-zzzzzzzz-zzzzzzzz', 'all', now), null);
  const rg = await store.leaderboardRange(0, now + 100, 3);
  assert.strictEqual(rg[0].pid, P[0]); assert.ok(rg.every((x) => x.games >= 3), 'в тройку попадают при ≥3 боях');
  assert.strictEqual((await store.leaderboardRange(now + 50, now + 100, 3)).length, 0);
  // квитанции за бои: монеты не больше PAID_DAILY побед в сутки, погашаются один раз, проигрыш без монет
  const day0 = Math.floor(now / 86400000) * 86400000 + 1000;
  for (let i = 0; i < rating.PAID_DAILY + 2; i++) await store.addVoucher(P[1], { at: day0 + i, win: true, level: 20 });
  await store.addVoucher(P[1], { at: day0 + 99, win: false, level: 20 });
  assert.strictEqual(await store.addVoucher('p-zzzzzzzz-zzzzzzzz-zzzzzzzz', { at: day0, win: true, level: 1 }), null, 'неизвестный игрок');
  const vs = await store.claimVouchers(P[1], day0 + 1000);
  assert.strictEqual(vs.length, rating.PAID_DAILY + 3);
  assert.strictEqual(vs.filter((x) => x.paid).length, rating.PAID_DAILY, 'монеты — не больше суточного лимита');
  assert.ok(vs.filter((x) => !x.win).every((x) => !x.paid), 'за поражение монет нет');
  assert.deepStrictEqual(await store.claimVouchers(P[1], day0 + 1000), [], 'повторно — пусто');
  assert.deepStrictEqual(await store.claimVouchers(P[0], day0 + rating.VOUCHER_KEEP_MS + 5e6), [], 'старые не выдаются');
  // награда за турнир — один раз
  assert.strictEqual(await store.claimTournament('t-1', P[0]), true);
  assert.strictEqual(await store.claimTournament('t-1', P[0]), false);
  assert.strictEqual(await store.claimTournament('t-1', P[1]), true);
  // удаление игрока убирает его из рейтинга
  await store.deletePlayer(P[2]);
  assert.ok(!(await store.leaderboard('all', 10, now + 10)).some((x) => x.pid === P[2]));
  assert.ok(!(await store.leaderboard('year', 10, now + 10)).some((x) => x.pid === P[2]));
};

(async () => {
  // формулы
  assert.strictEqual(rating.change(1000, 1000, true).a, 16);
  assert.ok(rating.change(1000, 1400, true).a > 16 && rating.change(1400, 1000, true).a < 16, 'слабого победа ценнее');
  assert.strictEqual(rating.change(1200, 1000, false).a + rating.change(1200, 1000, false).b, 0);
  const ok = { winner: 'A', reason: 'played', acts: 10, actsA: 5, actsB: 5, ms: 60000 };
  assert.ok(rating.counts(ok)); assert.ok(!rating.counts({ ...ok, winner: null }), 'ничья не считается');
  assert.ok(!rating.counts({ ...ok, reason: 'desync' })); assert.ok(!rating.counts({ ...ok, meta: { tourney: 't' } }), 'турнирные бои — не в Эло');
  const ev = (o) => ({ winner: 'A', reason: 'played', acts: 10, actsA: 5, actsB: 5, ms: 60000, ...o });
  assert.ok(!rating.counts(ev({ reason: 'forfeit', actsA: 0, actsB: 0, acts: 0 })), 'сдача без игры не считается');
  assert.ok(rating.counts(ev({ reason: 'forfeit' })), 'сдача после настоящей игры считается');
  // 2.0.2: признаки настоящей партии — время и ходы обеих сторон, а не число ходов
  assert.ok(!rating.counts(ev({ acts: 0, actsA: 0, actsB: 0 })), 'ноль ходов — не бой');
  assert.ok(!rating.counts(ev({ actsA: 10, actsB: 0 })), 'проигравший не ходил — не бой');
  assert.ok(!rating.counts(ev({ actsA: 0, actsB: 10 })), 'победитель не ходил — не бой');
  assert.ok(!rating.counts(ev({ ms: 3000 })), 'бой короче 12 секунд — не бой');
  assert.ok(!rating.counts({ winner: 'A', reason: 'played', acts: 10, actsA: 5, actsB: 5 }), 'нет времени боя — не считаем');
  assert.ok(rating.counts(ev({ acts: 2, actsA: 1, actsB: 1 })), 'честная быстрая победа за пару ходов считается');
  assert.ok(rating.counts(ev({ reason: 'timeouts', actsA: 4, actsB: 0 })), 'проигравший ушёл (пропуски хода) — победа считается');
  assert.ok(!rating.counts(ev({ reason: 'timeouts', actsA: 0, actsB: 0 })), 'никто не ходил — не бой');

  const memory = require('../src/store-memory');
  await storeChecks(memory.create(), 1e12);

  // HTTP: /rating и /tournament/claim
  const cfg = Object.assign(load({}), { platforms: ['site'], allowedOrigins: ['https://game.test'], rateAuth: 1000, rateIp: 1000 });
  const fake = { done: { id: 't-9', state: 'done' }, ensureNext: () => null, view: (t, pid) => ({ id: t.id, state: 'done', championPid: P[0], me: pid === P[1] ? { out: 2 } : null, rounds: [[], []], entrants: [] }), last: () => null, get: (id) => (id === 't-9' ? fake.done : null) };
  const st = memory.create();
  const srv = http.createServer(create({ cfg, store: st, tourney: fake }).handler);
  await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
  const call = (method, path, body, token) => new Promise((resolve, reject) => {
    const d = body ? JSON.stringify(body) : null;
    const r = http.request({ port, method, path, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(d ? { 'Content-Type': 'application/json' } : {}) } }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) { /* не JSON */ } resolve({ code: res.statusCode, json: j }); }); });
    r.on('error', reject); if (d) r.write(d); r.end();
  });
  const login = async (g, pid) => (await call('POST', '/auth', { platform: 'site', guest: g.repeat(40), pid })).json.token;
  assert.strictEqual((await call('GET', '/rating')).code, 401);
  const t0 = await login('a', P[0]), t1 = await login('h', P[1]), t2 = await login('z', P[2]);
  // хук пишет в хранилище
  const got = []; rating.hook(st, () => 1e12, (pid, m) => got.push([pid, m.delta]))({ winner: 'B', reason: 'played', acts: 10, actsA: 10, actsB: 10, ms: 60000, A: P[0], B: P[1], nickA: 'Анна', nickB: 'Борис' });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepStrictEqual(got.map((x) => x[1]).sort(), [-16, 16], 'игрокам отправлено изменение рейтинга');
  const vA = await st.claimVouchers(P[0], 1e12 + 10), vB = await st.claimVouchers(P[1], 1e12 + 10);
  assert.deepStrictEqual([vA.length, vA[0].win, vA[0].paid, vB.length, vB[0].win, vB[0].paid], [1, false, false, 1, true, true], 'квитанции обоим');
  const lb = await st.leaderboard('all', 5, 1e12); assert.strictEqual(lb[0].nick, 'Борис'); assert.strictEqual(lb[0].elo, 1016);

  const rr = await call('GET', '/rating?period=week', null, t0);
  assert.strictEqual(rr.code, 200); assert.strictEqual(rr.json.period, 'week');
  assert.ok(rr.json.list.every((x) => !('pid' in x)), 'чужие pid не отдаём');
  assert.strictEqual((await call('POST', '/rewards/claim', {})).code, 401);
  assert.deepStrictEqual((await call('POST', '/rewards/claim', {}, t0)).json.list, [], 'у t0 квитанций уже нет (забрали в проверке хука)');
  assert.strictEqual((await call('GET', '/rating?period=century', null, t0)).code, 400);
  assert.strictEqual((await call('POST', '/tournament/claim', { id: 't-9' }, t2)).code, 403, 'не участник');
  assert.strictEqual((await call('POST', '/tournament/claim', { id: 'нет' }, t1)).code, 404);
  const c1 = await call('POST', '/tournament/claim', { id: 't-9' }, t1);
  assert.strictEqual(c1.code, 200); assert.strictEqual(c1.json.view.me.out, 2);
  assert.strictEqual((await call('POST', '/tournament/claim', { id: 't-9' }, t1)).json.already, true, 'второй раз — отказ');
  assert.ok((await call('POST', '/tournament/claim', { id: 't-9' }, t0)).json.view, 'чемпион получает');
  srv.close();

  // награды сезона: тройка прошлой недели и прошлого месяца, одноразово
  const NOW = Date.UTC(2026, 9, 19, 12);
  const st2 = memory.create(), G2 = ['a', 'h', 'z'].map((c) => c.repeat(40));
  const srv2 = http.createServer(create({ cfg, store: st2, now: () => NOW }).handler);
  await new Promise((r) => srv2.listen(0, r)); const port2 = srv2.address().port;
  const call2 = (method, path, body, token) => new Promise((resolve, reject) => {
    const d = body ? JSON.stringify(body) : null;
    const r = http.request({ port: port2, method, path, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(d ? { 'Content-Type': 'application/json' } : {}) } }, (res) => { let s2 = ''; res.on('data', (c) => (s2 += c)); res.on('end', () => { let j = null; try { j = JSON.parse(s2); } catch (e) { /* не JSON */ } resolve({ code: res.statusCode, json: j }); }); });
    r.on('error', reject); if (d) r.write(d); r.end();
  });
  const lg = async (g, pid) => (await call2('POST', '/auth', { platform: 'site', guest: g, pid })).json.token;
  const u0 = await lg(G2[0], P[0]), u1 = await lg(G2[1], P[1]), u2 = await lg(G2[2], P[2]);
  const M = (at) => ({ a: { pid: P[0], nick: 'А' }, b: { pid: P[1], nick: 'Б' }, winner: 'A', at });
  for (const day of [14, 14, 15]) await st2.recordMatch(M(Date.UTC(2026, 9, day, 10)));          // прошлая неделя 12–18 октября
  for (const day of [3, 4, 5]) await st2.recordMatch(M(Date.UTC(2026, 8, day, 10)));              // прошлый месяц — сентябрь
  await st2.recordMatch({ ...M(Date.UTC(2026, 9, 19, 9)), winner: 'B' });                          // этот бой в текущей неделе — в награды не идёт
  const s0 = (await call2('GET', '/rating/season', null, u0)).json.list;
  assert.deepStrictEqual(s0.map((x) => [x.id, x.place]), [['w-2026-10-12', 1], ['m-2026-09', 1]]);
  const s1 = (await call2('GET', '/rating/season', null, u1)).json.list;
  assert.deepStrictEqual(s1.map((x) => x.place), [2, 2], 'второе место');
  assert.deepStrictEqual((await call2('GET', '/rating/season', null, u2)).json.list, [], 'не играл — нет наград');
  const sc1 = await call2('POST', '/rating/season/claim', { id: 'w-2026-10-12' }, u0);
  assert.strictEqual(sc1.json.reward.place, 1);
  assert.strictEqual((await call2('POST', '/rating/season/claim', { id: 'w-2026-10-12' }, u0)).json.already, true, 'второй раз нельзя');
  assert.strictEqual((await call2('POST', '/rating/season/claim', { id: 'w-2026-10-12' }, u2)).code, 404, 'чужую награду взять нельзя');
  assert.strictEqual((await call2('POST', '/rating/season/claim', { id: 'w-2020-01-06' }, u0)).code, 404, 'старый период');
  // доска календарного сезона: текущая неделя (очки с понедельника) и тройка прошлой недели
  let bd = (await call2('GET', '/rating/season/board?kind=week', null, u0)).json;
  assert.strictEqual(bd.id, 'w-2026-10-19'); assert.deepStrictEqual(bd.list, [], 'в текущей неделе пока 1 бой — меньше минимума');
  assert.deepStrictEqual(bd.prev.top.map((x) => [x.place, x.nick, x.me]), [[1, 'А', true], [2, 'Б', false]], 'прошлая неделя');
  assert.strictEqual(bd.me, null);
  for (const h of [10, 11]) await st2.recordMatch({ ...M(Date.UTC(2026, 9, 19, h)), at: Date.UTC(2026, 9, 19, h) });
  bd = (await call2('GET', '/rating/season/board?kind=week', null, u1)).json;
  assert.ok(bd.list.length === 2 && bd.me && bd.me.games === 3 && bd.list.some((x) => x.me), 'после трёх боёв игрок в списке');
  assert.strictEqual((await call2('GET', '/rating/season/board?kind=year', null, u0)).code, 400);
  assert.strictEqual((await call2('GET', '/rating/season/board?kind=month', null, u2)).json.me, null);
  // «Битва народов»: прошлая неделя — А и Б из одного народа?  делаем карточки: А — люди, Б — гномы
  await st2.putCard(P[0], 20, JSON.stringify({ nick: 'А', faction: 'human' })); await st2.putCard(P[1], 20, JSON.stringify({ nick: 'Б', faction: 'dwarf' })); await st2.putCard(P[2], 20, JSON.stringify({ nick: 'В', faction: 'human' }));
  let fw = (await call2('GET', '/factions', null, u0)).json;
  assert.strictEqual(fw.me, 'human'); assert.strictEqual(fw.list.length, 4);
  assert.strictEqual(fw.prev.winner, null, 'играл один человек — победителя нет (нужно двое играющих)');
  assert.strictEqual(fw.prev.eligible, false);
  // В (люди) тоже сыграла на прошлой неделе: победа над Б — теперь у людей двое играющих
  for (const day of [14, 15, 16]) await st2.recordMatch({ a: { pid: P[2], nick: 'В' }, b: { pid: P[1], nick: 'Б' }, winner: 'A', at: Date.UTC(2026, 9, day, 12) });
  fw = (await call2('GET', '/factions', null, u0)).json;
  assert.strictEqual(fw.prev.winner, 'human'); assert.strictEqual(fw.prev.eligible, true); assert.strictEqual(fw.prev.list[0].faction, 'human');
  assert.strictEqual((await call2('GET', '/factions', null, u1)).json.prev.eligible, false, 'проигравший народ награды не получает');
  assert.strictEqual((await call2('POST', '/factions/claim', { id: 'w-2026-10-12' }, u1)).code, 404);
  assert.strictEqual((await call2('POST', '/factions/claim', { id: 'w-2026-10-05' }, u0)).code, 404, 'чужая неделя');
  const fc = await call2('POST', '/factions/claim', { id: 'w-2026-10-12' }, u0); assert.strictEqual(fc.json.reward.faction, 'human');
  assert.strictEqual((await call2('POST', '/factions/claim', { id: 'w-2026-10-12' }, u0)).json.already, true, 'второй раз нельзя');
  assert.strictEqual((await call2('POST', '/factions/claim', { id: 'w-2026-10-12' }, u2)).json.reward.faction, 'human', 'второй игрок победителя тоже берёт');
  srv2.close();
  console.log('rating: ок');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
module.exports = { storeChecks };
