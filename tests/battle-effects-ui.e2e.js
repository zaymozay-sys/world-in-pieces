// Боевой интерфейс: категории эффектов, длительность, карточка бойца.
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch } = require('../tools/browser.js');
const URL = process.env.WIP_URL || 'file://' + path.join(__dirname, '..', 'index.html#dev-fight-wolf-1-solo');
(async () => {
  const browser = await launch();
  try {
    for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 500 });
      const p = await ctx.newPage(), errors = [];
      p.on('pageerror', e => errors.push(e.message));
      await p.goto(URL);
      await p.waitForFunction(() => document.body.classList.contains('mode-battle') && !!document.querySelector('#fighter-left .avatar'));
      await p.evaluate(() => {
        const f = fighters.left;
        f.buffs = [{ kind: 'power', turns: 2, pct: 10 }, { kind: 'weaken', turns: 3, pct: -10 }];
        f.magic = true;
        renderBadge('left');
      });
      assert.equal(await p.locator('#fighter-left .badge .fx-good').count(), 1);
      assert.equal(await p.locator('#fighter-left .badge .fx-bad').count(), 1);
      assert.equal(await p.locator('#fighter-left .badge .fx-magic').count(), 1);
      await p.locator('#fighter-left .avatar').click();
      assert.equal(await p.locator('.fi-pop .fi-effect.good').count(), 1);
      assert.equal(await p.locator('.fi-pop .fi-effect.bad').count(), 1);
      assert.ok((await p.locator('.fi-pop .fi-effect.bad b').textContent()).includes('3'));
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
