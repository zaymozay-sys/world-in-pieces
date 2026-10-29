if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Проверка и починка сохранения (1.6.5): один путь и для загрузки профиля при старте, и для «Загрузить сохранение».
   Зачем: прежняя проверка (Profile.sanitize в inventory.js) смотрела только на ТИП полей верхнего уровня. Но битые данные ВНУТРИ списков
   (вещь с неизвестным id, null в items, ресурс неизвестного вида, лот без вещи…) роняли окна или даже весь запуск: например, надетая
   вещь с id, которого нет в этой версии (после переименования в обновлении, файл другой версии, правка руками), бросала исключение при
   загрузке скрипта — Profile не создавался и игра не запускалась вовсе (полный проход 1.6.4, случай S03).
   Что делает: молча выбрасывает записи, которые игра не сможет показать, приводит числа к допустимым значениям, убирает дубли uid и
   несовместимые надетые вещи. НИЧЕГО не добавляет игроку и не трогает исправные данные (на исправном сохранении notes пуст — проверяется тестом).
   Без интерфейса и хранилища — тестируется в Node (tests/saveguard.test.js). Вызывать ПОСЛЕ миграций старых форматов. */

const SG_G = (typeof Gear !== 'undefined') ? Gear : require('./items.js');
const SG_B = (typeof Bestiary !== 'undefined') ? Bestiary : require('./bestiary.js');
const SG_T = (typeof Tiers !== 'undefined') ? Tiers : require('./tiers.js');
const SG_E = (typeof Elixirs !== 'undefined') ? Elixirs : require('./elixirs.js');
const SG_A = (typeof Ammo !== 'undefined') ? Ammo : require('./ammo.js');
const SG_R = (typeof Runes !== 'undefined') ? Runes : require('./runes.js');
const SG_S = (typeof Stones !== 'undefined') ? Stones : (typeof require === 'function' ? require('./stones.js') : null);
const SG_P = (typeof Pets !== 'undefined') ? Pets : require('./pets.js');

