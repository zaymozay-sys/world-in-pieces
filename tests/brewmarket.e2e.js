// 2.2.9: усиленные заряды в сохранении и в Торговых рядах. Запуск: node tests/brewmarket.e2e.js
const path = require('path');
const { launch } = require('../tools/browser.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0;
const ok = (name, cond, extra) => { if (cond) console.log('  ok   ' + name); else { fails++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL + '#dev-map-village'); await p.waitForTimeout(4000);
  const r = await p.evaluate(async () => {
    const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = {};
    Profile.data.market = { lots: [], log: [] }; Profile.data.ammo = { 'bolt:hard': 4, 'dart:heal': 2 };
    const g = JSON.parse(JSON.stringify(Profile.data)); const rep = SaveGuard.normalize(g);
    o.kept = JSON.stringify(g.ammo); o.notes = rep.notes.length;
    Screens.open('market'); await w(300);
    document.querySelector('[data-tab="sell"]').click(); await w(100);
    const kb = document.querySelector('[data-mk-kind="ammo"]'); if (kb) { kb.click(); await w(150); }
    const cells = [...document.querySelectorAll('[data-mk-pick]')]; o.cells = cells.map((c) => c.dataset.mkPick);
    o.txt = document.body.innerText.includes('Закалённый');
    const cell = document.querySelector('[data-mk-pick="bolt:hard"]');
    if (cell) { cell.click(); await w(100); const lb = document.querySelector('[data-mk-list]'); if (lb) { lb.click(); await w(200); } }
    o.lots = Profile.data.market.lots.map((l) => [l.kind, l.key, l.n]); o.left = Profile.ammo('bolt:hard');
    document.querySelector('[data-tab="lots"]').click(); await w(150);
    o.lotTxt = document.body.innerText.includes('Закалённый');
    const wd = document.querySelector('[data-mk-withdraw]'); if (wd) { wd.click(); await w(150); }
    o.back = Profile.ammo('bolt:hard'); o.lotsAfter = Profile.data.market.lots.length;
    return o;
  });
  console.log(JSON.stringify(r));
  ok('сохранение принимает заряды без правок', r.notes === 0 && r.kept === JSON.stringify({ 'bolt:hard': 4, 'dart:heal': 2 }), r.kept + ' ' + r.notes);
  ok('в Рядах видны усиленные заряды отдельными ячейками', r.cells.includes('bolt:hard') && r.cells.includes('dart:heal') && r.txt, JSON.stringify(r.cells));
  ok('лот с усиленным зарядом создаётся и списывает запас', r.lots.length === 1 && r.lots[0][1] === 'bolt:hard' && r.left < 4, JSON.stringify(r.lots) + ' ' + r.left);
  ok('лот показывает название заряда', r.lotTxt);
  ok('снятие лота возвращает заряд', r.back === 4 && r.lotsAfter === 0, r.back + ' ' + r.lotsAfter);
  ok('страница без ошибок', errs.length === 0, errs.join('; '));
  await b.close();
  console.log(fails ? 'brewmarket: ПРОВАЛЫ ' + fails : 'brewmarket e2e: все тесты пройдены'); process.exit(fails ? 1 : 0);
})();
