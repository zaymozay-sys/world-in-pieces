// 2.2.0: взаимовыручка героя и питомца в бою вдвоём (здоровье и камни). Запуск: NODE_PATH=$(npm root -g) node tests/help220.e2e.js (в `npm test` не входит).
const assert = require('assert'); const path = require('path');
const { launch } = require(path.join(__dirname, '..', 'tools', 'browser.js'));
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
(async () => {
  const b = await launch(); const ctx = await b.newContext({ viewport: { width: 900, height: 800 } }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) {} });
  await p.goto(URL); await p.waitForTimeout(1800);
  await p.evaluate(() => { if (!Profile.data.faction && typeof Tutorial !== 'undefined') { Tutorial.start(); Tutorial.finish(false); } }); await p.waitForTimeout(300);
  await p.click('text=Горные кланы').catch(() => {}); await p.click('text=Мужской').catch(() => {}); await p.fill('input', 'Тест').catch(() => {}); await p.click('text=Начать игру!').catch(() => {});
  await p.waitForTimeout(1000);
  await p.evaluate(() => { Profile.data.wins = 20; Profile.data.xp = Hero.totalFor(6); Profile.data.pet = Object.assign(Pets.makePet('wolf', 1), { xp: 400, trust: 80 }); Profile.data.petChoice = 'tamed'; Profile.save();
    const m = MapView.map, me = MapView.state.pos; const a = m.spawns.filter((s) => MapView.alive(s)).sort((x, y) => HexMap.dist(m.cells[x.idx], m.cells[me]) - HexMap.dist(m.cells[y.idx], m.cells[me])); MapView.attack(a[0]); });
  await p.waitForFunction(() => document.body.classList.contains('duo-battle') && Duo.on(), null, { timeout: 20000 }); await p.waitForTimeout(600);
  assert.ok(await p.evaluate(() => !document.querySelector('.duo-help').hidden), 'кнопка «Помощь» видна');
  await p.click('.duo-help'); await p.waitForTimeout(200);
  assert.ok(await p.evaluate(() => !document.querySelector('.duo-helpmenu').hidden), 'меню открылось');
  // здоровье: питомец ранен → герой делится
  const r1 = await p.evaluate(async () => { const h = MAIN_BATTLE.fighters.left, q = Duo.pet.fighters.left; q.hp = Math.round(q.max * 0.5); const h0 = h.hp, q0 = q.hp; await new Promise((r) => setTimeout(r, 500)); document.querySelector('[data-help="hp-h2p"]').click(); await new Promise((r) => setTimeout(r, 100)); return { dh: h.hp - h0, dq: q.hp - q0, hmax: h.max, qmax: q.max }; });
  assert.ok(r1.dh < 0 && Math.abs(r1.dh + Math.round(r1.hmax * 0.1)) <= 1, 'герой потерял 10%: ' + JSON.stringify(r1));
  assert.ok(r1.dq > 0 && r1.dq <= Math.abs(r1.dh), 'питомец получил столько же единиц, сколько потерял герой');
  // камни: герой → питомец
  const r2 = await p.evaluate(async () => { const h = MAIN_BATTLE.fighters.left, q = Duo.pet.fighters.left; h.counts.ruby = 5; const q0 = q.counts.ruby || 0; await new Promise((r) => setTimeout(r, 500)); document.querySelector('[data-help="st-h2p"]').click(); await new Promise((r) => setTimeout(r, 100)); return { hr: h.counts.ruby, qr: q.counts.ruby - q0 }; });
  assert.strictEqual(r2.hr, 3, 'у героя осталось 3 рубина'); assert.strictEqual(r2.qr, 2, 'питомец получил 2');
  // доверие вырастает; повтор ограничен двумя разами
  const r3 = await p.evaluate(async () => { const t0 = Profile.data.pet.trust; Duo.pet.fighters.left.hp = 1; MAIN_BATTLE.fighters.left.hp = MAIN_BATTLE.fighters.left.max; await new Promise((r) => setTimeout(r, 500)); for (let i = 0; i < 3; i++) { const bt = document.querySelector('[data-help="hp-h2p"]'); if (bt && !bt.disabled) bt.click(); await new Promise((r) => setTimeout(r, 80)); Duo.pet.fighters.left.hp = 1; await new Promise((r) => setTimeout(r, 450)); } return { dt: Profile.data.pet.trust - t0, left: document.querySelector('[data-help="hp-h2p"]').disabled }; });
  assert.ok(r3.dt >= 1, 'доверие растёт'); assert.ok(r3.left, 'после 2 раз кнопка недоступна');
  // питомец делится здоровьем только при доверии «Друг» (50)
  const r4 = await p.evaluate(async () => { Profile.data.pet.trust = 40; MAIN_BATTLE.fighters.left.hp = 10; await new Promise((r) => setTimeout(r, 450)); return document.querySelector('[data-help="hp-p2h"]').disabled; });
  assert.ok(r4, 'при доверии 40 питомец не делится здоровьем');
  assert.deepStrictEqual(errs, [], 'нет ошибок в консоли: ' + errs.join('; '));
  await b.close(); console.log('help220.e2e: ок');
})().catch((e) => { console.error(e); process.exit(1); });
