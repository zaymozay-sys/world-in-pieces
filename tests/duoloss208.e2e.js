// 2.0.8: в бою вдвоём победа засчитывается, только если выжил герой. Герой пал — поражение, даже если питомец победил свою копию врага.
// Запуск: node tests/duoloss208.e2e.js
const path = require('path');
const { launch } = require('../tools/browser.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0;
const ok = (name, cond, extra) => { if (cond) console.log('  ok   ' + name); else { fails++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };


async function scenario(b) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = [];
  p.on('pageerror', (e) => errs.push((e.stack || e.message).split('\n').slice(0, 4).join(' | ')));
  await p.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) {} });
  await p.goto(URL); await p.waitForTimeout(1800);
  await p.evaluate(() => { if (!Profile.data.faction && typeof Tutorial !== 'undefined') { Tutorial.start(); Tutorial.finish(false); } }); await p.waitForTimeout(300);
  await p.click('text=Горные кланы').catch(() => {}); await p.click('text=Мужской').catch(() => {});
  await p.fill('input', 'Тест').catch(() => {}); await p.click('text=Начать игру!').catch(() => {}); await p.waitForTimeout(1000);
  await p.evaluate(() => { for (const key in RULES.timing) RULES.timing[key] = 40; const m = MapView.map, me = MapView.state.pos; const a = m.spawns.filter((s) => MapView.alive(s)).sort((x, y) => HexMap.dist(m.cells[x.idx], m.cells[me]) - HexMap.dist(m.cells[y.idx], m.cells[me])); MapView.attack(a[0]); });
  await p.waitForFunction(() => document.body.classList.contains('mode-battle') && typeof Duo !== 'undefined' && Duo.on(), null, { timeout: 20000 });
  await p.evaluate(() => { MAIN_BATTLE.setAutopilot(false); Duo.pet && Duo.pet.setAutopilot(false); });
  await p.waitForFunction(() => MAIN_BATTLE.turnSide === 'left' && !MAIN_BATTLE.busy && !MAIN_BATTLE.over, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(800);

  const r = await p.evaluate(async () => {
    const c0 = Profile.data.coins, x0 = Profile.data.xp; Duo.state.kills.push(structuredClone(Duo.pet.fighters.right));   // питомец уже убил своего врага
    MAIN_BATTLE.fighters.left.hp = 0; MAIN_BATTLE.checkEnd();
    await new Promise((res) => setTimeout(res, 500));
    const o = { same: Profile.data.coins === c0 && Profile.data.xp === x0, st: Duo.state ? Duo.state.done : null, txt: (document.querySelector('.overlay') || {}).textContent || '' };
    return o;
  });
  ok('герой пал — бой окончен сразу', r.st === true, JSON.stringify(r).slice(0, 200));
  ok('поражение героя не даёт ни монет, ни опыта, даже за убитого питомцем врага', r.same === true, JSON.stringify(r).slice(0, 120));
  ok('показано поражение, не победа', /Поражение/.test(r.txt) && !/Победа!/.test(r.txt), r.txt.slice(0, 80));
  ok('страница без ошибок', errs.length === 0, errs.join('; '));
  await p.close();
}
(async () => { const b = await launch(); await scenario(b); await b.close(); console.log(fails ? 'duoloss208: ПРОВАЛЫ ' + fails : 'duoloss208 e2e: все тесты пройдены'); process.exit(fails ? 1 : 0); })();
