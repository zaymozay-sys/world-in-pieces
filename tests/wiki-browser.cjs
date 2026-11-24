const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  let failures = 0;
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto('https://zaymozay-sys.github.io/world-in-pieces/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForFunction(() => typeof Screens !== 'undefined' && typeof Wiki !== 'undefined', { timeout: 30000 });
      await page.evaluate(() => Screens.open('wiki'));
      await page.locator('.wiki-filterbar [data-wfilter="m:"]').click();
      const creatureCount = await page.locator('.wiki-res [data-wart^="m:"]').count();
      if (!creatureCount) throw new Error('Creature filter returned no articles');
      await page.locator('.wiki-res [data-wart^="m:"]').first().click();
      await page.locator('.wiki-codex').waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      if (overflow) throw new Error('Horizontal viewport overflow');
      await page.locator('[data-wback]').click();
      await page.locator('[data-wfilter="all"]').click();
      await page.locator('[data-wq]').fill('бой');
      if (!(await page.locator('.wiki-res [data-wart]').count())) throw new Error('Search returned no articles');
      await page.evaluate(() => Screens.open('forge'));
      await page.locator('[data-act="wiki-context"]').click();
      if (await page.evaluate(() => Screens.screen) !== 'wiki') throw new Error('Help did not open wiki');
      await page.locator('[data-wback]').click();
      if (await page.evaluate(() => Screens.screen) !== 'forge') throw new Error('Help did not return to forge');
      if (errors.length) throw new Error('Page errors: ' + errors.join('; '));
      console.log('PASS ' + width + 'px: filters, search, article, overflow, contextual help');
    } catch (error) {
      failures++;
      console.error('FAIL ' + width + 'px: ' + error.message);
      await page.screenshot({ path: 'wiki-test-' + width + '.png', fullPage: true }).catch(() => {});
    } finally { await page.close(); }
  }
  await browser.close();
  if (failures) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
