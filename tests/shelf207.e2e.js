// 2.0.7: витрины с корзиной (Алхимик, Бобёр, Лавка). Браузер; в `npm test` не входит.
const { launch } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path'); const URL = 'file://' + path.join(__dirname, '..', 'index.html#dev-map');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await launch();
  for (const w of [390, 1000]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, hasTouch: w < 500, isMobile: w < 500 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL); await sleep(1800);
    // дадим монеты и ресурсы
    await p.evaluate(() => { Profile.data.coins = 5000000; for (const k of Object.keys(Bestiary.RESOURCES)) for (let t = 1; t <= 4; t++) Profile.addRes(k, t, 20); Profile.save(); });
    // Алхимик
    await p.evaluate(() => Screens.open('alchemist')); await sleep(300);
    ok(await p.locator('.sh-card').count() >= 14, `${w}px: полки эликсиров (${await p.locator('.sh-card').count()})`);
    ok(await p.locator('.sh-card.locked').count() === 1, `${w}px: «Стойкость» под замком`);
    const plus = p.locator('.sh-card:not(.locked) [data-sh=inc]'); await plus.nth(0).click(); await plus.nth(0).click(); await plus.nth(1).click(); await sleep(150);
    ok(await p.locator('.sh-line').count() === 2, `${w}px: в корзине 2 строки`);
    await p.locator('.sh-line [data-sh=del]').first().click(); await sleep(150);
    ok(await p.locator('.sh-line').count() === 1, `${w}px: строка убирается`);
    const before = await p.evaluate(() => Profile.elixirBag().reduce((a, e) => a + e.n, 0));
    await p.locator('[data-sh=pay]').click(); await sleep(300);
    const after = await p.evaluate(() => Profile.elixirBag().reduce((a, e) => a + e.n, 0));
    ok(after === before + 1, `${w}px: заказ оформлен (${before}→${after})`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${w}px: нет горизонтального скролла`);
    if (w === 1000) await p.screenshot({ path: '/tmp/shelf-alch.png' });
    // Бобёр
    await p.evaluate(() => Screens.open('library')); await sleep(300); await p.click('button[data-tab=scrolls]'); await sleep(300);
    ok(await p.locator('.sh-card').count() === 2, `${w}px: два свитка на полке`);
    await p.locator('[data-sh=inc]').first().click(); await sleep(150);
    const sb = await p.evaluate(() => Object.values(Profile.data.backpack).reduce((a, n) => a + n, 0));
    await p.locator('[data-sh=pay]').click(); await sleep(300);
    ok(await p.evaluate((x) => Object.values(Profile.data.backpack).reduce((a, n) => a + n, 0) === x + 1, sb), `${w}px: свиток получен`);
    // Лавка
    await p.evaluate(() => { Profile.data.level = Math.max(Profile.data.level || 1, 12); }); 
    await p.evaluate(() => Screens.open('shop')); await sleep(300);
    ok(await p.locator('.sh-grid .sh-card.locked').count() >= 3, `${w}px: уникальные комплекты под замком (${await p.locator('.sh-grid .sh-card.locked').count()})`);
    const addBtn = p.locator('.card [data-sh=inc]').first(); await addBtn.click(); await sleep(150);
    ok(await p.locator('.sh-basket .sh-line').count() === 1, `${w}px: вещь в корзине Лавки`);
    const items0 = await p.evaluate(() => Profile.data.items.length);
    await p.locator('[data-sh=pay]').click(); await sleep(300);
    ok(await p.evaluate(() => Profile.data.items.length) === items0 + 1, `${w}px: вещь куплена`);
    if (w === 1000) await p.screenshot({ path: '/tmp/shelf-shop.png' });
    ok(errs.length === 0, `${w}px: без ошибок страницы ${errs.join(';')}`); await ctx.close();
  }
  await b.close(); console.log(bad ? `\nshelf207.e2e: ошибок ${bad}` : '\nshelf207.e2e: всё в порядке'); process.exit(bad ? 1 : 0);
})();
