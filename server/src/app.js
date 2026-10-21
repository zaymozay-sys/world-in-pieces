// HTTP-обработчик без фреймворков. create({ cfg, store, now }) -> { handler }.
const crypto = require('crypto');
const path = require('path');
const { externalId } = require('./verify');
const cardcheck = require('./cardcheck');
const rating = require('./rating');
const savecheck = require('./savecheck');
const factionwar = require('./factionwar');
const square = require('./square');
const { standings } = factionwar;

const PID_RE = /^p-[0-9a-z]{8}-[0-9a-z]{8}-[0-9a-z]{8}$/; // формат из js/net.js (Net.validPid)
const FACTIONS = ['human', 'dwarf', 'elf', 'lizard'];
// Боевая карточка: проверяем форму и размер; содержимое вещей — данные клиента, игра при показе очищает их сама.
const cleanCard = (c, maxLevel) => {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const level = c.level;
  if (!Number.isInteger(level) || level < 1 || level > 100) return null;
  if (maxLevel != null && level > maxLevel) return null;               // уровень выше подтверждённого прогресса
  if (!FACTIONS.includes(c.faction) || (c.gender !== 'm' && c.gender !== 'f')) return null;
  const nick = typeof c.nick === 'string' ? c.nick.replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 24) : '';
  if (!nick) return null;
  const gear = c.gear && typeof c.gear === 'object' && !Array.isArray(c.gear) ? c.gear : null;
  if (!gear || Object.keys(gear).length > 20) return null;
  for (const k of Object.keys(gear)) if (gear[k] !== null && (typeof gear[k] !== 'object' || Array.isArray(gear[k]))) return null;
  const chk = cardcheck.check({ level, faction: c.faction, gear });
  if (chk.error) return null;                    // вещи не по правилам игры: карточку не принимаем
  const rank = Number.isInteger(c.rank) && c.rank >= 0 && c.rank <= 20 ? c.rank : 0;
  const out = { v: 1, nick, faction: c.faction, gender: c.gender, level, rank, gear: chk.gear };
  const body = JSON.stringify(out);
  return body.length <= 12000 ? { out, body } : null;
};
const funnel = require('./funnel');
// Наибольший уровень, который сервер подтверждает игроку: по подтверждённому опыту (savecheck.trust), у нового аккаунта — по стартовому.
const trustedLevel = async (store, pid) => {
  const ck = await store.getCheck(pid);
  const xp = ck ? (ck.tx != null ? ck.tx : ck.xp) : 0;
  return require(path.join(__dirname, '..', 'rules', 'hero.js')).levelOf(Math.max(0, Number(xp) || 0)).level;
};
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const limiter = (limit, windowMs, now) => {
  const hits = new Map();
  return (key) => {
    const t = now(), arr = (hits.get(key) || []).filter(x => t - x < windowMs);
    arr.push(t); hits.set(key, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || t - v[v.length - 1] > windowMs) hits.delete(k);
    return arr.length <= limit;
  };
};

