// Связка турнира с боями в реальном времени: турнир решает «кто с кем», live.js проводит бой и сообщает итог.
const tournament = require('./tournament');

const make = (cfg, opts = {}) => {
  let core = null;
  const trn = tournament.create({
    now: opts.now, setTimer: opts.setTimer, clearTimer: opts.clearTimer,
    cfg: { hours: cfg.tourneyHours && cfg.tourneyHours.length ? cfg.tourneyHours : [17], level: cfg.tourneyLevel || 50, ...(opts.tcfg || {}) },
    hooks: {
      online: (pid) => !!core && core.online(pid),
      notify: (pid, msg) => { if (core) core.sendPid(pid, msg); },
      startMatch: (tv, m) => !!core && core.startTour(
        { pid: m.a.pid, card: { nick: m.a.nick, faction: m.a.faction, gender: m.a.gender } },
        { pid: m.b.pid, card: { nick: m.b.nick, faction: m.b.faction, gender: m.b.gender } },
        { tourney: tv.id, round: tv.round, send: { id: tv.id, round: tv.round, level: tv.level, seed: tv.seed } }),
      abortMatch: (m) => { if (core) core.abortTour(m.a.pid); },
      persist: opts.persist || (() => {}),
      onFinish: opts.onFinish || (() => {}),
    },
  });
  return {
    trn,
    bind: (c) => { core = c; trn.ensureNext(); },
    // итог боя от live.js
    onEnd: (e) => { if (!e || !e.meta || !e.meta.tourney) return; const w = e.winner === 'A' ? e.A : e.winner === 'B' ? e.B : null; trn.matchEnd(e.meta.tourney, e.meta.round, e.A, w, e.reason); },
  };
};
module.exports = { make };
