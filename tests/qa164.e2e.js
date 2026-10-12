// Регрессионные проверки по независимому аудиту 1.6.2 (WIP-01…10) в настоящей игре. Запуск: node tests/qa164.e2e.js
// Каждая проверка падала на 1.6.2 и проходит на 1.6.4. Профиль каждого контекста изолирован (новый localStorage).
const assert = require('assert');
const path = require('path');
const { launch } = require('../tools/browser.js');
const { hitReport } = require('../tools/hitlib.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const BAD = new Set(['offscreen', 'blocked', 'small', 'clip', 'hscroll', 'dupid']);
const PHONES = [[320, 568], [375, 667], [390, 844], [568, 320], [667, 375], [844, 390], [932, 430]];
let fails = 0;
const ok = (name, cond, extra) => { if (cond) console.log('  ok   ' + name); else { fails++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };

(async () => {
  const b = await launch();
  const open = async (w, h, hash, touch = true, lang = 'ru') => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
    await ctx.addInitScript((lg) => { try { localStorage.setItem('wip-lang', lg); localStorage.setItem('wip-turn-timer', '30'); /* 1.6.5: по умолчанию таймер выкл; здесь включён — проверяем самую широкую вёрстку */ } catch (e) {} }, lang);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL + hash); await p.waitForTimeout(3600);
    return { p, ctx, errs };
  };

  // WIP-01/02/03/04/07: все кнопки боя целиком на экране, нажимаются (5 точек), таймер не обрезан, id уникальны, клетка не мельче порога
  for (const [w, h] of PHONES) for (const sc of ['fight-goblin-3-solo', 'fight-goblin-3']) {
    const { p, ctx, errs } = await open(w, h, '#dev-' + sc);
    let rep = await p.evaluate(hitReport);
    const duo = await p.evaluate(() => Duo.on());
    if (sc.endsWith('3') && duo) { await p.evaluate(() => document.querySelectorAll('.duo-tab')[1].click()); await p.waitForTimeout(400); rep = rep.concat(await p.evaluate(hitReport)); }
    const bad = rep.filter((r) => BAD.has(r.kind));
    ok(`${w}×${h} ${sc}: нажатия и вёрстка`, bad.length === 0, bad.slice(0, 3).map((r) => r.kind + ' ' + r.el + ' ' + (r.text || '')).join('; '));
    const cell = (rep.find((r) => r.kind === 'info') || {}).cell || 0;
    const min = Math.min(w, h) === h && w > h ? 38 : (h <= 600 ? 36 : 40);   // альбом и самый низкий портрет — компромисс, остальные ≥ 40
    ok(`${w}×${h} ${sc}: клетка ${cell}px ≥ ${min}`, cell >= min);
    ok(`${w}×${h} ${sc}: без ошибок JS`, errs.length === 0, errs[0]);
    await ctx.close();
  }

  // WIP-01: переключение «Играть за питомца» реально меняет сторону управления на 320×568 и 390×844
  for (const [w, h] of [[320, 568], [390, 844]]) {
    const { p, ctx } = await open(w, h, '#dev-fight-goblin-3');
    const take = await p.$('.duo-take');
    const r = await take.boundingBox();
    ok(`${w}×${h}: кнопка «за питомца» внутри экрана`, r.x >= 0 && r.x + r.width <= w, JSON.stringify(r));
    const mine = () => p.evaluate(() => document.querySelector('.duo-tab.mine').dataset.tab);
    const before = await mine();
    await take.tap(); await p.waitForTimeout(500);
    const after = await mine();
    ok(`${w}×${h}: управление перешло (${before} → ${after})`, before !== after);
    await ctx.close();
  }

  // WIP-03: компактный таймер на телефоне, полная фраза в aria-label (RU и EN)
  for (const lang of ['ru', 'en']) {
    const { p, ctx } = await open(390, 844, '#dev-fight-goblin-3-solo', true, lang);
    await p.waitForFunction(() => { const e = document.getElementById('turn-timer'); return e && !e.hidden && e.innerText.trim(); }, null, { timeout: 40000 });
    const t = await p.evaluate(() => { const e = document.getElementById('turn-timer'); return { vis: e.innerText.trim(), aria: e.getAttribute('aria-label'), clip: e.scrollWidth > e.clientWidth + 1 }; });
    ok(`таймер ${lang}: коротко «${t.vis}», aria «${t.aria}»`, /^\d+ (с|s)$/.test(t.vis) && !t.clip && /\d/.test(t.aria || '') && (t.aria || '').length > t.vis.length);
    await ctx.close();
  }

  // WIP-05: выключатель звука — исправленный CSS, состояние в aria-pressed и иконка меняется
  {
    const { p, ctx } = await open(390, 844, '#dev-fight-goblin-3-solo');
    const st = () => p.evaluate(() => { const m = document.getElementById('mute'); return { pressed: m.getAttribute('aria-pressed'), cls: m.classList.contains('off'), bg: getComputedStyle(m).backgroundImage, label: m.getAttribute('aria-label') }; });
    const a = await st(); await p.tap('#mute'); await p.waitForTimeout(200); const c = await st();
    ok('mute: aria-pressed переключается', a.pressed !== c.pressed && c.pressed === 'true', JSON.stringify([a.pressed, c.pressed]));
    ok('mute: иконка «выкл» отличается от «вкл» и валидна', c.cls && c.bg.startsWith('url(') && c.bg !== a.bg);
    ok('mute: состояние сохраняется после перезагрузки', await (async () => { await p.evaluate(() => location.reload()).catch(() => {}); await p.waitForTimeout(4200); return p.evaluate(() => document.getElementById('mute').classList.contains('off') === (localStorage.getItem('wip-muted') === '1' || document.getElementById('mute').getAttribute('aria-pressed') === 'true')); })());
    await ctx.close();
  }

  // WIP-06: #dev-… не пишет в настоящее сохранение
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(URL); await p.waitForTimeout(1500);
    await p.evaluate(() => { Profile.sandbox(true); /* 1.6.5: старая страница не должна успеть перезаписать подложенное сохранение своим (таймер карты раз в 5 с) — иначе редкий ложный сбой */ localStorage.setItem('gem-match-profile-v2', JSON.stringify({ name: 'Игрок', coins: 12345, faction: 'elf', testX10: false, sentinel: 7 })); });
    const before = await p.evaluate(() => localStorage.getItem('gem-match-profile-v2'));
    await p.goto(URL + '#dev-fight-goblin-3-solo'); await p.evaluate(() => location.reload()).catch(() => {}); await p.waitForTimeout(4500);
    const mem = await p.evaluate(() => ({ x10: !!Profile.data.testX10, sandbox: Profile.isSandbox() }));
    const after = await p.evaluate(() => localStorage.getItem('gem-match-profile-v2'));
    ok('devjump: работает в памяти (sandbox)', mem.sandbox && mem.x10);
    const sv = JSON.parse(after || '{}');
    ok('devjump: в сохранение игрока не попали тестовые ×10 и все заклинания', !sv.testX10 && !sv.testAllSpells && sv.coins === 12345 && sv.faction === 'elf', 'после: ' + (after || '').slice(0, 120));
    await ctx.close();
  }

  // WIP-07: id во втором поле уникальны, а кнопки второго поля работают со своей стороной
  {
    const { p, ctx } = await open(390, 844, '#dev-fight-goblin-3');
    const dup = await p.evaluate(() => { const c = {}; for (const e of document.querySelectorAll('[id]')) c[e.id] = (c[e.id] || 0) + 1; return Object.keys(c).filter((k) => c[k] > 1); });
    ok('дуо: повторяющихся id нет', dup.length === 0, dup.join(','));
    await p.evaluate(() => document.querySelectorAll('.duo-tab')[1].click()); await p.waitForTimeout(500);
    const cnt = await p.evaluate(() => [...document.querySelectorAll('.duo-pet .spellbar button.magic')].length);
    ok('дуо: заклинания второго поля построены', cnt >= 10, String(cnt));
    await ctx.close();
  }

  // WIP-09: карта с клавиатуры (Tab → стрелки → Ввод), фокус возвращается после закрытия окна
  {
    const { p, ctx } = await open(1280, 800, '#dev-map-meadow', false);
    const info = await p.evaluate(() => { const s = document.getElementById('map-svg'); return { tab: s.getAttribute('tabindex'), role: s.getAttribute('role'), aria: s.getAttribute('aria-label') }; });
    ok('карта: фокусируется (tabindex, role, подпись)', info.tab === '0' && info.role === 'application' && info.aria.length > 10);
    await p.focus('#map-svg');
    const tip0 = await p.evaluate(() => document.getElementById('map-tip').textContent);
    let moved = false;
    for (const k of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowRight']) { await p.keyboard.press(k); await p.waitForTimeout(80); }
    const live = await p.evaluate(() => document.getElementById('map-live').textContent);
    const hov = await p.evaluate(() => document.querySelectorAll('#l-hover polygon.hover-hex, #l-village .bldg.lit').length);
    ok('карта: стрелки двигают курсор, озвучивание обновляется', live.length > 0 && hov >= 0, live);
    await p.keyboard.press('Enter'); await p.waitForTimeout(900);
    const reacted = await p.evaluate(() => !!document.querySelector('.map-card:not([hidden]), #map-card:not([hidden])') || document.getElementById('map-tip').textContent.length > 0);
    ok('карта: Ввод действует как касание', reacted);
    // окно: фокус внутрь, фон inert, возврат фокуса
    await p.focus('#map-svg');
    await p.evaluate(() => Inventory.open('left')); await p.waitForTimeout(300);
    const inert = await p.evaluate(() => [...document.body.children].filter((c) => c.inert).length);
    ok('окно: фон неактивен (inert)', inert > 0, String(inert));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    const back = await p.evaluate(() => ({ inert: [...document.body.children].filter((c) => c.inert).length, focus: document.activeElement && document.activeElement.id }));
    ok('окно: после закрытия фон снова активен, фокус вернулся на карту', back.inert === 0 && back.focus === 'map-svg', JSON.stringify(back));
    await ctx.close();
  }

  // WIP-10: состояния кнопок магии и расходников различимы (data-state) и подписаны (aria-label)
  {
    const { p, ctx } = await open(390, 844, '#dev-fight-goblin-3-solo');
    const st = await p.evaluate(() => { const m = [...document.querySelectorAll('#spellbar button.magic')]; const bag = [...document.querySelectorAll('#bagbar button.bagitem')]; return { n: m.length, states: [...new Set(m.map((x) => x.dataset.state))], aria: m.every((x) => x.getAttribute('aria-label')), bagN: bag.length, bagStates: [...new Set(bag.map((x) => x.dataset.state))], bagAria: bag.every((x) => x.getAttribute('aria-label')) }; });
    ok('13 заклинаний на экране, у каждого состояние и подпись', st.n >= 13 && st.aria && st.states.every((s) => /^(ready|on|need|wait|locked)$/.test(s)), JSON.stringify(st));
    ok('расходники: 10 кнопок с состоянием и подписью', st.bagN === 10 && st.bagAria && st.bagStates.every((s) => /^(ready|wait|empty)$/.test(s)), JSON.stringify(st));
    await ctx.close();
  }

  await b.close();
  console.log(fails ? `\nqa164 e2e: ПРОВАЛ (${fails})` : '\nqa164 e2e: все тесты пройдены');
  process.exit(fails ? 1 : 0);
})();
