/* Карта из шестиугольников (без интерфейса — можно тестировать в Node).

   Соты в осевых координатах (q, r), «остриём вверх». Карта — большой шестиугольник радиуса RADIUS
   с деревней в центре. Местность, дороги и места монстров строятся из зерна (seed),
   поэтому у каждого игрока своя карта, но она не меняется между запусками.

   Цвет (уровень) монстров растёт с удалением от деревни: у стен Красный, на краю карты Фиолетовый. */

const HM_B = (typeof Bestiary !== 'undefined') ? Bestiary : require('./bestiary.js');

const HexMap = (() => {
  const RADIUS = 14;                  // средняя карта: 631 сота
  const VILLAGE_R = 4;                // деревня: центр, пустое кольцо, кольцо зданий, ещё пустое, потом частокол
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  const TERRAIN = {
    meadow:   { name: 'Луг',    cost: 1,   pass: true },
    forest:   { name: 'Лес',    cost: 2,   pass: true },
    hills:    { name: 'Холмы',  cost: 2,   pass: true },
    swamp:    { name: 'Болото', cost: 3,   pass: true },
    water:    { name: 'Озеро',  cost: Infinity, pass: false },
    mountain: { name: 'Горы',   cost: Infinity, pass: false },
    village:  { name: 'Деревня', cost: 0.8, pass: true },
  };
  const ROAD_COST = 0.6;

  // Здания деревни: кольцо 2 вокруг площади (между ними и площадью — пустая сота, для простора).
  // dir — направление от центра.
  const BUILDINGS = {
    hall:   { name: 'Ратуша',          at: [0, 0], desc: 'Центр деревни. Сюда вы возвращаетесь после поражения.' },
    shop:   { name: 'Лавка',           at: [2, 0], desc: 'Покупка и продажа вещей, расходников и ресурсов.' },
    forge:  { name: 'Кузница',         at: [2, -2], desc: 'Улучшение цвета вещей и создание новых из ресурсов.' },
    hunter: { name: 'Охотничий дом',   label: 'Охотники', at: [0, -2], desc: 'Бестиарий: всё о встреченных существах.' },
    home:   { name: 'Ваш дом',         at: [-2, 0], desc: 'Экипировка и ранец.' },
    tavern: { name: 'Таверна',         at: [-2, 2], desc: 'Трактирщик даёт задания новичкам и рассказывает слухи.' },
    arena:  { name: 'Арена',           at: [0, 2], desc: 'Бои с другими игроками. Появится позже.', soon: true },
    mill:   { name: 'Мельница',        at: [-2, 1], desc: 'Добрый мышь даёт задания и делится мышиной мудростью.' },
    junker: { name: 'Хижина старьёвщика', label: 'Старьёвщик', at: [2, -1],
      desc: 'Скупает ненужные вещи не глядя — дешевле Лавки, зато сразу и все разом, без лишней возни.' },
    library: { name: 'Библиотека', at: [-1, -1],
      desc: 'Бобёр-хранитель держит бестиарий и знает всё о вещах. Каждый день — новое поручение.' },
    // Между Ареной и Лавкой — последний свободный слот кольца зданий (были ещё [1,-2] между Кузницей и
    // Охотничьим домом, [-1,2] между Таверной и Ареной). Соседство с Лавкой логично: руны раньше
    // продавались там же как временная затычка (см. js/runes.js), теперь у них свой дом.
    artistWorkshop: { name: 'Мастерская художника', label: 'Мастерская', at: [1, 1],
      desc: 'Журавль-художник продаёт и вставляет руны — теперь в каждой вещи по 2 гнезда.' },
  };
  const GATE_DIRS = [0, 2, 4];         // ворота и дороги: восток, северо-запад, юго-запад

  // Где водятся существа: диапазон цветов и любимая местность.
  const SPAWN = {
    rat:      { tiers: [1, 3],  terrain: { meadow: 2, swamp: 2, forest: 1, hills: 1 } },
    wolf:     { tiers: [1, 4],  terrain: { forest: 3, meadow: 1, hills: 1 } },
    bandit:   { tiers: [2, 5],  terrain: { meadow: 2, forest: 2, hills: 1 }, nearRoad: 3 },
    goblin:   { tiers: [2, 6],  terrain: { forest: 2, hills: 2, swamp: 1 } },
    skeleton: { tiers: [3, 7],  terrain: { swamp: 3, hills: 1, meadow: 1 } },
    boar:     { tiers: [3, 6],  terrain: { forest: 3, meadow: 2 } },
    troll:    { tiers: [5, 9],  terrain: { hills: 3, forest: 1, swamp: 1 } },
    golem:    { tiers: [6, 10], terrain: { hills: 4, meadow: 1 } },
    wraith:   { tiers: [7, 10], terrain: { swamp: 4, forest: 1 } },
    dragon:   { tiers: [8, 10], terrain: { hills: 3, meadow: 1 }, rare: 0.3 },
    orc:      { tiers: [3, 8],  terrain: { hills: 3, meadow: 2, forest: 1 }, nearRoad: 1.5 },
    orcShaman:{ tiers: [4, 9],  terrain: { hills: 2, forest: 2, swamp: 1 } },
    ghoul:    { tiers: [3, 8],  terrain: { swamp: 3, forest: 2 } },
    crab:     { tiers: [2, 6],  terrain: { swamp: 4, meadow: 1 } },
    bolotnik: { tiers: [3, 7],  terrain: { swamp: 4, forest: 1 } },
    shadow:   { tiers: [6, 10], terrain: { forest: 2, hills: 2, swamp: 1 }, rare: 0.6 },
    treant:   { tiers: [7, 10], terrain: { forest: 4, hills: 1 } },
    mushroom: { tiers: [6, 10], terrain: { forest: 3, swamp: 2, hills: 1 } },
    // Опасный: сопоставимо с Тенью/Древенем по цветовому диапазону, но фактическая опасность одной
    // встречи скачет от «лёгкой пчелы» до «смертельного роя» — см. Bestiary.MONSTERS.wildbees.swarm.
    wildbees: { tiers: [6, 10], terrain: { meadow: 3, forest: 2, hills: 1 } },
  };
  // Плотность монстров: у деревни гуще (новичкам есть с кем сражаться), дальше реже.
  const spawnDensity = (d) => (d <= 6 ? 0.36 : d <= 9 ? 0.2 : 0.13);

  /* ---------- координаты ---------- */
  const key = (q, r) => q + ',' + r;
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  const SQ3 = Math.sqrt(3);
  const toPixel = (q, r, size) => ({ x: size * SQ3 * (q + r / 2), y: size * 1.5 * r });
  function fromPixel(x, y, size) {
    const qf = (SQ3 / 3 * x - y / 3) / size, rf = (2 / 3 * y) / size, sf = -qf - rf;
    let q = Math.round(qf), r = Math.round(rf); const s = Math.round(sf);
    const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
    if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
    return { q: q + 0, r: r + 0 };                  // + 0 убирает «минус ноль»
  }
  // Номер ступени цвета по удалению от центра.
  // Рост плавный у деревни и быстрее к краю: 2 кольца Меди, 2 — Серебра, дальше примерно по кольцу на цвет.
  function tierAt(d) {
    if (d <= VILLAGE_R) return 0;
    const x = (d - VILLAGE_R - 1) / (RADIUS - VILLAGE_R - 1);
    return Math.max(1, Math.min(10, 1 + Math.floor(Math.pow(x, 1.3) * 10)));
  }

  /* ---------- случайность из зерна ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(seed, x, y) {
    let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  function noise(seed, x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
    const a = hash2(seed, x0, y0), b = hash2(seed, x0 + 1, y0), c = hash2(seed, x0, y0 + 1), d = hash2(seed, x0 + 1, y0 + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  const fbm = (seed, x, y) => 0.55 * noise(seed, x / 4.2, y / 4.2) + 0.3 * noise(seed + 17, x / 2.1, y / 2.1) + 0.15 * noise(seed + 31, x / 1.1, y / 1.1);

  /* ---------- генерация ---------- */
  function generate(seed) {
    const rand = rng(seed);
    const cells = [], index = new Map();
    for (let q = -RADIUS; q <= RADIUS; q++) {
      for (let r = Math.max(-RADIUS, -q - RADIUS); r <= Math.min(RADIUS, -q + RADIUS); r++) {
        const idx = cells.length;
        cells.push({ idx, q, r, d: dist({ q, r }, { q: 0, r: 0 }), terrain: 'meadow', road: false, bridge: false, building: null, deco: hash2(seed + 99, q, r) });
        index.set(key(q, r), idx);
      }
    }
    const map = { seed, radius: RADIUS, cells, index, buildings: [], spawns: [], gates: [] };

    // местность из высоты и влажности
    for (const c of cells) {
      const p = toPixel(c.q, c.r, 1);
      let e = fbm(seed, p.x, p.y);
      const m = fbm(seed + 1000, p.x, p.y);
      if (c.d <= VILLAGE_R + 2) e = 0.45 + (e - 0.45) * 0.3;      // у деревни ровно: нет гор и озёр
      let t;
      if (e < 0.3) t = 'water';
      else if (e > 0.7) t = 'mountain';
      else if (e > 0.6) t = 'hills';
      else if (m > 0.62 && e < 0.47) t = 'swamp';
      else if (m > 0.5) t = 'forest';
      else t = 'meadow';
      c.terrain = t;
      if (c.d <= VILLAGE_R) c.terrain = 'village';
    }

    // здания
    for (const [id, b] of Object.entries(BUILDINGS)) {
      const idx = index.get(key(b.at[0], b.at[1]));
      cells[idx].building = id;
      map.buildings.push({ id, idx });
    }

    // ворота и дороги к краю карты
    for (const dir of GATE_DIRS) {
      const [dq, dr] = DIRS[dir];
      const gate = index.get(key(dq * VILLAGE_R, dr * VILLAGE_R));
      map.gates.push(gate);
      // цель — сота у края в том же направлении, чуть в сторону
      const side = DIRS[(dir + 2) % 6], shift = Math.floor(rand() * 5) - 2;
      let tq = dq * (RADIUS - 1) + side[0] * shift, tr = dr * (RADIUS - 1) + side[1] * shift;
      if (!index.has(key(tq, tr))) { tq = dq * (RADIUS - 1); tr = dr * (RADIUS - 1); }
      const path = roadPath(map, gate, index.get(key(tq, tr)));
      for (const i of [gate, ...path]) {
        const c = cells[i];
        if (c.d <= VILLAGE_R && i !== gate) continue;
        c.road = true;
        if (c.terrain === 'water') c.bridge = true;
        if (c.terrain === 'mountain') c.terrain = 'hills';       // перевал
      }
    }

    // какие соты достижимы из деревни
    const reach = new Set([0].map(() => index.get(key(0, 0))));
    const queue = [...reach];
    while (queue.length) {
      const i = queue.shift();
      for (const n of neighbors(map, i)) if (!reach.has(n) && passable(map, n)) { reach.add(n); queue.push(n); }
    }
    map.reachable = reach;

    // монстры
    const nearRoad = (i) => cells[i].road || neighbors(map, i).some((n) => cells[n].road);
    const taken = new Set();
    for (const c of cells) {
      if (c.d <= VILLAGE_R || c.road || !reach.has(c.idx) || !TERRAIN[c.terrain].pass) continue;
      if (rand() > spawnDensity(c.d)) continue;
      if (neighbors(map, c.idx).some((n) => taken.has(n))) continue;
      let tier = tierAt(c.d);
      const roll = rand();
      if (roll < 0.15 && tier > 1) tier--;
      else if (roll > 0.93 && tier < 10) tier++;                  // изредка — существо посильнее
      const species = pickSpecies(tier, c.terrain, nearRoad(c.idx), rand);
      taken.add(c.idx);
      map.spawns.push({ id: map.spawns.length, idx: c.idx, species, tier });
    }
    return map;
  }

  function pickSpecies(tier, terrain, road, rand) {
    const pool = [];
    for (const [id, s] of Object.entries(SPAWN)) {
      if (tier < s.tiers[0] || tier > s.tiers[1]) continue;
      let w = (s.terrain[terrain] || 0.25) * (s.rare || 1);
      if (road && s.nearRoad) w *= s.nearRoad;
      pool.push([id, w]);
    }
    if (!pool.length) return tier <= 5 ? 'wolf' : 'troll';
    let sum = pool.reduce((a, [, w]) => a + w, 0), x = rand() * sum;
    for (const [id, w] of pool) { x -= w; if (x <= 0) return id; }
    return pool[pool.length - 1][0];
  }

  // Дорога: дешевле по лугам, дороже по лесу и болотам; озёра — мостом, горы — перевалом.
  function roadPath(map, from, to) {
    const cost = (a, i) => ({ meadow: 1, village: 1, forest: 2.2, hills: 2.6, swamp: 3, water: 7, mountain: 14 }[map.cells[i].terrain]);
    return astar(map, from, to, cost, () => false);
  }

  /* ---------- соседи и проходимость ---------- */
  function neighbors(map, i) {
    const c = map.cells[i], out = [];
    for (const [dq, dr] of DIRS) {
      const n = map.index.get(key(c.q + dq, c.r + dr));
      if (n !== undefined) out.push(n);
    }
    return out;
  }
  const passable = (map, i) => map.cells[i].bridge || TERRAIN[map.cells[i].terrain].pass;
  const moveCost = (map, i) => (map.cells[i].road ? ROAD_COST : TERRAIN[map.cells[i].terrain].cost);

  // Частокол деревни: шаг между сотой деревни (d <= VILLAGE_R) и сотой снаружи (d > VILLAGE_R) —
  // а такие соседние пары есть только на самой границе, d === VILLAGE_R и d === VILLAGE_R+1 —
  // разрешён только через ворота: внутренняя сота должна быть воротами (map.gates), а внешняя —
  // дорогой от них (та же проверка, что рисует проём в частоколе в mapview.js).
  function fenceBlocks(map, from, to) {
    const a = map.cells[from], b = map.cells[to];
    const insideA = a.d <= VILLAGE_R, insideB = b.d <= VILLAGE_R;
    if (insideA === insideB) return false;              // не граница деревни
    const gateCell = insideA ? from : to, outCell = insideA ? to : from;
    return !(map.gates.includes(gateCell) && map.cells[outCell].road);
  }

  // A*: список сот пути БЕЗ стартовой. cost(from, to) — цена шага from → to (Infinity — нельзя).
  function astar(map, start, goal, cost, blocked) {
    if (start === goal) return [];
    const g = new Map([[start, 0]]), came = new Map();
    const open = [[dist(map.cells[start], map.cells[goal]) * 0.6, start]];
    const closed = new Set();
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur === goal) {
        const path = [];
        for (let x = goal; x !== start; x = came.get(x)) path.push(x);
        return path.reverse();
      }
      if (closed.has(cur)) continue;
      closed.add(cur);
      for (const n of neighbors(map, cur)) {
        if (closed.has(n) || (blocked(n) && n !== goal)) continue;
        const c = cost(cur, n);
        if (!isFinite(c)) continue;
        const ng = g.get(cur) + c;
        if (ng < (g.has(n) ? g.get(n) : Infinity)) {
          g.set(n, ng);
          came.set(n, cur);
          open.push([ng + dist(map.cells[n], map.cells[goal]) * 0.6, n]);
        }
      }
    }
    return null;
  }

  // Путь игрока. known(i) — открыта ли сота: неизвестные считаются проходимыми (цена 1),
  // а когда откроются — путь перестраивается. blocked(i) — занята монстром. Частокол деревни
  // пропускает только через ворота (fenceBlocks), даже по неизведанной земле.
  function findPath(map, start, goal, known, blocked) {
    const cost = (from, to) => {
      if (fenceBlocks(map, from, to)) return Infinity;
      return known(to) ? (passable(map, to) ? moveCost(map, to) : Infinity) : 1;
    };
    return astar(map, start, goal, cost, blocked);
  }

  // Соты в радиусе r от соты i (включая её).
  function area(map, i, r) {
    const c = map.cells[i], out = [];
    for (let dq = -r; dq <= r; dq++) {
      for (let dr = Math.max(-r, -dq - r); dr <= Math.min(r, -dq + r); dr++) {
        const n = map.index.get(key(c.q + dq, c.r + dr));
        if (n !== undefined) out.push(n);
      }
    }
    return out;
  }

  const center = (map) => map.index.get(key(0, 0));
  const terrainName = (map, i) => {
    const c = map.cells[i];
    if (c.building) return BUILDINGS[c.building].name;
    if (c.bridge) return 'Мост';
    if (c.road) return 'Дорога';
    return TERRAIN[c.terrain].name;
  };

  return {
    RADIUS, VILLAGE_R, DIRS, TERRAIN, BUILDINGS, SPAWN, GATE_DIRS,
    key, dist, toPixel, fromPixel, tierAt, rng, generate, neighbors, passable, moveCost, findPath, area, center, terrainName, fenceBlocks,
  };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = HexMap;
