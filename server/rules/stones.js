if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Самоцветы каменных стражей (1.8.9). Страж подземелья на каждом 5-м уровне: 5-й — страж 1-го цвета … 50-й — 10-го.
   Самоцвет падает при победе. Применения: огранка вещи (одна грань на вещь; пояс получает запас стрелок),
   печать входа на этаж стража, продажа торговцу, титул за все 10 цветов. Чистый модуль, состояние — Profile.data.stones. */
const S_T = (typeof Tiers !== 'undefined') ? Tiers : (typeof require === 'function' ? require('./tiers.js') : null);
const Stones = (() => {
  const num = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  const COLORS = 10;
  const NAMES = [() => _t("Рубин"), () => _t("Янтарь"), () => _t("Цитрин"), () => _t("Изумруд"), () => _t("Бирюза"), () => _t("Сапфир"), () => _t("Аметист"), () => _t("Розовый кварц"), () => _t("Горный хрусталь"), () => _t("Чёрный алмаз")];
  const HEX = ['#d9453b', '#e08a2c', '#e8cf3a', '#4fbf6b', '#35bfb3', '#4a86e0', '#8a5fe0', '#e07ab8', '#dfe8ee', '#2b2b36'];
  const SEAL_COST = 3;
  const valid = (c) => Number.isInteger(c) && c >= 1 && c <= COLORS;
  const name = (c) => (valid(c) ? NAMES[c - 1]() : '');
  function clean(s) {
    s = s && typeof s === 'object' ? s : {};
    const bag = {}, seen = {}, seals = {}, punch = num(s.punch);
    for (let c = 1; c <= COLORS; c++) { bag[c] = num(s.bag && s.bag[c]); seen[c] = !!(s.seen && s.seen[c]) || bag[c] > 0; seals[c] = num(s.seals && s.seals[c]); }
    return { bag, seen, seals, punch };
  }
  const count = (s, c) => (valid(c) ? s.bag[c] : 0);
  const seenCount = (s) => Object.values(s.seen).filter(Boolean).length;
  const guardColor = (floor) => (floor >= 5 && floor % 5 === 0 ? Math.min(COLORS, floor / 5) : 0);
  const sealFloor = (c) => (valid(c) ? c * 5 : 0);                 // печать цвета c открывает вход сразу на этаж 5c
  function add(s, c, n = 1) { if (!valid(c)) return false; s.bag[c] += num(n); s.seen[c] = true; return true; }
  function take(s, c, n = 1) { if (!valid(c) || s.bag[c] < n) return false; s.bag[c] -= n; return true; }
  // сколько самоцветов роняет страж: 1, с шансом 30% — ещё один (r — число 0…1 для тестов)
  const dropCount = (r) => (r < 0.3 ? 2 : 1);
  // огранка: у вещи entry.cut = цвет; чем выше цвет, тем больше бонус (пояс вместо этого расширяет запас стрелок)
  const CUT_POWER = [1, 1, 2, 2, 3, 3, 4, 5, 6, 7];   // 2.0.7 (D2): ровный рост Силы огранки по цветам вместо рывка на 9–10
  const cutBonus = (c) => (valid(c) ? { power: CUT_POWER[c - 1] } : null);          // самоцвет несёт Силу — самую ценную характеристику
  const beltCap = (c) => (valid(c) ? Math.ceil(c / 2) : 0);
  const sellPrice = (c, unitP) => Math.round(num(unitP) * (1 + c) * 0.6);
  // печать: SEAL_COST самоцветов одного цвета → 1 печать; печать отправляет сразу на этаж 5c (если вы там уже бывали)
  function makeSeal(s, c) { if (!valid(c) || !take(s, c, SEAL_COST)) return false; s.seals[c] += 1; return true; }
  const canSeal = (s, c, best) => valid(c) && s.seals[c] > 0 && num(best) >= sealFloor(c);
  function useSeal(s, c, best) { if (!canSeal(s, c, best)) return 0; s.seals[c] -= 1; return sealFloor(c); }

  /* ---------- 2.0.7: гнездо самоцвета ----------
     Гнездо в вещи пробивают пробойником (entry.hole = true). В гнездо вставляется любой самоцвет из запаса (entry.gem = цвет), его крепят смолой;
     он даёт вещи прибавку по своему цвету СВЕРХ огранки. Самоцвет можно вынуть — он возвращается в запас. Пробойник покупается у Журавля-художника. */
  const GEM_BONUS = [          // цвет → [характеристика, очки]: ~8 очков вещи (вес характеристики как в items.js), растут с цветом по statMult
    [['power', 8]], [['fury', 3]], [['initiative', 4]], [['health', 16]], [['ricochet', 3]], [['block', 4]], [['cunning', 3]], [['defense', 5]],
    [['power', 4], ['health', 8]], [['power', 3], ['defense', 2], ['initiative', 1]],
  ];
  const gemBonus = (c) => {
    if (!valid(c) || !S_T) return null;
    const out = {};
    for (const [k, pts] of GEM_BONUS[c - 1]) out[k] = Math.max(1, Math.round(pts * S_T.statMult(k, c)));
    return out;
  };
  // Пробойник пробивает гнездо (расходуется), смола крепит самоцвет в гнезде (при каждой вставке). Всё дорого: самоцветы — доводка для тех, у кого уже есть всё.
  const DRILL = { punch: 1, resinBase: 3, resinMaxTier: 6 };
  // Гнёзда самоцветов вещи: entry.gems — массив, по элементу на пробитое гнездо (0 — пусто, иначе цвет камня).
  // Старые поля hole/gem читаются как одно гнездо. Гнёзд на вещь 2, третье открывается особой заслугой (Огранщик).
  const MAX_HOLES = 2;
  function gemList(e) {
    if (!e) return [];
    if (Array.isArray(e.gems)) return e.gems;
    return e.hole ? [e.gem > 0 ? e.gem : 0] : [];
  }
  const maxHoles = (extra) => MAX_HOLES + (extra ? 1 : 0);
  const drillCost = (tier) => ({ punch: DRILL.punch });
  const fixCost = (tier) => ({ resin: DRILL.resinBase + Math.max(1, num(tier)), resinTier: Math.min(DRILL.resinMaxTier, Math.max(1, num(tier))) });   // смола цвета вещи (но не выше 6-го: выше смола не выпадает)
  const punchPrice = (heroTier) => Math.round(2000 * S_T.PRICE_MULT[S_T.clamp(heroTier) - 1]);
  // Скорпионы подземелья: на этаже с шансом HexMap.TOWER_SCORP_SPAWN стоит один; цвет скорпиона = цвет самоцвета, который он может уронить (шанс очень малый, с глубиной растёт, от уровня героя не зависит)
  const SCORP = { base: 0.015, perFloor: 0.0005, cap: 0.05 };
  const scorpChance = (floor) => Math.min(SCORP.cap, SCORP.base + SCORP.perFloor * (Math.max(1, num(floor)) - 1));
  const cutCost = (c) => 1;
  return { MAX_HOLES, maxHoles, gemList, COLORS, HEX, SEAL_COST, valid, name, clean, count, seenCount, guardColor, sealFloor, add, take, dropCount, cutBonus, beltCap, sellPrice, cutCost, GEM_BONUS, gemBonus, DRILL, drillCost, fixCost, punchPrice, SCORP, scorpChance, makeSeal, canSeal, useSeal };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Stones;
