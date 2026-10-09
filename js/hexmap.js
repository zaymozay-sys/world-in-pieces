if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Карта из шестиугольников (без интерфейса — можно тестировать в Node).

   Соты в осевых координатах (q, r), «остриём вверх». Карта — большой шестиугольник радиуса RADIUS
   с деревней в центре. Местность, дороги и места монстров строятся из зерна (seed),
   поэтому у каждого игрока своя карта, но она не меняется между запусками.

   Цвет (уровень) монстров растёт с удалением от деревни: у стен Красный, на краю карты Фиолетовый. */

const HM_B = (typeof Bestiary !== 'undefined') ? Bestiary : require('./bestiary.js');
const HM_S = (typeof Story !== 'undefined') ? Story : require('./story.js');

const HexMap = (() => {
  const RADIUS = 23;                  // большая карта: 1657 сот (море на западе и востоке); в 1.2.6 выросла вместе с деревней
  const VILLAGE_R = 7;                // деревня (1.2.6): Ратуша на 7 сотах, площадь, 12 усадеб по 3 соты, кольцо прохода у частокола
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  const TERRAIN = {
    meadow:   { name: _t("Луг"),    cost: 1,   pass: true },
    forest:   { name: _t("Лес"),    cost: 2,   pass: true },
    hills:    { name: _t("Холмы"),  cost: 2,   pass: true },
    swamp:    { name: _t("Болото"), cost: 3,   pass: true },
    water:    { name: _t("Озеро"),  cost: Infinity, pass: false },
    mountain: { name: _t("Горы"),   cost: Infinity, pass: false },
    village:  { name: _t("Деревня"), cost: 0.8, pass: true },
    sea:      { name: _t("Море"),   cost: Infinity, pass: false },
    beach:    { name: _t("Берег"),  cost: 1.4, pass: true },
  };
  const ROAD_COST = 0.6;

  // Здания деревни (1.2.7): зеркально-симметричный город. Главная улица идёт с запада на восток через площадь
  // (ворота только на западе и востоке). Ратуша — «цветок» из 7 сот в центре, вокруг пустое кольцо-площадь;
  // 12 усадеб по 3 соты (треугольник): 6 над улицей и 6 под ней, каждая половина симметрична слева-направо,
  // нижняя — зеркало верхней. Между усадьбами минимум сота прохода, до частокола — одно свободное кольцо.
  // cells — все соты здания (нажатие на любую открывает его); at — первая сота (якорь); scale — масштаб рисунка.
  const HALL_CELLS = [[0, 0], ...DIRS];
  const BUILDINGS = {
    hall: { name: _t("Ратуша"), cells: HALL_CELLS, scale: 3.9, desc: _t("Центр деревни. Сюда вы возвращаетесь после поражения.") },
    artistWorkshop: { name: _t("Мастерская художника"), label: _t("Мастерская"), desc: _t("Журавль-художник продаёт и вставляет руны — теперь в каждой вещи по 2 гнезда."), cells: [[0, -4], [1, -4], [1, -5]] },
    junker: { name: _t("Хижина старьёвщика"), label: _t("Старьёвщик"), desc: _t("Скупает ненужные вещи не глядя — дешевле Лавки, зато сразу и все разом, без лишней возни."), cells: [[4, -4], [3, -4], [4, -5]] },
    forge: { name: _t("Кузница"), desc: _t("Улучшение цвета вещей и создание новых из ресурсов."), cells: [[-2, -2], [-1, -2], [-2, -1]] },
    shop: { name: _t("Лавка"), desc: _t("Покупка и продажа вещей, расходников и ресурсов."), cells: [[4, -2], [3, -2], [3, -1]] },
    hunter: { name: _t("Охотничий дом"), label: _t("Охотники"), desc: _t("Бестиарий: всё о встреченных существах."), cells: [[-5, -1], [-4, -1], [-4, -2]] },
    tavern: { name: _t("Таверна"), desc: _t("Трактирщик даёт задания новичкам и рассказывает слухи."), cells: [[6, -1], [5, -1], [6, -2]] },
    library: { name: _t("Библиотека"), desc: _t("Бобёр-хранитель держит бестиарий и знает всё о вещах. Каждый день — новое поручение."), cells: [[-4, 2], [-3, 2], [-3, 1]] },
    home: { name: _t("Ваш дом"), desc: _t("Оружейная: сундук с вещами, кладовая, смена снаряжения."), cells: [[2, 2], [1, 2], [2, 1]] },
    mill: { name: _t("Мельница"), desc: _t("Добрый мышь даёт задания и делится мышиной мудростью."), cells: [[-4, 4], [-3, 4], [-4, 5]] },
    kennel: { name: _t("Питомник"), desc: _t("Смотрительница Ласка лечит, кормит и обучает прирученных питомцев."), cells: [[0, 4], [-1, 4], [-1, 5]] },
    arena: { name: _t("Арена"), desc: _t("Арена теней: бои с тенями героев, ранги и титулы. И Испытание дня — одно поле на всех."), cells: [[-6, 1], [-5, 1], [-6, 2]] },
    alchemist: { name: _t("Алхимик"), desc: _t("Тётушка Жабка варит зелья и эликсиры из добытых ресурсов."), cells: [[5, 1], [4, 1], [4, 2]] },
  };
  for (const b of Object.values(BUILDINGS)) { b.at = b.cells[0]; if (!b.scale) b.scale = 3.0; }
  // Достопримечательности побережья (версия 1.1.10): стоят на пляже у моря, дороги к ним ведут от ворот.
  // На западе — маяк с тюленем-смотрителем, на востоке — выброшенная на берег бригантина и запертый сундук.
  BUILDINGS.lighthouse = { name: _t("Маяк"), at: [-18, 1], landmark: true, gate: 3, scale: 2.3,
    desc: _t("Старый тюлень-смотритель следит за огнём маяка, даёт поручения и хранит ключ от сундука с затонувшего корабля.") };
  BUILDINGS.wreck = { name: _t("Кораблекрушение"), label: _t("Бригантина"), at: [18, -1], landmark: true, gate: 0, scale: 2.4,
    desc: _t("Бригантина села на мель у восточного берега. Рядом на песке стоит запертый сундук, а берег охраняет Капитан.") };
  BUILDINGS.chest = { name: _t("Запертый сундук"), label: _t("Сундук"), at: [19, -2], landmark: true, gate: 0, scale: 1.7,
    desc: _t("Окованный железом сундук на песке у бригантины. Ключ хранит тюлень-смотритель маяка.") };
  BUILDINGS.chestRuby = { name: _t("Рубиновый сундук"), label: _t("Рубиновый"), at: [18, 2], landmark: true, gate: 0, scale: 1.6,
    desc: _t("Сундук с рубинами в крышке стоит на восточных камнях. Ключ мастерит старьёвщик.") };
  BUILDINGS.chestEmerald = { name: _t("Изумрудный сундук"), label: _t("Изумрудный"), at: [-18, -1], landmark: true, gate: 3, scale: 1.6,
    desc: _t("Сундук с изумрудами прячется в зарослях у маяка. Ключ — «Живой ключ» — варит алхимик.") };
  BUILDINGS.chestObsidian = { name: _t("Серебряный сундук"), label: _t("Серебряный"), at: [20, 0], landmark: true, gate: 0, scale: 1.6,
    desc: _t("Серебряный сундук с обсидианом лежит под водой у бригантины. Нужно уметь дышать под водой.") };
  // 1.5.4: Врата подземелья — на северных холмах за деревней; пока заперты (soon), внутрь не войти.
  BUILDINGS.dungeon = { name: _t("Врата подземелья"), label: _t("Подземелье"), at: [0, -12], post: true, soon: true, scale: 2.6,
    desc: _t("Массивные железные ворота в склоне холма. Вход пока закрыт: подземелье в разработке. Внутри будут монстры, которые становятся сильнее с каждым этажом.") };
  const GATE_DIRS = [0, 3];          // 1.2.7: ворота и главная улица — восток и запад (симметрия города); от каждых ворот 3 дороги

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
    crab:     { tiers: [2, 6],  terrain: { swamp: 4, meadow: 1, beach: 4 } },
    bolotnik: { tiers: [3, 7],  terrain: { swamp: 4, forest: 1 } },
    shadow:   { tiers: [6, 10], terrain: { forest: 2, hills: 2, swamp: 1 }, rare: 0.6 },
    treant:   { tiers: [7, 10], terrain: { forest: 4, hills: 1 } },
    mushroom: { tiers: [6, 10], terrain: { forest: 3, swamp: 2, hills: 1 } },
    // Опасный: сопоставимо с Тенью/Древенем по цветовому диапазону, но фактическая опасность одной
    // встречи скачет от «лёгкой пчелы» до «смертельного роя» — см. Bestiary.MONSTERS.wildbees.swarm.
    wildbees: { tiers: [6, 10], terrain: { meadow: 3, forest: 2, hills: 1 } },
    // Рысь (Изворотливость) и Шипастый ёж (Возмездие) — звери ранних зон; без этих строк экран бестиария падал.
    lynx:     { tiers: [2, 5],  terrain: { forest: 3, hills: 2, meadow: 1 } },
    hedgehog: { tiers: [1, 4],  terrain: { meadow: 3, forest: 2, hills: 1 } },
    // 1.2.0: нижние уровни и побережье
    viper:    { tiers: [1, 4],  terrain: { meadow: 3, hills: 2, forest: 1 }, nearRoad: 1.5 },
    spider:   { tiers: [1, 5],  terrain: { forest: 4, swamp: 1 } },
    vulture:  { tiers: [2, 6],  terrain: { hills: 3, meadow: 1 } },
    wisp:     { tiers: [3, 6],  terrain: { swamp: 4 }, rare: 0.35 },          // мини-босс болот
    gull:     { tiers: [1, 4],  terrain: { beach: 4, meadow: 0.5 } },
    hermit:   { tiers: [2, 6],  terrain: { beach: 4 } },
    smuggler: { tiers: [3, 7],  terrain: { beach: 3, meadow: 1 }, nearRoad: 2 },
    // 1.3.8: новые звери и чудовища
    fox: { tiers: [2, 5],  terrain: { forest: 3, meadow: 2, hills: 1 } },
    badger: { tiers: [2, 5],  terrain: { forest: 2, hills: 3, meadow: 1 } },
    owl: { tiers: [3, 6],  terrain: { forest: 4, hills: 1 } },
    otter: { tiers: [2, 5],  terrain: { swamp: 3, beach: 3 } },
    heron: { tiers: [2, 6],  terrain: { swamp: 3, beach: 2 } },
    elk: { tiers: [4, 7],  terrain: { forest: 3, meadow: 2 } },
    goat: { tiers: [4, 8],  terrain: { hills: 4 } },
    eagle: { tiers: [5, 9],  terrain: { hills: 3, meadow: 1 } },
    rhino: { tiers: [5, 9],  terrain: { meadow: 3, hills: 2 } },
    leopard: { tiers: [6, 10], terrain: { hills: 3, forest: 1 } },
    leech: { tiers: [3, 7],  terrain: { swamp: 4 } },
    mimic: { tiers: [4, 8],  terrain: { hills: 2, beach: 2, meadow: 1 }, rare: 0.5 },
    salamander: { tiers: [6, 10], terrain: { hills: 2, swamp: 2 } },
    bear: { tiers: [4, 8],  terrain: { forest: 4, hills: 1 }, rare: 0.3 },
    griffin: { tiers: [8, 10], terrain: { hills: 4 }, rare: 0.3 },
    wyvern: { tiers: [8, 10], terrain: { hills: 2, swamp: 2 }, rare: 0.3 },
    basilisk: { tiers: [8, 10], terrain: { swamp: 4, forest: 1 }, rare: 0.3 },
    captain:  { tiers: [8, 8],  terrain: {}, fixed: true },                    // босс востока: ставится вручную у сундука
  };
  // Плотность монстров: у деревни гуще (новичкам есть с кем сражаться), дальше реже.
  const spawnDensity = (d) => (d <= VILLAGE_R + 2 ? 0.36 : d <= VILLAGE_R + 5 ? 0.2 : 0.13);

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
      // Море по краям: западный и восточный берега (извилистая линия прибоя), у воды — полоса пляжа.
      const xs = c.q + c.r / 2, wig = (fbm(seed + 555, p.x, p.y) - 0.5) * 3.2;
      if (Math.abs(xs) + wig > RADIUS - 3.5) t = 'sea';
      else if (Math.abs(xs) + wig > RADIUS - 5.5) t = 'beach';
      c.terrain = t;
      if (c.d <= VILLAGE_R) c.terrain = 'village';
    }
    // место под достопримечательности — всегда пляж
    for (const b of Object.values(BUILDINGS)) {
      if (!b.landmark) continue;
      const ci = cells[index.get(key(b.at[0], b.at[1]))];
      ci.terrain = 'beach';
      for (const [dq, dr] of DIRS) { const n = cells[index.get(key(ci.q + dq, ci.r + dr))]; if (n && n.terrain === 'sea' && Math.abs(n.q + n.r / 2) < Math.abs(ci.q + ci.r / 2)) n.terrain = 'beach'; }
    }

    // здания
    for (const [id, b] of Object.entries(BUILDINGS)) {
      if (b.post) continue;                      // ставится после монстров, ничего не сдвигая (см. ниже)
      const own = (b.cells || [b.at]).map(([q, r]) => index.get(key(q, r)));
      for (const i of own) cells[i].building = id;
      map.buildings.push({ id, idx: own[0], cells: own });
    }

    // ворота и дороги к краю карты
    for (const gdir of GATE_DIRS) {
     const [gq, gr] = DIRS[gdir];
     const gate = index.get(key(gq * VILLAGE_R, gr * VILLAGE_R));
     map.gates.push(gate);
     // от ворот расходятся три дороги: прямо и по соседним направлениям (на северо- и юго-восток/запад)
     for (const dir of [gdir, (gdir + 1) % 6, (gdir + 5) % 6]) {
      const [dq, dr] = DIRS[dir];
      // цель — сота у края в том же направлении, чуть в сторону
      const side = DIRS[(dir + 2) % 6], shift = Math.floor(rand() * 5) - 2;
      let tq = dq * (RADIUS - 1) + side[0] * shift, tr = dr * (RADIUS - 1) + side[1] * shift;
      if (!index.has(key(tq, tr))) { tq = dq * (RADIUS - 1); tr = dr * (RADIUS - 1); }
      while (cells[index.get(key(tq, tr))].terrain === 'sea') { tq -= dq; tr -= dr; }   // дорога не уходит в море
      // дорога начинается с соты сразу за воротами (иначе путь мог бы «срезать» через деревню)
      const out = index.get(key(gq * (VILLAGE_R + 1), gr * (VILLAGE_R + 1)));
      const path = roadPath(map, out, index.get(key(tq, tr)));
      for (const i of [gate, out, ...path]) {
        const c = cells[i];
        if (c.d <= VILLAGE_R && i !== gate) continue;
        c.road = true;
        if (c.terrain === 'water') c.bridge = true;
        if (c.terrain === 'mountain') c.terrain = 'hills';       // перевал
      }
     }
    }

    // главная улица деревни (от ворот к площади) — c.street: по ней всегда можно пройти нажатием (см. MapView.cellAt)
    for (const gdir of GATE_DIRS) for (let k = 1; k <= VILLAGE_R; k++) cells[index.get(key(DIRS[gdir][0] * k, DIRS[gdir][1] * k))].street = true;

    // дороги к маяку и кораблю
    for (const b of Object.values(BUILDINGS)) {
      if (!b.landmark) continue;
      const [gq, gr] = DIRS[b.gate], out = index.get(key(gq * (VILLAGE_R + 1), gr * (VILLAGE_R + 1)));
      for (const i of roadPath(map, out, index.get(key(b.at[0], b.at[1])))) {
        const c = cells[i];
        c.road = true;
        if (c.terrain === 'water') c.bridge = true;
        if (c.terrain === 'mountain') c.terrain = 'hills';
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
    let captain = null;
    // босс побережья: Капитан стоит на пляже рядом с сундуком и бригантиной (место выбирается до остальных существ)
    {
      const chest = map.buildings.find((x) => x.id === 'chest').idx;
      const spot = [...neighbors(map, chest), ...neighbors(map, chest).flatMap((n) => neighbors(map, n))]
        .find((n) => cells[n].terrain === 'beach' && !cells[n].building && !cells[n].road && reach.has(n));
      if (spot !== undefined) { taken.add(spot); captain = { idx: spot, species: 'captain', tier: 8, boss: 'b4' }; }
    }
    // 1.3.0: стражи осколков (Story.CHAPTERS) — в зоне своего цвета, в своём направлении от деревни
    const bosses = [];
    for (const ch of HM_S.CHAPTERS) {
      if (ch.existing) continue;
      let best = null, bs = Infinity;
      for (const c of cells) {
        if (tierAt(c.d) !== ch.tier || c.road || c.building || !reach.has(c.idx) || !TERRAIN[c.terrain].pass || c.terrain === 'beach') continue;
        if (taken.has(c.idx) || neighbors(map, c.idx).some((n) => taken.has(n))) continue;
        const p = toPixel(c.q, c.r, 1);
        let da = Math.abs(Math.atan2(p.y, p.x) * 180 / Math.PI - ch.angle); if (da > 180) da = 360 - da;
        if (da < bs) { bs = da; best = c.idx; }
      }
      if (best !== null) { taken.add(best); bosses.push({ idx: best, species: ch.species, tier: ch.tier, boss: ch.id }); }
    }
    for (const c of cells) {
      if (c.d <= VILLAGE_R || c.road || !reach.has(c.idx) || !TERRAIN[c.terrain].pass) continue;
      if (rand() > spawnDensity(c.d)) continue;
      if (taken.has(c.idx) || neighbors(map, c.idx).some((n) => taken.has(n))) continue;
      let tier = tierAt(c.d);
      const roll = rand();
      if (roll < 0.15 && tier > 1) tier--;
      else if (roll > 0.93 && tier < 10) tier++;                  // изредка — существо посильнее
      const species = pickSpecies(tier, c.terrain, nearRoad(c.idx), rand);
      taken.add(c.idx);
      map.spawns.push({ id: map.spawns.length, idx: c.idx, species, tier });
    }
    if (captain) map.spawns.push({ id: map.spawns.length, ...captain });
    for (const b of bosses) map.spawns.push({ id: map.spawns.length, ...b });
    // 1.5.4: Врата подземелья — ближайшая к заданной точке свободная доступная сота; карта, дороги и монстры остаются прежними.
    for (const [id, b] of Object.entries(BUILDINGS)) {
      if (!b.post) continue;
      const at = cells[index.get(key(b.at[0], b.at[1]))], busy = new Set(map.spawns.map((x) => x.idx));
      const spot = cells.filter((c) => reach.has(c.idx) && !busy.has(c.idx) && !c.building && !c.road && c.d > VILLAGE_R + 1 && TERRAIN[c.terrain].pass && c.terrain !== 'beach')
        .sort((x, y) => dist(x, at) - dist(y, at) || x.idx - y.idx)[0];
      if (!spot) continue;
      spot.building = id;
      map.buildings.push({ id, idx: spot.idx, cells: [spot.idx] });
    }
    return map;
  }

  function pickSpecies(tier, terrain, road, rand) {
    const pool = [];
    for (const [id, s] of Object.entries(SPAWN)) {
      if (s.fixed || tier < s.tiers[0] || tier > s.tiers[1]) continue;
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
    const cost = (a, i) => ({ meadow: 1, village: 1, forest: 2.2, hills: 2.6, swamp: 3, water: 7, mountain: 14, beach: 1.2, sea: 80 }[map.cells[i].terrain]);
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
    if (c.bridge) return _t("Мост");
    if (c.road) return _t("Дорога");
    return TERRAIN[c.terrain].name;
  };

  return {
    RADIUS, VILLAGE_R, DIRS, TERRAIN, BUILDINGS, SPAWN, GATE_DIRS,
    key, dist, toPixel, fromPixel, tierAt, rng, generate, neighbors, passable, moveCost, findPath, area, center, terrainName, fenceBlocks,
  };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = HexMap;
