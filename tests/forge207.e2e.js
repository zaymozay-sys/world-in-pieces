// 2.0.7 (этап B+C): Кузница — выбор материала в позиции, расход = показанному, улучшение, размеры кнопок (браузер; в `npm test` не входит).
const path = require('path');
const { launch } = require('../tools/browser.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await launch();
  for (const [vp, touch, lang] of [[[1280, 800], false, 'ru'], [[390, 844], true, 'en'], [[320, 568], true, 'ru'], [[740, 360], true, 'en']]) {
    const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] }, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript((l) => { try { localStorage.setItem('wip-lang', l); } catch (e) {} }, lang);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL + '#dev-map-village'); await sleep(3800);
    const tag = `${vp[0]}px ${lang}`;
    await p.evaluate(() => { Profile.data.xp = Hero.totalFor(21); Profile.data.coins = 90000; for (let t = 1; t <= 3; t++) for (const k of Object.keys(Bestiary.RESOURCES)) Profile.addRes(k, t, 40); Profile.save(); Screens.openForge(); });
    await sleep(400); await p.evaluate(() => { const t = document.querySelector('.modal .tip-box button'); if (t) t.click(); });
    await p.click('[data-tab=craft]'); await sleep(200);
    // фильтр с позицией на выбор (ищем по всем фильтрам)
    let found = false;
    for (const f of await p.evaluate(() => [...document.querySelectorAll('[data-filter]')].map((x) => x.dataset.filter))) {
      await p.evaluate((f) => document.querySelector('[data-filter="' + f + '"]').click(), f); await sleep(120);
      if (await p.evaluate(() => !!document.querySelector('.craft-unit .vopt'))) { found = true; break; }
    }
    ok(found, tag + ': в списке изготовления есть позиция с выбором материала');
    if (found) {
      const info = await p.evaluate(() => {
        const unit = document.querySelector('.craft-unit .vopt').closest('.craft-unit'), btn = unit.querySelector('[data-craft]');
        return { id: btn.dataset.craft, vopts: unit.querySelectorAll('.vopt').length, hs: [...unit.querySelectorAll('.vopt')].map((v) => Math.round(v.getBoundingClientRect().height)), on: unit.querySelectorAll('.vopt.on').length, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
      });
      ok(info.vopts >= 2 && info.on >= 1, tag + ': переключатель показывает варианты ' + info.vopts);
      ok(info.hs.every((h) => h >= 44), tag + ': кнопки выбора ≥ 44 px (' + info.hs.join(',') + ')');
      ok(info.scrollW <= info.innerW + 1, tag + ': нет горизонтальной прокрутки страницы');
      const tier = await p.evaluate(() => window.__t = (document.querySelector('.tier-picker .on, [data-crafttier].on') || {}).dataset ? Number((document.querySelector('[data-crafttier].on') || {}).dataset.crafttier) : 1);
      // выбираем второй вариант первой позиции с выбором и сверяем: расход = плану
      await p.evaluate((id) => { const unit = document.querySelector('[data-craft="' + id + '"]').closest('.craft-unit'); const v = unit.querySelectorAll('.vgroup')[0].querySelectorAll('.vopt')[1]; v.click(); }, info.id); await sleep(200);
      const exp = await p.evaluate((id) => {
        const unit = document.querySelector('[data-craft="' + id + '"]').closest('.craft-unit');
        const chosen = unit.querySelectorAll('.vgroup')[0].querySelectorAll('.vopt.on').length;
        const ct = (document.querySelector('[data-crafttier].on') ? Number(document.querySelector('[data-crafttier].on').dataset.crafttier) : 1);
        const plan = Forge.plan({ mode: 'craft', itemId: id, tier: ct }, JSON.parse(JSON.stringify(window.__lastChoice || null)) || undefined);
        return { chosen, ct };
      }, info.id);
      ok(exp.chosen === 1, tag + ': выбран ровно один вариант');
      const before = await p.evaluate(() => ({ coins: Profile.data.coins, res: JSON.stringify(Profile.resList()), n: Profile.data.items.length }));
      const ct = exp.ct;
      const shown = await p.evaluate((id) => { const u = document.querySelector('[data-craft="' + id + '"]').closest('.craft-unit'); return u.querySelector('.costs').textContent; }, info.id);
      await p.click('[data-craft="' + info.id + '"]'); await sleep(250);
      const after = await p.evaluate(() => ({ coins: Profile.data.coins, res: JSON.stringify(Profile.resList()), n: Profile.data.items.length }));
      ok(after.n === before.n + 1, tag + ': вещь создана');
      // расход пересчитываем независимо: Forge.plan с выбранными индексами из интерфейса
      const spent = await p.evaluate(([b, a, id, t]) => {
        const bf = JSON.parse(b.res), af = JSON.parse(a.res), key = {}; for (const r of bf) key[r.kind + ':' + r.tier] = r.n; for (const r of af) key[r.kind + ':' + r.tier] = (key[r.kind + ':' + r.tier] || 0) - r.n;
        return { diff: Object.entries(key).filter(([, v]) => v !== 0 && v === v), coins: b.coins - a.coins };
      }, [before, after, info.id, ct]);
      const planned = await p.evaluate(([id, t]) => { const ps = []; for (const o of [0, 1]) for (const q of [0, 1]) { const pl = Forge.plan({ mode: 'craft', itemId: id, tier: t }, [o, q, 0, 0].slice(0, (D => D.craft[id][t].slots.length)(ForgeData))); if (pl.ok) ps.push(pl); } return ps.map((x) => ({ coins: Math.round(x.coins * Factions.perk(Profile.data.faction, 'forge')), res: x.res.map((r) => r.kind + ':' + r.tier + ':' + r.n).sort().join(',') })); }, [info.id, ct]);
      const got = spent.diff.map(([k, v]) => k + ':' + v).sort().join(',');
      ok(planned.some((x) => x.res === got && x.coins === spent.coins), tag + ': списание совпадает с планом (' + got + ' / ' + spent.coins + ' м)');
    }
    // улучшение: вещь с двумя вариантами материала
    await p.evaluate(() => { const e = Gear.makeEntry('guard-chest', 2); Profile.addItem(e); window.__u = e.uid; Profile.save(); Screens.openForge(); });
    await sleep(300); await p.evaluate(() => { const t = document.querySelector('.modal .tip-box button'); if (t) t.click(); });
    await p.click('[data-tab=upgrade]'); await sleep(150);
    await p.evaluate(() => { document.querySelector('[data-pick="' + window.__u + '"]').click(); }); await sleep(200);
    const up = await p.evaluate(() => { const b = document.querySelector('[data-do-upgrade]'); return { btn: !!b, off: b && b.disabled, costs: (document.querySelector('.costs') || {}).textContent }; });
    ok(up.btn && !up.off, tag + ': улучшение доступно, стоимость показана: ' + (up.costs || '').slice(0, 60));
    const before = await p.evaluate(() => ({ t: Profile.item(window.__u).tier, plan: Forge.plan({ mode: 'upgrade', entry: Profile.item(window.__u) }, Forge.autopick({ mode: 'upgrade', entry: Profile.item(window.__u) }, (k, t) => Profile.res(k, t))), coins: Profile.data.coins, res: Object.fromEntries(Profile.resList().map((r) => [r.kind + ':' + r.tier, r.n])) }));
    await p.click('[data-do-upgrade]'); await sleep(250);
    const aft = await p.evaluate(() => ({ t: Profile.item(window.__u).tier, coins: Profile.data.coins, res: Object.fromEntries(Profile.resList().map((r) => [r.kind + ':' + r.tier, r.n])) }));
    ok(aft.t === before.t + 1, tag + ': цвет повышен');
    const dRes = {}; for (const k of new Set([...Object.keys(before.res), ...Object.keys(aft.res)])) { const d = (before.res[k] || 0) - (aft.res[k] || 0); if (d) dRes[k] = d; }
    const expRes = {}; for (const r of before.plan.res) expRes[r.kind + ':' + r.tier] = r.n;
    const perk = await p.evaluate(() => Factions.perk(Profile.data.faction, 'forge')), srt = (o) => JSON.stringify(Object.entries(o).sort());
    ok(srt(dRes) === srt(expRes) && before.coins - aft.coins === Math.round(before.plan.coins * perk), tag + ': расход улучшения = плану ' + JSON.stringify(dRes) + ' vs ' + JSON.stringify(expRes) + ' монеты ' + (before.coins - aft.coins) + ' / ' + Math.round(before.plan.coins * perk));
    if (vp[0] === 390) await p.screenshot({ path: '/tmp/forge207-390.png' });
    ok(errs.length === 0, tag + ': без ошибок страницы ' + errs.join('; '));
    await ctx.close();
  }
  await b.close(); console.log(bad ? `\nПровалено: ${bad}` : '\nforge207.e2e: всё в порядке'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
