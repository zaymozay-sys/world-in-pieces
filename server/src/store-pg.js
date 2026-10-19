// Хранилище в PostgreSQL. Библиотека pg подключается только здесь.
const fs = require('fs'), path = require('path');
const rating = require('./rating');
const create = async (databaseUrl) => {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  const dir = path.join(__dirname, '..', 'migrations');   // миграции по порядку имён: 001, 002…
  for (const f of fs.readdirSync(dir).filter((n) => /\.sql$/.test(n)).sort()) await pool.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  const q = (t, p) => pool.query(t, p);
  return {
    async findOrCreatePlayer(platform, ext, wantPid) {
      const ex = await q('UPDATE players SET last_seen=now() WHERE platform=$1 AND ext_id=$2 RETURNING pid', [platform, ext]);
      if (ex.rows[0]) return { pid: ex.rows[0].pid, created: false };
      if (!wantPid) return { pid: null, created: false, taken: false };
      const r = await q('INSERT INTO players(pid,platform,ext_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING pid', [wantPid, platform, ext]);
      if (r.rows[0]) return { pid: wantPid, created: true };
      const again = await q('SELECT pid FROM players WHERE platform=$1 AND ext_id=$2', [platform, ext]);
      if (again.rows[0]) return { pid: again.rows[0].pid, created: false };
      return { pid: null, created: false, taken: true };
    },
    async pidFor(platform, ext) { const r = await q('SELECT pid FROM players WHERE platform=$1 AND ext_id=$2', [platform, ext]); return r.rows[0] ? r.rows[0].pid : null; },
    async createSession(hash, pid, expires) { await q('INSERT INTO sessions(token_hash,pid,expires_at) VALUES($1,$2,to_timestamp($3/1000.0))', [hash, pid, expires]); },
    async sessionPid(hash, now) { const r = await q('SELECT pid FROM sessions WHERE token_hash=$1 AND expires_at>to_timestamp($2/1000.0)', [hash, now]); return r.rows[0] ? r.rows[0].pid : null; },
    async putSnapshot(pid, version, body, keep) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT pid FROM players WHERE pid=$1 FOR UPDATE', [pid]);
        const m = await c.query('SELECT max(version) AS v FROM snapshots WHERE pid=$1', [pid]);
        const cur = m.rows[0].v != null ? Number(m.rows[0].v) : null;
        if (cur != null && version <= cur) { await c.query('ROLLBACK'); return { ok: false, serverVersion: cur }; }
        await c.query('INSERT INTO snapshots(pid,version,body) VALUES($1,$2,$3)', [pid, version, body]);
        await c.query('DELETE FROM snapshots WHERE pid=$1 AND version NOT IN (SELECT version FROM snapshots WHERE pid=$1 ORDER BY version DESC LIMIT $2)', [pid, keep]);
        await c.query('COMMIT');
        return { ok: true, serverVersion: version };
      } catch (e) { try { await c.query('ROLLBACK'); } catch (_) {} throw e; } finally { c.release(); }
    },
    async getSnapshot(pid) { const r = await q('SELECT version, body FROM snapshots WHERE pid=$1 ORDER BY version DESC LIMIT 1', [pid]); return r.rows[0] ? { version: Number(r.rows[0].version), body: r.rows[0].body } : null; },
    async cardInfo(pid) { const r = await q("SELECT body FROM cards WHERE pid=$1", [pid]); if (!r.rows[0]) return null; try { const j = JSON.parse(r.rows[0].body); return { faction: j.faction || null, nick: j.nick || '' }; } catch (e) { return null; } },
    async addPost(p) { const r = await q('INSERT INTO square_posts(faction,pid,nick,body,at) VALUES($1,$2,$3,$4,$5) RETURNING id', [p.faction, p.pid, p.nick, p.text, p.at]); return Number(r.rows[0].id); },
    async listPosts(faction, limit) { const r = await q('SELECT id, pid, nick, body, at FROM square_posts WHERE faction=$1 ORDER BY at DESC, id DESC LIMIT $2', [faction, limit]); return r.rows.map((x) => ({ id: Number(x.id), pid: x.pid, nick: x.nick, body: x.body, at: Number(x.at) })); },
    async deletePost(id, pid) { const r = await q('DELETE FROM square_posts WHERE id=$1 AND pid=$2', [id, pid]); return r.rowCount > 0; },
    async postStats(pid, dayStart) { const r = await q('SELECT max(at) AS last, count(*) FILTER (WHERE at >= $2)::int AS today FROM square_posts WHERE pid=$1', [pid, dayStart]); const l = await q('SELECT body FROM square_posts WHERE pid=$1 ORDER BY at DESC, id DESC LIMIT 1', [pid]); return { last: Number(r.rows[0].last || 0), today: r.rows[0].today || 0, lastText: l.rows[0] ? l.rows[0].body : '' }; },
    async postInfo(id) { const r = await q('SELECT pid, faction FROM square_posts WHERE id=$1', [id]); return r.rows[0] ? { pid: r.rows[0].pid, faction: r.rows[0].faction } : null; },
    async addReport(r) { const x = await q('INSERT INTO square_reports(post_id,reporter,author,at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [r.post, r.reporter, r.author, r.at]); return x.rowCount > 0; },
    async reportCounts(ids) { const m = new Map(); if (!ids.length) return m; const r = await q('SELECT post_id, count(*)::int AS n FROM square_reports WHERE post_id = ANY($1::bigint[]) GROUP BY post_id', [ids]); for (const x of r.rows) m.set(Number(x.post_id), x.n); return m; },
    async distinctReporters(author, since) { const r = await q('SELECT count(DISTINCT reporter)::int AS n FROM square_reports WHERE author=$1 AND at >= $2', [author, since]); return r.rows[0].n; },
    async reportsSince(reporter, since) { const r = await q('SELECT count(*)::int AS n FROM square_reports WHERE reporter=$1 AND at >= $2', [reporter, since]); return r.rows[0].n; },
    async addHide(pid, author) { await q('INSERT INTO square_hides(pid,author) VALUES($1,$2) ON CONFLICT DO NOTHING', [pid, author]); },
    async clearHides(pid) { await q('DELETE FROM square_hides WHERE pid=$1', [pid]); },
    async hiddenAuthors(pid) { const r = await q('SELECT author FROM square_hides WHERE pid=$1', [pid]); return new Set(r.rows.map((x) => x.author)); },
    async putCard(pid, level, body) { await q('INSERT INTO cards(pid,level,body) VALUES($1,$2,$3) ON CONFLICT (pid) DO UPDATE SET level=$2, body=$3, updated_at=now()', [pid, level, body]); },
    async opponents(pid, level, spread, limit) {
      const r = await q('SELECT pid, level, body FROM cards WHERE pid<>$1 AND level BETWEEN $2 AND $3 ORDER BY abs(level-$4), updated_at DESC LIMIT $5', [pid, level - spread, level + spread, level, limit]);
      return r.rows.map((x) => ({ pid: x.pid, level: x.level, body: x.body }));
    },
    async getCheck(pid) { const r = await q('SELECT at, xp, wins, floor, flag_until, reason FROM player_checks WHERE pid=$1', [pid]); const x = r.rows[0]; return x ? { at: Number(x.at), xp: x.xp, wins: x.wins, floor: x.floor, flagUntil: Number(x.flag_until), reason: x.reason } : null; },
    async setCheck(pid, c) { await q('INSERT INTO player_checks(pid,at,xp,wins,floor,flag_until,reason) SELECT $1,$2,$3,$4,$7,$5,$6 WHERE EXISTS (SELECT 1 FROM players WHERE pid=$1) ON CONFLICT (pid) DO UPDATE SET at=$2, xp=$3, wins=$4, floor=$7, flag_until=$5, reason=$6', [pid, c.at, c.xp, c.wins, c.flagUntil || 0, c.reason || '', c.floor || 0]); },
    async depthBoard(limit, now) {
      const r = await q('SELECT k.pid, k.floor, k.at, c.body FROM player_checks k JOIN cards c USING (pid) WHERE k.floor > 0 AND k.flag_until <= $1 ORDER BY k.floor DESC, k.at LIMIT $2', [now, limit * 2]);
      const out = []; for (const x of r.rows) { let nick = ''; try { nick = JSON.parse(x.body).nick || ''; } catch (e) { /* пусто */ } if (nick) out.push({ pid: x.pid, nick, floor: x.floor, at: Number(x.at) }); }
      return out.slice(0, limit);
    },
    async isFlagged(pid, now) { const r = await q('SELECT 1 FROM player_checks WHERE pid=$1 AND flag_until > $2', [pid, now]); return r.rowCount > 0; },
    async addVoucher(pid, v) {
      const day = Math.floor(v.at / 86400000);
      const c = await q('SELECT count(*)::int n FROM vouchers WHERE pid=$1 AND win AND paid AND at >= $2 AND at < $3', [pid, day * 86400000, (day + 1) * 86400000]);
      const paid = !!v.win && c.rows[0].n < rating.PAID_DAILY;
      const r = await q('INSERT INTO vouchers(pid,at,win,level,paid) SELECT $1,$2,$3,$4,$5 WHERE EXISTS (SELECT 1 FROM players WHERE pid=$1) RETURNING id', [pid, v.at, !!v.win, v.level, paid]);
      return r.rows[0] ? Number(r.rows[0].id) : null;
    },
    async claimVouchers(pid, now) {
      const r = await q('UPDATE vouchers SET claimed=true WHERE pid=$1 AND NOT claimed AND at >= $2 RETURNING id, at, win, level, paid', [pid, now - rating.VOUCHER_KEEP_MS]);
      return r.rows.sort((a, b) => Number(a.id) - Number(b.id)).map((x) => ({ id: Number(x.id), at: Number(x.at), win: x.win, level: x.level, paid: x.paid }));
    },
    async claimTournament(tid, pid) { const r = await q('INSERT INTO tournament_claims(tid,pid) VALUES($1,$2) ON CONFLICT DO NOTHING', [tid, pid]); return r.rowCount > 0; },
    async recordMatch(m) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock(7001)');   // рейтинг считаем по очереди, чтобы Эло не разъезжался
        const seen = await c.query('SELECT count(*)::int n FROM rating_log WHERE pid=$1 AND opp=$2 AND at>=$3 AND at<=$4', [m.a.pid, m.b.pid, m.at - 86400000, m.at]);
        const ok = await c.query('SELECT count(*)::int n FROM players WHERE pid IN ($1,$2)', [m.a.pid, m.b.pid]);
        if (seen.rows[0].n >= rating.PAIR_DAILY || ok.rows[0].n < 2) { await c.query('ROLLBACK'); return null; }
        for (const u of [m.a, m.b]) await c.query('INSERT INTO ratings(pid,nick) VALUES($1,$2) ON CONFLICT (pid) DO UPDATE SET nick=$2', [u.pid, u.nick]);
        const g = await c.query('SELECT pid, elo FROM ratings WHERE pid IN ($1,$2)', [m.a.pid, m.b.pid]);
        const el = Object.fromEntries(g.rows.map((r) => [r.pid, r.elo]));
        const aWon = m.winner === 'A', d = rating.change(el[m.a.pid], el[m.b.pid], aWon);
        const upd = (pid, dl, w) => c.query('UPDATE ratings SET elo=elo+$2, wins=wins+$3, losses=losses+$4, updated_at=now() WHERE pid=$1', [pid, dl, w ? 1 : 0, w ? 0 : 1]);
        await upd(m.a.pid, d.a, aWon); await upd(m.b.pid, d.b, !aWon);
        await c.query('INSERT INTO rating_log(pid,opp,at,delta,win) VALUES($1,$2,$3,$4,$5),($2,$1,$3,$6,$7)', [m.a.pid, m.b.pid, m.at, d.a, aWon, d.b, !aWon]);
        await c.query('COMMIT');
        return { a: { elo: el[m.a.pid] + d.a, delta: d.a }, b: { elo: el[m.b.pid] + d.b, delta: d.b } };
      } catch (e) { try { await c.query('ROLLBACK'); } catch (x) { /* уже закрыто */ } throw e; } finally { c.release(); }
    },
    // период all — по текущему Эло; week | month | year — по сумме изменений за окно (место считаем тут же)
    async leaderboard(period, limit, now) {
      const r = period === 'all'
        ? await q('SELECT pid, nick, elo, elo AS score, wins, losses FROM ratings ORDER BY elo DESC, nick LIMIT $1', [limit])
        : await q('SELECT l.pid, r.nick, r.elo, sum(l.delta)::int AS score, count(*) FILTER (WHERE l.win)::int AS wins, count(*) FILTER (WHERE NOT l.win)::int AS losses FROM rating_log l JOIN ratings r USING (pid) WHERE l.at >= $1 GROUP BY l.pid, r.nick, r.elo ORDER BY score DESC, r.elo DESC, r.nick LIMIT $2', [now - rating.PERIODS[period], limit]);
      return r.rows.map((x, i) => ({ ...x, place: i + 1 }));
    },
    async factionRange(from, to) {
      const r = await q("SELECT c.body::json->>'faction' AS faction, sum(l.delta)::int AS score, count(*)::int AS games, count(DISTINCT l.pid)::int AS players FROM rating_log l JOIN cards c USING (pid) WHERE l.at >= $1 AND l.at < $2 GROUP BY 1", [from, to]);
      return r.rows.filter((x) => x.faction);
    },
    async factionOf(pid) { const r = await q("SELECT body::json->>'faction' AS f FROM cards WHERE pid=$1", [pid]); return r.rows[0] ? r.rows[0].f : null; },
    async leaderboardRange(from, to, limit) {
      const r = await q('SELECT l.pid, r.nick, r.elo, sum(l.delta)::int AS score, count(*)::int AS games FROM rating_log l JOIN ratings r USING (pid) WHERE l.at >= $1 AND l.at < $2 GROUP BY l.pid, r.nick, r.elo HAVING count(*) >= $3 ORDER BY score DESC, r.elo DESC, r.nick LIMIT $4', [from, to, rating.MIN_GAMES, limit]);
      return r.rows.map((x, i) => ({ ...x, place: i + 1 }));
    },
    async rankOf(pid, period, now) {
      // место считает сама база (оконная функция), а не загрузка всей таблицы в память
      const r = period === 'all'
        ? await q('SELECT * FROM (SELECT pid, elo, elo AS score, wins, losses, row_number() OVER (ORDER BY elo DESC, nick) AS place FROM ratings) t WHERE pid=$1', [pid])
        : await q('SELECT * FROM (SELECT l.pid, r.elo, sum(l.delta)::int AS score, count(*) FILTER (WHERE l.win)::int AS wins, count(*) FILTER (WHERE NOT l.win)::int AS losses, row_number() OVER (ORDER BY sum(l.delta) DESC, r.elo DESC, r.nick) AS place FROM rating_log l JOIN ratings r USING (pid) WHERE l.at >= $1 GROUP BY l.pid, r.nick, r.elo) t WHERE pid=$2', [now - rating.PERIODS[period], pid]);
      const x = r.rows[0]; return x ? { ...x, place: Number(x.place) } : null;
    },
    async saveTournament(id, state, startAt, body) { await q('INSERT INTO tournaments(id,state,start_at,body) VALUES($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET state=$2, body=$4, updated_at=now()', [id, state, startAt, body]); },
    async loadTournaments() {
      const a = await q("SELECT id, state, body FROM tournaments WHERE state IN ('open','running') ORDER BY start_at DESC");
      const d = await q("SELECT id, state, body FROM tournaments WHERE state='done' ORDER BY start_at DESC LIMIT 1");
      return [...a.rows, ...d.rows];
    },
    async deletePlayer(pid) { await q("UPDATE tournaments SET body = replace(body, $1, 'deleted') WHERE position($1 in body) > 0", [pid]); const r = await q('DELETE FROM players WHERE pid=$1', [pid]); return r.rowCount > 0; },
    async purge(now, auditMaxAgeMs) {
      const a = await q('DELETE FROM sessions WHERE expires_at <= to_timestamp($1/1000.0)', [now]);
      const b = await q('DELETE FROM audit WHERE created_at < to_timestamp($1/1000.0)', [now - auditMaxAgeMs]);
      const vd = await q('DELETE FROM vouchers WHERE at < $1', [now - rating.VOUCHER_KEEP_MS]);
      const sp = await q('DELETE FROM square_posts WHERE at < $1', [now - 7 * 86400000]);
      await q('DELETE FROM square_reports WHERE at < $1', [now - 7 * 86400000]);
      const rl = await q('DELETE FROM rating_log WHERE at < $1', [now - 366 * 86400000]);
      const c = await q("DELETE FROM tournaments WHERE state NOT IN ('open','running') AND start_at < $1", [now - 60 * 86400000]);
      return a.rowCount + b.rowCount + c.rowCount + rl.rowCount + vd.rowCount + sp.rowCount;
    },
    async log(kind, pid, info) { try { await q('INSERT INTO audit(kind,pid,info) VALUES($1,$2,$3)', [kind, pid || null, info ? String(info).slice(0, 300) : null]); } catch (e) {} },
    async close() { await pool.end(); },
  };
};
module.exports = { create };
