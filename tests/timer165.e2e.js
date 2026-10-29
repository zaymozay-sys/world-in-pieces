// 1.6.5: настройка «Таймер хода» (по умолчанию выкл, 30 с по включению, время стоит при открытом окне) и заготовка рекламной паузы (выкл).
// Запуск: node tests/timer165.e2e.js   (профиль каждого контекста изолирован; бой — песочница #dev-…)
const path = require('path');
const { launch } = require('../tools/browser.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0;
const ok = (name, cond, extra) => { if (cond) console.log('  ok   ' + name); else { fails++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };

(async () => {
  const b = await launch();
  const open = async (w, h, hash, lang = 'ru', timer = null, touch = false) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
    await ctx.addInitScript(([lg, t]) => { try { localStorage.setItem('wip-lang', lg); if (t) localStorage.setItem('wip-turn-timer', t); } catch (e) {} }, [lang, timer]);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL + hash); await p.waitForTimeout(3600);
    return { p, ctx, errs };
  };
  const myTurn = (p) => p.waitForFunction(() => typeof MAIN_BATTLE !== 'undefined' && MAIN_BATTLE.turnSide === 'left' && !MAIN_BATTLE.busy && !MAIN_BATTLE.over, null, { timeout: 30000 });
  const timerState = (p) => p.evaluate(() => { const e = document.getElementById('turn-timer'); return { hidden: !e || e.hidden, text: e ? e.textContent.trim() : '', handle: typeof MAIN_BATTLE !== 'undefined' && !!MAIN_BATTLE.turnTimerHandle }; });

  console.log('по умолчанию таймер выключен');
  {
    const { p, ctx, errs } = await open(1280, 800, '#dev-fight-goblin-3-solo');
    await p.waitForTimeout(3500);
    const s = await timerState(p);
    ok('в бою с существом таймера нет (скрыт, интервала нет)', s.hidden && !s.handle, JSON.stringify(s));
    ok('кнопка «Таймер: выкл» внизу на компьютере', await p.evaluate(() => { const bt = document.getElementById('timer-btn'); return !!bt && bt.offsetParent !== null && /выкл/.test(bt.textContent) && bt.getAttribute('aria-pressed') === 'false'; }));
    // включаем посреди хода игрока — таймер стартует сразу (без таймера ход игрока ждёт сколько угодно, так что момент стабилен)
    await myTurn(p);
    await p.click('#timer-btn'); await p.waitForTimeout(1500);
    const s2 = await timerState(p);
    ok('включили посреди хода — таймер пошёл', !s2.hidden && s2.handle && /\d/.test(s2.text), JSON.stringify(s2));
    ok('настройка запомнена на устройстве', await p.evaluate(() => localStorage.getItem('wip-turn-timer') === '30'));
    ok('подпись кнопки «Таймер: 30 с», нажата', await p.evaluate(() => { const bt = document.getElementById('timer-btn'); return /30/.test(bt.textContent) && bt.getAttribute('aria-pressed') === 'true'; }));
    // пауза: открыли сумку — время стоит
    await p.evaluate(() => Inventory.open('left')); await p.waitForTimeout(400);
    const a = await timerState(p); await p.waitForTimeout(3200); const c = await timerState(p);
    ok('окно открыто — время стоит (' + a.text + ' → ' + c.text + ')', a.text === c.text && !c.hidden, JSON.stringify([a, c]));
    await p.evaluate(() => Inventory.close()); await p.waitForTimeout(2600);
    const d = await timerState(p);
    ok('окно закрыто — время пошло снова (' + c.text + ' → ' + d.text + ')', d.text !== c.text, JSON.stringify([c, d]));
    // выключаем посреди хода — таймер исчезает
    await p.click('#timer-btn'); await p.waitForTimeout(500);
    const e = await timerState(p);
    ok('выключили — таймер убран', e.hidden && !e.handle, JSON.stringify(e));
    ok('без ошибок JS', errs.length === 0, errs[0]);
    await ctx.close();
  }

  console.log('включённый таймер: пропуск хода и поражение после трёх пропусков');
  {
    const { p, ctx, errs } = await open(1280, 800, '#dev-fight-goblin-3-solo', 'ru', '30');
    await p.waitForFunction(() => { const e = document.getElementById('turn-timer'); return e && !e.hidden; }, null, { timeout: 30000 });
    ok('таймер включён с самого начала (настройка устройства)', true);
    // ускоряем: до конца хода осталось 1 с
    const r = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms));
      const out = { skips: [] };
      for (let i = 0; i < 3; i++) {
        // ждём хода игрока и «доживаем» до конца таймера, подменив счётчик
        for (let k = 0; k < 200 && !(MAIN_BATTLE.turnSide === 'left' && MAIN_BATTLE.turnTimerHandle && !MAIN_BATTLE.busy); k++) await w(100);
        if (document.querySelector('.overlay')) break;
        MAIN_BATTLE.turnTimerLeft = 1; await w(1400);
        out.skips.push((document.getElementById('status') || {}).textContent);
      }
      for (let k = 0; k < 100 && !document.querySelector('.overlay'); k++) await w(100);
      out.overlay = (document.querySelector('.overlay') || {}).innerText || '';
      return out;
    });
    ok('три пропуска по таймеру подряд — поражение', /Поражение/.test(r.overlay), JSON.stringify(r).slice(0, 300));
    ok('без ошибок JS', errs.length === 0, errs[0]);
    await ctx.close();
  }

  console.log('меню карты (☰): «Таймер хода»');
  for (const [w, h, touch] of [[1280, 800, false], [390, 844, true]]) {
    const { p, ctx, errs } = await open(w, h, '#dev-map-village', 'ru', null, touch);
    await p.click('#m-more'); await p.waitForTimeout(300);
    await p.evaluate(() => { const h = [...document.querySelectorAll('#map-menu .mm-head')].find((x) => /Игра и справка/.test(x.textContent)); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); });   // пункты меню собраны в сворачиваемые группы
    await p.waitForTimeout(200);
    const t0 = await p.evaluate(() => document.getElementById('mm-timer').textContent);
    ok(`${w}×${h}: в меню «${t0}» (по умолчанию выкл)`, /выкл/.test(t0));
    await p.click('#mm-timer'); await p.waitForTimeout(300);
    const t1 = await p.evaluate(() => ({ t: document.getElementById('mm-timer').textContent, menu: !document.getElementById('map-menu').hidden, ls: localStorage.getItem('wip-turn-timer') }));
    ok(`${w}×${h}: после нажатия «${t1.t}», меню осталось открытым, настройка записана`, /30/.test(t1.t) && t1.menu && t1.ls === '30', JSON.stringify(t1));
    ok(`${w}×${h}: без ошибок JS`, errs.length === 0, errs[0]);
    await ctx.close();
  }

  console.log('телефон: кнопка в меню боя ☰, кнопки внизу на компьютере нет');
  {
    const { p, ctx, errs } = await open(390, 844, '#dev-fight-goblin-3-solo', 'ru', null, true);
    await p.waitForTimeout(2500);
    ok('на телефоне нижняя кнопка скрыта', await p.evaluate(() => { const bt = document.getElementById('timer-btn'); return !bt || bt.offsetParent === null; }));
    await myTurn(p);
    await p.click('#more'); await p.waitForTimeout(300);
    ok('в меню боя ☰ есть «Таймер хода: выкл»', await p.evaluate(() => { const bt = document.querySelector('#more-menu [data-do=timer]'); return !!bt && /выкл/.test(bt.textContent); }));
    await p.click('#more-menu [data-do=timer]'); await p.waitForTimeout(1500);
    const s = await timerState(p);
    ok('включили из меню — таймер пошёл', !s.hidden && s.handle, JSON.stringify(s));
    ok('без ошибок JS', errs.length === 0, errs[0]);
    await ctx.close();
  }

  console.log('рекламная пауза: выключена по умолчанию; при включении — сообщение через 2 мин (здесь 1,5 с)');
  {
    const { p, ctx, errs } = await open(1280, 800, '#dev-fight-goblin-3-solo');
    await myTurn(p); await p.waitForTimeout(800);        // ход игрока начался и поле спокойно: дальше ходы не перезапускают отсчёт
    ok('по умолчанию выключена, окна нет', await p.evaluate(() => AdPause.enabled === false && !AdPause.shown && !document.querySelector('.adpause-back') && AdPause.cfg.idleMs === 120000));
    await p.evaluate(() => { AdPause.cfg.idleMs = 1500; AdPause.enabled = true; AdPause.arm(); });
    await p.waitForFunction(() => AdPause.shown, null, { timeout: 8000 }).catch(() => {});
    ok('после простоя показано сообщение с двумя кнопками', await p.evaluate(() => { const e = document.querySelector('.adpause'); return !!e && /паузу на рекламу/.test(e.innerText) && !!e.querySelector('[data-adpause=no]') && /Нет, продолжаем игру/.test(e.innerText); }));
    await p.click('[data-adpause=no]'); await p.waitForTimeout(400);
    ok('«Нет, продолжаем игру» закрывает окно', await p.evaluate(() => !AdPause.shown && !document.querySelector('.adpause-back')));
    await p.waitForFunction(() => AdPause.shown, null, { timeout: 8000 }).catch(() => {});
    ok('после отказа отсчёт идёт заново — сообщение появилось снова', await p.evaluate(() => AdPause.shown));
    await p.evaluate(() => { window.__ad = 0; AdPause.cfg.onAccept = () => { window.__ad++; }; });
    await p.click('[data-adpause=yes]'); await p.waitForTimeout(300);
    ok('согласие вызывает onAccept один раз и закрывает окно', await p.evaluate(() => window.__ad === 1 && !AdPause.shown));
    await p.evaluate(() => { AdPause.enabled = false; }); await p.waitForTimeout(2200);
    ok('выключили — сообщение больше не появляется', await p.evaluate(() => !AdPause.shown));
    ok('без ошибок JS', errs.length === 0, errs[0]);
    await ctx.close();
  }

  await b.close();
  console.log(fails ? `\ntimer165 e2e: ПРОВАЛ (${fails})` : '\ntimer165 e2e: все тесты пройдены');
  process.exit(fails ? 1 : 0);
})();
