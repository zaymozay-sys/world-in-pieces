if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Профиль игрока (прогресс, деньги, вещи, ресурсы, бестиарий) и окно «Ранец и экипировка».
   Профиль хранится в браузере (localStorage), если он доступен. */

const I_PT = (typeof Pets !== 'undefined') ? Pets : require('./pets.js');
const artVar = (name, key) => (typeof Art !== 'undefined' && Art.has(key)) ? `--${name}:url('${new URL(Art.url(key), location.href).href}');` : '';
const cardArtVars = () => artVar('seal', 'ui/card-seal') + artVar('frame', 'ui/card-frame') + artVar('divider', 'ui/card-divider');

const Profile = (() => {
  const KEY = 'gem-match-profile-v2';
  const OLD_KEY = 'gem-match-profile';
  const START_KIT = { 'sword-novice': 'main', 'shield-wood': 'off', 'leather-head': 'head', 'leather-chest': 'chest', 'leather-arms': 'arms', 'leather-legs': 'legs' };

  const fresh = () => {
    const items = [], loadout = Gear.emptyLoadout();
    for (const [id, slot] of Object.entries(START_KIT)) {
      const e = Gear.makeEntry(id, 1);
      items.push(e);
      loadout[slot] = e.uid;
    }
    return {
      wins: 0,
      xp: 0,                                       // опыт героя; уровень считается из него (hero.js)
      coins: 500,                                  // в медных монетах
      items,                                       // все вещи игрока: { uid, id, tier }
      loadout,                                     // ячейка → uid надетой вещи
      resources: {},                               // 'вид:уровень' → количество
      backpack: { potion: 2, elixir: 1, dust: 1, scroll: 1 },
      bestiary: {},                                // вид → { wins, tier } (tier — высший открытый уровень)
      quests: {},                                  // задания трактирщика: id → true (награда уже получена)
      accepted: {},                                // задания, которые игрок взял (см. js/quests.js): id → true
      daily: { date: '', wins: 0, questClaimed: false, lottery: false },   // ежедневные механики (см. js/daily.js)
      elixirs: { active: {}, bag: {} },            // 1.3.6: эликсиры — действующие и в сумке
      village: {},                                 // 1.5.1: уровни улучшений зданий (js/village.js)
      cosmetics: { titles: [], frames: [], title: null, frame: null },   // 1.5.1: титулы и рамки портрета
      medals: { earned: [], fiveStreaks: 0, strikeKills: 0 },   // медали: полученные { id, tier }, счётчик линий из 5
                                                     // камней и счётчик добиваний Ударом (js/medals.js)
      monster: { id: 'rat', tier: 1 },             // текущий (последний) противник
      name: '',                                    // ник игрока; выбирается при первом запуске
      faction: null,                               // фракция игрока (см. factions.js); выбирается при первом запуске
      gender: null,                                // 'm' или 'f' — какой фигурой рисуется герой; выбирается при первом запуске
      seen: {},                                    // встреченные на карте виды: вид → высший цвет
      map: null,                                   // состояние карты (см. mapview.js)
      shop: null,
      ui: 'columns',                               // оформление экрана боя: 'classic' (старое), 'modern' (новое) или 'columns' (колонки)
      uiVer: 2,                                    // 2 = оформление боя «колонки» по умолчанию (см. миграцию ниже)
      pet: null,                                    // прирученный питомец: { speciesId, tier, durability, maxDurability } (см. pets.js) или null
      runeBag: {},                                  // запас рун (см. runes.js): id руны → количество
      ammo: {},                                     // 1.3.0: боеприпасы в сумке (см. ammo.js): вид → количество
      ammoStart: false,                             // выдана ли первая пачка боеприпасов своего народа
      market: { lots: [], log: [] },                // 1.3.0: Торговые ряды (см. market.js)
      story: { shards: {} },                        // 1.3.0: осколки Великого Сердца (см. story.js): id стража → true
      battle: null,                                 // 1.6.6: бой идёт — { moved }: закрытие вкладки после первого хода считается поражением
    };
  };

  // 1.5.4: поле неверного типа (правленный руками файл, битое сохранение) берётся из нового профиля, а не роняет игру.
  // Поля, которые в новом профиле null (карта, питомец, народ…), бывают разных видов — их не проверяем.
  const kindOf = (v) => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
  function sanitize(saved) {
    const base = fresh(), out = {};
    for (const [k, v] of Object.entries(saved)) {
      if (!(k in base) || base[k] === null) { out[k] = v; continue; }
      const want = kindOf(base[k]);
      if (kindOf(v) === want && !(want === 'number' && !Number.isFinite(v))) out[k] = v;
    }
    if (out.faction && typeof Factions !== 'undefined' && !Factions.ORDER.includes(out.faction)) out.faction = null;
    return out;
  }

  // 1.6.5: сборка профиля из сохранённого — один путь для загрузки при старте и для «Загрузить сохранение» (раньше импорт пропускал миграции).
  // Недостающие поля достраиваются значениями нового профиля; старые форматы приводятся к текущему.
  function migrate(saved) {
    const d = { ...fresh(), ...saved };
    d.loadout = { ...Gear.emptyLoadout(), ...(saved.loadout || {}) };
    if (!saved.uiVer) d.ui = 'columns';               // с 1.1.8 оформление боя «колонки» — по умолчанию и для старых сохранений
    // старые сохранения могли не знать о счётчике добиваний Ударом (см. Medals.STRIKE_MILESTONES)
    d.medals = { earned: [], fiveStreaks: 0, strikeKills: 0, ...(saved.medals || {}) };
    d.elixirs = { active: {}, bag: {}, ...(saved.elixirs || {}) };
    d.elixirs.active = {};                                           // 1.6.0: эликсиры действуют только в бою
    for (const k of Object.keys(d.elixirs.bag)) if (k.startsWith('initiative:')) {   // 1.6.0: «Инициатива» → «Хитрость»
      const nk = 'cunning:' + k.split(':')[1];
      d.elixirs.bag[nk] = (d.elixirs.bag[nk] || 0) + d.elixirs.bag[k]; delete d.elixirs.bag[k];
    }
    d.village = { ...(saved.village || {}) };
    d.cosmetics = { titles: [], frames: [], title: null, frame: null, ...(saved.cosmetics || {}) };
    // прогресс из версии без уровней: опыт по числу побед (примерно 4 победы на уровень)
    if (saved.xp === undefined) d.xp = Hero.totalFor(1 + Math.floor((saved.wins || 0) / 4));
    return d;
  }

  // Приводит профиль в порядок после загрузки или импорта: боеприпасы старта, проверка содержимого списков (saveguard.js), снятие лишнего.
  let lastFixes = [];
  let interrupted = null;                          // 1.6.6: вкладку закрыли посреди боя — { broken: [...] }; карта один раз сообщает об этом
  // 1.6.6: износ — все надетые вещи (кроме сумки) теряют n пунктов прочности; дошедшая до 0 снимается. Без записи на диск.
  function wearItems(n) {
    const out = { worn: 0, broken: [] };
    for (const slot of Gear.SLOTS) {
      if (Gear.WEAR_SLOTS_SKIP.includes(slot)) continue;
      const uid = data.loadout[slot]; if (!uid) continue;
      const e = data.items.find((i) => i.uid === uid); if (!e) continue;
      const left = Math.max(0, Gear.durOf(e).cur - n);
      e.dur = left; out.worn++;
      if (left <= 0) { data.loadout[slot] = null; out.broken.push(Gear.item(e).name); }
    }
    return out;
  }
  function settle() {
    // 1.3.0: старым героям — первая пачка боеприпасов своего народа.
    if (data.faction && !data.ammoStart && typeof Ammo !== 'undefined') { data.ammoStart = true; data.ammo = { ...(data.ammo || {}), [Ammo.forFaction(data.faction)]: ((data.ammo || {})[Ammo.forFaction(data.faction)] || 0) + Ammo.PACK }; }
    // 1.6.5: битые записи внутри списков (вещь с неизвестным id, null, лот без вещи…) убираются, а не роняют окна и запуск
    lastFixes = (typeof SaveGuard !== 'undefined') ? SaveGuard.normalize(data).notes : [];
    // 1.6.6: вкладку закрыли посреди боя (после первого хода) — это поражение со штрафом 2; до первого хода — просто отметка снимается
    interrupted = null;
    if (data.battle) {
      const moved = data.battle.moved; data.battle = null;
      if (moved) interrupted = wearItems(2);
    }
    fitLoadout();
  }

  // Снимает вещи не по уровню и лишние сверх лимита очков (например, после перехода со старой версии).
  function fitLoadout() {
    const L = Hero.levelOf(data.xp).level;
    const worn = () => Gear.SLOTS.filter((s) => data.loadout[s]).map((s) => ({ s, e: data.items.find((i) => i.uid === data.loadout[s]) }));
    for (const { s, e } of worn()) if (!e || !Hero.canWear(Gear.item(e).wt, L)) data.loadout[s] = null;
    const cost = () => worn().reduce((sum, { e }) => sum + Gear.item(e).cost, 0);
    while (cost() > Hero.budget(L)) {
      const top = worn().sort((a, b) => Gear.item(b.e).cost - Gear.item(a.e).cost)[0];
      data.loadout[top.s] = null;
    }
  }

  let data = fresh(), raw = null;
  try {
    raw = localStorage.getItem(KEY);
    let saved = JSON.parse(raw || 'null');
    if (saved && (typeof saved !== 'object' || Array.isArray(saved))) saved = null;
    if (saved) saved = sanitize(saved);
    if (saved) data = migrate(saved);
    else {
      // перенос прогресса из первой версии (там вещи хранились по id)
      const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
      if (old) {
        data.wins = old.wins || 0;
        data.backpack = { ...data.backpack, ...(old.backpack || {}) };
        data.coins = 500 + data.wins * 100;
      }
    }
  } catch (e) { /* без хранилища */ }
  try { settle(); }
  catch (e) { data = fresh(); settle(); lastFixes = ['загрузка: сохранение не удалось привести в порядок']; }   // крайний случай: игра запускается, а не зависает
  // Если что-то пришлось чинить, исходный текст сохранения кладётся рядом (на случай, если починка убрала что-то нужное): ключ …-v2-bak
  if (lastFixes.length && raw) { try { localStorage.setItem(KEY + '-bak', raw); } catch (e) { /* нет места — не страшно */ } }

  if (interrupted) { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* не страшно */ } }   // 1.6.6: штраф за закрытую вкладку записывается сразу, чтобы второй перезапуск не списал его повторно
  let sandboxed = false;   // 1.6.4 (WIP-06): режим разработчика работает только в памяти — настоящее сохранение не трогается
  /* 1.6.6: две вкладки. Если профиль записала другая вкладка (событие storage), эта — устаревшая: писать из неё нельзя,
     иначе она затрёт чужой прогресс. Показываем окно «игра открыта в другой вкладке» с кнопкой «Обновить». */
  let stale = false;
  function markStale() {
    if (stale || sandboxed) return;
    stale = true;
    try {
      if (typeof document === 'undefined' || !document.body) return;
      const d = document.createElement('div'); d.className = 'stale-tab'; d.setAttribute('role', 'alertdialog');
      d.innerHTML = '<div class="stale-card"><b></b><p></p><button type="button" class="primary"></button></div>';
      d.querySelector('b').textContent = _t("Игра открыта в другой вкладке");
      d.querySelector('p').textContent = _t("Прогресс сохраняет та вкладка, где вы играли последней. Закройте лишнюю и обновите эту страницу — иначе прогресс может потеряться.");
      const btn = d.querySelector('button'); btn.textContent = _t("Обновить"); btn.addEventListener('click', () => location.reload());
      document.body.appendChild(d);
    } catch (e) { /* не страшно */ }
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', (ev) => { if (ev.key === KEY || ev.key === null) markStale(); });
  }
  // 1.8.4: титулы за достижения выдаются сами, как только условие выполнено (медали, цвет героя, боссы, исследование карты)
  let syncing = false;
  function syncTitles() {
    if (syncing || !data || typeof Village === 'undefined' || !Village.syncTitles) return;
    syncing = true;
    try {
      data.cosmetics = data.cosmetics || { titles: [], frames: [], title: null, frame: null };
      const fresh = Village.syncTitles(data.cosmetics, { earned: data.medals ? data.medals.earned : [], tier: Hero.tierFor(Hero.levelOf(data.xp).level), bestiary: data.bestiary, explored: data.explored100, decor: (typeof Decor !== 'undefined' && data.decor) ? Decor.filled(Decor.clean(data.decor)) : 0, decorOwn: (typeof Decor !== 'undefined' && data.decor) ? Decor.ownCount(Decor.clean(data.decor)) : 0, stones: (typeof Stones !== 'undefined' && data.stones) ? Stones.seenCount(Stones.clean(data.stones)) : 0 });
      if (fresh.length && typeof MapView !== 'undefined' && MapView.toast) MapView.toast(_t("Новый титул: {0} — наденьте в Гардеробе Ратуши", [fresh.length > 3 ? fresh.slice(0, 3).join(', ') + _t(" и ещё {0}", [fresh.length - 3]) : fresh.join(', ')]));
    } catch (e) { /* титулы не критичны */ }
    syncing = false;
  }
  const save = () => {
    syncTitles();
    if (sandboxed || stale) return;
    try { if (typeof Net !== 'undefined') { if (!Net.validPid(data.pid)) data.pid = Net.newPid(); } } catch (e) { /* 1.9.0: внутренний номер игрока — не критично */ }
    try {
      const json = JSON.stringify(data);
      localStorage.setItem(KEY, json);
      try { if (typeof Funnel !== 'undefined' && typeof Net !== 'undefined' && Net.current) Funnel.sync(data, Net.current.remote); } catch (e4) { /* статистика игре не мешает */ }
      try { if (typeof Net !== 'undefined' && Net.current) Net.current.mirror(json); } catch (e3) { /* 1.9.0: копия на площадку (если адаптер умеет) игре не мешает */ }
    }
    catch (e) {
      // 1.6.5 (A2-09): запись перестала получаться посреди игры (нет места, запрет сайта) — раньше это молчало; теперь один раз сообщаем игре
      if (storageOk) { storageOk = false; try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('profile-save-failed')); } catch (e2) { /* не страшно */ } }
    }
  };
  const findItem = (uid) => data.items.find((i) => i.uid === uid) || null;
  const resKey = (kind, tier) => kind + ':' + tier;
  const rnd = (n) => Math.floor(Math.random() * n);

  // Ассортимент лавки: обновляется после каждого боя; вещи цвета вашего уровня и на цвет ниже.
  function makeShop() {
    const top = Hero.tierFor(Hero.levelOf(data.xp).level);
    const pool = [];
    for (const it of Gear.itemsFor(data.faction)) for (let k = 0; k < { common: 6, rare: 3, epic: 1 }[it.rarity]; k++) pool.push(it);
    const stock = [];
    for (let i = 0; i < 8; i++) stock.push(Gear.makeEntry(pool[rnd(pool.length)].id, Math.max(1, top - rnd(2))));
    return { top, stock };
  }

  // 1.5.4: браузер не даёт хранить данные (приватный режим, запрет сайта) — карта предупредит, что прогресс не сохранится.
  let storageOk = true;
  try { localStorage.setItem('wip-probe', '1'); localStorage.removeItem('wip-probe'); } catch (e) { storageOk = false; }
  const api = {
    get data() { return data; },
    get storageOk() { return storageOk; },
    get stale() { return stale; },                   // 1.6.6: профиль записала другая вкладка — эта только читает
    get saveFixes() { return lastFixes; },
    get interrupted() { return interrupted; },       // 1.6.6: итог закрытой посреди боя вкладки ({worn, broken}) или null
    clearInterrupted() { interrupted = null; },          // 1.6.5: что убрала проверка сохранения при последней загрузке (для разработчика и тестов)
    save,
    reset() { data = fresh(); save(); },

    // Вещи и снаряжение
    item: findItem,
    // Снаряжение в виде «ячейка → экземпляр» (для расчётов и рисунков).
    shotKind() { return (typeof Gear.shotKind === 'function' && Gear.shotKind(this.gear())) || Ammo.forFaction(data.faction); },
    gear() {
      const g = Gear.emptyLoadout();
      for (const s of Gear.SLOTS) g[s] = data.loadout[s] ? findItem(data.loadout[s]) : null;
      return g;
    },
    equippedUid: (uid) => Gear.SLOTS.find((s) => data.loadout[s] === uid) || null,
    addItem(entry) { data.items.push(entry); save(); },
    removeItem(uid) {
      for (const s of Gear.SLOTS) if (data.loadout[s] === uid) data.loadout[s] = null;
      data.items = data.items.filter((i) => i.uid !== uid);
      save();
    },
    // Уровень героя и опыт.
    level: () => Hero.levelOf(data.xp).level,
    levelInfo: () => Hero.levelOf(data.xp),
    // Добавляет опыт. Возвращает { from, to } — уровень до и после.
    addXp(n) { const from = Hero.levelOf(data.xp).level; if (Number.isFinite(n) && n > 0) data.xp += n; save();   // 1.6.5: NaN/отрицательное не портят опыт
      return { from, to: Hero.levelOf(data.xp).level }; },
    // Лимит очков снаряжения растёт с уровнем.
    budget: () => Hero.budget(Hero.levelOf(data.xp).level),
    // Цена расходника растёт с уровнем (вместе с доходом).
    consumablePrice: (k) => Hero.consumablePrice(Gear.CONSUMABLES[k].price, Hero.levelOf(data.xp).level),

    // Деньги
    addCoins(n) { if (!Number.isFinite(n) || n <= 0) return; data.coins += n; save(); },   // 1.6.4: NaN/отрицательное не портят кошелёк
    spend(n) { if (!Number.isFinite(n) || n < 0 || data.coins < n) return false;   // 1.6.4: NaN/отрицательная цена — отказ, не «бесплатные монеты»
       data.coins -= n; save(); if (n >= 100 * 10000) api.noteSecret({ spent: n }); return true; },
    // 1.5.1: улучшения деревни и косметика (js/village.js)
    village() { return data.village; },
    buyVillage(id) { const p = Village.buy(data.village, id, Hero.tierFor(api.level()), data.coins); if (!p) return false; data.coins -= p; save(); return true; },
    buyCosmetic(kind, id) { const p = Village.buyCosmetic(data.cosmetics, kind, id, data.coins, !!(data.story && data.story.shards && data.story.shards.b5)); if (!p) return false; data.coins -= p; save(); return true; },
    equipCosmetic(kind, id) { const ok = Village.equip(data.cosmetics, kind, id); if (ok) save(); return ok; },
    heroName() { return Village.fullName(data.name || '', data.cosmetics); },

    // Ресурсы
    res: (kind, tier) => data.resources[resKey(kind, tier)] || 0,
    addRes(kind, tier, n) { if (!Number.isFinite(n) || n <= 0) return; data.resources[resKey(kind, tier)] = (data.resources[resKey(kind, tier)] || 0) + n; save(); },   // 1.6.5: как addCoins
    takeRes(kind, tier, n) {
      if (!Number.isFinite(n) || n < 0 || (data.resources[resKey(kind, tier)] || 0) < n) return false;   // 1.6.5: отрицательное «взять» не выдаёт ресурсы
      data.resources[resKey(kind, tier)] -= n;
      if (!data.resources[resKey(kind, tier)]) delete data.resources[resKey(kind, tier)];
      save();
      return true;
    },
    resList() {
      return Object.entries(data.resources).map(([k, n]) => { const [kind, tier] = k.split(':'); return { kind, tier: Number(tier), n }; })
        .sort((a, b) => a.tier - b.tier || a.kind.localeCompare(b.kind));
    },

    // Эликсиры (1.3.6)
    elixirBag() { return Object.entries(data.elixirs.bag).filter(([, n]) => n > 0).map(([k, n]) => ({ ...Elixirs.split(k), n })); },
    addElixir(kind, tier, n = 1) { if (!Number.isFinite(n) || n <= 0) return; const k = Elixirs.key(kind, tier); data.elixirs.bag[k] = (data.elixirs.bag[k] || 0) + n; save(); },
    // 1.6.0: эликсиры пьются только в бою (game.js: useElixir) и действуют до его конца — в профиле не хранятся
    takeElixir(kind, tier) {
      const k = Elixirs.key(kind, tier);
      if (!(data.elixirs.bag[k] > 0)) return false;
      data.elixirs.bag[k]--; save(); return true;
    },
    // Расходники
    addConsumable(kind, n = 1) { if (!Number.isFinite(n) || n <= 0) return; data.backpack[kind] = (data.backpack[kind] || 0) + n; save(); },

    // Торговые ряды (см. market.js): проверка проданных лотов. Возвращает список проданных лотов.
    marketTick(now = Date.now()) {
      if (typeof Market === 'undefined') return [];
      data.market = data.market || { lots: [], log: [] };
      const { sold, left } = Market.tick(data.market.lots, now);
      data.market.lots = left;
      for (const lot of sold) {
        data.coins += lot.price;
        data.market.log.unshift({ at: now, name: lot.name, n: lot.n, price: lot.price });
      }
      data.market.log = data.market.log.slice(0, 15);
      save();
      return sold;
    },

    // Боеприпасы (см. ammo.js)
    ammo: (k) => (data.ammo || {})[k] || 0,
    addAmmo(k, n = 1) { if (!Number.isFinite(n) || n <= 0) return; data.ammo = data.ammo || {}; data.ammo[k] = (data.ammo[k] || 0) + n; save(); },
    takeAmmo(k) { if (!((data.ammo || {})[k] > 0)) return false; data.ammo[k]--; save(); return true; },

    // Руны (см. runes.js): хранятся в запасе, пока не вставлены в вещь (см. ItemInfo в этом файле).
    rune: (id) => (data.runeBag || {})[id] || 0,
    addRune(id, n = 1) { if (!Number.isFinite(n) || n <= 0) return; data.runeBag = data.runeBag || {}; data.runeBag[id] = (data.runeBag[id] || 0) + n; save(); },

    // Бестиарий: вид попадает в него, когда вы встретили его на карте (или уже побеждали).
    species: () => Bestiary.ORDER.filter((id) => (data.seen && data.seen[id]) || data.bestiary[id]),
    // Высший цвет вида, который можно посмотреть в бестиарии: встреченный или следующий за побеждённым.
    maxTier: (id) => Math.max(data.bestiary[id] ? data.bestiary[id].tier : 1, (data.seen && data.seen[id]) || 1),
    // 1.7.7: победы по цветам: { wins[t], species[t] }. Старые сохранения без byTier: считаем по одной победе на каждый цвет ниже достигнутого.
    tierStats() {
      const wins = new Array(Tiers.MAX + 1).fill(0), sp = new Array(Tiers.MAX + 1).fill(0);
      for (const id of Object.keys(data.bestiary)) {
        const rec = data.bestiary[id], bt = rec.byTier;
        for (let t = 1; t <= Tiers.MAX; t++) {
          const n = bt ? (bt[t] || 0) : (t < rec.tier ? 1 : 0);
          if (n > 0) { wins[t] += n; sp[t]++; }
        }
      }
      return { wins, species: sp };
    },
    // 1.8.6: «Пояс охотника» — 5 побед подряд с ним на поясе заряжают пояс: следующий бой +25% урона и добычи.
    stones() { return (data.stones = Stones.clean(data.stones)); },   // 1.8.9: самоцветы стражей
    beltTier() { const u = data.loadout && data.loadout.belt, e = u && data.items.find((i) => i.uid === u); return e ? Math.max(1, (e.tier | 0) + (typeof Stones !== 'undefined' ? Stones.beltCap(e.cut) : 0)) : 0; },   // 1.8.9: цвет надетого пояса (0 — пояса нет); нужен стрелкам компаса
    huntBelt() { const u = data.loadout && data.loadout.belt, e = u && data.items.find((i) => i.uid === u); return !!(e && e.id === 'belt-hunter'); },
    huntWin() {
      const h = data.hunt = (data.hunt && typeof data.hunt === 'object') ? data.hunt : { streak: 0, ready: false };
      if (!api.huntBelt()) { h.streak = 0; return false; }
      if (++h.streak >= 5) { h.streak = 0; h.ready = true; return true; }
      return false;
    },
    // 1.8.8: дневник питомца — записи за время вашего отсутствия (см. js/petdiary.js)
    petDiaryTick() {
      if (typeof PetDiary === 'undefined') return [];
      const pet = api.pet(), r = PetDiary.tick(data.petDiary, pet && pet.speciesId, pet ? I_PT.petDisplayName(pet.speciesId) : '', data.petDiaryAt, Date.now());
      data.petDiary = r.diary; data.petDiaryAt = r.last; if (r.added || !Number.isFinite(data.petDiaryAt)) save();
      return r.diary;
    },
    noteBattle() { const s = data.stats = (data.stats && typeof data.stats === 'object') ? data.stats : {}; s.battles = (Number.isFinite(s.battles) ? s.battles : 0) + 1; },   // 1.8.8: все бои (победы и поражения)
    chron(k, a) { if (typeof Chron === 'undefined') return null; const e = Chron.add(data, k, a); if (e) save(); return e; },   // 1.8.8: журнал судьбы героя
    huntLoss() { if (data.hunt) data.hunt.streak = 0; },
    huntTake() { const h = data.hunt; if (!h || !h.ready || !api.huntBelt()) return false; h.ready = false; return true; },
    recordWin(id, tier) {
      const rec = data.bestiary[id] || { wins: 0, tier: 1 };
      rec.wins++;
      rec.byTier = rec.byTier || {}; rec.byTier[tier] = (rec.byTier[tier] || 0) + 1;   // 1.7.7: победы по цветам (для графика в журнале)
      if (tier >= rec.tier) rec.tier = Math.min(Tiers.MAX, tier + 1);
      data.bestiary[id] = rec;
      if (data.incubator && data.incubator.left > 0) data.incubator.left--;   // 1.3.9: яйцо согревается боями
      save();
    },

    // Медали (см. js/medals.js). tier — цвет героя на момент получения, для свечения медали в интерфейсе.
    medals: () => data.medals.earned,
    hasMedal: (id) => data.medals.earned.some((m) => m.id === id),
    grantMedal(id, tier) {
      if (api.hasMedal(id)) return null;
      const m = { id, tier: Tiers.clamp(tier) };
      data.medals.earned.push(m);
      // 1.6.3: собранный комплект медалей выдаёт реликвию (один раз)
      // 1.6.5 (A2-06): «один раз» теперь запоминается (medals.relics), а не выводится из того, лежит ли реликвия в сумке: раньше проданную или сданную
      // реликвию выдавало заново при получении любой следующей медали. Реликвии, проданные до 1.6.5, выдаются ещё один раз и после этого запоминаются.
      data.medals.relics = data.medals.relics || {};
      for (const k of Medals.GROUP_ORDER) {
        const rid = Medals.relicId(k);
        if (!Medals.groupDone(k, data.medals.earned) || data.medals.relics[k]) continue;
        data.medals.relics[k] = true;
        if (!data.items.some((x) => x.id === rid)) { data.items.push(Gear.makeEntry(rid, Tiers.clamp(tier))); m.relic = rid; }
      }
      save();
      return m;
    },
    // 1.7.5: выпит эликсир вида kind (в бою) → медаль «Алхимик». Возвращает медаль или null.
    noteElixir(kind, tier) {
      const t = Hero.tierFor(api.level()), out = [];
      data.medals.drunk = (data.medals.drunk || 0) + 1;
      const kid = Medals.checkElixirMedal(kind, data.medals.earned);
      if (kid) out.push(api.grantMedal(kid, t));
      const did = Medals.checkDrunkMedal(data.medals.drunk, data.medals.earned);
      if (did) out.push(api.grantMedal(did, t));
      save();
      return out.filter(Boolean);
    },
    elixirsDrunk: () => data.medals.drunk || 0,
    // После победы: если это первая победа над видом, выдаёт медаль. Возвращает медаль или null.
    checkKillMedal(id, tier) {
      const wonId = Medals.checkKillMedal(id, data.bestiary, data.medals.earned);
      return wonId ? api.grantMedal(wonId, tier) : null;
    },
    // Вызывается при сборе линии из 5 камней (см. resolveBoard в game.js). Считает и, если пройдена
    // очередная веха, выдаёт медаль. Возвращает медаль или null.
    registerFiveStreak(tier) {
      data.medals.fiveStreaks++;
      const wonId = Medals.checkFiveStreakMedal(data.medals.fiveStreaks, data.medals.earned);
      const m = wonId ? api.grantMedal(wonId, tier) : null;
      save();
      return m;
    },
    // Вызывается, когда монстр добит заклинанием Удар (см. game.js/dealDamage). Считает и, если пройдена
    // очередная веха (Medals.STRIKE_MILESTONES), выдаёт медаль. Возвращает медаль или null.
    registerStrikeKill(tier) {
      data.medals.strikeKills = (data.medals.strikeKills || 0) + 1;
      const wonId = Medals.checkStrikeMedal(data.medals.strikeKills, data.medals.earned);
      const m = wonId ? api.grantMedal(wonId, tier) : null;
      save();
      return m;
    },
    strikeKills: () => data.medals.strikeKills || 0,
    registerShotKill(tier) {
      data.medals.shotKills = (data.medals.shotKills || 0) + 1;
      const wonId = Medals.checkShotMedal(data.medals.shotKills, data.medals.earned);
      const m = wonId ? api.grantMedal(wonId, tier) : null;
      save();
      return m;
    },
    shotKills: () => data.medals.shotKills || 0,
    // 1.6.2: после победы над существом — медали за стиль боя. Возвращает массив полученных медалей.
    // 1.6.2: события мира (здание посещено, тайник, алтарь, сундук) → медали за мир. Возвращает массив полученных медалей.
    noteWorld(kind, arg, tier) {
      const w = data.medals.world = data.medals.world || { visited: {}, caches: 0, altars: 0 };
      if (kind === 'visit' && arg) w.visited[arg] = 1;
      else if (kind === 'cache') w.caches = (w.caches || 0) + 1;
      else if (kind === 'altar') w.altars = (w.altars || 0) + 1;
      const out = Medals.checkWorldMedals(w, data, data.medals.earned).map((id) => api.grantMedal(id, tier)).filter(Boolean);
      save();
      return out;
    },
    // 1.6.2: скрытые медали. ctx — { win, hpLeft, tier, heroTier, spent }; серия поражений ведётся здесь же.
    noteSecret(ctx) {
      const m = data.medals;
      if (ctx.win === true) m.lossStreak = 0; else if (ctx.win === false) m.lossStreak = (m.lossStreak || 0) + 1;
      const got = Medals.checkSecretMedals({ ...ctx, lossStreak: m.lossStreak || 0 }, m.earned).map((id) => api.grantMedal(id, Hero.tierFor(api.level()))).filter(Boolean);
      for (const g of got) if (typeof api.onMedal === 'function') api.onMedal(g);
      save();
      return got;
    },
    // 1.6.2: избранные медали (до трёх) — значки рядом с именем героя (карточка героя, карта)
    favMedals: () => (data.medals.fav || []).filter((id) => api.hasMedal(id)).slice(0, 3),
    toggleFavMedal(id) {
      const fav = (data.medals.fav || []).filter((x) => api.hasMedal(x));
      const i = fav.indexOf(id);
      if (i >= 0) fav.splice(i, 1); else if (api.hasMedal(id) && fav.length < 3) fav.push(id); else return false;
      data.medals.fav = fav; save(); return true;
    },
    favBadges() {
      const earned = data.medals.earned, f = api.favMedals();
      return f.length ? `<span class="fav-badges">${f.map((id) => { const m = earned.find((x) => x.id === id); return `<i class="fav-badge" style="--t:${Tiers.get(m ? m.tier : 1).color}" title="${Medals.nameFor(id).replace(/"/g, '&quot;')}">★</i>`; }).join('')}</span>` : '';
    },
    // 1.6.2: победа в Испытании дня в день day → серия дней подряд → медаль. Возвращает медаль или null.
    registerChallengeWin(day) {
      data.medals.daily = Medals.dailyStep(data.medals.daily, day);
      const id = Medals.checkDailyMedal(data.medals.daily.n, data.medals.earned);
      const m = id ? api.grantMedal(id, Hero.tierFor(api.level())) : null;
      save();
      return m;
    },
    dailyStreak: () => (data.medals.daily && data.medals.daily.n) || 0,
    worldStats: () => data.medals.world || { visited: {}, caches: 0, altars: 0 },
    registerBattleStyle(stats, tier) {
      const out = Medals.checkStyleMedals(stats, data.medals.earned).map((id) => api.grantMedal(id, tier)).filter(Boolean);
      return out;
    },
    // Суммарный постоянный бонус характеристик от всех полученных медалей (см. recalcStats в game.js).
    perk: (k) => Medals.hasPerk(data.medals.earned, k),
    sandbox: (on) => { sandboxed = !!on; },
    isSandbox: () => sandboxed,
    medalsBonus: () => Medals.bonusStats(data.medals.earned, data.bestiary),

    // Приручение и питомец (см. pets.js). Только один активный питомец за раз.
    canTame: (id) => I_PT.canTame(data.bestiary, id),
    // 1.3.9: домашний питомец фракции (создаётся при первом обращении) и выбор, кто идёт в бой: 'home' | 'tamed' | 'none'.
    homePet() {
      // 1.6.0: с появлением питомца у героя есть поводок — выдаём верёвочный (один раз) и надеваем, если слот пуст.
      if (data.faction && !data.leashGiven) {
        data.leashGiven = true;
        if (!data.items.some((x) => (Gear.item(x) || {}).type === 'leash')) { const e = Gear.makeEntry('leash-rope', 1); data.items.push(e); if (!data.loadout.leash) data.loadout.leash = e.uid; }
        save();
      }
      if (!data.homePet && data.faction) { const h = I_PT.homeFor(data.faction); if (h) { data.homePet = I_PT.makePet(h, Hero.tierFor(Profile.level())); save(); } }
      return data.homePet || null;
    },
    petChoice: () => data.petChoice || (data.pet ? 'tamed' : 'home'),
    setPetChoice(c) { data.petChoice = c; save(); },
    pet() { const c = api.petChoice(); return c === 'none' ? null : c === 'home' ? api.homePet() : data.pet; },
    tamedPet: () => data.pet,
    hasUsablePet() { return I_PT.isUsable(api.pet()); },
    // 1.4.8: «оставить питомца дома» на один выход (переключатель перед боем): питомец остаётся выбранным, но в бой не идёт.
    petStay: () => !!data.petStay,
    setPetStay(v) { data.petStay = !!v; save(); },
    petInBattle() { return api.hasUsablePet() && !data.petStay; },
    // Яйца и инкубатор (1.3.9)
    eggs: () => data.eggs || {},
    addEgg(k) { data.eggs = data.eggs || {}; data.eggs[k] = (data.eggs[k] || 0) + 1; save(); },
    // Поводок и компас (1.3.9): статы надетой вещи этого вида (или нули).
    slotStats(type) { const it = Gear.equipped(api.gear()).find((x) => x.type === type); return it ? it.stats : {}; },
    // Компас: каждое очко Хитрости добавляет 1% к шансу яйца.
    rollEgg(monsterId, rand = Math.random) { const k = I_PT.eggFrom(monsterId); if (k && rand() < I_PT.EGG_DROP + 0.01 * (api.slotStats('compass').cunning || 0)) { api.addEgg(k); return k; } return null; },
    incubator: () => data.incubator || null,
    startHatch(k, tier) {
      if (data.incubator || !((data.eggs || {})[k] > 0)) return false;
      const c = I_PT.hatchCost(tier); if (!api.spend(c)) return false;
      data.eggs[k]--; data.incubator = { egg: k, left: I_PT.HATCH_BATTLES }; save(); return true;
    },
    // Вылупившийся питомец заменяет прирученного.
    collectHatch(tier) {
      const inc = data.incubator; if (!inc || inc.left > 0) return null;
      data.pet = I_PT.makePet(I_PT.EGGS[inc.egg].species, tier); data.incubator = null; data.petChoice = 'tamed'; api.chron('pet', I_PT.petDisplayName(data.pet.speciesId)); save(); return data.pet;
    },
    // Приручает вид (заменяет текущего питомца, если был). Возвращает false, если условия ещё не выполнены.
    tame(id, tier) {
      if (!api.canTame(id)) return false;
      data.pet = I_PT.makePet(id, tier);
      api.chron('pet', I_PT.petDisplayName(id));
      data.petChoice = 'tamed';
      save();
      return true;
    },
    // Питомец проиграл бой вместе с героем — теряет 1 прочность (см. pets.js: loseDurability).
    petLoseDurability() { const p = api.pet(); if (p) { I_PT.loseDurability(p); save(); } },
    repairPet() { const p = api.pet(); if (p) { I_PT.repair(p); save(); } },

    /* ---------- 1.6.6: прочность вещей и «бой идёт» ---------- */
    // Поражение: все надетые вещи (кроме сумки) теряют n пунктов; дошедшая до 0 снимается. Возвращает { worn, broken: [имена] }.
    wearLoss(n = 1) { const out = wearItems(n); save(); return out; },
    // Починка pts пунктов (без аргумента — всех недостающих). cost — цена со скидкой Кузницы, которую уже посчитал экран (по умолчанию базовая).
    repairItem(uid, pts, cost) {
      const e = data.items.find((i) => i.uid === uid); if (!e) return false;
      const d = Gear.durOf(e), miss = d.max - d.cur; if (miss <= 0) return false;
      const n = pts === undefined ? miss : Math.max(0, Math.min(miss, Math.floor(pts))); if (n <= 0) return false;
      const price = cost !== undefined ? cost : Gear.repairCost(e, n);
      if (!api.spend(price)) return false;
      const now = d.cur + n;
      if (now >= d.max) delete e.dur; else e.dur = now;
      save();
      return true;
    },
    // Бой начинается / сделан первый ход / бой кончился. Нужно, чтобы закрытие вкладки посреди боя не обходило износ.
    battleStart() { data.battle = { moved: false }; save(); },
    battleMoved() { if (data.battle && !data.battle.moved) { data.battle.moved = true; save(); } },
    // result: 'win' — отметка снимается; 'loss' и 'flee' (сдача; до первого хода — просто уход) — износ 1.
    battleEnd(result, o = {}) {
      const b = data.battle; if (!b) return null;
      data.battle = null;
      const lost = !o.noWear && (result === 'loss' || (result === 'flee' && b.moved));   // o.noWear: бой турнира — свои вещи не участвуют
      const r = lost ? api.wearLoss(1) : (save(), null);
      return r;
    },

    // Лавка. 1.6.5: ассортимент — постоянный каталог по комплектам (см. Screens: shop), случайная витрина `data.shop` больше не показывается и
    // после боя не обновляется; shop()/refreshShop()/removeFromShop() оставлены для старых тестов и инструментов и для чтения старых сохранений.
    shop() { if (!data.shop) { data.shop = makeShop(); save(); } return data.shop; },
    refreshShop() { data.shop = makeShop(); save(); },
    removeFromShop(uid) { if (data.shop) data.shop.stock = data.shop.stock.filter((e) => e.uid !== uid); save(); },
    // Высший цвет вещей, доступный в Лавке сейчас (цвет вашего уровня); раньше он запоминался вместе с витриной при её обновлении после боя.
    shopTop() { return Hero.tierFor(Hero.levelOf(data.xp).level); },
    // 1.6.5: итоговые характеристики героя для заданного снаряжения (так же, как на экране персонажа, без эликсиров): вещи и комплекты, народ, руны, медали.
    // Нужно примерке в Лавке и Кузнице: «было → станет» считается одной и той же формулой.
    totalStats(gear) {
      const lv = Hero.levelOf(data.xp).level;
      return Gear.combine(Gear.combine(Gear.combine(Gear.statsFor(gear, lv), Factions.statsAt(data.faction || 'dwarf', Hero.tierFloat(lv))), Runes.bonusForGear(gear)), api.medalsBonus ? api.medalsBonus() : {});
    },

    // Перенос сохранения: выгрузка в файл и загрузка обратно (например, на другом устройстве или в другом браузере).
    exportSave() { return JSON.stringify(data, null, 2); },
    // json — текст файла сохранения. Возвращает true при успехе, false — если файл не похож на сохранение
    // «Хрупкого мира» (сохранение не трогается). Недостающие поля достраиваются значениями нового профиля.
    importSave(json) {
      let parsed;
      try { parsed = JSON.parse(json); } catch (e) { return false; }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
      if (typeof parsed.coins !== 'number' || !Array.isArray(parsed.items) || typeof parsed.loadout !== 'object') return false;
      parsed = sanitize(parsed);
      const prev = data;
      try { data = migrate(parsed); settle(); }
      catch (e) { data = prev; return false; }        // 1.6.5: файл, который не удалось привести в порядок, не портит текущее сохранение
      save();
      return true;
    },
  };
  return api;
})();

