// 2.0.9: шахматы — доска не двигается при нажатии на фигуру, ход анимируется (браузер; в `npm test` не входит)
const { launch } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path'); const URL = 'file://' + path.join(__dirname, '..', 'index.html#dev-map');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await launch();
  for (const [w, h] of [[390, 844], [1366, 768], [844, 390]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: w < 900 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL); await sleep(1800);
    await p.evaluate(() => Screens.open('library')); await sleep(300); await p.click('button[data-tab=chess]'); await sleep(300);
    await p.click('[data-chess-new="1"]'); await sleep(1200);
    const pos = () => p.evaluate(() => { const r = document.querySelector('.ch-board').getBoundingClientRect(); return { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), st: document.querySelector('.screen-body').scrollTop }; });
    const before = await pos();
    ok(Math.abs(before.w - before.h) <= 1, `${w}px: доска квадратная (${before.w}×${before.h})`);
    await p.click('[data-chcell="52"]'); await sleep(200);
    const afterSel = await pos();
    ok(afterSel.t === before.t && afterSel.l === before.l && afterSel.st === before.st, `${w}px: доска не сдвинулась после нажатия на фигуру`);
    await p.click('[data-chcell="36"]');
    const anim = await p.evaluate(() => document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.ch-board')).length);
    ok(anim > 0, `${w}px: ход анимируется (${anim})`);
    await sleep(1800);
    const afterMove = await pos();
    ok(afterMove.t === before.t && afterMove.st === before.st, `${w}px: доска не сдвинулась после хода и ответа Бобра`);
    const moved = await p.evaluate(() => !!document.querySelector('[data-chcell="36"] [data-t="p"]') || !!document.querySelector('[data-chcell="36"] [data-t]'));
    ok(moved, `${w}px: пешка стоит на e4`);
    ok(!errs.length, `${w}px: без ошибок страницы ${errs.join('; ')}`);
    await ctx.close();
  }
  await b.close(); console.log(bad ? `\nchessmove209.e2e: ошибок ${bad}` : '\nchessmove209.e2e: всё в порядке'); process.exit(bad ? 1 : 0);
})();
