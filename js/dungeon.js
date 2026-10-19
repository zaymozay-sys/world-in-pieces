/* Подземелье (1.8.8): правила уровней — доля элитных существ и награды за новый уровень.
   Чистый модуль без DOM; карта уровня строится в js/hexmap.js (generateTower), состояние — Profile.data.tower = { floor, best, ... }. */
const Dungeon = (() => {
  const num = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  // доля элитных существ на уровне растёт: 18% на 1-м, потолок 60%; с 3-го уровня на карте всегда есть хотя бы один элитный
  const eliteShare = (f) => Math.min(0.6, 0.15 + 0.03 * Math.max(1, num(f)));
  const MIN_ELITE_LEVEL = 3;
  // награда за первый приход на новый уровень (поднялись по лестнице с уровня f): монеты каждый раз;
  // каждый 5-й уровень (страж побеждён) — сундук: эссенция, кристаллы, эликсиры; каждый 10-й — ещё свитки; каждый 25-й — драконье яйцо
  function reward(f) {
    f = Math.max(1, num(f));
    const r = { coins: 150 * f, res: [], cons: {}, egg: false, chest: f % 5 === 0 };
    if (r.chest) {
      r.res.push(['essence', 2 + Math.floor(f / 5)], ['crystal', 1 + Math.floor(f / 10)]);
      r.cons.elixir = 1 + Math.floor(f / 10);
      if (f % 10 === 0) r.cons.scroll = 1 + Math.floor(f / 20);
      if (f % 25 === 0) r.egg = true;
    }
    return r;
  }
  // 1.9.4: награда за победу над Хранителем глубин (каждый 10-й уровень, поверх сундука стража): ресурсы и расходники растут с глубиной
  function deepReward(f) {
    const k = Math.max(1, Math.floor(num(f) / 10));
    return { res: [['essence', 2 + k], ['crystal', 1 + Math.floor(k / 2)]], cons: { elixir: 1 + Math.floor(k / 2), scroll: k >= 2 ? 1 : 0 }, coins: 400 * k };
  }
  const levelText = (f) => _t("Уровень подземелья {0}", [num(f)]);
  return { eliteShare, MIN_ELITE_LEVEL, reward, deepReward, levelText };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Dungeon;
