if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Улучшения деревни, закалка и косметика (1.5.1) — куда тратить золото. Без интерфейса — можно тестировать в Node.

   Пять зданий по 5 уровней: Кузница (закалка вещей до +N), Ратуша (Торговые ряды: больше лотов, меньше сбор),
   Мельница (амбар: находки ресурсов иногда удваиваются), Питомник (занятия быстрее), Алхимик (эликсиры действуют дольше).
   Уровень k открывается с цвета героя 2k, цена растёт вместе с экономикой цвета (Tiers.PRICE_MULT).
   Косметика (титулы и рамки портрета) силу не меняет — это траты «для души». */

const VG_T = (typeof Tiers !== 'undefined') ? Tiers : require('./tiers.js');

const Village = (() => {
  const MAX = 10;                                                       // 2.0.7: до 10 уровней (Кузница — 5: предел закалки задан вещами)
  const MAXES = { forge: 5, hall: 10, mill: 10, kennel: 10, alchemist: 10 };
  const maxOf = (id) => MAXES[id] || MAX;
  // Первые пять уровней — прежние числа; 6–10 прибавляют понемногу (накопительные таблицы по уровню 0…10)
  const MILL = [0, 10, 20, 30, 40, 50, 52, 54, 56, 58, 60];
  const KENNEL = [0, 12, 24, 36, 48, 60, 63, 66, 69, 72, 75];
  const ALCH = [0, 5, 10, 15, 20, 25, 30, 30, 30, 35, 35];
  const FEE = [5, 4.2, 3.4, 2.6, 1.8, 1, 0.9, 0.8, 0.7, 0.6, 0.5];
  const IDS = ['forge', 'hall', 'mill', 'kennel', 'alchemist'];
  const INFO = {
    forge:     { name: _t("Кузница"),  perk: (n) => _t("закалка вещей до +{0}", [n]),                    unit: _t("Мастер Ковач учит закалять вещи: каждый шаг закалки усиливает вещь на 4%.") },
    hall:      { name: _t("Ратуша"),   perk: (n) => _t("Торговые ряды: {0} лотов, сбор {1}%", [lots(n), feePct(n)]), unit: _t("Староста расширяет прилавки и договаривается со сборщиками.") },
    mill:      { name: _t("Мельница"), perk: (n) => _t("находка ресурса удваивается с шансом {0}%", [MILL[n]]), unit: _t("Добрый мышь строит амбар: часть добычи со зверей не пропадает.") },
    kennel:    { name: _t("Питомник"), perk: (n) => _t("занятия питомца быстрее на {0}%", [KENNEL[n]]),  unit: _t("Смотрительница Ласка строит площадку для тренировок.") },
    alchemist: { name: _t("Алхимик"),  perk: (n) => _t("сила эликсиров +{0}%", [ALCH[n]]),  unit: _t("Тётушка Жабка варит эликсиры в выдержанных бочках.") },
  };
  // уровни и числа
  const lvl = (v, id) => Math.max(0, Math.min(maxOf(id), Math.floor((v && v[id]) || 0)));
  const lots = (n) => (n <= 5 ? 8 + n : 13 + Math.floor((n - 5) / 2));
  const feePct = (n) => FEE[Math.max(0, Math.min(10, n))];
  const reqTier = (k) => (k <= 5 ? 2 * k : 10);                                         // цвет героя, с которого открыт уровень k
  const cost = (id, k) => Math.round(1200 * ((typeof Balance !== 'undefined') ? Balance : require('./balance.js')).rewards.coinBase * VG_T.PRICE_MULT[Math.min(9, 2 * Math.min(k, 5) - 1)] * (id === 'forge' ? 1.5 : 1) * (k > 5 ? Math.pow(1.5, k - 5) : 1));   // в медных монетах
  // Что можно купить сейчас: { level (следующий), cost, reqTier, ok: цвет героя достаточен }
  function next(v, id, heroTier) {
    const n = lvl(v, id);
    if (n >= maxOf(id)) return null;
    return { level: n + 1, cost: cost(id, n + 1), reqTier: reqTier(n + 1), ok: heroTier >= reqTier(n + 1) };
  }
  // Покупка: меняет v и возвращает цену (0 — нельзя). Монеты списывает вызывающий.
  function buy(v, id, heroTier, coins) {
    const nx = next(v, id, heroTier);
    if (!nx || !nx.ok || coins < nx.cost || !IDS.includes(id)) return 0;
    v[id] = nx.level;
    return nx.cost;
  }
  // Свойства для игры
  const temperCap = (v) => lvl(v, 'forge');
  const maxLots = (v) => lots(lvl(v, 'hall'));
  const feeRate = (v) => feePct(lvl(v, 'hall')) / 100;
  const granaryChance = (v) => MILL[lvl(v, 'mill')] / 100;
  const studyFactor = (v) => 1 - KENNEL[lvl(v, 'kennel')] / 100;
  const elixirExtra = (v) => ALCH[lvl(v, 'alchemist')] / 5;   // шаги по 5%

  // ---------- косметика ----------
  const G = 10000;                                                      // золотая монета в медных
  const TITLES = [
    { id: 'wanderer',  name: _t("Странник"),          price: 5 * G },
    { id: 'hunter',    name: _t("Охотник"),           price: 15 * G },
    { id: 'tracker',   name: _t("Следопыт"),          price: 40 * G },
    { id: 'warden',    name: _t("Страж Грани"),       price: 100 * G },
    { id: 'tamer',     name: _t("Укротитель"),        price: 250 * G },
    { id: 'heartbind', name: _t("Хранитель Сердца"),  price: 600 * G, story: true },    // только после финала
    { id: 'legend',    name: _t("Легенда Грани"),     price: 1500 * G },
    // 1.5.4: титулы Арены теней — не продаются, выдаются за ранг (World.RANK_TITLES)
    { id: 'apprentice',   name: _t("Ученик арены"),     price: 0, arena: 1 },
    { id: 'fighter',      name: _t("Боец арены"),       price: 0, arena: 2 },
    { id: 'gladiator',    name: _t("Гладиатор"),        price: 0, arena: 3 },
    { id: 'shadowhunter', name: _t("Охотник на теней"), price: 0, arena: 4 },
    { id: 'shadowbreaker',name: _t("Победитель теней"), price: 0, arena: 5 },
    { id: 'champion',     name: _t("Чемпион арены"),    price: 0, arena: 6 },
    { id: 'arenaMaster',  name: _t("Мастер арены"),     price: 0, arena: 7 },
    { id: 'arenaHero',    name: _t("Герой арены"),      price: 0, arena: 8 },
    { id: 'arenaLegend',  name: _t("Легенда арены"),    price: 0, arena: 9 },
    { id: 'pvp1', name: _t("Новобранец дуэлей"), price: 0, tourney: true },
    { id: 'pvp2', name: _t("Дуэлянт"), price: 0, tourney: true },
    { id: 'pvp3', name: _t("Боец"), price: 0, tourney: true },
    { id: 'pvp4', name: _t("Ветеран"), price: 0, tourney: true },
    { id: 'pvp5', name: _t("Мастер дуэлей"), price: 0, tourney: true },
    { id: 'pvp6', name: _t("Легенда арены"), price: 0, tourney: true },
    { id: 'ratingWeek', name: _t("Лучший недели"), price: 0, tourney: true },   // 1.9.2: первое место недельного рейтинга живых боёв
    { id: 'ratingMonth', name: _t("Лучший месяца"), price: 0, tourney: true },
    { id: 'tourneyChamp', name: _t("Победитель турнира"), price: 0, tourney: true },   // 1.9.x: за победу в турнире живых игроков
    { id: 'seasonChamp', name: _t("Чемпион сезона"),  price: 0, season: true },   // 1.7.4: за сезон с Золотым рангом и выше (World.SEASON_TITLE_RANK)
    // 1.8.4: титулы за достижения — выдаются сами (Village.syncTitles), не продаются
    // — за комплекты медалей (все медали раздела)
    { id: 'tGrKill',   name: _t("Великий охотник"),   price: 0, earn: { group: 'kill' },   how: _t("собрать все медали раздела «Охотник»") },
    { id: 'tGrStreak', name: _t("Повелитель линий"),  price: 0, earn: { group: 'streak' }, how: _t("собрать все медали раздела «Мастер линий»") },
    { id: 'tGrStrike', name: _t("Мастер Удара"),           price: 0, earn: { group: 'strike' }, how: _t("собрать все медали раздела «Мастер Удара»") },
    { id: 'tGrShot',   name: _t("Меткий стрелок"),    price: 0, earn: { group: 'shot' },   how: _t("собрать все медали раздела «Меткий стрелок»") },
    { id: 'tGrStyle',  name: _t("Мастер боя"),        price: 0, earn: { group: 'style' },  how: _t("собрать все медали раздела «Мастер боя»") },
    { id: 'tGrWorld',  name: _t("Бывалый путник"),    price: 0, earn: { group: 'world' },  how: _t("собрать все медали раздела «Путешественник»") },
    { id: 'tGrSecret', name: _t("Хранитель тайн"),    price: 0, earn: { group: 'secret' }, how: _t("собрать все медали раздела «Тайны»") },
    { id: 'tGrDaily',  name: _t("Верный испытанию"),  price: 0, earn: { group: 'daily' },  how: _t("собрать все медали раздела «Верный испытанию»") },
    { id: 'tGrElixir', name: _t("Алхимик"),           price: 0, earn: { group: 'elixir' }, how: _t("пройти все 10 уровней медали «Выпито эликсиров»") },
    // — за мир
    { id: 'tWVisit',   name: _t("Свой человек"),      price: 0, earn: { medal: 'world:visit' },  how: _t("побывать в 12 разных зданиях") },
    { id: 'tWChests',  name: _t("Хранитель ключей"),  price: 0, earn: { medal: 'world:chests' }, how: _t("открыть все четыре сундука побережья") },
    { id: 'tWCaches',  name: _t("Кладоискатель"),     price: 0, earn: { medal: 'world:caches' }, how: _t("найти 10 тайников") },
    { id: 'tWAltars',  name: _t("Паломник алтарей"),  price: 0, earn: { medal: 'world:altars' }, how: _t("получить благословение у 5 древних алтарей") },
    { id: 'tExplorer', name: _t("Исследователь"),     price: 0, earn: { explore: true },         how: _t("исследовать всю сушу карты (100% в журнале)") },
    // — по цвету героя (по одному на каждый из 10 цветов)
    { id: 'tHome',    name: _t("Хозяин дома"),     price: 0, earn: { decor: 6 },      how: _t("заполнить все шесть мест в доме украшениями") },
    { id: 'tStones',   name: _t("Хранитель камня"),  price: 0, earn: { stones: 10 },    how: _t("добыть самоцветы всех десяти цветов у стражей подземелья") },
    { id: 'tCollect', name: _t("Коллекционер"),     price: 0, earn: { decorOwn: 10 },  how: _t("собрать 10 украшений для дома") },
    { id: 'tT1',  name: _t("Носитель рубина"),     price: 0, earn: { tier: 1 },  how: _t("герой цвета «Красный»") },
    { id: 'tT2',  name: _t("Носитель янтаря"),     price: 0, earn: { tier: 2 },  how: _t("герой цвета «Оранжевый»") },
    { id: 'tT3',  name: _t("Носитель гелиодора"),    price: 0, earn: { tier: 3 },  how: _t("герой цвета «Жёлтый»") },
    { id: 'tT4',  name: _t("Носитель изумруда"),   price: 0, earn: { tier: 4 },  how: _t("герой цвета «Зелёный»") },
    { id: 'tT5',  name: _t("Носитель аквамарина"), price: 0, earn: { tier: 5 },  how: _t("герой цвета «Голубой»") },
    { id: 'tT6',  name: _t("Носитель сапфира"),    price: 0, earn: { tier: 6 },  how: _t("герой цвета «Синий»") },
    { id: 'tT7',  name: _t("Носитель аметиста"),   price: 0, earn: { tier: 7 },  how: _t("герой цвета «Фиолетовый»") },
    { id: 'tT8',  name: _t("Носитель серебра"),    price: 0, earn: { tier: 8 },  how: _t("герой цвета «Серебро»") },
    { id: 'tT9',  name: _t("Носитель золота"),     price: 0, earn: { tier: 9 },  how: _t("герой цвета «Золото»") },
    { id: 'tT10', name: _t("Носитель обсидиана"),  price: 0, earn: { tier: 10 }, how: _t("герой цвета «Обсидиановый»") },
    // — редкие: за первую победу над боссами дальних земель
    { id: 'tBBear',     name: _t("Гроза медведей"),   price: 0, earn: { boss: 'bear' },     how: _t("победить Медведя-шатуна") },
    { id: 'tBGriffin',  name: _t("Гроза грифонов"),  price: 0, earn: { boss: 'griffin' },  how: _t("победить Грифона") },
    { id: 'tBWyvern',   name: _t("Гроза виверн"),    price: 0, earn: { boss: 'wyvern' },   how: _t("победить Виверну") },
    { id: 'tBBasilisk', name: _t("Гроза василисков"), price: 0, earn: { boss: 'basilisk' }, how: _t("победить Василиска") },
    { id: 'tBCaptain',  name: _t("Гроза морей"),     price: 0, earn: { boss: 'captain' },  how: _t("победить Капитана") },
    { id: 'tBAll',      name: _t("Покоритель дальних земель"), price: 0, earn: { allBosses: ['bear', 'griffin', 'wyvern', 'basilisk', 'captain'] }, how: _t("победить всех пятерых: Шатуна, Грифона, Виверну, Василиска и Капитана") },
  ];
  const FRAMES = [
    { id: 'bronze',   name: _t("Бронзовая"),   price: 2 * G,    color: '#b9824a' },
    { id: 'silver',   name: _t("Серебряная"),  price: 15 * G,   color: '#c9d0da' },
    { id: 'gold',     name: _t("Золотая"),     price: 60 * G,   color: '#f0c23c' },
    { id: 'emerald',  name: _t("Изумрудная"),  price: 200 * G,  color: '#48d98c' },
    { id: 'royal',    name: _t("Королевская"), price: 600 * G,  color: '#a262ee' },
    { id: 'obsidian', name: _t("Обсидиановая"), price: 1500 * G, color: '#b6a5de' },
  ];
  const find = (list, id) => list.find((x) => x.id === id) || null;
  const fresh = () => ({ titles: [], frames: [], title: null, frame: null });
  function owns(c, kind, id) { return !!(c && c[kind] && c[kind].includes(id)); }
  // Покупка косметики: kind 'titles' | 'frames'. storyDone — пройден ли финал (для особого титула).
  function buyCosmetic(c, kind, id, coins, storyDone) {
    const it = find(kind === 'titles' ? TITLES : FRAMES, id);
    if (!it || it.arena || it.season || it.earn || owns(c, kind, id) || coins < it.price || (it.story && !storyDone)) return 0;
    c[kind].push(id);
    return it.price;
  }
  function equip(c, kind, id) {                                         // id null — снять
    const key = kind === 'titles' ? 'title' : 'frame';
    if (id !== null && !owns(c, kind, id)) return false;
    c[key] = id; return true;
  }
  // 1.8.4: какие титулы-за-достижения уже заслужены. ctx: { earned (медали), tier (цвет героя), bestiary, explored }
  function earnedTitleIds(ctx) {
    const M = (typeof Medals !== 'undefined') ? Medals : null, out = [];
    const won = (sp) => !!(ctx.bestiary && ctx.bestiary[sp] && ctx.bestiary[sp].wins >= 1);
    for (const t of TITLES) {
      const e = t.earn; if (!e) continue;
      let ok = false;
      if (e.group) ok = !!(M && M.groupDone(e.group, ctx.earned || []));
      else if (e.medal) ok = (ctx.earned || []).some((m) => m.id === e.medal);
      else if (e.tier) ok = (ctx.tier || 1) >= e.tier;
      else if (e.boss) ok = won(e.boss);
      else if (e.allBosses) ok = e.allBosses.every(won);
      else if (e.explore) ok = !!ctx.explored;
      else if (e.decor) ok = (ctx.decor || 0) >= e.decor;
      else if (e.stones) ok = (ctx.stones || 0) >= e.stones;
      else if (e.decorOwn) ok = (ctx.decorOwn || 0) >= e.decorOwn;
      if (ok) out.push(t.id);
    }
    return out;
  }
  // Выдаёт недостающие; возвращает названия новых.
  function syncTitles(c, ctx) {
    const fresh = [];
    for (const id of earnedTitleIds(ctx)) if (!owns(c, 'titles', id)) { c.titles.push(id); fresh.push(find(TITLES, id).name); }
    return fresh;
  }
  const titleName = (c) => { const t = c && find(TITLES, c.title); return t ? t.name : ''; };
  const frameColor = (c) => { const f = c && find(FRAMES, c.frame); return f ? f.color : null; };
  const fullName = (name, c) => { const t = titleName(c); return t ? `${t} ${name}` : name; };

  return { MAX, maxOf, IDS, INFO, lvl, lots, feePct, reqTier, cost, next, buy, temperCap, maxLots, feeRate, granaryChance, studyFactor, elixirExtra,
    TITLES, FRAMES, earnedTitleIds, syncTitles, fresh, owns, buyCosmetic, equip, titleName, frameColor, fullName };
})();

if (typeof module !== 'undefined') module.exports = Village;
