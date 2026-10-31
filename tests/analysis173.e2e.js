// 1.7.3: кнопка «Анализ боя» в окне итога (браузер; в `npm test` не входит).
const { launch } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await launch();
  for (const [vp, touch, lang] of [[[1280, 800], false, 'ru'], [[390, 844], true, 'ru'], [[1280, 800], false, 'en']]) {
    const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] }, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript((l) => { try { localStorage.setItem('wip-lang', l); } catch (e) {} }, lang);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL + '#dev-fight-ogre-4-solo'); await sleep(2200);
    const tag = `${vp[0]}px ${lang}`;
    await p.evaluate(() => { for (const k in RULES.timing) RULES.timing[k] = 5; });
    await p.waitForFunction(() => !busy && /^(Ваш ход|Your turn)/.test(document.getElementById('status').textContent), null, { timeout: 25000 });
    // ход существа с оглушением, затем поражение героя
    await p.evaluate(async () => { fighters.left.stats.block = 0; fighters.right.turnNo = 4; busy = true; await enemyTurn(); });
    await p.waitForFunction(() => !busy, null, { timeout: 25000 });
    await p.evaluate(() => { fighters.left.hp = 0; checkEnd(); });
    await p.waitForSelector('.overlay .rw-more-btn', { timeout: 8000 });
    ok(true, tag + ': кнопка есть в окне итога');
    ok(await p.evaluate(() => document.querySelector('.overlay .analysis').hidden), tag + ': панель скрыта до нажатия');
    await p.evaluate(() => { const b = document.querySelector('.overlay .rw-more-btn'); const m = document.querySelector('.overlay .rw-more'); if (b && m && m.hidden) b.click(); }); await p.click('.overlay .an-btn');
    const t = await p.evaluate(() => { const a = document.querySelector('.overlay .analysis'); const r = a.getBoundingClientRect(); return { hidden: a.hidden, text: a.textContent, bottom: r.bottom, h: innerHeight, btn: document.querySelector('.to-map').getBoundingClientRect().bottom }; });
    ok(!t.hidden && t.text.length > 60, tag + ': анализ показан «' + t.text.slice(0, 90).replace(/\s+/g, ' ') + '»');
    ok(lang === 'en' ? !/[А-Яа-я]/.test(t.text) : /Нанесено урона/.test(t.text), tag + ': язык текста');
    ok(t.btn <= t.h + 1, tag + ': кнопка «На карту» остаётся на экране');
    await p.evaluate(() => { const b = document.querySelector('.overlay .rw-more-btn'); const m = document.querySelector('.overlay .rw-more'); if (b && m && m.hidden) b.click(); }); await p.click('.overlay .an-btn');
    ok(await p.evaluate(() => document.querySelector('.overlay .analysis').hidden), tag + ': повторное нажатие прячет панель');
    ok(errs.length === 0, tag + ': без ошибок страницы ' + errs.join('; '));
    if (vp[0] === 1280 && lang === 'ru') { await p.evaluate(() => { const b = document.querySelector('.overlay .rw-more-btn'); const m = document.querySelector('.overlay .rw-more'); if (b && m && m.hidden) b.click(); }); await p.click('.overlay .an-btn'); await p.screenshot({ path: '/tmp/A2/shots/analysis.png' }); }
    await ctx.close();
  }
  await b.close(); console.log(bad ? `\nПровалено: ${bad}` : '\nanalysis173.e2e: всё в порядке'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
