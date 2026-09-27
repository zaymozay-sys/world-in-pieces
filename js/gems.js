/* Графика камней — собственные SVG-формы.
   У каждого камня своя форма, поэтому их легко различать и без цвета. */

const GEM_TYPES = ['sapphire', 'ruby', 'emerald', 'onyx'];

const GEM_NAMES = {
  sapphire: 'Сапфиры',
  ruby: 'Рубины',
  emerald: 'Изумруды',
  onyx: 'Обсидиан',
};

const GEM_SVG = {
  // Сапфир — ромб
  sapphire: `
    <svg viewBox="0 0 100 100">
      <polygon points="50,6 94,50 50,94 6,50" fill="#1f5fbf"/>
      <polygon points="50,6 94,50 50,50" fill="#5aa2f2"/>
      <polygon points="50,6 6,50 50,50" fill="#3a83dd"/>
      <polygon points="6,50 50,94 50,50" fill="#173f86"/>
      <polygon points="94,50 50,94 50,50" fill="#1b4fa3"/>
      <polygon points="50,22 78,50 50,78 22,50" fill="none" stroke="#bcdcff" stroke-opacity=".55" stroke-width="2"/>
    </svg>`,

  // Рубин — шестигранник
  ruby: `
    <svg viewBox="0 0 100 100">
      <polygon points="26,10 74,10 96,50 74,90 26,90 4,50" fill="#b3202c"/>
      <polygon points="26,10 74,10 62,34 38,34" fill="#f0616b"/>
      <polygon points="26,10 38,34 22,50 4,50" fill="#d63845"/>
      <polygon points="74,10 96,50 78,50 62,34" fill="#c22a37"/>
      <polygon points="22,50 38,66 26,90 4,50" fill="#8a1420"/>
      <polygon points="78,50 96,50 74,90 62,66" fill="#7a111c"/>
      <polygon points="38,34 62,34 78,50 62,66 38,66 22,50" fill="#e04a55" fill-opacity=".8"/>
    </svg>`,

  // Изумруд — вытянутая ступенчатая огранка
  emerald: `
    <svg viewBox="0 0 100 100">
      <polygon points="30,4 70,4 92,24 92,76 70,96 30,96 8,76 8,24" fill="#1d8a4a"/>
      <polygon points="30,4 70,4 92,24 8,24" fill="#63d68f"/>
      <polygon points="8,76 92,76 70,96 30,96" fill="#12592f"/>
      <rect x="24" y="34" width="52" height="32" rx="4" fill="#2fb864" stroke="#b6f0cc" stroke-opacity=".55" stroke-width="2"/>
    </svg>`,

  // Обсидиан — чёрный куб
  onyx: `
    <svg viewBox="0 0 100 100">
      <polygon points="50,6 92,28 50,50 8,28" fill="#5a5d66"/>
      <polygon points="8,28 50,50 50,94 8,72" fill="#1d1e22"/>
      <polygon points="92,28 50,50 50,94 92,72" fill="#0b0b0d"/>
      <polygon points="50,6 92,28 50,50 8,28" fill="none" stroke="#9a9ea9" stroke-opacity=".5" stroke-width="1.5"/>
    </svg>`,
};

/* Иконка Магии — шаровая молния: светящийся шар и дуги разрядов вокруг. */
function magicIcon(id) {
  return `<svg class="magic-icon" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient id="ball-${id}" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset=".35" stop-color="#e6d4ff"/>
        <stop offset=".7" stop-color="#9b6cf0"/>
        <stop offset="1" stop-color="#5a2fb0" stop-opacity=".9"/>
      </radialGradient>
      <radialGradient id="glow-${id}" cx="50%" cy="50%" r="50%">
        <stop offset=".5" stop-color="#b58cff" stop-opacity=".55"/>
        <stop offset="1" stop-color="#b58cff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#glow-${id})"/>
    <g fill="none" stroke="#d9c2ff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M50 28 L44 16 L52 12 L46 3"/>
      <path d="M72 50 L84 44 L88 52 L97 47"/>
      <path d="M50 72 L56 84 L48 88 L54 97"/>
      <path d="M28 50 L16 56 L12 48 L3 53"/>
      <path d="M66 34 L74 24 L80 28 L86 20"/>
      <path d="M34 66 L26 76 L20 72 L14 80"/>
    </g>
    <circle cx="50" cy="50" r="22" fill="url(#ball-${id})"/>
    <path d="M54 34 L42 52 L51 52 L46 66 L60 47 L51 47Z" fill="#fff" fill-opacity=".9"/>
  </svg>`;
}

/* Иконка Огненного креста — крест с языками пламени. */
function fireIcon(id) {
  return `<svg class="magic-icon" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <linearGradient id="fg-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe066"/>
        <stop offset=".5" stop-color="#ff8a1f"/>
        <stop offset="1" stop-color="#d6321f"/>
      </linearGradient>
      <radialGradient id="fglow-${id}" cx="50%" cy="50%" r="50%">
        <stop offset=".45" stop-color="#ff8a1f" stop-opacity=".5"/>
        <stop offset="1" stop-color="#ff8a1f" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#fglow-${id})"/>
    <path d="M40 16 H60 V40 H84 V60 H60 V84 H40 V60 H16 V40 H40Z"
          fill="url(#fg-${id})" stroke="#ffd27a" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M50 0 C43 9 57 12 50 22 C64 12 58 6 50 0Z" fill="#ffd24d"/>
    <path d="M100 50 C91 43 88 57 78 50 C88 64 94 58 100 50Z" fill="#ffb02e"/>
    <path d="M0 50 C9 57 12 43 22 50 C12 36 6 42 0 50Z" fill="#ffb02e"/>
    <path d="M50 100 C57 91 43 88 50 78 C36 88 42 94 50 100Z" fill="#ff9a2e"/>
    <circle cx="50" cy="50" r="7" fill="#fff4b8"/>
  </svg>`;
}

