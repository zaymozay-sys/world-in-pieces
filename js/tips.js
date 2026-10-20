if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Подсказки при первом событии (1.9.7): вместо стены текста в обучении — одна короткая подсказка в тот момент, когда
   она нужна (первая четвёрка, первая ошибка, первое заклинание, нехватка камней, потерянный ход). Каждая показывается
   один раз за героя: Profile.data.tips = { id:true }. Чистая часть (once) проверяется тестом, show рисует плашку в DOM. */
const Tips = (() => {
  const TEXT = {
    four: () => _t("Четвёрка! Линия из 4 камней даёт дополнительный ход, а камни в ней считаются с бонусом ×2."),
    wrong: () => _t("Ход должен собирать линию из 3 и больше одинаковых камней — иначе штраф к здоровью. Кнопка «Подсказка» покажет удачный обмен."),
    spell: () => _t("Камней хватает на заклинание — нажмите на значок под полем. Оно тратит камни, но может решить бой."),
    short: () => _t("На заклинание нужны камни разных цветов — собирайте линии, и счётчики вырастут."),
    idle: () => _t("Не знаете, куда ходить? Нажмите «Подсказка»: она подсветит лучший обмен."),
  };
  const ids = Object.keys(TEXT);
  function clean(t) { const o = {}; if (t && typeof t === 'object') for (const k of ids) if (t[k]) o[k] = true; return o; }
  // вернёт текст подсказки, если её ещё не показывали (и отметит показанной); иначе null
  function once(d, id) {
    if (!TEXT[id]) return null;
    d.tips = clean(d.tips);
    if (d.tips[id]) return null;
    d.tips[id] = true;
    return TEXT[id]();
  }
  let timer = 0;
  function show(text) {
    if (typeof document === 'undefined' || !text) return;
    let el = document.getElementById('tip-banner');
    if (!el) {
      el = document.createElement('div'); el.id = 'tip-banner'; el.setAttribute('role', 'status');
      el.addEventListener('click', () => { el.hidden = true; });
      document.body.appendChild(el);
    }
    el.textContent = text; el.hidden = false;
    clearTimeout(timer); timer = setTimeout(() => { el.hidden = true; }, 9000);
  }
  // показать подсказку id один раз (data — Profile.data); возвращает true, если показали
  function fire(d, id) { const t = once(d, id); if (!t) return false; show(t); return true; }
  return { ids, clean, once, show, fire };
})();

if (typeof module !== 'undefined') module.exports = Tips;
