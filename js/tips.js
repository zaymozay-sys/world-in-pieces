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
  function clean(t) { const o = {}; if (t && typeof t === 'object') { for (const k of ids) if (t[k]) o[k] = true; for (const k of Object.keys(t)) if (/^b:[a-zA-Z]+$/.test(k) && t[k]) o[k] = true; } return o; }  // 2.0.9: подсказки окон («b:…») не стираем
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

// 2.0.9: тематические пустые состояния — маленький рисунок и подпись вместо серой строки
const EmptyArt = (() => {
  const P = {
    scroll: '<path d="M7 4h10a2 2 0 0 1 2 2v11a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a2 2 0 0 1 2-2" /><path d="M9 9h7M9 12h7M9 15h4"/>',
    chest: '<path d="M4 10a8 5 0 0 1 16 0v9H4z"/><path d="M4 12h16M12 12v3"/>',
    flask: '<path d="M10 3h4M11 3v6l-5 9a2 2 0 0 0 2 3h8a2 2 0 0 0 2-3l-5-9V3"/><path d="M8.5 15h7"/>',
    paw: '<circle cx="7" cy="10" r="1.7"/><circle cx="11" cy="6.5" r="1.7"/><circle cx="15.5" cy="7" r="1.7"/><circle cx="18" cy="11.5" r="1.7"/><path d="M12 12c-3 0-5.5 3-4.5 5.5 1 2 3 1.2 4.5 1.2s3.5.8 4.5-1.2C17.5 15 15 12 12 12z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4"/>',
    basket: '<path d="M4 10h16l-1.6 9H5.6zM8 10l3-5M16 10l-3-5"/>',
  };
  const html = (kind, text, hint) => `<div class="empty-state" role="note"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[kind] || P.scroll}</svg><p>${text}</p>${hint ? `<small>${hint}</small>` : ''}</div>`;
  return { html };
})();
