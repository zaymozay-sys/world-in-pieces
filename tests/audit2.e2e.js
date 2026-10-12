// Второй аудит (эксплойты, смена ориентации в бою, ускоренная выносливость). Запуск: node tests/audit2.e2e.js (не параллельно с другими e2e)
const path = require('path');
const { launch } = require('../tools/browser.js');
const { hitReport } = require('../tools/hitlib.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0;
const ok = (n, c, x) => { if (c) console.log('  ok   ' + n); else { fails++; console.log('  FAIL ' + n + (x ? ' — ' + x : '')); } };
const INIT = () => {
  window.__iv = new Set(); window.__to = 0;
  const si = window.setInterval, ci = window.clearInterval;
  window.setInterval = function (...a) { const id = si.apply(this, a); window.__iv.add(id); return id; };
  window.clearInterval = function (id) { window.__iv.delete(id); return ci.call(this, id); };
};
(async () => {
  const b = await launch();
  const open = async (w, h, hash, touch = true) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch });
    await ctx.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); localStorage.setItem('wip-turn-timer', '30'); /* 1.6.5: таймер хода включён для проверки вёрстки */ } catch (e) {} });
    await ctx.addInitScript(INIT);
    const p = await ctx.newPage(); p.__errs = [];
    p.on('pageerror', (e) => p.__errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') p.__errs.push('console: ' + m.text()); });
    await p.goto(URL + hash); await p.waitForTimeout(3800);
    return { p, ctx };
  };

  console.log('кошелёк и повторная продажа');
  {
    const { p, ctx } = await open(1280, 800, '#dev-map-village', false);
    const r = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = {};
      Profile.data.coins = 1000;
      o.s1 = Profile.spend(-5); o.s2 = Profile.spend(NaN); o.s3 = Profile.spend(Infinity); o.s4 = Profile.spend(1001);
      Profile.addCoins(NaN); Profile.addCoins(-50); Profile.addCoins(Infinity);
      o.coins = Profile.data.coins;
      o.s5 = Profile.spend(1000); o.after = Profile.data.coins;
      Profile.data.coins = 0;
      const base = Gear.ITEMS.find((i) => !i.faction); const e = Gear.makeEntry(base.id, 1); Profile.addItem(e);
      const n0 = Profile.data.items.length; Screens.openShop(); await w(300);
      const tab = document.querySelector('[data-tab="sell"]'); if (tab) { tab.click(); await w(300); }
      const btn = document.querySelector('[data-sell-item="' + e.uid + '"]');
      o.hasBtn = !!btn;
      if (btn) { btn.click(); btn.click(); await w(300); }
      o.sold = Profile.data.items.length === n0 - 1; o.paid = Profile.data.coins;
      o.once = o.paid === Gear.sellValue(Gear.item(e).price);
      return o;
    });
    ok('spend(−5 / NaN / ∞ / больше, чем есть) отказывает', !r.s1 && !r.s2 && !r.s3 && !r.s4, JSON.stringify(r));
    ok('addCoins(NaN / −50 / ∞) кошелёк не меняет', r.coins === 1000, String(r.coins));
    ok('потратить ровно всё можно, ниже нуля не уходит', r.s5 && r.after === 0, JSON.stringify([r.s5, r.after]));
    ok('продажа вещи платит один раз', r.hasBtn && r.sold && r.once, JSON.stringify(r));
    ok('без ошибок JS', p.__errs.length === 0, p.__errs[0]);
    await ctx.close();
  }

  console.log('скорость анимаций');
  {
    const { p, ctx } = await open(390, 844, '#dev-map-village');
    const st = () => p.evaluate(() => ({ mode: AnimSpeed.mode, swap: RULES.timing.swap, anim: getComputedStyle(document.documentElement).getPropertyValue('--anim').trim(), ls: localStorage.getItem('wip-anim'), label: document.getElementById('mm-anim').textContent }));
    const a = await st();
    ok('по умолчанию «обычные» (swap 200, --anim 1)', a.mode === 'normal' && a.swap === 200 && a.anim === '1', JSON.stringify(a));
    await p.click('#m-more'); await p.waitForTimeout(150);
    const ver = await p.evaluate(() => { const e = document.getElementById('map-ver'), r = e.getBoundingClientRect(); return { t: e.textContent, ok: r.width > 20 && r.bottom <= innerHeight && r.right <= innerWidth && r.left >= 0 }; });
    ok('в меню карты есть надпись о версии и она внутри экрана: ' + ver.t, /^Версия: \d+\.\d+\.\d+ \(Обновлено: \d{2}\.\d{2}\.\d{4}\)$/.test(ver.t) && ver.ok, JSON.stringify(ver));
    await p.click('#mm-anim'); await p.waitForTimeout(200);
    const f = await st();
    ok('нажатие → «быстрые» (swap 120, --anim 0.6, сохранено, меню открыто)', f.mode === 'fast' && f.swap === 120 && f.anim === '0.6' && f.ls === 'fast' && /быстр/.test(f.label) && await p.evaluate(() => !document.getElementById('map-menu').hidden), JSON.stringify(f));
    await p.click('#mm-anim'); await p.waitForTimeout(100);
    const sl = await st();
    ok('ещё нажатие → «медленные» (swap 300, --anim 1.5)', sl.mode === 'slow' && sl.swap === 300 && sl.anim === '1.5', JSON.stringify(sl));
    await p.click('#mm-anim'); await p.click('#mm-anim'); await p.waitForTimeout(100);   // медленные → обычные → быстрые
    const f2 = await st();
    ok('цикл замыкается (обычные→быстрые→медленные→обычные→быстрые)', f2.mode === 'fast', JSON.stringify(f2));
    await p.evaluate(() => location.reload()).catch(() => {}); await p.waitForTimeout(4500);
    const r = await p.evaluate(() => ({ mode: AnimSpeed.mode, swap: RULES.timing.swap }));
    ok('выбор переживает перезагрузку', r.mode === 'fast' && r.swap === 120, JSON.stringify(r));
    // бой на быстрой скорости идёт и завершается; пункт в меню боя работает
    const cb = await p.evaluate(async () => { for (const k in RULES.timing) RULES.timing[k] = Math.round(RULES.timing[k]); const m = MapView.map, me = MapView.state.pos; const a = m.spawns.filter((s) => MapView.alive(s)).sort((x, y) => HexMap.dist(m.cells[x.idx], m.cells[me]) - HexMap.dist(m.cells[y.idx], m.cells[me])); MapView.attack(a[0]); return true; });
    await p.waitForFunction(() => document.body.classList.contains('mode-battle'), null, { timeout: 20000 });
    await p.waitForTimeout(1500);
    await p.click('#more'); await p.waitForTimeout(150);
    const lbl0 = await p.evaluate(() => document.querySelector('#more-menu [data-do=anim]').textContent);
    await p.click('#more-menu [data-do=anim]'); await p.waitForTimeout(150);
    const m1 = await p.evaluate(() => AnimSpeed.mode);
    ok('меню боя ☰: пункт «Анимации» переключает (' + lbl0 + ' → ' + m1 + ')', /быстр/.test(lbl0) && m1 === 'slow', lbl0 + '/' + m1);
    ok('без ошибок JS', p.__errs.length === 0, p.__errs[0]);
    await ctx.close();
  }
  {
    // EN: подписи переведены
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('wip-lang', 'en'); localStorage.setItem('wip-turn-timer', '30'); } catch (e) {} });
    const p = await ctx.newPage(); await p.goto(URL + '#dev-map-village'); await p.waitForTimeout(3500);
    const t = await p.evaluate(() => document.getElementById('mm-anim').textContent);
    ok('EN: «' + t + '»', /^Animations: /.test(t), t);
    const tv = await p.evaluate(() => document.getElementById('map-ver').textContent);
    ok('EN: «' + tv + '»', /^Version: [\d.]+ \(Updated: [\d.]+\)$/.test(tv), tv);
    await ctx.close();
  }

  console.log('смена ориентации посреди боя');
  for (const sc of ['#dev-fight-goblin-3-solo', '#dev-fight-goblin-3']) {
    const { p, ctx } = await open(390, 844, sc);
    const steps = [[844, 390], [390, 844], [568, 320], [320, 568]];
    for (const [w, h] of steps) {
      await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(900);
      const rep = await p.evaluate(hitReport);
      const bad = rep.filter((r) => ['offscreen', 'blocked', 'small', 'clip', 'hscroll'].includes(r.kind));
      ok(`${sc.slice(5)} → ${w}×${h}: нажатия и вёрстка`, bad.length === 0, bad.slice(0, 3).map((r) => r.kind + ' ' + r.el + ' ' + (r.text || '') + (r.by ? ' ← закрыто: ' + r.by : '')).join('; '));
    }
    await p.waitForFunction(() => { const e = document.getElementById('turn-timer'); return e && !e.hidden; }, null, { timeout: 30000 });
    const t = await p.evaluate(() => (document.getElementById('turn-timer') || {}).textContent);
    await p.waitForTimeout(2500);
    const t2 = await p.evaluate(() => (document.getElementById('turn-timer') || {}).textContent);
    ok('таймер хода идёт после поворотов (' + t + ' → ' + t2 + ')', t !== t2);
    ok('без ошибок JS', p.__errs.length === 0, p.__errs[0]);
    await ctx.close();
  }
  {
    const { p, ctx } = await open(844, 390, '#dev-fight-goblin-3-solo');
    await p.click('#gear'); await p.waitForTimeout(500);
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(900);
    const m = await p.evaluate(() => { const o = document.querySelector('.overlay, .modal-back'); if (!o) return null; const r = (o.querySelector('.modal') || o).getBoundingClientRect(); const close = [...o.querySelectorAll('button')].find((x) => /Закрыть|Назад|✕|×/.test(x.textContent)); const cr = close && close.getBoundingClientRect(); return { r: [r.left, r.top, r.right, r.bottom].map(Math.round), close: cr ? [cr.left, cr.top, cr.right, cr.bottom].map(Math.round) : null }; });
    ok('сумка открыта и поворот: окно и кнопка закрытия внутри экрана', m && m.r[0] >= 0 && m.r[2] <= 390 && m.close && m.close[0] >= 0 && m.close[2] <= 390 && m.close[3] <= 844, JSON.stringify(m));
    ok('без ошибок JS', p.__errs.length === 0, p.__errs[0]);
    await ctx.close();
  }

  console.log('ускоренная выносливость: бои карта↔бой, переключения герой/питомец');
  {
    const { p, ctx } = await open(390, 844, '#dev-map-village');
    const snap = () => p.evaluate(() => ({ nodes: document.getElementsByTagName('*').length, iv: window.__iv.size, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1 }));
    const s0 = await snap();
    const N = 14; let done = 0;
    for (let i = 0; i < N; i++) {
      const r = await p.evaluate(() => { for (const k in RULES.timing) RULES.timing[k] = 5; const m = MapView.map, me = MapView.state.pos; const a = m.spawns.filter((s) => MapView.alive(s)).sort((x, y) => HexMap.dist(m.cells[x.idx], m.cells[me]) - HexMap.dist(m.cells[y.idx], m.cells[me])); if (!a.length) return false; MapView.attack(a[0]); return true; });
      if (!r) break;
      await p.waitForFunction(() => document.body.classList.contains('mode-battle'), null, { timeout: 20000 });
      await p.waitForTimeout(700);
      for (let k = 0; k < 4 && !(await p.evaluate(() => document.body.classList.contains('mode-map') || !!document.querySelector('.overlay .to-map'))); k++) { await p.click('#restart'); await p.waitForTimeout(600); }
      await p.waitForFunction(() => document.body.classList.contains('mode-map') || document.querySelector('.overlay .to-map'), null, { timeout: 30000 });
      if (await p.$('.overlay .to-map')) await p.click('.overlay .to-map');
      await p.waitForFunction(() => document.body.classList.contains('mode-map'), null, { timeout: 15000 });
      done++;
    }
    const s1 = await snap();
    console.log(`  цикл карта→бой→отступление ×${done}: узлов DOM ${s0.nodes}→${s1.nodes}, таймеров setInterval ${s0.iv}→${s1.iv}, куча JS ${s0.heap}→${s1.heap} МБ`);
    ok('все циклы пройдены', done === N, String(done));
    ok('DOM не растёт (≤ +10%)', s1.nodes <= s0.nodes * 1.1, s0.nodes + '→' + s1.nodes);
    ok('активных setInterval не больше, чем в начале + 3', s1.iv <= s0.iv + 3, s0.iv + '→' + s1.iv);
    ok('куча JS не выросла более чем вдвое', s0.heap < 0 || s1.heap <= s0.heap * 2 + 10, s0.heap + '→' + s1.heap);
    ok('без ошибок JS', p.__errs.length === 0, p.__errs[0]);
    await ctx.close();
  }
  {
    const { p, ctx } = await open(390, 844, '#dev-fight-goblin-3');
    const snap = () => p.evaluate(() => ({ nodes: document.getElementsByTagName('*').length, iv: window.__iv.size }));
    const s0 = await snap();
    for (let i = 0; i < 40; i++) { await p.evaluate((i) => Duo.setTab(i % 2 ? 'hero' : 'pet'), i); await p.waitForTimeout(60); }
    await p.evaluate(() => Duo.setTab('hero')); await p.waitForTimeout(500);
    const s1 = await snap();
    console.log(`  40 переключений герой/питомец: узлов DOM ${s0.nodes}→${s1.nodes}, setInterval ${s0.iv}→${s1.iv}`);
    ok('переключения не плодят узлы и таймеры', s1.nodes <= s0.nodes + 20 && s1.iv <= s0.iv + 1, JSON.stringify([s0, s1]));
    ok('без ошибок JS', p.__errs.length === 0, p.__errs[0]);
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\naudit2 e2e: ПРОВАЛ (${fails})` : '\naudit2 e2e: все тесты пройдены');
  process.exit(fails ? 1 : 0);
})();
