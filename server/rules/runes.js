if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Руны: маленький слой усиления снаряжения, отдельный от предметов и наборов (items.js).
   Руна вставляется в вещь (2 места на вещь — открыты Мастерской художника, Журавль-художник продаёт
   и вставляет руны) и одновременно даёт прибавку к характеристике И меняет значок вещи (маленький
   самоцвет в углу иконки, см. itemIcon/itemCard в inventory.js). Один набор рун общий для всех 4
   фракций — рун, привязанных к фракции, нет. Без интерфейса — можно тестировать в Node (как tiers.js/items.js). */

const Runes = (() => {
  const G = (typeof Gear !== 'undefined') ? Gear : require('./items.js');

  // Каталог рун: по одной-две на характеристику. value подобран по образцу вещей 1-го уровня (items.js)
  // так, чтобы руна была заметным, но не решающим бонусом — примерно треть среднего вклада одной вещи.
  const CATALOG = {
    'rune-might':    { name: _t("Руна мощи"),       stat: 'power',      value: 2,  color: '#e0605a', desc: _t("+2 Сила (только в оружие)") },
    'rune-might2':   { name: _t("Двойная руна мощи"), stat: 'power',    value: 4,  color: '#ff8a3c', twin: 'rune-might', desc: _t("+4 Сила (только в двуручное оружие)") },
    'rune-vitality': { name: _t("Руна жизни"),      stat: 'health',     value: 8,  color: '#5fc98a', desc: _t("+8 Здоровье") },
    'rune-ward':     { name: _t("Руна оберега"),    stat: 'defense',    value: 2,  color: '#6aa8e8', desc: _t("+2% Броня") },
    'rune-insight':  { name: _t("Руна меткости"),   stat: 'power',      value: 2,  color: '#b58cff', desc: _t("+2 Сила") },
    'rune-haste':    { name: _t("Руна спешки"),     stat: 'initiative', value: 3,  color: '#f4dc3f', desc: _t("+3% Проворство") },
    'rune-thorn':    { name: _t("Руна шипа"),       stat: 'ricochet',   value: 2,  color: '#c9573c', desc: _t("+2% Рикошет") },
    'rune-bulwark':  { name: _t("Руна стены"),      stat: 'block',      value: 2,  color: '#a9adb8', desc: _t("+2% Блок") },
    'rune-fury':     { name: _t("Руна ярости"),     stat: 'fury',       value: 4,  color: '#d08a3a', desc: _t("+4% Ярость") },
  };
  const ORDER = Object.keys(CATALOG);
  // 2.0.8: двойная руна не продаётся и не выпадает — её сплавляет Журавль из двух рун мощи (SHOP — то, что можно купить)
  const SHOP = ORDER.filter((id) => !CATALOG[id].twin);

  // Гнёзда вещи: 2 — с постройкой «Мастерской художника» (Журавль-художник) второе гнездо открылось для
  // всех вещей (было 1, пока руны продавались как временная затычка в Лавке — см. js/hexmap.js: artistWorkshop).
  // 2.0.5: цвета 1–2 — без гнёзд, 3–5 — одно, с 6-го — два (плоские +2 Силы на первых цветах сильнее самой вещи)
  // третье гнездо вещи — не руна, а самоцвет (пробойник, см. stones.js: entry.hole)
  function socketsFor(item) { const t = (item && item.tier) || 1; return t >= 6 ? 2 : t >= 3 ? 1 : 0; }

  // entry — экземпляр вещи игрока { uid, id, tier, runes? } (см. items.js). runes — массив id рун по
  // гнёздам (индекс = номер гнезда), мутируется тем же способом, каким Кузница мутирует entry.tier
  // (см. screens.js: doUpgrade). Старое поле entry.rune (единственное гнездо, до Мастерской) читается
  // как миграция для уже сохранённых вещей и заменяется на runes при первой вставке/извлечении.
  function migrate(entry) {
    if (!Array.isArray(entry.runes)) entry.runes = entry.rune ? [entry.rune] : [];
    if ('rune' in entry) delete entry.rune;
    return entry.runes;
  }
  // 2.0.8: Сила — главный ресурс, поэтому руна мощи вставляется только в оружие (одноручное и двуручное).
  // Обычная руна мощи — только в одноручное, двойная (вдвое сильнее) — только в двуручное: Сила рун у двуручного равна двум одноручным.
  const ONLY = { 'rune-might': ['weapon1'], 'rune-might2': ['weapon2'] };
  function allows(entry, runeId) {
    const need = ONLY[runeId];
    if (!need) return true;
    const it = entry && G.item ? G.item(entry) : null;
    return !!it && need.includes(it.type);
  }
  // slot не указан — вставка идёт в первое свободное гнездо (а если оба заняты — в 0-е, как раньше
  // повторная вставка без выбора гнезда просто заменяла руну).
  function insert(entry, runeId, slot, rank) {
    if (!entry || !CATALOG[runeId] || !allows(entry, runeId)) return false;
    const runes = migrate(entry);
    const sockets = socketsFor(entry);
    let idx = slot;
    if (idx === undefined) {
      idx = 0;
      while (idx < sockets && runes[idx]) idx++;
      if (idx >= sockets) idx = 0;
    }
    if (idx < 0 || idx >= sockets) return false;
    runes[idx] = runeId;
    entry.rr = Array.isArray(entry.rr) ? entry.rr : []; entry.rr[idx] = clampRank(rank);
    return true;
  }
  function upgrade(entry, slot, rank) { const runes = entry && migrate(entry); if (!runes || !runes[slot]) return false; entry.rr = Array.isArray(entry.rr) ? entry.rr : []; entry.rr[slot] = clampRank(rank); return true; }
  function remove(entry, slot = 0) {
    if (!entry) return false;
    const runes = migrate(entry);
    const had = !!runes[slot];
    if (had) { runes[slot] = undefined; if (entry.rr) entry.rr[slot] = undefined; }
    return had;
  }

  // Прибавка от рун одной вещи по всем её гнёздам (или пустой объект).
  // 2.0.7: сила руны зависит от её ранга, а не от цвета вещи. Ранг = цвет героя в тот день, когда Журавль нарисовал руну
  // (entry.rr[слот]); обновить руну до нового ранга можно у Журавля за монеты. Ранг 1 — прежние значения.
  const clampRank = (r) => Math.max(1, Math.min(10, Math.round(Number(r) || 1)));
  function valueAt(r, rank) {
    if (r.twin) return 2 * valueAt(CATALOG[r.twin], rank);
    const T = (typeof Tiers !== 'undefined' ? Tiers : require('./tiers.js')), k = clampRank(rank);
    if (r.stat === 'defense') return Math.max(1, Math.round(r.value * 0.045 * T.HERO_DMG[k - 1]));
    // 2.0.8: здоровье от рун растёт медленнее (степень 0,35 вместо 0,5): на цветах 3–9 руна жизни слабее примерно на четверть
    return Math.max(r.value, Math.round(r.value * Math.pow(T.statMult(r.stat, k) / T.statMult(r.stat, 1), r.stat === 'health' ? 0.35 : 0.5)));
  }
  const STAT_LABEL = { power: () => _t("Сила"), health: () => _t("Здоровье"), defense: () => _t("Броня"), initiative: () => _t("Проворство"), ricochet: () => _t("Рикошет"), block: () => _t("Блок"), fury: () => _t("Ярость") };
  const PCT = new Set(['defense', 'initiative', 'ricochet', 'block', 'fury']);
  const valueOf = (id, rank) => (CATALOG[id] ? valueAt(CATALOG[id], rank) : 0);
  const descAt = (id, rank) => { const r = CATALOG[id]; return r ? `+${valueAt(r, rank)}${PCT.has(r.stat) ? '%' : ''} ${STAT_LABEL[r.stat]()}` : ''; };
  const rankOf = (entry, slot) => clampRank(entry && entry.rr && entry.rr[slot]);
  function statsOf(entry) {
    const s = G.blankStats();
    const runes = entry && (Array.isArray(entry.runes) ? entry.runes : (entry.rune ? [entry.rune] : null));
    if (runes) for (const [idx, id] of runes.slice(0, socketsFor(entry)).entries()) { const r = id && CATALOG[id]; if (r && allows(entry, id)) s[r.stat] += valueAt(r, entry && entry.rr && entry.rr[idx]); }   // 2.0.7: Броня руны — плоская, растёт с цветом вещи
    return s;
  }

  // Суммарная прибавка от рун во всех ячейках надетого снаряжения (см. recalcStats в game.js).
  // gear — «ячейка → экземпляр», как возвращает Profile.gear() (с сохранённым полем runes).
  function bonusForGear(gear) {
    let s = G.blankStats();
    for (const slot of G.SLOTS) {
      s = G.combine(s, statsOf(gear[slot]));
      const it = gear[slot];
      if (it && typeof Stones !== 'undefined') for (const c of Stones.gemList(it)) { const b = c > 0 && Stones.gemBonus(c); if (b) s = G.combine(s, { ...G.blankStats(), ...b }); }   // 2.0.7: самоцветы в гнёздах
      if (it && it.cut > 0 && slot !== 'belt' && typeof Stones !== 'undefined') { const b = Stones.cutBonus(it.cut); if (b) s = G.combine(s, { ...G.blankStats(), ...b }); }   // 1.8.9: огранка
    }
    return s;
  }

  // 1.2.8: значок руны — картинка art/runes/<id>, если есть, иначе цветной кружок (cls — класс-заглушка).
  function icon(id, cls = 'rune-icon') {
    const r = CATALOG[id];
    if (!r) return '';
    if (typeof Art !== 'undefined' && Art.has('runes/' + id)) return `<img class="${cls} rune-img" src="${Art.url('runes/' + id)}" alt="" title="${r.name}">`;
    return `<span class="${cls}" style="--rc:${r.color}" title="${r.name}"></span>`;
  }

  return { CATALOG, ORDER, SHOP, valueOf, descAt, rankOf, clampRank, upgrade, socketsFor, allows, insert, remove, statsOf, bonusForGear, icon };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Runes;
