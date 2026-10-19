const assert = require('assert');
const http = require('http');
const sq = require('../src/square');
const { load } = require('../src/config');
const { create } = require('../src/app');

// правила текста
assert.strictEqual(sq.clean('  Ищу   напарника <b>для</b> боя  ').text, 'Ищу напарника b для /b боя');
assert.strictEqual(sq.clean('').e, 'empty'); assert.strictEqual(sq.clean(5).e, 'text');
assert.strictEqual(sq.clean('x'.repeat(141)).e, 'long'); assert.strictEqual(sq.clean('x'.repeat(140)).text.length, 140);
for (const bad of ['заходи на http://evil.ru', 'сайт vk.com/x', 'пиши в t.me/abc', 'мой @nickname', 'www.test']) assert.strictEqual(sq.clean(bad).e, 'link', bad);
assert.ok(sq.clean('Привет, эльфы! Кто на турнир?').text, 'обычный текст проходит');
assert.strictEqual(sq.allowed(1000, 0, 1000 + sq.MIN_GAP_MS - 1), 'slow'); assert.strictEqual(sq.allowed(0, sq.DAILY, 1e12), 'daily'); assert.strictEqual(sq.allowed(0, 3, 1e12), '');

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
  for (let i = 0; i < 4; i++) tok.push((await call('POST', '/auth', { platform: 'site', guest: 'wxyz'[i].repeat(40), pid: P[i] })).json.token);
  const fac = ['elf', 'elf', 'dwarf', null], nick = ['Аня', 'Боря', 'Вася', 'Гена'];
  for (let i = 0; i < 3; i++) await st.putCard(P[i], 20, JSON.stringify({ nick: nick[i], faction: fac[i] }));
  assert.strictEqual((await call('GET', '/square')).code, 401);
  assert.strictEqual((await call('GET', '/square', null, tok[3])).code, 409, 'без карточки площадки нет');
  let r = await call('POST', '/square/post', { text: 'Всем привет, эльфы!' }, tok[0]); assert.strictEqual(r.code, 200);
  assert.strictEqual((await call('POST', '/square/post', { text: 'Ещё одно' }, tok[0])).json.error, 'slow', 'слишком часто');
  T += 21000; assert.strictEqual((await call('POST', '/square/post', { text: 'Всем привет, эльфы!' }, tok[0])).json.error, 'dup', 'повтор');
  assert.strictEqual((await call('POST', '/square/post', { text: 'иди на http://x.ru' }, tok[0])).json.error, 'link');
  T += 21000; assert.strictEqual((await call('POST', '/square/post', { text: 'Кто на турнир?' }, tok[1])).code, 200);
  T += 21000; assert.strictEqual((await call('POST', '/square/post', { text: 'А мы гномы' }, tok[2])).code, 200);
  r = await call('GET', '/square', null, tok[0]);
  assert.strictEqual(r.json.faction, 'elf'); assert.deepStrictEqual(r.json.posts.map((x) => [x.nick, x.mine]), [['Боря', false], ['Аня', true]], 'видно только свой народ, свежие сверху');
  assert.deepStrictEqual(r.json.online.sort(), ['Аня', 'Боря'], 'в сети — эльфы, гнома нет');
  assert.deepStrictEqual((await call('GET', '/square', null, tok[2])).json.posts.map((x) => x.nick), ['Вася']);
  // удалить можно только своё
  const idB = r.json.posts[0].id, idA = r.json.posts[1].id;
  assert.strictEqual((await call('POST', '/square/delete', { id: idB }, tok[0])).json.deleted, false);
  assert.strictEqual((await call('POST', '/square/delete', { id: idA }, tok[0])).json.deleted, true);
  assert.strictEqual((await call('GET', '/square', null, tok[1])).json.posts.length, 1);
  // сутки: не больше DAILY записей
  let last = 0; for (let i = 0; i < sq.DAILY + 2; i++) { T += 21000; last = (await call('POST', '/square/post', { text: 'запись ' + i }, tok[1])).code; }
  assert.strictEqual(last, 429, 'суточный лимит');
  // старые записи убираются
  await st.purge(T + 8 * 86400000, 1e12); assert.strictEqual((await st.listPosts('elf', 50)).length, 0);
  // помеченный игрок не пишет
  await st.setCheck(P[0], { at: T, xp: 1, wins: 1, floor: 0, flagUntil: T + 1e9, reason: 'xp-jump' });
  T += 3 * 86400000; assert.strictEqual((await call('POST', '/square/post', { text: 'привет' }, tok[0])).code, 403);
  // жалобы и скрытие
  const Q = ['p-eeeeeeee-eeeeeeee-eeeeeeee', 'p-ffffffff-ffffffff-ffffffff', 'p-gggggggg-gggggggg-gggggggg', 'p-hhhhhhhh-hhhhhhhh-hhhhhhhh', 'p-iiiiiiii-iiiiiiii-iiiiiiii'], qn = ['Автор', 'Ж1', 'Ж2', 'Ж3', 'Зритель'], qt = [];
  for (let i = 0; i < 5; i++) { qt.push((await call('POST', '/auth', { platform: 'site', guest: 'qrstu'[i].repeat(40), pid: Q[i] })).json.token); await st.putCard(Q[i], 20, JSON.stringify({ nick: qn[i], faction: 'elf' })); }
  T += 21000; assert.strictEqual((await call('POST', '/square/post', { text: 'Плохая запись' }, qt[0])).code, 200);
  const pid1 = (await call('GET', '/square', null, qt[4])).json.posts.find((x) => x.nick === 'Автор').id;
  assert.strictEqual((await call('POST', '/square/report', { id: pid1 }, qt[0])).code, 404, 'на себя жаловаться нельзя');
  assert.strictEqual((await call('POST', '/square/report', { id: pid1 }, tok[2])).code, 404, 'чужой народ — нет записи');
  assert.strictEqual((await call('POST', '/square/report', { id: 99999 }, qt[1])).code, 404);
  assert.strictEqual((await call('POST', '/square/report', { id: pid1 }, qt[1])).json.already, false);
  assert.strictEqual((await call('POST', '/square/report', { id: pid1 }, qt[1])).json.already, true, 'повторная жалоба не считается');
  assert.ok((await call('GET', '/square', null, qt[4])).json.posts.some((x) => x.id === pid1), 'после одной жалобы запись видна');
  await call('POST', '/square/report', { id: pid1 }, qt[2]);
  await call('POST', '/square/report', { id: pid1 }, qt[3]);
  assert.ok(!(await call('GET', '/square', null, qt[4])).json.posts.some((x) => x.id === pid1), 'три жалобы — запись скрыта у всех');
  assert.ok((await call('GET', '/square', null, qt[0])).json.posts.some((x) => x.id === pid1), 'автор свою запись видит');
  T += 21000; r = await call('POST', '/square/post', { text: 'Ещё одна' }, qt[0]); assert.strictEqual(r.json.error, 'muted', 'автору с тремя жалобами писать нельзя');
  T += 3 * 86400000 + 1; T += 21000; assert.strictEqual((await call('POST', '/square/post', { text: 'Ещё одна' }, qt[0])).code, 200, 'через три дня снова можно');
  // скрытие автора у себя
  const p2 = (await call('GET', '/square', null, qt[4])).json.posts.find((x) => x.nick === 'Автор');
  assert.ok(p2); assert.strictEqual((await call('POST', '/square/hide', { id: p2.id }, qt[4])).json.ok, true);
  r = await call('GET', '/square', null, qt[4]); assert.ok(!r.json.posts.some((x) => x.nick === 'Автор') && r.json.hidden === 1, 'автор скрыт только у зрителя');
  assert.ok((await call('GET', '/square', null, qt[1])).json.posts.some((x) => x.nick === 'Автор'), 'остальные его видят');
  await call('POST', '/square/unhide', {}, qt[4]); assert.ok((await call('GET', '/square', null, qt[4])).json.posts.some((x) => x.nick === 'Автор'), 'показать скрытых');
  // суточный лимит жалоб: десять уже есть — одиннадцатая отклоняется
  for (let i = 0; i < sq.REPORTS_DAILY; i++) await st.addReport({ post: 1000 + i, reporter: Q[1], author: Q[0], at: T });
  const tgt = (await call('GET', '/square', null, qt[1])).json.posts.find((x) => !x.mine);
  assert.ok(tgt, 'есть чужая запись'); assert.strictEqual((await call('POST', '/square/report', { id: tgt.id }, qt[1])).code, 429, 'суточный лимит жалоб');
  srv.close(); console.log('square: ок'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
