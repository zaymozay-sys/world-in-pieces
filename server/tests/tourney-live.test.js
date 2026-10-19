// Турнир через настоящий сервер: HTTP-запись, WebSocket-бои по сетке, чемпион. Результаты боёв разыгрывают «клиенты» (роль A побеждает).
const assert = require('assert');
const http = require('http');
const WebSocket = require('ws');
const live = require('../src/live');
const { create, cleanCard, sha } = require('../src/app');
const { load } = require('../src/config');
const { make } = require('../src/tour-wire');

const wait = async (f, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = f(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('ожидание'); await new Promise((r) => setTimeout(r, 20)); } };

(async () => {
  const cfg = load({ PLATFORMS: 'site' });
  const store = require('../src/store-memory').create();
  const tw = make(cfg, { tcfg: { gapMs: 150, showMs: 4000, minPlayers: 2 } });
  const { handler } = create({ cfg, store, tourney: tw.trn });
  const srv = http.createServer(handler);
  const lv = live.attach({ server: srv, store, cfg, sha, live: { cleanCard, cfg: { spread: 5 }, onEnd: tw.onEnd } });
  tw.bind(lv.core);
  await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
  const call = (method, path, token, body) => new Promise((res) => {
    const data = body ? JSON.stringify(body) : null;
    const rq = http.request({ host: '127.0.0.1', port, method, path, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } }, (rs) => { let b = ''; rs.on('data', (c) => b += c); rs.on('end', () => res({ code: rs.statusCode, json: b ? JSON.parse(b) : null })); });
    if (data) rq.write(data); rq.end();
  });
  const P = [];
  for (let i = 0; i < 4; i++) {
    const pid = 'p-' + String(i).repeat(8) + '-' + String(i).repeat(8) + '-' + String(i).repeat(8), tok = String(i).repeat(64).slice(0, 64).replace(/(.)/g, (c) => ['a', 'b', 'c', 'd'][Number(c)]);
    await store.findOrCreatePlayer('site', 'x' + i, pid); await store.createSession(sha(tok), pid, Date.now() + 1e6);
    P.push({ pid, tok, nick: 'Игрок' + i });
  }
  // без токена нельзя; до записи турнир открыт
  assert.strictEqual((await call('GET', '/tournament')).code, 401);
  const g = await call('GET', '/tournament', P[0].tok); assert.strictEqual(g.json.tour.state, 'open'); assert.strictEqual(g.json.tour.joined, false);
  assert.strictEqual((await call('POST', '/tournament/join', P[0].tok, { nick: '', faction: 'elf', gender: 'm' })).code, 400);
  for (const p of P) { const r = await call('POST', '/tournament/join', p.tok, { nick: p.nick, faction: 'dwarf', gender: 'f' }); assert.strictEqual(r.code, 200); assert.ok(r.json.tour.joined); }
  assert.strictEqual((await call('GET', '/tournament', P[1].tok)).json.tour.size, 4);

  // все четверо в сети (WebSocket); при назначении боя «играют» — роль A побеждает
  const got = [];
  const Wsock = P.map((p) => new Promise((res) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/live'); p.ws = ws; p.msgs = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: p.tok })));
    ws.on('message', (d) => {
      const m = JSON.parse(String(d)); p.msgs.push(m);
      if (m.t === 'hello-ok') res();
      if (m.t === 'matched') { got.push({ pid: p.pid, role: m.role, tourney: m.tourney, opp: m.opp }); ws.send(JSON.stringify({ t: 'result', winner: 'A' })); }
    });
  }));
  await Promise.all(Wsock);
  tw.trn.begin(tw.trn.current());                              // старт турнира «по расписанию»
  await wait(() => tw.trn.last());
  const last = tw.trn.last();
  assert.strictEqual(last.state, 'done'); assert.ok(last.champion);
  assert.strictEqual(last.rounds.length, 2); assert.strictEqual(last.rounds[0].length, 2); assert.strictEqual(last.rounds[1].length, 1);
  assert.strictEqual(got.length, 6);                           // три боя по два участника
  assert.ok(got.every((x) => x.tourney && x.tourney.level === 50 && x.opp && x.opp.nick && x.opp.faction === 'dwarf'));
  assert.deepStrictEqual(got.filter((x) => x.tourney.round === 1).length, 4);
  // все видят итог; следующий турнир уже назначен
  const v = (await call('GET', '/tournament', P[0].tok)).json; assert.strictEqual(v.last.champion, last.champion); assert.strictEqual(v.tour.state, 'open'); assert.notStrictEqual(v.tour.id, last.id);
  assert.ok(P[0].msgs.some((m) => m.t === 'tour' && m.tour.state === 'done'));
  for (const p of P) p.ws.close(); lv.close(); srv.close();
  console.log('tourney-live: все тесты пройдены'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
