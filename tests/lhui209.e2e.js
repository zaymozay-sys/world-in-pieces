// 2.0.9: оформление мини-игр маяка (браузер; в `npm test` не входит): у каждой игры есть сцена и табло, нет ошибок, нет горизонтальной прокрутки
const { launch } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path'); const URL = 'file://' + path.join(__dirname, '..', 'index.html#dev-map');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await launch();
  for (const w of [320, 390, 1000]) for (const k of ['av', 'mr', 'td', 'rp', 'dg']) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 }, hasTouch: w < 500, isMobile: w < 500 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL); await sleep(1500);
    await p.evaluate(() => Screens.open('lighthouse')); await sleep(200); await p.evaluate(() => document.querySelector('button[data-tab=games]').click()); await sleep(200);
    await p.evaluate((k) => { const bt = document.querySelector(`[data-lhplay="${k}"]`); bt.disabled = false; bt.click(); }, k); await sleep(400);
    const r = await p.evaluate(() => ({ stage: !!document.querySelector('.lh-stage'), chips: document.querySelectorAll('.lh-chip').length, cells: document.querySelectorAll('.lh-cell').length, beam: !!document.querySelector('.lh-beam polyline'), water: !!document.querySelector('.lh-water'), ropes: !!document.querySelector('.lh-ropes'), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sq: (() => { const c = document.querySelector('.lh-cell'); const r = c.getBoundingClientRect(); return Math.abs(r.width - r.height) < 2; })() }));
    ok(r.stage && r.chips >= 3 && r.cells === 36, `${k} ${w}px: сцена, табло и 36 клеток`);
    ok(r.sq, `${k} ${w}px: клетки квадратные`);
    if (k === 'mr') ok(r.beam, 'зеркала: луч нарисован');
    if (k === 'td') ok(r.water, 'прилив: слой воды');
    if (k === 'rp') ok(r.ropes, 'канаты: слой верёвок');
    ok(r.sw <= r.cw + 1, `${k} ${w}px: нет горизонтальной прокрутки (${r.sw}/${r.cw})`);
    // ход: после нажатия очки или состояние обновляются без ошибок
    await p.evaluate((k) => { const sel = { av: '[data-lhcell]', mr: '[data-lhmr]:not([disabled])', td: '[data-lhtd]', rp: '[data-lhrp]', dg: '[data-lhdg]' }[k]; const c = document.querySelector(sel); if (c) c.click(); }, k); await sleep(500);
    ok(!errs.length, `${k} ${w}px: без ошибок страницы ${errs.join('; ')}`);
    await ctx.close();
  }
  await b.close(); console.log(bad ? `\nlhui209.e2e: ошибок ${bad}` : '\nlhui209.e2e: всё в порядке'); process.exit(bad ? 1 : 0);
})();
