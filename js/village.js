if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Улучшения деревни, закалка и косметика (1.5.1) — куда тратить золото. Без интерфейса — можно тестировать в Node.

   Пять зданий по 5 уровней: Кузница (закалка вещей до +N), Ратуша (Торговые ряды: больше лотов, меньше сбор),
   Мельница (амбар: находки ресурсов иногда удваиваются), Питомник (занятия быстрее), Алхимик (эликсиры действуют дольше).
   Уровень k открывается с цвета героя 2k, цена растёт вместе с экономикой цвета (Tiers.PRICE_MULT).
   Косметика (титулы и рамки портрета) силу не меняет — это траты «для души». */

const VG_T = (typeof Tiers !== 'undefined') ? Tiers : require('./tiers.js');

const Village = (() => {
  const MAX = 5;
  const IDS = ['forge', 'hall', 'mill', 'kennel', 'alchemist'];
  const INFO = {
    forge:     { name: _t("Кузница"),  perk: (n) => _t("закалка вещей до +{0}", [n]),                    unit: _t("Мастер Ковач учит закалять вещи: каждый шаг закалки усиливает вещь на 4%.") },
    hall:      { name: _t("Ратуша"),   perk: (n) => _t("Торговые ряды: {0} лотов, сбор {1}%", [lots(n), feePct(n)]), unit: _t("Староста расширяет прилавки и договаривается со сборщиками.") },
    mill:      { name: _t("Мельница"), perk: (n) => _t("находка ресурса удваивается с шансом {0}%", [10 * n]), unit: _t("Добрый мышь строит амбар: часть добычи со зверей не пропадает.") },
    kennel:    { name: _t("Питомник"), perk: (n) => _t("занятия питомца быстрее на {0}%", [12 * n]),  unit: _t("Смотрительница Ласка строит площадку для тренировок.") },
    alchemist: { name: _t("Алхимик"),  perk: (n) => _t("срок действия эликсиров +{0} (боёв)", [n]),  unit: _t("Тётушка Жабка варит эликсиры в выдержанных бочках.") },
  };
  // уровни и числа
  const lvl = (v, id) => Math.max(0, Math.min(MAX, Math.floor((v && v[id]) || 0)));
  const lots = (n) => 8 + n;
  const feePct = (n) => Math.round((5 - 0.8 * n) * 10) / 10;
  const reqTier = (k) => 2 * k;                                         // цвет героя, с которого открыт уровень k
  const cost = (id, k) => Math.round(1200 * VG_T.PRICE_MULT[2 * k - 1] * (id === 'forge' ? 1.5 : 1));   // в медных монетах
  // Что можно купить сейчас: { level (следующий), cost, reqTier, ok: цвет героя достаточен }
  function next(v, id, heroTier) {
    const n = lvl(v, id);
    if (n >= MAX) return null;
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
  const granaryChance = (v) => 0.1 * lvl(v, 'mill');
  const studyFactor = (v) => 1 - 0.12 * lvl(v, 'kennel');
  const elixirExtra = (v) => lvl(v, 'alchemist');

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
    { id: 'gladiator',   name: _t("Гладиатор"),       price: 0, arena: 3 },
    { id: 'champion',    name: _t("Чемпион арены"),   price: 0, arena: 6 },
    { id: 'arenaLegend', name: _t("Легенда арены"),   price: 0, arena: 9 },
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
    if (!it || it.arena || owns(c, kind, id) || coins < it.price || (it.story && !storyDone)) return 0;
    c[kind].push(id);
    return it.price;
  }
  function equip(c, kind, id) {                                         // id null — снять
    const key = kind === 'titles' ? 'title' : 'frame';
    if (id !== null && !owns(c, kind, id)) return false;
    c[key] = id; return true;
  }
  const titleName = (c) => { const t = c && find(TITLES, c.title); return t ? t.name : ''; };
  const frameColor = (c) => { const f = c && find(FRAMES, c.frame); return f ? f.color : null; };
  const fullName = (name, c) => { const t = titleName(c); return t ? `${t} ${name}` : name; };

  return { MAX, IDS, INFO, lvl, lots, feePct, reqTier, cost, next, buy, temperCap, maxLots, feeRate, granaryChance, studyFactor, elixirExtra,
    TITLES, FRAMES, fresh, owns, buyCosmetic, equip, titleName, frameColor, fullName };
})();

if (typeof module !== 'undefined') module.exports = Village;
