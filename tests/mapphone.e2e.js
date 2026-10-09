// 1.5.3: карта на телефоне — одна строка сверху, меню ☰, две круглые кнопки внизу, раскрывающаяся плашка; на компьютере всё по-старому.
// Запуск: NODE_PATH=$(npm root -g) node tests/mapphone.e2e.js   (Playwright нельзя запускать параллельно с другими e2e)
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.join(__dirname, '..', 'index.html') + '#dev-map-meadow';
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } };
const vis = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 1 && r.height > 1; }, sel);
const rect = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const open = async (w, h, touch) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) {} });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(1800);
    return [ctx, p];
  };

  // --- телефон, вертикально ---
  let [ctx, p] = await open(390, 844, true);
  ok(await p.evaluate(() => document.body.classList.contains('phone')), 'body.phone');
  for (const id of ['m-gear', 'm-best', 'm-more', 'm-me', 'm-home']) ok(await vis(p, '#' + id), id + ' виден');
  for (const id of ['m-zin', 'm-zout', 'm-mute', 'm-fs', 'm-lang', 'm-help', 'm-credits']) ok(!(await vis(p, '#' + id)), id + ' скрыт');
  const top = await rect(p, '.map-top'), ctrl = await rect(p, '.map-ctrl'), info = await rect(p, '.map-info');
  ok(top.b <= 70, 'верхняя строка ≤ 70 px, а не ' + Math.round(top.b));
  ok(844 - info.t <= 50 && ctrl.b <= info.t, 'плашка одной строкой внизу: высота от низа ' + Math.round(844 - info.t));
  for (const id of ['m-gear', 'm-best', 'm-more', 'm-me', 'm-home']) { const r = await rect(p, '#' + id); ok(r.w >= 40 && r.h >= 40, id + ' ≥ 40 px: ' + Math.round(r.w) + '×' + Math.round(r.h)); }
  const covered = (top.h + ctrl.h + info.h) * 390 / (390 * 844);
  ok(covered < 0.18, 'интерфейс закрывает < 18% экрана: ' + covered.toFixed(2));
  // меню
  ok(await p.evaluate(() => document.getElementById('map-menu').hidden), 'меню закрыто');
  await p.tap('#m-more'); await p.waitForTimeout(150);
  ok(await vis(p, '#map-menu'), 'меню открылось');
  const items = await p.evaluate(() => [...document.querySelectorAll('#map-menu button')].map((e) => { const r = e.getBoundingClientRect(); return [e.textContent.trim(), Math.round(r.height), Math.round(r.right), Math.round(r.bottom)]; }));
  ok(items.length === 5 && items.every((i) => i[1] >= 40 && i[2] <= 390 && i[3] <= 844), 'пять пунктов ≥ 40 px внутри экрана: ' + JSON.stringify(items));
  const m0 = await p.evaluate(() => Sound.muted);
  await p.tap('#mm-mute'); await p.waitForTimeout(150);
  ok(await p.evaluate((m) => Sound.muted !== m && !document.getElementById('map-menu').hidden, m0), 'звук переключился, меню осталось');
  ok(await p.evaluate(() => document.getElementById('mm-mute').textContent === document.getElementById('m-mute').textContent), 'подпись звука одинакова в меню и в скрытой кнопке');
  await p.tap('#mm-mute'); // вернуть как было
  await p.tap('#map-menu button[data-mdo=m-help]'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.getElementById('map-menu').hidden), 'меню закрылось после выбора');
  ok(await p.evaluate(() => !!document.querySelector('.modal, #screen:not([hidden]), .overlay:not([hidden])')), 'экран «Как играть» открылся');
  await ctx.close();

  [ctx, p] = await open(390, 844, true);
  await p.tap('#m-more'); await p.tap('.map-me', { position: { x: 20, y: 20 } }); await p.waitForTimeout(200);
  ok(await p.evaluate(() => document.getElementById('map-menu').hidden), 'нажатие вне меню его закрывает');
  await p.evaluate(() => document.querySelectorAll('.modal-close,[data-act=close]').forEach((e) => e.click()));
  // плашка раскрывается
  await ctx.close();
  [ctx, p] = await open(390, 844, true);
  const h1 = (await rect(p, '.map-info')).h;
  await p.tap('.map-info'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => document.querySelector('.map-info').classList.contains('open')), 'плашка раскрылась');
  ok(await vis(p, '#map-zones') && (await rect(p, '.map-info')).h > h1 + 20, 'в раскрытой плашке видна легенда зон');
  await p.tap('.map-info'); await p.waitForTimeout(150);
  ok(!(await vis(p, '#map-zones')), 'плашка свернулась');
  ok(p.errs.length === 0, 'ошибки: ' + p.errs.join('; '));
  await ctx.close();

  // --- телефон, горизонтально ---
  [ctx, p] = await open(844, 390, true);
  const t2 = await rect(p, '.map-top'), b2 = await rect(p, '.map-bottom');
  ok(t2.b < b2.t - 20, 'сверху и снизу есть просвет карты: ' + Math.round(t2.b) + ' / ' + Math.round(b2.t));
  await p.tap('#m-more'); await p.waitForTimeout(150);
  const mr = await rect(p, '#map-menu');
  ok(mr.b <= 390 && mr.r <= 844, 'меню помещается в горизонтальный экран: низ ' + Math.round(mr.b));
  await ctx.close();

  // --- компьютер (1.5.5): сумка, бестиарий и ☰ в строке; звук, экран, язык, справка, авторы — в меню; масштаб и «Домой» на месте ---
  [ctx, p] = await open(1280, 800, false);
  ok(!(await p.evaluate(() => document.body.classList.contains('phone'))), 'компьютер без phone');
  for (const id of ['m-gear', 'm-best', 'm-more', 'm-zin', 'm-zout', 'm-me', 'm-home']) ok(await vis(p, '#' + id), id + ' виден на компьютере');
  for (const id of ['m-mute', 'm-fs', 'm-lang', 'm-help', 'm-credits']) ok(!(await vis(p, '#' + id)), id + ' на компьютере убран в меню');
  await p.click('#m-more'); await p.waitForTimeout(150);
  ok(await vis(p, '#map-menu'), 'меню ☰ открывается на компьютере');
  await p.click('#map-menu button[data-mdo=m-help]'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !!document.querySelector('.modal')), '«Как играть» из меню открывается');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.keyboard.press('KeyI'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => typeof Inventory !== 'undefined' && Inventory.isOpen), 'клавиша I открывает сумка');
  await ctx.close();

  await b.close();
  console.log(bad ? 'mapphone e2e: ПРОВАЛ (' + bad + ')' : 'mapphone e2e: все тесты пройдены');
  process.exit(bad ? 1 : 0);
})();
