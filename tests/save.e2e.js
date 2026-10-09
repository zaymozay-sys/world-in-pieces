// 1.5.4: битые сохранения и закрытое хранилище не должны ломать игру.
// Запуск: NODE_PATH=$(npm root -g) node tests/save.e2e.js   (Playwright — не параллельно с другими e2e)
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const CASES = {
  combo: { faction: 'elf', name: 'X', items: null, backpack: null, loadout: { head: 'zzz' }, coins: 'abc', xp: 500, map: 'oops', pets: null, village: null },
  itemsObj: { faction: 'elf', items: { a: 1 } },
  backpackNull: { faction: 'elf', backpack: null },
  factionBad: { faction: 'robot' },
  coinsNaN: { faction: 'elf', coins: 'NaN' },
  array: [],
  number: 5,
  notJson: '{not json',
};
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  for (const [k, v] of Object.entries(CASES)) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const raw = typeof v === 'string' ? v : JSON.stringify(v);
    await ctx.addInitScript((s) => { if (!sessionStorage.getItem('inj')) { sessionStorage.setItem('inj', 1); localStorage.setItem('wip-lang', 'ru'); localStorage.setItem('gem-match-profile-v2', s); } }, raw);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(1500);
    const st = await p.evaluate(() => typeof Profile !== 'undefined' && Array.isArray(Profile.data.items) && Number.isFinite(Profile.data.coins) && typeof Profile.data.backpack === 'object' && Profile.data.backpack !== null);
    ok(st, k + ': профиль исправлен при загрузке');
    ok(errs.length === 0, k + ': ошибки ' + errs.join('; '));
    // тот же файл через «Загрузить сохранение» в Ратуше
    if (typeof v === 'object' && !Array.isArray(v)) {
      const r = await p.evaluate((s) => { const o = JSON.parse(s); o.coins = typeof o.coins === 'number' ? o.coins : 10; o.items = Array.isArray(o.items) ? o.items : []; o.loadout = o.loadout || {}; return Profile.importSave(JSON.stringify(o)) && Array.isArray(Profile.data.items) && typeof Profile.data.backpack === 'object' && Profile.data.backpack !== null; }, raw);
      ok(r, k + ': импорт файла чинит поля');
    }
    await ctx.close();
  }
  // хранилище закрыто: игра работает, предупреждает, язык переключается
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU' });
  await ctx.addInitScript(() => { Storage.prototype.getItem = function () { throw new Error('denied'); }; Storage.prototype.setItem = function () { throw new Error('denied'); }; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL + '#dev-map-meadow'); await p.waitForTimeout(3500);
  ok(await p.evaluate(() => Profile.storageOk === false && /сохранять/.test(document.getElementById('map-toast').textContent)), 'без хранилища — предупреждение на карте');
  await p.click('#m-more'); await p.click('#mm-lang'); await p.waitForTimeout(2500);
  ok(await p.evaluate(() => I18N.lang === 'en'), 'без хранилища язык всё равно переключается');
  ok(errs.length === 0, 'без хранилища: ошибки ' + errs.join('; '));
  await b.close();
  console.log(bad ? 'save e2e: ПРОВАЛ (' + bad + ')' : 'save e2e: все тесты пройдены');
  process.exit(bad ? 1 : 0);
})();
