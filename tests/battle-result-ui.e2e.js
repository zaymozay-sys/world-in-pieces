// Итого боя: победа и поражение в двух размерах экрана.
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch } = require('../tools/browser.js');
const base = process.env.WIP_URL || 'file://' + path.join(__dirname, '..', 'index.html');
(async () => {
  const browser = await launch();
  try {
    for (const width of [390, 1280]) {
      for (const outcome of ['win', 'loss']) {
        const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 500 });
        const p = await ctx.newPage(), errors = [];
        p.on('pageerror', e => errors.push(e.message));
        await p.goto(base + '#dev-result-' + outcome);
        const panel = p.locator('.battle-result.result-' + outcome);
        await panel.waitFor({ state: 'visible', timeout: 20000 });
        assert.equal(await panel.locator('.result-metric').count(), 4);
        assert.equal(await panel.locator('.rw-title').count(), 1);
        assert.equal(await panel.locator('.to-map').count(), 1);
        if (await panel.locator('.rw-block').count()) {
          const progress = panel.locator('.result-xp progress').first();
          assert.ok(await progress.count());
          const n = Number(await progress.getAttribute('value'));
          assert.ok(n >= 0 && n <= 100);
        }
        const more = panel.locator('.rw-more-btn');
        if (await more.count()) {
          await more.click();
          assert.equal(await more.getAttribute('aria-expanded'), 'true');
        }
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        assert.deepEqual(errors, []);
        await ctx.close();
        console.log(`Результат ${outcome}, ${width}px: OK`);
      }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
