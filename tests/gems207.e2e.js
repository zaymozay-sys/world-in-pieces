// 2.0.7: гнездо самоцвета в карточке вещи + пробойник у Журавля. Браузер; в `npm test` не входит.
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
    const uid = await p.evaluate(() => { Profile.data.coins = 5000000; const e = Gear.makeEntry('granite-chest', 5); Profile.addItem(e); Profile.addRes('resin', 5, 10); Profile.save(); return e.uid; });
    const icons = await p.evaluate(() => { const bad = []; for (const it of Gear.ITEMS) { try { const s = itemIcon('', '', it.id); if (!s || s.length < 20) bad.push(it.id); } catch (e) { bad.push(it.id + ':' + e.message); } } return bad; });
    ok(icons.length === 0, `${w}px: значки всех вещей рисуются ` + icons.join(','));
    // карточка: гнезда нет, кнопка пробить неактивна без пробойника
    await p.evaluate((u) => ItemInfo.open(u), uid); await sleep(300);
    ok(await p.locator('[data-gem=drill]').count() === 1 && await p.locator('[data-gem=drill]').isDisabled(), `${w}px: без пробойника «Пробить гнездо» недоступна`);
    ok(await p.locator('.ic-gem .ic-socket').count() === 0, `${w}px: гнезда в вещи ещё нет`);
    // покупка пробойника у Журавля
    await p.evaluate(() => { ItemInfo.close(); Screens.close(); Screens.open('artistWorkshop'); }); await sleep(400);
    await p.locator('[data-buy-punch]').click(); await sleep(200);
    ok(await p.evaluate(() => Profile.stones().punch) === 1, `${w}px: пробойник куплен`);
    // пробить гнездо
    await p.evaluate((u) => { Screens.close(); ItemInfo.open(u); }, uid); await sleep(300);
    await p.locator('[data-gem=drill]').click(); await sleep(200);
    ok(await p.evaluate((u) => Stones.gemList(Profile.item(u)).length === 1 && Profile.stones().punch === 0, uid), `${w}px: гнездо пробито, пробойник потрачен`);
    ok(await p.evaluate(() => Profile.res('resin', 5)) === 10, `${w}px: смола при пробивании не тратится`);
    ok(await p.locator('.ic-gem .ic-socket').count() === 1, `${w}px: в карточке появилось гнездо`);
    // вставка самоцвета и бонус
    await p.evaluate((u) => { Stones.add(Profile.stones(), 4, 2); Profile.save(); ItemInfo.close(); ItemInfo.open(u); }, uid); await sleep(300);
    const before = await p.evaluate((u) => Runes.bonusForGear({ chest: Profile.item(u) }).health, uid);
    await p.locator('[data-gem-insert="4"]').click(); await sleep(200);
    const after = await p.evaluate((u) => Runes.bonusForGear({ chest: Profile.item(u) }).health, uid);
    ok(after - before === (await p.evaluate(() => Stones.gemBonus(4).health)), `${w}px: самоцвет даёт бонус (+${after - before} здоровья)`);
    ok(await p.evaluate(() => Profile.res('resin', 5)) === 10 - (await p.evaluate(() => Stones.fixCost(5).resin)), `${w}px: смола потрачена на крепление`);
    ok(await p.evaluate(() => Profile.stones().bag[4]) === 1, `${w}px: самоцвет ушёл из запаса`);
    // извлечь
    await p.locator('[data-gem=remove]').click(); await sleep(200);
    ok(await p.evaluate((u) => !Stones.gemList(Profile.item(u))[0] && Profile.stones().bag[4] === 2, uid), `${w}px: самоцвет вернулся в запас`);
    // вёрстка: ничего не вылезает за экран
    const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    ok(!over, `${w}px: нет горизонтальной прокрутки`);
    ok(errs.length === 0, `${w}px: без ошибок страницы ` + errs.join('|'));
    await ctx.close();
  }
  await b.close();
  console.log(bad ? 'gems207 e2e: ПРОВАЛ (' + bad + ')' : 'gems207 e2e: всё в порядке');
  process.exit(bad ? 1 : 0);
})();
