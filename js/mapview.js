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
  const myStats = () => Gear.combine(Gear.stats(Profile.gear()), Factions.statsAt(Profile.data.faction || 'dwarf', Hero.tierFloat(Profile.level())));
  // Герой для оценки опасности: ХП, урон, характеристики.
  const myView = () => { const L = Profile.level(), st = myStats(); return { max: Hero.baseHp(L) + st.health, dmg: Hero.dmgMult(L), stats: st }; };

  /* ---------- запуск и сохранение ---------- */
  function init() {
    for (const id of ['map-view', 'map-svg', 'map-defs', 'map-world', 'l-terrain', 'l-roads', 'l-deco', 'l-village', 'l-fog', 'l-hover', 'l-path', 'l-mon', 'l-player', 'map-me', 'map-toast', 'map-tip', 'map-zones', 'map-card']) {
      el[id] = document.getElementById(id);
    }
    el['map-defs'].innerHTML = MapArt.defs();
    el['map-zones'].innerHTML = `<span class="zl">Цвет зон:</span>` + Tiers.LIST.map((t) => `<i style="--t:${t.color};--ti:${t.ink}" title="${t.id}: ${t.name}">${t.id}</i>`).join('');
    bindInput();
    bindHud();
    load();
    setMode('map');
    if (!Profile.data.faction) Screens.openFactions(true);
    setInterval(tick, 5000);
  }

  function load() {
    const d = Profile.data;
    if (!d.map || typeof d.map.seed !== 'number') d.map = { seed: (Math.random() * 2147483646 + 1) | 0, pos: null, revealed: [], defeated: {} };
    if (!d.seen) d.seen = {};
    st = d.map;
    st.defeated = st.defeated || {};
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
    toast(`Вы — ${fac().name}: ${Factions.heroTitle(Profile.data.faction || 'dwarf', Profile.data.gender)}`);
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
      terr.push(`<polygon class="hx" points="${hexPts(p.x, p.y)}" fill="url(#t-${c.terrain})"/>`);
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
      const mid = map.index.get(HexMap.key(c.q / 2, c.r / 2));
      street += seg(g, mid) + seg(mid, home);
    }
    roads.push(`<path d="${street}" class="street"/>`,
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
    for (const b of map.buildings) {
      const p = px(b.idx), info = HexMap.BUILDINGS[b.id];
vil.push(`<g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">${MapArt.building(b.id, info.soon)}</g>`);
      labels.push(MapArt.label(info.label || info.name, p.x, p.y));
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
      out.push(`<g class="mon" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">
        <ellipse cy="18" rx="15" ry="4" fill="#000" opacity=".45"/>
        <g class="bob" style="animation-delay:${-(sp.id % 7) * 0.37}s">
          <circle r="21" fill="#1b1c20"/><g clip-path="url(#clip-token)">${monsterArt(sp)}</g>
          <circle r="21" fill="none" stroke="${col}" stroke-width="3"/>
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
    const v = view(), p = px(i);
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

  function hover(i) {
    if (i === hoverIdx) return;
    hoverIdx = i;
    if (i < 0) { el['l-hover'].innerHTML = ''; return; }
    const p = px(i);
    el['l-hover'].innerHTML = `<polygon points="${hexPts(p.x, p.y, 0.94)}" class="hover-hex"/>`;
    el['map-tip'].innerHTML = describe(i);
  }

  function describe(i) {
    if (!known(i)) return 'Неизведанная земля';
    const t = tierOfCell(i), sp = monsterAt(i);
    const zone = t ? ` · зона <b style="color:${Tiers.get(t).edge}">${Tiers.get(t).name}</b>` : '';
    if (sp) return `<b>${Bestiary.MONSTERS[sp.species].name}</b> ${tierChip(sp.tier)}${zone}`;
    const s = spawnAt.get(i);
    if (s && st.defeated[s.id] > Date.now()) return `${HexMap.terrainName(map, i)} · ${Bestiary.MONSTERS[s.species].name} вернётся через ${Math.ceil((st.defeated[s.id] - Date.now()) / 60000)} мин.${zone}`;
    return `${HexMap.terrainName(map, i)}${zone}`;
  }

  function tap(i) {
    if (i < 0) return;
    closeCard();
    el['map-tip'].innerHTML = describe(i);
    const sp = known(i) ? monsterAt(i) : null;
    if (sp) return showMonster(sp);
    const c = map.cells[i];
    if (c.building) return goBuilding(c.building, i);
    if (known(i) && !HexMap.passable(map, i)) return toast(`${HexMap.terrainName(map, i)}: сюда не пройти`);
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
        toast(known(w.goal) ? `${HexMap.terrainName(map, w.goal)}: туда нет пути` : 'Дальше не пройти');
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
  function goBuilding(id, i) {
    const open = () => openBuilding(id);
    if (st.pos === i) return open();
    walkTo(i, open);
  }

  function openBuilding(id) {
    const b = HexMap.BUILDINGS[id];
    if (b.soon) return toast(`${b.name}: ${b.desc}`);
    if (id === 'shop') return Screens.openShop();
    if (id === 'forge') return Screens.openForge();
    if (id === 'hunter') return Screens.openBestiary();
    if (id === 'home') return Inventory.open('left');
    if (id === 'hall') return showHall();
    if (id === 'tavern') return Screens.openTavern();
    if (id === 'mill') return Screens.openMill();
  }

  function showHall() {
    const explored = Math.round(revealed.size / map.cells.length * 100);
    const aliveCount = map.spawns.filter((sp) => alive(sp)).length;
    el['map-card'].innerHTML = `<div class="map-card"><div class="mc-body">
      <b class="mc-title">Ратуша</b><p class="hint">${HexMap.BUILDINGS.hall.desc}</p>
      <div class="stat-list"><div><span>Уровень</span><b>${Profile.level()}</b><small>опыт ${Profile.levelInfo().into} / ${Profile.levelInfo().need === Infinity ? '—' : Profile.levelInfo().need}</small></div>
      <div><span>Побед</span><b>${Profile.data.wins}</b><small>всего</small></div>
      <div><span>Исследовано</span><b>${explored}%</b><small>карты</small></div>
      <div><span>Существ</span><b>${aliveCount}</b><small>сейчас на карте</small></div></div>
      <p class="hint">Чем дальше от деревни, тем выше цвет существ и богаче добыча.</p>
      <div class="fac-row">${factionIcon(Profile.data.faction || 'dwarf', 'mini-emblem')}<span>Ваша фракция: <b>${fac().name}</b> (${fac().people})</span></div>
      <p class="hint">Сохранение хранится в этом браузере. Чтобы перенести персонажа на другое устройство или в другой браузер — скачайте файл сохранения, а там загрузите его обратно.</p>
      <div class="mc-act">
        <button type="button" data-act="faction">Сменить фракцию</button>
        <button type="button" data-act="export-save">Скачать сохранение</button>
        <button type="button" data-act="import-save">Загрузить сохранение</button>
        <button type="button" data-act="close">Закрыть</button>
      </div>
      <input type="file" id="hall-import-input" accept=".json,application/json" hidden></div></div>`;
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
      if (!downloads) { toast('Скачивание здесь недоступно'); return; }
      try {
        await downloads.save({ filename, data: json });
        toast('Сохранение скачано');
      } catch (e) {
        if (!e || e.code !== 'declined') toast('Не удалось скачать сохранение');
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
    toast('Сохранение скачано');
  }

  function importSaveFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const ok = Profile.importSave(String(reader.result));
      if (!ok) { toast('Не похоже на файл сохранения «Хрупкого мира»'); return; }
      closeCard();
      toast('Сохранение загружено');
      reset();
    };
    reader.onerror = () => toast('Не удалось прочитать файл');
    reader.readAsText(file);
  }

  /* ---------- монстры и бой ---------- */
  // Оценка опасности: модель шанса победы «среднего» игрока (combat.js, числа — balance.js, обучена на симуляторе).
  const DANGER = { easy: ['Лёгкий', '#6ecb7a'], even: ['Равный', '#e0c85a'], hard: ['Опасный', '#f0913a'], deadly: ['Смертельный', '#ff5d5d'] };
  function danger(sp) {
    const sc = Bestiary.scaled(sp.species, sp.tier);
    const p = Combat.winChance(myView(), { max: sc.hp, dmg: sc.dmg, stats: sc.stats, ai: sc.ai }, sp.species);
    return [...DANGER[Combat.dangerBand(p)], p];
  }

  function showMonster(sp) {
    const m = Bestiary.MONSTERS[sp.species], sc = Bestiary.scaled(sp.species, sp.tier), col = Tiers.get(sp.tier).edge;
    const [dz, dcol, p] = danger(sp);
    const xp = Hero.xpReward(m, sp.tier, Profile.level());
    const abil = Object.entries(sc.stats).filter(([, v]) => v > 0).map(([k, v]) => `<span class="chip">${fmtStat(k, v)}</span>`).join('');
    const drops = m.drops.map(([kind]) => MonsterArt.resIcon(kind, sp.tier)).join('');
    const near = HexMap.dist(map.cells[st.pos], map.cells[sp.idx]) <= 1;
    const art = sp.species === 'dragon' ? `<div class="dragon-art sm" style="--t:${col}">${Figures.avatar('dragon', null)}</div>` : MonsterArt.bust(sp.species, sp.tier);
    el['map-card'].innerHTML = `<div class="map-card" style="--t:${col}">
      <div class="mc-art">${art}</div>
      <div class="mc-body">
        <b class="mc-title">${m.name}</b> ${tierChip(sp.tier)} <span class="danger" style="--d:${dcol}" title="Примерный шанс победы: ${Math.round(p * 100)}%">${dz} · ~${Math.round(p * 10) * 10}%</span>
        <div class="mc-ability">${m.family} · приём <b>${Bestiary.ability(sp.species).name}</b>: ${Bestiary.ability(sp.species).desc}</div>
        <p class="hint">${m.desc}</p>
        <div class="chips"><span class="chip">ХП ${sc.hp}</span><span class="chip">ИИ ${sc.ai}</span>${abil}</div>
        <div class="mc-drops"><span class="hint">Добыча:</span>${drops}<span class="hint">монеты ~${Tiers.moneyText(Math.round(m.coins * Tiers.PRICE_MULT[sp.tier - 1]))} · опыт +${xp}</span></div>
        <div class="mc-act"><button type="button" class="primary" data-act="attack" data-sp="${sp.id}">${near ? 'В бой!' : 'Подойти и напасть'}</button><button type="button" data-act="close">Закрыть</button></div>
      </div></div>`;
  }

  function closeCard() { el['map-card'].innerHTML = ''; }

  function attack(sp) {
    closeCard();
    if (!alive(sp)) return;
    if (HexMap.dist(map.cells[st.pos], map.cells[sp.idx]) <= 1) return startFight(sp);
    walkTo(sp.idx, () => startFight(sp), true);
  }

  function startFight(sp) {
    walking = null;
    battleSpawn = sp;
    Profile.data.monster = { id: sp.species, tier: sp.tier };
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
      toast(`${Bestiary.MONSTERS[sp.species].name} повержен. Существо вернётся через ${RESPAWN_MS / 60000} мин.`);
    } else if (result === 'loss') {
      st.pos = HexMap.center(map);
      revealAround(st.pos);
      toast('Вы проиграли и очнулись в деревне');
    } else {
      toast('Вы отступили');
    }
    refreshPlayerArt();
    renderMonsters();
    renderHud();
    requestAnimationFrame(() => centerOn(st.pos, false));
    save();
  }

  /* ---------- интерфейс поверх карты ---------- */
  function renderHud() {
    if (!map || !el['map-me']) return;
    const me = myView(), F = fac(), lv = Profile.levelInfo();
    const pct = lv.need === Infinity ? 100 : Math.round(lv.into / lv.need * 100);
    el['map-me'].innerHTML = `<span class="me-av" style="border-color:${F.color}">${Figures.avatar(myKind(), Profile.gear())}<i class="me-lvl">${lv.level}</i></span>
      <span class="me-txt"><b>${escText(Profile.data.name) || Factions.heroTitle(Profile.data.faction || 'dwarf', Profile.data.gender)}</b><small class="me-fac">${factionIcon(Profile.data.faction || 'dwarf', 'mini-emblem')}${F.name} · ур. ${lv.level}</small>
        <span class="xpbar" title="Опыт: ${lv.into} / ${lv.need === Infinity ? 'максимум' : lv.need}"><i style="width:${pct}%"></i></span>
        <small>ХП ${me.max} · побед ${Profile.data.wins}</small>${MonsterArt.moneyHtml(Profile.data.coins)}</span>`;
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
    on('m-best', () => Screens.openBestiary());
    on('m-mute', () => { Sound.setMuted(!Sound.muted); renderMute(); muteLabel(); });
    on('m-fs', () => toggleFullscreen());
    on('m-zin', () => { const v = view(); zoomAt(v.width / 2, v.height / 2, 1.25); });
    on('m-zout', () => { const v = view(); zoomAt(v.width / 2, v.height / 2, 1 / 1.25); });
    on('m-me', () => centerOn(st.pos));
    on('m-home', () => { const h = HexMap.center(map); if (st.pos === h) toast('Вы уже в деревне'); else walkTo(h, () => toast('Вы в деревне')); });
    el['map-card'].addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'close') closeCard();
      if (b.dataset.act === 'faction') { closeCard(); Screens.openFactions(false); }
      if (b.dataset.act === 'attack') attack(map.spawns[Number(b.dataset.sp)]);
      if (b.dataset.act === 'export-save') exportSave();
      if (b.dataset.act === 'import-save') { const inp = document.getElementById('hall-import-input'); if (inp) inp.click(); }
    });
    el['map-card'].addEventListener('change', (e) => {
      const inp = e.target.closest('#hall-import-input');
      if (!inp || !inp.files || !inp.files[0]) return;
      importSaveFile(inp.files[0]);
    });
    const muteLabel = () => { document.getElementById('m-mute').textContent = Sound.muted ? 'Звук: выкл' : 'Звук: вкл'; };
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
    if (!cands.length) { toast('Сейчас на открытой части карты таких существ нет'); return false; }
    cands.sort((a, b) => HexMap.dist(map.cells[st.pos], map.cells[a.idx]) - HexMap.dist(map.cells[st.pos], map.cells[b.idx]));
    centerOn(cands[0].idx);
    showMonster(cands[0]);
    return true;
  }

  return {
    init, reset, returnFromBattle, focusSpecies, renderHud, refreshPlayerArt, onFactionChanged,
    get inBattle() { return !!battleSpawn; },
    // для тестов
    get state() { return st; }, get map() { return map; }, known, alive, walkTo, tap, attack,
  };
})();
