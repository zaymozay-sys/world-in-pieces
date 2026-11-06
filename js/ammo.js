if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Боеприпасы (версия 1.3.0): слот «Спец. снаряд» под оружием героя. У каждого народа свой боеприпас.
   Правила: выстрел хода не тратит, но за один свой ход — только один выстрел. Запас — в сумке (Profile.data.ammo);
   покупка пачками в Лавке, изготовление в Кузнице из ресурсов. Противники боеприпасов не используют.
   Сила выстрелов подобрана сопоставимой (на 1-м уровне ≈ 8–10 урона или эквивалент): болт — 4 базовых удара
   (Combat.strikeDamage) + снятие усилений; стрела — 3 удара + кража 6 камней; дротик — 2 тика яда; шашка — «Захват» без цены. */

const Ammo = (() => {
  const A_B = (typeof Balance !== 'undefined') ? Balance : require('./balance.js');
  const CATALOG = {
    // Люди: тяжёлый арбалетный болт с серебряным наконечником, освящённый в храме.
    bolt: { faction: 'human', name: _t("Освящённый болт"), short: _t("Болт"), price: 90,
      desc: _t("Удар в 4 базовых урона героя сквозь броню и блок; снимает с противника все усиления и щит.") },
    // Гномы: связка пороховых шашек с коротким фитилём. Бросок по выбранной клетке.
    bomb: { faction: 'dwarf', name: _t("Пороховая шашка"), short: _t("Шашка"), price: 90, aim: true,
      desc: _t("Взрыв 3×3 на выбранной клетке: камни уходят в копилку (как «Захват»), урон — фиксированный + базовый + обсидианы.") },
    // Эльфы: стрела с наконечником из лунного камня. Крадёт часть магии противника.
    moonarrow: { faction: 'elf', name: _t("Лунная стрела"), short: _t("Стрела"), price: 90,
      desc: _t("Удар в 3 базовых урона сквозь броню и блок; крадёт у противника по 2 камня каждого цвета из его копилки.") },
    // Ящеры: костяной дротик, смазанный болотным ядом.
    dart: { faction: 'lizard', name: _t("Ядовитый дротик"), short: _t("Дротик"), price: 90,
      desc: _t("Отравляет противника на 2 его хода: в начале каждого — урон как от «Ядовитого укуса».") },
  };
  const ORDER = ['bolt', 'bomb', 'moonarrow', 'dart'];
  const PACK = 5;                        // в Лавке продаются пачкой
  const CRAFT = { res: 2, out: 3 };      // Кузница: 2 любых ресурса цвета героя → 3 боеприпаса
  const ARROW_STEAL = 2;                 // Лунная стрела: камней каждого цвета
  const DART_TURNS = 2;

  // 1.5.1: слабости семейств (вариант А). Урон выстрела ×1.5 по слабому семейству, ×0.7 по стойкому; остальные ×1.
  // Названия семейств — русские ключи бестиария, сравниваются через _t() в момент выстрела (язык мог смениться).
  const WEAK_MULT = 1.5, RESIST_MULT = 0.7;
  const WEAK = {
    bolt: ['Нежить', 'Тени', 'Духи', 'Болотные твари'],
    bomb: ['Каменные стражи', 'Великаны', 'Орки', 'Лесные стражи', 'Пчёлы'],
    moonarrow: ['Чудовища', 'Драконы', 'Твари'],
    dart: ['Звери', 'Разбойники', 'Гоблины'],
  };
  const RESIST = {
    bolt: ['Каменные стражи'],
    bomb: ['Духи', 'Тени'],
    moonarrow: ['Каменные стражи'],
    dart: ['Нежить', 'Каменные стражи', 'Духи', 'Тени', 'Болотные твари'],
  };
  const inList = (list, family) => (list || []).some((n) => _t(n) === family);
  const mult = (kind, family) => (inList(WEAK[kind], family) ? WEAK_MULT : inList(RESIST[kind], family) ? RESIST_MULT : 1);
  const hint = (kind, family) => {
    const m = mult(kind, family), nm = CATALOG[kind] && CATALOG[kind].short;
    return m > 1 ? _t("{0}: слабое место (урон ×{1})", [nm, m]) : m < 1 ? _t("{0}: почти не берёт (урон ×{1})", [nm, m]) : '';
  };
  const forFaction = (fac) => ORDER.find((k) => CATALOG[k].faction === fac) || 'bolt';

  // 2.2.9: варка. Группа (свойство заряда) по виду ресурса: hard / hunt / heal / charm / light; null — вид не годится.
  function groupOf(resKind) {
    const g = A_B.brew.groups;
    return Object.keys(g).find((k) => g[k].res.includes(resKind)) || null;
  }
  // Сколько ресурсов вида (цена resUnit за штуку) нужно на CRAFT.out штук заряда группы group (null — обычный) при цене штуки unit в Лавке.
  // Вход = ресурсы + комиссия кузнеца (fee·unit); цель — share·mul от цены покупки.
  // Выход одной варки: обычный — CRAFT.out; усиленный с уровня bonusOutLevel — на 1 больше.
  const brewOut = (group, level) => CRAFT.out + (group && (level || 1) >= A_B.brew.bonusOutLevel ? 1 : 0);
  function brewNeed(group, unit, resUnit, level) {
    const B = A_B.brew, mul = group ? B.groups[group].mul : 1;
    return Math.max(CRAFT.res, Math.ceil((B.share * mul * brewOut(group, level) - B.fee) * unit / Math.max(1, resUnit)));
  }
  const brewUnlockLevel = (group) => A_B.brew.unlock[group] || 1;
  const unlocked = (group, level) => !group || (level || 1) >= A_B.brew.unlock[group];
  const brewFee = (unit) => Math.round(A_B.brew.fee * unit);
  // Уровень мастерства варки по числу сваренных штук (1…5).
  const brewLevel = (made) => A_B.brew.mastery.filter((n) => (made || 0) >= n).length;

  // 2.2.9: усиленные заряды. Ключ запаса: «вид» (обычный) или «вид:свойство», например 'bolt:hard'.
  const VARIANTS = ['hard', 'hunt', 'heal', 'charm', 'light'];
  const VNAME = { hard: _t("Закалённый"), hunt: _t("Охотничий"), heal: _t("Целебный"), charm: _t("Зачарованный"), light: _t("Лёгкий") };
  function parse(key) {
    const parts = String(key == null ? '' : key).split(':'), kind = parts[0], v = parts[1];
    const variant = VARIANTS.includes(v) ? v : null;
    return { kind, variant, ok: parts.length <= 2 && !!CATALOG[kind] && (parts.length === 1 || variant !== null) };
  }
  const VDESC = {
    hard: _t("Урон выстрела ×1,25."),
    hunt: _t("Слабое семейство получает урон ×1,75, стойкое — ×0,85."),
    heal: _t("Выстрел лечит героя на 40% лечения Эликсира жизни вашего цвета."),
    charm: _t("Выстрел даёт по камню каждого цвета; Лунная стрела крадёт 3 камня вместо 2."),
    light: _t("Один раз за бой выстрел не занимает выстрел хода: можно выстрелить дважды."),
  };
  const keyOf = (kind, variant) => (variant ? kind + ':' + variant : kind);
  // Множитель слабости/стойкости с учётом свойства: «Охотничий» усиливает оба.
  function multV(kind, family, variant) {
    const m = mult(kind, family);
    if (variant !== 'hunt') return m;
    const M = A_B.brew.mods;
    return m > 1 ? M.huntWeak : m < 1 ? M.huntResist : 1;
  }
  const dmgMul = (variant) => (variant === 'hard' ? A_B.brew.mods.hardDmg : 1);
  // Лечение героя выстрелом «Целебным» (heal — лечение «Эликсира жизни» цвета героя).
  const healAmount = (variant, elixirHeal) => (variant === 'heal' ? Math.max(1, Math.round(elixirHeal * A_B.brew.mods.healShare)) : 0);
  // Камни каждого цвета игроку за «Зачарованный»; стреле вместо этого — большая кража.
  const charmStones = (kind, variant) => (variant === 'charm' && kind !== 'moonarrow' ? A_B.brew.mods.charmStones : 0);
  const stealCount = (kind, variant) => (variant === 'charm' && kind === 'moonarrow' ? A_B.brew.mods.charmSteal : ARROW_STEAL);

  // Урон «сырой» (без Силы/Брони/Блока), от базового урона героя: base = Combat.strikeDamage(f).
  const boltDamage = (base) => Math.max(1, Math.round(base * 4));
  const arrowDamage = (base) => Math.max(1, Math.round(base * 3));
  // Кража камней: из копилки counts противника — не больше, чем у него есть. Возвращает { type: n }.
  function steal(enemyCounts, types, n = ARROW_STEAL) {
    const got = {};
    for (const t of types) { const k = Math.min(n, enemyCounts[t] || 0); if (k) got[t] = k; }
    return got;
  }

  // Значок: картинка art/items/ammo-<id>, если есть, иначе встроенный рисунок.
  const SVG = {
    bolt: '<path d="M14 50 L86 50" stroke="#8a6a42" stroke-width="7" stroke-linecap="round"/><path d="M86 50 L68 38 L72 50 L68 62Z" fill="#dfe6ef" stroke="#2a2e36" stroke-width="2"/><path d="M14 50 L4 40 M14 50 L4 60 M22 50 L12 40 M22 50 L12 60" stroke="#e8d9a8" stroke-width="4"/><circle cx="74" cy="50" r="5" fill="#fff6c8" opacity=".8"/>',
    bomb: '<rect x="22" y="38" width="16" height="44" rx="4" fill="#a8452f" stroke="#2a1a10" stroke-width="3"/><rect x="42" y="34" width="16" height="48" rx="4" fill="#b8553a" stroke="#2a1a10" stroke-width="3"/><rect x="62" y="38" width="16" height="44" rx="4" fill="#a8452f" stroke="#2a1a10" stroke-width="3"/><path d="M20 58 H80" stroke="#6b4a2b" stroke-width="5"/><path d="M50 34 Q50 20 62 16" stroke="#3a2a1a" stroke-width="3" fill="none"/><circle cx="64" cy="14" r="6" fill="#ffcc4d"/><circle cx="64" cy="14" r="3" fill="#fff"/>',
    moonarrow: '<path d="M10 82 L78 22" stroke="#6b4a2b" stroke-width="6" stroke-linecap="round"/><path d="M78 22 L90 10 L84 30 L70 28Z" fill="#cfe4ff" stroke="#2a3a5a" stroke-width="2"/><path d="M10 82 L4 70 M10 82 L22 88 M16 76 L8 66 M16 76 L28 82" stroke="#7bbf6a" stroke-width="4"/><circle cx="82" cy="20" r="10" fill="#cfe4ff" opacity=".35"/>',
    dart: '<path d="M12 78 L70 30" stroke="#e8dcc0" stroke-width="7" stroke-linecap="round"/><path d="M70 30 L90 14 L80 38Z" fill="#cfd8c8" stroke="#2a2e26" stroke-width="2"/><path d="M76 26 L86 18" stroke="#7fe05a" stroke-width="4"/><path d="M12 78 L4 70 L18 70Z M12 78 L20 86 L20 72Z" fill="#5a8a3a"/><circle cx="84" cy="40" r="4" fill="#7fe05a"/><circle cx="80" cy="48" r="2.6" fill="#7fe05a"/>',
  };
  function icon(key) {
    const P = parse(key), id = P.kind;
    if (P.variant && typeof Art !== 'undefined' && Art.has('items/ammo-' + id + '-' + P.variant)) return Art.icon('items/ammo-' + id + '-' + P.variant);   // 2.2.9: значок заряда, если нарисован
    if (typeof Art !== 'undefined' && Art.has('items/ammo-' + id)) return Art.icon('items/ammo-' + id);
    return `<svg class="item-icon ammo-icon" viewBox="0 0 100 100" aria-hidden="true">${SVG[id] || ''}</svg>`;
  }
  // Название заряда для списков: «Освящённый болт · Закалённый».
  const stockName = (key) => { const P = parse(key); return P.ok ? CATALOG[P.kind].name + (P.variant ? ' · ' + VNAME[P.variant] : '') : String(key); };
  // Все ключи запаса, которые есть у игрока: count(key) > 0. Сначала обычные, затем усиленные.
  const stocks = (count) => [...ORDER, ...ORDER.flatMap((k) => VARIANTS.map((v) => keyOf(k, v)))].filter((k) => count(k) > 0);

  return { WEAK, RESIST, WEAK_MULT, RESIST_MULT, mult, hint, CATALOG, ORDER, PACK, CRAFT, ARROW_STEAL, DART_TURNS, forFaction, VARIANTS, VNAME, VDESC, brewOut, unlocked, brewUnlockLevel, stockName, stocks, parse, keyOf, multV, dmgMul, healAmount, charmStones, stealCount, groupOf, brewNeed, brewFee, brewLevel, boltDamage, arrowDamage, steal, icon };
})();

if (typeof module !== 'undefined') module.exports = Ammo;
