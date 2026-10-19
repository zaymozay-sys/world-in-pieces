if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Стрелки компаса и путевой дневник (1.8.9). Стрелка — расходник-телепорт: «домой» (к Ратуше) или «к метке» (на любую поставленную метку).
   Работают и хранятся только с надетым Поясом: без пояса стрелки не добавить и не использовать. Запас каждого вида — CAP_BASE + цвет пояса.
   Путевой дневник — одноразовый предмет (делает Бобёр в Библиотеке): с ним метки на карте можно называть.
   Чистый модуль: состояние Profile.data.compass = { arrows:{home,mark}, diary:true|false }; названия меток — в состоянии карты (st.pinNames). */
const Compass = (() => {
  const KINDS = ['home', 'mark'];
  const CAP_BASE = 4, NAME_MAX = 20, PIN_NAME_CAP = 40;
  const NAME = { home: () => _t("Стрелка домой"), mark: () => _t("Стрелка к метке") };
  const num = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  function clean(c) {
    c = c && typeof c === 'object' ? c : {};
    const a = c.arrows && typeof c.arrows === 'object' ? c.arrows : {};
    return { arrows: { home: num(a.home), mark: num(a.mark) }, diary: !!c.diary };
  }
  // beltTier — цвет надетого пояса (1…10) или 0, если пояса нет
  const cap = (beltTier) => (beltTier > 0 ? CAP_BASE + Math.min(10, num(beltTier)) : 0);
  const count = (c, kind) => c.arrows[kind] || 0;
  const room = (c, kind, beltTier) => Math.max(0, cap(beltTier) - count(c, kind));
  const canAdd = (c, kind, beltTier, n = 1) => KINDS.includes(kind) && beltTier > 0 && room(c, kind, beltTier) >= n;
  function add(c, kind, beltTier, n = 1) { if (!canAdd(c, kind, beltTier, n)) return false; c.arrows[kind] += n; return true; }
  // использовать можно только с поясом и если стрелка есть
  const canUse = (c, kind, beltTier) => KINDS.includes(kind) && beltTier > 0 && count(c, kind) > 0;
  function use(c, kind, beltTier) { if (!canUse(c, kind, beltTier)) return false; c.arrows[kind]--; return true; }
  // рецепты Кузницы: монеты в «зельях здоровья» P, ресурсы любого цвета
  const RECIPES = {
    home: { p: 1, res: { scrap: 2, crystal: 1 } },
    mark: { p: 3, res: { scrap: 4, crystal: 2 } },
  };
  const DIARY = { p: 3, res: { silk: 2, feather: 3 } };
  const cost = (r, P, factor = 1) => Math.max(1, Math.round(r.p * P * factor));
  // название метки: обрезается, пробелы схлопываются, угловые скобки убираются; пустое — без названия
  function cleanName(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX); }
  function setName(names, idx, name) {
    const n = cleanName(name);
    if (n) { if (!(idx in names) && Object.keys(names).length >= PIN_NAME_CAP) return false; names[idx] = n; } else delete names[idx];
    return true;
  }
  // оставляет названия только у существующих меток
  function prune(names, pins) { for (const k of Object.keys(names)) if (!pins.includes(Number(k))) delete names[k]; return names; }
  return { KINDS, CAP_BASE, NAME_MAX, NAME, RECIPES, DIARY, clean, cap, count, room, canAdd, add, canUse, use, cost, cleanName, setName, prune };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Compass;
