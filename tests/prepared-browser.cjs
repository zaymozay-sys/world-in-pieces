// A short browser check of pet food on the second board; no automated battle run.
const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const browser = await chromium.launch({ headless:true });
  try {
    const page = await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem('wip-lang','ru'));
    await page.goto(process.env.WIKI_TEST_URL||'http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof MapView!=='undefined'&&typeof MAIN_BATTLE!=='undefined'&&Profile.data);
    await page.evaluate(()=>{
      if(Tutorial.active)Tutorial.finish(false);
      const d=Profile.data;
      Object.assign(d,{faction:'dwarf',gender:'m',name:'Тест',wins:20,xp:Hero.totalFor(95),tutorial:{done:true},petChoice:'tamed',petStay:false});
      d.pet=Object.assign(Pets.makePet('wolf',10),{xp:300});
      Profile.addElixir('food',10,2);Profile.save();
      Screens.close();document.getElementById('splash')?.remove();
      for(const k in RULES.timing)RULES.timing[k]=5;
      MapView.startSpecial({id:'wraith',tier:10,lvl:95});
    });
    await page.waitForFunction(()=>Duo.on()&&Duo.pet,{},{timeout:15000});
    await page.evaluate(()=>Duo.pet.setAutopilot(false));
    await page.waitForFunction(()=>!MAIN_BATTLE.busy&&MAIN_BATTLE.turnSide==='left'&&!MAIN_BATTLE.over&&!Duo.state.result.pet,{},{timeout:20000});
    const result=await page.evaluate(()=>{
      const f=Duo.pet.fighters.left, before=f.dmg, stock=Profile.data.elixirs.bag[Elixirs.key('food',10)];
      const ok=MAIN_BATTLE.useElixir('food',10), after=f.dmg, again=MAIN_BATTLE.useElixir('food',10);
      return {ok,again,before,after,stock,remaining:Profile.data.elixirs.bag[Elixirs.key('food',10)],fed:f.fedBonus};
    });
    assert.strictEqual(result.ok,true,JSON.stringify(result));
    assert.strictEqual(result.again,false);
    assert.ok(Math.abs(result.after/result.before-1.25)<1e-9,JSON.stringify(result));
    assert.strictEqual(result.remaining,result.stock-1);
    assert.strictEqual(result.fed,1.25);
    assert.deepStrictEqual(errors,[]);
    console.log('PASS food: hero can feed pet on second board; damage increases once, one item consumed');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
