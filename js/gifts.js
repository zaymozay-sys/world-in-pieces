if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Подарки (2.3.6): коллекционные декорации для Стены доблести и Визитки героя. Покупаются за монеты, себе,
   без игрового эффекта — чисто красивая коллекция. Задел под будущую отправку другому игроку по нику (этап Б,
   когда появятся ники на сервере): структура данных уже разделяет «куплен» и «подписан», чтобы потом
   добавить «от кого» без переделки сохранения.
   Чистый модуль: Profile.data.gifts = { own: { id: true }, note: { id: noteKey } }. */
const Gifts = (() => {
  const G = 10000;                         // золотая монета в медных (как в Decor/Village)
  const ITEMS = [
    { id: 'gift-heart',    price: 2 * G,  name: () => _t("Самоцветное сердце"),   icon: '💗' },
    { id: 'gift-horse',    price: 3 * G,  name: () => _t("Деревянная лошадка"),   icon: '🐴' },
    { id: 'gift-crown',    price: 15 * G, name: () => _t("Игрушечная корона"),    icon: '👑' },
    { id: 'gift-feather',  price: 2 * G,  name: () => _t("Перо странника"),       icon: '🪶' },
    { id: 'gift-candle',   price: 1 * G,  name: () => _t("Путеводная свеча"),     icon: '🕯' },
    { id: 'gift-acorn',    price: 1 * G,  name: () => _t("Жёлудь на удачу"),      icon: '🌰' },
    { id: 'gift-bow',      price: 3 * G,  name: () => _t("Праздничный бант"),     icon: '🎀' },
    { id: 'gift-star',     price: 8 * G,  name: () => _t("Осколок звезды"),       icon: '✨' },
    { id: 'gift-shield',   price: 6 * G,  name: () => _t("Значок «Щит дружбы»"),  icon: '🛡' },
    { id: 'gift-bell',     price: 2 * G,  name: () => _t("Пастуший колокольчик"), icon: '🔔' },
    { id: 'gift-scroll',   price: 4 * G,  name: () => _t("Свиток-поздравление"),  icon: '📜' },
    { id: 'gift-mug',      price: 2 * G,  name: () => _t("Кружка трактирщика"),   icon: '🍺' },
    { id: 'gift-lantern',  price: 5 * G,  name: () => _t("Фонарик-светлячок"),    icon: '🏮' },
    { id: 'gift-medal',    price: 20 * G, name: () => _t("Почётный знак"),        icon: '🏅' },
    { id: 'gift-flower',   price: 1 * G,  name: () => _t("Полевой букет"),        icon: '💐' },
  ];
  const BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  // предустановленные подписи — часть игрового тона: дружеские/подбадривающие и лёгкие «соперничьи» (без оскорблений)
  const NOTES = [
    { id: 'gg',       text: () => _t("Отличный бой!") },
    { id: 'respect',  text: () => _t("С уважением к сопернику") },
    { id: 'luck',     text: () => _t("Удачи в пути!") },
    { id: 'well',     text: () => _t("Так держать!") },
    { id: 'friend',   text: () => _t("Другу по осколкам") },
    { id: 'proud',    text: () => _t("Горжусь твоей победой") },
    { id: 'again',    text: () => _t("Ещё встретимся на арене") },
    { id: 'tough',    text: () => _t("Ты крепкий орешек") },
    { id: 'lesson',   text: () => _t("Это был урок — с меня подарок") },
    { id: 'revenge',  text: () => _t("В следующий раз не отделаешься так легко") },
    { id: 'salute',   text: () => _t("Снимаю шляпу") },
    { id: 'none',     text: () => _t("Без подписи") },
  ];
  const BY_NOTE = Object.fromEntries(NOTES.map((n) => [n.id, n]));
  function clean(g) {
    g = g && typeof g === 'object' ? g : {};
    const own = {}, note = {};
    for (const id of Object.keys(g.own && typeof g.own === 'object' ? g.own : {})) if (BY_ID[id] && g.own[id]) own[id] = true;
    for (const id of Object.keys(g.note && typeof g.note === 'object' ? g.note : {})) if (own[id] && BY_NOTE[g.note[id]]) note[id] = g.note[id];
    return { own, note };
  }
  const owns = (g, id) => !!g.own[id];
  const ownCount = (g) => Object.keys(g.own).length;
  function buy(g, id, coins) {
    const it = BY_ID[id];
    if (!it) return { ok: false, why: 'none' };
    if (g.own[id]) return { ok: false, why: 'owned' };
    if (coins < it.price) return { ok: false, why: 'poor' };
    g.own[id] = true; return { ok: true, price: it.price };
  }
  function setNote(g, id, noteId) {
    if (!g.own[id] || !BY_NOTE[noteId]) return false;
    if (noteId === 'none') delete g.note[id]; else g.note[id] = noteId;
    return true;
  }
  return { G, ITEMS, BY_ID, NOTES, BY_NOTE, clean, owns, ownCount, buy, setNote };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Gifts;
