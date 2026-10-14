if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Эликсиры (1.3.6, переделаны в 1.6.0): восемь видов × 10 цветов. Пьются ТОЛЬКО в бою, в любой свой ход, бесплатно (ход не тратится),
   расходуются из сумки; на карте не действуют. Сила — до конца хода (перед ударом), Броня/Блок/Рикошет/Ярость/Хитрость — 10 своих ходов,
   Жизнь (ХП цифрой) и Камни — мгновенно, общий запас «раз в 3 хода». С 5-го цвета у вида есть побочный эффект (раз с каждого
   выпитого эликсира), с 10-го — «Великий»: вторая характеристика на пятую часть силы (1.8.0, было половина: блок как вторая характеристика у Брони и Хитрости давал +6 п.п.). Прибавка за цвет — PER_TIER (см. tools/elixir-balance.js). */
const Elixirs = (() => {
  // 1.6.0: эликсиры пьются в бою, в любой момент своего хода, ход не тратят. mode: 'turn' — до конца текущего хода (пить перед ударом),
  // 'long' — на LONG_TURNS своих ходов, 'instant' — мгновенно, общий запас «раз в INSTANT_CD хода».
  const KINDS = {
    power:      { name: _t("Эликсир силы"),        stat: 'power',      second: 'fury',    mode: 'turn' },
    defense:    { name: _t("Эликсир брони"),       stat: 'defense',    second: 'block',   mode: 'long' },
    block:      { name: _t("Эликсир блока"),       stat: 'block',      second: 'defense', mode: 'long' },
    ricochet:   { name: _t("Эликсир рикошета"),    stat: 'ricochet',   second: 'power',   mode: 'long' },
    fury:       { name: _t("Эликсир ярости"),      stat: 'fury',       second: 'power',   mode: 'long' },
    cunning:    { name: _t("Эликсир хитрости"),    stat: 'cunning',    second: 'block',    mode: 'long' },   // 1.6.0: вместо Проворства (оно решает лишь первый ход, а эликсиры пьются уже в бою)
    health:     { name: _t("Эликсир жизни"),       stat: null,         second: null,      mode: 'instant' },
    stones:     { name: _t("Эликсир камней"),      stat: null,         second: null,      mode: 'instant' },
    swap:       { name: _t("Эликсир превращения"), stat: null,         second: null,      mode: 'instant' },
  };
  const LONG_TURNS = 10, INSTANT_CD = 3;
  const GREAT = { k: 0.2 };                                          // «Великий» (10-й цвет): вторая характеристика на эту долю силы
  const HEAL = [30, 40, 50, 70, 90, 120, 160, 210, 270, 350];        // лечение «Жизни» в ХП по цвету (кратно 10; 1-й цвет — 30, 10-й — 350)
  const heal = (tier) => HEAL[Math.max(1, Math.min(10, tier)) - 1];
  const STONES = [4, 3, 3, 3, 3, 2, 2, 2, 2, 2];                    // 1.8.0: по стольку камней каждого вида даёт «Камни»; чем выше цвет, тем дешевле заклинания героя, поэтому камни ценнее: 2–4 штуки дают +7…+9 п.п. на любом цвете (3…8 давали +4…+22)
  const stonesGain = (tier) => STONES[Math.max(1, Math.min(10, tier)) - 1];
  const SWAP = [5, 5, 5, 6, 6, 6, 7, 7, 7, 8];                      // «Превращение»: столько камней самого частого вида → в самый редкий
  const swapAmount = (tier) => SWAP[Math.max(1, Math.min(10, tier)) - 1];
  // 1.8.0: переносим не больше, чем нужно до равенства (половина разницы): иначе при малой разнице самый частый вид опустел бы и стал самым редким
  const swapMove = (tier, hi, lo, mult = 1) => Math.max(0, Math.min(Math.round(swapAmount(tier) * mult), Math.floor((hi - lo) / 2)));
  const turns = (kind) => (KINDS[kind].mode === 'turn' ? 1 : KINDS[kind].mode === 'long' ? LONG_TURNS : 0);
  const ORDER = Object.keys(KINDS);
  const MAX_TIER = 10;
  // 1.5.1: защитные виды +2 за цвет (по симулятору +3 давало около +30 пунктов шанса победы на 10-м цвете), остальные +3
  // 1.6.0: эликсир действует ОДИН бой; прибавка подобрана симулятором так, чтобы один эликсир на любом цвете давал сопоставимый
  // прирост шанса победы: боевые виды +5 за цвет, защитные +2 (отдача +1,5), остальные +4.
  const PER_TIER = { power: 12.5, fury: 3.6, cunning: 3, defense: 3.4, block: 1.6, ricochet: 0.9 };   // 1.8.0: подобрано симулятором (tools/elixir-tune.js): один эликсир на 3-м…10-м цвете даёт +2…+11 п.п.
  // 1.8.0: низкие цвета получают добавку, сходящую на нет к 6-му цвету (на 1-м прибавка в единицы процентов героя не двигала)
  const LOW = { power: 60, fury: 15, cunning: 13, defense: 15, block: 7, ricochet: 3 };   // не больше 5 × PER_TIER, иначе эликсир 2-го цвета слабее 1-го
  const bonus = (tier, kind) => (KINDS[kind] && KINDS[kind].stat === null) ? 0 : Math.round((PER_TIER[kind] || 4) * tier + (LOW[kind] || 0) * Math.max(0, 6 - tier) / 5);
  const battles = (tier) => 1;   // устарело (до 1.6.0 — срок в боях); оставлено для совместимости
  const key = (kind, tier) => kind + ':' + tier;
  const split = (k) => { const [kind, tier] = k.split(':'); return { kind, tier: Number(tier) }; };
  // Монет (меди) за варку: ≈ четверть средней награды за победу на этом цвете (см. таблицу в HANDOFF), цена одна для всех видов.
  const PRICES = [6, 16, 43, 120, 300, 740, 1800, 6400, 14000, 36000];
  const price = (tier) => Math.max(1, Math.round(PRICES[Math.max(1, Math.min(10, tier)) - 1] * ((typeof Balance !== 'undefined') ? Balance : require('./balance.js')).rewards.coinK));   // 1.6.0: вместе с монетами с мобов
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
      case 'ricochet': return { v: 2 + s };                               // первый рикошет лечит на урон стольких камней (3…8)
      case 'fury': return { v: +(2 + 0.2 * s).toFixed(1) };               // первая Ярость бьёт ×
    }
    return null;
  }
  function sideText(kind, tier) {
    const fx = effect(kind, tier); if (!fx) return '';
    switch (kind) {
      case 'power': return _t("первый ваш удар в бою ×{0}", [fx.v]);
      case 'defense': return _t("первый удар по вам слабее на {0}%", [fx.v]);
      case 'block': return _t("первый ваш блок бьёт в ответ на {0}% удара", [fx.v]);
      case 'ricochet': return _t("первый ваш рикошет лечит как удар по {0} камням", [fx.v]);
      case 'fury': return _t("первая Ярость бьёт ×{0} вместо ×2", [fx.v]);
    }
    return '';
  }
  const describe = (kind, tier) => {
    const K = KINDS[kind], st = (typeof Gear !== 'undefined' && Gear.STAT_NAMES) ? Gear.STAT_NAMES : {};
    if (kind === 'health') return _t("Лечит на {0} ХП. Пить можно раз в {1} хода, ход не тратится.", [heal(tier), INSTANT_CD]);
    if (kind === 'swap') return _t("Превращает до {0} камней того вида, которого у вас больше всего, в камни того, которого меньше всего (не больше половины разницы между ними). Пить можно раз в {1} хода, ход не тратится.", [swapAmount(tier), INSTANT_CD]);
    if (kind === 'stones') return _t("Даёт по {0} каждого вида. Пить можно раз в {1} хода, ход не тратится.", [_nn(stonesGain(tier), 'камень', 'камня', 'камней'), INSTANT_CD]);
    const b = bonus(tier, kind), name = st[K.stat] || K.stat, pc = K.stat === 'defense' ? '' : '%';
    // Броня — цифры: показываем, сколько вычитается из каждого удара у героя середины этого цвета.
    const flat = (kind === 'defense' && typeof Combat !== 'undefined' && typeof Hero !== 'undefined') ? Combat.armorAt(b, Hero.dmgMult((tier - 1) * 10 + 5)) : null;
    let t = K.mode === 'turn'
      ? _t("+{0}% {1} до конца хода. Пить перед ударом.", [b, name])
      : flat !== null ? _t("{1} +{0} (−{0} к каждому удару) на {2} ходов", [flat, name, LONG_TURNS])
      : _t("+{0}{2} {1} на {3} ходов.", [b, name, pc, LONG_TURNS]);
    if (tier >= 10) t += `; +${Math.round(b * GREAT.k)} ${st[K.second] || K.second}`;
    if (tier >= FX_MIN && sideText(kind, tier)) t += `; ${sideText(kind, tier)}`;
    return t;
  };
  // Суммарная прибавка от действующих эликсиров: active = { kind: { tier, left } }
  function bonusStats(active) {
    const out = {};
    for (const [kind, a] of Object.entries(active || {})) {
      if (!a || a.left <= 0 || !KINDS[kind] || KINDS[kind].stat === null) continue;
      const K = KINDS[kind];
      const m = 1 + (a.pct || 0) / 100;
      out[K.stat] = (out[K.stat] || 0) + Math.round(bonus(a.tier, kind) * m);
      if (a.tier >= 10) out[K.second] = (out[K.second] || 0) + Math.round(bonus(a.tier, kind) * m * GREAT.k);
    }
    return out;
  }
  // Выпить: берём сильнейший; тот же цвет обновляет срок
  // active — действующие в бою эликсиры героя: { вид: { tier, left (ходов), pct } }. Пьёт только бой (game.js: useElixir).
  function drink(active, kind, tier, extra = 0) {                    // extra — уровень улучшения Алхимика (+5% силы за уровень)
    if (!KINDS[kind] || KINDS[kind].mode === 'instant') return false;
    const cur = active[kind];
    if (cur && cur.left > 0 && cur.tier > tier) return false;
    active[kind] = { tier, left: turns(kind), pct: 5 * extra };
    return true;
  }
  function tick(active) {                                            // конец хода героя
    for (const [k, a] of Object.entries(active || {})) { if (a && a.left > 0) a.left--; if (!a || a.left <= 0) delete active[k]; }
  }
  // Значок: флакон цвета уровня
  const icon = (kind, tier) => {
    // 1.7.5: картинка вида эликсира art/items/elx-<вид>.webp (если есть); цвет уровня — кольцо под флаконом и цифра
    if (typeof Art !== 'undefined' && Art.has('items/elx-' + kind)) {
      const c = (typeof Tiers !== 'undefined' && Tiers.get(tier)) ? Tiers.get(tier).color : '#c33';
      return `<svg class="item-icon" viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="88" rx="30" ry="6" fill="${c}" fill-opacity=".85"/><image href="${Art.url('items/elx-' + kind)}" x="8" y="4" width="84" height="84" preserveAspectRatio="xMidYMid meet"/><circle cx="80" cy="80" r="13" fill="${c}" stroke="#222" stroke-width="2.5"/><text x="80" y="86" text-anchor="middle" font-size="18" font-weight="700" fill="#fff" stroke="#000" stroke-width=".5">${tier}</text></svg>`;
    }
    const col = (typeof Tiers !== 'undefined' && Tiers.get(tier)) ? Tiers.get(tier).color : '#c33';
    return `<svg class="item-icon" viewBox="0 0 100 100" aria-hidden="true"><path d="M42 12h16v6l-2 2v12c14 7 24 22 24 38 0 12-8 18-30 18S20 82 20 70c0-16 10-31 24-38V20l-2-2z" fill="#e8f1f4" fill-opacity=".35" stroke="#222" stroke-width="3"/><path d="M24 62c0 14 8 20 26 20s26-6 26-20c-8 4-18-4-26 0s-18 4-26 0z" fill="${col}" stroke="#222" stroke-width="2"/><rect x="40" y="8" width="20" height="9" rx="2" fill="#8a5a2c" stroke="#222" stroke-width="2"/><text x="50" y="76" text-anchor="middle" font-size="22" font-weight="700" fill="#fff" stroke="#000" stroke-width=".6">${tier}</text></svg>`;
  };
  return { LOW, GREAT, SWAP, STONES, HEAL, PER_TIER, FX_MIN, effect, sideText, icon, KINDS, ORDER, MAX_TIER, bonus, battles, key, split, price, need, describe, bonusStats, drink, tick, heal, stonesGain, swapAmount, swapMove, turns, LONG_TURNS, INSTANT_CD };
})();
if (typeof module !== 'undefined') module.exports = Elixirs;