/* ---------- общие кусочки интерфейса ---------- */

// Экранирование текста от игрока (ник) перед вставкой в innerHTML.
const escText = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Цвет уровня для обводок и свечения (у обсидиана — светлый отблеск, чтобы было видно на тёмном).
const tierColor = (t) => Tiers.get(t).edge;

const fmtStat = (k, v) => ({
  power: _t("+{0}% Сила", [v]), health: _t("+{0} Здоровье", [v]), defense: _t("+{0} Броня", [v]), magic: _t("+{0} Магия", [v]),
  initiative: _t("+{0}% Проворство", [v]), ricochet: _t("+{0}% Рикошет", [v]), block: _t("+{0}% Блок", [v]), fury: _t("+{0}% Ярость", [v]),
  cunning: _t("+{0}% Хитрость", [v]),
}[k]);
const fmtBonus = (b) => Object.entries(b).map(([k, v]) => fmtStat(k, v)).join(', ');
const statChips = (stats) => Object.entries(stats).map(([k, v]) => `<span class="chip">${fmtStat(k, v)}</span>`).join('');
// Цвет 1–10 показывается как уровень на единой шкале с героем: цвет N — уровни N·10−9…N·10; существо начинает с низа диапазона и растёт внутри цвета.
const lvl2 = (n) => (n < 10 ? '0' + n : String(n));   // «Ур.01»…«Ур.99»; сотый уровень — единственный трёхзначный (исключение)
const tierChip = (t, grow = 0) => _t("<span class=\"tier-chip\" data-tier=\"{0}\" style=\"--t:{1};--ti:{2}\" title=\"{5}\">Ур.{3} {4}</span>", [t, Tiers.get(t).color, Tiers.get(t).ink, lvl2(t * 10 - 9 + grow), `<span class="tc-name">${Tiers.get(t).name}</span>`, grow > 0 ? _t("Базовый уровень {0}, окреп на {1}", [t * 10 - 9, grow]) : _t("Цвет {0}: силой как герои {1}–{2} уровня", [t, t * 10 - 9, t * 10])]);
// Вещь: «Ур.31 Зелёный» — с какого уровня героя её можно надеть (Hero.itemLevel).
const itemChip = (t) => { const L = Hero.itemLevel(t); return _t("<span class=\"tier-chip\" data-tier=\"{0}\" style=\"--t:{1};--ti:{2}\" title=\"{5}\">Ур.{3} {4}</span>", [t, Tiers.get(t).color, Tiers.get(t).ink, lvl2(L), `<span class="tc-name">${Tiers.get(t).name}</span>`, _t("Надеть можно с {0}-го уровня героя", [L])]); };
// Питомцы и места — просто номер цвета 1–10.
const colorChip = (t) => _t("<span class=\"tier-chip\" data-tier=\"{0}\" style=\"--t:{1};--ti:{2}\" title=\"{5}\">Цвет {3} {4}</span>", [t, Tiers.get(t).color, Tiers.get(t).ink, t, `<span class="tc-name">${Tiers.get(t).name}</span>`, _t("Цвет {0} из 10", [t])]);

