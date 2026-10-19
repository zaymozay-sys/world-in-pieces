// Тесты ядра турнира: запись, сетка и пропуски, раунды, неявка, переигровка, чемпион, следующий турнир (часы поддельные).
const assert = require('assert');
const T = require('../src/tournament');

let now = Date.UTC(2026, 9, 20, 10, 0, 0);          // 20 октября 2026, 10:00 UTC
const timers = [];
const setT = (fn, ms) => { const t = { fn, at: now + ms, off: false }; timers.push(t); return t; };
const clrT = (t) => { if (t) t.off = true; };
const adv = (ms) => { const end = now + ms; for (;;) { const n = timers.filter((x) => !x.off && x.at <= end).sort((a, b) => a.at - b.at)[0]; if (!n) break; now = n.at; n.off = true; n.fn(); } now = end; };

const mk = (over = {}, hk = {}) => {
  timers.length = 0; const online = new Set(); const started = []; const notes = []; const fin = [];
  const t = T.create({ now: () => now, setTimer: setT, clearTimer: clrT, cfg: { hours: [17], leadMs: 600000, ...over }, newSeed: () => 12345,
    hooks: { online: (p) => online.has(p), startMatch: (tv, m, ctx) => { started.push({ a: m.a.pid, b: m.b.pid, round: ctx.round }); return true; }, notify: (p, msg) => notes.push([p, msg]), onFinish: (v) => fin.push(v), ...hk } });
  return { t, online, started, notes, fin };
};
const players = (n) => Array.from({ length: n }, (_, i) => ['p' + i, 'Игрок' + i]);

// ближайший турнир — сегодня в 17:00 UTC; если до него меньше десяти минут — завтра
let X = mk(); const t0 = X.t.ensureNext();
assert.strictEqual(t0.startAt, Date.UTC(2026, 9, 20, 17, 0, 0)); assert.strictEqual(t0.state, 'open');
now = Date.UTC(2026, 9, 20, 16, 55, 0); X = mk(); assert.strictEqual(X.t.ensureNext().startAt, Date.UTC(2026, 9, 21, 17, 0, 0));
now = Date.UTC(2026, 9, 20, 10, 0, 0);

// запись: повторно не дублирует, лимит, выход
X = mk({ maxPlayers: 3 }); X.t.ensureNext();
assert.ok(X.t.join('p0', 'А').ok); assert.ok(X.t.join('p0', 'А').ok); assert.strictEqual(X.t.current().entrants.length, 1);
X.t.join('p1', 'Б'); X.t.join('p2', 'В'); assert.strictEqual(X.t.join('p3', 'Г').e, 'full');
assert.ok(X.t.leave('p2')); assert.ok(X.t.join('p3', 'Г').ok);

// мало участников — отмена, и сразу назначен следующий
X = mk(); X.t.ensureNext(); X.t.join('p0', 'А'); adv(8 * 3600000);
assert.strictEqual(X.fin.length, 1); assert.strictEqual(X.fin[0].state, 'cancelled'); assert.strictEqual(X.t.current().state, 'open');
assert.strictEqual(X.t.current().startAt, Date.UTC(2026, 9, 21, 17, 0, 0));
now = Date.UTC(2026, 9, 20, 10, 0, 0);

