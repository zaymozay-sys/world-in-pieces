if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Экран карты: отрисовка сот, камера (перетаскивание, колесо, щипок), туман войны,
   перемещение игрока по сотам, монстры и здания деревни, переход в бой и обратно.
   Состояние карты хранится в профиле: Profile.data.map = { seed, pos, revealed, defeated }. */

const MapView = (() => {
  const SIZE = 34;                        // радиус соты в пикселях карты
  const RESPAWN_MS = 4 * 60 * 1000;       // побеждённый монстр возвращается через 4 минуты
  const STEP_MS = 160;                    // время шага по лугу
  const MAX_S = 2.4;

  let map = null, st = null, revealed = null, spawnAt = null;
  const el = {};
  const cam = { x: 0, y: 0, s: 1 };
  let walking = null, stepping = false, battleSpawn = null, hoverIdx = -1, toastTimer = null;
  const fogEls = new Map();

  /* ---------- помощники ---------- */
  const px = (i) => HexMap.toPixel(map.cells[i].q, map.cells[i].r, SIZE);
  // Центр здания на карте — середина всех его сот (у здания из нескольких сот).
  const bCenter = (b) => { const cs = b.cells || [b.idx]; return cs.map(px).reduce((m, q) => ({ x: m.x + q.x / cs.length, y: m.y + q.y / cs.length }), { x: 0, y: 0 }); };
  const hexPts = (x, y, k = 1) => Array.from({ length: 6 }, (_, n) => {
    const a = Math.PI / 180 * (60 * n - 30);
    return `${(x + SIZE * k * Math.cos(a)).toFixed(1)},${(y + SIZE * k * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  const known = (i) => revealed.has(i);
  const alive = (sp) => !(st.defeated[sp.id] > Date.now()) && st.pos !== sp.idx;
  const monsterAt = (i) => { const sp = spawnAt.get(i); return sp && alive(sp) ? sp : null; };
  const blocked = (i) => known(i) && !!monsterAt(i);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tierOfCell = (i) => HexMap.tierAt(map.cells[i].d);
  const fac = () => Factions.get(Profile.data.faction) || Factions.get('dwarf');
  const myKind = () => Factions.heroKind(Profile.data.faction || 'dwarf', Profile.data.gender);
  // Характеристики героя: снаряжение + бонусы фракции.
  const myStats = () => Gear.combine(Gear.combine(Gear.statsFor(Profile.gear(), Profile.level()), Factions.statsAt(Profile.data.faction || 'dwarf', Hero.tierFloat(Profile.level()))), Runes.bonusForGear(Profile.gear()));
  // Герой для оценки опасности: ХП, урон, характеристики.
  const myView = () => { const L = Profile.level(), st = myStats(), t = (typeof testMult === 'function') ? testMult() : 1; return { max: (Hero.baseHp(L) + st.health) * t, dmg: Hero.dmgMult(L) * t, stats: st }; };   // t — тестовый режим ×10

  /* ---------- запуск и сохранение ---------- */
  function init() {
    for (const id of ['map-view', 'map-svg', 'map-defs', 'map-world', 'l-terrain', 'l-roads', 'l-deco', 'l-village', 'l-fog', 'l-hover', 'l-path', 'l-mon', 'l-player', 'map-me', 'map-toast', 'map-tip', 'map-zones', 'map-card']) {
      el[id] = document.getElementById(id);
    }
    el['map-defs'].innerHTML = MapArt.defs();
    el['map-zones'].innerHTML = _t("<span class=\"zl\">Цвет зон:</span>") + Tiers.LIST.map((t) => `<i style="--t:${t.color};--ti:${t.ink}" title="${t.id}: ${t.name}">${t.id}</i>`).join('');
    bindInput();
    bindHud();
    load();
    setMode('map');
    if (!Profile.data.faction) Screens.openFactions(true);
    setInterval(tick, 5000);
  }

  function load() {
    const d = Profile.data;
    if (!d.map || typeof d.map.seed !== 'number') d.map = { seed: (Math.random() * 2147483646 + 1) | 0, pos: null, revealed: [], defeated: {}, ver: 5 };
    if (!d.seen) d.seen = {};
    st = d.map;
    st.defeated = st.defeated || {};
    // Версия 1.1.10: карта выросла (радиус 20, море, маяк) — номера сот сменились, поэтому старое исследование и
    // позиция сбрасываются (герой, вещи и прогресс остаются); весь мир доступен с самого начала, без кнопки «Новый мир».
    if (st.ver !== 5) { st.ver = 5; st.revealed = []; st.defeated = {}; st.pos = null; }
    map = HexMap.generate(st.seed);
    spawnAt = new Map(map.spawns.map((sp) => [sp.idx, sp]));
    const home = HexMap.center(map);
    if (st.pos == null || !map.cells[st.pos] || !HexMap.passable(map, st.pos)) st.pos = home;
    revealed = new Set(st.revealed || []);
    for (const i of HexMap.area(map, home, HexMap.VILLAGE_R + 2)) revealed.add(i);
    walking = null;
    revealAround(st.pos);
    renderStatic();
    renderFog();
    renderMonsters();
    placePlayer(false);
    renderHud();
    requestAnimationFrame(() => { if (view().width < 500) cam.s = 0.8; centerOn(st.pos, false); });
    save();
  }

  function save() {
    st.revealed = [...revealed];
    Profile.save();
  }

  // Прогресс сброшен (новый профиль) — новая карта и снова выбор фракции.
  function reset() {
    if (!map) return;
    load();
    if (!Profile.data.faction) setTimeout(() => Screens.openFactions(true), 50);
  }

  // Фракция выбрана или сменилась: флаги деревни, герой, панель.
  function onFactionChanged() {
    if (!map) return;
    renderStatic();
    refreshPlayerArt();
    renderHud();
    toast(_t("Вы — {0}: {1}", [fac().name, Factions.heroTitle(Profile.data.faction || 'dwarf', Profile.data.gender)]));
  }

  function setMode(mode) {
    document.body.classList.toggle('mode-map', mode === 'map');
    document.body.classList.toggle('mode-battle', mode === 'battle');
  }

  /* ---------- отрисовка ---------- */
  function renderStatic() {
    const terr = [], deco = [], roads = [], vil = [], labels = [];
    for (const c of map.cells) {
      const p = px(c.idx);
      // 1.3.0: маленький город — земля деревни, а главная улица и площадь вокруг Ратуши вымощены
      const paved = c.terrain === 'village' && (c.street || c.d <= 2);
      terr.push(`<polygon class="hx${c.terrain === 'village' ? ' hx-town' : ''}" points="${hexPts(p.x, p.y)}" fill="url(#t-${paved ? 'cobble' : c.terrain})"/>`);
      const d = MapArt.deco(c, HexMap.rng((st.seed ^ Math.imul(c.idx + 1, 2654435761)) >>> 0));
      if (d) deco.push(`<g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">${d}</g>`);
    }

    // дороги и мосты: отрезки между соседними дорожными сотами
    const seg = (a, b) => { const p = px(a), q = px(b); return `M${p.x.toFixed(1)} ${p.y.toFixed(1)} L${q.x.toFixed(1)} ${q.y.toFixed(1)}`; };
    let road = '', bridge = '';
    for (const c of map.cells) {
      if (!c.road) continue;
      for (const n of HexMap.neighbors(map, c.idx)) {
        if (n < c.idx || !map.cells[n].road) continue;
        if (c.bridge || map.cells[n].bridge) bridge += seg(c.idx, n); else road += seg(c.idx, n);
      }
    }
    // улицы деревни: от ворот к площади
    const home = HexMap.center(map);
    let street = '';
    for (const g of map.gates) {
      const c = map.cells[g];
      const mid = map.index.get(HexMap.key(Math.round(c.q / 2), Math.round(c.r / 2)));
      street += seg(g, mid) + seg(mid, home);
    }
    roads.push(`<path d="${street}" class="street" opacity="0"/>`,
      `<path d="${road}" class="road-edge"/><path d="${road}" class="road"/><path d="${road}" class="road-ruts"/>`,
      `<path d="${bridge}" class="bridge-edge"/><path d="${bridge}" class="bridge"/>`);

    // частокол по границе деревни (кроме ворот)
    let fence = '';
    for (const c of map.cells) {
      if (c.d !== HexMap.VILLAGE_R) continue;
      const p = px(c.idx);
      for (const n of HexMap.neighbors(map, c.idx)) {
        const nc = map.cells[n];
        if (nc.d !== HexMap.VILLAGE_R + 1 || (map.gates.includes(c.idx) && nc.road)) continue;
        const q = px(n), ang = Math.atan2(q.y - p.y, q.x - p.x);
        const a1 = ang - Math.PI / 6, a2 = ang + Math.PI / 6, R = SIZE * 0.98;
        fence += `M${(p.x + R * Math.cos(a1)).toFixed(1)} ${(p.y + R * Math.sin(a1)).toFixed(1)} L${(p.x + R * Math.cos(a2)).toFixed(1)} ${(p.y + R * Math.sin(a2)).toFixed(1)}`;
      }
    }
    vil.push(`<path d="${fence}" class="fence-edge"/><path d="${fence}" class="fence"/>`);
    // ворота: башенки по бокам проёма
    for (const g of map.gates) {
      const p = px(g), c = map.cells[g], ang = Math.atan2(p.y, p.x);
      for (const s of [-1, 1]) {
        const a = ang + s * Math.PI / 6, x = p.x + SIZE * Math.cos(a), y = p.y + SIZE * Math.sin(a);
        vil.push(`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><rect x="-4" y="-9" width="8" height="12" fill="#6b4a2b" stroke="#1b1510"/><path d="M-5.5 -9 L0 -15 L5.5 -9Z" fill="#8a3a2a" stroke="#1b1510"/><path d="M0 -15 V-26" stroke="#1b1510" stroke-width="1.2"/><path d="M0 -26 L9 -23 L0 -20Z" fill="${fac().color}" stroke="#1b1510" stroke-width=".7"/></g>`);
      }
      void c;
    }
    // Здания (1.2.6): усадьба занимает несколько сот — под ней мощёный двор, рисунок по центру и крупнее.
    for (const b of map.buildings) {
      const info = HexMap.BUILDINGS[b.id], p = bCenter(b), k = (info.scale || 1.35) / 1.35;
      if ((b.cells || []).length > 1) for (const c of b.cells) { const q = px(c); vil.push(`<polygon points="${hexPts(q.x, q.y, 0.97)}" class="yard"/>`); }
      vil.push(`<g class="bldg" data-b="${b.id}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${k.toFixed(3)})">${MapArt.building(b.id, info.soon)}</g>`);
      labels.push(MapArt.label(info.label || info.name, p.x, p.y + 21 * (k - 1)));
    }

    el['l-terrain'].innerHTML = terr.join('');
    el['l-deco'].innerHTML = deco.join('');
    el['l-roads'].innerHTML = roads.join('');
    el['l-village'].innerHTML = vil.join('') + `<g class="labels">${labels.join('')}</g>`;
  }

  function renderFog() {
    fogEls.clear();
    const out = [];
    for (const c of map.cells) {
      if (known(c.idx)) continue;
      const p = px(c.idx);
      out.push(`<polygon data-i="${c.idx}" points="${hexPts(p.x, p.y, 1.04)}"/>`);
    }
    el['l-fog'].innerHTML = out.join('');
    for (const f of el['l-fog'].children) fogEls.set(Number(f.dataset.i), f);
  }

  function lift(i) {
    const f = fogEls.get(i);
    if (!f) return;
    fogEls.delete(i);
    f.classList.add('lift');
    setTimeout(() => f.remove(), 500);
  }

  function monsterArt(sp) {
    const art = sp.species === 'dragon' ? Figures.avatar('dragon', null) : MonsterArt.bust(sp.species, sp.tier);
    return art.replace('<svg ', '<svg x="-21" y="-21" width="42" height="42" ');
  }

  function renderMonsters() {
    const out = [];
    const now = Date.now();
    for (const sp of map.spawns) {
      if (!known(sp.idx)) continue;
      const p = px(sp.idx), T = Tiers.get(sp.tier), col = T.edge;
      if (!alive(sp)) {
        if (st.defeated[sp.id] > now) {
          out.push(`<g class="bones" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><path d="M-8 -6 L8 6 M8 -6 L-8 6" stroke="#e8dcc0" stroke-width="3" stroke-linecap="round"/><circle cx="0" cy="-2" r="4.5" fill="#e8dcc0" stroke="#3a3228"/></g>`);
        }
        continue;
      }
      out.push(`<g class="mon${sp.boss ? ' boss' : ''}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})${sp.boss ? ' scale(1.25)' : ''}">
        <ellipse cy="18" rx="15" ry="4" fill="#000" opacity=".45"/>
        <g class="bob" style="animation-delay:${-(sp.id % 7) * 0.37}s">
          <circle r="21" fill="#1b1c20"/><g clip-path="url(#clip-token)">${monsterArt(sp)}</g>
          <circle r="21" fill="none" stroke="${col}" stroke-width="3"/>${sp.boss ? `<circle r="25" fill="none" stroke="#f2c94c" stroke-width="2.5" stroke-dasharray="5 3"/><path class="boss-crown" d="M-11 -22 L-7 -31 L-2 -24 L0 -33 L2 -24 L7 -31 L11 -22Z" fill="#f2c94c" stroke="#3a2a08" stroke-width="1.2"/>` : ''}
          <g class="tier-badge" transform="translate(15 14)"><circle r="7.5" fill="${T.color}" stroke="${col}" stroke-width="1.3"/><text y="3.4" fill="${T.ink}">${sp.tier}</text></g>
        </g></g>`);
    }
    el['l-mon'].innerHTML = out.join('');
  }

  function placePlayer(animate, ms = STEP_MS) {
    const g = el['l-player'];
    if (!g.firstChild) {
      const avatar = Figures.avatar(myKind(), Profile.gear()).replace('<svg ', '<svg x="-21" y="-21" width="42" height="42" ');
      g.innerHTML = `<g id="pl"><ellipse cy="19" rx="16" ry="4.5" fill="#000" opacity=".5"/><circle r="28" class="pl-pulse"/>
        <circle r="22" fill="#2f3a52"/><g clip-path="url(#clip-token)">${avatar}</g><circle r="22" fill="none" stroke="#7fa2ff" stroke-width="3.5"/></g>`;
    }
    const pl = g.firstChild, p = px(st.pos);
    pl.style.transition = animate ? `transform ${ms}ms linear` : 'none';
    pl.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
  }
  function refreshPlayerArt() { if (!map) return; el['l-player'].innerHTML = ''; placePlayer(false); }

  function drawPath(path) {
    if (!path || !path.length) { el['l-path'].innerHTML = ''; return; }
    const pts = [st.pos, ...path].map((i) => { const p = px(i); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');
    const g = px(path[path.length - 1]);
    el['l-path'].innerHTML = `<polyline points="${pts}" class="path"/><circle cx="${g.x.toFixed(1)}" cy="${g.y.toFixed(1)}" r="9" class="path-goal"/>`;
  }

  /* ---------- туман войны ---------- */
  // Видно на 3 соты вокруг, с холмов — на 4.
  function revealAround(i) {
    const r = map.cells[i].terrain === 'hills' ? 4 : 3;
    let changed = false;
    for (const n of HexMap.area(map, i, r)) {
      if (revealed.has(n)) continue;
      revealed.add(n);
      changed = true;
      if (fogEls.size) lift(n);
    }
    // встреченные существа попадают в бестиарий
    for (const n of revealed) {
      const sp = spawnAt.get(n);
      if (sp && alive(sp)) {
        const seen = Profile.data.seen;
        if (!(seen[sp.species] >= sp.tier)) seen[sp.species] = sp.tier;
      }
    }
    return changed;
  }

  /* ---------- камера ---------- */
  const view = () => el['map-svg'].getBoundingClientRect();
  function applyCam() {
    el['map-world'].setAttribute('transform', `translate(${cam.x.toFixed(1)} ${cam.y.toFixed(1)}) scale(${cam.s.toFixed(3)})`);
    el['map-svg'].classList.toggle('far', cam.s < 0.62);
  }
  function clampCam() {
    const v = view(), R = HexMap.RADIUS + 1;
    const w = SIZE * Math.sqrt(3) * R * cam.s, h = SIZE * 1.5 * R * cam.s;
    cam.x = Math.min(v.width / 2 + w, Math.max(v.width / 2 - w, cam.x));
    cam.y = Math.min(v.height / 2 + h, Math.max(v.height / 2 - h, cam.y));
  }
  let camAnim = 0;
  function centerOn(i, smooth = true) {
    const v = view(), p = typeof i === 'object' ? i : px(i);   // номер соты или точка карты {x, y}
    const tx = v.width / 2 - p.x * cam.s, ty = v.height / 2 - p.y * cam.s;
    cancelAnimationFrame(camAnim);
    if (!smooth) { cam.x = tx; cam.y = ty; clampCam(); applyCam(); return; }
    const x0 = cam.x, y0 = cam.y, t0 = performance.now();
    const stepFn = (t) => {
      const k = Math.min(1, (t - t0) / 350), e = 1 - Math.pow(1 - k, 3);
      cam.x = x0 + (tx - x0) * e; cam.y = y0 + (ty - y0) * e;
      clampCam(); applyCam();
      if (k < 1) camAnim = requestAnimationFrame(stepFn);
    };
    camAnim = requestAnimationFrame(stepFn);
  }
  // Наименьший масштаб — чтобы вся карта помещалась на экране.
  function minScale() {
    const v = view(), R = HexMap.RADIUS + 1;
    return Math.max(0.15, Math.min(v.width / (SIZE * Math.sqrt(3) * 2 * R), v.height / (SIZE * 3 * R)) * 0.95);
  }
  function zoomAt(sx, sy, factor) {
    const s2 = Math.max(minScale(), Math.min(MAX_S, cam.s * factor));
    const wx = (sx - cam.x) / cam.s, wy = (sy - cam.y) / cam.s;
    cam.s = s2;
    cam.x = sx - wx * s2; cam.y = sy - wy * s2;
    clampCam(); applyCam();
  }
  // Следим за игроком: если он ушёл к краю экрана — плавно подтягиваем камеру.
  function follow() {
    const v = view(), p = px(st.pos);
    const sx = p.x * cam.s + cam.x, sy = p.y * cam.s + cam.y;
    if (sx < v.width * 0.25 || sx > v.width * 0.75 || sy < v.height * 0.25 || sy > v.height * 0.75) centerOn(st.pos);
  }

  /* ---------- ввод ---------- */
  function cellAt(clientX, clientY) {
    const v = view();
    const wx = (clientX - v.left - cam.x) / cam.s, wy = (clientY - v.top - cam.y) / cam.s;
    const h = HexMap.fromPixel(wx, wy, SIZE);
    const i = map.index.get(HexMap.key(h.q, h.r));
    // Рисунок здания выше своей соты (крыша, труба, флаг заходят на соту сверху). Клик по любой видимой части
    // здания должен открывать само здание, а не вести героя на соседнюю пустую соту (так «не входилось»
    // в Кузницу и к Охотникам). Рамка рисунка — как в MapArt.building: x ±30, y от −40 до +19 от центра соты.
    if (i === undefined || (!map.cells[i].building && !map.cells[i].street && !monsterAt(i))) {
      for (const b of map.buildings) {    // рамка растёт вместе с рисунком (scale здания), центр — середина его сот
        const p = bCenter(b), k = (HexMap.BUILDINGS[b.id].scale || 1.35) / 1.35;
        if (Math.abs(wx - p.x) <= 26 * k && wy - p.y >= -40 * k && wy - p.y <= 4 * k) return b.idx;   // 1.2.9: только крыша, не ряд под зданием
      }
    }
    return i === undefined ? -1 : i;
  }

  function bindInput() {
    const svg = el['map-svg'];
    const pointers = new Map();
    let drag = null, pinch = null;

    svg.addEventListener('pointerdown', (e) => {
      svg.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: cam.s };
        if (drag) drag.moved = true;
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse') hover(cellAt(e.clientX, e.clientY));
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()], v = view();
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((a.x + b.x) / 2 - v.left, (a.y + b.y) / 2 - v.top, (pinch.s * d / pinch.d) / cam.s);
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 7) drag.moved = true;
      if (drag.moved) {
        cam.x = drag.cx + dx; cam.y = drag.cy + dy;
        clampCam(); applyCam();
        svg.classList.add('dragging');
      }
    });
    const up = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      svg.classList.remove('dragging');
      if (pointers.size === 1) {
        const [p] = [...pointers.values()];
        drag = { x: p.x, y: p.y, cx: cam.x, cy: cam.y, moved: true };
        pinch = null;
        return;
      }
      if (pointers.size === 0) {
        if (drag && !drag.moved && e.type === 'pointerup') tap(cellAt(e.clientX, e.clientY));
        drag = null; pinch = null;
      }
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('pointerleave', () => hover(-1));
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = view();
      zoomAt(e.clientX - v.left, e.clientY - v.top, Math.pow(1.0015, -e.deltaY));
    }, { passive: false });
    window.addEventListener('resize', () => { if (document.body.classList.contains('mode-map')) { clampCam(); applyCam(); } });
    document.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('mode-map') || Screens.isOpen || Inventory.isOpen) return;
      if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const v = view();
      if (e.key === 'Escape') closeCard();
      if (e.key === '+' || e.key === '=') zoomAt(v.width / 2, v.height / 2, 1.2);
      if (e.key === '-') zoomAt(v.width / 2, v.height / 2, 1 / 1.2);
    });
  }

  // 1.3.1: при наведении на здание светится контур самого здания (рисунок), а не сота под ним.
  function hover(i) {
    if (i === hoverIdx) return;
    hoverIdx = i;
    const lit = el['l-village'].querySelector('.bldg.lit');
    if (lit) lit.classList.remove('lit');
    el['map-svg'].classList.remove('over-bldg');
    if (i < 0) { el['l-hover'].innerHTML = ''; return; }
    const bid = map.cells[i].building;
    if (bid && !monsterAt(i)) {
      const g = el['l-village'].querySelector(`.bldg[data-b="${bid}"]`);
      if (g) { g.classList.add('lit'); el['map-svg'].classList.add('over-bldg'); }
      el['l-hover'].innerHTML = '';
      const info = HexMap.BUILDINGS[bid];
      el['map-tip'].innerHTML = _t("<b>{0}</b> — {1} Нажмите, чтобы войти.", [info.name, info.desc]);
      return;
    }
    const p = px(i);
    el['l-hover'].innerHTML = `<polygon points="${hexPts(p.x, p.y, 0.94)}" class="hover-hex"/>`;
    el['map-tip'].innerHTML = describe(i);
  }

  function describe(i) {
    if (!known(i)) return _t("Неизведанная земля");
    const t = tierOfCell(i), sp = monsterAt(i);
    const zone = t ? _t(" · зона <b style=\"color:{0}\">{1}</b>", [Tiers.get(t).edge, Tiers.get(t).name]) : '';
    if (sp) return `<b>${Bestiary.MONSTERS[sp.species].name}</b> ${tierChip(sp.tier)}${zone}`;
    const s = spawnAt.get(i);
    if (s && st.defeated[s.id] > Date.now()) return _t("{0} · {1} вернётся через {2} мин.{3}", [HexMap.terrainName(map, i), Bestiary.MONSTERS[s.species].name, Math.ceil((st.defeated[s.id] - Date.now()) / 60000), zone]);
    return `${HexMap.terrainName(map, i)}${zone}`;
  }

  function tap(i) {
    if (i < 0) return;
    closeCard();
    el['map-tip'].innerHTML = describe(i);
    const sp = known(i) ? monsterAt(i) : null;
    if (sp) return showMonster(sp);
    if (i === st.pos) return Inventory.open('left');   // 1.3.6: нажатие на своего героя — карточка героя и рюкзак
    const c = map.cells[i];
    if (c.building) return goBuilding(c.building, i);
    if (known(i) && !HexMap.passable(map, i)) return toast(_t("{0}: сюда не пройти", [HexMap.terrainName(map, i)]));
    if (i === st.pos) return;
    walkTo(i);
  }

  /* ---------- ходьба ---------- */
  function walkTo(goal, onArrive, adjacent = false) {
    walking = { goal, onArrive, adjacent };
    if (!stepping) stepLoop();
  }

  async function stepLoop() {
    stepping = true;
    while (walking) {
      const w = walking;
      const arrived = w.adjacent ? HexMap.dist(map.cells[st.pos], map.cells[w.goal]) <= 1 : st.pos === w.goal;
      if (arrived) {
        walking = null;
        drawPath(null);
        if (w.onArrive) w.onArrive();
        break;
      }
      const path = HexMap.findPath(map, st.pos, w.goal, known, blocked);
      const stopAt = path && w.adjacent ? path.slice(0, -1) : path;
      if (!path || (!stopAt.length && !w.adjacent)) {
        walking = null;
        drawPath(null);
        toast(known(w.goal) ? _t("{0}: туда нет пути", [HexMap.terrainName(map, w.goal)]) : _t("Дальше не пройти"));
        break;
      }
      drawPath(stopAt);
      const next = path[0];
      const ms = Math.round(Math.max(90, Math.min(460, STEP_MS * HexMap.moveCost(map, next))));
      st.pos = next;
      placePlayer(true, ms);
      if (revealAround(next)) renderMonsters();
      follow();
      await sleep(ms);
    }
    stepping = false;
    renderHud();
    save();
  }

  /* ---------- здания ---------- */
  // Здание из нескольких сот: если герой уже на любой из них — сразу внутрь, иначе идёт к ближайшей.
  function goBuilding(id, i) {
    const open = () => openBuilding(id);
    const b = map.buildings.find((x) => x.id === id), own = (b && b.cells) || [i];
    if (own.includes(st.pos)) return open();
    const near = own.reduce((m, c) => (HexMap.dist(map.cells[st.pos], map.cells[c]) < HexMap.dist(map.cells[st.pos], map.cells[m]) ? c : m), own[0]);
    walkTo(near, open);
  }

  function openBuilding(id) {
    const b = HexMap.BUILDINGS[id];
    if (b.soon) return toast(`${b.name}: ${b.desc}`);
    if (!Unlocks.isOpen(Profile.data, id)) return toast(Unlocks.reason(Profile.data, id));
    if (id === 'shop') return Screens.openShop();
    if (id === 'forge') return Screens.openForge();
    if (id === 'hunter') return Screens.openBestiary();
    if (id === 'home') return Inventory.open('left', { armory: true });
    if (id === 'hall') return showHall();
    if (id === 'tavern') return Screens.openTavern();
    if (id === 'mill') return Screens.openMill();
    if (id === 'junker') return Screens.openJunker();
    if (id === 'library') return Screens.openLibrary();
    if (id === 'artistWorkshop') return Screens.openArtistWorkshop();
    if (id === 'lighthouse') return openLighthouse();
    if (id === 'wreck') return Screens.openWreck();
    if (id === 'chest') return Screens.openChest('sapphire');
    if (id === 'chestRuby') return Screens.openChest('ruby');
    if (id === 'chestEmerald') return Screens.openChest('emerald');
    if (id === 'chestObsidian') return Screens.openChest('obsidian');
    if (id === 'kennel' || id === 'alchemist') return Screens.open(id);
  }

  // Маяк: смотритель зажигает огонь — открывается карта вокруг побережья (радиус 6), затем открывается его окно.
  function openLighthouse() {
    const b = map.buildings.find((x) => x.id === 'lighthouse');
    if (b) {
      let added = 0;
      for (const i of HexMap.area(map, b.idx, 6)) if (!revealed.has(i)) { revealed.add(i); added++; }
      if (added) { renderFog(); renderMonsters(); save(); toast(_t("Луч маяка осветил берег")); }
    }
    Screens.openLighthouse();
  }

  function showHall() {
    const explored = Math.round(revealed.size / map.cells.length * 100);
    const aliveCount = map.spawns.filter((sp) => alive(sp)).length;
    el['map-card'].innerHTML = _t("<div class=\"map-card\"><div class=\"mc-body\">\n      <b class=\"mc-title\">Ратуша</b><p class=\"hint\">{0} На площади у Ратуши — Торговые ряды: здесь выставляют объявления о продаже.</p>\n      <div class=\"stat-list\"><div><span>Уровень</span><b>{1}</b><small>опыт {2} / {3}</small></div>\n      <div><span>Побед</span><b>{4}</b><small>всего</small></div>\n      <div><span>Исследовано</span><b>{5}%</b><small>карты</small></div>\n      <div><span>Существ</span><b>{6}</b><small>сейчас на карте</small></div></div>\n      <p class=\"hint\">Чем дальше от деревни, тем выше цвет существ и богаче добыча.</p>\n      <div class=\"fac-row\">{7}<span>Ваша фракция: <b>{8}</b> ({9})</span></div>\n      <p class=\"hint\">Сохранение хранится в этом браузере. Чтобы перенести персонажа на другое устройство или в другой браузер — скачайте файл сохранения, а там загрузите его обратно.</p>\n      <div class=\"mc-act\">\n        <button type=\"button\" class=\"primary\" data-act=\"market\">Торговые ряды</button>\n        <button type=\"button\" data-act=\"faction\">Сменить фракцию</button>\n        <button type=\"button\" data-act=\"export-save\">Скачать сохранение</button>\n        <button type=\"button\" data-act=\"import-save\">Загрузить сохранение</button>\n        <button type=\"button\" data-act=\"close\">Закрыть</button>\n      </div>\n      <input type=\"file\" id=\"hall-import-input\" accept=\".json,application/json\" hidden></div></div>", [HexMap.BUILDINGS.hall.desc, Profile.level(), Profile.levelInfo().into, Profile.levelInfo().need === Infinity ? '—' : Profile.levelInfo().need, Profile.data.wins, explored, aliveCount, factionIcon(Profile.data.faction || 'dwarf', 'mini-emblem'), fac().name, fac().people]);
  }

  // Скачивание сохранения. На обычном сайте (GitHub Pages и т.п.) — обычная ссылка-скачивание через blob.
  // Внутри предпросмотра на claude.ai обычная ссылка не срабатывает — там используется capability «downloads».
  async function exportSave() {
    const json = Profile.exportSave();
    const stamp = new Date().toISOString().slice(0, 10);
    const nick = (Profile.data.name || 'save').trim().replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'save';
    const filename = `hrupkiy-mir-${nick}-${stamp}.json`;
    if (typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function') {
      let downloads = null;
      try { downloads = await window.claude.use('downloads'); } catch (e) { downloads = null; }
      if (!downloads) { toast(_t("Скачивание здесь недоступно")); return; }
      try {
        await downloads.save({ filename, data: json });
        toast(_t("Сохранение скачано"));
      } catch (e) {
        if (!e || e.code !== 'declined') toast(_t("Не удалось скачать сохранение"));
      }
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(_t("Сохранение скачано"));
  }

  function importSaveFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const ok = Profile.importSave(String(reader.result));
      if (!ok) { toast(_t("Не похоже на файл сохранения «Хрупкого мира»")); return; }
      closeCard();
      toast(_t("Сохранение загружено"));
      reset();
    };
    reader.onerror = () => toast(_t("Не удалось прочитать файл"));
    reader.readAsText(file);
  }

  /* ---------- монстры и бой ---------- */
  // Оценка опасности: модель шанса победы «среднего» игрока (combat.js, числа — balance.js, обучена на симуляторе).
  const DANGER = { easy: [_t("Лёгкий"), '#6ecb7a'], even: [_t("Равный"), '#e0c85a'], hard: [_t("Опасный"), '#f0913a'], deadly: [_t("Смертельный"), '#ff5d5d'] };
  const spawnScaled = (sp) => { const sc = Bestiary.scaled(sp.species, sp.tier); return sp.boss ? Story.scaleBoss(sc, sp.boss) : sc; };
  function danger(sp) {
    const sc = spawnScaled(sp);
    const p = Combat.winChance(myView(), { max: sc.hp, dmg: sc.dmg, stats: sc.stats, ai: sc.ai }, sp.species);
    return [...DANGER[Combat.dangerBand(p)], p];
  }

  function showMonster(sp) {
    const m = Bestiary.MONSTERS[sp.species], sc = spawnScaled(sp), col = Tiers.get(sp.tier).edge;
    const [dz, dcol, p] = danger(sp);
    const ch = sp.boss && Story.BY_ID[sp.boss], story = Profile.data.story || {};
    const locked = ch && ch.final && !Story.finalOpen(story);
    const bossNote = ch ? _t("<p class=\"hint boss-note\">👑 <b>Страж осколка</b>: {0} {1}{2}</p>", [ch.lore, story.shards && story.shards[ch.id] ? _t("Осколок уже у вас — страж даёт двойные монеты.") : _t("За первую победу — осколок Великого Сердца и большая награда."), locked ? _t(" <b class=\"warn\">Спит, пока не собраны 4 осколка ({0}/4).</b>", [Story.shards(story)]) : '']) : '';
    const xp = Hero.xpReward(m, sp.tier, Profile.level());
    const abil = Object.entries(sc.stats).filter(([, v]) => v > 0).map(([k, v]) => `<span class="chip">${fmtStat(k, v)}</span>`).join('');
    const drops = m.drops.map(([kind]) => MonsterArt.resIcon(kind, sp.tier)).join('');
    const near = HexMap.dist(map.cells[st.pos], map.cells[sp.idx]) <= 1;
    const art = sp.species === 'dragon' ? `<div class="dragon-art sm" style="--t:${col}">${Figures.avatar('dragon', null)}</div>` : MonsterArt.bust(sp.species, sp.tier);
    el['map-card'].innerHTML = _t("<div class=\"map-card\" style=\"--t:{0}\">\n      <div class=\"mc-art\">{1}</div>\n      <div class=\"mc-body\">\n        <b class=\"mc-title\">{2}</b> {3} <span class=\"danger\" style=\"--d:{4}\" title=\"Примерный шанс победы: {5}%\">{6} · ~{7}%</span>\n        <div class=\"mc-ability\">{8}{9} · приём <b>{10}</b>: {11}</div>\n        <p class=\"hint\">{12}</p>{13}\n        <div class=\"chips\"><span class=\"chip\">ХП {14}</span><span class=\"chip\">ИИ {15}</span>{16}</div>\n        <div class=\"mc-drops\"><span class=\"hint\">Добыча:</span>{17}<span class=\"hint\">монеты ~{18} · опыт +{19}</span></div>\n        <div class=\"mc-act\"><button type=\"button\" class=\"primary\" data-act=\"attack\" data-sp=\"{20}\" {21}>{22}</button><button type=\"button\" data-act=\"close\">Закрыть</button></div>\n      </div></div>", [col, art, sp.boss ? Story.bossName(sp.boss, m.name) : m.name, tierChip(sp.tier), dcol, Math.round(p * 100), dz, Math.round(p * 10) * 10, m.family, m.boss ? _t(" · босс") : '', Bestiary.ability(sp.species).name, Bestiary.ability(sp.species).desc, m.desc, bossNote, sc.hp, sc.ai, abil, drops, Tiers.moneyText(Math.round(m.coins * Tiers.PRICE_MULT[sp.tier - 1])), xp, sp.id, locked ? 'disabled' : '', near ? _t("В бой!") : _t("Подойти и напасть")]);
  }

  function closeCard() { el['map-card'].innerHTML = ''; }

  function attack(sp) {
    closeCard();
    if (!alive(sp)) return;
    if (sp.boss && Story.BY_ID[sp.boss].final && !Story.finalOpen(Profile.data.story)) return toast(_t("Древний дракон спит: сначала соберите 4 осколка Сердца"));
    if (HexMap.dist(map.cells[st.pos], map.cells[sp.idx]) <= 1) return startFight(sp);
    walkTo(sp.idx, () => startFight(sp), true);
  }

  function startFight(sp) {
    walking = null;
    battleSpawn = sp;
    st.swarm = st.swarm || {};
    if (Bestiary.MONSTERS[sp.species].swarm && !st.swarm[sp.id]) st.swarm[sp.id] = Bestiary.rollSwarmSize(sp.species, Math.random);
    Profile.data.monster = { id: sp.species, tier: Math.min(sp.tier, Hero.tierFor(Profile.level()) + 1), swarm: st.swarm[sp.id] || 1, boss: sp.boss || null };   // рой не перебрасывается отступлением
    save();
    setMode('battle');
    enterBattle();
    startBattle();
  }

  // Учебный бой с бобром-хранителем (см. Screens.library): не привязан к конкретному существу на карте,
  // поэтому просто выставляет лёгкого противника и запускает бой тем же путём, что и startFight (без sp —
  // returnFromBattle не начисляет respawn/добычу зоны, что и требуется для тренировки).
  function startTraining(monsterId, tier, extra) {
    closeCard();
    walking = null;
    battleSpawn = null;
    Profile.data.monster = Object.assign({ id: monsterId, tier }, extra || {});
    save();
    setMode('battle');
    enterBattle();
    startBattle();
  }

  // Вызывается из боя: result — 'win', 'loss' или 'flee'.
  function returnFromBattle(result) {
    const sp = battleSpawn;
    battleSpawn = null;
    leaveBattle();
    setMode('map');
    if (result === 'win' && sp) {
      st.defeated[sp.id] = Date.now() + RESPAWN_MS;
      if (st.swarm) delete st.swarm[sp.id];
      toast(_t("{0} повержен. Существо вернётся через {1} мин.", [Bestiary.MONSTERS[sp.species].name, RESPAWN_MS / 60000]));
    } else if (result === 'win') {
      // Учебный бой (см. startTraining) — sp всегда null, своя реплика вместо «Вы отступили».
      toast(Profile.data.monster && Profile.data.monster.deep ? _t("Щука побеждена! Сундук ваш") : _t("Учебный бой выигран!"));
    } else if (result === 'loss') {
      st.pos = HexMap.center(map);
      revealAround(st.pos);
      toast(_t("Вы проиграли и очнулись в деревне"));
    } else {
      toast(_t("Вы отступили"));
    }
    refreshPlayerArt();
    renderMonsters();
    renderHud();
    marketNews();
    requestAnimationFrame(() => centerOn(st.pos, false));
    save();
    if (typeof Tutorial !== 'undefined') Tutorial.event('map');
  }

  // Обучение (js/tutorial.js): камера к зданию и пульсирующее кольцо вокруг него; null — убрать кольцо.
  function coachRing(id) {
    const old = el['l-village'] && el['l-village'].querySelector('.coach-ring');
    if (old) old.remove();
    if (!id || !map) return;
    const b = map.buildings.find((x) => x.id === id);
    if (!b) return;
    const p = bCenter(b), k = (HexMap.BUILDINGS[id].scale || 1.35) / 1.35;
    el['l-village'].insertAdjacentHTML('beforeend', `<circle class="coach-ring" cx="${p.x.toFixed(1)}" cy="${(p.y - 10 * k).toFixed(1)}" r="${(34 * k).toFixed(1)}"/>`);
    centerOn(p);
  }

  // Летопись Бобра: показать стража осколка на карте (если место уже открыто) или подсказать направление.
  function focusBoss(id) {
    const sp = map.spawns.find((x) => x.boss === id), ch = Story.BY_ID[id];
    if (!sp) return toast(`${ch.title}: ${ch.where}`);
    if (!known(sp.idx)) { centerOn(sp.idx); return toast(_t("{0} где-то здесь, {1} — подойдите ближе, туман скрывает", [ch.title, ch.where])); }
    centerOn(sp.idx);
    if (alive(sp)) showMonster(sp); else toast(_t("{0} повержен и вернётся позже", [ch.title]));
  }

  // Торговые ряды: купцы могли купить лоты, пока вы были в бою или вне игры.
  function marketNews() {
    const sold = Profile.marketTick ? Profile.marketTick() : [];
    if (sold.length) setTimeout(() => toast(_t("Торговые ряды: продано {0} — деньги уже у вас", [sold.length === 1 ? sold[0].name : sold.length + _t(" лота")])), 1200);
    renderHud();
  }

  /* ---------- интерфейс поверх карты ---------- */
  // Закрытые здания затемнены; новое открытое — сообщение. Первый запуск у старого героя — молча.
  function refreshLocks() {
    if (!map) return;
    const d = Profile.data, open = Unlocks.openIds(d), first = !d.unlockSeen;
    d.unlockSeen = d.unlockSeen || [];
    const fresh = open.filter((id) => !d.unlockSeen.includes(id));
    if (fresh.length) { d.unlockSeen.push(...fresh); if (!first) toast(_t("Открыто: ") + fresh.map((id) => Unlocks.hint(id)).join('; ')); save(); }
    for (const id of Object.keys(Unlocks.NEED)) { const g = el['l-village'] && el['l-village'].querySelector(`.bldg[data-b="${id}"]`); if (g) g.classList.toggle('locked', !Unlocks.isOpen(d, id)); }
    const gs = document.getElementById('goal-strip');
    if (gs) gs.textContent = Unlocks.goal(d, Quests.list(d));
  }

  function renderHud() {
    if (!map || !el['map-me']) return;
    refreshLocks();
    const me = myView(), F = fac(), lv = Profile.levelInfo();
    const pct = lv.need === Infinity ? 100 : Math.round(lv.into / lv.need * 100);
    el['map-me'].innerHTML = _t("<span class=\"me-av\" style=\"border-color:{0}\">{1}<i class=\"me-lvl\">{2}</i></span>\n      <span class=\"me-txt\"><b>{3}</b><small class=\"me-fac\">{4}{5} · ур. {6}</small>\n        <span class=\"xpbar\" title=\"Опыт: {7} / {8}\"><i style=\"width:{9}%\"></i></span>\n        <small>ХП {10} · побед {11}</small>{12}</span>", [F.color, Figures.avatar(myKind(), Profile.gear()), lv.level, escText(Profile.data.name) || Factions.heroTitle(Profile.data.faction || 'dwarf', Profile.data.gender), factionIcon(Profile.data.faction || 'dwarf', 'mini-emblem'), F.name, lv.level, lv.into, lv.need === Infinity ? _t("максимум") : lv.need, pct, me.max, Profile.data.wins, MonsterArt.moneyHtml(Profile.data.coins)]);
  }

  function toast(text) {
    const t = el['map-toast'];
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function bindHud() {
    const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    on('m-gear', () => Inventory.open('left'));
    el['map-me'].style.cursor = 'pointer'; el['map-me'].addEventListener('click', () => Inventory.open('left'));
    on('m-best', () => Screens.openBestiary());
    on('m-mute', () => { Sound.setMuted(!Sound.muted); renderMute(); muteLabel(); });
    on('m-fs', () => toggleFullscreen());
    on('m-help', () => Screens.open('help'));
    on('m-lang', () => I18N.setLang(I18N.lang === 'ru' ? 'en' : 'ru'));
    document.getElementById('m-lang').textContent = I18N.lang === 'ru' ? 'EN' : 'RU';   // кнопка показывает язык, на который переключит
    on('m-credits', () => Screens.openCredits());
    on('m-zin', () => { const v = view(); zoomAt(v.width / 2, v.height / 2, 1.25); });
    on('m-zout', () => { const v = view(); zoomAt(v.width / 2, v.height / 2, 1 / 1.25); });
    on('m-me', () => centerOn(st.pos));
    on('m-home', () => { const h = HexMap.center(map); if (st.pos === h) toast(_t("Вы уже в деревне")); else walkTo(h, () => toast(_t("Вы в деревне"))); });
    el['map-card'].addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'close') closeCard();
      if (b.dataset.act === 'faction') { closeCard(); Screens.openFactions(false); }
      if (b.dataset.act === 'market') { closeCard(); Screens.open('market'); }
      if (b.dataset.act === 'attack') attack(map.spawns[Number(b.dataset.sp)]);
      if (b.dataset.act === 'export-save') exportSave();
      if (b.dataset.act === 'import-save') { const inp = document.getElementById('hall-import-input'); if (inp) inp.click(); }
    });
    el['map-card'].addEventListener('change', (e) => {
      const inp = e.target.closest('#hall-import-input');
      if (!inp || !inp.files || !inp.files[0]) return;
      importSaveFile(inp.files[0]);
    });
    const muteLabel = () => { document.getElementById('m-mute').textContent = Sound.muted ? _t("Звук: выкл") : _t("Звук: вкл"); };
    muteLabel();
  }

  // Раз в несколько секунд: вернулись ли побеждённые существа.
  function tick() {
    if (!map) return;
    let changed = false;
    for (const [id, t] of Object.entries(st.defeated)) {
      if (t <= Date.now()) { delete st.defeated[id]; changed = true; }
    }
    if (changed && document.body.classList.contains('mode-map')) { renderMonsters(); revealAround(st.pos); save(); }
  }

  // Бестиарий: «Показать на карте» — ближайшее открытое живое существо вида.
  function focusSpecies(species) {
    const cands = map.spawns.filter((sp) => sp.species === species && known(sp.idx) && alive(sp));
    if (!cands.length) { toast(_t("Сейчас на открытой части карты таких существ нет")); return false; }
    cands.sort((a, b) => HexMap.dist(map.cells[st.pos], map.cells[a.idx]) - HexMap.dist(map.cells[st.pos], map.cells[b.idx]));
    centerOn(cands[0].idx);
    showMonster(cands[0]);
    return true;
  }

  return {
    init, reset, returnFromBattle, focusSpecies, renderHud, refreshPlayerArt, onFactionChanged, startTraining, coachRing, toast,
    get inBattle() { return !!battleSpawn; }, marketNews, focusBoss,
    // для тестов
    get state() { return st; }, get map() { return map; }, known, alive, walkTo, tap, attack,
  };
})();
