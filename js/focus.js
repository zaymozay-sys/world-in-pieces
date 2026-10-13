/* Фокус и клавиатура в окнах (1.6.4, WIP-09): при открытии окна фокус уходит внутрь, фон становится неактивным (inert),
   при закрытии фокус возвращается на прежний элемент — Tab не «убегает» за окно, а после закрытия не теряется.
   1.6.9: на сенсорном экране в окнах с вкладками вкладки переключаются свайпом влево-вправо (swipeTabs). */
const ModalFocus = (() => {
  const stack = [];
  function open(root) {
    if (!root || stack.some((s) => s.root === root)) return;
    const prev = document.activeElement, inerted = [];
    for (const c of document.body.children) {
      if (c === root || c.tagName === 'SCRIPT' || c.inert || c.id === 'toast' || c.classList.contains('sr-only')) continue;
      c.inert = true; inerted.push(c);
    }
    root.setAttribute('tabindex', '-1');
    swipeTabs(root);
    stack.push({ root, prev, inerted });
    setTimeout(() => {
      if (!document.contains(root)) return;
      const t = root.querySelector('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
      try { (t || root).focus({ preventScroll: true }); } catch (e) { /* без фокуса */ }
    }, 0);
  }

  // 1.6.9: свайп по окну переключает вкладки (телефон/планшет). Вкладки берём из первой видимой полосы: сумка на телефоне (.inv-tabs),
  // затем обычная полоса окна (.tabs без .sub), затем подвкладки сумки (.bag-tabs). Края не зацикливаются. Поля ввода, горизонтально
  // прокручиваемые блоки и открытые всплывающие списки жест не запускают.
  const SWIPE_MIN = 70, SWIPE_RATIO = 1.8, SWIPE_MS = 800;
  function swipeStrip(root) {
    const seen = (el) => el && el.offsetParent !== null;
    const tabBtns = (el) => el.querySelectorAll('button[data-itab], button[data-tab], button[data-btab]');
    const cands = [...root.querySelectorAll('.inv-tabs'), ...root.querySelectorAll('.tabs:not(.sub):not(.inv-tabs):not(.bag-tabs)'), ...root.querySelectorAll('.bag-tabs')];
    return cands.find((el) => seen(el) && tabBtns(el).length >= 2) || null;
  }
  function swipeBlocked(target, root) {
    if (root.querySelector('.fam-pop')) return true;
    for (let el = target; el && el !== root; el = el.parentElement) {
      if (!el.tagName) continue;
      if (/^(INPUT|SELECT|TEXTAREA|CANVAS)$/.test(el.tagName) || el.hasAttribute('data-noswipe')) return true;
      if (el.scrollWidth > el.clientWidth + 2) { const ox = getComputedStyle(el).overflowX; if (ox === 'auto' || ox === 'scroll') return true; }
    }
    return false;
  }
  function swipeTabs(root) {
    let g = null;
    root.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || swipeBlocked(e.target, root)) { g = null; return; }
      const t = e.touches[0]; g = { x: t.clientX, y: t.clientY, at: Date.now() };
    }, { passive: true });
    root.addEventListener('touchmove', (e) => { if (g && e.touches.length > 1) g = null; }, { passive: true });
    root.addEventListener('touchend', (e) => {
      const s = g; g = null;
      if (!s || !e.changedTouches.length) return;
      const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (Date.now() - s.at > SWIPE_MS || Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
      const strip = swipeStrip(root); if (!strip) return;
      const btns = [...strip.querySelectorAll('button[data-itab], button[data-tab], button[data-btab]')], i = btns.findIndex((b) => b.classList.contains('on'));
      const j = i + (dx < 0 ? 1 : -1);
      if (i < 0 || j < 0 || j >= btns.length || btns[j].disabled) return;
      btns[j].click();
    }, { passive: true });
  }
  function close(root) {
    const i = stack.findIndex((s) => s.root === root);
    if (i < 0) return;
    const s = stack.splice(i, 1)[0];
    for (const c of s.inerted) c.inert = false;
    if (s.prev && s.prev !== document.body && document.contains(s.prev) && typeof s.prev.focus === 'function') {
      try { s.prev.focus({ preventScroll: true }); } catch (e) { /* без фокуса */ }
    }
  }
  return { open, close, swipeStrip, get depth() { return stack.length; } };
})();
if (typeof module !== 'undefined') module.exports = ModalFocus;
