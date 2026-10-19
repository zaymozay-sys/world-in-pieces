// Турнир на четверых: четыре браузерные страницы против настоящего сервера. Ходы за всех делает ИИ-водитель.
// Запуск: node tools/tourney-e2e.js [число участников 2..8]. Успех: турнир завершён, чемпион определён, все получили запись о награде.
const http = require('http'), fs = require('fs'), path = require('path');
const browser = require('./browser');
const live = require('../server/src/live');
const { create, cleanCard, sha } = require('../server/src/app');
const { load } = require('../server/src/config');
const { make } = require('../server/src/tour-wire');
const DRIVER = require('./e2e-driver');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };

(async () => {
  const N = Math.max(2, Math.min(8, Number(process.argv[2]) || 4));
  const cfg = load({ PLATFORMS: 'site' });
  const store = require('../server/src/store-memory').create();
  const tw = make(cfg, { tcfg: { showMs: 30000, gapMs: 3000, minPlayers: 2, level: Number(process.env.TLEVEL) || 30 } });
  const { handler } = create({ cfg: { ...cfg, allowedOrigins: [] }, store, tourney: tw.trn });
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent((req.url || '/').split('?')[0]);
    if (/^\/(auth|snapshot|card|opponents|me|health|tournament|rating)/.test(u)) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      return handler(req, res);
    }
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  const lv = live.attach({ server: srv, store, cfg, sha, live: { cleanCard, cfg: { spread: 5 }, onEnd: tw.onEnd } });
  tw.bind(lv.core);
  await new Promise((r) => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port;

  const br = await browser.launch();
  const names = ['Аня', 'Боря', 'Вера', 'Глеб', 'Дина', 'Егор', 'Жанна', 'Зиновий'], facs = ['elf', 'dwarf', 'human', 'lizard'];
  const pages = [];
  for (let i = 0; i < N; i++) {
    const ctx = await br.newContext({ viewport: { width: 1000, height: 800 } }); const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('console: ' + m.text()); });
    await page.addInitScript((u) => { Object.defineProperty(window, 'GEM_SERVER', { value: u, writable: false }); localStorage.setItem('wip-sync-off', '0'); window.__LIVE_DEBUG = true; }, base);
    await page.addInitScript(DRIVER);
    await page.goto(base + '/index.html'); await page.waitForTimeout(3500);
    await page.evaluate(({ n, f }) => { Profile.data.name = n; Profile.data.faction = f; Profile.data.gender = 'm'; Profile.save(); window.__drive({ spells: true }); }, { n: names[i], f: facs[i % 4] });
    await page.waitForFunction(() => Net.current && Net.current.remote && Net.current.ready, null, { timeout: 15000 });
    await page.evaluate(() => Net.current.flush ? Net.current.flush() : 0);
    pages.push({ page, errs, name: names[i] });
  }
  for (const P of pages) {
    await P.page.evaluate(() => { Screens.open('arena'); });
    await P.page.waitForTimeout(300);
    await P.page.evaluate(() => { const t = document.querySelector('[data-tab="tourney"]'); if (!t) throw new Error('нет вкладки «Турнир»'); t.click(); });
    await P.page.waitForTimeout(1200);
    await P.page.evaluate(() => { const b = document.querySelector('[data-arena="tour-join"]'); if (!b) throw new Error('нет кнопки «Записаться»'); b.click(); });
    await P.page.waitForTimeout(500);
  }
  await pages[0].page.waitForTimeout(1500);
  console.log('записано:', tw.trn.view(tw.trn.current()).size);
  tw.trn.begin(tw.trn.current());          // старт «по расписанию»
  const t0 = Date.now(); let ok = true;
  while (!tw.trn.last() && Date.now() - t0 < 15 * 60000) await new Promise((r) => setTimeout(r, 1000));
  const last = tw.trn.last();
  if (!last) { console.log('турнир не завершился'); ok = false; }
  else {
    console.log('чемпион:', last.champion, 'раундов:', last.rounds.length);
    await pages[0].page.waitForTimeout(4000);
    for (const P of pages) {
      const r = await P.page.evaluate(() => ({ claimed: (Profile.data.tourney || {}).claimed || [], titles: (Profile.data.cosmetics || {}).titles || [], coins: Profile.data.coins, desync: window.__desync ? JSON.stringify(window.__desync).slice(0, 1500) : null, ov: (document.getElementById('overlay') || {}).textContent || '' }));
      const champ = P.name === last.champion;
      console.log(P.name, JSON.stringify({ claimed: r.claimed.length, title: r.titles.includes('tourneyChamp'), coins: r.coins, desync: r.desync }), champ ? '← чемпион' : '');
      if (r.claimed.length !== 1 || r.titles.includes('tourneyChamp') !== champ || r.desync) ok = false;
    }
  }
  for (const P of pages) if (P.errs.length) { console.log(P.name, 'ошибки:', P.errs.slice(0, 4)); ok = false; }
  await br.close(); srv.close();
  console.log(ok ? 'tourney-e2e: OK' : 'tourney-e2e: ЕСТЬ ПРОБЛЕМЫ'); process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
