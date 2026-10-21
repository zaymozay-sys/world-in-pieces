if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* 1.5.4: «живой мир» — элитные существа, события на карте, логова, механики стражей, Арена теней и Испытание дня.
   Без интерфейса: чистые функции от карты, даты и профиля — проверяются тестами в Node (tests/world.test.js).

   Всё, что ставится на карту, выбирается своим генератором от зерна карты ПОСЛЕ существ (HexMap.generate не меняется),
   поэтому у старых сохранений существа стоят на прежних местах. */

const W_HM = (typeof HexMap !== 'undefined') ? HexMap : require('./hexmap.js');
const W_T = (typeof Tiers !== 'undefined') ? Tiers : require('./tiers.js');
const CK_W = ((typeof Balance !== 'undefined') ? Balance : require('./balance.js')).rewards.coinBase;   // 1.6.0: доходы и траты вместе с монетами с мобов

const World = (() => {
  const MIN = 60 * 1000;

  /* ---------- элитные существа ---------- */
  // Приём-«свойство» элитного существа берётся из готовых приёмов существ (Combat.monsterTurnStart) — только тех,
  // что срабатывают в начале хода сами по себе и не трогают особые правила вида.
  const AFFIXES = {
    regen:   { name: _t("Живучесть"),     desc: _t("каждый ход восстанавливает 5% ХП") },
    steal:   { name: _t("Воровство"),   desc: _t("крадёт у вас камни магии") },
    prank:   { name: _t("Пакость"),   desc: _t("меняет камни на поле местами") },
    howl:    { name: _t("Свирепость"),    desc: _t("каждый 3-й ход бьёт на 50% сильнее") },
    petrify: { name: _t("Окаменение"),    desc: _t("каждый 3-й ход сковывает столбец поля") },
    veil:    { name: _t("Туман"),    desc: _t("каждый 2-й ход прячет 5 камней") },
    weaken:  { name: _t("Морок"),     desc: _t("каждый 3-й ход ослабляет ваш удар") },
    pinch:   { name: _t("Панцирь"),   desc: _t("каждый 3-й ход наращивает Блок") },
    sap:     { name: _t("Смола"),   desc: _t("каждый 3-й ход дорожает ваша магия") },
    mire:    { name: _t("Трясина"),      desc: _t("каждый 2-й ход ошибка стоит вдвое дороже") },
  };
  const AFFIX_IDS = Object.keys(AFFIXES);          // жребий элитных; приёмы 1.7.3 ниже — только у хозяев зон
  // 1.7.3: названия приёмов хозяев зон (оглушение, отрава и щит в жребий элитных не попадают).
  AFFIXES.stun  = { name: _t("Оглушение"), desc: _t("каждый 5-й ход вы пропускаете ход (Блок даёт шанс устоять)") };
  AFFIXES.toxin = { name: _t("Отрава"),    desc: _t("каждый 4-й ход яд на 3 ваших хода") };
  AFFIXES.ward  = { name: _t("Щит"),       desc: _t("каждый 4-й ход щит на 12% здоровья") };
  // Элитный: крепче и злее, но и добычи больше. Числа — для боя (game.js) и наград (rewardFor).
  const ELITE = { hp: 1.25, dmg: 1.05, coins: 1.6, xp: 1.5, share: 0.1 };

  // Механики стражей осколков: свойства (как у элитных) и особый приём.
  //   pack — «Зов стаи»: каждый 4-й ход стая кусает на 7% вашего ХП (броня не помогает);
  //   enrage — «Ярость»: на половине ХП урон +25% до конца боя.
  const GUARDIANS = {
    b1: { affixes: [], mech: 'pack', name: _t("Зов стаи"), desc: _t("каждый 4-й ход стая кусает на 7% вашего ХП") },
    b2: { affixes: ['steal', 'petrify'], name: _t("Грабёж"), desc: _t("крадёт камни и сковывает столбец") },
    b3: { affixes: ['veil', 'sap'], name: _t("Бубен Сердца"), desc: _t("прячет камни и делает магию дороже") },
    b4: { affixes: ['prank'], name: _t("Абордаж"), desc: _t("путает камни на поле") },
    b5: { affixes: [], mech: 'enrage', name: _t("Ярость дракона"), desc: _t("на половине ХП урон +25% до конца боя") },
  };
  const PACK = { every: 4, bite: 0.07 }, ENRAGE = { at: 0.5, power: 25 };

  /* ---------- 1.7.3: хозяева зон ----------
     На чётных цветах (2, 4, 6, 8, 10) стоят стражи осколков (js/story.js), на нечётных — хозяин зоны: обычный вид
     крупнее и злее (ХП ×ZONE.hp, Сила +ZONE.power), с добавочным приёмом (affixes: любой приём из Combat.monsterTurnStart),
     монеты за каждую победу ×2, за первую — трофей: монеты, опыт и редкая вещь своего цвета. Возвращаются через
     обычное время, как все существа. Ставятся при создании карты (HexMap.generate) вместо ближайшего к «своему»
     направлению обычного существа этого цвета, поэтому номера сот и существ остаются прежними. */
  const ZONE = { hp: 1.7, power: 14 };
  const ZONE_GEO = W_HM.ZONES;   // цвет, вид и направление — в js/hexmap.js (ставятся при создании карты)
  const ZONE_BOSSES = {
    z1: { ...ZONE_GEO.z1, hp: 3.0, power: 28, affixes: ['prank'], title: _t("Крысиный король"), where: _t("на лугах у деревни, на первом цвете"),
      lore: _t("Старая крыса сидит на куче краденого и зовёт себя королём. Таскает камни и путает поле."),
      taunt: _t("Крысиный король пищит: «Всё это моё! И твои камни тоже!»"),
      defeat: _t("Король роняет корону из цепочек и удирает в нору. Куча добра остаётся тебе.") },
    z3: { ...ZONE_GEO.z3, affixes: ['stun'], title: _t("Секач-вожак"), where: _t("в лесах третьего цвета на западе"),
      lore: _t("Матёрый кабан с обломанным бивнем. Идёт напролом, а его удар оглушает так, что пропадает ход."),
      taunt: _t("Секач-вожак роет землю: «Хр-р… Кто пришёл на мою поляну?»"),
      defeat: _t("Секач-вожак падает на колени и долго фыркает. Лес на этой поляне наконец затихает.") },
    z5: { ...ZONE_GEO.z5, affixes: ['sap'], title: _t("Паучья королева"), where: _t("в тёмном лесу пятого цвета на западе"),
      lore: _t("Королева тёмной чащи. Её укус отравляет на несколько ходов, а липкая паутина делает магию дороже."),
      taunt: _t("Паучья королева шелестит: «Мои дети голодны. Ты как раз вовремя»."),
      defeat: _t("Паучья королева сворачивается клубком, и чаща понемногу светлеет.") },
    z7: { ...ZONE_GEO.z7, affixes: ['ward'], title: _t("Каменный исполин"), where: _t("в пепельных землях седьмого цвета на востоке"),
      lore: _t("Исполин, поросший мхом. Каменит столбцы поля и прикрывается каменным щитом."),
      taunt: _t("Каменный исполин скрежещет: «Я старше этих гор. Ты не сдвинешь меня»."),
      defeat: _t("Исполин трескается и рассыпается. Мох ещё долго зеленеет на обломках.") },
    z9: { ...ZONE_GEO.z9, affixes: ['ward', 'weaken'], title: _t("Призрачный король"), where: _t("в песках девятого цвета на юге"),
      lore: _t("Король давно забытой битвы. Туман — его плащ, щит — его воля, а взгляд отнимает силу."),
      taunt: _t("Призрачный король шепчет: «Я и не умирал. Это вы всё забыли»."),
      defeat: _t("Призрачный король склоняет голову: «Наконец-то можно закончить битву». Туман уходит с поля.") },
  };
  const ZONE_IDS = Object.keys(ZONE_BOSSES);
  // Хозяин зоны крупнее и злее своего вида.
  // Сила у каждой зоны своя, если в записи есть hp / power (общие ZONE.hp / ZONE.power — по умолчанию): у первой зоны — выше,
  // потому что обычная крыса на первом цвете слишком проста даже для «хозяина».
  const zoneHp = (zoneId) => (ZONE_BOSSES[zoneId] && ZONE_BOSSES[zoneId].hp) || ZONE.hp;
  const zonePower = (zoneId) => { const Z = ZONE_BOSSES[zoneId]; return Z && Z.power != null ? Z.power : ZONE.power; };
  const scaleZone = (sc, zoneId) => (ZONE_BOSSES[zoneId] ? { ...sc, hp: Math.round(sc.hp * zoneHp(zoneId)), stats: { ...sc.stats, power: (sc.stats.power || 0) + zonePower(zoneId) } } : sc);
  // Трофей за первую победу: монеты и опыт (вещь выдаёт игра, см. game.js rewardFor).
  const zoneReward = (zoneId) => {
    const Z = ZONE_BOSSES[zoneId];
    return { coins: Math.round(180 * CK_W * W_T.PRICE_MULT[Z.tier - 1]), xp: 60 * Math.ceil(Z.tier / 2) };
  };

  /* ---------- события ---------- */
  const EVENTS = {
    cache:    { name: _t("Тайник"),            w: 34, glyph: 'cache' },
    altar:    { name: _t("Древний алтарь"),     w: 20, glyph: 'altar' },
    merchant: { name: _t("Странствующий торговец"), w: 16, glyph: 'cart' },
    beast:    { name: _t("Раненый зверь"),      w: 14, glyph: 'paw' },
    ambush:   { name: _t("Подозрительные кусты"), w: 16, glyph: 'bush' },
  };
  /* 1.6.9: достопримечательности — одноразовые находки (осматриваются один раз за всю игру, не возвращаются). */
  const LANDMARKS = {
    ruins:  { name: _t("Древние руины"),      glyph: 'ruins',  w: 4 },
    cave:   { name: _t("Тёмная пещера"),      glyph: 'cavern', w: 3 },
    obelisk:{ name: _t("Звёздный обелиск"),   glyph: 'obelisk',w: 3 },
    spring: { name: _t("Целебный родник"),    glyph: 'spring', w: 3 },
    wreck:  { name: _t("Остов корабля"),      glyph: 'wreck',  w: 0 },     // только на берегу
    watch:  { name: _t("Заброшенный дозор"),  glyph: 'watch',  w: 3 },
  };
  const LANDMARK_COUNT = 22, LANDMARK_REVEAL = { obelisk: 9, watch: 8 };
  const EVENT_COUNT = 46;
  const EVENT_RESPAWN = 45 * MIN, LAIR_COOLDOWN = 60 * MIN;
  const BLESSINGS = {
    might: { name: _t("Сила алтаря"), desc: _t("+15% урона"), amount: 15, fights: 3 },
    stone: { name: _t("Стойкость алтаря"), desc: _t("+20% к максимуму ХП"), amount: 20, fights: 3 },
  };
  const LAIR_TIERS = [2, 3, 5, 7, 9];

  // Хэш для детерминированных выборов (элитные, свойства, награды по дню).
  // 1.8.8: выбор элитных существ вынесен в функцию — подземелье задаёт свою долю; guaranteed — хотя бы один элитный, если есть из кого
  function pickElites(map, share, guaranteed) {
    const elites = new Map(), pool = [];
    for (const sp of map.spawns) {
      if (sp.boss || sp.zone || sp.guard || sp.tier < 2) continue;
      pool.push(sp);
      if (hash(map.seed, 'elite', sp.id) >= share) continue;
      elites.set(sp.id, AFFIX_IDS[Math.floor(hash(map.seed, 'affix', sp.id) * AFFIX_IDS.length)]);
    }
    if (guaranteed && !elites.size && pool.length) { const sp = pool[Math.floor(hash(map.seed, 'elite1') * pool.length)]; elites.set(sp.id, AFFIX_IDS[Math.floor(hash(map.seed, 'affix', sp.id) * AFFIX_IDS.length)]); }
    return elites;
  }
  function hash(...xs) {
    let h = 2166136261;
    for (const x of xs) { const s = String(x); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= 0x9e37; h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }

  // Что стоит на карте сверх существ: события, логова, элитные. Детерминировано по зерну карты.
  function place(map) {
    const rand = W_HM.rng((map.seed ^ 0x5eed1e) >>> 0 || 7);
    const cells = map.cells, R = W_HM.VILLAGE_R;
    const spawnCells = new Set(map.spawns.map((s) => s.idx));
    const near = new Set();
    for (const i of spawnCells) for (const n of W_HM.neighbors(map, i)) near.add(n);
    const reach = map.reachable || new Set(cells.map((c) => c.idx));
    const free = (c) => c.d > R + 2 && !c.road && !c.building && !c.bridge && reach.has(c.idx) && W_HM.passable(map, c.idx)
      && c.terrain !== 'beach' && !spawnCells.has(c.idx);
    const taken = new Set();
    const spaced = (i, k) => !W_HM.area(map, i, k).some((n) => taken.has(n));

    // логова: по одному на цвет из LAIR_TIERS, направления разнесены на 72°
    const lairs = [];
    LAIR_TIERS.forEach((tier, n) => {
      const want = n * 72 + 20;
      let best = null, bs = Infinity;
      for (const c of cells) {
        if (W_HM.tierAt(c.d) !== tier || !free(c) || near.has(c.idx) || !spaced(c.idx, 2)) continue;
        const p = W_HM.toPixel(c.q, c.r, 1);
        let da = Math.abs(((Math.atan2(p.y, p.x) * 180 / Math.PI) + 360) % 360 - want); if (da > 180) da = 360 - da;
        if (da < bs) { bs = da; best = c.idx; }
      }
      if (best !== null) { taken.add(best); lairs.push({ id: 'L' + n, idx: best, tier }); }
    });

    // события: около 46 штук (1.7.2: карта просторнее, было 28), не теснее одной соты друг к другу
    const pool = cells.filter((c) => free(c) && !taken.has(c.idx));
    const events = [];
    const total = Object.values(EVENTS).reduce((s, e) => s + e.w, 0);
    for (let k = 0; k < 400 && events.length < EVENT_COUNT && pool.length; k++) {
      const c = pool[Math.floor(rand() * pool.length)];
      if (taken.has(c.idx) || !spaced(c.idx, 2)) continue;
      let x = rand() * total, kind = 'cache';
      for (const [id, e] of Object.entries(EVENTS)) { x -= e.w; if (x <= 0) { kind = id; break; } }
      taken.add(c.idx);
      events.push({ id: 'E' + events.length, idx: c.idx, kind, tier: Math.max(1, W_HM.tierAt(c.d)) });
    }

    // 1.6.9: достопримечательности — свой генератор, поэтому прежние события и логова стоят на старых местах
    const lrand = W_HM.rng((map.seed ^ 0x1a2d3c) >>> 0 || 11);
    const landmarks = [];
    const lpool = cells.filter((c) => free(c) && !taken.has(c.idx) && c.d > R + 4);
    const lspaced = (i) => landmarks.every((m) => W_HM.dist(cells[i], cells[m.idx]) >= 6);
    const ltotal = Object.values(LANDMARKS).reduce((a, m) => a + m.w, 0);
    for (let k = 0; k < 1200 && landmarks.length < LANDMARK_COUNT - 2 && lpool.length; k++) {
      const c = lpool[Math.floor(lrand() * lpool.length)];
      if (taken.has(c.idx) || !spaced(c.idx, 2) || !lspaced(c.idx)) continue;
      let x = lrand() * ltotal, kind = 'ruins';
      for (const [id, m] of Object.entries(LANDMARKS)) { x -= m.w; if (x <= 0) { kind = id; break; } }
      taken.add(c.idx);
      landmarks.push({ id: 'M' + landmarks.length, idx: c.idx, kind, tier: Math.max(1, W_HM.tierAt(c.d)) });
    }
    // остовы кораблей — на берегу (до двух)
    const shore = cells.filter((c) => c.terrain === 'beach' && c.d > R + 2 && !c.road && !c.building && reach.has(c.idx) && !spawnCells.has(c.idx) && !taken.has(c.idx));
    for (let k = 0; k < 400 && landmarks.filter((m) => m.kind === 'wreck').length < 2 && shore.length; k++) {
      const c = shore[Math.floor(lrand() * shore.length)];
      if (taken.has(c.idx) || !lspaced(c.idx)) continue;
      taken.add(c.idx);
      landmarks.push({ id: 'M' + landmarks.length, idx: c.idx, kind: 'wreck', tier: Math.max(1, W_HM.tierAt(c.d)) });
    }

    // элитные: около 10% обычных существ от 2-го цвета; свойство не совпадает с приёмом вида
    const elites = pickElites(map, ELITE.share);
    // 1.7.1: новые местности и реки — поверх уже расставленного (номера сот у существ и событий не меняются)
    if (!map.decorated) W_HM.decorate(map, new Set([...spawnCells, ...taken]));
    return { lairs, events, elites, landmarks };
  }
  // Свойство для существа, у которого свой приём совпал: следующее по списку.
  const affixFor = (affix, ownAbility) => (affix !== ownAbility ? affix : AFFIX_IDS[(AFFIX_IDS.indexOf(affix) + 1) % AFFIX_IDS.length]);

  /* ---------- быстрый бой ---------- */
  // Слабое (на 2+ цвета ниже героя) и уже побеждённое существо можно одолеть сразу: половина опыта и монет, ресурсы
  // как обычно, без вещей и находок. Стражи, элитные и засады — только настоящим боем.
  const QUICK = { below: 2, share: 0.5 };
  // Платное воскрешение на месте гибели: цена растёт вместе с цветом героя (плавно между цветами), ≈ 1–2 победы на его цвете.
  const REVIVE_ON = false;            // выключено до появления сервера (платежи и проверка покупок); код и цены готовы
  const REVIVE_BASE = 40;
  function reviveCost(tierFloat) {
    const pm = Tiers.PRICE_MULT, f = Math.max(1, Math.min(pm.length, tierFloat)), i = Math.min(pm.length - 2, Math.floor(f) - 1);
    return Math.max(1, Math.round(REVIVE_BASE * pm[i] * Math.pow(pm[i + 1] / pm[i], Math.min(1, f - 1 - i))));
  }
  const quickAllowed = (sp, heroTier, beaten, elite) => !sp.boss && !sp.zone && !elite && sp.tier <= heroTier - QUICK.below && !!beaten;

  /* ---------- логова ---------- */
  const lairLength = (tier) => 3 + (tier >= 6 ? 1 : 0) + (tier >= 9 ? 1 : 0);
  // Сундук логова: монеты по цвету и длине вылазки. Вещь цвета логова выдаёт game.js/mapview.js.
  const lairChestCoins = (tier, len) => Math.round(90 * CK_W * W_T.PRICE_MULT[tier - 1] * len);

  /* ---------- тайник ---------- */
  const cacheCoins = (tier, rand = Math.random) => Math.round(60 * CK_W * W_T.PRICE_MULT[tier - 1] * (0.8 + rand() * 0.4));

  /* ---------- Арена теней ---------- */
  // 1.8.4: десять рангов — по цветам уровней (Tiers): от красного до обсидианового
  const RANKS = [
    _t("Красный ранг"), _t("Оранжевый ранг"), _t("Жёлтый ранг"), _t("Зелёный ранг"), _t("Голубой ранг"),
    _t("Синий ранг"), _t("Фиолетовый ранг"), _t("Серебряный ранг"), _t("Золотой ранг"), _t("Обсидиановый ранг"),
  ];
  const STARS = 3, ARENA_DAILY = 10;
  // Титулы за ранги (в Гардеробе Ратуши, не продаются).
  const RANK_TITLES = { 1: 'apprentice', 2: 'fighter', 3: 'gladiator', 4: 'shadowhunter', 5: 'shadowbreaker', 6: 'champion', 7: 'arenaMaster', 8: 'arenaHero', 9: 'arenaLegend' };
  const freshArena = () => ({ rank: 0, stars: 0, wins: 0, losses: 0, best: 0, day: '', fights: 0,
    season: 0, sBest: 0, sWins: 0, sLosses: 0, streak: 0, bestStreak: 0, revs: 0, revenge: null, pending: null, history: [], log: [] });   // 1.7.4: сезоны, серии, реванш, журнал боёв
  // Победа: +1 звезда; три звезды — новый ранг. Поражение: −1 звезда (ранг не теряется); soft — реванш: звезда не снимается.
  function arenaResult(a, win, soft = false) {
    const out = { rankUp: false };
    if (win) {
      a.wins++; a.sWins = (a.sWins || 0) + 1;
      a.streak = (a.streak || 0) + 1; a.bestStreak = Math.max(a.bestStreak || 0, a.streak);
      if (a.rank < RANKS.length - 1) {
        a.stars++;
        if (a.stars >= STARS) { a.rank++; a.stars = 0; out.rankUp = true; }
      }
      a.best = Math.max(a.best, a.rank);
      a.sBest = Math.max(a.sBest || 0, a.rank);
    } else {
      a.losses++; a.sLosses = (a.sLosses || 0) + 1; a.streak = 0;
      if (!soft) a.stars = Math.max(0, a.stars - 1);
    }
    return out;
  }
  // Тень — копия героя другого игрока под управлением ИИ: уровень и ум растут с рангом.
  function shadow(rank, heroLevel, rand = Math.random) {
    const F = ['human', 'dwarf', 'elf', 'lizard'];
    const level = Math.max(1, Math.min(100, heroLevel + (rank - 3)));
    return { faction: F[Math.floor(rand() * F.length)], gender: rand() < 0.5 ? 'm' : 'f', level, ai: Math.min(100, 30 + rank * 7), seed: Math.floor(rand() * 1e9) };
  }
  const arenaCoins = (tier, rank) => Math.round(30 * CK_W * W_T.PRICE_MULT[tier - 1] * (1 + rank * 0.15));
  const rankCoins = (tier, rank) => Math.round(150 * CK_W * W_T.PRICE_MULT[tier - 1] * (rank + 1));

  /* ---------- 1.7.4: условие дня, реванш, сезоны ---------- */
  // Условие дня — правило боя с тенями, одно на всех в этот календарный день (по дате, по кругу). Приёмы берутся из
  // готовых (Combat.monsterTurnStart), числа — из Balance.abilities. За победу при условии дня — бонус к монетам.
  const ARENA_RULES = [
    { id: 'stun',   ability: 'stun',  name: _t("Оглушающий день"), desc: _t("тени оглушают: каждый 5-й ход вы пропускаете ход (Блок даёт шанс устоять)") },
    { id: 'toxin',  ability: 'toxin', name: _t("Ядовитый день"),   desc: _t("тени травят: каждый 4-й ход яд на 3 ваших хода") },
    { id: 'ward',   ability: 'ward',  name: _t("День щитов"),      desc: _t("тени прикрываются: каждый 4-й ход щит на 12% здоровья") },
    { id: 'tough',  hp: 1.25,          name: _t("День закалки"),    desc: _t("у теней на 25% больше здоровья") },
    { id: 'fierce', dmg: 1.15,         name: _t("Свирепый день"),   desc: _t("тени бьют на 15% сильнее") },
    { id: 'smart',  ai: 20,            name: _t("Хитрый день"),     desc: _t("тени играют умнее: ум +20") },
  ];
  const RULE_BONUS = 0.5, REVENGE_DAILY = 3, SEASON_KEEP = 8;
  // Номер календарного дня по строке «ГГГГ-ММ-ДД» (без часовых поясов: день — как на часах игрока).
  const dayNo = (day) => { const [y, m, d] = String(day).split('-').map(Number); return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000); };
  const arenaRule = (day) => ARENA_RULES[((dayNo(day) % ARENA_RULES.length) + ARENA_RULES.length) % ARENA_RULES.length];
  // Сезон — неделя с понедельника (1 января 1970 — четверг, отсюда +3).
  const seasonOf = (day) => Math.floor((dayNo(day) + 3) / 7);
  const seasonLabel = (season) => {
    const f = (n) => { const x = new Date(n * 86400000); return `${String(x.getUTCDate()).padStart(2, '0')}.${String(x.getUTCMonth() + 1).padStart(2, '0')}`; };
    return `${f(season * 7 - 3)} – ${f(season * 7 + 3)}`;
  };
  const seasonCoins = (tier, best) => Math.round(120 * CK_W * W_T.PRICE_MULT[tier - 1] * best);
  const SEASON_TITLE_RANK = 6;
  // Смена дня и недели: новый день — счётчик боёв с наградой и реванши заново; новая неделя — итог прошлой записывается
  // в таблицу (history), награда за лучший ранг недели ждёт в a.pending (выдаёт окно арены), ранг опускается на 2 ступени.
  function arenaSync(a, day, tier = 1) {
    const out = { newDay: false, newSeason: false };
    if (a.day !== day) { a.day = day; a.fights = 0; a.revs = 0; out.newDay = true; }
    const sn = seasonOf(day);
    if (a.season !== sn) {
      if (a.season && ((a.sWins || 0) + (a.sLosses || 0)) > 0) {
        a.history = a.history || [];
        a.history.unshift({ s: a.season, best: a.sBest || 0, w: a.sWins || 0, l: a.sLosses || 0 });
        a.history.length = Math.min(a.history.length, SEASON_KEEP);
        if ((a.sBest || 0) >= 1) a.pending = { season: a.season, best: a.sBest, coins: seasonCoins(tier, a.sBest), title: a.sBest >= SEASON_TITLE_RANK };
      }
      a.rank = Math.max(0, a.rank - 2); a.stars = 0;
      a.sBest = a.rank; a.sWins = 0; a.sLosses = 0; a.season = sn; a.next = null;
      out.newSeason = true;
    }
    return out;
  }
  // Журнал последних боёв арены (10 строк) для вкладки «Мои результаты».
  function arenaLog(a, entry) { a.log = a.log || []; a.log.unshift(entry); a.log.length = Math.min(a.log.length, 10); }

  /* ---------- Испытание дня ---------- */
  // Противники испытания: против стандартного героя 30-го уровня у «среднего» игрока шанс около 31% за попытку (симулятор, combat.js)
  const CH_POOL = ['wolf', 'bandit', 'goblin', 'skeleton', 'boar', 'orc', 'ghoul', 'crab', 'bolotnik', 'goat', 'eagle', 'leopard'];
  const CH_TRIES = 3;
  // Одно испытание на всех в этот день: противник, его цвет и зерно поля зависят только от даты.
  function challengeFor(day, known) {
    const pool = known ? CH_POOL.filter(known) : CH_POOL;
    const list = pool.length ? pool : ['wolf'];
    return { day, species: list[Math.floor(hash('ch', day) * list.length)], tier: 3, seed: Math.floor(hash('seed', day) * 2147483646) + 1 };
  }
  // Очки: победа — 1000 + до 500 за оставшееся ХП + по 20 за каждый ход быстрее 30; поражение — до 500 за урон.
  function challengeScore(win, hpPct, moves, dealtPct) {
    if (win) return 1000 + Math.round(Math.max(0, Math.min(1, hpPct)) * 500) + Math.max(0, 30 - moves) * 20;
    return Math.round(Math.max(0, Math.min(0.99, dealtPct)) * 500);
  }
  const freshChallenge = () => ({ day: '', tries: 0, best: 0, paid: '', history: {} });
  // Стандартный герой испытания: одинаковый для всех (уровень 30 — верх третьего цвета, без вещей, эликсиров, зелий и питомца);
  // противник того же, третьего цвета. Симулятор (без вещей, средний игрок): около 31% за попытку, около 65% хотя бы за одну из трёх.
  const CH_HERO = { level: 30 };

  return {
    pickElites, AFFIXES, AFFIX_IDS, ELITE, GUARDIANS, PACK, ENRAGE, ZONE, ZONE_BOSSES, ZONE_IDS, scaleZone, zoneHp, zonePower, zoneReward, EVENTS, LANDMARKS, LANDMARK_COUNT, LANDMARK_REVEAL, EVENT_RESPAWN, LAIR_COOLDOWN, BLESSINGS, LAIR_TIERS, QUICK, REVIVE_ON, REVIVE_BASE, reviveCost,
    RANKS, STARS, ARENA_DAILY, RANK_TITLES, CH_POOL, CH_TRIES, CH_HERO,
    hash, place, affixFor, quickAllowed, lairLength, lairChestCoins, cacheCoins,
    freshArena, arenaResult, shadow, arenaCoins, rankCoins, ARENA_RULES, RULE_BONUS, REVENGE_DAILY, SEASON_TITLE_RANK, arenaRule, seasonOf, seasonLabel, seasonCoins, arenaSync, arenaLog, dayNo, challengeFor, challengeScore, freshChallenge,
  };
})();

if (typeof module !== 'undefined') module.exports = World;