// Карточка предмета: иконка со свечением цвета уровня, название, характеристики и произвольная нижняя строка.
// Если у предмета есть uid (это экземпляр игрока/противника, не абстрактный образец из энциклопедии),
// в правом верхнем углу карточки при наведении появляется значок «i» — открывает подробности (см. ItemInfo).
function itemCard(it, foot = '', actions = '', cls = '') {
  const set = it.set ? `<span class="tag" style="--c:${Gear.SETS[it.set].color}">${Gear.SETS[it.set].name}</span>` : '';
  const hands = it.type === 'weapon2' ? _t("<span class=\"tag hand\">2 руки</span>") : it.type === 'weapon1' ? _t("<span class=\"tag hand\">1 рука</span>") : '';
  const runeBadge = (it.runes || []).filter((id) => id && Runes.CATALOG[id])
    .map((id) => Runes.icon(id, 'rune-badge')).join('');
  const info = _t("<span role=\"button\" tabindex=\"0\" class=\"card-info\" data-info-item=\"{0}\" title=\"Карточка предмета\" aria-label=\"Карточка предмета\">i</span>", [it.uid || `base:${it.id}:${it.tier}`]);
  const durTag = it.uid && it.dur < it.maxDur ? `<span class="tag dur ${it.broken ? 'broken' : it.dur / it.maxDur <= 0.1 ? 'low' : ''}">${it.broken ? _t("Сломано") : _t("Прочность {0}/{1}", [it.dur, it.maxDur])}</span>` : '';
  return `<div class="card r-${it.rarity} ${cls}" data-tier="${it.tier}" style="--t:${tierColor(it.tier)}">
    <span class="icon-wrap">${itemIcon(it.type, '', it.id)}${runeBadge}</span>
    <div class="card-body"><span class="item-title">${it.name} ${itemChip(it.tier)} ${set}${hands}${durTag}</span>
      <span class="chips">${statChips(it.stats)}</span>${foot ? `<span class="item-foot">${foot}</span>` : ''}</div>
    ${actions ? `<div class="card-act">${actions}</div>` : ''}${info}</div>`;
}

