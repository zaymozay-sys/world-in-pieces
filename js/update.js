if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Обновление без ручной перезагрузки (2.5.3). Свёрнутая вкладка на телефоне может жить в памяти днями со старым кодом.
   Update.check() запрашивает версию без кэша (version.json из сборки tools/dist.py, а в исходниках — js/version.js) и,
   если она отличается от запущенной, показывает плашку «Вышло обновление» с кнопкой. Сама страница НЕ перезагружается
   (бой не восстанавливается): во время боя плашка ждёт его конца. Проверка — при возврате во вкладку и раз в 10 минут. */
const Update = (() => {
  const EVERY = 10 * 60 * 1000;
  let shown = false, last = 0, found = null, timer = null;
  const running = () => (typeof GAME_VERSION === 'string' ? GAME_VERSION : '');
  const inBattle = () => { try { const b = document.getElementById('board'); return !!(b && b.offsetParent !== null); } catch (e) { return false; } };
  const parse = (txt) => { const m = /"v"\s*:\s*"([^"]+)"/.exec(txt) || /GAME_VERSION\s*=\s*'([^']+)'/.exec(txt); return m ? m[1] : null; };
  async function latest() {
    // Исходная страница подключает version.js непосредственно; dist — хешированный bundle.
    const source = typeof document !== 'undefined' && !!document.querySelector('script[src="js/version.js"]');
    for (const u of source ? ['js/version.js', 'version.json'] : ['version.json', 'js/version.js']) {
      try { const r = await fetch(u + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) continue; const v = parse(await r.text()); if (v) return v; } catch (e) { /* нет сети — молча */ }
    }
    return null;
  }
  function banner(v) {
    if (shown || typeof document === 'undefined' || !document.body) return;
    shown = true;
    const d = document.createElement('div'); d.className = 'upd-banner'; d.setAttribute('role', 'status');
    d.innerHTML = '<span><strong></strong><small></small></span><button type="button" class="primary"></button><button type="button" class="upd-x" aria-label="×">✕</button>';
    d.querySelector('strong').textContent = _t("Вышло обновление {0}", [v]);
    d.querySelector('small').textContent = _t("Обновите страницу, чтобы получить исправления.");
    d.querySelector('.upd-x').setAttribute('aria-label', _t("Закрыть"));
    const b = d.querySelector('.primary'); b.textContent = _t("Обновить");
    b.addEventListener('click', () => location.reload());
    d.querySelector('.upd-x').addEventListener('click', () => { d.remove(); });
    document.body.appendChild(d);
  }
  async function check(force) {
    if (typeof fetch !== 'function' || typeof location === 'undefined' || !/^https?:/.test(location.protocol)) return null;
    if (!force && Date.now() - last < 60 * 1000) return found;   // не чаще раза в минуту
    last = Date.now();
    const v = await latest();
    if (v && running() && v !== running()) { found = v; if (!inBattle()) banner(v); }
    return found;
  }
  function start() {
    if (timer || typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    timer = setInterval(() => { check().then(() => { if (found && !shown && !inBattle()) banner(found); }); }, EVERY);
    if (timer.unref) timer.unref();
    setTimeout(() => check(true), 20000);
  }
  return { check, start, parse, inBattle };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Update;
if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.addEventListener) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Update.start()); else Update.start(); }
