const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  let failures = 0;
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(process.env.WIKI_TEST_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForFunction(() => typeof Screens !== 'undefined' && typeof Wiki !== 'undefined', null, { timeout: 30000 });
      await page.evaluate(() => { const splash = document.getElementById('splash'); if (splash) splash.remove(); Screens.open('wiki'); });
      await page.locator('.wiki-filterbar [data-wfilter="m:"]').click();
      const creatureCount = await page.locator('.wiki-res [data-wart^="m:"]').count();
      if (!creatureCount) throw new Error('Creature filter returned no articles');
      await page.locator('.wiki-res [data-wart^="m:"]').first().click();
      await page.locator('.wiki-codex').waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      if (overflow) throw new Error('Horizontal viewport overflow');
      await page.locator('[data-wback]').click();
      if (await page.evaluate(() => Screens.screen) !== 'wiki') throw new Error('Back unexpectedly left wiki');
      await page.locator('[data-wfilter="all"]').click();
      await page.locator('[data-wq]').fill('бой');
      if (!(await page.locator('.wiki-res [data-wart]').count())) throw new Error('Search returned no articles');
      await page.evaluate(() => Screens.open('forge'));
      await page.locator('[data-act="wiki-context"]').click();
      if (await page.evaluate(() => Screens.screen) !== 'wiki') throw new Error('Help did not open wiki');
      await page.locator('[data-wback]').click();
      if (await page.evaluate(() => Screens.screen) !== 'forge') throw new Error('Help did not return to forge');
      await page.evaluate(() => {
        if(Tutorial.active)Tutorial.finish(false);
        const d=Profile.data;
        Object.assign(d,{wins:20,xp:Hero.totalFor(75),faction:'dwarf',tutorial:{done:true}});
        d.seen={...(d.seen||{}),rat:1,glowmaw:7};d.ship={...(d.ship||{}),fixed:true};
        d.accepted={...(d.accepted||{}),'isle-1':true};
        Screens.open('best');
      });
      const normalOnly = await page.evaluate(() => {
        Screens.close();
        const sp = MapView.map.spawns.find(s => s.tier === 1 && !s.boss && !s.zone && MapView.alive(s));
        if (!sp) return false;
        Profile.data.bestiary[sp.species] = { wins: 1, tier: 1 };
        MapView.devShowMonster(sp);
        return !!document.querySelector('#map-card [data-act="attack"]') && !document.querySelector('#map-card [data-act="quick"]');
      });
      if (!normalOnly) throw new Error('Quick battle must remain disabled');
      // Небоевое исследование: одноразовый опыт и ежедневное поручение.
      const expedition = await page.evaluate(() => {
        const lm = MapView.world.landmarks.find(m => m.kind === 'spring') || MapView.world.landmarks[0];
        if (!lm) return null;
        const before = Profile.data.xp, wins = Profile.data.wins, expected = World.landmarkXp(lm.kind, lm.tier, Profile.level());
        MapView.devTeleport(lm.idx); MapView.tap(lm.idx);
        return { id:lm.id, idx:lm.idx, kind:lm.kind, before,wins,expected };
      });
      if (!expedition) throw new Error('No landmark for exploration check');
      const choice = expedition.kind === 'spring' ? '[data-lm="look"][data-k="stone"]' : '[data-lm="look"]';
      await page.locator(choice).click();
      const explored = await page.evaluate(e => ({
        xp:Profile.data.xp-e.before,wins:Profile.data.wins-e.wins,
        peaceful:Daily.libraryQuest(Profile.data).done,
        found:!!MapView.state.found[e.id], blessing:Profile.data.blessing?.kind
      }), expedition);
      if(explored.xp!==expedition.expected||explored.wins!==0||!explored.peaceful||!explored.found||(expedition.kind==='spring'&&explored.blessing!=='stone'))throw new Error('Landmark reward mismatch: '+JSON.stringify(explored));
      await page.evaluate(e => MapView.tap(e.idx), expedition);
      if(await page.locator('[data-lm="look"]').count())throw new Error('Landmark cannot be collected again');
      await page.evaluate(() => Screens.open('best'));
      await page.locator('.beast-ctl').waitFor();
      await page.locator('[data-bres]').selectOption('graphite');
      if (await page.evaluate(()=>{const e=document.querySelector('.beast-ctl');return e.scrollWidth>e.clientWidth+2;})) throw new Error('Bestiary controls overflow');
      await page.evaluate(()=>Screens.open('lighthouse'));
      await page.locator('.quest-card [role="progressbar"]').first().waitFor();
      if (await page.evaluate(()=>[...document.querySelectorAll('.quest-card')].some(e=>e.scrollWidth>e.clientWidth+2))) throw new Error('Quest card overflow');
      await page.evaluate(()=>Screens.open('arena'));
      await page.locator('[data-tab="run"]').click();
      await page.locator('[data-runmod="master"]').waitFor();
      if(width===1280){
        await page.locator('[data-runmod="master"]').click();
        await page.locator('[data-arena="run-start"]').click();
        await page.waitForFunction(()=>Profile.data.monster?.run?.master&&MAIN_BATTLE.fighters.right.shadowHero);
        if(!await page.evaluate(()=>{const a=Profile.data.monster.run;return MAIN_BATTLE.fighters.right.base===Math.round(Hero.baseHp(a.level)*a.master.hp);}))throw new Error('Master shadow HP scaling missing');
      }
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
