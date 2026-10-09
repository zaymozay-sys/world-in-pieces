// Обсидиан x5 через РЕАЛЬНЫЙ игровой конвейер (не только чистую Engine.obsidianBurst в изоляции).
// Запуск: node tests/obsidian-live.test.js
//
// Engine.obsidianBurst() — чистая функция и проверяется в engine.test.js, но это не гарантирует,
// что она действительно подключена к живому game.js (неверный порядок вызовов относительно каскада/
// гравитации, не тот массив индексов и т.п.). Здесь мы загружаем НАСТОЯЩИЙ game.js (со всеми его
// зависимостями) в vm-контексте с минимальными DOM-заглушками и прогоняем ход ИМЕННО так, как это
// делает игрок: attemptSwap() -> resolveBoard() — а не дёргаем Engine.obsidianBurst() напрямую.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const J = (f) => path.join(__dirname, '..', 'js', f);
// Порядок скриптов — как в index.html (новые модули подхватываются сами).
const order = [...fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map((m) => m[1]);

let src = '';
for (const f of order) {
  let s = fs.readFileSync(J(f), 'utf8');
  if (f === 'game.js') {
    // Отрезаем хвост загрузки страницы (buildSpellbar(); ... MapView.init(); заставка) - нужны только
    // определения функций/констант, без реального DOM-тяжёлого запуска игры.
    const lines = s.split('\n');
    const idx = lines.findIndex((l) => l.startsWith('buildSpellbar();'));
    if (idx < 0) throw new Error('маркер начала загрузки не найден в game.js — файл изменился, поправь тест');
    s = lines.slice(0, idx).join('\n');
  }
  src += `\n//== ${f} ==\n${s}\n`;
}

// ---- щедрые DOM-заглушки: любой незнакомый вызов метода - no-op, возвращающий новую заглушку ----
function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)), remove: (...c) => c.forEach((x) => set.delete(x)),
    toggle: (c, v) => { if (v === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else if (v) set.add(c); else set.delete(c); return set.has(c); },
    contains: (c) => set.has(c),
  };
}
function makeStubEl() {
  const el = {
    style: {}, dataset: {}, children: [], childNodes: [],
    classList: makeClassList(),
    appendChild: (c) => { el.children.push(c); return c; },
    removeChild: () => {}, remove: () => {}, addEventListener: () => {}, removeEventListener: () => {},
    setAttribute: () => {}, removeAttribute: () => {}, getAttribute: () => null,
    querySelector: () => makeStubEl(), querySelectorAll: () => [],
    closest: () => null, cloneNode: () => makeStubEl(), setProperty: () => {},
    focus: () => {}, blur: () => {}, click: () => {},
  };
  Object.defineProperty(el, 'innerHTML', { get() { return el._html || ''; }, set(v) { el._html = v; } });
  Object.defineProperty(el, 'textContent', { get() { return el._text || ''; }, set(v) { el._text = v; } });
  el.style.setProperty = () => {}; el.style.removeProperty = () => {};
  return new Proxy(el, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      return () => makeStubEl();
    },
  });
}
const documentStub = {
  getElementById: () => makeStubEl(), createElement: () => makeStubEl(), createElementNS: () => makeStubEl(),
  createTextNode: (t) => ({ nodeType: 3, textContent: t }),
  querySelector: () => makeStubEl(), querySelectorAll: () => [],
  addEventListener: () => {}, removeEventListener: () => {},
  body: makeStubEl(), documentElement: makeStubEl(), head: makeStubEl(),
  hidden: false, visibilityState: 'visible',
};
const windowStub = {
  matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
  addEventListener: () => {}, removeEventListener: () => {},
  localStorage: (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; })(),
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: () => {},
  innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
  navigator: { vibrate: () => {}, serviceWorker: undefined, userAgent: 'node' },
};
const ctx = {
  console, setTimeout, clearTimeout, setInterval, clearInterval, Math, Date, JSON,
  Int8Array, Int16Array, Float32Array, Array, Object, Promise, Error,
  document: documentStub, window: windowStub, localStorage: windowStub.localStorage, navigator: windowStub.navigator,
  Image: function () { return makeStubEl(); }, requestAnimationFrame: windowStub.requestAnimationFrame,
  module: undefined,
};
ctx.window.document = documentStub;
ctx.self = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'bundle.js' });

