/* Фокус и клавиатура в окнах (1.6.4, WIP-09): при открытии окна фокус уходит внутрь, фон становится неактивным (inert),
   при закрытии фокус возвращается на прежний элемент — Tab не «убегает» за окно, а после закрытия не теряется. */
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
    stack.push({ root, prev, inerted });
    setTimeout(() => {
      if (!document.contains(root)) return;
      const t = root.querySelector('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
      try { (t || root).focus({ preventScroll: true }); } catch (e) { /* без фокуса */ }
    }, 0);
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
  return { open, close, get depth() { return stack.length; } };
})();
if (typeof module !== 'undefined') module.exports = ModalFocus;
