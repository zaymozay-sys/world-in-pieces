// Проверка хранения турниров в настоящем PostgreSQL: DATABASE_URL=... node tools/pg-tourney-check.js (по умолчанию локальный 127.0.0.1:54329)
const assert = require('assert');
(async () => {
  const store = await require('../server/src/store-pg').create(process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:54329/postgres');
  const pid = 'p-aaaaaaaa-aaaaaaaa-aaaaaaaa';
  await store.findOrCreatePlayer('site', 'x', pid);
  await store.saveTournament('t1', 'open', 5, JSON.stringify({ entrants: [{ pid }] }));
  await store.saveTournament('t1', 'running', 5, JSON.stringify({ entrants: [{ pid }], r: 1 }));
  await store.saveTournament('t0', 'done', 1, '{}'); await store.saveTournament('t2', 'cancelled', 2, '{}');
  let ld = await store.loadTournaments(); assert.deepStrictEqual(ld.map((x) => x.id), ['t1', 't0']); assert.strictEqual(ld[0].state, 'running');
  await store.deletePlayer(pid); ld = await store.loadTournaments(); assert.ok(!ld[0].body.includes('p-aaaaaaaa'), ld[0].body);
  const n = await store.purge(Date.now() + 100 * 86400000, 1e12); assert.ok(n >= 2);
  console.log('pg ok'); await store.close();
})().catch((e) => { console.error(e); process.exit(1); });
// рейтинг и награды в PostgreSQL (те же проверки, что и для памяти); идёт после проверки турниров
setTimeout(async () => {
  const store = await require('../server/src/store-pg').create(process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:54329/postgres');
  const P = ['p-aaaaaaaa-aaaaaaaa-aaaaaaaa', 'p-bbbbbbbb-bbbbbbbb-bbbbbbbb', 'p-cccccccc-cccccccc-cccccccc'];
  const pool = new (require('../server/node_modules/pg').Pool)({ connectionString: process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:54329/postgres' });
  await pool.query('DELETE FROM players'); await pool.query('DELETE FROM tournament_claims'); await pool.end();
  const src = require('fs').readFileSync(__dirname + '/../server/tests/rating.test.js', 'utf8');
  const m = /const storeChecks = async[\s\S]*?\n};\n/.exec(src)[0];
  const assert = require('assert'), rating = require('../server/src/rating'), DAY = 86400000, P_ = P;
  const run = new Function('assert', 'rating', 'P', 'DAY', m + '; return storeChecks;')(assert, rating, P_, DAY);
  await run(store, Date.now());
  const A = 'p-aaaaaaaa-aaaaaaaa-aaaaaaaa'; const nowT = Date.now();
  assert.strictEqual(await store.getCheck(A), null);
  await store.setCheck(A, { at: nowT, xp: 5, wins: 2, flagUntil: nowT + 1000, reason: 'xp-jump' });
  await store.setCheck(A, { at: nowT, xp: 6, wins: 2, flagUntil: nowT + 1000, reason: 'xp-jump' });
  const ck = await store.getCheck(A); assert.deepStrictEqual([ck.xp, ck.reason], [6, 'xp-jump']);
  assert.strictEqual(await store.isFlagged(A, nowT), true); assert.strictEqual(await store.isFlagged(A, nowT + 2000), false);
  console.log('pg рейтинг ok'); await store.close();
}, 1500);
// рейтинг глубины в PostgreSQL (миграция 007)
setTimeout(async () => {
  try {
    const store = await require('../server/src/store-pg').create(process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:54329/postgres');
    const P = ['p-dddddddd-dddddddd-dddddddd', 'p-eeeeeeee-eeeeeeee-eeeeeeee'];
    for (const p of P) await store.findOrCreatePlayer('site', p, p);
    await store.putCard(P[0], 20, JSON.stringify({ nick: 'Аня' })); await store.putCard(P[1], 20, JSON.stringify({ nick: 'Боря' }));
    const now = Date.now();
    await store.setCheck(P[0], { at: now, xp: 1, wins: 1, floor: 12, flagUntil: 0, reason: '' });
    await store.setCheck(P[1], { at: now, xp: 1, wins: 1, floor: 31, flagUntil: 0, reason: '' });
    let b = await store.depthBoard(10, now); assert.deepStrictEqual(b.map((x) => [x.nick, x.floor]), [['Боря', 31], ['Аня', 12]]);
    await store.setCheck(P[1], { at: now, xp: 1, wins: 1, floor: 31, flagUntil: now + 1000, reason: 'floor-jump' });
    b = await store.depthBoard(10, now); assert.deepStrictEqual(b.map((x) => x.nick), ['Аня'], 'помеченный скрыт');
    assert.strictEqual((await store.getCheck(P[0])).floor, 12);
    for (const p of P) await store.deletePlayer(p);
    console.log('pg depth ok'); await store.close();
  } catch (e) { console.error(e); process.exit(1); }
}, 4000);
// «Битва народов» в PostgreSQL
setTimeout(async () => {
  try {
    const store = await require('../server/src/store-pg').create(process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:54329/postgres');
    const P = ['p-ffffffff-ffffffff-ffffffff', 'p-gggggggg-gggggggg-gggggggg'];
    for (const p of P) await store.findOrCreatePlayer('site', p, p);
    await store.putCard(P[0], 20, JSON.stringify({ nick: 'А', faction: 'elf' })); await store.putCard(P[1], 20, JSON.stringify({ nick: 'Б', faction: 'lizard' }));
    const at = Date.UTC(2026, 9, 14, 10);
    for (let i = 0; i < 3; i++) await store.recordMatch({ a: { pid: P[0], nick: 'А' }, b: { pid: P[1], nick: 'Б' }, winner: 'A', at: at + i });
    const r = await store.factionRange(at - 1000, at + 10000), by = Object.fromEntries(r.map((x) => [x.faction, x]));
    assert.ok(by.elf.score > 0 && by.lizard.score < 0 && by.elf.score === -by.lizard.score && by.elf.games === 3 && by.elf.players === 1, JSON.stringify(r));
    assert.strictEqual(await store.factionOf(P[0]), 'elf'); assert.strictEqual(await store.factionOf('p-zzzzzzzz-zzzzzzzz-zzzzzzzz'), null);
    for (const p of P) await store.deletePlayer(p);
    console.log('pg folk ok'); await store.close();
  } catch (e) { console.error(e); process.exit(1); }
}, 6000);
// площадка народа в PostgreSQL (миграция 008)
setTimeout(async () => {
  try {
    const store = await require('../server/src/store-pg').create(process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:54329/postgres');
    const P = ['p-hhhhhhhh-hhhhhhhh-hhhhhhhh', 'p-iiiiiiii-iiiiiiii-iiiiiiii'];
    for (const p of P) await store.findOrCreatePlayer('site', p, p);
    await store.putCard(P[0], 20, JSON.stringify({ nick: 'А', faction: 'elf' }));
    assert.deepStrictEqual(await store.cardInfo(P[0]), { faction: 'elf', nick: 'А' }); assert.strictEqual(await store.cardInfo(P[1]), null);
    const t = Date.now(), id = await store.addPost({ faction: 'elf', pid: P[0], nick: 'А', text: 'привет', at: t });
    await store.addPost({ faction: 'dwarf', pid: P[1], nick: 'Б', text: 'гномам', at: t });
    assert.deepStrictEqual((await store.listPosts('elf', 10)).map((x) => x.body), ['привет']);
    const ps = await store.postStats(P[0], t - 1000); assert.ok(ps.last === t && ps.today === 1 && ps.lastText === 'привет', JSON.stringify(ps));
    assert.strictEqual(await store.deletePost(id, P[1]), false); assert.strictEqual(await store.deletePost(id, P[0]), true);
    await store.purge(t + 8 * 86400000, 1e12); assert.strictEqual((await store.listPosts('dwarf', 10)).length, 0);
    for (const p of P) await store.deletePlayer(p);
    console.log('pg square ok'); await store.close();
  } catch (e) { console.error(e); process.exit(1); }
}, 8000);
// жалобы и скрытие авторов в PostgreSQL (миграция 009)
setTimeout(async () => {
  try {
    const store = await require('../server/src/store-pg').create(process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:54329/postgres');
    const P = ['p-jjjjjjjj-jjjjjjjj-jjjjjjjj', 'p-kkkkkkkk-kkkkkkkk-kkkkkkkk'];
    for (const p of P) await store.findOrCreatePlayer('site', p, p);
    const t = Date.now(), id = await store.addPost({ faction: 'elf', pid: P[0], nick: 'А', text: 'x', at: t });
    assert.deepStrictEqual(await store.postInfo(id), { pid: P[0], faction: 'elf' }); assert.strictEqual(await store.postInfo(999999999), null);
    assert.strictEqual(await store.addReport({ post: id, reporter: P[1], author: P[0], at: t }), true); assert.strictEqual(await store.addReport({ post: id, reporter: P[1], author: P[0], at: t }), false);
    assert.strictEqual((await store.reportCounts([id])).get(id), 1); assert.strictEqual(await store.distinctReporters(P[0], t - 1000), 1); assert.strictEqual(await store.reportsSince(P[1], t - 1000), 1);
    await store.addHide(P[1], P[0]); assert.ok((await store.hiddenAuthors(P[1])).has(P[0])); await store.clearHides(P[1]); assert.strictEqual((await store.hiddenAuthors(P[1])).size, 0);
    for (const p of P) await store.deletePlayer(p);
    console.log('pg moderation ok'); await store.close();
  } catch (e) { console.error(e); process.exit(1); }
}, 10000);
// место игрока: SQL-версия rankOf совпадает со списком
setTimeout(async () => {
  try {
    const store = await require('../server/src/store-pg').create(process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:54329/postgres');
    const P = ['p-llllllll-llllllll-llllllll', 'p-mmmmmmmm-mmmmmmmm-mmmmmmmm', 'p-nnnnnnnn-nnnnnnnn-nnnnnnnn'];
    for (const p of P) await store.findOrCreatePlayer('site', p, p);
    const now = Date.now(); const M = (a, b, w, k) => ({ a: { pid: P[a], nick: 'Н' + a }, b: { pid: P[b], nick: 'Н' + b }, winner: w, at: now - k });
    await store.recordMatch(M(0, 1, 'A', 5)); await store.recordMatch(M(1, 2, 'A', 4)); await store.recordMatch(M(2, 0, 'B', 3));
    for (const per of ['all', 'week', 'month', 'year']) {
      const list = await store.leaderboard(per, 1e9, now);
      for (const row of list.filter((r) => P.includes(r.pid))) {
        const me = await store.rankOf(row.pid, per, now);
        assert.ok(me && me.place === row.place && me.score === row.score && me.wins === row.wins && me.losses === row.losses, per + ' ' + JSON.stringify([row, me]));
      }
    }
    assert.strictEqual(await store.rankOf('p-zzzzzzzz-zzzzzzzz-zzzzzzzz', 'all', now), null);
    for (const p of P) await store.deletePlayer(p);
    console.log('pg rankOf ok'); await store.close();
  } catch (e) { console.error(e); process.exit(1); }
}, 12000);
setTimeout(async () => {
  try {
    const store = await require('../server/src/store-pg').create(process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:54329/postgres');
    await store.funnelAdd('2026-10-20', 'win1'); await store.funnelAdd('2026-10-20', 'win1'); await store.funnelAdd('2026-10-21', 'tut_done');
    const d = await store.funnelDays('2026-10-20');
    assert.ok(d['2026-10-20'].win1 >= 2 && d['2026-10-21'].tut_done >= 1, JSON.stringify(d));
    assert.ok(!(await store.funnelDays('2026-10-22'))['2026-10-20'], 'since режет старые дни');
    console.log('pg funnel ok'); await store.close();
  } catch (e) { console.error(e); process.exit(1); }
}, 14000);
// гонки: параллельные награды и платные бои не превышают лимиты
setTimeout(async () => {
  const assert = require('assert'), rating = require('../server/src/rating');
  const store = await require('../server/src/store-pg').create(process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:54329/postgres');
  const A = 'p-rrrrrrr1-rrrrrrr1-rrrrrrr1', B = 'p-rrrrrrr2-rrrrrrr2-rrrrrrr2';
  await store.findOrCreatePlayer('site', 'race1', A); await store.findOrCreatePlayer('site', 'race2', B);
  const at = Date.now();
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.addVoucher(A, { at: at + i, win: true, level: 5 })));
  assert.strictEqual((await store.claimVouchers(A, at + 100)).filter((x) => x.paid).length, rating.PAID_DAILY);
  assert.strictEqual((await Promise.all(Array.from({ length: 20 }, () => store.claimTournament('race-t', A)))).filter(Boolean).length, 1);
  const m = await Promise.all(Array.from({ length: 12 }, () => store.recordMatch({ a: { pid: A, nick: 'a' }, b: { pid: B, nick: 'b' }, winner: 'A', at })));
  assert.strictEqual(m.filter(Boolean).length, rating.PAIR_DAILY);
  await store.deletePlayer(A); await store.deletePlayer(B); await store.close();
  console.log('pg races ok');
}, 1500);
