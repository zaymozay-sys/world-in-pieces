if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Графика карты: заливки местности, мелкие детали (деревья, горы, волны, камыш),
   здания деревни и частокол. Все рисунки — SVG в координатах карты (радиус соты SIZE). */

const MapArt = (() => {
  const O = '#1b1510';
  const T = {                         // светлый, основной, тёмный
    meadow:   ['#a2c064', '#7f9d4f', '#5c7838'],
    forest:   ['#5e8a49', '#44703c', '#2c502d'],
    hills:    ['#bda46b', '#9d8857', '#725e3a'],
    swamp:    ['#74825c', '#58684b', '#3b4a37'],
    water:    ['#5790bf', '#316390', '#1d4268'],
    mountain: ['#948e87', '#716c66', '#4c4843'],
    village:  ['#b09b70', '#927e5b', '#6b5a40'],
    castle:   ['#9a9aa2', '#7a7a84', '#56565f'],   // 1.8.6: двор замка (мини-карта)
    sea:      ['#3f86b8', '#1f5f94', '#123f69'],
    beach:    ['#eadcab', '#d9c78c', '#b5a06a'],
    cobble:   ['#b3a68c', '#9a8c72', '#7a6d56'],   // 1.3.0: мощёные улица и площадь города
    // 1.7.1: новые местности
    field:    ['#d0c46e', '#b8a850', '#8f8036'],
    tundra:   ['#cdd5b6', '#aab694', '#7e8b6e'],
    snow:     ['#f6f9fc', '#dde7f1', '#b1c2d4'],
    sand:     ['#f2dc9f', '#dec077', '#b9984f'],
    badlands: ['#d79c6b', '#b77a4c', '#8a5430'],
    darkwood: ['#475a50', '#2e403a', '#1a2724'],
    ash:      ['#8d8883', '#6a6560', '#46423e'],
  };

  function defs() {
    const grads = Object.entries(T).map(([k, [l, m, d]]) =>
      `<radialGradient id="t-${k}" cx=".42" cy=".38" r=".75"><stop offset="0" stop-color="${l}"/><stop offset=".6" stop-color="${m}"/><stop offset="1" stop-color="${d}"/></radialGradient>`).join('');
    // Настоящие рисунки из art/map/ вместо встроенных SVG, если файл есть.
    const ART_SYM = {
      's-tree': ['map/oak', 22], 's-pine': ['map/pine', 22], 's-peak': ['map/peak', 34], 's-reed': ['map/reeds', 20], 's-rock': ['map/rocks', 13],
      // 1.7.1: спрайты новых местностей (art/map/<имя>.webp); пока файла нет — рисуются встроенные значки. Третье число 1 — плоский рисунок на земле
      's-snowpine': ['map/snowpine', 22], 's-drift': ['map/drift', 24, 1], 's-tuft': ['map/tuft', 12], 's-dune': ['map/dune', 26, 1], 's-cactus': ['map/cactus', 20],
      's-mesa': ['map/mesa', 28], 's-darktree': ['map/darktree', 24], 's-shroom': ['map/shroom', 11], 's-stump': ['map/stump', 14], 's-crack': ['map/crack', 22, 1],
      's-furrow': ['map/furrow', 30, 1], 's-hay': ['map/hay', 18], 's-ford': ['map/ford', 26, 1], 's-hill': ['map/hill', 26], 's-puddle': ['map/puddle', 18, 1],
      's-grass': ['map/grass', 10], 's-flower': ['map/flowers', 11],
    };
    const sym = (id, body) => {
      const a = ART_SYM[id];
      if (a && typeof Art !== 'undefined' && Art.has(a[0])) {
        const z = a[1];
        body = a[2]
          ? `<image href="${Art.url(a[0])}" x="${-z / 2}" y="${-z / 2}" width="${z}" height="${z}" preserveAspectRatio="xMidYMid meet"/>`
          : `<ellipse cy="${(z * 0.32).toFixed(1)}" rx="${(z * 0.3).toFixed(1)}" ry="${(z * 0.09).toFixed(1)}" fill="#000" opacity=".25"/><image href="${Art.url(a[0])}" x="${-z / 2}" y="${(-z * 0.62).toFixed(1)}" width="${z}" height="${z}" preserveAspectRatio="xMidYMid meet"/>`;
      }
      return `<symbol id="${id}" overflow="visible">${body}</symbol>`;
    };
    // 1.2.8: местность из картинок-текстур (art/map/tex-<местность>), если файл есть; иначе градиент.
    // Текстуры бесшовные — обычная плитка; z — размер плитки в пикселях карты.
    const TEX = { sea: 260, water: 200, river: 200, swamp: 200, beach: 180, village: 220, cobble: 160, meadow: 200, forest: 200, hills: 200, mountain: 200, road: 160,
      field: 200, tundra: 200, snow: 200, sand: 200, badlands: 200, darkwood: 200, ash: 200 };   // 1.7.1: подключены луг, лес, холмы, горы и дорога; новые местности — по мере появления файлов
    let tex = '', drop = [];
    for (const [k, z] of Object.entries(TEX)) {
      if (typeof Art === 'undefined' || !Art.has('map/tex-' + k)) continue;
      drop.push(k);
      tex += `<pattern id="t-${k}" patternUnits="userSpaceOnUse" width="${z}" height="${z}"><image href="${Art.url('map/tex-' + k)}" width="${z}" height="${z}"/></pattern>`;
    }
    let g = grads;
    for (const k of drop) g = g.replace(new RegExp(`<radialGradient id="t-${k}"[^]*?<\\/radialGradient>`), '');
    return g + tex + `
      <radialGradient id="fog-g" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#15171c"/><stop offset="1" stop-color="#0b0c0f"/></radialGradient>
      <radialGradient id="glow-win" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".62"/><stop offset=".55" stop-color="#ff9a3c" stop-opacity=".22"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>
      <radialGradient id="glow-door" cx=".5" cy=".6" r=".6"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#e0661c"/></radialGradient>
      <clipPath id="clip-token"><circle r="21"/></clipPath>
      ${sym('s-tree', `<ellipse cy="7" rx="6" ry="2" fill="#000" opacity=".28"/><rect x="-1.3" y="0" width="2.6" height="7" fill="#5b3b22"/>
        <circle cy="-3" r="7" fill="#3c7536" stroke="${O}" stroke-width=".8"/><circle cx="-2.4" cy="-5.4" r="3.2" fill="#62a452" opacity=".9"/>`)}
      ${sym('s-pine', `<ellipse cy="8" rx="5.5" ry="2" fill="#000" opacity=".28"/><rect x="-1.2" y="3" width="2.4" height="5" fill="#4a2f1a"/>
        <path d="M0 -13 L7 -2 L3.5 -2 L8 5 L-8 5 L-3.5 -2 L-7 -2Z" fill="#2f5a34" stroke="${O}" stroke-width=".8"/><path d="M0 -13 L-3 -7 L1 -6Z" fill="#5c8e56"/>`)}
      ${sym('s-peak', `<path d="M-16 9 L-3 -14 L3 -5 L7 -10 L18 9Z" fill="#88827b" stroke="#2e2a27" stroke-width="1"/>
        <path d="M-3 -14 L3 -5 L-1 9 L-16 9Z" fill="#a39d95"/><path d="M-3 -14 L-7 -7 L-4 -8 L-2 -5 L0 -8 L3 -5Z" fill="#f6f7f9"/><path d="M7 -10 L4 -5.5 L7 -6.5 L9 -5Z" fill="#f6f7f9"/>`)}
      ${sym('s-hill', `<path d="M-13 6 Q-5 -9 7 6Z" fill="#b19a64" stroke="#5f4d30" stroke-width=".9"/><path d="M-6 6 Q3 -5 13 6Z" fill="#9b8554" stroke="#5f4d30" stroke-width=".9"/><path d="M-9 1 Q-6 -4 -2 -3" stroke="#d6c28e" stroke-width="1.2" fill="none"/>`)}
      ${sym('s-reed', `<path d="M-2 5 Q-3 -3 -5 -8 M0 5 V-10 M2 5 Q3 -2 6 -7" stroke="#6b7c3e" stroke-width="1.1" fill="none"/><rect x="-1" y="-10" width="2" height="5" rx="1" fill="#6b4424"/>`)}
      ${sym('s-puddle', `<ellipse rx="8" ry="3.4" fill="#3d6468" stroke="#2a3f3c" stroke-width=".7"/><ellipse cx="-2" cy="-1" rx="3" ry="1" fill="#9cc7c4" opacity=".6"/>`)}
      ${sym('s-wave', `<path d="M-8 0 q2 -3 4 0 t4 0 t4 0 t4 0" stroke="#bfe0f5" stroke-width="1.2" fill="none" opacity=".75"/>`)}
      ${sym('s-grass', `<path d="M-3 3 L-2 -3 M0 3 L0 -4 M3 3 L2 -3" stroke="#5a7a33" stroke-width="1.1"/>`)}
      ${sym('s-flower', `<circle cx="-3" cy="0" r="1.3" fill="#f2e16b"/><circle cx="2" cy="-2" r="1.3" fill="#f6f6f6"/><circle cx="3" cy="2" r="1.3" fill="#e57a9b"/>`)}
      ${sym('s-shell', `<path d="M-3 2 Q-3 -3 0 -4 Q3 -3 3 2Z" fill="#f3d9d0" stroke="#a07a6a" stroke-width=".7"/><path d="M0 -4 V2 M-1.6 -3 L-1.4 2 M1.6 -3 L1.4 2" stroke="#c79c8c" stroke-width=".5"/>`)}
      ${sym('s-rock', `<path d="M-5 3 L-3 -2 L2 -3 L5 1 L3 3Z" fill="#8c8a85" stroke="#3f3d39" stroke-width=".8"/><path d="M-3 -2 L2 -3 L0 0Z" fill="#b5b3ad"/>`)}
      ${sym('s-snowpine', `<ellipse cy="8" rx="5.5" ry="2" fill="#6b7f95" opacity=".35"/><rect x="-1.2" y="3" width="2.4" height="5" fill="#4a3a2a"/>
        <path d="M0 -13 L7 -2 L3.5 -2 L8 5 L-8 5 L-3.5 -2 L-7 -2Z" fill="#3d6a55" stroke="${O}" stroke-width=".8"/><path d="M0 -13 L5 -4 L-5 -4Z M-3.5 -1 L3.5 -1 L6 3 L-6 3Z" fill="#f4f8fc" opacity=".92"/>`)}
      ${sym('s-drift', `<path d="M-11 4 Q-6 -5 0 1 Q5 -4 11 4Z" fill="#fff" stroke="#9db2c8" stroke-width=".9"/><path d="M-6 2 Q-3 -1 0 2" stroke="#c9d8e6" stroke-width=".9" fill="none"/>`)}
      ${sym('s-tuft', `<path d="M-4 3 L-3 -2 M-1 3 L-1 -4 M2 3 L3 -2 M5 3 L5 -1" stroke="#7d8a5a" stroke-width="1.1"/>`)}
      ${sym('s-snowpatch', `<ellipse rx="8" ry="3" fill="#f3f7fb" stroke="#aebdcd" stroke-width=".7"/><ellipse cx="-2" cy="-.6" rx="3" ry="1" fill="#fff"/>`)}
      ${sym('s-dune', `<path d="M-12 4 Q-6 -5 2 0 Q7 3 12 -1" stroke="#b08a43" stroke-width="1.2" fill="none"/><path d="M-12 4 Q-6 -5 2 0 L2 5 L-12 5Z" fill="#cfae65" opacity=".45"/>`)}
      ${sym('s-cactus', `<ellipse cy="8" rx="4" ry="1.5" fill="#000" opacity=".22"/><rect x="-2" y="-7" width="4" height="15" rx="2" fill="#4f8a49" stroke="${O}" stroke-width=".8"/><path d="M-2 0 H-5 V-5 M2 -2 H5 V-7" stroke="#4f8a49" stroke-width="2.6" fill="none" stroke-linecap="round"/>`)}
      ${sym('s-mesa', `<path d="M-11 8 L-9 -4 L-4 -7 L6 -7 L10 -3 L12 8Z" fill="#a8603a" stroke="${O}" stroke-width=".9"/><path d="M-9 -4 L-4 -7 L6 -7 L10 -3 L-9 -1Z" fill="#cf8a5c"/><path d="M-6 0 H8 M-7 4 H10" stroke="#7d4528" stroke-width=".8" opacity=".7"/>`)}
      ${sym('s-darktree', `<ellipse cy="8" rx="5" ry="1.8" fill="#000" opacity=".35"/><path d="M-1.5 8 Q-2 0 -3 -4 M1.5 8 Q2 1 4 -5" stroke="#2a1f2a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <circle cx="-3" cy="-6" r="5.5" fill="#25362f" stroke="${O}" stroke-width=".8"/><circle cx="4" cy="-8" r="5" fill="#2c4036" stroke="${O}" stroke-width=".8"/><circle cx="-4" cy="-8" r="2" fill="#3e5a4a" opacity=".8"/>`)}
      ${sym('s-shroom', `<rect x="-.9" y="0" width="1.8" height="4" fill="#cfc6dc"/><path d="M-4 1 Q0 -6 4 1Z" fill="#8c6cc4" stroke="${O}" stroke-width=".7"/><circle cx="-1" cy="-1.4" r=".7" fill="#e8dcff"/><circle cx="1.6" cy="-.4" r=".6" fill="#e8dcff"/>`)}
      ${sym('s-stump', `<ellipse cy="5" rx="4.5" ry="1.6" fill="#000" opacity=".3"/><path d="M-3 5 L-3.5 -2 L-1 -4 L1 -2 L3 -5 L3.5 5Z" fill="#2c2825" stroke="${O}" stroke-width=".8"/><path d="M-1 -4 L1 -2" stroke="#e0632a" stroke-width=".8"/>`)}
      ${sym('s-crack', `<path d="M-9 2 L-4 0 L-2 3 L3 0 L6 4 M-2 3 L-3 7" stroke="#d9531e" stroke-width="1.1" fill="none" opacity=".85"/><path d="M-9 2 L-4 0 L-2 3 L3 0 L6 4" stroke="#ffb15a" stroke-width=".4" fill="none"/>`)}
      ${sym('s-furrow', `<path d="M-13 -5 H13 M-13 0 H13 M-13 5 H13" stroke="#8a7a30" stroke-width="1.5" opacity=".75"/><path d="M-13 -2.5 H13 M-13 2.5 H13" stroke="#e4d98a" stroke-width=".8" opacity=".55"/>`)}
      ${sym('s-hay', `<ellipse cy="5" rx="7" ry="2" fill="#000" opacity=".22"/><path d="M-6 5 Q-7 -4 0 -7 Q7 -4 6 5Z" fill="#e0b84a" stroke="${O}" stroke-width=".8"/><path d="M-3 4 Q-3 -2 0 -5 M2 4 Q3 -2 0 -5" stroke="#b58a26" stroke-width=".7" fill="none"/>`)}
      ${sym('s-ford', `<ellipse cx="-7" cy="1" rx="3.4" ry="2.2" fill="#a9a59d" stroke="${O}" stroke-width=".8"/><ellipse cx="0" cy="-1" rx="3.6" ry="2.3" fill="#b9b5ad" stroke="${O}" stroke-width=".8"/><ellipse cx="7" cy="1.5" rx="3.4" ry="2.2" fill="#a29e96" stroke="${O}" stroke-width=".8"/>`)}
      ${sym('s-ripple', `<path d="M-5 0 q1.5 -2 3 0 t3 0 t3 0" stroke="#d5ecf8" stroke-width="1" fill="none" opacity=".7"/>`)}
      ${sym('s-cobble', `<circle cx="-6" cy="-4" r="1.6" fill="#7a6a50"/><circle cx="4" cy="-6" r="1.4" fill="#7a6a50"/><circle cx="6" cy="4" r="1.6" fill="#7a6a50"/><circle cx="-4" cy="6" r="1.3" fill="#7a6a50"/>`)}`;
  }

  // Детали внутри соты. rand — генератор, привязанный к соте.
  function deco(cell, rand) {
    const at = (sym, x, y, s = 1) => `<use href="#${sym}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})${s !== 1 ? ` scale(${s})` : ''}"/>`;
    const j = (k) => (rand() - 0.5) * k;
    switch (cell.terrain) {
      case 'forest': {
        const spots = [[-8, -5], [7, -7], [-1, 6], [9, 6], [-10, 7]];
        return spots.slice(0, 3 + Math.floor(rand() * 2)).sort((a, b) => a[1] - b[1])
          .map(([x, y]) => at(rand() < 0.5 ? 's-pine' : 's-tree', x + j(4), y + j(3), 0.85 + rand() * 0.3)).join('');
      }
      case 'hills': return at('s-hill', j(6) - 2, j(4) - 3, 1) + (rand() < 0.6 ? at('s-hill', j(4) + 6, 8, 0.7) : '');
      case 'mountain': return at('s-peak', j(4), j(3) - 1, 1.05) + (rand() < 0.5 ? at('s-peak', 11, 9, 0.5) : '');
      case 'sea': return at('s-wave', j(6) - 5, -6 + j(3), 1.2) + at('s-wave', j(6) + 3, 5 + j(3), 1.2) + (rand() < 0.3 ? at('s-wave', j(8), j(6), 0.8) : '');
      case 'beach': return (rand() < 0.5 ? at('s-shell', j(22), j(18)) : '') + (rand() < 0.25 ? at('s-rock', j(20), j(16), 0.7) : '') + (rand() < 0.2 ? at('s-wave', j(8) - 6, 9, 0.6) : '');
      case 'water': return at('s-wave', j(6) - 4, -5 + j(3)) + at('s-wave', j(6) + 2, 6 + j(3));
      case 'swamp': return at('s-puddle', j(6), j(5)) + at('s-reed', -9 + j(3), 4) + at('s-reed', 9 + j(3), -3);
      case 'meadow': {
        let out = '';
        const x = rand();
        if (x < 0.45) out += at('s-grass', j(24), j(20));
        if (x < 0.2) out += at('s-grass', j(24), j(20));
        if (rand() < 0.16) out += at('s-flower', j(20), j(18));
        if (rand() < 0.08) out += at('s-rock', j(20), j(18));
        return out;
      }
      case 'river': return cell.ford ? at('s-ford', 0, 1) : '';
      case 'field': {
        const ang = [0, 60, 120][Math.floor(rand() * 3)];
        return `<g transform="rotate(${ang})" opacity=".9">${at('s-furrow', 0, 0, 1.05)}</g>` + (rand() < 0.13 ? at('s-hay', j(14), j(12), 0.9) : '');
      }
      case 'tundra': return at('s-tuft', j(20), j(16)) + (rand() < 0.5 ? at('s-tuft', j(20), j(16)) : '') + (rand() < 0.3 ? at('s-snowpatch', j(16), j(12)) : '') + (rand() < 0.1 ? at('s-rock', j(18), j(14), 0.8) : '');
      case 'snow': return at('s-drift', j(10) - 3, j(6) + 4, 1) + (rand() < 0.35 ? at('s-snowpine', j(16), j(8) - 3, 0.9) : '') + (rand() < 0.2 ? at('s-snowpine', j(18), j(8) + 2, 0.7) : '') + (rand() < 0.4 ? at('s-drift', j(8) + 6, -6, 0.6) : '');
      case 'sand': return at('s-dune', j(8) - 2, j(8) - 2) + (rand() < 0.4 ? at('s-dune', j(8) + 2, j(6) + 6, 0.8) : '') + (rand() < 0.14 ? at('s-cactus', j(16), j(8) - 2, 0.9) : '') + (rand() < 0.06 ? at('s-rock', j(18), j(14), 0.7) : '');
      case 'badlands': return (rand() < 0.55 ? at('s-mesa', j(10) - 1, j(6), 0.85) : at('s-rock', j(14), j(10), 1.2)) + (rand() < 0.4 ? at('s-rock', j(18), j(14), 0.8) : '') + (rand() < 0.3 ? at('s-dune', j(6), 7, 0.6) : '');
      case 'darkwood': {
        const spots = [[-8, -5], [7, -7], [-1, 6], [9, 6], [-10, 7]];
        return spots.slice(0, 3 + Math.floor(rand() * 2)).sort((a, b) => a[1] - b[1]).map(([x, y]) => at('s-darktree', x + j(4), y + j(3), 0.85 + rand() * 0.3)).join('') + (rand() < 0.3 ? at('s-shroom', j(16), 8 + j(3)) : '');
      }
      case 'ash': return (rand() < 0.35 ? at('s-stump', j(16), j(10)) : '') + (rand() < 0.45 ? at('s-crack', j(10), j(10)) : '') + (rand() < 0.3 ? at('s-rock', j(18), j(14), 0.8) : '') + (rand() < 0.4 ? at('s-tuft', j(20), j(16), 0.8) : '');
      case 'village': return cell.building ? '' : at('s-cobble', 0, 0);
      default: return '';
    }
  }

  /* ---------- здания ---------- */
  const shadow = '';                    // 1.2.7: тени-пятна под зданиями убраны (решение владельца)
  const house = (wall, roof, w = 30, h = 18) => `
    <rect x="${-w / 2}" y="${16 - h}" width="${w}" height="${h}" fill="${wall}" stroke="${O}" stroke-width="1"/>
    <path d="M${-w / 2 - 4} ${18 - h} L0 ${-2 - h} L${w / 2 + 4} ${18 - h}Z" fill="${roof}" stroke="${O}" stroke-width="1"/>
    <path d="M${-w / 2 - 1} ${16 - h} L0 ${-h} " stroke="#fff" stroke-width="1" opacity=".25"/>`;
  const door = (x = 0, glow = false) => `<rect x="${x - 3.5}" y="7" width="7" height="9" rx="3.2" fill="${glow ? 'url(#glow-door)' : '#3a2614'}" stroke="${O}" stroke-width=".8"/>`;
  const win = (x, y) => `<rect x="${x - 2.6}" y="${y - 2.6}" width="5.2" height="5.2" fill="#ffd98a" stroke="${O}" stroke-width=".7"/><path d="M${x} ${y - 2.6} V${y + 2.6} M${x - 2.6} ${y} H${x + 2.6}" stroke="${O}" stroke-width=".5"/>`;

  const B = {
    hall: () => `${shadow}
      ${house('#c9c1b0', '#4b6196', 36, 20)}${door(0)}${win(-11, 3)}${win(11, 3)}
      <circle cx="0" cy="-8" r="4" fill="#efe6cf" stroke="${O}" stroke-width=".8"/><path d="M0 -8 V-10.5 M0 -8 H2" stroke="${O}" stroke-width=".8"/>
      <path d="M-19 16 H19" stroke="#6b6559" stroke-width="2"/>
      <rect x="-21" y="0" width="4" height="16" fill="#b0a894" stroke="${O}" stroke-width=".7"/><rect x="17" y="0" width="4" height="16" fill="#b0a894" stroke="${O}" stroke-width=".7"/>`,
    shop: () => `${shadow}${house('#c9a36a', '#8a4a2a')}${door(-6)}${win(8, 5)}
      <path d="M-17 -1 H17 L15 5 H-15Z" fill="#fff" stroke="${O}" stroke-width=".8"/>
      ${[-15, -9, -3, 3, 9].map((x) => `<path d="M${x} -1 H${x + 3} L${x + 2.6} 5 H${x - 0.4}Z" fill="#c83a32"/>`).join('')}
      <circle cx="0" cy="-8" r="4.3" fill="#e9c24a" stroke="${O}" stroke-width=".8"/><circle cx="0" cy="-8" r="2.4" fill="none" stroke="#9c7a18" stroke-width=".8"/>`,
    forge: () => `${shadow}
      <rect x="7" y="-24" width="7" height="22" fill="#6d6863" stroke="${O}"/>
      <g class="smoke"><circle cx="10.5" cy="-28" r="3.5" fill="#bfbab4" opacity=".7"/><circle cx="13" cy="-34" r="4.5" fill="#d3cfca" opacity=".55"/><circle cx="9" cy="-41" r="5" fill="#e4e1dd" opacity=".4"/></g>
      ${house('#8f8a82', '#43403c', 32, 18)}${door(-5, true)}
      <path d="M4 5 h9 l-1.5 2.5 h-2 v3 h2.5 v1.5 h-7 v-1.5 h2.5 v-3 h-2Z" fill="#2c2c30"/>
      ${[-15, -9, 9, 15].map((x) => `<rect x="${x - 2}" y="-1" width="4" height="3" fill="#77726b" stroke="${O}" stroke-width=".5"/>`).join('')}`,
    hunter: () => `${shadow}
      <rect x="-15" y="-2" width="30" height="18" fill="#7a5230" stroke="${O}"/>
      ${[1, 5, 9, 13].map((y) => `<path d="M-15 ${y} H15" stroke="#4d3219" stroke-width="1"/>`).join('')}
      ${[-15, 15].map((x) => `<circle cx="${x}" cy="1" r="1.3" fill="#a07a4f"/><circle cx="${x}" cy="5" r="1.3" fill="#a07a4f"/><circle cx="${x}" cy="9" r="1.3" fill="#a07a4f"/>`).join('')}
      <path d="M-19 0 L0 -18 L19 0Z" fill="#3e6a3a" stroke="${O}"/>${door(-5)}${win(8, 5)}
      <path d="M0 -6 q-5 -2 -7 -8 M-3.5 -7.5 l-2 -4 M0 -6 q5 -2 7 -8 M3.5 -7.5 l2 -4" stroke="#efe4c8" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    home: () => `${shadow}${house('#e6d9bf', '#a83a2e')}
      <path d="M-15 -2 L15 16 M15 -2 L-15 16" stroke="#6b4a2b" stroke-width="1" opacity=".0"/>
      <path d="M-15 5 H15 M-8 -2 V16 M8 -2 V16" stroke="#6b4a2b" stroke-width="1.4"/>${door(0)}${win(-11, 2)}${win(11, 2)}
      <path d="M8 -12 V-20 M8 -20 L15 -17.5 L8 -15Z" stroke="${O}" stroke-width=".8" fill="#4a86e8"/>`,
    // 1.2.6: заглушки новых усадеб (пока без картинок): питомник с загоном и будкой, алхимик с колбой и котлом
    kennel: () => `${shadow}${house('#b89a6a', '#5a7a3a', 26, 16)}${door(-3)}${win(8, 5)}
      <path d="M-22 16 V8 M-16 16 V8 M-22 10 H-12 M-22 14 H-12" stroke="#6b4a2b" stroke-width="1.4"/>
      <path d="M14 16 V10 L19 6 L24 10 V16Z" fill="#8a5a32" stroke="${O}" stroke-width=".8"/><path d="M17.5 16 v-3.5 a1.5 1.5 0 0 1 3 0 V16" fill="#2a1a0e"/>
      <path d="M-5 -6 q2 -3 5 0 q3 -3 5 0 l-5 5z" fill="#e06a5a" stroke="${O}" stroke-width=".6"/>`,
    alchemist: () => `${shadow}${house('#a99ac2', '#3f2f62', 28, 18)}${door(-5, true)}${win(8, 4)}
      <path d="M-2 -18 h4 v5 l5 8 q1 3 -2 3 h-10 q-3 0 -2 -3 l5 -8z" fill="#6ee08a" stroke="${O}" stroke-width=".8"/>
      <circle cx="1" cy="-21" r="1.4" fill="#bff5c9" opacity=".8"/><circle cx="-1" cy="-25" r="1.8" fill="#bff5c9" opacity=".55"/>
      <path d="M13 16 q0 -6 5 -6 q5 0 5 6z" fill="#2c2c30" stroke="${O}" stroke-width=".8"/><circle cx="18" cy="9" r="1.6" fill="#6ee08a"/>`,
    tavern: () => `${shadow}
      <rect x="-15" y="-14" width="30" height="30" fill="#d4b88a" stroke="${O}"/>
      <path d="M-15 -4 H15 M-5 -14 V-4 M5 -14 V-4" stroke="#6b4a2b" stroke-width="1.3"/>
      <path d="M-19 -12 L0 -28 L19 -12Z" fill="#6b4226" stroke="${O}"/>${door(-5)}${win(8, 5)}${win(-9, -9)}${win(9, -9)}
      <path d="M15 -2 H22 V1" stroke="${O}" stroke-width="1" fill="none"/><path d="M19 1 h6 v6 q0 2 -3 2 q-3 0 -3 -2z" fill="#e9c24a" stroke="${O}" stroke-width=".8"/><path d="M25 2.5 q2.5 0 2.5 2 q0 2 -2.5 2" stroke="${O}" fill="none" stroke-width=".8"/>`,
    mill: () => `${shadow}${house('#c2a878', '#6b4a2b', 26, 18)}${door(-4)}${win(7, 4)}
      <circle cx="12" cy="-7" r="1.7" fill="${O}"/>
      <g class="sails" style="transform-origin: 12px -7px;">
        <path d="M12 -7 L12 -22 L15 -19.5Z" fill="#e8dcc0" stroke="${O}" stroke-width=".7"/>
        <path d="M12 -7 L27 -7 L24.5 -4Z" fill="#e8dcc0" stroke="${O}" stroke-width=".7"/>
        <path d="M12 -7 L12 8 L9 5.5Z" fill="#e8dcc0" stroke="${O}" stroke-width=".7"/>
        <path d="M12 -7 L-3 -7 L-0.5 -10Z" fill="#e8dcc0" stroke="${O}" stroke-width=".7"/>
      </g>
      <rect x="-13" y="9" width="6" height="7" rx="1" fill="#d8bd82" stroke="${O}" stroke-width=".6"/><rect x="-6" y="10.5" width="6" height="5.5" rx="1" fill="#c9a869" stroke="${O}" stroke-width=".6"/>`,
    junker: () => `${shadow}
      ${house('#8a7f6e', '#5a4a38', 26, 16)}${door(-4)}${win(7, 3)}
      <path d="M-6 -10 L-2 -13 L2 -10Z" fill="#8a6a3a" opacity=".85"/><path d="M4 -11 L8 -14 L11 -11Z" fill="#5c7a4a" opacity=".85"/>
      <circle cx="-16" cy="11" r="5" fill="none" stroke="#3a332b" stroke-width="1.6"/>
      <path d="M-16 6 V16 M-21 11 H-11 M-19.5 7.5 L-12.5 14.5 M-19.5 14.5 L-12.5 7.5" stroke="#3a332b" stroke-width="1"/>
      <rect x="12" y="6" width="8" height="7" fill="#7a6a4a" stroke="${O}" stroke-width=".7"/>
      <rect x="11" y="1" width="7" height="6" fill="#8a7550" stroke="${O}" stroke-width=".7"/>
      <ellipse cx="16.5" cy="13" rx="4.5" ry="1.4" fill="#000" opacity=".2"/>`,
    library: () => `${shadow}
      ${house('#a8916a', '#4b3a2c', 30, 20)}${door(-4)}${win(9, 4)}
      <path d="M-17 -4 Q-17 -17 -8 -19 L-8 -4Z" fill="#8a7355" stroke="${O}" stroke-width=".8"/>
      ${[-6, -9, -12, -15].map((y) => `<path d="M-15 ${y} H-10" stroke="#4b3a2c" stroke-width=".9"/>`).join('')}
      <circle cx="9" cy="-11" r="4.6" fill="#efe6cf" stroke="${O}" stroke-width=".8"/><path d="M9 -11 h2.4 M9 -11 v-2.4" stroke="${O}" stroke-width=".8"/>
      <rect x="-13" y="9" width="7" height="4.5" rx="1" fill="#6b4a2b" stroke="${O}" stroke-width=".6"/>
      <rect x="-6" y="10.2" width="7" height="3.3" rx="1" fill="#7a5a34" stroke="${O}" stroke-width=".6"/>
      <path d="M-14 9 Q-9.5 6 -5 9" stroke="#3a332b" stroke-width=".9" fill="none"/>`,
    jeweler: () => `${shadow}
      ${house('#6b6a86', '#34304a', 28, 17)}${door(-8)}
      <path d="M6 -4 L10 -9 L14 -4 L10 2Z" fill="#6aa8e8" stroke="${O}" stroke-width=".7"/>
      <path d="M6 -4 H14 M10 -9 V2" stroke="#fff" stroke-width=".5" opacity=".7"/>
      <rect x="-14" y="-3" width="7" height="6" rx="1" fill="#e8cf3a" stroke="${O}" stroke-width=".6"/>
      <path d="M-14 -3 L-10.5 -7 L-7 -3Z" fill="#e0605a" stroke="${O}" stroke-width=".6"/>`,
    artistWorkshop: () => `${shadow}
      ${house('#b08a5a', '#5a4630', 28, 17)}${door(-8)}
      <rect x="6" y="-26" width="6" height="24" fill="#5a4630" stroke="${O}" stroke-width=".7"/>
      <path d="M9 -26 L3 -32 L15 -32Z" fill="#8a7355" stroke="${O}" stroke-width=".7"/>
      <ellipse cx="9" cy="-33.5" rx="4.6" ry="2.6" fill="#e7e2d8" stroke="${O}" stroke-width=".7"/>
      <path d="M9 -33.5 L14.5 -31.8 L9 -30.5Z" fill="#c9573c"/>
      <path d="M0 6 L9 1 L9 13 L0 13Z" fill="#c9a869" stroke="${O}" stroke-width=".7"/>
      <path d="M0 6 L9 1 M-3 8 L4 4 M-3 11 L4 7" stroke="#5a4630" stroke-width=".6"/>
      <rect x="-14" y="8" width="7" height="8" rx="1" fill="#8a6a42" stroke="${O}" stroke-width=".6"/>
      <circle cx="-10.5" cy="9.5" r="1.1" fill="#3a2f22"/>${win(9, 5)}`,
    lighthouse: () => `
      <path d="M-12 18 Q0 12 12 18 L10 20 L-10 20Z" fill="#8c8a85" stroke="${O}" stroke-width=".8"/>
      <path d="M-7 16 L-4.5 -12 H4.5 L7 16Z" fill="#f1ece0" stroke="${O}" stroke-width="1"/>
      <path d="M-6.2 8 L6.2 8 L5.7 3 L-5.7 3Z M-5.3 -3 L5.3 -3 L4.9 -7.5 L-4.9 -7.5Z" fill="#c8402f"/>
      <rect x="-5.6" y="-17" width="11.2" height="5.5" fill="#ffd98a" stroke="${O}" stroke-width=".9"/>
      <path d="M-7 -17 H7 L0 -24Z" fill="#4b6196" stroke="${O}" stroke-width=".9"/><path d="M-8 -12 H8" stroke="${O}" stroke-width="1.4"/>
      <path d="M5.6 -14 L22 -19 L22 -9Z" fill="#ffe9a8" opacity=".35"/><rect x="-1.8" y="9" width="3.6" height="7" rx="1.6" fill="#3a2614"/>`,
    wreck: () => `
      <path d="M-22 5 Q-18 15 -2 14 Q16 14 22 2 L18 2 L12 8 L-16 8 L-18 2Z" fill="#6b4a2b" stroke="${O}" stroke-width="1"/>
      <path d="M-18 2 L-16 8 L12 8 L18 2 Z" fill="#8a6338" stroke="${O}" stroke-width=".8"/>
      <path d="M-2 4 V-20 M7 4 L5 -12" stroke="#4a3220" stroke-width="2" stroke-linecap="round"/>
      <path d="M-2 -19 L-11 -9 L-2 -8Z" fill="#d8cfb8" stroke="${O}" stroke-width=".7" stroke-dasharray="2 1.2"/>
      <path d="M-16 5 L-9 10 M0 6 L8 11" stroke="#3a2614" stroke-width=".8" opacity=".6"/>
      <rect x="13" y="6" width="9" height="7" rx="1.3" fill="#9a5b2a" stroke="${O}" stroke-width=".9"/><path d="M13 9 H22" stroke="${O}" stroke-width=".8"/><rect x="16.5" y="8" width="2" height="3" fill="#e9c24a" stroke="${O}" stroke-width=".5"/>`,
    chest: () => `
      <path d="M-13 14 V0 Q-13 -9 0 -9 Q13 -9 13 0 V14Z" fill="#6b4226" stroke="${O}" stroke-width="1"/>
      <path d="M-13 3 H13 M-6 -8 V14 M6 -8 V14" stroke="#2c2c30" stroke-width="2"/><rect x="-3" y="1" width="6" height="7" rx="1.2" fill="#e9c24a" stroke="${O}" stroke-width=".8"/><circle cy="4.2" r="1" fill="${O}"/>
      <path d="M14 14 q3 -2 6 0 M-18 13 q-3 -2 -6 0" stroke="#d9c78c" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    chestRuby: () => `
      <path d="M-13 14 V0 Q-13 -9 0 -9 Q13 -9 13 0 V14Z" fill="#6b3a2a" stroke="${O}" stroke-width="1"/>
      <path d="M-13 3 H13 M-6 -8 V14 M6 -8 V14" stroke="#2c2c30" stroke-width="2"/><rect x="-3" y="1" width="6" height="7" rx="1.2" fill="#e0344a" stroke="${O}" stroke-width=".8"/><circle cy="4.2" r="1" fill="${O}"/>
      <circle cx="-8" cy="-3" r="1.6" fill="#e0344a" stroke="${O}" stroke-width=".5"/><circle cx="8" cy="-3" r="1.6" fill="#e0344a" stroke="${O}" stroke-width=".5"/>
      <path d="M14 14 q3 -2 6 0 M-18 13 q-3 -2 -6 0" stroke="#d9c78c" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    chestEmerald: () => `
      <path d="M-13 14 V0 Q-13 -9 0 -9 Q13 -9 13 0 V14Z" fill="#4a4a2a" stroke="${O}" stroke-width="1"/>
      <path d="M-13 3 H13 M-6 -8 V14 M6 -8 V14" stroke="#2c2c30" stroke-width="2"/><rect x="-3" y="1" width="6" height="7" rx="1.2" fill="#37c46a" stroke="${O}" stroke-width=".8"/><circle cy="4.2" r="1" fill="${O}"/>
      <circle cx="-8" cy="-3" r="1.6" fill="#37c46a" stroke="${O}" stroke-width=".5"/><circle cx="8" cy="-3" r="1.6" fill="#37c46a" stroke="${O}" stroke-width=".5"/>
      <path d="M14 14 q3 -2 6 0 M-18 13 q-3 -2 -6 0" stroke="#d9c78c" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    chestObsidian: () => `
      <path d="M-13 14 V0 Q-13 -9 0 -9 Q13 -9 13 0 V14Z" fill="#9aa3ad" stroke="${O}" stroke-width="1"/>
      <path d="M-13 3 H13 M-6 -8 V14 M6 -8 V14" stroke="#d8dde3" stroke-width="2"/><rect x="-3" y="1" width="6" height="7" rx="1.2" fill="#1b1b22" stroke="${O}" stroke-width=".8"/><circle cy="4.2" r="1" fill="${O}"/>
      <circle cx="-8" cy="-3" r="1.6" fill="#1b1b22" stroke="${O}" stroke-width=".5"/><circle cx="8" cy="-3" r="1.6" fill="#1b1b22" stroke="${O}" stroke-width=".5"/>
      <path d="M14 14 q3 -2 6 0 M-18 13 q-3 -2 -6 0" stroke="#d9c78c" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    dungeon: () => `
      <path d="M-26 14 Q-24 -10 -10 -16 Q0 -22 10 -16 Q24 -10 26 14Z" fill="#7b7468" stroke="${O}" stroke-width="1"/>
      <path d="M-20 14 Q-19 -2 -9 -8 Q0 -12 9 -8 Q19 -2 20 14Z" fill="#4c473f" stroke="${O}" stroke-width=".8"/>
      <path d="M-11 14 V-1 Q-11 -9 0 -9 Q11 -9 11 -1 V14Z" fill="#1a1612" stroke="${O}" stroke-width="1"/>
      <path d="M-11 14 V-1 Q-11 -9 0 -9 V14Z M0 -9 Q11 -9 11 -1 V14 H0Z" fill="#5a4630" stroke="${O}" stroke-width=".8"/>
      <path d="M-11 -1 H11 M-11 6 H11 M0 -9 V14" stroke="#2c2c30" stroke-width="1.6"/><circle cx="-3" cy="3" r="1.3" fill="#c9b27c" stroke="${O}" stroke-width=".4"/><circle cx="3" cy="3" r="1.3" fill="#c9b27c" stroke="${O}" stroke-width=".4"/>
      <path d="M-16 -12 q2 -5 5 -2 M12 -15 q3 -4 5 0" stroke="${O}" stroke-width=".8" fill="none"/>
      <path d="M-14 14 l-3 -5 l5 0z M14 14 l3 -5 l-5 0z" fill="#8d8678" stroke="${O}" stroke-width=".6"/>`,
    altar: () => `${shadow}
      <ellipse cy="14" rx="19" ry="6" fill="#9a9488" stroke="${O}"/><ellipse cy="12" rx="14" ry="4.5" fill="#bdb6a6" stroke="${O}" stroke-width=".8"/>
      <rect x="-9" y="-2" width="18" height="12" fill="#c9c2b2" stroke="${O}"/><path d="M-11 -2 H11 L8 -6 H-8Z" fill="#e0d9c8" stroke="${O}"/>
      <path d="M-14 12 V-10 M14 12 V-10" stroke="#a8a090" stroke-width="3.5" stroke-linecap="round"/><path d="M-16 -10 H16" stroke="#8f8878" stroke-width="3" stroke-linecap="round"/>
      <circle cy="-14" r="4.5" fill="#fff3b0" opacity=".85"/><circle cy="-14" r="2.2" fill="#ffd95a"/>
      <path d="M0 -4 v-7 M-3 -8 h6" stroke="#7bd8e8" stroke-width="1.4" stroke-linecap="round"/>`,
    guardhouse: () => `${shadow}
      <rect x="-17" y="-4" width="34" height="20" fill="#9a9a98" stroke="${O}"/><path d="M-17 -4 H17 M-17 2 H17 M-17 8 H17" stroke="#6f6f6d" stroke-width=".8"/>
      <path d="M-19 -4 V-12 H-14 V-9 H-9 V-12 H-4 V-9 H1 V-12 H6 V-9 H11 V-12 H19 V-4Z" fill="#8a8a88" stroke="${O}"/>
      <path d="M-16 -12 L0 -22 L16 -12Z" fill="#a83a2e" stroke="${O}"/>
      ${door(0)}${win(-11, 4)}${win(11, 4)}
      <path d="M-21 16 V-2 M-21 -2 L-27 -4 L-21 -6 M-19 16 L-19 4 M-23 16 L-23 4" stroke="#6b4a2b" stroke-width="1.3" fill="#3a6ad0"/>
      <path d="M22 16 V2 M20 5 L22 -3 L24 5Z" stroke="${O}" stroke-width=".8" fill="#d8d8e0"/>`,
    bank: () => `${shadow}<path d="M-18 16 H18" stroke="#6b4a2b" stroke-width="2"/>
      <rect x="-14" y="2" width="20" height="14" fill="#cdb58a" stroke="${O}"/><path d="M-14 2 L-4 -6 L6 2" fill="#b3946a" stroke="${O}"/>
      <path d="M8 16 V-10 M14 16 V-10 M8 -4 H14 M8 4 H14 M8 10 H14 M8 -10 L14 -4 M14 -10 L8 -4" stroke="#8a5a32" stroke-width="1.5" fill="none"/>
      <path d="M-16 16 l3 -5 l3 5Z M-11 16 l3 -3 l3 3Z" fill="#a89878" stroke="${O}" stroke-width=".6"/>
      <path d="M12 -10 L12 -17 M12 -17 L19 -14" stroke="${O}" stroke-width="1" fill="#d96a2b"/>`,
    mail: () => `${shadow}<path d="M-18 16 H18" stroke="#6b4a2b" stroke-width="2"/>
      <rect x="-14" y="2" width="20" height="14" fill="#cdb58a" stroke="${O}"/><path d="M-14 2 L-4 -6 L6 2" fill="#b3946a" stroke="${O}"/>
      <path d="M8 16 V-10 M14 16 V-10 M8 -4 H14 M8 4 H14 M8 10 H14 M8 -10 L14 -4 M14 -10 L8 -4" stroke="#8a5a32" stroke-width="1.5" fill="none"/>
      <path d="M-16 16 l3 -5 l3 5Z M-11 16 l3 -3 l3 3Z" fill="#a89878" stroke="${O}" stroke-width=".6"/>
      <path d="M12 -10 L12 -17 M12 -17 L19 -14" stroke="${O}" stroke-width="1" fill="#d96a2b"/>`,
    site1: () => `${shadow}<path d="M-18 16 H18" stroke="#6b4a2b" stroke-width="2"/>
      <rect x="-14" y="2" width="20" height="14" fill="#cdb58a" stroke="${O}"/><path d="M-14 2 L-4 -6 L6 2" fill="#b3946a" stroke="${O}"/>
      <path d="M8 16 V-10 M14 16 V-10 M8 -4 H14 M8 4 H14 M8 10 H14 M8 -10 L14 -4 M14 -10 L8 -4" stroke="#8a5a32" stroke-width="1.5" fill="none"/>
      <path d="M-16 16 l3 -5 l3 5Z M-11 16 l3 -3 l3 3Z" fill="#a89878" stroke="${O}" stroke-width=".6"/>
      <path d="M12 -10 L12 -17 M12 -17 L19 -14" stroke="${O}" stroke-width="1" fill="#d96a2b"/>`,
    site2: () => `${shadow}<path d="M-18 16 H18" stroke="#6b4a2b" stroke-width="2"/>
      <rect x="-14" y="2" width="20" height="14" fill="#cdb58a" stroke="${O}"/><path d="M-14 2 L-4 -6 L6 2" fill="#b3946a" stroke="${O}"/>
      <path d="M8 16 V-10 M14 16 V-10 M8 -4 H14 M8 4 H14 M8 10 H14 M8 -10 L14 -4 M14 -10 L8 -4" stroke="#8a5a32" stroke-width="1.5" fill="none"/>
      <path d="M-16 16 l3 -5 l3 5Z M-11 16 l3 -3 l3 3Z" fill="#a89878" stroke="${O}" stroke-width=".6"/>
      <path d="M12 -10 L12 -17 M12 -17 L19 -14" stroke="${O}" stroke-width="1" fill="#d96a2b"/>`,
    ruinHouse: () => `${shadow}
      <rect x="-14" y="-2" width="28" height="18" fill="#6f6a60" stroke="${O}"/><path d="M-14 4 H14 M-14 10 H14" stroke="#4d493f" stroke-width=".8"/>
      <path d="M-18 -2 L-6 -14 L-1 -8 L4 -12 L8 -4 L18 -2Z" fill="#4a463e" stroke="${O}"/><path d="M-6 -14 L-3 -2 M4 -12 L2 -2" stroke="${O}" stroke-width=".8"/>
      <rect x="-8" y="6" width="6" height="10" rx="3" fill="#20262e" stroke="${O}" stroke-width=".8"/><rect x="6" y="2" width="5" height="5" fill="#7fc4ff" opacity=".75" stroke="${O}" stroke-width=".6"/>
      <path d="M-14 16 q3 -6 5 -2 M12 16 q2 -5 5 -1" stroke="#3d5a35" stroke-width="1.6" fill="none"/>`,
    ruinTower: () => `${shadow}
      <path d="M-9 16 V-14 L-7 -17 L-4 -14 L-1 -17 L2 -14 L5 -17 L9 -14 V16Z" fill="#767268" stroke="${O}"/>
      <path d="M-9 -2 H9 M-9 6 H9" stroke="#4d493f" stroke-width=".8"/><rect x="-2.5" y="-9" width="5" height="8" rx="2.5" fill="#20262e" stroke="${O}" stroke-width=".7"/>
      <circle cx="0" cy="-4" r="1.6" fill="#7fc4ff" opacity=".8"/><path d="M9 -12 L17 -14 L10 -9Z" fill="#3a2a40" stroke="${O}" stroke-width=".6"/>
      <path d="M-9 16 q-3 -6 -6 -3 M9 16 q3 -5 6 -2" stroke="#3d5a35" stroke-width="1.6" fill="none"/>`,
    ruinHall: () => `${shadow}
      <rect x="-20" y="-6" width="40" height="22" fill="#6a665c" stroke="${O}"/><path d="M-20 2 H20 M-20 9 H20" stroke="#4d493f" stroke-width=".8"/>
      <path d="M-23 -6 L-12 -18 L-6 -12 L0 -20 L6 -11 L12 -17 L23 -6Z" fill="#44403a" stroke="${O}"/>
      <rect x="-5" y="4" width="10" height="12" rx="4" fill="#12161c" stroke="${O}"/><path d="M0 4 V16" stroke="#7fc4ff" stroke-width=".6" opacity=".6"/>
      <rect x="-16" y="-1" width="5" height="6" fill="#7fc4ff" opacity=".7" stroke="${O}" stroke-width=".6"/><rect x="11" y="-1" width="5" height="6" fill="#7fc4ff" opacity=".7" stroke="${O}" stroke-width=".6"/>
      <path d="M0 -20 V-28 M0 -28 L8 -25 L0 -22Z" stroke="${O}" stroke-width=".8" fill="#3a2a40"/>`,
    castle: () => `${shadow}
      <rect x="-24" y="-2" width="48" height="18" fill="#7a766c" stroke="${O}"/><path d="M-24 4 H24 M-24 10 H24" stroke="#4d493f" stroke-width=".8"/>
      <path d="M-24 -2 V-8 H-19 V-5 H-14 V-8 H14 V-5 H19 V-8 H24 V-2Z" fill="#6a665c" stroke="${O}"/>
      <path d="M-16 16 V-14 L-14 -17 L-10 -14 L-7 -17 V16Z M7 16 V-17 L10 -14 L14 -17 L16 -14 V16Z" fill="#8a867a" stroke="${O}"/>
      <path d="M-7 16 V3 Q0 -4 7 3 V16Z" fill="#12161c" stroke="${O}"/><path d="M-4 3 V16 M0 0 V16 M4 3 V16" stroke="#4a4e56" stroke-width="1"/>
      <path d="M-12 -17 V-25 L-5 -22 L-12 -19 M12 -17 V-25 L19 -22 L12 -19" stroke="${O}" stroke-width=".8" fill="#3a2a40"/>`,
    castleExit: () => `${shadow}
      <rect x="-14" y="-2" width="28" height="18" fill="#7a766c" stroke="${O}"/><path d="M-14 -2 V-8 H-9 V-5 H-4 V-8 H4 V-5 H9 V-8 H14 V-2Z" fill="#6a665c" stroke="${O}"/>
      <path d="M-6 16 V4 Q0 -2 6 4 V16Z" fill="#c7d8e8" opacity=".55" stroke="${O}"/><path d="M-3 16 V6 M0 16 V4 M3 16 V6" stroke="#4a4e56" stroke-width="1"/>`,
    arena: () => `
      <ellipse cy="2" rx="21" ry="12" fill="#b3a88f" stroke="${O}"/><ellipse cy="0" rx="15" ry="7.5" fill="#dcc79a" stroke="${O}" stroke-width=".8"/>
      <path d="M-21 2 V8 Q0 22 21 8 V2" fill="#9d927a" stroke="${O}"/>
      ${[-16, -9, -2, 5, 12].map((x) => `<path d="M${x} 9 q2.5 -4 5 0 v4 h-5z" fill="#4a3f2f"/>`).join('')}
      <path d="M-16 -6 V-12 L-13 -10.5 L-16 -9 M16 -6 V-12 L19 -10.5 L16 -9" stroke="${O}" stroke-width=".8" fill="#c43c2e"/>`,
  };

  // Здания стоят через пустую соту друг от друга, так что места хватает — крупнее прежнего.
  function building(id, soon) {
    // 1.7.5: картинки сундуков лежат под именами chest-ruby/-emerald/-obsidian, а id зданий — chestRuby…: пробуем обе записи
    const key = (typeof Art !== 'undefined' && !Art.has('map/' + id) && Art.has('map/' + id.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()))) ? 'map/' + id.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) : 'map/' + id;
    if (typeof Art !== 'undefined' && Art.has(key)) {
      return `<g class="bld ${soon ? 'soon' : ''}" transform="translate(0 -5) scale(1.35)"><image href="${Art.url(key)}" x="-22" y="-26" width="44" height="44" preserveAspectRatio="xMidYMid meet"/></g>`;
    }
    return `<g class="bld ${soon ? 'soon' : ''}" transform="translate(0 -5) scale(1.35)">${(B[id] || B[{ islandPier: 'wreck', islandChest: 'chest', towerDoor: 'castleExit', towerStairs: 'ruinTower' }[id]] || B.home)()}</g>`;
  }

  // Подпись здания на тёмной подложке (рисуется отдельным слоем поверх зданий).
  function label(text, x, y) {
    const w = text.length * 4.5 + 8;
    return `<g class="map-label-g" transform="translate(${x.toFixed(1)} ${(y + 21).toFixed(1)})"><rect x="${(-w / 2).toFixed(1)}" y="-6.5" width="${w.toFixed(1)}" height="10" rx="3"/><text y="1">${text}</text></g>`;
  }

  return { defs, deco, building, label, TERRAIN_COLORS: T };
})();
