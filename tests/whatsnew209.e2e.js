// 2.0.9: «Что нового» (браузер; в `npm test` не входит): окно после обновления один раз, пункт меню, версия запоминается
const { launch } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path'); const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL); await sleep(1500);
  await p.evaluate(() => { Profile.data.faction = Profile.data.faction || 'dwarf'; Profile.data.wins = 10; Profile.data.seenVersion = '2.0.7'; Profile.save(); });
  await p.reload(); await sleep(2500);
  ok(await p.evaluate(() => Screens.screen === 'whatsnew'), 'после обновления окно открылось само');
  ok(await p.evaluate(() => document.querySelectorAll('.modal li').length >= 4), 'в окне есть пункты');
  ok(await p.evaluate(() => Profile.data.seenVersion === GAME_VERSION), 'версия запомнена');
  await p.reload(); await sleep(2500);
  ok(await p.evaluate(() => Screens.screen !== 'whatsnew'), 'второй раз само не открывается');
  await p.evaluate(() => document.getElementById('m-whatsnew').click()); await sleep(200);
  ok(await p.evaluate(() => Screens.screen === 'whatsnew'), 'открывается из меню');
  ok(!errs.length, 'без ошибок ' + errs.join('; '));
  await b.close(); console.log(bad ? `\nwhatsnew209.e2e: ошибок ${bad}` : '\nwhatsnew209.e2e: всё в порядке'); process.exit(bad ? 1 : 0);
})();
