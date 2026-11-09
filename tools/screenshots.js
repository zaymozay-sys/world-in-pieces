// Снимки для README: карта, ранец, стена доблести, бестиарий, бой -> docs/*.png (1280×800, русский язык).
// Запуск из папки игры:  node tools/screenshots.js   (выбор фракции — docs/factions.png — обновляется вручную)
// Берёт тестовый профиль режима разработчика (js/devjump.js), прогресс игрока не трогает.
const path = require('path');
const { launch } = require(path.join(__dirname, 'browser.js'));
const D = path.resolve(__dirname, '..', 'docs') + path.sep;
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  const b = await launch(); const errs = [];
  const shot = async (hash, name, prep, wait = 3000) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) { /* без хранилища */ } });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(name + ': ' + e.message));
    await p.goto(URL + hash); await p.waitForTimeout(wait);
    if (prep) await prep(p);
    await p.screenshot({ path: D + name + '.png' }); await ctx.close();
  };
  await shot('#dev-map-meadow', 'map', null, 3500);
  await shot('#dev-scr-bag', 'inventory', null, 3500);
  await shot('#dev-scr-bag', 'valor', async (p) => {
    await p.evaluate(() => { for (const id of ['rat', 'wolf', 'boar', 'goblin']) Profile.data.bestiary[id] = { wins: 3, tier: 2 };
      Profile.data.medals.earned.push({ id: Medals.killMedalId('rat'), tier: 1 }, { id: Medals.killMedalId('wolf'), tier: 2 }, { id: Medals.killMedalId('boar'), tier: 1 }, { id: Medals.streakMedalId(Medals.STREAK_MILESTONES[0]), tier: 1 }); Profile.data.medals.fiveStreaks = 70; });
    await p.click('text=Стена доблести'); await p.waitForTimeout(800);
  }, 3500);
  await shot('#dev-scr-best', 'bestiary', null, 3500);
  await shot('#dev-fight-goblin-3-solo', 'screenshot', async (p) => {
    await p.waitForFunction(() => /Ваш ход/.test(document.getElementById('status').textContent), null, { timeout: 30000 }).catch(() => {});
    await p.evaluate(() => { const f = MAIN_BATTLE.fighters.left; for (const k of Object.keys(f.counts)) f.counts[k] = 12; renderMagic(); renderFighters(); });
    await p.evaluate(() => { const t = document.getElementById('tip-banner'); if (t) t.hidden = true; });
    await p.mouse.move(5, 5); await p.waitForTimeout(1200);
  }, 3500);
  await b.close(); console.log(errs.length ? errs : 'ok');
})();
