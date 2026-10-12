/* Общие куски для проверок полного прохода (tests/audit3.*.e2e.js, tools/audit-*.js).
   installBot(page) — кладёт в страницу window.__A: бот-игрок на ИИ игры, проверка инвариантов и счётчики.
   Всё выполняется внутри страницы, поэтому видит те же глобальные объекты, что и сама игра (Profile, MAIN_BATTLE, Duo…). */

// Генератор случайных чисел с зерном — подменяет Math.random в странице, чтобы прогон можно было повторить.
const seedScript = (seed) => `(() => { let a = ${seed >>> 0}; window.__seed = ${seed >>> 0}; Math.random = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;

function installBot() {
  const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
  const A = window.__A = { errs: [], log: [] };
  window.addEventListener('error', (e) => A.errs.push('error: ' + e.message));
  window.addEventListener('unhandledrejection', (e) => A.errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));

  const isInt = (v) => typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);

  // ---- инварианты профиля ----
  A.profileInv = () => {
    const bad = [], d = Profile.data;
    if (!isInt(d.coins) || d.coins < 0) bad.push('coins=' + d.coins);
    if (!Number.isFinite(d.xp) || d.xp < 0) bad.push('xp=' + d.xp);
    const counters = { resources: d.resources, backpack: d.backpack, elixirBag: d.elixirs && d.elixirs.bag, ammo: d.ammo, runeBag: d.runeBag, eggs: d.eggs };
    for (const [name, o] of Object.entries(counters)) for (const [k, v] of Object.entries(o || {})) if (!isInt(v) || v < 0) bad.push(name + '.' + k + '=' + v);
    const uids = new Set();
    for (const e of d.items) {
      if (!e || typeof e.uid !== 'string') { bad.push('вещь без uid'); continue; }
      if (uids.has(e.uid)) bad.push('дубль uid ' + e.uid);
      uids.add(e.uid);
      const it = Gear.item(e); if (!it) bad.push('неизвестная вещь ' + e.id);
      if (!(e.tier >= 1 && e.tier <= 10)) bad.push('цвет вещи ' + e.id + '=' + e.tier);
    }
    const used = new Set();
    for (const s of Gear.SLOTS) {
      const u = d.loadout[s]; if (!u) continue;
      if (!uids.has(u)) { bad.push('надета несуществующая вещь ' + s); continue; }
      if (used.has(u)) bad.push('одна вещь в двух ячейках ' + u);
      used.add(u);
      const it = Gear.item(d.items.find((x) => x.uid === u));
      if (!Gear.fits(s, it.type)) bad.push('вещь ' + it.id + ' не подходит ячейке ' + s);
      if (!Hero.canWear(it.wt, Profile.level())) bad.push('надето не по уровню ' + it.id);
    }
    if (Gear.totalCost(Profile.gear()) > Profile.budget()) bad.push('очков снаряжения больше лимита');
    const lots = (d.market && d.market.lots) || [];
    if (lots.length > Village.maxLots(d.village)) bad.push('лотов больше лимита ' + lots.length);
    for (const l of lots) if (l.kind === 'item' && uids.has(l.entry && l.entry.uid)) bad.push('вещь одновременно в сумке и в лоте ' + l.entry.uid);
    const medalIds = d.medals.earned.map((m) => m.id); if (new Set(medalIds).size !== medalIds.length) bad.push('дубли медалей');
    if (!Number.isInteger(d.wins) || d.wins < 0) bad.push('wins=' + d.wins);
    // 1.6.5: «исправное сохранение не меняется» — проверка загрузки (SaveGuard) не должна ничего убирать из живого профиля после настоящей игры
    if (typeof SaveGuard !== 'undefined') {
      try {
        const clone = JSON.parse(JSON.stringify(d)), before = JSON.stringify(clone), r = SaveGuard.normalize(clone);
        if (r.notes && r.notes.length) bad.push('SaveGuard правит исправный профиль: ' + r.notes.slice(0, 3).join('; '));
        else if (JSON.stringify(clone) !== before) bad.push('SaveGuard изменил профиль без пометок');
      } catch (e) { bad.push('SaveGuard бросил ошибку на живом профиле: ' + e.message); }
    }
    return bad;
  };

  // ---- инварианты поля одного боя (B — MAIN_BATTLE или Duo.pet) ----
  A.battleInv = (B, tag) => {
    const bad = [];
    try {
      const typ = B.typOf(), val = B.valOf(), settled = !B.busy && !B.over && !B.aiming;
      if (typ.length !== 36) bad.push(tag + ': клеток ' + typ.length);
      if (typ.some((t) => t < -1 || t > 3)) bad.push(tag + ': вид камня вне 0..3');
      if (val.some((v, i) => typ[i] >= 0 && ![1, 3, 5].includes(v) && !(v > 5 && v < 1000))) bad.push(tag + ': странный номинал ' + [...new Set(val)].join(','));
      const dom = B.boardEl ? B.boardEl.querySelectorAll('.tile').length : null;
      const filled = typ.filter((t) => t >= 0).length;
      if (settled && dom !== null && dom !== filled) bad.push(tag + ': плиток в DOM ' + dom + ', в поле ' + filled);
      if (settled && B.turnSide === 'left' && Engine.bonusMap(typ) && !B.autopilotBusy) {
        // 1.6.5: при срабатывании сохраняем снимок состояния — поле, статус, хвост журнала, флаги (разбор A2-21 «осталась готовая линия»)
        const log = [...document.querySelectorAll('#log li, [id$="log"] li')].slice(-6).map((e) => e.textContent.trim().slice(0, 60));
        window.__lineDump = window.__lineDump || [];
        window.__lineDump.push({ tag, typ: Array.from(typ), val: Array.from(val), status: B.statusEl ? B.statusEl.textContent : null, log, moves: B.moves, autopilot: B.autopilot, autoPending: B.autoPending, petPrank: B.petPrank, aiming: B.aiming, t: Date.now() });
        bad.push(tag + ': на поле осталась готовая линия');
      }
      if (settled && B.turnSide === 'left' && filled === 36 && !Engine.hasMoves(typ)) bad.push(tag + ': нет ходов, а поле не пересобрано');
      for (const side of ['left', 'right']) {
        const f = B.fighters[side];
        if (!Number.isFinite(f.hp) || f.hp > f.max + 1e-6) bad.push(tag + ': hp ' + side + '=' + f.hp + '/' + f.max);
        for (const [k, v] of Object.entries(f.counts || {})) if (!Number.isFinite(v) || v < 0) bad.push(tag + ': счётчик ' + side + '.' + k + '=' + v);
      }
    } catch (e) { bad.push(tag + ': исключение в проверке ' + e.message); }
    return bad;
  };

  A.battles = () => (typeof Duo !== 'undefined' && Duo.on() && Duo.pet) ? [['hero', MAIN_BATTLE], ['pet', Duo.pet]] : [['hero', MAIN_BATTLE]];

  // ---- бот: один такт. Возвращает { done:true, ... } или { mouse:[{x,y,d,wait}] } — клики, которые сделает Node настоящей мышью ----
  // opts: ai (уровень ИИ бота), stuckMs, fuzz (вероятность лишнего действия за такт), maxMs, mouse (доля ходов, сделанных мышью), spam (число «тапов» по полю во время каскада)
  A.begin = (opts = {}) => { A.st = { t0: Date.now(), last: Date.now(), sig: '', human: 0, inv: [], extras: 0, mouseMoves: 0, spamTaps: 0, opts }; };
  A.tick = () => {
    const S = A.st, o = S.opts, ai = o.ai || 60, stuckMs = o.stuckMs || 20000, fuzz = o.fuzz || 0, maxMs = o.maxMs || 120000;
    const res = (x) => ({ done: true, human: S.human, inv: S.inv, extras: S.extras, mouseMoves: S.mouseMoves, spamTaps: S.spamTaps, ms: Date.now() - S.t0, ...x });
    if (document.getElementById('overlay')) { const ov = document.getElementById('overlay'); return res({ text: ov.innerText.slice(0, 160) }); }
    if (!document.body.classList.contains('mode-battle')) return res({ ended: 'left-battle' });
    const bs = A.battles();
    const cur = bs.map(([n, B]) => [B.moves, B.fighters.left.hp, B.fighters.right.hp, B.over, B.busy, B.aiming, B.turnSide].join(',')).join('|');
    if (cur !== S.sig) { S.sig = cur; S.last = Date.now(); }
    if (Date.now() - S.last > stuckMs) return res({ stuck: cur + ' ' + bs.map(([n, B]) => n + ':over=' + B.over + ' busy=' + B.busy + ' aiming=' + B.aiming + ' turn=' + B.turnSide + ' auto=' + B.autopilot).join(' ') + ' control=' + (typeof Duo !== 'undefined' && Duo.on() ? Duo.state.control : '-') });
    if (Date.now() - S.t0 > maxMs) return res({ timeout: true });
    if (bs.every(([n, B]) => !B.busy || B.over)) for (const [n, B] of bs) for (const m of A.battleInv(B, n)) if (!S.inv.includes(m)) S.inv.push(m);
    const ctl = (typeof Duo !== 'undefined' && Duo.on()) ? Duo.state.control : 'hero';
    const B = ctl === 'pet' && Duo.pet ? Duo.pet : MAIN_BATTLE;
    const rect = () => { const r = B.boardEl.getBoundingClientRect(); return r.width > 50 && r.height > 50 && r.bottom > 0 && r.top < innerHeight ? r : null; };
    const pt = (rc, r, c) => ({ x: rc.left + (c + 0.5) * rc.width / 6, y: rc.top + (r + 0.5) * rc.height / 6 });
    if (B.over || B.autopilot || B.turnSide !== 'left') return { mouse: [] };
    if (B.aiming) {                                              // прицел: чаще отменяем, иногда стреляем в случайную клетку (в т. ч. пустую)
      const rc = rect();
      if (rc && Math.random() < 0.5) { const q = pt(rc, Math.floor(Math.random() * 6), Math.floor(Math.random() * 6)); S.extras++; return { mouse: [{ x: q.x, y: q.y, wait: 30 }, { x: q.x, y: q.y, wait: 30 }] }; }
      try { B.stopAim(); } catch (e) { A.errs.push('stopAim: ' + e.message); }
      return { mouse: [] };
    }
    if (B.busy) return { mouse: [] };
    if (fuzz && Math.random() < fuzz) {
      const r = Math.random(); S.extras++;
      try {
        if (r < 0.3) { const btn = [...document.querySelectorAll('#bagbar button.bagitem[data-item]:not([disabled])')]; if (btn.length) btn[Math.floor(Math.random() * btn.length)].click(); }
        else if (r < 0.6) { const btn = [...document.querySelectorAll('#spellbar button.magic:not([disabled])')]; if (btn.length) { const b = btn[Math.floor(Math.random() * btn.length)]; b.click(); b.click(); } }
        else if (r < 0.75) { const btn = document.querySelector('#bagbar button.bagitem.ammo:not([disabled])'); if (btn) btn.click(); }
        else if (r < 0.85) { const hint = document.getElementById('hint'); if (hint && !hint.disabled) hint.click(); }
      } catch (e) { A.errs.push('extras: ' + e.message); }
      return { mouse: [] };
    }
    const L = B.fighters.left, R = B.fighters.right, v = Combat.aiView(L, R);
    const mv = AI.choose(B.typOf(), B.valOf(), v.hpMe, v.hpOpp, ai, {}, { maxMe: v.maxMe, locked: B.lockedCells('left') });
    if (!mv) return { mouse: [] };
    S.human++;
    const a = { r: Math.floor(mv.a / 6), c: mv.a % 6 }, b2 = { r: Math.floor(mv.b / 6), c: mv.b % 6 };
    const rc = rect();
    if (rc && o.mouse && Math.random() < o.mouse) {              // настоящий ввод: два касания по соседним клеткам, затем «тапы» по полю во время анимации
      S.mouseMoves++;
      const A1 = pt(rc, a.r, a.c), B1 = pt(rc, b2.r, b2.c), seq = [{ x: A1.x, y: A1.y, wait: 15 }, { x: B1.x, y: B1.y, wait: 10 }];
      const taps = Math.floor(Math.random() * ((o.spam || 0) + 1));
      for (let i = 0; i < taps; i++) { const q = pt(rc, Math.floor(Math.random() * 6), Math.floor(Math.random() * 6)); seq.push({ x: q.x, y: q.y, wait: 40 + Math.floor(Math.random() * 80) }); S.spamTaps++; }
      return { mouse: seq };
    }
    B.playerMove(a, b2);
    return { mouse: [] };
  };

  // живое существо на карте (слабейшие первыми, случайное из нескольких) → бой; героя ставим на его клетку (ходьба не нужна)
  A.attackNearest = () => {
    for (const k in RULES.timing) RULES.timing[k] = 3;
    try { Balance.rewards.minMoves = 0; } catch (e) { /* без правки */ }
    const m = MapView.map, T = Hero.tierFor(Profile.level());
    const a = m.spawns.filter((s) => MapView.alive(s) && !s.boss && s.tier <= T + 1).sort((x, y) => x.tier - y.tier);
    if (!a.length) return false;
    const sp = a[Math.floor(Math.random() * Math.min(8, a.length))];
    const near = [...HexMap.area(m, sp.idx, 1)].filter((i) => i !== sp.idx);    // alive() считает существо «не живым», если герой стоит на его клетке
    MapView.devTeleport(near.length ? near[0] : sp.idx, 2);
    MapView.attack(sp);
    return true;
  };
  // закрыть итог боя и вернуться на карту
  A.toMap = async () => {
    const ov = document.getElementById('overlay');
    const btn = ov && ov.querySelector('.to-map'); if (btn) btn.click();
    for (let i = 0; i < 100 && !document.body.classList.contains('mode-map'); i++) await sleep(50);
    return document.body.classList.contains('mode-map');
  };
  // метрики памяти/узлов
  A.dom = () => ({ nodes: document.getElementsByTagName('*').length, intervals: window.__iv ? window.__iv.size : null, timeouts: window.__toPending ? window.__toPending.size : null });
}

// счётчики таймеров — ставится до загрузки страницы
const timerInit = () => {
  window.__iv = new Set(); window.__toPending = new Set();
  const si = window.setInterval, ci = window.clearInterval, st = window.setTimeout, ct = window.clearTimeout;
  window.setInterval = function (...a) { const id = si.apply(this, a); window.__iv.add(id); return id; };
  window.clearInterval = function (id) { window.__iv.delete(id); return ci.call(this, id); };
  window.setTimeout = function (fn, ms, ...rest) { let id; const w = typeof fn === 'function' ? function (...x) { window.__toPending.delete(id); return fn.apply(this, x); } : fn; id = st.call(this, w, ms, ...rest); window.__toPending.add(id); return id; };
  window.clearTimeout = function (id) { window.__toPending.delete(id); return ct.call(this, id); };
};

// Доиграть бой: такты в странице + клики мышью из Node. Возвращает итог.
async function runBattle(p, opts = {}) {
  await p.evaluate((o) => window.__A.begin(o), opts);
  const pace = opts.pace || 25;
  for (;;) {
    const s = await p.evaluate(() => window.__A.tick());
    if (s.done) return s;
    if (s.mouse) for (const q of s.mouse) { await p.mouse.click(q.x, q.y).catch(() => {}); if (q.wait) await p.waitForTimeout(q.wait); }
    await p.waitForTimeout(pace);
  }
}

module.exports = { seedScript, installBot, timerInit, runBattle };
