// 2.0.7: победа «одним ударом» засчитывается, номер и журнал боя, нет поля «ИИ», карточка ресурса со ссылками (браузер; в `npm test` не входит).
const { launch } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await launch();
  for (const [vp, touch, lang] of [[[1280, 800], false, 'ru'], [[390, 844], true, 'en']]) {
    const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] }, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript((l) => { try { localStorage.setItem('wip-lang', l); localStorage.removeItem('wip-battle-seq'); localStorage.removeItem('wip-battle-logs'); } catch (e) {} }, lang);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL + '#dev-fight-ogre-4-solo'); await sleep(2200);
    const tag = `${vp[0]}px ${lang}`;
    await p.waitForFunction(() => !busy && document.getElementById('status').textContent.length > 0, null, { timeout: 25000 });
    ok(await p.evaluate(() => !document.querySelector('input.level')), tag + ': поля «Уровень ИИ» у противника нет');
    const n1 = await p.evaluate(() => battleNo); ok(n1 >= 1, tag + ': у боя есть номер ' + n1);
    // победа с нулём обычных ходов, но с уроном (заклинание/каскад): награда не блокируется
    await p.evaluate(() => { moves = 0; rec.dealt = 60; fighters.right.hp = 0; checkEnd(); });
    await p.waitForSelector('.overlay', { timeout: 8000 });
    const t1 = await p.evaluate(() => ({ txt: document.querySelector('.overlay').textContent, no: (document.querySelector('.battle-no') || {}).textContent }));
    ok(!/Награда не выдана|No reward/.test(t1.txt), tag + ': награда выдана при нуле обычных ходов, но уроне > 0');
    ok(new RegExp('(№|#)\\s?' + n1).test(t1.no || ''), tag + ': номер боя на экране итога «' + t1.no + '»');
    ok(await p.evaluate((n) => { const e = BattleLog.get(n); return !!e && e.result === 'win' && e.lines.length >= 1; }, n1), tag + ': журнал боя сохранён');
    // контроль: ни хода, ни урона — награды нет
    await p.evaluate(() => { startGame(); });
    await sleep(800);
    const n2 = await p.evaluate(() => battleNo); ok(n2 === n1 + 1, tag + ': следующий бой — номер ' + n2);
    await p.evaluate(() => { moves = 0; rec.dealt = 0; fighters.right.hp = 0; checkEnd(); });
    await p.waitForSelector('.overlay', { timeout: 8000 });
    ok(/Награда не выдана|No reward/.test(await p.evaluate(() => document.querySelector('.overlay').textContent)), tag + ': без хода и урона награды нет');
    // матрица heroActed: (ходы, урон) → засчитывается ли бой. minMoves из Balance, hpEdited блокирует награду всегда
    const mm = await p.evaluate(() => Balance.rewards.minMoves);
    for (const [mv, dl, want] of [[mm, 0, true], [mm - 1, 0, false], [0, 1, true], [0, 0, false], [mm + 5, 50, true]]) {
      const got = await p.evaluate(([a, b]) => { moves = a; rec.dealt = b; return window.heroActed(); }, [mv, dl]);
      ok(got === want, `${tag}: heroActed(ходы ${mv}, урон ${dl}) = ${want}`);
    }
    // окно «Журналы боёв»
    await p.evaluate(() => BattleLog.open()); await sleep(200);
    ok(await p.evaluate(() => document.querySelectorAll('#battlelog-modal .bl-row').length === 2), tag + ': в окне журналов 2 боя');
    await p.evaluate(() => document.querySelector('#battlelog-modal .bl-open').click());
    ok(await p.evaluate(() => document.querySelectorAll('#battlelog-modal .bl-body ol li').length >= 1), tag + ': журнал раскрывается');
    await p.evaluate(() => document.querySelector('#battlelog-modal .bl-close').click());
    // карточка ресурса: ссылки на зелья, без пустого места
    await p.evaluate(() => { Screens.open('forge'); ResInfo.open('scale', 3); }); await sleep(300);
    const r = await p.evaluate(() => { const c = document.querySelector('.res-card'), l = c.querySelector('.res-link'); const last = c.querySelector('.reset'); const cr = c.getBoundingClientRect(), lr = last.getBoundingClientRect(); return { links: c.querySelectorAll('.res-link').length, gap: cr.bottom - lr.bottom, h: cr.height }; });
    ok(r.links === 0, tag + ': карточка ресурса без ссылок «Для чего» (решение владельца 2.0.7)');
    ok(r.gap < 40, tag + ': нет пустого места внизу карточки (' + Math.round(r.gap) + ' px)');
    if (vp[0] === 1280) await p.screenshot({ path: '/tmp/release207.png' });
    ok(errs.length === 0, tag + ': без ошибок страницы ' + errs.join('; '));
    await ctx.close();
  }
  await b.close(); console.log(bad ? `\nПровалено: ${bad}` : '\nrelease207.e2e: всё в порядке'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
