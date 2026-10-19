// Клиент боя в реальном времени (1.9.x): связь с сервером по WebSocket (/live), очередь, ходы, возврат после обрыва.
// Чистый модуль: сокет передаётся снаружи (WS), поэтому проверяется в Node настоящим сервером (tests/live.test.js).
// Игра (game.js) берёт ходы соперника через next(): { act:{k,...} } / { timeout:true, side } / { end:true, winner }.
const Live = (() => {
  const create = ({ url, token, WS, setT = setTimeout, clrT = clearTimeout, retryMs = 1500, retries = 20 }) => {
    let ws = null, room = null, role = null, firstRole = null, waiting = false, queuedCard = null, ended = false, lost = false, nSent = 0, lastRecv = 0, tries = 0, up = false;
    const inbox = [], waiters = [], H = {}, sentLog = [];
    const emit = (t, m) => { if (H[t]) H[t](m); };
    const push = (m) => { if (waiters.length) waiters.shift()(m); else inbox.push(m); };
    const raw = (m) => { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(m)); return true; } catch (e) { /* нет связи */ } } return false; };
    const handleAct = (m) => { if (!(m.n > lastRecv)) return; lastRecv = m.n; if (m.n > nSent) nSent = m.n; push({ act: m.a, n: m.n }); };
    const route = (m) => {
      switch (m.t) {
        case 'hello-ok': up = true; tries = 0; if (room && !ended) raw({ t: 'resume', room, have: lastRecv }); else { emit('ready', m); if (waiting && queuedCard) raw({ t: 'queue', card: queuedCard }); } break;
        case 'auth-fail': ended = true; emit('auth-fail', m); break;
        case 'queued': emit('queued', m); break;
        case 'tour': emit('tour', m); break;
        case 'noopp': waiting = false; emit('noopp', m); break;
        case 'matched': waiting = false; ended = false; lost = false; inbox.length = 0; room = m.room; role = m.role; firstRole = m.first; nSent = 0; lastRecv = 0; sentLog.length = 0; emit('matched', m); break;
        case 'resumed': for (const a of m.acts || []) handleAct(a); for (const x of sentLog) if (x.n > m.n) raw(x); emit('resumed', m); break;
        case 'gone': ended = true; room = null; emit('gone', m); push({ end: true, winner: 'draw', reason: 'gone' }); break;
        case 'act': handleAct(m); break;
        case 'timeout': push({ timeout: true, side: m.side, strikes: m.strikes }); emit('timeout', m); break;
        case 'end': ended = true; emit('end', m); push({ end: true, winner: m.winner, reason: m.reason }); break;
        case 'rating': emit('rating', m); break;
        case 'opp-away': emit('away', m); break;
        case 'opp-back': emit('back', m); break;
        case 'err': emit('err', m); break;
        default: break;
      }
    };
    const open = () => {
      ws = new WS(url);
      ws.onopen = () => raw({ t: 'hello', token });
      ws.onmessage = (ev) => { let m; try { m = JSON.parse(String(ev.data)); } catch (e) { return; } if (m && typeof m === 'object') route(m); };
      ws.onerror = () => {};
      ws.onclose = () => {
        up = false;
        if (ended || lost) return;
        if (!room && !waiting) return;
        if (++tries > retries) { lost = true; emit('lost', {}); push({ end: true, winner: 'draw', reason: 'lost' }); return; }
        setT(open, retryMs);
      };
    };
    return {
      connect: () => { ended = false; lost = false; open(); },
      on: (t, fn) => { H[t] = fn; },
      queue: (card) => { waiting = true; queuedCard = card; return raw({ t: 'queue', card }); },
      leave: () => { waiting = false; return raw({ t: 'leave' }); },
      stay: (on) => { waiting = !!on; },                           // держать связь и после обрыва (турнир: ждём назначения боя)
      act: (a, done = false) => { const m = { t: 'act', n: ++nSent, a, done: !!done }; sentLog.push(m); raw(m); return m.n; },
      result: (winner) => raw({ t: 'result', winner }),
      forfeit: () => raw({ t: 'forfeit' }),
      next: () => new Promise((r) => (inbox.length ? r(inbox.shift()) : waiters.push(r))),
      close: () => { ended = true; clrT && 0; try { if (ws) ws.close(); } catch (e) { /* ничего */ } for (const w of waiters.splice(0)) w({ end: true, winner: 'draw', reason: 'closed' }); },
      get role() { return role; }, get first() { return firstRole; }, get room() { return room; }, get up() { return up; }, get ended() { return ended; },
    };
  };
  return { create };
})();
if (typeof module !== 'undefined') module.exports = Live;
