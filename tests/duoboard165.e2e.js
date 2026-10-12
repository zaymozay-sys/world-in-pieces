// 1.6.5 (A2-21): в бою вдвоём поле, на котором бой закончился посреди хода (рикошет, Огненный крест, каскад), раньше «оживало» как есть после того,
// как выживший добивал чужого противника (resumeAfterAdopt): камни висели над пустотой, на поле оставалась несыгранная линия, а если ходов не
// осталось — ход игрока при поле без ходов (ходить нечем, бой «зависал»). Теперь поле доводится: падение; пусто / нет ходов / готовая линия — новые камни.
// «Редкое» поле (камней мало, но ход есть и линий нет) не трогаем: в этой игре поле намеренно редеет.
// Запуск: node tests/duoboard165.e2e.js
const path = require('path');
const { launch } = require('../tools/browser.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0;
const ok = (name, cond, extra) => { if (cond) console.log('  ok   ' + name); else { fails++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };

(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) {} });
  await p.goto(URL); await p.waitForTimeout(1800);
  await p.evaluate(() => { if (!Profile.data.faction && typeof Tutorial !== 'undefined') { Tutorial.start(); Tutorial.finish(false); } }); await p.waitForTimeout(300);
  await p.click('text=Горные кланы').catch(() => {}); await p.click('text=Мужской').catch(() => {});
  await p.fill('input', 'Тест').catch(() => {}); await p.click('text=Начать игру!').catch(() => {}); await p.waitForTimeout(1000);
  // Бой вдвоём. Монстр может сразу начать ходить — нам нужно только, чтобы поле героя было спокойно и его ход; для проверок поле подменяется вручную
  await p.evaluate(() => { for (const k in RULES.timing) RULES.timing[k] = 5; const m = MapView.map, me = MapView.state.pos; const a = m.spawns.filter((s) => MapView.alive(s)).sort((x, y) => HexMap.dist(m.cells[x.idx], m.cells[me]) - HexMap.dist(m.cells[y.idx], m.cells[me])); MapView.attack(a[0]); });
  await p.waitForFunction(() => document.body.classList.contains('mode-battle') && typeof Duo !== 'undefined' && Duo.on(), null, { timeout: 20000 });
  await p.evaluate(() => { MAIN_BATTLE.setAutopilot(false); Duo.pet && Duo.pet.setAutopilot(false); });   // ничьи ходы не мешают: поле ставим сами
  await p.waitForFunction(() => MAIN_BATTLE.turnSide === 'left' && !MAIN_BATTLE.busy && !MAIN_BATTLE.over && !MAIN_BATTLE.typOf().some((t) => t < 0), null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(800);

  // Подготовка поля: оставляем только клетки из списка keep (остальные — как после взрыва), «замораживая» бой: все сторонние ходы выключены
  const prep = `(keep, setTi) => {
    const B = MAIN_BATTLE, N = 6;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const t = B.grid[r][c]; if (!t) continue; if (!keep.includes(r * N + c)) { if (t.el) t.el.remove(); B.grid[r][c] = null; } }
    for (const [i, ti] of Object.entries(setTi || {})) { const t = B.grid[Math.floor(i / N)][i % N]; if (t) { t.ti = ti; t.type = GEM_TYPES[ti]; } }
    B.over = true; B.busy = true;                    // как после finishBoard
  }`;
  const report = `(B) => { const typ = B.typOf(); return { filled: typ.filter((t) => t >= 0).length, line: !!Engine.bonusMap(typ), moves: Engine.hasMoves(typ), dom: B.boardEl.querySelectorAll('.tile').length, busy: B.busy, over: B.over, turn: B.turnSide, floating: [0, 1, 2, 3, 4, 5].some((c) => { let seen = false; for (let r = 0; r < 6; r++) { const e = typ[r * 6 + c] < 0; if (!e) seen = true; else if (seen) return true; } return false; }) }; }`;
  const ALL = Array.from({ length: 36 }, (_, i) => i);

  console.log('A. исправное полное поле остаётся как было');
  {
    const r = await p.evaluate(async ([prep, report, ALL]) => {
      const B = MAIN_BATTLE; B.over = true; B.busy = true; const before = Array.from(B.typOf()).join(',');
      await B.resumeAfterAdopt();
      return { same: Array.from(B.typOf()).join(',') === before, ...eval(report)(B) };
    }, [prep, report, ALL]);
    ok('поле не тронуто, ввод открыт, ход за игроком', r.same && !r.busy && !r.over && r.turn === 'left', JSON.stringify(r));
  }

  console.log('B. висящие камни падают, а «редкое» поле с ходами не пересобирается');
  {
    // Поле боя к этому моменту уже могло поредеть само (так задумано), поэтому каждый заход начинается со свежего полного поля: 30 камней из 36 (нижний ряд убран).
    // Случайное поле из 30 камней очень редко оказывается без ходов — тогда игра вполне законно досыпает камни; такой заход просто повторяем.
    let r = null, attempt = 0;
    for (; attempt < 6; attempt++) {
      r = await p.evaluate(async ([prep, report, ALL]) => {
        const B = MAIN_BATTLE; const o = {};
        for (let r0 = 0; r0 < 6; r0++) for (let c0 = 0; c0 < 6; c0++) { const t = B.grid[r0][c0]; if (t && t.el) t.el.remove(); B.grid[r0][c0] = null; }
        B.over = false; B.busy = false; await B.refillBoard();
        // убираем нижний ряд: все камни выше «повисли» над пустотой
        eval(prep)(ALL.filter((i) => i < 30));
        o.before = eval(report)(B);
        await B.resumeAfterAdopt();
        o.after = eval(report)(B);
        return o;
      }, [prep, report, ALL]);
      if (r.after.filled === r.before.filled) break;
    }
    ok('до: камни висят над пустотой, их 30 (условие воспроизведено)', r.before.floating && r.before.filled === 30, JSON.stringify(r.before));
    ok('после: камни упали, ввод открыт', !r.after.floating && !r.after.busy && !r.after.over && r.after.turn === 'left', JSON.stringify(r.after));
    ok('после: поле не пересобрано (камней столько же), раз ход есть и линий нет', r.after.filled === 30 && r.after.moves && !r.after.line, 'заходов: ' + (attempt + 1) + ' ' + JSON.stringify(r.after));
  }

  console.log('C. оставшаяся готовая линия — поле доводится до исправного (ходы есть, линий нет)');
  {
    const r = await p.evaluate(async ([prep, report, ALL]) => {
      const B = MAIN_BATTLE; const o = {};
      await B.refillBoard && 0;
      // свежее полное поле и три одинаковых камня подряд внизу
      for (let r0 = 0; r0 < 6; r0++) for (let c0 = 0; c0 < 6; c0++) { const t = B.grid[r0][c0]; if (t && t.el) t.el.remove(); B.grid[r0][c0] = null; }
      B.over = false; B.busy = false; await B.refillBoard();
      eval(prep)(ALL, { 33: 0, 34: 0, 35: 0 });
      o.before = eval(report)(B);
      await B.resumeAfterAdopt();
      o.after = eval(report)(B);
      return o;
    }, [prep, report, ALL]);
    ok('до: на поле есть готовая линия (условие воспроизведено)', r.before.line, JSON.stringify(r.before));
    ok('после: линии нет, ход есть, 36 камней и 36 плиток на экране, ввод открыт', !r.after.line && r.after.moves && r.after.filled === 36 && r.after.dom === 36 && !r.after.busy && !r.after.over && r.after.turn === 'left', JSON.stringify(r.after));
  }

  console.log('D. камней мало и ходов нет — поле наполняется (раньше ход игрока оставался при поле без ходов)');
  {
    const r = await p.evaluate(async ([prep, report, ALL]) => {
      const B = MAIN_BATTLE; const o = {};
      for (let r0 = 0; r0 < 6; r0++) for (let c0 = 0; c0 < 6; c0++) { const t = B.grid[r0][c0]; if (t && t.el) t.el.remove(); B.grid[r0][c0] = null; }
      B.over = false; B.busy = false; await B.refillBoard();
      eval(prep)([29, 35]);                             // два камня в разных рядах и столбцах — обмениваться нечем
      o.before = eval(report)(B);
      await B.resumeAfterAdopt();
      o.after = eval(report)(B);
      return o;
    }, [prep, report, ALL]);
    ok('до: ходов нет (условие воспроизведено)', !r.before.moves, JSON.stringify(r.before));
    ok('после: поле наполнено, ходы есть, линий нет, ввод открыт', r.after.filled === 36 && r.after.moves && !r.after.line && r.after.dom === 36 && !r.after.busy && !r.after.over && r.after.turn === 'left', JSON.stringify(r.after));
    const mv = await p.evaluate(async () => {
      const B = MAIN_BATTLE; const w = (ms) => new Promise((x) => setTimeout(x, ms));
      const m0 = B.moves; B.setAutopilot(true, 100); for (let k = 0; k < 60 && B.moves === m0; k++) await w(100);
      return { moved: B.moves > m0 };
    });
    ok('и ход на этом поле снова можно сделать (автопилот сыграл ход)', mv.moved, JSON.stringify(mv));
  }
  ok('без ошибок JS', errs.length === 0, errs[0]);
  await b.close();
  console.log(fails ? `\nduoboard165 e2e: ПРОВАЛ (${fails})` : '\nduoboard165 e2e: все тесты пройдены');
  process.exit(fails ? 1 : 0);
})();
