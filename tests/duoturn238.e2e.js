// 2.3.8: бой вдвоём — поле уже победившего не должно просто замирать без объяснений, пока второе поле ещё идёт,
// и живой противник второго поля должен иметь шанс перескочить к ждущему не только по исходу боя (Duo.ended),
// но и при каждой смене хода на ещё не оконченном поле (Duo.turnChanged, см. game.js setTurn).
// Запуск: node tests/duoturn238.e2e.js
const path = require('path');
const { launch } = require('../tools/browser.js');
const URL = process.env.WIP_URL || 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0;
const ok = (name, cond, extra) => { if (cond) console.log('  ok   ' + name); else { fails++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };

async function open(b) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push((e.stack || e.message).split('\n').slice(0, 4).join(' | ')));
  await p.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) {} });
  await p.goto(URL); await p.waitForTimeout(1800);
  await p.evaluate(() => { if (!Profile.data.faction && typeof Tutorial !== 'undefined') { Tutorial.start(); Tutorial.finish(false); } }); await p.waitForTimeout(300);
  await p.click('text=Горные кланы').catch(() => {}); await p.click('text=Мужской').catch(() => {});
  await p.fill('input', 'Тест').catch(() => {}); await p.click('text=Начать игру!').catch(() => {}); await p.waitForTimeout(1000);
  // 2.2.7: питомцы открываются с 5-го уровня — для боя вдвоём нужен герой 6-го уровня с питомцем
  await p.evaluate(() => { Profile.data.wins = Math.max(Profile.data.wins || 0, 20); Profile.data.xp = Math.max(Profile.data.xp || 0, Hero.totalFor(6)); if (!Profile.data.pet) { Profile.data.pet = Object.assign(Pets.makePet('wolf', 1), { xp: 300 }); Profile.data.petChoice = 'tamed'; } Profile.save(); }); await p.waitForTimeout(300);
  await p.evaluate(() => { for (const key in RULES.timing) RULES.timing[key] = 40; const m = MapView.map, me = MapView.state.pos; const a = m.spawns.filter((s) => MapView.alive(s)).sort((x, y) => HexMap.dist(m.cells[x.idx], m.cells[me]) - HexMap.dist(m.cells[y.idx], m.cells[me])); MapView.attack(a[0]); });
  await p.waitForFunction(() => document.body.classList.contains('mode-battle') && typeof Duo !== 'undefined' && Duo.on() && Duo.pet, null, { timeout: 20000 });
  await p.waitForTimeout(500);
  return { p, errs };
}

(async () => {
  const b = await launch();

  // 1. герой побеждает и ждёт; на поле пета оверлей ожидания должен появиться и исчезнуть, когда решится судьба
  {
    const { p, errs } = await open(b);
    const r1 = await p.evaluate(() => {
      BattleRand.next = () => 0.9;   // >= 0.5 -> герой остаётся ждать, монстр не переходит
      Duo.ended('hero', 'win');
      return { waiting: Duo.state.waiting, overlay: !!document.querySelector('.wait-overlay') };
    });
    ok('герой победил и ждёт, оверлей показан на его (текущем) поле', r1.waiting === 'hero', JSON.stringify(r1));
    // оверлей на поле hero виден, только когда это поле видимое (вкладка/контроль уже переключены на pet) — переключим обратно
    await p.evaluate(() => Duo.setTab('hero'));
    await p.waitForTimeout(200);
    const over1 = await p.evaluate(() => { const o = document.querySelector('.wait-overlay'); const r = o && o.getBoundingClientRect(); return !!o && r.width > 0 && r.height > 0; });
    ok('оверлей ожидания виден на поле героя', over1);

    // 2. смена хода на поле пета (противник пета ещё жив) с низким броском -> перенос СРАЗУ, не дожидаясь исхода пета
    const r2 = await p.evaluate(async () => {
      BattleRand.next = () => 0.1;   // < 0.5 -> transferFoe
      Duo.turnChanged('pet');
      await new Promise((res) => setTimeout(res, 1200));   // whenIdle + adopt
      return { waiting: Duo.state.waiting, control: Duo.state.control, tab: Duo.state.tab };
    });
    ok('после смены хода на поле пета противник перешёл к герою (ждёт теперь пет)', r2.waiting === 'pet' && r2.control === 'hero', JSON.stringify(r2));
    const over2 = await p.evaluate(() => !document.querySelector('.wait-overlay'));
    ok('оверлей ожидания убран с поля героя (противник уже там)', over2);
    ok('страница без ошибок', errs.length === 0, errs.join(' // '));
    await p.close();
  }

  // 2. противоположный бросок: смена хода НЕ приводит к переносу, пет продолжает бой как обычно
  {
    const { p, errs } = await open(b);
    await p.evaluate(() => { BattleRand.next = () => 0.9; Duo.ended('hero', 'win'); });
    const r = await p.evaluate(async () => {
      BattleRand.next = () => 0.9;   // >= 0.5 -> не переходит
      Duo.turnChanged('pet');
      await new Promise((res) => setTimeout(res, 300));
      return { waiting: Duo.state.waiting, petResult: Duo.state.result.pet };
    });
    ok('бросок не сыграл — пет не прерван, герой всё ещё ждёт', r.waiting === 'hero' && !r.petResult, JSON.stringify(r));
    ok('страница без ошибок', errs.length === 0, errs.join(' // '));
    await p.close();
  }

  // 3. turnChanged не должен ничего делать, если никто ещё не победил (оба поля ещё идут)
  {
    const { p, errs } = await open(b);
    const r = await p.evaluate(() => {
      BattleRand.next = () => 0.0;   // даже при гарантированном "переходе" — без ждущего переносить некого
      Duo.turnChanged('pet');
      Duo.turnChanged('hero');
      return { waiting: Duo.state.waiting, result: Duo.state.result };
    });
    ok('без победителя turnChanged не переносит противников', !r.waiting && !r.result.hero && !r.result.pet, JSON.stringify(r));
    ok('страница без ошибок', errs.length === 0, errs.join(' // '));
    await p.close();
  }

  // 4. кнопка «Помощь» доступна в карточке партнёра (золотая десктопная тема, где верхняя .duo-bar скрыта)
  {
    const { p, errs } = await open(b);
    await p.evaluate(() => { document.body.classList.add('bt-gold'); });
    await p.waitForTimeout(300);
    const s = await p.evaluate(() => ({ help: !!document.querySelector('.pq-help'), menuHiddenBefore: document.querySelector('.pq-helpmenu') ? document.querySelector('.pq-helpmenu').hidden : null }));
    ok('кнопка «Помощь» есть в карточке партнёра', s.help, JSON.stringify(s));
    await p.click('.pq-help').catch(() => {});
    await p.waitForTimeout(200);
    const open_ = await p.evaluate(() => { const hm = document.querySelector('.pq-helpmenu'); return hm ? !hm.hidden && hm.querySelectorAll('[data-help]').length : -1; });
    ok('клик по «Помощь» раскрывает меню из 4 пунктов', open_ === 4, String(open_));
    ok('страница без ошибок', errs.length === 0, errs.join(' // '));
    await p.close();
  }

  await b.close();
  console.log(fails ? '\nduoturn238 e2e: ПРОВАЛ (' + fails + ')' : '\nduoturn238 e2e: все тесты пройдены');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
