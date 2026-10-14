if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Экран карты: отрисовка сот, камера (перетаскивание, колесо, щипок), туман войны,
   перемещение игрока по сотам, монстры и здания деревни, переход в бой и обратно.
   Состояние карты хранится в профиле: Profile.data.map = { seed, pos, revealed, defeated }. */

const MapView = (() => {
  const SIZE = 34;                        // радиус соты в пикселях карты
  const RESPAWN_MS = 4 * 60 * 1000;       // побеждённый монстр возвращается через 4 минуты
  const STEP_MS = 260;                    // время шага по лугу
  const MAX_S = 2.4;

  let map = null, st = null, revealed = null, spawnAt = null;
  let world = { lairs: [], events: [], elites: new Map(), landmarks: [] }, evAt = new Map(), lairAt = new Map(), lmAt = new Map(), pinMode = false;   // 1.5.4: события, логова, элитные (World.place)
  // 1.7.2: упрощённая графика карты — для слабых телефонов (меню ☰ «Графика карты»; хранится на устройстве, как скорость анимаций).
  // Без украшений на сотах, дыма и огней, облаков, осадков и покачивания существ; земля, дороги, здания и существа — как обычно.
  const LITE_KEY = 'wip-lite';
  let lite = false;
  try { lite = localStorage.getItem(LITE_KEY) === '1'; } catch (e) { /* без хранилища — обычная графика */ }
  // 1.7.6: окошко с временем суток и погодой — отдельное, его можно скрыть (меню ☰ или крестик в окошке)
  const SKYWIN_KEY = 'wip-skywin';
  let skyWinOn = true;
  try { skyWinOn = localStorage.getItem(SKYWIN_KEY) !== '0'; } catch (e) { /* без хранилища — окошко видно */ }
  const skyWinLabel = () => (skyWinOn ? _t("Окошко погоды: вкл") : _t("Окошко погоды: выкл"));
  function setSkyWin(on) {
    skyWinOn = !!on;
    try { localStorage.setItem(SKYWIN_KEY, skyWinOn ? '1' : '0'); } catch (e) { /* ничего */ }
    document.body.classList.toggle('no-skywin', !skyWinOn);
    const b = document.getElementById('mm-skywin'); if (b) b.textContent = skyWinLabel();
  }
  const liteLabel = () => (lite ? _t("Графика карты: упрощённая") : _t("Графика карты: высокая"));
  const MAP_VER = 6;                 // версия раскладки карты: при смене номера сот сбрасывается исследование (1.7.2: радиус 30)
  const el = {};
  const cam = { x: 0, y: 0, s: 1 };
  let walking = null, stepping = false, battleSpawn = null, hoverIdx = -1, toastTimer = null;
  const fogEls = new Map();
  const mini = { canvas: null, ctx: null, base: null, dirty: true, raf: 0 }, fightFx = { scale: 0 };

  /* ---------- помощники ---------- */
  const px = (i) => HexMap.toPixel(map.cells[i].q, map.cells[i].r, SIZE);
  // Центр здания на карте — середина всех его сот (у здания из нескольких сот).
  const bCenter = (b) => { const cs = b.cells || [b.idx]; return cs.map(px).reduce((m, q) => ({ x: m.x + q.x / cs.length, y: m.y + q.y / cs.length }), { x: 0, y: 0 }); };
  const hexPts = (x, y, k = 1) => Array.from({ length: 6 }, (_, n) => {
    const a = Math.PI / 180 * (60 * n - 30);
    return `${(x + SIZE * k * Math.cos(a)).toFixed(1)},${(y + SIZE * k * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  /* 1.7.2: карта большая (2791 сота, около 15 тысяч узлов), поэтому тяжёлые слои — земля, украшения, туман и существа —
     разложены на «лоскуты» примерно по 8×8 сот; лоскуты вне экрана скрываются (display: none) и не рисуются, пока камера
     не приблизится. Содержимое и порядок внутри лоскута те же, что и раньше. */
  const CK = 8 * SIZE * Math.sqrt(3), CK_PAD = 3 * SIZE;
  const ckLists = {};
  const bucketPush = (b, p, html) => { const k = Math.floor(p.x / CK) + ',' + Math.floor(p.y / CK); let a = b.get(k); if (!a) b.set(k, a = []); a.push(html); };
  const bucketHtml = (b) => [...b].map(([k, a]) => `<g class="ck" data-ck="${k}">${a.join('')}</g>`).join('');
  function ckIndex(layer) {
    const L = ckLists[layer] = [];
    for (const g of el[layer].children) {
      if (!g.getAttribute('data-ck')) continue;
      const [a, b] = g.getAttribute('data-ck').split(',').map(Number);
      L.push({ el: g, x0: a * CK - CK_PAD, y0: b * CK - CK_PAD, x1: (a + 1) * CK + CK_PAD, y1: (b + 1) * CK + CK_PAD, on: true });
    }
    cull();
  }
  function cull() {
    const v = lastView || { width: window.innerWidth, height: window.innerHeight }, k = 1 / cam.s, pad = 40 * k;
    const X0 = -cam.x * k - pad, Y0 = -cam.y * k - pad, X1 = (v.width - cam.x) * k + pad, Y1 = (v.height - cam.y) * k + pad;
    for (const layer in ckLists) for (const c of ckLists[layer]) {
      const on = c.x1 >= X0 && c.x0 <= X1 && c.y1 >= Y0 && c.y0 <= Y1;
      if (on !== c.on) { c.on = on; c.el.style.display = on ? '' : 'none'; }
    }
  }
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
    for (const id of ['map-view', 'map-svg', 'map-defs', 'map-world', 'l-terrain', 'l-roads', 'l-deco', 'l-village', 'l-fog', 'l-hover', 'l-path', 'l-ev', 'l-mon', 'l-player', 'l-amb', 'sky-tint', 'sky-chip', 'siege-strip', 'map-me', 'map-toast', 'map-tip', 'map-zones', 'map-card']) {
      el[id] = document.getElementById(id);
    }
    el['map-defs'].innerHTML = MapArt.defs();
    el['map-zones'].innerHTML = _t("<span class=\"zl\">Цвет зон:</span>") + Tiers.LIST.map((t) => `<i${t.id >= 8 ? ' class="zsp"' : ''} style="--t:${t.color};--ti:${t.ink}" title="${t.id}: ${t.name}">${t.id}</i>`).join('');
    bindInput();
    bindHud();
    initMini();
    load();
    setMode('map');
    // 1.5.4: новичок без народа сначала идёт в учебный бой (Tutorial.boot); народ выбирается после него.
    if (!Profile.data.faction && ((Profile.data.tutorial && Profile.data.tutorial.done) || Profile.data.wins > 0)) Screens.openFactions(true);
    siegeReadyAt = Date.now() + 20000;                 // 1.7.0: осада не начинается в первые секунды после запуска
    setInterval(tick, 5000);
  }

  function load() {
    const d = Profile.data;
    if (!d.map || typeof d.map.seed !== 'number') d.map = { seed: (Math.random() * 2147483646 + 1) | 0, pos: null, revealed: [], defeated: {}, ver: MAP_VER };
    if (!d.seen) d.seen = {};
    st = d.map;
    st.defeated = st.defeated || {};
    // Версия 1.1.10: карта выросла (радиус 20, море, маяк) — номера сот сменились, поэтому старое исследование и
    // позиция сбрасываются (герой, вещи и прогресс остаются); весь мир доступен с самого начала, без кнопки «Новый мир».
    // 1.7.2: карта радиуса 30 — номера сот снова другие, сбрасывается и всё, что привязано к сотам (находки, метки, события, осада).
    if (st.ver !== MAP_VER) {
      st.ver = MAP_VER; st.revealed = []; st.defeated = {}; st.pos = null;
      st.found = {}; st.pins = []; st.evUsed = {}; st.lairCd = {}; st.swarm = {}; st.evShop = {}; st.siege = null;
    }
    map = HexMap.generate(st.seed);
    spawnAt = new Map(map.spawns.map((sp) => [sp.idx, sp]));
    world = World.place(map);
    evAt = new Map(world.events.map((e) => [e.idx, e]));
    lairAt = new Map(world.lairs.map((l) => [l.idx, l]));
    lmAt = new Map((world.landmarks || []).map((m) => [m.idx, m]));
    st.found = st.found || {}; st.pins = st.pins || [];
    if (st.siege && !Siege.sane(st.siege)) st.siege = null;
    st.evUsed = st.evUsed || {}; st.lairCd = st.lairCd || {};
    stripSpecial();                                   // перезагрузка посреди особого боя
    const home = HexMap.center(map);
    if (st.pos == null || !map.cells[st.pos]) st.pos = home;
    else if (!HexMap.passable(map, st.pos)) {          // 1.7.1: на месте героя появилась река — встаём на ближайшую проходимую соту
      const me = map.cells[st.pos], near = HexMap.area(map, st.pos, 3).filter((i) => HexMap.passable(map, i)).sort((a, b) => HexMap.dist(me, map.cells[a]) - HexMap.dist(me, map.cells[b]) || a - b)[0];
      st.pos = near === undefined ? home : near;
    }
    revealed = new Set(st.revealed || []);
    for (const i of HexMap.area(map, home, HexMap.VILLAGE_R + 2)) revealed.add(i);
    walking = null;
    guestList = []; skyNight = null;
    revealAround(st.pos);
    renderStatic();
    renderAmbient();
    renderFog();
    renderMonsters();
    placePlayer(false);
    renderHud();
    requestAnimationFrame(() => { if (view().width < 500) cam.s = 0.8; centerOn(st.pos, false); applyMiniVisible(); });
    siegeOnLoad();
    skyTick(true);
    save();
    mini.dirty = true; drawMini();
  }

  function save() {
    st.revealed = [...revealed];
    Profile.save();
  }

  // Прогресс сброшен (новый профиль) — новая карта и снова выбор фракции.
  function reset() {
    if (!map) return;
    load();
    if (!Profile.data.faction) setTimeout(() => { if (typeof Tutorial !== 'undefined') { Profile.data.tutorial = null; Tutorial.boot(); } else Screens.openFactions(true); }, 50);
  }

  // Фракция выбрана или сменилась: флаги деревни, герой, панель.
  function onFactionChanged() {
    if (!map) return;
    renderStatic();
    refreshPlayerArt();
    renderHud();
    toast(_t("Вы — {0}: {1}", [fac().name, Factions.heroTitle(Profile.data.faction || 'dwarf', Profile.data.gender)]));
    if (!Profile.storageOk) setTimeout(() => { saveWarned = false; warnNoSave(); }, 3400);   // 1.8.3: «Вы — …» затирало предупреждение о том, что игра не сохраняется
  }

  function setMode(mode) {
    document.body.classList.toggle('mode-map', mode === 'map');
    document.body.classList.toggle('mode-battle', mode === 'battle');
  }

  /* ---------- отрисовка ---------- */
  // 1.7.1: реки — гладкая лента через центры речных сот (шире к устью); у озера или моря лента заканчивается на границе соты.
  function riverSvg() {
    if (!map.rivers || !map.rivers.length) return '';
    let bank = '', water = '', shine = '';
    for (const rv of map.rivers) {
      const pts = rv.cells.map((i) => px(i));
      const last = rv.cells.length - 1, tail = map.cells[rv.cells[last]].terrain;
      if (last > 0 && (tail === 'sea' || tail === 'water')) pts[last] = { x: (pts[last].x + pts[last - 1].x) / 2, y: (pts[last].y + pts[last - 1].y) / 2 };
      const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), f = (v) => v.toFixed(1);
      for (let k = 0; k < pts.length; k++) {
        const w = 8 + 8 * k / Math.max(1, pts.length - 1);
        let d;
        if (k === 0) { const m = mid(pts[0], pts[1] || pts[0]); d = `M${f(pts[0].x)} ${f(pts[0].y)} L${f(m.x)} ${f(m.y)}`; }
        else if (k === pts.length - 1) { const m = mid(pts[k - 1], pts[k]); d = `M${f(m.x)} ${f(m.y)} L${f(pts[k].x)} ${f(pts[k].y)}`; }
        else { const a = mid(pts[k - 1], pts[k]), b = mid(pts[k], pts[k + 1]); d = `M${f(a.x)} ${f(a.y)} Q${f(pts[k].x)} ${f(pts[k].y)} ${f(b.x)} ${f(b.y)}`; }
        bank += `<path d="${d}" stroke-width="${f(w + 5)}"/>`;
        water += `<path d="${d}" stroke-width="${f(w)}"/>`;
        shine += `<path d="${d}" stroke-width="${f(w * 0.3)}"/>`;
      }
    }
    // вода реки: своя текстура art/map/tex-river, иначе озёрная tex-water (чтобы река не отличалась от озера), иначе гладкий цвет
    const has = (k) => typeof Art !== 'undefined' && Art.has('map/tex-' + k);
    const fill = has('river') ? 'url(#t-river)' : has('water') ? 'url(#t-water)' : '#4f93bf';
    return `<g class="river" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#1d4268" opacity=".6">${bank}</g><g stroke="${fill}">${water}</g><g stroke="#b7e0f3" stroke-dasharray="2 8" opacity=".55">${shine}</g></g>`;
  }

  function renderStatic() {
    const terr = new Map(), deco = new Map(), roads = [], vil = [], labels = [];
    for (const c of map.cells) {
      const p = px(c.idx);
      // 1.3.0: маленький город — земля деревни, а главная улица и площадь вокруг Ратуши вымощены
      const paved = c.terrain === 'village' && (c.street || c.d <= 2);
      bucketPush(terr, p, `<polygon class="hx${c.terrain === 'village' ? ' hx-town' : ''}" points="${hexPts(p.x, p.y)}" fill="url(#t-${paved ? 'cobble' : c.terrain === 'river' ? (c.base === 'mountain' ? 'hills' : c.base || 'meadow') : c.terrain})"/>`);
      const d = lite ? '' : MapArt.deco(c, HexMap.rng((st.seed ^ Math.imul(c.idx + 1, 2654435761)) >>> 0));
      if (d) bucketPush(deco, p, `<g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">${d}</g>`);
    }

    const riverHtml = riverSvg();
    // дороги и мосты: отрезки между соседними дорожными сотами
    const seg = (a, b) => { const p = px(a), q = px(b); return `M${p.x.toFixed(1)} ${p.y.toFixed(1)} L${q.x.toFixed(1)} ${q.y.toFixed(1)}`; };
    // 1.7.1: мост через реку — три рисунка по направлению дороги (art/map/bridge-e: запад–восток, bridge-ne: юго-запад–северо-восток,
    // bridge-se: северо-запад–юго-восток); пока их нет — досчатый мост линией. Дорога доходит до центра моста и продолжается рисунком.
    const bridgeArt = typeof Art !== 'undefined' && Art.has('map/bridge-e') && Art.has('map/bridge-ne') && Art.has('map/bridge-se');
    let road = '', bridge = '', bridgeImgs = '';
    for (const c of map.cells) {
      if (!c.road) continue;
      for (const n of HexMap.neighbors(map, c.idx)) {
        if (n < c.idx || !map.cells[n].road) continue;
        if ((c.bridge || map.cells[n].bridge) && !bridgeArt) bridge += seg(c.idx, n); else road += seg(c.idx, n);
      }
      if (bridgeArt && c.bridge && c.terrain === 'river') {
        const rn = HexMap.neighbors(map, c.idx).filter((n) => map.cells[n].road), p0 = px(c.idx);
        const a = px(rn[0] === undefined ? c.idx : rn[0]), b = px(rn[1] === undefined ? c.idx : rn[1]);
        let ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; if (ang < 0) ang += 180; if (ang >= 180) ang -= 180;
        const key = ang < 30 || ang >= 150 ? 'e' : ang < 90 ? 'se' : 'ne', z = 70;
        bridgeImgs += `<image href="${Art.url('map/bridge-' + key)}" x="${(p0.x - z / 2).toFixed(1)}" y="${(p0.y - z / 2 - 3).toFixed(1)}" width="${z}" height="${z}" preserveAspectRatio="xMidYMid meet"/>`;
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
    void street;   // 1.6.7: полоса-«улица» не рисуется (мешала мощёной площади)
    roads.push(
      `<path d="${road}" class="road-edge"/><path d="${road}" class="road"${typeof Art !== 'undefined' && Art.has('map/tex-road') ? ' style="stroke:url(#t-road)"' : ''}/><path d="${road}" class="road-ruts"/>`,
      `<path d="${bridge}" class="bridge-edge"/><path d="${bridge}" class="bridge"/>`, bridgeImgs);

    // частокол по границе деревни (кроме ворот)
    // 1.6.7: если есть рисунки (art/map/fence-*, gate-tower) — частокол и башни ворот рисуются ими, иначе — векторные
    const sprites = typeof Art !== 'undefined' && Art.has('map/fence-down') && Art.has('map/fence-up') && Art.has('map/fence-side');
    let fence = '';
    const fenceImgs = [];
    for (const c of map.cells) {
      if (c.d !== HexMap.VILLAGE_R) continue;
      const p = px(c.idx);
      for (const n of HexMap.neighbors(map, c.idx)) {
        const nc = map.cells[n];
        if (nc.d !== HexMap.VILLAGE_R + 1 || (map.gates.includes(c.idx) && nc.road)) continue;
        const q = px(n), ang = Math.atan2(q.y - p.y, q.x - p.x);
        const a1 = ang - Math.PI / 6, a2 = ang + Math.PI / 6, R = SIZE * 0.98;
        fence += `M${(p.x + R * Math.cos(a1)).toFixed(1)} ${(p.y + R * Math.sin(a1)).toFixed(1)} L${(p.x + R * Math.cos(a2)).toFixed(1)} ${(p.y + R * Math.sin(a2)).toFixed(1)}`;
        // середина ребра и его направление: вертикальное, «вниз-вправо» или «вверх-вправо»
        const mx = p.x + R * Math.cos(ang) * 0.866, my = p.y + R * Math.sin(ang) * 0.866;
        const t = (((ang * 180 / Math.PI + 90) % 180) + 180) % 180;
        const kind = Math.abs(t - 90) < 15 ? 'side' : (t < 90 ? 'down' : 'up');
        fenceImgs.push({ kind, x: mx, y: my });
      }
    }
    if (sprites) {
      fenceImgs.sort((a, b) => a.y - b.y);   // нижние перекрывают верхние
      for (const f of fenceImgs) {
        const z = f.kind === 'side' ? 50 : 54, dy = f.kind === 'side' ? 0.46 : 0.30;
        vil.push(`<image class="fence-img" href="${Art.url('map/fence-' + f.kind)}" x="${(f.x - z / 2).toFixed(1)}" y="${(f.y - z * (1 - dy)).toFixed(1)}" width="${z}" height="${z}" preserveAspectRatio="xMidYMid meet"/>`);
      }
    } else {
      vil.push(`<path d="${fence}" class="fence-edge"/><path d="${fence}" class="fence"/>`);
    }
    // ворота: башенки по бокам проёма
    for (const g of map.gates) {
      const p = px(g), c = map.cells[g], ang = Math.atan2(p.y, p.x);
      for (const s of [-1, 1]) {
        const a = ang + s * Math.PI / 6, x = p.x + SIZE * Math.cos(a), y = p.y + SIZE * Math.sin(a);
        if (typeof Art !== 'undefined' && Art.has('map/gate-tower')) {
          vil.push(`<image class="gate-tower" href="${Art.url('map/gate-tower')}" x="${(x - 28).toFixed(1)}" y="${(y - 47).toFixed(1)}" width="56" height="56" preserveAspectRatio="xMidYMid meet"/>`);
          continue;
        }
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

    el['l-terrain'].innerHTML = bucketHtml(terr) + riverHtml;
    el['l-deco'].innerHTML = bucketHtml(deco);
    el['l-roads'].innerHTML = roads.join('');
    el['l-village'].innerHTML = vil.join('') + `<g class="labels">${labels.join('')}</g>`;
    ckIndex('l-terrain'); ckIndex('l-deco');
  }

  function renderFog() {
    fogEls.clear();
    const out = new Map();
    for (const c of map.cells) {
      if (known(c.idx)) continue;
      const p = px(c.idx);
      bucketPush(out, p, `<polygon data-i="${c.idx}" points="${hexPts(p.x, p.y, 1.04)}"/>`);
    }
    el['l-fog'].innerHTML = bucketHtml(out);
    for (const f of el['l-fog'].querySelectorAll('polygon')) fogEls.set(Number(f.getAttribute('data-i')), f);
    ckIndex('l-fog');
  }

  function lift(i) {
    const f = fogEls.get(i);
    if (!f) return;
    fogEls.delete(i);
    f.classList.add('lift');
    setTimeout(() => f.remove(), 500);
  }

  // Фигурки боссов (1.7.7): art/map/boss-<b1..b5|z1..z9>. Нет картинки — старый круглый жетон с бюстом.
  function bossFigure(sp) {
    const k = sp.boss || sp.zone;
    return k && typeof Art !== 'undefined' && Art.has('map/boss-' + k) ? 'map/boss-' + k : null;
  }
  function figureToken(key, sp, col) {
    const ring = sp.zone ? '#c9d3e6' : '#f2c94c';
    return `<ellipse cy="12" rx="22" ry="7" fill="none" stroke="${ring}" stroke-width="2.4" stroke-dasharray="5 3" opacity=".9"/><ellipse cy="12" rx="17" ry="5" fill="none" stroke="${col}" stroke-width="2.2"/>` +
      `<image href="${Art.url(key)}" x="-31" y="-48" width="62" height="62" preserveAspectRatio="xMidYMid meet" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.55))"/>`;
  }
  function monsterArt(sp) {
    const art = sp.species === 'dragon' ? Figures.avatar('dragon', null) : MonsterArt.bust(sp.species, sp.tier);
    return art.replace('<svg ', '<svg x="-21" y="-21" width="42" height="42" ');
  }

  function renderMonsters() {
    const out = [], mb = new Map();
    const now = Date.now();
    for (const sp of [...map.spawns, ...guestList]) {
      if (!known(sp.idx)) continue;
      const p = px(sp.idx), T = Tiers.get(sp.tier), col = T.edge;
      if (!alive(sp)) {
        if (st.defeated[sp.id] > now) {
          bucketPush(mb, p, `<g class="bones" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><path d="M-8 -6 L8 6 M8 -6 L-8 6" stroke="#e8dcc0" stroke-width="3" stroke-linecap="round"/><circle cx="0" cy="-2" r="4.5" fill="#e8dcc0" stroke="#3a3228"/></g>`);
        }
        continue;
      }
      const elite = eliteOf(sp), fig = bossFigure(sp);
      bucketPush(mb, p, `<g data-i="${sp.idx}" class="mon${sp.idx === nextMonIdx ? ' next-step' : ''}${sp.boss || sp.zone ? ' boss' : ''}${sp.zone ? ' zone' : ''}${elite ? ' elite' : ''}${sp.guest ? ' guest' : ''}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})${sp.boss || sp.zone ? ' scale(1.25)' : ''}">
        <ellipse cy="18" rx="15" ry="4" fill="#000" opacity=".45"/>
        <g class="bob" style="animation-delay:${-((sp.guest ? sp.idx : sp.id) % 7) * 0.37}s">
          ${fig ? figureToken(fig, sp, col) : `<circle r="21" fill="#1b1c20"/><g clip-path="url(#clip-token)">${monsterArt(sp)}</g>
          <circle r="21" fill="none" stroke="${col}" stroke-width="3"/>`}${!fig && (sp.boss || sp.zone) ? ((cr) => `<circle r="25" fill="none" stroke="${cr}" stroke-width="2.5" stroke-dasharray="5 3"/><path class="boss-crown" d="M-11 -22 L-7 -31 L-2 -24 L0 -33 L2 -24 L7 -31 L11 -22Z" fill="${cr}" stroke="#3a2a08" stroke-width="1.2"/>`)(sp.zone ? '#c9d3e6' : '#f2c94c') : ''}${elite ? '<circle r="24.5" fill="none" stroke="#f2c94c" stroke-width="2"/><g class="elite-star" transform="translate(-15 -15)"><circle r="7.5" fill="#2a1f05" stroke="#f2c94c" stroke-width="1.3"/><path d="M0 -4.6 L1.3 -1.4 L4.6 -1.4 L2 0.7 L2.9 4 L0 2.1 L-2.9 4 L-2 0.7 L-4.6 -1.4 L-1.3 -1.4Z" fill="#f2c94c"/></g>' : ''}
          <g class="tier-badge" transform="translate(15 14)"><circle r="7.5" fill="${T.color}" stroke="${col}" stroke-width="1.3"/><text y="3.4" fill="${T.ink}">${sp.tier}</text></g>
        </g></g>`);
    }
    renderSiegeTokens(out);
    el['l-mon'].innerHTML = bucketHtml(mb) + out.join('');
    ckIndex('l-mon');
    renderEvents();
  }

  /* ---------- 1.5.4: события и логова ---------- */
  const EV_GLYPH = {
    cache: '<path d="M-11 -5 Q0 -13 11 -5Z" fill="#a06a35" stroke="#f2c94c" stroke-width="1.5"/><rect x="-11" y="-5" width="22" height="13" rx="2" fill="#8a5a2b" stroke="#f2c94c" stroke-width="1.5"/><path d="M-11 0 H11" stroke="#f2c94c" stroke-width="1.5"/><rect x="-2.5" y="-2" width="5" height="5" fill="#f2c94c"/>',
    altar: '<path d="M-10 10 H10 L7 4 H-7Z" fill="#7b7f8c" stroke="#d9e2ff" stroke-width="1.3"/><rect x="-5" y="-5" width="10" height="9" fill="#9aa0b0" stroke="#d9e2ff" stroke-width="1.3"/><path d="M0 -15 Q6 -9 0 -6 Q-6 -9 0 -15Z" fill="#7fd0ff"/>',
    cart: '<rect x="-11" y="-7" width="18" height="10" rx="2" fill="#b07a3a" stroke="#ffe0a0" stroke-width="1.3"/><circle cx="-6" cy="6" r="3.5" fill="#3a2a18" stroke="#ffe0a0" stroke-width="1.3"/><circle cx="4" cy="6" r="3.5" fill="#3a2a18" stroke="#ffe0a0" stroke-width="1.3"/><path d="M7 -3 L12 -9" stroke="#ffe0a0" stroke-width="1.8" stroke-linecap="round"/>',
    paw: '<ellipse cx="0" cy="4" rx="6" ry="5" fill="#e9d6b8"/><circle cx="-7" cy="-3" r="2.6" fill="#e9d6b8"/><circle cx="-2.5" cy="-7.5" r="2.6" fill="#e9d6b8"/><circle cx="2.5" cy="-7.5" r="2.6" fill="#e9d6b8"/><circle cx="7" cy="-3" r="2.6" fill="#e9d6b8"/><path d="M6 9 L12 3" stroke="#ff6b6b" stroke-width="2.2" stroke-linecap="round"/>',
    bush: '<circle cx="-6" cy="3" r="6" fill="#3f7a3a"/><circle cx="5" cy="3" r="6.5" fill="#4b8a44"/><circle cx="0" cy="-3" r="7" fill="#5aa052"/><text y="5" text-anchor="middle" font-size="11" font-weight="700" fill="#fff4c0">?</text>',
    ruins: '<path d="M-11 10 V-2 H-6 V-9 H-1 V10Z" fill="#8c8678" stroke="#e8e0cc" stroke-width="1.3"/><path d="M2 10 V-4 L7 -6 V10Z" fill="#a39c8a" stroke="#e8e0cc" stroke-width="1.3"/><path d="M-13 10 H12" stroke="#e8e0cc" stroke-width="1.6"/>',
    cavern: '<path d="M-14 11 Q-13 -11 0 -12 Q13 -11 14 11Z" fill="#4a4a55" stroke="#aab4ff" stroke-width="1.5"/><path d="M-6 11 Q-5 -2 0 -3 Q5 -2 6 11Z" fill="#0c0c14"/><path d="M-1 -8 l1.5 3 l-3 0Z M5 -6 l1 2 l-2 0Z" fill="#aab4ff"/>',
    obelisk: '<path d="M-5 10 L-3 -10 L0 -15 L3 -10 L5 10Z" fill="#5a6a9a" stroke="#cfe0ff" stroke-width="1.4"/><path d="M-9 10 H9" stroke="#cfe0ff" stroke-width="1.8"/><path d="M0 -6 l1.8 3 l-3.6 0Z" fill="#ffe27a"/>',
    spring: '<ellipse cx="0" cy="6" rx="12" ry="5" fill="#2f6fa0" stroke="#bfe9ff" stroke-width="1.4"/><path d="M0 -12 Q6 -4 0 0 Q-6 -4 0 -12Z" fill="#7fd0ff" stroke="#e6f6ff" stroke-width="1"/>',
    wreck: '<path d="M-13 4 Q0 12 13 4 L9 -2 H-9Z" fill="#7a5530" stroke="#e8c98a" stroke-width="1.3"/><path d="M0 -2 V-14" stroke="#e8c98a" stroke-width="1.8"/><path d="M0 -14 L8 -9 H0Z" fill="#d7d0c0" stroke="#e8c98a" stroke-width="1"/>',
    watch: '<path d="M-6 10 L-4 -4 H4 L6 10Z" fill="#7a6a4a" stroke="#e8d9b0" stroke-width="1.3"/><path d="M-8 -4 H8 L5 -10 H-5Z" fill="#9a4a3a" stroke="#e8d9b0" stroke-width="1.3"/><rect x="-1.6" y="0" width="3.2" height="6" fill="#1b1510"/>',
    lair: '<path d="M-16 11 Q-15 -13 0 -14 Q15 -13 16 11Z" fill="#5b5048" stroke="#cfc0a8" stroke-width="1.5"/><path d="M-7 11 Q-6 -3 0 -4 Q6 -3 7 11Z" fill="#111"/><circle cx="-2.5" cy="3" r="1.4" fill="#ff5d3a"/><circle cx="2.5" cy="3" r="1.4" fill="#ff5d3a"/>',
  };
  // Картинка объекта карты (art/map/ev-<имя>.webp, 128×128, прозрачный фон) или запасной вектор, пока картинки нет.
  const evIcon = (g) => (typeof Art !== 'undefined' && Art.has('map/ev-' + g)
    ? `<image href="${Art.url('map/ev-' + g)}" x="-17" y="-19" width="34" height="34" preserveAspectRatio="xMidYMid meet"/>`
    : EV_GLYPH[g]);
  const evActive = (e) => !(st.evUsed[e.id] > Date.now());
  const lairReady = (l) => !(st.lairCd[l.id] > Date.now()) || (Profile.data.lair && Profile.data.lair.id === l.id);
  const eliteOf = (sp) => world.elites.get(sp.id) || null;
  function renderEvents() {
    if (!el['l-ev']) return;
    const out = [];
    for (const e of world.events) {
      if (!known(e.idx) || !evActive(e) || monsterAt(e.idx)) continue;
      const p = px(e.idx);
      out.push(`<g class="ev ev-${e.kind}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><circle r="17" fill="#1b1c20" opacity=".88"/><circle r="17" fill="none" stroke="#e8c76a" stroke-width="2" stroke-dasharray="4 3"/>${evIcon(World.EVENTS[e.kind].glyph)}</g>`);
    }
    for (const l of world.lairs) {
      if (!known(l.idx)) continue;
      const p = px(l.idx), T = Tiers.get(l.tier), ready = lairReady(l);
      out.push(`<g class="ev lair${ready ? '' : ' cold'}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><circle r="21" fill="#1b1c20" opacity=".9"/><circle r="21" fill="none" stroke="${T.edge}" stroke-width="3"/>${evIcon('lair')}
        <g class="tier-badge" transform="translate(15 14)"><circle r="7.5" fill="${T.color}" stroke="${T.edge}" stroke-width="1.3"/><text y="3.4" fill="${T.ink}">${l.tier}</text></g></g>`);
    }
    for (const m of world.landmarks || []) {
      if (!known(m.idx)) continue;
      const p = px(m.idx), done = !!st.found[m.id], L = World.LANDMARKS[m.kind];
      out.push(`<g class="ev lm${done ? ' done' : ''}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><circle r="17" fill="#17222a" opacity=".9"/><circle r="17" fill="none" stroke="${done ? '#6f8a7a' : '#7fd0ff'}" stroke-width="2"/>${evIcon(L.glyph)}${done ? '<path d="M7 9 l3 3 l6 -7" fill="none" stroke="#9be09b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' : ''}</g>`);
    }
    (st.pins || []).forEach((i, n) => {
      const p = px(i);
      out.push(`<g class="pin" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><path d="M0 0 V-26" stroke="#2b1d10" stroke-width="2.4" stroke-linecap="round"/><path d="M0 -26 L15 -21 L0 -15Z" fill="#e0452f" stroke="#2b1d10" stroke-width="1.3" stroke-linejoin="round"/><circle r="3" fill="#2b1d10"/><text x="6" y="-17.5" font-size="8" font-weight="700" fill="#fff">${n + 1}</text></g>`);
    });
    el['l-ev'].innerHTML = out.join('');
    mini.dirty = true; drawMini();
  }

  function placePlayer(animate, ms = STEP_MS) {
    const g = el['l-player'];
    if (!g.firstChild) {
      const heroKey = 'map/hero-' + myKind();
      if (typeof Art !== 'undefined' && Art.has(heroKey)) {   // фигурка героя (1.7.7): стоит на подставке, голубое кольцо — «это я»
        g.innerHTML = `<g id="pl"><ellipse cy="13" rx="19" ry="5.5" fill="#000" opacity=".5"/><ellipse cy="12" rx="25" ry="8" class="pl-pulse" style="fill:none"/>
          <ellipse cy="12" rx="21" ry="6.5" fill="none" stroke="#7fa2ff" stroke-width="3"/>
          <image href="${Art.url(heroKey)}" x="-30" y="-47" width="60" height="60" preserveAspectRatio="xMidYMid meet" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.55))"/></g>`;
      } else {
      const avatar = Figures.avatar(myKind(), Profile.gear()).replace('<svg ', '<svg x="-21" y="-21" width="42" height="42" ');
      g.innerHTML = `<g id="pl"><ellipse cy="19" rx="16" ry="4.5" fill="#000" opacity=".5"/><circle r="28" class="pl-pulse"/>
        <circle r="22" fill="#2f3a52"/><g clip-path="url(#clip-token)">${avatar}</g><circle r="22" fill="none" stroke="#7fa2ff" stroke-width="3.5"/></g>`;
      }
    }
    const pl = g.firstChild, p = px(st.pos);
    pl.style.transition = animate ? `transform ${ms}ms linear` : 'none';
    pl.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
  }
  // Плавный шаг (1.4.9): позиция фигуры и камера меняются каждый кадр (rAF), без пауз между сотами.
  let glideEnd = 0;
  function glide(a, b, ms) {
    const pl = el['l-player'].firstChild;
    if (!pl) return sleep(ms);
    pl.style.transition = 'none';
    return new Promise((res) => {
      const now = performance.now(), t0 = (glideEnd > now - 40 && glideEnd <= now + 16) ? glideEnd : now;
      glideEnd = t0 + ms;
      const frame = (t) => {
        const k = Math.max(0, Math.min(1, (t - t0) / ms));
        const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
        pl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        const v = view(), sx = x * cam.s + cam.x, sy = y * cam.s + cam.y;
        const dx = sx - v.width / 2, dy = sy - v.height / 2, zx = v.width * 0.18, zy = v.height * 0.18;
        const ox = Math.abs(dx) > zx ? dx - Math.sign(dx) * zx : 0, oy = Math.abs(dy) > zy ? dy - Math.sign(dy) * zy : 0;
        if (ox || oy) { cam.x -= ox * 0.15; cam.y -= oy * 0.15; clampCam(); applyCam(); }
        if (k < 1) requestAnimationFrame(frame); else res();
      };
      requestAnimationFrame(frame);
    });
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
    const r = Math.max(2, (map.cells[i].terrain === 'hills' ? 4 : 3) - Sky.visionPenalty(Sky.kindAt()));   // густой туман — обзор меньше
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
  let lastView = null;                  // размеры поля карты с прошлого замера (cull() не должен заставлять браузер пересчитывать вёрстку)
  const view = () => (lastView = el['map-svg'].getBoundingClientRect());
  function applyCam() {
    el['map-world'].setAttribute('transform', `translate(${cam.x.toFixed(1)} ${cam.y.toFixed(1)}) scale(${cam.s.toFixed(3)})`);
    el['map-svg'].classList.toggle('far', cam.s < 0.62);
    cull();
    drawMini();
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
    svg.addEventListener('contextmenu', (e) => { e.preventDefault(); togglePin(cellAt(e.clientX, e.clientY)); });
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = view();
      zoomAt(e.clientX - v.left, e.clientY - v.top, Math.pow(1.0015, -e.deltaY));
    }, { passive: false });
    window.addEventListener('resize', () => { if (document.body.classList.contains('mode-map')) { clampCam(); applyCam(); } });
    /* 1.6.4 (WIP-09): карта с клавиатуры. Tab выводит на карту; стрелки двигают курсор по сотам, Ввод или Пробел — то же,
       что касание соты (войти в здание, начать бой, идти), Escape закрывает карточку. Что под курсором — читает скринридер (aria-live). */
    svg.setAttribute('tabindex', '0');
    svg.setAttribute('role', 'application');
    svg.setAttribute('aria-label', _t("Карта. Стрелки — выбрать соту, Ввод — действие, плюс и минус — масштаб."));
    let live = document.getElementById('map-live');
    if (!live) { live = document.createElement('div'); live.id = 'map-live'; live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); document.body.appendChild(live); }
    let kb = -1;
    const kbMove = (dx, dy) => {
      if (kb < 0 || kb >= map.cells.length) kb = st.pos;
      const a = px(kb), len = Math.hypot(dx, dy);
      let best = -1, bs = 0.35;
      for (const n of HexMap.neighbors(map, kb)) {
        const b = px(n), d = Math.hypot(b.x - a.x, b.y - a.y) || 1, sc = ((b.x - a.x) * dx + (b.y - a.y) * dy) / (d * len);
        if (sc > bs) { bs = sc; best = n; }
      }
      if (best < 0) return;
      kb = best; hoverIdx = -2; hover(kb);
      const v = view(), p = px(kb), sx = cam.x + p.x * cam.s, sy = cam.y + p.y * cam.s;
      if (sx < 40 || sy < 40 || sx > v.width - 40 || sy > v.height - 40) centerOn(kb);
      live.textContent = (el['map-tip'].textContent || '').trim();
    };
    svg.addEventListener('focus', () => { if (kb < 0) kb = st.pos; });
    svg.addEventListener('blur', () => { hover(-1); });
    document.addEventListener('keydown', (e) => {
      if (e.target !== svg || !document.body.classList.contains('mode-map') || Screens.isOpen || Inventory.isOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
      if (dir) { e.preventDefault(); kbMove(dir[0], dir[1]); }
      else if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); if (kb < 0) kb = st.pos; tap(kb); }
    });
    document.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('mode-map') || Screens.isOpen || Inventory.isOpen) return;
      if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const v = view();
      if (e.key === 'Escape') closeCard();
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {      // 1.5.5: I — сумка, B — бестиарий, Home — в деревню (по коду клавиши: и в русской раскладке)
        const go = { KeyI: 'm-gear', KeyB: 'm-best', Home: 'm-home', KeyJ: 'm-log', KeyP: 'm-pin', KeyM: 'm-mini' }[e.code];
        if (go) { e.preventDefault(); document.getElementById(go).click(); }
      }
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
    const sg = siegeAt(i);
    if (sg) return `<b>${Bestiary.MONSTERS[sg.r.species].name}</b> ${tierChip(sg.r.tier)}${sg.looter ? _t(" · похититель") : _t(" · осада")}${zone}`;
    const lm = lmAt.get(i);
    if (lm) return `<b>${World.LANDMARKS[lm.kind].name}</b>${st.found[lm.id] ? _t(" · осмотрено") : _t(" · можно осмотреть")}${zone}`;
    const s = spawnAt.get(i);
    if (s && st.defeated[s.id] > Date.now()) return _t("{0} · {1} вернётся через {2} мин.{3}", [HexMap.terrainName(map, i), Bestiary.MONSTERS[s.species].name, Math.ceil((st.defeated[s.id] - Date.now()) / 60000), zone]);
    return `${HexMap.terrainName(map, i)}${zone}`;
  }

  function tap(i) {
    if (i < 0) return;
    closeCard();
    el['map-tip'].innerHTML = describe(i);
    if (pinMode) { setPinMode(false); return togglePin(i); }
    const sg = known(i) ? siegeAt(i) : null;
    if (sg) return showRaider(sg.r, sg.looter);
    const sp = known(i) ? monsterAt(i) : null;
    if (sp) return showMonster(sp);
    const ev = known(i) && evAt.get(i);
    if (ev && evActive(ev)) return approach(i, () => showEvent(ev));
    const lr = known(i) && lairAt.get(i);
    if (lr) return approach(i, () => showLair(lr));
    const lm = known(i) && lmAt.get(i);
    if (lm) return approach(i, () => showLandmark(lm));
    if (i === st.pos) return Inventory.open('left');   // 1.3.6: нажатие на своего героя — карточка героя и сумка
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
      const ms = Math.round(Math.max(150, Math.min(800, STEP_MS * HexMap.moveCost(map, next) * Sky.stepMul(Sky.kindAt(), map.cells[next].terrain))));
      const from = px(st.pos);
      st.pos = next;
      const reveal = revealAround(next);
      if (reveal) renderMonsters();
      await glide(from, px(next), ms);
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

  // 1.6.2: медали за мир
  function worldMedal(kind, arg) {
    const ms = Profile.noteWorld(kind, arg, Hero.tierFor(Profile.level()));
    ms.forEach((m) => toast(_t("Медаль! {0}", [Medals.nameFor(m.id)]), 3500));
  }
  function openBuilding(id) {
    const b = HexMap.BUILDINGS[id];
    if (b.soon) return toast(`${b.name}: ${b.desc}`);
    if (!Unlocks.isOpen(Profile.data, id)) return toast(Unlocks.reason(Profile.data, id));
    worldMedal('visit', id);
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
    if (id === 'kennel' || id === 'alchemist' || id === 'arena') return Screens.open(id);
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
    const hallAct = el['map-card'].querySelector('.mc-act');
    if (hallAct) hallAct.insertAdjacentHTML('afterbegin', `<button type="button" class="primary" data-act="village">${_t("Улучшения деревни")}</button>`);   // 1.5.1: куда тратить золото
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
  const spawnScaled = (sp) => {
    let sc = Bestiary.scaled(sp.species, sp.tier);
    if (sp.boss) sc = Story.scaleBoss(sc, sp.boss, Story.cycle(Profile.data.story));
    if (sp.zone) sc = World.scaleZone(sc, sp.zone);                                                              // 1.7.3: хозяин зоны
    if (eliteOf(sp)) sc = { ...sc, hp: Math.round(sc.hp * World.ELITE.hp), dmg: sc.dmg * World.ELITE.dmg };   // 1.5.4
    if (sp.siegeV > 0) sc = { ...sc, hp: Math.max(1, Math.round(sc.hp * (1 - sp.siegeV))) };                    // 1.7.0: башни уже обстреляли
    return sc;
  };
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
    const elite = eliteOf(sp), G = sp.boss && World.GUARDIANS[sp.boss];
    const ZB = sp.zone && World.ZONE_BOSSES[sp.zone], zoneWon = !!(Profile.data.zoneWon && Profile.data.zoneWon[sp.zone]);
    const zoneNote = ZB ? _t("<p class=\"hint boss-note\">👑 <b>Хозяин зоны</b>: {0} Добавочные приёмы: {1}. {2}</p>", [ZB.lore, ZB.affixes.map((a) => `«${World.AFFIXES[a].name}» — ${World.AFFIXES[a].desc}`).join('; '),
      zoneWon ? _t("Трофей уже взят — монеты за победу всё равно ×2.") : _t("За первую победу — трофей: монеты, опыт и редкая вещь вашего цвета.")]) + `<p class="hint boss-taunt"><i>${ZB.taunt}</i></p>` : '';
    const eliteNote = (elite ? _t("<p class=\"hint elite-note\">★ <b>Элитное существо</b>: свойство «{0}» — {1}. Крепче и злее, зато опыта ×{2} и монет ×{3}.</p>", [World.AFFIXES[World.affixFor(elite, m.ability)].name, World.AFFIXES[World.affixFor(elite, m.ability)].desc, World.ELITE.xp, World.ELITE.coins]) : '')
      + (G ? _t("<p class=\"hint elite-note\">👑 Особый приём стража — «{0}»: {1}.</p>", [G.name, G.desc]) : '');
    const xp = Math.round(Hero.xpReward(m, sp.tier, Profile.level()) * (elite ? World.ELITE.xp : 1));
    const abil = Object.entries(sc.stats).filter(([, v]) => v > 0).map(([k, v]) => `<span class="chip">${fmtStat(k, v)}</span>`).join('');
    const weakRes = Bestiary.resourcesWeak(sp.tier, Hero.tierFor(Profile.level()));   // 1.6.6: слабее вашего цвета — ресурсов нет
    const drops = weakRes ? `<span class="hint">${_t("ресурсов нет: существо слабее вашего цвета")}</span>` : m.drops.map(([kind]) => MonsterArt.resIcon(kind, sp.tier)).join('');
    const near = HexMap.dist(map.cells[st.pos], map.cells[sp.idx]) <= 1;
    const art = sp.species === 'dragon' ? `<div class="dragon-art sm" style="--t:${col}">${Figures.avatar('dragon', null)}</div>` : MonsterArt.bust(sp.species, sp.tier);
    el['map-card'].innerHTML = _t("<div class=\"map-card\" style=\"--t:{0}\">\n      <div class=\"mc-art\">{1}</div>\n      <div class=\"mc-body\">\n        <b class=\"mc-title\">{2}</b> {3} <span class=\"danger\" style=\"--d:{4}\" title=\"Примерный шанс победы: {5}%\">{6} · ~{7}%</span>\n        <div class=\"mc-ability\">{8}{9} · приём <b>{10}</b>: {11}</div>\n        <p class=\"hint\">{12}</p>{13}\n        <div class=\"chips\"><span class=\"chip\">ХП {14}</span><span class=\"chip\">ИИ {15}</span>{16}</div>\n        <div class=\"mc-drops\"><span class=\"hint\">Добыча:</span>{17}<span class=\"hint\">монеты ~{18} · опыт +{19}</span></div>\n        <div class=\"mc-act\"><button type=\"button\" class=\"primary\" data-act=\"attack\" data-sp=\"{20}\" {21}>{22}</button><button type=\"button\" data-act=\"close\">Закрыть</button></div>\n      </div></div>", [col, art, sp.boss ? Story.bossName(sp.boss, m.name) : ZB ? ZB.title : m.name, tierChip(sp.tier), dcol, Math.round(p * 100), dz, Math.round(p * 10) * 10, m.family, m.boss || ZB ? _t(" · босс") : '', Bestiary.ability(sp.species).name, Bestiary.ability(sp.species).desc, m.desc, bossNote + zoneNote + eliteNote + (ch ? `<p class="hint boss-taunt"><i>${ch.taunt}</i></p>` : '') + ((h) => (h ? `<p class="hint ammo-weak">🎯 ${h}</p>` : ''))(Ammo.hint(Profile.shotKind(), m.family)), sc.hp, sc.ai, abil, drops, MonsterArt.moneyHtml(Math.round(m.coins * Balance.rewards.coinK * Tiers.PRICE_MULT[sp.tier - 1])), xp, sp.id, locked ? 'disabled' : '', near ? _t("В бой!") : _t("Подойти и напасть")]);
    // 1.4.8: перед боем можно оставить питомца дома (он остаётся выбранным, просто не идёт в этот бой и следующие, пока галочка снята).
    // 1.5.4: быстрый бой — слабое (на 2+ цвета ниже) и уже побеждённое существо
    const beaten = Profile.data.bestiary && Profile.data.bestiary[sp.species] && Profile.data.bestiary[sp.species].wins > 0;
    if (World.quickAllowed(sp, Hero.tierFor(Profile.level()), beaten, elite)) {
      const act = el['map-card'].querySelector('.mc-act');
      if (act) act.insertAdjacentHTML('afterbegin', `<button type="button" data-act="quick" data-sp="${sp.id}" title="${_t("Победа сразу: половина опыта и монет, ресурсы как обычно, без вещей")}">${_t("Быстрый бой")}</button>`);
    }
    if (Profile.hasUsablePet()) {
      const act = el['map-card'].querySelector('.mc-act');
      if (act) act.insertAdjacentHTML('beforebegin', `<label class="pet-toggle"><input type="checkbox" id="mc-pet"${Profile.petStay() ? '' : ' checked'}> ${_t("Взять питомца в бой: {0}", [Pets.petDisplayName(Profile.pet().speciesId)])}</label>`);
    }
  }

  function closeCard() { el['map-card'].innerHTML = ''; }

  function attack(sp) {
    closeCard();
    if (!alive(sp)) return;
    if (sp.boss && Story.BY_ID[sp.boss].final && !Story.finalOpen(Profile.data.story)) return toast(_t("Древний дракон спит: сначала соберите 4 осколка Сердца"));
    if (HexMap.dist(map.cells[st.pos], map.cells[sp.idx]) <= 1) return startFight(sp);
    walkTo(sp.idx, () => startFight(sp), true);
  }

  // 1.6.9: перед боем камера плавно приближается к существу, а после боя масштаб возвращается
  function zoomIn(idx, done) {
    let fired = false;
    const go = () => { if (!fired) { fired = true; done(); } };
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return go();
    const v = view(), p = px(idx), s0 = cam.s, s1 = Math.min(MAX_S, s0 * 1.4), x0 = cam.x, y0 = cam.y, t0 = performance.now();
    const tx = v.width / 2 - p.x * s1, ty = v.height / 2 - p.y * s1;
    fightFx.scale = s0;
    cancelAnimationFrame(camAnim);
    const stepFn = (t) => {
      const k = Math.min(1, (t - t0) / 360), e = 1 - Math.pow(1 - k, 3);
      cam.s = s0 + (s1 - s0) * e; cam.x = x0 + (tx - x0) * e; cam.y = y0 + (ty - y0) * e;
      applyCam();
      if (k < 1) camAnim = requestAnimationFrame(stepFn); else go();
    };
    camAnim = requestAnimationFrame(stepFn);
    setTimeout(go, 700);
  }
  function startFight(sp) {
    walking = null;
    zoomIn(sp.idx, () => beginFight(sp));
  }
  function beginFight(sp) {
    walking = null;
    battleSpawn = sp;
    st.swarm = st.swarm || {};
    if (Bestiary.MONSTERS[sp.species].swarm && !st.swarm[sp.id]) st.swarm[sp.id] = Bestiary.rollSwarmSize(sp.species, Math.random);
    Profile.data.monster = Object.assign({ id: sp.species, tier: Math.min(sp.tier, Hero.tierFor(Profile.level()) + 1), swarm: st.swarm[sp.id] || 1, boss: sp.boss || null, zone: sp.zone || null, elite: eliteOf(sp) }, Sky.battleFx());   // рой не перебрасывается отступлением
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

  // 1.5.4: бой без существа на карте — логово, засада, Арена теней, Испытание дня (sel — Profile.data.monster целиком).
  function startSpecial(sel) {
    closeCard();
    if (typeof Screens !== 'undefined' && Screens.isOpen) Screens.close();
    walking = null;
    battleSpawn = null;
    if (!sel.arena && !sel.challenge && !sel.siege && sel.night === undefined) Object.assign(sel, Sky.battleFx());   // 1.7.1: ночь и непогода — в логове и засаде; Арена, Испытание и осада — без них
    Profile.data.monster = sel;
    save();
    setMode('battle');
    enterBattle();
    startBattle();
  }
  // Особые пометки боя (арена, испытание, логово, засада) живут только в бою: на карте герой считается как обычно.
  function stripSpecial() { const m = Profile.data.monster; if (m) for (const k of ['arena', 'challenge', 'lair', 'lairHp', 'ambush', 'siege', 'siegeKind', 'volley', 'night', 'wx']) delete m[k]; }
  // Подойти к клетке (на неё или рядом) и тогда выполнить fn.
  function approach(i, fn) {
    if (st.pos === i || HexMap.dist(map.cells[st.pos], map.cells[i]) <= 1) return fn();
    walkTo(i, fn, true);
  }
  const resultCard = (title, html, extra = '') => {
    el['map-card'].innerHTML = `<div class="map-card"><div class="mc-body"><b class="mc-title">${title}</b><div class="mc-result">${html}</div>${extra}<div class="mc-act"><button type="button" data-act="close">${_t("Закрыть")}</button></div></div></div>`;
  };
  // Быстрый бой: подходит к существу и сразу побеждает (награда — quickReward в game.js).
  function quickFight(sp) {
    closeCard();
    if (!alive(sp)) return;
    approach(sp.idx, () => {
      if (!alive(sp)) return;
      const html = quickReward(sp.species, sp.tier);
      st.defeated[sp.id] = Date.now() + (sp.guest ? GUEST_REST_MS : RESPAWN_MS);
      if (st.swarm) delete st.swarm[sp.id];
      renderMonsters(); renderHud(); marketNews(); save();
      if (typeof SND !== 'undefined' && SND.win) SND.win();
      resultCard(_t("Быстрый бой: {0} повержен", [Bestiary.MONSTERS[sp.species].name]), html);
    });
  }

  // Вид существа для цвета tier (как на карте; для засад и логов).
  function speciesFor(tier, rand = Math.random) {
    const pool = Object.entries(HexMap.SPAWN).filter(([id, s]) => !s.fixed && tier >= s.tiers[0] && tier <= s.tiers[1] && Bestiary.MONSTERS[id]).map(([id]) => id);
    return pool.length ? pool[Math.floor(rand() * pool.length)] : 'wolf';
  }
  const randomAffix = () => World.AFFIX_IDS[Math.floor(Math.random() * World.AFFIX_IDS.length)];
  const evTier = (tier) => Math.min(tier, Hero.tierFor(Profile.level()) + 1);
  function useEvent(e) { st.evUsed[e.id] = Date.now() + World.EVENT_RESPAWN; renderEvents(); save(); }

  function showEvent(e) {
    const E = World.EVENTS[e.kind], T = evTier(e.tier), d = Profile.data;
    let body = '', act = '';
    if (e.kind === 'cache') {
      body = _t("Под корнями старого дерева что-то блестит — чей-то тайник.");
      act = `<button type="button" class="primary" data-ev="take" data-e="${e.id}">${_t("Забрать")}</button>`;
    } else if (e.kind === 'altar') {
      body = _t("Камень с рунами тихо гудит. Можно попросить одно благословение на {0} обычных боя.", [World.BLESSINGS.might.fights])
        + (d.blessing && d.blessing.fights > 0 ? _t(" Сейчас на вас: {0} (ещё боёв: {1}) — новое заменит его.", [World.BLESSINGS[d.blessing.kind].name, d.blessing.fights]) : '');
      act = Object.entries(World.BLESSINGS).map(([k, b]) => `<button type="button" class="primary" data-ev="bless" data-k="${k}" data-e="${e.id}">${b.name}: ${b.desc}</button>`).join('');
    } else if (e.kind === 'merchant') {
      st.evShop = st.evShop || {};
      const offers = st.evShop[e.id] = st.evShop[e.id] || merchantOffers(e);
      body = _t("Торговец с тележкой распродаёт остатки — дешевле Лавки.");
      act = offers.map((o, n) => o.sold ? '' : `<button type="button" class="primary" data-ev="buy" data-n="${n}" data-e="${e.id}" ${d.coins >= offerPrice(o) ? '' : 'disabled'}>${Gear.CONSUMABLES[o.k].name} ×${o.n} — ${MonsterArt.moneyHtml(offerPrice(o))}</button>`).join('');
    } else if (e.kind === 'beast') {
      body = _t("В траве прячется раненый зверь. Если перевязать его, он может отблагодарить. Нужно 1 зелье здоровья.");
      act = `<button type="button" class="primary" data-ev="heal" data-e="${e.id}" ${(d.backpack.potion || 0) > 0 ? '' : 'disabled'}>${_t("Перевязать (−1 зелье)")}</button>`;
    } else if (e.kind === 'ambush') {
      const id = speciesFor(T), affix = World.affixFor(randomAffix(), Bestiary.MONSTERS[id].ability);
      body = _t("Засада! Из кустов выскакивает {0} ★ — элитное существо со свойством «{1}»: {2}.", [Bestiary.MONSTERS[id].name, World.AFFIXES[affix].name, World.AFFIXES[affix].desc]);
      act = `<button type="button" class="primary" data-ev="ambush" data-id="${id}" data-affix="${affix}" data-t="${T}" data-e="${e.id}">${_t("В бой")}</button>`;
    }
    el['map-card'].innerHTML = `<div class="map-card"><div class="mc-body"><b class="mc-title">${E.name}</b> ${tierChip(T)}<p class="hint">${body}</p><div class="mc-act">${act}<button type="button" data-act="close">${_t("Уйти")}</button></div></div></div>`;
  }
  // 1.6.5 (A2-01): цена у торговца считается от цены расходника НА ВАШЕМ УРОВНЕ (как в Лавке), а не от базовой: раньше на 46-м уровне
  // за 348 меди давали товар, который Лавка продаёт за ~12 000. Цена не хранится в предложении — старые сохранённые предложения тоже исправляются.
  const offerPrice = (o) => Math.round(Gear.bulkPrice(Profile.consumablePrice(o.k), o.n) * 0.6);
  function merchantOffers(e) {
    const round = Math.floor(Date.now() / World.EVENT_RESPAWN);
    const kinds = Object.keys(Gear.CONSUMABLES).filter((k) => !Gear.CONSUMABLES[k].alchemy)
      .sort((a, b) => World.hash(st.seed, e.id, round, a) - World.hash(st.seed, e.id, round, b));   // три разных товара
    const out = [];
    for (let n = 0; n < Math.min(3, kinds.length); n++) {
      const k = kinds[n];
      const cnt = 1 + Math.floor(World.hash(e.id, n, 'n') * 3);
      out.push({ k, n: cnt, sold: false });
    }
    return out;
  }
  function eventAction(b) {
    const e = world.events.find((x) => x.id === b.dataset.e);
    if (!e || !evActive(e)) return closeCard();
    const T = evTier(e.tier), d = Profile.data, k = b.dataset.ev;
    if (k === 'take') {
      worldMedal('cache');
      const coins = World.cacheCoins(T);
      Profile.addCoins(coins);
      const drops = Bestiary.rollDrops(speciesFor(T), T, Math.random, d.faction, Hero.tierFor(Profile.level())).resources;
      const lines = [_t("Монеты: {0}", [MonsterArt.moneyHtml(coins)])];
      for (const r of drops) { Profile.addRes(r.kind, r.tier, r.n); lines.push(`${Bestiary.RESOURCES[r.kind].name} (${Tiers.get(r.tier).name}) ×${r.n}`); }
      useEvent(e); renderHud(); if (typeof onEconomyChanged === 'function') onEconomyChanged();
      return resultCard(_t("Тайник"), lines.join('<br>'));
    }
    if (k === 'bless') {
      worldMedal('altar');
      d.blessing = { kind: b.dataset.k, fights: World.BLESSINGS[b.dataset.k].fights };
      useEvent(e);
      return resultCard(_t("Древний алтарь"), _t("Благословение: {0} — {1} на {2} обычных боя.", [World.BLESSINGS[b.dataset.k].name, World.BLESSINGS[b.dataset.k].desc, d.blessing.fights]));
    }
    if (k === 'buy') {
      const offers = (st.evShop || {})[e.id]; const o = offers && offers[Number(b.dataset.n)];
      if (!o || o.sold || !Profile.spend(offerPrice(o))) return;
      Profile.addConsumable(o.k, o.n); o.sold = true;
      if (offers.every((x) => x.sold)) { delete st.evShop[e.id]; useEvent(e); closeCard(); toast(_t("Торговец распродал всё и уехал")); }
      else { save(); showEvent(e); }
      renderHud(); if (typeof onEconomyChanged === 'function') onEconomyChanged();
      return;
    }
    if (k === 'heal') {
      if (!((d.backpack.potion || 0) > 0)) return;
      d.backpack.potion--;
      const lines = [];
      const eggs = Object.keys(Pets.EGGS);
      if (Math.random() < 0.3) { const egg = eggs[Math.floor(Math.random() * eggs.length)]; Profile.addEgg(egg); lines.push(_t("<b class=\"lvlup\">Находка!</b> Зверь привёл вас к гнезду: {0} — высиживается в Питомнике", [Pets.EGGS[egg].name])); }
      const drops = Bestiary.rollDrops(speciesFor(T), T, Math.random, d.faction, Hero.tierFor(Profile.level())).resources.slice(0, 1);
      for (const r of drops) { Profile.addRes(r.kind, r.tier, r.n); lines.push(_t("Зверь оставил подарок: {0}", [`${Bestiary.RESOURCES[r.kind].name} (${Tiers.get(r.tier).name}) ×${r.n}`])); }
      if (!lines.length) { const c = World.cacheCoins(T); Profile.addCoins(c); lines.push(_t("Рядом нашлись монеты: {0}", [MonsterArt.moneyHtml(c)])); }
      useEvent(e); renderHud();
      return resultCard(_t("Раненый зверь"), _t("Зверь благодарно лизнул руку и убежал.") + '<br>' + lines.join('<br>'));
    }
    if (k === 'ambush') {
      useEvent(e);
      return startSpecial({ id: b.dataset.id, tier: Number(b.dataset.t), elite: b.dataset.affix, ambush: e.id });
    }
  }


  /* ---------- 1.6.9: достопримечательности ---------- */
  const LM_TEXT = {
    ruins: _t("Среди заросших плит лежит то, что не успели растащить. Здесь можно порыться."),
    cave: _t("В пещере сухо и тихо. На стенах блестят жилы, а на полу валяются следы чужого привала."),
    obelisk: _t("Камень покрыт звёздной резьбой. Стоит коснуться, и перед глазами раскинется вся округа."),
    spring: _t("Вода бьёт из-под камня и пахнет мятой. Говорят, после неё удар становится увереннее."),
    wreck: _t("Корабль давно сел на мель. В трюме что-то осталось — прилив добрался не до всего."),
    watch: _t("На вышке ещё держится лестница. Сверху видно далеко, а в караулке остались вещи."),
  };
  function showLandmark(m) {
    const L = World.LANDMARKS[m.kind], done = !!st.found[m.id], T = evTier(m.tier);
    const act = done ? '' : `<button type="button" class="primary" data-lm="look" data-m="${m.id}">${_t("Осмотреть")}</button>`;
    el['map-card'].innerHTML = `<div class="map-card"><div class="mc-body"><b class="mc-title">${L.name}</b> ${tierChip(T)}<p class="hint">${LM_TEXT[m.kind]}${done ? ' ' + _t("Вы здесь уже всё осмотрели.") : ''}</p><div class="mc-act">${act}<button type="button" data-act="close">${done ? _t("Закрыть") : _t("Уйти")}</button></div></div></div>`;
  }
  function revealArea(center, r) {
    let added = 0;
    for (const n of HexMap.area(map, center, r)) if (!revealed.has(n)) { revealed.add(n); added++; lift(n); }
    if (added) { renderMonsters(); mini.dirty = true; }
    return added;
  }
  function landmarkAction(b) {
    const m = (world.landmarks || []).find((x) => x.id === b.dataset.m);
    if (!m || st.found[m.id]) return closeCard();
    const T = evTier(m.tier), d = Profile.data, lines = [], L = World.LANDMARKS[m.kind];
    st.found[m.id] = true;
    const loot = (n, share = 1) => {
      for (let k = 0; k < n; k++) {
        const drops = Bestiary.rollDrops(speciesFor(T), T, Math.random, d.faction, Hero.tierFor(Profile.level())).resources;
        for (const r of drops) { Profile.addRes(r.kind, r.tier, r.n); lines.push(`${Bestiary.RESOURCES[r.kind].name} (${Tiers.get(r.tier).name}) ×${r.n}`); }
      }
    };
    const coins = (mult) => { const c = Math.round(World.cacheCoins(T) * mult); Profile.addCoins(c); lines.unshift(_t("Монеты: {0}", [MonsterArt.moneyHtml(c)])); };
    if (m.kind === 'ruins') { coins(2.5); loot(1); }
    else if (m.kind === 'cave') { coins(1); loot(2); }
    else if (m.kind === 'obelisk') { const n = revealArea(m.idx, World.LANDMARK_REVEAL.obelisk); lines.push(_t("Открыто сот на карте: {0}", [n])); coins(0.6); }
    else if (m.kind === 'watch') { const n = revealArea(m.idx, World.LANDMARK_REVEAL.watch); lines.push(_t("Открыто сот на карте: {0}", [n])); coins(1); }
    else if (m.kind === 'spring') {
      const k = World.hash(st.seed, m.id, 'bl') < 0.5 ? 'might' : 'stone';
      d.blessing = { kind: k, fights: World.BLESSINGS[k].fights };
      lines.push(_t("Благословение: {0} — {1} на {2} обычных боя.", [World.BLESSINGS[k].name, World.BLESSINGS[k].desc, d.blessing.fights]));
    } else if (m.kind === 'wreck') {
      coins(3);
      const kinds = Object.keys(Gear.CONSUMABLES).filter((k) => !Gear.CONSUMABLES[k].alchemy);
      const k = kinds[Math.floor(World.hash(st.seed, m.id, 'cons') * kinds.length)];
      Profile.addConsumable(k, 2); lines.push(`${Gear.CONSUMABLES[k].name} ×2`);
    }
    renderEvents(); renderFog(); renderHud(); save();
    if (typeof onEconomyChanged === 'function') onEconomyChanged();
    toast(_t("Найдено: {0} ({1} из {2})", [L.name, Object.keys(st.found).length, world.landmarks.length]), 3200);
    resultCard(L.name, lines.join('<br>') || _t("Ничего ценного, но место запомнилось."));
  }

  /* ---------- 1.6.9: закладки на карте ---------- */
  const PIN_MAX = 5;
  function setPinMode(on) {
    pinMode = !!on;
    document.getElementById('m-pin').classList.toggle('on', pinMode);
    el['map-svg'].classList.toggle('pin-mode', pinMode);
    if (pinMode) el['map-tip'].textContent = _t("Нажмите на соту, чтобы поставить или снять метку.");
  }
  function togglePin(i) {
    if (i < 0) return;
    const at = st.pins.indexOf(i);
    if (at >= 0) st.pins.splice(at, 1);
    else if (!known(i)) return toast(_t("Метку можно ставить только на открытую землю"));
    else if (st.pins.length >= PIN_MAX) return toast(_t("Меток не больше {0} — снимите одну", [PIN_MAX]));
    else st.pins.push(i);
    renderEvents(); save();
  }

  /* ---------- 1.6.9: мини-карта ---------- */
  const MINI = 160;
  const MINI_COL = { meadow: '#6f9a4a', forest: '#2f6a3a', hills: '#a08e5a', swamp: '#4f6038', water: '#3f78a8', mountain: '#808088', village: '#c2a66a', sea: '#244a7a', beach: '#dcc88e', river: '#4a8db4', field: '#b8a850', tundra: '#a9b592', snow: '#e4edf5', sand: '#dcbd72', badlands: '#b3764a', darkwood: '#2d3d38', ash: '#68635e' };
  function miniK() { const R = HexMap.RADIUS + 1; return Math.min(MINI / (2 * SIZE * Math.sqrt(3) * R), MINI / (2 * SIZE * 1.5 * R)); }
  // 1.7.1: мини-карту можно перетащить в удобное место (мышью или пальцем); положение запоминается на устройстве
  // (доли свободного места — переживает поворот экрана и смену размера окна). Нажатие без сдвига, как и раньше, переносит камеру;
  // двойное нажатие возвращает мини-карту на прежнее место.
  const MINI_POS_KEY = 'wip-mini-pos', MINI_GAP = 6;
  const miniClamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // Где мини-карту можно ставить: весь экран карты, кроме верхней полосы с героем и кнопками (она выше мини-карты).
  function miniBounds() {
    const c = mini.canvas, v = document.getElementById('map-view'), top = document.querySelector('#map-view .map-top');
    const vr = v.getBoundingClientRect(), tb = top ? Math.ceil(top.getBoundingClientRect().bottom - vr.top) + 4 : MINI_GAP;
    const w = c.offsetWidth, h = c.offsetHeight;
    return { x0: MINI_GAP, y0: Math.max(MINI_GAP, tb), x1: Math.max(MINI_GAP, v.clientWidth - w - MINI_GAP), y1: Math.max(MINI_GAP, v.clientHeight - h - MINI_GAP) };
  }
  function miniPlace() {
    const c = mini.canvas;
    if (!c || c.hidden) return;
    let pos = null;
    try { pos = JSON.parse(localStorage.getItem(MINI_POS_KEY) || 'null'); } catch (e) { /* без хранилища — на месте */ }
    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') { c.style.left = c.style.top = c.style.right = ''; return; }
    const b = miniBounds();
    c.style.left = (b.x0 + miniClamp(pos.x, 0, 1) * (b.x1 - b.x0)).toFixed(0) + 'px';
    c.style.top = (b.y0 + miniClamp(pos.y, 0, 1) * (b.y1 - b.y0)).toFixed(0) + 'px';
    c.style.right = 'auto';
  }
  function miniSavePos() {
    const c = mini.canvas, b = miniBounds();
    const pos = { x: miniClamp((c.offsetLeft - b.x0) / Math.max(1, b.x1 - b.x0), 0, 1), y: miniClamp((c.offsetTop - b.y0) / Math.max(1, b.y1 - b.y0), 0, 1) };
    try { localStorage.setItem(MINI_POS_KEY, JSON.stringify(pos)); } catch (e) { /* не страшно */ }
  }
  function miniReset() {
    try { localStorage.removeItem(MINI_POS_KEY); } catch (e) { /* не страшно */ }
    mini.canvas.style.left = mini.canvas.style.top = mini.canvas.style.right = '';
  }
  function initMini() {
    const c = document.createElement('canvas');
    c.id = 'map-mini'; c.className = 'map-mini'; c.width = MINI; c.height = MINI;
    c.setAttribute('aria-hidden', 'true');
    c.title = _t("Нажмите — перейти туда. Перетащите — переместить мини-карту. Двойное нажатие — вернуть на место.");
    document.getElementById('map-view').appendChild(c);
    mini.canvas = c; mini.ctx = c.getContext('2d');
    let drag = null, lastTap = { t: 0, x: 0, y: 0 };
    c.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, left: c.offsetLeft, top: c.offsetTop, moved: false };
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* не страшно */ }
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true; c.classList.add('dragging');
      const b = miniBounds();
      c.style.right = 'auto';
      c.style.left = miniClamp(drag.left + dx, b.x0, b.x1).toFixed(0) + 'px';
      c.style.top = miniClamp(drag.top + dy, b.y0, b.y1).toFixed(0) + 'px';
    });
    const finish = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null; c.classList.remove('dragging');
      try { c.releasePointerCapture(e.pointerId); } catch (err) { /* не страшно */ }
      if (d.moved) { miniSavePos(); return; }
      if (cancelled) return;
      const now = Date.now();
      if (now - lastTap.t < 380 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 24) { lastTap.t = 0; miniReset(); return; }   // двойное нажатие
      lastTap = { t: now, x: e.clientX, y: e.clientY };
      const r = c.getBoundingClientRect(), k = miniK();
      centerOn({ x: ((e.clientX - r.left) / r.width * MINI - MINI / 2) / k, y: ((e.clientY - r.top) / r.height * MINI - MINI / 2) / k });
    };
    c.addEventListener('pointerup', (e) => finish(e, false));
    c.addEventListener('pointercancel', (e) => finish(e, true));
    window.addEventListener('resize', miniPlace);
    window.addEventListener('orientationchange', miniPlace);
  }
  function applyMiniVisible() {
    if (!mini.canvas) return;
    const wide = view().width >= 700;
    const on = st.mini === undefined ? wide : !!st.mini;
    mini.canvas.hidden = !on;
    document.getElementById('m-mini').classList.toggle('on', on);
    if (on) { miniPlace(); mini.dirty = true; drawMini(); }
  }
  function drawMini() {
    if (!mini.canvas || mini.canvas.hidden || !map || mini.raf) return;
    mini.raf = requestAnimationFrame(() => { mini.raf = 0; paintMini(); });
  }
  function paintMini() {
    if (!map || !st) return;
    const k = miniK(), ctx = mini.ctx, half = MINI / 2, cs = SIZE * 1.78 * k;
    if (mini.dirty || !mini.base) {
      const b = document.createElement('canvas'); b.width = b.height = MINI; const bx = b.getContext('2d');
      bx.fillStyle = 'rgba(14,15,18,.82)'; bx.fillRect(0, 0, MINI, MINI);
      for (const c of map.cells) {
        const p = px(c.idx);
        bx.fillStyle = revealed.has(c.idx) ? (MINI_COL[c.terrain] || '#777') : '#202228';
        bx.fillRect(half + p.x * k - cs / 2, half + p.y * k - cs / 2, cs, cs);
      }
      mini.base = b; mini.dirty = false;
    }
    ctx.clearRect(0, 0, MINI, MINI);
    ctx.drawImage(mini.base, 0, 0);
    const dot = (i, col, r) => { const p = px(i); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(half + p.x * k, half + p.y * k, r, 0, 6.2832); ctx.fill(); };
    for (const m of world.landmarks || []) if (known(m.idx)) dot(m.idx, st.found[m.id] ? '#6f8a7a' : '#7fd0ff', 2.2);
    for (const l of world.lairs) if (known(l.idx)) dot(l.idx, '#e0652f', 2.4);
    for (const t of siegeTargets()) dot(t.r.idx, t.looter ? '#ffb347' : '#ff3b2f', 3.2);
    for (const i of st.pins) dot(i, '#ff4a36', 3);
    dot(st.pos, '#fff', 3.4); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    const v = view();
    if (v.width) {
      const x0 = half + (-cam.x / cam.s) * k, y0 = half + (-cam.y / cam.s) * k, w = v.width / cam.s * k, h = v.height / cam.s * k;
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.2; ctx.strokeRect(x0, y0, w, h);
    }
  }

  /* ---------- 1.6.9: журнал исследователя ---------- */
  function showJournal() {
    const total = new Array(11).fill(0), seen = new Array(11).fill(0);
    for (const c of map.cells) {
      const t = tierOfCell(c.idx);
      if (!t || !HexMap.passable(map, c.idx)) continue;
      total[t]++; if (known(c.idx)) seen[t]++;
    }
    const all = total.reduce((a, b) => a + b, 0), got = seen.reduce((a, b) => a + b, 0);
    if (all && got >= all && !Profile.data.explored100) { Profile.data.explored100 = true; Profile.save(); }   // 1.8.4: титул «Исследователь»
    const bars = Tiers.LIST.map((T, n) => {
      const t = n + 1, pct = total[t] ? Math.round(seen[t] / total[t] * 100) : 0;
      return `<div class="jr-row"><i class="jr-chip" style="--t:${T.color};--ti:${T.ink}">${T.id}</i><span class="jr-bar"><b style="width:${pct}%;background:${T.edge}"></b></span><small>${pct}%</small></div>`;
    }).join('');
    // 1.7.7: график побед над существами по цветам; при наведении на линию — «изучено N обитателей»
    const ts = Profile.tierStats(), wmax = Math.max(1, ...ts.wins);
    const winChart = Tiers.LIST.map((T, n) => {
      const t = n + 1, w = ts.wins[t], pct = Math.round(w / wmax * 100);
      return `<div class="jr-row jr-win" tabindex="0" data-tip="${_t("изучено {0} обитателей", [ts.species[t]])}"><i class="jr-chip" style="--t:${T.color};--ti:${T.ink}">${T.id}</i><span class="jr-bar"><b style="width:${w ? Math.max(pct, 3) : 0}%;background:${T.edge}"></b></span><small>${w}</small><small class="jr-sp" title="${_t("изучено {0} обитателей", [ts.species[t]])}">${ts.species[t]}</small></div>`;
    }).join('');
    const lms = world.landmarks || [];
    const doneN = lms.filter((m) => st.found[m.id]).length;
    const lmRows = lms.filter((m) => known(m.idx)).map((m) => `<li><button type="button" class="jr-go" data-jump="${m.idx}">${World.LANDMARKS[m.kind].name}</button> <span class="${st.found[m.id] ? 'jr-ok' : 'jr-new'}">${st.found[m.id] ? _t("осмотрено") : _t("не осмотрено")}</span></li>`).join('')
      + (lms.some((m) => !known(m.idx)) ? `<li class="jr-unk">${_t("Ещё не найдено: {0}", [lms.filter((m) => !known(m.idx)).length])}</li>` : '');
    const pinRows = st.pins.length ? st.pins.map((i, n) => {
      const dd = HexMap.dist(map.cells[st.pos], map.cells[i]);
      return `<li><button type="button" class="jr-go" data-jump="${i}">${_t("Метка {0}", [n + 1])}</button> <span>${HexMap.terrainName(map, i)} · ${_t("{0} сот отсюда", [dd])}</span> <button type="button" class="jr-del" data-delpin="${i}" aria-label="${_t("Снять метку")}">×</button></li>`;
    }).join('') : `<li class="jr-unk">${_t("Меток нет. Кнопка «Метка» ставит их на карту.")}</li>`;
    el['map-card'].innerHTML = `<div class="map-card"><div class="mc-body"><b class="mc-title">${_t("Журнал исследователя")}</b>
      <p class="hint">${_t("Исследовано: {0}% суши", [all ? Math.round(got / all * 100) : 0])}</p><div class="jr-bars">${bars}</div>
      <b class="jr-h">${_t("Победы над существами по цветам")}</b><p class="hint">${_t("Справа: побед и изучено обитателей")}</p><div class="jr-bars jr-wins">${winChart}</div>
      <b class="jr-h">${_t("Достопримечательности: {0} из {1}", [doneN, lms.length])}</b><ul class="jr-list">${lmRows}</ul>
      <b class="jr-h">${_t("Метки: {0} из {1}", [st.pins.length, PIN_MAX])}</b><ul class="jr-list">${pinRows}</ul>
      <div class="mc-act"><button type="button" data-act="close">${_t("Закрыть")}</button></div></div></div>`;
  }

  /* ---------- 1.6.9: живой фон карты (дым, огни, облака) ---------- */
  const SMOKY = ['forge', 'tavern', 'home', 'alchemist'];   // дымят только дома с трубой — меньше анимаций, легче телефону
  function renderAmbient() {
    if (!el['l-amb']) return;
    const out = [];
    map.buildings.forEach((b, n) => {
      if (!SMOKY.includes(b.id)) return;
      const p = bCenter(b);
      for (let k = 0; k < 1; k++) out.push(`<g transform="translate(${(p.x + 9).toFixed(1)} ${(p.y - 34).toFixed(1)})"><circle class="smoke" r="3" style="animation-delay:${(-((n * 1.7 + k * 3.1) % 6)).toFixed(2)}s"/></g>`);
    });
    // 1.7.1: тёплое свечение окон зданий (видно только ночью) и штормовой флажок над мельницей (виден при предупреждении)
    for (const b of map.buildings) {
      const info = HexMap.BUILDINGS[b.id];
      if (!info || info.soon) continue;
      const p = bCenter(b), r = 14 + 7 * (info.scale || 3) / 1.35;
      out.push(`<circle class="winlight" cx="${p.x.toFixed(1)}" cy="${(p.y + 4).toFixed(1)}" r="${r.toFixed(0)}" fill="url(#glow-win)"/>`);
      if (b.id === 'mill') out.push(typeof Art !== 'undefined' && Art.has('map/flag-storm')
        ? `<g class="storm-flag"><image href="${Art.url('map/flag-storm')}" x="${(p.x + 14).toFixed(1)}" y="${(p.y - 62).toFixed(1)}" width="30" height="40" preserveAspectRatio="xMidYMax meet"/></g>`   // 1.7.1: рисунок флага, если файл есть
        : `<g class="storm-flag" transform="translate(${(p.x + 26).toFixed(1)} ${(p.y - 48).toFixed(1)}) scale(1.25)"><rect x="-1" y="0" width="2" height="24" fill="#4a3320" stroke="#1b1510" stroke-width=".6"/><g class="cloth"><path d="M1 1 L21 6.5 L1 13Z" fill="#d6372b" stroke="#2a1410" stroke-width=".8"/></g></g>`);
    }
    for (const g of map.gates) {
      const p = px(g), ang = Math.atan2(p.y, p.x);
      for (const sgn of [-1, 1]) {
        const a = ang + sgn * Math.PI / 6;
        out.push(`<g transform="translate(${(p.x + SIZE * Math.cos(a)).toFixed(1)} ${(p.y + SIZE * Math.sin(a) - 38).toFixed(1)})"><circle class="torch-halo" r="9"/><circle class="torch" r="3"/></g>`);
      }
    }
    el['l-amb'].innerHTML = out.join('');
  }

  /* ---------- логова ---------- */
  function lairState(l) { const L = Profile.data.lair; return L && L.id === l.id ? L : null; }
  function showLair(l) {
    const T = evTier(l.tier), run = lairState(l), len = World.lairLength(l.tier);
    if (!run && !lairReady(l)) {
      return resultCard(_t("Логово"), _t("Логово пусто. Звери вернутся через {0} мин.", [Math.ceil((st.lairCd[l.id] - Date.now()) / 60000)]));
    }
    if (!run) {
      const other = Profile.data.lair;
      el['map-card'].innerHTML = `<div class="map-card"><div class="mc-body"><b class="mc-title">${_t("Логово")}</b> ${tierChip(T)}
        <p class="hint">${_t("{0} подряд. ХП между боями не восстанавливается — зелья пить можно. После каждого боя развилка: тихий путь (обычное существо) или опасный (элитное, добыча больше). В конце — сундук с вещью. Уйти можно после любого боя: добыча остаётся, сундук — нет.", [_nn(len, 'бой', 'боя', 'боёв')])}</p>
        ${other ? `<p class="hint">${_t("Сейчас вы в другом логове — вход сюда закончит ту вылазку.")}</p>` : ''}
        <div class="mc-act"><button type="button" class="primary" data-lair="enter" data-l="${l.id}">${_t("Войти")}</button><button type="button" data-act="close">${_t("Уйти")}</button></div></div></div>`;
      return;
    }
    el['map-card'].innerHTML = `<div class="map-card"><div class="mc-body"><b class="mc-title">${_t("Логово: бой {0} из {1} позади", [run.step, run.len])}</b> ${tierChip(T)}
      <p class="hint">${_t("Осталось ХП: {0} из {1}. Впереди развилка.", [Math.round(run.hp), Math.round(myView().max)])}</p>
      <div class="mc-act"><button type="button" class="primary" data-lair="quiet" data-l="${l.id}">${_t("Тихий путь")}</button><button type="button" class="primary" data-lair="danger" data-l="${l.id}">${_t("Опасный путь ★")}</button><button type="button" data-lair="leave" data-l="${l.id}">${_t("Уйти с добычей")}</button></div></div></div>`;
  }
  function lairAction(b) {
    const l = world.lairs.find((x) => x.id === b.dataset.l);
    if (!l) return closeCard();
    const k = b.dataset.lair, T = evTier(l.tier);
    if (k === 'enter') {
      Profile.data.lair = { id: l.id, tier: T, len: World.lairLength(l.tier), step: 0, hp: null };
      return lairFight(l, false);
    }
    if (k === 'leave') { endLair(l); closeCard(); return toast(_t("Вы покинули логово с добычей")); }
    if (k === 'quiet' || k === 'danger') return lairFight(l, k === 'danger');
  }
  function lairFight(l, danger) {
    const run = Profile.data.lair, id = speciesFor(run.tier);
    startSpecial({ id, tier: run.tier, lair: l.id, elite: danger ? World.affixFor(randomAffix(), Bestiary.MONSTERS[id].ability) : null, lairHp: run.hp });
  }
  function endLair(l) {
    Profile.data.lair = null;
    st.lairCd[l.id] = Date.now() + World.LAIR_COOLDOWN;
    renderEvents(); save();
  }
  function lairChest(l, run) {
    const coins = World.lairChestCoins(run.tier, run.len);
    Profile.addCoins(coins);
    const pool = Gear.itemsFor(Profile.data.faction || 'dwarf').filter((i) => !i.set);
    const entry = Gear.makeEntry(pool[Math.floor(Math.random() * pool.length)].id, run.tier);
    Profile.addItem(entry);
    const it = Gear.item(entry);
    endLair(l);
    renderHud();
    return [_t("Монеты: {0}", [MonsterArt.moneyHtml(coins)]), _t("Вещь: {0} ({1})", [it.name, Tiers.get(it.tier).name])].join('<br>');
  }

  // Вызывается из боя: result — 'win', 'loss' или 'flee'.
  function returnFromBattle(result) {
    const sp = battleSpawn;
    battleSpawn = null;
    if (!Profile.storageOk) setTimeout(warnNoSave, 1500);     // 1.6.5: запись сломалась во время боя
    const sel = { ...(Profile.data.monster || {}) };
    if (st.siege && !st.siege.over) st.siege.t1 = Math.max(st.siege.t1, Date.now() + Siege.GRACE_MS);   // 1.7.0: бой не съедает время осады
    // 1.5.4: благословение алтаря тратится за каждый обычный бой, где оно действовало
    if (Profile.data.blessing && typeof fighters !== 'undefined' && fighters.left.bless) {
      Profile.data.blessing.fights--;
      if (Profile.data.blessing.fights <= 0) { Profile.data.blessing = null; setTimeout(() => toast(_t("Благословение алтаря иссякло")), 3400); }
    }
    if ((sel.arena || sel.challenge) && result === 'flee' && typeof specialResult === 'function') specialResult(false);
    stripSpecial();
    const heroHp = typeof fighters !== 'undefined' ? fighters.left.hp : null;
    leaveBattle();
    setMode('map');
    if (fightFx.scale) { cam.s = fightFx.scale; fightFx.scale = 0; clampCam(); applyCam(); }
    if (sel.arena || sel.challenge) {
      refreshPlayerArt(); renderHud(); save();
      requestAnimationFrame(() => centerOn(st.pos, false));
      setTimeout(() => Screens.open('arena'), 60);
      return;
    }
    if (sel.lair) {
      const l = world.lairs.find((x) => x.id === sel.lair), run = Profile.data.lair;
      if (l && run && run.id === l.id) {
        if (result === 'win') {
          run.step++; run.hp = heroHp;
          if (run.step >= run.len) { const html = lairChest(l, run); resultCard(_t("Сундук логова!"), html); }
          else { save(); showLair(l); }
        } else {
          endLair(l);
          if (result === 'loss') { st.pos = HexMap.center(map); revealAround(st.pos); toast(_t("Вы проиграли и очнулись в деревне")); }
          else toast(_t("Вы покинули логово с добычей"));
        }
      }
      refreshPlayerArt(); renderMonsters(); renderHud(); marketNews();
      requestAnimationFrame(() => centerOn(st.pos, false));
      save();
      return;
    }
    if (result === 'win' && sp) {
      st.defeated[sp.id] = Date.now() + (sp.guest ? GUEST_REST_MS : RESPAWN_MS);
      if (st.swarm) delete st.swarm[sp.id];
      toast(sp.guest ? _t("{0} повержен. Ночной гость больше не вернётся этой ночью.", [Bestiary.MONSTERS[sp.species].name]) : _t("{0} повержен. Существо вернётся через {1} мин.", [Bestiary.MONSTERS[sp.species].name, RESPAWN_MS / 60000]));
    } else if (result === 'win' && sel.siege) {
      siegeWon(sel);
    } else if (result === 'win' && sel.ambush) {
      toast(_t("Засада отбита!"));
    } else if (result === 'win') {
      // Учебный бой (см. startTraining) — sp всегда null, своя реплика вместо «Вы отступили».
      toast(Profile.data.monster && Profile.data.monster.deep ? _t("Щука побеждена! Сундук ваш") : _t("Учебный бой выигран!"));
    } else if (result === 'revive') {
      toast(_t("Вы воскресли на месте гибели"));       // оплаченное воскрешение: герой остаётся на соте, существо ждёт
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
  function reviveBosses() { for (const sp of map.spawns) if (sp.boss) delete st.defeated[sp.id]; save(); renderMonsters(); }
  function focusBoss(id) {
    const sp = map.spawns.find((x) => x.boss === id), ch = Story.BY_ID[id];
    if (!sp) return toast(`${ch.title}: ${ch.where}`);
    if (!known(sp.idx)) { centerOn(sp.idx); return toast(_t("{0} где-то здесь, {1} — подойдите ближе, туман скрывает", [ch.title, ch.where])); }
    centerOn(sp.idx);
    if (alive(sp)) showMonster(sp); else toast(_t("{0} повержен и вернётся позже", [ch.title]));
  }

  /* ---------- режим разработчика (1.5.0): прыжки для чек-листа (js/devjump.js) ---------- */
  function devTeleport(idx, radius = 7) {
    closeCard(); walking = null;
    st.pos = idx;
    for (const n of HexMap.area(map, idx, radius)) revealed.add(n);
    renderMonsters(); placePlayer(false); centerOn(idx, false); drawPath(null); save();
  }
  // Открывает всю карту (проверки и снимки для рекламки): туман снимается, мини-карта перерисовывается.
  function devRevealAll() { for (const c of map.cells) revealed.add(c.idx); renderFog(); renderMonsters(); mini.dirty = true; drawMini(); save(); }
  function devFindTerrain(terrain) {
    const me = map.cells[st.pos];
    const ok = map.cells.map((c, i) => [c, i]).filter(([c, i]) => c.terrain === terrain && !blocked(i));
    ok.sort((a, b) => HexMap.dist(me, a[0]) - HexMap.dist(me, b[0]));
    return ok.length ? ok[0][1] : -1;
  }
  function devBuilding(id) {
    const b = map.buildings.find((x) => x.id === id);
    if (!b) return false;
    devTeleport((b.cells && b.cells[0]) || b.idx || 0, 5);
    openBuilding(id);
    return true;
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
    markNext(d);
  }
  // 1.8.3: «один явный следующий шаг» — мягкое свечение на том, что строка цели просит сделать: ближайший зверь (до первой победы) или здание с готовой / новой наградой-заданием
  let nextMonIdx = -1;
  function markNext(d) {
    if (!map || !el['l-village']) return;
    for (const g of document.querySelectorAll('.next-step')) g.classList.remove('next-step');
    let target = null; nextMonIdx = -1;
    if ((d.wins || 0) < 1) {
      const me = st.pos, cand = map.spawns.filter((sp) => alive(sp) && !sp.boss && !sp.zone && !sp.guest).sort((x, y) => HexMap.dist(map.cells[x.idx], map.cells[me]) - HexMap.dist(map.cells[y.idx], map.cells[me]));
      // 1.8.4: подсвечиваем ближайшего из тех, кого новичок видит целиком (не у самого края и не под кнопками); если таких нет — просто ближайшего
      const seen = (sp) => { const e = document.querySelector(`.mon[data-i="${sp.idx}"]`); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= 4 && r.right <= innerWidth - 4 && r.top >= 70 && r.bottom <= innerHeight - 70; };
      const vis = cand.slice(0, 40).find(seen), near = vis || cand[0];
      if (!vis && !markNext.retry) { markNext.retry = setTimeout(() => { markNext.retry = 0; if (map && (Profile.data.wins || 0) < 1) markNext(Profile.data); }, 900); }
      if (near) { nextMonIdx = near.idx; target = document.querySelector(`.mon[data-i="${near.idx}"]`); }
    } else {
      const list = Quests.list(d), isOpen = (q) => !(Unlocks.GIVERS && Unlocks.GIVERS[q.giver]) || Unlocks.isOpen(d, Unlocks.GIVERS[q.giver][0]);
      const q = list.find((x) => x.accepted && x.done && !x.claimed) || list.find((x) => !x.accepted && !x.claimed && isOpen(x));
      if (q) target = el['l-village'].querySelector(`.bldg[data-b="${(Unlocks.GIVERS && Unlocks.GIVERS[q.giver]) ? Unlocks.GIVERS[q.giver][0] : q.giver}"]`);
    }
    if (target) target.classList.add('next-step');
  }

  function renderHud() {
    if (!map || !el['map-me']) return;
    refreshLocks();
    const me = myView(), F = fac(), lv = Profile.levelInfo();
    const pct = lv.need === Infinity ? 100 : Math.round(lv.into / lv.need * 100);
    el['map-me'].innerHTML = _t("<span class=\"me-av\" style=\"border-color:{0}\">{1}<i class=\"me-lvl\">{2}</i></span>\n      <span class=\"me-txt\"><b>{3}</b><small class=\"me-fac\">{4}{5} · ур. {6}</small>\n        <span class=\"xpbar\" title=\"Опыт: {7} / {8}\"><i style=\"width:{9}%\"></i></span>\n        <small>ХП {10} · побед {11}</small>{12}</span>", [F.color, Figures.avatar(myKind(), Profile.gear()), lv.level, (escText(Profile.data.name && Profile.heroName()) || Factions.heroTitle(Profile.data.faction || 'dwarf', Profile.data.gender)) + Profile.favBadges(), factionIcon(Profile.data.faction || 'dwarf', 'mini-emblem'), F.name, lv.level, lv.into, lv.need === Infinity ? _t("максимум") : lv.need, pct, me.max, Profile.data.wins, MonsterArt.moneyHtml(Profile.data.coins)]);
    applyFrame(el['map-me'].querySelector('.me-av'));            // 1.5.1: рамка портрета из гардероба
  }

  // Рамка портрета (куплена в Ратуше → «Гардероб»): цветная кайма и свечение.
  function applyFrame(n) {
    const c = Village.frameColor(Profile.data.cosmetics);
    if (!n || !c) return;
    n.style.borderColor = c; n.style.boxShadow = `0 0 10px 2px ${c}`;
  }

  let saveWarned = false;
  function warnNoSave() {
    if (saveWarned || Profile.storageOk) return;
    saveWarned = true;
    toast(_t("Браузер не даёт сохранять игру — прогресс пропадёт при закрытии вкладки. Скачать сохранение можно в Ратуше."), 8000);
  }
  function toast(text, ms) {
    const t = el['map-toast'];
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 3200);
  }

  function bindHud() {
    const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    on('m-gear', () => Inventory.open('left'));
    if (el['siege-strip']) el['siege-strip'].addEventListener('click', siegeFocus);
    const sx = document.getElementById('sky-x'); if (sx) sx.addEventListener('click', (e) => { e.stopPropagation(); setSkyWin(false); toast(_t("Окошко погоды скрыто: вернуть можно в меню ☰")); });
    if (el['sky-chip']) { el['sky-chip'].addEventListener('click', skyCard); el['sky-chip'].addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); skyCard(); } }); }
    el['map-me'].style.cursor = 'pointer'; el['map-me'].addEventListener('click', () => Inventory.open('left'));
    on('m-best', () => Screens.openBestiary());
    on('m-mute', () => { Sound.setMuted(!Sound.muted); renderMute(); muteLabel(); });
    on('m-fs', () => toggleFullscreen());
    on('m-help', () => Screens.open('help'));
    on('m-lang', () => I18N.setLang(I18N.lang === 'ru' ? 'en' : 'ru'));
    document.getElementById('m-lang').textContent = I18N.lang === 'ru' ? 'EN' : 'RU';   // кнопка показывает язык, на который переключит
    on('m-credits', () => Screens.openCredits());
    // 1.5.3: на телефоне редкие кнопки спрятаны в меню ☰; плашка внизу раскрывается нажатием
    const menu = document.getElementById('map-menu'), mbtn = document.getElementById('m-more');
    document.getElementById('mm-lang').textContent = I18N.lang === 'ru' ? 'English' : 'Русский';
    document.getElementById('mm-anim').textContent = AnimSpeed.label();
    document.body.classList.toggle('map-lite', lite); document.getElementById('mm-lite').textContent = liteLabel();   // 1.7.2
    setSkyWin(skyWinOn);   // 1.7.6
    document.getElementById('mm-night').textContent = skyLabel('night'); document.getElementById('mm-wx').textContent = skyLabel('weather');   // 1.7.1
    const timerLabel = () => { document.getElementById('mm-timer').textContent = TurnTimerSetting.label(); };
    timerLabel(); window.addEventListener('turn-timer-changed', timerLabel);
    document.getElementById('map-ver').textContent = _t("Версия: {0} (Обновлено: {1})", [GAME_VERSION, GAME_UPDATED]);   // 1.6.4: мелкая надпись в меню
    mbtn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('click', (e) => { if (e.isTrusted && !menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-mdo]'); if (!b) return;
      if (b.dataset.mdo === 'm-timer') { TurnTimerSetting.toggle(); return; }     // 1.6.5: таймер хода (по умолчанию выкл), меню остаётся открытым
      if (b.dataset.mdo === 'm-night' || b.dataset.mdo === 'm-wx') {       // 1.7.1: время суток и погоду можно выключить, меню остаётся открытым
        const nm = b.dataset.mdo === 'm-night' ? 'night' : 'weather';
        Sky.setPref(nm, !Sky.pref(nm)); b.textContent = skyLabel(nm); skyRefresh();
        toast(Sky.pref(nm) ? (nm === 'night' ? _t("Время суток включено") : _t("Погода включена")) : (nm === 'night' ? _t("Время суток выключено: ночь не влияет на игру") : _t("Погода выключена: непогода не влияет на игру")));
        return;
      }
      if (b.dataset.mdo === 'm-skywin') { setSkyWin(!skyWinOn); toast(skyWinOn ? _t("Окошко погоды включено") : _t("Окошко погоды скрыто")); return; }   // меню остаётся открытым
      if (b.dataset.mdo === 'm-lite') {                                    // 1.7.2: упрощённая графика карты, меню остаётся открытым
        lite = !lite;
        try { localStorage.setItem(LITE_KEY, lite ? '1' : '0'); } catch (e) { /* ничего */ }
        document.body.classList.toggle('map-lite', lite); b.textContent = liteLabel();
        if (map) { renderStatic(); renderMonsters(); }
        toast(lite ? _t("Упрощённая графика: без украшений, дыма, облаков и осадков") : _t("Обычная графика карты"));
        return;
      }
      if (b.dataset.mdo === 'm-anim') { AnimSpeed.cycle(); b.textContent = AnimSpeed.label(); return; }     // 1.6.4: скорость анимаций, меню остаётся открытым
      if (b.dataset.mdo !== 'm-mute') menu.hidden = true;     // звук переключается, не закрывая меню
      document.getElementById(b.dataset.mdo).click();
    });
    if (!Profile.storageOk) { saveWarned = true; setTimeout(() => toast(_t("Браузер не даёт сохранять игру — прогресс пропадёт при закрытии вкладки. Скачать сохранение можно в Ратуше."), 8000), 2500); }
    // 1.6.6: вкладку закрыли посреди боя — это поражение: прочность надетых вещей −2
    const intr = Profile.interrupted;
    if (intr) { Profile.clearInterrupted(); setTimeout(() => toast(_t("Игра закрыта посреди боя — это поражение: прочность надетых вещей −2") + (intr.broken.length ? _t(". Сломались: {0}. Чинятся в Кузнице", [intr.broken.join(', ')]) : ''), 7000), 2800); }
    // 1.6.5 (A2-09): запись сломалась уже посреди игры — то же предупреждение; во время боя оно покажется по возвращении на карту
    window.addEventListener('profile-save-failed', () => { if (!document.body.classList.contains('mode-battle')) warnNoSave(); });
    const inf = document.querySelector('.map-info');
    if (inf) inf.addEventListener('click', () => inf.classList.toggle('open'));
    on('m-zin', () => { const v = view(); zoomAt(v.width / 2, v.height / 2, 1.25); });
    on('m-zout', () => { const v = view(); zoomAt(v.width / 2, v.height / 2, 1 / 1.25); });
    on('m-me', () => centerOn(st.pos));
    on('m-pin', () => setPinMode(!pinMode));
    on('m-log', () => { closeCard(); showJournal(); });
    on('m-mini', () => { const on2 = mini.canvas.hidden; st.mini = on2; applyMiniVisible(); save(); });
    on('m-home', () => { const h = HexMap.center(map); if (st.pos === h) toast(_t("Вы уже в деревне")); else walkTo(h, () => toast(_t("Вы в деревне"))); });
    el['map-card'].addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'close') closeCard();
      if (b.dataset.act === 'faction') { closeCard(); Screens.openFactions(false); }
      if (b.dataset.act === 'market') { closeCard(); Screens.open('market'); }
      if (b.dataset.act === 'village') { closeCard(); Screens.open('village'); }
      if (b.dataset.act === 'attack') attack(spById(b.dataset.sp));
      if (b.dataset.act === 'quick') quickFight(spById(b.dataset.sp));
      if (b.dataset.act === 'siege') siegeFight(b.dataset.siege, b.dataset.k);
      if (b.dataset.ev) eventAction(b);
      if (b.dataset.lair) lairAction(b);
      if (b.dataset.lm) landmarkAction(b);
      if (b.dataset.jump) { const i = Number(b.dataset.jump); closeCard(); centerOn(i); hover(-2); hover(i); }
      if (b.dataset.delpin) { togglePin(Number(b.dataset.delpin)); showJournal(); }
      if (b.dataset.act === 'export-save') exportSave();
      if (b.dataset.act === 'import-save') { const inp = document.getElementById('hall-import-input'); if (inp) inp.click(); }
    });
    el['map-card'].addEventListener('change', (e) => {
      const pt = e.target.closest('#mc-pet');
      if (pt) { Profile.setPetStay(!pt.checked); return; }
      const inp = e.target.closest('#hall-import-input');
      if (!inp || !inp.files || !inp.files[0]) return;
      importSaveFile(inp.files[0]);
    });
    const muteLabel = () => { const t = Sound.muted ? _t("Звук: выкл") : _t("Звук: вкл"); document.getElementById('m-mute').textContent = t; document.getElementById('mm-mute').textContent = t; };
    muteLabel();
  }


  /* ---------- 1.7.0: осада деревни ---------- */
  // К воротам приходит волна существ (js/siege.js), бои обычные. Башни перед боем снимают часть ХП с врага, забор держит осаду дольше
  // и прячет часть добычи — всё растёт с уровнем Ратуши. Не отбили за срок — враги уносят часть монет и ресурсов и убегают:
  // «похитители» стоят на карте ещё полчаса, победа над ними возвращает добычу.
  let siegeIv = null, siegeReadyAt = 0;
  const hallLevel = () => Village.lvl(Profile.data.village, 'hall');
  const fmtMs = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const lootText = (l) => [l && l.coins > 0 ? MonsterArt.moneyHtml(l.coins) : '', l && l.res ? `${Bestiary.RESOURCES[l.res.kind].name} (${Tiers.get(l.res.tier).name}) ×${l.res.n}` : ''].filter(Boolean).join(' · ');

  // Враги на карте: [{ r, looter }]
  function siegeTargets() {
    const s = st && st.siege;
    if (!s) return [];
    if (!s.over) return s.raiders.filter((r) => !r.dead).map((r) => ({ r, looter: false }));
    return Siege.liveLooters(s, Date.now()).map((r) => ({ r, looter: true }));
  }
  const siegeAt = (i) => siegeTargets().find((t) => t.r.idx === i && st.pos !== i) || null;

  function siegeToken(r, looter) {
    const p = px(r.idx), col = Tiers.get(r.tier).edge, T = Tiers.get(r.tier);
    const mark = looter
      ? '<g transform="translate(-15 -15)"><circle r="7" fill="#5a3b0c" stroke="#ffb347" stroke-width="1.2"/><circle r="3" fill="#ffd27a"/></g>'
      : '<g transform="translate(-15 -15)"><circle r="7" fill="#6a1410" stroke="#ff4a36" stroke-width="1.2"/><path d="M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5" stroke="#ffd2c8" stroke-width="1.6" stroke-linecap="round"/></g>';
    return `<g class="mon ${looter ? 'looter' : 'siege'}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(1.14)">
      <ellipse cy="18" rx="15" ry="4" fill="#000" opacity=".45"/>
      <g class="bob" style="animation-delay:${-(r.idx % 7) * 0.37}s">
        <circle r="21" fill="#1b1c20"/><g clip-path="url(#clip-token)">${monsterArt(r)}</g>
        <circle r="21" fill="none" stroke="${col}" stroke-width="3"/>
        <circle class="siege-ring" r="26" fill="none" stroke="${looter ? '#5fd0ff' : '#ffd23a'}" stroke-width="3" stroke-dasharray="6 3"/>
        <g class="tier-badge" transform="translate(15 14)"><circle r="7.5" fill="${T.color}" stroke="${col}" stroke-width="1.3"/><text y="3.4" fill="${T.ink}">${r.tier}</text></g>
        ${mark}
      </g></g>`;
  }
  function renderSiegeTokens(out) { for (const t of siegeTargets()) out.push(siegeToken(t.r, t.looter)); }

  // Полоса над подсказкой: ход осады или похитители; красные огни у ворот на время осады.
  function updateSiegeUi() {
    const s = st && st.siege, now = Date.now(), strip = el['siege-strip'];
    const act = Siege.active(s), looters = s && s.over ? Siege.liveLooters(s, now) : [];
    if (el['l-amb']) el['l-amb'].classList.toggle('siege', act);
    if (strip) {
      if (act) {
        strip.textContent = _t("⚔ Осада: отбито {0} из {1} · осталось {2}", [s.total - Siege.remaining(s), s.total, fmtMs(Siege.timeLeft(s, now))]);
        strip.title = _t("Нажмите, чтобы найти врага");
        strip.hidden = false;
      } else if (looters.length) {
        strip.textContent = _t("Похитители уходят с вашей добычей: {0} · ещё {1} мин.", [looters.length, Math.ceil((s.lootEnds - now) / 60000)]);
        strip.title = _t("Нажмите, чтобы найти похитителей");
        strip.hidden = false;
      } else strip.hidden = true;
    }
    if (s && s.over && !looters.length && !act) { st.siege = null; save(); }
    const need = !!st.siege && (act || looters.length > 0);
    if (need && !siegeIv) siegeIv = setInterval(siegeSecond, 1000);
    if (!need && siegeIv) { clearInterval(siegeIv); siegeIv = null; }
  }
  function siegeSecond() {
    if (!map || !st || !st.siege) return updateSiegeUi();
    const now = Date.now(), s = st.siege;
    if (document.body.classList.contains('mode-map')) {
      if (Siege.expired(s, now)) return siegeExpire();
      if (s.over && now >= s.lootEnds) { st.siege = null; save(); renderMonsters(); updateSiegeUi(); return toast(_t("Похитители скрылись вместе с добычей")); }
    }
    updateSiegeUi();
  }
  function siegeFocus() {
    const t = siegeTargets().sort((a, b) => HexMap.dist(map.cells[st.pos], map.cells[a.r.idx]) - HexMap.dist(map.cells[st.pos], map.cells[b.r.idx]))[0];
    if (!t) return;
    closeCard(); centerOn(t.r.idx); hover(-2); hover(t.r.idx);
  }

  // После загрузки страницы: осада, закончившаяся без игрока, просто ушла (без потерь).
  function siegeOnLoad() {
    const s = st.siege, now = Date.now();
    if (s) {
      if (!s.over && now >= s.t1) { st.siege = null; setTimeout(() => toast(_t("Осада закончилась, пока вас не было: враги ушли")), 1500); }
      else if (s.over && now >= s.lootEnds) st.siege = null;
    }
    if (siegeIv) { clearInterval(siegeIv); siegeIv = null; }
    updateSiegeUi();
  }

  // Свободные соты снаружи частокола у двух случайных ворот (видимые с самого начала).
  function siegeCells() {
    const taken = new Set([...spawnAt.keys(), ...evAt.keys(), ...lairAt.keys(), ...lmAt.keys(), st.pos]);
    const R = HexMap.VILLAGE_R, gates = [...map.gates].sort(() => Math.random() - 0.5).slice(0, 2);
    const lists = gates.map((g) => HexMap.area(map, g, 3).filter((i) => {
      const c = map.cells[i];
      return c.d > R && c.d <= R + 2 && !c.building && HexMap.passable(map, i) && !taken.has(i);
    }).map((i) => [i, HexMap.dist(map.cells[g], map.cells[i]) + Math.random()]).sort((a, b) => a[1] - b[1]).map((x) => x[0]));
    const out = [], seen = new Set();
    for (let k = 0; out.length < 5 && k < 8; k++) for (const l of lists) { const i = l.find((x) => !seen.has(x)); if (i !== undefined) { seen.add(i); out.push(i); } }
    return out;
  }

  function siegeStart() {
    if (!map || !st || Siege.active(st.siege)) return false;
    const cells = siegeCells();
    if (cells.length < 3) return false;
    const now = Date.now(), heroTier = Hero.tierFor(Profile.level());
    st.siege = Siege.make(Math.random, heroTier, cells, speciesFor, now, hallLevel());
    st.siegeLast = Siege.started(st.siegeLast, now, Profile.data.wins || 0);
    save(); renderMonsters(); updateSiegeUi(); mini.dirty = true; drawMini();
    toast(_t("К воротам идут существа! Отбейте осаду: врагов {0}, времени {1} мин. Башни обстреляют каждого перед боем.", [st.siege.total, Siege.defense(hallLevel()).minutes]), 6000);
    return true;
  }
  function siegeCheck() {
    if (!map || !st || /^#dev-/.test(location.hash)) return;
    if (!document.body.classList.contains('mode-map') || Date.now() < siegeReadyAt || Siege.active(st.siege)) return;
    const d = Profile.data;
    if (!d.faction || d.lair || (typeof Screens !== 'undefined' && Screens.isOpen) || (typeof Inventory !== 'undefined' && Inventory.isOpen)) return;
    if (Siege.due(st.siegeLast, Date.now(), d.wins || 0)) siegeStart();
  }
  // Для проверок: начать осаду немедленно.
  function devSiege() { if (!st) return null; st.siegeLast = null; siegeStart(); return st.siege; }

  // Срок вышел: оставшиеся враги уносят долю монет и пачку ресурсов и убегают.
  function siegeExpire() {
    const s = st.siege, d = Profile.data;
    const loot = Siege.theft(hallLevel(), Siege.remaining(s), s.total, d.coins, Profile.resList());
    if (loot.coins > 0) Profile.spend(loot.coins); else loot.coins = 0;
    if (loot.res && !Profile.takeRes(loot.res.kind, loot.res.tier, loot.res.n)) loot.res = null;
    if (!loot.coins && !loot.res) {
      st.siege = null; save(); renderMonsters(); updateSiegeUi(); renderHud();
      return toast(_t("Осада не отбита, но врагам нечего было взять — они ушли ни с чем"), 5000);
    }
    Siege.expire(s, Date.now(), loot);
    save(); renderMonsters(); updateSiegeUi(); renderHud(); mini.dirty = true; drawMini();
    resultCard(_t("Осада не отбита!"), `${_t("Враги ворвались и ушли с добычей: {0}.", [lootText(loot)])}<br>${_t("Похитители ещё полчаса стоят у деревни. Победите их, и добыча вернётся.")}`);
  }

  // Карточка врага осады: та же, что у обычного существа, но без быстрого боя и с обстрелом башен.
  function showRaider(r, looter) {
    const D = Siege.defense(hallLevel());
    showMonster({ id: r.id, idx: r.idx, species: r.species, tier: r.tier, siegeV: looter ? 0 : D.volley });
    const card = el['map-card'], a = card.querySelector('[data-act="attack"]');
    if (a) { a.dataset.act = 'siege'; a.dataset.siege = r.id; a.dataset.k = looter ? 'looter' : 'raider'; a.removeAttribute('data-sp'); }
    const q = card.querySelector('[data-act="quick"]'); if (q) q.remove();
    const note = looter
      ? _t("Похититель убегает с вашей добычей: {0}. Победите его, и добыча вернётся.", [lootText(r.loot) || _t("ничего")])
      : _t("Осада! Башни у ворот обстреляют врага перед боем: −{0}% ХП. Забор держит осаду {1} мин. и прячет добычу: унесут не больше {2}%.", [Math.round(D.volley * 100), D.minutes, Math.round(D.theft * 100)]);
    const chips = card.querySelector('.chips');
    if (chips) chips.insertAdjacentHTML('beforebegin', `<p class="hint siege-note">${note}</p>`);
  }

  function siegeFight(id, kind) {
    const s = st.siege;
    const r = s && (kind === 'looter' ? (s.looters || []).find((x) => x.id === id && !x.dead) : s.raiders.find((x) => x.id === id && !x.dead));
    closeCard();
    if (!r || (kind === 'looter' ? !(s.over && Date.now() < s.lootEnds) : s.over)) return;
    approach(r.idx, () => {
      if (!st.siege) return;
      zoomIn(r.idx, () => {
        walking = null;
        startSpecial({ id: r.species, tier: Math.min(r.tier, Hero.tierFor(Profile.level()) + 1), siege: r.id, siegeKind: kind, volley: kind === 'raider' ? Siege.defense(hallLevel()).volley : 0 });
      });
    });
  }

  // Победа в бою с врагом осады (вызывается из returnFromBattle).
  function siegeWon(sel) {
    const s = st.siege;
    if (!s) return toast(_t("Враг повержен"));
    if (sel.siegeKind === 'looter') {
      const loot = Siege.killLooter(s, sel.siege);
      if (loot) {
        if (loot.coins > 0) Profile.addCoins(loot.coins);
        if (loot.res) Profile.addRes(loot.res.kind, loot.res.tier, loot.res.n);
        toast(_t("Добыча возвращена: {0}", [lootText(loot) || _t("ничего")]), 4500);
      }
      updateSiegeUi();
      return;
    }
    const k = Siege.kill(s, sel.siege);
    if (k.won) return siegeVictory();
    toast(_t("Враг повержен. Отбито {0} из {1}", [s.total - Siege.remaining(s), s.total]), 3500);
    updateSiegeUi();
  }

  function siegeVictory() {
    const s = st.siege, T = s.tier, lines = [];
    const coins = Siege.rewardCoins(World.cacheCoins(T), s.total);
    Profile.addCoins(coins);
    lines.push(_t("Монеты: {0}", [MonsterArt.moneyHtml(coins)]));
    const drops = Bestiary.rollDrops(s.raiders[0].species, T, Math.random, Profile.data.faction, Hero.tierFor(Profile.level())).resources.slice(0, 2);
    for (const r of drops) { Profile.addRes(r.kind, r.tier, r.n); lines.push(`${Bestiary.RESOURCES[r.kind].name} (${Tiers.get(r.tier).name}) ×${r.n}`); }
    st.siege = null;
    save(); renderMonsters(); updateSiegeUi(); renderHud(); mini.dirty = true; drawMini();
    resultCard(_t("Осада отбита!"), `${_t("Деревня цела, жители благодарят.")}<br>${lines.join('<br>')}`);
  }

  // Раз в несколько секунд: вернулись ли побеждённые существа.
  /* ---------- 1.7.1: время суток, погода, ночные гости, штормовое предупреждение (js/sky.js) ---------- */
  const GUEST_REST_MS = 9 * 3600 * 1000;           // побеждённый ночной гость больше не возвращается до утра
  let guestList = [], skyNight = null, skyChip = '';
  const PHASE_NAME = { night: _t("Ночь"), dawn: _t("Рассвет"), day: _t("День"), dusk: _t("Вечер") };
  const spById = (id) => (/^\d+$/.test(String(id)) ? map.spawns[Number(id)] : guestList.find((g) => String(g.id) === String(id)));
  const skyHere = () => { const c = map && map.cells[st.pos]; return Sky.local(Sky.kindAt(), Sky.biomeOf(c ? c.terrain : '')); };

  // По ночам на карте появляются ночные гости (лунные мотыльки, огоньки, тени, призраки): дюжина на ночь, всё — на свободных сотах.
  function syncGuests(night, force) {
    const key = night ? Sky.nightKey() : '';
    if (!force && key === skyNight) return false;
    skyNight = key;
    for (const g of guestList) if (spawnAt.get(g.idx) === g) spawnAt.delete(g.idx);
    guestList = [];
    if (night) {
      const busy = new Set([...spawnAt.keys(), ...evAt.keys(), ...lairAt.keys(), ...lmAt.keys(), st.pos]), cells = [];
      for (const c of map.cells) {
        if (c.d <= HexMap.VILLAGE_R + 2 || c.road || c.building || c.bridge || c.ford || busy.has(c.idx) || !map.reachable.has(c.idx)) continue;
        if (c.terrain === 'beach' || !HexMap.TERRAIN[c.terrain].pass) continue;
        cells.push({ idx: c.idx, q: c.q, r: c.r, tier: tierOfCell(c.idx) });
      }
      let h = (st.seed ^ 0x6e17) >>> 0;
      for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
      guestList = Sky.guests(cells, HexMap.rng(h || 1), key, HexMap.dist);
      for (const g of guestList) spawnAt.set(g.idx, g);
    }
    return true;
  }

  const warnText = (w) => (w.active ? _t("{0}: идёт, ещё {1}", [Sky.NAMES[w.kind], Sky.span(w.left)]) : _t("{0} через {1}", [Sky.NAMES[w.kind], Sky.span(w.minutes)]));
  function skyTick(force) {
    if (!map || !el['sky-tint']) return;
    const t = Sky.now(), night = Sky.isNight(t), loc = skyHere(), w = Sky.warning(t), mv = el['map-view'];
    el['sky-tint'].setAttribute('fill', Sky.lightCss(t));
    if (mv.dataset.wx !== loc.vis) mv.dataset.wx = loc.vis;
    mv.classList.toggle('is-night', night);
    if (el['l-amb']) el['l-amb'].classList.toggle('warn', !!w);
    const chip = el['sky-chip'];
    if (chip) {
      const parts = [];
      if (Sky.pref('night')) parts.push(PHASE_NAME[Sky.phase(t)]);
      if (Sky.pref('weather')) parts.push(loc.name);
      if (w) parts.push(`⚠ ${w.active ? _t("ещё {0}", [Sky.span(w.left)]) : `${Sky.NAMES[w.kind]} ${_t("через {0}", [Sky.span(w.minutes)])}`}`);
      const txt = parts.join(' · ');
      if (txt !== skyChip) {
        skyChip = txt; chip.textContent = txt;
        chip.title = Sky.effectLines(Sky.kindAt(t), night, loc.name).join('\n') || _t("Нажмите, чтобы узнать подробнее");
        chip.classList.toggle('warn', !!w || loc.severe);
      }
      chip.hidden = !(Profile.data.wins >= 1) || !txt;
    }
    if (syncGuests(night, force) && document.body.classList.contains('mode-map')) renderMonsters();
    // предупреждение всплывает один раз на каждую непогоду
    if (w && document.body.classList.contains('mode-map') && !force) {
      const key = `${w.kind}|${w.from}|${w.active ? 1 : 0}`;
      if (st.skyNote !== key) {
        st.skyNote = key;
        toast(w.active ? `⚠ ${Sky.effectLines(w.kind, false, loc.name).slice(-1)[0] || loc.name}` : _t("Штормовое предупреждение: {0}. Подробности — у мельника", [warnText(w)]));
        save();
      }
    }
  }
  function skyCard() {
    const t = Sky.now(), kind = Sky.kindAt(t), night = Sky.isNight(t), loc = skyHere(), w = Sky.warning(t);
    const lines = Sky.effectLines(kind, night, loc.name);
    const head = [Sky.pref('night') ? PHASE_NAME[Sky.phase(t)] : '', Sky.pref('weather') ? loc.name : ''].filter(Boolean).join(' · ');
    const body = `<p><b>${head}</b></p>`
      + (lines.length ? lines.map((x) => `<p class="hint">${x}</p>`).join('') : `<p class="hint">${_t("Спокойно: ни ночь, ни погода на бои не влияют.")}</p>`)
      + (w ? `<p class="hint sky-warn">⚠ ${_t("Штормовое предупреждение")}: ${warnText(w)}</p>` : '')
      + `<p class="hint">${_t("Прогноз на сутки вперёд читает мельник — загляните на Мельницу.")}</p>`;
    resultCard(_t("Небо над картой"), body);
  }
  // Разработчику: подмена часов и явления (MapView.devSky({hour: 23, kind: 'storm'}), без аргумента — обычное небо).
  function devSky(o) { Sky.setDev(o || null); skyNight = null; skyChip = ''; skyTick(true); renderMonsters(); return Sky.dev; }
  // Настройки «Время суток» и «Погода» (меню ☰): применить сразу — перерисовать небо, чип и гостей.
  function skyRefresh() { skyNight = null; skyChip = ''; if (map) { skyTick(true); renderMonsters(); } }
  const skyLabel = (name) => (name === 'night' ? (Sky.pref('night') ? _t("Время суток: вкл") : _t("Время суток: выкл")) : (Sky.pref('weather') ? _t("Погода: вкл") : _t("Погода: выкл")));

  function tick() {
    if (!map) return;
    let changed = false;
    for (const [id, t] of Object.entries(st.defeated)) {
      if (t <= Date.now()) { delete st.defeated[id]; changed = true; }
    }
    if (changed && document.body.classList.contains('mode-map')) { renderMonsters(); revealAround(st.pos); save(); }
    siegeCheck();
    skyTick();
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
    get inBattle() { return !!battleSpawn; }, reviveOk() { if (!World.REVIVE_ON) return false; const sl = Profile.data.monster || {}; return !sl.arena && !sl.challenge && !sl.lair && (!!battleSpawn || !!sl.ambush); }, marketNews, focusBoss, reviveBosses,
    devTeleport, devBuilding, devFindTerrain, devRevealAll,
    // для тестов
    get state() { return st; }, get map() { return map; }, known, alive, walkTo, tap, attack,
    // 1.5.4
    startSpecial, quickFight, devSiege, devSky, skyRefresh, skyLabel, get guests() { return guestList; }, get siege() { return st && st.siege; }, get world() { return world; }, showEvent, showLair, eliteOf,
  };
})();
