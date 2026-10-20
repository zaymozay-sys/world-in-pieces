const Lessons = require('../js/lessons.js'); const Engine = require('../js/engine.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
// перебор: минимальное число обменов до линии 4+ и признак «каскад на выигрышном ходу»
function search(typ, d, out = []) { for (let a = 0; a < 36; a++) for (const b of [a % 6 < 5 ? a + 1 : -1, a < 30 ? a + 6 : -1]) {
  if (b < 0) continue; const r = Lessons.play(typ, a, b); if (!r) continue; if (r.big) out.push({ n: Lessons.LIST.length, steps: r.steps, depth: d }); else if (d > 1) search(r.typ, d - 1, out); } return out; }
for (const l of Lessons.LIST) {
  ok(l.typ.length === 36 && !Engine.bonusMap(Int8Array.from(l.typ)), l.id + ': поле без готовых линий');
  // решаемо в limit ходов, но не быстрее: за меньшее число ходов решения нет
  ok(search(Int8Array.from(l.typ), l.limit).length > 0, l.id + ': решаемо в ' + l.limit);
  if (l.limit > 1) ok(search(Int8Array.from(l.typ), l.limit - 1).length === 0, l.id + ': быстрее нельзя');
}
// партия: проход, монеты один раз, провал
const p = Lessons.clean(null);
ok(!Lessons.open({ quests: {} }, 'l1') && Lessons.open({ quests: { 'bob-1': true } }, 'l1') && !Lessons.open({ quests: { 'bob-1': true } }, 'l2'), 'урок открывает поручение Бобра');
const Q = require('../js/quests.js'); ok(Lessons.LIST.every((l) => Q.find(l.quest) && Q.find(l.quest).lesson === l.id && Q.find(l.quest).giver === 'library'), 'поручение на каждый урок');
const win = (id) => { const l = Lessons.byId(id); const p2 = Lessons.clean(null); Lessons.start(p2, id); const found = [];
  const rec = (typ, path) => { if (found.length) return; for (let a = 0; a < 36; a++) for (const b of [a % 6 < 5 ? a + 1 : -1, a < 30 ? a + 6 : -1]) { if (b < 0 || found.length) continue; const r = Lessons.play(typ, a, b); if (!r) continue; const q = [...path, [a, b]]; if (r.big) found.push(q); else if (q.length < l.limit) rec(r.typ, q); } };
  rec(Int8Array.from(l.typ), []); return found[0]; };
let total = 0;
for (const l of Lessons.LIST) {
  const path = win(l.id); ok(path, l.id + ': есть путь');
  let r; for (const [a, b] of path) r = Lessons.move(p, l.id, a, b);
  ok(r.ok && r.won && r.coins === l.coins && p.done[l.id], l.id + ': победа и монеты'); total += r.coins;
  ok(Lessons.move(p, l.id, path[0][0], path[0][1]).ok === false, l.id + ': после победы ходов нет');
  Lessons.start(p, l.id); let r2; for (const [a, b] of path) r2 = Lessons.move(p, l.id, a, b); ok(r2.won && r2.coins === 0, l.id + ': повтор без монет');
}
ok(Lessons.doneCount(p) === 5 && !Lessons.next(p), 'все пройдены');
// ход, ничего не собирающий, не засчитывается; провал по лимиту
const q = Lessons.clean(null); Lessons.start(q, 'l2');
ok(Lessons.move(q, 'l2', 0, 1).ok === false, 'пустой ход');
ok(JSON.stringify(Lessons.clean({ done: { l1: 1, zz: 1 }, cur: { id: 'l2', moves: [[1, 2], [99, 1], 'x'] } })) === JSON.stringify({ done: { l1: true }, cur: { id: 'l2', moves: [[1, 2]] } }), 'clean');
console.log(fails ? 'lessons: ' + fails + ' ошибок' : 'lessons: все тесты пройдены'); process.exit(fails ? 1 : 0);
