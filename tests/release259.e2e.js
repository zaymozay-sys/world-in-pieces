// Проверка релиза: загрузка сохранения 2.5.8, прежний прогресс и отсутствие старых очков/быстрого боя.
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch } = require('../tools/browser.js');
const base = process.env.WIP_URL || 'file://' + path.join(__dirname, '..', 'index.html');
(async () => {
  const browser = await launch();
  try {
    const seedCtx = await browser.newContext();
    const seedPage = await seedCtx.newPage();
    await seedPage.goto(base + '#dev-map-village');
    await seedPage.waitForFunction(() => typeof Profile !== 'undefined' && Profile.data.testX10 === true && !!MapView.map);
    const fixture = await seedPage.evaluate(() => {
      const d = Profile.data;
      d.coins = 123456; d.xp = Hero.totalFor(21); d.wins = 42;
      const entry = Gear.makeEntry('sword-novice', 2); Profile.addItem(entry);
      d.seenVersion = '2.5.8'; d.testX10 = false; d.testAllSpells = false;
      return { data: Profile.exportSave(), uid: entry.uid, seed: d.map.seed, coins: d.coins, xp: d.xp, wins: d.wins };
    });
    await seedCtx.close();
    for (const lang of ['ru', 'en']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      await context.addInitScript(({ fixture, lang }) => {
        localStorage.setItem('wip-lang', lang);
        if (!sessionStorage.getItem('release259-fixture')) {
          sessionStorage.setItem('release259-fixture', '1');
          localStorage.setItem('gem-match-profile-v2', fixture.data);
        }
      }, { fixture, lang });
      const p = await context.newPage(), errors = [];
      p.on('pageerror', e => errors.push(e.message));
      await p.goto(base);
      await p.waitForFunction(() => typeof Profile !== 'undefined' && !!MapView.map);
      await p.waitForFunction(() => Profile.data.seenVersion === GAME_VERSION && Screens.screen === 'whatsnew');
      await p.locator('.modal-back .modal header button.close').click();
      await p.waitForFunction(() => !Screens.isOpen);
      const actual = await p.evaluate(uid => ({ coins: Profile.data.coins, xp: Profile.data.xp, wins: Profile.data.wins, seed: Profile.data.map.seed, item: !!Profile.item(uid) }), fixture.uid);
      assert.deepEqual(actual, { coins: fixture.coins, xp: fixture.xp, wins: fixture.wins, seed: fixture.seed, item: true });
      await p.evaluate(() => { Screens.close(); Inventory.open('left', { armory: true }); });
      const tabs = p.locator('[data-itab="gear"]');
      if (await tabs.isVisible()) await tabs.click();
      assert.equal(await p.locator('.home-modal .budget').count(), 0);
      const titles = await p.locator('.stash-cell[data-stash]').evaluateAll(cells => cells.map(c => c.title));
      assert.ok(titles.length > 0);
      assert.equal(titles.some(t => /\bpts\b|\d+\s+оч\./i.test(t)), false);
      await p.evaluate(uid => ItemInfo.open(uid), fixture.uid);
      assert.equal(await p.locator('.icard-modal .ic-nums > span').count(), 2);
      assert.equal(await p.locator('.icard-modal .ic-nums .money').count(), 2);
      await p.evaluate(() => {
        ItemInfo.close(); Inventory.close();
        const sp = MapView.map.spawns.find(s => MapView.alive(s) && !s.boss);
        if (sp) MapView.devShowMonster(sp);
      });
      assert.equal(await p.locator('[data-act="quick"]').count(), 0);
      assert.equal(await p.evaluate(() => Hero.pointsOn() || World.QUICK.enabled), false);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`2.5.9: старое сохранение и очистка интерфейса (${lang}) — OK`);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
