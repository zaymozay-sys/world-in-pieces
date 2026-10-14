if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Небо над картой (1.7.1): время суток по часам игрока и погода. Без интерфейса — можно тестировать в Node.

   Время суток — по местным часам устройства: ночь с 21:30 до 5:30. Свет плавно меняется (оттенок и прозрачность слоя поверх земли).
   Погода — по трёхчасовым блокам суток, одинаковая у всех в один и тот же час (детерминирована датой и номером блока), поэтому
   прогноз на сутки вперёд можно показать заранее (штормовое предупреждение в Мельнице).

   Влияние на игру небольшое и открытое (всё видно в карточке существа и на чипе погоды):
   • ночью у существ на карте +10% ХП, зато +15% к монетам и к шансу редкой добычи; по ночам выходят «ночные гости» — лунные
     мотыльки, огоньки, тени и призраки (днём их нет — прежние обитатели карты не пропадают);
   • дождь, ливень и гроза замедляют шаг по лугу, полю и болоту (×1,25);
   • редкая непогода заметно меняет бой: гроза — Шаровая молния +20%; ливень — огненные заклинания −25%, Целебный дождь +25%;
     густой туман — числа ХП и камней врага скрыты, обзор меньше на соту.
   Снега и пески меняют только вид и название явления: метель вместо грозы, песчаная буря вместо тумана и так далее. */

