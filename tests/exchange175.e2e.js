// 1.7.5: вкладка «Обмен» в Кузнице (браузер; в `npm test` не входит).
const { launch } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const URL = 'file://' + require('path').join(__dirname, '..', 'index.html');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await launch();
  for (const [vp, touch, lang] of [[[1280, 800], false, 'ru'], [[390, 844], true, 'en']]) {
    const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] }, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript((l) => { try { localStorage.setItem('wip-lang', l); } catch (e) {} }, lang);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL + '#dev-map-meadow'); await sleep(4000);
    const tag = `${vp[0]}px ${lang}`;
    await p.evaluate(() => { Profile.addRes('hide', 2, 7); Profile.data.monster = Profile.data.monster || {}; Screens.open('forge'); });
    await sleep(300);
    await p.click('[data-tab=swap]'); await sleep(200);
    const r = await p.evaluate(() => ({ btns: document.querySelectorAll('[data-swap]').length, txt: document.querySelector('.screen-body').textContent }));
    ok(r.btns >= 2, tag + ': кнопки обмена есть');
    ok(lang === 'en' ? !/[А-Яа-я]/.test(r.txt.replace(/[^\x00-\x7FЀ-ӿ]/g, '')) || /Where to get/.test(r.txt) : /Где добыть/.test(r.txt), tag + ': «где добыть» показано');
    await p.click('[data-swap="hide:2:up"]'); await sleep(200);
    ok(await p.evaluate(() => Profile.res('hide', 2) === 4 && Profile.res('hide', 3) === 1), tag + ': 3 → 1 вверх');
    await p.click('[data-swap="hide:2:down"]'); await sleep(200);
    ok(await p.evaluate(() => Profile.res('hide', 2) === 3 && Profile.res('hide', 1) === 2), tag + ': 1 → 2 вниз');
    if (vp[0] === 1280) await p.screenshot({ path: '/tmp/A2/shots/swap.png' });
    ok(errs.length === 0, tag + ': без ошибок страницы ' + errs.join('; '));
    await ctx.close();
  }
  await b.close(); console.log(bad ? `\nПровалено: ${bad}` : '\nexchange175.e2e: всё в порядке'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
