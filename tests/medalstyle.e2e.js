// 1.6.2: медали за стиль боя и ступени/комплекты на Стене доблести в настоящем браузере. Запуск: node tests/medalstyle.e2e.js (не параллельно с другими e2e)
const { launch: launchBrowser } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } };
(async () => {
  const b = await launchBrowser();
  const ctx = await b.newContext({ locale: 'ru-RU', viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL + '#dev-fight-wolf-2-solo'); await p.waitForTimeout(2500);
  const r = await p.evaluate(async () => {
    const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = {};
    // награда за победу: герой цел, 3 хода, без заклинаний
    Profile.data.testX10 = false; Profile.data.medals.earned = [];
    busy = false; over = false; rewarded = false; moves = 3; battleStyle = { spells: 0, elixirs: 0 };
    fighters.left.hp = fighters.left.max;
    rewardFor(fighters.right, true, {});
    o.got = Profile.medals().map((m) => m.id).sort();
    // повторная победа — те же медали не выдаются второй раз
    const n0 = Profile.medals().length; rewarded = false; moves = 3; rewardFor(fighters.right, true, {});
    o.again = Profile.medals().length - n0;
    // ступени: 30 побед над волком — серебро, бонус ×2
    Profile.data.bestiary.wolf = { wins: 30, tier: 1 };
    const id = Medals.killMedalId('wolf'); if (!Profile.hasMedal(id)) Profile.grantMedal(id, 1);
    o.rank = Medals.rankOf('wolf', Profile.data.bestiary);
    // медали за мир: 12 зданий, 10 тайников, 5 алтарей, сундуки
    const t0 = Profile.medals().length;
    for (const bid of ['shop', 'forge', 'hunter', 'home', 'hall', 'tavern', 'mill', 'junker', 'library', 'artistWorkshop', 'kennel', 'alchemist']) Profile.noteWorld('visit', bid, 1);
    for (let i = 0; i < 10; i++) Profile.noteWorld('cache', null, 1);
    for (let i = 0; i < 5; i++) Profile.noteWorld('altar', null, 1);
    Profile.data.chestOpened = true; Profile.data.xchests = { ruby: true, emerald: true, obsidian: true }; Profile.noteWorld('chest', 'obsidian', 1);
    o.world = Profile.medals().map((m) => m.id).filter((x) => x.startsWith('world:')).sort();
    o.worldBonus = Medals.bonusStats(Profile.medals(), Profile.data.bestiary).health;
    // коллекция: все виды «Нежити» → +5% урона по семейству; урон растёт
    fighters.right.monsterId = 'skeleton';
    const und = Medals.collections().find((c) => c.family === 'Нежить');
    o.famBefore = Medals.familyBonus(Profile.medals(), 'Нежить');
    for (const sp of und.species) if (!Profile.hasMedal(Medals.killMedalId(sp))) Profile.grantMedal(Medals.killMedalId(sp), 1);
    o.famAfter = Medals.familyBonus(Profile.medals(), 'Нежить');
    // скрытые медали
    o.secretHiddenBefore = (Screens.openValor(), await w(200), [...document.querySelectorAll('.medal-round[data-medal^="secret:"]')].every((el) => /Скрытая/.test(el.title)));
    Screens.close && Screens.close();
    for (let i = 0; i < 9; i++) Profile.noteSecret({ win: false });
    o.noEarly = !Profile.hasMedal('secret:stubborn');
    Profile.noteSecret({ win: false });
    o.stubborn = Profile.hasMedal('secret:stubborn');
    Profile.noteSecret({ win: true, hpLeft: 1, tier: 5, heroTier: 2 });
    Profile.data.coins = 5000000; Profile.spend(1000000);
    o.secret = Profile.medals().map((m) => m.id).filter((x) => x.startsWith('secret:')).sort();
    // серия дней в Испытании дня
    Profile.data.medals.daily = null;
    Profile.registerChallengeWin('2026-10-01'); Profile.registerChallengeWin('2026-10-02');
    o.daily2 = Profile.dailyStreak(); o.daily3none = !Profile.hasMedal('daily:3');
    Profile.registerChallengeWin('2026-10-03'); o.daily3 = Profile.hasMedal('daily:3');
    Profile.registerChallengeWin('2026-10-05'); o.dailyReset = Profile.dailyStreak();
    // Стена доблести
    Screens.openValor(); await w(300);
    o.hasStyle = [...document.querySelectorAll('.medal-round[data-medal^="style:"]')].length;
    o.styleGot = [...document.querySelectorAll('.medal-round.got[data-medal^="style:"]')].length;
    o.groupLines = document.querySelectorAll('.group-line').length;
    const wolf = document.querySelector('.medal-round[data-medal="' + id + '"]'); o.wolfRank = wolf && wolf.dataset.rank;
    wolf.click(); await w(200);
    o.worldTiles = document.querySelectorAll('.medal-round[data-medal^="world:"]').length;
    o.collRows = document.querySelectorAll('.coll-row').length; o.collDone = document.querySelectorAll('.coll-row.done').length;
    o.popRank = /Ступени/.test(document.querySelector('.medal-pop') ? document.querySelector('.medal-pop').textContent : '');
    // избранные медали: не больше трёх, видны рядом с именем
    const mine = Profile.medals().map((m) => m.id);
    o.fav = mine.slice(0, 4).map((x) => Profile.toggleFavMedal(x));
    o.favN = Profile.favMedals().length; o.favHtml = (Profile.favBadges().match(/fav-badge"/g) || []).length;
    const f0 = Profile.favMedals()[0]; Profile.toggleFavMedal(f0); o.favAfterOff = Profile.favMedals().length;
    document.querySelector('.medal-round[data-medal="' + mine[0] + '"]').click(); await w(200);
    o.favBtn = !!document.querySelector('[data-act=medal-fav]');
    document.querySelector('[data-act=medal-fav]').click(); await w(300);
    o.favViaUi = Profile.favMedals().length;
    return o;
  });
  ok(r.got.includes('style:flawless') && r.got.includes('style:swift') && r.got.includes('style:nomagic'), 'выданы медали стиля: ' + r.got);
  ok(!r.got.includes('style:onespell') && !r.got.includes('style:alchemist'), 'лишних медалей стиля нет');
  ok(r.again === 0, 'повторно медали стиля не выдаются');
  ok(r.rank === 2, 'ступень серебро при 30 победах: ' + r.rank);
  ok(r.hasStyle === 5, 'на Стене 5 медалей стиля: ' + r.hasStyle);
  ok(r.styleGot >= 3, 'полученные медали стиля цветные: ' + r.styleGot);
  ok(String(r.wolfRank) === '2', 'значок со ступенью II: ' + r.wolfRank);
  ok(r.popRank, 'в окне медали описаны ступени');
  ok(r.world.length === 4, 'выданы 4 медали мира: ' + r.world);
  ok(r.worldTiles === 4, 'на Стене 4 медали мира: ' + r.worldTiles);
  ok(r.groupLines === 8, 'строки комплектов (8 разделов): ' + r.groupLines);
  ok(r.famBefore === 0 && r.famAfter === 5, `коллекция Нежить: до ${r.famBefore}, после ${r.famAfter}`);
  ok(r.collRows >= 5 && r.collDone >= 1, `на Стене строки коллекций: ${r.collRows}, собрано ${r.collDone}`);
  ok(r.secretHiddenBefore, 'до получения скрытые медали без названия');
  ok(r.noEarly && r.stubborn, 'серия из 10 поражений даёт медаль только на десятом');
  ok(r.secret.length === 4, 'выданы 4 скрытые медали: ' + r.secret);
  ok(JSON.stringify(r.fav) === '[true,true,true,false]' && r.favN === 3 && r.favHtml === 3, 'избранных ровно три: ' + JSON.stringify(r.fav) + ' ' + r.favN + ' ' + r.favHtml);
  ok(r.favAfterOff === 2 && r.favBtn && r.favViaUi === 3, 'снятие и кнопка в окне медали: ' + r.favAfterOff + ' ' + r.favViaUi);
  ok(r.daily2 === 2 && r.daily3none && r.daily3 && r.dailyReset === 1, `серия дней: ${r.daily2} ${r.daily3none} ${r.daily3} ${r.dailyReset}`);
  ok(errs.length === 0, 'ошибки страницы: ' + errs.join('; '));
  await b.close();
  console.log(bad ? `medalstyle e2e: ПРОВАЛ (${bad})` : 'medalstyle e2e: все тесты пройдены');
  process.exit(bad ? 1 : 0);
})();
