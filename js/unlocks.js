if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Постепенное открытие зданий и строка «Следующая цель» на карте (версия 1.4.6).
   Новичку не нужно видеть всё сразу: старьёвщик, алхимик, питомник и мастерская открываются по числу побед.
   Закрытое здание остаётся на своём месте (карта не двигается), но затемнено и при нажатии объясняет, когда откроется.
   Чистые функции от Profile.data — удобно проверять тестами. */
const Unlocks = (() => {
  // Сколько побед нужно для здания. Здания, которых здесь нет, открыты всегда.
  const NEED = { lighthouse: 5, junker: 3, alchemist: 5, kennel: 8, artistWorkshop: 10, jeweler: 10, arena: 6 };
  const NAMES = { arena: _t("Арена"), lighthouse: _t("Маяк"), junker: _t("Хижина старьёвщика"), alchemist: _t("Алхимик"), kennel: _t("Питомник"), artistWorkshop: _t("Мастерская художника"), jeweler: _t("Ювелирная лавка") };
  const HINTS = { jeweler: _t("огранка самоцветов, печати стражей, скупка камней"), arena: _t("Арена теней и Испытание дня"), lighthouse: _t("тюлень даёт поручения и ключ к сундуку"), junker: _t("скупает ненужные вещи и даёт поручения"), alchemist: _t("варит зелья и эликсиры из добычи"), kennel: _t("выбор спутника, уход и яйца питомцев"), artistWorkshop: _t("руны для вещей") };
  const GIVERS = { tavern: ['tavern', _t("Трактирщик в таверне")], mill: ['mill', _t("Мельник на мельнице")], lighthouse: ['lighthouse', _t("Тюлень на маяке")], junker: ['junker', _t("Старьёвщик")], library: ['library', _t("Бобёр в Библиотеке")] };

  const wins = (d) => (d && d.wins) || 0;
  const need = (id) => NEED[id] || 0;
  const isOpen = (d, id) => wins(d) >= need(id);
  const reason = (d, id) => _t("{0} откроется после {1} (сейчас {2})", [NAMES[id] || id, _nn(need(id), 'победы', 'побед', 'побед'), wins(d)]);
  const hint = (id) => (NAMES[id] || id) + (HINTS[id] ? ' — ' + HINTS[id] : '');
  const openIds = (d) => Object.keys(NEED).filter((id) => isOpen(d, id));

  // Одна строка-подсказка: что делать прямо сейчас. quests — Quests.list(data).
  function goal(d, quests) {
    if (wins(d) < 1) return _t("Цель: победите первое существо — нажмите на любого зверя на карте.");
    const list = quests || [];
    const giverOk = (q) => !GIVERS[q.giver] || isOpen(d, GIVERS[q.giver][0]);
    const ready = list.find((q) => q.accepted && q.done && !q.claimed);
    if (ready) return _t("Заберите награду за «{0}»: {1}.", [ready.title, GIVERS[ready.giver] ? GIVERS[ready.giver][1] : _t("у выдавшего")]);
    const active = list.find((q) => q.accepted && !q.done && !q.claimed);
    if (active) return _t("Задание «{0}»: {1} из {2}.", [active.title, active.value, active.goal]);
    const fresh = list.find((q) => !q.accepted && !q.claimed && giverOk(q));
    if (fresh) return _t("Возьмите задание «{0}»: {1}.", [fresh.title, GIVERS[fresh.giver] ? GIVERS[fresh.giver][1] : _t("в посёлке")]);
    const next = Object.keys(NEED).filter((id) => !isOpen(d, id)).sort((a, b) => NEED[a] - NEED[b])[0];
    if (next) return _t("Скоро откроется: {0} — осталось {1}.", [NAMES[next], _nn(need(next) - wins(d), 'победа', 'победы', 'побед')]);
    return _t("Исследуйте карту, охотьтесь на боссов и собирайте осколки Великого Сердца.");
  }

  // Куда смотреть на карте для текущей цели: { kind:'monster' } — любой зверь рядом, { kind:'building', id } — здание.
  function target(d, quests) {
    if (wins(d) < 1) return { kind: 'monster' };
    const list = quests || [];
    const giverOk = (q) => !GIVERS[q.giver] || isOpen(d, GIVERS[q.giver][0]);
    const ready = list.find((q) => q.accepted && q.done && !q.claimed);
    if (ready && GIVERS[ready.giver]) return { kind: 'building', id: GIVERS[ready.giver][0] };
    if (list.find((q) => q.accepted && !q.done && !q.claimed)) return { kind: 'monster' };
    const fresh = list.find((q) => !q.accepted && !q.claimed && giverOk(q));
    if (fresh && GIVERS[fresh.giver]) return { kind: 'building', id: GIVERS[fresh.giver][0] };
    return { kind: 'monster' };
  }

  return { NEED, NAMES, GIVERS, isOpen, reason, openIds, goal, hint, target };
})();

if (typeof module !== 'undefined') module.exports = Unlocks;
