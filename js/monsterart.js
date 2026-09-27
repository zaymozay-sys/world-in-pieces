/* Рисунки монстров (бюсты для бестиария и аватаров), иконки ресурсов и монет.
   Временные векторные рисунки: позже их можно заменить своими изображениями.
   Цвет уровня показан свечением вокруг существа. */

const MonsterArt = (() => {
  let UID = 0;
  const grad = (id, stops, dir = 'v') =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="${dir === 'h' ? 1 : 0}" y2="${dir === 'h' ? 0 : 1}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const O = '#14161a';

  // Каждая функция получает префикс уникальных id (p) и возвращает { defs, body }.
  const ART = {
    rat: (p) => ({
      defs: grad(p + 'f', [[0, '#9a857a'], [1, '#5b4a42']]),
      body: `<path d="M74 84 Q96 84 92 64 Q90 52 80 56" fill="none" stroke="#d9a2a2" stroke-width="4" stroke-linecap="round"/>
        <ellipse cx="50" cy="66" rx="30" ry="24" fill="url(#${p}f)" stroke="${O}" stroke-width="2"/>
        <circle cx="28" cy="34" r="14" fill="#6d5a52" stroke="${O}" stroke-width="2"/><circle cx="28" cy="34" r="8" fill="#e0aeb0"/>
        <circle cx="72" cy="34" r="14" fill="#6d5a52" stroke="${O}" stroke-width="2"/><circle cx="72" cy="34" r="8" fill="#e0aeb0"/>
        <ellipse cx="50" cy="52" rx="25" ry="22" fill="url(#${p}f)" stroke="${O}" stroke-width="2"/>
        <ellipse cx="50" cy="63" rx="12" ry="9" fill="#cfae9e" stroke="${O}" stroke-width="1.5"/><ellipse cx="50" cy="58" rx="4.5" ry="3.5" fill="#e89aa0" stroke="${O}"/>
        <circle cx="39" cy="46" r="4.6" fill="#e02222" stroke="${O}"/><circle cx="61" cy="46" r="4.6" fill="#e02222" stroke="${O}"/><circle cx="38" cy="45" r="1.4" fill="#fff"/><circle cx="60" cy="45" r="1.4" fill="#fff"/>
        <rect x="46" y="67" width="3.6" height="8" rx="1" fill="#fff" stroke="${O}" stroke-width=".8"/><rect x="50.4" y="67" width="3.6" height="8" rx="1" fill="#fff" stroke="${O}" stroke-width=".8"/>
        <path d="M28 60 L10 56 M28 64 L10 66 M72 60 L90 56 M72 64 L90 66" stroke="#e8e0d8" stroke-width="1.2"/>`,
    }),
    wolf: (p) => ({
      defs: grad(p + 'f', [[0, '#8f97a3'], [1, '#4c525c']]),
      body: `<path d="M22 46 L26 14 L44 34Z M78 46 L74 14 L56 34Z" fill="#4c525c" stroke="${O}" stroke-width="2"/><path d="M28 38 L29 24 L38 34Z M72 38 L71 24 L62 34Z" fill="#c8a0a0"/>
        <path d="M14 58 Q10 30 50 28 Q90 30 86 58 Q84 84 50 92 Q16 84 14 58Z" fill="url(#${p}f)" stroke="${O}" stroke-width="2"/>
        <path d="M22 60 L10 66 L20 68 L12 76 L24 74 M78 60 L90 66 L80 68 L88 76 L76 74" fill="#6f7681" stroke="${O}" stroke-width="1.2"/>
        <path d="M30 60 Q50 50 70 60 Q66 84 50 88 Q34 84 30 60Z" fill="#c4c9d1" stroke="${O}" stroke-width="1.8"/>
        <ellipse cx="50" cy="63" rx="7" ry="5" fill="#15171b"/>
        <path d="M30 42 L44 48 L42 54 L28 50Z M70 42 L56 48 L58 54 L72 50Z" fill="#ffd23d" stroke="${O}" stroke-width="1.5"/><circle cx="40" cy="50" r="2" fill="#15171b"/><circle cx="60" cy="50" r="2" fill="#15171b"/>
        <path d="M40 78 L42 88 L46 79 M54 79 L58 88 L60 78" fill="#fff" stroke="${O}" stroke-width="1"/>
        <path d="M40 34 L44 42 M60 34 L56 42" stroke="#3a3f47" stroke-width="2"/>`,
    }),
    bandit: (p) => ({
      defs: grad(p + 'h', [[0, '#5a4632'], [1, '#2c2118']]),
      body: `<path d="M8 96 Q12 60 50 56 Q88 60 92 96Z" fill="#3c2f22" stroke="${O}" stroke-width="2"/>
        <path d="M18 60 Q14 14 50 10 Q86 14 82 60 Q70 46 50 46 Q30 46 18 60Z" fill="url(#${p}h)" stroke="${O}" stroke-width="2"/>
        <ellipse cx="50" cy="52" rx="24" ry="22" fill="#d2a27a" stroke="${O}" stroke-width="1.5"/>
        <path d="M26 56 Q50 46 74 56 L72 80 Q50 92 28 80Z" fill="#6a6f78" stroke="${O}" stroke-width="1.8"/><path d="M34 62 Q50 56 66 62" stroke="#8a8f98" stroke-width="1.6" fill="none"/>
        <path d="M32 42 Q40 36 46 42 L44 48 L34 48Z M68 42 Q60 36 54 42 L56 48 L66 48Z" fill="#fff" stroke="${O}" stroke-width="1.4"/><circle cx="40" cy="44" r="2.6" fill="#2a1a10"/><circle cx="60" cy="44" r="2.6" fill="#2a1a10"/>
        <path d="M30 38 L46 42 M70 38 L54 42" stroke="#3a2a1a" stroke-width="3"/>
        <path d="M76 84 L94 62 L98 66 L82 90Z" fill="#cfd5dd" stroke="${O}" stroke-width="1.4"/>`,
    }),
    goblin: (p) => ({
      defs: grad(p + 'f', [[0, '#93bb62'], [1, '#5a7d38']]),
      body: `<path d="M20 44 L2 30 L6 54 L22 58Z M80 44 L98 30 L94 54 L78 58Z" fill="url(#${p}f)" stroke="${O}" stroke-width="2"/>
        <ellipse cx="50" cy="54" rx="28" ry="30" fill="url(#${p}f)" stroke="${O}" stroke-width="2"/>
        <path d="M24 34 Q50 4 76 34 Q50 24 24 34Z" fill="#5b4632" stroke="${O}" stroke-width="2"/>
        <path d="M50 52 L58 66 L50 70 L44 66Z" fill="#7fa653" stroke="${O}" stroke-width="1.6"/>
        <path d="M30 46 Q38 38 46 46 Q38 52 30 46Z M70 46 Q62 38 54 46 Q62 52 70 46Z" fill="#ffe14a" stroke="${O}" stroke-width="1.4"/><ellipse cx="38" cy="46" rx="1.8" ry="4" fill="${O}"/><ellipse cx="62" cy="46" rx="1.8" ry="4" fill="${O}"/>
        <path d="M30 74 Q50 88 70 74 Q50 80 30 74Z" fill="#2a1a10" stroke="${O}" stroke-width="1.5"/>
        <path d="M34 76 l3 7 l3 -6 M44 79 l3 8 l3 -8 M56 79 l3 8 l3 -8 M62 76 l3 6 l3 -7" fill="#fff" stroke="${O}" stroke-width=".9"/>
        <circle cx="30" cy="62" r="2" fill="#5a7d38"/><circle cx="68" cy="58" r="2.4" fill="#5a7d38"/>`,
    }),
    skeleton: (p) => ({
      defs: grad(p + 's', [[0, '#f0e9d6'], [1, '#b9ae90']]) + `<radialGradient id="${p}g"><stop offset="0" stop-color="#bff0ff"/><stop offset="1" stop-color="#2a7fd0"/></radialGradient>`,
      body: `<path d="M22 60 Q18 14 50 12 Q82 14 78 60 Q78 78 66 84 L66 94 L34 94 L34 84 Q22 78 22 60Z" fill="url(#${p}s)" stroke="${O}" stroke-width="2"/>
        <path d="M20 44 Q22 8 50 6 Q78 8 80 44 L72 40 Q50 30 28 40Z" fill="#8a4b2c" stroke="${O}" stroke-width="2"/><rect x="46" y="8" width="8" height="34" fill="#6f3a20" stroke="${O}" stroke-width="1.4"/>
        <ellipse cx="38" cy="54" rx="10" ry="11" fill="#0b0d12" stroke="${O}"/><ellipse cx="62" cy="54" rx="10" ry="11" fill="#0b0d12" stroke="${O}"/><circle cx="38" cy="55" r="4" fill="url(#${p}g)"/><circle cx="62" cy="55" r="4" fill="url(#${p}g)"/>
        <path d="M50 62 L44 74 L56 74Z" fill="#1a1c22"/>
        <path d="M34 82 h32 v10 h-32z" fill="#efe7d0" stroke="${O}" stroke-width="1.4"/><path d="M40 82 v10 M46 82 v10 M52 82 v10 M58 82 v10" stroke="${O}" stroke-width="1.2"/>
        <path d="M24 30 L34 26 M76 30 L66 26" stroke="#6f3a20" stroke-width="2"/>`,
    }),
    boar: (p) => ({
      defs: grad(p + 'f', [[0, '#8a6244'], [1, '#4b3222']]),
      body: `<path d="M16 34 L24 8 L40 28Z M84 34 L76 8 L60 28Z" fill="#4b3222" stroke="${O}" stroke-width="2"/>
        <path d="M22 26 L30 14 L34 26 L40 12 L46 26 L54 10 L60 26 L68 12 L72 28" fill="#2c1e14" stroke="${O}" stroke-width="1.4"/>
        <ellipse cx="50" cy="56" rx="34" ry="32" fill="url(#${p}f)" stroke="${O}" stroke-width="2"/>
        <ellipse cx="50" cy="68" rx="20" ry="16" fill="#c7a48f" stroke="${O}" stroke-width="2"/><ellipse cx="43" cy="68" rx="3.5" ry="5" fill="#3a2418"/><ellipse cx="57" cy="68" rx="3.5" ry="5" fill="#3a2418"/>
        <path d="M32 74 Q14 78 12 56 Q22 66 34 66Z M68 74 Q86 78 88 56 Q78 66 66 66Z" fill="#f2ead2" stroke="${O}" stroke-width="1.6"/>
        <circle cx="36" cy="46" r="4.4" fill="#d43a2a" stroke="${O}"/><circle cx="64" cy="46" r="4.4" fill="#d43a2a" stroke="${O}"/><circle cx="35" cy="45" r="1.3" fill="#fff"/><circle cx="63" cy="45" r="1.3" fill="#fff"/>
        <path d="M28 40 L44 44 M72 40 L56 44" stroke="#2c1e14" stroke-width="3.4"/>`,
    }),
    troll: (p) => ({
      defs: grad(p + 'f', [[0, '#93a58a'], [1, '#4f5f49']]),
      body: `<path d="M12 60 Q6 36 22 28 L26 40Z M88 60 Q94 36 78 28 L74 40Z" fill="#6c7d64" stroke="${O}" stroke-width="2"/>
        <path d="M16 62 Q10 20 50 14 Q90 20 84 62 Q84 88 50 94 Q16 88 16 62Z" fill="url(#${p}f)" stroke="${O}" stroke-width="2.4"/>
        <path d="M22 42 Q50 30 78 42 L74 52 Q50 42 26 52Z" fill="#54634d" stroke="${O}" stroke-width="2"/>
        <circle cx="38" cy="52" r="4" fill="#ffd05a" stroke="${O}"/><circle cx="62" cy="52" r="4" fill="#ffd05a" stroke="${O}"/><circle cx="38" cy="52" r="1.6" fill="${O}"/><circle cx="62" cy="52" r="1.6" fill="${O}"/>
        <ellipse cx="50" cy="64" rx="7" ry="5" fill="#7d8f74" stroke="${O}"/>
        <path d="M30 76 Q50 88 70 76 L66 84 Q50 92 34 84Z" fill="#2a2a20" stroke="${O}" stroke-width="1.5"/><path d="M34 78 L32 66 L40 76Z M66 78 L68 66 L60 76Z" fill="#efe8cf" stroke="${O}" stroke-width="1.4"/>
        <circle cx="26" cy="64" r="3" fill="#6a7a60"/><circle cx="74" cy="38" r="2.6" fill="#6a7a60"/><path d="M20 30 q8 -6 16 -2 M64 26 q10 -3 16 4" stroke="#4a7a3a" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    }),
    golem: (p) => ({
      defs: grad(p + 'f', [[0, '#9a9f96'], [1, '#54594f']]),
      body: `<path d="M14 24 L40 10 L70 8 L88 26 L92 64 L78 90 L34 92 L12 70Z" fill="url(#${p}f)" stroke="${O}" stroke-width="2.4"/>
        <path d="M14 24 L40 30 L70 28 L88 26 M12 70 L36 60 L78 90 M40 30 L36 60 M70 28 L92 64" fill="none" stroke="#3c4038" stroke-width="2"/>
        <rect x="26" y="40" width="18" height="12" rx="2" fill="#ffb24a" stroke="${O}" stroke-width="1.6"/><rect x="58" y="40" width="18" height="12" rx="2" fill="#ffb24a" stroke="${O}" stroke-width="1.6"/>
        <rect x="26" y="40" width="18" height="12" rx="2" fill="#ff7a1a" opacity=".55"/><rect x="58" y="40" width="18" height="12" rx="2" fill="#ff7a1a" opacity=".55"/>
        <path d="M34 70 L44 66 L54 72 L66 66" fill="none" stroke="${O}" stroke-width="3"/>
        <path d="M16 60 q10 -6 18 2 M62 84 q10 -8 20 -2 M20 20 q8 6 14 0" stroke="#5f9a4a" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M46 16 l4 10 l4 -10 M44 78 v8 M58 76 v9" stroke="#6b7066" stroke-width="2"/>`,
    }),
    orc: (p) => ({
      defs: grad(p + 'f', [[0, '#8e9c68'], [1, '#56643c']]) + grad(p + 'm', [[0, '#9aa0a8'], [1, '#4a4f57']]),
      body: `<path d="M4 98 Q8 66 30 60 L70 60 Q92 66 96 98Z" fill="#4a3a28" stroke="${O}" stroke-width="2"/>
        <path d="M6 76 Q10 56 30 58 L32 74 Q18 72 6 76Z M94 76 Q90 56 70 58 L68 74 Q82 72 94 76Z" fill="url(#${p}m)" stroke="${O}" stroke-width="1.8"/>
        <circle cx="16" cy="66" r="2" fill="#2a2d33"/><circle cx="84" cy="66" r="2" fill="#2a2d33"/>
        <path d="M16 40 L4 30 L10 50Z M84 40 L96 30 L90 50Z" fill="url(#${p}f)" stroke="${O}" stroke-width="1.6"/>
        <path d="M18 46 Q16 14 50 12 Q84 14 82 46 Q84 70 66 80 L34 80 Q16 70 18 46Z" fill="url(#${p}f)" stroke="${O}" stroke-width="2"/>
        <path d="M50 12 Q46 2 52 -2 Q56 4 54 12" fill="#2a2018" stroke="${O}" stroke-width="1.4"/>
        <path d="M24 36 Q36 28 46 38 L44 42 Q34 36 26 42Z M76 36 Q64 28 54 38 L56 42 Q66 36 74 42Z" fill="#3e4a2a" stroke="${O}" stroke-width="1.3"/>
        <ellipse cx="37" cy="44" rx="4.2" ry="3.2" fill="#ffcf4a" stroke="${O}"/><ellipse cx="63" cy="44" rx="4.2" ry="3.2" fill="#ffcf4a" stroke="${O}"/>
        <circle cx="37" cy="44" r="1.5" fill="${O}"/><circle cx="63" cy="44" r="1.5" fill="${O}"/>
        <path d="M44 50 Q50 46 56 50 L54 58 Q50 60 46 58Z" fill="#6c7a4a" stroke="${O}" stroke-width="1.2"/><circle cx="47.5" cy="56" r="1.3" fill="${O}"/><circle cx="52.5" cy="56" r="1.3" fill="${O}"/>
        <path d="M30 64 Q50 74 70 64 Q66 78 50 80 Q34 78 30 64Z" fill="#2a2018" stroke="${O}" stroke-width="1.4"/>
        <path d="M33 66 L30 52 L39 64Z M67 66 L70 52 L61 64Z" fill="#f2ead0" stroke="${O}" stroke-width="1.3"/>
        <path d="M26 30 L30 52 M72 26 L66 34" stroke="#b8322a" stroke-width="3" stroke-linecap="round" opacity=".85"/>
        <path d="M60 22 L68 34" stroke="#3e4a2a" stroke-width="1.6"/>`,
    }),
    orcShaman: (p) => ({
      defs: grad(p + 'f', [[0, '#8a9868'], [1, '#52603a']]) + `<radialGradient id="${p}e"><stop offset="0" stop-color="#e8fff0"/><stop offset="1" stop-color="#3fe08a"/></radialGradient>`,
      body: `<path d="M6 98 Q10 66 30 60 L70 60 Q90 66 94 98Z" fill="#5a4630" stroke="${O}" stroke-width="2"/>
        ${[16, 26, 36, 46, 56, 66, 76, 86].map((x, i) => `<path d="M${x} ${66 + (i % 2) * 3} l3 7 l3 -7" fill="#efe6cd" stroke="${O}" stroke-width=".9"/>`).join('')}
        <path d="M16 42 L4 34 L10 52Z M84 42 L96 34 L90 52Z" fill="url(#${p}f)" stroke="${O}" stroke-width="1.6"/>
        <path d="M18 48 Q16 18 50 16 Q84 18 82 48 Q84 70 66 80 L34 80 Q16 70 18 48Z" fill="url(#${p}f)" stroke="${O}" stroke-width="2"/>
        <path d="M22 30 Q20 4 50 2 Q80 4 78 30 Q64 22 50 22 Q36 22 22 30Z" fill="#efe6cd" stroke="${O}" stroke-width="1.8"/>
        <ellipse cx="40" cy="16" rx="5" ry="6" fill="#1b1714"/><ellipse cx="60" cy="16" rx="5" ry="6" fill="#1b1714"/><path d="M47 24 L50 18 L53 24Z" fill="#1b1714"/>
        <path d="M14 22 L2 4 L20 18Z M86 22 L98 4 L80 18Z" fill="#b8322a" stroke="${O}" stroke-width="1.2"/><path d="M18 24 L8 8" stroke="#2a4a8a" stroke-width="3"/>
        <path d="M28 40 L44 42 M72 40 L56 42" stroke="#f2ead0" stroke-width="3" stroke-linecap="round"/>
        <ellipse cx="37" cy="47" rx="4.2" ry="3.4" fill="url(#${p}e)" stroke="${O}"/><ellipse cx="63" cy="47" rx="4.2" ry="3.4" fill="url(#${p}e)" stroke="${O}"/>
        <ellipse cx="37" cy="47" rx="8" ry="6" fill="#3fe08a" opacity=".22"/><ellipse cx="63" cy="47" rx="8" ry="6" fill="#3fe08a" opacity=".22"/>
        <path d="M45 52 Q50 49 55 52 L53 59 Q50 61 47 59Z" fill="#687648" stroke="${O}" stroke-width="1.2"/>
        <path d="M32 66 Q50 74 68 66 Q64 78 50 79 Q36 78 32 66Z" fill="#2a2018" stroke="${O}" stroke-width="1.4"/>
        <path d="M35 67 L33 57 L40 66Z M65 67 L67 57 L60 66Z" fill="#f2ead0" stroke="${O}" stroke-width="1.2"/>
        <path d="M44 62 v12 M50 63 v14 M56 62 v12" stroke="#f2ead0" stroke-width="2" opacity=".85"/>`,
    }),
    ghoul: (p) => ({
      defs: grad(p + 'f', [[0, '#c9d2d4'], [1, '#7c888c']]) + `<radialGradient id="${p}e"><stop offset="0" stop-color="#ffd0c8"/><stop offset="1" stop-color="#d0201a"/></radialGradient>`,
      body: `<path d="M10 98 Q16 70 34 64 L66 64 Q84 70 90 98Z" fill="#2a2a33" stroke="${O}" stroke-width="2"/>
        <path d="M34 64 L50 88 L66 64" fill="none" stroke="#3f3f4c" stroke-width="3"/>
        <path d="M22 40 L4 22 L16 50Z M78 40 L96 22 L84 50Z" fill="url(#${p}f)" stroke="${O}" stroke-width="1.6"/>
        <path d="M22 44 Q20 12 50 10 Q80 12 78 44 Q78 66 62 80 Q50 86 38 80 Q22 66 22 44Z" fill="url(#${p}f)" stroke="${O}" stroke-width="2"/>
        <path d="M22 40 Q18 10 50 6 Q82 10 78 40 Q74 22 66 18 L62 30 L56 16 L50 28 L44 16 L38 30 L34 18 Q26 22 22 40Z" fill="#1d1d24" stroke="${O}" stroke-width="1.4"/>
        <path d="M28 58 Q34 66 40 60 M72 58 Q66 66 60 60" stroke="#6a767a" stroke-width="2" fill="none"/>
        <ellipse cx="38" cy="46" rx="6.5" ry="5" fill="#141418"/><ellipse cx="62" cy="46" rx="6.5" ry="5" fill="#141418"/>
        <circle cx="38" cy="46" r="3" fill="url(#${p}e)"/><circle cx="62" cy="46" r="3" fill="url(#${p}e)"/>
        <path d="M47 50 L50 58 L53 50" fill="none" stroke="#6a767a" stroke-width="1.6"/>
        <path d="M34 68 Q50 62 66 68 Q62 78 50 80 Q38 78 34 68Z" fill="#3a0f14" stroke="${O}" stroke-width="1.4"/>
        ${[38, 43, 48, 53, 58].map((x) => `<path d="M${x} 67 l2 6 l2 -6" fill="#f2efe6" stroke="${O}" stroke-width=".7"/>`).join('')}
        <path d="M40 78 l2 -5 l2 5 M56 78 l2 -5 l2 5" fill="#f2efe6" stroke="${O}" stroke-width=".7"/>`,
    }),
    wraith: (p) => ({
      defs: grad(p + 'f', [[0, '#6a7a96'], [1, '#232a3c']]) + `<linearGradient id="${p}fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5a78"/><stop offset="1" stop-color="#4a5a78" stop-opacity="0"/></linearGradient>`,
      body: `<path d="M14 96 Q8 50 24 30 Q34 8 50 8 Q66 8 76 30 Q92 50 86 96 L74 84 L62 98 L50 84 L38 98 L26 84Z" fill="url(#${p}fade)" stroke="${O}" stroke-width="2" opacity=".95"/>
        <path d="M24 60 Q18 20 50 12 Q82 20 76 60 Q64 44 50 44 Q36 44 24 60Z" fill="url(#${p}f)" stroke="${O}" stroke-width="2"/>
        <ellipse cx="50" cy="56" rx="19" ry="24" fill="#06080d" stroke="${O}"/>
        <ellipse cx="42" cy="52" rx="4.6" ry="6" fill="#8ff2ff"/><ellipse cx="58" cy="52" rx="4.6" ry="6" fill="#8ff2ff"/><ellipse cx="42" cy="52" rx="9" ry="11" fill="#8ff2ff" opacity=".22"/><ellipse cx="58" cy="52" rx="9" ry="11" fill="#8ff2ff" opacity=".22"/>
        <path d="M42 72 Q50 78 58 72" stroke="#8ff2ff" stroke-width="2" fill="none" opacity=".7"/>`,
    }),
  };

  function bust(id, tier, size) {
    if (typeof Art !== 'undefined' && Art.hasMonster(id)) return Art.monster(id, Tiers.get(tier).edge, size);   // рисунок из папки art/
    const prefix = 'ma' + (++UID) + '-';
    const art = ART[id] && ART[id](prefix);
    if (!art) return '';
    const col = Tiers.get(tier).edge;
    return `<svg viewBox="0 0 100 100" ${size ? `width="${size}" height="${size}"` : ''} aria-hidden="true">
      <defs>${art.defs}<radialGradient id="${prefix}aura" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="${col}" stop-opacity=".0"/><stop offset=".85" stop-color="${col}" stop-opacity=".55"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs>
      <circle cx="50" cy="50" r="50" fill="url(#${prefix}aura)"/><g transform="translate(6 6) scale(.88)">${art.body}</g></svg>`;
  }

  /* ---------- ресурсы ---------- */
  const RES = {
    hide: () => `<path d="M14 20 L26 12 L38 18 L50 12 L58 24 L52 34 L56 46 L48 56 L36 52 L24 56 L14 46 L18 34Z" fill="#9b6b3e" stroke="${O}" stroke-width="2"/><path d="M22 24 L46 48 M46 22 L24 46" stroke="#d9b98a" stroke-width="1.3" stroke-dasharray="3 3"/>`,
    fang: () => `<path d="M22 12 Q52 14 44 54 Q40 40 30 30 Q20 22 22 12Z" fill="#f4ecd6" stroke="${O}" stroke-width="2"/><path d="M28 16 Q42 20 38 40" stroke="#fff" stroke-width="2" fill="none"/>`,
    bone: () => `<path d="M14 40 L40 14 M22 48 L48 22" stroke="${O}" stroke-width="12" stroke-linecap="round"/><path d="M14 40 L40 14 M22 48 L48 22" stroke="#efe6cd" stroke-width="8" stroke-linecap="round"/><circle cx="16" cy="38" r="5" fill="#efe6cd" stroke="${O}"/><circle cx="46" cy="18" r="5" fill="#efe6cd" stroke="${O}"/>`,
    scrap: () => `<path d="M10 40 L24 20 L44 24 L54 42 L40 54 L18 52Z" fill="#7d838d" stroke="${O}" stroke-width="2"/><path d="M24 20 L30 38 L54 42 M30 38 L18 52" fill="none" stroke="#b9bfc9" stroke-width="1.5"/><circle cx="36" cy="32" r="4" fill="#3a3f46"/>`,
    ore: () => `<path d="M8 46 L20 20 L40 10 L56 28 L50 50 L24 54Z" fill="#6a6f78" stroke="${O}" stroke-width="2"/><path d="M22 24 L30 34 L42 26 M30 34 L28 48" stroke="#f0c23c" stroke-width="2.6" fill="none"/><circle cx="46" cy="38" r="2.4" fill="#f0c23c"/>`,
    crystal: () => `<path d="M32 6 L48 22 L44 52 L32 58 L20 52 L16 22Z" fill="#7ad0ff" stroke="${O}" stroke-width="2"/><path d="M32 6 L48 22 L32 30Z" fill="#d8f4ff"/><path d="M32 30 L44 52 L32 58Z" fill="#3a90d0"/>`,
    essence: () => `<circle cx="32" cy="34" r="20" fill="#b48cff" opacity=".28"/><path d="M32 8 Q52 30 46 44 Q40 58 32 58 Q24 58 18 44 Q12 30 32 8Z" fill="#c9a8ff" stroke="${O}" stroke-width="2"/><ellipse cx="27" cy="34" rx="4" ry="8" fill="#fff" opacity=".6"/>`,
    scale: () => `<path d="M12 22 Q32 6 52 22 Q52 46 32 58 Q12 46 12 22Z" fill="#2f9d5f" stroke="${O}" stroke-width="2"/><path d="M32 12 V54 M18 26 Q32 34 46 26" stroke="#1a6b3e" stroke-width="2" fill="none"/><path d="M20 20 Q32 12 44 20" stroke="#8ae3ac" stroke-width="2" fill="none"/>`,
  };
  function resIcon(kind, tier) {
    const col = Tiers.get(tier).edge;
    return `<svg class="res-icon" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="${col}" fill-opacity=".18" stroke="${col}" stroke-width="3"/><g transform="translate(4 4) scale(.875)">${(RES[kind] || RES.scrap)()}</g></svg>`;
  }

  /* ---------- монеты ---------- */
  const COIN = { copper: ['#7a3f18', '#c47a3c', '#f0a868'], silver: ['#6a727e', '#c9d0da', '#ffffff'], gold: ['#8a6a14', '#f0c23c', '#fff3a6'] };
  function coinIcon(kind) {
    const [d, m, l] = COIN[kind], id = 'co' + (++UID) + kind;
    return `<svg class="coin-icon" viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="${id}" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="${l}"/><stop offset=".55" stop-color="${m}"/><stop offset="1" stop-color="${d}"/></radialGradient></defs><circle cx="12" cy="12" r="10.5" fill="url(#${id})" stroke="#14161a" stroke-width="1.4"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="${d}" stroke-width="1.2" opacity=".8"/></svg>`;
  }
  // Сумма монетами: «2 [золото] 15 [серебро] 40 [медь]»
  function moneyHtml(n) {
    const m = Tiers.splitMoney(n);
    const parts = [];
    if (m.gold) parts.push(`<span class="coin">${m.gold}${coinIcon('gold')}</span>`);
    if (m.silver) parts.push(`<span class="coin">${m.silver}${coinIcon('silver')}</span>`);
    if (m.copper || !parts.length) parts.push(`<span class="coin">${m.copper}${coinIcon('copper')}</span>`);
    return `<span class="money" title="${Tiers.moneyText(n)}">${parts.join('')}</span>`;
  }

  return { bust, resIcon, coinIcon, moneyHtml, has: (id) => !!ART[id] };
})();
