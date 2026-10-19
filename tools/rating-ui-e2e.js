// Вкладка «Рейтинг» в браузере: общий, глубина, сезон недели/месяца, народы. Запуск: node tools/rating-ui-e2e.js
const http = require('http'), fs = require('fs'), path = require('path');
const browser = require('./browser');
const { create } = require('../server/src/app');
const { load } = require('../server/src/config');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
(async () => {
  const cfg = load({ PLATFORMS: 'site', ALLOWED_ORIGINS: '*' });
  const store = require('../server/src/store-memory').create();
  const { handler } = create({ cfg: { ...cfg, allowedOrigins: [] }, store });
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent((req.url || '/').split('?')[0]);
    if (/^\/(auth|snapshot|card|opponents|me|health|rewards|rating|depth|factions)/.test(u)) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      return handler(req, res);
    }
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await browser.launch();
  const ctx = await br.newContext({ viewport: { width: 1000, height: 900 } }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.addInitScript((u) => { Object.defineProperty(window, 'GEM_SERVER', { value: u, writable: false }); localStorage.setItem('wip-sync-off', '0'); }, base);
  await page.goto(base + '/index.html'); await page.waitForTimeout(3500);
  await page.evaluate(() => { Profile.data.name = 'Аня'; Profile.data.faction = 'elf'; Profile.data.gender = 'f'; Profile.data.xp = 600000; Profile.data.tower = { floor: 12, best: 12 }; Profile.save(); });
  await page.waitForFunction(() => Net.current && Net.current.remote && Net.current.ready, null, { timeout: 15000 });
  await page.evaluate(() => Net.current.remote.putCard(Net.current.env.getCard()));
  await page.evaluate(() => { Profile.save(); return Net.current.flush(); }); await page.waitForTimeout(1200);
  let ok = true; const check = (c, m) => { console.log((c ? 'ок   ' : 'ОШИБКА ') + m); if (!c) ok = false; };
  await page.evaluate(() => { Screens.open('arena'); });
  await page.evaluate(() => { document.querySelector('[data-tab="rating"], [data-arena="tab"][data-tab="rating"]') && document.querySelector('[data-tab="rating"]').click(); });
  await page.waitForTimeout(1500);
  check(await page.evaluate(() => Screens.arenaTab()) === 'rating', 'открыта вкладка «Рейтинг»');
  for (const [per, rx] of [['depth', /Рейтинг глубины|Depth ranking/], ['cweek', /Сезон закончится|season ends/i], ['cmonth', /Сезон закончится|season ends/i], ['folk', /Битва народов|Battle of the Peoples/]]) {
    await page.evaluate((p) => { document.querySelector(`[data-arena="rate-per"][data-per="${p}"]`).click(); }, per);
    await page.waitForTimeout(1800);
    const txt = await page.evaluate(() => document.querySelector('.modal') ? document.querySelector('.modal').innerText : '');
    check(rx.test(txt), 'вкладка ' + per + ': есть пояснение');
    if (per === 'folk') check(/Эльфы|Elves|Эльф|Elf/i.test(txt), 'народы: перечислены');
    if (per === 'depth') check(/Аня/.test(txt) && /12/.test(txt), 'глубина: игрок в списке с 12-м уровнем');
  }
  check(errs.length === 0, 'ошибок страницы нет ' + JSON.stringify(errs.slice(0, 3)));
  await br.close(); srv.close(); console.log(ok ? 'rating-ui-e2e: OK' : 'rating-ui-e2e: FAIL'); process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
