const assert = require('node:assert/strict');
const fs = require('node:fs');
const { launch } = require('../tools/browser');
const base = process.env.WIP_NOTICE_URL || 'http://127.0.0.1:8765';
const built = process.env.WIP_NOTICE_DIST === '1';
const output = 'ui-screenshots/' + (built ? 'dist' : 'source');
(async () => {
  const b = await launch();
  try {
    for (const lang of ['ru','en']) for (const [width,height] of [[320,568],[360,640],[390,844],[430,932],[844,390],[768,1024],[1920,1080]]) {
      const ctx = await b.newContext({viewport:{width,height},hasTouch:width<1000});
      try {
        await ctx.addInitScript(l => localStorage.setItem('wip-lang',l),lang);
        const p = await ctx.newPage();
        const errors=[]; p.on('pageerror',e=>errors.push(e.message));
        await p.goto(base + '/index.html#dev-map-meadow');
        await p.waitForFunction(()=>typeof MapView!=='undefined' && MapView.map && document.body.classList.contains('mode-map'));
        await p.route(built ? '**/version.json?t=*' : '**/js/version.js?t=*',r=>r.fulfill({status:200,body:built ? JSON.stringify({v:'99.0.0'}) : "const GAME_VERSION = '99.0.0';"}));
        await p.evaluate(()=>Update.check(true));
        await p.locator('.upd-banner').waitFor();
        const bounds=await p.locator('.upd-banner').boundingBox();
        assert(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=width+1 && bounds.y+bounds.height<=height+1,'banner outside viewport');
        assert(await p.locator('.upd-banner .primary').isVisible());
        assert((await p.locator('.upd-banner strong').textContent()).includes('99.0.0'));
        fs.mkdirSync(output,{recursive:true});
        await p.screenshot({path:output+'/'+lang+'-'+width+'x'+height+'-update.png'});
        if (width === 390) {
          await p.waitForFunction(() => Profile.data.testX10 === true);
          await p.evaluate(() => MapView.startTraining('rat', 1, {dev:1}));
          await p.waitForFunction(() => document.body.classList.contains('mode-battle') && Update.inBattle());
          assert.equal(await p.locator('.upd-banner').isVisible(), false, 'update banner must be hidden in battle');
          await p.evaluate(() => { window.__noticeGuard = true; document.querySelector('.upd-banner .primary').click(); });
          await p.waitForTimeout(150);
          assert.equal(await p.evaluate(() => window.__noticeGuard), true, 'reload must be blocked in battle');
          await p.evaluate(() => MapView.returnFromBattle('flee'));
          await p.waitForFunction(() => document.body.classList.contains('mode-map') && !Update.inBattle());
          await p.locator('.upd-banner').waitFor({state:'visible'});
          console.log('OK battle update guard', lang);
        }
        await p.locator('.upd-x').click();
        assert.equal(await p.locator('.upd-banner').count(),0);
        await p.evaluate(()=>MapView.toast('Loot',10000,187));
        assert.equal(await p.locator('#map-toast .coin').count(),2);
        assert.equal(await p.locator('#map-toast .money').getAttribute('data-n'),'187');
        assert(!/<span|<img/.test(await p.locator('#map-toast').textContent()));
        await p.evaluate(()=>MapView.toast('<img src=x>',10000));
        assert.equal(await p.locator('#map-toast img').count(),0);
        assert.equal(await p.locator('#map-toast').textContent(),'<img src=x>');
        await p.evaluate(()=>MapView.toast('Loot',10000,187));
        await p.screenshot({path:output+'/'+lang+'-'+width+'x'+height+'-loot.png'});
        assert.deepEqual(errors,[]);
        console.log('OK',lang,width,height);
      } finally { await ctx.close(); }
    }
  } finally { await b.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
