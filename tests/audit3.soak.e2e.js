// Полный проход, этапы 4–6: длительный (ускоренный) прогон — сотни боёв ботом на ИИ игры, между боями — покупки, продажи, кузница, ряды,
// сумка, питомец, перезагрузки страницы, «обезьяна» по окнам. После каждого шага проверяются инварианты профиля и поля.
// Запуск: node tests/audit3.soak.e2e.js [--battles=200] [--seed=1] [--vp=desktop|phone] [--chores=0.5] [--fuzz=0.12] [--reload=0.04] [--json=file]
// Анимации ускорены (RULES.timing = 3 мс), поэтому это НЕ многочасовая игра в реальном времени — честнее называть «ускоренной выносливостью».
const path = require('path');
const fs = require('fs');
const { launch } = require('../tools/browser.js');
const { seedScript, installBot, timerInit, runBattle } = require('../tools/auditlib.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const BATTLES = Number(arg('battles', 200)), SEED = Number(arg('seed', 1)), VP = arg('vp', 'desktop'), CHORES = Number(arg('chores', 0.5)), FUZZ = Number(arg('fuzz', 0.12)), RELOAD = Number(arg('reload', 0.04)), MOUSE = Number(arg('mouse', 0.35)), SPAM = Number(arg('spam', 4));
const viewport = VP === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 800 };
const rng = (s) => { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const R = rng(SEED * 2654435761);
let printedErrs = 0;
const out = { seed: SEED, vp: VP, battles: 0, wins: 0, losses: 0, stuck: [], invBattle: [], invProfile: [], errs: [], chores: {}, series: [], reloads: 0, timeouts: 0, dbl: { tried: 0, doubled: 0 } };

(async () => {
  const b = await launch({ args: ['--js-flags=--expose-gc'] });
  const ctx = await b.newContext({ viewport, isMobile: VP === 'phone', hasTouch: VP === 'phone' });
  await ctx.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) {} });
  await ctx.addInitScript(timerInit);
  await ctx.addInitScript(seedScript(SEED));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => out.errs.push('pageerror: ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 4).map((x) => x.trim().replace(/file:\/\/\/.*\//, '')).join(' | ')));
  p.on('console', (m) => { if (m.type() === 'error') out.errs.push('console: ' + m.text()); });
  const cdp = await ctx.newCDPSession(p); await cdp.send('Performance.enable');
  const metrics = async () => {
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const extra = await p.evaluate(() => window.__A.dom());
    return { heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(2), nodes: m.Nodes, listeners: m.JSEventListeners, domEls: extra.nodes, intervals: extra.intervals, timeouts: extra.timeouts };
  };

  // старт настоящей игры (не песочница): профиль сохраняется в localStorage этого контекста
  const start = async () => {
    await p.goto(URL); await p.waitForTimeout(1800);
    await p.evaluate(() => { if (!Profile.data.faction && typeof Tutorial !== 'undefined') { Tutorial.start(); Tutorial.finish(false); } }); await p.waitForTimeout(300);
    await p.click('text=Горные кланы').catch(() => {}); await p.click('text=Мужской').catch(() => {});
    await p.fill('input', 'Бот').catch(() => {}); await p.click('text=Начать игру!').catch(() => {});
    await p.waitForTimeout(1200);
    await p.evaluate(installBot);
    await p.evaluate(() => { window.__A.attackNearest; });
  };
  await start();
  out.series.push({ at: 0, ...(await metrics()) });
  const snap = async (label) => out.series.push({ at: out.battles, label, ...(await metrics()) });

  const checkProfile = async (where) => {
    const bad = await p.evaluate(() => window.__A.profileInv());
    for (const m of bad) if (!out.invProfile.some((x) => x.m === m)) out.invProfile.push({ m, where, battle: out.battles });
  };

  // --- «хозяйственные» действия между боями ---
  const chores = {
    async shop() {
      await p.evaluate(async () => {
        const w = (ms) => new Promise((x) => setTimeout(x, ms));
        Profile.data.coins += 5000;     // чтобы покупки состоялись; кошелёк иначе нищий
        Screens.openShop(); await w(120);
        for (let i = 0; i < 6; i++) {
          const sel = ['[data-buy-cat]:not([disabled])', '[data-buy-cons]:not([disabled])', '[data-buy-res]:not([disabled])', '[data-buy-ammo]:not([disabled])'][Math.floor(Math.random() * 4)];
          const bt = document.querySelector(sel); if (bt) { bt.click(); await w(40); }
        }
        const tab = document.querySelector('[data-tab="sell"]'); if (tab) { tab.click(); await w(80); }
        for (let i = 0; i < 6; i++) { const bt = document.querySelector('[data-sell-item],[data-sell-cons],[data-sell-res]'); if (bt) { bt.click(); await w(40); } }
        Screens.close && Screens.close(); await w(60);
      });
    },
    async market() {
      await p.evaluate(async () => {
        const w = (ms) => new Promise((x) => setTimeout(x, ms));
        Screens.open('market'); await w(150);
        const tab = document.querySelector('[data-tab="sell"]'); if (tab) { tab.click(); await w(80); }
        for (const kind of ['item', 'res', 'cons']) {
          const kb = document.querySelector('[data-mk-kind="' + kind + '"]'); if (kb) { kb.click(); await w(60); }
          const pick = document.querySelector('[data-mk-pick]'); if (pick) { pick.click(); await w(60); const ls = document.querySelector('[data-mk-list]:not([disabled])'); if (ls) { ls.click(); await w(60); } }
        }
        const t2 = document.querySelector('[data-tab="lots"]'); if (t2) { t2.click(); await w(80); }
        for (let i = 0; i < 4; i++) { const wd = document.querySelector('[data-mk-withdraw]'); if (wd) { wd.click(); await w(50); } }
        Profile.marketTick(Date.now() + 5 * 3600e3);
        Screens.close && Screens.close(); await w(60);
      });
    },
    async forge() {
      await p.evaluate(async () => {
        const w = (ms) => new Promise((x) => setTimeout(x, ms));
        Profile.data.coins += 20000; const T = Hero.tierFor(Profile.level());
        for (const k of ['ore', 'fang', 'scrap', 'hide', 'crystal', 'essence']) Profile.addRes(k, T, 12);
        Screens.open('forge'); await w(150);
        for (const tab of ['craft', 'upgrade', 'ammo', 'temper', 'refit']) {
          const tb = document.querySelector('[data-tab="' + tab + '"]'); if (!tb) continue; tb.click(); await w(70);
          for (const sel of ['[data-pick]', '[data-do-upgrade]', '[data-do-temper]', '[data-do-refit]', '[data-craft]:not([disabled])', '[data-craft-ammo]']) { const bt = document.querySelector(sel); if (bt) { bt.click(); await w(50); } }
        }
        Screens.close && Screens.close(); await w(60);
      });
    },
    async bag() {
      await p.evaluate(async () => {
        const w = (ms) => new Promise((x) => setTimeout(x, ms));
        Inventory.open('left', { armory: true }); await w(150);
        const items = Profile.data.items.filter((e) => !Profile.equippedUid(e.uid));
        for (let i = 0; i < 4 && items.length; i++) { const e = items[Math.floor(Math.random() * items.length)]; const it = Gear.item(e); const slot = Gear.SLOTS.find((s) => Gear.fits(s, it.type)); try { Inventory.equipUid(e.uid, slot); } catch (er) { /* нельзя */ } await w(40); }
        for (const s of Gear.SLOTS) if (Math.random() < 0.3) { try { Inventory.unequipSlot(s); } catch (er) { /* пусто */ } }
        Inventory.close(); await w(60);
      });
    },
    async pet() {
      await p.evaluate(() => { const c = ['home', 'none', 'tamed'][Math.floor(Math.random() * 3)]; if (c !== 'tamed' || Profile.tamedPet()) Profile.setPetChoice(c); Profile.setPetStay(Math.random() < 0.4); });
    },
    async screens() {
      await p.evaluate(async () => {
        const w = (ms) => new Promise((x) => setTimeout(x, ms));
        for (const f of [() => Screens.openBestiary(), () => Screens.openLibrary(), () => Screens.open('kennel'), () => Screens.open('village'), () => Screens.open('arena'), () => Screens.open('tavern'), () => Screens.open('alchemist'), () => Screens.open('junker')]) {
          try { f(); } catch (e) { window.__A.errs.push('screen: ' + e.message); } await w(120);
          const bs = [...document.querySelectorAll('.modal button:not([disabled])')].filter((x) => !/сброс|удал|импорт|экспорт|язык|new game|reset/i.test(x.textContent + (x.dataset.act || '')));
          for (let i = 0; i < 3 && bs.length; i++) { try { bs[Math.floor(Math.random() * bs.length)].click(); } catch (e) { /* DOM сменился */ } await w(50); }
          try { Screens.close && Screens.close(); } catch (e) { /* закрыто */ } await w(40);
        }
      });
    },
    async teleport() {
      await p.evaluate(() => { const m = MapView.map; const i = Math.floor(Math.random() * m.cells.length); try { MapView.devTeleport(i, 3); } catch (e) { /* стена */ } });
    },
  };
  const choreNames = Object.keys(chores);

  for (let n = 0; n < BATTLES; n++) {
    // хозяйственный шаг
    if (R() < CHORES) {
      const name = choreNames[Math.floor(R() * choreNames.length)];
      out.chores[name] = (out.chores[name] || 0) + 1;
      try { await chores[name](); } catch (e) { out.errs.push('chore ' + name + ': ' + e.message.split('\n')[0]); }
      await checkProfile('after ' + name);
      await p.waitForTimeout(100);
    }
    if (R() < RELOAD) {
      out.reloads++;
      await p.reload(); await p.waitForTimeout(2200);
      await p.evaluate(installBot);
      await checkProfile('after reload');
    }
    // нужна карта
    const onMap = await p.evaluate(() => document.body.classList.contains('mode-map'));
    if (!onMap) { await p.evaluate(() => { try { Screens.close && Screens.close(); } catch (e) {} const b = document.querySelector('#overlay .to-map'); if (b) b.click(); }); await p.waitForTimeout(400); }
    const started = await p.evaluate(() => window.__A.attackNearest());
    if (!started) { await p.evaluate(() => { const st = MapView.state; for (const k in st.defeated) delete st.defeated[k]; MapView.map.spawns.forEach(() => {}); }); continue; }
    await p.waitForFunction(() => document.body.classList.contains('mode-battle'), null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(500);
    const r = await runBattle(p, { ai: 40 + Math.floor(R() * 50), fuzz: FUZZ, pace: 25, stuckMs: 25000, maxMs: 150000, mouse: MOUSE, spam: SPAM });
    out.battles++;
    if (r.stuck) { out.stuck.push({ battle: n, seed: SEED, why: r.stuck }); }
    else if (r.timeout) out.timeouts++;
    else if (r.ended === 'left-battle') { /* ушёл с экрана боя сам */ }
    else { if (/Победа/.test(r.text)) out.wins++; else out.losses++; }
    for (const m of (r.inv || [])) if (!out.invBattle.some((x) => x.m === m)) out.invBattle.push({ m, battle: n });
    if ((r.inv || []).some((m) => /готовая линия/.test(m))) { const dmp = await p.evaluate(() => window.__lineDump || []).catch(() => []); out.lineDumps = (out.lineDumps || []).concat(dmp.map((x) => ({ battle: n, ...x }))); await p.evaluate(() => { window.__lineDump = []; }).catch(() => {}); }   // 1.6.5: снимки для разбора A2-21
    out.mouseMoves = (out.mouseMoves || 0) + (r.mouseMoves || 0); out.spamTaps = (out.spamTaps || 0) + (r.spamTaps || 0); out.humanMoves = (out.humanMoves || 0) + (r.human || 0);
    if (r.stuck) { await p.screenshot({ path: `/tmp/A2/stuck-s${SEED}-b${n}.png` }).catch(() => {}); await p.reload(); await p.waitForTimeout(2200); await p.evaluate(installBot); continue; }
    await p.evaluate(() => window.__A.toMap());
    await p.waitForTimeout(150);
    await checkProfile('after battle');
    const e = await p.evaluate(() => window.__A.errs.splice(0)); for (const x of e) out.errs.push(x);
    for (const x of out.errs.slice(printedErrs)) console.log(`  ! бой ${n + 1}: ${String(x).slice(0, 300)}`);
    printedErrs = out.errs.length;
    if ((n + 1) % 25 === 0) { await snap('b' + (n + 1)); console.log(`... ${n + 1}/${BATTLES}: побед ${out.wins}, поражений ${out.losses}, завис ${out.stuck.length}, инв.боя ${out.invBattle.length}, инв.профиля ${out.invProfile.length}, ошибок ${out.errs.length}`); }
  }
  await snap('end');
  const first = out.series[1] || out.series[0], last = out.series[out.series.length - 1];
  out.growth = { heapMB: +(last.heapMB - first.heapMB).toFixed(2), nodes: last.nodes - first.nodes, listeners: last.listeners - first.listeners, intervals: (last.intervals || 0) - (first.intervals || 0), timeouts: (last.timeouts || 0) - (first.timeouts || 0) };
  const hp = await p.evaluate(() => ({ lvl: Profile.level(), wins: Profile.data.wins, coins: Profile.data.coins, items: Profile.data.items.length, store: (localStorage.getItem('gem-match-profile-v2') || '').length }));
  out.finalProfile = hp;
  console.log(JSON.stringify({ ...out, series: out.series }, null, 1));
  const jf = arg('json', ''); if (jf) fs.writeFileSync(jf, JSON.stringify(out, null, 1));
  await b.close();
  process.exit(out.stuck.length || out.invBattle.length || out.invProfile.length || out.errs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
