// 1.7.4: Арена — условие дня, реванш, «Мои результаты», награда сезона (браузер; в `npm test` не входит).
const { launch } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await launch();
  for (const [vp, touch, lang] of [[[1280, 800], false, 'ru'], [[390, 844], true, 'en']]) {
    const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] }, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript((l) => { try { localStorage.setItem('wip-lang', l); } catch (e) {} }, lang);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL); await sleep(1800);
    const tag = `${vp[0]}px ${lang}`;
    // прошлый сезон с наградой
    await p.evaluate(() => { const a = Profile.data.arena = Object.assign(World.freshArena(), { season: World.seasonOf(Daily.today()) - 1, sBest: 7, sWins: 5, sLosses: 2, rank: 6 }); Profile.data.coins = 0; });
    await p.evaluate(() => Screens.open('arena')); await sleep(300);
    const r1 = await p.evaluate(() => ({ coins: Profile.data.coins, rank: Profile.data.arena.rank, titled: Profile.data.cosmetics.titles.includes('seasonChamp'), pend: Profile.data.arena.pending, hist: Profile.data.arena.history.length, txt: document.querySelector('.gear-toast') && document.querySelector('.gear-toast').textContent }));
    ok(r1.coins > 0 && !r1.pend && r1.hist === 1 && r1.rank === 4 && r1.titled, tag + ': награда сезона выдана один раз, ранг −2, титул ' + JSON.stringify(r1).slice(0, 120));
    ok(!!r1.txt, tag + ': сообщение об итоге сезона');
    ok(await p.evaluate(() => !!document.querySelector('.arena-rule')), tag + ': карточка условия дня');
    // бой с условием дня
    await p.evaluate(() => { Profile.data.arena.rank = 0; World.arenaRule = () => World.ARENA_RULES[0]; });
    await p.click('[data-arena=fight]'); await sleep(2500);
    const f = await p.evaluate(() => ({ ab: fighters.right.ability, rule: Profile.data.monster.arena && Profile.data.monster.arena.rule, line: (document.querySelector('.ability-line') || {}).textContent || '' }));
    ok(f.ab === 'stun' && f.rule === 'stun', tag + ': у тени приём из условия дня ' + JSON.stringify(f).slice(0, 100));
    await p.evaluate(() => { for (const k in RULES.timing) RULES.timing[k] = 5; });
    await p.waitForFunction(() => !busy, null, { timeout: 30000 });
    await p.evaluate(() => { fighters.left.hp = 0; checkEnd(); });
    await p.waitForSelector('.overlay', { timeout: 8000 }); await sleep(400);
    const ov = await p.evaluate(() => document.querySelector('.overlay').textContent);
    ok(/реванш|rematch/i.test(ov), tag + ': в итоге предложен реванш');
    await p.screenshot({ path: `/tmp/A2/shots/arena-loss-${vp[0]}.png` });
    const back = await p.evaluate(() => { const a = Profile.data.arena; return { rv: !!a.revenge, log: a.log.length, losses: a.sLosses }; });
    ok(back.rv && back.log === 1 && back.losses === 1, tag + ': реванш и журнал записаны');
    await p.click('.to-map'); await sleep(600);
    await p.evaluate(() => Screens.open('arena')); await sleep(300);
    await p.click('[data-arena=revenge]'); await sleep(2500);
    ok(await p.evaluate(() => Profile.data.monster.arena.rev === true && Profile.data.arena.revs === 1), tag + ': реванш начат (1/3)');
    await p.waitForFunction(() => !busy, null, { timeout: 30000 });
    await p.evaluate(() => { Profile.data.arena.stars = 2; fighters.left.hp = 0; checkEnd(); });
    await p.waitForSelector('.overlay', { timeout: 8000 }); await sleep(400);
    ok(await p.evaluate(() => Profile.data.arena.stars === 2), tag + ': поражение в реванше звезду не снимает');
    await p.click('.to-map'); await sleep(600);
    await p.evaluate(() => { Screens.open('arena'); }); await sleep(300);
    await p.click('[data-tab=results]'); await sleep(300);
    const res = await p.evaluate(() => document.querySelector('.screen-body').textContent);
    ok(res.length > 100 && (lang === 'en' ? !/[А-Яа-я]/.test(res) : /Серия побед/.test(res)), tag + ': вкладка «Мои результаты»');
    if (vp[0] === 1280) await p.screenshot({ path: '/tmp/A2/shots/arena-results.png' });
    ok(errs.length === 0, tag + ': без ошибок страницы ' + errs.join('; '));
    await ctx.close();
  }
  await b.close(); console.log(bad ? `\nПровалено: ${bad}` : '\narena174.e2e: всё в порядке'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
