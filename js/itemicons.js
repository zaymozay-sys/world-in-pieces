if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Иконки предметов и расходников. Рисуются теми же чертежами, что и снаряжение на персонажах
   (parts.js): предмет вырезается из «одежды» гнома и масштабируется по своим границам. */

const ItemIcons = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const frames = {};                       // кэш границ иконок

  const DEFAULT_ID = {
    main: 'sword-novice', off: 'shield-wood', head: 'leather-head', chest: 'leather-chest',
    arms: 'leather-arms', legs: 'leather-legs', amulet: 'amulet-copper',
    shoulders: 'leather-shoulders', gloves: 'leather-gloves', bag: 'bag-satchel', leash: 'leash-rope', compass: 'compass-brass', ranged: 'crossbow-hunt',
  };

  function measure(inner) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '10'); svg.setAttribute('height', '10');
    svg.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden';
    svg.innerHTML = `<g id="m">${inner}</g>`;
    document.body.appendChild(svg);
    const b = svg.querySelector('#m').getBBox();
    svg.remove();
    return b;
  }

  // Содержимое иконки предмета: возвращает { inner, tilt } в координатах фигуры гнома.
  function innerFor(c, it) {
    const A = Figures.anchors('dwarf');
    switch (it.type) {
      case 'head': return Parts.helm(c, A, it);
      case 'chest': return Parts.chest(c, A, it);
      case 'arms': return Parts.armGuards(c, A, it, [A.hL]);
      case 'legs': return Parts.legGuards(c, A, it);
      case 'amulet': return Parts.amulet(c, A, it);
      case 'bag': return Parts.bag(c, A, it);
      case 'leash': return Parts.leash(c, A, it);
      case 'compass': return Parts.compass(c, A, it);
      case 'ranged': return Parts.ranged(c, A, it);
      case 'shoulders': return Parts.pauldrons(c, A, it, true);
      case 'gloves': return Parts.gloves(c, A, it, [A.hL]);
      case 'shield': return Parts.shield(c, A, it, { x: 6, y: 40 });
      default: return `<g transform="rotate(38)">${Parts.weapon(c, it, 0, 0, 0)}</g>`;   // оружие — по диагонали
    }
  }

  function icon(it) {
    const c = Parts.newCtx();
    const inner = innerFor(c, it);
    if (!frames[it.id]) {
      const b = measure(inner);
      const pad = 5, side = Math.max(b.width, b.height) + pad * 2;
      frames[it.id] = [b.x + b.width / 2 - side / 2, b.y + b.height / 2 - side / 2, side];
    }
    const [x, y, s] = frames[it.id];
    return `<svg class="item-icon" viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${s.toFixed(1)} ${s.toFixed(1)}" aria-hidden="true">
      <defs>${Object.values(c.defs).join('')}</defs>${inner}</svg>`;
  }

  function consumable(kind) {
    const c = Parts.newCtx();
    const inner = Parts.consumable(c, kind);
    return `<svg class="item-icon" viewBox="0 0 64 64" aria-hidden="true"><defs>${Object.values(c.defs).join('')}</defs>${inner}</svg>`;
  }

  return { icon, consumable, DEFAULT_ID };
})();

// Иконка предмета (по id) или расходника (potion, elixir, dust, scroll).
function itemIcon(type, color, id) {
  const it = id ? Gear.item(id) : null;
  if (it) return (typeof Art !== 'undefined' && Art.has('items/' + it.id)) ? Art.icon('items/' + it.id) : ItemIcons.icon(it);
  if (Gear.CONSUMABLES[type]) return (typeof Art !== 'undefined' && Art.has('items/' + type)) ? Art.icon('items/' + type) : ItemIcons.consumable(type);
  return '';
}

// Значок пустой ячейки: приглушённый предмет по умолчанию.
function slotIcon(slot) {
  return `<span class="slot-ghost">${itemIcon('', '', ItemIcons.DEFAULT_ID[slot])}</span>`;
}
