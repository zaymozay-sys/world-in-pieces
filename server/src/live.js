// Бой в реальном времени: очередь поиска, комнаты, пересылка ходов, таймер хода на сервере.
// Сервер бой НЕ считает: оба клиента считают его сами по одному зерну, сервер лишь передаёт ходы по порядку,
// следит за очередью ходов и временем, сверяет итог. Транспорт (WebSocket) подключается снаружи: см. attach().
// Ядро не знает про сеть: создаётся с функциями send(connId, msg), now(), timers — поэтому проверяется без сокетов.
const crypto = require('crypto');

const defaults = () => ({
  turnMs: 30000,        // время на ход (+ запас на задержку сети)
  graceMs: 2000,
  strikes: 3,           // столько пропусков хода подряд — поражение
  waitMs: 20000,        // сколько ждём соперника, потом «никого нет»
  spread: 5,            // разница уровней
  awayMs: 60000,        // сколько держим комнату без игроков
  resultMs: 8000,       // сколько ждём итог от второго клиента
  maxAct: 4000,         // потолок числа действий в бою (защита от зацикливания)
});

const create = ({ send, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, cfg = {}, onEnd = () => {}, seedOf }) => {
  const C = { ...defaults(), ...cfg };
  const conns = new Map();      // connId -> { pid, room, role }
  const queue = [];             // { conn, pid, level, card, since }
  const rooms = new Map();      // id -> room
  const byPid = new Map();      // pid -> roomId
  const newSeed = seedOf || (() => crypto.randomBytes(4).readUInt32BE(0) || 1);
  const to = (conn, msg) => { try { send(conn, msg); } catch (e) { /* соединение закрыто */ } };
  const other = (r) => (r === 'A' ? 'B' : 'A');

  const hello = (conn, pid) => { conns.set(conn, { pid, room: null, role: null }); };

  const startTurn = (room) => {
    clearTimer(room.timer);
    room.deadline = now() + C.turnMs;
    room.timer = setTimer(() => timeout(room), C.turnMs + C.graceMs);
  };

  const finish = (room, winner, reason) => {
    if (room.over) return;
    room.over = true; clearTimer(room.timer); clearTimer(room.resTimer); clearTimer(room.dropTimer);
    for (const r of ['A', 'B']) { const p = room.p[r]; if (p.conn) to(p.conn, { t: 'end', winner, reason }); }
    onEnd({ room: room.id, winner, reason, A: room.p.A.pid, B: room.p.B.pid, acts: room.n, meta: room.meta || null, levelA: room.p.A.card && room.p.A.card.level, levelB: room.p.B.card && room.p.B.card.level, nickA: room.p.A.card && room.p.A.card.nick, nickB: room.p.B.card && room.p.B.card.nick });
    room.dropTimer = setTimer(() => drop(room), 5000);
  };

  const drop = (room) => {
    clearTimer(room.timer); clearTimer(room.resTimer); clearTimer(room.dropTimer);
    rooms.delete(room.id);
    for (const r of ['A', 'B']) { const p = room.p[r]; if (byPid.get(p.pid) === room.id) byPid.delete(p.pid); const c = conns.get(p.conn); if (c && c.room === room.id) { c.room = null; c.role = null; } }
  };

  const timeout = (room) => {
    if (room.over) return;
    const o = room.owner; room.strikes[o]++;
    for (const r of ['A', 'B']) { const p = room.p[r]; if (p.conn) to(p.conn, { t: 'timeout', side: o, strikes: room.strikes[o] }); }
    room.log.push({ timeout: o });
    if (room.strikes[o] >= C.strikes) return finish(room, other(o), 'timeouts');
    room.owner = other(o); startTurn(room);
  };

  const match = (a, b, meta = null) => {
    const room = { meta, id: crypto.randomBytes(8).toString('hex'), seed: newSeed(), n: 0, log: [], over: false, strikes: { A: 0, B: 0 }, results: {},
      p: { A: { pid: a.pid, conn: a.conn, card: a.card, away: false }, B: { pid: b.pid, conn: b.conn, card: b.card, away: false } } };
    room.first = room.seed % 2 ? 'A' : 'B'; room.owner = room.first;
    rooms.set(room.id, room); byPid.set(a.pid, room.id); byPid.set(b.pid, room.id);
    for (const r of ['A', 'B']) {
      const p = room.p[r], c = conns.get(p.conn); if (c) { c.room = room.id; c.role = r; }
      to(p.conn, { t: 'matched', room: room.id, role: r, seed: room.seed, first: room.first, turnMs: C.turnMs, opp: room.p[other(r)].card, ...(meta && meta.send ? { tourney: meta.send } : {}) });
    }
    startTurn(room);
  };

  const tick = () => {
    const t = now();
    for (let i = 0; i < queue.length; i++) {
      const a = queue[i]; let best = -1, bd = 1e9;
      for (let j = i + 1; j < queue.length; j++) {
        const b = queue[j]; if (b.pid === a.pid) continue;
        const d = Math.abs(a.level - b.level); if (d <= C.spread && d < bd) { bd = d; best = j; }
      }
      if (best >= 0) { const b = queue[best]; queue.splice(best, 1); queue.splice(i, 1); i--; match(a, b); }
    }
    for (let i = queue.length - 1; i >= 0; i--) if (t - queue[i].since >= C.waitMs) { const q = queue.splice(i, 1)[0]; to(q.conn, { t: 'noopp' }); }
  };

  const leaveQueue = (conn) => { const i = queue.findIndex((q) => q.conn === conn); if (i >= 0) queue.splice(i, 1); };

  const enqueue = (conn, card) => {
    const c = conns.get(conn); if (!c || !card) return false;
    const old = rooms.get(byPid.get(c.pid) || c.room);
    if (old && old.over) { drop(old); c.room = null; c.role = null; }                 // прошлый бой закончен — комната больше не держит игрока
    else if (old || c.room) { to(conn, { t: 'err', e: 'busy' }); return false; }
    leaveQueue(conn); queue.push({ conn, pid: c.pid, level: card.level, card, since: now() });
    to(conn, { t: 'queued' }); tick(); return true;
  };

  const act = (conn, m) => {
    const c = conns.get(conn); const room = c && rooms.get(c.room); if (!room || room.over) return;
    const role = c.role;
    if (role !== room.owner) return to(conn, { t: 'err', e: 'not-your-turn' });
    if (m.n !== room.n + 1 || room.n >= C.maxAct) return to(conn, { t: 'err', e: 'order', n: room.n });
    const msg = { t: 'act', n: m.n, a: m.a, done: !!m.done, by: role };
    if (JSON.stringify(msg).length > 2000) return to(conn, { t: 'err', e: 'big' });
    room.n = m.n; room.log.push(msg);
    const o = room.p[other(role)]; if (o.conn) to(o.conn, msg);
    room.strikes[role] = 0;                                  // раз ходит — не пропускает
    if (msg.done) room.owner = other(role);
    startTurn(room);                                         // время идёт заново после каждого действия
  };

  const result = (conn, m) => {
    const c = conns.get(conn); const room = c && rooms.get(c.room); if (!room || room.over) return;
    const w = m.winner === 'A' || m.winner === 'B' || m.winner === 'draw' ? m.winner : null; if (!w) return;
    room.results[c.role] = w;
    const A = room.results.A, B = room.results.B;
    if (A && B) return finish(room, A === B ? A : 'draw', A === B ? 'played' : 'desync');
    clearTimer(room.resTimer);
    room.resTimer = setTimer(() => {
      const mine = room.results.A || room.results.B, lone = room.results.A ? 'B' : 'A';
      finish(room, room.p[lone].away || !room.p[lone].conn ? mine : 'draw', room.p[lone].away ? 'played' : 'nores');
    }, C.resultMs);
  };

  // возвращение в комнату после обрыва: клиент говорит, сколько действий уже получил
  const resume = (conn, roomId, have) => {
    const c = conns.get(conn); const room = c && rooms.get(roomId);
    if (!room || room.over) return to(conn, { t: 'gone' });
    const role = room.p.A.pid === c.pid ? 'A' : room.p.B.pid === c.pid ? 'B' : null; if (!role) return to(conn, { t: 'gone' });
    const p = room.p[role]; p.conn = conn; p.away = false; c.room = room.id; c.role = role; clearTimer(room.dropTimer);
    to(conn, { t: 'resumed', room: room.id, role, seed: room.seed, first: room.first, n: room.n, owner: room.owner, turnMs: Math.max(0, room.deadline - now()),
      acts: room.log.filter((x) => x.t === 'act' && x.by !== role && x.n > (have | 0)), strikes: room.strikes, opp: room.p[other(role)].card });
    const o = room.p[other(role)]; if (o.conn) to(o.conn, { t: 'opp-back' });
  };

  const close = (conn) => {
    leaveQueue(conn);
    const c = conns.get(conn); conns.delete(conn); if (!c || !c.room) return;
    const room = rooms.get(c.room); if (!room) return;
    const p = room.p[c.role]; if (p.conn !== conn) return;
    p.conn = null; p.away = true;
    const o = room.p[other(c.role)]; if (o.conn) to(o.conn, { t: 'opp-away', ms: C.awayMs });
    if (!room.over && room.p.A.away && room.p.B.away) { clearTimer(room.dropTimer); room.dropTimer = setTimer(() => drop(room), C.awayMs); }
  };

  // --- турнир: бой назначает сервер, игрокам очередь не нужна ---
  const connOf = (pid) => { for (const [id, c] of conns) if (c.pid === pid) return id; return null; };
  const online = (pid) => { const id = connOf(pid); return id !== null && !byPid.has(pid); };
  const sendPid = (pid, msg) => { const id = connOf(pid); if (id !== null) to(id, msg); };
  // a, b: { pid, card } — карточки только для показа; meta: { send, ...}, уходит в onEnd
  const startTour = (a, b, meta) => {
    const ca = connOf(a.pid), cb = connOf(b.pid); if (ca === null || cb === null || byPid.has(a.pid) || byPid.has(b.pid)) return false;
    leaveQueue(ca); leaveQueue(cb);
    match({ conn: ca, pid: a.pid, card: a.card }, { conn: cb, pid: b.pid, card: b.card }, meta); return true;
  };
  const abortTour = (aPid) => { const r = rooms.get(byPid.get(aPid)); if (r && !r.over) finish(r, 'draw', 'abort'); };

  const message = (conn, m) => {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'queue') return enqueue(conn, m.card);
    if (m.t === 'leave') return leaveQueue(conn);
    if (m.t === 'act') return act(conn, m);
    if (m.t === 'result') return result(conn, m);
    if (m.t === 'resume') return resume(conn, String(m.room || ''), m.have);
    if (m.t === 'forfeit') { const c = conns.get(conn); const room = c && rooms.get(c.room); if (room && !room.over) finish(room, other(c.role), 'forfeit'); }
  };

  return { hello, message, close, tick, online, sendPid, startTour, abortTour, stats: () => ({ queue: queue.length, rooms: rooms.size }) };
};

