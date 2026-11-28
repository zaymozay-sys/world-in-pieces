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
      // Тайник: реальная выдача, компактное окно и значки выданных ресурсов.
      const loot = await page.evaluate(() => {
        const e = MapView.world.events.find(x => x.kind === 'cache');
        if (!e) return null;
        MapView.state.evUsed[e.id] = 0; MapView.showEvent(e);
        const coins = Profile.data.coins;
        document.querySelector('#map-card [data-ev="take"][data-mode="safe"]').click();
        const card = document.querySelector('#map-card .mc-compact-loot');
        return {coins:Profile.data.coins-coins, card:!!card, width:card?.getBoundingClientRect().width, icons:[...document.querySelectorAll('.mc-loot-item')].every(x=>!!x.querySelector('.mc-loot-icon') && !!x.querySelector('.mc-loot-label'))};
      });
      if (loot) {
        assert.ok(loot.coins > 0 && loot.card && loot.icons);
        assert.ok(loot.width <= Math.min(width,420)+1);
        await page.locator('#map-card [data-act="close"]').click();
      }
      await page.evaluate(() => { Profile.data.wins = 25; Profile.data.xp = Hero.totalFor(21); Profile.data.coins = 0; Screens.open('forge'); });
      await page.locator('[data-tab="craft"]').click();
      assert.ok(await page.locator('.craft-unit .forge-readiness progress').count() > 0);
      await page.locator('[data-forge-ready]').click();
      assert.equal(await page.locator('.craft-unit').count(), 0);
      await page.locator('[data-forge-ready]').click();
      assert.ok(await page.locator('.craft-unit').count() > 0);
      const material = page.locator('.craft-unit [data-material-find]').first();
      assert.ok(await material.count(), 'Не хватает материалов — доступен поиск');
      const [kind,tier] = (await material.getAttribute('data-material-find')).split(':');
      // Слишком слабые существа не дают ресурс: переход в лавку к нужному цвету.
      await page.evaluate(() => { Profile.data.xp = Hero.totalFor(100); });
      await material.click();
      assert.equal(await page.evaluate(() => Screens.screen),'shop');
      assert.equal(await page.locator('.material-target [data-buy-res="'+kind+'"]').count(),1);
      assert.equal(await page.locator('[data-restier="'+tier+'"]').evaluate(e => e.classList.contains('on')),true);
      await page.evaluate(() => { Profile.data.xp = Hero.totalFor(21); Screens.close(); });
      await page.evaluate(() => Screens.open('shop'));
      assert.equal(await page.locator('.shop-catalog.shop-grid-view').count(), 1);
      assert.equal(await page.locator('.shop-section:not([hidden])').count(), 1);
      assert.equal(await page.locator('.shop-gear').isVisible(), true);
      await page.locator('[data-shop-section="resources"]').click();
      assert.equal(await page.locator('.shop-resources').isVisible(), true);
      assert.equal(await page.locator('.shop-gear').isVisible(), false);
      await page.locator('[data-shop-section="cons"]').click();
      assert.equal(await page.locator('.shop-cons [data-buy-ammo]').isVisible(), true);
      await page.locator('[data-tab="sell"]').click();
      assert.equal(await page.locator('.shop-cons').isVisible(), true);
      await page.locator('[data-tab="buy"]').click();
      await page.locator('[data-shop-section="gear"]').click();
      await page.locator('[data-catsel="sort"]').selectOption('price');
      const prices = await page.locator('.shop-catalog [data-buy-cat]').evaluateAll(bs => bs.map(b => {
        const [id,tier] = b.dataset.buyCat.split(':');
        return Math.round(Gear.item({id,tier:Number(tier)}).price * Factions.perk(Profile.data.faction,'shop'));
      }));
      assert.ok(prices.length > 0 && prices.every((p,i) => !i || prices[i-1] <= p), 'Сортировка по фактической цене');
      await page.locator('[data-shq]').fill('zzzz-no-such-item');
      assert.equal(await page.locator('.shop-catalog > .card:not([hidden]) [data-buy-cat]').count(),0);
      await page.locator('[data-shop-view="reset"]').click();
      assert.ok(await page.locator('.shop-catalog > .card:not([hidden]) [data-buy-cat]').count() > 0);
      assert.equal(await page.locator('[data-shq]').inputValue(),'');
      assert.equal(await page.locator('[data-catsel="sort"]').inputValue(),'order');
      assert.ok(await page.locator('.shop-product .shop-price').count() > 0);
      assert.ok(await page.locator('.shop-product .shop-comparison').count() > 0);
      const beforeTry = await page.evaluate(() => JSON.stringify([Profile.data.items,Profile.data.loadout,Profile.data.coins]));
      await page.locator('.shop-product [data-tryon]').first().click();
      assert.equal(await page.locator('.tryon-stats').count(),1);
      await page.locator('[data-act="tryon-close"]').click();
      assert.equal(await page.evaluate(() => JSON.stringify([Profile.data.items,Profile.data.loadout,Profile.data.coins])), beforeTry);
      assert.ok(await page.locator('.shop-product .shop-unavailable').count() > 0, 'Нет монет — понятное объяснение');
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
      const sample = await page.evaluate(() => {
        const id=Gear.itemsFor(Profile.data.faction).find(x=>x.rarity!=='epic').id;
        const entries=Array.from({length:4},()=>Gear.makeEntry(id,1));
        for(const entry of entries) Profile.addItem(entry);
        Profile.toggleFavorite(entries[2].uid);
        Profile.data.equipmentPresets=[{name:'QA',slots:{...Gear.emptyLoadout(),main:entries[3].uid}}];
        Profile.save();
        return {uids:entries.map(e=>e.uid),coins:Profile.data.coins,total:Profile.saleQuote(entries.slice(0,2).map(e=>e.uid)).total};
      });
      await page.locator('[data-tab="sell"]').click();
      for(const uid of sample.uids.slice(2)) assert.equal(await page.locator('[data-sale-pick="'+uid+'"]').count(),0);
      for(const uid of sample.uids.slice(0,2)) await page.locator('[data-sale-pick="'+uid+'"]').click();
      await page.locator('[data-sale-act="review"]').click();
      assert.equal(await page.evaluate(()=>Profile.data.coins),sample.coins);
      await page.locator('[data-sale-act="cancel"]').click();
      assert.equal(await page.evaluate(()=>Profile.data.coins),sample.coins);
      await page.locator('[data-sale-act="review"]').click();
      await page.locator('[data-sale-act="confirm"]').click();
      assert.equal(await page.evaluate(()=>Profile.data.coins),sample.coins+sample.total);
      assert.deepEqual(await page.evaluate(uids=>uids.map(uid=>!!Profile.item(uid)),sample.uids),[false,false,true,true]);
      assert.equal(await page.evaluate(uids=>Profile.sellItems(uids,0),sample.uids),null);
      await page.locator('[data-tab="buy"]').click();
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
