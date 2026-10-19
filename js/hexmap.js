if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Карта из шестиугольников (без интерфейса — можно тестировать в Node).

   Соты в осевых координатах (q, r), «остриём вверх». Карта — большой шестиугольник радиуса RADIUS
   с деревней в центре. Местность, дороги и места монстров строятся из зерна (seed),
   поэтому у каждого игрока своя карта, но она не меняется между запусками.

   Цвет (уровень) монстров растёт с удалением от деревни: у стен Красный, на краю карты Фиолетовый. */

const HM_S = (typeof Story !== 'undefined') ? Story : require('./story.js');

const HexMap = (() => {
  const RADIUS = 30;                  // просторная карта: 2791 сота (море на западе и востоке); в 1.2.6 было 23 (1657 сот), в 1.7.2 стало 30
  const VILLAGE_R = 9;                // деревня (1.2.6): Ратуша на 7 сотах, площадь, 12 усадеб по 3 соты, кольцо прохода у частокола
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  const TERRAIN = {
    meadow:   { name: _t("Луг"),    cost: 1,   pass: true },
    forest:   { name: _t("Лес"),    cost: 2,   pass: true },
    hills:    { name: _t("Холмы"),  cost: 2,   pass: true },
    swamp:    { name: _t("Болото"), cost: 3,   pass: true },
    water:    { name: _t("Озеро"),  cost: Infinity, pass: false },
    mountain: { name: _t("Горы"),   cost: Infinity, pass: false },
    village:  { name: _t("Деревня"), cost: 0.8, pass: true },
    castle:   { name: _t("Двор замка"), cost: 0.8, pass: true },      // 1.8.6: заброшенная деревня за стеной замка
    sea:      { name: _t("Море"),   cost: Infinity, pass: false },
    beach:    { name: _t("Берег"),  cost: 1.4, pass: true },
    // 1.7.1: новые местности (накладываются после расстановки существ, см. decorate) и река
    field:    { name: _t("Поле"),     cost: 1,   pass: true },
    tundra:   { name: _t("Тундра"),   cost: 1.4, pass: true },
    snow:     { name: _t("Снега"),    cost: 2,   pass: true },
    sand:     { name: _t("Пески"),    cost: 1.5, pass: true },
    badlands: { name: _t("Каменистые пески"), cost: 2, pass: true },
    darkwood: { name: _t("Тёмный лес"), cost: 2.3, pass: true },
    ash:      { name: _t("Пепельные земли"), cost: 1.6, pass: true },
    river:    { name: _t("Река"),     cost: Infinity, pass: false },   // переходится по мосту (c.bridge) или броду (c.ford)
  };
  const FORD_COST = 3;               // брод: дорого по ходам, зато без моста
  const ROAD_COST = 0.6;

  // Здания деревни (1.2.7): зеркально-симметричный город. Главная улица идёт с запада на восток через площадь
  // (ворота только на западе и востоке). Ратуша — «цветок» из 7 сот в центре, вокруг пустое кольцо-площадь;
  // 12 усадеб по 3 соты (треугольник): 6 над улицей и 6 под ней, каждая половина симметрична слева-направо,
  // нижняя — зеркало верхней. Между усадьбами минимум сота прохода, до частокола — одно свободное кольцо.
  // cells — все соты здания (нажатие на любую открывает его); at — первая сота (якорь); scale — масштаб рисунка.
  const HALL_CELLS = [[0, 0], ...DIRS];
  const BUILDINGS = {
    hall: { name: _t("Ратуша"), cells: HALL_CELLS, scale: 3.9, desc: _t("Центр деревни.") },
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
    // 1.8.6: деревня стала шире (радиус 9): ещё шесть усадеб, зеркально — две строки сверху и снизу и пара на оси.
    // Алтарь воскрешения — наверху по центру; сторожка, банк и почта пока «строятся» (soon), для симметрии рядом две стройки.
    altar: { name: _t("Алтарь воскрешения"), label: _t("Алтарь"), desc: _t("Сюда вы возвращаетесь после поражения: древний алтарь возвращает героя к жизни."), cells: [[3, -7], [3, -6], [4, -7]] },
    guardhouse: { name: _t("Сторожка городской стражи"), label: _t("Сторожка"), desc: _t("Во время набега стража за плату отобьёт врагов, пока вы заняты своими делами."), cells: [[-4, 7], [-3, 6], [-3, 7]] },
    bank: { name: _t("Банк"), desc: _t("Вклад: пока играете каждый день, ставка медленно растёт; пропустили день — ставка 0."), cells: [[-1, -6], [-1, -5], [0, -6]] },
    mail: { name: _t("Почта"), soon: true, desc: _t("Скоро: письма от жителей и награды по почте. Здание строится."), cells: [[7, -6], [6, -5], [6, -6]] },
    jeweler: { name: _t("Ювелирная лавка"), label: _t("Ювелир"), desc: _t("Сорока-ювелир гранит самоцветы стражей, сплавляет печати и скупает камни."), cells: [[0, 6], [1, 5], [1, 6]] },   // 1.8.9: занял бывшую стройку site1
    site2: { name: _t("Стройка"), soon: true, desc: _t("Здесь скоро поднимется новое здание."), cells: [[-7, 6], [-6, 5], [-6, 6]] },
    alchemist: { name: _t("Алхимик"), desc: _t("Тётушка Жабка варит зелья и эликсиры из добытых ресурсов."), cells: [[5, 1], [4, 1], [4, 2]] },
  };
  for (const b of Object.values(BUILDINGS)) { b.at = b.cells[0]; if (!b.scale) b.scale = 3.0; }
  // Достопримечательности побережья (версия 1.1.10): стоят на пляже у моря, дороги к ним ведут от ворот.
  // На западе — маяк с тюленем-смотрителем, на востоке — выброшенная на берег бригантина и запертый сундук.
  BUILDINGS.lighthouse = { name: _t("Маяк"), at: [-25, 1], landmark: true, gate: 3, scale: 2.3,
    desc: _t("Старый тюлень-смотритель следит за огнём маяка, даёт поручения и хранит ключ от сундука с затонувшего корабля.") };
  BUILDINGS.wreck = { name: _t("Кораблекрушение"), label: _t("Бригантина"), at: [25, -1], landmark: true, gate: 0, scale: 2.4,
    desc: _t("Бригантина села на мель у восточного берега. Рядом на песке стоит запертый сундук, а берег охраняет Капитан.") };
  BUILDINGS.chest = { name: _t("Запертый сундук"), label: _t("Сундук"), at: [26, -2], landmark: true, gate: 0, scale: 1.7,
    desc: _t("Окованный железом сундук на песке у бригантины. Ключ хранит тюлень-смотритель маяка.") };
  BUILDINGS.chestRuby = { name: _t("Рубиновый сундук"), label: _t("Рубиновый"), at: [25, 2], landmark: true, gate: 0, scale: 1.6,
    desc: _t("Сундук с рубинами в крышке стоит на восточных камнях. Ключ мастерит старьёвщик.") };
  BUILDINGS.chestEmerald = { name: _t("Изумрудный сундук"), label: _t("Изумрудный"), at: [-25, -1], landmark: true, gate: 3, scale: 1.6,
    desc: _t("Сундук с изумрудами прячется в зарослях у маяка. Ключ — «Живой ключ» — варит алхимик.") };
  BUILDINGS.chestObsidian = { name: _t("Серебряный сундук"), label: _t("Серебряный"), at: [27, 0], landmark: true, gate: 0, scale: 1.6,
    desc: _t("Серебряный сундук с обсидианом лежит под водой у бригантины. Нужно уметь дышать под водой.") };
  // 1.5.4: Врата подземелья — на северных холмах за деревней; пока заперты (soon), внутрь не войти.
  BUILDINGS.dungeon = { name: _t("Врата подземелья"), label: _t("Подземелье"), at: [0, -16], post: true, scale: 2.6,
    desc: _t("Массивные железные ворота в склоне холма ведут в бесконечное подземелье. Уровень за уровнем монстры всё сильнее, среди них попадаются элитные, а на каждом пятом уровне лестницу стережёт страж с сундуком.") };
  // 1.8.6: Ворота замка — на северной границе деревни (ставятся после монстров, как Врата подземелья)
  BUILDINGS.castle = { name: _t("Ворота замка"), label: _t("Замок"), at: [0, -11], post: true, scale: 2.8,
    desc: _t("Тёмная стена замка у границы деревни. За ней — брошенная деревня, где бродят духи воинов в доспехах. Вход для опытных героев.") };
  // Здания карты замка (только для HexMap.generate(seed, 'castle'); на карте деревни не ставятся)
  BUILDINGS.ruinHall = { name: _t("Руины ратуши"), label: _t("Руины ратуши"), castleOnly: true, at: [0, 0], scale: 3.9, desc: _t("Разрушенная ратуша замка. Здесь, по слухам, ждёт хозяин замка.") };
  BUILDINGS.ruinHouse = { name: _t("Разрушенный дом"), label: _t("Руины"), castleOnly: true, at: [0, 0], scale: 3.0, desc: _t("Брошенный дом: крыша обвалилась, в окнах холодный свет.") };
  BUILDINGS.ruinTower = { name: _t("Сторожевая башня"), label: _t("Башня"), castleOnly: true, at: [0, 0], scale: 3.0, desc: _t("Полуразрушенная башня с пустой звонницей.") };
  BUILDINGS.castleExit = { name: _t("Выход из замка"), label: _t("Выход"), castleOnly: true, at: [0, 0], scale: 2.4, desc: _t("Тяжёлые ворота. Через них можно вернуться в деревню.") };
  // 1.8.7: Затерянный остров — отдельная карта, на которую плывёт починенная бригантина (кладовая: сундук и его страж)
  BUILDINGS.islandPier = { name: _t("Бригантина у причала"), label: _t("Бригантина"), castleOnly: true, at: [0, 0], scale: 2.4, desc: _t("Ваша бригантина стоит у острова. Отсюда можно вернуться на материк.") };
  BUILDINGS.islandChest = { name: _t("Сундук пирата"), label: _t("Сундук"), castleOnly: true, at: [0, 0], scale: 2.0, desc: _t("Закопанный сундук старого капитана. Его стережёт тварь, что живёт на острове.") };
  // 1.8.7: Башня — бесконечное подземелье из малых этажей (радиус 6), вход — «Врата подземелья» на северных холмах
  BUILDINGS.towerDoor = { name: _t("Дверь подземелья"), label: _t("Дверь"), castleOnly: true, at: [0, 0], scale: 2.4, desc: _t("Тяжёлая дверь: на первом уровне она ведёт наружу, выше — вниз на уровень.") };
  BUILDINGS.towerStairs = { name: _t("Лестница вверх"), label: _t("Лестница"), castleOnly: true, at: [0, 0], scale: 2.4, desc: _t("Каменная лестница на следующий уровень.") };
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
    // 1.6.7: новые существа — «родной» источник каждого ресурса на каждом цвете (проверка — tests/forge166.test.js)
    ironscarab: { tiers: [1, 5],  terrain: { hills: 3, meadow: 2 } },
    rocklizard: { tiers: [1, 4],  terrain: { hills: 3, meadow: 2 } },
    moonmoth:   { tiers: [1, 5],  terrain: { forest: 3, meadow: 2, swamp: 1 } },
    bumblebee:  { tiers: [1, 5],  terrain: { meadow: 3, forest: 2, hills: 1 } },
    forestling: { tiers: [1, 5],  terrain: { forest: 4, hills: 1 } },
    barrowman:  { tiers: [1, 3],  terrain: { swamp: 3, hills: 2, meadow: 1 } },
    crystalid:  { tiers: [2, 7],  terrain: { hills: 3, meadow: 1 } },
    firetail:   { tiers: [4, 7],  terrain: { hills: 3, meadow: 1 } },
    weaver:     { tiers: [6, 10], terrain: { forest: 3, hills: 2, swamp: 1 } },
    carapace:   { tiers: [7, 10], terrain: { beach: 4, swamp: 1 } },
    ironguard:  { tiers: [8, 10], terrain: { hills: 3, meadow: 1 } },
    boneknight: { tiers: [8, 10], terrain: { swamp: 2, hills: 2, forest: 1 } },
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
    // 1.8.7: существа Затерянного острова — ставятся только генератором острова (fixed)
    glowmaw: { tiers: [6, 10], terrain: {}, fixed: true }, coralhulk: { tiers: [6, 10], terrain: {}, fixed: true }, stormray: { tiers: [6, 10], terrain: {}, fixed: true },
    tidecaller: { tiers: [6, 10], terrain: {}, fixed: true }, thornback: { tiers: [6, 10], terrain: {}, fixed: true },
    bear: { tiers: [4, 8],  terrain: { forest: 4, hills: 1 }, rare: 0.3 },
    griffin: { tiers: [8, 10], terrain: { hills: 4 }, rare: 0.3 },
    wyvern: { tiers: [8, 10], terrain: { hills: 2, swamp: 2 }, rare: 0.3 },
    basilisk: { tiers: [8, 10], terrain: { swamp: 4, forest: 1 }, rare: 0.3 },
    // 1.7.3: новые виды — Огр (Великаны), Гоблин-берсерк, Тень-убийца
    ogre:     { tiers: [7, 10], terrain: { hills: 3, forest: 1, meadow: 1 } },
    berserk:  { tiers: [4, 8],  terrain: { hills: 3, forest: 2, swamp: 1 } },
    assassin: { tiers: [8, 10], terrain: { forest: 2, hills: 2, swamp: 1 }, rare: 0.5 },
    captain:  { tiers: [8, 8],  terrain: {}, fixed: true },                    // босс востока: ставится вручную у сундука
  };
  // 1.7.3: хозяева зон — цвет, вид и направление от деревни (угол в градусах, 0 — на восток, 90 — на юг); тексты и приёмы — в World.ZONE_BOSSES
  const ZONES = {
    z1: { tier: 1, species: 'rat', angle: 40 },
    z3: { tier: 3, species: 'boar', angle: -150 },
    z5: { tier: 5, species: 'spider', angle: 180 },
    z7: { tier: 7, species: 'golem', angle: -10 },
    z9: { tier: 9, species: 'wraith', angle: 100 },
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

  /* ---------- 1.8.6: Замок — отдельная карта ----------
     Брошенный двойник деревни, но больше (радиус 13, обнесён стеной). В центре — руина Ратуши, вокруг по кругу зеркально
     стоят руины усадеб (24 штуки по 3 соты). На западе, в конце главной улицы — выход. Всех человекоподобных существ
     (скелеты-воины, призраки) переселили сюда; хозяин замка — тень прежнего героя. Карта строится сразу целиком. */
  const CASTLE_R = 13;
  const CASTLE_RUINS = [[[3, -2], [3, -1], [4, -2]], [[-4, 2], [-3, 1], [-3, 2]], [[-2, -2], [-2, -1], [-1, -2]], [[1, 2], [2, 1], [2, 2]], [[-2, 3], [-2, 4], [-1, 3]], [[1, -3], [2, -4], [2, -3]], [[-5, 4], [-5, 5], [-4, 4]], [[4, -4], [5, -5], [5, -4]], [[0, 4], [0, 5], [1, 4]], [[-1, -4], [0, -5], [0, -4]], [[-6, 1], [-6, 2], [-5, 1]], [[-5, -1], [-4, -2], [-4, -1]], [[4, 1], [4, 2], [5, 1]], [[5, -1], [6, -2], [6, -1]], [[-4, 7], [-3, 6], [-3, 7]], [[3, -7], [3, -6], [4, -7]], [[-8, 5], [-7, 4], [-7, 5]], [[-3, -5], [-3, -4], [-2, -5]], [[2, 5], [3, 4], [3, 5]], [[7, -5], [7, -4], [8, -5]], [[-1, 7], [-1, 8], [0, 7]], [[-7, 7], [-7, 8], [-6, 7]], [[6, -7], [7, -8], [7, -7]], [[0, -7], [1, -8], [1, -7]]];
  const CASTLE_EXIT = [-(CASTLE_R - 1), 0];
  // 1.9.3: у части духов замка свой приём вместо видового: щит, отрава, оглушение (не трогает поток случайных чисел карты)
  const CASTLE_TRAITS = ['ward', 'toxin', 'stun'];
  function castleTrait(seed, c) { const h = Math.floor(hash2(seed + 91, c.q, c.r) * 100); return h < 18 ? CASTLE_TRAITS[0] : h < 36 ? CASTLE_TRAITS[1] : h < 52 ? CASTLE_TRAITS[2] : null; }
  function generateCastle(seed) {
    const R = CASTLE_R, cells = [], index = new Map();
    for (let q = -R; q <= R; q++) {
      for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
        const idx = cells.length, d = dist({ q, r }, { q: 0, r: 0 });
        cells.push({ idx, q, r, d, terrain: d >= R ? 'mountain' : 'castle', road: false, bridge: false, building: null, street: r === 0 && d < R, deco: hash2(seed + 77, q, r) });
        index.set(key(q, r), idx);
      }
    }
    const map = { seed, kind: 'castle', radius: R, cells, index, buildings: [], spawns: [], gates: [], rivers: [], decorated: true };
    const put = (id, cs) => { const own = cs.map(([q, r]) => index.get(key(q, r))); for (const i of own) cells[i].building = id; map.buildings.push({ id, idx: own[0], cells: own }); };
    put('ruinHall', HALL_CELLS);
    CASTLE_RUINS.forEach((t, n) => put(n % 5 === 4 ? 'ruinTower' : 'ruinHouse', t));
    put('castleExit', [CASTLE_EXIT]);
    // достижимость от входа
    const start = index.get(key(CASTLE_EXIT[0] + 1, 0)), reach = new Set([start]), q = [start];
    while (q.length) { const c = q.pop(); for (const n of neighbors(map, c)) if (!reach.has(n) && passable(map, n) && !cells[n].building) { reach.add(n); q.push(n); } }
    map.reachable = reach; map.start = start;
    // духи: на свободных клетках, чем ближе к Ратуше, тем сильнее; у самой Ратуши — хозяин замка
    const rand = rng((seed ^ 0xca571e) >>> 0 || 3), taken = new Set([start]);
    const boss = cells.filter((c) => c.d === 3 && reach.has(c.idx) && !c.building).sort((a, b) => a.idx - b.idx)[0];
    for (const c of cells) {
      if (c.d >= R - 1 || !reach.has(c.idx) || c.street || c.d < 3 || taken.has(c.idx)) continue;
      if (rand() > 0.16 || neighbors(map, c.idx).some((n) => taken.has(n))) continue;
      const tier = Math.max(6, Math.min(10, 10 - Math.floor(c.d / 3)));
      map.spawns.push({ id: map.spawns.length, idx: c.idx, species: rand() < 0.55 ? 'skeleton' : 'wraith', tier, castle: true, trait: castleTrait(seed, c) });
      taken.add(c.idx);
    }
    if (boss) { map.spawns = map.spawns.filter((s) => s.idx !== boss.idx && !neighbors(map, boss.idx).includes(s.idx)); map.spawns.forEach((s, i) => { s.id = i; }); map.spawns.push({ id: map.spawns.length, idx: boss.idx, species: 'wraith', tier: 10, castle: true, boss: 'castleLord' }); }
    return map;
  }

  const ISLAND_R = 8, ISLAND_PIER = [-6, 0], ISLAND_CHEST = [4, -1];
  const ISLAND_MOBS = ['glowmaw', 'coralhulk', 'stormray', 'tidecaller', 'thornback'];
  function generateIsland(seed) {
    const R = ISLAND_R, cells = [], index = new Map();
    for (let q = -R; q <= R; q++) {
      for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
        const idx = cells.length, d = dist({ q, r }, { q: 0, r: 0 }), p = toPixel(q, r, 1);
        const e = fbm(seed + 31, p.x, p.y), m = fbm(seed + 32, p.x, p.y);
        let t = e > 0.64 ? 'hills' : m > 0.55 ? 'darkwood' : m > 0.42 ? 'forest' : 'meadow';
        if (d >= R) t = 'sea'; else if (d >= R - 1) t = 'beach';
        cells.push({ idx, q, r, d, terrain: t, road: false, bridge: false, building: null, deco: hash2(seed + 41, q, r) });
        index.set(key(q, r), idx);
      }
    }
    const map = { seed, kind: 'island', radius: R, cells, index, buildings: [], spawns: [], gates: [], rivers: [], decorated: true };
    const put = (id, c) => { const i = index.get(key(c[0], c[1])); cells[i].building = id; cells[i].terrain = id === 'islandPier' ? 'beach' : cells[i].terrain === 'hills' ? 'meadow' : cells[i].terrain; map.buildings.push({ id, idx: i, cells: [i] }); return i; };
    put('islandPier', ISLAND_PIER);
    const chest = put('islandChest', ISLAND_CHEST);
    const start = index.get(key(ISLAND_PIER[0] + 1, 0)), reach = new Set([start]), st = [start];
    while (st.length) { const c = st.pop(); for (const n of neighbors(map, c)) if (!reach.has(n) && passable(map, n) && !cells[n].building) { reach.add(n); st.push(n); } }
    map.reachable = reach; map.start = start;
    const rand = rng((seed ^ 0x15a4d) >>> 0 || 5), taken = new Set([start, chest]);
    const guard = neighbors(map, chest).filter((n) => reach.has(n)).sort((a, b) => a - b)[0];
    for (const c of cells) {
      if (c.d >= R - 1 || !reach.has(c.idx) || c.d < 2 || taken.has(c.idx) || c.idx === guard) continue;
      if (rand() > 0.17 || neighbors(map, c.idx).some((n) => taken.has(n) || n === guard) || neighbors(map, c.idx).includes(chest)) continue;
      map.spawns.push({ id: map.spawns.length, idx: c.idx, species: ISLAND_MOBS[Math.floor(rand() * ISLAND_MOBS.length)], tier: Math.max(6, Math.min(10, 6 + Math.floor((R - c.d) / 2))), island: true });
      taken.add(c.idx);
    }
    if (guard !== undefined) map.spawns.push({ id: map.spawns.length, idx: guard, species: 'troll', tier: 10, island: true, guard: true });
    return map;
  }

  const TOWER_R = 6, TOWER_DOOR = [-5, 0], TOWER_STAIRS = [5, 0];
  const TOWER_MOBS = ['skeleton', 'wraith', 'ghoul', 'troll', 'golem', 'shadow', 'orc'], TOWER_GUARDS = ['troll', 'golem', 'dragon', 'shadow'];
  // этаж f: seed — зерно башни; сильнее с этажом: цвет мобов 8→10, гуще, каждый 5-й этаж — страж у лестницы
  function generateTower(seed, f) {
    const R = TOWER_R, cells = [], index = new Map(), fs = (seed + f * 7919) >>> 0;
    for (let q = -R; q <= R; q++) {
      for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
        const idx = cells.length, d = dist({ q, r }, { q: 0, r: 0 });
        cells.push({ idx, q, r, d, terrain: d >= R ? 'mountain' : (hash2(fs + 5, q, r) > 0.7 ? 'badlands' : 'ash'), road: false, bridge: false, building: null, deco: hash2(fs + 9, q, r) });
        index.set(key(q, r), idx);
      }
    }
    const map = { seed: fs, kind: 'tower', floor: f, radius: R, cells, index, buildings: [], spawns: [], gates: [], rivers: [], decorated: true };
    const put = (id, c) => { const i = index.get(key(c[0], c[1])); cells[i].building = id; map.buildings.push({ id, idx: i, cells: [i] }); return i; };
    put('towerDoor', TOWER_DOOR);
    const stairs = put('towerStairs', TOWER_STAIRS);
    const start = index.get(key(TOWER_DOOR[0] + 1, 0)), reach = new Set([start]), st = [start];
    while (st.length) { const c = st.pop(); for (const n of neighbors(map, c)) if (!reach.has(n) && passable(map, n) && !cells[n].building) { reach.add(n); st.push(n); } }
    map.reachable = reach; map.start = start;
    const rand = rng((fs ^ 0x70e3) >>> 0 || 9), taken = new Set([start, stairs]);
    const tier = Math.min(10, 8 + Math.floor(f / 4)), dens = Math.min(0.4, 0.2 + f * 0.01);
    const guard = f % 5 === 0 ? neighbors(map, stairs).filter((n) => reach.has(n)).sort((a, b) => a - b)[0] : undefined;
    for (const c of cells) {
      if (c.d >= R || !reach.has(c.idx) || taken.has(c.idx) || c.idx === guard) continue;
      if (rand() > dens || neighbors(map, c.idx).some((n) => taken.has(n) || n === guard)) continue;
      map.spawns.push({ id: map.spawns.length, idx: c.idx, species: TOWER_MOBS[Math.floor(rand() * TOWER_MOBS.length)], tier, tower: true });
      taken.add(c.idx);
    }
    if (guard !== undefined) {
      const sp = { id: map.spawns.length, idx: guard, species: 'golem', tier: 10, tower: true, guard: true, gc: Math.min(10, f / 5) };
      // 1.9.4: каждый 10-й этаж — Хранитель глубин: другой зверь (по кругу) и свой приём (щит / отрава / оглушение), награда больше
      if (f % 10 === 0) { const n = f / 10 - 1; sp.species = TOWER_GUARDS[n % TOWER_GUARDS.length]; sp.trait = ['ward', 'toxin', 'stun'][n % 3]; sp.deep = true; }
      map.spawns.push(sp);
    }
    return map;
  }

  function generate(seed, kind, floor) {
    if (kind === 'tower') return generateTower(seed, Math.max(1, floor | 0 || 1));
    if (kind === 'castle') return generateCastle(seed);
    if (kind === 'island') return generateIsland(seed);
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
      if (b.post || b.castleOnly) continue;      // ставится после монстров, ничего не сдвигая (см. ниже)
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
    // 1.7.3: хозяева зон (нечётные цвета; на чётных — стражи осколков) — вместо ближайшего к «своему» направлению
    // обычного существа этого цвета (не на пляже): номера сот и существ не сдвигаются.
    for (const [zid, Z] of Object.entries(ZONES)) {
      let best = null, bs = Infinity;
      for (const sp of map.spawns) {
        if (sp.boss) continue;
        const c = cells[sp.idx];
        if (c.terrain === 'beach' || tierAt(c.d) !== Z.tier) continue;
        const p = toPixel(c.q, c.r, 1);
        let da = Math.abs(Math.atan2(p.y, p.x) * 180 / Math.PI - Z.angle); if (da > 180) da = 360 - da;
        if (da < bs) { bs = da; best = sp; }
      }
      if (best) { best.species = Z.species; best.tier = Z.tier; best.zone = zid; }
    }
    // 1.5.4: Врата подземелья — ближайшая к заданной точке свободная доступная сота; карта, дороги и монстры остаются прежними.
    for (const [id, b] of Object.entries(BUILDINGS)) {
      if (!b.post || b.castleOnly) continue;
      const at = cells[index.get(key(b.at[0], b.at[1]))], busy = new Set(map.spawns.map((x) => x.idx));
      const spot = cells.filter((c) => reach.has(c.idx) && !busy.has(c.idx) && !c.building && !c.road && c.d > VILLAGE_R + 1 && TERRAIN[c.terrain].pass && c.terrain !== 'beach')
        .sort((x, y) => dist(x, at) - dist(y, at) || x.idx - y.idx)[0];
      if (!spot) continue;
      spot.building = id;
      map.buildings.push({ id, idx: spot.idx, cells: [spot.idx] });
    }
    return map;
  }

  /* ---------- 1.7.1: новые местности и реки ---------- */
  // Накладываются ПОСЛЕ generate() и World.place(): существа, события, логова и достопримечательности уже стоят, поэтому у
  // сохранений прежних версий их номера и положение не меняются (новая местность — вид и цена шага; река обходит занятые соты
  // и не режет достижимость: через неё всегда есть мост на дороге или брод). occupied — номера сот, занятых чем-либо.
  // Идемпотентно: второй вызов для той же карты ничего не делает.
  const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const BIOME_CONVERT = { meadow: 1, forest: 1, hills: 1, swamp: 1 };
  const FAR_D = 16, SIDE_D = 18;      // с каких расстояний от деревни начинаются полярные и боковые области (1.7.2)
  const RIVER_COUNT = 5;             // 1.7.2: карта просторнее — рек больше (было 3)

  function decorate(map, occupied) {
    if (map.decorated) return map;
    map.decorated = true;
    const seed = map.seed, cells = map.cells, R = VILLAGE_R, index = map.index;
    const occ = new Set(occupied || []);
    for (const sp of map.spawns) occ.add(sp.idx);
    for (const b of map.buildings) for (const i of b.cells || [b.idx]) occ.add(i);
    const oldReach = map.reachable ? new Set(map.reachable) : null;
    map.rivers = [];

    // --- реки: от горных и холмистых мест вниз по рельефу к озеру, морю или другой реке
    const elev = (c) => { const p = toPixel(c.q, c.r, 1); return fbm(seed, p.x, p.y) - 0.03 * Math.abs(c.q + c.r / 2); };   // стекает к морю на западе и востоке
    const rr = rng((seed ^ 0x7a11e5) >>> 0 || 5);
    const canRiver = (c) => c.d > R + 2 && !occ.has(c.idx) && !c.building && c.terrain !== 'village';
    const sources = cells.filter((c) => (c.terrain === 'mountain' || c.terrain === 'hills') && c.d >= 13 && c.d <= 26 && canRiver(c)
      && !neighbors(map, c.idx).some((n) => cells[n].terrain === 'sea'));
    // Русло — самый дешёвый путь к морю (или к уже прорытой реке): вниз по рельефу легче, вверх дороже, озёра почти бесплатны,
    // у каждой соты своя «упрямость» — берега получаются извилистыми. Так река всегда доходит до воды.
    const flowTo = (from) => {
      const dd = new Map([[from, 0]]), came = new Map(), done = new Set();
      const heap = [[0, from]];                     // двоичная куча: [расстояние, сота]
      const push = (it) => { let i = heap.push(it) - 1; while (i > 0) { const pa = (i - 1) >> 1; if (heap[pa][0] <= heap[i][0]) break; [heap[pa], heap[i]] = [heap[i], heap[pa]]; i = pa; } };
      const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last; let i = 0;
          for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
        }
        return top;
      };
      while (heap.length) {
        const [dcur, cur] = pop();
        if (done.has(cur)) continue;
        done.add(cur);
        const cc = cells[cur];
        if (cur !== from && (cc.terrain === 'sea' || cc.terrain === 'river')) {
          const path = [];
          for (let x = cur; x !== undefined; x = came.get(x)) path.push(x);
          return path.reverse();
        }
        if (dcur > 130) break;
        for (const n of neighbors(map, cur)) {
          const nc = cells[n];
          if (done.has(n)) continue;
          if (nc.terrain !== 'sea' && nc.terrain !== 'river' && !canRiver(nc)) continue;
          const step = 1 + 7 * Math.max(0, elev(nc) - elev(cc)) + hash2(seed + 7300, nc.q, nc.r) * 0.9 + (nc.road ? 1.2 : 0) - (nc.terrain === 'water' ? 0.55 : 0);
          const nd = dcur + step;
          if (nd < (dd.has(n) ? dd.get(n) : Infinity)) { dd.set(n, nd); came.set(n, cur); push([nd, n]); }
        }
      }
      return null;
    };
    const used = [];
    for (let k = 0; k < RIVER_COUNT * 40 && map.rivers.length < RIVER_COUNT && sources.length; k++) {
      const src = sources[Math.floor(rr() * sources.length)];
      if (used.some((u) => dist(cells[u], src) < 11)) continue;
      const path = flowTo(src.idx);
      if (!path || path.length < 10 || path.length > 110) continue;
      used.push(src.idx);
      const end = cells[path[path.length - 1]].terrain;
      for (const i of path) {
        const c = cells[i];
        if (c.terrain === 'sea' || c.terrain === 'water' || c.terrain === 'river') continue;
        c.base = c.terrain; c.terrain = 'river';
        if (c.road) c.bridge = true;                 // дорога через реку — мост
      }
      map.rivers.push({ cells: path, end });
    }
    // бродов — через каждые 7–11 сот реки (мосты уже есть там, где дорога пересекает реку)
    for (const rv of map.rivers) {
      let k = 4 + Math.floor(rr() * 4);
      while (k < rv.cells.length - 2) {
        const c = cells[rv.cells[k]];
        if (c.terrain === 'river' && !c.bridge) c.ford = true;
        k += 7 + Math.floor(rr() * 5);
      }
    }
    const reachNow = () => {
      const reach = new Set([index.get(key(0, 0))]);
      const queue = [...reach];
      while (queue.length) {
        const i = queue.shift();
        for (const n of neighbors(map, i)) if (!reach.has(n) && passable(map, n)) { reach.add(n); queue.push(n); }
      }
      return reach;
    };
    // всё, что было достижимо до реки, должно остаться достижимым: недостающие переправы — броды
    let now = reachNow();
    for (let guard = 0; oldReach && guard < 80; guard++) {
      const lost = new Set([...oldReach].filter((i) => !now.has(i) && passable(map, i)));
      if (!lost.size) break;
      const came = new Map(), queue = [];
      const wet = (n) => cells[n].terrain === 'river' && !passable(map, n);
      for (const i of now) for (const n of neighbors(map, i)) if (wet(n) && !came.has(n)) { came.set(n, -1); queue.push(n); }
      let hit = -1;
      for (let h = 0; h < queue.length && hit < 0; h++) {
        for (const n of neighbors(map, queue[h])) {
          if (lost.has(n)) { hit = queue[h]; break; }
          if (wet(n) && !came.has(n)) { came.set(n, queue[h]); queue.push(n); }
        }
      }
      if (hit < 0) break;
      let k = hit;
      while (came.get(k) !== -1) k = came.get(k);
      cells[k].ford = true;
      now = reachNow();
    }
    map.reachable = now;

    // --- новые местности. Север — снега и тундра, юг — пески и каменистые пески (секторы около ±50° от оси), между ними
    // две большие области: на западе тёмный лес, на востоке пепельные земли (1.7.2: карта радиуса 30, поэтому области цельные,
    // а не россыпь пятен); у деревни — поля. Что осталось посередине — прежние луга, леса, холмы и болота.
    for (const c of cells) {
      if (!BIOME_CONVERT[c.terrain] || c.d <= R + 2 || c.building) continue;
      const p = toPixel(c.q, c.r, 1);
      const ang = Math.atan2(p.y, p.x) * 180 / Math.PI;         // север ≈ −90°, юг ≈ +90° (ось y вниз)
      const wig = fbm(seed + 8100, p.x, p.y) - 0.5, mix = fbm(seed + 8200, p.x, p.y);
      const far = c.d >= FAR_D + wig * 6, t = c.terrain;
      let to = null;
      if (far && angDiff(ang, -90) < 52 + wig * 40) to = t === 'forest' ? 'snow' : t === 'meadow' ? (mix > 0.6 ? 'snow' : 'tundra') : t === 'hills' ? (mix > 0.5 ? 'snow' : 'tundra') : 'tundra';
      else if (far && angDiff(ang, 90) < 52 + wig * 40) to = t === 'hills' ? 'badlands' : t === 'meadow' ? (mix > 0.6 ? 'badlands' : 'sand') : 'sand';
      else if (c.d >= SIDE_D + wig * 6 && fbm(seed + 9100, p.x, p.y) > 0.3) {
        const west = c.q + c.r / 2 < 0;
        to = west ? (t === 'hills' && mix > 0.62 ? 'ash' : 'darkwood') : ((t === 'forest' || t === 'swamp') && mix > 0.64 ? 'darkwood' : 'ash');
      }
      else if (c.d <= R + 8 && t === 'meadow' && fbm(seed + 9900, p.x * 1.1, p.y * 1.1) > 0.48) to = 'field';
      if (to) { if (!c.base) c.base = t; c.terrain = to; }
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
  const passable = (map, i) => map.cells[i].bridge || map.cells[i].ford || TERRAIN[map.cells[i].terrain].pass;
  const moveCost = (map, i) => (map.cells[i].road ? ROAD_COST : map.cells[i].ford ? FORD_COST : TERRAIN[map.cells[i].terrain].cost);

  // Частокол деревни: шаг между сотой деревни (d <= VILLAGE_R) и сотой снаружи (d > VILLAGE_R) —
  // а такие соседние пары есть только на самой границе, d === VILLAGE_R и d === VILLAGE_R+1 —
  // разрешён только через ворота: внутренняя сота должна быть воротами (map.gates), а внешняя —
  // дорогой от них (та же проверка, что рисует проём в частоколе в mapview.js).
  function fenceBlocks(map, from, to) {
    if (map.kind) return false;           // у замка и острова своя стена из гор: частокола нет
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
    if (c.ford) return _t("Брод");
    if (c.road) return _t("Дорога");
    return TERRAIN[c.terrain].name;
  };

  return {
    RADIUS, VILLAGE_R, CASTLE_R, ISLAND_R, TOWER_R, DIRS, TERRAIN, BUILDINGS, SPAWN, ZONES, GATE_DIRS,
    key, dist, toPixel, fromPixel, tierAt, rng, generate, decorate, FORD_COST, neighbors, passable, moveCost, findPath, area, center, terrainName, fenceBlocks,
  };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = HexMap;
