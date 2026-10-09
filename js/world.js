if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* 1.5.4: «живой мир» — элитные существа, события на карте, логова, механики стражей, Арена теней и Испытание дня.
   Без интерфейса: чистые функции от карты, даты и профиля — проверяются тестами в Node (tests/world.test.js).

   Всё, что ставится на карту, выбирается своим генератором от зерна карты ПОСЛЕ существ (HexMap.generate не меняется),
   поэтому у старых сохранений существа стоят на прежних местах. */

const W_HM = (typeof HexMap !== 'undefined') ? HexMap : require('./hexmap.js');
const W_T = (typeof Tiers !== 'undefined') ? Tiers : require('./tiers.js');

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
  const AFFIX_IDS = Object.keys(AFFIXES);
  // Элитный: крепче и злее, но и добычи больше. Числа — для боя (game.js) и наград (rewardFor).
  const ELITE = { hp: 1.25, dmg: 1.05, coins: 1.6, xp: 1.5, share: 0.1 };
  const affixName = (id) => (AFFIXES[id] ? AFFIXES[id].name : '');

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

  /* ---------- события ---------- */
  const EVENTS = {
    cache:    { name: _t("Тайник"),            w: 34, glyph: 'cache' },
    altar:    { name: _t("Древний алтарь"),     w: 20, glyph: 'altar' },
    merchant: { name: _t("Странствующий торговец"), w: 16, glyph: 'cart' },
    beast:    { name: _t("Раненый зверь"),      w: 14, glyph: 'paw' },
    ambush:   { name: _t("Подозрительные кусты"), w: 16, glyph: 'bush' },
  };
  const EVENT_RESPAWN = 45 * MIN, LAIR_COOLDOWN = 60 * MIN;
  const BLESSINGS = {
    might: { name: _t("Сила алтаря"), desc: _t("+15% урона"), amount: 15, fights: 3 },
    stone: { name: _t("Стойкость алтаря"), desc: _t("+20% к максимуму ХП"), amount: 20, fights: 3 },
  };
  const LAIR_TIERS = [2, 3, 5, 7, 9];

  // Хэш для детерминированных выборов (элитные, свойства, награды по дню).
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

    // события: около 28 штук, не теснее одной соты друг к другу
    const pool = cells.filter((c) => free(c) && !taken.has(c.idx));
    const events = [];
    const total = Object.values(EVENTS).reduce((s, e) => s + e.w, 0);
    for (let k = 0; k < 400 && events.length < 28 && pool.length; k++) {
      const c = pool[Math.floor(rand() * pool.length)];
      if (taken.has(c.idx) || !spaced(c.idx, 2)) continue;
      let x = rand() * total, kind = 'cache';
      for (const [id, e] of Object.entries(EVENTS)) { x -= e.w; if (x <= 0) { kind = id; break; } }
      taken.add(c.idx);
      events.push({ id: 'E' + events.length, idx: c.idx, kind, tier: Math.max(1, W_HM.tierAt(c.d)) });
    }

    // элитные: около 10% обычных существ от 2-го цвета; свойство не совпадает с приёмом вида
    const elites = new Map();
    for (const sp of map.spawns) {
      if (sp.boss || sp.tier < 2) continue;
      if (hash(map.seed, 'elite', sp.id) >= ELITE.share) continue;
      elites.set(sp.id, AFFIX_IDS[Math.floor(hash(map.seed, 'affix', sp.id) * AFFIX_IDS.length)]);
    }
    return { lairs, events, elites };
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
  const quickAllowed = (sp, heroTier, beaten, elite) => !sp.boss && !elite && sp.tier <= heroTier - QUICK.below && !!beaten;

  /* ---------- логова ---------- */
  const lairLength = (tier) => 3 + (tier >= 6 ? 1 : 0) + (tier >= 9 ? 1 : 0);
  // Сундук логова: монеты по цвету и длине вылазки. Вещь цвета логова выдаёт game.js/mapview.js.
  const lairChestCoins = (tier, len) => Math.round(90 * W_T.PRICE_MULT[tier - 1] * len);

  /* ---------- тайник ---------- */
  const cacheCoins = (tier, rand = Math.random) => Math.round(60 * W_T.PRICE_MULT[tier - 1] * (0.8 + rand() * 0.4));

  /* ---------- Арена теней ---------- */
  const RANKS = [
    _t("Деревянный ранг"), _t("Медный ранг"), _t("Бронзовый ранг"), _t("Железный ранг"), _t("Серебряный ранг"),
    _t("Золотой ранг"), _t("Обсидиановый ранг"), _t("Мастер арены"), _t("Чемпион"), _t("Легенда арены"),
  ];
  const STARS = 3, ARENA_DAILY = 10;
  // Титулы за ранги (в Гардеробе Ратуши, не продаются).
  const RANK_TITLES = { 3: 'gladiator', 6: 'champion', 9: 'arenaLegend' };
  const freshArena = () => ({ rank: 0, stars: 0, wins: 0, losses: 0, best: 0, day: '', fights: 0 });
  // Победа: +1 звезда; три звезды — новый ранг. Поражение: −1 звезда (ранг не теряется).
  function arenaResult(a, win) {
    const out = { rankUp: false };
    if (win) {
      a.wins++;
      if (a.rank < RANKS.length - 1) {
        a.stars++;
        if (a.stars >= STARS) { a.rank++; a.stars = 0; out.rankUp = true; }
      }
      a.best = Math.max(a.best, a.rank);
    } else {
      a.losses++;
      a.stars = Math.max(0, a.stars - 1);
    }
    return out;
  }
  // Тень — копия героя другого игрока под управлением ИИ: уровень и ум растут с рангом.
  function shadow(rank, heroLevel, rand = Math.random) {
    const F = ['human', 'dwarf', 'elf', 'lizard'];
    const level = Math.max(1, Math.min(100, heroLevel + (rank - 3)));
    return { faction: F[Math.floor(rand() * F.length)], gender: rand() < 0.5 ? 'm' : 'f', level, ai: Math.min(100, 30 + rank * 7), seed: Math.floor(rand() * 1e9) };
  }
  const arenaCoins = (tier, rank) => Math.round(30 * W_T.PRICE_MULT[tier - 1] * (1 + rank * 0.15));
  const rankCoins = (tier, rank) => Math.round(150 * W_T.PRICE_MULT[tier - 1] * (rank + 1));

  /* ---------- Испытание дня ---------- */
  // Противники испытания: против стандартного героя 25-го уровня у «среднего» игрока шанс 55–78% (симулятор, combat.js)
  const CH_POOL = ['wolf', 'bandit', 'goblin', 'skeleton', 'boar', 'orc', 'ghoul', 'crab', 'bolotnik', 'goat', 'eagle', 'leopard'];
  const CH_TRIES = 3;
  // Одно испытание на всех в этот день: противник, его цвет и зерно поля зависят только от даты.
  function challengeFor(day, known) {
    const pool = known ? CH_POOL.filter(known) : CH_POOL;
    const list = pool.length ? pool : ['wolf'];
    return { day, species: list[Math.floor(hash('ch', day) * list.length)], tier: 2, seed: Math.floor(hash('seed', day) * 2147483646) + 1 };
  }
  // Очки: победа — 1000 + до 500 за оставшееся ХП + по 20 за каждый ход быстрее 30; поражение — до 500 за урон.
  function challengeScore(win, hpPct, moves, dealtPct) {
    if (win) return 1000 + Math.round(Math.max(0, Math.min(1, hpPct)) * 500) + Math.max(0, 30 - moves) * 20;
    return Math.round(Math.max(0, Math.min(0.99, dealtPct)) * 500);
  }
  const freshChallenge = () => ({ day: '', tries: 0, best: 0, paid: '', history: {} });
  // Стандартный герой испытания: одинаковый для всех (уровень 25, без вещей, эликсиров, зелий и питомца).
  const CH_HERO = { level: 25 };

  return {
    AFFIXES, AFFIX_IDS, ELITE, GUARDIANS, PACK, ENRAGE, EVENTS, EVENT_RESPAWN, LAIR_COOLDOWN, BLESSINGS, LAIR_TIERS, QUICK, REVIVE_ON, REVIVE_BASE, reviveCost,
    RANKS, STARS, ARENA_DAILY, RANK_TITLES, CH_POOL, CH_TRIES, CH_HERO,
    hash, place, affixFor, affixName, quickAllowed, lairLength, lairChestCoins, cacheCoins,
    freshArena, arenaResult, shadow, arenaCoins, rankCoins, challengeFor, challengeScore, freshChallenge,
  };
})();

if (typeof module !== 'undefined') module.exports = World;