const create = ({ cfg, store, now = Date.now, tourney = null }) => {
  const funnelOk = limiter(40, 3600000, now);
  const ipOk = limiter(cfg.rateIp, 60000, now), authOk = limiter(cfg.rateAuth, 60000, now);

  const send = (res, code, obj, origin) => {
    const body = JSON.stringify(obj);
    const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (origin && cfg.allowedOrigins.includes(origin)) {
      h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin';
      h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
      h['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    }
    res.writeHead(code, h); res.end(body);
  };

  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0, big = false; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > cfg.maxBody) big = true; else chunks.push(c); }); // лишнее читаем и выбрасываем, чтобы клиент получил ответ
    req.on('end', () => {
      if (big) return reject(Object.assign(new Error('big'), { code: 413 }));
      if (!chunks.length) return resolve({});
      try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : null); } catch (e) { resolve(null); }
    });
    req.on('error', reject);
  });

  const seen = new Map();
  const authed = async (req) => {
    const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization || '');
    const pid = m ? await store.sessionPid(sha(m[1]), now()) : null;
    if (pid) {
      const cur = seen.get(pid); if (cur) cur.at = now(); else seen.set(pid, { at: now(), ci: null, ciAt: 0 });
      if (seen.size > 2000) for (const [p, v] of seen) if (now() - v.at > 10 * square.ONLINE_MS) seen.delete(p);   // присутствие не копится бесконечно
    }                  // кто недавно был в сети (для площадки народа)
    return pid;
  };

  const handler = async (req, res) => {
    const origin = req.headers.origin;
    try {
      const url = (req.url || '/').split('?')[0];
      let ip = (req.socket && req.socket.remoteAddress) || '?';
      if (cfg.trustProxy) { const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (xf) ip = xf; }   // за прокси: адрес клиента, а не шлюза
      if (req.method === 'OPTIONS') return send(res, 204, {}, origin);
      if (url === '/health') return send(res, 200, { ok: true }, origin);
      if (!ipOk(ip)) return send(res, 429, { error: 'rate' }, origin);

      if (url === '/auth' && req.method === 'POST') {
        if (!authOk(ip)) return send(res, 429, { error: 'rate' }, origin);
        const b = await readBody(req);
        if (!b) return send(res, 400, { error: 'json' }, origin);
        const platform = String(b.platform || '');
        if (!cfg.platforms.includes(platform)) return send(res, 400, { error: 'platform' }, origin);
        const ext = externalId(platform, b, cfg);
        if (!ext) { await store.log('auth-fail', null, platform); return send(res, 401, { error: 'signature' }, origin); }
        const want = typeof b.pid === 'string' && PID_RE.test(b.pid) ? b.pid : null;
        const known = await store.pidFor(platform, ext);
        if (!known && !want) return send(res, 400, { error: 'pid' }, origin);
        const r = await store.findOrCreatePlayer(platform, ext, want);
        if (!r.pid) return send(res, 409, { error: 'pid-taken' }, origin);
        const token = crypto.randomBytes(32).toString('hex');
        await store.createSession(sha(token), r.pid, now() + cfg.sessionDays * 86400000);
        await store.log(r.created ? 'signup' : 'login', r.pid, platform);
        return send(res, 200, { pid: r.pid, token, created: r.created }, origin);
      }

      if (tourney && (url === '/tournament' || url === '/tournament/join' || url === '/tournament/leave' || url === '/tournament/claim')) {
        const pid = await authed(req);
        if (!pid) return send(res, 401, { error: 'auth' }, origin);
        const cur = tourney.ensureNext();
        if (url === '/tournament' && req.method === 'GET') return send(res, 200, { tour: tourney.view(cur, pid), last: tourney.last(pid), now: now() }, origin);
        if (url === '/tournament/join' && req.method === 'POST') {
          const b = await readBody(req); if (!b) return send(res, 400, { error: 'json' }, origin);
          const nick = typeof b.nick === 'string' ? b.nick.replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 24) : '';
          if (!nick || !FACTIONS.includes(b.faction) || (b.gender !== 'm' && b.gender !== 'f')) return send(res, 400, { error: 'body' }, origin);
          const r = tourney.join(pid, nick, { faction: b.faction, gender: b.gender });
          return r.ok ? send(res, 200, { tour: r.tour }, origin) : send(res, 409, { error: r.e }, origin);
        }
        if (url === '/tournament/claim' && req.method === 'POST') {
          // награда выдаётся один раз: сервер сам решает, что положено игроку
          const b = await readBody(req); const t = b && typeof b.id === 'string' ? tourney.get(b.id) : null;
          if (!t || t.state !== 'done') return send(res, 404, { error: 'none' }, origin);
          const v = tourney.view(t, pid);
          if (!v.me && v.championPid !== pid) return send(res, 403, { error: 'not-in' }, origin);
          if (!(await store.claimTournament(t.id, pid))) return send(res, 200, { already: true }, origin);
          await store.log('tourney-claim', pid, t.id);
          return send(res, 200, { view: v }, origin);
        }
        if (url === '/tournament/leave' && req.method === 'POST') return send(res, 200, { left: tourney.leave(pid) }, origin);
      }
      if (url === '/rating' && req.method === 'GET') {
        const pid = await authed(req);
        if (!pid) return send(res, 401, { error: 'auth' }, origin);
        const per = (new URL(req.url, 'http://x').searchParams.get('period')) || 'all';
        if (!['all', 'week', 'month', 'year'].includes(per)) return send(res, 400, { error: 'period' }, origin);
        const list = await store.leaderboard(per, 50, now());
        return send(res, 200, { period: per, list: list.map((r) => ({ place: r.place, nick: r.nick, score: r.score, elo: r.elo, wins: r.wins, losses: r.losses, me: r.pid === pid })), me: await store.rankOf(pid, per, now()).then((r) => r && { place: r.place, score: r.score, elo: r.elo, wins: r.wins, losses: r.losses }) }, origin);
      }
      if (url === '/funnel') {
        if (req.method === 'POST') {
          if (!funnelOk(ip)) return send(res, 429, { error: 'rate' }, origin);
          const b = await readBody(req);
          if (!b || typeof b.e !== 'string' || !funnel.EVENTS.includes(b.e)) return send(res, 400, { error: 'event' }, origin);
          await store.funnelAdd(funnel.dayOf(now()), b.e);
          return send(res, 200, { ok: true }, origin);
        }
        if (req.method === 'GET') {
          const key = String(new URL(req.url, 'http://x').searchParams.get('key') || '');
          const ok = cfg.statsKey && key.length === cfg.statsKey.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(cfg.statsKey));
          if (!ok) return send(res, 404, { error: 'none' }, origin);
          return send(res, 200, { days: await store.funnelDays(funnel.dayOf(now() - funnel.DAYS * 86400000)) }, origin);
        }
      }
      if (url === '/depth' && req.method === 'GET') {
        const pid = await authed(req);
        if (!pid) return send(res, 401, { error: 'auth' }, origin);
        const list = await store.depthBoard(50, now());
        return send(res, 200, { list: list.map((r, i) => ({ place: i + 1, nick: r.nick, floor: r.floor, me: r.pid === pid })) }, origin);
      }
      if (url === '/rewards/claim' && req.method === 'POST') {
        const pid = await authed(req);
        if (!pid) return send(res, 401, { error: 'auth' }, origin);
        // квитанции за подтверждённые живые бои: забираются один раз, сервер же решает, положены ли монеты
        return send(res, 200, { list: await store.claimVouchers(pid, now()) }, origin);
      }
      if (url.startsWith('/rating/season/board') && req.method === 'GET') {
        const pid = await authed(req);
        if (!pid) return send(res, 401, { error: 'auth' }, origin);
        const kind = new URL(req.url, 'http://x').searchParams.get('kind');
        if (kind !== 'week' && kind !== 'month') return send(res, 400, { error: 'kind' }, origin);
        // текущий календарный сезон (очки обнуляются в начале недели / месяца) и тройка прошлого
        const cur = rating.periodAt(kind, now()), prv = rating.previous(kind, now());
        const all = await store.leaderboardRange(cur.start, cur.end, 1e9), prevTop = await store.leaderboardRange(prv.start, prv.end, rating.TOP);
        const me = all.find((r) => r.pid === pid);
        return send(res, 200, {
          kind, id: cur.id, start: cur.start, end: cur.end, now: now(), minGames: rating.MIN_GAMES,
          list: all.slice(0, 20).map((r) => ({ place: r.place, nick: r.nick, score: r.score, games: r.games, me: r.pid === pid })),
          me: me ? { place: me.place, score: me.score, games: me.games } : null,
          prev: { id: prv.id, top: prevTop.map((r) => ({ place: r.place, nick: r.nick, score: r.score, me: r.pid === pid })) },
        }, origin);
      }
      if (url === '/square' || url === '/square/post' || url === '/square/delete' || url === '/square/report' || url === '/square/hide' || url === '/square/unhide') {
        const pid = await authed(req);
        if (!pid) return send(res, 401, { error: 'auth' }, origin);
        const info = await store.cardInfo(pid);
        if (!info || !FACTIONS.includes(info.faction)) return send(res, 409, { error: 'no-card' }, origin);
        const t = now();
        if (url === '/square' && req.method === 'GET') {
          const hid = await store.hiddenAuthors(pid), raw = await store.listPosts(info.faction, square.SHOW + 20), cnt = await store.reportCounts(raw.map((x) => x.id));
          const posts = raw.filter((x) => x.pid === pid || (!hid.has(x.pid) && (cnt.get(x.id) || 0) < square.HIDE_AT)).slice(0, square.SHOW);
          const online = [];
          for (const [p, at] of seen) {
            if (t - at.at > square.ONLINE_MS) { if (t - at.at > 10 * square.ONLINE_MS) seen.delete(p); continue; }
            if (online.length >= 30) break;
            // народ и ник запоминаем в записи присутствия: запрос в базу — не чаще раза в 10 минут на игрока
            let ci = p === pid ? info : (at.ci && t - at.ciAt < 10 * 60000 ? at.ci : null);
            if (!ci) { ci = await store.cardInfo(p); const cur = seen.get(p); if (cur) { cur.ci = ci || { faction: null, nick: '' }; cur.ciAt = t; } }
            if (ci && ci.faction === info.faction && ci.nick) online.push(ci.nick);
          }
          return send(res, 200, { faction: info.faction, online, posts: posts.map((x) => ({ id: x.id, nick: x.nick, text: x.body, at: x.at, mine: x.pid === pid })), now: t, max: square.MAX_LEN, hidden: hid.size }, origin);
        }
        if (url === '/square/post' && req.method === 'POST') {
          const b = await readBody(req); if (!b) return send(res, 400, { error: 'json' }, origin);
          if (await store.isFlagged(pid, t)) return send(res, 403, { error: 'flagged' }, origin);
          if ((await store.distinctReporters(pid, t - square.MUTE_MS)) >= square.HIDE_AT) return send(res, 403, { error: 'muted' }, origin);
          const c = square.clean(b.text); if (c.e) return send(res, 400, { error: c.e }, origin);
          const day0 = Math.floor(t / 86400000) * 86400000, ps = await store.postStats(pid, day0);
          const why = square.allowed(ps.last, ps.today, t); if (why) return send(res, 429, { error: why }, origin);
          if (ps.lastText === c.text) return send(res, 409, { error: 'dup' }, origin);
          const id = await store.addPost({ faction: info.faction, pid, nick: info.nick, text: c.text, at: t });
          return send(res, 200, { id }, origin);
        }
        if ((url === '/square/report' || url === '/square/hide') && req.method === 'POST') {
          const b = await readBody(req); const id = b && Number.isSafeInteger(b.id) ? b.id : 0;
          const pi = id > 0 ? await store.postInfo(id) : null;
          if (!pi || pi.faction !== info.faction || pi.pid === pid) return send(res, 404, { error: 'none' }, origin);
          if (url === '/square/hide') { await store.addHide(pid, pi.pid); return send(res, 200, { ok: true }, origin); }
          if ((await store.reportsSince(pid, Math.floor(t / 86400000) * 86400000)) >= square.REPORTS_DAILY) return send(res, 429, { error: 'daily' }, origin);
          const fresh = await store.addReport({ post: id, reporter: pid, author: pi.pid, at: t });
          if (fresh) await store.log('square-report', pid, String(id));
          return send(res, 200, { ok: true, already: !fresh }, origin);
        }
        if (url === '/square/unhide' && req.method === 'POST') { await store.clearHides(pid); return send(res, 200, { ok: true }, origin); }
        if (url === '/square/delete' && req.method === 'POST') {
          const b = await readBody(req); const id = b && Number.isSafeInteger(b.id) ? b.id : 0;
          return send(res, 200, { deleted: id > 0 && (await store.deletePost(id, pid)) }, origin);
        }
      }
      if (url === '/factions' || url === '/factions/claim') {
        const pid = await authed(req);
        if (!pid) return send(res, 401, { error: 'auth' }, origin);
        const cur = rating.periodAt('week', now()), prv = rating.previous('week', now());
        const mineFaction = await store.factionOf(pid);
        const prevResult = standings(await store.factionRange(prv.start, prv.end));
        // награда положена игроку победившего народа, сыгравшему на прошлой неделе от MIN_GAMES боёв
        const eligible = async () => {
          if (!prevResult.winner || prevResult.winner !== mineFaction) return false;
          return (await store.leaderboardRange(prv.start, prv.end, 1e9)).some((r) => r.pid === pid);
        };
        if (url === '/factions' && req.method === 'GET') {
          const now0 = standings(await store.factionRange(cur.start, cur.end));
          return send(res, 200, { id: cur.id, start: cur.start, end: cur.end, now: now(), list: now0.list, me: mineFaction, minPlayers: factionwar.MIN_PLAYERS, minGames: rating.MIN_GAMES,
            prev: { id: prv.id, winner: prevResult.winner, list: prevResult.list, eligible: await eligible() } }, origin);
        }
        if (url === '/factions/claim' && req.method === 'POST') {
          const b = await readBody(req);
          if (!b || b.id !== prv.id || !(await eligible())) return send(res, 404, { error: 'none' }, origin);
          if (!(await store.claimTournament('faction:' + prv.id, pid))) return send(res, 200, { already: true }, origin);
          await store.log('faction-claim', pid, prv.id);
          return send(res, 200, { reward: { id: prv.id, faction: prevResult.winner } }, origin);
        }
      }
      if (url === '/rating/season' || url === '/rating/season/claim') {
        const pid = await authed(req);
        if (!pid) return send(res, 401, { error: 'auth' }, origin);
        // награды сезона: тройка лучших за прошлую неделю и прошлый месяц; каждую награду можно взять один раз
        const mine = async () => {
          const out = [];
          for (const kind of ['week', 'month']) {
            const p = rating.previous(kind, now()), top = await store.leaderboardRange(p.start, p.end, rating.TOP), me = top.find((r) => r.pid === pid);
            if (me) out.push({ id: p.id, kind, place: me.place, score: me.score });
          }
          return out;
        };
        if (url === '/rating/season' && req.method === 'GET') return send(res, 200, { list: await mine(), now: now() }, origin);
        if (url === '/rating/season/claim' && req.method === 'POST') {
          const b = await readBody(req); const it = b && typeof b.id === 'string' ? (await mine()).find((x) => x.id === b.id) : null;
          if (!it) return send(res, 404, { error: 'none' }, origin);
          if (!(await store.claimTournament('season:' + it.id, pid))) return send(res, 200, { already: true }, origin);
          await store.log('season-claim', pid, it.id);
          return send(res, 200, { reward: it }, origin);
        }
      }
      if (url === '/card' || url === '/opponents' || url === '/snapshot' || url === '/me') {
        const pid = await authed(req);
        if (!pid) return send(res, 401, { error: 'auth' }, origin);
        if (url === '/snapshot' && req.method === 'GET') {
          const s = await store.getSnapshot(pid);
          return s ? send(res, 200, { version: s.version, snapshot: s.body }, origin) : send(res, 404, { error: 'none' }, origin);
        }
        if (url === '/snapshot' && req.method === 'PUT') {
          const b = await readBody(req);
          if (!b || typeof b.snapshot !== 'string' || !Number.isSafeInteger(b.version) || b.version < 1) return send(res, 400, { error: 'body' }, origin);
          let parsed; try { parsed = JSON.parse(b.snapshot); } catch (e) { parsed = null; }
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return send(res, 400, { error: 'snapshot' }, origin);
          const r = await store.putSnapshot(pid, b.version, b.snapshot, cfg.keepSnapshots);
          if (r.ok) {
            // правдоподобие: сохранение принято в любом случае, но резкий скачок опыта/побед помечает игрока
            try {
              const prev = await store.getCheck(pid), t = now(), c = savecheck.check(parsed, prev, t);
              const keepFlag = prev && prev.flagUntil > t ? prev : null;
              const flagUntil = c.reason ? t + savecheck.FLAG_MS : (keepFlag ? keepFlag.flagUntil : 0), reason = c.reason || (keepFlag ? keepFlag.reason : '');
              await store.setCheck(pid, { at: t, xp: c.m.xp == null ? (prev ? prev.xp : 0) : c.m.xp, wins: c.m.wins == null ? (prev ? prev.wins : 0) : c.m.wins, floor: c.m.floor == null ? (prev ? prev.floor || 0 : 0) : c.m.floor, tx: c.trusted.xp, tw: c.trusted.wins, tf: c.trusted.floor, flagUntil, reason });
              if (c.reason) await store.log('save-flag', pid, c.reason);
            } catch (e) { /* проверка не должна ломать сохранение */ }
          }
          return r.ok ? send(res, 200, { version: r.serverVersion }, origin) : send(res, 409, { error: 'old-version', serverVersion: r.serverVersion }, origin);
        }
        if (url === '/card' && req.method === 'PUT') {
          const b = await readBody(req);
          const c = b ? cleanCard(b.card, await trustedLevel(store, pid)) : null;
          if (!c) return send(res, 400, { error: 'card' }, origin);
          await store.putCard(pid, c.out.level, c.body);
          return send(res, 200, { ok: true }, origin);
        }
        if (url === '/opponents' && req.method === 'GET') {
          const q = new URLSearchParams((req.url.split('?')[1]) || '');
          const level = Number(q.get('level'));
          if (!Number.isInteger(level) || level < 1 || level > 100) return send(res, 400, { error: 'level' }, origin);
          const list = await store.opponents(pid, level, cfg.arenaSpread, 5);
          return send(res, 200, { list: list.map((x) => { let card = null; try { card = JSON.parse(x.body); } catch (e) { /* пропустим */ } return card ? { id: x.pid, card } : null; }).filter(Boolean) }, origin);
        }
        if (url === '/me' && req.method === 'DELETE') {
          await store.deletePlayer(pid);
          await store.log('delete', pid, null);
          return send(res, 200, { deleted: true }, origin);
        }
      }
      return send(res, 404, { error: 'not-found' }, origin);
    } catch (e) {
      if (e && e.code === 413) return send(res, 413, { error: 'too-big' }, origin);
      return send(res, 500, { error: 'server' }, origin);
    }
  };
  return { handler };
};
module.exports = { create, PID_RE, cleanCard, trustedLevel, sha };