const SaveGuard = (() => {
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const MAXN = 1e12;                                                   // потолок количества (защита от 1e300 и Infinity)
  const cnt = (v) => (Number.isFinite(v) && v >= 1 ? Math.floor(Math.min(v, MAXN)) : 0);
  const nonNeg = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? v : d);
  const tierOk = (t) => Number.isInteger(t) && t >= 1 && t <= SG_T.MAX;
  const clampTier = (t) => { const n = Math.round(Number(t)); return Number.isFinite(n) ? SG_T.clamp(n) : 1; };
  const validEntry = (e) => isObj(e) && typeof e.id === 'string' && !!SG_G.item(e);
  const resKeyOk = (k) => { const m = /^([a-z]+):(\d+)$/.exec(k); return !!m && !!SG_B.RESOURCES[m[1]] && tierOk(Number(m[2])); };
  const elixKeyOk = (k) => { const m = /^([a-z]+):(\d+)$/.exec(k); return !!m && !!SG_E.KINDS[m[1]] && tierOk(Number(m[2])); };

  function normalize(d) {
    const notes = [], fix = (m) => { if (notes.length < 60) notes.push(m); };
    // счётчики вида «ключ → количество»: только известные ключи и целые положительные количества
    const counters = (obj, ok, label) => {
      if (!isObj(obj)) return {};
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        const n = cnt(v);
        if (v === 0 && ok(k)) { out[k] = 0; continue; }     // нулевой остаток (расходник израсходован) — обычное состояние игры: не «починка», профиль не меняется
        if (n > 0 && ok(k)) out[k] = n; else fix(`${label}: «${k}» (${String(v).slice(0, 12)}) убрано`);
      }
      return out;
    };

    // --- кошелёк, опыт, победы ---
    if (!Number.isFinite(d.coins) || d.coins < 0 || !Number.isInteger(d.coins)) { fix('coins'); d.coins = Number.isFinite(d.coins) && d.coins > 0 ? Math.floor(Math.min(d.coins, MAXN * 1000)) : 0; }
    if (!Number.isFinite(d.xp) || d.xp < 0) { fix('xp'); d.xp = 0; }
    if (!Number.isInteger(d.wins) || d.wins < 0) { fix('wins'); d.wins = Math.max(0, Math.floor(nonNeg(d.wins))); }

    // --- вещи: только настоящие, цвет 1..10, uid уникальны ---
    const items = [], seen = new Set(), refundRunes = {};
    for (const e of Array.isArray(d.items) ? d.items : []) {
      if (!validEntry(e)) { fix('вещь убрана: ' + (isObj(e) ? e.id : String(e))); continue; }
      let c = e;
      if (!tierOk(e.tier)) { c = { ...c, tier: clampTier(e.tier) }; fix('цвет вещи ' + e.id); }
      if (typeof c.uid !== 'string' || !c.uid || seen.has(c.uid)) { c = { ...c, uid: SG_G.makeEntry(c.id, 1).uid }; fix('uid вещи ' + e.id); }
      if (c.dur !== undefined) {                                       // 1.6.6: прочность — целое 0..максимум цвета; нет поля — вещь целая
        const max = SG_G.durMax(c.tier);
        if (!Number.isFinite(c.dur)) { c = { ...c }; delete c.dur; fix('прочность вещи ' + e.id); }
        else if (!Number.isInteger(c.dur) || c.dur < 0 || c.dur > max) { c = { ...c, dur: Math.max(0, Math.min(max, Math.round(c.dur))) }; fix('прочность вещи ' + e.id); }
        if (c.dur !== undefined && c.dur >= max) { c = { ...c }; delete c.dur; }   // целую вещь храним без поля
      }
      if (c.runes !== undefined) {                                     // руны: только известные, не больше гнёзд
        const rs = Array.isArray(c.runes) ? c.runes.filter((r) => typeof r === 'string' && SG_R.CATALOG[r]).slice(0, SG_R.socketsFor(c)) : [];
        if (!Array.isArray(c.runes) || rs.length !== c.runes.length) { c = { ...c }; fix('руны вещи ' + e.id); if (rs.length) c.runes = rs; else delete c.runes; }
      }
      if (Array.isArray(c.runes) && c.runes.some((r) => r && !SG_R.allows(c, r))) {   // 2.0.8: руна мощи не в оружии — возвращается в запас
        const rs = c.runes.map((r) => { if (r && !SG_R.allows(c, r)) { refundRunes[r] = (refundRunes[r] || 0) + 1; return undefined; } return r; });
        c = { ...c }; fix('руна мощи вне оружия: ' + e.id);
        if (rs.some(Boolean)) c.runes = rs; else { delete c.runes; delete c.rr; }
      }
      if (c.rr !== undefined) {                                        // ранги рун: целые 1–10, по числу мест
        const n = SG_R.socketsFor(c), rr = Array.isArray(c.rr) ? c.rr.slice(0, n).map((v) => (Number.isInteger(v) && v >= 1 && v <= 10 ? v : undefined)) : [];
        if (!c.runes || !rr.some(Boolean)) { c = { ...c }; delete c.rr; }
        else if (JSON.stringify(rr) !== JSON.stringify(c.rr)) { c = { ...c, rr }; fix('ранги рун вещи ' + e.id); }
      }
      if (c.cut !== undefined && !(SG_S && SG_S.valid(c.cut))) { c = { ...c }; delete c.cut; fix('огранка вещи ' + e.id); }
      if (c.hole !== undefined || c.gem !== undefined || c.gems !== undefined) {                 // гнёзда самоцветов: приводим к массиву gems
        const lim = SG_S && SG_S.maxHoles ? SG_S.maxHoles(d.thirdGem) : 2;
        let g = Array.isArray(c.gems) ? c.gems : (c.hole === true ? [c.gem] : []);
        g = g.slice(0, lim).map((v) => (SG_S && SG_S.valid(v) ? v : 0));
        const same = Array.isArray(c.gems) && c.gems.length === g.length && c.gems.every((v, i) => v === g[i]);
        if (!same || c.hole !== undefined || c.gem !== undefined) { c = { ...c }; delete c.hole; delete c.gem; if (g.length) c.gems = g; else delete c.gems; fix('гнёзда самоцветов вещи ' + e.id); }
      }
      seen.add(c.uid); items.push(c);
    }
    d.items = items;

    // --- надетое: существующая вещь, подходящая ячейке, одна вещь — одна ячейка ---
    const lo = SG_G.emptyLoadout(), used = new Set(), src = isObj(d.loadout) ? d.loadout : {};
    for (const s of SG_G.SLOTS) {
      const u = src[s];
      if (u === null || u === undefined) continue;
      const e = typeof u === 'string' ? items.find((i) => i.uid === u) : null;
      if (e && SG_G.item(e).broken) { fix('надето: сломанная вещь снята ' + s); continue; }
      if (e && !used.has(u) && SG_G.fits(s, SG_G.item(e).type)) { lo[s] = u; used.add(u); } else fix('надето: ячейка ' + s + ' снята');
    }
    d.loadout = lo;

    // --- ресурсы, расходники, эликсиры, боеприпасы, руны, яйца ---
    d.resources = counters(d.resources, resKeyOk, 'ресурсы');
    d.backpack = counters(d.backpack, (k) => !!SG_G.CONSUMABLES[k], 'расходники');
    if (!isObj(d.elixirs)) d.elixirs = { active: {}, bag: {} };
    d.elixirs.bag = counters(d.elixirs.bag, elixKeyOk, 'эликсиры');
    d.ammo = counters(d.ammo, (k) => !!SG_A.CATALOG[k], 'боеприпасы');
    if (Object.keys(refundRunes).length) { d.runeBag = isObj(d.runeBag) ? d.runeBag : {}; for (const k in refundRunes) d.runeBag[k] = (Number(d.runeBag[k]) || 0) + refundRunes[k]; }
    d.runeBag = counters(d.runeBag, (k) => !!SG_R.CATALOG[k], 'руны');
    if (d.eggs !== undefined) d.eggs = counters(d.eggs, (k) => !!SG_P.EGGS[k], 'яйца');

    // --- лавка: если ассортимент не читается — её составит игра заново ---
    if (d.shop !== null && d.shop !== undefined) {
      const s = d.shop;
      if (!(isObj(s) && Number.isFinite(s.top) && Array.isArray(s.stock) && s.stock.every(validEntry))) { fix('лавка'); d.shop = null; }
    }

    // --- Торговые ряды: только читаемые лоты ---
    if (isObj(d.market)) {
      const lots = [], now = Date.now();
      for (const l of Array.isArray(d.market.lots) ? d.market.lots : []) {
        const base = isObj(l) && typeof l.id === 'string' && ['item', 'res', 'cons', 'ammo'].includes(l.kind) && Number.isFinite(l.price) && l.price > 0 && Number.isFinite(l.n) && l.n >= 1 && Number.isFinite(l.fair) && l.fair > 0;
        const keyOk = base && (l.kind === 'item' ? validEntry(l.entry) : l.kind === 'res' ? resKeyOk(l.key) : l.kind === 'cons' ? !!SG_G.CONSUMABLES[l.key] : !!SG_A.CATALOG[l.key]);
        if (!keyOk) { fix('лот убран'); continue; }
        const c = { ...l };
        if (!Number.isFinite(c.listedAt)) { c.listedAt = now; fix('лот: время'); }
        if (!Number.isFinite(c.checkedAt)) c.checkedAt = c.listedAt;
        lots.push(c);
      }
      d.market.lots = lots;
      d.market.log = (Array.isArray(d.market.log) ? d.market.log : []).filter((x) => isObj(x) && Number.isFinite(x.price)).slice(0, 15);
    } else d.market = { lots: [], log: [] };

    // --- питомец и инкубатор ---
    if (d.pet !== null && d.pet !== undefined) {
      const p = d.pet;
      if (!(isObj(p) && typeof p.speciesId === 'string' && SG_B.MONSTERS[SG_P.donorOf(p.speciesId)])) { fix('питомец'); d.pet = null; }
      else {
        const max = Number.isFinite(p.maxDurability) && p.maxDurability >= 1 ? Math.floor(p.maxDurability) : SG_P.MAX_DURABILITY;
        const dur = Number.isFinite(p.durability) ? Math.max(0, Math.min(max, Math.floor(p.durability))) : max;
        if (p.maxDurability !== max || p.durability !== dur || !tierOk(p.tier)) { fix('питомец: прочность/цвет'); d.pet = { ...p, tier: clampTier(p.tier), maxDurability: max, durability: dur }; }
      }
    }
    if (d.petChoice === 'tamed' && !d.pet) d.petChoice = 'home';
    if (d.incubator !== null && d.incubator !== undefined && !(isObj(d.incubator) && SG_P.EGGS[d.incubator.egg] && Number.isFinite(d.incubator.left) && d.incubator.left >= 0)) { fix('инкубатор'); d.incubator = null; }

    // --- медали ---
    if (!isObj(d.medals)) { fix('медали'); d.medals = { earned: [], fiveStreaks: 0, strikeKills: 0 }; }
    if (isObj(d.medals)) {
      d.medals.earned = (Array.isArray(d.medals.earned) ? d.medals.earned : []).filter((m, i, a) => isObj(m) && typeof m.id === 'string' && m.id && a.findIndex((x) => isObj(x) && x.id === m.id) === i).map((m) => (tierOk(m.tier) ? m : { ...m, tier: clampTier(m.tier) }));
      if (d.medals.cnt !== undefined) {                          // 2.0.7: счётчики мастерских серий
        const cnt = {}; let bad = !isObj(d.medals.cnt);
        for (const k of Object.keys(isObj(d.medals.cnt) ? d.medals.cnt : {})) { const v = d.medals.cnt[k]; if (Number.isInteger(v) && v >= 0 && v < 1e9) cnt[k] = v; else bad = true; }
        if (bad) { fix('медали.cnt'); d.medals.cnt = cnt; }
      }
      for (const k of ['fiveStreaks', 'strikeKills', 'shotKills', 'drunk', 'spellWins']) if (d.medals[k] !== undefined && (!Number.isInteger(d.medals[k]) || d.medals[k] < 0)) { fix('медали.' + k); d.medals[k] = Math.max(0, Math.floor(nonNeg(d.medals[k]))); }
    }

    // --- бестиарий: известные виды, счётчик побед, цвет ---
    if (!isObj(d.bestiary)) { fix('бестиарий'); d.bestiary = {}; }
    if (isObj(d.bestiary)) {
      const b = {};
      for (const [id, r] of Object.entries(d.bestiary)) {
        if (!SG_B.MONSTERS[id] || !isObj(r)) { fix('бестиарий: ' + id); continue; }
        b[id] = { ...r, wins: Math.max(0, Math.floor(nonNeg(r.wins))), tier: tierOk(r.tier) ? r.tier : clampTier(r.tier) };
      }
      d.bestiary = b;
    }
    // --- 1.6.6: отметка «бой идёт» (закрытие вкладки после первого хода — поражение) ---
    if (d.battle !== null && d.battle !== undefined && !(isObj(d.battle) && typeof d.battle.moved === 'boolean')) { fix('бой'); d.battle = null; }
    // разделы новых систем (1.8.6–1.9.x): у каждого модуля есть своя clean(); раньше она вызывалась лениво, при открытии окна
    const modOf = (name, file) => (typeof globalThis !== 'undefined' && globalThis[name]) || (typeof require === 'function' ? (() => { try { return require(file); } catch (e) { return null; } })() : null);
    for (const [key, name, file] of [['stones', 'Stones', './stones.js'], ['compass', 'Compass', './compass.js'], ['bank', 'Bank', './bank.js'], ['streak', 'Streak', './streak.js'], ['puzzle', 'Puzzle', './puzzle.js'], ['lessons', 'Lessons', './lessons.js'], ['chess', 'Chess', './chess.js'], ['lh', 'LHGames', './lhgames.js'], ['crafts', 'Crafts', './crafts.js'], ['decor', 'Decor', './decor.js'], ['mail', 'Mail', './mail.js'], ['trader', 'Trader', './trader.js'], ['run', 'Run', './run.js']]) {
      if (d[key] === undefined || d[key] === null) continue;           // нет раздела — не создаём
      const M = modOf(name, file);
      if (!M || typeof M.clean !== 'function') continue;
      try { d[key] = key === 'bank' ? M.clean(d[key], 2e9) : M.clean(d[key]); } catch (e) { fix('раздел ' + key + ' сброшен'); delete d[key]; }
    }
    return { fixed: notes.length, notes };
  }

  return { normalize, isObj };
})();

if (typeof module !== 'undefined') module.exports = SaveGuard;
