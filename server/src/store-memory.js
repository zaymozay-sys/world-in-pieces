// Хранилище в памяти: для тестов и для запуска без базы. Тот же интерфейс, что у store-pg.
const create = () => {
  const rating = require('./rating');
  const checks = new Map(), vouchers = [];  let voucherSeq = 0;
  const posts = [], reports = [], hides = new Map(), funnel = new Map(); let postSeq = 0;
  const rats = new Map(), rlog = [], claims = new Set(), tours = new Map(), cards = new Map(), players = new Map(), byExt = new Map(), snaps = new Map(), sessions = new Map(), audit = [];
  return {
    async findOrCreatePlayer(platform, ext, wantPid) {
      const k = platform + ':' + ext;
      if (byExt.has(k)) { const p = players.get(byExt.get(k)); p.lastSeen = Date.now(); return { pid: p.pid, created: false }; }
      let pid = wantPid;
      if (!pid || players.has(pid)) return { pid: null, created: false, taken: !!pid };
      players.set(pid, { pid, platform, ext, created: Date.now(), lastSeen: Date.now() });
      byExt.set(k, pid);
      return { pid, created: true };
    },
    async pidFor(platform, ext) { return byExt.get(platform + ':' + ext) || null; },
    async createSession(hash, pid, expires) { sessions.set(hash, { pid, expires }); },
    async sessionPid(hash, now) { const s = sessions.get(hash); return s && s.expires > now ? s.pid : null; },
    async putSnapshot(pid, version, body, keep) {
      const list = snaps.get(pid) || [];
      const last = list[list.length - 1];
      if (last && version <= last.version) return { ok: false, serverVersion: last.version };
      list.push({ version, body, at: Date.now() });
      while (list.length > keep) list.shift();
      snaps.set(pid, list);
      return { ok: true, serverVersion: version };
    },
    async getSnapshot(pid) { const l = snaps.get(pid); return l && l.length ? l[l.length - 1] : null; },
    // площадка народа
    async cardInfo(pid) { const c = cards.get(pid); if (!c) return null; try { const j = JSON.parse(c.body); return { faction: j.faction || null, nick: j.nick || '' }; } catch (e) { return null; } },
    async addPost(p) { const id = ++postSeq; posts.push({ id, faction: p.faction, pid: p.pid, nick: p.nick, body: p.text, at: p.at }); return id; },
    async listPosts(faction, limit) { return posts.filter((x) => x.faction === faction).sort((a, b) => b.at - a.at || b.id - a.id).slice(0, limit); },
    async deletePost(id, pid) { const i = posts.findIndex((x) => x.id === id && x.pid === pid); if (i < 0) return false; posts.splice(i, 1); return true; },
    async postStats(pid, dayStart) { let last = 0, today = 0, lastText = ''; for (const x of posts) if (x.pid === pid) { if (x.at > last) { last = x.at; lastText = x.body; } if (x.at >= dayStart) today++; } return { last, today, lastText }; },
    // жалобы и скрытие авторов
    async postInfo(id) { const x = posts.find((p) => p.id === id); return x ? { pid: x.pid, faction: x.faction } : null; },
    async addReport(r) { if (reports.some((x) => x.post === r.post && x.reporter === r.reporter)) return false; reports.push({ post: r.post, reporter: r.reporter, author: r.author, at: r.at }); return true; },
    async reportCounts(ids) { const m = new Map(); for (const x of reports) if (ids.includes(x.post)) m.set(x.post, (m.get(x.post) || 0) + 1); return m; },
    async distinctReporters(author, since) { return new Set(reports.filter((x) => x.author === author && x.at >= since).map((x) => x.reporter)).size; },
    async reportsSince(reporter, since) { return reports.filter((x) => x.reporter === reporter && x.at >= since).length; },
    async funnelAdd(day, event) { const k = day + '|' + event; funnel.set(k, (funnel.get(k) || 0) + 1); },
    async funnelDays(since) { const o = {}; for (const [k, n] of funnel) { const [d, e] = k.split('|'); if (d >= since) (o[d] = o[d] || {})[e] = n; } return o; },
    async addHide(pid, author) { if (!hides.has(pid)) hides.set(pid, new Set()); hides.get(pid).add(author); },
    async clearHides(pid) { hides.delete(pid); },
    async hiddenAuthors(pid) { return new Set(hides.get(pid) || []); },
    async putCard(pid, level, body) { cards.set(pid, { level, body, at: Date.now() }); },
    async opponents(pid, level, spread, limit) {
      return [...cards.entries()].filter(([p, c]) => p !== pid && Math.abs(c.level - level) <= spread && players.has(p))
        .sort((a, b) => Math.abs(a[1].level - level) - Math.abs(b[1].level - level) || b[1].at - a[1].at)
        .slice(0, limit).map(([p, c]) => ({ pid: p, level: c.level, body: c.body }));
    },
    // квитанция за бой: paid — положены ли монеты (не больше PAID_DAILY побед в сутки, считаем по дню UTC)
    // показатели профиля при последней отправке + пометка; flagUntil — до какого времени игрок помечен
    async getCheck(pid) { return checks.get(pid) || null; },
    async setCheck(pid, c) { if (players.has(pid)) checks.set(pid, { at: c.at, xp: c.xp, wins: c.wins, floor: c.floor || 0, tx: c.tx == null ? null : c.tx, tw: c.tw == null ? null : c.tw, tf: c.tf == null ? null : c.tf, flagUntil: c.flagUntil || 0, reason: c.reason || '' }); },
    async depthBoard(limit, now) {
      return [...checks.entries()].filter(([p, c]) => (c.tf == null ? c.floor : c.tf) > 0 && c.flagUntil <= now && cards.has(p) && players.has(p)).map(([p, c]) => { let nick = ''; try { nick = JSON.parse(cards.get(p).body).nick || ''; } catch (e) { /* пусто */ } return { pid: p, nick, floor: c.tf == null ? c.floor : c.tf, at: c.at }; })
        .filter((r) => r.nick).sort((a, b) => b.floor - a.floor || a.at - b.at).slice(0, limit);
    },
    async isFlagged(pid, now) { const c = checks.get(pid); return !!c && c.flagUntil > now; },
    async addVoucher(pid, v) {
      if (!players.has(pid)) return null;
      const day = Math.floor(v.at / 86400000);
      const paid = v.win && vouchers.filter((x) => x.pid === pid && x.win && x.paid && Math.floor(x.at / 86400000) === day).length < rating.PAID_DAILY;
      const id = ++voucherSeq; vouchers.push({ id, pid, at: v.at, win: !!v.win, level: v.level, paid, claimed: false });
      return id;
    },
    // отдаёт все непогашенные квитанции и гасит их — повторный вызов вернёт пусто
    async claimVouchers(pid, now) {
      const out = [];
      for (const x of vouchers) if (x.pid === pid && !x.claimed && now - x.at <= rating.VOUCHER_KEEP_MS) { x.claimed = true; out.push({ id: x.id, at: x.at, win: x.win, level: x.level, paid: x.paid }); }
      return out;
    },
    async claimTournament(tid, pid) { const k = tid + '|' + pid; if (claims.has(k)) return false; claims.add(k); return true; },
    // Бой засчитан в рейтинг: меняет Эло обоих, пишет журнал. Один и тот же соперник — не больше PAIR_DAILY раз в сутки.
    async recordMatch(m) {
      const day = m.at - 86400000;
      const seen = rlog.filter((x) => x.pid === m.a.pid && x.opp === m.b.pid && x.at >= day && x.at <= m.at).length;
      if (seen >= rating.PAIR_DAILY) return null;
      const get = (u) => { let r = rats.get(u.pid); if (!r) { r = { pid: u.pid, nick: u.nick, elo: rating.START, wins: 0, losses: 0 }; rats.set(u.pid, r); } r.nick = u.nick; return r; };
      if (!players.has(m.a.pid) || !players.has(m.b.pid)) return null;
      const A = get(m.a), B = get(m.b), aWon = m.winner === 'A', d = rating.change(A.elo, B.elo, aWon);
      A.elo += d.a; B.elo += d.b; if (aWon) { A.wins++; B.losses++; } else { B.wins++; A.losses++; }
      rlog.push({ pid: A.pid, opp: B.pid, at: m.at, delta: d.a, win: aWon }, { pid: B.pid, opp: A.pid, at: m.at, delta: d.b, win: !aWon });
      return { a: { elo: A.elo, delta: d.a }, b: { elo: B.elo, delta: d.b } };
    },
    // period: 'all' — по текущему рейтингу; week | month | year — по сумме изменений за окно
    async leaderboard(period, limit, now) {
      const rows = period === 'all'
        ? [...rats.values()].map((r) => ({ pid: r.pid, nick: r.nick, elo: r.elo, score: r.elo, wins: r.wins, losses: r.losses }))
        : (() => { const since = now - rating.PERIODS[period], by = new Map(); for (const x of rlog) if (x.at >= since) { const o = by.get(x.pid) || { score: 0, wins: 0, losses: 0 }; o.score += x.delta; if (x.win) o.wins++; else o.losses++; by.set(x.pid, o); } return [...by.entries()].map(([pid, o]) => ({ pid, nick: rats.get(pid).nick, elo: rats.get(pid).elo, ...o })); })();
      rows.sort((a, b) => b.score - a.score || b.elo - a.elo || a.nick.localeCompare(b.nick));
      return rows.map((r, i) => ({ ...r, place: i + 1 })).slice(0, limit).concat([]).map((r) => r);
    },
    // очки народов за период [from, to): по текущей фракции игрока из его карточки
    async factionRange(from, to) {
      const by = new Map();
      for (const x of rlog) {
        if (x.at < from || x.at >= to) continue;
        const c = cards.get(x.pid); let f = null; try { f = c ? JSON.parse(c.body).faction : null; } catch (e) { f = null; }
        if (!f) continue;
        const o = by.get(f) || { faction: f, score: 0, games: 0, pids: new Set() }; o.score += x.delta; o.games++; o.pids.add(x.pid); by.set(f, o);
      }
      return [...by.values()].map((o) => ({ faction: o.faction, score: o.score, games: o.games, players: o.pids.size }));
    },
    async factionOf(pid) { const c = cards.get(pid); try { return c ? JSON.parse(c.body).faction || null : null; } catch (e) { return null; } },
    // итоги закрытого периода [from, to): очки = сумма изменений, нужно не меньше MIN_GAMES боёв
    async leaderboardRange(from, to, limit) {
      const by = new Map();
      for (const x of rlog) if (x.at >= from && x.at < to) { const o = by.get(x.pid) || { score: 0, games: 0 }; o.score += x.delta; o.games++; by.set(x.pid, o); }
      return [...by.entries()].filter(([, o]) => o.games >= rating.MIN_GAMES).map(([pid, o]) => ({ pid, nick: rats.get(pid).nick, elo: rats.get(pid).elo, score: o.score, games: o.games }))
        .sort((a, b) => b.score - a.score || b.elo - a.elo || a.nick.localeCompare(b.nick)).slice(0, limit).map((r, i) => ({ ...r, place: i + 1 }));
    },
    async rankOf(pid, period, now) {
      const rows = await this.leaderboard(period, 1e9, now); const me = rows.find((r) => r.pid === pid); return me || null;
    },
    async saveTournament(id, state, startAt, body) { tours.set(id, { id, state, startAt, body, at: Date.now() }); },
    // идущие и открытые турниры + последний завершённый (для показа чемпиона)
    async loadTournaments() {
      const all = [...tours.values()].sort((a, b) => b.startAt - a.startAt);
      const act = all.filter((x) => x.state === 'open' || x.state === 'running'), done = all.find((x) => x.state === 'done');
      return [...act, ...(done ? [done] : [])].map((x) => ({ id: x.id, state: x.state, body: x.body }));
    },
    async deletePlayer(pid) {
      const p = players.get(pid); if (!p) return false;
      for (const t of tours.values()) if (t.body.includes(pid)) t.body = t.body.split(pid).join('del-' + pid.slice(2, 10));   // имя игрока из турниров убираем
      players.delete(pid); checks.delete(pid); for (let i = vouchers.length - 1; i >= 0; i--) if (vouchers[i].pid === pid) vouchers.splice(i, 1); rats.delete(pid); for (let i = rlog.length - 1; i >= 0; i--) if (rlog[i].pid === pid || rlog[i].opp === pid) { if (rlog[i].pid !== pid) rlog[i].opp = 'deleted'; else rlog.splice(i, 1); } for (const k of [...claims]) if (k.endsWith('|' + pid)) claims.delete(k);
      for (let i = posts.length - 1; i >= 0; i--) if (posts[i].pid === pid) posts.splice(i, 1);
      for (let i = reports.length - 1; i >= 0; i--) if (reports[i].reporter === pid || reports[i].author === pid) reports.splice(i, 1);
      hides.delete(pid); for (const s of hides.values()) s.delete(pid);
      cards.delete(pid); byExt.delete(p.platform + ':' + p.ext); snaps.delete(pid);
      for (const [h, s] of sessions) if (s.pid === pid) sessions.delete(h);
      return true;
    },
    async purge(now, auditMaxAgeMs) { let n = 0; for (let i = posts.length - 1; i >= 0; i--) if (now - posts[i].at > 7 * 86400000) { posts.splice(i, 1); n++; } for (let i = reports.length - 1; i >= 0; i--) if (now - reports[i].at > 7 * 86400000) reports.splice(i, 1); for (let i = vouchers.length - 1; i >= 0; i--) if (now - vouchers[i].at > rating.VOUCHER_KEEP_MS) { vouchers.splice(i, 1); n++; } for (let i = rlog.length - 1; i >= 0; i--) if (now - rlog[i].at > 366 * 86400000) { rlog.splice(i, 1); n++; } for (const [k, t] of tours) if (t.state !== 'open' && t.state !== 'running' && now - t.startAt > 60 * 86400000) { tours.delete(k); n++; } for (const [h, s] of sessions) if (s.expires <= now) { sessions.delete(h); n++; } for (let i = audit.length - 1; i >= 0; i--) if (now - audit[i].at > auditMaxAgeMs) { audit.splice(i, 1); n++; } return n; },
    async log(kind, pid, info) { audit.push({ kind, pid, info, at: Date.now() }); },
    _audit: audit, async close() {},
  };
};
module.exports = { create };
