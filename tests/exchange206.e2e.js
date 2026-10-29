// 2.0.6: вкладка «Обмен» в Кузнице: выбор количества, минимум, потеря ≥10% (браузер; в `npm test` не входит).
const { launch } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const URL = 'file://' + require('path').join(__dirname, '..', 'index.html');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await launch();
  for (const [vp, touch, lang] of [[[1280, 800], false, 'ru'], [[390, 844], true, 'en'], [[320, 568], true, 'ru'], [[740, 360], true, 'en']]) {
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
    // минимум для 2→3 — 3 шт. (потеря ≥10%), по умолчанию стоит минимум
    ok(await p.evaluate(() => document.querySelector('[data-swap="hide:2:up"]').textContent.includes('3 → 1')), tag + ': по умолчанию 3 → 1');
    await p.click('[data-swap="hide:2:up"]'); await sleep(200);
    ok(await p.evaluate(() => Profile.res('hide', 2) === 4 && Profile.res('hide', 3) === 1), tag + ': 3 → 1 вверх');
    await p.click('[data-swapq="hide:2:up:max"]'); await sleep(200);
    ok(await p.evaluate(() => document.querySelector('[data-swap="hide:2:up"]').textContent.includes('4 → 1')), tag + ': «все» ставит 4, получим 1');
    await p.click('[data-swapq="hide:2:up:-1"]'); await sleep(100);
    ok(await p.evaluate(() => document.querySelector('.swap-n').textContent === '3' && document.querySelector('[data-swapq="hide:2:up:-1"]').disabled), tag + ': ниже минимума не опускается («−» отключена)');
    await p.click('[data-swap="hide:2:down"]'); await sleep(200);
    ok(await p.evaluate(() => Profile.res('hide', 2) === 3 && Profile.res('hide', 1) === 2), tag + ': 1 → 2 вниз');
    // подмена разметки не даёт больше положенного: количество берётся из состояния, не из data-*
    await p.evaluate(() => { const b = document.querySelector('[data-swap="hide:2:up"]'); b.dataset.swap = 'hide:2:up'; b.dataset.take = '1'; b.dataset.give = '99'; });
    await p.click('[data-swap="hide:2:up"]'); await sleep(200);
    ok(await p.evaluate(() => Profile.res('hide', 3) === 2 && Profile.res('hide', 2) === 0), tag + ': подмена data-take/give не действует');
    ok(await p.evaluate(() => { const q = Bestiary.exchangeQuote('ore', 6, 7, 2); return !q.ok; }), tag + ': руда 6→7 ×2 не даёт 1 шт.');
    // запас больше предела одной операции (EXCHANGE.maxTake = 999): «все» = 999, «+» отключена, повторный обмен
    for (const stock of [1000, 2000]) {
      await p.evaluate((st) => { Profile.data.res = Profile.data.res || {}; Profile.addRes('bone', 2, st - Profile.res('bone', 2)); Screens.open('forge'); }, stock);
      await sleep(200); await p.click('[data-tab=swap]'); await sleep(200);
      await p.evaluate(() => document.querySelector('[data-swapq="bone:2:up:min"]').click()); await sleep(100);
      await p.click('[data-swapq="bone:2:up:max"]'); await sleep(200);
      ok(await p.evaluate(() => document.querySelector('[data-swapq="bone:2:up:max"]').closest('.swap-dir').querySelector('.swap-n').textContent === '999'), tag + ': запас ' + stock + ': «все» = 999');
      ok(await p.evaluate(() => { const d = document.querySelector('[data-swapq="bone:2:up:max"]').closest('.swap-dir'); return d.querySelector('[data-swapq="bone:2:up:1"]').disabled && d.querySelector('[data-swap]').disabled === false; }), tag + ': «+» отключена, обмен активен');
      await p.click('[data-swapq="bone:2:up:-1"]'); await p.click('[data-swapq="bone:2:up:1"]'); await sleep(100);
      ok(await p.evaluate(() => document.querySelector('[data-swapq="bone:2:up:max"]').closest('.swap-dir').querySelector('.swap-n').textContent === '999'), tag + ': «−» затем «+» возвращает 999');
      await p.click('[data-swapq="bone:2:up:min"]'); await sleep(100);
      ok(await p.evaluate(() => Number(document.querySelector('[data-swapq="bone:2:up:max"]').closest('.swap-dir').querySelector('.swap-n').textContent) < 10), tag + ': «мин.» возвращает минимум');
      await p.evaluate(() => document.querySelector('[data-swapq="bone:2:up:max"]').click()); await sleep(100);
      const before = await p.evaluate(() => Profile.res('bone', 2));
      await p.evaluate(() => document.querySelector('[data-swap="bone:2:up"]').click()); await sleep(200);
      ok(await p.evaluate((b) => Profile.res('bone', 2) === b - 999, before), tag + ': обмен 999 за раз, остаток ' + (stock - 999));
      await sleep(100);
      ok(await p.evaluate((st) => { const m = document.querySelector('[data-swapq="bone:2:up:max"]'); return st === 1000 ? !m : m.closest('.swap-dir').querySelector('.swap-n').textContent === '999'; }, stock), tag + ': после обмена picker корректен (остаток ' + (stock - 999) + ')');
    }
    if (vp[0] === 1280) await p.screenshot({ path: '/tmp/swap206.png' });
    ok(errs.length === 0, tag + ': без ошибок страницы ' + errs.join('; '));
    await ctx.close();
  }
  await b.close(); console.log(bad ? `\nПровалено: ${bad}` : '\nexchange206.e2e: всё в порядке'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
