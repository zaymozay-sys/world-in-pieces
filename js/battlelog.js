/* 2.0.7: порядковый номер боя и хранение журналов последних боёв — для разбора жалоб и анализа.
   Хранится в localStorage этого браузера (не в сохранении героя): последние MAX боёв, не более LINES строк в каждом.
   Номер выдаётся при начале каждого боя (кроме обучения) и показывается на экране итога: «Бой № N». */
const BattleLog = (() => {
  const SEQ = 'wip-battle-seq', LOG = 'wip-battle-logs', MAX = 30, LINES = 400;
  const store = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
  const read = (k, d) => { const s = store(); if (!s) return d; try { const v = JSON.parse(s.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => { const s = store(); if (!s) return false; try { s.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  let mem = 0;                                                      // без localStorage номера идут в пределах сессии
  const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);   // испорченный счётчик (строка, объект, NaN) = 0
  const next = () => { const n = Math.max(num(read(SEQ, 0)), mem) + 1; mem = n; write(SEQ, n); return n; };
  const list = () => { const a = read(LOG, []); return Array.isArray(a) ? a.filter((e) => e && Number.isInteger(e.n) && Array.isArray(e.lines)) : []; };   // не массив / запись без строк — игнорируется
  const get = (n) => list().find((e) => e.n === Number(n)) || null;
  // entry: { n, foe, tier, result, hero, lines: [{side, text}] }; повторная запись того же номера заменяет прежнюю
  function save(entry) {
    if (!entry || !Number.isInteger(entry.n)) return false;
    const lines = (entry.lines || []).slice(-LINES).map((r) => (r.side === 'left' ? 'L|' : 'R|') + String(r.text));
    const rec = { n: entry.n, ts: entry.ts || Date.now(), foe: String(entry.foe || ''), tier: entry.tier || 0, result: entry.result || '', hero: String(entry.hero || ''), lines };
    let all = list().filter((e) => e.n !== rec.n); all.push(rec); all.sort((a, b) => a.n - b.n);
    while (all.length > MAX) all.shift();
    while (!write(LOG, all) && all.length > 1) all.shift();         // не хватило места — выбрасываем самые старые
    return true;
  }
  const text = (e) => `Бой № ${e.n} · ${new Date(e.ts).toLocaleString()} · ${e.hero} — ${e.foe} (${e.tier}) · ${e.result}\n` + e.lines.map((l, i) => `${i + 1}. ${l.slice(2)}`).join('\n');
  const clear = () => { const s = store(); if (s) try { s.removeItem(LOG); } catch (e) { /* ничего */ } };

  // Окно «Журналы боёв»: список последних боёв, показать и скопировать журнал выбранного боя.
  function copy(t, done) {
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* ничего */ } ta.remove(); done(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
  }
  function open() {
    const old = document.getElementById('battlelog-modal'); if (old) old.remove();
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const all = list().slice().reverse();
    const res = { win: _t("победа"), loss: _t("поражение") };
    const back = document.createElement('div'); back.className = 'modal-back'; back.id = 'battlelog-modal';
    back.innerHTML = `<div class="modal battlelog-card" role="dialog" aria-label="${esc(_t("Журналы боёв"))}"><h3>${esc(_t("Журналы боёв"))}</h3>
      <p class="hint">${esc(_t("Хранятся последние {0} боёв в этом браузере. Номер боя виден на экране итога: по нему можно найти журнал и скопировать его для разбора.", [MAX]))}</p>
      <div class="bl-list">${all.length ? all.map((e) => `<div class="bl-row" data-n="${e.n}"><button type="button" class="bl-open"><b>№ ${e.n}</b> · ${esc(e.foe)} · ${esc(res[e.result] || e.result)} · <small>${esc(new Date(e.ts).toLocaleString())}</small></button><div class="bl-body" hidden><button type="button" class="bl-copy">${esc(_t("Копировать журнал"))}</button><ol></ol></div></div>`).join('') : `<p>${esc(_t("Пока нет сохранённых боёв."))}</p>`}</div>
      <div class="reset"><button type="button" class="primary bl-close">${esc(_t("Закрыть"))}</button></div></div>`;
    back.addEventListener('click', (ev) => {
      if (ev.target === back || ev.target.closest('.bl-close')) { back.remove(); return; }
      const row = ev.target.closest('.bl-row'); if (!row) return; const e = get(row.dataset.n); if (!e) return;
      if (ev.target.closest('.bl-copy')) { const b = ev.target.closest('.bl-copy'); copy(text(e), () => { b.textContent = _t("Скопировано"); }); return; }
      if (ev.target.closest('.bl-open')) {
        const body = row.querySelector('.bl-body'), ol = body.querySelector('ol');
        if (body.hidden && !ol.children.length) for (const l of e.lines) { const li = document.createElement('li'); li.className = l[0] === 'L' ? 'left' : 'right'; li.textContent = l.slice(2); ol.appendChild(li); }
        body.hidden = !body.hidden;
      }
    });
    document.body.appendChild(back);
  }
  return { MAX, LINES, next, list, get, save, text, clear, open };
})();
if (typeof module !== 'undefined') module.exports = BattleLog;
