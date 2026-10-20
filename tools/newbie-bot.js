/* Прогон «бота-новичка»: игра с чистого профиля на экране телефона. Бот не знает правил: читает окно обучения,
   жмёт то, на что оно указывает, ходит случайными допустимыми ходами, выбирает народ и идёт в первые бои.
   Печатает отчёт: на каких шагах обучения сколько секунд потрачено, где бот застрял (состояние не менялось дольше порога),
   ошибки консоли и страницы; снимки экрана кладёт в папку отчёта.
   Запуск: node tools/newbie-bot.js [--width=360] [--height=640] [--seconds=240] [--out=/tmp/bot] */
const fs = require('fs'), path = require('path');
const { launch } = require('./browser.js');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const W = +arg('width', 360), H = +arg('height', 640), LIMIT = +arg('seconds', 240) * 1000, OUT = arg('out', '/tmp/newbie-bot');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, locale: 'ru-RU' });
  const p = await ctx.newPage();
  const errs = [], steps = [], stuck = []; let shot = 0;
  p.on('pageerror', (e) => errs.push('page: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/40[04]|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
  const snap = async (tag) => { try { await p.screenshot({ path: path.join(OUT, `${String(++shot).padStart(2, '0')}-${tag}.png`) }); } catch (e) { /* страница могла закрыться */ } };
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  const t0 = Date.now(); let lastSig = '', lastChange = Date.now(), lastCoach = '', coachSince = Date.now(), wins = 0, ticks = 0, stuckLogged = '';
  const state = () => p.evaluate(() => {
    const c = document.querySelector('.coach'), coach = c && !c.hidden ? c.innerText.replace(/\s+/g, ' ').slice(0, 90) : '';
    const inB = document.body.classList.contains('mode-battle');
    return {
      coach, screen: typeof Screens !== 'undefined' && Screens.isOpen ? Screens.screen : '', battle: inB,
      my: inB && typeof turnSide !== 'undefined' ? (turnSide === 'left' && !busy && !over) : false, over: inB && typeof over !== 'undefined' ? over : false,
      overlay: !!(document.querySelector('.overlay .to-map') && document.querySelector('.overlay').getClientRects().length), overlayDom: !!document.querySelector('.overlay .to-map'), wins: (Profile.data.wins || 0), step: (Profile.data.tutorial && Profile.data.tutorial.step), done: !!(Profile.data.tutorial && Profile.data.tutorial.done),
      hp: inB && typeof fighters !== 'undefined' ? [fighters.left.hp, fighters.right.hp] : null,
    };
  });
  const VERB = process.argv.includes('--verbose');
  const click = async (sel) => { const el = await p.$(sel); if (!el) return false; try { if (VERB) console.log('click', sel.slice(0, 60)); await el.click({ timeout: 1500 }); return true; } catch (e) { return false; } };
  const clickCell = async (r, c) => { const box = await p.evaluate(([r, c]) => { const t = grid[r][c]; const e = t && t.el; if (!e) return null; const q = e.getBoundingClientRect(); const x = q.x + q.width / 2, y = q.y + q.height / 2; const top = document.elementFromPoint(x, y); return { x, y, covered: !!(top && top.closest('.coach')) }; }, [r, c]); if (!box) return false; if (box.covered) { covered++; return false; } if (VERB) console.log('cell', r, c, Math.round(box.x), Math.round(box.y)); await p.mouse.click(box.x, box.y); return true; };
  const randomMove = async () => {
    const mv = await p.evaluate(() => { const ms = Engine.legalMoves(typOf()); if (!ms.length) return null; const free = ms.filter((m) => [m.a, m.b].every((i) => { const t = grid[Math.floor(i / N)][i % N]; const q = t && t.el && t.el.getBoundingClientRect(); const top = q && document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return top && !top.closest('.coach'); })); const pool = free.length ? free : ms; const m = pool[Math.floor(Math.random() * pool.length)]; return [[Math.floor(m.a / N), m.a % N], [Math.floor(m.b / N), m.b % N]]; });
    if (!mv) return false; await clickCell(...mv[0]); await p.waitForTimeout(120); await clickCell(...mv[1]); return true;
  };
  const anyCell = () => p.evaluate(() => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c]) return [r, c]; return null; });
  let rot = 0, covered = 0;
  while (Date.now() - t0 < LIMIT) {
    ticks++; await p.waitForTimeout(700);
    let s; try { s = await state(); } catch (e) { await p.waitForTimeout(500); continue; }
    const sig = JSON.stringify([s.coach, s.screen, s.battle, s.my, s.over, s.overlay, s.wins, s.hp]);
    if (sig !== lastSig) { lastSig = sig; lastChange = Date.now(); stuckLogged = ''; }
    if (s.coach !== lastCoach) { if (lastCoach) steps.push({ text: lastCoach, sec: Math.round((Date.now() - coachSince) / 1000) }); lastCoach = s.coach; coachSince = Date.now(); if (s.coach) await snap('coach'); }
    if (Date.now() - lastChange > 20000 && stuckLogged !== sig) { stuckLogged = sig; stuck.push({ at: Math.round((Date.now() - t0) / 1000), state: s }); await snap('stuck'); }
    if (s.wins > wins) { wins = s.wins; await snap('win' + wins); }
    if (s.screen === 'faction') {
      if (!(await click('[data-pick-faction]'))) { /* ждём */ }
      await click('[data-faction]:not([disabled])'); await p.evaluate(() => { const i = document.querySelector('.modal input'); if (i && !i.value) { i.value = 'Новичок'; i.dispatchEvent(new Event('input', { bubbles: true })); } }).catch(() => {});
      await click('.modal button.primary:not([disabled]), button.fac-start:not([disabled])'); await p.evaluate(() => { const bt = [...document.querySelectorAll('button')].find((x) => /Начать игру/.test(x.textContent) && !x.disabled); if (bt) bt.click(); }).catch(() => {}); continue;
    }
    if (s.screen && s.screen !== 'faction') { await click('.modal button[data-act="close"], .modal .close'); continue; }
    if (s.overlay) { if (await click('.overlay .to-map')) continue; }
    if (s.coach && !s.battle) { if (await click('.coach button[data-coach]:not([data-coach="skip"])')) continue; }
    if (s.battle) {
      if (!s.my) continue;
      if (s.coach && await click('.coach button[data-coach]:not([data-coach="skip"])')) continue;
      rot++;
      // новичок пробует то, на что указывает окно обучения, иначе ходит наугад
      if (s.coach && /заклинани|крест|захват|огненн/i.test(s.coach) && rot % 3 === 0) { if (await click('button.magic.fire:not([disabled]), button.magic.square:not([disabled])')) { const c = await anyCell(); if (c) await clickCell(...c); continue; } }
      if (s.coach && /молни/i.test(s.coach) && rot % 3 === 0) { await click('button.magic.lightning:not([disabled])'); continue; }
      if (s.coach && /удар|добей|финал/i.test(s.coach) && rot % 2 === 0) { if (await click('button.magic.strike:not([disabled])')) { const c = await anyCell(); if (c) await clickCell(...c); continue; } }
      await randomMove(); continue;
    }
    // карта: идём бить ближайшего слабого зверя
    if (s.done || s.step >= 10) {
      const ok = await p.evaluate(() => { try { const me = MapView.map.cells[MapView.state.pos]; const c = MapView.map.spawns.filter((x) => !x.boss && x.tier === 1 && MapView.alive(x) && MapView.known(x.idx)).sort((a, b) => HexMap.dist(me, MapView.map.cells[a.idx]) - HexMap.dist(me, MapView.map.cells[b.idx]))[0]; if (!c) return false; MapView.tap(c.idx); return true; } catch (e) { return false; } });
      await p.waitForTimeout(300); if (ok) { await click('#map-card [data-act="attack"]'); }
    }
  }
  steps.push({ text: lastCoach, sec: Math.round((Date.now() - coachSince) / 1000) });
  const fin = await state().catch(() => ({}));
  await snap('final');
  const report = { coveredByCoach: covered, viewport: `${W}x${H}`, seconds: Math.round((Date.now() - t0) / 1000), wins: fin.wins, tutorialDone: fin.done, tutorialStep: fin.step, steps, stuck, errors: errs.slice(0, 20) };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ ...report, steps: report.steps.map((x) => `${x.sec}s: ${x.text.slice(0, 60)}`) }, null, 1));
  await b.close();
})();
