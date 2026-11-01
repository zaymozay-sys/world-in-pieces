#!/usr/bin/env node
/* Сводка по отчётам тестировщиков.
   node tools/analyze-telemetry.js --url https://сервер --key КЛЮЧ [--since-hours 48] [--nick Имя]   — скачать с сервера (STATS_KEY)
   node tools/analyze-telemetry.js --file reports.json                                              — разобрать сохранённый ответ { list: [...] }
   Выводит: бои по цветам и противникам (доля побед, средние ходы), подозрительные бои, ошибки, сообщения тестировщиков. */
const fs = require('fs');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
async function load() {
  const f = arg('file'); if (f) return JSON.parse(fs.readFileSync(f, 'utf8')).list || [];
  const url = arg('url'), key = arg('key'); if (!url || !key) { console.error('Нужно --file или --url и --key'); process.exit(1); }
  const since = Date.now() - Number(arg('since-hours', 72)) * 3600000, nick = arg('nick');
  const r = await fetch(url.replace(/\/$/, '') + '/telemetry?key=' + encodeURIComponent(key) + '&limit=500&since=' + since + (nick ? '&nick=' + encodeURIComponent(nick) : ''));
  if (!r.ok) { console.error('Сервер ответил ' + r.status); process.exit(1); }
  const list = (await r.json()).list || [], sv = arg('save'); if (sv) fs.writeFileSync(sv, JSON.stringify({ list }));
  return list;
}
// --anon: ники в сводке заменяются коротким кодом (для публичных репозиториев)
const anon = (list) => { const m = new Map(); return list.map((x) => { const k = x.nick || x.pid; if (!m.has(k)) m.set(k, 'игрок-' + (m.size + 1)); return { ...x, nick: m.get(k), pid: '' }; }); };
const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '—');
const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : 0);
function summarize(list) {
  const out = [], by = (k) => list.filter((x) => x.kind === k);
  const battles = by('battle'), errors = by('error'), reports = by('report');
  out.push(`Записей: ${list.length} (боёв ${battles.length}, ошибок ${errors.length}, сообщений ${reports.length}); игроков: ${new Set(list.map((x) => x.nick || x.pid)).size}; версии: ${[...new Set(list.map((x) => x.ver))].join(', ')}`);
  // бои по цвету противника
  const tiers = {};
  for (const b of battles) { const d = b.data, t = (d.foe && d.foe.tier) || 0, g = tiers[t] || (tiers[t] = { n: 0, win: 0, turns: [], lost: [] }); g.n++; if (d.result === 'win') g.win++; if (d.stats && d.stats.turns) g.turns.push(d.stats.turns); if (d.result === 'win' && d.hero && d.hero.max) g.lost.push(100 * (1 - d.hero.hp / d.hero.max)); }
  out.push('\nПо цвету противника: боёв / побед / ходов в среднем / потеряно ХП в победах');
  for (const t of Object.keys(tiers).sort((a, b) => a - b)) { const g = tiers[t]; out.push(`  цвет ${t}: ${g.n} / ${pct(g.win, g.n)} / ${avg(g.turns)} / ${avg(g.lost)}%`); }
  // по противникам: самые трудные
  const foes = {};
  for (const b of battles) { const d = b.data, n = d.foe && d.foe.name; if (!n) continue; const g = foes[n] || (foes[n] = { n: 0, win: 0 }); g.n++; if (d.result === 'win') g.win++; }
  const hard = Object.entries(foes).filter(([, g]) => g.n >= 3).sort((a, b) => a[1].win / a[1].n - b[1].win / b[1].n).slice(0, 8);
  if (hard.length) { out.push('\nСамые трудные (от 3 боёв):'); for (const [n, g] of hard) out.push(`  ${n}: победы ${pct(g.win, g.n)} из ${g.n}`); }
  // подозрительное
  const odd = battles.filter((b) => { const d = b.data, s = d.stats || {}; return /NaN|undefined|Infinity/.test(JSON.stringify(d.lines || [])) || (d.hero && d.hero.hp < 0) || (s.turns > 120) || (d.result === 'win' && d.foe && d.foe.hp > 0); });
  if (odd.length) { out.push('\nПодозрительные бои (NaN/undefined в журнале, ХП < 0, более 120 ходов, победа при живом враге):'); for (const b of odd.slice(0, 15)) out.push(`  №${b.data.n} ${b.nick}: ${b.data.hero && b.data.hero.name} против ${b.data.foe && b.data.foe.name}, ход ${b.data.stats && b.data.stats.turns}, ${b.data.result}`); }
  // ошибки: по тексту
  const errs = {};
  for (const e of errors) { const k = e.data.msg + ' @' + e.data.src + ':' + e.data.line; const g = errs[k] || (errs[k] = { n: 0, who: new Set() }); g.n++; g.who.add(e.nick || e.pid); }
  const eList = Object.entries(errs).sort((a, b) => b[1].n - a[1].n).slice(0, 12);
  if (eList.length) { out.push('\nОшибки (по числу):'); for (const [k, g] of eList) out.push(`  ×${g.n} (игроков ${g.who.size}): ${k}`); }
  if (reports.length) { out.push('\nСообщения тестировщиков:'); for (const r of reports.slice(0, 20)) out.push(`  [${new Date(r.at).toISOString().slice(0, 16)}] ${r.nick || r.pid} v${r.ver}, ур.${r.data.hero && r.data.hero.level}: ${r.data.note}${r.data.lastBattle ? ' (бой №' + r.data.lastBattle.n + ': ' + r.data.lastBattle.foe + ', ' + r.data.lastBattle.result + ')' : ''}`); }
  return out.join('\n');
}
module.exports = { summarize };
if (require.main === module) load().then((l) => console.log(summarize(process.argv.includes('--anon') ? anon(l) : l))).catch((e) => { console.error(e.message); process.exit(1); });
