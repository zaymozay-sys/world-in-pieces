// Турнир на вылет (до 16 участников) в реальном времени. Ядро не знает про сеть: бои, связь и время — через hooks/часы.
// Жизнь турнира: open (запись) → running (раунды) → done / cancelled. Сетка — по зерну турнира, лишние места — «пропуски» (bye).
const defaults = () => ({
  hours: [17],            // во сколько часов UTC начинается турнир каждый день (17 UTC = 20:00 по Москве)
  minPlayers: 2,
  maxPlayers: 16,
  leadMs: 10 * 60000,     // ближайший турнир не раньше, чем через столько
  showMs: 120000,         // сколько ждём явки обоих игроков на бой (на возврат после обрыва связи)
  gapMs: 30000,           // пауза между раундами
  replays: 2,             // сколько раз переигрываем бой, который закончился без результата (ничья/расхождение)
  matchMaxMs: 15 * 60000, // бой дольше этого принудительно завершается
  level: 50,              // уровень героя для всех участников
  coins: [0, 0, 0, 0],    // дополняется клиентом: награды считает игра
});

const rngOf = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

const create = ({ now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, cfg = {}, hooks = {}, newSeed = () => (Math.random() * 4294967295) >>> 0 }) => {
  const C = { ...defaults(), ...cfg };
  const H = { persist: () => {}, online: () => false, startMatch: () => false, abortMatch: () => {}, notify: () => {}, onFinish: () => {}, ...hooks };
  const all = new Map();      // id -> турнир
  let current = null;         // открытый или идущий
  let lastDone = null;        // вид последнего завершённого турнира (чемпион)
  const timers = new Map();   // id -> список таймеров

  let lastStart = 0;          // начало прошлого турнира: новый назначаем строго позже
  const nextSlot = (t0) => {
    const from = Math.max(t0 + C.leadMs, lastStart + 1);
    const base = new Date(from); let best = Infinity;
    for (let d = 0; d < 3; d++) for (const h of C.hours) {
      const x = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + d, h, 0, 0);
      if (x >= from && x < best) best = x;
    }
    return best;
  };
  const later = (t, ms, fn) => { const h = setTimer(fn, Math.max(0, ms)); (timers.get(t.id) || timers.set(t.id, []).get(t.id)).push(h); return h; };
  const clearAll = (t) => { for (const h of timers.get(t.id) || []) clearTimer(h); timers.delete(t.id); };

  // мой ближайший бой: с кем, ждём ли явки, до какого времени и на связи ли соперник (для отсчёта в игре)
  const myMatch = (t, pid) => {
    if (!pid || t.state !== 'running') return null;
    const r = t.rounds[t.round - 1]; if (!r) return null;
    const m = r.find((x) => x.a && x.b && (x.a.pid === pid || x.b.pid === pid) && (x.state === 'wait' || x.state === 'play'));
    if (!m) return null;
    const opp = m.a.pid === pid ? m.b : m.a;
    return { state: m.state, deadline: m.state === 'wait' ? m.deadline : 0, opp: opp.nick, oppOnline: !!H.online(opp.pid), meOnline: !!H.online(pid) };
  };
  const view = (t, pid) => ({
    id: t.id, state: t.state, startAt: t.startAt, level: t.level, seed: t.seed, round: t.round, size: t.entrants.length,
    entrants: t.entrants.map((e) => ({ nick: e.nick, out: e.out || 0 })), joined: !!pid && t.entrants.some((e) => e.pid === pid),
    rounds: t.rounds.map((r) => r.map((m) => ({ a: m.a ? m.a.nick : null, b: m.b ? m.b.nick : null, w: m.winner ? m.winner.nick : null, s: m.state, why: m.why || '' }))),
    champion: t.champion ? t.champion.nick : null, championPid: t.champion ? t.champion.pid : null, me: pid ? (t.entrants.find((e) => e.pid === pid) || null) && { out: (t.entrants.find((e) => e.pid === pid)).out || 0, match: myMatch(t, pid) } : null,
  });
  // состояние целиком в обычном виде (связи между участниками и боями — по номерам игроков)
  const snapshot = (t) => JSON.stringify({
    id: t.id, seed: t.seed, level: t.level, startAt: t.startAt, state: t.state, round: t.round, champion: t.champion ? t.champion.pid : null,
    entrants: t.entrants.map((e) => ({ ...e })),
    rounds: t.rounds.map((r) => r.map((m) => ({ a: m.a ? m.a.pid : null, b: m.b ? m.b.pid : null, winner: m.winner ? m.winner.pid : null, state: m.state, why: m.why || '', replays: m.replays || 0, deadline: m.deadline || 0 }))),
  });
  const save = (t) => { try { const r = H.persist(t.id, t.state, t.startAt, snapshot(t)); if (r && r.catch) r.catch(() => {}); } catch (e) { /* хранилище недоступно — турнир идёт в памяти */ } };
  const tell = (t) => { save(t); for (const e of t.entrants) H.notify(e.pid, { t: 'tour', tour: view(t, e.pid) }); };

  const ensureNext = () => {
    if (current && (current.state === 'open' || current.state === 'running')) return current;
    const startAt = nextSlot(now());
    const t = { id: 't-' + startAt, seed: newSeed() || 1, level: C.level, startAt, state: 'open', entrants: [], rounds: [], round: 0, champion: null };
    all.set(t.id, t); current = t; lastStart = startAt;
    later(t, startAt - now(), () => begin(t));
    return t;
  };

  const finish = (t, state) => { t.state = state; clearAll(t); tell(t); if (state === 'done') lastDone = t; H.onFinish(view(t)); if (current === t) { current = null; ensureNext(); } };

  const begin = (t) => {
    if (t.state !== 'open') return;
    if (t.entrants.length < C.minPlayers) return finish(t, 'cancelled');
    const rnd = rngOf(t.seed), list = t.entrants.slice();
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    let size = 1; while (size < list.length) size *= 2;
    const slots = Array(size).fill(null); const half = size / 2;
    // пропуски раздаём по одному на пару, чтобы не было боёв «пропуск–пропуск»
    let li = 0; for (let i = 0; i < size; i += 2) { slots[i] = list[li++] || null; }
    for (let i = 1; i < size && li < list.length; i += 2) slots[i] = list[li++];
    const r1 = []; for (let i = 0; i < size; i += 2) r1.push({ a: slots[i], b: slots[i + 1], winner: null, state: 'new', replays: 0 });
    t.rounds = [r1]; t.state = 'running'; t.round = 1;
    startRound(t);
  };

  const done = (t, m, winner, why) => {
    if (m.state === 'done') return;
    m.state = 'done'; m.winner = winner; m.why = why || 'played';
    const loser = winner === m.a ? m.b : m.a; if (loser) loser.out = t.round;
    checkRound(t);
  };

  const checkRound = (t) => {
    const r = t.rounds[t.round - 1];
    if (!r.every((m) => m.state === 'done')) return tell(t);
    if (r.length === 1) { t.champion = r[0].winner; if (t.champion) t.champion.out = 0; return finish(t, 'done'); }
    tell(t);
    later(t, C.gapMs, () => {
      const next = []; for (let i = 0; i < r.length; i += 2) next.push({ a: r[i].winner, b: r[i + 1].winner, winner: null, state: 'new', replays: 0 });
      t.rounds.push(next); t.round++; startRound(t);
    });
  };

  const coin = (t, m) => (rngOf((t.seed ^ (t.round * 7919) ^ m.a.pid.length) >>> 0)() < 0.5 ? m.a : m.b);

  const tryStart = (t, m) => {
    if (m.state !== 'wait') return false;
    if (!H.online(m.a.pid) || !H.online(m.b.pid)) return false;
    if (H.startMatch(view(t), m, { a: m.a, b: m.b, tourney: t.id, round: t.round })) { m.state = 'play'; m.startedAt = now(); later(t, C.matchMaxMs, () => { if (m.state === 'play') { H.abortMatch(m); } }); tell(t); return true; }
    return false;
  };

  // ждём явки обоих: пробуем начать бой каждые 3 с; время вышло — техническое поражение неявившегося
  const pollOne = (t, m) => {
    if (t.state !== 'running' || m.state !== 'wait') return;
    if (tryStart(t, m)) return;
    if (now() >= m.deadline) {
      const ao = H.online(m.a.pid), bo = H.online(m.b.pid);
      if (ao && !bo) return done(t, m, m.a, 'noshow'); if (bo && !ao) return done(t, m, m.b, 'noshow');
      return done(t, m, coin(t, m), 'noshow-both');
    }
    later(t, 3000, () => pollOne(t, m));
  };

  const startRound = (t) => {
    const r = t.rounds[t.round - 1];
    for (const m of r) {
      if (!m.a || !m.b) { m.state = 'wait'; done(t, m, m.a || m.b, 'bye'); continue; }
      m.state = 'wait'; m.deadline = now() + C.showMs;
    }
    tell(t);
    for (const m of r) if (m.state === 'wait') pollOne(t, m);
  };

  // итог живого боя (от live.js): pid победителя или null — без результата
  const matchEnd = (tid, round, aPid, winnerPid, reason) => {
    const t = all.get(tid); if (!t || t.state !== 'running' || t.round !== round) return;
    const m = t.rounds[round - 1].find((x) => x.a && x.b && x.a.pid === aPid); if (!m || m.state !== 'play') return;
    if (winnerPid === m.a.pid) return done(t, m, m.a, reason);
    if (winnerPid === m.b.pid) return done(t, m, m.b, reason);
    if (m.replays < C.replays) { m.replays++; m.state = 'wait'; m.deadline = now() + C.showMs; tell(t); later(t, 3000, () => pollOne(t, m)); return; }
    done(t, m, coin(t, m), 'coin');
  };

  // восстановление после перезапуска: список { state, body } из хранилища (идущие/открытые и последний завершённый)
  const restore = (list) => {
    for (const row of list || []) {
      let d; try { d = JSON.parse(row.body); } catch (e) { continue; }
      if (!d || !d.id || all.has(d.id)) continue;
      const by = new Map(d.entrants.map((e) => [e.pid, e])); const P = (pid) => (pid ? by.get(pid) || null : null);
      const t = { id: d.id, seed: d.seed, level: d.level, startAt: d.startAt, state: d.state, round: d.round, entrants: d.entrants, champion: P(d.champion),
        rounds: d.rounds.map((r) => r.map((m) => ({ a: P(m.a), b: P(m.b), winner: P(m.winner), state: m.state, why: m.why, replays: m.replays, deadline: m.deadline }))) };
      all.set(t.id, t);
      if (t.startAt > lastStart) lastStart = t.startAt;
      if (t.state === 'done') { if (!lastDone || t.startAt > lastDone.startAt) lastDone = t; continue; }
      if (t.state !== 'open' && t.state !== 'running') continue;
      if (current && current.startAt > t.startAt) continue;
      current = t;
      if (t.state === 'open') later(t, t.startAt - now(), () => begin(t));
      else {
        const r = t.rounds[t.round - 1] || [];
        for (const m of r) if (m.state === 'play' || m.state === 'wait') { m.state = 'wait'; m.deadline = now() + C.showMs; }   // бои, шедшие на момент перезапуска, начинаем заново
        if (r.length && r.every((m) => m.state === 'done')) checkRound(t); else for (const m of r) if (m.state === 'wait') pollOne(t, m);
      }
    }
    return current;
  };

  const join = (pid, nick, extra = {}) => {
    const t = current; if (!t || t.state !== 'open') return { ok: false, e: 'closed' };
    if (t.entrants.some((e) => e.pid === pid)) return { ok: true, tour: view(t, pid) };
    if (t.entrants.length >= C.maxPlayers) return { ok: false, e: 'full' };
    t.entrants.push({ ...extra, pid, nick, out: 0 }); tell(t);
    return { ok: true, tour: view(t, pid) };
  };
  const leave = (pid) => { const t = current; if (!t || t.state !== 'open') return false; const i = t.entrants.findIndex((e) => e.pid === pid); if (i < 0) return false; t.entrants.splice(i, 1); return true; };

  return { restore, last: (pid) => (lastDone ? view(lastDone, pid) : null), ensureNext, join, leave, matchEnd, view, current: () => current, get: (id) => all.get(id), C, begin };
};

module.exports = { create, defaults, rngOf };
