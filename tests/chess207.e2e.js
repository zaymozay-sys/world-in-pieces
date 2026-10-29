// 2.0.7: шахматы с картинками фигур и клеток (браузер; в `npm test` не входит): 32 фигуры-картинки, доска и портрет Бобра в экране, нет горизонтальной прокрутки на 320/390/1000 px.
const { launch } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path'); const URL = 'file://' + path.join(__dirname, '..', 'index.html#dev-map');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await launch();
  for (const w of [320, 390, 1000]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, hasTouch: w < 500, isMobile: w < 500 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL); await sleep(1800);
    await p.evaluate(() => Screens.open('library')); await sleep(300); await p.click('button[data-tab=chess]'); await sleep(300);
    await p.click('[data-chess-new="1"]'); await sleep(1500);
    const r = await p.evaluate(() => { const bd = document.querySelector('.ch-board, .chess-board') || document.querySelector('[class*=board]'); const imgs = [...document.querySelectorAll('.ch-board img, .chess-board img, [class*=ch-] img')]; return { pieces: imgs.filter((i) => /chess\/(w|b)-/.test(i.src)).length, loaded: imgs.filter((i) => /chess\/(w|b)-/.test(i.src) && i.complete && i.naturalWidth > 0).length, bob: !!document.querySelector('.npc-portrait img[src*="chess/bob"]'), sq: getComputedStyle(document.querySelector('[style*="--sq-l"]') || document.body).getPropertyValue('--sq-l').includes('sq-light'), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
    ok(r.pieces === 32, `${w}px: 32 фигуры-картинки (${r.pieces})`); ok(r.loaded === r.pieces, `${w}px: все картинки фигур загружены`);
    ok(r.bob, `${w}px: портрет Бобра`); ok(r.sq, `${w}px: клетки доски из картинок`); ok(r.sw <= r.cw + 1, `${w}px: нет горизонтальной прокрутки (${r.sw}/${r.cw})`);
    ok(errs.length === 0, `${w}px: без ошибок страницы ${errs.join(';')}`); await ctx.close();
  }
  await b.close(); console.log(bad ? `\nchess207.e2e: ошибок ${bad}` : '\nchess207.e2e: всё в порядке'); process.exit(bad ? 1 : 0);
})();
