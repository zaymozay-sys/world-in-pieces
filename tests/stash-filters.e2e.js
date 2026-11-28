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
      await page.waitForFunction(() => typeof Inventory !== 'undefined' && typeof Profile !== 'undefined');
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
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`Оружейная ${width}px: проверка пройдена`);
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
