// Оружейная: фильтры, сортировка, сохранение индексов и мобильная раскладка.
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch } = require('../tools/browser.js');
const URL = process.env.WIP_URL || 'file://' + path.join(__dirname, '..', 'index.html#dev-map-village');
(async () => {
  const browser = await launch();
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 500 });
      await context.addInitScript(() => localStorage.setItem('wip-lang', 'ru'));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(URL);
      await page.waitForFunction(() => typeof Profile !== 'undefined' && Profile.data.testX10 === true && typeof MapView !== 'undefined' && !!MapView.map && document.body.classList.contains('mode-map'));
      await page.evaluate(() => {
        Profile.data.items = Profile.data.items.filter((e) => Profile.equippedUid(e.uid));
        for (const [id, tier] of [['sword-novice', 1], ['shield-wood', 3], ['sword-novice', 2]]) Profile.addItem(Gear.makeEntry(id, tier));
        Inventory.open('left', { armory: true });
      });
      const tabs = page.locator('[data-itab="gear"]');
      if (await tabs.isVisible()) await tabs.click();
      const panel = page.locator('.stash-controls');
      await panel.waitFor({ state: 'visible' });
      const selects = panel.locator('select'), cells = page.locator('.bag-gear [data-stash]:not([hidden])');
      const original = await page.evaluate(() => JSON.stringify(Profile.data.stash));
      await selects.nth(0).selectOption('shield');
      assert.equal(await cells.count(), 1);
      await selects.nth(1).selectOption('1');
      assert.equal(await cells.count(), 0);
      assert.equal(await panel.locator('.stash-summary').textContent(), 'Нет подходящих вещей');
      await panel.locator('.stash-reset').click();
      assert.equal(await cells.count(), 3);
      await selects.nth(2).selectOption('tier');
      const sorted = await cells.evaluateAll((items) => items.map((c) => Gear.item(Profile.item(Profile.data.stash[Number(c.dataset.stash)])).tier));
      assert.deepEqual(sorted, [3, 2, 1]);
      await selects.nth(2).selectOption('price');
      const prices = await cells.evaluateAll((items) => items.map((c) => Gear.item(Profile.item(Profile.data.stash[Number(c.dataset.stash)])).price));
      assert.deepEqual(prices, [...prices].sort((a, b) => b - a));
      assert.equal(await page.evaluate(() => JSON.stringify(Profile.data.stash)), original);
      await panel.locator('input').fill('несуществующая вещь');
      assert.equal(await cells.count(), 0);
      await panel.locator('.stash-reset').click();
      assert.equal(await cells.count(), 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      // Избранное сохраняется по uid, не по названию и цвету.
      const favoriteUid = await page.evaluate(() => Profile.data.items.find(e => !Profile.equippedUid(e.uid)).uid);
      await page.evaluate(uid => ItemInfo.open(uid), favoriteUid);
      await page.locator('.ic-favorite').click();
      assert.equal(await page.locator('.ic-favorite').getAttribute('aria-pressed'),'true');
      await page.evaluate(() => ItemInfo.close());
      await page.locator('.stash-controls select').nth(3).selectOption('yes');
      assert.equal(await cells.count(),1);
      assert.equal(await cells.locator('.item-favorite-mark').count(),1);
      await page.evaluate(() => Inventory.close());
      await page.evaluate(() => { Screens.open('shop'); });
      await page.locator('[data-tab="sell"]').click();
      assert.equal(await page.locator('[data-sell-item="'+favoriteUid+'"]').count(),0);
      // Устаревшая кнопка продажи тоже не может снять защиту.
      const snapshot = await page.evaluate(uid => {
        const coins = Profile.data.coins;
        const b = document.createElement('button'); b.dataset.sellItem=uid;
        document.querySelector('.modal .screen-body').append(b); b.click(); b.remove();
        return [!!Profile.item(uid), Profile.data.coins===coins, Profile.takeSaleItem(uid)];
      },favoriteUid);
      assert.deepEqual(snapshot,[true,true,false]);
      await page.evaluate(() => Screens.open('junker'));
      assert.equal(await page.locator('[data-junk-item="'+favoriteUid+'"]').count(),0);
      await page.locator('[data-junk-all]').click();
      assert.equal(await page.evaluate(uid => !!Profile.item(uid) && Profile.isFavorite(uid),favoriteUid),true);
      assert.equal(await page.evaluate(() => Profile.data.items.filter(e=>!Profile.equippedUid(e.uid)).length),1);
      await page.evaluate(() => Screens.close());
      await page.evaluate(uid => ItemInfo.open(uid),favoriteUid);
      await page.locator('.ic-favorite').click();
      assert.equal(await page.locator('.ic-favorite').getAttribute('aria-pressed'),'false');
      await page.evaluate(() => ItemInfo.close());
      assert.equal(await page.evaluate(uid => Profile.canSellItem(uid),favoriteUid),true);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`Оружейная ${width}px: проверка пройдена`);
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
