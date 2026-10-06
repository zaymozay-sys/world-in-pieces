// Проверка в браузере (Playwright): страница открывается без ошибок в консоли.
// Запуск из папки игры:  node tools/smoke.js   (нужен playwright: npm i -g playwright)
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(async()=>chromium.launch());
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto(URL); await p.waitForTimeout(3000);
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
