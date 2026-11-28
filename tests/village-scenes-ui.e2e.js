// Проверка оформления деревни и операций банка в изолированном профиле.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { launch } = require('../tools/browser.js');
const URL = process.env.WIP_URL || 'file://' + path.join(__dirname, '..', 'index.html#dev-map-village');
const scenes = ['tavern', 'mill', 'lighthouse', 'library', 'artistWorkshop', 'jeweler', 'junker', 'kennel', 'alchemist', 'market', 'village', 'arena', 'bank', 'valor', 'best'];
const screenshots = new Set(['library', 'alchemist', 'kennel', 'bank', 'arena', 'valor']);
(async () => {
  const browser = await launch();
  try {
    for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 500 });
      const p = await ctx.newPage(), errors = [];
      p.on('pageerror', e => errors.push(e.message));
      await p.goto(URL);
      await p.waitForFunction(() => typeof Profile !== 'undefined' && Profile.data.testX10 === true && typeof MapView !== 'undefined' && !!MapView.map && document.body.classList.contains('mode-map'));
      await p.evaluate(() => { Profile.data.wins = 100; Profile.data.xp = Hero.totalFor(51); Profile.data.coins = 100000; });
      const colors = new Set();
      for (const scene of scenes) {
        await p.evaluate(id => { Screens.close(); Screens.open(id); }, scene);
        const modal = p.locator('.scene-theme[data-scene="' + scene + '"]');
        await modal.waitFor({ state: 'visible' });
        colors.add(await modal.evaluate(el => getComputedStyle(el).getPropertyValue('--scene-accent').trim()));
        assert.equal(await modal.locator('header .close').count(), 1);
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        if (screenshots.has(scene) && process.env.CI) {
          const dir = path.join(__dirname, '..', 'test-results', 'ui-scenes');
          fs.mkdirSync(dir, { recursive: true });
          await p.screenshot({ path: path.join(dir, scene + '-' + width + '.png') });
        }
      }
      assert.equal(colors.size, scenes.length);
      await p.evaluate(() => { Screens.close(); Screens.open('bank'); });
      const cap = await p.evaluate(() => Bank.capFor(Hero.priceScale(Profile.level())));
      assert.equal(Number(await p.locator('.bank-limit .money').getAttribute('data-n')), cap);
      const before = await p.evaluate(() => ({ dep: Profile.data.bank.dep, coins: Profile.data.coins }));
      const button = p.locator('.bank-buttons [data-bank="dep"]:enabled').first();
      const n = Number(await button.getAttribute('data-n'));
      await button.click();
      const after = await p.evaluate(() => ({ dep: Profile.data.bank.dep, coins: Profile.data.coins }));
      assert.equal(after.dep, before.dep + n);
      assert.equal(after.coins, before.coins - n);
      assert.equal(Number(await p.locator('.bank-balance .money').getAttribute('data-n')), after.dep);
      assert.deepEqual(errors, []);
      await ctx.close();
      console.log(`Деревня: ${scenes.length} окон, банк, ${width}px — OK`);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