/* Иконка Целебного дождя — зелёная капля с крестом. */
function healIcon(id) {
  return `<svg class="magic-icon" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <linearGradient id="hd-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#9af0b0"/>
        <stop offset="1" stop-color="#1f9a4c"/>
      </linearGradient>
      <radialGradient id="hglow-${id}" cx="50%" cy="50%" r="50%">
        <stop offset=".5" stop-color="#5be08a" stop-opacity=".45"/>
        <stop offset="1" stop-color="#5be08a" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="52" r="48" fill="url(#hglow-${id})"/>
    <path d="M50 6 C62 28 80 42 80 62 A30 30 0 0 1 20 62 C20 42 38 28 50 6Z"
          fill="url(#hd-${id})" stroke="#d6ffe0" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M44 48 H56 V56 H64 V68 H56 V76 H44 V68 H36 V56 H44Z" fill="#f4fff6"/>
  </svg>`;
}

/* Иконка Хаоса — две круговые стрелки вокруг случайных камней. */
function chaosIcon(id) {
  return `<svg class="magic-icon" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient id="cglow-${id}" cx="50%" cy="50%" r="50%">
        <stop offset=".5" stop-color="#5ad1e6" stop-opacity=".4"/>
        <stop offset="1" stop-color="#5ad1e6" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#cglow-${id})"/>
    <g fill="none" stroke="#7fe3f5" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 46 A29 29 0 0 1 72 26"/>
      <path d="M78 54 A29 29 0 0 1 28 74"/>
    </g>
    <polygon points="80,14 82,40 58,30" fill="#7fe3f5"/>
    <polygon points="20,86 18,60 42,70" fill="#7fe3f5"/>
    <circle cx="40" cy="42" r="6" fill="#4a86e8"/>
    <rect x="52" y="44" width="11" height="11" rx="2" fill="#e04a55" transform="rotate(20 57 50)"/>
    <polygon points="46,66 53,57 60,66 53,72" fill="#3ec46d"/>
  </svg>`;
}

/* Иконка Превращения — камень, наполовину ставший обсидианом. */
function transmuteIcon(id) {
  return `<svg class="magic-icon" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient id="tglow-${id}" cx="50%" cy="50%" r="50%">
        <stop offset=".5" stop-color="#a06cf0" stop-opacity=".45"/>
        <stop offset="1" stop-color="#a06cf0" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#tglow-${id})"/>
    <polygon points="50,12 88,50 50,88 12,50" fill="#2b6fd0"/>
    <polygon points="50,12 12,50 50,50" fill="#5aa2f2"/>
    <polygon points="50,12 88,50 50,88" fill="#15161a"/>
    <polygon points="50,12 88,50 50,50" fill="#4a4d55"/>
    <polygon points="12,50 50,88 50,50" fill="#173f86"/>
    <path d="M50 12 L50 88" stroke="#d9c2ff" stroke-width="2.5"/>
    <path d="M84 12 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="#f0e2ff"/>
    <path d="M14 76 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" fill="#f0e2ff"/>
  </svg>`;
}

/* Эмблемы фракций: знамя с короной (люди), рунный молот (гномы), лист (эльфы), ядовитый клык (ящеры). */
function factionIcon(id, cls = 'magic-icon') {
  const E = {
    human: `<path d="M26 12 H74 V58 L50 76 L26 58Z" fill="#2f5fbf" stroke="#e8d27a" stroke-width="4" stroke-linejoin="round"/>
      <path d="M34 44 L38 26 L46 38 L50 22 L54 38 L62 26 L66 44Z" fill="#f0c23c" stroke="#7a5a10" stroke-width="2" stroke-linejoin="round"/>
      <path d="M50 76 V94" stroke="#6b4a2b" stroke-width="5"/>`,
    dwarf: `<rect x="44" y="34" width="12" height="60" rx="3" fill="#6b4a2b" stroke="#2a1b0d" stroke-width="2.5"/>
      <rect x="18" y="12" width="64" height="30" rx="4" fill="#5b5f68" stroke="#1b1d22" stroke-width="3"/>
      <path d="M32 18 V36 M32 27 L40 20 M60 18 L68 36 M68 18 L60 36" stroke="#ffb34a" stroke-width="3.5" stroke-linecap="round"/>`,
    elf: `<path d="M50 6 Q86 30 74 66 Q62 90 50 94 Q38 90 26 66 Q14 30 50 6Z" fill="#3fae63" stroke="#1d5a30" stroke-width="3.5"/>
      <path d="M50 12 V92 M50 36 L68 26 M50 52 L72 42 M50 68 L66 60 M50 36 L32 26 M50 52 L28 42 M50 68 L34 60" stroke="#c9f0d4" stroke-width="2.5" stroke-linecap="round"/>`,
    lizard: `<path d="M30 10 Q70 12 64 62 Q60 82 50 94 Q42 72 36 58 Q24 34 30 10Z" fill="#efe6cd" stroke="#3a3228" stroke-width="3.5"/>
      <path d="M38 18 Q58 22 54 54" stroke="#fff" stroke-width="3" fill="none"/>
      <path d="M62 66 Q72 76 66 86 Q60 80 62 66Z" fill="#6fd04a" stroke="#2a5a12" stroke-width="2.5"/>
      <circle cx="44" cy="40" r="4" fill="#c9483a"/>`,
  };
  return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true">${E[id] || ''}</svg>`;
}
