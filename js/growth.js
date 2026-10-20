if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Рост существ на карте (2.0.0): если обычное существо победило героя, оно набирает шаг —
   становится чуть крепче и щедрее на награду. Шагов не больше 9 (в пределах своего цвета),
   у стартовых зон (цвет 1–2) — не больше 5. Когда существо убито, шаги обнуляются.
   Побег, ничья и специальные бои (стражи, хозяева, логова, осады, гости, редкие) на рост не влияют.
   Состояние — карта.grow = { идентификатор существа: число шагов }. */
const Growth = (() => {
  const STEP = 0.035, XP_STEP = 0.03, MAX = 9, START_MAX = 5;
  const cap = (tier) => (tier <= 2 ? START_MAX : MAX);
  const eligible = (sp) => !!sp && !sp.boss && !sp.zone && !sp.guest && !sp.rare && !sp.castle && !sp.siege;
  const num = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  const steps = (st, sp) => (st && st.grow && eligible(sp) ? Math.min(num(st.grow[sp.id]), cap(sp.tier)) : 0);
  const mul = (n) => 1 + STEP * num(n);              // множитель ХП и силы удара
  const xpMul = (n) => 1 + XP_STEP * num(n);         // множитель опыта и монет
  // Существо победило героя: +1 шаг (до предела). Возвращает новое число шагов.
  const bump = (st, sp) => {
    if (!st || !eligible(sp)) return 0;
    st.grow = st.grow && typeof st.grow === 'object' ? st.grow : {};
    st.grow[sp.id] = Math.min(cap(sp.tier), num(st.grow[sp.id]) + 1);
    return st.grow[sp.id];
  };
  // Существо убито: опыт обнуляется.
  const reset = (st, sp) => { if (st && st.grow && sp) delete st.grow[sp.id]; };
  return { STEP, XP_STEP, MAX, START_MAX, cap, eligible, steps, mul, xpMul, bump, reset };
})();
if (typeof module !== 'undefined') module.exports = Growth;
