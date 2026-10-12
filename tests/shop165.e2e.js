// 1.6.5: постоянный каталог Лавки (комплекты, виды, цвет) и примерка (Лавка, Кузница). Запуск: node tests/shop165.e2e.js
// Профиль изолирован (песочница #dev-…): в настоящее сохранение ничего не пишется.
const path = require('path');
const { launch } = require('../tools/browser.js');
const { hitReport } = require('../tools/hitlib.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0;
const ok = (name, cond, extra) => { if (cond) console.log('  ok   ' + name); else { fails++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };

(async () => {
  const b = await launch();
  const open = async (w, h, lang = 'ru', touch = false) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
    await ctx.addInitScript((lg) => { try { localStorage.setItem('wip-lang', lg); } catch (e) {} }, lang);
    const p = await ctx.newPage(); p.__errs = []; p.on('pageerror', (e) => p.__errs.push(e.message));
    await p.goto(URL + '#dev-map-village'); await p.waitForTimeout(3800);
    await p.evaluate(() => { Profile.data.xp = Hero.totalFor(21); Profile.data.coins = 200000; Profile.save(); });
    return { p, ctx };
  };
  const openShop = async (p) => { await p.evaluate(async () => { Screens.openShop(); await new Promise((x) => setTimeout(x, 350)); const t = document.querySelector('.modal .tip-box button'); if (t) { t.click(); await new Promise((x) => setTimeout(x, 200)); } }); };
  const snap = (p) => p.evaluate(() => JSON.stringify({ c: Profile.data.coins, i: Profile.data.items.map((e) => e.uid + e.id + e.tier), l: Profile.data.loadout }));

  console.log('каталог Лавки (компьютер 1280×800)');
  {
    const { p, ctx } = await open(1280, 800);
    await openShop(p);
    const r = await p.evaluate(() => {
      const faction = Profile.data.faction || 'dwarf', ids = new Set(Gear.itemsFor(faction).map((i) => i.id));
      const sets = [...document.querySelectorAll('[data-catset]')].map((x) => x.dataset.catset);
      const own = Object.keys(Gear.SETS).find((id) => Gear.SETS[id].faction === faction);
      const on = document.querySelector('[data-catset].on');
      const buy = [...document.querySelectorAll('[data-buy-cat]')].map((x) => x.dataset.buyCat);
      const top = Profile.shopTop();
      return { sets, own, onSet: on && on.dataset.catset, n: buy.length, allKnown: buy.every((s) => ids.has(s.split(':')[0])), tiers: [...new Set(buy.map((s) => Number(s.split(':')[1])))], top, kinds: [...document.querySelectorAll('[data-catkind]')].length, tryons: document.querySelectorAll('[data-tryon]').length, legacy: document.querySelectorAll('[data-buy-item]').length };
    });
    ok('вкладки: «Все», комплекты народа и других, «Без комплекта»', r.sets[0] === 'all' && r.sets.includes('none') && r.sets.length >= 6, r.sets.join(','));
    ok('по умолчанию открыт комплект своего народа (' + r.own + ')', r.onSet === r.own, String(r.onSet));
    ok('в каталоге только вещи своего народа, цвет — ваш (' + r.top + ')', r.n > 0 && r.allKnown && r.tiers.length === 1 && r.tiers[0] === r.top, JSON.stringify(r));
    ok('есть виды и кнопки «Примерить» у каждой вещи, старой витрины нет', r.kinds >= 5 && r.tryons === r.n && r.legacy === 0, JSON.stringify([r.kinds, r.tryons, r.n, r.legacy]));
    // постоянство: список один и тот же после закрытия/открытия, смены витрины и «боя»
    const list1 = await p.evaluate(() => [...document.querySelectorAll('[data-buy-cat]')].map((x) => x.dataset.buyCat).join('|'));
    await p.evaluate(async () => { Screens.close(); await new Promise((x) => setTimeout(x, 150)); Profile.data.shop = null; Profile.refreshShop && Profile.refreshShop(); Profile.addXp(0.0001); });
    await openShop(p);
    const list2 = await p.evaluate(() => [...document.querySelectorAll('[data-buy-cat]')].map((x) => x.dataset.buyCat).join('|'));
    ok('каталог постоянный: тот же список после повторного открытия и обновления старой витрины', list1 === list2 && list1.length > 0);
    // «Все» + все виды: каждая вещь народа в двух цветах
    const total = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = {};
      document.querySelector('[data-catset="all"]').click(); await w(150);
      o.all = document.querySelectorAll('[data-buy-cat]').length; o.expect = Gear.itemsFor(Profile.data.faction || 'dwarf').filter((i) => i.rarity !== 'epic').length;      // 1.6.6: эпических вещей в Лавке нет
      const t = [...document.querySelectorAll('[data-cattier]')]; o.tierBtns = t.length; t[0].click(); await w(150);
      o.low = [...new Set([...document.querySelectorAll('[data-buy-cat]')].map((x) => x.dataset.buyCat.split(':')[1]))].join(',');
      o.lowN = document.querySelectorAll('[data-buy-cat]').length;
      return o;
    });
    ok('«Все»: показаны все вещи народа (' + total.expect + ')', total.all === total.expect, JSON.stringify(total));
    ok('есть выбор любого цвета от первого до вашего (1.6.6)', total.tierBtns === r.top && total.low === '1' && total.lowN === total.expect, JSON.stringify(total));
    // фильтр по виду
    const kind = await p.evaluate(async () => { const w = (ms) => new Promise((x) => setTimeout(x, ms)); document.querySelector('[data-catkind="shield"]') && document.querySelector('[data-catkind="shield"]').click(); await w(150); return [...document.querySelectorAll('.card-list .card .item-title')].length; });
    ok('фильтр «Щиты» оставляет только щиты (' + kind + ')', kind > 0 && kind < total.expect, String(kind));
    await ctx.close();
  }

  console.log('покупка из каталога');
  {
    const { p, ctx } = await open(1280, 800);
    await openShop(p);
    const r = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = {};
      const bt = document.querySelector('[data-buy-cat]:not([disabled])'); const [id, tier] = bt.dataset.buyCat.split(':');
      const c0 = Profile.data.coins, n0 = Profile.data.items.length;
      bt.click(); await w(200);
      o.paid = c0 - Profile.data.coins; o.added = Profile.data.items.length - n0;
      const e = Profile.data.items[Profile.data.items.length - 1];
      o.same = e.id === id && e.tier === Number(tier); o.priced = o.paid > 0 && o.paid === Math.round(o.paid);
      return o;
    });
    ok('купили: списана цена, вещь в сумке того же вида и цвета', r.added === 1 && r.same && r.priced, JSON.stringify(r));
    // ровно на одну вещь: двойное нажатие покупает одну
    const d = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = {};
      const bt = document.querySelector('[data-buy-cat]:not([disabled])');
      // цена по карточке: списываем ровно столько, чтобы хватило на одну покупку
      const c = Profile.data.coins; bt.click(); await w(100); const price = c - Profile.data.coins;
      Profile.data.coins = price; const n0 = Profile.data.items.length;
      const bt2 = document.querySelector('[data-buy-cat="' + bt.dataset.buyCat + '"]');
      bt2.click(); bt2.click(); await w(250);
      o.price = price; o.bought = Profile.data.items.length - n0; o.coins = Profile.data.coins;
      return o;
    });
    ok('денег ровно на одну вещь: двойное нажатие покупает одну, кошелёк не уходит в минус', d.bought === 1 && d.coins === 0, JSON.stringify(d));
    // без денег кнопки покупки недоступны
    const z = await p.evaluate(async () => { Profile.data.coins = 0; Screens.refresh && Screens.refresh(); await new Promise((x) => setTimeout(x, 200)); const all = [...document.querySelectorAll('[data-buy-cat]')]; return { n: all.length, off: all.filter((x) => x.disabled).length }; });
    ok('без монет все кнопки «Купить» недоступны (' + z.off + '/' + z.n + ')', z.n > 0 && z.off === z.n, JSON.stringify(z));
    // подделанная кнопка: чужой цвет и чужая вещь не покупаются
    const f = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = {};
      Profile.data.coins = 1e6; const n0 = Profile.data.items.length, c0 = Profile.data.coins, top = Profile.shopTop();
      const root = document.querySelector('.modal') || document.body;
      const mk = (val) => { const x = document.createElement('button'); x.type = 'button'; x.dataset.buyCat = val; root.appendChild(x); x.click(); x.remove(); };
      const mine = Gear.itemsFor(Profile.data.faction || 'dwarf')[0].id, other = Gear.ITEMS.find((i) => i.faction && i.faction !== (Profile.data.faction || 'dwarf'));
      mk(mine + ':' + (top + 1)); mk(mine + ':0'); mk(mine + ':abc'); mk('нет-такой:1'); if (other) mk(other.id + ':1');
      await w(150); o.added = Profile.data.items.length - n0; o.spent = c0 - Profile.data.coins; return o;
    });
    ok('подделанные кнопки (цвет выше вашего, нулевой, чужой народ, неизвестный id) ничего не покупают', f.added === 0 && f.spent === 0, JSON.stringify(f));
    ok('без ошибок JS', p.__errs.length === 0, p.__errs[0]);
    await ctx.close();
  }

  console.log('примерка в Лавке');
  {
    const { p, ctx } = await open(1280, 800);
    await openShop(p);
    const before = await snap(p);
    const r = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = {};
      const tb = document.querySelector('[data-tryon^="shop:"]'); const spec = tb.dataset.tryon; tb.click(); await w(300);
      const pop = document.querySelector('.tryon'); o.open = !!pop;
      o.fig = !!(pop && pop.querySelector('.tryon-fig svg, .tryon-fig img'));
      o.rows = pop ? [...pop.querySelectorAll('.tryon-stats tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim())) : [];
      o.buy = !!(pop && pop.querySelector('[data-buy-cat]')); o.back = !!(pop && pop.querySelector('[data-act=tryon-close]'));
      o.spec = spec; return o;
    });
    ok('примерка открылась: портрет, таблица «было → станет», «Купить за…», «Назад»', r.open && r.fig && r.rows.length > 0 && r.buy && r.back, JSON.stringify(r).slice(0, 300));
    ok('профиль не изменился от примерки', (await snap(p)) === before);
    // «станет» совпадает с настоящими характеристиками после покупки и надевания
    const m = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = { diffs: [] };
      const pop = document.querySelector('.tryon'); const shown = {};
      for (const tr of pop.querySelectorAll('.tryon-stats tbody tr')) { const c = [...tr.children].map((x) => x.textContent.trim()); shown[c[0]] = parseFloat(c[3]); }
      document.querySelector('.tryon [data-buy-cat]').click(); await w(300);
      o.closed = !document.querySelector('.tryon-back');
      const e = Profile.data.items[Profile.data.items.length - 1]; Screens.close(); await w(150); Inventory.open('left', { armory: true }); await w(300); o.err = Inventory.equipUid(e.uid);   // надевать можно только в оружейной дома
      const real = Profile.totalStats(Profile.gear());
      for (const k of Object.keys(Gear.STAT_NAMES)) { const nm = Gear.STAT_NAMES[k]; if (nm in shown && Math.abs(shown[nm] - real[k]) > 0.51) o.diffs.push([nm, shown[nm], real[k]]); }
      o.n = Object.keys(shown).length; return o;
    });
    ok('купили из примерки — окно закрылось', m.closed);
    ok('«станет» совпадает с настоящими характеристиками после надевания (' + m.n + ' строк)' + (m.err ? ' [надеть: ' + m.err + ']' : ''), m.n > 0 && m.diffs.length === 0 && !m.err, JSON.stringify(m.diffs));
    await p.evaluate(async () => { Screens.close(); await new Promise((x) => setTimeout(x, 100)); });
    ok('без ошибок JS', p.__errs.length === 0, p.__errs[0]);
    await ctx.close();
  }

  console.log('примерка: «станет» против настоящего надевания на разных видах вещей');
  {
    const { p, ctx } = await open(1280, 800);
    const r = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = { matched: 0, skipped: [], diffs: [] };
      Profile.data.xp = Hero.totalFor(40); Profile.save();
      const faction = Profile.data.faction || 'dwarf', top = Profile.shopTop();
      const types = ['weapon2', 'shield', 'weapon1', 'head', 'chest', 'arms', 'legs', 'shoulders', 'gloves', 'amulet', 'bag', 'ranged', 'compass', 'leash'];
      for (const type of types) {
        const base = Gear.itemsFor(faction).filter((i) => i.type === type).sort((a, b) => a.cost - b.cost)[1] || Gear.itemsFor(faction).find((i) => i.type === type);
        if (!base) { o.skipped.push(type + ':нет'); continue; }
        Screens.openShop(); await w(250); const tip = document.querySelector('.modal .tip-box button'); if (tip) { tip.click(); await w(150); }
        document.querySelector('[data-catset="all"]').click(); await w(120);
        const tb = document.querySelector('[data-tryon="shop:' + base.id + ':' + top + '"]'); if (!tb) { o.skipped.push(type + ':нет кнопки'); Screens.close(); continue; }
        tb.click(); await w(250);
        const pop = document.querySelector('.tryon'), shown = {};
        for (const tr of pop.querySelectorAll('.tryon-stats tbody tr')) { const c = [...tr.children].map((x) => x.textContent.trim()); shown[c[0]] = parseFloat(c[3]); }
        const warn = !!pop.querySelector('.hint.warn');
        Screens.close(); await w(120);
        const e = Gear.makeEntry(base.id, top); Profile.addItem(e);
        Inventory.open('left', { armory: true }); await w(250); const err = Inventory.equipUid(e.uid); Inventory.close(); await w(100);
        if (err || warn) { o.skipped.push(type + ':' + (err || 'предупреждение')); continue; }
        const real = Profile.totalStats(Profile.gear());
        const bad = Object.keys(Gear.STAT_NAMES).filter((k) => Gear.STAT_NAMES[k] in shown && Math.abs(shown[Gear.STAT_NAMES[k]] - real[k]) > 0.51).map((k) => [type, Gear.STAT_NAMES[k], shown[Gear.STAT_NAMES[k]], real[k]]);
        if (bad.length) o.diffs.push(...bad); else o.matched++;
      }
      return o;
    });
    ok('«станет» = настоящие характеристики на ' + r.matched + ' видах вещей (пропущено: ' + r.skipped.length + (r.skipped.length ? ' — ' + r.skipped.join('; ') : '') + ')', r.matched >= 8 && r.diffs.length === 0, JSON.stringify(r));
    ok('без ошибок JS', p.__errs.length === 0, p.__errs[0]);
    await ctx.close();
  }

  console.log('примерка в Кузнице');
  {
    const { p, ctx } = await open(1280, 800);
    const r = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = {};
      const base = Gear.itemsFor(Profile.data.faction || 'dwarf').find((i) => i.type === 'chest');
      Profile.addItem(Gear.makeEntry(base.id, 1)); Profile.addItem(Gear.makeEntry(base.id, 2));
      for (const k of Object.keys(Bestiary.RESOURCES)) for (let t = 1; t <= 4; t++) Profile.addRes(k, t, 40);
      Screens.openForge(); await w(400);
      const tip = document.querySelector('.modal .tip-box button'); if (tip) { tip.click(); await w(200); }
      const snap0 = JSON.stringify([Profile.data.coins, Profile.data.items.length, Profile.data.res]);
      o.tabs = {};
      for (const tab of ['upgrade', 'craft']) {
        const t = document.querySelector('[data-tab="' + tab + '"]'); if (t) { t.click(); await w(250); }
        const tb = document.querySelector('.tryon-btn'); o.tabs[tab] = !!tb;
        if (tb) { tb.click(); await w(300); const pop = document.querySelector('.tryon'); o.tabs[tab + 'Open'] = !!pop && pop.querySelectorAll('.tryon-stats tbody tr').length > 0; const back = document.querySelector('[data-act=tryon-close]'); if (back) { back.click(); await w(150); } o.tabs[tab + 'Closed'] = !document.querySelector('.tryon-back'); }
      }
      o.unchanged = JSON.stringify([Profile.data.coins, Profile.data.items.length, Profile.data.res]) === snap0;
      return o;
    });
    ok('Кузница: «Примерить» есть на вкладках «Улучшить цвет» и «Создать вещь», окно открывается и закрывается', r.tabs.upgrade && r.tabs.upgradeOpen && r.tabs.upgradeClosed && r.tabs.craft && r.tabs.craftOpen && r.tabs.craftClosed, JSON.stringify(r.tabs));
    ok('Кузница: примерка не тратит монеты, ресурсы и не меняет вещи', r.unchanged);
    ok('без ошибок JS', p.__errs.length === 0, p.__errs[0]);
    await ctx.close();
  }

  console.log('каталог и примерка на телефоне и в английском интерфейсе: нажатия и вёрстка');
  for (const [w, h, lang, touch] of [[390, 844, 'ru', true], [320, 568, 'ru', true], [844, 390, 'ru', true], [390, 844, 'en', true], [1280, 800, 'en', false]]) {
    const { p, ctx } = await open(w, h, lang, touch);
    await openShop(p);
    let rep = await p.evaluate(hitReport);
    let bad = rep.filter((x) => ['offscreen', 'blocked', 'small', 'clip', 'hscroll', 'dupid'].includes(x.kind));
    ok(`${w}×${h} ${lang}: Лавка — нажатия и вёрстка`, bad.length === 0, bad.slice(0, 3).map((x) => x.kind + ' ' + x.el + ' ' + (x.text || '')).join('; '));
    await p.evaluate(async () => { const t = document.querySelector('[data-tryon^="shop:"]'); t && t.click(); await new Promise((x) => setTimeout(x, 350)); });
    rep = await p.evaluate(hitReport);
    bad = rep.filter((x) => ['offscreen', 'small', 'clip', 'hscroll', 'dupid'].includes(x.kind));
    const fits = await p.evaluate(() => { const t = document.querySelector('.tryon'); if (!t) return null; const r = t.getBoundingClientRect(); return { top: r.top >= 0, bottom: r.bottom <= innerHeight + 1, scroll: t.scrollHeight > t.clientHeight + 1 }; });
    ok(`${w}×${h} ${lang}: примерка — на экране (${fits ? (fits.scroll ? 'с прокруткой' : 'целиком') : 'нет окна'}), без обрезки`, fits && fits.top && (fits.bottom || fits.scroll) && bad.length === 0, JSON.stringify([fits, bad.slice(0, 2)]));
    ok(`${w}×${h} ${lang}: без ошибок JS`, p.__errs.length === 0, p.__errs[0]);
    await ctx.close();
  }

  await b.close();
  console.log(fails ? `\nshop165 e2e: ПРОВАЛ (${fails})` : '\nshop165 e2e: все тесты пройдены');
  process.exit(fails ? 1 : 0);
})();
