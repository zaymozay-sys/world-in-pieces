if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Персонажи в полный рост (для окна ранца) и аватары (в бою).
   Герои фракций (рыцарь, гном, лучница, ящер) и Дракон нарисованы слоями SVG:
   тело, а поверх — надетые предметы из parts.js. Это временные рисунки:
   позже их можно заменить своими изображениями. */

const Figures = (() => {
  const { def, metal, dye, cyl, shadeOn, OUT, shade } = Parts;

  // Процедурные фигуры (FIG/BODY) нарисованы по одной на фракцию, без пола — а kind вида "elf-m"
  // приходит с полом (см. Factions.heroKind). Для запасной SVG-фигуры это несущественно: убираем "-m"/"-f".
  const baseOf = (kind) => (kind || '').replace(/-[mf]$/, '');

  /* ---------- опорные точки ---------- */
  const FIG = {
    dwarf: {
      name: _t("Старый боевой гном"),
      head: { cx: 120, cy: 80, r: 31 }, neckY: 108,
      torso: { x: 78, y: 126, w: 84, h: 108 },
      shL: { x: 84, y: 142 }, shR: { x: 156, y: 142 },
      hL: { x: 52, y: 238 }, hR: { x: 188, y: 238 },
      legL: { x: 88, y: 236, w: 29, h: 106 }, legR: { x: 123, y: 236, w: 29, h: 106 },
      skin: '#d9a982', sleeve: '#7f6242',
    },
    human: {
      name: _t("Странствующий рыцарь"),
      head: { cx: 120, cy: 78, r: 30 }, neckY: 106,
      torso: { x: 80, y: 124, w: 80, h: 110 },
      shL: { x: 86, y: 140 }, shR: { x: 154, y: 140 },
      hL: { x: 54, y: 238 }, hR: { x: 186, y: 238 },
      legL: { x: 89, y: 234, w: 28, h: 108 }, legR: { x: 123, y: 234, w: 28, h: 108 },
      skin: '#e2b48e', sleeve: '#35558f',
    },
    elf: {
      name: _t("Лесная лучница"),
      head: { cx: 120, cy: 78, r: 29 }, neckY: 106,
      torso: { x: 84, y: 124, w: 72, h: 110 },
      shL: { x: 90, y: 140 }, shR: { x: 150, y: 140 },
      hL: { x: 58, y: 236 }, hR: { x: 182, y: 236 },
      legL: { x: 92, y: 234, w: 25, h: 110 }, legR: { x: 123, y: 234, w: 25, h: 110 },
      skin: '#f0d3b8', sleeve: '#2f6a3e',
    },
    lizard: {
      name: _t("Ящер-следопыт"),
      head: { cx: 120, cy: 72, r: 32 }, neckY: 104,
      torso: { x: 82, y: 122, w: 76, h: 118 },
      shL: { x: 88, y: 142 }, shR: { x: 152, y: 142 },
      hL: { x: 50, y: 236 }, hR: { x: 190, y: 236 },
      legL: { x: 90, y: 240, w: 28, h: 104 }, legR: { x: 122, y: 240, w: 28, h: 104 },
      skin: '#7c8c3c', sleeve: '#7c8c3c',
    },
    dragon: {
      name: _t("Дракон"),
      head: { cx: 120, cy: 72, r: 33 }, neckY: 104,
      torso: { x: 82, y: 122, w: 76, h: 118 },
      shL: { x: 88, y: 142 }, shR: { x: 152, y: 142 },
      hL: { x: 48, y: 236 }, hR: { x: 192, y: 236 },
      legL: { x: 90, y: 240, w: 28, h: 104 }, legR: { x: 122, y: 240, w: 28, h: 104 },
      skin: '#2f7d4a', sleeve: '#2f7d4a',
    },
  };

  const rectPath = (x, y, w, h, r = 8) => `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y}Z`;

  /* ---------- общие материалы тела ---------- */
  const skinGrad = (c, hex) => def(c, 'skin' + hex.slice(1), (id) =>
    `<radialGradient id="${id}" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="${shade(hex, 0.25)}"/><stop offset=".6" stop-color="${hex}"/><stop offset="1" stop-color="${shade(hex, -0.35)}"/></radialGradient>`);
  const scalePat = (c) => def(c, 'scales', (id) =>
    `<pattern id="${id}" width="10" height="9" patternUnits="userSpaceOnUse"><rect width="10" height="9" fill="#2f7d4a"/>` +
    `<path d="M0 9 Q5 1 10 9 M-5 4.5 Q0 -3 5 4.5 M5 4.5 Q10 -3 15 4.5" fill="none" stroke="#1d5a34" stroke-width="1.2"/>` +
    `<path d="M1.5 6 Q5 2.5 8.5 6" fill="none" stroke="#5fbf83" stroke-width=".7" opacity=".6"/></pattern>`);
  const membrane = (c) => def(c, 'membrane', (id) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a3f5c"/><stop offset=".6" stop-color="#3d2440"/><stop offset="1" stop-color="#22142b"/></linearGradient>`);

  const armStroke = (A, sh, hd, c) => {
    const cx = (sh.x + hd.x) / 2 + (sh.x < 120 ? -12 : 12) * (Math.abs(hd.y - sh.y) > 60 ? 1 : 0.3);
    const cy = (sh.y + hd.y) / 2;
    const P = (t) => [(1 - t) * (1 - t) * sh.x + 2 * (1 - t) * t * cx + t * t * hd.x, (1 - t) * (1 - t) * sh.y + 2 * (1 - t) * t * cy + t * t * hd.y];
    const [mx, my] = P(0.55);
    return { cx, cy, mx, my };
  };

  /* ---------- гном ---------- */
  const dwarf = {
    back: () => '',
    legs: (c, A) => [A.legL, A.legR].map((l) => `
      <path d="${rectPath(l.x, l.y, l.w, l.h, 10)}" fill="${dye(c, '#5b4632')}" stroke="${OUT}" stroke-width="1.6"/>${shadeOn(c, rectPath(l.x, l.y, l.w, l.h, 10))}
      <path d="M${l.x - 5} ${l.y + l.h - 14} h${l.w + 10} v24 h-${l.w + 15} q0 -14 5 -24z" fill="${dye(c, '#2c1f14')}" stroke="${OUT}" stroke-width="1.5"/>
      <path d="M${l.x - 9} ${l.y + l.h + 10} h${l.w + 14}" stroke="#0e0904" stroke-width="4" stroke-linecap="round"/>`).join(''),
    torso: (c, A) => {
      const t = A.torso, cx = t.x + t.w / 2, b = t.y + t.h;
      const d = `M${t.x + 6} ${t.y + 8} Q${cx} ${t.y - 10} ${t.x + t.w - 6} ${t.y + 8} L${t.x + t.w + 3} ${t.y + 40} L${t.x + t.w - 4} ${b} Q${cx} ${b + 8} ${t.x + 4} ${b} L${t.x - 3} ${t.y + 40}Z`;
      return `<path d="${d}" fill="${dye(c, '#8b6b48')}" stroke="${OUT}" stroke-width="1.8"/>${shadeOn(c, d)}
        <path d="M${cx - 9} ${t.y + 2} L${cx} ${t.y + 22} L${cx + 9} ${t.y + 2}" fill="none" stroke="#3c2a18" stroke-width="2"/>
        <path d="M${cx - 6} ${t.y + 8} l12 6 M${cx + 6} ${t.y + 8} l-12 6 M${cx - 6} ${t.y + 15} l12 6" stroke="#e2cfa4" stroke-width="1.2"/>
        <rect x="${t.x - 1}" y="${b - 24}" width="${t.w + 2}" height="13" fill="${dye(c, '#3a2718')}" stroke="${OUT}" stroke-width="1.4"/>
        <rect x="${cx - 8}" y="${b - 26}" width="16" height="17" rx="2" fill="${metal(c, 'bronze')}" stroke="${OUT}" stroke-width="1.4"/><rect x="${cx - 4}" y="${b - 22}" width="8" height="9" rx="1" fill="none" stroke="#3b2a12" stroke-width="1.4"/>`;
    },
    arm: (c, A, sh, hd) => {
      const { cx, cy, mx, my } = armStroke(A, sh, hd, c);
      return `<path d="M${sh.x} ${sh.y} Q${cx} ${cy} ${hd.x} ${hd.y}" stroke="${OUT}" stroke-width="26" fill="none" stroke-linecap="round"/>
        <path d="M${sh.x} ${sh.y} Q${cx} ${cy} ${hd.x} ${hd.y}" stroke="${A.sleeve}" stroke-width="22" fill="none" stroke-linecap="round"/>
        <path d="M${mx.toFixed(1)} ${my.toFixed(1)} L${hd.x} ${hd.y}" stroke="${OUT}" stroke-width="21" fill="none" stroke-linecap="round"/>
        <path d="M${mx.toFixed(1)} ${my.toFixed(1)} L${hd.x} ${hd.y}" stroke="${A.skin}" stroke-width="17" fill="none" stroke-linecap="round"/>
        <circle cx="${hd.x}" cy="${hd.y}" r="11.5" fill="${skinGrad(c, A.skin)}" stroke="${OUT}" stroke-width="1.4"/>
        <path d="M${hd.x - 7} ${hd.y - 2} q3 -4 6 0 M${hd.x + 1} ${hd.y - 2} q3 -4 6 0" stroke="#a5754f" stroke-width="1.1" fill="none"/>`;
    },
    head: (c, A) => {
      const { cx, cy } = A.head;
      const skin = skinGrad(c, A.skin);
      const beard = def(c, 'beard', (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f2f4"/><stop offset=".6" stop-color="#c7cad0"/><stop offset="1" stop-color="#9599a2"/></linearGradient>`);
      const braid = (x) => `<g>${Array.from({ length: 6 }, (_, i) => `<ellipse cx="${x + (i % 2 ? 2.4 : -2.4)}" cy="${cy + 78 + i * 8}" rx="5" ry="5.2" fill="${beard}" stroke="#7d818a" stroke-width="1"/>`).join('')}
        <circle cx="${x}" cy="${cy + 96}" r="3.2" fill="none" stroke="#7a7f88" stroke-width="2"/><path d="M${x - 5} ${cy + 124} l5 10 l5 -10z" fill="#b5b9c2" stroke="#7d818a" stroke-width="1"/></g>`;
      return `<path d="M${cx - 32} ${cy - 4} Q${cx - 46} ${cy + 22} ${cx - 34} ${cy + 48} M${cx + 32} ${cy - 4} Q${cx + 46} ${cy + 22} ${cx + 34} ${cy + 48}" stroke="#dfe1e5" stroke-width="10" fill="none" stroke-linecap="round"/>
        <ellipse cx="${cx - 31}" cy="${cy + 6}" rx="5" ry="8" fill="${skin}" stroke="${OUT}" stroke-width="1.2"/><ellipse cx="${cx + 31}" cy="${cy + 6}" rx="5" ry="8" fill="${skin}" stroke="${OUT}" stroke-width="1.2"/>
        <circle cx="${cx}" cy="${cy}" r="31" fill="${skin}" stroke="${OUT}" stroke-width="1.6"/>
        <path d="M${cx - 18} ${cy - 22} q18 -8 36 0 M${cx - 14} ${cy - 17} q14 -6 28 0" stroke="#b98a64" stroke-width="1.2" fill="none" opacity=".8"/>
        <path d="M${cx - 30} ${cy + 6} Q${cx - 36} ${cy + 64} ${cx - 14} ${cy + 92} Q${cx} ${cy + 108} ${cx + 14} ${cy + 92} Q${cx + 36} ${cy + 64} ${cx + 30} ${cy + 6} Q${cx + 16} ${cy + 30} ${cx} ${cy + 26} Q${cx - 16} ${cy + 30} ${cx - 30} ${cy + 6}Z" fill="${beard}" stroke="#6f737c" stroke-width="1.5"/>
        <path d="M${cx - 20} ${cy + 30} Q${cx - 22} ${cy + 66} ${cx - 12} ${cy + 88} M${cx + 20} ${cy + 30} Q${cx + 22} ${cy + 66} ${cx + 12} ${cy + 88} M${cx - 6} ${cy + 36} Q${cx - 8} ${cy + 64} ${cx - 3} ${cy + 90} M${cx + 6} ${cy + 36} Q${cx + 8} ${cy + 64} ${cx + 3} ${cy + 90}" stroke="#8b8f98" stroke-width="1.4" fill="none" opacity=".7"/>
        ${braid(cx - 12)}${braid(cx + 12)}
        <path d="M${cx - 22} ${cy + 24} Q${cx - 10} ${cy + 16} ${cx} ${cy + 22} Q${cx + 10} ${cy + 16} ${cx + 22} ${cy + 24} Q${cx + 10} ${cy + 36} ${cx} ${cy + 30} Q${cx - 10} ${cy + 36} ${cx - 22} ${cy + 24}Z" fill="#e6e8ec" stroke="#8b8f98" stroke-width="1.2"/>
        <ellipse cx="${cx}" cy="${cy + 12}" rx="9" ry="7.5" fill="#c98d68" stroke="#8a5a3a" stroke-width="1"/><ellipse cx="${cx - 2}" cy="${cy + 9}" rx="3" ry="2" fill="#e8b48f" opacity=".7"/>
        <ellipse cx="${cx - 13}" cy="${cy - 2}" rx="4.2" ry="3" fill="#fff"/><circle cx="${cx - 13}" cy="${cy - 2}" r="2.2" fill="#2a1a10"/>
        <ellipse cx="${cx + 13}" cy="${cy - 2}" rx="4.2" ry="3" fill="#e9e6da"/><circle cx="${cx + 13}" cy="${cy - 2}" r="2.2" fill="#6f7f8f"/>
        <path d="M${cx - 24} ${cy - 11} Q${cx - 13} ${cy - 20} ${cx - 3} ${cy - 9} M${cx + 24} ${cy - 11} Q${cx + 13} ${cy - 20} ${cx + 3} ${cy - 9}" stroke="#eceef1" stroke-width="6" fill="none" stroke-linecap="round"/>
        <path d="M${cx + 20} ${cy - 24} L${cx + 6} ${cy + 8}" stroke="#a5605a" stroke-width="2.8" stroke-linecap="round"/><path d="M${cx + 18} ${cy - 16} l-6 3 M${cx + 15} ${cy - 8} l-6 3 M${cx + 11} ${cy - 1} l-6 3" stroke="#a5605a" stroke-width="1.5"/>
        <path d="M${cx - 30} ${cy - 10} Q${cx} ${cy - 24} ${cx + 30} ${cy - 10}" stroke="#3a2718" stroke-width="3" fill="none" opacity=".0"/>
        <path d="M${cx - 16} ${cy - 30} Q${cx} ${cy - 40} ${cx + 16} ${cy - 30}" stroke="#dfe1e5" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    },
  };

  /* ---------- дракон ---------- */
  const dragon = {
    back: (c) => {
      const M = membrane(c);
      const wing = `<path d="M88 132 Q34 44 4 122 Q14 112 22 118 Q26 132 38 138 Q42 122 54 150 Q64 126 76 168 Q86 148 90 204Z" fill="${M}" stroke="${OUT}" stroke-width="2"/>
        <path d="M90 134 Q62 84 8 116 M90 138 Q56 110 38 138 M90 146 Q68 126 54 150 M92 156 Q78 148 76 168" fill="none" stroke="#4a3328" stroke-width="3" stroke-linecap="round"/>
        <path d="M60 96 q-8 8 -10 20 M40 118 q-6 6 -6 16" stroke="#8a5a7a" stroke-width="1.2" fill="none" opacity=".8"/>`;
      return `${wing}<g transform="translate(240 0) scale(-1 1)">${wing}</g>
        <path d="M148 300 Q226 296 220 350 Q214 384 176 374 Q204 362 198 344 Q192 322 148 330Z" fill="${scalePat(c)}" stroke="${OUT}" stroke-width="2"/>
        <path d="M212 352 l18 -8 l-8 18z" fill="#e8dcc0" stroke="${OUT}" stroke-width="1.4"/>`;
    },
    legs: (c, A) => [A.legL, A.legR].map((l) => `
      <path d="${rectPath(l.x, l.y, l.w, l.h, 11)}" fill="${scalePat(c)}" stroke="${OUT}" stroke-width="1.8"/>${shadeOn(c, rectPath(l.x, l.y, l.w, l.h, 11))}
      <path d="M${l.x - 5} ${l.y + l.h - 6} q${l.w / 2 + 5} 14 ${l.w + 10} 0 l3 12 h-${l.w + 16}z" fill="${dye(c, '#27683d')}" stroke="${OUT}" stroke-width="1.4"/>
      <path d="M${l.x - 3} ${l.y + l.h + 6} l3 12 l4 -12 M${l.x + l.w / 2 - 4} ${l.y + l.h + 6} l4 13 l4 -13 M${l.x + l.w - 5} ${l.y + l.h + 6} l4 12 l3 -12" fill="#efe4c8" stroke="${OUT}" stroke-width="1.2" stroke-linejoin="round"/>`).join(''),
    torso: (c, A) => {
      const t = A.torso, cx = t.x + t.w / 2;
      const belly = def(c, 'belly', (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a99a68"/><stop offset=".5" stop-color="#e9dcaa"/><stop offset="1" stop-color="#a99a68"/></linearGradient>`);
      const plates = Array.from({ length: 7 }, (_, i) => `<path d="M${cx - 20 + i * 0.5} ${t.y + 22 + i * 14} Q${cx} ${t.y + 32 + i * 14} ${cx + 20 - i * 0.5} ${t.y + 22 + i * 14}" stroke="#8f7f4c" stroke-width="1.6" fill="none"/>`).join('');
      return `<ellipse cx="${cx}" cy="${t.y + t.h / 2}" rx="${t.w / 2 + 5}" ry="${t.h / 2 + 5}" fill="${scalePat(c)}" stroke="${OUT}" stroke-width="2"/>
        <ellipse cx="${cx}" cy="${t.y + t.h / 2}" rx="${t.w / 2 + 5}" ry="${t.h / 2 + 5}" fill="${cyl(c)}"/>
        <ellipse cx="${cx}" cy="${t.y + t.h / 2 + 6}" rx="${t.w / 2 - 14}" ry="${t.h / 2 - 8}" fill="${belly}" stroke="#7d6f3c" stroke-width="1.2"/>${plates}`;
    },
    arm: (c, A, sh, hd) => {
      const { cx, cy, mx, my } = armStroke(A, sh, hd, c);
      return `<path d="M${sh.x} ${sh.y} Q${cx} ${cy} ${hd.x} ${hd.y}" stroke="${OUT}" stroke-width="21" fill="none" stroke-linecap="round"/>
        <path d="M${sh.x} ${sh.y} Q${cx} ${cy} ${hd.x} ${hd.y}" stroke="#2f7d4a" stroke-width="17" fill="none" stroke-linecap="round"/>
        <path d="M${sh.x} ${sh.y} Q${cx} ${cy} ${hd.x} ${hd.y}" stroke="#5fbf83" stroke-width="4" fill="none" stroke-linecap="round" opacity=".5" transform="translate(-3 -1)"/>
        <circle cx="${hd.x}" cy="${hd.y}" r="10.5" fill="#2f7d4a" stroke="${OUT}" stroke-width="1.4"/>
        <path d="M${hd.x - 9} ${hd.y + 8} l-3 13 M${hd.x} ${hd.y + 11} l0 14 M${hd.x + 9} ${hd.y + 8} l3 13" stroke="#efe4c8" stroke-width="4" stroke-linecap="round"/><path d="M${hd.x - 9} ${hd.y + 8} l-3 13 M${hd.x} ${hd.y + 11} l0 14 M${hd.x + 9} ${hd.y + 8} l3 13" stroke="${OUT}" stroke-width=".8" fill="none"/>`;
    },
    head: (c, A) => {
      const { cx, cy } = A.head;
      const eye = def(c, 'eye', (id) => `<radialGradient id="${id}"><stop offset="0" stop-color="#fff3a0"/><stop offset=".6" stop-color="#ffb52a"/><stop offset="1" stop-color="#c26a10"/></radialGradient>`);
      const teeth = [-16, -8, 0, 8, 16].map((d) => `<path d="M${cx + d - 3} ${cy + 33} l3 9 l3 -9z" fill="#fff" stroke="#6b6250" stroke-width=".6"/>`).join('');
      const spines = [-16, -6, 4, 14].map((d, i) => `<path d="M${cx + d - 5} ${cy - 30 + i} l5 -15 l5 15z" fill="#e0902a" stroke="#7a4a0a" stroke-width="1"/>`).join('');
      return `<path d="M${cx - 18} ${A.neckY + 30} Q${cx - 24} ${A.neckY} ${cx - 20} ${cy + 20} H${cx + 20} Q${cx + 24} ${A.neckY} ${cx + 18} ${A.neckY + 30}Z" fill="${scalePat(c)}" stroke="${OUT}" stroke-width="2"/>
        <path d="M${cx - 30} ${cy - 22} Q${cx - 62} ${cy - 46} ${cx - 64} ${cy - 70} Q${cx - 40} ${cy - 52} ${cx - 22} ${cy - 30}Z M${cx + 30} ${cy - 22} Q${cx + 62} ${cy - 46} ${cx + 64} ${cy - 70} Q${cx + 40} ${cy - 52} ${cx + 22} ${cy - 30}Z" fill="${metal(c, 'bone', 'v')}" stroke="${OUT}" stroke-width="1.6"/>
        <path d="M${cx - 34} ${cy - 2} Q${cx - 34} ${cy - 34} ${cx} ${cy - 36} Q${cx + 34} ${cy - 34} ${cx + 34} ${cy - 2} Q${cx + 34} ${cy + 26} ${cx + 20} ${cy + 34} H${cx - 20} Q${cx - 34} ${cy + 26} ${cx - 34} ${cy - 2}Z" fill="${scalePat(c)}" stroke="${OUT}" stroke-width="2"/>
        <rect x="${cx - 19}" y="${cy + 2}" width="38" height="32" rx="13" fill="${dye(c, '#3b9160')}" stroke="${OUT}" stroke-width="1.6"/>
        <ellipse cx="${cx - 7}" cy="${cy + 14}" rx="3" ry="4" fill="#0f2a1a"/><ellipse cx="${cx + 7}" cy="${cy + 14}" rx="3" ry="4" fill="#0f2a1a"/>
        <path d="M${cx - 28} ${cy - 8} Q${cx - 18} ${cy - 20} ${cx - 8} ${cy - 8} Q${cx - 18} ${cy - 1} ${cx - 28} ${cy - 8}Z M${cx + 28} ${cy - 8} Q${cx + 18} ${cy - 20} ${cx + 8} ${cy - 8} Q${cx + 18} ${cy - 1} ${cx + 28} ${cy - 8}Z" fill="${eye}" stroke="#4a2a06" stroke-width="1.2"/>
        <ellipse cx="${cx - 18}" cy="${cy - 9}" rx="1.8" ry="5.4" fill="#120b02"/><ellipse cx="${cx + 18}" cy="${cy - 9}" rx="1.8" ry="5.4" fill="#120b02"/>
        <path d="M${cx - 30} ${cy - 16} Q${cx - 18} ${cy - 26} ${cx - 6} ${cy - 16} M${cx + 30} ${cy - 16} Q${cx + 18} ${cy - 26} ${cx + 6} ${cy - 16}" stroke="${OUT}" stroke-width="2.4" fill="none"/>
        <path d="M${cx - 20} ${cy + 30} H${cx + 20}" stroke="#0f2a1a" stroke-width="2"/>${teeth}${spines}`;
    },
  };


  /* ---------- общие части для людей и эльфов ---------- */
  const clothLegs = (c, A, pants, boots) => [A.legL, A.legR].map((l) => `
    <path d="${rectPath(l.x, l.y, l.w, l.h, 10)}" fill="${dye(c, pants)}" stroke="${OUT}" stroke-width="1.6"/>${shadeOn(c, rectPath(l.x, l.y, l.w, l.h, 10))}
    <path d="M${l.x - 4} ${l.y + l.h - 30} h${l.w + 8} v40 h-${l.w + 13} q0 -14 5 -24z" fill="${dye(c, boots)}" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M${l.x - 5} ${l.y + l.h - 30} h${l.w + 10}" stroke="${shade(boots, 0.25)}" stroke-width="3"/>
    <path d="M${l.x - 9} ${l.y + l.h + 10} h${l.w + 14}" stroke="#0e0904" stroke-width="4" stroke-linecap="round"/>`).join('');

  const tunic = (c, A, cloth, belt, quilted) => {
    const t = A.torso, cx = t.x + t.w / 2, b = t.y + t.h;
    const d = `M${t.x + 6} ${t.y + 8} Q${cx} ${t.y - 10} ${t.x + t.w - 6} ${t.y + 8} L${t.x + t.w + 2} ${t.y + 40} L${t.x + t.w - 2} ${b + 6} Q${cx} ${b + 14} ${t.x + 2} ${b + 6} L${t.x - 2} ${t.y + 40}Z`;
    const lines = quilted ? Array.from({ length: 6 }, (_, i) => `<path d="M${t.x + 4} ${t.y + 24 + i * 14} Q${cx} ${t.y + 30 + i * 14} ${t.x + t.w - 4} ${t.y + 24 + i * 14}" stroke="${shade(cloth, -0.35)}" stroke-width="1.2" fill="none"/>`).join('') : '';
    return `<path d="${d}" fill="${dye(c, cloth)}" stroke="${OUT}" stroke-width="1.8"/>${shadeOn(c, d)}${lines}
      <path d="M${cx - 10} ${t.y + 1} L${cx} ${t.y + 20} L${cx + 10} ${t.y + 1}" fill="${dye(c, shade(cloth, -0.3))}" stroke="${OUT}" stroke-width="1.2"/>
      <rect x="${t.x - 1}" y="${b - 26}" width="${t.w + 2}" height="11" fill="${dye(c, belt)}" stroke="${OUT}" stroke-width="1.4"/>
      <rect x="${cx - 7}" y="${b - 27}" width="14" height="13" rx="2" fill="${metal(c, 'bronze')}" stroke="${OUT}" stroke-width="1.3"/>`;
  };

  /* ---------- человек: странствующий рыцарь ---------- */
  const human = {
    back: () => '',
    legs: (c, A) => clothLegs(c, A, '#4d4a44', '#3a2718'),
    torso: (c, A) => tunic(c, A, '#35558f', '#3a2718', true),
    arm: (c, A, sh, hd) => dwarf.arm(c, A, sh, hd),
    head: (c, A) => {
      const { cx, cy } = A.head, skin = skinGrad(c, A.skin);
      return `<rect x="${cx - 10}" y="${cy + 18}" width="20" height="${A.neckY - cy}" fill="${skin}" stroke="${OUT}" stroke-width="1.2"/>
        <ellipse cx="${cx - 29}" cy="${cy + 4}" rx="5" ry="8" fill="${skin}" stroke="${OUT}" stroke-width="1.2"/><ellipse cx="${cx + 29}" cy="${cy + 4}" rx="5" ry="8" fill="${skin}" stroke="${OUT}" stroke-width="1.2"/>
        <path d="M${cx - 28} ${cy - 6} Q${cx - 30} ${cy + 30} ${cx} ${cy + 34} Q${cx + 30} ${cy + 30} ${cx + 28} ${cy - 6} Q${cx + 26} ${cy - 32} ${cx} ${cy - 33} Q${cx - 26} ${cy - 32} ${cx - 28} ${cy - 6}Z" fill="${skin}" stroke="${OUT}" stroke-width="1.6"/>
        <path d="M${cx - 30} ${cy} Q${cx - 34} ${cy - 36} ${cx} ${cy - 38} Q${cx + 34} ${cy - 36} ${cx + 30} ${cy - 2} Q${cx + 26} ${cy - 20} ${cx + 8} ${cy - 22} Q${cx - 14} ${cy - 18} ${cx - 22} ${cy - 26} Q${cx - 26} ${cy - 14} ${cx - 30} ${cy}Z" fill="${dye(c, '#5a3a22')}" stroke="${OUT}" stroke-width="1.4"/>
        <path d="M${cx - 24} ${cy + 10} Q${cx - 22} ${cy + 30} ${cx} ${cy + 34} Q${cx + 22} ${cy + 30} ${cx + 24} ${cy + 10} Q${cx + 16} ${cy + 22} ${cx} ${cy + 21} Q${cx - 16} ${cy + 22} ${cx - 24} ${cy + 10}Z" fill="#5a3a22" opacity=".75"/>
        <path d="M${cx - 8} ${cy + 18} Q${cx} ${cy + 22} ${cx + 8} ${cy + 18}" stroke="#7a3b2e" stroke-width="2" fill="none"/>
        <path d="M${cx - 2} ${cy - 2} L${cx - 4} ${cy + 10} L${cx + 3} ${cy + 11}" stroke="#a8764f" stroke-width="1.6" fill="none"/>
        <ellipse cx="${cx - 11}" cy="${cy - 2}" rx="4.4" ry="3" fill="#fff"/><circle cx="${cx - 11}" cy="${cy - 2}" r="2.2" fill="#3b6ea8"/><circle cx="${cx - 11}" cy="${cy - 2}" r="1" fill="#111"/>
        <ellipse cx="${cx + 11}" cy="${cy - 2}" rx="4.4" ry="3" fill="#fff"/><circle cx="${cx + 11}" cy="${cy - 2}" r="2.2" fill="#3b6ea8"/><circle cx="${cx + 11}" cy="${cy - 2}" r="1" fill="#111"/>
        <path d="M${cx - 17} ${cy - 9} Q${cx - 11} ${cy - 13} ${cx - 5} ${cy - 9} M${cx + 17} ${cy - 9} Q${cx + 11} ${cy - 13} ${cx + 5} ${cy - 9}" stroke="#4a2e18" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    },
  };

  /* ---------- эльфийка: лесная лучница ---------- */
  const HAIR = '#e6cf7a';
  const elf = {
    back: (c, A) => {
      const { cx, cy } = A.head;
      return `<path d="M${cx - 30} ${cy - 6} Q${cx - 40} ${cy + 60} ${cx - 30} ${cy + 108} L${cx - 12} ${cy + 96} L${cx} ${cy + 110} L${cx + 12} ${cy + 96} L${cx + 30} ${cy + 108} Q${cx + 40} ${cy + 60} ${cx + 30} ${cy - 6}Z" fill="${dye(c, HAIR)}" stroke="${OUT}" stroke-width="1.4"/>
        <g transform="translate(${cx + 24} ${cy + 46}) rotate(18)"><rect x="-8" y="0" width="16" height="62" rx="4" fill="${dye(c, '#6b4a2b')}" stroke="${OUT}" stroke-width="1.4"/>
          ${[-4, 0, 4].map((dx) => `<path d="M${dx} 0 V-16" stroke="#8a6a3a" stroke-width="1.6"/><path d="M${dx - 3} -18 l3 -8 l3 8z" fill="#e8e0c8" stroke="${OUT}" stroke-width=".6"/>`).join('')}
          <rect x="-8" y="10" width="16" height="4" fill="#3fae63"/></g>`;
    },
    legs: (c, A) => clothLegs(c, A, '#3d4a33', '#5a3d24'),
    torso: (c, A) => {
      const t = A.torso, cx = t.x + t.w / 2, b = t.y + t.h;
      const leaves = Array.from({ length: 7 }, (_, i) => `<path d="M${t.x - 2 + i * (t.w + 4) / 7} ${b + 4} q${(t.w + 4) / 14} 14 ${(t.w + 4) / 7} 0" fill="#2f6a3e" stroke="${OUT}" stroke-width="1"/>`).join('');
      return `${tunic(c, A, '#3a7a48', '#5a3d24', false)}${leaves}
        <path d="M${t.x + 6} ${t.y + 6} L${t.x + t.w - 8} ${b - 30}" stroke="${dye(c, '#6b4a2b')}" stroke-width="6"/>
        <path d="M${cx - 12} ${t.y + 40} q12 -8 24 0" stroke="#9fd8a8" stroke-width="1.4" fill="none" opacity=".7"/>`;
    },
    arm: (c, A, sh, hd) => dwarf.arm(c, A, sh, hd),
    head: (c, A) => {
      const { cx, cy } = A.head, skin = skinGrad(c, A.skin), H = dye(c, HAIR);
      return `<rect x="${cx - 8}" y="${cy + 18}" width="16" height="${A.neckY - cy}" fill="${skin}" stroke="${OUT}" stroke-width="1.2"/>
        <path d="M${cx - 24} ${cy - 2} L${cx - 50} ${cy - 22} L${cx - 26} ${cy + 12}Z M${cx + 24} ${cy - 2} L${cx + 50} ${cy - 22} L${cx + 26} ${cy + 12}Z" fill="${skin}" stroke="${OUT}" stroke-width="1.3"/>
        <path d="M${cx - 30} ${cy - 16} L${cx - 44} ${cy - 18} M${cx + 30} ${cy - 16} L${cx + 44} ${cy - 18}" stroke="#d8a88a" stroke-width="1" opacity=".0"/>
        <path d="M${cx - 25} ${cy - 6} Q${cx - 27} ${cy + 26} ${cx} ${cy + 33} Q${cx + 27} ${cy + 26} ${cx + 25} ${cy - 6} Q${cx + 24} ${cy - 32} ${cx} ${cy - 33} Q${cx - 24} ${cy - 32} ${cx - 25} ${cy - 6}Z" fill="${skin}" stroke="${OUT}" stroke-width="1.5"/>
        <path d="M${cx - 29} ${cy + 20} Q${cx - 34} ${cy - 30} ${cx} ${cy - 36} Q${cx + 34} ${cy - 30} ${cx + 29} ${cy + 20} Q${cx + 24} ${cy - 6} ${cx + 20} ${cy - 18} Q${cx + 4} ${cy - 10} ${cx - 14} ${cy - 22} Q${cx - 22} ${cy - 6} ${cx - 29} ${cy + 20}Z" fill="${H}" stroke="${OUT}" stroke-width="1.4"/>
        <path d="M${cx - 27} ${cy + 16} Q${cx - 30} ${cy + 40} ${cx - 24} ${cy + 56} M${cx + 27} ${cy + 16} Q${cx + 30} ${cy + 40} ${cx + 24} ${cy + 56}" stroke="${HAIR}" stroke-width="7" fill="none" stroke-linecap="round"/>
        <path d="M${cx - 16} ${cy - 20} Q${cx - 4} ${cy - 30} ${cx + 14} ${cy - 24}" stroke="#fff3c0" stroke-width="1.6" fill="none" opacity=".7"/>
        <path d="M${cx - 16} ${cy + 1} Q${cx - 10} ${cy - 5} ${cx - 4} ${cy} Q${cx - 10} ${cy + 3} ${cx - 16} ${cy + 1}Z M${cx + 16} ${cy + 1} Q${cx + 10} ${cy - 5} ${cx + 4} ${cy} Q${cx + 10} ${cy + 3} ${cx + 16} ${cy + 1}Z" fill="#fff" stroke="${OUT}" stroke-width=".8"/>
        <circle cx="${cx - 10}" cy="${cy}" r="2.3" fill="#2f9a55"/><circle cx="${cx + 10}" cy="${cy}" r="2.3" fill="#2f9a55"/><circle cx="${cx - 10}" cy="${cy}" r="1" fill="#111"/><circle cx="${cx + 10}" cy="${cy}" r="1" fill="#111"/>
        <path d="M${cx - 17} ${cy - 7} Q${cx - 10} ${cy - 11} ${cx - 4} ${cy - 7} M${cx + 17} ${cy - 7} Q${cx + 10} ${cy - 11} ${cx + 4} ${cy - 7}" stroke="#b89a4a" stroke-width="1.6" fill="none"/>
        <path d="M${cx} ${cy + 3} L${cx - 2} ${cy + 11} L${cx + 2} ${cy + 12}" stroke="#c9937a" stroke-width="1.3" fill="none"/>
        <path d="M${cx - 6} ${cy + 19} Q${cx} ${cy + 23} ${cx + 6} ${cy + 19} Q${cx} ${cy + 20} ${cx - 6} ${cy + 19}Z" fill="#c8606a" stroke="#8a3a40" stroke-width=".8"/>`;
    },
  };

  /* ---------- ящер-следопыт ---------- */
  const lizScales = (c) => def(c, 'scalesL', (id) =>
    `<pattern id="${id}" width="9" height="8" patternUnits="userSpaceOnUse"><rect width="9" height="8" fill="#7c8c3c"/>` +
    `<path d="M0 8 Q4.5 1 9 8 M-4.5 4 Q0 -2 4.5 4 M4.5 4 Q9 -2 13.5 4" fill="none" stroke="#4e5a22" stroke-width="1.1"/>` +
    `<path d="M1.5 5.5 Q4.5 2.5 7.5 5.5" fill="none" stroke="#c0cf78" stroke-width=".7" opacity=".6"/></pattern>`);
  const lizard = {
    back: (c) => `<path d="M146 300 Q224 300 222 348 Q220 386 180 380 Q206 366 202 348 Q196 326 146 330Z" fill="${lizScales(c)}" stroke="${OUT}" stroke-width="2"/>
      <path d="M160 312 Q200 312 206 336 M170 340 Q190 344 196 356" stroke="#c9483a" stroke-width="3" fill="none" opacity=".7"/>`,
    legs: (c, A) => [A.legL, A.legR].map((l) => `
      <path d="${rectPath(l.x, l.y, l.w, l.h, 11)}" fill="${lizScales(c)}" stroke="${OUT}" stroke-width="1.8"/>${shadeOn(c, rectPath(l.x, l.y, l.w, l.h, 11))}
      <path d="M${l.x - 5} ${l.y + l.h - 6} q${l.w / 2 + 5} 14 ${l.w + 10} 0 l3 12 h-${l.w + 16}z" fill="${dye(c, '#687630')}" stroke="${OUT}" stroke-width="1.4"/>
      <path d="M${l.x - 3} ${l.y + l.h + 6} l3 11 l4 -11 M${l.x + l.w / 2 - 4} ${l.y + l.h + 6} l4 12 l4 -12 M${l.x + l.w - 5} ${l.y + l.h + 6} l4 11 l3 -11" fill="#2a2418" stroke="${OUT}" stroke-width="1.1" stroke-linejoin="round"/>`).join(''),
    torso: (c, A) => {
      const t = A.torso, cx = t.x + t.w / 2, b = t.y + t.h;
      const belly = def(c, 'bellyL', (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b8a66a"/><stop offset=".5" stop-color="#eadba2"/><stop offset="1" stop-color="#b8a66a"/></linearGradient>`);
      const plates = Array.from({ length: 6 }, (_, i) => `<path d="M${cx - 18} ${t.y + 24 + i * 14} Q${cx} ${t.y + 33 + i * 14} ${cx + 18} ${t.y + 24 + i * 14}" stroke="#8f7f4c" stroke-width="1.5" fill="none"/>`).join('');
      const fringe = Array.from({ length: 9 }, (_, i) => `<path d="M${t.x + 6 + i * (t.w - 12) / 8} ${b - 6} l-2 16" stroke="#5a3d24" stroke-width="3" stroke-linecap="round"/>`).join('');
      return `<ellipse cx="${cx}" cy="${t.y + t.h / 2}" rx="${t.w / 2 + 5}" ry="${t.h / 2 + 5}" fill="${lizScales(c)}" stroke="${OUT}" stroke-width="2"/>
        <ellipse cx="${cx}" cy="${t.y + t.h / 2}" rx="${t.w / 2 + 5}" ry="${t.h / 2 + 5}" fill="${cyl(c)}"/>
        <ellipse cx="${cx}" cy="${t.y + t.h / 2 + 4}" rx="${t.w / 2 - 14}" ry="${t.h / 2 - 10}" fill="${belly}" stroke="#7d6f3c" stroke-width="1.2"/>${plates}
        <path d="M${t.x + 4} ${t.y + 12} L${t.x + t.w - 10} ${b - 24}" stroke="${dye(c, '#6b4a2b')}" stroke-width="6"/>
        ${[0.25, 0.5, 0.75].map((k) => `<circle cx="${t.x + 4 + (t.w - 14) * k}" cy="${t.y + 12 + (t.h - 36) * k}" r="3" fill="#efe6cd" stroke="${OUT}" stroke-width=".8"/>`).join('')}
        <path d="M${t.x - 2} ${b - 18} H${t.x + t.w + 2} L${t.x + t.w - 4} ${b - 6} H${t.x + 4}Z" fill="${dye(c, '#6b4a2b')}" stroke="${OUT}" stroke-width="1.4"/>${fringe}`;
    },
    arm: (c, A, sh, hd) => {
      const { cx, cy } = armStroke(A, sh, hd, c);
      return `<path d="M${sh.x} ${sh.y} Q${cx} ${cy} ${hd.x} ${hd.y}" stroke="${OUT}" stroke-width="21" fill="none" stroke-linecap="round"/>
        <path d="M${sh.x} ${sh.y} Q${cx} ${cy} ${hd.x} ${hd.y}" stroke="#7c8c3c" stroke-width="17" fill="none" stroke-linecap="round"/>
        <path d="M${sh.x} ${sh.y} Q${cx} ${cy} ${hd.x} ${hd.y}" stroke="#c0cf78" stroke-width="4" fill="none" stroke-linecap="round" opacity=".45" transform="translate(-3 -1)"/>
        <circle cx="${hd.x}" cy="${hd.y}" r="10.5" fill="#7c8c3c" stroke="${OUT}" stroke-width="1.4"/>
        <path d="M${hd.x - 9} ${hd.y + 8} l-3 12 M${hd.x} ${hd.y + 11} l0 13 M${hd.x + 9} ${hd.y + 8} l3 12" stroke="#2a2418" stroke-width="3.5" stroke-linecap="round"/>`;
    },
    head: (c, A) => {
      const { cx, cy } = A.head;
      const eye = def(c, 'eyeL', (id) => `<radialGradient id="${id}"><stop offset="0" stop-color="#fff6b0"/><stop offset=".7" stop-color="#e8b820"/><stop offset="1" stop-color="#9a6a08"/></radialGradient>`);
      const frill = Array.from({ length: 9 }, (_, i) => {
        const a = Math.PI * (1.08 + i * 0.105), x = cx + 46 * Math.cos(a), y = cy - 6 + 46 * Math.sin(a);
        return `<path d="M${cx} ${cy - 6} L${(cx + 38 * Math.cos(a - 0.06)).toFixed(1)} ${(cy - 6 + 38 * Math.sin(a - 0.06)).toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)} L${(cx + 38 * Math.cos(a + 0.06)).toFixed(1)} ${(cy - 6 + 38 * Math.sin(a + 0.06)).toFixed(1)}Z" fill="#c9483a" stroke="#6a1e16" stroke-width="1"/>`;
      }).join('');
      return `<path d="M${cx - 17} ${A.neckY + 30} Q${cx - 22} ${A.neckY} ${cx - 18} ${cy + 22} H${cx + 18} Q${cx + 22} ${A.neckY} ${cx + 17} ${A.neckY + 30}Z" fill="${lizScales(c)}" stroke="${OUT}" stroke-width="2"/>
        <path d="M${cx - 10} ${cy + 26} Q${cx} ${cy + 48} ${cx + 10} ${cy + 26}" fill="#e2c86a" stroke="${OUT}" stroke-width="1.2"/>
        ${frill}
        <path d="M${cx - 30} ${cy} Q${cx - 32} ${cy - 30} ${cx} ${cy - 32} Q${cx + 32} ${cy - 30} ${cx + 30} ${cy} Q${cx + 30} ${cy + 22} ${cx + 18} ${cy + 32} H${cx - 18} Q${cx - 30} ${cy + 22} ${cx - 30} ${cy}Z" fill="${lizScales(c)}" stroke="${OUT}" stroke-width="2"/>
        <path d="M${cx - 16} ${cy + 6} Q${cx} ${cy + 2} ${cx + 16} ${cy + 6} L${cx + 14} ${cy + 30} Q${cx} ${cy + 36} ${cx - 14} ${cy + 30}Z" fill="${dye(c, '#8e9c48')}" stroke="${OUT}" stroke-width="1.3"/>
        <ellipse cx="${cx - 5}" cy="${cy + 12}" rx="1.8" ry="3" fill="#1b1f0c"/><ellipse cx="${cx + 5}" cy="${cy + 12}" rx="1.8" ry="3" fill="#1b1f0c"/>
        <path d="M${cx - 13} ${cy + 26} Q${cx} ${cy + 31} ${cx + 13} ${cy + 26}" stroke="#1b1f0c" stroke-width="1.8" fill="none"/>
        ${[-8, -2, 4].map((d) => `<path d="M${cx + d} ${cy + 27} l2 4 l2 -4z" fill="#fff" stroke="#5a5a40" stroke-width=".5"/>`).join('')}
        <ellipse cx="${cx - 19}" cy="${cy - 6}" rx="7" ry="6" fill="${eye}" stroke="#3a3208" stroke-width="1.2"/><ellipse cx="${cx + 19}" cy="${cy - 6}" rx="7" ry="6" fill="${eye}" stroke="#3a3208" stroke-width="1.2"/>
        <ellipse cx="${cx - 19}" cy="${cy - 6}" rx="1.4" ry="5" fill="#120e02"/><ellipse cx="${cx + 19}" cy="${cy - 6}" rx="1.4" ry="5" fill="#120e02"/>
        <path d="M${cx - 28} ${cy - 14} Q${cx - 19} ${cy - 20} ${cx - 10} ${cy - 13} M${cx + 28} ${cy - 14} Q${cx + 19} ${cy - 20} ${cx + 10} ${cy - 13}" stroke="${OUT}" stroke-width="2.4" fill="none"/>
        <path d="M${cx - 8} ${cy - 24} Q${cx} ${cy - 28} ${cx + 8} ${cy - 24}" stroke="#c9483a" stroke-width="3" fill="none"/>`;
    },
  };

  const BODY = { dwarf, dragon, human, elf, lizard };

  /* ---------- сборка ---------- */
  function build(kind, gear, c) {
    const A = FIG[baseOf(kind)], B = BODY[baseOf(kind)];
    const G = gear || Gear.emptyLoadout();
    const it = (s) => Gear.item(G[s]);
    const main = it('main'), off = it('off');
    const two = main && main.type === 'weapon2';
    const hL = A.hL;
    const hR = two ? { x: hL.x + 3, y: hL.y - 36 } : A.hR;

    const parts = [];
    parts.push(B.back(c, A));
    parts.push(B.legs(c, A));
    if (it('legs')) parts.push(Parts.legGuards(c, A, it('legs')));
    parts.push(B.torso(c, A));
    if (it('chest')) parts.push(Parts.chest(c, A, it('chest')));
    parts.push(B.arm(c, A, A.shL, hL), B.arm(c, A, A.shR, hR));
    if (it('arms')) parts.push(Parts.armGuards(c, A, it('arms'), [hL, hR]));
    if (it('gloves')) parts.push(Parts.gloves(c, A, it('gloves'), [hL, hR]));
    if (it('shoulders')) parts.push(Parts.pauldrons(c, A, it('shoulders')));
    if (it('amulet')) parts.push(Parts.amulet(c, A, it('amulet')));
    parts.push(B.head(c, A));
    if (it('head')) parts.push(Parts.helm(c, A, it('head')));
    if (main) parts.push(Parts.weapon(c, main, hL.x, hL.y, -6));
    if (off) parts.push(off.type === 'shield' ? Parts.shield(c, A, off, hR) : Parts.weapon(c, off, hR.x, hR.y, 6));
    return parts;
  }

  const defsOf = (c) => `<defs>${Object.values(c.defs).join('')}</defs>`;

  // Полноростовая фигура для окна ранца.
  function figure(kind, gear) {
    if (typeof Art !== 'undefined' && Art.hasBody(kind)) return Art.body(kind, gear, FIG[baseOf(kind)].name);   // рисунок из папки art/
    const c = Parts.newCtx();
    const body = build(kind, gear, c).join('');
    return `<svg class="figure" viewBox="-24 -26 288 426" role="img" aria-label="${FIG[baseOf(kind)].name}">${defsOf(c)}
      <ellipse cx="120" cy="372" rx="80" ry="11" fill="#000" opacity=".4"/>${body}</svg>`;
  }

  // Аватар для боя: голова (и шлем, если надет).
  function avatar(kind, gear) {
    if (typeof Art !== 'undefined' && Art.hasPortrait(kind)) return Art.portrait(kind);
    const base = baseOf(kind);
    const c = Parts.newCtx();
    const A = FIG[base], B = BODY[base];
    const G = gear || Gear.emptyLoadout();
    const head = Gear.item(G.head);
    const BG = { dwarf: '#2f3a52', human: '#2d3a5a', elf: '#27402f', lizard: '#3d3a26', dragon: '#3a2f3a' };
    const BOX = { dwarf: '62 26 116 116', human: '62 24 116 116', elf: '60 22 120 120', lizard: '56 8 128 128', dragon: '54 6 132 132' };
    const bg = BG[base] || '#2f3a52', box = BOX[base] || BOX.dwarf;
    // у дракона крылья видны и на аватаре, у эльфов — волосы за головой
    const behind = base === 'dragon' || base === 'elf' ? B.back(c, A) : '';
    const inner = `${behind}${B.head(c, A)}${head ? Parts.helm(c, A, head) : ''}`;
    return `<svg viewBox="${box}" preserveAspectRatio="xMidYMid slice">${defsOf(c)}<rect x="-50" y="-50" width="400" height="400" fill="${bg}"/>${inner}</svg>`;
  }

  const names = Object.fromEntries(Object.entries(FIG).map(([k, v]) => [k, v.name]));
  return { figure, avatar, anchors: (k) => FIG[k], names };
})();
