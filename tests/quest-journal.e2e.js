// Проверка сводного журнала: состояния, навигация, отсутствие удалённой выдачи награды.
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch } = require('../tools/browser.js');
const URL = process.env.WIP_URL || 'file://' + path.join(__dirname, '..', 'index.html#dev-map-village');
(async () => {
  const browser = await launch();
  try {
    for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 500 });
      const p = await ctx.newPage(), errors = [];
      p.on('pageerror', e => errors.push(e.message));
      await p.goto(URL);
      await p.waitForFunction(() => typeof Screens !== 'undefined' && typeof MapView !== 'undefined' && !!MapView.map);
      await p.evaluate(() => {
        Profile.data.accepted = { 'first-blood': true }; Profile.data.quests = {}; Profile.data.wins = 0;
        Screens.openQuestJournal();
      });
      assert.equal(await p.locator('.journal-quest').count(), 1);
      assert.equal(await p.locator('.journal-quest progress').getAttribute('value'), '0');
      await p.evaluate(() => { Profile.data.wins = 1; Screens.refresh(); });
      await p.locator('.quest-journal [data-tab="ready"]').click();
      assert.equal(await p.locator('.journal-quest.quest-ready').count(), 1);
      assert.equal(await p.locator('.journal-quest [data-claim]').count(), 0);
      assert.equal(await p.evaluate(() => Screens.questPending()), 1);
      await p.locator('.journal-quest [data-quest-locate]').click();
      assert.equal(await p.locator('.quest-journal').count(), 0);
      assert.equal(await p.locator('.coach-ring').count(), 1);
      await p.evaluate(() => { Profile.data.quests['first-blood'] = true; Screens.openQuestJournal(); });
      await p.locator('.quest-journal [data-tab="done"]').click();
      assert.equal(await p.locator('.journal-quest.is-done').count(), 1);
      assert.equal(await p.evaluate(() => Screens.questPending()), 0);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
