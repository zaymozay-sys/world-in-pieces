if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Эликсиры (1.3.6): семь видов × 10 цветов. Эликсир даёт прибавку к одной характеристике на несколько боёв.
   Прибавка: +3 за каждый цвет (1–10 → +3…+30). Длительность: цвета 1–3 — 3 боя, 4–6 — 5 боёв, 7–10 — 8 боёв.
   С 5-го цвета у каждого вида есть побочный эффект (описание; в бой подключается отдельным шагом), с 10-го — «Великий»:
   вторая характеристика на половину силы. Одновременно действует по одному эликсиру каждого вида (сильнейший). */
const Elixirs = (() => {
  const KINDS = {
    power:      { name: _t("Эликсир силы"),        stat: 'power',      second: 'fury' },
    defense:    { name: _t("Эликсир брони"),       stat: 'defense',    second: 'block' },
    block:      { name: _t("Эликсир блока"),       stat: 'block',      second: 'defense' },
    ricochet:   { name: _t("Эликсир рикошета"),    stat: 'ricochet',   second: 'power' },
    fury:       { name: _t("Эликсир ярости"),      stat: 'fury',       second: 'power' },
    initiative: { name: _t("Эликсир инициативы"),  stat: 'initiative', second: 'cunning' },
    health:     { name: _t("Эликсир жизни"),       stat: 'health',     second: 'defense' },
  };
  const ORDER = Object.keys(KINDS);
  const MAX_TIER = 10;
  // 1.5.1: защитные виды +2 за цвет (по симулятору +3 давало около +30 пунктов шанса победы на 10-м цвете), остальные +3
  const PER_TIER = { defense: 2, block: 2, ricochet: 2 };
  const bonus = (tier, kind) => (PER_TIER[kind] || 3) * tier;
  const battles = (tier) => (tier <= 3 ? 3 : tier <= 6 ? 5 : 8);
  const key = (kind, tier) => kind + ':' + tier;
  const split = (k) => { const [kind, tier] = k.split(':'); return { kind, tier: Number(tier) }; };
  const price = (tier) => 30 * tier * tier;                        // монет за варку
  const need = (tier) => 2;                                        // ресурсов ровно этого цвета
  // 1.5.1: с 5-го цвета у эликсира один заметный эффект за бой (срабатывает сам, сила растёт с цветом).
  const FX_MIN = 5;
  function effect(kind, tier) {
    if (!KINDS[kind] || tier < FX_MIN) return null;
    const s = tier - 4;                                     // 1…6
    switch (kind) {
      case 'power': return { v: +(1.4 + 0.1 * s).toFixed(1) };            // первый удар ×
      case 'defense': return { v: Math.min(90, 40 + 10 * s) };            // первый полученный удар слабее на %
      case 'block': return { v: 30 + 10 * s };                            // первый блок бьёт в ответ на % удара
      case 'ricochet': return { v: 4 + 2 * s };                           // первый рикошет лечит на % ХП
      case 'fury': return { v: +(2 + 0.2 * s).toFixed(1) };               // первая Ярость бьёт ×
      case 'initiative': return { v: 1 };                                 // первый ход ваш
      case 'health': return { v: (s - 1) * 3 };                           // выживание: остаётся % ХП (минимум 1 ХП)
    }
    return null;
  }
  function sideText(kind, tier) {
    const fx = effect(kind, tier); if (!fx) return '';
    switch (kind) {
      case 'power': return _t("первый ваш удар в бою ×{0}", [fx.v]);
      case 'defense': return _t("первый удар по вам слабее на {0}%", [fx.v]);
      case 'block': return _t("первый ваш блок бьёт в ответ на {0}% удара", [fx.v]);
      case 'ricochet': return _t("первый ваш рикошет лечит на {0}% ХП", [fx.v]);
      case 'fury': return _t("первая Ярость бьёт ×{0} вместо ×2", [fx.v]);
      case 'initiative': return _t("первый ход боя — ваш");
      case 'health': return fx.v ? _t("раз за бой выживание с {0}% ХП", [fx.v]) : _t("раз за бой выживание с 1 ХП");
    }
    return '';
  }
  const describe = (kind, tier) => {
    const K = KINDS[kind], st = (typeof Gear !== 'undefined' && Gear.STAT_NAMES) ? Gear.STAT_NAMES : {};
    let t = _t("+{0} {1} на {2} боёв", [bonus(tier, kind), st[K.stat] || K.stat, battles(tier)]);
    if (tier >= 10) t += `; +${Math.round(bonus(tier, kind) / 2)} ${st[K.second] || K.second}`;
    if (tier >= FX_MIN) t += `; ${sideText(kind, tier)}`;
    return t;
  };
  // Суммарная прибавка от действующих эликсиров: active = { kind: { tier, left } }
  function bonusStats(active) {
    const out = {};
    for (const [kind, a] of Object.entries(active || {})) {
      if (!a || a.left <= 0 || !KINDS[kind]) continue;
      const K = KINDS[kind];
      out[K.stat] = (out[K.stat] || 0) + bonus(a.tier, kind);
      if (a.tier >= 10) out[K.second] = (out[K.second] || 0) + Math.round(bonus(a.tier, kind) / 2);
    }
    return out;
  }
  // Выпить: берём сильнейший; тот же цвет обновляет срок
  function drink(active, kind, tier, extra = 0) {                    // extra — бои сверху (улучшение Алхимика, 1.5.1)
    const cur = active[kind];
    if (cur && cur.left > 0 && cur.tier > tier) return false;
    active[kind] = { tier, left: battles(tier) + extra };
    return true;
  }
  function tick(active) {
    for (const a of Object.values(active || {})) if (a && a.left > 0) a.left--;
  }
  // Значок: флакон цвета уровня
  const icon = (kind, tier) => {
    const col = (typeof Tiers !== 'undefined' && Tiers.get(tier)) ? Tiers.get(tier).color : '#c33';
    return `<svg class="item-icon" viewBox="0 0 100 100" aria-hidden="true"><path d="M42 12h16v6l-2 2v12c14 7 24 22 24 38 0 12-8 18-30 18S20 82 20 70c0-16 10-31 24-38V20l-2-2z" fill="#e8f1f4" fill-opacity=".35" stroke="#222" stroke-width="3"/><path d="M24 62c0 14 8 20 26 20s26-6 26-20c-8 4-18-4-26 0s-18 4-26 0z" fill="${col}" stroke="#222" stroke-width="2"/><rect x="40" y="8" width="20" height="9" rx="2" fill="#8a5a2c" stroke="#222" stroke-width="2"/><text x="50" y="76" text-anchor="middle" font-size="22" font-weight="700" fill="#fff" stroke="#000" stroke-width=".6">${tier}</text></svg>`;
  };
  return { FX_MIN, effect, sideText, icon, KINDS, ORDER, MAX_TIER, bonus, battles, key, split, price, need, describe, bonusStats, drink, tick };
})();
if (typeof module !== 'undefined') module.exports = Elixirs;
