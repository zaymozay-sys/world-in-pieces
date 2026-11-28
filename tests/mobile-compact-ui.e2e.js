// Регрессия компактных интерфейсов: узкий телефон, обе ориентации, планшет.
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch } = require('../tools/browser.js');
const base = process.env.WIP_URL || 'file://' + path.join(__dirname, '..', 'index.html');
const sizes = [[320, 568], [568, 320], [844, 390], [768, 1024]];
const scenes = ['shop', 'forge', 'questJournal', 'today', 'tavern', 'mill', 'lighthouse', 'library', 'artistWorkshop', 'jeweler', 'junker', 'kennel', 'alchemist', 'market', 'village', 'arena', 'bank', 'valor', 'best'];
function modalLayout() {
  const modal = document.querySelector('.modal-back > .modal');
  const header = modal.querySelector('header'), close = header.querySelector('button.close'), title = header.querySelector('h2');
  const body = modal.querySelector('.screen-body, .home-layout');
  const bounds = el => el && el.getBoundingClientRect();
  const inside = r => r && r.width > 0 && r.height > 0 && r.left >= -2 && r.right <= innerWidth + 2 && r.top >= -2 && r.bottom <= innerHeight + 2;
  const errors = [];
  if (!inside(bounds(modal))) errors.push('окно за экраном');
  const cr = bounds(close);
  if (!inside(cr)) errors.push('крестик за экраном');
  else {
    const hit = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
    if (!hit || !close.contains(hit)) errors.push('крестик перекрыт');
    if (cr.width < 43 || cr.height < 43) errors.push('маленький крестик');
  }
  if (title && title.textContent.trim().length > 14 && bounds(title).width < 65) errors.push('слишком узкий заголовок: ' + Math.round(bounds(title).width));
  if (body) {
    if (body.clientHeight < 55) errors.push('нет места для содержимого: ' + body.clientHeight);
    if (body.scrollWidth > body.clientWidth + 3) {
      const br = bounds(body), offender = [...body.querySelectorAll('*')].find(e => {
        const r = bounds(e); return r.width > 0 && r.right > br.right + 4 && !e.closest('.tabs, .tier-picker');
      });
      errors.push('горизонтальное переполнение ' + body.scrollWidth + '/' + body.clientWidth + (offender ? ' ' + (offender.className.baseVal || offender.className || offender.tagName) : ''));
    }
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) errors.push('ширина страницы');
  return errors;
}
(async () => {
  const browser = await launch();
  const findings = [];
  try {
    for (const [width, height] of sizes) {
      const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      const p = await ctx.newPage(), errors = [];
      p.on('pageerror', e => errors.push(e.message));
      await p.goto(base + '#dev-map-village');
      await p.waitForFunction(() => typeof Profile !== 'undefined' && Profile.data.testX10 === true && typeof MapView !== 'undefined' && !!MapView.map && document.body.classList.contains('mode-map'));
      await p.evaluate(() => { Profile.data.wins = 100; Profile.data.xp = Hero.totalFor(51); Profile.data.coins = 10001234; });
      await p.locator('#m-more').click();
      await p.locator('#map-menu .mm-head.g-gfx').click();
      for (const selector of ['#map-menu .mm-main', '#map-menu .mm-side']) {
        const r = await p.locator(selector).boundingBox();
        if (!r || r.x < -2 || r.y < -2 || r.x + r.width > width + 2 || r.y + r.height > height + 2) findings.push(`${width}x${height} map: меню за экраном ${selector}`);
      }
      await p.locator('#m-more').click();
      for (const scene of scenes) {
        await p.evaluate(id => { Screens.close(); Screens.open(id); }, scene);
        await p.locator('.modal-back > .modal').waitFor({ state: 'visible' });
        await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        for (const issue of await p.evaluate(modalLayout)) findings.push(`${width}x${height} ${scene}: ${issue}`);
      }
      await p.evaluate(() => { Screens.close(); Inventory.open('left', { armory: true }); });
      const gear = p.locator('[data-itab="gear"]');
      if (await gear.isVisible()) await gear.click();
      for (const issue of await p.evaluate(modalLayout)) findings.push(`${width}x${height} armory: ${issue}`);
      await p.evaluate(() => Inventory.close());
      for (const dock of ['old', 'new']) {
        await p.evaluate(mode => localStorage.setItem('wip-battle-dock', mode), dock);
        await p.goto(base + '?audit=' + dock + '#dev-fight-wolf-1-solo');
        await p.waitForFunction(() => document.body.classList.contains('mode-battle') && !!document.querySelector('#board .tile'));
        await p.waitForTimeout(250);
        const board = await p.locator('#board').boundingBox();
        if (!board || board.width < 120 || Math.abs(board.width - board.height) > 3 || board.x < -2 || board.y < -2 || board.x + board.width > width + 2 || board.y + board.height > height + 2) {
          findings.push(`${width}x${height} battle/${dock}: поле вне экрана ${JSON.stringify(board)}`);
        }
        const controls = await p.evaluate(() => {
          const visible = e => e && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
          const inside = e => { const r = e.getBoundingClientRect(); return r.left >= -2 && r.right <= innerWidth + 2 && r.top >= -2 && r.bottom <= innerHeight + 2; };
          const issues = [];
          for (const id of ['spellbar','bagbar']) {
            const e = document.getElementById(id);
            if (!visible(e) || !inside(e)) issues.push(id);
          }
          if (!['more', 'dock-menu'].some(id => { const e = document.getElementById(id); return visible(e) && inside(e); })) issues.push('меню боя');
          return issues;
        });
        for (const issue of controls) findings.push(`${width}x${height} battle/${dock}: недоступна панель ${issue}`);
        if (width > height && (width <= 700 || height <= 430)) {
          const effective = await p.evaluate(() => ({ old: document.body.classList.contains('old-dock'), saved: localStorage.getItem('wip-battle-dock') }));
          if (effective.old || effective.saved !== dock) findings.push(`${width}x${height}: ошибка временной раскладки`);
          if (width === 568 && dock === 'old') {
            await p.setViewportSize({ width: 320, height: 568 });
            await p.waitForFunction(() => document.body.classList.contains('old-dock'));
            await p.setViewportSize({ width, height });
            await p.waitForFunction(() => !document.body.classList.contains('old-dock'));
          }
        }
      }
      await p.goto(base + '?audit=result#dev-result-win');
      await p.locator('.battle-result.result-win').waitFor({ state: 'visible', timeout: 20000 });
      const details = p.locator('.battle-result .rw-more');
      if (await details.count()) {
        assert.equal(await details.isVisible(), false);
        await p.locator('.battle-result .rw-more-btn').click();
        assert.equal(await details.isVisible(), true);
        await p.locator('.battle-result .rw-more-btn').click();
        assert.equal(await details.isVisible(), false);
      }
      assert.equal(await p.locator('.battle-result .to-map').evaluate(e => getComputedStyle(e).position), 'static');
      await p.locator('.battle-result .to-map').scrollIntoViewIfNeeded();
      const returnButton = await p.locator('.battle-result .to-map').boundingBox();
      if (!returnButton || returnButton.x < -2 || returnButton.y < -2 || returnButton.x + returnButton.width > width + 2 || returnButton.y + returnButton.height > height + 2) findings.push(`${width}x${height} result: кнопка возврата недоступна`);
      for (const error of errors) findings.push(`${width}x${height} JS: ${error}`);
      await ctx.close();
      console.log(`Проверено ${width}×${height}: ${scenes.length + 5} сцен`);
    }
    const desk = await browser.newContext({viewport:{width:1366,height:900},reducedMotion:'reduce'});
    const p = await desk.newPage();
    await p.goto(base+'#dev-fight-wolf-3-solo');
    await p.waitForFunction(()=>document.body.classList.contains('mode-battle') && !document.body.classList.contains('phone') && !!document.querySelector('#board .tile'));
    const controls=p.locator('.board-scale-control');
    await controls.waitFor({state:'visible'});
    await controls.locator('.board-scale-value').click();
    await p.waitForTimeout(250);
    const full=(await p.locator('#board').boundingBox()).width;
    const minus=controls.locator('button').first();
    await minus.click(); await minus.click(); await minus.click(); await minus.click();
    await p.waitForTimeout(250);
    const small=(await p.locator('#board').boundingBox()).width;
    assert.ok(small<full,'Уменьшение поля должно менять размеры сетки');
    assert.equal(await p.evaluate(()=>localStorage.getItem('wip-board-scale')),'60');
    await controls.locator('.board-scale-value').click();
    assert.equal(await p.evaluate(()=>localStorage.getItem('wip-board-scale')),'100');
    await p.locator('#fighter-right .avatar').click();
    await p.locator('.fi-pop .fi-health').waitFor({state:'visible'});
    await p.locator('.fi-pop .fi-close').click();
    assert.equal(await p.locator('.fi-pop').count(),0);
    await desk.close();
  } finally { await browser.close(); }
  assert.deepEqual(findings, [], findings.join('\n'));
})().catch(e => { console.error(e); process.exitCode = 1; });
