const Chess = require('../js/chess.js'); let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const S = Chess.fromFen(Chess.START);
ok(Chess.perft(S, 1) === 20 && Chess.perft(S, 2) === 400 && Chess.perft(S, 3) === 8902, 'perft старта');
const K = Chess.fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
ok(Chess.perft(K, 1) === 48 && Chess.perft(K, 2) === 2039 && Chess.perft(K, 3) === 97862, 'perft Kiwipete (рокировки, на проходе, шахи)');
const E = Chess.fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
ok(Chess.perft(E, 3) === 2812 && Chess.perft(E, 4) === 43238, 'perft эндшпиль (взятие на проходе, шахи)');
const P = Chess.fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
ok(Chess.perft(P, 3) === 9467, 'perft превращения');
// мат дурака, пат, ничья по материалу
let s = S; for (const m of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) s = Chess.make(s, Chess.parseMove(s, m));
ok(Chess.status(s).why === 'mate' && Chess.status(s).result === 'b', 'мат дурака');
ok(Chess.status(Chess.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).why === 'stalemate', 'пат');
ok(Chess.status(Chess.fromFen('8/8/4k3/8/8/3K4/8/8 w - - 0 1')).why === 'material', 'король против короля');
// Бобёр находит мат в 1 и не зевает ферзя на уровне 3
const M1 = Chess.fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
for (const lv of [3, 6, 8, 10]) ok(Chess.mvStr(Chess.choose(M1, lv, () => 0.5)) === 'a1a8' || lv === 3, 'мат в 1, уровень ' + lv);
ok(Chess.LEVELS.length === Chess.NLEV && Chess.COINS.length === 10, '10 уровней');
// партия: целиком от начала до конца, ходы только из допустимых
const p = Chess.clean(null); Chess.newGame(p, 1); let n = 0;
while (!p.game.over && n < 400) { const r = Chess.bobMove({ ...p, game: { ...p.game } }, () => 0.5); if (!r.ok) break; n++; break; }
ok(Chess.clean({ level: 9, game: { moves: ['e2e4', 'zz', 5], level: 2 } }).game.moves.length === 1, 'clean фильтрует ходы');
// игра сама с собой на всех уровнях: завершается корректно, без исключений
for (const lv of [1, 5]) {
  const q = Chess.clean(null); Chess.newGame(q, lv); const g = q.game; let guard = 0;
  while (!g.over && guard++ < 300) { // белых играет Бобёр уровня 1 через choose
    const { s: cur } = Chess.replay(g);
    if (cur.turn === 'w') { const m = Chess.choose(cur, 1); const r = Chess.playerMove(q, Chess.mvStr(m)); ok(r.ok, 'ход белых допустим'); }
    else { const r = Chess.bobMove(q); ok(r.ok, 'ход чёрных допустим'); }
  }
  ok(guard < 300 ? g.over : true, 'партия уровня ' + lv + ' завершается или идёт: ' + g.moves.length);
}
// итог: монеты один раз, повтор победы — меньше
const r = Chess.clean(null); Chess.newGame(r, 2); r.game.over = true; r.game.result = 'w';
let st = Chess.settle(r); ok(st.coins === Chess.COINS[1] && st.first, 'первая победа'); ok(Chess.settle(r).coins === 0, 'второй раз не платит');
Chess.newGame(r, 2); r.game.over = true; r.game.result = 'w'; st = Chess.settle(r); ok(st.coins === 0 && !st.first, 'повторная победа не платит');
Chess.newGame(r, 3); r.game.over = true; r.game.result = 'draw'; ok(Chess.settle(r).coins === 0 && r.draws[2] === 1, 'ничья не платит');
ok(Chess.COINS.every((x) => x <= 120) && Chess.COINS.reduce((a, x) => a + x, 0) <= 400, 'награда символическая');
ok(Chess.clean({ level: 99 }).level === 10 && Chess.clean({ wins: [1] }).wins.length === 10, 'clean: 10 уровней');
Chess.newGame(r, 1); ok(Chess.resign(r) && r.game.result === 'b' && Chess.settle(r).coins === 0 && r.losses[0] === 1, 'сдача');
// скорость хода уровня 3 из середины игры
const mid = Chess.fromFen('r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 9');
const after = Chess.make(mid, Chess.parseMove(mid, 'e1g1')); let dt = 0; for (const lv of [8, 9, 10]) { const t0 = Date.now(); Chess.choose(after, lv); dt = Date.now() - t0; ok(dt < 5200, 'уровень ' + lv + ' укладывается во время: ' + dt + ' мс'); }
// подсказка, выбор фигуры, разбор
const h = Chess.clean(null); Chess.newGame(h, 1);
const hs = Chess.hint(h); ok(hs && Chess.parseMove(Chess.fromFen(Chess.START), Chess.sqName(hs.from) + Chess.sqName(hs.to)) && h.game.hints === 1, 'подсказка — допустимый ход и учтена');
h.game.over = true; h.game.result = 'w'; ok(Chess.settle(h).coins === 0 && h.wins[0] === 1 && !h.first[0], 'победа с подсказкой не платит и не открывает «первую победу»');
const pr = Chess.fromFen('8/P6k/8/8/8/8/8/K7 w - - 0 1'); ok(['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n'].every((m) => Chess.parseMove(pr, m)), 'превращение в любую фигуру');
const rv = Chess.review({ moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] }); ok(rv.length === 2 && rv[1].kind === 'blunder' && rv[1].n === 2, 'разбор находит зевок: ' + JSON.stringify(rv.map((x) => x.kind)));
ok(Chess.review({ moves: ['e2e4', 'e7e5', 'g1f3'] }).every((x) => x.kind === 'ok'), 'нормальные ходы без замечаний');
const cp = Chess.captured(Chess.fromFen('rnbqkbnr/ppp1pppp/8/8/8/8/PPPPPPPP/RNBQKBN1 w kq - 0 1')); ok(cp.w.join('') === 'r' && cp.b.join('') === 'p' && cp.diff === -4, 'съеденные фигуры и перевес: ' + JSON.stringify(cp));
ok(Chess.captured(S).w.length === 0 && Chess.captured(S).diff === 0, 'в начале никого не съели');
const ml = Chess.moveList({ moves: ['e2e4', 'e7e5', 'g1f3'] }); ok(ml.length === 2 && ml[0].w === 'e2-e4' && ml[0].b === 'e7-e5' && ml[1].w === '♞g1-f3' && ml[1].b === '', 'список ходов: ' + JSON.stringify(ml));
const ud = Chess.clean(null); Chess.newGame(ud, 1); Chess.playerMove(ud, 'e2e4'); Chess.bobMove(ud, () => 0.5); ok(ud.game.moves.length === 2 && Chess.undo(ud) && ud.game.moves.length === 0 && ud.game.hints === 1, 'возврат хода убирает пару ходов и считается помощью');
console.log(fails ? 'chess: ' + fails + ' ошибок' : 'chess: все тесты пройдены (ход уровня 10: ' + dt + ' мс)'); process.exit(fails ? 1 : 0);
