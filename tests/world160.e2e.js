// 1.5.4: быстрый старт, быстрый бой, элитные и стражи, события, логова, Арена теней, Испытание дня.
// Запуск: NODE_PATH=$(npm root -g) node tests/world160.e2e.js   (Playwright — не параллельно с другими e2e)
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const page = async (hash, vp = [1280, 800], touch = false) => {
    const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] }, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) {} });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    await p.goto(URL + (hash ? '#dev-' + hash : '')); p.ctx = ctx;
    return p;
  };
  const endWin = (p) => p.evaluate(() => { moves = 30; fighters.right.hp = 0; checkEnd(); });
  const toMap = async (p) => { await sleep(1300); await p.evaluate(() => { const x = document.querySelector('.overlay .to-map'); if (x) x.click(); }); await sleep(900); };

  /* 1. Быстрый старт: учебный бой одним нажатием, народ — после победы */
  let p = await page('', [390, 844], true);
  await p.waitForSelector('.coach button[data-coach]', { timeout: 6000 });
  ok(await p.evaluate(() => !Screens.isOpen && !Profile.data.faction), 'новичок: сначала Бобёр, а не выбор народа');
  await p.evaluate(() => document.querySelector('.coach button[data-coach]:not([data-coach=skip])').click());
  await sleep(1300);
  ok(await p.evaluate(() => document.body.classList.contains('mode-battle') && fighters.right.monsterId === 'beaver'), 'одно нажатие — и учебный бой');
  await p.evaluate(() => { Tutorial._go(Tutorial.STEPS.findIndex((x) => x.wait === 'win')); });
  await sleep(300);
  await p.evaluate(() => { fighters.right.hp = 0; checkEnd(); Tutorial.event('win'); });
  await toMap(p);
  ok(await p.evaluate(() => Screens.isOpen && !!document.querySelector('[data-pick-faction]')), 'после победы — выбор народа');
  await p.evaluate(() => document.querySelector('[data-pick-faction=human]').click()); await sleep(150);
  await p.evaluate(() => document.querySelector('[data-gender=m]').click()); await sleep(100);
  await p.evaluate(() => document.querySelector('[data-random-name]').click()); await sleep(100);
  await p.evaluate(() => document.querySelector('[data-act=start]').click()); await sleep(1200);
  ok(await p.evaluate(() => Profile.data.faction === 'human' && !document.querySelector('.coach').hidden && /Ты — /.test(document.querySelector('.coach').textContent)), 'после выбора — шаг о приёме народа');
  for (let i = 0; i < 2; i++) { await p.evaluate(() => document.querySelector('.coach button[data-coach]:not([data-coach=skip])').click()); await sleep(600); }
  ok(await p.evaluate(() => Profile.data.tutorial.done && Profile.data.tutorial.rewarded), 'обучение завершено с наградой');
  await p.evaluate(() => Screens.openShop()); await sleep(200);
  ok(await p.evaluate(() => !!document.querySelector('.modal .tip-box')), 'подсказка при первом входе в Лавку');
  await p.evaluate(() => document.querySelector('.tip-box [data-tip]').click()); await sleep(150);
  ok(await p.evaluate(() => !document.querySelector('.modal .tip-box')), 'подсказка закрывается и больше не показывается');
  ok(p.errs.length === 0, 'быстрый старт: ошибки ' + p.errs.join('; '));
  await p.ctx.close();

  /* 2. События, быстрый бой, элитные, стражи, логово */
  p = await page('map-meadow');
  await sleep(2600);
  await p.evaluate(() => { Profile.data.coins = 1e7; Profile.data.backpack.potion = 5; Profile.data.petStay = true; });
  ok(await p.evaluate(() => MapView.world.events.length >= 20 && MapView.world.lairs.length === 5), 'на карте есть события и логова');
  const ev = async (kind) => p.evaluate((k) => { const e = MapView.world.events.find((x) => x.kind === k); if (!e) return null; MapView.state.evUsed[e.id] = 0; MapView.showEvent(e); const before = { coins: Profile.data.coins, potion: Profile.data.backpack.potion }; document.querySelector('#map-card [data-ev]').click(); return { before, after: { coins: Profile.data.coins, potion: Profile.data.backpack.potion }, used: MapView.state.evUsed[e.id] > Date.now() || !!(MapView.state.evShop || {})[e.id], bless: Profile.data.blessing }; }, kind);
  const cache = await ev('cache'); if (cache) ok(cache.after.coins > cache.before.coins && cache.used, 'тайник: монеты и событие закрыто');
  const altar = await ev('altar'); if (altar) ok(altar.bless && altar.bless.fights === 3, 'алтарь: благословение на 3 боя');
  const beast = await ev('beast'); if (beast) ok(beast.after.potion === beast.before.potion - 1 && beast.used, 'зверь: тратится зелье');
  const merch = await ev('merchant'); if (merch) ok(merch.after.coins < merch.before.coins, 'торговец: покупка');
  // благословение действует в бою и тратится
  await p.evaluate(() => { Profile.data.blessing = { kind: 'stone', fights: 1 }; MapView.startSpecial({ id: 'rat', tier: 1 }); });
  await sleep(1500);
  const bl = await p.evaluate(() => ({ bless: fighters.left.bless, max: fighters.left.max, base: fighters.left.base + fighters.left.stats.health }));
  ok(bl.bless === 'stone' && bl.max >= Math.round(bl.base * 1.19), 'стойкость алтаря: +20% ХП в бою');
  await endWin(p); await toMap(p);
  ok(await p.evaluate(() => Profile.data.blessing === null), 'благословение иссякло после боя');
  // платное воскрешение выключено до сервера: кнопки на экране поражения нет
  await p.evaluate(() => { const far = MapView.map.spawns.find((s) => !s.boss); Profile.data.map.pos = far.idx; MapView.startSpecial({ id: 'rat', tier: 1, ambush: true }); });
  await sleep(1500);
  await p.evaluate(() => { fighters.left.hp = 0; checkEnd(); }); await sleep(1500);
  ok(await p.evaluate(() => !document.querySelector('.overlay .revive-btn') && !!document.querySelector('.overlay .to-map')), 'воскрешение выключено: кнопки нет, «На карту» есть');
  await toMap(p);
  // горячие клавиши боя: H — подсказка, 1 — первое заклинание (по коду клавиши, не по букве)
  await p.evaluate(async () => { MapView.startSpecial({ id: 'rat', tier: 1 }); await new Promise((r) => setTimeout(r, 1500)); window.__k = { h: 0, s: 0 }; document.getElementById('hint').addEventListener('click', () => window.__k.h++); const sb = spellbarEl.children[0]; sb.disabled = false; sb.addEventListener('click', () => window.__k.s++); });
  await p.keyboard.press('KeyH');
  await p.evaluate(() => { spellbarEl.children[0].disabled = false; document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', bubbles: true })); });   // в одном вызове: игра не успеет снова выключить кнопку
  await sleep(300);
  const kk = await p.evaluate(() => window.__k);
  ok(kk.h === 1 && kk.s === 1, 'горячие клавиши боя: H и 1 → ' + JSON.stringify(kk));
  // 1.5.9: долгое нажатие на кнопку заклинания (сенсор) показывает описание и не нажимает кнопку
  const lp = await p.evaluate(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const b = spellbarEl.children[1]; let clicks = 0; b.addEventListener('click', () => clicks++); const ev = (t) => b.dispatchEvent(new PointerEvent(t, { pointerType: 'touch', bubbles: true, clientX: 50, clientY: 50 })); ev('pointerdown'); await w(700); const tip = document.querySelector('.lp-tip'); const shown = !!tip && !tip.hidden && tip.textContent === b.title && b.title.length > 3; ev('pointerup'); b.click(); await w(100); return { shown, clicks, title: b.title }; });
  ok(lp.shown && lp.clicks === 0, 'долгое нажатие: описание показано, нажатия нет: ' + JSON.stringify(lp));
  // 1.5.9: карточка вещи открывается поверх экрана победы/поражения (а не под ним)
  const top = await p.evaluate(async () => { try { const w = (ms) => new Promise((r) => setTimeout(r, ms)); fighters.left.hp = 0; checkEnd(); await w(600); const it = Profile.data.items[0]; if (!it) return 'нет вещей'; ItemInfo.open(it.uid); await w(300); const t = document.elementFromPoint(innerWidth / 2, innerHeight / 2); const r = !!(t && t.closest('.item-info-back')); document.querySelector('.item-info-back [data-act=close]').click(); return r; } catch (e) { return String(e); } });
  ok(top === true, 'карточка вещи поверх экрана победы/поражения: ' + top);
  await p.evaluate(() => { if (document.body.classList.contains('mode-battle')) { fighters.left.hp = 0; checkEnd(); } }); await toMap(p);
  // учебный бой с Бобром: вкладка «Противник» в ранце не падает (у Бобра нет записи в бестиарии)
  const bv = await p.evaluate(async () => { try { MapView.startTraining(); await new Promise((r) => setTimeout(r, 1200)); Inventory.open('right'); await new Promise((r) => setTimeout(r, 300)); const t = !!document.querySelector('.modal'); Inventory.close && Inventory.close(); return t; } catch (e) { return String(e); } });
  ok(bv === true, 'ранец → противник в учебном бою: ' + bv);
  await p.evaluate(() => { if (document.body.classList.contains('mode-battle')) { fighters.left.hp = 0; checkEnd(); } }); await toMap(p);
  // 1.5.7: сумка — подвкладки «Эликсиры»/«Ресурсы» с ячейками, на вещах героя нет цифры цвета
  const bg = await p.evaluate(async () => { try { const w = (ms) => new Promise((r) => setTimeout(r, ms)); Profile.data.res = Profile.data.res || {}; Inventory.open('left'); await w(300); const root = document.querySelector('.home-modal'); if (!root) return 'нет окна'; const o = { tabs: root.querySelectorAll('.bag-tabs [data-btab]').length, cellsE: root.querySelectorAll('.bp-pane[data-p=elix] .stash-cell').length, noNum: !root.querySelector('.dslot .tier-num'), noPack: !/рюкзак/i.test(root.textContent) }; root.querySelector('.bag-tabs [data-btab=res]').click(); await w(200); o.resShown = getComputedStyle(document.querySelector('.bp-pane[data-p=res]')).display !== 'none' && getComputedStyle(document.querySelector('.bp-pane[data-p=elix]')).display === 'none'; o.cellsR = document.querySelectorAll('.bp-pane[data-p=res] .stash-cell').length; Inventory.close && Inventory.close(); return o; } catch (e) { return String(e); } });
  ok(bg && bg.tabs === 2 && bg.cellsE >= 12 && bg.cellsR >= 12 && bg.noNum && bg.noPack && bg.resShown, 'сумка: подвкладки и ячейки: ' + JSON.stringify(bg));
  // 1.5.7: карточка героя (не оружейная): нажатие на надетую вещь открывает карточку вещи
  const ic = await p.evaluate(async () => { try { const w = (ms) => new Promise((r) => setTimeout(r, ms)); Inventory.open('left'); await w(300); const b = document.querySelector('.home-modal .dslot.filled'); if (!b) return 'нет надетых вещей'; b.click(); await w(300); const r = !!document.querySelector('.item-info-back'); const c = document.querySelector('.item-info-back [data-act=close]'); if (c) c.click(); Inventory.close && Inventory.close(); return r; } catch (e) { return String(e); } });
  ok(ic === true, 'карточка героя: нажатие на вещь открывает её карточку: ' + ic);
  // быстрый бой
  const q = await p.evaluate(() => { Profile.data.xp = Hero.totalFor(40); const sp = MapView.map.spawns.find((s) => !s.boss && s.tier === 1 && MapView.alive(s) && !MapView.eliteOf(s) && MapView.known(s.idx)); Profile.data.bestiary[sp.species] = { wins: 1, tier: 1 }; MapView.showMonster ? 0 : 0; MapView.tap(sp.idx); return { id: sp.id, btn: !!document.querySelector('#map-card [data-act=quick]'), coins: Profile.data.coins }; });
  ok(q.btn, 'на карточке слабого существа есть «Быстрый бой»');
  await p.evaluate(() => document.querySelector('#map-card [data-act=quick]').click());
  await sleep(8000);
  ok(await p.evaluate((id) => !MapView.alive(MapView.map.spawns[id]) && /Быстрый бой/.test(document.querySelector('#map-card').textContent) && document.body.classList.contains('mode-map'), q.id), 'быстрый бой: победа без поля боя');
  // элитный: ХП ×1.25 и свойство
  const plain = await p.evaluate(async () => { MapView.startSpecial({ id: 'wolf', tier: 3 }); await new Promise((r) => setTimeout(r, 1200)); return fighters.right.max; });
  await p.evaluate(() => { const r = document.getElementById('restart'); if (r) { r.click(); r.click(); } }); await sleep(800);
  await p.evaluate(() => { if (document.body.classList.contains('mode-battle')) { fighters.left.hp = 0; checkEnd(); } }); await toMap(p);
  const el = await p.evaluate(async () => { MapView.startSpecial({ id: 'wolf', tier: 3, elite: 'veil' }); await new Promise((r) => setTimeout(r, 1200)); return { max: fighters.right.max, ax: fighters.right.affixes, name: fighters.right.name }; });
  ok(el.ax[0] === 'veil' && el.max > plain * 1.2 && /★/.test(el.name), 'элитный: свойство, ХП больше, звезда в имени (' + plain + ' → ' + el.max + ')');
  // свойство срабатывает: туман на 2-м ходу
  const veiled = await p.evaluate(async () => { fighters.right.turnNo = 1; await enemyTurnStart(); return veiled.size; });
  ok(veiled > 0, 'свойство «Туман» прячет камни');
  await p.evaluate(() => { fighters.left.hp = 0; checkEnd(); }); await toMap(p);
  // страж b1: зов стаи
  const pack = await p.evaluate(async () => { MapView.startSpecial({ id: 'wolf', tier: 2, boss: 'b1' }); await new Promise((r) => setTimeout(r, 1300)); const hp0 = fighters.left.hp; fighters.right.turnNo = 3; await enemyTurnStart(); return { g: fighters.right.guardian, lost: hp0 - fighters.left.hp, max: fighters.left.max }; });
  ok(pack.g === 'b1' && pack.lost >= Math.round(pack.max * 0.06), 'страж b1: «Зов стаи» кусает');
  await p.evaluate(() => { fighters.left.hp = 0; checkEnd(); }); await toMap(p);
  // страж b5: ярость на половине ХП
  const rage = await p.evaluate(async () => { Profile.data.story = { shards: { b1: 1, b2: 1, b3: 1, b4: 1 } }; MapView.startSpecial({ id: 'dragon', tier: 10, boss: 'b5' }); await new Promise((r) => setTimeout(r, 1300)); const d0 = fighters.right.dmg; fighters.right.hp = Math.round(fighters.right.max * 0.4); await enemyTurnStart(); return fighters.right.enraged && fighters.right.dmg > d0 * 1.2; });
  ok(rage, 'страж b5: ярость дракона');
  await p.evaluate(() => { fighters.left.hp = 0; checkEnd(); }); await toMap(p);
  // логово
  await p.evaluate(() => { const l = MapView.world.lairs[0]; MapView.showLair(l); document.querySelector('[data-lair=enter]').click(); });
  await sleep(1400);
  ok(await p.evaluate(() => !!Profile.data.lair && Profile.data.monster.lair === 'L0'), 'логово: начался первый бой');
  await p.evaluate(() => { fighters.left.hp = Math.round(fighters.left.max * 0.5); }); await endWin(p); await toMap(p);
  const fork = await p.evaluate(() => ({ txt: document.querySelector('#map-card').textContent, run: Profile.data.lair }));
  ok(/развилка/.test(fork.txt) && fork.run.step === 1 && fork.run.hp > 0, 'логово: развилка после победы');
  await p.evaluate(() => document.querySelector('[data-lair=danger]').click()); await sleep(1400);
  const l2 = await p.evaluate(() => ({ hp: fighters.left.hp, max: fighters.left.max, el: fighters.right.affixes.length }));
  ok(l2.hp < l2.max && l2.el === 1, 'логово: ХП не восстановилось, опасный путь — элитный');
  await p.evaluate(() => { fighters.left.hp = 0; checkEnd(); }); await toMap(p);
  ok(await p.evaluate(() => Profile.data.lair === null && MapView.state.lairCd.L0 > Date.now()), 'логово: поражение заканчивает вылазку');
  ok(p.errs.length === 0, 'карта: ошибки ' + p.errs.join('; '));
  await p.ctx.close();

  /* 3. Арена теней и Испытание дня */
  p = await page('scr-arena');
  await sleep(2400);
  ok(await p.evaluate(() => Screens.isOpen && !!document.querySelector('[data-arena=fight]')), 'арена открывается');
  await p.evaluate(() => document.querySelector('[data-arena=fight]').click()); await sleep(1500);
  const sh = await p.evaluate(() => ({ s: !!fighters.right.shadowHero, pet: typeof Duo !== 'undefined' && !!(Duo.on() && Duo.pet), av: document.querySelector('#fighter-right .avatar').innerHTML.length }));
  ok(sh.s && !sh.pet && sh.av > 100, 'бой с тенью: портрет героя, без питомца');
  const c0 = await p.evaluate(() => Profile.data.coins);
  await endWin(p);
  await sleep(1200);
  ok(await p.evaluate((c) => Profile.data.arena.stars === 1 && Profile.data.coins > c && /звёзды/.test(document.querySelector('.overlay').textContent), c0), 'победа на арене: звезда и монеты');
  await toMap(p);
  ok(await p.evaluate(() => Screens.isOpen), 'после боя арена открывается снова');
  await p.evaluate(() => document.querySelector('[data-arena=fight]').click()); await sleep(1400);
  await p.evaluate(() => { fighters.left.hp = 0; checkEnd(); }); await sleep(1200);
  ok(await p.evaluate(() => Profile.data.arena.stars === 0 && Profile.data.arena.losses === 1), 'поражение снимает звезду');
  await toMap(p);
  // испытание: одно поле на всех
  await p.evaluate(() => { document.querySelector('[data-tab=daily]').click(); });
  await sleep(200);
  await p.evaluate(() => document.querySelector('[data-arena=challenge]').click()); await sleep(1500);
  const b1 = await p.evaluate(() => ({ typ: typOf().join(''), max: fighters.left.max, gear: Object.values(fighters.left.gear).filter(Boolean).length, tries: Profile.data.challenge.tries, potion: bagDisabled('potion') }));
  ok(b1.tries === 1 && b1.gear === 0 && b1.potion, 'испытание: попытка засчитана, герой без вещей и зелий');
  await p.evaluate(() => { fighters.left.hp = 0; checkEnd(); }); await sleep(1200);
  ok(await p.evaluate(() => /Очки/.test(document.querySelector('.overlay').textContent) && Profile.data.challenge.history[Profile.data.challenge.day] !== undefined), 'испытание: очки записаны');
  ok(p.errs.length === 0, 'арена: ошибки ' + p.errs.join('; '));
  await p.ctx.close();
  const p2 = await page('scr-trial'); await sleep(2400);
  await p2.evaluate(() => document.querySelector('[data-arena=challenge]').click()); await sleep(1500);
  const b2 = await p2.evaluate(() => ({ typ: typOf().join(''), max: fighters.left.max }));
  ok(b1.typ === b2.typ && b1.max === b2.max, 'испытание: у другого игрока то же поле и тот же герой');
  await p2.ctx.close();

  /* 4. Арена закрыта новичку */
  p = await page('map-village'); await sleep(2200);
  ok(await p.evaluate(() => !Unlocks.isOpen({ wins: 5 }, 'arena') && Unlocks.isOpen({ wins: 6 }, 'arena')), 'арена открывается после 6 побед');
  await p.ctx.close();

  await b.close();
  console.log(bad ? 'world160 e2e: ПРОВАЛ (' + bad + ')' : 'world160 e2e: все тесты пройдены');
  process.exit(bad ? 1 : 0);
})();
