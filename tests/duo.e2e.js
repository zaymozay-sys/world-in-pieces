// Сквозной тест боя вдвоём (два поля) в настоящем браузере. Запуск: NODE_PATH=$(npm root -g) node tests/duo.e2e.js
// Нужен Playwright + chromium (в обычный `npm test` не входит — как tools/smoke.js).
const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

async function open(b, vp) {
  const p = await b.newPage({ viewport: vp || { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) {} });
  await p.goto(URL); await p.waitForTimeout(1800);
  // 1.5.4: новичок сначала идёт в учебный бой; пропуск обучения открывает выбор народа
  await p.evaluate(() => { if (!Profile.data.faction && typeof Tutorial !== 'undefined') { Tutorial.start(); Tutorial.finish(false); } }); await p.waitForTimeout(300);
  await p.click('text=Горные кланы').catch(() => {}); await p.click('text=Мужской').catch(() => {});
  await p.fill('input', 'Тест').catch(() => {}); await p.click('text=Начать игру!').catch(() => {});
  await p.waitForTimeout(1000);
  return { p, errs };
}
const attack = (p) => p.evaluate(() => {
  for (const k in RULES.timing) RULES.timing[k] = 5;
  try { Balance.rewards.minMoves = 0; } catch (e) { /* без правки */ }   // слишком быстрый бой бота не должен лишать награды
  const m = MapView.map, me = MapView.state.pos;
  const a = m.spawns.filter((s) => MapView.alive(s)).sort((x, y) => HexMap.dist(m.cells[x.idx], m.cells[me]) - HexMap.dist(m.cells[y.idx], m.cells[me]));
  MapView.attack(a[0]);
});

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });

  // 1. старт: два поля, копия противника, питомец на автопилоте, вкладки
  {
    const { p, errs } = await open(b);
    await attack(p); await p.waitForFunction(() => Duo.on() && Duo.pet, null, { timeout: 15000 }); await p.waitForTimeout(1500);
    const s = await p.evaluate(() => ({
      on: Duo.on(), mains: document.querySelectorAll('main.game').length, bar: !!document.querySelector('.duo-bar'),
      isPet: Duo.pet.fighters.left.isPet, sameSpecies: Duo.pet.fighters.right.monsterId === fighters.right.monsterId,
      distinct: Duo.pet.fighters.right !== fighters.right, petAuto: Duo.pet.autopilot, heroAuto: autopilot,
      petCanCast: Duo.pet.canAffordMagic('left'), lvl: Duo.pet.autoLevel, hp: Duo.pet.fighters.left.max,
    }));
    assert.ok(s.on && s.mains === 2 && s.bar, 'два поля и вкладки');
    assert.ok(s.isPet && s.sameSpecies && s.distinct, 'питомец против копии противника');
    assert.ok(s.petAuto && !s.heroAuto, 'питомца ведёт ИИ, героя — игрок');
    assert.strictEqual(s.petCanCast, false, 'питомец не колдует');
    assert.ok(s.lvl >= 1 && s.lvl <= 100);
    // вкладки переключают видимое поле
    await p.click('.duo-tab[data-tab=pet]');
    assert.ok(await p.evaluate(() => document.querySelector('main.game:not(.duo-pet)').classList.contains('duo-hidden')));
    await p.click('.duo-tab[data-tab=hero]');
    assert.ok(await p.evaluate(() => document.querySelector('.duo-pet').classList.contains('duo-hidden')));
    // «Играть за питомца»: управление переходит, героя ведёт ИИ
    assert.strictEqual(await p.textContent('.duo-take'), 'Играть за питомца');
    await p.click('.duo-take');
    const c = await p.evaluate(() => [Duo.state.control, Duo.state.tab, autopilot, Duo.pet.autopilot]);
    assert.deepStrictEqual(c, ['pet', 'pet', true, false]);
    assert.strictEqual(await p.textContent('.duo-take'), 'Играть за героя');
    await p.click('.duo-take');
    assert.deepStrictEqual(await p.evaluate(() => [Duo.state.control, autopilot, Duo.pet.autopilot]), ['hero', false, true]);
    // отступление: возвращает на карту и убирает второе поле
    await p.click('#restart'); await p.click('#restart'); await p.waitForTimeout(800);
    const f = await p.evaluate(() => [Duo.on(), document.body.classList.contains('mode-map'), document.querySelectorAll('main.game').length, document.querySelectorAll('.duo-bar').length]);
    assert.deepStrictEqual(f, [false, true, 1, 0]);
    assert.deepStrictEqual(errs, []);
    await p.close();
  }

  // 2. полный бой: оба поля доигрываются, итог один, у питомца растёт опыт, награда за каждого убитого
  {
    const { p, errs } = await open(b);
    await attack(p);
    await p.waitForFunction(() => document.body.classList.contains('mode-battle') && Duo.on(), null, { timeout: 15000 });
    const r = await p.evaluate(async () => {
      const wait = (t) => new Promise((x) => setTimeout(x, t));
      const xp0 = (Profile.pet().xp || 0), wins0 = Profile.data.wins;
      let last = Date.now(), sig = '';
      let humanMoves = 0;
      while (!document.getElementById('overlay') && Duo.on()) {
        const P = Duo.pet;
        const cur = [moves, fighters.left.hp, P.fighters.left.hp, fighters.right.hp, P.fighters.right.hp, JSON.stringify(Duo.state.result)].join('|');
        if (cur !== sig) { sig = cur; last = Date.now(); }
        if (Date.now() - last > 30000) return { stuck: cur };
        const B = Duo.state.control === 'pet' ? P : MAIN_BATTLE;   // «игрок» за героя играет ИИ уровня 60
        if (!B.over && !B.busy && !B.aiming && B.turnSide === 'left' && !B.autopilot) {
          const L = B.fighters.left, R = B.fighters.right, v = Combat.aiView(L, R);
          const mv = AI.choose(B.typOf(), B.valOf(), v.hpMe, v.hpOpp, 60, {}, { maxMe: v.maxMe, locked: B.lockedCells('left') });
          if (mv) { humanMoves++; B.playerMove({ r: Math.floor(mv.a / 6), c: Math.floor(mv.a % 6) }, { r: Math.floor(mv.b / 6), c: Math.floor(mv.b % 6) }); }
        }
        await wait(80);
      }
      const ov = document.getElementById('overlay');
      return { text: ov ? ov.innerText : '', xp: Profile.pet().xp || 0, xp0, wins: Profile.data.wins, wins0, kills: Duo.state ? Duo.state.kills.length : -1, humanMoves };
    });
    assert.ok(!r.stuck, 'бой завис: ' + r.stuck); console.log(JSON.stringify(r));
    assert.ok(/Победа!|Поражение/.test(r.text), 'есть итоговый экран');
    assert.ok(r.xp > r.xp0, 'питомец получил опыт');
    assert.strictEqual(r.wins - r.wins0, r.kills, 'награда за каждого убитого противника');
    assert.ok(/опыт \+\d+, ум \d+ → \d+/.test(r.text), 'в итоге — рост питомца');
    if (r.kills === 2) assert.ok(/Победа!/.test(r.text), 'оба убиты — победа');
    assert.deepStrictEqual(errs, []);
    await p.close();
  }

  // 3. питомец остаётся дома — бой обычный, одно поле
  {
    const { p, errs } = await open(b);
    await p.evaluate(() => Profile.setPetStay(true));
    await attack(p); await p.waitForFunction(() => document.body.classList.contains('mode-battle'), null, { timeout: 20000 }); await p.waitForTimeout(1000);   // герой сначала идёт к существу
    const s = await p.evaluate(() => [Duo.on(), document.querySelectorAll('main.game').length, document.querySelectorAll('.duo-bar').length]);
    assert.deepStrictEqual(s, [false, 1, 1], 'без питомца — одно поле и одна полоса сверху (имя противника)');
    assert.deepStrictEqual(await p.evaluate(() => [document.querySelectorAll('.duo-bar.solo').length, document.querySelectorAll('.duo-bar .duo-tab').length, document.querySelectorAll('.duo-take').length, document.body.classList.contains('solo-battle')]), [1, 1, 0, true]);
    assert.deepStrictEqual(errs, []);
    await p.close();
  }

  await b.close();
  console.log('duo e2e: все тесты пройдены');
})().catch((e) => { console.error(e); process.exit(1); });
