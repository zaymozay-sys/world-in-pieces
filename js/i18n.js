/* Перевод интерфейса.
   _t('русский текст')          — строка на выбранном языке (по умолчанию — как есть, по-русски);
   _t('Получено {0} монет', [n])  — со вставками вместо {0}, {1}…
   Английский словарь — js/en.js (ключ — исходная русская строка). Нет перевода — показывается русский.
   Язык: выбор игрока (localStorage 'wip-lang') → язык браузера (русский/украинский/белорусский/казахский → ru, иначе en).
   Яндекс Игры и др.: до загрузки скриптов можно задать window.WIP_LANG = 'ru' | 'en'. */
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const KEY = 'wip-lang';
  function detect() {
    if (g.WIP_LANG === 'ru' || g.WIP_LANG === 'en') return g.WIP_LANG;
    if (typeof process !== 'undefined' && process.env && (process.env.WIP_LANG === 'ru' || process.env.WIP_LANG === 'en')) return process.env.WIP_LANG;
    if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof window === 'undefined') return 'ru'; // тесты в Node — по-русски
    try { const s = localStorage.getItem(KEY); if (s === 'ru' || s === 'en') return s; } catch (e) { /* без хранилища */ }
    const nav = (typeof navigator !== 'undefined' && ((navigator.languages && navigator.languages[0]) || navigator.language)) || 'ru';
    return /^(ru|uk|be|kk)/i.test(nav) ? 'ru' : 'en';
  }
  const lang = detect();
  let dict = null;
  if (lang === 'en') {
    if (g.EN_DICT) dict = g.EN_DICT;
    else if (typeof require === 'function') { try { dict = require('./en.js'); } catch (e) { dict = null; } }
  }
  const missing = new Set();
  function T(key, args) {
    let s = key;
    if (dict) { const d = dict[key]; if (d !== undefined) s = d; else missing.add(key); }
    return args ? s.replace(/\{(\d+)\}/g, (m, i) => args[+i]) : s;
  }
  // для DOM: текст из index.html (пробелы схлопываются, как при выгрузке ключей)
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  function translateDom(root) {
    if (!dict || typeof document === 'undefined') return;
    const w = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const k = norm(n.nodeValue); if (!k || !/[А-Яа-яЁё]/.test(k)) continue;
      const d = dict[k]; if (d !== undefined) { const v = n.nodeValue; n.nodeValue = v.slice(0, v.length - v.trimStart().length) + d + v.slice(v.trimEnd().length); }
    }
    for (const el of (root || document).querySelectorAll('[title],[placeholder],[aria-label],[alt]')) {
      for (const a of ['title', 'placeholder', 'aria-label', 'alt']) {
        const v = el.getAttribute(a); if (v && dict[norm(v)] !== undefined) el.setAttribute(a, dict[norm(v)]);
      }
    }
    if (document.title && dict[norm(document.title)] !== undefined) document.title = dict[norm(document.title)];
  }
  function setLang(l) {
    try { localStorage.setItem(KEY, l); } catch (e) { /* без хранилища */ }
    if (typeof location !== 'undefined') location.reload();
  }
  const I18N = { lang, T, translateDom, setLang, missing, norm };
  g.I18N = I18N; g._t = T;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => translateDom());
    else translateDom();
  }
  if (typeof module !== 'undefined') module.exports = I18N;
})();
