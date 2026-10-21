if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Самоцветы каменных стражей (1.8.9). Страж подземелья на каждом 5-м уровне: 5-й — страж 1-го цвета … 50-й — 10-го.
   Самоцвет падает при победе. Применения: огранка вещи (одна грань на вещь; пояс получает запас стрелок),
   печать входа на этаж стража, продажа торговцу, титул за все 10 цветов. Чистый модуль, состояние — Profile.data.stones. */
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
    const bag = {}, seen = {}, seals = {};
    for (let c = 1; c <= COLORS; c++) { bag[c] = num(s.bag && s.bag[c]); seen[c] = !!(s.seen && s.seen[c]) || bag[c] > 0; seals[c] = num(s.seals && s.seals[c]); }
    return { bag, seen, seals };
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
  const cutBonus = (c) => (valid(c) ? { power: Math.max(1, Math.round(c * 0.045 * [1.67, 2.17, 2.83, 3.63, 4.59, 5.75, 7.22, 9.09, 11.61, 14.93][c - 1])) } : null);          // самоцвет несёт Силу — самую ценную характеристику (+1% на цвет; руна мощи — +4%)
  const beltCap = (c) => (valid(c) ? Math.ceil(c / 2) : 0);
  const sellPrice = (c, unitP) => Math.round(num(unitP) * (1 + c) * 0.6);
  // печать: SEAL_COST самоцветов одного цвета → 1 печать; печать отправляет сразу на этаж 5c (если вы там уже бывали)
  function makeSeal(s, c) { if (!valid(c) || !take(s, c, SEAL_COST)) return false; s.seals[c] += 1; return true; }
  const canSeal = (s, c, best) => valid(c) && s.seals[c] > 0 && num(best) >= sealFloor(c);
  function useSeal(s, c, best) { if (!canSeal(s, c, best)) return 0; s.seals[c] -= 1; return sealFloor(c); }
  const cutCost = (c) => 1;
  return { COLORS, HEX, SEAL_COST, valid, name, clean, count, seenCount, guardColor, sealFloor, add, take, dropCount, cutBonus, beltCap, sellPrice, cutCost, makeSeal, canSeal, useSeal };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Stones;
