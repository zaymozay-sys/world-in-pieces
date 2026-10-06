if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Руны: маленький слой усиления снаряжения, отдельный от предметов и наборов (items.js).
   Руна вставляется в вещь (2 гнезда на вещь — открыты Мастерской художника, Журавль-художник продаёт
   и вставляет руны) и одновременно даёт прибавку к характеристике И меняет значок вещи (маленький
   самоцвет в углу иконки, см. itemIcon/itemCard в inventory.js). Один набор рун общий для всех 4
   фракций — рун, привязанных к фракции, нет. Без интерфейса — можно тестировать в Node (как tiers.js/items.js). */

const Runes = (() => {
  const G = (typeof Gear !== 'undefined') ? Gear : require('./items.js');

  // Каталог рун: по одной-две на характеристику. value подобран по образцу вещей 1-го уровня (items.js)
  // так, чтобы руна была заметным, но не решающим бонусом — примерно треть среднего вклада одной вещи.
  const CATALOG = {
    'rune-might':    { name: _t("Руна мощи"),       stat: 'power',      value: 4,  color: '#e0605a', desc: _t("+4% Сила") },
    'rune-vitality': { name: _t("Руна жизни"),      stat: 'health',     value: 8,  color: '#5fc98a', desc: _t("+8 Здоровье") },
    'rune-ward':     { name: _t("Руна оберега"),    stat: 'defense',    value: 2,  color: '#6aa8e8', desc: _t("+2% Броня") },
    'rune-insight':  { name: _t("Руна прозрения"),  stat: 'magic',      value: 1,  color: '#b58cff', desc: _t("+1 Магия") },
    'rune-haste':    { name: _t("Руна спешки"),     stat: 'initiative', value: 3,  color: '#f4dc3f', desc: _t("+3% Инициатива") },
    'rune-thorn':    { name: _t("Руна шипа"),       stat: 'ricochet',   value: 2,  color: '#c9573c', desc: _t("+2% Рикошет") },
    'rune-bulwark':  { name: _t("Руна стены"),      stat: 'block',      value: 2,  color: '#a9adb8', desc: _t("+2% Блок") },
    'rune-fury':     { name: _t("Руна ярости"),     stat: 'fury',       value: 4,  color: '#d08a3a', desc: _t("+4% Ярость") },
  };
  const ORDER = Object.keys(CATALOG);

  // Гнёзда вещи: 2 — с постройкой «Мастерской художника» (Журавль-художник) второе гнездо открылось для
  // всех вещей (было 1, пока руны продавались как временная затычка в Лавке — см. js/hexmap.js: artistWorkshop).
  function socketsFor(/* item */) { return 2; }

  // entry — экземпляр вещи игрока { uid, id, tier, runes? } (см. items.js). runes — массив id рун по
  // гнёздам (индекс = номер гнезда), мутируется тем же способом, каким Кузница мутирует entry.tier
  // (см. screens.js: doUpgrade). Старое поле entry.rune (единственное гнездо, до Мастерской) читается
  // как миграция для уже сохранённых вещей и заменяется на runes при первой вставке/извлечении.
  function migrate(entry) {
    if (!Array.isArray(entry.runes)) entry.runes = entry.rune ? [entry.rune] : [];
    if ('rune' in entry) delete entry.rune;
    return entry.runes;
  }
  // slot не указан — вставка идёт в первое свободное гнездо (а если оба заняты — в 0-е, как раньше
  // повторная вставка без выбора гнезда просто заменяла руну).
  function insert(entry, runeId, slot) {
    if (!entry || !CATALOG[runeId]) return false;
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
    return true;
  }
  function remove(entry, slot = 0) {
    if (!entry) return false;
    const runes = migrate(entry);
    const had = !!runes[slot];
    if (had) runes[slot] = undefined;
    return had;
  }

  // Прибавка от рун одной вещи по всем её гнёздам (или пустой объект).
  function statsOf(entry) {
    const s = G.blankStats();
    const runes = entry && (Array.isArray(entry.runes) ? entry.runes : (entry.rune ? [entry.rune] : null));
    if (runes) for (const id of runes) { const r = id && CATALOG[id]; if (r) s[r.stat] += r.value; }
    return s;
  }

  // Суммарная прибавка от рун во всех ячейках надетого снаряжения (см. recalcStats в game.js).
  // gear — «ячейка → экземпляр», как возвращает Profile.gear() (с сохранённым полем runes).
  function bonusForGear(gear) {
    let s = G.blankStats();
    for (const slot of G.SLOTS) s = G.combine(s, statsOf(gear[slot]));
    return s;
  }

  // 1.2.8: значок руны — картинка art/runes/<id>, если есть, иначе цветной кружок (cls — класс-заглушка).
  function icon(id, cls = 'rune-icon') {
    const r = CATALOG[id];
    if (!r) return '';
    if (typeof Art !== 'undefined' && Art.has('runes/' + id)) return `<img class="${cls} rune-img" src="${Art.url('runes/' + id)}" alt="" title="${r.name}">`;
    return `<span class="${cls}" style="--rc:${r.color}" title="${r.name}"></span>`;
  }

  return { CATALOG, ORDER, socketsFor, insert, remove, statsOf, bonusForGear, icon };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Runes;
