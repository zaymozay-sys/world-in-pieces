// Витрина, фильтры и панель материалов кузницы: без изменения игровых данных.
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch } = require('../tools/browser.js');
const URL = process.env.WIP_URL || 'file://' + path.join(__dirname, '..', 'index.html#dev-map-village');
(async () => {
  const browser = await launch();
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 500 });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(URL);
      await page.waitForFunction(() => typeof Profile !== 'undefined' && Profile.data.testX10 === true && typeof MapView !== 'undefined' && !!MapView.map && document.body.classList.contains('mode-map'));
      await page.evaluate(() => { Profile.data.wins = 25; Profile.data.xp = Hero.totalFor(21); Profile.data.coins = 0; Screens.open('forge'); });
      await page.locator('[data-tab="craft"]').click();
      assert.ok(await page.locator('.craft-unit .forge-readiness progress').count() > 0);
      await page.locator('[data-forge-ready]').click();
      assert.equal(await page.locator('.craft-unit').count(), 0);
      await page.locator('[data-forge-ready]').click();
      assert.ok(await page.locator('.craft-unit').count() > 0);
      await page.evaluate(() => Screens.open('shop'));
      assert.equal(await page.locator('.shop-catalog.shop-grid-view').count(), 1);
      const art = await page.locator('.shop-grid-view > .card > .icon-wrap').first().evaluate(e => {
        const card = e.parentElement.getBoundingClientRect(), a = e.getBoundingClientRect();
        const icon = e.querySelector('.item-icon').getBoundingClientRect();
        return {center: Math.abs((card.left+card.right-a.left-a.right)/2), size:a.width, icon:icon.width};
      });
      assert.ok(art.center <= 3, 'Изображение товара должно быть по центру: '+JSON.stringify(art));
      assert.ok(art.size >= (width === 390 ? 100 : 135), 'Витрина должна показывать крупный предмет: '+JSON.stringify(art));
      assert.ok(art.icon >= art.size-16, 'Предмет должен занимать почти всю рамку');
      await page.evaluate(() => ItemInfo.open('base:sword-novice:1'));
      const seal = await page.locator('.scroll[style*="--seal"] .ic-close').evaluate(e => {
        const c=getComputedStyle(e); return [c.backgroundColor,c.backgroundImage,c.boxShadow,getComputedStyle(e,'::before').backgroundImage];
      });
      assert.deepEqual(seal.slice(0,3), ['rgba(0, 0, 0, 0)','none','none']);
      assert.notEqual(seal[3],'none','Изображение печати сохранено');
      await page.evaluate(() => ItemInfo.close());

      await page.locator('[data-shop-view="list"]').click();
      assert.equal(await page.locator('.shop-catalog.shop-grid-view').count(), 0);
      await page.locator('[data-shop-view="affordable"]').click();
      assert.equal(await page.locator('.shop-catalog > .card:not([hidden]) [data-buy-cat]').count(), 0);
      await page.locator('[data-shop-view="affordable"]').click();
      await page.locator('[data-shop-view="grid"]').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.equal(await page.evaluate(() => Profile.data.coins), 0);
      // Недоступная покупка не должна выдавать печать успеха.
      assert.equal(await page.locator('.workshop-success').count(), 0);
      await page.evaluate(() => { Profile.data.coins = 1e7; Screens.refresh(); });
      await page.locator('.shop-catalog [data-buy-cat]:enabled').first().click();
      assert.equal(await page.locator('.workshop-success.shop-seal').count(), 1);
      await page.evaluate(() => {
        for (const kind of Object.keys(Bestiary.RESOURCES)) for (let tier = 1; tier <= 3; tier++) Profile.addRes(kind, tier, 10000);
        Screens.open('forge');
      });
      await page.locator('[data-tab="craft"]').click();
      await page.locator('.craft-unit [data-craft]:enabled').first().click();
      assert.equal(await page.locator('.workshop-success.forge-spark').count(), 1);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`Кузница и Лавка ${width}px: проверка пройдена`);
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