// полный турнир на 5: сетка на 8 (одна игра + три пропуска), раундов три, чемпион один
X = mk(); X.t.ensureNext(); for (const [p, n] of players(5)) { X.t.join(p, n); X.online.add(p); }
const tid = X.t.current().id;
adv(7 * 3600000 + 1000);                                   // 17:00 — старт
let v = X.t.view(X.t.current()); assert.strictEqual(v.state, 'running'); assert.strictEqual(v.rounds[0].length, 4);
assert.strictEqual(v.rounds[0].filter((m) => m.why === 'bye').length, 3);
assert.strictEqual(X.started.length, 1);                   // реальный бой в первом раунде один
const finishWith = (a, win, reason) => X.t.matchEnd(tid, X.t.get(tid).round, a, win, reason || 'played');
let guard = 0;
while (X.t.get(tid).state === 'running' && guard++ < 40) {
  const r = X.t.get(tid).rounds[X.t.get(tid).round - 1];
  for (const m of r) if (m.state === 'play') finishWith(m.a.pid, m.a.pid);   // побеждает первый в паре
  adv(40000);
}
const tt = X.t.get(tid); assert.strictEqual(tt.state, 'done'); assert.ok(tt.champion); assert.strictEqual(tt.rounds.length, 3);
assert.strictEqual(X.fin.length, 1); assert.strictEqual(X.fin[0].champion, tt.champion.nick);
assert.strictEqual(X.t.current().state, 'open'); assert.notStrictEqual(X.t.current().id, tid);   // следующий турнир уже назначен
assert.ok(X.notes.some(([p, m]) => m.t === 'tour' && m.tour.state === 'done'));

// неявка: один не онлайн — побеждает пришедший; оба не онлайн — по жребию, турнир идёт дальше
now = Date.UTC(2026, 9, 20, 10, 0, 0);
X = mk({ showMs: 20000 }); X.t.ensureNext(); for (const [p, n] of players(4)) X.t.join(p, n);
X.online.add('p0'); X.online.add('p1'); X.online.add('p2');   // p3 не пришёл
const id2 = X.t.current().id; adv(7 * 3600000 + 1000);
{ // отсчёт для игрока: с кем бой, до какого времени ждём, на связи ли соперник
  const t2 = X.t.get(id2), m3 = t2.rounds[0].find((m) => m.a.pid === 'p3' || m.b.pid === 'p3'), who = m3.a.pid === 'p3' ? m3.b.pid : m3.a.pid;
  const mm = X.t.view(t2, who).me.match;
  assert.ok(mm && mm.state === 'wait' && mm.deadline > now && mm.oppOnline === false && mm.meOnline === true, 'пришедший видит: соперника нет, отсчёт идёт');
  assert.strictEqual(X.t.view(t2, 'p3').me.match.meOnline, false, 'неявившийся видит, что он не на связи');
  assert.strictEqual(X.t.view(t2, 'p3').me.out, 0);
}
const R1 = X.t.get(id2).rounds[0];
adv(30000);
assert.ok(R1.every((m) => m.state === 'done' || m.state === 'play'));
const walk = R1.filter((m) => m.why === 'noshow'); assert.strictEqual(walk.length, 1); assert.ok(walk[0].winner.pid !== 'p3');
now = Date.UTC(2026, 9, 20, 10, 0, 0);
const both = mk({ showMs: 10000 }); both.t.ensureNext(); for (const [p, n] of players(2)) both.t.join(p, n);
const id3 = both.t.current().id; now = Date.UTC(2026, 9, 20, 17, 0, 1); adv(1); adv(20000);
assert.strictEqual(both.t.get(id3).state, 'done'); assert.strictEqual(both.t.get(id3).rounds[0][0].why, 'noshow-both');
now = Date.UTC(2026, 9, 20, 10, 0, 0);

// бой без результата переигрывается, потом решает жребий
X = mk({ replays: 1 }); X.t.ensureNext(); for (const [p, n] of players(2)) { X.t.join(p, n); X.online.add(p); }
const id4 = X.t.current().id; adv(7 * 3600000 + 1000);
assert.strictEqual(X.started.length, 1);
X.t.matchEnd(id4, 1, X.t.get(id4).rounds[0][0].a.pid, null, 'desync'); adv(4000);
assert.strictEqual(X.started.length, 2);                    // переигровка
X.t.matchEnd(id4, 1, X.t.get(id4).rounds[0][0].a.pid, null, 'desync');
assert.strictEqual(X.t.get(id4).state, 'done'); assert.strictEqual(X.t.get(id4).rounds[0][0].why, 'coin');