// Подключение к http-серверу по WebSocket (путь /live). Вход: первое сообщение {t:'hello', token}.
const attach = ({ server, store, now = Date.now, cfg, live: opts = {}, sha }) => {
  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ server, path: '/live', maxPayload: 4096 });
  const socks = new Map(); let seq = 0;
  const core = create({ send: (id, msg) => { const s = socks.get(id); if (s && s.readyState === 1) s.send(JSON.stringify(msg)); }, now, cfg: opts.cfg, onEnd: opts.onEnd, cleanCard: opts.cleanCard });
  const iv = setInterval(() => core.tick(), 1000); iv.unref();
  wss.on('connection', (ws, req) => {
    const id = ++seq; socks.set(id, ws); let ready = false, count = 0, since = now();
    const hold = setTimeout(() => { if (!ready) ws.close(); }, 5000);
    ws.on('message', async (raw) => {
      if (++count > 400 && now() - since < 60000) return ws.close();   // не больше ~400 сообщений в минуту
      if (now() - since >= 60000) { since = now(); count = 0; }
      let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
      if (!ready) {
        if (!m || m.t !== 'hello' || typeof m.token !== 'string' || !/^[0-9a-f]{64}$/.test(m.token)) return ws.close();
        const pid = await store.sessionPid(sha(m.token), now());
        if (!pid) { ws.send(JSON.stringify({ t: 'auth-fail' })); return ws.close(); }
        core.hello(id, pid); ready = true; clearTimeout(hold); ws.send(JSON.stringify({ t: 'hello-ok' })); return;
      }
      if (m && m.t === 'queue') { const c = opts.cleanCard && opts.cleanCard(m.card); if (!c) return ws.send(JSON.stringify({ t: 'err', e: 'card' })); m = { t: 'queue', card: c.out }; }
      core.message(id, m);
    });
    ws.on('close', () => { clearTimeout(hold); socks.delete(id); core.close(id); });
    ws.on('error', () => {});
  });
  return { wss, core, close: () => { clearInterval(iv); wss.close(); } };
};

module.exports = { create, attach, defaults };
