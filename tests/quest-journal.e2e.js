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
      await p.waitForFunction(() => typeof Profile !== 'undefined' && Profile.data.testX10 === true && typeof MapView !== 'undefined' && !!MapView.map && document.body.classList.contains('mode-map'));
      // Фильтры не меняют мир, а выбранные настройки остаются в браузере.
      await p.locator('#m-more').click();
      await p.locator('#mm-map-filters').click();
      const ordinary = p.locator('#mm-sub-map [data-map-filter="ordinary"]');
      assert.equal(await ordinary.getAttribute('aria-pressed'),'true');
      const before = await p.evaluate(() => MapView.map.spawns.length);
      await ordinary.click();
      assert.equal(await ordinary.getAttribute('aria-pressed'),'false');
      assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('wip-map-filters')).ordinary),true);
      assert.equal(await p.evaluate(() => MapView.map.spawns.length),before);
      assert.equal(await p.locator('#map-view.hide-map-ordinary').count(),1);
      const icons = p.locator('#l-mon .mon:not(.boss):not(.elite):not(.rare):not(.next-step):not(.want):not(.next-glow)');
      if (await icons.count()) assert.equal(await icons.first().evaluate(e => getComputedStyle(e).display),'none');
      await p.locator('#mm-sub-map [data-map-filter="all"]').click();
      assert.equal(await ordinary.getAttribute('aria-pressed'),'true');
      assert.equal(await p.locator('#map-view.hide-map-ordinary').count(),0);
      await p.locator('#m-more').click();
      // Вход в другую местность показывает название, не перекрывая управление.
      await p.evaluate(() => {
        const c = MapView.map.cells.find(c => c.d > HexMap.VILLAGE_R && c.terrain === 'forest' && HexMap.passable(MapView.map,c.idx));
        if (!c) throw Error('Нет леса для проверки');
        MapView.devTeleport(c.idx);
      });
      await p.locator('.region-banner.show').waitFor();
      assert.equal(await p.locator('.region-banner').innerText(),await p.evaluate(() => HexMap.TERRAIN.forest.name));
      assert.equal(await p.locator('.region-banner').evaluate(e => getComputedStyle(e).pointerEvents),'none');
      await p.evaluate(() => MapView.devTeleport(HexMap.center(MapView.map)));
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
