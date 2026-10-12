// 1.6.0: перековка вещи следующего цвета в кузнице (интерфейс + сохранение). Запуск: node tests/refit.e2e.js (не параллельно с другими e2e)
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
    Profile.data.testX10 = false;
    Profile.data.xp = Hero.totalFor(Hero.itemLevel(2));            // герой на 2-м цвете
    const base = Gear.ITEMS.find((i) => !i.faction && i.type === 'weapon2') || Gear.ITEMS.find((i) => !i.faction);
    const e = Gear.makeEntry(base.id, 3); Profile.addItem(e);
    const price = Gear.item(e).price, fc = Math.round(price * Gear.FIT_K);
    Profile.data.coins = fc * 3; Profile.save();
    o.lockedBefore = !Hero.canWear(Gear.item(e).wt, Profile.level());
    Screens.openForge(); await w(300);
    document.querySelector('[data-tab="refit"]').click(); await w(300);
    o.hasTip = !!document.querySelector('.tip-box');
    o.listed = !!document.querySelector('[data-pick="' + e.uid + '"]');
    document.querySelector('[data-pick="' + e.uid + '"]').click(); await w(200);
    const btn = document.querySelector('[data-do-refit]'); o.btn = !!btn && !btn.disabled;
    const c0 = Profile.data.coins; btn.click(); await w(300);
    o.paid = c0 - Profile.data.coins; o.expected = Math.round(fc * Factions.perk(Profile.data.faction, 'forge'));
    const it = Gear.item(Profile.item(e.uid));
    o.fit = it.fit; o.wearNow = Hero.canWear(it.wt, Profile.level());
    o.noSecond = !document.querySelector('[data-do-refit]');
    // сохранение
    Profile.sandbox(false); Profile.save(); const raw = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /gem|world|save|profile/i.test(k))) || '{}');
    o.saved = JSON.stringify(raw).includes('"fit":true');
    return o;
  });
  ok(r.lockedBefore, 'до перековки вещь следующего цвета надеть нельзя');
  ok(r.hasTip, 'подсказка на вкладке «Перековка»');
  ok(r.listed, 'вещь есть в списке перековки');
  ok(r.btn, 'кнопка «Перековать» доступна');
  ok(r.paid === r.expected, `цена перековки ${r.paid} вместо ${r.expected}`);
  ok(r.fit && r.wearNow, 'после перековки вещь носится на цвет раньше');
  ok(r.noSecond, 'повторно перековать нельзя');
  ok(r.saved, 'флаг перековки сохраняется');
  ok(errs.length === 0, 'ошибки страницы: ' + errs.join('; '));
  await b.close();
  console.log(bad ? `refit e2e: ПРОВАЛ (${bad})` : 'refit e2e: все тесты пройдены');
  process.exit(bad ? 1 : 0);
})();
