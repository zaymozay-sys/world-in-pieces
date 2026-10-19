/* Журнал судьбы героя (1.8.8): хроника больших событий, которую можно листать. Данные: Profile.data.chron = [{ t, k, a }].
   Чистый модуль: add/list/text не знают о Profile, всё берут из переданных данных. */
const Chron = (() => {
  const MAX = 300;
  const WIN_MARKS = [1, 10, 50, 100, 250, 500, 1000, 2500, 5000];
  const LVL_MARKS = [5, 10, 20, 30, 50, 75, 100];
  const ONCE = new Set(['win', 'level', 'shard', 'place', 'lord', 'ship', 'belt', 'floor', 'chest']);   // эти события записываются один раз на значение
  const TEXT = {
    win: (a) => (a === 1 ? _t("Первая победа в бою.") : _t("{0}-я победа в боях.", [a])),
    level: (a) => _t("Герой достиг {0}-го уровня.", [a]),
    shard: (a) => _t("Побеждён страж осколка: {0}.", [a]),
    pet: (a) => _t("В доме появился питомец: {0}.", [a]),
    place: (a) => ({ castle: _t("Впервые пройдены ворота замка."), island: _t("Бригантина причалила к Затерянному острову."), tower: _t("Герой вошёл в подземелье.") }[a] || _t("Открыто новое место.")),
    lord: () => _t("Повержен Владыка замка."),
    ship: () => _t("Бригантина снята с мели."),
    belt: () => _t("Получен Пояс охотника."),
    floor: (a) => _t("Пройден {0}-й уровень подземелья.", [a]),
    rare: (a) => _t("Добыт редкий зверь: {0}.", [a]),
    chest: (a) => _t("Открыт сундук: {0}.", [a]),
    lh: (a) => _t("Рекорд у смотрителя маяка: {0}.", [a]),
  };
  // добавляет запись; для разовых событий повтор с тем же значением игнорируется. Возвращает запись или null.
  function add(data, k, a, now) {
    if (!data || !TEXT[k]) return null;
    const list = data.chron = Array.isArray(data.chron) ? data.chron : [];
    if (ONCE.has(k) && list.some((e) => e && e.k === k && e.a === a)) return null;
    const e = { t: Number.isFinite(now) ? now : Date.now(), k, a: a === undefined ? null : a };
    list.push(e);
    if (list.length > MAX) list.splice(0, list.length - MAX);
    return e;
  }
  const winMark = (data, wins) => (WIN_MARKS.includes(wins) ? add(data, 'win', wins) : null);
  // записывает все пройденные отметки уровня, которых ещё нет в хронике (уровень мог вырасти сразу на несколько)
  function levelMarks(data, level) { let last = null; for (const m of LVL_MARKS) if (level >= m) last = add(data, 'level', m) || last; return last; }
  const text = (e) => (e && TEXT[e.k] ? TEXT[e.k](e.a) : '');
  const list = (data) => (Array.isArray(data && data.chron) ? data.chron.filter((e) => e && TEXT[e.k]).slice().reverse() : []);
  const dateStr = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
  return { MAX, WIN_MARKS, LVL_MARKS, add, winMark, levelMarks, text, list, dateStr };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Chron;
