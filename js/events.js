if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* События недели (1.8.9): каждую неделю (с понедельника) в деревне идёт одно событие с небольшим бонусом, меняются по кругу:
   Неделя охотников (монеты Забега ×1,25), Неделя игр (головоломка дня ×1,5 монет, жетон маяка +1 за раунд), Неделя странников
   (стрелки компаса и путевой дневник дешевле на 20%), Неделя ремёсел (промыслы возвращают монеты ×1,5 и ресурсы +1). Чистый модуль, зависит только от даты. */
const Events = (() => {
  const DAY = 86400000;
  const LIST = [
    { id: 'hunt',   name: () => _t("Неделя охотников"), desc: () => _t("монеты за волны «Забега» ×1,25") },
    { id: 'games',  name: () => _t("Неделя игр"),       desc: () => _t("головоломка дня даёт монет ×1,5, у маяка +1 жетон за раунд") },
    { id: 'travel', name: () => _t("Неделя странников"), desc: () => _t("стрелки компаса и путевой дневник дешевле на 20%") },
    { id: 'craft',  name: () => _t("Неделя ремёсел"),   desc: () => _t("промыслы возвращают больше: монет ×1,5, ресурсов +1") },
  ];
  const BY_ID = Object.fromEntries(LIST.map((e) => [e.id, e]));
  // номер недели с понедельника (1 января 1970 — четверг, поэтому сдвиг на 4 дня)
  const weekNo = (now, tzMin) => Math.floor((Math.floor((now - (tzMin || 0) * 60000) / DAY) + 3) / 7);
  const current = (now, tzMin) => LIST[weekNo(now, tzMin) % LIST.length];
  const MUL = { hunt: { run: 1.25 }, games: { puzzle: 1.5 }, craft: { craft: 1.5 } };
  const mul = (id, key) => (MUL[id] && MUL[id][key]) || 1;
  // Начало следующей недели (мс) — для подписи «до …»
  const endsAt = (now, tzMin) => ((weekNo(now, tzMin) + 1) * 7 - 3) * DAY + (tzMin || 0) * 60000;
  return { LIST, BY_ID, weekNo, current, mul, endsAt };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Events;
