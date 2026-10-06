if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Постепенное открытие зданий и строка «Следующая цель» на карте (версия 1.4.6).
   Новичку не нужно видеть всё сразу: старьёвщик, алхимик, питомник и мастерская открываются по числу побед.
   Закрытое здание остаётся на своём месте (карта не двигается), но затемнено и при нажатии объясняет, когда откроется.
   Чистые функции от Profile.data — удобно проверять тестами. */
const Unlocks = (() => {
  // Сколько побед нужно для здания. Здания, которых здесь нет, открыты всегда.
  const NEED = { lighthouse: 5, junker: 3, alchemist: 5, kennel: 8, artistWorkshop: 10 };
  const NAMES = { lighthouse: _t("Маяк"), junker: _t("Хижина старьёвщика"), alchemist: _t("Алхимик"), kennel: _t("Питомник"), artistWorkshop: _t("Мастерская художника") };
  const HINTS = { lighthouse: _t("тюлень даёт поручения и ключ к сундуку"), junker: _t("скупает ненужные вещи и даёт поручения"), alchemist: _t("варит зелья и эликсиры из добычи"), kennel: _t("выбор спутника, уход и яйца питомцев"), artistWorkshop: _t("руны для вещей") };
  const GIVERS = { tavern: ['tavern', _t("Трактирщик в таверне")], mill: ['mill', _t("Мельник на мельнице")], lighthouse: ['lighthouse', _t("Тюлень на маяке")], junker: ['junker', _t("Старьёвщик")] };

  const wins = (d) => (d && d.wins) || 0;
  const need = (id) => NEED[id] || 0;
  const isOpen = (d, id) => wins(d) >= need(id);
  const reason = (d, id) => _t("{0} откроется после {1} побед (сейчас {2})", [NAMES[id] || id, need(id), wins(d)]);
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
    if (next) return _t("Скоро откроется: {0} — осталось {1} побед.", [NAMES[next], need(next) - wins(d)]);
    return _t("Исследуйте карту, охотьтесь на боссов и собирайте осколки Великого Сердца.");
  }

  return { NEED, NAMES, isOpen, reason, openIds, goal, hint };
})();

if (typeof module !== 'undefined') module.exports = Unlocks;
