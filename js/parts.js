/* Библиотека вещей: как выглядит каждый предмет на персонаже и в иконке.
   Формы взяты из реального средневековья: норманнский шлем с наносником, большой шлем (топфхельм),
   кольчуга, кираса с наплечниками, латные наручи и поножи, арминговый меч, рондельный кинжал,
   датский (бородатый) топор, мачта-булава, круглый щит и щит-«миндаль», молот Тора и др.
   Материалы рисуются градиентами (сталь, тёмное железо, серебро, бронза, золото, дерево, кожа, ткань, мех),
   а кольчуга и швы — узорами. Цвет набора выступает как цвет ткани и краски, а не заливает металл.

   Все чертежи работают в координатах фигуры (см. figures.js): опорные точки A задают голову, торс,
   руки и ноги, поэтому одни и те же чертежи используются и на персонажах, и в иконках. */

const Parts = (() => {
  let UID = 0;
  const newCtx = () => ({ p: 'p' + (++UID), defs: {} });
  const OUT = '#14161a';

  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, q = Math.abs(f);
    r = Math.round((t - r) * q + r); g = Math.round((t - g) * q + g); b = Math.round((t - b) * q + b);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  };

  /* ---------- материалы ---------- */
  const STOPS = [0, 0.28, 0.45, 0.68, 1];
  const MAT = {
    steel:    ['#565c66', '#b8bfc9', '#f3f6f9', '#8c939e', '#454b53'],
    darksteel:['#1c1f24', '#4a4f57', '#8b919b', '#343940', '#15171b'],
    silver:   ['#79819a', '#dde3f1', '#ffffff', '#a2aabf', '#626a80'],
    bronze:   ['#57391a', '#b6863b', '#efce76', '#96692a', '#4b300f'],
    gold:     ['#75560e', '#dcb236', '#fff3a6', '#bd9220', '#584004'],
    wood:     ['#35230f', '#684424', '#8d6134', '#573719', '#2a1a0a'],
    bone:     ['#857a62', '#d6cbae', '#f6efdb', '#bcb192', '#736a54'],
    copper:   ['#5a2a14', '#b8683a', '#f0a070', '#94502a', '#4a2010'],
  };

  const def = (c, key, make) => {
    if (!c.defs[key]) c.defs[key] = make(`${c.p}-${key}`);
    return `url(#${c.p}-${key})`;
  };
  const metal = (c, name, dir = 'h') => def(c, `m-${name}-${dir}`, (id) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="${dir === 'h' ? 1 : 0}" y2="${dir === 'h' ? 0 : 1}">${MAT[name].map((col, i) => `<stop offset="${STOPS[i]}" stop-color="${col}"/>`).join('')}</linearGradient>`);
  const dye = (c, hex, dir = 'v') => def(c, `d-${hex.slice(1)}-${dir}`, (id) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="${dir === 'h' ? 1 : 0}" y2="${dir === 'h' ? 0 : 1}"><stop offset="0" stop-color="${shade(hex, 0.22)}"/><stop offset=".55" stop-color="${hex}"/><stop offset="1" stop-color="${shade(hex, -0.4)}"/></linearGradient>`);
  const cyl = (c) => def(c, 'cyl', (id) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".3" stop-color="#fff" stop-opacity=".12"/><stop offset=".58" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>`);
  const mailFill = (c) => def(c, 'mail', (id) =>
    `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#4f555e"/>` +
    [[3, 3, '#cbd1da'], [0, 0, '#8e959f'], [6, 0, '#8e959f'], [0, 6, '#8e959f'], [6, 6, '#8e959f']]
      .map(([x, y, col]) => `<circle cx="${x}" cy="${y}" r="2.3" fill="none" stroke="${col}" stroke-width=".9"/>`).join('') + '</pattern>');
  const furFill = (c) => def(c, 'fur', (id) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d3c8"/><stop offset=".5" stop-color="#9c958a"/><stop offset="1" stop-color="#5f5a52"/></linearGradient>`);

  // светотень поверх формы (цилиндр)
  const shadeOn = (c, d) => `<path d="${d}" fill="${cyl(c)}"/>`;
  const rivet = (x, y, col = '#d9b24a', r = 1.7) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" stroke="${OUT}" stroke-width=".7"/>`;
  const stitch = (d, col = '#e9d6ae') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.3" stroke-dasharray="3.2 2.6" opacity=".85"/>`;

  /* ---------- палитры наборов ---------- */
  const PAL = {
    guard:    { metal: 'steel',     trim: 'gold',   cloth: '#2c58a8', leather: '#4a3626' },
    berserk:  { metal: 'darksteel', trim: 'bronze', cloth: '#7d2a24', leather: '#4b3021' },
    mage:     { metal: 'silver',    trim: 'silver', cloth: '#58399a', leather: '#3d3050' },
    wanderer: { metal: 'steel',     trim: 'bronze', cloth: '#3e7c4a', leather: '#6b4a2b' },
    crown:    { metal: 'steel',     trim: 'gold',   cloth: '#2f5fbf', leather: '#4a3626' },
    rune:     { metal: 'darksteel', trim: 'copper', cloth: '#8a4a1e', leather: '#4b3021' },
    grove:    { metal: 'silver',    trim: 'bronze', cloth: '#2f7a42', leather: '#5a4428' },
    scale:    { metal: 'bronze',    trim: 'bone',   cloth: '#9a3a2a', leather: '#5a4a28' },
    none:     { metal: 'steel',     trim: 'bronze', cloth: '#7a6a52', leather: '#7a5638' },
  };
  const pal = (it) => PAL[it.set] || PAL.none;

  const LOOK = {
    'sword-novice': 'sword', 'wand-blade': 'falchion', 'wand-dagger': 'dagger', club: 'mace',
    'berserk-axe': 'axe', 'mage-staff': 'staff', 'sword-two': 'greatsword', hammer: 'maul',
    'shield-wood': 'round', 'guard-shield': 'heater',
    'leather-head': 'cap', 'guard-head': 'greathelm', 'berserk-head': 'nasal', 'mage-head': 'wizhat', 'wand-head': 'hood',
    'leather-chest': 'jerkin', 'guard-chest': 'cuirass', 'berserk-chest': 'hauberk', 'mage-chest': 'robe', 'wand-chest': 'cloak',
    'leather-arms': 'bracers', 'guard-arms': 'vambrace', 'berserk-arms': 'studded', 'mage-arms': 'runic',
    'leather-legs': 'boots', 'wand-legs': 'boots', 'guard-legs': 'greaves', 'berserk-legs': 'wraps', 'mage-legs': 'hose',
    'crown-sword': 'sword', 'crown-shield': 'heater', 'crown-head': 'greathelm', 'crown-chest': 'cuirass', 'crown-amulet': 'amber',
    'rune-hammer': 'maul', 'rune-head': 'nasal', 'rune-chest': 'cuirass', 'rune-arms': 'vambrace', 'rune-legs': 'greaves',
    'grove-bow': 'bow', 'grove-head': 'hood', 'grove-chest': 'cloak', 'grove-legs': 'boots', 'grove-amulet': 'talisman',
    'scale-blade': 'falchion', 'scale-shield': 'round', 'scale-chest': 'hauberk', 'scale-arms': 'studded', 'scale-amulet': 'claw',
    'amulet-copper': 'copper', 'amulet-power': 'claw', 'amulet-spark': 'amber',
    'berserk-amulet': 'mjolnir', 'mage-amulet': 'crystal', 'wand-amulet': 'talisman',
  };
  const look = (it) => LOOK[it.id];

  /* ================== ШЛЕМЫ ================== */
  function helm(c, A, it) {
    const { cx, cy, r } = A.head, P = pal(it), lk = look(it);
    const M = metal(c, P.metal), T = metal(c, P.trim), L = dye(c, P.leather), C = dye(c, P.cloth);
    if (lk === 'cap') {
      const d = `M${cx - r - 3} ${cy + 4} Q${cx - r - 6} ${cy - r - 10} ${cx} ${cy - r - 11} Q${cx + r + 6} ${cy - r - 10} ${cx + r + 3} ${cy + 4} Q${cx} ${cy - 6} ${cx - r - 3} ${cy + 4}Z`;
      return `<path d="${d}" fill="${L}" stroke="${OUT}" stroke-width="1.6"/>${shadeOn(c, d)}
        ${stitch(`M${cx - r + 2} ${cy - 1} Q${cx} ${cy - 13} ${cx + r - 2} ${cy - 1}`)}
        <path d="M${cx} ${cy - r - 10} V${cy - 8}" stroke="#2a1c10" stroke-width="1.4"/>
        <path d="M${cx - r - 3} ${cy + 3} q-5 14 3 24 l9 -4 q-4 -10 -2 -20z M${cx + r + 3} ${cy + 3} q5 14 -3 24 l-9 -4 q4 -10 2 -20z" fill="${L}" stroke="${OUT}" stroke-width="1.4"/>`;
    }
    if (lk === 'greathelm') {
      const d = `M${cx - r - 5} ${cy + r + 8} L${cx - r - 6} ${cy - r + 8} Q${cx - r - 6} ${cy - r - 14} ${cx} ${cy - r - 15} Q${cx + r + 6} ${cy - r - 14} ${cx + r + 6} ${cy - r + 8} L${cx + r + 5} ${cy + r + 8} Q${cx} ${cy + r + 16} ${cx - r - 5} ${cy + r + 8}Z`;
      return `<path d="M${cx - 6} ${cy - r - 14} Q${cx + 14} ${cy - r - 40} ${cx + 34} ${cy - r - 20} Q${cx + 14} ${cy - r - 22} ${cx + 8} ${cy - r - 12}Z" fill="${C}" stroke="${OUT}" stroke-width="1.3"/>
        <path d="${d}" fill="${M}" stroke="${OUT}" stroke-width="1.8"/>${shadeOn(c, d)}
        <path d="M${cx - r - 6} ${cy - r + 8} H${cx + r + 6} M${cx - r - 5} ${cy + 12} H${cx + r + 5}" stroke="#2d3138" stroke-width="2.6"/>
        <rect x="${cx - 2.5}" y="${cy - r + 4}" width="5" height="${r * 2 - 2}" fill="#07080a"/>
        <rect x="${cx - r + 6}" y="${cy - 4}" width="${r * 2 - 12}" height="5" fill="#07080a"/>
        ${[0, 1, 2, 3, 4].map((i) => `<circle cx="${cx + 12 + (i % 2) * 6}" cy="${cy + 16 + i * 5}" r="1.3" fill="#07080a"/>`).join('')}
        ${rivet(cx - r - 2, cy - r + 8, '#c9cfd8')}${rivet(cx + r + 2, cy - r + 8, '#c9cfd8')}
        <path d="M${cx - r + 2} ${cy - r - 8} Q${cx - 6} ${cy - r - 12} ${cx - 14} ${cy - r + 2}" stroke="#fff" stroke-width="1.6" fill="none" opacity=".5"/>`;
    }
    if (lk === 'nasal') {
      const d = `M${cx - r - 3} ${cy + 2} Q${cx - r - 2} ${cy - r - 24} ${cx} ${cy - r - 30} Q${cx + r + 2} ${cy - r - 24} ${cx + r + 3} ${cy + 2}Z`;
      const fur = `M${cx - r - 8} ${cy - 2} l4 -7 l4 6 l4 -7 l4 6 l4 -7 l4 6 l4 -7 l4 6 l4 -7 l4 6 l4 -7 l4 6 l4 -7 l4 6 l3 -5 v10 h-${2 * r + 22}z`;
      return `<path d="M${cx - r - 3} ${cy - 2} q-6 16 2 30 h9 l-1 -30z M${cx + r + 3} ${cy - 2} q6 16 -2 30 h-9 l1 -30z" fill="${L}" stroke="${OUT}" stroke-width="1.4"/>
        <path d="${d}" fill="${M}" stroke="${OUT}" stroke-width="1.8"/>${shadeOn(c, d)}
        <path d="M${cx} ${cy - r - 29} V${cy - 8}" stroke="${C}" stroke-width="7"/>
        <path d="M${cx - r * 0.6} ${cy - r - 4} Q${cx - r * 0.5} ${cy - 14} ${cx - r * 0.55} ${cy - 8} M${cx + r * 0.6} ${cy - r - 4} Q${cx + r * 0.5} ${cy - 14} ${cx + r * 0.55} ${cy - 8}" stroke="#1c1f24" stroke-width="2" fill="none"/>
        <rect x="${cx - r - 4}" y="${cy - 12}" width="${2 * r + 8}" height="11" rx="2" fill="${T}" stroke="${OUT}" stroke-width="1.5"/>
        ${[-r + 2, -r / 2, 0, r / 2, r - 2].map((dx) => rivet(cx + dx, cy - 6.5, '#e6e9ee', 1.5)).join('')}
        <rect x="${cx - 3.5}" y="${cy - 2}" width="7" height="27" rx="2" fill="${M}" stroke="${OUT}" stroke-width="1.4"/>
        <path d="${fur}" fill="${furFill(c)}" stroke="${OUT}" stroke-width=".8" transform="translate(0 -2)"/>`;
    }
    if (lk === 'wizhat') {
      return `<ellipse cx="${cx}" cy="${cy - r + 10}" rx="${r + 24}" ry="9" fill="${dye(c, shade(P.cloth, -0.2))}" stroke="${OUT}" stroke-width="1.6"/>
        <path d="M${cx - r + 1} ${cy - r + 10} Q${cx - 8} ${cy - r - 52} ${cx + 30} ${cy - r - 66} Q${cx + r + 8} ${cy - r - 16} ${cx + r - 1} ${cy - r + 10}Z" fill="${C}" stroke="${OUT}" stroke-width="1.8"/>
        <path d="M${cx - r + 2} ${cy - r + 4} Q${cx} ${cy - r + 10} ${cx + r - 2} ${cy - r + 4} L${cx + r - 2} ${cy - r + 12} Q${cx} ${cy - r + 17} ${cx - r + 2} ${cy - r + 12}Z" fill="${metal(c, 'silver')}" stroke="${OUT}" stroke-width="1.3"/>
        <rect x="${cx - 5}" y="${cy - r + 6}" width="10" height="9" rx="1.5" fill="none" stroke="#3a3f4b" stroke-width="1.6"/>
        ${[[cx - 6, cy - r - 12], [cx + 6, cy - r - 30], [cx + 1, cy - r - 46]].map(([x, y]) => `<path d="M${x} ${y - 4} l1.4 3 3.2 .4 -2.4 2.2 .7 3.2 -2.9 -1.6 -2.9 1.6 .7 -3.2 -2.4 -2.2 3.2 -.4z" fill="#dfe5f2"/>`).join('')}`;
    }
    // hood — шерстяной капюшон
    return `<path d="M${cx - r - 8} ${cy + 32} Q${cx - r - 14} ${cy - r - 10} ${cx} ${cy - r - 16} Q${cx + r + 14} ${cy - r - 10} ${cx + r + 8} ${cy + 32} Q${cx + r} ${cy + 2} ${cx} ${cy} Q${cx - r} ${cy + 2} ${cx - r - 8} ${cy + 32}Z" fill="${C}" stroke="${OUT}" stroke-width="1.8"/>
      <path d="M${cx - r + 2} ${cy + 2} Q${cx} ${cy - r + 4} ${cx + r - 2} ${cy + 2}" fill="none" stroke="#0e1014" stroke-width="3" opacity=".55"/>
      <path d="M${cx - r - 6} ${cy + 26} Q${cx - r - 12} ${cy + 46} ${cx - r + 2} ${cy + 54} M${cx + r + 6} ${cy + 26} Q${cx + r + 12} ${cy + 46} ${cx + r - 2} ${cy + 54}" stroke="${C}" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M${cx - 6} ${cy + 26} q-1 12 3 18 M${cx + 6} ${cy + 26} q1 12 -3 18" stroke="#e8dcc0" stroke-width="1.6" fill="none"/>`;
  }

  /* ================== НАГРУДНИКИ ================== */
  function chest(c, A, it) {
    const t = A.torso, P = pal(it), lk = look(it), cx = t.x + t.w / 2, b = t.y + t.h;
    const M = metal(c, P.metal), T = metal(c, P.trim), L = dye(c, P.leather), C = dye(c, P.cloth);
    if (lk === 'jerkin') {
      const d = `M${t.x + 2} ${t.y + 8} L${cx - 15} ${t.y + 2} L${cx} ${t.y + 36} L${cx + 15} ${t.y + 2} L${t.x + t.w - 2} ${t.y + 8} L${t.x + t.w - 3} ${b - 24} Q${cx} ${b - 8} ${t.x + 3} ${b - 24}Z`;
      return `<path d="${d}" fill="${L}" stroke="${OUT}" stroke-width="1.8"/>${shadeOn(c, d)}
        <path d="M${cx} ${t.y + 34} V${b - 14}" stroke="#1c120a" stroke-width="2"/>
        ${[0, 1, 2, 3, 4].map((i) => `<path d="M${cx - 7} ${t.y + 44 + i * 13} L${cx + 7} ${t.y + 51 + i * 13} M${cx + 7} ${t.y + 44 + i * 13} L${cx - 7} ${t.y + 51 + i * 13}" stroke="#e2cfa4" stroke-width="1.5"/>`).join('')}
        ${stitch(`M${t.x + 6} ${t.y + 14} L${t.x + 6} ${b - 30}`)}${stitch(`M${t.x + t.w - 6} ${t.y + 14} L${t.x + t.w - 6} ${b - 30}`)}
        <rect x="${t.x}" y="${b - 30}" width="${t.w}" height="10" fill="${dye(c, '#2e1e12')}" stroke="${OUT}" stroke-width="1.3"/>
        <rect x="${cx - 7}" y="${b - 31}" width="14" height="12" rx="2" fill="${T}" stroke="${OUT}" stroke-width="1.3"/>`;
    }
    if (lk === 'cuirass') {
      const plate = `M${t.x - 4} ${t.y + 10} Q${cx} ${t.y - 16} ${t.x + t.w + 4} ${t.y + 10} L${t.x + t.w - 3} ${t.y + 70} Q${cx} ${t.y + 86} ${t.x + 3} ${t.y + 70}Z`;
      const tabard = `M${t.x + 6} ${b - 44} H${t.x + t.w - 6} V${b + 50} L${cx} ${b + 38} L${t.x + 6} ${b + 50}Z`;
      return `<path d="${tabard}" fill="${C}" stroke="${OUT}" stroke-width="1.6"/>
        <path d="M${cx - 3} ${b - 34} V${b + 32} M${cx - 16} ${b - 4} H${cx + 12}" stroke="#f1eedf" stroke-width="7"/>
        ${[0, 1, 2].map((i) => `<path d="M${t.x + 4 + i * 2} ${t.y + 68 + i * 9} Q${cx} ${t.y + 82 + i * 9} ${t.x + t.w - 4 - i * 2} ${t.y + 68 + i * 9} v8 Q${cx} ${t.y + 90 + i * 9} ${t.x + 4 + i * 2} ${t.y + 76 + i * 9}z" fill="${M}" stroke="${OUT}" stroke-width="1.4"/>`).join('')}
        <path d="${plate}" fill="${M}" stroke="${OUT}" stroke-width="1.9"/>${shadeOn(c, plate)}
        <path d="M${cx} ${t.y + 4} L${cx} ${t.y + 78}" stroke="#fff" stroke-width="1.6" opacity=".55"/>
        <path d="M${cx - 20} ${t.y + 16} Q${cx} ${t.y + 30} ${cx + 20} ${t.y + 16}" fill="none" stroke="${OUT}" stroke-width="1.3"/>
        ${[[t.x + 8, t.y + 24], [t.x + t.w - 8, t.y + 24], [t.x + 12, t.y + 52], [t.x + t.w - 12, t.y + 52]].map(([x, y]) => rivet(x, y)).join('')}
        <path d="M${t.x - 22} ${t.y + 14} Q${t.x - 24} ${t.y - 6} ${t.x + 8} ${t.y - 4} L${t.x + 14} ${t.y + 22} Q${t.x - 10} ${t.y + 30} ${t.x - 22} ${t.y + 14}Z M${t.x + t.w + 22} ${t.y + 14} Q${t.x + t.w + 24} ${t.y - 6} ${t.x + t.w - 8} ${t.y - 4} L${t.x + t.w - 14} ${t.y + 22} Q${t.x + t.w + 10} ${t.y + 30} ${t.x + t.w + 22} ${t.y + 14}Z" fill="${M}" stroke="${OUT}" stroke-width="1.8"/>
        <path d="M${t.x - 18} ${t.y + 8} Q${t.x - 4} ${t.y + 2} ${t.x + 10} ${t.y + 6} M${t.x + t.w + 18} ${t.y + 8} Q${t.x + t.w + 4} ${t.y + 2} ${t.x + t.w - 10} ${t.y + 6}" stroke="${OUT}" stroke-width="1.2" fill="none"/>`;
    }
    if (lk === 'hauberk') {
      const d = `M${t.x - 5} ${t.y + 8} Q${cx} ${t.y - 12} ${t.x + t.w + 5} ${t.y + 8} L${t.x + t.w + 16} ${t.y + 40} L${t.x + t.w + 3} ${t.y + 46} L${t.x + t.w + 4} ${b + 26} H${t.x - 4} L${t.x - 3} ${t.y + 46} L${t.x - 16} ${t.y + 40}Z`;
      const hem = Array.from({ length: 12 }, (_, i) => `l${(t.w + 8) / 12} ${i % 2 ? -4 : 4}`).join(' ');
      return `<path d="${d}" fill="${mailFill(c)}" stroke="${OUT}" stroke-width="1.8"/>${shadeOn(c, d)}
        <path d="M${t.x - 4} ${b + 22} ${hem}" fill="none" stroke="#2a2e35" stroke-width="2.2"/>
        <path d="M${cx - 18} ${t.y + 4} L${cx} ${t.y + 22} L${cx + 18} ${t.y + 4}" fill="none" stroke="#2a2e35" stroke-width="2"/>
        <rect x="${t.x - 3}" y="${b - 28}" width="${t.w + 6}" height="11" fill="${dye(c, '#3a2718')}" stroke="${OUT}" stroke-width="1.4"/>
        <rect x="${cx - 8}" y="${b - 30}" width="16" height="15" rx="2" fill="${metal(c, 'darksteel')}" stroke="${OUT}" stroke-width="1.4"/>
        <path d="M${t.x - 18} ${t.y + 12} Q${t.x - 22} ${t.y - 8} ${cx - 10} ${t.y - 10} Q${cx} ${t.y - 2} ${cx + 10} ${t.y - 10} Q${t.x + t.w + 22} ${t.y - 8} ${t.x + t.w + 18} ${t.y + 12} l-5 2 l-3 -6 l-5 7 l-4 -7 l-5 8 l-4 -6 l-8 3 l-6 -6 l-5 7 l-4 -6 l-5 7 l-4 -6 l-5 6 l-6 -5 l-3 6z" fill="${furFill(c)}" stroke="${OUT}" stroke-width="1"/>
        <path d="M${t.x - 4} ${t.y + 44} H${t.x + 8} M${t.x + t.w - 8} ${t.y + 44} H${t.x + t.w + 4}" stroke="${C}" stroke-width="4"/>`;
    }
    if (lk === 'robe') {
      const d = `M${t.x + 2} ${t.y + 6} Q${cx} ${t.y - 10} ${t.x + t.w - 2} ${t.y + 6} L${t.x + t.w + 16} ${b + 92} H${t.x - 16}Z`;
      return `<path d="${d}" fill="${C}" stroke="${OUT}" stroke-width="1.8"/>${shadeOn(c, d)}
        ${[-26, -12, 6, 22, 36].map((dx) => `<path d="M${cx + dx * 0.55} ${t.y + 56} L${cx + dx * 1.1} ${b + 90}" stroke="#000" stroke-width="2" opacity=".18"/>`).join('')}
        <path d="M${cx - 18} ${t.y + 2} L${cx} ${t.y + 46} L${cx + 18} ${t.y + 2}" fill="none" stroke="${metal(c, 'silver')}" stroke-width="4"/>
        <path d="M${t.x - 16} ${b + 84} H${t.x + t.w + 16}" stroke="${metal(c, 'silver')}" stroke-width="4"/>
        <path d="M${t.x} ${b - 26} H${t.x + t.w}" stroke="${dye(c, '#2a1d38')}" stroke-width="9"/>
        <rect x="${cx - 7}" y="${b - 32}" width="14" height="12" rx="2" fill="${metal(c, 'silver')}" stroke="${OUT}" stroke-width="1.2"/>
        <path d="M${cx + 4} ${b - 20} q6 24 2 48" stroke="#2a1d38" stroke-width="3" fill="none"/><circle cx="${cx + 7}" cy="${b + 30}" r="4" fill="${metal(c, 'silver')}"/>
        <path d="M${t.x - 14} ${t.y + 12} Q${cx} ${t.y - 6} ${t.x + t.w + 14} ${t.y + 12} L${t.x + t.w + 18} ${t.y + 34} Q${cx} ${t.y + 16} ${t.x - 18} ${t.y + 34}Z" fill="${dye(c, shade(P.cloth, -0.25))}" stroke="${OUT}" stroke-width="1.6"/>`;
    }
    // cloak — дорожный плащ и туника
    const cape = `M${t.x - 4} ${t.y + 2} Q${t.x - 40} ${t.y + t.h / 2} ${t.x - 24} ${b + 52} L${t.x + 16} ${b - 4} Z M${t.x + t.w + 4} ${t.y + 2} Q${t.x + t.w + 40} ${t.y + t.h / 2} ${t.x + t.w + 24} ${b + 52} L${t.x + t.w - 16} ${b - 4} Z`;
    return `<path d="${cape}" fill="${C}" stroke="${OUT}" stroke-width="1.6"/>${shadeOn(c, cape)}
      <path d="M${t.x + 3} ${t.y + 8} Q${cx} ${t.y - 8} ${t.x + t.w - 3} ${t.y + 8} L${t.x + t.w - 4} ${b - 22} Q${cx} ${b - 8} ${t.x + 4} ${b - 22}Z" fill="${dye(c, '#8a7150')}" stroke="${OUT}" stroke-width="1.6"/>
      <path d="M${t.x + 8} ${t.y + 6} L${t.x + t.w - 10} ${b - 34}" stroke="${L}" stroke-width="8"/><path d="M${t.x + 8} ${t.y + 6} L${t.x + t.w - 10} ${b - 34}" stroke="${OUT}" stroke-width="8" opacity=".0"/>
      ${stitch(`M${t.x + 12} ${t.y + 4} L${t.x + t.w - 6} ${b - 38}`, '#e2cfa4')}
      <rect x="${t.x + t.w - 30}" y="${b - 62}" width="20" height="24" rx="3" fill="${L}" stroke="${OUT}" stroke-width="1.4"/>
      <circle cx="${cx}" cy="${t.y + 6}" r="6" fill="${T}" stroke="${OUT}" stroke-width="1.4"/>`;
  }

  /* ================== НАРУЧИ ================== */
  function armGuards(c, A, it, hands) {
    const P = pal(it), lk = look(it);
    const M = metal(c, P.metal), T = metal(c, P.trim), L = dye(c, P.leather);
    return hands.map((h) => {
      const left = h.x < 120, s = left ? 1 : -1;
      if (lk === 'vambrace') {
        const d = `M${h.x - 12} ${h.y - 56} L${h.x + 12} ${h.y - 56} L${h.x + 14} ${h.y - 12} L${h.x - 14} ${h.y - 12}Z`;
        return `<path d="${d}" fill="${M}" stroke="${OUT}" stroke-width="1.7"/>${shadeOn(c, d)}
          <ellipse cx="${h.x}" cy="${h.y - 58}" rx="15" ry="9" fill="${M}" stroke="${OUT}" stroke-width="1.7"/>${rivet(h.x, h.y - 58)}
          <path d="M${h.x - 15} ${h.y - 14} Q${h.x} ${h.y - 4} ${h.x + 15} ${h.y - 14} L${h.x + 12} ${h.y - 4} Q${h.x} ${h.y + 4} ${h.x - 12} ${h.y - 4}Z" fill="${M}" stroke="${OUT}" stroke-width="1.5"/>
          <path d="M${h.x - 11} ${h.y - 2} Q${h.x} ${h.y - 6} ${h.x + 11} ${h.y - 2} L${h.x + 10} ${h.y + 12} Q${h.x} ${h.y + 16} ${h.x - 10} ${h.y + 12}Z" fill="${M}" stroke="${OUT}" stroke-width="1.5"/>
          ${[-7.5, -2.5, 2.5, 7.5].map((dx) => `<rect x="${h.x + dx - 2.2}" y="${h.y + 10}" width="4.4" height="9" rx="2" fill="${M}" stroke="${OUT}" stroke-width="1"/>`).join('')}
          <path d="M${h.x - 5} ${h.y - 52} V${h.y - 16}" stroke="#fff" stroke-width="1.5" opacity=".5"/>`;
      }
      if (lk === 'studded') {
        return `<path d="M${h.x - 13} ${h.y - 48} h26 l2 40 h-30z" fill="${L}" stroke="${OUT}" stroke-width="1.6"/>${shadeOn(c, `M${h.x - 13} ${h.y - 48} h26 l2 40 h-30z`)}
          ${[[-7, -40], [7, -40], [-8, -26], [8, -26], [-9, -13], [9, -13]].map(([dx, dy]) => rivet(h.x + dx, h.y + dy, '#b9bec8', 2)).join('')}
          <path d="M${h.x - 15} ${h.y - 12} l3 8 l3 -7 l3 8 l3 -7 l3 8 l3 -7 l3 8 l3 -7 l2 6 v-10 h-26z" fill="${furFill(c)}" stroke="${OUT}" stroke-width=".9"/>
          <path d="M${h.x - 14} ${h.y - 50} h28 v6 h-28z" fill="${dye(c, P.cloth)}" stroke="${OUT}" stroke-width="1.2"/>`;
      }
      if (lk === 'runic') {
        return `<path d="M${h.x - 12} ${h.y - 50} l24 6 M${h.x - 12} ${h.y - 42} l24 6 M${h.x - 12} ${h.y - 34} l24 6" stroke="#d9cfb8" stroke-width="5" stroke-linecap="round" opacity=".9"/>
          <path d="M${h.x - 13} ${h.y - 28} h26 v22 h-26z" fill="${M}" stroke="${OUT}" stroke-width="1.6"/>${shadeOn(c, `M${h.x - 13} ${h.y - 28} h26 v22 h-26z`)}
          <path d="M${h.x - 8} ${h.y - 24} v14 M${h.x} ${h.y - 24} l-4 7 l8 3 l-4 6 M${h.x + 8} ${h.y - 24} v14" stroke="#3a3f4b" stroke-width="1.3" fill="none"/>
          <polygon points="${h.x},${h.y - 36} ${h.x + 5},${h.y - 30} ${h.x},${h.y - 24} ${h.x - 5},${h.y - 30}" fill="#8f7bff" stroke="${OUT}" stroke-width="1"/>`;
      }
      // bracers — кожаные наручи со шнуровкой
      return `<path d="M${h.x - 13} ${h.y - 46} h26 l1 38 h-28z" fill="${L}" stroke="${OUT}" stroke-width="1.6"/>${shadeOn(c, `M${h.x - 13} ${h.y - 46} h26 l1 38 h-28z`)}
        ${[0, 1, 2, 3].map((i) => `<path d="M${h.x - 5} ${h.y - 40 + i * 9} l10 5 M${h.x + 5} ${h.y - 40 + i * 9} l-10 5" stroke="#e2cfa4" stroke-width="1.4"/>`).join('')}
        ${stitch(`M${h.x - 12} ${h.y - 44} v34 M${h.x + 12} ${h.y - 44} v34`)}
        <rect x="${h.x - 14}" y="${h.y - 10}" width="28" height="6" rx="2" fill="${dye(c, '#2e1e12')}" stroke="${OUT}" stroke-width="1.2"/>
        <rect x="${h.x - 3}" y="${h.y - 11}" width="6" height="8" rx="1" fill="${T}" stroke="${OUT}" stroke-width="1"/>`;
    }).join('');
  }

  /* ================== ПОНОЖИ И ОБУВЬ ================== */
  function legGuards(c, A, it) {
    const P = pal(it), lk = look(it);
    const M = metal(c, P.metal), T = metal(c, P.trim), L = dye(c, P.leather), C = dye(c, P.cloth);
    return [A.legL, A.legR].map((l) => {
      const x = l.x, w = l.w, y = l.y, h = l.h, cx = x + w / 2;
      if (lk === 'greaves') {
        const d = `M${x - 3} ${y + 46} H${x + w + 3} L${x + w + 4} ${y + h - 14} H${x - 4}Z`;
        return `<path d="${d}" fill="${M}" stroke="${OUT}" stroke-width="1.7"/>${shadeOn(c, d)}
          <path d="M${x + w * 0.42} ${y + 50} V${y + h - 18}" stroke="#fff" stroke-width="1.4" opacity=".5"/>
          <path d="M${x - 6} ${y + 34} Q${cx} ${y + 24} ${x + w + 6} ${y + 34} Q${x + w + 8} ${y + 52} ${cx} ${y + 54} Q${x - 8} ${y + 52} ${x - 6} ${y + 34}Z" fill="${M}" stroke="${OUT}" stroke-width="1.7"/>${rivet(cx, y + 42)}
          <path d="M${x - 6} ${y + h - 16} H${x + w + 6} l4 24 H${x - 12}Z" fill="${M}" stroke="${OUT}" stroke-width="1.6"/>
          <path d="M${x - 8} ${y + h - 6} H${x + w + 8}" stroke="${OUT}" stroke-width="1.3"/>`;
      }
      if (lk === 'wraps') {
        const bands = Array.from({ length: 5 }, (_, i) => `<path d="M${x - 2} ${y + 50 + i * 10} L${x + w + 2} ${y + 58 + i * 10}" stroke="${L}" stroke-width="6" stroke-linecap="round"/>`).join('');
        return `${bands}
          <path d="M${x - 5} ${y + h - 30} H${x + w + 5} L${x + w + 7} ${y + h + 10} H${x - 9}Z" fill="${dye(c, '#2b1c12')}" stroke="${OUT}" stroke-width="1.5"/>
          <path d="M${x - 7} ${y + h - 32} l3 -7 l3 7 l3 -7 l3 7 l3 -7 l3 7 l3 -7 l3 7 l3 -7 l3 7 v6 h-${w + 14}z" fill="${furFill(c)}" stroke="${OUT}" stroke-width=".9"/>`;
      }
      if (lk === 'hose') {
        return `<path d="M${x - 1} ${y + 30} H${x + w + 1} L${x + w + 1} ${y + h - 14} H${x - 1}Z" fill="${C}" stroke="${OUT}" stroke-width="1.4"/>
          <path d="M${x - 4} ${y + h - 16} H${x + w + 4} l2 22 q10 4 14 12 H${x - 10}Z" fill="${dye(c, '#2a1d38')}" stroke="${OUT}" stroke-width="1.5"/>
          <rect x="${cx - 5}" y="${y + h - 8}" width="10" height="7" rx="1" fill="${metal(c, 'silver')}" stroke="${OUT}" stroke-width="1"/>`;
      }
      // boots — сапоги с отворотами
      return `<path d="M${x - 5} ${y + h - 46} H${x + w + 5} L${x + w + 6} ${y + h + 6} Q${x + w + 14} ${y + h + 10} ${x + w + 10} ${y + h + 14} H${x - 10} Q${x - 12} ${y + h + 2} ${x - 5} ${y + h - 46}Z" fill="${L}" stroke="${OUT}" stroke-width="1.6"/>
        ${shadeOn(c, `M${x - 5} ${y + h - 46} H${x + w + 5} L${x + w + 6} ${y + h + 6} H${x - 8}Z`)}
        <path d="M${x - 7} ${y + h - 48} H${x + w + 7} v10 H${x - 7}Z" fill="${dye(c, shade(P.leather, 0.15))}" stroke="${OUT}" stroke-width="1.4"/>
        <path d="M${x - 5} ${y + h - 20} H${x + w + 5}" stroke="#1c120a" stroke-width="3"/><rect x="${cx - 3}" y="${y + h - 23}" width="6" height="7" rx="1" fill="${T}" stroke="${OUT}" stroke-width="1"/>
        <path d="M${x - 10} ${y + h + 10} H${x + w + 12}" stroke="#120b06" stroke-width="4" stroke-linecap="round"/>`;
    }).join('');
  }

  /* ================== АМУЛЕТЫ ================== */
  function amulet(c, A, it) {
    const t = A.torso, cx = t.x + t.w / 2, P = pal(it), lk = look(it);
    const py = t.y + 40;
    const cord = lk === 'mjolnir' || lk === 'copper' ? `<path d="M${cx - 21} ${A.neckY + 2} Q${cx} ${py + 4} ${cx + 21} ${A.neckY + 2}" stroke="${metal(c, 'silver', 'v')}" stroke-width="2.6" fill="none" stroke-dasharray="1.6 1.6"/>`
      : `<path d="M${cx - 21} ${A.neckY + 2} Q${cx} ${py + 4} ${cx + 21} ${A.neckY + 2}" stroke="${dye(c, '#5a3d22')}" stroke-width="3" fill="none"/>`;
    let g = '';
    if (lk === 'mjolnir') {
      g = `<path d="M${cx} ${py - 6} V${py - 1}" stroke="${OUT}" stroke-width="1.5"/><rect x="${cx - 1.8}" y="${py}" width="3.6" height="17" rx="1.5" fill="${metal(c, 'silver')}" stroke="${OUT}" stroke-width="1.1"/>
        <path d="M${cx - 8} ${py - 8} h16 l2 3 v7 l-2 3 h-16 l-2 -3 v-7z" fill="${metal(c, 'silver')}" stroke="${OUT}" stroke-width="1.3"/>
        <path d="M${cx - 5} ${py - 5} h10 M${cx - 5} ${py - 1} h10" stroke="#444b5a" stroke-width="1"/>`;
    } else if (lk === 'crystal') {
      g = `<polygon points="${cx},${py - 12} ${cx + 8},${py - 4} ${cx + 6},${py + 10} ${cx},${py + 14} ${cx - 6},${py + 10} ${cx - 8},${py - 4}" fill="#7a60e8" stroke="${OUT}" stroke-width="1.3"/>
        <polygon points="${cx},${py - 12} ${cx + 8},${py - 4} ${cx},${py + 2}" fill="#b6a6ff"/><polygon points="${cx},${py + 2} ${cx + 6},${py + 10} ${cx},${py + 14}" fill="#4a35b8"/>
        <path d="M${cx - 9} ${py - 4} q-3 8 2 15 M${cx + 9} ${py - 4} q3 8 -2 15" fill="none" stroke="${metal(c, 'silver')}" stroke-width="2"/>`;
    } else if (lk === 'talisman') {
      g = `<circle cx="${cx}" cy="${py + 2}" r="10" fill="${metal(c, 'bone')}" stroke="${OUT}" stroke-width="1.3"/>
        <path d="M${cx} ${py - 6} v16 M${cx - 6} ${py - 2} l12 8 M${cx + 6} ${py - 2} l-12 8" stroke="#5a3d22" stroke-width="1.7" stroke-linecap="round"/>`;
    } else if (lk === 'copper') {
      g = `<path d="M${cx - 3} ${py - 9} h6 v6 h6 v6 h-6 v10 h-6 v-10 h-6 v-6 h6z" fill="${metal(c, 'copper')}" stroke="${OUT}" stroke-width="1.3"/>`;
    } else if (lk === 'claw') {
      g = `<path d="M${cx - 6} ${py - 8} Q${cx + 8} ${py - 4} ${cx + 4} ${py + 14} Q${cx - 2} ${py + 4} ${cx - 6} ${py - 8}Z" fill="${metal(c, 'bone')}" stroke="${OUT}" stroke-width="1.3"/>
        <rect x="${cx - 8}" y="${py - 11}" width="10" height="6" rx="2" fill="${dye(c, '#5a3d22')}" stroke="${OUT}" stroke-width="1"/>`;
    } else {   // amber
      g = `<circle cx="${cx}" cy="${py + 2}" r="8.5" fill="#f0a52a" stroke="${OUT}" stroke-width="1.3"/><circle cx="${cx - 2.5}" cy="${py - 1}" r="3" fill="#ffe08a" opacity=".85"/>
        <path d="M${cx - 8} ${py - 4} h16" stroke="${metal(c, 'bronze')}" stroke-width="3"/>`;
    }
    return cord + g;
  }

  /* ================== ОРУЖИЕ ================== */
  // Рисуется остриём вверх от точки руки (x, y); tilt — наклон в градусах.
  function weapon(c, it, x, y, tilt) {
    const P = pal(it), lk = look(it);
    const M = metal(c, 'steel'), T = metal(c, P.trim), L = dye(c, P.leather), W = metal(c, 'wood', 'h'), I = metal(c, 'darksteel');
    const wraps = (x0, y0, x1, y1, n) => Array.from({ length: n }, (_, i) => `<path d="M${x0} ${y0 + (y1 - y0) * i / n} l${x1 - x0} 3" stroke="#1a1109" stroke-width="1" opacity=".7"/>`).join('');
    const S = {
      sword: () => `
        <path d="M-6.5 -18 L-6 -100 Q0 -114 6 -100 L6.5 -18Z" fill="${M}" stroke="${OUT}" stroke-width="1.4"/>
        <path d="M0 -22 V-98" stroke="#6b727e" stroke-width="3.2" stroke-linecap="round" opacity=".75"/><path d="M-4 -24 V-94" stroke="#fff" stroke-width=".9" opacity=".6"/>
        <rect x="-19" y="-21" width="38" height="7" rx="3" fill="${T}" stroke="${OUT}" stroke-width="1.4"/>
        <circle cx="-19" cy="-17.5" r="3.4" fill="${T}" stroke="${OUT}" stroke-width="1.2"/><circle cx="19" cy="-17.5" r="3.4" fill="${T}" stroke="${OUT}" stroke-width="1.2"/>
        <rect x="-3.6" y="-14" width="7.2" height="24" rx="2" fill="${L}" stroke="${OUT}" stroke-width="1.3"/>${wraps(-3.6, -12, 7.2, 8, 5)}
        <circle cx="0" cy="13" r="5.6" fill="${T}" stroke="${OUT}" stroke-width="1.3"/>`,
      falchion: () => `
        <path d="M-5 -18 L-6 -60 Q-2 -96 16 -104 Q12 -84 8 -18Z" fill="${M}" stroke="${OUT}" stroke-width="1.4"/>
        <path d="M-2 -24 Q0 -70 12 -98" stroke="#fff" stroke-width="1.1" fill="none" opacity=".6"/><path d="M0 -26 Q2 -66 12 -92" stroke="#6b727e" stroke-width="2.6" fill="none" opacity=".6"/>
        <path d="M-15 -19 q15 -8 30 0 v6 q-15 -6 -30 0z" fill="${T}" stroke="${OUT}" stroke-width="1.4"/>
        <rect x="-3.6" y="-14" width="7.2" height="24" rx="3" fill="${L}" stroke="${OUT}" stroke-width="1.3"/>${wraps(-3.6, -12, 7.2, 8, 5)}
        <path d="M-5 8 q5 8 10 0" fill="${T}" stroke="${OUT}" stroke-width="1.3"/>`,
      dagger: () => `
        <path d="M-4.5 -14 L-4 -58 L0 -68 L4 -58 L4.5 -14Z" fill="${M}" stroke="${OUT}" stroke-width="1.3"/><path d="M0 -18 V-58" stroke="#fff" stroke-width=".9" opacity=".6"/>
        <ellipse cx="0" cy="-14" rx="10" ry="2.8" fill="${T}" stroke="${OUT}" stroke-width="1.3"/>
        <rect x="-3.3" y="-12" width="6.6" height="18" rx="2.5" fill="${W}" stroke="${OUT}" stroke-width="1.2"/>
        <ellipse cx="0" cy="8" rx="6.5" ry="3" fill="${T}" stroke="${OUT}" stroke-width="1.3"/>`,
      mace: () => `
        <rect x="-3.8" y="-78" width="7.6" height="98" rx="3" fill="${W}" stroke="${OUT}" stroke-width="1.3"/>${wraps(-3.8, -6, 7.6, 18, 6)}
        <g transform="translate(0 -92)">${[0, 60, 120].map((a) => `<path d="M-4 -20 L0 -30 L4 -20 L4 20 L0 30 L-4 20Z" fill="${I}" stroke="${OUT}" stroke-width="1.3" transform="rotate(${a})"/>`).join('')}
          <circle r="9" fill="${I}" stroke="${OUT}" stroke-width="1.3"/><circle cx="-2" cy="-2" r="3" fill="#fff" opacity=".25"/></g>
        <circle cx="0" cy="21" r="4.4" fill="${T}" stroke="${OUT}" stroke-width="1.2"/>`,
      axe: () => `
        <rect x="-3.6" y="-120" width="7.2" height="150" rx="3" fill="${W}" stroke="${OUT}" stroke-width="1.3"/>
        <rect x="-4.2" y="-14" width="8.4" height="34" rx="2" fill="${L}" stroke="${OUT}" stroke-width="1.2"/>${wraps(-4.2, -12, 8.4, 18, 7)}
        <path d="M3.6 -118 Q36 -128 40 -104 Q46 -80 30 -58 Q22 -62 12 -66 L3.6 -72Z" fill="${I}" stroke="${OUT}" stroke-width="1.6"/>
        <path d="M14 -110 Q34 -110 34 -100 Q36 -84 24 -66" fill="none" stroke="#c9cfd8" stroke-width="1.6" opacity=".7"/>
        <path d="M-3.6 -112 h-9 l-3 9 l12 4z" fill="${I}" stroke="${OUT}" stroke-width="1.4"/>
        <path d="M-3.6 -74 q-4 12 -3 26 M3.6 -74 q4 12 3 26" stroke="${dye(c, P.cloth)}" stroke-width="3.5" fill="none"/>
        <path d="M-6 30 l6 10 l6 -10z" fill="${I}" stroke="${OUT}" stroke-width="1.2"/>`,
      staff: () => `
        <rect x="-3.6" y="-118" width="7.2" height="148" rx="3.5" fill="${W}" stroke="${OUT}" stroke-width="1.3"/>
        <path d="M-2 -60 q3 6 -1 12 M2 -20 q-3 6 1 12" stroke="#1a1109" stroke-width="1" fill="none" opacity=".6"/>
        <path d="M-10 -128 Q-12 -112 0 -108 Q12 -112 10 -128 Q4 -118 0 -118 Q-4 -118 -10 -128Z" fill="${metal(c, 'silver')}" stroke="${OUT}" stroke-width="1.4"/>
        <polygon points="0,-152 8,-138 5,-124 -5,-124 -8,-138" fill="#7a60e8" stroke="${OUT}" stroke-width="1.4"/>
        <polygon points="0,-152 8,-138 0,-134" fill="#b6a6ff"/><circle cx="0" cy="-138" r="14" fill="#8f7bff" opacity=".22"/>
        <path d="M-3 -70 q-8 6 -6 22" stroke="${dye(c, P.cloth)}" stroke-width="3" fill="none"/>`,
      greatsword: () => `
        <path d="M-8 -20 L-7 -128 Q0 -146 7 -128 L8 -20Z" fill="${M}" stroke="${OUT}" stroke-width="1.5"/>
        <path d="M0 -26 V-126" stroke="#6b727e" stroke-width="4" stroke-linecap="round" opacity=".7"/><path d="M-5 -30 V-120" stroke="#fff" stroke-width="1" opacity=".6"/>
        <rect x="-25" y="-24" width="50" height="8" rx="3" fill="${T}" stroke="${OUT}" stroke-width="1.5"/>
        <circle cx="-25" cy="-20" r="4" fill="${T}" stroke="${OUT}" stroke-width="1.3"/><circle cx="25" cy="-20" r="4" fill="${T}" stroke="${OUT}" stroke-width="1.3"/>
        <rect x="-4" y="-16" width="8" height="38" rx="2.5" fill="${L}" stroke="${OUT}" stroke-width="1.3"/>${wraps(-4, -14, 8, 20, 8)}
        <circle cx="0" cy="26" r="6.5" fill="${T}" stroke="${OUT}" stroke-width="1.4"/><circle cx="-1.5" cy="24.5" r="2" fill="#fff" opacity=".4"/>`,
      // длинный лук: хват в руке, плечи лука вверх и вниз, тетива прямая
      bow: () => `
        <path d="M-2 -96 Q-34 -40 -6 -2 Q-34 36 -2 70" fill="none" stroke="${OUT}" stroke-width="8" stroke-linecap="round"/>
        <path d="M-2 -96 Q-34 -40 -6 -2 Q-34 36 -2 70" fill="none" stroke="${W}" stroke-width="5.5" stroke-linecap="round"/>
        <path d="M-2 -96 L-2 70" stroke="#e8e0c8" stroke-width="1.2"/>
        <rect x="-10" y="-9" width="8" height="16" rx="2" fill="${L}" stroke="${OUT}" stroke-width="1.2"/>
        <path d="M-24 -50 q6 4 4 10 M-24 46 q6 -4 4 -10" stroke="${dye(c, P.cloth)}" stroke-width="3" fill="none"/>`,
      maul: () => `
        <rect x="-3.8" y="-104" width="7.6" height="134" rx="3" fill="${W}" stroke="${OUT}" stroke-width="1.3"/>
        <rect x="-4.4" y="-8" width="8.8" height="34" rx="2" fill="${L}" stroke="${OUT}" stroke-width="1.2"/>${wraps(-4.4, -6, 8.8, 18, 7)}
        <rect x="-26" y="-134" width="52" height="34" rx="4" fill="${I}" stroke="${OUT}" stroke-width="1.6"/>
        <rect x="-26" y="-121" width="52" height="7" fill="${T}" opacity=".7"/><path d="M-22 -131 H22" stroke="#c9cfd8" stroke-width="1.3" opacity=".6"/>
        <path d="M26 -124 l22 8 l-22 8z" fill="${I}" stroke="${OUT}" stroke-width="1.4"/><rect x="-32" y="-129" width="6" height="24" rx="2" fill="${metal(c, 'darksteel')}" stroke="${OUT}" stroke-width="1.2"/>
        <path d="M-3 -100 q-3 4 0 8 M3 -100 q3 4 0 8" stroke="${dye(c, P.cloth)}" stroke-width="3" fill="none"/>`,
    };
    return `<g transform="translate(${x} ${y}) rotate(${tilt})">${(S[lk] || S.sword)()}</g>`;
  }

  /* ================== ЩИТЫ ================== */
  function shield(c, A, it, hand) {
    const P = pal(it), lk = look(it), x = hand.x - 6, y = hand.y - 40;
    const M = metal(c, P.metal), T = metal(c, P.trim), W = metal(c, 'wood'), C = dye(c, P.cloth);
    if (lk === 'round') {
      return `<g transform="translate(${x} ${y})"><circle r="33" fill="${W}" stroke="${OUT}" stroke-width="2"/>
        <path d="M-22 -24 V24 M-11 -31 V31 M0 -33 V33 M11 -31 V31 M22 -24 V24" stroke="#1d1209" stroke-width="1.2" opacity=".55"/>
        <path d="M0 -33 A33 33 0 0 1 33 0 L0 0Z M0 33 A33 33 0 0 1 -33 0 L0 0Z" fill="${dye(c, '#a83a2e')}" opacity=".85"/>
        <circle r="33" fill="${cyl(c)}" transform="rotate(0)"/>
        <circle r="31" fill="none" stroke="${metal(c, 'darksteel')}" stroke-width="4"/>
        ${Array.from({ length: 12 }, (_, i) => rivet(30 * Math.cos(i * Math.PI / 6), 30 * Math.sin(i * Math.PI / 6), '#b9bec8', 1.4)).join('')}
        <circle r="10" fill="${M}" stroke="${OUT}" stroke-width="1.8"/><circle cx="-3" cy="-3" r="3.4" fill="#fff" opacity=".55"/></g>`;
    }
    // heater — щит-«миндаль» с крестом
    return `<g transform="translate(${x} ${y})">
      <path d="M-28 -36 H28 V-4 C28 20 14 32 0 42 C-14 32 -28 20 -28 -4Z" fill="${M}" stroke="${OUT}" stroke-width="2"/>
      <path d="M-24 -32 H24 V-5 C24 17 12 28 0 37 C-12 28 -24 17 -24 -5Z" fill="${C}" stroke="${OUT}" stroke-width="1.2"/>
      <path d="M-3.5 -30 V34 M-22 -12 H22" stroke="#f1eedf" stroke-width="8"/>
      <path d="M-24 -32 H24 V-5 C24 17 12 28 0 37 C-12 28 -24 17 -24 -5Z" fill="${cyl(c)}"/>
      ${[[-24, -32], [24, -32], [-24, -6], [24, -6], [0, 38]].map(([px, py]) => rivet(px, py)).join('')}
      <path d="M-20 -30 H-8" stroke="#fff" stroke-width="1.6" opacity=".5"/></g>`;
  }

  /* ================== РАСХОДНИКИ ================== */
  function consumable(c, kind) {
    const glass = (liquid, liquidDark, shape) => `
      <rect x="25" y="4" width="14" height="10" rx="2" fill="${dye(c, '#8b6a3e')}" stroke="${OUT}" stroke-width="1.4"/>
      <path d="M26 14 H38 V22 ${shape} Z" fill="rgba(210,235,255,.35)" stroke="${OUT}" stroke-width="1.6"/>
      <path d="M21 34 ${shape.replace(/^L/, 'L')}" fill="none"/>`;
    if (kind === 'potion' || kind === 'elixir') {
      const col = kind === 'potion' ? ['#ff6f7a', '#a01e2c'] : ['#ffc456', '#b06a10'];
      const g = def(c, 'liq-' + kind, (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col[0]}"/><stop offset="1" stop-color="${col[1]}"/></linearGradient>`);
      const body = kind === 'potion'
        ? 'M26 18 H38 L38 26 Q54 32 52 46 Q50 60 32 60 Q14 60 12 46 Q10 32 26 26Z'
        : 'M27 16 H37 V26 Q50 30 52 44 Q52 60 32 60 Q12 60 12 44 Q14 30 27 26Z';
      return `<path d="${body}" fill="rgba(215,235,255,.3)" stroke="${OUT}" stroke-width="1.8"/>
        <path d="M14 42 Q13 56 32 58 Q51 56 50 42 Q32 36 14 42Z" fill="${g}"/>
        <rect x="26" y="4" width="12" height="11" rx="2" fill="${dye(c, '#8b6a3e')}" stroke="${OUT}" stroke-width="1.4"/><path d="M26 10 H38" stroke="#4a331a" stroke-width="1.2"/>
        <path d="M18 40 Q17 34 24 30" stroke="#fff" stroke-width="2.2" fill="none" opacity=".75" stroke-linecap="round"/>
        ${kind === 'potion' ? '<path d="M32 38 v14 M25 45 h14" stroke="#fff5f0" stroke-width="3.5"/>' : '<path d="M35 36 L27 48 H32 L29 57 L38 44 H33Z" fill="#fff6d0"/>'}`;
    }
    if (kind === 'dust') {
      return `<path d="M22 14 H42 L38 24 Q54 34 52 50 Q32 64 12 50 Q10 34 26 24Z" fill="${dye(c, '#b39a6a')}" stroke="${OUT}" stroke-width="1.8"/>
        <path d="M20 22 Q32 28 44 22" stroke="#5a4526" stroke-width="3" fill="none"/><path d="M22 14 Q32 8 42 14 L40 20 H24Z" fill="${dye(c, '#8b7346')}" stroke="${OUT}" stroke-width="1.5"/>
        <polygon points="22,40 27,45 22,50 17,45" fill="#5aa2f2"/><polygon points="38,36 43,41 38,46 33,41" fill="#e04a55"/><polygon points="32,48 37,53 32,58 27,53" fill="#3ec46d"/>
        <circle cx="46" cy="30" r="1.6" fill="#fff"/><circle cx="15" cy="30" r="1.3" fill="#fff"/>`;
    }
    // scroll — свиток с печатью
    return `<rect x="14" y="13" width="36" height="38" rx="2" fill="${def(c, 'parch', (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9c68a"/><stop offset=".5" stop-color="#f3e6b8"/><stop offset="1" stop-color="#cdb97a"/></linearGradient>`)}" stroke="${OUT}" stroke-width="1.5"/>
      <ellipse cx="14" cy="32" rx="4.5" ry="19.5" fill="#cbb676" stroke="${OUT}" stroke-width="1.4"/><ellipse cx="50" cy="32" rx="4.5" ry="19.5" fill="#cbb676" stroke="${OUT}" stroke-width="1.4"/>
      <path d="M21 21 h22 M21 27 h22 M21 33 h14" stroke="#7a6636" stroke-width="1.4"/>
      <path d="M26 44 h16" stroke="#7a6636" stroke-width="1.4"/>
      <circle cx="40" cy="42" r="7" fill="#b3261e" stroke="${OUT}" stroke-width="1.3"/><path d="M40 37 L37 43 H41 L39 47 L44 41 H40Z" fill="#ffd9a0"/>
      <path d="M40 48 q-2 8 -6 10 M40 48 q4 6 8 8" stroke="#b3261e" stroke-width="2.2" fill="none"/>`;
  }

  return { newCtx, shade, metal, dye, cyl, def, pal, look, LOOK, helm, chest, armGuards, legGuards, amulet, weapon, shield, consumable, OUT, mailFill, furFill, shadeOn, rivet, stitch };
})();