const resLabel = (kind, tier) => `${Bestiary.RESOURCES[kind].name} · ${Tiers.get(tier).name}`;

/* ---------- всплывающие подробности о предмете (значок «i» на карточке) + вставка рун ---------- */

/* 1.6.0: карточка ресурса — с кого падает, для чего нужен. Открывается из добычи боя, приза билета и ячеек сумки. */
const ResInfo = (() => {
  let pop = null;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function open(kind, tier) {
    const R = Bestiary.RESOURCES[kind]; if (!R) return;
    tier = Number(tier) || 1;
    const known = Profile.species();
    const src = Bestiary.ORDER.filter((id) => Bestiary.MONSTERS[id] && (Bestiary.MONSTERS[id].drops || []).some((d) => d[0] === kind));
    const kn = src.filter((id) => known.includes(id)), unk = src.length - kn.length;
    const from = src.length ? kn.map((id) => esc(Bestiary.MONSTERS[id].name)).join(', ') + (unk ? (kn.length ? ' ' : '') + _t("и ещё не открытые: {0}", [unk]) : '') : _t("только награды и находки");
    const uses = Object.keys(Gear.FORGE_KINDS).filter((t) => Gear.FORGE_KINDS[t].includes(kind)).map((t) => Gear.TYPE_NAMES[t]);
    // 1.6.9: ещё и Алхимик (зелья, эликсиры) и Библиотекарь (свитки) варят из ресурсов — раньше карточка про это молчала
    const nameOf = (k) => (typeof Elixirs !== 'undefined' && Elixirs.KINDS[k]) ? Elixirs.KINDS[k].name : ((Gear.CONSUMABLES[k] || {}).name || k);
    const own = Forge.OWN || {}, scrolls = Forge.SCROLLS || [];
    const alch = Object.keys(own).filter((k) => own[k].includes(kind) && !scrolls.includes(k)).map(nameOf);
    const lib = Object.keys(own).filter((k) => own[k].includes(kind) && scrolls.includes(k)).map(nameOf);
    const parts = [];
    if (uses.length) parts.push(_t("Кузница: улучшение и создание — {0}.", [uses.join(', ').toLowerCase()]));
    if (alch.length) parts.push(_t("Алхимик варит из него: {0}.", [alch.join(', ')]));
    if (lib.length) parts.push(_t("Библиотекарь пишет из него: {0}.", [lib.join(', ')]));
    if (!parts.length) parts.push(_t("Для создания вещей и зелий не нужен."));
    const useTxt = parts.join(' ') + ' ' + _t("Можно продать в Лавке.");
    if (!pop) { pop = document.createElement('div'); pop.className = 'modal-back item-info-back'; pop.addEventListener('click', (e) => { if (e.target === pop || e.target.closest('[data-rc]')) close(); }); document.body.appendChild(pop); }
    pop.innerHTML = `<div class="modal icard-modal res-card" role="dialog" aria-label="${esc(R.name)}" style="--t:${Tiers.get(tier).color};${typeof Art !== 'undefined' && Art.has('ui/parchment') ? `--parch:url('${new URL(Art.url('ui/parchment'), location.href).href}')` : ''}"><div class="loot-card"><span class="lc-ico">${MonsterArt.resIcon(kind, tier)}</span><b>${esc(R.name)} (${esc(Tiers.get(tier).name)})</b>
      <p><span class="hint">${_t("Падает с:")}</span> ${from}</p><p><span class="hint">${_t("Для чего:")}</span> ${useTxt}</p>
      <p><span class="hint">${_t("Цена в Лавке:")}</span> ${MonsterArt.moneyHtml(Bestiary.resPrice(kind, tier))}</p></div>
      <div class="reset"><button type="button" class="primary" data-rc="1">${_t("Закрыть")}</button></div></div>`;
  }
  function close() { if (pop) { pop.remove(); pop = null; } }
  return { open, close };
})();

