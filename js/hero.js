/* Уровни героя (без интерфейса — можно тестировать в Node).

   Уровень растёт от опыта за победы. На каждый цвет — 5 уровней: 1–5 — Красный, 6–10 — Оранжевый, …,
   46–50 — Обсидиановый. С уровнем растут:
     - базовое ХП и урон камней — тем же темпом, что ХП и урон существ (Tiers.GROWTH), поэтому
       герой своего уровня и существо своего цвета сражаются на равных на любом цвете;
     - лимит очков снаряжения;
     - доступ к вещам: вещь цвета N можно надеть с уровня (N − 1) × 5 + 1.
   Опыта на следующий уровень нужно всё больше (см. Balance.hero.xp). */

const H_T = (typeof Tiers !== 'undefined') ? Tiers : require('./tiers.js');
const H_B = (typeof Balance !== 'undefined') ? Balance : require('./balance.js');

const Hero = (() => {
  const C = H_B.hero;
  const MAX_LEVEL = C.maxLevel;
  const clampL = (L) => Math.max(1, Math.min(MAX_LEVEL, Math.floor(L) || 1));

  // «Дробный цвет» уровня: 1-й уровень — 1.0 (Красный), 6-й — 2.0 (Оранжевый), 50-й — 10.8.
  const tierFloat = (L) => 1 + (clampL(L) - 1) / C.levelsPerTier;
  // Цвет, с существами которого герой этого уровня сражается на равных.
  const tierFor = (L) => Math.min(H_T.MAX, Math.floor(tierFloat(L)));
  const growth = (L) => H_T.at(H_T.GROWTH, tierFloat(L));

  const baseHp = (L) => Math.round(C.baseHp * growth(L));
  const dmgMult = (L) => Math.round(growth(L) * H_B.damage.stone * 100) / 100;   // множитель урона камней
  const budget = (L) => Math.round(C.budget * H_T.at(H_T.POINT_MULT, tierFloat(L)));
  // С какого уровня можно надеть вещь цвета tier.
  const itemLevel = (tier) => (H_T.clamp(tier) - 1) * C.levelsPerTier + 1;
  const canWear = (tier, L) => clampL(L) >= itemLevel(tier);

  // Красивое округление: 23 → 25, 287 → 290, 1234 → 1250.
  function nice(x) {
    const step = x < 100 ? 5 : x < 1000 ? 10 : x < 10000 ? 50 : 100;
    return Math.max(step, Math.round(x / step) * step);
  }
  // Сколько опыта нужно, чтобы с уровня L перейти на L + 1: строго больше, чем на предыдущий уровень.
  const winsFor = (L) => C.xp.wins0 + C.xp.winsGrow * (clampL(L) - 1);
  const NEED = [0];
  for (let L = 1; L < MAX_LEVEL; L++) {
    let x = nice(winsFor(L) * C.xp.perWin * growth(L));
    if (x <= NEED[L - 1]) x = NEED[L - 1] + (x < 100 ? 5 : x < 1000 ? 10 : 50);
    NEED.push(x);
  }
  const need = (L) => (clampL(L) >= MAX_LEVEL ? Infinity : NEED[clampL(L)]);
  // Сколько опыта всего нужно, чтобы достичь уровня L.
  function totalFor(L) {
    let s = 0;
    for (let k = 1; k < clampL(L); k++) s += need(k);
    return s;
  }
  // Уровень по накопленному опыту: { level, into (опыта на текущем уровне), need (до следующего), total }.
  function levelOf(xp) {
    let L = 1, left = Math.max(0, Math.floor(xp) || 0);
    while (L < MAX_LEVEL && left >= need(L)) { left -= need(L); L++; }
    return { level: L, into: left, need: need(L), total: xp };
  }

  /* Опыт за победу над существом species (объект из бестиария) цвета tier героем уровня L.
     Существо сильнее вашего цвета даёт больше опыта, слабее — меньше. */
  function xpReward(species, tier, L) {
    const d = H_T.clamp(tier) - tierFloat(L), D = C.diff;
    const k = d >= 0 ? Math.min(D.max, 1 + D.up * d) : Math.max(D.min, 1 + D.down * d);
    return Math.max(1, Math.round(C.xp.perWin * H_T.GROWTH[H_T.clamp(tier) - 1] * (species.xp || 1) * k));
  }

  // Во сколько раз цены расходников выше, чем на 1-м уровне (растут вместе с монетами за победы).
  const priceScale = (L) => H_T.at(H_T.PRICE_MULT, tierFloat(L));
  const consumablePrice = (base, L) => Math.max(1, Math.round(base * priceScale(L)));

  return { priceScale, consumablePrice, MAX_LEVEL, tierFloat, tierFor, growth, baseHp, dmgMult, budget, itemLevel, canWear, need, totalFor, levelOf, xpReward, nice };
})();

// Для тестов и симулятора в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Hero;
