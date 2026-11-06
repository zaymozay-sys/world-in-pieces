// 2.2.9: свойства зарядов в настоящем бою. Запуск: node tests/brewfight.e2e.js
const path = require('path');
const { launch } = require('../tools/browser.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0;
const ok = (name, cond, extra) => { if (cond) console.log('  ok   ' + name); else { fails++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL + '#dev-fight-rat-1-solo'); await p.waitForTimeout(5000);
  const r = await p.evaluate(async () => {
    const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = {};
    const B = MAIN_BATTLE;
    for (let i = 0; i < 80 && (B.busy || B.over || B.turnSide !== 'left'); i++) await w(100);
    const L = B.fighters.left, R = B.fighters.right;
    const setup = () => { R.hp = R.max = 99999; R.shield = 0; R.buffs = []; L.ammoShot = false; L.lightUsed = false; };
    const shoot = async (key) => {
      setup(); Profile.data.ammo = Object.assign(Profile.data.ammo || {}, { [key]: 5 });
      const h0 = R.hp, n0 = Profile.ammo(key); B.useAmmo(key); await w(300);
      return { dmg: h0 - R.hp, left: n0 - Profile.ammo(key) };
    };
    const plain = await shoot('bolt'), hard = await shoot('bolt:hard');
    o.plain = plain; o.hard = hard;
    // лечение
    setup(); L.hp = Math.max(1, Math.floor(L.max / 2)); const hp0 = L.hp; Profile.data.ammo['bolt:heal'] = 3; B.useAmmo('bolt:heal'); await w(300); o.heal = L.hp - hp0;
    // камни
    setup(); const c0 = L.counts.ruby; Profile.data.ammo['bolt:charm'] = 3; B.useAmmo('bolt:charm'); await w(300); o.charm = L.counts.ruby - c0;
    // «Лёгкий»: после обычного выстрела ещё один можно, второй лёгкий — нет
    setup(); Profile.data.ammo['bolt'] = 5; Profile.data.ammo['bolt:light'] = 5;
    B.useAmmo('bolt'); await w(300); const afterPlain = Profile.ammo('bolt');
    B.useAmmo('bolt'); await w(200); const second = Profile.ammo('bolt');                 // второй обычный в тот же ход — запрещён
    B.useAmmo('bolt:light'); await w(300); const l1 = Profile.ammo('bolt:light');
    B.useAmmo('bolt:light'); await w(300); const l2 = Profile.ammo('bolt:light');
    o.light = { secondPlainBlocked: second === afterPlain, firstLightUsed: l1 === 4, secondLightBlocked: l2 === 4 };
    // неизвестный ключ не ломает бой и ничего не списывает
    setup(); Profile.data.ammo['bolt:zzz'] = 2; B.useAmmo('bolt:zzz'); await w(100); o.bad = Profile.ammo('bolt:zzz');
    return o;
  });
  console.log(JSON.stringify(r));
  ok('обычный болт наносит урон и тратит 1 штуку', r.plain.dmg > 0 && r.plain.left === 1, JSON.stringify(r.plain));
  ok('«Закалённый» бьёт сильнее обычного (~×1,25)', r.hard.dmg >= r.plain.dmg * 1.15 && r.hard.dmg <= r.plain.dmg * 1.35 && r.hard.left === 1, JSON.stringify(r.hard));
  ok('«Целебный» лечит героя', r.heal > 0, String(r.heal));
  ok('«Зачарованный» даёт камни', r.charm >= 1, String(r.charm));
  ok('«Лёгкий»: дополнительный выстрел один раз за бой, обычный второй в ход запрещён', r.light.secondPlainBlocked && r.light.firstLightUsed && r.light.secondLightBlocked, JSON.stringify(r.light));
  ok('неизвестное свойство не списывает запас', r.bad === 2, String(r.bad));
  ok('страница без ошибок', errs.length === 0, errs.join('; '));
  await b.close();
  console.log(fails ? 'brewfight: ПРОВАЛЫ ' + fails : 'brewfight e2e: все тесты пройдены'); process.exit(fails ? 1 : 0);
})();
