// 1.6.6: износ и починка, закрытая посреди боя вкладка, рецепты Кузницы, каталог Лавки без эпиков, свитки Бобра, две вкладки.
// Запуск: node tests/gear166.e2e.js
const path = require('path');
const { launch } = require('../tools/browser.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0;
const ok = (name, cond, extra) => { if (cond) console.log('  ok   ' + name); else { fails++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };

(async () => {
  const b = await launch();
  const mk = async (hash) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) {} });
    const p = await ctx.newPage(); p.__errs = []; p.on('pageerror', (e) => p.__errs.push(e.message));
    await p.goto(URL + (hash || '')); await p.waitForTimeout(hash ? 3800 : 2200);
    return { p, ctx };
  };
  const tip = (p) => p.evaluate(() => { const t = document.querySelector('.modal .tip-box button'); if (t) t.click(); });

  console.log('Кузница: починка (песочница)');
  {
    const { p, ctx } = await mk('#dev-map-village');
    await p.evaluate(() => { Profile.data.xp = Hero.totalFor(21); Profile.data.coins = 50000; const e = Gear.makeEntry('sword-novice', 2); e.dur = 10; Profile.addItem(e); window.__uid = e.uid; Profile.save(); });
    await p.evaluate(async () => { Screens.openForge(); await new Promise((x) => setTimeout(x, 350)); });
    await tip(p);
    await p.click('[data-tab="repair"]');
    await p.waitForTimeout(250);
    const r = await p.evaluate(() => ({ btn: !!document.querySelector('[data-do-repair]'), bar: !!document.querySelector('.budget-bar'), coins: Profile.data.coins }));
    ok('вкладка «Починка» показывает повреждённую вещь и кнопки', r.btn && r.bar, JSON.stringify(r));
    await p.click('[data-do-repair="1"]'); await p.waitForTimeout(200);
    const a = await p.evaluate(() => ({ dur: Profile.item(window.__uid).dur, coins: Profile.data.coins }));
    ok('«+1» поднимает прочность на 1 и списывает монеты', a.dur === 11 && a.coins < 50000, JSON.stringify(a));
    await p.click('[data-do-repair="' + (await p.evaluate(() => Gear.durOf(Profile.item(window.__uid)).max - 11)) + '"]').catch(() => {});
    await p.waitForTimeout(200);
    const f = await p.evaluate(() => ({ e: Profile.item(window.__uid), d: Gear.durOf(Profile.item(window.__uid)) }));
    ok('полная починка: поле dur не хранится', f.d.cur === f.d.max && !('dur' in f.e), JSON.stringify(f));
    ok('страница без ошибок', p.__errs.length === 0, p.__errs.join(' // '));
    await ctx.close();
  }

  console.log('Рецепты Кузницы, каталог Лавки, свитки Бобра (песочница)');
  {
    const { p, ctx } = await mk('#dev-map-village');
    await p.evaluate(() => { Profile.data.xp = Hero.totalFor(61); Profile.data.coins = 5e6; Profile.save(); });
    await p.evaluate(async () => { Screens.openForge(); await new Promise((x) => setTimeout(x, 350)); });
    await tip(p);
    await p.click('[data-tab="craft"]'); await p.waitForTimeout(250);
    const c = await p.evaluate(() => ({ cards: document.querySelectorAll('.craft-unit').length, maxKinds: Math.max(...[...document.querySelectorAll('.craft-unit')].map((u) => u.querySelectorAll('.need').length)) }));
    ok('вкладка «Создать»: рецепты, у редких и эпических видов ресурсов больше двух', c.cards > 5 && c.maxKinds >= 3, JSON.stringify(c));
    await p.evaluate(async () => { Screens.close(); Screens.openShop(); await new Promise((x) => setTimeout(x, 350)); });
    await tip(p);
    const s = await p.evaluate(() => {
      const buy = [...document.querySelectorAll('[data-buy-cat]')].map((x) => x.dataset.buyCat);
      const epicIds = new Set(Gear.ITEMS.filter((i) => i.rarity === 'epic').map((i) => i.id));
      return { n: buy.length, epic: buy.filter((x) => epicIds.has(x.split(':')[0])).length, tiers: document.querySelectorAll('.cat-tiers .tp').length, top: Profile.shopTop() };
    });
    ok('Лавка: эпических вещей нет, кнопки всех цветов до вашего', s.n > 0 && s.epic === 0 && s.tiers === s.top, JSON.stringify(s));
    await p.evaluate(async () => { Screens.close(); Screens.openLibrary(); await new Promise((x) => setTimeout(x, 350)); });
    await p.click('[data-tab="scrolls"]'); await p.waitForTimeout(250);
    const sc = await p.evaluate(() => { Profile.addRes('feather', Hero.tierFor(Profile.level()), 4); return document.querySelectorAll('[data-scroll-brew]').length; });
    ok('Библиотека: вкладка «Свитки» с двумя свитками', sc === 2, String(sc));
    await p.evaluate(() => { const t = Hero.tierFor(Profile.level()); Profile.addRes('feather', t, 4); Screens.refresh(); });
    await p.waitForTimeout(150);
    const before = await p.evaluate(() => Profile.data.backpack.scroll || 0);
    await p.evaluate(() => document.querySelector('[data-scroll-brew="scroll"]').click()); await p.waitForTimeout(200);
    const after = await p.evaluate(() => Profile.data.backpack.scroll || 0);
    ok('свиток спешки пишется из пера', after === before + 1, before + '→' + after);
    ok('страница без ошибок', p.__errs.length === 0, p.__errs.join(' // '));
    await ctx.close();
  }

  console.log('Закрытая посреди боя вкладка (настоящее сохранение)');
  for (const [name, moved, wantLoss] of [['после первого хода', true, 2], ['до первого хода', false, 0]]) {
    const { p, ctx } = await mk('');
    await p.evaluate((mv) => {
      const e = Gear.makeEntry('sword-novice', 1); Profile.addItem(e); Profile.data.loadout.main = e.uid; window.__uid = e.uid;
      Profile.battleStart(); if (mv) Profile.battleMoved(); Profile.save();
    }, moved);
    const uid = await p.evaluate(() => window.__uid);
    await p.reload(); await p.waitForTimeout(2200);
    const r = await p.evaluate((u) => { const e = Profile.item(u); return { dur: Gear.durOf(e).cur, max: Gear.durOf(e).max, intr: !!Profile.interrupted, battle: Profile.data.battle }; }, uid);
    ok('вкладку закрыли ' + name + ': износ ' + wantLoss, r.max - r.dur === wantLoss && r.battle === null, JSON.stringify(r));
    ok('страница без ошибок', p.__errs.length === 0, p.__errs.join(' // '));
    await ctx.close();
  }

  console.log('Две вкладки');
  {
    const { p, ctx } = await mk('');
    const q = await ctx.newPage(); await q.goto(URL); await q.waitForTimeout(1500);
    await q.evaluate(() => { Profile.data.coins = 777; Profile.save(); });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => { Profile.data.coins = 1; Profile.save(); return { stale: Profile.stale, overlay: !!document.querySelector('.stale-tab'), stored: JSON.parse(localStorage.getItem('gem-match-profile-v2')).coins }; });
    ok('устаревшая вкладка видит окно и не затирает чужой прогресс', r.stale && r.overlay && r.stored === 777, JSON.stringify(r));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? '\ngear166 e2e: ПРОВАЛ (' + fails + ')' : '\ngear166 e2e: все тесты пройдены');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