// чужой/лишний итог ничего не ломает
X.t.matchEnd('нет-такого', 1, 'p0', 'p0', 'played'); X.t.matchEnd(id4, 5, 'p0', 'p0', 'played');

(async () => {
// перезапуск сервера: открытый турнир стартует по расписанию, идущий — продолжается и доигрывается
{
  now = Date.UTC(2026, 9, 20, 10, 0, 0);
  const saved = new Map(); const persist = (id, state, startAt, body) => saved.set(id, { id, state, body });
  const A = mk({}, { persist }); A.t.ensureNext(); for (const [p, n] of players(4)) { A.t.join(p, n, { faction: 'elf', gender: 'm' }); A.online.add(p); }
  // 1) перезапуск до начала
  timers.length = 0;
  let B = mk({}, {}); B.t.restore([...saved.values()]); for (const [p] of players(4)) B.online.add(p);
  assert.strictEqual(B.t.current().state, 'open'); assert.strictEqual(B.t.current().entrants.length, 4); assert.strictEqual(B.t.current().entrants[0].faction, 'elf');
  adv(7 * 3600000 + 1000); assert.strictEqual(B.t.current().state, 'running'); assert.strictEqual(B.started.length, 2);
  // 2) перезапуск посреди раунда: сохраняем то, что успело уйти в хранилище при втором запуске
  const saved2 = new Map(); const persist2 = (id, state, startAt, body) => saved2.set(id, { id, state, body });
  timers.length = 0; B = mk({}, { persist: persist2 }); B.t.restore([...saved.values()]);   // состояние «open» из первого сохранения
  for (const [p] of players(4)) B.online.add(p); adv(7 * 3600000 + 1000);
  const idc = B.t.current().id; const r0 = B.t.get(idc).rounds[0];
  B.t.matchEnd(idc, 1, r0[0].a.pid, r0[0].a.pid, 'played');       // один бой первого раунда уже сыгран, второй идёт
  const snap = [...saved2.values()];
  timers.length = 0; const C = mk({}, {}); C.t.restore(snap); for (const [p] of players(4)) C.online.add(p);
  const cur = C.t.current(); assert.strictEqual(cur.state, 'running'); assert.strictEqual(cur.rounds[0][0].state, 'done'); assert.strictEqual(cur.rounds[0][0].winner.pid, r0[0].a.pid);
  adv(4000); assert.strictEqual(C.started.length, 1);               // незавершённый бой начат заново
  let g2 = 0; while (C.t.get(idc).state === 'running' && g2++ < 20) { for (const m of C.t.get(idc).rounds[C.t.get(idc).round - 1]) if (m.state === 'play') C.t.matchEnd(idc, C.t.get(idc).round, m.a.pid, m.a.pid, 'played'); adv(40000); }
  assert.strictEqual(C.t.get(idc).state, 'done'); assert.ok(C.t.get(idc).champion); assert.strictEqual(C.t.last().champion, C.t.get(idc).champion.nick);
  // хранилище в памяти: запись, чтение, стирание имени при удалении игрока
  const store = require('../src/store-memory').create();
  await store.findOrCreatePlayer('site', 'x', 'p-aaaaaaaa-aaaaaaaa-aaaaaaaa');
  await store.saveTournament('t1', 'running', 5, JSON.stringify({ entrants: [{ pid: 'p-aaaaaaaa-aaaaaaaa-aaaaaaaa' }] }));
  await store.saveTournament('t0', 'done', 1, '{}'); await store.saveTournament('t2', 'cancelled', 2, '{}');
  const ld = await store.loadTournaments(); assert.deepStrictEqual(ld.map((x) => x.id), ['t1', 't0']);
  await store.deletePlayer('p-aaaaaaaa-aaaaaaaa-aaaaaaaa'); assert.ok(!(await store.loadTournaments())[0].body.includes('p-aaaaaaaa'));
}
  console.log('tournament: все тесты пройдены');
})().catch((e) => { console.error(e); process.exit(1); });
