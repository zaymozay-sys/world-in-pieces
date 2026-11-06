// 2.2.9: интерфейс варки (Кузница → «Варка») и выбор заряда в бою. Запуск: node tests/brewui.e2e.js
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
    await p.goto(URL + hash); await p.waitForTimeout(4500); return { p, ctx };
  };
  {
    const { p, ctx } = await mk('#dev-bld-forge');
    const r = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = {};
      Profile.data.xp = Hero.totalFor(21); Profile.data.coins = 1e6; Profile.data.resources = {}; Profile.data.ammo = {}; Profile.data.brewMade = 0;
      const tier = Hero.tierFor(Profile.level()), ak = Profile.shotKind(); o.ak = ak;
      Profile.addRes('fang', tier, 200);
      const open = async () => { Screens.open('forge'); await w(300); const t = document.querySelector('[data-tab="ammo"]'); t.click(); await w(200); };
      await open();
      o.tab = [...document.querySelectorAll('[data-tab]')].some((x) => /Варка/.test(x.textContent));
      o.lockedNote = /с уровня мастерства 2/.test(document.body.innerText);
      o.variantBtn1 = !!document.querySelector('[data-craft-ammo="fang:' + tier + ':hard"]');
      document.querySelector('[data-craft-ammo="fang:' + tier + ':"]').click(); await w(150);
      o.base = Profile.ammo(ak); o.made1 = Profile.data.brewMade;
      // свойство нельзя сварить обходом интерфейса на 1-м уровне
      Screens.open('forge'); await w(100);
      Profile.data.brewMade = 10; await open();
      o.variantBtn2 = !!document.querySelector('[data-craft-ammo="fang:' + tier + ':hard"]');
      const before = Profile.data.resources['fang:' + tier] || (Profile.resList().find((x) => x.kind === 'fang') || {}).n;
      document.querySelector('[data-craft-ammo="fang:' + tier + ':hard"]').click(); await w(150);
      o.hard = Profile.ammo(ak + ':hard'); o.made2 = Profile.data.brewMade; o.lvl = Profile.brewLevel();
      o.shown = /Закалённый/.test(document.body.innerText);
      // ресурс чужой группы не даёт свойство
      Profile.addRes('silk', tier, 200); Profile.data.brewMade = 30; await open();
      o.silkHard = !!document.querySelector('[data-craft-ammo="silk:' + tier + ':hard"]'); o.silkHunt = !!document.querySelector('[data-craft-ammo="silk:' + tier + ':hunt"]');
      return o;
    });
    console.log(JSON.stringify(r));
    ok('вкладка называется «Варка»', r.tab);
    ok('на 1-м уровне свойство закрыто и подписано', r.lockedNote && !r.variantBtn1);
    ok('обычный заряд сварен, мастерство растёт', r.base === 3 && r.made1 === 3, r.base + ' ' + r.made1);
    ok('на 2-м уровне открывается «Закалённый»', r.variantBtn2 && r.lvl >= 2);
    ok('усиленный заряд сварен в свой запас', r.hard === 3 && r.made2 === 13, r.hard + ' ' + r.made2);
    ok('запас показан с названием свойства', r.shown);
    ok('свойство берётся только из ресурса своей группы', !r.silkHard && r.silkHunt, r.silkHard + ' ' + r.silkHunt);
    ok('вкладка без ошибок', p.__errs.length === 0, p.__errs.join('; '));
    await ctx.close();
  }
  {
    const { p, ctx } = await mk('#dev-fight-rat-1-solo');
    const r = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = {};
      const B = MAIN_BATTLE; for (let i = 0; i < 80 && (B.busy || B.over || B.turnSide !== 'left'); i++) await w(100);
      const ak = Profile.shotKind(); B.fighters.right.hp = B.fighters.right.max = 99999;
      Profile.data.ammo = { [ak]: 2 }; Profile.data.shotSel = ''; B.renderBag && B.renderBag();
      o.cycle0 = !!document.querySelector('[data-ammocycle]');
      Profile.data.ammo[ak + ':hard'] = 2; Profile.data.ammo[ak + ':heal'] = 1; B.renderBag();
      o.cycle1 = !!document.querySelector('[data-ammocycle]');
      o.sel0 = document.querySelector('button.bagitem.ammo').dataset.ammo;
      document.querySelector('[data-ammocycle]').click(); await w(100);
      o.sel1 = document.querySelector('button.bagitem.ammo').dataset.ammo;
      document.querySelector('[data-ammocycle]').click(); await w(100);
      o.sel2 = document.querySelector('button.bagitem.ammo').dataset.ammo;
      document.querySelector('[data-ammocycle]').click(); await w(100);
      o.sel3 = document.querySelector('button.bagitem.ammo').dataset.ammo;
      // выстрел выбранным запасом
      document.querySelector('[data-ammocycle]').click(); await w(100);          // → вид:hard
      const key = document.querySelector('button.bagitem.ammo').dataset.ammo; const n0 = Profile.ammo(key), base0 = Profile.ammo(ak);
      const bt = document.querySelector('button.bagitem.ammo'); bt.click(); await w(200);
      if (Ammo.CATALOG[ak].aim) { B.useAmmo(key, { r: 3, c: 3 }); await w(1500); } else await w(300);       // шашке нужна клетка прицела
      o.key = key; o.spent = n0 - Profile.ammo(key); o.baseSame = Profile.ammo(ak) === base0;
      // запас кончился → выбор возвращается к обычному
      Profile.data.ammo[ak + ':hard'] = 0; B.renderBag(); o.after = document.querySelector('button.bagitem.ammo').dataset.ammo;
      return o;
    });
    console.log(JSON.stringify(r));
    ok('кнопка смены заряда видна только при нескольких запасах', !r.cycle0 && r.cycle1);
    ok('смена заряда обходит запасы по кругу', r.sel0 && r.sel1 !== r.sel0 && r.sel2 !== r.sel1 && r.sel3 === r.sel0, JSON.stringify([r.sel0, r.sel1, r.sel2, r.sel3]));
    ok('выстрел тратит выбранный запас, не обычный', /:hard$/.test(r.key) && r.spent === 1 && r.baseSame, JSON.stringify([r.key, r.spent, r.baseSame]));
    ok('пустой выбранный запас → выбор возвращается к обычному', !/:/.test(r.after), r.after);
    ok('бой без ошибок', p.__errs.length === 0, p.__errs.join('; '));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? 'brewui: ПРОВАЛЫ ' + fails : 'brewui e2e: все тесты пройдены'); process.exit(fails ? 1 : 0);
})();
