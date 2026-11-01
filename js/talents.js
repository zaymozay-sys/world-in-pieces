if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Таланты (2.0.9): очко за каждые Balance.talents.every уровней героя; очки игрок вкладывает сам в характеристики
   (до Balance.talents.rankMax ступеней в каждую). Сброс — за плату. Бонус складывается с остальными характеристиками
   (см. Profile.medalsBonus). Все числа — в Balance.talents; описание в базе знаний берётся отсюда же. */
const Talents = (() => {
  const T_B = typeof Balance !== 'undefined' ? Balance : require('./balance.js');
  const C = T_B.talents;
  // Ветви и таланты: id совпадает с названием характеристики, на которую он влияет.
  const TREE = [
    { id: 'attack', name: _t("Атака"), list: ['power', 'fury', 'cunning'] },
    { id: 'defence', name: _t("Защита"), list: ['health', 'defense', 'block'] },
    { id: 'agility', name: _t("Ловкость"), list: ['initiative', 'ricochet'] },
  ];
  const NAMES = { power: _t("Сила"), fury: _t("Ярость"), cunning: _t("Хитрость"), health: _t("Здоровье"), defense: _t("Броня"), block: _t("Блок"), initiative: _t("Проворство"), ricochet: _t("Рикошет") };
  const IDS = TREE.flatMap((b) => b.list);
  const pointsFor = (level) => Math.floor(Math.max(0, level) / C.every);
  const ranks = (t) => (t && typeof t === 'object' ? t : {});
  const spent = (t) => IDS.reduce((s, id) => s + (ranks(t)[id] || 0), 0);
  const left = (t, level) => Math.max(0, pointsFor(level) - spent(t));
  // Приводит сохранённое к допустимому виду: только известные таланты, ступени в пределах, очков не больше, чем положено.
  function clean(t, level) {
    const out = {};
    let room = pointsFor(level);
    for (const id of IDS) {
      const r = Math.max(0, Math.min(C.rankMax, Math.floor(Number(ranks(t)[id]) || 0), room));
      if (r > 0) { out[id] = r; room -= r; }
    }
    return out;
  }
  const canAdd = (t, level, id) => IDS.includes(id) && (ranks(t)[id] || 0) < C.rankMax && left(t, level) > 0;
  function add(t, level, id) { if (!canAdd(t, level, id)) return t; return { ...ranks(t), [id]: (ranks(t)[id] || 0) + 1 }; }
  const bonus = (t) => { const s = {}; for (const id of IDS) if (ranks(t)[id]) s[id] = ranks(t)[id] * C.per[id]; return s; };
  const respecCost = (level) => (typeof Hero !== 'undefined' ? Hero.consumablePrice(C.respec, level) : C.respec);
  return { TREE, NAMES, IDS, pointsFor, spent, left, clean, canAdd, add, bonus, respecCost, EVERY: C.every, RANK_MAX: C.rankMax, PER: C.per };
})();
if (typeof module !== 'undefined') module.exports = Talents;
