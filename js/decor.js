if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Дом: украшения и зал трофеев (1.8.9). Шесть мест в доме, на каждое — несколько украшений за монеты. Силы не дают, это просто красиво.
   Заполненные все шесть мест — титул «Хозяин дома», 10 украшений в коллекции — «Коллекционер» (см. Village.TITLES, earn.decor / earn.decorOwn).
   Чистый модуль: состояние Profile.data.decor = { own:{id:true}, put:{slot:id} }. Зал трофеев показывает data.trophies и медали. */
const Decor = (() => {
  const G = 10000;                                              // золотая монета в медных (как в js/village.js)
  const SLOTS = ['wall', 'floor', 'shelf', 'window', 'door', 'garden'];
  const SLOT_NAME = { wall: () => _t("Стена"), floor: () => _t("Пол"), shelf: () => _t("Полка"), window: () => _t("Окно"), door: () => _t("Дверь"), garden: () => _t("Садик") };
  const ITEMS = [
    { id: 'wall-banner',  slot: 'wall',   price: 1 * G,  name: () => _t("Знамя народа"),       icon: '🚩' },
    { id: 'wall-trophy',  slot: 'wall',   price: 4 * G,  name: () => _t("Рога на стене"),      icon: '🦌' },
    { id: 'wall-map',     slot: 'wall',   price: 8 * G,  name: () => _t("Карта осколков"),     icon: '🗺' },
    { id: 'floor-rug',    slot: 'floor',  price: 1 * G,  name: () => _t("Домотканый ковёр"),   icon: '🟫' },
    { id: 'floor-fur',    slot: 'floor',  price: 5 * G,  name: () => _t("Медвежья шкура"),     icon: '🐻' },
    { id: 'floor-mosaic', slot: 'floor',  price: 12 * G, name: () => _t("Мозаика из самоцветов"), icon: '💠' },
    { id: 'shelf-books',  slot: 'shelf',  price: 1 * G,  name: () => _t("Книги и свитки"),     icon: '📚' },
    { id: 'shelf-skull',  slot: 'shelf',  price: 3 * G,  name: () => _t("Череп великана"),     icon: '💀' },
    { id: 'shelf-globe',  slot: 'shelf',  price: 7 * G,  name: () => _t("Шар из горного хрусталя"), icon: '🔮' },
    { id: 'window-curt',  slot: 'window', price: 1 * G,  name: () => _t("Льняные занавески"),  icon: '🪟' },
    { id: 'window-glass', slot: 'window', price: 6 * G,  name: () => _t("Цветное стекло"),     icon: '🌈' },
    { id: 'door-wreath',  slot: 'door',   price: 1 * G,  name: () => _t("Венок на двери"),     icon: '🌿' },
    { id: 'door-lantern', slot: 'door',   price: 4 * G,  name: () => _t("Фонарь у входа"),     icon: '🏮' },
    { id: 'garden-flower',slot: 'garden', price: 1 * G,  name: () => _t("Клумба"),             icon: '🌷' },
    { id: 'garden-statue',slot: 'garden', price: 10 * G, name: () => _t("Статуя победителя босса"), icon: '🗿' },
    { id: 'garden-pond',  slot: 'garden', price: 6 * G,  name: () => _t("Пруд с карпами"),     icon: '🐟' },
  ];
  const BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  function clean(d) {
    d = d && typeof d === 'object' ? d : {};
    const own = {}, put = {};
    for (const id of Object.keys(d.own && typeof d.own === 'object' ? d.own : {})) if (BY_ID[id] && d.own[id]) own[id] = true;
    for (const s of SLOTS) { const id = d.put && d.put[s]; if (id && own[id] && BY_ID[id].slot === s) put[s] = id; }
    return { own, put };
  }
  const owns = (d, id) => !!d.own[id];
  const ownCount = (d) => Object.keys(d.own).length;
  const filled = (d) => SLOTS.filter((s) => d.put[s]).length;
  function buy(d, id, coins) {
    const it = BY_ID[id];
    if (!it) return { ok: false, why: 'none' };
    if (d.own[id]) return { ok: false, why: 'owned' };
    if (coins < it.price) return { ok: false, why: 'poor' };
    d.own[id] = true; d.put[it.slot] = id; return { ok: true, price: it.price };
  }
  function put(d, id) { const it = BY_ID[id]; if (!it || !d.own[id]) return false; d.put[it.slot] = id; return true; }
  function clear(d, slot) { if (!SLOTS.includes(slot) || !d.put[slot]) return false; delete d.put[slot]; return true; }
  // зал трофеев: чучела редких зверей (RareHunt.trophy) — вид → сколько раз
  function trophies(data) {
    const t = data && data.trophies && typeof data.trophies === 'object' ? data.trophies : {};
    return Object.entries(t).filter(([, n]) => Number.isFinite(n) && n > 0).map(([id, n]) => ({ id, n: Math.floor(n) }));
  }
  return { G, SLOTS, SLOT_NAME, ITEMS, BY_ID, clean, owns, ownCount, filled, buy, put, clear, trophies };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Decor;