const ItemInfo = (() => {
  let pop = null, uid = null;

  function findOwner(id) {
    // Предмет может принадлежать игроку или быть снаряжением текущего противника в бою.
    const mine = Profile.item(id);
    if (mine) return { entry: mine, owner: 'left' };
    if (typeof fighters !== 'undefined' && fighters.right && fighters.right.gear) {
      for (const s of Gear.SLOTS) {
        const e = fighters.right.gear[s];
        if (e && typeof e === 'object' && e.uid === id) return { entry: e, owner: 'right' };
      }
    }
    return null;
  }

  // 1.3.2: карточка предмета — развёрнутый свиток пергамента (замысел оформления). Крупный рисунок со свечением цвета уровня, бейджи редкости и уровня, строка типа
  // и набора, требование уровня и фракции, характеристики с пояснением и сравнением с надетой вещью, бонусы набора,
  // руны, цена и действия (в оружейной — надеть / снять). Открывается значком «i» на любой карточке вещи:
  // у вещей игрока и противника — по uid, у образцов Лавки, Кузницы и Библиотеки — по «id:цвет» (base).
  const STAT_HELP = {
    power: _t("к наносимому урону"), health: _t("к максимуму здоровья"), defense: _t("вычитается из каждого удара (потолок 60 очков)"),
    magic: _t("каждые 4 очка — заклинания дешевле на 1 камень"), initiative: _t("шанс ходить первым (потолок 50%)"),
    ricochet: _t("шанс отразить удар в нападающего (потолок 40%)"), block: _t("шанс полностью отбить удар (потолок 50%)"),
    fury: _t("шанс нанести двойной урон (потолок 35%)"), cunning: _t("шанс забрать половину магических камней врага (потолок 30%)"),
  };
  const STAT_SCALE = { power: 30, health: 30, defense: 20, magic: 5, initiative: 15, ricochet: 12, block: 15, fury: 15, cunning: 12 };
  const STAT_ORDER = ['power', 'health', 'defense', 'block', 'initiative', 'magic', 'ricochet', 'fury', 'cunning'];
  const SET_LORE = {
    crown: _t("Знамёна Вольных городов: сталь, позолота и синяя эмаль."), rune: _t("Кованое железо подгорных кланов; руны тлеют, как угли горна."),
    grove: _t("Кора, листья и серебряная нить Лесных домов — лёгкое, как утро."), scale: _t("Панцири, кости и болотный яд племён Чешуи."),
    guard: _t("Тяжёлая броня городской стражи: держать удар и стоять до конца."), berserk: _t("Для тех, кто бьёт первым и не считает ран."),
    mage: _t("Ткань и камни, послушные магии Грани."), wanderer: _t("Дорожное снаряжение: всего понемногу, ничего лишнего."),
    sea: _t("Редкий набор побережья: его носили команды пропавших кораблей."),
  };
  const slotFor = (it) => (it.type === 'weapon1' || it.type === 'weapon2' ? 'main' : it.type === 'shield' ? 'off' : it.type);

  let base = null;     // { id, tier } — образец без хозяина

  function render() {
    if (!pop) return;
    let entry, owner;
    if (base) { entry = { id: base.id, tier: base.tier }; owner = 'none'; }
    else {
      const found = findOwner(uid);
      if (!found) return close();
      ({ entry, owner } = found);
    }
    const it = Gear.item(entry);
    if (!it) return close();
    const mine = owner === 'left';
    const T = Tiers.get(it.tier);
    const setInfo = it.set && Gear.SETS[it.set];
    const worn = mine ? Profile.equippedUid(uid) : owner === 'right' ? Gear.SLOTS.find((s) => fighters.right.gear[s] && fighters.right.gear[s].uid === uid) : null;
    const locked = worn && typeof canEditGear === 'function' && !canEditGear();
    const level = Profile.level ? Profile.level() : 1;
    const fac = Profile.data.faction;
    const lowLv = !Hero.canWear(it.wt, level);
    const alien = it.faction && it.faction !== fac;

    // Сравнение с тем, что сейчас надето на герое в этой ячейке (для вещей не на герое).
    const gear = Profile.gear();
    const slot = worn || slotFor(it);
    const cur = !worn && owner !== 'right' && gear[slot] ? Gear.item(gear[slot]) : null;
    const keys = STAT_ORDER.filter((k) => (it.stats[k] || 0) || (cur && cur.stats[k]));
    const stats = keys.map((k) => {
      const v = it.stats[k] || 0, d = cur ? v - (cur.stats[k] || 0) : 0;
      const delta = cur && d ? `<span class="ic-d ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲ +' : '▼ −'}${Math.abs(d)}</span>` : '';
      const pct = Math.min(100, Math.round(v / STAT_SCALE[k] * 100));
      return `<li class="ic-stat s-${k} ${v ? '' : 'zero'}"><span class="ic-sv">${v ? fmtStat(k, v) : _t("{0}: нет", [Gear.STAT_NAMES[k]])}</span>${delta}
        <i class="ic-bar"><b style="width:${pct}%"></b></i><small>${k === 'defense' && v ? _t("вычитается из каждого удара: −{0} у вашего героя", [Combat.armorAt(v, Hero.dmgMult(Profile.level()))]) : STAT_HELP[k]}</small></li>`;
    }).join('');

    // Набор: сколько надето у героя и какие бонусы горят.
    let setBlock = '';
    if (setInfo) {
      const prog = mine || owner === 'none' ? Gear.setProgress(gear).find((p) => p.id === it.set) : null;
      const have = prog ? prog.count : 0;
      const total = Gear.ITEMS.filter((x) => x.set === it.set).length;
      const rows = Object.entries(setInfo.bonuses).map(([need, b]) => `<li class="${have >= Number(need) ? 'on' : ''}"><b>${need}</b><span>${fmtBonus(b)}</span></li>`).join('');
      setBlock = _t("<section class=\"ic-set\" style=\"--s:{0}\"><h3>Набор «{1}» <span>{2} / {3} надето</span></h3>\n        {4}<ul>{5}</ul></section>", [setInfo.color, setInfo.name, have, total, SET_LORE[it.set] ? `<p class="ic-lore">${SET_LORE[it.set]}</p>` : '', rows]);
    }

    let runeBlock = '';
    if (mine) {
      const sockets = Runes.socketsFor(it);
      const bag = Profile.data.runeBag || {};
      const owned = Runes.ORDER.filter((id) => bag[id] > 0);
      const slots = Array.from({ length: sockets }, (_, k) => {
        const runeId = entry.runes && entry.runes[k];
        const r = runeId && Runes.CATALOG[runeId];
        if (r) return _t("<div class=\"ic-socket full\" style=\"--r:{0}\">{1}<span><b>{2}</b><small>{3}</small></span>\n            <button type=\"button\" data-rune-remove=\"{4}\" {5}>Извлечь</button></div>", [r.color, Runes.icon(runeId, 'rune-badge'), r.name, r.desc, k, locked ? 'disabled' : '']);
        return _t("<div class=\"ic-socket\"><i class=\"ic-hole\"></i><span><b>Гнездо {0} пустое</b>{1}</span></div>", [k + 1, owned.length ? `<small>${owned.map((id) => `<button type="button" class="itembtn-inline" data-rune-insert="${id}" data-rune-slot="${k}" ${locked ? 'disabled' : ''}>${Runes.CATALOG[id].name} × ${bag[id]}</button>`).join(' ')}</small>` : _t("<small>Руны продаются в Мастерской художника.</small>")]);
      }).join('');
      runeBlock = _t("<section class=\"ic-runes\"><h3>Руны · {0}</h3>{1}{2}</section>", [_nn(sockets, 'гнездо', 'гнезда', 'гнёзд'), slots, locked ? _t("<p class=\"hint warn\">Руну можно менять до первого хода боя или после его окончания.</p>") : '']);
    } else if (entry.runes && entry.runes.length) {
      runeBlock = _t("<section class=\"ic-runes\"><h3>Руны</h3>{0}</section>", [entry.runes.filter((id) => Runes.CATALOG[id]).map((id) => `<div class="ic-socket full">${Runes.icon(id, 'rune-badge')}<span><b>${Runes.CATALOG[id].name}</b><small>${Runes.CATALOG[id].desc}</small></span></div>`).join('')]);
    }

    const reqs = [
      _t("<li class=\"{0}\">{1} Уровень героя {2}+</li>", [lowLv ? 'bad' : 'ok', lowLv ? '🔒' : '✓', Hero.itemLevel(it.wt)]),
      it.faction ? _t("<li class=\"{0}\">{1} Только {2} · {3}</li>", [alien ? 'bad' : 'ok', alien ? '✗' : '✓', Factions.get(it.faction).name.toLowerCase(), Factions.get(it.faction).people]) : _t("<li class=\"ok\">✓ Любая фракция</li>"),
      `<li>${it.type === 'weapon2' ? _t("Занимает обе руки") : it.type === 'weapon1' ? _t("Одна рука: правая или левая") : _t("Ячейка: {0}", [Gear.SLOT_NAMES[slotFor(it)]])}</li>`,
    ].join('');

    const inArmory = typeof Inventory !== 'undefined' && Inventory.inArmory;
    let act = '';
    if (mine && inArmory) act = worn
      ? _t("<button type=\"button\" data-ic=\"unequip\" data-slot-name=\"{0}\" {1}>Снять в ячейку хранения</button>", [worn, locked ? 'disabled' : ''])
      : _t("<button type=\"button\" class=\"primary\" data-ic=\"equip\" {0}>Надеть{1}</button>", [lowLv || alien ? 'disabled' : '', cur ? _t(" вместо «{0}»", [cur.name]) : '']);
    const durNote = (mine && it.dur < it.maxDur) ? ` <span class="ic-cmp">${it.broken ? _t("Сломано") : _t("Прочность {0}/{1}", [it.dur, it.maxDur])}</span>` : '';   // 1.6.6
    const status = (worn ? `<span class="ic-worn">${owner === 'right' ? _t("На противнике") : _t("Надето")}: ${Gear.SLOT_NAMES[worn]}</span>`
      : cur ? _t("<span class=\"ic-cmp\">Сравнение с надетым: <b>{0}</b></span>", [cur.name]) : '') + durNote;

    pop.innerHTML = _t("<div class=\"modal icard-modal\" role=\"dialog\" aria-label=\"Карточка предмета: {0}\">\n      <div class=\"scroll\"{1}><i class=\"roll\" aria-hidden=\"true\"></i>\n      <article class=\"icard r-{2}\" data-tier=\"{3}\" style=\"--t:{4};--tc:{5};--s:{6}\">\n        <button type=\"button\" class=\"ic-close\" data-act=\"close\" aria-label=\"Закрыть\">✕</button>\n        <div class=\"ic-head\">\n          <div class=\"ic-art\"><span class=\"ic-rar\">{7}</span>{8}\n            <div class=\"ic-pic\">{9}</div>\n            {10}</div>\n          <div class=\"ic-title\"><h2>{11}</h2>\n            <p class=\"ic-type\">{12}{13}</p>\n            {14}\n            <ul class=\"ic-req\">{15}</ul>\n            <div class=\"ic-nums\"><span><small>Очки снаряжения</small><b>{16}</b></span><span><small>Цена в Лавке</small><b>{17}</b></span><span><small>Продать</small><b>{18}</b></span></div>\n          </div>\n        </div>\n        <div class=\"ic-body\">\n          <section class=\"ic-stats\"><h3>Характеристики</h3><ul>{19}</ul></section>\n          {20}{21}\n        </div>\n        {22}\n      </article><i class=\"roll\" aria-hidden=\"true\"></i></div></div>", [it.name, typeof Art !== 'undefined' && Art.has('ui/parchment') ? ` style="--paper:url('${new URL(Art.url('ui/parchment'), location.href).href}');${cardArtVars()}"` : '', it.rarity, it.tier, tierColor(it.tier), T.color, setInfo ? setInfo.color : Gear.NEUTRAL_COLOR, Gear.RARITY_NAMES[it.rarity], itemChip(it.tier), itemIcon(it.type, '', it.id), it.perk ? _t("<span class=\"ic-perk\">Особый приём</span>") : '', it.name, Gear.TYPE_NAMES[it.type], setInfo ? ` · <b style="color:${setInfo.color}">«${setInfo.name}»</b>` : _t(" · без набора"), status, reqs, it.cost, MonsterArt.moneyHtml(it.price), MonsterArt.moneyHtml(Gear.sellValue(it.price)), stats, setBlock, runeBlock, act ? `<footer class="ic-act">${act}</footer>` : '']);
  }

  function open(id) {
    uid = id; base = null;
    if (typeof id === 'string' && id.startsWith('base:')) { const [, bid, t] = id.split(':'); base = { id: bid, tier: Number(t) || 1 }; uid = null; }
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'modal-back item-info-back';
      pop.addEventListener('click', onClick);
      document.body.appendChild(pop);
    }
    render();
  }
  function close() { if (pop) { pop.remove(); pop = null; } uid = null; }
  function onClick(e) {
    if (e.target === pop) return close();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'close') return close();
    if (b.dataset.ic === 'equip') { const err = Inventory.equipUid(uid); if (err) { b.textContent = err; b.disabled = true; return; } return render(); }
    if (b.dataset.ic === 'unequip') { Inventory.unequipSlot(b.dataset.slotName); return render(); }
    if (b.dataset.runeInsert) {
      const entry = Profile.item(uid);
      if (!entry) return;
      const bag = Profile.data.runeBag || (Profile.data.runeBag = {});
      const id = b.dataset.runeInsert, slot = Number(b.dataset.runeSlot) || 0;
      if (!(bag[id] > 0)) return;
      const prev = entry.runes && entry.runes[slot];
      if (prev && Runes.CATALOG[prev]) { bag[prev] = (bag[prev] || 0) + 1; }   // старая руна в этом гнезде — обратно в запас
      Runes.insert(entry, id, slot);
      bag[id]--;
      if (!bag[id]) delete bag[id];
      Profile.save();
      if (typeof onGearChanged === 'function') onGearChanged();
      return render();
    }
    if (b.dataset.runeRemove !== undefined) {
      const entry = Profile.item(uid);
      const slot = Number(b.dataset.runeRemove) || 0;
      const runeId = entry && entry.runes && entry.runes[slot];
      if (!runeId) return;
      const bag = Profile.data.runeBag || (Profile.data.runeBag = {});
      bag[runeId] = (bag[runeId] || 0) + 1;
      Runes.remove(entry, slot);
      Profile.save();
      if (typeof onGearChanged === 'function') onGearChanged();
      return render();
    }
  }
  return { open, close };
})();

// Значок «i» на карточке открывает подробности, не задевая клик по самой карточке/кнопке вокруг неё
// (карточки часто вложены в свою собственную кнопку выбора — см. itembtn в Inventory/Screens), поэтому
// слушаем клик на фазе погружения (capture) и останавливаем его раньше, чем он дойдёт до внешней кнопки.
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.card-info');
    if (!b) return;
    e.stopPropagation();
    e.preventDefault();
    ItemInfo.open(b.dataset.infoItem);
  }, true);
  // значок — <span role="button"> (кнопка внутри кнопки ломает разметку окон), поэтому Enter/пробел вручную
  document.addEventListener('keydown', (e) => {
    const b = e.target.closest && e.target.closest('.card-info');
    if (!b || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault(); e.stopPropagation();
    ItemInfo.open(b.dataset.infoItem);
  }, true);
}

/* ---------- окно «Ранец и экипировка» ---------- */

