// Проверка боя в реальном времени двумя браузерными страницами против настоящего сервера (память вместо базы).
// Запуск: node tools/live-e2e.js [число боёв]. Каждая страница — отдельный игрок; ходы за обоих делает ИИ-водитель.
// Успех: оба клиента закончили бой согласованно (один победил, другой проиграл), без «Бой прерван».
const http = require('http'), fs = require('fs'), path = require('path');
const browser = require('./browser');
const live = require('../server/src/live');
const { create, cleanCard, sha } = require('../server/src/app');
const { load } = require('../server/src/config');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };

const DRIVER = require('./e2e-driver');

(async () => {
  const bouts = Number(process.argv[2]) || 1;
  const cfg = load({ PLATFORMS: 'site', ALLOWED_ORIGINS: '*' });
  const store = require('../server/src/store-memory').create();
  const { handler } = create({ cfg: { ...cfg, allowedOrigins: [] }, store });
  let port = 0;
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent((req.url || '/').split('?')[0]);
    if (/^\/(auth|snapshot|card|opponents|me|health|rewards|rating)/.test(u)) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      return handler(req, res);
    }
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  const lvRef = {};
  lvRef.core = null;
  const lvA = live.attach({ server: srv, store, cfg, sha, live: { cleanCard, onEnd: require('../server/src/rating').hook(store, Date.now, (pid, m) => lvRef.core && lvRef.core.sendPid(pid, m)), cfg: { spread: 5, turnMs: Number(process.env.TURN_MS) || 30000, graceMs: 300 } } });
  lvRef.core = lvA.core;
  await new Promise((r) => srv.listen(0, r)); port = srv.address().port;
  const base = 'http://127.0.0.1:' + port;

  const br = await browser.launch();
  const mkPage = async (name, faction, level) => {
    const ctx = await br.newContext({ viewport: { width: 1000, height: 800 } }); const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('console: ' + m.text()); });
    await page.addInitScript((u) => { Object.defineProperty(window, 'GEM_SERVER', { value: u, writable: false }); localStorage.setItem('wip-sync-off', '0'); window.__LIVE_DEBUG = true; }, base);
    await page.addInitScript(DRIVER);
    await page.goto(base + '/index.html'); await page.waitForTimeout(3500);
    await page.evaluate(({ name, faction, level }) => { Profile.data.name = name; Profile.data.faction = faction; Profile.data.gender = 'm'; if (level > 1) Profile.data.xp = level; Profile.save(); }, { name, faction, level });
    return { page, errs, name };
  };
  const FORCE = process.env.FORCE ? process.env.FORCE.split(',') : null;
  const XP = Number(process.env.XP) || 1;
  const FACS = (process.env.FACS || 'elf,dwarf').split(',');
  const A = await mkPage('Аня', FACS[0], XP), B = await mkPage('Боря', FACS[1], XP);
  console.log('уровни', await A.page.evaluate(() => Profile.level()), await B.page.evaluate(() => Profile.level()));
  for (const P of [A, B]) {
    await P.page.waitForFunction(() => Net.current && Net.current.remote && Net.current.ready, null, { timeout: 15000 });
    await P.page.evaluate(() => Net.current.flush ? Net.current.flush() : 0);
  }
  let okAll = true;
  for (let n = 1; n <= bouts; n++) {
    for (const P of [A, B]) {
      await P.page.evaluate(() => { Screens.open('arena'); });
      await P.page.waitForTimeout(300);
      await P.page.evaluate(() => { const t = document.querySelector('[data-tab="players"]'); if (t) t.click(); });
      await P.page.waitForTimeout(200);
      await P.page.evaluate(() => { const b = document.querySelector('[data-arena="live-find"]'); if (!b) throw new Error('нет кнопки «Живой бой»'); b.click(); });
    }
    for (const P of [A, B]) await P.page.waitForFunction(() => typeof liveActive !== 'undefined' && liveActive && inBattle, null, { timeout: 30000 });
    for (const P of [A, B]) await P.page.evaluate(([spells, force, facs]) => window.__drive({ spells, force, facs }), [true, FORCE, !!process.env.FACS]);
    const SC = process.env.SCENARIO || '';
    if (SC) {
      // сценарии отказов: один из игроков (Аня) перестаёт ходить сам; Боря играет водителем
      for (const P of [A, B]) await P.page.waitForTimeout(100);
      await A.page.evaluate(() => { clearInterval(window.__timer); });                // Аня больше не ходит сама
      await A.page.waitForTimeout(3000);
      if (SC === 'forfeit') {
        await A.page.evaluate(() => { const b = document.getElementById('restart'); b.click(); b.click(); });
      }
      if (SC === 'offline') {
        await A.page.context().setOffline(true); await A.page.waitForTimeout(4000); await A.page.context().setOffline(false);
        await A.page.evaluate(() => window.__drive({ spells: false }));               // и снова играет
      }
    }
    const fin = async (P) => { await P.page.waitForFunction(() => over, null, { timeout: 240000 }); return P.page.evaluate(() => ({ win: Combat.enemyDefeated(fighters.right), overlay: (document.getElementById('overlay') || {}).textContent || '', hp: [fighters.left.hp, fighters.right.hp], log: window.__log.slice(-6), spells: window.__log.filter((x) => /^(cast|inst|fac)/.test(x)).reduce((o, x) => (o[x] = (o[x] || 0) + 1, o), {}), hash: liveHash(), desync: window.__desync || null })); };
    if (SC === 'forfeit') {
      const rb = await fin(B); console.log('сдача: Боря', JSON.stringify({ win: rb.win, ov: rb.overlay.slice(0, 40) }));
      if (!rb.win) { okAll = false; console.log('РАСХОЖДЕНИЕ: после сдачи Ани Боря должен победить'); }
      await B.page.evaluate(() => { clearInterval(window.__timer); });
      break;
    }
    const [ra, rb] = await Promise.all([fin(A), fin(B)]);
    console.log('бой', n, 'Аня:', JSON.stringify({ win: ra.win, hp: ra.hp, ov: ra.overlay.slice(0, 40) }), 'Боря:', JSON.stringify({ win: rb.win, hp: rb.hp, ov: rb.overlay.slice(0, 40) }));
    console.log('  заклинания:', JSON.stringify(ra.spells), JSON.stringify(rb.spells));
    const good = (ra.win !== rb.win) && !/прерван/.test(ra.overlay + rb.overlay) && ra.hp[0] === rb.hp[1] && ra.hp[1] === rb.hp[0];
    if (!good) { okAll = false; console.log('РАСХОЖДЕНИЕ', JSON.stringify(ra), JSON.stringify(rb)); }
    for (const P of [A, B]) await P.page.evaluate(() => { clearInterval(window.__timer); MapView.returnFromBattle(Combat.enemyDefeated(fighters.right) ? 'win' : 'loss'); });
    await A.page.waitForTimeout(800);
    // серверные награды: квитанция гасится один раз и меняет счёт арены у обоих
    for (const P of [A, B]) {
      const r = await P.page.evaluate(async () => { const b = (Profile.data.arena || {}); const n0 = (b.wins || 0) + (b.losses || 0); await claimLiveRewards(); const a = Profile.data.arena || {}; const n1 = (a.wins || 0) + (a.losses || 0); await claimLiveRewards(); const a2 = Profile.data.arena || {}; return { n0, n1, n2: (a2.wins || 0) + (a2.losses || 0), pvp: Profile.data.pvp || null, titles: ((Profile.data.cosmetics || {}).titles || []).filter((t) => /^pvp/.test(t)) }; });
      console.log('  квитанция', P.name, JSON.stringify(r));
      if (!r.pvp || r.pvp.wins + r.pvp.losses !== 1 || (r.pvp.wins === 1) !== (r.titles.length === 1)) { okAll = false; console.log('РАНГ ЖИВЫХ БОЁВ: счётчик не сошёлся'); }
      if (r.n2 < 1 || r.n2 !== r.n1) { okAll = false; console.log('КВИТАНЦИЯ: счёт арены не сошёлся'); }
    }
  }
  for (const P of [A, B]) if (P.errs.length) { console.log(P.name, 'ошибки:', P.errs.slice(0, 5)); okAll = false; }
  await br.close(); srv.close();
  console.log(okAll ? 'live-e2e: OK' : 'live-e2e: ЕСТЬ ПРОБЛЕМЫ'); process.exit(okAll ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
