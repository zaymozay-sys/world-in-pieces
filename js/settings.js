if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Настройки игрока и правила поля (2.3.9: вынесено из game.js).
   RULES — размеры и числа поля боя; AnimSpeed — скорость анимаций; TextSize — размер текста;
   TurnTimerSetting — таймер хода; AdPause — заготовка паузы на рекламу (выключена). */

const RULES = {
  size: 6,               // поле 6x6
  defaultHp: 100,
  firstMove: null,       // для отладки: 'left' или 'right' — кто ходит первым (обычно решает Проворство)
  defaultLevel: 30,      // уровень противника 1..100
  timing: { swap: 200, clear: 230, fall: 280, shift: 280, spawn: 320, think: 600, burn: 650 },
};

// 1.6.4: скорость анимаций — настройка устройства (не профиль): быстро ×0.6, обычно ×1, медленно ×1.5. Меняет только паузы и
// плавность движения камней (RULES.timing и CSS-переменная --anim); правила, баланс и таймер хода не затрагивает.
const AnimSpeed = (() => {
  const KEY = 'wip-anim', F = { normal: 1, fast: 0.6, slow: 1.5 }, ORDER = ['normal', 'fast', 'slow'], BASE = { ...RULES.timing };
  let cur = 'normal';
  try { const v = localStorage.getItem(KEY); if (F[v]) cur = v; } catch (e) { /* без хранилища — обычная */ }
  const apply = () => {
    for (const k in BASE) RULES.timing[k] = Math.round(BASE[k] * F[cur]);
    try { document.documentElement.style.setProperty('--anim', String(F[cur])); } catch (e) { /* нет страницы */ }
  };
  const label = () => cur === 'fast' ? _t("Анимации: быстрые") : cur === 'slow' ? _t("Анимации: медленные") : _t("Анимации: обычные");
  const cycle = () => { cur = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length]; try { localStorage.setItem(KEY, cur); } catch (e) { /* не страшно */ } apply(); return cur; };
  apply();
  return { label, cycle, apply, get mode() { return cur; } };
})();

// 2.0.9: размер текста в окнах и подсказках — настройка устройства: обычный / крупный (поле боя и карта не меняются)
const TextSize = (() => {
  const KEY = 'wip-text';
  let large = false;
  try { large = localStorage.getItem(KEY) === 'large'; } catch (e) { /* без хранилища — обычный */ }
  const apply = () => { try { document.documentElement.classList.toggle('text-large', large); } catch (e) { /* нет страницы */ } };
  const label = () => large ? _t("Текст: крупный") : _t("Текст: обычный");
  const toggle = () => { large = !large; try { localStorage.setItem(KEY, large ? 'large' : 'normal'); } catch (e) { /* не страшно */ } apply(); return large; };
  apply();
  return { label, toggle, apply };
})();

// 1.6.5: таймер хода — настройка устройства (не профиль). По умолчанию ВЫКЛ: в боях с существами можно думать сколько угодно.
// Включённый таймер — Combat.TURN_TIMER.seconds (30 с) на ход, три пропуска подряд — поражение; пока открыто окно (ранец, справка,
// карточки), время стоит. Бой против живого игрока (PvP, позже) вёл бы таймер всегда и без пауз: host.pvp === true (на сервере).
const TurnTimerSetting = (() => {
  const KEY = 'wip-turn-timer';
  let on = false;
  try { on = localStorage.getItem(KEY) === '30'; } catch (e) { /* без хранилища — выключен */ }
  const set = (v) => {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '30' : 'off'); } catch (e) { /* не страшно */ }
    try { window.dispatchEvent(new Event('turn-timer-changed')); } catch (e) { /* нет страницы */ }
    return on;
  };
  return {
    get on() { return on; }, set, toggle: () => set(!on),
    label: () => on ? _t("Таймер хода: 30 с") : _t("Таймер хода: выкл"),
    short: () => on ? _t("Таймер: 30 с") : _t("Таймер: выкл"),
  };
})();

// 1.6.5 (заготовка, ВЫКЛЮЧЕНА: AdPause.enabled = false): когда появится реклама, при долгом раздумье над ходом (idleMs, по умолчанию 2 мин
// без нажатий) игроку предлагается пауза на рекламу. Кнопка «Нет, продолжаем игру» закрывает сообщение и начинает отсчёт заново.
// Сама реклама подключается через AdPause.onAccept (пока пусто — кнопка согласия закрывает сообщение).
const AdPause = (() => {
  const cfg = { enabled: false, idleMs: 120000, onAccept: null };
  let timer = null, pop = null;
  const clear = () => { if (timer) clearTimeout(timer); timer = null; };
  const hide = () => { if (pop) { pop.remove(); pop = null; } };
  const show = () => {
    timer = null;
    if (!cfg.enabled || pop || typeof document === 'undefined') return;
    pop = document.createElement('div');
    pop.className = 'modal-back adpause-back';
    pop.innerHTML = `<div class="modal adpause" role="dialog" aria-label="${_t("Пауза на рекламу")}"><p>${_t("Пока думаете над ходом, можно сделать паузу на рекламу")}</p><div class="adpause-act"><button type="button" class="primary" data-adpause="yes">${_t("Сделать паузу")}</button><button type="button" data-adpause="no">${_t("Нет, продолжаем игру")}</button></div></div>`;
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-adpause]'); if (!b) return;
      const yes = b.dataset.adpause === 'yes'; hide();
      if (yes && typeof cfg.onAccept === 'function') { try { cfg.onAccept(); } catch (err) { /* реклама не должна ломать бой */ } }
      arm();
    });
    document.body.appendChild(pop);
  };
  function arm() { clear(); if (cfg.enabled && !pop) timer = setTimeout(show, cfg.idleMs); }
  const touch = () => { if (timer) arm(); };       // любое нажатие игрока — отсчёт заново
  if (typeof document !== 'undefined') { document.addEventListener('pointerdown', touch, true); document.addEventListener('keydown', touch, true); }
  return { cfg, arm, disarm() { clear(); hide(); }, get shown() { return !!pop; },
    get enabled() { return cfg.enabled; }, set enabled(v) { cfg.enabled = !!v; if (!v) { clear(); hide(); } } };
})();
