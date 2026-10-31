// 2.0.9: база знаний (браузер; в `npm test` не входит): поиск, статья, ссылки, кнопка в «Как играть», нет прокрутки вбок
const { launch } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path'); const URL = 'file://' + path.join(__dirname, '..', 'index.html#dev-map');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await launch();
  for (const w of [320, 1000]) for (const lang of ['ru', 'en']) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL); await sleep(1200);
    if (lang === 'en') { await p.evaluate(() => { setTimeout(() => I18N.setLang('en'), 0); }); await sleep(5000); }
    await p.evaluate(() => Screens.open('help')); await sleep(200);
    ok(await p.evaluate(() => !!document.querySelector('[data-wopen]')), `${w}/${lang}: в «Как играть» есть кнопка базы знаний`);
    await p.evaluate(() => document.querySelector('[data-wopen]').click()); await sleep(200);
    const n = await p.evaluate(() => document.querySelectorAll('.wiki-item').length);
    ok(n >= 18, `${w}/${lang}: статей в списке ${n}`);
    await p.evaluate(() => { const i = document.querySelector('.wiki-q'); i.value = 'scorp'.length && (document.documentElement.lang === 'en' ? 'scorpion' : 'скорпион'); i.dispatchEvent(new Event('input', { bubbles: true })); });
    const f = await p.evaluate(() => document.querySelectorAll('.wiki-item').length);
    ok(f >= 1 && f < n, `${w}/${lang}: поиск сужает список (${f})`);
    await p.evaluate(() => document.querySelector('.wiki-item').click()); await sleep(150);
    ok(await p.evaluate(() => !!document.querySelector('.wiki-art h3') && !/undefined|NaN|\{\d\}/.test(document.querySelector('.wiki-art').textContent)), `${w}/${lang}: статья открылась, без undefined/NaN/{0}`);
    if (lang === 'en') ok(await p.evaluate(() => !/[а-яё]{4}/i.test(document.querySelector('.wiki-art').textContent)), 'английский текст статьи без русских слов');
    const sc = await p.evaluate(() => { const m = document.querySelector('.modal'); return m.scrollWidth <= m.clientWidth + 1; });
    ok(sc, `${w}/${lang}: нет прокрутки вбок`);
    const go = await p.evaluate(() => { const g = document.querySelector('[data-wgo]'); if (!g) return 'none'; g.click(); return Screens.screen; });
    ok(go !== 'wiki', `${w}/${lang}: ссылка «Открыть» ведёт в окно (${go})`);
    ok(!errs.length, `${w}/${lang}: без ошибок ${errs.join('; ')}`);
    await ctx.close();
  }
  // все статьи открываются
  const ctx = await b.newContext({ viewport: { width: 400, height: 800 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL); await sleep(1200);
  const res = await p.evaluate(() => Wiki.ARTICLES.map((a) => { try { return a.title() + a.body() + (a.go || []).map((g) => g[1]()).join(''); } catch (e) { return 'ERR ' + a.id + e.message; } }).filter((t) => /ERR|undefined|NaN/.test(t)));
  ok(!res.length, 'все статьи строятся без ошибок ' + res.join('|').slice(0, 200));
  // английская версия: все статьи без русских слов и без прокрутки вбок на узком экране
  const c2 = await b.newContext({ viewport: { width: 320, height: 700 } }); const q = await c2.newPage(); const e2 = []; q.on('pageerror', (e) => e2.push(e.message));
  await q.goto(URL); await sleep(1200); await q.evaluate(() => { setTimeout(() => I18N.setLang('en'), 0); }); await sleep(5000);
  const rep = await q.evaluate(() => { Screens.open('wiki'); const out = []; for (const a of Wiki.ARTICLES) { document.querySelector(`[data-wart="${a.id}"]`).click(); const m = document.querySelector('.modal'); const t = document.querySelector('.wiki-art').textContent; if (/[а-яё]{3}/i.test(t)) out.push(a.id + ': русский текст'); if (m.scrollWidth > m.clientWidth + 1) out.push(a.id + ': прокрутка вбок'); document.querySelector('[data-wback]').click(); } return out; });
  ok(!rep.length && !e2.length, 'английские статьи: ' + (rep.concat(e2).join('; ') || 'все чистые'));
  await b.close(); console.log(bad ? `\nwiki209.e2e: ошибок ${bad}` : '\nwiki209.e2e: всё в порядке'); process.exit(bad ? 1 : 0);
})();
