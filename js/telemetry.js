/* Отчёты тестировщиков (2.0.9): итог и журнал каждого боя, ошибки JavaScript и сообщения «Сообщить о проблеме» уходят на сервер
   (POST /telemetry, читает разработчик по ключу). Очередь лежит в localStorage: нет связи — отправим позже. Выключатель — в меню.
   В отчёт попадают публичное имя героя, версия игры, цифры боя и его журнал; почты, внешних id и адреса там нет.
   Чистая часть (build*, queue) работает и без браузера — её проверяет tests/telemetry.test.js. */
const Telemetry = (() => {
  const QKEY = 'wip.tele.q', OFFKEY = 'wip.tele.off', MAXQ = 60, BATCH = 20, LINES = 200, LINE_LEN = 160;
  const mem = {};
  const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
  const get = (k) => { const s = ls(); try { return s ? s.getItem(k) : (mem[k] == null ? null : mem[k]); } catch (e) { return null; } };
  const set = (k, v) => { const s = ls(); try { if (s) s.setItem(k, v); else mem[k] = v; } catch (e) { /* нет места — не страшно */ } };
  const enabled = () => get(OFFKEY) !== '1';
  const setEnabled = (on) => set(OFFKEY, on ? '0' : '1');
  const readQ = () => { try { const a = JSON.parse(get(QKEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const writeQ = (a) => { while (a.length > MAXQ) a.shift(); set(QKEY, JSON.stringify(a)); };
  const ver = () => (typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '');
  const who = () => { try { return String((typeof Profile !== 'undefined' && Profile.data && Profile.data.name) || '').slice(0, 40); } catch (e) { return ''; } };
  const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

  // сводка о герое для любого отчёта: из неё видно, на каком этапе игры человек
  function heroInfo() {
    try {
      const d = Profile.data || {};
      return { level: Profile.level(), tier: Hero.tierFor(Profile.level()), faction: d.faction || null, wins: d.wins || 0, coins: d.coins || 0, pet: !!d.pet };
    } catch (e) { return {}; }
  }
  // запись о бое (чистая функция): info — то, что знает game.js на момент конца боя
  function buildBattle(info) {
    const lines = (info.lines || []).slice(-LINES).map((r) => (r.side === 'left' ? 'L|' : 'R|') + clip(r.text, LINE_LEN));
    return {
      n: info.n || 0, result: info.result || '', mode: info.mode || 'pve',
      hero: { name: clip(info.hero && info.hero.name, 40), hp: info.hero ? info.hero.hp : 0, max: info.hero ? info.hero.max : 0, ...(info.heroInfo || heroInfo()) },
      foe: { name: clip(info.foe && info.foe.name, 40), tier: info.foe ? info.foe.tier : 0, hp: info.foe ? info.foe.hp : 0, max: info.foe ? info.foe.max : 0 },
      stats: info.stats || {}, extra: info.extra || {}, lines,
    };
  }
  const buildError = (msg, src, line, col, stack) => ({ msg: clip(msg, 300), src: clip(src, 120), line: line | 0, col: col | 0, stack: clip(stack, 1500), hero: heroInfo(), ua: clip(typeof navigator !== 'undefined' ? navigator.userAgent : '', 160) });

  let busy = false, timer = null, errCount = 0;
  const seenErr = new Set();
  function push(kind, data) {
    if (!enabled()) return false;
    const q = readQ(); q.push({ kind, ver: ver(), who: who(), at: Date.now(), data }); writeQ(q);
    schedule(); return true;
  }
  function schedule() { if (timer || typeof setTimeout !== 'function') return; timer = setTimeout(() => { timer = null; flush(); }, 1500); }
  // отправка очереди пачками; при неудаче записи остаются на потом
  async function flush() {
    if (busy) return false;
    let remote = null; try { remote = typeof Net !== 'undefined' && Net.current ? Net.current.remote : null; } catch (e) { remote = null; }
    if (!remote || !remote.enabled || !remote.telemetry) return false;
    busy = true;
    try {
      for (;;) {
        const q = readQ(); if (!q.length) break;
        let batch = q.slice(0, BATCH);
        // пачка с картинками не должна перерасти лимит тела запроса (≈300 КБ): берём записи, пока помещаются
        let sz = 0, cut = 0; for (const it of batch) { sz += JSON.stringify(it).length; if (cut && sz > 250000) break; cut++; }
        batch = batch.slice(0, cut);
        if (!(await remote.telemetry(batch))) return false;
        const rest = readQ().slice(batch.length); writeQ(rest);
      }
      return true;
    } catch (e) { return false; } finally { busy = false; }
  }
  function battle(info) { try { return push('battle', buildBattle(info)); } catch (e) { return false; } }
  function error(msg, src, line, col, stack) {
    if (errCount >= 20) return false;
    const key = clip(msg, 100) + '|' + line; if (seenErr.has(key)) return false; seenErr.add(key); errCount++;
    try { return push('error', buildError(msg, src, line, col, stack)); } catch (e) { return false; }
  }
  // сообщение от человека: к тексту прикладываем последний бой (с журналом) и сводку о герое
  function report(note, extra) {
    const data = { note: clip(note, 1500), hero: heroInfo(), ua: clip(typeof navigator !== 'undefined' ? navigator.userAgent : '', 160), ...(extra || {}) };
    try {
      if (typeof BattleLog !== 'undefined') {
        const all = BattleLog.list ? BattleLog.list() : [], last = all[all.length - 1];
        if (last) data.lastBattle = { n: last.n, foe: last.foe, tier: last.tier, result: last.result, lines: last.lines.slice(-120).map((l) => clip(l, LINE_LEN)) };
      }
    } catch (e) { /* без боя — тоже полезно */ }
    const ok = push('report', data); flush(); return ok;
  }
  function install(w) {
    if (!w || w.__teleInstalled) return; w.__teleInstalled = true;
    w.addEventListener('error', (e) => { error(e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack); });
    w.addEventListener('unhandledrejection', (e) => { const r = e.reason; error(r && r.message ? r.message : String(r), '', 0, 0, r && r.stack); });
    w.addEventListener('online', () => flush());
    schedule();
  }
  // картинка для отчёта: уменьшаем и пережимаем в JPEG, чтобы влезть в лимит сервера (≈230 КБ в виде текста)
  const SHOT_MAX = 230000;
  async function shrink(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = url; });
      let side = 1280;
      for (let k = 0; k < 6; k++) {
        const sc = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * sc)); c.height = Math.max(1, Math.round(img.naturalHeight * sc));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        for (const q of [0.7, 0.55, 0.4]) { const d = c.toDataURL('image/jpeg', q); if (d.length <= SHOT_MAX) return d; }
        side = Math.round(side * 0.75);
      }
      return null;
    } finally { URL.revokeObjectURL(url); }
  }
  // окно «Сообщить о проблеме»: текст + переключатель отправки отчётов
  function open() {
    const old = document.getElementById('report-modal'); if (old) old.remove();
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const back = document.createElement('div'); back.className = 'modal-back'; back.id = 'report-modal';
    back.innerHTML = `<div class="modal report-card" role="dialog" aria-label="${esc(_t("Сообщить о проблеме"))}"><h3>${esc(_t("Сообщить о проблеме"))}</h3>
      <p class="hint">${esc(_t("Опишите, что случилось и что вы ожидали увидеть. К сообщению автоматически приложатся версия игры, сводка о герое и журнал последнего боя."))}</p>
      <textarea class="report-text" maxlength="1500" rows="5" placeholder="${esc(_t("Например: после «Закалки» камень не поднялся на ступень"))}"></textarea>
      <div class="report-file"><input type="file" class="report-pic" accept="image/*" hidden><button type="button" class="report-attach">${esc(_t("Приложить скриншот"))}</button> <span class="report-pic-name hint"></span></div>
      <label class="report-opt"><input type="checkbox" class="report-on"${enabled() ? ' checked' : ''}> ${esc(_t("Автоматически отправлять разработчику итоги боёв и ошибки"))}</label>
      <p class="hint report-msg" aria-live="polite"></p>
      <div class="reset"><button type="button" class="primary report-send">${esc(_t("Отправить"))}</button> <button type="button" class="report-close">${esc(_t("Закрыть"))}</button></div></div>`;
    const msg = back.querySelector('.report-msg'), ta = back.querySelector('.report-text');
    let pic = null;
    const fileEl = back.querySelector('.report-pic');
    back.querySelector('.report-attach').addEventListener('click', () => fileEl.click());
    fileEl.addEventListener('change', () => {
      const f = fileEl.files && fileEl.files[0]; fileEl.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { msg.textContent = _t("Нужна картинка: скриншот в формате PNG, JPG или WebP. Видео принять не можем — сделайте кадр."); return; }
      pic = f; back.querySelector('.report-pic-name').textContent = f.name; msg.textContent = '';
    });
    back.addEventListener('click', async (ev) => {
      if (ev.target === back || ev.target.closest('.report-close')) { back.remove(); return; }
      if (ev.target.closest('.report-on')) { setEnabled(ev.target.closest('.report-on').checked); return; }
      if (ev.target.closest('.report-send')) {
        const text = ta.value.trim();
        if (!text) { msg.textContent = _t("Напишите пару слов о проблеме."); return; }
        const was = enabled(); if (!was) setEnabled(true);          // сообщение, отправленное вручную, уходит всегда
        let shot = null; if (pic) { try { shot = await shrink(pic); } catch (e) { shot = null; } }
        report(text, shot ? { shot } : null); if (!was) setEnabled(false);
        msg.textContent = _t("Спасибо! Сообщение отправляется."); ta.value = ''; pic = null; back.querySelector('.report-pic-name').textContent = '';
        const ok = await flush(); msg.textContent = ok ? _t("Сообщение отправлено. Спасибо!") : _t("Связи с сервером нет: сообщение сохранено и уйдёт при первой возможности.");
      }
    });
    document.body.appendChild(back);
  }
  const pending = () => readQ().length;
  return { open, enabled, setEnabled, battle, error, report, flush, install, pending, buildBattle, buildError, QKEY, OFFKEY, LINES };
})();
if (typeof window !== 'undefined') Telemetry.install(window);
if (typeof module !== 'undefined') module.exports = Telemetry;
