/* Случайные числа боя (1.9.x, подготовка к бою по сети). Все случайные события боя — новые камни, приёмы, удары,
   кому ходить первым — берутся отсюда, а не из Math.random. Обычно это и есть Math.random (поведение прежнее).
   В бою по сети оба игрока включают одно и то же зерно (seed), и обе игры считают бой одинаково.
   Подсказка хода, ИИ и косметика (капли, анимации) остаются на Math.random и общий поток не сдвигают. */
const BattleRand = (() => {
  let gen = null;                                  // null — обычный Math.random
  const mulberry = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const api = {
    next: () => (gen ? gen() : Math.random()),
    seed(s) { const n = Math.floor(Number(s)); if (!Number.isFinite(n)) return false; gen = mulberry(n); return true; },
    unseed() { gen = null; },
    get seeded() { return !!gen; },
    mulberry,
  };
  return api;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BattleRand;
