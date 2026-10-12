// 1.6.5 (A2-21, часть 2): в бою вдвоём победа ВЫЖИВШЕГО поля — последнее событие: finishBoard вызывается прямо из dealDamage посреди каскада,
// Duo.evaluate тут же передаёт этому полю чужого противника (adoptFoe + resumeAfterAdopt), а недоигранный каскад ещё ждёт на sleep и потом идёт
// дальше по устаревшим координатам и по «живому» противнику (sideDown уже ложь): поле сыпалось (null.el), ход уходил противнику дважды.
// Теперь передача ждёт, пока поле доиграет ход (whenIdle), и только потом принимает чужого противника.
// Сценарий: питомец пал; у героя на поредевшем поле один ход обсидианом добивает противника.
// Запуск: node tests/duoadopt165.e2e.js
const path = require('path');
const { launch } = require('../tools/browser.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0;
const ok = (name, cond, extra) => { if (cond) console.log('  ok   ' + name); else { fails++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };

const REPS = +process.env.REPS || 3;
async function scenario(b, k) {
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

  console.log('Повтор ' + (k + 1) + ': питомец пал, ход героя добивает противника посреди каскада');
  const r = await p.evaluate(async (rep) => {
    const B = MAIN_BATTLE, N = 6, o = { rep };
    // 1. питомец пал (проигрыш поля питомца), его противник жив
    o.petFoeId = Duo.pet.fighters.right.monsterId;
    Duo.pet.fighters.left.hp = 0; Duo.pet.checkEnd();
    await new Promise((res) => setTimeout(res, 300));
    // 2. у героя — поредевшее поле: пусты левый столбец и верх двух следующих; цвета без линий, три обсидиана для хода (5,5)<->(4,5)
    B.over = false; B.busy = false;
    for (let r0 = 0; r0 < N; r0++) for (let c0 = 0; c0 < N; c0++) { const t = B.grid[r0][c0]; if (t && t.el) t.el.remove(); B.grid[r0][c0] = null; }
    await B.refillBoard();
    const cols = [...GEM_TYPES.keys()].filter((i) => i !== ONYX).slice(0, 3);
    for (let r0 = 0; r0 < N; r0++) for (let c0 = 0; c0 < N; c0++) {
      const t = B.grid[r0][c0]; if (!t) continue;
      if (c0 === 0 || ((c0 === 1 || c0 === 2) && r0 < 3 + (rep % 2))) { if (t.el) t.el.remove(); B.grid[r0][c0] = null; continue; }
      const ti = cols[(r0 + 2 * c0) % 3]; t.ti = ti; t.type = GEM_TYPES[ti]; t.value = 1;
    }
    for (const [r0, c0] of [[5, 3], [5, 4], [4, 5]]) { const t = B.grid[r0][c0]; t.ti = ONYX; t.type = GEM_TYPES[ONYX]; t.value = 5; }
    o.preLine = !!Engine.bonusMap(B.typOf()); o.preMoves = Engine.hasMoves(B.typOf());
    // 3. противник на последнем издыхании, без блока и отражения
    const f = B.fighters.right; f.hp = 1; if (f.stats) for (const key of Object.keys(f.stats)) if (typeof f.stats[key] === 'number') f.stats[key] = 0;
    B.setTurn('left'); B.setAutopilot(false);
    // метка: доигран ли ход игрока (его обещание выполнено) в тот момент, когда поле принимает чужого противника
    let settled = false; window.__adopt = null;
    const orig = B.adoptFoe;
    Object.defineProperty(B, 'adoptFoe', { get: () => (...a) => { window.__adopt = { settled }; return orig(...a); }, configurable: true, enumerable: true });
    const mv = B.playerMove({ r: 5, c: 5 }, { r: 4, c: 5 });   // не ждём: бой кончается посреди каскада
    mv.then(() => { settled = true; });
    return o;
  }, k);
  ok('условие подготовлено (линий нет, ход есть)', !r.preLine && r.preMoves, JSON.stringify(r));
  // ждём, пока поле успокоится и ход вернётся игроку
  await p.waitForFunction(() => !MAIN_BATTLE.busy && !MAIN_BATTLE.over && MAIN_BATTLE.turnSide === 'left', null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(800);
  const s = await p.evaluate(() => {
    const B = MAIN_BATTLE, typ = B.typOf(), N = 6;
    const cnt = typ.filter((t) => t >= 0).length;
    const floating = [0, 1, 2, 3, 4, 5].some((c) => { let seen = false; for (let r = 0; r < N; r++) { const e = typ[r * N + c] < 0; if (!e) seen = true; else if (seen) return true; } return false; });
    return { busy: B.busy, over: B.over, turn: B.turnSide, foeHp: B.fighters.right.hp, foeId: B.fighters.right.monsterId, filled: cnt, dom: B.boardEl.querySelectorAll('.tile').length, line: !!Engine.bonusMap(typ), moves: Engine.hasMoves(typ), floating };
  }).catch((e) => ({ err: String(e) }));
  const ad = await p.evaluate(() => window.__adopt);
  ok('чужой противник принят только после того, как ход доигран (не посреди каскада)', !!ad && ad.settled === true, JSON.stringify(ad));
  ok('поле успокоено, ввод открыт, ход игрока', !s.busy && !s.over && s.turn === 'left', JSON.stringify(s));
  ok('принят чужой противник (жив), поле без висящих камней и без готовой линии, ходы есть', s.foeHp > 0 && !s.floating && !s.line && s.moves, JSON.stringify(s));
  ok('плиток на экране столько же, сколько камней в таблице', s.dom === s.filled, JSON.stringify(s));
  ok('страница без ошибок', errs.length === 0, errs.join(' // '));
  await p.close();
}

(async () => {
  const b = await launch();
  for (let k = 0; k < REPS; k++) await scenario(b, k);
  await b.close();
  console.log(fails ? '\nduoadopt165 e2e: ПРОВАЛ (' + fails + ')' : '\nduoadopt165 e2e: все тесты пройдены');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
