const { chromium } = require('playwright');
// Снимки для README: карта, ранец, стена доблести, бестиарий, бой, выбор фракции -> docs/*.png
// Запуск из папки игры:  node tools/screenshots.js
const path = require('path');
const D = path.resolve(__dirname, '..', 'docs') + path.sep;
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({viewport:{width:1280,height:800}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(3200);
  await p.screenshot({path:D+'factions.png'});
  await p.click('text=Вольные города'); await p.click('text=Женский').catch(()=>{}); await p.fill('input','Альтаир'); await p.click('text=Начать игру!'); await p.waitForTimeout(1200);
  await p.evaluate(()=>{ for (const id of ['rat','wolf','boar','goblin']) { Profile.data.bestiary[id]={wins:3,tier:2}; }
    Profile.data.medals.earned.push({id:Medals.killMedalId('rat'),tier:1},{id:Medals.killMedalId('wolf'),tier:2},{id:Medals.killMedalId('boar'),tier:1},{id:Medals.streakMedalId(Medals.STREAK_MILESTONES[0]),tier:1}); Profile.data.medals.fiveStreaks=70; });
  await p.click('#m-home').catch(()=>{}); await p.waitForTimeout(1000); await p.screenshot({path:D+'map.png'});
  await p.click('#m-gear'); await p.waitForTimeout(2200); await p.screenshot({path:D+'inventory.png'});
  await p.click('text=Стена доблести'); await p.waitForTimeout(600); await p.screenshot({path:D+'valor.png'});
  await p.reload(); await p.waitForTimeout(2500); await p.click('#m-best'); await p.waitForTimeout(1200); await p.screenshot({path:D+'bestiary.png'});
  await p.reload(); await p.waitForTimeout(2500);
  await p.click('.mon',{force:true}); await p.waitForTimeout(500); await p.click('text=Подойти и напасть'); await p.waitForTimeout(3500);
  await p.screenshot({path:D+'screenshot.png'});
  await b.close(); console.log(errs);
})();
