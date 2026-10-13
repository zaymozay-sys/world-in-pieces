// 1.7.3: Оглушение, Отрава, Щит, подпись «что дальше» и хозяева зон в настоящем браузере (в обычный `npm test` не входит).
// Запуск: NODE_PATH=$(npm root -g) node tests/moves173.e2e.js   (скриншоты: SHOTS=папка)
const { launch: launchBrowser } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path'), fs = require('fs');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const SHOTS = process.env.SHOTS || '';
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await launchBrowser();
  const page = async (hash, vp = [1280, 800], touch = false, skin = '2') => {
    const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] }, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript((skin) => { try { localStorage.setItem('wip-lang', 'ru'); localStorage.setItem('wip-ui-skin', skin); } catch (e) {} }, skin);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    await p.goto(URL + '#dev-' + hash); p.ctx = ctx;
    await sleep(2200);
    return p;
  };
  const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
  // «Первым ходит противник» — игра сама делает его первый ход; ждём, пока очередь дойдёт до героя, и только потом вмешиваемся
  const fast = async (p) => {
    await p.evaluate(() => { for (const k in RULES.timing) RULES.timing[k] = 5; });
    await p.waitForFunction(() => !busy && /^Ваш ход/.test(document.getElementById('status').textContent), null, { timeout: 25000 });
  };
  const enemyRound = async (p) => {   // один ход существа целиком (с пропуском героя, если оглушили)
    await p.evaluate(() => { window.__done = false; busy = true; enemyTurn().then(() => { window.__done = true; }); });
    await p.waitForFunction(() => window.__done === true, null, { timeout: 25000 });
    await sleep(150);
    await p.waitForFunction(() => !busy, null, { timeout: 25000 });
  };

  /* 1. Огр: Оглушение и подпись «что дальше» */
  for (const [skin, vp, touch] of [['1', [1280, 800], false], ['2', [1280, 800], false], ['3', [1280, 800], false], ['2', [390, 844], true], ['3', [390, 844], true]]) {
    const tag = `огр, оформление ${skin}, ${vp[0]}px`;
    const p = await page('fight-ogre-4-solo', vp, touch, skin);
    await fast(p);
    ok(await p.evaluate(() => fighters.right.monsterId === 'ogre'), tag + ': бой с огром');
    const txt = await p.evaluate(() => { const l = document.querySelector('#fighter-right .ability-line, .ability-line'); return l ? l.textContent : ''; });
    ok(/Оглушение/.test(txt) && /· (через|в ближайший)/.test(txt), tag + ': строка приёма с подписью «' + txt.trim() + '»');
    await p.evaluate(() => { fighters.right.turnNo = 4; renderBadge('right'); });
    ok(await p.evaluate(() => !!document.querySelector('.ability-line .next.soon') && /в ближайший ход/.test(document.querySelector('.ability-line .next').textContent)), tag + ': перед срабатыванием — «в ближайший ход» (янтарным)');
    if (vp[0] >= 700) {
      const fit = await p.evaluate(() => { const l = document.querySelector('.ability-line'); const r = l.getBoundingClientRect(); return { right: r.right, w: innerWidth, vis: r.width > 0 && getComputedStyle(l).display !== 'none' }; });
      ok(fit.vis && fit.right <= fit.w + 1, tag + ': подпись помещается в экран');
    } else {
      // телефон: строка приёма скрыта, подпись — в хвосте строки хода
      const st = await p.evaluate(() => { const e = document.getElementById('status'); const cs = getComputedStyle(e, '::after'); return { content: cs.content, display: cs.display, color: cs.color, text: e.textContent, soon: e.hasAttribute('data-soon'), over: e.scrollWidth > e.clientWidth + 1, ov: getComputedStyle(e).textOverflow }; });
      ok(/Оглушение: в ближайший ход/.test(st.content) && st.display === 'inline' && st.soon, tag + ': подпись в строке хода «' + st.content + '»');
      ok(st.text === 'Ваш ход', tag + ': текст строки хода не испорчен («' + st.text + '»)');
    }
    if (skin === '3') {
      const col = await p.evaluate(() => { const e = document.getElementById('enemy-col'); return e ? e.textContent + '|' + (e.innerHTML.match(/title="[^"]*"/g) || []).join('') : ''; });
      ok(/ближайший|через/.test(col) || /Оглушение/.test(col), tag + ': столбец противника показывает приём «' + col.slice(0, 80).replace(/\n/g, ' ') + '»');
    }
    await shot(p, `ogre-s${skin}-${vp[0]}`);
    if (skin === '2' && vp[0] === 1280) {
      // Оглушение сработает на 5-м ходу существа; Блок героя обнуляем (его могут пересчитать — тогда повторяем бросок)
      let stunnedRound = null;
      for (let a = 0; a < 8 && !stunnedRound; a++) {
        await p.evaluate(() => { fighters.left.stats.block = 0; fighters.right.stats.block = 0; fighters.left.hp = fighters.left.max; fighters.right.turnNo = 4; });
        const before = await p.evaluate(() => ({ n: fighters.right.turnNo, skips: (document.body.textContent.match(/оглушён, ход пропущен/g) || []).length }));
        await enemyRound(p);
        const r = await p.evaluate(() => ({ turnNo: fighters.right.turnNo, stunned: fighters.left.stunned, text: document.body.textContent }));
        const skips = (r.text.match(/оглушён, ход пропущен/g) || []).length;
        if (skips > before.skips) stunnedRound = { before, r };
      }
      ok(!!stunnedRound, tag + ': оглушение сработало и ход героя пропущен');
      if (stunnedRound) {
        ok(stunnedRound.r.turnNo >= stunnedRound.before.n + 2, tag + ': существо ходило ещё раз (ходов ' + stunnedRound.before.n + ' → ' + stunnedRound.r.turnNo + ')');
        ok(!stunnedRound.r.stunned, tag + ': флаг оглушения снят');
      }
      ok(await p.evaluate(() => !busy && !over), tag + ': ход вернулся герою');
    }
    ok(p.errs.length === 0, tag + ': без ошибок страницы ' + p.errs.join('; '));
    await p.ctx.close();
  }

  /* 2. Блок героя даёт шанс устоять */
  {
    const p = await page('fight-ogre-4-solo'); await fast(p);
    await p.evaluate(() => { fighters.left.stats.block = 100; fighters.right.turnNo = 4; });
    await enemyRound(p);
    const t = await p.evaluate(() => document.body.textContent);
    ok(/Блок спас ход|устояли/i.test(t) || await p.evaluate(() => fighters.left.stunned === false), 'Блок 100%: оглушение не проходит');
    ok(!/оглушён, ход пропущен/.test(t), 'Блок 100%: ход не пропущен');
    await p.ctx.close();
  }

  /* 3. Тень-убийца: Отрава жжёт героя */
  {
    const p = await page('fight-assassin-5-solo'); await fast(p);
    await p.evaluate(() => { fighters.left.stats.block = 0; fighters.left.stats.defense = 0; fighters.right.turnNo = 3; fighters.right.stats.ricochet = 0; });
    const hp0 = await p.evaluate(() => fighters.left.hp);
    await enemyRound(p);
    const r = await p.evaluate(() => ({ toxinTurns: Balance.abilities.toxin.turns, poison: fighters.left.poison, hp: fighters.left.hp, max: fighters.left.max, text: document.body.textContent }));
    ok(r.poison && r.poison.turns === r.toxinTurns - 1 && r.poison.dmg >= 1, 'Отрава: яд на герое, один тик уже прошёл ' + JSON.stringify(r.poison));
    ok(r.hp < hp0 && /Яд: .* теряет/.test(r.text), 'Отрава: ХП героя упали (' + hp0 + ' → ' + r.hp + '), строка яда в журнале');
    // тики идут при следующих ходах существа и заканчиваются
    for (let i = 0; i < 3; i++) { await p.evaluate(() => { fighters.right.turnNo = 0; fighters.left.hp = fighters.left.max; }); await enemyRound(p); }
    ok(await p.evaluate(() => !(fighters.left.poison && fighters.left.poison.turns > 0) || fighters.right.turnNo >= 4), 'Отрава: яд заканчивается');
    ok(p.errs.length === 0, 'Отрава: без ошибок страницы ' + p.errs.join('; '));
    await p.ctx.close();
  }

  /* 4. Краб: Щит принимает урон */
  {
    const p = await page('fight-crab-3-solo'); await fast(p);
    await p.evaluate(() => { fighters.right.turnNo = 3; });
    await enemyRound(p);
    await p.evaluate(() => { fighters.right.stats.block = 0; fighters.right.stats.ricochet = 0; });
    const w = await p.evaluate(() => ({ ward: fighters.right.ward, max: fighters.right.max, pct: Balance.abilities.ward.pct, badge: document.body.textContent }));
    ok(w.ward > 0 && w.ward <= Math.round(w.max * w.pct) && /Щит \d+/.test(w.badge), 'Щит: поднят (' + w.ward + '), на панели «Щит N»');
    const hp1 = await p.evaluate(() => fighters.right.hp);
    const d = await p.evaluate(() => { fighters.right.ward = 10 ** 6; const ward0 = fighters.right.ward, hp0 = fighters.right.hp; const dealt = dealDamage('right', 5, false, false); return { ward0, ward1: fighters.right.ward, hp0, hp1: fighters.right.hp, dealt }; });
    ok(d.ward1 < d.ward0 && d.hp1 === d.hp0, 'Щит: удар съел щит (' + d.ward0 + ' → ' + d.ward1 + '), ХП нетронуты');
    await shot(p, 'crab-ward');
    ok(p.errs.length === 0, 'Щит: без ошибок страницы ' + p.errs.join('; '));
    await p.ctx.close();
  }

  /* 5. Хозяин зоны: карточка, бой, награда */
  {
    const p = await page('map-meadow');
    await p.evaluate(() => { MapView.devRevealAll && MapView.devRevealAll(); Profile.data.coins = 0; Profile.data.petStay = true; });
    const zones = await p.evaluate(() => MapView.map.spawns.filter((s) => s.zone).map((s) => ({ id: s.id, idx: s.idx, zone: s.zone, species: s.species, tier: s.tier })));
    ok(zones.length >= 3, 'на карте есть хозяева зон: ' + zones.map((z) => z.zone).join(','));
    const z = zones[0];
    await p.evaluate((z) => { MapView.tap(z.idx); }, z);
    await sleep(500);
    const card = await p.evaluate(() => { const c = document.getElementById('map-card'); return c ? c.textContent : ''; });
    ok(/Хозяин зоны/.test(card) && /Добавочные приёмы/.test(card) && /трофей/.test(card), 'карточка хозяина зоны: ' + card.slice(0, 110).replace(/\s+/g, ' '));
    await shot(p, 'zone-card');
    // бой
    await p.evaluate((z) => { for (const k in RULES.timing) RULES.timing[k] = 5; MapView.startSpecial({ id: z.species, tier: z.tier, zone: z.zone }); }, z);
    await sleep(1800);
    const f = await p.evaluate(() => ({ name: fighters.right.name, zone: Profile.data.monster.zone, affixes: fighters.right.affixes, hp: fighters.right.max }));
    const ZBt = await p.evaluate((zid) => World.ZONE_BOSSES[zid].title, z.zone);
    ok(f.name === ZBt && f.affixes.length >= 1 && f.zone === z.zone, 'бой с хозяином зоны: «' + f.name + '», свойства ' + f.affixes.join(','));
    await shot(p, 'zone-fight');
    await p.evaluate(() => { fighters.left.hp = fighters.left.max; });
    // победа: трофей
    const before = await p.evaluate(() => ({ coins: Profile.data.coins, items: Profile.data.items ? Profile.data.items.length : -1, won: JSON.stringify(Profile.data.zoneWon || {}) }));
    await p.evaluate(() => { moves = 30; fighters.right.hp = 0; checkEnd(); });
    await sleep(2500);
    const after = await p.evaluate((zid) => ({ coins: Profile.data.coins, items: Profile.data.items ? Profile.data.items.length : -1, won: !!(Profile.data.zoneWon && Profile.data.zoneWon[zid]), text: document.body.textContent }), z.zone);
    ok(after.won, 'победа записана в профиль (zoneWon)');
    ok(/Трофей хозяина зоны/.test(after.text), 'в окне награды — «Трофей хозяина зоны»');
    ok(after.coins > before.coins, 'монеты получены (' + before.coins + ' → ' + after.coins + ')');
    if (before.items >= 0) ok(after.items >= before.items + 1 && await p.evaluate(() => !!document.querySelector('.loot-chip.item.r-rare')), 'редкая вещь выдана и видна среди добычи (' + before.items + ' → ' + after.items + ')');
    await shot(p, 'zone-win');
    // повторная победа: трофея нет, монеты ×2 остаются
    await p.evaluate(() => { const x = document.querySelector('.overlay .to-map'); if (x) x.click(); }); await sleep(900);
    await p.evaluate((z) => { MapView.startSpecial({ id: z.species, tier: z.tier, zone: z.zone }); }, z);
    await sleep(1500);
    await p.evaluate(() => { moves = 30; fighters.right.hp = 0; checkEnd(); });
    await sleep(2500);
    const again = await p.evaluate(() => document.body.textContent);
    ok(/Хозяин зоны: монеты ×2/.test(again), 'повторная победа: монеты ×2');
    ok(p.errs.length === 0, 'хозяин зоны: без ошибок страницы ' + p.errs.join('; '));
    await p.ctx.close();
  }

  await b.close();
  console.log(bad ? `\nПровалено: ${bad}` : '\nmoves173.e2e: всё в порядке');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
