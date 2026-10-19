// Площадка народа в браузере: два игрока одного народа переписываются. Запуск: node tools/square-e2e.js
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
    if (/^\/(auth|snapshot|card|opponents|me|health|rewards|rating|depth|factions|square)/.test(u)) {
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
  let ok = true; const check = (c, m) => { console.log((c ? 'ок   ' : 'ОШИБКА ') + m); if (!c) ok = false; };
  const mk = async (name) => {
    const ctx = await br.newContext({ viewport: { width: 1000, height: 900 } }); const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/40[04]/.test(m.text())) errs.push('console: ' + m.text()); });
    await page.addInitScript((u) => { Object.defineProperty(window, 'GEM_SERVER', { value: u, writable: false }); localStorage.setItem('wip-sync-off', '0'); }, base);
    await page.goto(base + '/index.html'); await page.waitForTimeout(3500);
    await page.evaluate((n) => { Profile.data.name = n; Profile.data.faction = 'elf'; Profile.data.gender = 'f'; Profile.data.xp = 600000; Profile.save(); }, name);
    await page.waitForFunction(() => Net.current && Net.current.remote && Net.current.ready, null, { timeout: 15000 });
    await page.evaluate(() => Net.current.remote.putCard(Net.current.env.getCard()));
    return { page, errs };
  };
  const open = async (pg) => { await pg.evaluate(() => { Screens.open('arena'); }); await pg.evaluate(() => { document.querySelector('[data-tab="square"]').click(); }); await pg.waitForTimeout(1500); };
  const A = await mk('Аня'), B = await mk('Боря');
  await open(A.page); await open(B.page);
  check(/Площадка народа|People's square/.test(await A.page.evaluate(() => document.querySelector('.modal').innerText)), 'вкладка открылась');
  await A.page.fill('#sq-text', 'Кто на турнир в субботу?');
  await A.page.click('[data-arena="sq-send"]'); await A.page.waitForTimeout(1500);
  check(/Кто на турнир/.test(await A.page.evaluate(() => document.querySelector('.modal').innerText)), 'своя запись видна после отправки');
  await B.page.click('[data-arena="sq-reload"]'); await B.page.waitForTimeout(1500);
  const tb = await B.page.evaluate(() => document.querySelector('.modal').innerText);
  check(/Кто на турнир/.test(tb) && /Аня/.test(tb), 'другой эльф видит запись и ник автора');
  check(/Сейчас в сети|Online now/.test(tb) && /Боря/.test(tb), 'список «в сети» есть');
  await B.page.click('[data-arena="sq-report"]'); await B.page.waitForTimeout(1500);
  check(/Жалоба отправлена|Report sent/.test(await B.page.evaluate(() => document.querySelector('.modal').innerText)), 'жалоба отправляется, игрок получает подтверждение');
  await B.page.click('[data-arena="sq-hide"]'); await B.page.waitForTimeout(1500);
  const hb = await B.page.evaluate(() => document.querySelector('.modal').innerText);
  check(!/Кто на турнир/.test(hb) && /Скрытых авторов|Hidden authors/.test(hb), 'автор скрыт у жалобщика');
  await B.page.click('[data-arena="sq-unhide"]'); await B.page.waitForTimeout(1500);
  check(/Кто на турнир/.test(await B.page.evaluate(() => document.querySelector('.modal').innerText)), '«Показать всех» возвращает записи');
  await A.page.fill('#sq-text', 'заходи на http://x.ru'); await A.page.click('[data-arena="sq-send"]'); await A.page.waitForTimeout(1200);
  check(/Ссылки и контакты|Links and contacts/.test(await A.page.evaluate(() => document.querySelector('.modal').innerText)), 'ссылку игра отклоняет с объяснением');
  await A.page.click('[data-arena="sq-reload"]'); await A.page.waitForTimeout(1200);
  await A.page.click('[data-arena="sq-del"]'); await A.page.waitForTimeout(1500);
  check(!/Кто на турнир/.test(await A.page.evaluate(() => document.querySelector('.modal').innerText)), 'своя запись удаляется');
  check(A.errs.length === 0 && B.errs.length === 0, 'ошибок страницы нет ' + JSON.stringify([...A.errs, ...B.errs].slice(0, 3)));
  await br.close(); srv.close(); console.log(ok ? 'square-e2e: OK' : 'square-e2e: FAIL'); process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