const Inventory = (() => {
  let root = null;
  let tab = 'left';          // чьё снаряжение смотрим: 'left' (игрок) или 'right' (противник)
  let sel = 'main';          // выбранная ячейка
  let toast = '';
  let resetArmed = false;
  // 1.3.0: armory — окно открыто в Вашем доме (оружейная: сундук с вещами, кладовая, смена снаряжения);
  // иначе это сумка в дороге: только эликсиры, расходники и боеприпасы, снаряжение посмотреть, но не сменить.
  let armory = false;
  let bagTab = 'elix';       // 1.5.7: подвкладки сумки: elix (эликсиры) | res (ресурсы)
  let invTab = 'hero';       // вкладки окна на телефоне: hero | gear | pack (на широком экране показано всё сразу)

  function open(which = 'left', opts = {}) {
    armory = !!opts.armory;
    tab = which;
    sel = which === 'left' ? null : 'main'; invTab = 'hero';
    pick = null;
    toast = '';
    resetArmed = false;
    if (!root) {
      root = document.createElement('div');
      root.className = 'modal-back';
      root.addEventListener('click', onClick);
      document.body.appendChild(root);
      document.addEventListener('keydown', onKey);
      ModalFocus.open(root);
    }
    render();
  }

  function close() {
    statBase = null;                                  // 1.8.4: подсветка изменений живёт, пока открыта карточка героя
    if (root) { ModalFocus.close(root); root.remove(); root = null; }
    document.removeEventListener('keydown', onKey);
  }
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  let statBase = null;       // характеристики героя на момент открытия карточки (для зелёного/красного)
  // 1.6.0: рядом с каждой характеристикой — во что она превращается на деле (числа для героя этого уровня; who — боец-противник)
  function statsBlock(stats, who) {
    // У каждого заклинания своя цена (Balance.magic.costs) — показываем диапазон мин..макс по всем пяти.
    const costs = Object.keys(Balance.magic.costs).map((k) => Combat.spellCost({ stats, buffs: [] }, k));
    const lo = Math.min(...costs), hi = Math.max(...costs);
    const costLabel = lo === hi ? `${lo}` : `${lo}–${hi}`;
    const dmg = who ? who.dmg : Hero.dmgMult(Profile.level()), base = who ? who.base : Hero.baseHp(Profile.level());
    const stone = dmg * Balance.damage.stone, N = Gear.STAT_NAMES;
    const nth = (p) => Math.max(1, Math.round(100 / p));
    const fmt1 = (x) => (x >= 10 ? String(Math.round(x)) : String(Math.round(x * 10) / 10).replace('.', I18N.lang === 'en' ? '.' : ','));
    // 1.8.4: что изменилось с момента открытия карточки — плюс зелёным, минус красным (пока карточка не закрыта)
    if (!who && !statBase) statBase = { ...stats };
    const delta = (k) => (who || !statBase) ? 0 : (stats[k] || 0) - (statBase[k] || 0);
    const row = (name, big, small, k) => { const d = k ? delta(k) : 0; const cls = d > 0 ? ' class="stat-up"' : d < 0 ? ' class="stat-down"' : ''; return `<div><span>${name}</span><b${cls}>${big}${d ? ` <i>(${d > 0 ? '+' : '−'}${Math.abs(d)})</i>` : ''}</b><small>${small}</small></div>`; };
    const arm = Combat.armorAt(stats.defense, dmg), cap = stats.defense >= Gear.CAPS.defense ? _t(" (максимум)") : '';
    return `<div class="stat-list">${[
      row(N.power, `+${stats.power}%`, _t("урон камня: {0} → {1}", [fmt1(stone), fmt1(stone * (1 + stats.power / 100))]), 'power'),
      row(N.health, `+${stats.health}`, _t("ХП всего: {0} (без вещей {1})", [base + stats.health, base]), 'health'),
      row(N.defense, `−${arm}`, _t("вычитается из каждого удара ({0} очк.{1}); не меньше 20% удара", [stats.defense, cap]), 'defense'),
      row(N.magic, `${stats.magic}`, _t("цена заклинаний: {0} камней каждого вида", [costLabel]), 'magic'),
      row(N.initiative, `+${stats.initiative}%`, _t("шанс первого хода"), 'initiative'),
      row(N.ricochet, `${stats.ricochet}%`, stats.ricochet > 0 ? _t("≈ каждый {0}-й удар по вам отлетает в нападающего", [nth(stats.ricochet)]) : _t("удар по вам отлетает в нападающего: пока нет"), 'ricochet'),
      row(N.block, `${stats.block}%`, stats.block > 0 ? _t("≈ каждый {0}-й удар по вам блокируется полностью", [nth(stats.block)]) : _t("полный блок удара: пока нет"), 'block'),
      row(N.fury, `${stats.fury}%`, stats.fury > 0 ? _t("≈ каждый {0}-й ваш удар двойной", [nth(stats.fury)]) : _t("двойной урон: пока нет"), 'fury'),
      row(N.cunning, `${stats.cunning || 0}%`, stats.cunning > 0 ? _t("≈ раз в {0} отнимает половину магических камней противника", [_nn(nth(stats.cunning), 'ход', 'хода', 'ходов')]) : _t("кража магических камней противника: пока нет"), 'cunning'),
    ].join('')}</div>`;
  }

  // Уровень, опыт, ХП и урон героя.
  function heroLine(lv, stats) {
    const pct = lv.need === Infinity ? 100 : Math.round(lv.into / lv.need * 100);
    return _t("<div class=\"hero-level\"><b>Уровень {0}</b><span>{1}</span>\n      <div class=\"xpbar\"><i style=\"width:{2}%\"></i></div>\n      <small>ХП {3} · урон камня ×{4} · вещи до цвета «{5}»</small></div>", [lv.level, lv.need === Infinity ? _t("максимальный") : _t("опыт {0} / {1}", [lv.into, lv.need]), pct, Hero.baseHp(lv.level) + stats.health, Hero.dmgMult(lv.level), Tiers.get(Hero.tierFor(lv.level)).name]);
  }

  function render() {
    if (!root) return;
    if (tab === 'left') return renderMine();
    renderEnemy();
  }

  function renderEnemy() {
    const mine = tab === 'left';
    const monsterId = fighters.right.monsterId;
    const dragon = monsterId === 'dragon';
    const showGear = mine || dragon;           // у остальных существ снаряжения нет
    const gear = mine ? Profile.gear() : fighters.right.gear;
    const fac = Factions.get(Profile.data.faction) || Factions.get('dwarf');
    const lv = Profile.levelInfo();
    const stats = mine ? Gear.combine(Gear.combine(Gear.statsFor(gear, lv.level), Factions.statsAt(Profile.data.faction || 'dwarf', Hero.tierFloat(lv.level))), Runes.bonusForGear(gear)) : fighters.right.stats;
    const used = Gear.totalCost(gear);
    const budget = mine ? Profile.budget() : fighters.right.gearBudget;
    const editable = mine && canEditGear();
    const mainItem = Gear.item(gear.main);
    const twoHand = mainItem && mainItem.type === 'weapon2';

    const slots = Gear.SLOTS.map((s) => {
      const it = Gear.item(gear[s]);
      const blocked = s === 'off' && twoHand;
      return `<button type="button" class="slot ${sel === s ? 'sel' : ''} ${it ? 'filled' : ''}" data-slot="${s}"
          ${it ? `style="--c:${tierColor(it.tier)}"` : ''}>
        ${it ? itemIcon(it.type, '', it.id) : slotIcon(s)}
        <span class="slot-name">${Gear.SLOT_NAMES[s]}</span>
        <span class="slot-item">${it ? it.name : blocked ? _t("Занято двуручным") : _t("Пусто")}</span></button>`;
    }).join('');

    let list = '';
    if (mine) {
      const own = Profile.data.items.filter((e) => Gear.fits(sel, Gear.item(e).type))
        .map((e) => Gear.item(e))
        .sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name));
      list = own.map((it) => {
        const worn = Profile.equippedUid(it.uid);
        const on = Profile.data.loadout[sel] === it.uid;
        const alien = it.faction && it.faction !== Profile.data.faction;
        const low = !Hero.canWear(it.wt, lv.level);
        const foot = _t("{0} · {1} оч.{2}{3}{4}", [Gear.RARITY_NAMES[it.rarity], it.cost, worn && !on ? _t(" · надет: {0}", [Gear.SLOT_NAMES[worn]]) : '', alien ? _t(" · только для фракции «{0}»", [Factions.get(it.faction).name]) : '', low ? _t(" · <b class=\"warn\">с {0}-го уровня</b>", [Hero.itemLevel(it.tier)]) : '']);
        return `<button type="button" class="itembtn ${on ? 'on' : ''}" data-item="${it.uid}" ${editable ? '' : 'disabled'}>${itemCard(it, foot)}</button>`;
      }).join('') || _t("<p class=\"hint\">Нет подходящих вещей. Их можно купить в Лавке, создать в Кузнице или получить после боя.</p>");
    }

    const sets = Gear.setProgress(gear).map((p) => _t("\n      <div class=\"set\" style=\"--c:{0}\"><b>Набор «{1}» {2}/{3}</b>\n        {4}\n        {5}\n      </div>", [p.color, p.name, p.count, p.total, p.active.map((a) => _t("<div class=\"on\">{0} шт.: {1}</div>", [a.need, fmtBonus(a.bonus)])).join(''), p.next.slice(0, 1).map((a) => _t("<div class=\"off\">ещё до {0} шт.: {1}</div>", [a.need, fmtBonus(a.bonus)])).join('')])).join('') || _t("<p class=\"hint\">Наборов нет: собирайте предметы одного набора — они усиливают друг друга.</p>");

    const bag = mine ? Profile.data.backpack : fighters.right.bag;
    const bagHtml = Object.entries(Gear.CONSUMABLES).map(([k, c]) => `
      <div class="bag-row">${itemIcon(k)}<span><b>${c.name}</b> × ${bag[k] || 0}<br><small>${c.desc}</small></span></div>`).join('');
    const resHtml = mine ? (Profile.resList().map((r) => `<div class="bag-row">${MonsterArt.resIcon(r.kind, r.tier)}<span><b>${resLabel(r.kind, r.tier)}</b> × ${r.n}</span></div>`).join('') || _t("<p class=\"hint\">Ресурсов пока нет: они выпадают из монстров.</p>")) : '';

    const pct = budget ? Math.min(100, Math.round(used / budget * 100)) : 0;
    const enemyName = (Bestiary.MONSTERS[monsterId] || {}).name || fighters.right.name || '—';   // у Бобра-учителя записи в бестиарии нет
    let left = '';
    if (dragon && !mine && typeof Art !== 'undefined' && Art.has('monsters/dragon-body')) left = `<div class="figure-box"><img class="dragon-pic" src="${Art.url('monsters/dragon-body')}" alt=""></div>`;   // 1.7.6: портрет дракона целиком
    else if (dragon || mine) left = `<div class="figure-box">${Figures.figure(mine ? Factions.heroKind(Profile.data.faction || 'dwarf', Profile.data.gender) : 'dragon', gear)}</div>`;
    else left = `<div class="figure-box monster-box">${MonsterArt.bust(monsterId, fighters.right.tier)}</div>`;

    root.innerHTML = _t("\n      <div class=\"modal\" role=\"dialog\" aria-label=\"Ранец и экипировка\">\n        <header>\n          <h2>Ранец и экипировка</h2>\n          <span class=\"wallet-head\">{0}</span>\n          {1}\n          <button type=\"button\" class=\"close\" data-act=\"close\">Закрыть</button>\n        </header>\n        <div class=\"tabs\">\n          <button type=\"button\" class=\"{2}\" data-tab=\"left\">{3}</button>\n          <button type=\"button\" class=\"{4}\" data-tab=\"right\">Противник: {5}</button>\n        </div>\n        <div class=\"gear-layout\">\n          <section class=\"gear-left\">\n            {6}\n            {7}\n            {8}\n          </section>\n          <section class=\"gear-right\">\n            {9}\n            {10}\n            {11}\n            <div class=\"gear-toast\">{12}</div>\n            {13}\n            {14}\n            <h3>Ранец</h3>{15}\n            {16}\n            {17}\n          </section>\n        </div>\n      </div>", [MonsterArt.moneyHtml(Profile.data.coins), mine ? _t("<button type=\"button\" class=\"valor-link\" data-act=\"valor\">Стена доблести</button>") : '', mine ? 'on' : '', Profile.data.name ? escText(Profile.data.name) : fac.name + ': ' + Factions.heroTitle(Profile.data.faction || 'dwarf', Profile.data.gender), mine ? '' : 'on', enemyName, left, mine ? heroLine(lv, stats) : '', statsBlock(stats, mine ? undefined : fighters.right), showGear ? _t("<div class=\"budget\"><div class=\"budget-bar\"><i style=\"width:{0}%\" class=\"{1}\"></i></div>\n              <span>Очки снаряжения: <b>{2}</b> / {3}{4}</span></div>", [pct, used > budget ? 'over' : '', used, budget, mine ? _t(" (растут с уровнем)") : '']) : '', mine && !editable ? _t("<p class=\"hint warn\">Менять снаряжение можно до первого хода боя или после его окончания.</p>") : '', showGear ? `<div class="slots">${slots}</div>` : _t("<p class=\"hint\">{0}<br>У этого существа нет снаряжения — только врождённые способности (слева).</p>", [((Bestiary.MONSTERS[monsterId] || {}).desc || '')]), toast, mine ? _t("<h3>{0}: ваши вещи</h3><div class=\"item-list\">{1}</div>", [Gear.SLOT_NAMES[sel], list]) : '', showGear ? _t("<h3>Наборы</h3>{0}", [sets]) : '', bagHtml, mine ? _t("<h3>Ресурсы</h3>{0}", [resHtml]) : '', mine ? `<div class="reset"><button type="button" data-act="reset">${resetArmed ? _t("Точно сбросить? Нажмите ещё раз") : _t("Сбросить весь прогресс")}</button></div>` : '']);
  }


  /* ---------- «Мой дом»: герой в полный рост, вокруг надетые вещи; справа — сумка ---------- */
  // Ячейки вокруг фигуры: слева голова/грудь/наручи, справа амулет/поножи, внизу — правая рука, спец. снаряд
  // (пока в разработке, пустой) и левая рука. Двуручное оружие занимает обе руки.
  let pick = null;            // uid выбранной вещи в сумке
  function dollSlot(gear, s, editable) {
    const it = Gear.item(gear[s]);
    const main = Gear.item(gear.main);
    const twoHand = s === 'off' && main && main.type === 'weapon2';
    const shown = twoHand ? main : it;
    const name = shown ? shown.name : _t("Пусто");
    // 1.3.6: в ячейке только рисунок вещи по центру; название — всплывающая подсказка; уровень — свечением цвета
    return `<button type="button" class="dslot ${sel === s ? 'sel' : ''} ${shown ? 'filled' : ''} ${twoHand ? 'twohand' : ''}" data-slot="${s}"
        ${shown ? `style="--c:${tierColor(shown.tier)}"` : ''} aria-label="${Gear.SLOT_NAMES[s]}: ${name}"
        title="${Gear.SLOT_NAMES[s]}: ${name}${shown ? ` · ${Tiers.get(shown.tier).name}` : ''}${twoHand ? _t(" (двуручное — занимает обе руки)") : ''}">
      ${shown ? itemIcon(shown.type, '', shown.id) : slotIcon(s)}</button>`;
  }
  // Куда надевать вещь: двуручное — в правую руку; одноручное — в выбранную руку, иначе в свободную; щит — в левую.
  function targetSlot(gear, it, auto = false) {
    if (it.type === 'weapon2') return 'main';
    if (it.type === 'shield') return 'off';
    if (it.type === 'weapon1') {
      if (!auto && (sel === 'main' || sel === 'off')) return sel;
      const main = Gear.item(gear.main);
      if (!gear.main) return 'main';
      if (!gear.off && !(main && main.type === 'weapon2')) return 'off';
      return 'main';
    }
    return it.type;
  }
  /* 1.3.1: ячейки хранения оружейной. Profile.data.stash — массив uid по ячейкам (null — пусто); снятая вещь
     встаёт в первую свободную ячейку, надетая освобождает свою. Вещь без места (добыча, покупка) — тоже в первую свободную. */
  const STASH_MIN = 30, STASH_ROW = 6, STASH_MAX_ROWS = 10;
  // 1.3.2: ячейки можно докупать рядами по 6 (Profile.data.stashRows — сколько рядов куплено). Цена растёт с каждым рядом.
  const stashCap = () => STASH_MIN + STASH_ROW * (Profile.data.stashRows || 0);
  const rowPrice = (k = Profile.data.stashRows || 0) => 300 + 300 * k + 100 * k * k;
  function stashLayout() {
    const d = Profile.data;
    const loose = new Set(d.items.filter((e) => !Profile.equippedUid(e.uid)).map((e) => e.uid));
    let st = Array.isArray(d.stash) ? d.stash.map((u) => (u && loose.has(u) ? u : null)) : [];
    const placed = new Set(st.filter(Boolean));
    for (const u of loose) if (!placed.has(u)) { const k = st.indexOf(null); if (k >= 0) st[k] = u; else st.push(u); }
    // Ячеек столько, сколько куплено; если вещей больше (добыча при полном сундуке) — лишние лежат «сверх места»,
    // ничего не пропадает, но окно просит докупить ячейки или продать лишнее.
    while (st.length > stashCap() && st[st.length - 1] === null) st.pop();
    while (st.length < stashCap()) st.push(null);
    d.stash = st;
    return st;
  }
  // Снять вещь из ячейки героя в сундук (в первую свободную ячейку хранения).
  function toStash(slot) {
    const uid = Profile.data.loadout[slot];
    if (!uid) return false;
    Profile.data.loadout[slot] = null;
    const st = stashLayout();
    if (!st.includes(uid)) { const k = st.indexOf(null); if (k >= 0) st[k] = uid; else st.push(uid); }
    Profile.save();
    return true;
  }
  // Надеть вещь из ячейки хранения k: место выбирается само; снятая взамен вещь встаёт на её место в сундуке.
  function fromStash(k) {
    const st = stashLayout(), uid = st[k], entry = uid && Profile.item(uid);
    if (!entry) return _t("Ячейка пуста");
    const gear = Profile.gear(), it = Gear.item(entry), slot = targetSlot(gear, it, true);
    const check = Gear.canEquip(gear, entry, slot, Profile.data.faction, Profile.level());
    if (!check.ok) return check.reason;
    const next = Gear.equip(gear, entry, slot);
    if (Gear.totalCost(next) > Profile.budget()) return _t("Не хватает очков снаряжения: нужно {0}, лимит {1}", [Gear.totalCost(next), Profile.budget()]);
    const load = Profile.data.loadout, prev = load[slot], prevOff = (slot === 'main' && it.type === 'weapon2') ? load.off : null;
    load[slot] = uid;
    if (gear.off && !next.off) load.off = null;
    st[k] = prev || null;                               // снятая вещь — на место надетой
    if (prevOff && prevOff !== prev) { const j = st.indexOf(null); if (j >= 0) st[j] = prevOff; else st.push(prevOff); }
    Profile.save();
    return null;
  }

  function renderMine() {
    const gear = Profile.gear();
    const lv = Profile.levelInfo();
    const stats0 = Gear.combine(Gear.combine(Gear.combine(Gear.statsFor(gear, lv.level), Factions.statsAt(Profile.data.faction || 'dwarf', Hero.tierFloat(lv.level))), Runes.bonusForGear(gear)), Profile.medalsBonus ? Profile.medalsBonus() : {});
    const stats = Gear.combine(stats0, (typeof inBattle !== 'undefined' && inBattle && fighters.left.elx) ? Elixirs.bonusStats(fighters.left.elx) : {});   // эликсиры, выпитые в этом бою
    const used = Gear.totalCost(gear), budget = Profile.budget();
    const editable = armory && canEditGear();
    const fac = Factions.get(Profile.data.faction) || Factions.get('dwarf');
    const pct = budget ? Math.min(100, Math.round(used / budget * 100)) : 0;
    const ak = Profile.shotKind(), AM = Ammo.CATALOG[ak], an = Profile.ammo(ak);

    const heroName = (typeof Profile.data.name === 'string' && Profile.data.name && escText(Profile.heroName())) || Factions.heroTitle(Profile.data.faction || 'dwarf', Profile.data.gender);
    const doll = _t("<div class=\"doll\">\n      <div class=\"df-cap\"><b>{0}</b><span>Уровень {1} · очки снаряжения {2} / {3}</span></div>\n      <div class=\"doll-frame{4}\">\n        <div class=\"df-col l\">{5}</div>\n        <div class=\"doll-fig\">{6}</div>\n        <div class=\"df-col r\">{7}</div>\n        <div class=\"df-hands\">{8}\n          {9}\n          {10}</div>\n      </div>\n    </div>", [heroName + Profile.favBadges(), lv.level, used, budget, typeof Art !== 'undefined' && Art.has('ui/hero-panel-5') ? ' p5' : '', ['head', 'shoulders', 'chest', 'arms', 'leash'].map((s) => dollSlot(gear, s, editable)).join(''), Figures.figure(Factions.heroKind(Profile.data.faction || 'dwarf', Profile.data.gender), gear), ['amulet', 'gloves', 'legs', 'bag', 'compass'].map((s) => dollSlot(gear, s, editable)).join(''), dollSlot(gear, 'main', editable), dollSlot(gear, 'ranged', editable).replace('</button>', `<b class="ammo-n" title="${AM.name} × ${an}">${an}</b></button>`), dollSlot(gear, 'off', editable) + dollSlot(gear, 'belt', editable).replace('class="dslot ', 'class="dslot beltslot ')]);

    // Подробности: выбранная вещь из сумки (надеть) или надетая в выбранной ячейке (снять).
    let detail = '';
    const pickEntry = pick && Profile.item(pick);
    if (false && pickEntry && !Profile.equippedUid(pick)) {
      const it = Gear.item(pickEntry);
      const slot = targetSlot(gear, it);
      const check = Gear.canEquip(gear, pickEntry, slot, Profile.data.faction, lv.level);
      const next = check.ok ? Gear.equip(gear, pickEntry, slot) : gear;
      const over = check.ok && Gear.totalCost(next) > budget;
      const why = !check.ok ? check.reason : over ? _t("Не хватает очков снаряжения: нужно {0}, лимит {1}", [Gear.totalCost(next), budget]) : '';
      detail = _t("<div class=\"pick-detail\">{0}\n        <div class=\"pick-act\">{1}\n          <button type=\"button\" class=\"primary\" data-equip=\"{2}\" data-to=\"{3}\" {4}>Надеть</button>\n          <button type=\"button\" data-act=\"unpick\">Отмена</button></div></div>", [itemCard(it, _t("{0} · {1} · {2} оч. · место: {3}", [Gear.RARITY_NAMES[it.rarity], Gear.TYPE_NAMES[it.type], it.cost, Gear.SLOT_NAMES[slot]])), why ? `<p class="hint warn">${why}</p>` : '', pick, slot, why || !editable ? 'disabled' : '']);
    } else if (sel && gear[sel] && Gear.item(gear[sel])) {
      const it = Gear.item(gear[sel]);
      detail = `<div class="pick-detail">${itemCard(it, _t("Надето: {0} · {1} оч.", [Gear.SLOT_NAMES[sel], it.cost]))}
        <div class="pick-act">${armory ? _t("<button type=\"button\" data-unequip=\"{0}\" {1}>Снять в сундук</button>", [sel, editable ? '' : 'disabled']) : _t("<p class=\"hint\">Снять или сменить — в оружейной Вашего дома.</p>")}</div></div>`;
    }

    const stash = stashLayout();
    const tiles = stash.map((uid, k) => {
      const e = uid && Profile.item(uid), it = e && Gear.item(e);
      const over = k >= stashCap() ? ' over' : '';
      if (!it) return `<div class="stash-cell empty${over}" aria-hidden="true"></div>`;
      const low = !Hero.canWear(it.wt, lv.level);
      const alien = it.faction && it.faction !== Profile.data.faction;
      return _t("<button type=\"button\" class=\"stash-cell btile{0} {1}\" data-stash=\"{2}\" style=\"--c:{3}\"\n          title=\"{4} · {5} · {6} · {7} оч.{8}{9} — нажмите, чтобы надеть\">\n        {10}{11}</button>", [over, low || alien ? 'nofit' : '', k, tierColor(it.tier), it.name, Tiers.get(it.tier).name, Gear.TYPE_NAMES[it.type], it.cost, low ? _t(" · с {0}-го уровня", [Hero.itemLevel(it.tier)]) : '', alien ? _t(" · чужая фракция") : '', itemIcon(it.type, '', it.id), low ? '<b class="lock">🔒</b>' : '']);
    }).join('');

    const bag = Profile.data.backpack || {};
    const ammoRow = _t("<div class=\"bag-row\">{0}<span><b>{1}</b> × {2}<br><small>{3} Выстрел хода не тратит, один за ход.</small></span></div>", [Ammo.icon(ak), AM.name, an, AM.desc]);
    const cons = Object.entries(Gear.CONSUMABLES).filter(([k]) => bag[k] > 0)
      .map(([k, c]) => `<div class="bag-row">${itemIcon(k)}<span><b>${c.name}</b> × ${bag[k]}<br><small>${c.desc}</small></span></div>`).join('')
      || _t("<p class=\"hint\">Эликсиров и расходников нет.</p>");
    const exAct = (typeof inBattle !== 'undefined' && inBattle && fighters.left.elx) || {};
    const exActive = Object.entries(exAct).filter(([, a]) => a && a.left > 0)
      .map(([k, a]) => _t("<div class=\"bag-row\">{0}<span><b>{1}</b> · ещё {2}<br><small>{3}</small></span></div>", [Elixirs.icon(k, a.tier), Elixirs.KINDS[k].name, _nn(a.left, 'ход', 'хода', 'ходов'), Elixirs.describe(k, a.tier)])).join('');
    // 1.6.0: эликсир пьётся только в бою (до первого хода); на карте — лишь те, у кого прямо указано KINDS[вид].mapOk
    const canDrink = (kind, tier) => (typeof inBattle !== 'undefined' && inBattle && typeof elxWhy === 'function' && !elxWhy(kind, tier));
    const exBag = Profile.elixirBag().map((e) => _t("<div class=\"bag-row\">{0}<span><b>{1}</b> · цвет «{2}» × {3}<br><small>{4}</small></span>\n      <button type=\"button\" data-drink=\"{5}:{6}\" {7}>Выпить</button></div>", [Elixirs.icon(e.kind, e.tier), Elixirs.KINDS[e.kind].name, Tiers.get(e.tier).name, e.n, Elixirs.describe(e.kind, e.tier), e.kind, e.tier, canDrink(e.kind, e.tier) ? '' : 'disabled'])).join('');
    const runeBag = Profile.data.runeBag || {};
    const runes = (typeof Runes !== 'undefined' ? Runes.ORDER : []).filter((id) => runeBag[id] > 0)
      .map((id) => `<div class="bag-row">${Runes.icon(id, 'rune-dot')}<span><b>${Runes.CATALOG[id].name}</b> × ${runeBag[id]}<br><small>${Runes.CATALOG[id].desc}</small></span></div>`).join('');
    const res = Profile.resList().map((r) => `<div class="bag-row" data-bkey="r:${r.kind}:${r.tier}">${MonsterArt.resIcon(r.kind, r.tier)}<span><b>${resLabel(r.kind, r.tier)}</b> × ${r.n}</span></div>`).join('')
      || _t("<p class=\"hint\">Ресурсов пока нет: они выпадают из монстров.</p>");
    // 1.5.7: сумка — две подвкладки с ячейками (эликсиры и расходники / ресурсы); под ячейками — список с описаниями
    const inB = typeof inBattle !== 'undefined' && inBattle;
    const tabsBattle = inB ? `<div class="tabs"><button type="button" class="on" data-tab="left">${Profile.data.name ? escText(Profile.data.name) : fac.name + ': ' + Factions.heroTitle(Profile.data.faction || 'dwarf', Profile.data.gender)}</button>${_t("<button type=\"button\" data-tab=\"right\">Противник: {0}</button>", [Bestiary.MONSTERS[fighters.right.monsterId] ? Bestiary.MONSTERS[fighters.right.monsterId].name : '—'])}</div>` : '';
    const BAG_ROW = 6, BAG_MIN = 12;
    const bagGrid = (cells) => {
      const total = Math.max(BAG_MIN, Math.ceil(cells.length / BAG_ROW) * BAG_ROW);
      let h = '';
      for (let i = 0; i < total; i++) {
        const c = cells[i];
        h += c ? `<button type="button" class="stash-cell btile bag-cell" data-bcell="${c.key}" style="--c:${c.color}" title="${c.title}">${c.icon}<b class="bc-n">${c.n}</b></button>` : '<div class="stash-cell empty" aria-hidden="true"></div>';
      }
      return `<div class="stash-grid bag-grid">${h}</div>`;
    };
    const elixCells = [
      ...Profile.elixirBag().map((e) => ({ key: `${e.kind}:${e.tier}`, icon: Elixirs.icon(e.kind, e.tier), n: e.n, color: tierColor(e.tier), title: _t("{0} · цвет «{1}» × {2}", [Elixirs.KINDS[e.kind].name, Tiers.get(e.tier).name, e.n]) })),
      ...Object.entries(Gear.CONSUMABLES).filter(([k]) => bag[k] > 0).map(([k, c]) => ({ key: 'c:' + k, icon: itemIcon(k), n: bag[k], color: '#c9b48a', title: `${c.name} × ${bag[k]}` })),
    ];
    const resCells = Profile.resList().map((r) => ({ key: `r:${r.kind}:${r.tier}`, icon: MonsterArt.resIcon(r.kind, r.tier), n: r.n, color: tierColor(r.tier), title: `${resLabel(r.kind, r.tier)} × ${r.n}` }));
    const bagTabsHtml = `<div class="tabs bag-tabs">${[['elix', _t("Эликсиры")], ['res', _t("Ресурсы")]].map(([k, l]) => `<button type="button" class="${bagTab === k ? 'on' : ''}" data-btab="${k}">${l}</button>`).join('')}</div>`;
    const paneElix = `<div class="bp-pane" data-p="elix">${exActive ? _t("<h3>Действуют эликсиры</h3>") + exActive : ''}${bagGrid(elixCells)}${exBag ? _t("<h3>Сумка: эликсиры (варит Тётушка Жабка)</h3>") + exBag : ''}${_t("<h3>Сумка: расходники</h3>")}${cons}${_t("<h3>Сумка: боеприпасы</h3>")}${ammoRow}${keyItemsHtml()}</div>`;
    const paneRes = `<div class="bp-pane" data-p="res">${bagGrid(resCells)}${_t("<h3>Список ресурсов</h3>{0}", [res])}${armory && runes ? _t("<h3>Кладовая: руны</h3>{0}", [runes]) : ''}</div>`;
    const sets = Gear.setProgress(gear).map((p) => _t("\n      <div class=\"set\" style=\"--c:{0}\"><b>Набор «{1}» {2}/{3}</b>\n        {4}\n        {5}\n      </div>", [p.color, p.name, p.count, p.total, p.active.map((a) => _t("<div class=\"on\">{0} шт.: {1}</div>", [a.need, fmtBonus(a.bonus)])).join(''), p.next.slice(0, 1).map((a) => _t("<div class=\"off\">ещё до {0} шт.: {1}</div>", [a.need, fmtBonus(a.bonus)])).join('')])).join('') || _t("<p class=\"hint\">Наборов нет: собирайте предметы одного набора — они усиливают друг друга.</p>");

    root.innerHTML = _t("\n      <div class=\"modal home-modal{0}\" role=\"dialog\" aria-label=\"Ранец и экипировка\" style=\"{1}\">\n        <header>\n          <h2>{2}</h2>\n          <span class=\"wallet-head\">{3}</span>\n          <button type=\"button\" class=\"valor-link\" data-act=\"valor\">Стена доблести</button>\n          <button type=\"button\" class=\"close\" data-act=\"close\">Закрыть</button>\n        </header>\n        {4}{5}\n        <div class=\"tabs inv-tabs\">{6}</div>\n        <div class=\"gear-toast toast-phone\">{7}</div>\n        <div class=\"home-layout\" data-itab=\"{8}\" data-arm=\"{9}\">\n          <section class=\"home-hero\">\n            {10}\n            {11}\n            <div class=\"budget\"><div class=\"budget-bar\"><i style=\"width:{12}%\" class=\"{13}\"></i></div>\n              <span>Очки снаряжения: <b>{14}</b> / {15} (растут с уровнем)</span></div>\n          </section>\n          <section class=\"home-stats\">\n            {16}\n            {17}\n            <h3>Наборы</h3>{18}\n          </section>\n          <section class=\"home-bag\">\n            <div class=\"gear-toast toast-desk\">{19}</div>\n            <div class=\"bag-gear\">\n            {20}\n {21}\n            </div>\n            <div class=\"bag-pack\" data-btab=\"{22}\">\n            {23}\n            {24}\n            {25}\n            <h3>Деньги</h3><div class=\"bag-row money-row\">{26}</div>\n            {27}\n          </div>\n          </section>\n        </div>\n      </div>", [armory && typeof Art !== 'undefined' && Art.hasScene('home') ? ' has-scene' : '', typeof Art !== 'undefined' ? artVar('scene', 'ui/bg-home') + artVar('hpanel', typeof Art !== 'undefined' && Art.has('ui/hero-panel-5') ? 'ui/hero-panel-5' : 'ui/hero-panel') + artVar('sframe', 'ui/slot-frame') + artVar('bagbg', 'ui/bg-bag') : '', armory ? _t("Ваш дом · Оружейная") : _t("Сумка"), MonsterArt.moneyHtml(Profile.data.coins), tabsBattle, '', [['hero', _t("Герой")], ...(armory ? [['gear', _t("Вещи")]] : []), ['pack', _t("Сумка")]].map(([k, l]) => `<button type="button" class="${(invTab === k || (!armory && invTab === 'gear' && k === 'pack')) ? 'on' : ''}" data-itab="${k}">${l}</button>`).join('') + `<button type="button" class="pet-tab" data-act="kennel">${_t("Питомец")}</button>`, toast, !armory && invTab === 'gear' ? 'pack' : invTab, armory ? 1 : 0, doll, !armory ? _t("<p class=\"hint\">Снаряжение меняется в оружейной Вашего дома.</p>") : !editable ? _t("<p class=\"hint warn\">Менять снаряжение можно вне боя.</p>") : '', pct, used > budget ? 'over' : '', used, budget, heroLine(lv, stats), statsBlock(stats), sets, toast, detail, armory ? _t("<h3>Ячейки хранения · {0} / {1}</h3>\n            <p class=\"hint\">Нажмите на вещь — откроется её карточка с кнопкой «Надеть» или «Снять». Название вещи видно при наведении, цвет уровня — свечение вокруг.</p>\n            <div class=\"stash-grid\">{2}</div>\n            {3}\n            <div class=\"stash-buy\">{4}</div>", [stash.filter(Boolean).length, stashCap(), tiles, stash.length > stashCap() ? _t("<p class=\"hint warn\">Сундук переполнен: {0} на {1}. Докупите ячейки или продайте лишнее в Лавке.</p>", [_nn(stash.filter(Boolean).length, 'вещь', 'вещи', 'вещей'), _nn(stashCap(), 'ячейка', 'ячейки', 'ячеек')]) : '', (Profile.data.stashRows || 0) < STASH_MAX_ROWS
              ? _t("<button type=\"button\" data-act=\"buyrow\" {0}>Докупить ряд ячеек (+{1}) — {2}</button>", [Profile.data.coins >= rowPrice() ? '' : 'disabled', STASH_ROW, MonsterArt.moneyHtml(rowPrice())])
              : _t("<span class=\"hint\">Куплены все ряды ячеек.</span>")]) : _t("<p class=\"hint\">Это сумка: эликсиры, расходники, боеприпасы и ресурсы. Вещи и руны хранятся в оружейной Вашего дома — там же меняется снаряжение.</p>"), bagTab, bagTabsHtml, paneElix, paneRes, MonsterArt.moneyHtml(Profile.data.coins), armory ? `<div class="reset"><button type="button" data-act="reset">${resetArmed ? _t("Точно сбросить? Нажмите ещё раз") : _t("Сбросить весь прогресс")}</button></div>` : '']);
    const fc = Village.frameColor(Profile.data.cosmetics), dfr = root.querySelector('.doll-frame');   // 1.5.1: рамка из гардероба
    if (fc && dfr) dfr.style.boxShadow = `0 0 0 3px ${fc}, 0 0 14px 4px ${fc}`;
  }

  // Особые предметы квестов: ключи к сундукам побережья, «Морской дневник», зелье подводного дыхания
  function keyItemsHtml() {
    const d = Profile.data, xk = d.xkeys || {}, xc = d.xchests || {}, out = [];
    const row = (glyph, name, desc) => `<div class="bag-row"><span class="key-glyph" aria-hidden="true">${glyph}</span><span><b>${name}</b><br><small>${desc}</small></span></div>`;
    if (d.chestKey && !d.chestOpened) out.push(row('🔑', _t("Ключ-сапфир"), _t("Отпирает сапфировый сундук у бригантины.")));
    if (xk.ruby && !xc.ruby) out.push(row('🔑', _t("Ржавый ключ"), _t("Отпирает рубиновый сундук на восточных камнях.")));
    if (xk.emerald && !xc.emerald) out.push(row('🌿', _t("Живой ключ"), _t("Отпирает изумрудный сундук у маяка.")));
    if (d.diary) out.push(row(typeof Art !== 'undefined' && Art.has('items/sea-diary') ? `<img src="${Art.url('items/sea-diary')}" alt="">` : '📖', _t("Морской дневник"), _t("Дневник Капитана: рецепт зелья подводного дыхания и путь к серебряному сундуку.")));
    if (d.breath) out.push(row('🫧', _t("Зелье подводного дыхания"), _t("Хватит на один нырок к серебряному сундуку.")));
    return out.length ? _t("<h3>Сумка: особые предметы</h3>{0}", [out.join('')]) : '';
  }

  function say(text) { toast = text; render(); }

  function onClick(e) {
    if (e.target === root) return close();
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.act === 'close') return close();
    if (t.dataset.act === 'kennel') { if (typeof Screens !== 'undefined') Screens.open('kennel'); return; }
    if (t.dataset.act === 'valor') { if (typeof Screens !== 'undefined') Screens.openValor(); return; }
    if (t.dataset.itab) { invTab = t.dataset.itab; return render(); }
    if (t.dataset.btab) { bagTab = t.dataset.btab; return render(); }
    if (t.dataset.bcell && t.dataset.bcell.startsWith('r:')) { const [, rk, rt] = t.dataset.bcell.split(':'); return ResInfo.open(rk, rt); }
    if (t.dataset.bcell) {   // ячейка сумки: показываем и подсвечиваем её строку в списке ниже
      const k = t.dataset.bcell, drink = root.querySelector(`[data-drink="${k}"]`);
      const row = drink ? drink.closest('.bag-row') : root.querySelector(`.bag-row[data-bkey="${k}"]`);
      if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1000); }
      return;
    }

    if (t.dataset.tab) { tab = t.dataset.tab; sel = tab === 'left' ? null : 'main'; pick = null; toast = ''; return render(); }
    if (t.dataset.drink) {
      const { kind, tier } = Elixirs.split(t.dataset.drink);
      if (!(typeof inBattle !== 'undefined' && inBattle)) return say(_t("Эликсиры пьются только в бою — в любой свой ход"));
      const why = elxWhy(kind, tier);
      if (why) return say(why);
      useElixir(kind, tier);
      return render();
    }
    if (t.dataset.stash !== undefined) {
      const uid = stashLayout()[Number(t.dataset.stash)];
      if (uid) ItemInfo.open(uid);
      return;
    }
    if (t.dataset.slot && tab === 'left' && armory) {
      sel = null; pick = null; resetArmed = false;
      const wuid = Profile.data.loadout[t.dataset.slot];
      if (wuid) return ItemInfo.open(wuid);
      invTab = 'gear';
      return say(_t("Ячейка «{0}» пуста — нажмите вещь в ячейках хранения и выберите «Надеть»", [Gear.SLOT_NAMES[t.dataset.slot]]));
    }
    if (t.dataset.slot && tab === 'left' && !armory) {   // 1.5.7: карточка героя вне дома — нажатие на надетую вещь открывает её карточку (только просмотр)
      const wuid = Profile.data.loadout[t.dataset.slot];
      if (wuid) return ItemInfo.open(wuid);
      return say(_t("Ячейка «{0}» пуста — снаряжение меняется в оружейной Вашего дома", [Gear.SLOT_NAMES[t.dataset.slot]]));
    }
    if (t.dataset.slot) { sel = (tab === 'left' && sel === t.dataset.slot) ? null : t.dataset.slot; pick = null; toast = ''; resetArmed = false; return render(); }
    if (t.dataset.pick) { pick = pick === t.dataset.pick ? null : t.dataset.pick; toast = ''; return render(); }
    if (t.dataset.act === 'unpick') { pick = null; return render(); }
    if (t.dataset.act === 'buyrow') {
      if (!armory) return;
      if ((Profile.data.stashRows || 0) >= STASH_MAX_ROWS) return say(_t("Куплены все ряды ячеек"));
      const price = rowPrice();
      if (!Profile.spend(price)) return say(_t("Не хватает монет: нужно {0}", [price]));
      Profile.data.stashRows = (Profile.data.stashRows || 0) + 1;
      Profile.save();
      if (typeof onEconomyChanged === 'function') onEconomyChanged();
      return say(_t("Куплен ряд из {0} ячеек", [STASH_ROW]));
    }
    if (t.dataset.act === 'allslots') { sel = null; return render(); }
    if (t.dataset.equip) { sel = t.dataset.to; const u = t.dataset.equip; pick = null; return equipItem(u); }
    if (t.dataset.unequip) {
      if (!armory || !canEditGear()) return;
      toStash(t.dataset.unequip);
      onGearChanged();
      return say(_t("Вещь убрана в ячейку хранения"));
    }
    if (t.dataset.act === 'reset') {
      if (!resetArmed) { resetArmed = true; return render(); }
      Profile.reset();
      resetArmed = false;
      MapView.reset();
      onGearChanged();
      return say(_t("Прогресс сброшен"));
    }
    if (t.dataset.item) equipItem(t.dataset.item);
  }

  function equipItem(uid) {
    if (!armory) return say(_t("Снаряжение меняется в оружейной Вашего дома"));
    const load = Profile.data.loadout;
    if (load[sel] === uid) {                         // повторный клик снимает вещь
      load[sel] = null;
      Profile.save();
      onGearChanged();
      return say(_t("Вещь снята"));
    }
    const gear = Profile.gear();
    const entry = Profile.item(uid);
    const check = Gear.canEquip(gear, entry, sel, Profile.data.faction, Profile.level());
    if (!check.ok) return say(check.reason);
    const next = Gear.equip(gear, entry, sel);
    const cost = Gear.totalCost(next);
    if (cost > Profile.budget()) return say(_t("Не хватает очков: нужно {0}, лимит {1}", [cost, Profile.budget()]));
    const dropped = gear.off && !next.off;
    load[sel] = uid;
    if (dropped) load.off = null;
    Profile.save();
    onGearChanged();
    say(dropped ? _t("Двуручное оружие заняло обе руки: левая рука освобождена") : _t("Надето"));
  }

  // Для карточки предмета (ItemInfo): надеть вещь из ячейки хранения / снять в ячейку. Возвращает текст ошибки или null.
  function equipUid(u) {
    if (!armory || !canEditGear()) return _t("Снаряжение меняется в оружейной Вашего дома");
    const k = stashLayout().indexOf(u);
    if (k < 0) return _t("Вещь не найдена в ячейках");
    const err = fromStash(k);
    if (!err) { onGearChanged(); render(); }
    return err;
  }
  function unequipSlot(slot) {
    if (!armory || !canEditGear()) return;
    if (toStash(slot)) { onGearChanged(); render(); }
  }

  return { open, close, equipUid, unequipSlot, refresh: () => render(), get isOpen() { return !!root; }, get inArmory() { return !!root && armory; } };
})();
