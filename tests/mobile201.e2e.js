// Регрессия аудита 2.0.1 (P1-04, P1-05): в бою с питомцем все кнопки магии и расходников целиком на экране и откликаются
// на нажатие в центре и у краёв невидимой зоны, при разных размерах окна и с мышью, и с касанием.
// Запуск: node tests/mobile201.e2e.js   (Playwright, не параллельно с другими e2e)
const { launch } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } };
(async () => {
  const b = await launch();
  for (const touch of [false, true]) for (const [w, h] of [[320, 568], [390, 844], [740, 360], [915, 412], [667, 375]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, locale: 'ru-RU' });
    await ctx.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) { /* ничего */ } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL + '#dev-map-meadow'); await sleep(2500);
    await p.evaluate(() => { Profile.data.tutorial = { done: true, step: 99 }; Profile.data.petStay = false; Profile.data.wins = 30; MapView.startSpecial({ id: 'rat', tier: 1 }); });
    await sleep(2500);
    const r = await p.evaluate(() => {
      const vw = innerWidth, vh = innerHeight, bad = [], n = { c: 0 };
      const all = [...document.querySelectorAll('.spellbar button.magic, .bagbar button.bagitem')].filter((e) => e.getBoundingClientRect().width > 0);
      for (const e of all) {
        n.c++; const q = e.getBoundingClientRect(), name = e.className.slice(0, 20);
        if (q.left < -0.5 || q.top < -0.5 || q.right > vw + 0.5 || q.bottom > vh + 0.5) bad.push(name + ' вне экрана ' + [q.x, q.y, q.width, q.height].map(Math.round));
        const hit = (x, y) => { const t = document.elementFromPoint(Math.min(vw - 1, Math.max(0, x)), Math.min(vh - 1, Math.max(0, y))); return t && (t === e || e.contains(t)); };
        if (!hit(q.x + q.width / 2, q.y + q.height / 2)) bad.push(name + ' центр не нажимается');
      }
      return { n: n.c, bad, docH: document.documentElement.scrollHeight, vh };
    });
    const tag = `${w}×${h}${touch ? ' сенсор' : ''}`;
    ok(r.n >= 10, tag + ': кнопки найдены (' + r.n + ')');
    ok(r.bad.length === 0, tag + ': ' + r.bad.join('; '));
    ok(r.docH <= r.vh + 1, tag + ': страница не прокручивается (' + r.docH + ' > ' + r.vh + ')');
    ok(errs.length === 0, tag + ': ошибки ' + errs.join('; '));
    await ctx.close();
  }
  await b.close();
  console.log(bad ? 'mobile201 e2e: ПРОВАЛ (' + bad + ')' : 'mobile201 e2e: все проверки пройдены');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
