/* Проверка «до кнопки можно дотронуться пальцем» (1.6.4, WIP-11). Функция выполняется внутри страницы (page.evaluate),
   поэтому не должна ссылаться на внешние переменные. Для каждой видимой активной кнопки проверяет:
   — целиком ли она внутри видимой области (visualViewport);
   — достаточно ли она велика для пальца (touch ? 36 : 24 px);
   — попадают ли 5 контрольных точек (центр и четыре точки у углов, на 20% внутрь) в саму кнопку или её потомка.
   Перекрытые кнопки НЕ отбрасываются, а попадают в отчёт как «blocked» вместе с описанием того, что их закрыло.
   Кнопки под открытым окном (модальный слой поверх всего экрана) считаются закрытыми намеренно: проверяется только верхний слой. */
function hitReport(opts = {}) {
  const out = [];
  const vv = window.visualViewport;
  const X0 = vv ? vv.offsetLeft : 0, Y0 = vv ? vv.offsetTop : 0;
  const X1 = X0 + (vv ? vv.width : innerWidth), Y1 = Y0 + (vv ? vv.height : innerHeight);
  const touch = matchMedia('(pointer:coarse)').matches;
  const MIN = opts.min || (touch ? 36 : 24);
  const visible = (e) => {
    const s = getComputedStyle(e), r = e.getBoundingClientRect();
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05 || r.width < 1 || r.height < 1) return false;
    for (let p = e.parentElement; p; p = p.parentElement) { const ps = getComputedStyle(p); if (ps.display === 'none' || ps.visibility === 'hidden') return false; }
    return true;
  };
  const desc = (e) => e && e.tagName ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') : String(e);
  // верхний слой: если поверх экрана открыто окно, всё, что не внутри него, закрыто намеренно
  const modalSel = '.overlay, .modal, #overlay, dialog[open], .screen-modal';
  const modals = [...document.querySelectorAll(modalSel)].filter((m) => visible(m) && m.getBoundingClientRect().width >= innerWidth * 0.9 && m.getBoundingClientRect().height >= innerHeight * 0.5);
  const topModal = modals.length ? modals[modals.length - 1] : null;
  const sel = 'button, a[href], select, input, summary, [role=button], [data-act], [data-pick], [tabindex]:not([tabindex="-1"])';
  const ctl = [...document.body.querySelectorAll(sel)].filter(visible).filter((e) => !e.disabled && !e.closest('[inert], [aria-hidden=true], .duo-hidden, .credits, .test-x10, label.lvl'));
  const clipAncestor = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (p.scrollHeight > p.clientHeight + 2 || p.scrollWidth > p.clientWidth + 2)) return p; } return null; };
  for (const e of ctl) {
    if (topModal && !topModal.contains(e)) continue;
    if (e.tagName === 'INPUT' && e.type === 'hidden') continue;
    const r = e.getBoundingClientRect();
    const sc = clipAncestor(e);
    if (sc) { const q = sc.getBoundingClientRect(); if (r.bottom < q.top || r.top > q.bottom || r.right < q.left || r.left > q.right) continue; }   // в прокручиваемом списке за кадром — не дефект
    const base = { el: desc(e), text: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24), rect: [r.left, r.top, r.right, r.bottom].map(Math.round).join(',') };
    if (e.matches('summary') && e.closest('.log-wrap')) continue;   // журнал боя — раскрывающийся блок под полем, ниже сгиба по замыслу
    if (sc) { const q = sc.getBoundingClientRect(); if (r.bottom > q.bottom + 1 || r.top < q.top - 1 || r.bottom > Y1 + 1 || r.top < Y0 - 1) continue; }   // кнопка внутри прокручиваемого окна, видна частично — до неё докручивают
    if (r.left < X0 - 1 || r.right > X1 + 1 || r.top < Y0 - 1 || r.bottom > Y1 + 1) { out.push({ ...base, kind: 'offscreen' }); continue; }
    if (Math.min(r.width, r.height) < MIN) out.push({ ...base, kind: 'small', size: Math.round(r.width) + '×' + Math.round(r.height) });
    const pts = [[.5, .5], [.2, .2], [.8, .2], [.2, .8], [.8, .8]];
    const missed = [];
    for (const [rx, ry] of pts) {
      const t = document.elementFromPoint(r.left + r.width * rx, r.top + r.height * ry);
      if (t && t.closest('.modal-back, .overlay, .map-card') && !e.closest('.modal-back, .overlay, .map-card')) continue;   // под открытым окном — закрыто намеренно
      if (!t || !(t === e || e.contains(t) || t.contains(e) && getComputedStyle(t).pointerEvents === 'none')) missed.push(desc(t));
    }
    if (missed.length) out.push({ ...base, kind: 'blocked', missed: missed.length + '/5', by: [...new Set(missed)].slice(0, 3).join(' | ') });
  }
  // игровое поле и таймер
  const B = document.getElementById('board');
  if (B && visible(B)) {
    const c = B.querySelector('.tile'); const rb = B.getBoundingClientRect();
    out.push({ kind: 'info', el: 'board', rect: [rb.left, rb.top, rb.right, rb.bottom].map(Math.round).join(','), cell: c ? Math.round(c.getBoundingClientRect().width) : 0 });
  }
  const T = document.getElementById('turn-timer') || document.querySelector('.turn-timer');
  if (T && visible(T) && T.scrollWidth > T.clientWidth + 1) out.push({ kind: 'clip', el: desc(T), text: T.textContent.trim().slice(0, 30), size: T.scrollWidth + '>' + T.clientWidth });
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push({ kind: 'hscroll', el: 'page', size: document.documentElement.scrollWidth + '>' + innerWidth });
  const ids = {}; for (const e of document.querySelectorAll('[id]')) ids[e.id] = (ids[e.id] || 0) + 1;
  const dup = Object.keys(ids).filter((k) => ids[k] > 1); if (dup.length) out.push({ kind: 'dupid', el: dup.slice(0, 6).join(',') });
  return out;
}
module.exports = { hitReport };
