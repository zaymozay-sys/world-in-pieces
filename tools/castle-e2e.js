// Замок в браузере: дух со своим приёмом и Владыка — настоящий игрок с сервера. Запуск: node tools/castle-e2e.js
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
    if (/^\/(auth|snapshot|card|opponents|me|health|rewards|rating)/.test(u)) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      return handler(req, res);
    }
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await browser.launch();
  const mk = async (name, xp) => {
    const ctx = await br.newContext({ viewport: { width: 1000, height: 800 } }); const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('console: ' + m.text()); });
    await page.addInitScript((u) => { Object.defineProperty(window, 'GEM_SERVER', { value: u, writable: false }); localStorage.setItem('wip-sync-off', '0'); }, base);
    await page.goto(base + '/index.html'); await page.waitForTimeout(3500);
    await page.evaluate(({ name, xp }) => { Profile.data.name = name; Profile.data.faction = 'elf'; Profile.data.gender = 'f'; Profile.data.xp = xp; Profile.save(); }, { name, xp });
    return { page, errs, name };
  };
  let ok = true; const check = (c, m) => { console.log((c ? 'ок   ' : 'ОШИБКА ') + m); if (!c) ok = false; };
  const B = await mk('Боря', 2000000);                    // будущий «Владыка»: высокий уровень, карточка уходит на сервер
  await B.page.waitForFunction(() => Net.current && Net.current.remote && Net.current.ready, null, { timeout: 15000 });
  await B.page.evaluate(() => Net.current.remote.putCard(Net.current.env.getCard()));
  const A = await mk('Аня', 600000);
  await A.page.waitForFunction(() => Net.current && Net.current.remote && Net.current.ready, null, { timeout: 15000 });
  // в замок
  await A.page.evaluate(() => { Profile.data.loc = 'castle'; Profile.save(); });
  await A.page.reload(); await A.page.waitForTimeout(3500);
  const kind = await A.page.evaluate(() => MapView.map.kind);
  check(kind === 'castle', 'карта замка загрузилась');
  if (process.env.SHOT) { await A.page.waitForTimeout(4000); await A.page.screenshot({ path: process.env.SHOT }); }
  // дух со своим приёмом
  const sp = await A.page.evaluate(() => { const s = MapView.map.spawns.find((x) => x.trait && !x.boss); return s ? { id: s.id, trait: s.trait } : null; });
  check(!!sp, 'на карте замка есть дух со своим приёмом: ' + JSON.stringify(sp));
  if (sp) {
    await A.page.evaluate((id) => { const s = MapView.map.spawns.find((x) => x.id === id); MapView.attack(s); }, sp.id);
    await A.page.waitForFunction(() => typeof fighters !== 'undefined' && fighters.right && fighters.right.trait, null, { timeout: 15000 }).catch(() => {});
    const r = await A.page.evaluate(() => ({ ab: fighters.right.ability, trait: fighters.right.trait, name: fighters.right.name, label: (Bestiary.ABILITIES[fighters.right.ability] || {}).name }));
    check(r.ab === sp.trait && r.trait === sp.trait, 'в бою приём духа: ' + JSON.stringify(r));
    check(/·/.test(r.name) && !!r.label, 'в имени и подписи виден приём');
    await A.page.evaluate(() => { clearInterval(window.__timer); MapView.returnFromBattle('flee'); });
    await A.page.waitForTimeout(800);
  }
  // Владыка — настоящий игрок
  await A.page.evaluate(() => { MapView.fightLord(); });
  await A.page.waitForFunction(() => typeof fighters !== 'undefined' && fighters.right && fighters.right.shadowHero, null, { timeout: 15000 }).catch(() => {});
  const lord = await A.page.evaluate(() => ({ name: fighters.right.name, level: fighters.right.level, real: !!(Profile.data.monster && Profile.data.monster.lord && Profile.data.monster.lord.lordReal), lordNick: Profile.data.monster && Profile.data.monster.lord && Profile.data.monster.lord.nick }));
  console.log('  Владыка:', JSON.stringify(lord));
  check(lord.real && /Боря/.test(lord.lordNick || ''), 'Владыку ведёт карточка настоящего игрока с сервера');
  for (const P of [A, B]) if (P.errs.length) { console.log(P.name, 'ошибки:', P.errs.slice(0, 5)); ok = false; }
  await br.close(); srv.close();
  console.log(ok ? 'castle-e2e: OK' : 'castle-e2e: ЕСТЬ ПРОБЛЕМЫ'); process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