// ---- прогон реального хода внутри той же лексической области (чтобы иметь прямой доступ к
// grid/fighters/attemptSwap/resolveBoard - top-level let/const game.js, не проброшенным в ctx) ----
const driver = `
(async () => {
  // Сценарий: тройка обсидиана в строке 2 (c0..c2), замыкающий камень приходит сверху обменом (1,2)<->(2,2).
  // Замыкающий обсидиан имеет номинал v: при v = 5 это «обсидиан x5», и все камни вокруг него на расстоянии 1
  // должны исчезнуть с поля в этом же сборе; при v = 1 соседи остаются.
  async function scenario(v) {
    const out = {};
    Object.assign(fighters.left,  { hp: 999, max: 999, magic: false, buffs: [], counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 }, luck: 0 });
    Object.assign(fighters.right, { hp: 999, max: 999, magic: false, buffs: [], counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 }, luck: 0 });
    over = false; busy = false; turnStats = { stones: 0, dmg: 0, bonus: 1 };
    const OTH = [0, 1, 2, 3].filter((t) => t !== ONYX);
    function mk(ti, val) { return { type: GEM_TYPES[ti], ti, value: val, el: null }; }
    grid = [];
    for (let r = 0; r < N; r++) { grid.push([]); for (let c = 0; c < N; c++) grid[r][c] = mk(OTH[(r + c) % OTH.length], 1); }
    grid[2][0] = mk(ONYX, 1); grid[2][1] = mk(ONYX, 1);
    grid[1][2] = mk(ONYX, v);   // замыкающий обсидиан — после обмена окажется в (2,2)
    let uid = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      grid[r][c]._uid = uid++;
      grid[r][c].el = { classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } }, remove(){}, style: {} };
    }
    // соседи клетки (2,2) ПОСЛЕ обмена: в (1,2) окажется бывший камень из (2,2)
    const after = (r, c) => (r === 1 && c === 2 ? grid[2][2] : grid[r][c]);
    const nb = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const t = after(2 + dr, 2 + dc);
      if (t.ti !== ONYX) nb.push(t._uid);           // соседи, не входящие в саму тройку
    }
    out.preSwapHasMatch = Engine.bonusMap(typOf()) !== null;
    out.beforeCount = grid.flat().filter(Boolean).length;
    out.swapAccepted = await attemptSwap({ r: 1, c: 2 }, { r: 2, c: 2 });
    if (out.swapAccepted) await resolveBoard('left');
    const remaining = new Set(grid.flat().filter(Boolean).map((t) => t._uid));
    out.afterCount = grid.flat().filter(Boolean).length;
    out.neighbors = nb.length;
    out.neighborsLeft = nb.filter((u) => remaining.has(u)).length;
    return out;
  }
  globalThis.__RESULT__ = { x5: await scenario(5), x1: await scenario(1) };
})().catch((e) => { globalThis.__RESULT__ = { error: e.stack }; });
`;

vm.runInContext(driver, ctx, { filename: 'driver.js' });

// resolveBoard() ждёт через sleep()/setTimeout - дадим таймерам отработать, затем проверим результат.
setTimeout(() => {
  const R = JSON.parse(JSON.stringify(ctx.__RESULT__ || null));
  assert.ok(R, 'сценарий не вернул результат (обмен камнями завис?)');
  assert.ok(!R.error, 'ошибка при прогоне реального resolveBoard(): ' + R.error);
  for (const k of ['x5', 'x1']) {
    assert.strictEqual(R[k].preSwapHasMatch, false, k + ': в поле уже было совпадение до хода');
    assert.strictEqual(R[k].swapAccepted, true, k + ': attemptSwap() не принял ход, собирающий тройку обсидиана');
  }
  assert.strictEqual(R.x5.neighbors, 7, 'у центра (2,2) 8 соседей, один из них — часть самой тройки');
  assert.strictEqual(R.x5.neighborsLeft, 0, 'обсидиан x5 собран, но камни вокруг него на расстоянии 1 остались на поле');
  assert.ok(R.x5.beforeCount - R.x5.afterCount >= 3 + 7, 'убрано слишком мало клеток: ' + (R.x5.beforeCount - R.x5.afterCount));
  assert.strictEqual(R.x1.neighborsLeft, R.x1.neighbors, 'обычный обсидиан (x1) не должен взрывать соседей');
  assert.strictEqual(R.x1.beforeCount - R.x1.afterCount, 3, 'без x5 убирается только сама тройка');
  console.log('obsidian-live: все тесты пройдены');
}, 4000);
