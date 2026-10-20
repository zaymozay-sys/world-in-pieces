if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
if (typeof Engine === 'undefined' && typeof require === 'function') globalThis.Engine = require('./engine.js');
/* Уроки Бобра (1.9.7): как собрать линию из 4 камней не «прямо», а в 2–3 приёма — сначала собирается тройка, камни
   падают и сдвигаются вправо, и 4-ка получается сама (каскадом) или следующим обменом. Каждый урок — готовое поле без
   новых камней (пустые клетки остаются пустыми) и лимит ходов; цель — убрать линию из 4+ камней. За первое прохождение
   — монеты и новый «приём». Состояние — Profile.data.lessons = { done:{id:true}, cur:{id, moves:[[a,b],…]} };
   партия восстанавливается проигрыванием ходов. Чистый модуль без DOM; поля проверяются тестом (tests/lessons.test.js). */
const Lessons = (() => {
  const N = 6;
  const LIST = [
    { id: 'l1', quest: 'bob-1', name: 'Прямая четвёрка', limit: 1, coins: 30,
      text: 'Начнём с простого: поменяй два соседних камня так, чтобы в одну линию встали 4 одинаковых. Четвёрка даёт дополнительный ход!',
      typ: [-1,-1,-1,-1,-1,2,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,2,-1,-1,-1,-1,-1,2,-1,-1,-1,-1,1,1,-1,0,1,1,2,1] },
    { id: 'l2', quest: 'bob-2', name: 'Две тройки подряд', limit: 2, coins: 40,
      text: 'Четвёрки в один ход нет. Сначала собери тройку — камни упадут и сдвинутся вправо, а вторым обменом из них получится четвёрка.',
      typ: [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,1,-1,-1,2,2,1,1,0,0,2,1,1,2] },
    { id: 'l3', quest: 'bob-3', name: 'Каскад', limit: 1, coins: 50,
      text: 'Один обмен — и тройка убирается, камни падают и сами складываются в новую линию. Найди обмен, после которого каскадом получится четвёрка.',
      typ: [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,1,-1,-1,-1,-1,1,1,-1,-1,-1,-1,1,0,2,2,1,1,2,2] },
    { id: 'l4', quest: 'bob-4', name: 'Тройка, затем каскад', limit: 2, coins: 60,
      text: 'Первым обменом убери тройку и подготовь поле, вторым — запусти каскад, который сложит четвёрку. Смотри, куда сдвинутся камни.',
      typ: [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,-1,-1,-1,-1,-1,2,-1,-1,-1,-1,-1,0,-1,-1,0,0,2,2,-1,2,2,0,2,2] },
    { id: 'l5', quest: 'bob-5', name: 'Цепочка из трёх ходов', limit: 3, coins: 90,
      text: 'Самое хитрое: две подготовительные тройки и третий обмен, из которого получится четвёрка. Подумай на ход вперёд — камни падают вниз и сдвигаются вправо.',
      typ: [-1,-1,-1,-1,-1,2,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,1,1,-1,-1,-1,-1,0,0,-1,1,0,1,0,0] },
  ];
  const byId = (id) => LIST.find((l) => l.id === id) || null;
  const pairOk = (m) => Array.isArray(m) && m.length === 2 && m.every((v) => Number.isInteger(v) && v >= 0 && v < N * N);
  function clean(p) {
    p = p && typeof p === 'object' ? p : {};
    const done = {}; if (p.done && typeof p.done === 'object') for (const l of LIST) if (p.done[l.id]) done[l.id] = true;
    let cur = null;
    if (p.cur && byId(p.cur.id) && Array.isArray(p.cur.moves)) cur = { id: p.cur.id, moves: p.cur.moves.filter(pairOk).slice(0, byId(p.cur.id).limit) };
    return { done, cur };
  }
  // обмен a↔b на копии поля: { typ, big } либо null, если ход не собирает ничего; big — была линия из 4+ (в любом шаге каскада)
  function play(typ, a, b) {
    const t = Int8Array.from(typ), val = new Int8Array(N * N).fill(1);
    if (a === b || t[a] < 0 || t[b] < 0 || t[a] === t[b]) return null;
    if (Math.abs(Math.floor(a / N) - Math.floor(b / N)) + Math.abs((a % N) - (b % N)) !== 1) return null;
    [t[a], t[b]] = [t[b], t[a]];
    let big = false, steps = 0;
    for (;;) {
      const bon = Engine.bonusMap(t); if (!bon) break;
      steps++;
      for (let i = 0; i < N * N; i++) if (bon[i]) { if (bon[i] >= 2) big = true; t[i] = -1; }
      Engine.gravity(t, val); Engine.shiftRight(t, val);
    }
    return steps ? { typ: t, big, steps } : null;
  }
  // текущая партия урока: { typ, used, won, failed, left }
  function game(p, id) {
    const l = byId(id); let typ = Int8Array.from(l.typ), used = 0, won = false;
    const moves = p.cur && p.cur.id === id ? p.cur.moves : [];
    for (const [a, b] of moves) { const r = play(typ, a, b); if (!r) continue; typ = r.typ; used++; if (r.big) won = true; }
    return { typ, used, won, failed: !won && used >= l.limit, left: Math.max(0, l.limit - used) };
  }
  function start(p, id) { if (!byId(id)) return false; p.cur = { id, moves: [] }; return true; }
  // ход игрока: { ok, won, failed, coins, steps }; монеты — только за первое прохождение
  function move(p, id, a, b) {
    const l = byId(id); if (!l) return { ok: false };
    if (!p.cur || p.cur.id !== id) start(p, id);
    const g = game(p, id); if (g.won || g.failed) return { ok: false };
    const r = play(g.typ, a, b); if (!r) return { ok: false };
    p.cur.moves.push([a, b]);
    const won = r.big, failed = !won && g.used + 1 >= l.limit;
    let coins = 0;
    if (won && !p.done[id]) { p.done[id] = true; coins = l.coins; }
    return { ok: true, won, failed, coins, steps: r.steps, first: coins > 0 };
  }
  const doneCount = (p) => LIST.filter((l) => p.done[l.id]).length;
  // урок открывает поручение Бобра: он доступен, когда награда за него получена (d — данные героя, d.quests)
  const open = (d, id) => { const l = byId(id); return !!(l && d && d.quests && d.quests[l.quest]); };
  const next = (p) => LIST.find((l) => !p.done[l.id]) || null;
  return { N, LIST, byId, clean, play, game, start, move, doneCount, open, next };
})();

if (typeof module !== 'undefined') module.exports = Lessons;
