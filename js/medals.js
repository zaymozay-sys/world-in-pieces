if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Медали: аккаунтная коллекция наград за (а) первую победу над каждым видом бестиария и (б) круглые
   вехи собранных за все бои линий из 5 камней подряд. Каждая медаль даёт небольшой, но НАВСЕГДА
   постоянный бонус характеристики — заметно меньше, чем даёт вещь того же цвета, чтобы десяток-другой
   медалей не перевешивал обычную прокачку снаряжением (см. js/balance.js: budget растёт с уровнем
   в разы быстрее). Чистая логика без интерфейса — можно тестировать в Node (см. js/daily.js — тот же приём).

   Хранится в Profile.data.medals = { earned: [{ id, tier }], fiveStreaks: 0 }:
     earned      — список уже полученных медалей; tier — цвет героя на момент получения (для свечения медали);
     fiveStreaks — сколько всего линий из 5 камней собрано игроком за все бои (для вех). */

const ME_B = (typeof Bestiary !== 'undefined') ? Bestiary : require('./bestiary.js');
const ME_G = (typeof Gear !== 'undefined') ? Gear : require('./items.js');

const ME_X = () => ((typeof Elixirs !== 'undefined') ? Elixirs : require('./elixirs.js'));

const Medals = (() => {
  // Медаль за первую победу над видом. Характеристика подобрана по духу монстра — понемногу разных
  // приёмов, чтобы коллекция медалей давала не один раздутый стат, а всестороннюю прибавку.
  const KILL_STAT = {
    rat: 'health', wolf: 'power', bandit: 'block', goblin: 'power', skeleton: 'defense',
    boar: 'power', troll: 'health', golem: 'defense', wraith: 'ricochet', dragon: 'fury',
    orc: 'power', orcShaman: 'power', ghoul: 'health', crab: 'block', bolotnik: 'ricochet',
    shadow: 'fury', treant: 'defense', mushroom: 'health',
  };
  // Небольшой фиксированный бонус за медаль (в единицах той же характеристики, что и у вещей — см. items.js).
  // Сила медалей — число, прибавляемое к удару. Значения заданы в старой шкале «очков» и переводятся функцией P
  // (≈ 0,045 × средний рост урона героя ≈ 0,22 Силы за очко, не меньше 1): все медали вместе дают порядка 20 Силы.
  const P = (n) => Math.max(1, Math.round(n * 0.22));
  const KILL_AMOUNT = { power: P(3), health: 3, defense: 1, initiative: 1, ricochet: 1, block: 1, fury: 1 };
  const killMedalId = (species) => 'kill:' + species;
  const killSpecies = (id) => (id.startsWith('kill:') ? id.slice(5) : null);

  // Заслужена ли медаль за первую победу над видом. killCounts — Profile.data.bestiary (вид → { wins, tier }).
  // Возвращает id медали, если она положена и ещё не получена, иначе null.
  function checkKillMedal(species, killCounts, earned = []) {
    if (!ME_B.MONSTERS[species]) return null;
    const rec = killCounts && killCounts[species];
    if (!rec || rec.wins < 1) return null;
    const id = killMedalId(species);
    return earned.some((m) => m.id === id) ? null : id;
  }

  // Растущая серия вех по числу собранных за все бои линий из 5 камней — тот же дух, что у чисел
  // ежедневной лотереи и заданий (js/daily.js, js/quests.js): не слишком часто, но и не годами ждать.
  const STREAK_MILESTONES = [50, 150, 300, 600, 1000, 1750, 3000];
  const streakMedalId = (n) => 'streak:' + n;

  // Заслужена ли следующая веха. Возвращает id самой младшей ещё не полученной вехи, которая уже достигнута,
  // либо null. total — Profile.data.medals.fiveStreaks (счётчик всех собранных линий из 5 камней).
  function checkFiveStreakMedal(total, earned = []) {
    for (const n of STREAK_MILESTONES) {
      const id = streakMedalId(n);
      if (total >= n && !earned.some((m) => m.id === id)) return id;
    }
    return null;
  }

  // Растущая серия вех для убийств заклинанием Удар (см. js/combat.js/js/game.js: Удар — универсальное
  // заклинание всех фракций, доступное с 1-го уровня, наносящее фиксированный базовый урон героя; когда
  // им добит монстр, засчитывается в эту отдельную серию, не смешиваясь с медалями «первая победа над
  // видом»). Те же по духу вехи, что у похожих «числовых» серий (see STREAK_MILESTONES) — не слишком
  // часто в начале, но и не годами ждать сотую.
  const STRIKE_MILESTONES = [5, 15, 40, 100, 220, 450, 850, 1500, 2500, 4000];
  const strikeMedalId = (n) => 'strike:' + n;

  // Заслужена ли следующая веха убийств Ударом. total — счётчик добиваний Ударом за все бои
  // (см. Profile.data.medals.strikeKills). Возвращает id самой младшей ещё не полученной достигнутой вехи.
  function checkStrikeMedal(total, earned = []) {
    for (const n of STRIKE_MILESTONES) {
      const id = strikeMedalId(n);
      if (total >= n && !earned.some((m) => m.id === id)) return id;
    }
    return null;
  }

  // 1.3.9 «Меткий стрелок»: добивания метательным оружием (болт, лунная стрела). Те же вехи, бонус — Проворство.
  const SHOT_MILESTONES = [5, 15, 40, 100, 220, 450, 850, 1500, 2500, 4000];
  const shotMedalId = (n) => 'shot:' + n;
  function checkShotMedal(total, earned = []) {
    for (const n of SHOT_MILESTONES) { const id = shotMedalId(n); if (total >= n && !earned.some((m) => m.id === id)) return id; }
    return null;
  }

  // 2.0.4 «Чародей»: заклинания, применённые в ПОБЕДНЫХ боях (все виды вместе: Крест, Квадрат, Молния, Хаос, Удар, выстрелы). Числа большие —
  // по 10–20 заклинаний за бой, до последней вехи — годы игры. Счётчик — Profile.data.medals.spellWins.
  const SPELL_MILESTONES = [100, 300, 750, 1500, 3000, 6000, 12000, 25000, 50000, 100000];
  const spellMedalId = (n) => 'spell:' + n;
  function checkSpellMedal(total, earned = []) {
    for (const n of SPELL_MILESTONES) { const id = spellMedalId(n); if (total >= n && !earned.some((m) => m.id === id)) return id; }
    return null;
  }

  /* 1.7.5: «Алхимик» — по медали за первый выпитый эликсир каждого из девяти видов (в бою). Бонус — по духу эликсира, небольшой;
     комплект из всех девяти даёт умение «Мастер зелий» (эликсиры сильнее на 20%) и реликвию «Флакон алхимика». */
  const ELIXIR_ORDER = ['power', 'defense', 'block', 'ricochet', 'fury', 'cunning', 'health', 'stones', 'swap'];
  const ELIXIR_BONUS = { power: { power: 1 }, defense: { defense: 1 }, block: { block: 1 }, ricochet: { ricochet: 1 }, fury: { fury: 1 }, cunning: { cunning: 1 }, health: { health: 4 }, stones: { magic: 1 }, swap: { initiative: 1 } };
  const elixirMedalId = (k) => 'elixir:' + k;
  const elixirKey = (id) => (id.startsWith('elixir:') ? id.slice(7) : null);
  // Медаль за выпитый эликсир вида kind: id, если положена и ещё не получена, иначе null.
  function checkElixirMedal(kind, earned = []) {
    return null;   // 2.0.7: медали за первый глоток каждого вида отменены — вместо них 10-уровневая цепочка «Выпито»
  }

  // 1.7.5: «Выпито эликсиров» — вехи по числу выпитых в боях эликсиров любого вида (счётчик Profile.data.medals.drunk).
  const ENDURE_AT = [400, 3000, 9000];   // 2.0.7: на этих вехах «Выпито эликсиров» выдаётся эликсир «Стойкость»
  const DRUNK_MILESTONES = [50, 150, 400, 900, 1800, 3000, 4500, 6500, 9000, 12000];   // 2.0.7: 10 уровней, «выпито должно быть много»; первая веха — 50
  const drunkMedalId = (n) => 'drunk:' + n;
  function checkDrunkMedal(total, earned = []) {
    for (const n of DRUNK_MILESTONES) { const id = drunkMedalId(n); if (total >= n && !earned.some((m) => m.id === id)) return id; }
    return null;
  }

  /* 1.6.2: ступени медали за вид — бронза (1 победа), серебро (25), золото (100). Бонус медали растёт ×1, ×2, ×3.
     Ступень считается по Profile.data.bestiary[вид].wins, отдельно в сейве ничего не хранится. */
  const RANK_WINS = [1, 25, 100];
  const RANK_NAMES = [_t("Бронза"), _t("Серебро"), _t("Золото")];
  const rankFor = (wins) => RANK_WINS.filter((w) => (wins || 0) >= w).length;           // 0..3
  const nextRankWins = (wins) => RANK_WINS.find((w) => (wins || 0) < w) || null;
  const rankOf = (species, bestiary) => Math.max(1, rankFor(bestiary && bestiary[species] && bestiary[species].wins));

  // Бонус характеристик одной медали: { стат: значение }. bestiary — Profile.data.bestiary (для ступени медали за вид).
  function bonusFor(id, bestiary) {
    const species = killSpecies(id);
    if (species) {
      const stat = KILL_STAT[species] || 'power';
      return { [stat]: KILL_AMOUNT[stat] * (bestiary ? rankOf(species, bestiary) : 1) };
    }
    if (id.startsWith('streak:')) {
      const n = Number(id.slice(7)), idx = Math.max(0, STREAK_MILESTONES.indexOf(n));
      const amt = 2 + idx;                        // дальние вехи редки — награда за них весомее
      return { power: amt, defense: amt };
    }
    if (id.startsWith('strike:')) {
      const n = Number(id.slice(7)), idx = Math.max(0, STRIKE_MILESTONES.indexOf(n));
      const amt = 1 + idx;                        // та же логика, что у streak: дальше веха — весомее награда
      return { fury: amt };
    }
    if (id.startsWith('spell:')) {                  // 2.0.4: ХП растёт с вехой, Сила — каждую вторую веху
      const idx = Math.max(0, SPELL_MILESTONES.indexOf(Number(id.slice(6))));
      return { health: 4 * (1 + idx), power: 1 + Math.floor(idx / 2) };
    }
    if (id.startsWith('drunk:')) {                  // здоровье растёт с вехой; каждая третья веха (3-я, 6-я) добавляет Хитрость
      const idx = Math.max(0, DRUNK_MILESTONES.indexOf(Number(id.slice(6))));
      return idx % 3 === 2 ? { health: 3 * (1 + idx), cunning: (idx + 1) / 3 } : { health: 3 * (1 + idx) };
    }
    if (elixirKey(id)) return { ...(ELIXIR_BONUS[elixirKey(id)] || {}) };
    if (id.startsWith('m:')) { const mm = masterOf(id); return mm ? MASTER[mm.s].bonus(mm.idx) : {}; }
    if (id.startsWith('daily:')) { const idx = Math.max(0, DAILY_MILESTONES.indexOf(Number(id.slice(6)))); return { power: P(1 + idx), health: 3 * (1 + idx) }; }
    if (secretKey(id)) return { ...(SECRET[secretKey(id)] ? SECRET[secretKey(id)].bonus : {}) };
    if (worldKey(id)) return { ...(WORLD[worldKey(id)] ? WORLD[worldKey(id)].bonus : {}) };
    if (styleKey(id)) return { ...(STYLE[styleKey(id)] ? STYLE[styleKey(id)].bonus : {}) };
    if (id.startsWith('shot:')) {
      const idx = Math.max(0, SHOT_MILESTONES.indexOf(Number(id.slice(5))));
      // 1.6.2: в основном здоровье, а каждая третья веха (idx 2, 5, 8) — ещё и полезная характеристика (Рикошет)
      return idx % 3 === 2 ? { health: 4 * (1 + idx), ricochet: (idx + 1) / 3 } : { health: 4 * (1 + idx) };
    }
    return {};
  }

  /* Уровень героя, необходимый, чтобы значок медали id визуально «открылся» полноценным цветом своего тира
     на Стене доблести (см. js/screens.js), даже если игрок уже выполнил условие получения — см.
     docs/balance.md «Стена доблести». Веха/вид даётся раньше, чем открывается её тир-бейдж: тир растёт
     с индексом вехи (дальняя веха — старше тир), а требуемый уровень героя следует тому же шагу, что и
     открытие вещей по цвету (Hero.itemLevel — один цвет на каждые 10 уровней героя). */
  function tierUnlockLevel(id) {
    if (killSpecies(id)) return 1;                              // медали за первую победу видны с самого начала
    if (id.startsWith('m:')) { const mm = masterOf(id); return mm ? 1 + mm.idx * 10 : 1; }
    const list = id.startsWith('spell:') ? SPELL_MILESTONES : id.startsWith('drunk:') ? DRUNK_MILESTONES : id.startsWith('streak:') ? STREAK_MILESTONES : id.startsWith('strike:') ? STRIKE_MILESTONES : id.startsWith('shot:') ? SHOT_MILESTONES : null;
    if (!list) return 1;
    const idx = Math.max(0, list.indexOf(Number(id.slice(id.indexOf(':') + 1))));
    return 1 + idx * 10;                                         // 1.6.6: шаг — 10 уровней на цвет, как у вещей
  }

  /* 1.6.2: разделы Стены доблести и бонус за комплект. Когда в разделе получены ВСЕ медали, к бонусам
     добавляется награда раздела (она весомее одной медали, но сумма по-прежнему меньше, чем даёт хорошая вещь). */
  const GROUPS = {
    kill:   { name: _t("Охотник"),         ids: () => ME_B.ORDER.map(killMedalId),            bonus: { power: P(3), defense: 3, health: 10 } },
    streak: { name: _t("Мастер линий"),    ids: () => STREAK_MILESTONES.map(streakMedalId),    bonus: { power: P(4), defense: 4 } },
    strike: { name: _t("Мастер Удара"),    ids: () => STRIKE_MILESTONES.map(strikeMedalId),    bonus: { fury: 6 } },
    style:  { name: _t("Мастер боя"),        ids: () => STYLE_ORDER.map(styleMedalId),        bonus: { power: P(8), ricochet: 3 } },
    world:  { name: _t("Путешественник"),    ids: () => WORLD_ORDER.map(worldMedalId),        bonus: { health: 20, block: 2 } },
    secret: { name: _t("Тайны"),             ids: () => SECRET_ORDER.map(secretMedalId),       bonus: { cunning: 4 } },
    daily:  { name: _t("Верный испытанию"),  ids: () => DAILY_MILESTONES.map(dailyMedalId),   bonus: { power: P(4), health: 15 } },
    shot:   { name: _t("Меткий стрелок"),  ids: () => SHOT_MILESTONES.map(shotMedalId),        bonus: { health: 20, ricochet: 2 } },
    elixir: { name: _t("Алхимик"),          ids: () => DRUNK_MILESTONES.map(drunkMedalId),         bonus: { health: 15, power: P(3), defense: 3 } },
  };
  /* 1.6.3: за каждый собранный комплект — особое умение (действует в обычных боях, не в Испытании дня) и реликвия-амулет
     (id вещи — 'relic-<раздел>', выдаётся один раз, см. Profile.grantMedal). */
  const PERKS = {
    kill:   { name: _t("Чутьё охотника"),   desc: _t("+25% монет и ресурсов с побед") },
    streak: { name: _t("Эхо линий"),         desc: _t("бой начинается с половиной заряда приёма народа") },
    shot:   { name: _t("Меткий глаз"),       desc: _t("+35% к урону болта и бомбы") },
    style:  { name: _t("Боевая стойка"),     desc: _t("первый удар по вам в каждом бою блокируется") },
    world:  { name: _t("Бывалый путник"),    desc: _t("+15% опыта с побед") },
    secret: { name: _t("Счастливчик"),       desc: _t("+10% к шансу найти расходник после победы") },
    elixir: { name: _t("Мастер зелий"),    desc: _t("эликсиры действуют на 20% сильнее") },
    daily:  { name: _t("Второе дыхание"),    desc: _t("раз за бой вы встаёте с 30% ХП вместо гибели") },
  };
  const perksOf = (earned = []) => Object.keys(PERKS).filter((k) => groupDone(k, earned));
  const hasPerk = (earned, k) => groupDone(k, earned);
  const relicId = (k) => 'relic-' + k;
  const GROUP_ORDER = ['kill', 'streak', 'strike', 'shot', 'style', 'world', 'secret', 'daily', 'elixir'];
  const groupProgress = (key, earned = []) => { const ids = GROUPS[key].ids(); return { done: ids.filter((id) => earned.some((m) => m.id === id)).length, total: ids.length }; };
  const groupDone = (key, earned = []) => { const p = groupProgress(key, earned); return p.total > 0 && p.done >= p.total; };

  /* 1.6.2: медали за СТИЛЬ боя — выдаются за победу над обычным существом (не учебный, не арена). Выдаются один раз.
     stats боя: { fullHp: герой цел, moves: ходов, spells: заклинаний, elixirs: эликсиров }. */
  const STYLE = {
    flawless:  { name: _t("Без единой царапины"),  desc: _t("победить, не потеряв ни одного ХП"),               bonus: { block: 2 },     test: (s) => s.fullHp },
    swift:     { name: _t("Молниеносная победа"),  desc: _t("победить не больше чем за 4 хода"),                bonus: { power: P(2) },     test: (s) => s.moves <= 4 },
    nomagic:   { name: _t("Чистые руки"),          desc: _t("победить без единого заклинания"),                  bonus: { defense: 2 },   test: (s) => s.spells === 0 },
    onespell:  { name: _t("Один выстрел"),         desc: _t("победить, использовав ровно одно заклинание"),      bonus: { fury: 2 },      test: (s) => s.spells === 1 },
    alchemist: { name: _t("Алхимик боя"),          desc: _t("победить, выпив в одном бою не меньше трёх эликсиров"), bonus: { health: 8 }, test: (s) => s.elixirs >= 3 },
  };
  const STYLE_ORDER = ['flawless', 'swift', 'nomagic', 'onespell', 'alchemist'];
  const styleMedalId = (k) => 'style:' + style0(k);
  const style0 = (k) => k;
  const styleKey = (id) => (id.startsWith('style:') ? id.slice(6) : null);
  // Какие медали стиля заслужены этим боем и ещё не получены (id).
  function checkStyleMedals(stats, earned = []) {
    return STYLE_ORDER.filter((k) => STYLE[k].test(stats || {}) && !earned.some((m) => m.id === styleMedalId(k))).map(styleMedalId);
  }

  /* 1.6.2: медали за мир — обойти здания, открыть все четыре сундука, найти тайники, получить благословения.
     Счётчики хранятся в Profile.data.medals.world = { visited: {id:1}, caches, altars }. */
  const WORLD = {
    visit:  { name: _t("Свой в посёлке"),   desc: _t("побывать в 12 разных зданиях"),            bonus: { health: 10 },  test: (w) => Object.keys(w.visited || {}).length >= 12 },
    chests: { name: _t("Хранитель ключей"), desc: _t("открыть все четыре сундука побережья"),    bonus: { power: P(3) },    test: (w, d) => !!(d && d.chestOpened && d.xchests && d.xchests.ruby && d.xchests.emerald && d.xchests.obsidian) },
    caches: { name: _t("Кладоискатель"),    desc: _t("найти 10 тайников"),                       bonus: { defense: 3 },  test: (w) => (w.caches || 0) >= 10 },
    altars: { name: _t("Благословлённый"),  desc: _t("получить благословение у 5 древних алтарей"), bonus: { magic: 3 }, test: (w) => (w.altars || 0) >= 5 },
  };
  const WORLD_ORDER = ['visit', 'chests', 'caches', 'altars'];
  const worldMedalId = (k) => 'world:' + k;
  const worldKey = (id) => (id.startsWith('world:') ? id.slice(6) : null);
  function checkWorldMedals(w, d, earned = []) {
    return WORLD_ORDER.filter((k) => WORLD[k].test(w || {}, d) && !earned.some((m) => m.id === worldMedalId(k))).map(worldMedalId);
  }

  /* 1.6.2: коллекции — медали за все виды одного семейства дают +N% урона по этому семейству
     (Звери — самое большое семейство, поэтому награда выше). Считается из списка полученных медалей. */
  const collections = () => {
    const fam = {};
    for (const id of ME_B.ORDER) { const f = ME_B.MONSTERS[id].family; (fam[f] = fam[f] || []).push(id); }
    return Object.entries(fam).filter(([, ids]) => ids.length >= 2).map(([family, ids]) => ({ family, species: ids, pct: ids.length > 10 ? 8 : 5 }));
  };
  const collectionProgress = (c, earned = []) => c.species.filter((s) => earned.some((m) => m.id === killMedalId(s))).length;
  // Процент урона по семейству family от собранных коллекций (0, если коллекция не собрана).
  function familyBonus(earned = [], family) {
    const c = collections().find((x) => x.family === family);
    return c && collectionProgress(c, earned) === c.species.length ? c.pct : 0;
  }

  /* 1.6.2: скрытые медали — на Стене показаны как «?» без подсказки, пока не получены.
     Условия: ctx = { hpLeft, tier, heroTier, lossStreak, spent }. */
  const SECRET = {
    hair:    { name: _t("На волоске"),         desc: _t("победить, оставшись с 1 ХП"),                       bonus: { block: 2 },     test: (c) => c.win && c.hpLeft === 1 },
    giant:   { name: _t("Убийца великанов"),   desc: _t("победить существо на два цвета сильнее вас"),       bonus: { power: P(3) },     test: (c) => c.win && c.tier >= c.heroTier + 2 },
    stubborn:{ name: _t("Упрямый"),            desc: _t("проиграть 10 боёв подряд и не сдаться"),             bonus: { health: 10 },   test: (c) => (c.lossStreak || 0) >= 10 },
    spender: { name: _t("Широкая душа"),       desc: _t("потратить за один раз не меньше 100 золотых"),       bonus: { defense: 2 },   test: (c) => (c.spent || 0) >= 100 * 10000 },
  };
  const SECRET_ORDER = ['hair', 'giant', 'stubborn', 'spender'];
  const secretMedalId = (k) => 'secret:' + k;
  const secretKey = (id) => (id.startsWith('secret:') ? id.slice(7) : null);
  function checkSecretMedals(ctx, earned = []) {
    return SECRET_ORDER.filter((k) => SECRET[k].test(ctx || {}) && !earned.some((m) => m.id === secretMedalId(k))).map(secretMedalId);
  }

  /* 1.6.2: «Испытание дня» — серия дней подряд с победой в нём. Хранится в Profile.data.medals.daily = { last, n }. */
  const DAILY_MILESTONES = [3, 7, 14, 30, 60];
  const dailyMedalId = (n) => 'daily:' + n;
  const prevDay = (day) => { const [y, m, d] = day.split('-').map(Number), t = new Date(y, m - 1, d - 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  // Учитывает победу в испытании в день day: возвращает новое состояние { last, n }.
  function dailyStep(state, day) {
    const s = state || { last: '', n: 0 };
    if (s.last === day) return s;
    return { last: day, n: s.last && prevDay(day) === s.last ? s.n + 1 : 1 };
  }
  function checkDailyMedal(n, earned = []) {
    for (const m of DAILY_MILESTONES) { const id = dailyMedalId(m); if (n >= m && !earned.some((e) => e.id === id)) return id; }
    return null;
  }

  /* 2.0.7: «мастерские» серии — по счётчику, 10 вех. Счётчики в Profile.data.medals.cnt[серия]:
     craft — изделий создано и закалено в Кузнице; depth — рекордный этаж подземелья (не сумма, а максимум);
     cut — огранок и вставленных самоцветов; rune — рун нанесено и обновлено. Бонусы небольшие, в единицах. */
  const MASTER = {
    craft: { name: _t("Кузнец"),      ms: [3, 8, 15, 25, 40, 60, 85, 115, 150, 200], bonus: (i) => ({ power: 1 + Math.floor(i / 2) }),                          group: { health: 20 } },
    depth: { name: _t("Глубина"),     ms: [2, 4, 6, 8, 10, 13, 16, 20, 25, 30],            bonus: (i) => ({ health: 4 * (1 + i) }),                                  group: { defense: 4, block: 2 } },
    cut:   { name: _t("Огранщик"),    ms: [1, 3, 6, 10, 16, 24, 34, 46, 60, 80],           bonus: (i) => ({ cunning: 1 + Math.floor(i / 3), health: 2 * (1 + i) }),  group: { cunning: 4 } },
    rune:  { name: _t("Рунописец"),   ms: [2, 6, 12, 22, 36, 54, 76, 100, 130, 170],       bonus: (i) => ({ initiative: 1 + Math.floor(i / 2) }),                   group: { power: P(4) } },
  };
  const MASTER_ORDER = ['craft', 'depth', 'cut', 'rune'];
  const masterMedalId = (s, n) => 'm:' + s + ':' + n;
  function masterOf(id) {
    const m = /^m:(\w+):(\d+)$/.exec(id || ''), d = m && MASTER[m[1]];
    if (!d) return null;
    const n = Number(m[2]), idx = d.ms.indexOf(n);
    return idx < 0 ? null : { s: m[1], n, idx };
  }
  // Новые медали серии s при счётчике total (все ещё не полученные пороги).
  const checkMaster = (s, total, earned = []) => (MASTER[s] ? MASTER[s].ms.filter((n) => total >= n && !earned.some((m) => m.id === masterMedalId(s, n))).map((n) => masterMedalId(s, n)) : []);
  const masterDone = (s, earned = []) => MASTER[s].ms.every((n) => earned.some((m) => m.id === masterMedalId(s, n)));
  function masterText(s, n) {
    return s === 'craft' ? _t("{0} изделий в Кузнице (создано и закалено)", [n]) : s === 'depth' ? _t("Этаж подземелья: {0}", [n])
      : s === 'cut' ? _t("{0} огранок и вставленных самоцветов", [n]) : _t("{0} рун нанесено и обновлено", [n]);
  }

  const MEDAL_CAPS = { block: 10 };   // суммарно по всем медалям
  // Суммарный бонус всех полученных медалей — combine-совместимый объект характеристик (см. Gear.combine).
  function bonusStats(earned = [], bestiary) {
    let s = ME_G.blankStats();
    for (const m of earned.filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i)) s = ME_G.combine(s, bonusFor(m.id, bestiary));
    for (const k of GROUP_ORDER) if (groupDone(k, earned)) s = ME_G.combine(s, GROUPS[k].bonus);
    for (const k of MASTER_ORDER) if (masterDone(k, earned)) s = ME_G.combine(s, { ...ME_G.blankStats(), ...MASTER[k].group });
    for (const k in MEDAL_CAPS) if (s[k] > MEDAL_CAPS[k]) s[k] = MEDAL_CAPS[k];   // 2.0.7 (D2): потолок вещей остаётся вещам
    return s;
  }

  // Человекочитаемое название медали (для окна медалей).
  function nameFor(id) {
    const species = killSpecies(id);
    if (species) return ME_B.MONSTERS[species] ? _t("Первая победа: {0}", [ME_B.MONSTERS[species].name]) : id;
    if (id.startsWith('streak:')) return _t("{0} линий из 5 камней", [id.slice(7)]);
    if (id.startsWith('strike:')) return _t("{0} добиваний Ударом", [id.slice(7)]);
    if (id.startsWith('shot:')) return _t("{0} добиваний метким выстрелом", [id.slice(5)]);
    if (styleKey(id) && STYLE[styleKey(id)]) return STYLE[styleKey(id)].name;
    if (worldKey(id) && WORLD[worldKey(id)]) return WORLD[worldKey(id)].name;
    if (secretKey(id) && SECRET[secretKey(id)]) return SECRET[secretKey(id)].name;
    if (id.startsWith('spell:')) return _t("{0} заклинаний в победных боях", [id.slice(6)]);
    if (id.startsWith('drunk:')) return _t("{0} выпитых эликсиров", [id.slice(6)]);
    if (elixirKey(id)) return _t("Выпит: {0}", [ME_X().KINDS[elixirKey(id)].name]);
    if (id.startsWith('m:')) { const mm = masterOf(id); return mm ? masterText(mm.s, mm.n) : id; }
    if (id.startsWith('daily:')) return _t("{0} дней подряд в Испытании дня", [id.slice(6)]);
    return id;
  }

  return { MASTER, MASTER_ORDER, masterMedalId, masterOf, checkMaster, masterDone, SPELL_MILESTONES, spellMedalId, checkSpellMedal, DRUNK_MILESTONES, ENDURE_AT, drunkMedalId, checkDrunkMedal, ELIXIR_ORDER, ELIXIR_BONUS, elixirMedalId, elixirKey, checkElixirMedal, PERKS, perksOf, hasPerk, relicId, DAILY_MILESTONES, dailyMedalId, dailyStep, checkDailyMedal, SECRET, SECRET_ORDER, secretMedalId, secretKey, checkSecretMedals, collections, collectionProgress, familyBonus, WORLD, WORLD_ORDER, worldMedalId, worldKey, checkWorldMedals, STYLE, STYLE_ORDER, styleMedalId, styleKey, checkStyleMedals, RANK_WINS, RANK_NAMES, rankFor, nextRankWins, rankOf, GROUPS, GROUP_ORDER, groupProgress, groupDone, SHOT_MILESTONES, shotMedalId, checkShotMedal, KILL_STAT, KILL_AMOUNT, STREAK_MILESTONES, STRIKE_MILESTONES, killMedalId, killSpecies, streakMedalId,
    strikeMedalId, checkKillMedal, checkFiveStreakMedal, checkStrikeMedal, bonusFor, bonusStats, nameFor, tierUnlockLevel };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Medals;
