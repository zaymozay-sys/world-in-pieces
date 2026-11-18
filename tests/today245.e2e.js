// Экран «Сегодня» и порядок событий в бою. Запуск: NODE_PATH=$(npm root -g) node tests/today245.e2e.js
const path = require('path');
const { launch } = require('../tools/browser.js');
const URL = process.env.WIP_URL || 'file://' + path.join(__dirname, '..', 'index.html');
let bad = 0;
const must = (t, c, d) => { if (!c) bad++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${t}${!c && d ? ' — ' + d : ''}`); };
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) { /* без хранилища */ } });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL + '#dev-map-meadow'); await p.waitForTimeout(3500);
  await p.evaluate(() => { Profile.data.wins = Math.max(Profile.data.wins || 0, 30); });
  await p.click('#m-today'); await p.waitForTimeout(500);
  const txt = await p.evaluate(() => (document.querySelector('.modal') || {}).innerText || '');
  must('окно «Сегодня» открывается', /Сегодня/.test(txt));
  must('есть головоломка, испытание и поручение', /Головоломка дня/.test(txt) && /Испытание дня/.test(txt) && /Поручение библиотеки/.test(txt), txt.slice(0, 200));
  await p.click('[data-today="puzzle"]'); await p.waitForTimeout(400);
  must('кнопка головоломки ведёт на вкладку арены', await p.evaluate(() => Screens.screen === 'arena' && Screens.arenaTab() === 'puzzle'));

  // бой: удар достигает цели позже звука линии
  const p2 = await ctx.newPage(); p2.on('pageerror', (e) => errs.push(e.message));
  await p2.goto(URL + '#dev-fight-rat-1-solo'); await p2.waitForTimeout(2500);
  const gap = await p2.evaluate(async () => {
    const w = (ms) => new Promise((x) => setTimeout(x, ms)), B = MAIN_BATTLE, log = []; let best = null;
    for (const k of ['match', 'hit']) { const o = Sound[k]; Sound[k] = function (...a) { log.push([k, performance.now()]); return o.apply(this, a); }; }
    for (let g = 0; g < 8 && best === null; g++) {
      for (let i = 0; i < 80 && (B.busy || B.over || B.turnSide !== 'left'); i++) await w(100);
      if (B.over) break;
      const L = B.fighters.left, R = B.fighters.right, v = Combat.aiView(L, R);
      const mv = AI.choose(B.typOf(), B.valOf(), v.hpMe, v.hpOpp, 60, {}, { maxMe: v.maxMe, locked: B.lockedCells('left') });
      if (!mv) break;
      log.length = 0;
      await B.playerMove({ r: Math.floor(mv.a / 6), c: mv.a % 6 }, { r: Math.floor(mv.b / 6), c: mv.b % 6 });
      const m = log.find((x) => x[0] === 'match'), h = log.find((x) => x[0] === 'hit' && m && x[1] > m[1]);
      if (m && h) best = Math.round(h[1] - m[1]);
    }
    return best;
  });
  must('звук удара идёт после звука линии (не в один кадр)', gap === null || gap >= 60, 'разрыв ' + gap + ' мс');
  must('без ошибок страницы', errs.length === 0, errs.join('; '));
  await b.close();
  console.log(bad ? 'ПРОВАЛ: ' + bad : 'всё в порядке'); process.exit(bad ? 1 : 0);
})();