const Sky = (() => {
  const NIGHT_FROM = 21 * 60 + 30, NIGHT_TO = 5 * 60 + 30;          // минуты суток
  const BLOCK_H = 3;                                                // часов в блоке погоды
  const NIGHT = { hp: 1.10, loot: 1.15 };
  const SLOW = { mul: 1.25, on: { meadow: 1, field: 1, swamp: 1 } };
  const FX = {
    storm: { lightning: 1.2 },
    downpour: { fire: 0.75, heal: 1.25 },
    thickfog: { hide: true, vision: 1 },
  };
  // вес каждого явления в блоке; редкая непогода — 9%
  const KINDS = [['clear', 40], ['cloudy', 28], ['rain', 15], ['fog', 8], ['storm', 3], ['downpour', 3], ['thickfog', 3]];
  const SEVERE = { storm: 1, downpour: 1, thickfog: 1 };
  const NAMES = {
    clear: _t("Ясно"), cloudy: _t("Облачно"), rain: _t("Дождь"), fog: _t("Туман"),
    storm: _t("Гроза"), downpour: _t("Ливень"), thickfog: _t("Густой туман"),
  };

  // Ключи света: [минута суток, r, g, b, прозрачность слоя]
  const LIGHT = [
    [0, 12, 20, 60, 0.50], [300, 12, 20, 60, 0.48], [360, 70, 60, 110, 0.36], [405, 255, 150, 110, 0.16],
    [480, 255, 230, 200, 0], [1020, 255, 225, 190, 0], [1110, 255, 160, 60, 0.14], [1185, 120, 50, 110, 0.28],
    [1260, 18, 26, 70, 0.46], [1320, 12, 20, 60, 0.50], [1440, 12, 20, 60, 0.50],
  ];

  /* ---------- настройки устройства (как «Анимации»): время суток и погоду можно выключить ---------- */
  const KEY = 'wip-sky';
  // 1.7.9: время суток и погода по умолчанию выключены; выбор игрока, сохранённый на устройстве, сильнее умолчания
  const prefs = { night: false, weather: false };
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) { prefs.night = v.night === true; prefs.weather = v.weather === true; } } catch (e) { /* без хранилища — умолчания */ }
  const pref = (name) => prefs[name] !== false;
  const setPref = (name, on) => {
    if (!(name in prefs)) return false;
    prefs[name] = !!on;
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* не страшно */ }
    return prefs[name];
  };

  /* ---------- время ---------- */
  let dev = null;                                   // проверка: { hour, minute, kind } — подмена часов и явления
  const now = () => {
    if (dev && dev.hour != null) { const d = new Date(); d.setHours(dev.hour, dev.minute || 0, 0, 0); return d.getTime(); }
    return Date.now();
  };
  const setDev = (o) => { dev = o && (o.hour != null || o.kind) ? o : null; };
  const minutes = (t) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
  const isNight = (t = now()) => { if (!prefs.night) return false; const m = minutes(t); return m >= NIGHT_FROM || m < NIGHT_TO; };
  const phase = (t = now()) => {
    if (!prefs.night) return 'day';
    const m = minutes(t);
    if (m >= NIGHT_FROM || m < NIGHT_TO) return 'night';
    if (m < 8 * 60) return 'dawn';
    if (m < 18 * 60) return 'day';
    return 'dusk';
  };
  const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  // Номер ночи: ночь после 21:30 и до 5:30 принадлежит дню, в который началась.
  const nightKey = (t = now()) => day(minutes(t) < NIGHT_TO ? t - 86400000 : t);

  function light(t = now()) {
    if (!prefs.night) return { r: 255, g: 255, b: 255, a: 0 };
    const m = minutes(t) + (new Date(t).getSeconds() / 60);
    for (let i = 1; i < LIGHT.length; i++) {
      const a = LIGHT[i - 1], b = LIGHT[i];
      if (m <= b[0]) {
        const k = (m - a[0]) / (b[0] - a[0] || 1), f = (x, y) => x + (y - x) * k;
        return { r: Math.round(f(a[1], b[1])), g: Math.round(f(a[2], b[2])), b: Math.round(f(a[3], b[3])), a: Math.round(f(a[4], b[4]) * 1000) / 1000 };
      }
    }
    const z = LIGHT[LIGHT.length - 1];
    return { r: z[1], g: z[2], b: z[3], a: z[4] };
  }
  const lightCss = (t = now()) => { const l = light(t); return `rgba(${l.r},${l.g},${l.b},${l.a})`; };

  /* ---------- погода ---------- */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }
  const blockOf = (t) => Math.floor(new Date(t).getHours() / BLOCK_H);
  function kindOfBlock(dayStr, b) {
    const total = KINDS.reduce((a, [, w]) => a + w, 0);
    let x = hash(`sky|${dayStr}|${b}`) * total;
    for (const [k, w] of KINDS) { x -= w; if (x < 0) return k; }
    return 'clear';
  }
  const kindAt = (t = now()) => (!prefs.weather ? 'clear' : dev && dev.kind ? dev.kind : kindOfBlock(day(t), blockOf(t)));
  const isSevere = (k) => !!SEVERE[k];

  // Прогноз: n блоков начиная с текущего. from/to — время начала и конца блока.
  function forecast(t = now(), n = 8) {
    const d = new Date(t); d.setMinutes(0, 0, 0); d.setHours(blockOf(t) * BLOCK_H);
    const out = [];
    for (let i = 0; i < n; i++) {
      const from = d.getTime() + i * BLOCK_H * 3600000;
      const kind = !prefs.weather ? 'clear' : (dev && dev.kind && i === 0) ? dev.kind : kindOfBlock(day(from), blockOf(from));
      out.push({ from, to: from + BLOCK_H * 3600000, kind, severe: isSevere(kind), current: i === 0 });
    }
    return out;
  }
  // Штормовое предупреждение: непогода идёт сейчас или начнётся в ближайшие 3 часа. null — спокойно.
  function warning(t = now()) {
    if (!prefs.weather) return null;
    const f = forecast(t, 2);
    for (const b of f) {
      if (!b.severe) continue;
      if (b.current) return { kind: b.kind, active: true, from: b.from, to: b.to, minutes: 0, left: Math.max(1, Math.round((b.to - t) / 60000)) };
      if (b.from - t <= BLOCK_H * 3600000) return { kind: b.kind, active: false, from: b.from, to: b.to, minutes: Math.max(1, Math.round((b.from - t) / 60000)), left: 0 };
    }
    return null;
  }

  // «40 мин» или «3 ч» — для предупреждений и прогноза.
  const span = (m) => (m >= 90 ? _t("{0} ч", [Math.round(m / 60)]) : _t("{0} мин", [Math.max(1, m)]));

  /* ---------- местность и название ---------- */
  const biomeOf = (terrain) => (terrain === 'snow' || terrain === 'tundra' ? 'snow' : terrain === 'sand' || terrain === 'badlands' ? 'desert' : '');
  // Как явление выглядит и называется там, где стоит герой. vis — картинка: clear, cloudy, rain, heavy (ливень), storm, fog, thickfog,
  // snow, blizzard, sand, haze. Правила боя от местности не зависят — только от исходного явления.
  function local(kind, biome) {
    let vis = kind, name = NAMES[kind];
    if (biome === 'snow') {
      if (kind === 'rain') { vis = 'snow'; name = _t("Снег"); }
      else if (kind === 'downpour') { vis = 'snow'; name = _t("Снегопад"); }
      else if (kind === 'storm') { vis = 'blizzard'; name = _t("Метель"); }
    } else if (biome === 'desert') {
      if (kind === 'rain') { vis = 'clear'; name = NAMES.clear; }
      else if (kind === 'storm') { vis = 'sand'; name = _t("Песчаная буря"); }
      else if (kind === 'fog') { vis = 'haze'; name = _t("Знойная дымка"); }
      else if (kind === 'thickfog') { vis = 'haze'; name = _t("Пыльная мгла"); }
    }
    if (kind === 'downpour' && vis === 'downpour') vis = 'heavy';
    return { vis, name, base: kind, severe: isSevere(kind) };
  }

  /* ---------- влияние на игру ---------- */
  // Описание поправок для карточки существа и чипа: строки на русском.
  function effectLines(kind, night, label) {
    const out = [], lab = label || NAMES[kind];
    if (night) out.push(_t("Ночь: у существ на 10% больше ХП, добыча и монеты на 15% богаче"));
    if (kind === 'rain' || kind === 'downpour' || kind === 'storm') out.push(_t("Сырость: шаг по лугу, полю и болоту медленнее"));
    if (kind === 'storm') out.push(_t("{0}: Шаровая молния у обоих бойцов сильнее на 20%", [lab]));
    if (kind === 'downpour') out.push(_t("{0}: огненные заклинания слабее на 25%, Целебный дождь сильнее на 25% (у обоих бойцов)", [lab]));
    if (kind === 'thickfog') out.push(_t("{0}: числа ХП и камней врага скрыты, обзор на соту меньше", [lab]));
    return out;
  }
  // Поправки боя на момент его начала (кладутся в Profile.data.monster и не меняются до конца боя).
  function battleFx(t = now()) {
    const kind = kindAt(t), night = isNight(t);
    return { night: night ? 1 : 0, wx: isSevere(kind) ? kind : null };
  }
  const hpMul = (fx) => (fx && fx.night ? NIGHT.hp : 1);
  const lootMul = (fx) => (fx && fx.night ? NIGHT.loot : 1);
  const spellMul = (fx, spell) => {
    const e = fx && fx.wx && FX[fx.wx];
    return e && e[spell] ? e[spell] : 1;
  };
  const hidesEnemy = (fx) => !!(fx && fx.wx === 'thickfog');
  const stepMul = (kind, terrain) => ((kind === 'rain' || kind === 'downpour' || kind === 'storm') && SLOW.on[terrain] ? SLOW.mul : 1);
  const visionPenalty = (kind) => (FX[kind] && FX[kind].vision) || 0;

  /* ---------- ночные гости ---------- */
  const GUESTS = { moonmoth: [1, 5], wisp: [3, 6], shadow: [6, 10], wraith: [7, 10] };
  const GUEST_COUNT = 12;
  // Место и вид гостей на одну ночь. cells — кандидаты [{idx, tier, q, r}] (свободные проходимые соты), rand — генератор,
  // far(a, b) — расстояние между сотами (гости стоят не теснее четырёх сот друг от друга).
  function guests(cells, rand, key, far) {
    const picked = [];
    for (let k = 0; k < 800 && picked.length < GUEST_COUNT && cells.length; k++) {
      const c = cells[Math.floor(rand() * cells.length)];
      if (picked.some((p) => p.c.idx === c.idx || far(p.c, c) < 4)) continue;
      const names = Object.keys(GUESTS).filter((s) => c.tier >= GUESTS[s][0] && c.tier <= GUESTS[s][1]);
      if (!names.length) continue;
      picked.push({ c, g: { id: `n${key}-${picked.length}`, idx: c.idx, species: names[Math.floor(rand() * names.length)], tier: c.tier, guest: true } });
    }
    return picked.map((p) => p.g);
  }

  return {
    NIGHT_FROM, NIGHT_TO, BLOCK_H, NIGHT, KINDS, SEVERE, NAMES, GUESTS, GUEST_COUNT,
    pref, setPref, now, setDev, minutes, isNight, phase, nightKey, day, light, lightCss,
    kindAt, forecast, warning, span, isSevere, biomeOf, local, effectLines,
    battleFx, hpMul, lootMul, spellMul, hidesEnemy, stepMul, visionPenalty, guests,
    get dev() { return dev; },
  };
})();

if (typeof module !== 'undefined') module.exports = Sky;
