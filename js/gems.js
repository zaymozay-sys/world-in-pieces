if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Графика камней — собственные SVG-формы.
   У каждого камня своя форма, поэтому их легко различать и без цвета. */

const GEM_TYPES = ['sapphire', 'ruby', 'emerald', 'onyx'];

const GEM_NAMES = {
  sapphire: _t("Сапфиры"),
  ruby: _t("Рубины"),
  emerald: _t("Изумруды"),
  onyx: _t("Обсидиан"),
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

/* Иконка Удара — сжатый кулак с бронзовым свечением (общее заклинание всех фракций). */
function strikeIcon(id) {
  return _t("<svg class=\"magic-icon\" viewBox=\"0 0 100 100\" aria-hidden=\"true\">\n    <defs>\n      <linearGradient id=\"sk-{0}\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#f0c98a\"/>\n        <stop offset=\".55\" stop-color=\"#c98a4a\"/>\n        <stop offset=\"1\" stop-color=\"#8a5322\"/>\n      </linearGradient>\n      <radialGradient id=\"sglow-{1}\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\".5\" stop-color=\"#ffb84d\" stop-opacity=\".45\"/>\n        <stop offset=\"1\" stop-color=\"#ffb84d\" stop-opacity=\"0\"/>\n      </radialGradient>\n    </defs>\n    <circle cx=\"50\" cy=\"50\" r=\"48\" fill=\"url(#sglow-{2})\"/>\n    <!-- предплечье -->\n    <rect x=\"38\" y=\"60\" width=\"24\" height=\"30\" rx=\"6\" fill=\"url(#sk-{3})\" stroke=\"#5a3616\" stroke-width=\"2.5\"/>\n    <!-- костяшки -->\n    <g fill=\"url(#sk-{4})\" stroke=\"#5a3616\" stroke-width=\"2.5\" stroke-linejoin=\"round\">\n      <rect x=\"20\" y=\"40\" width=\"14\" height=\"24\" rx=\"6\"/>\n      <rect x=\"33\" y=\"32\" width=\"14\" height=\"32\" rx=\"6\"/>\n      <rect x=\"46\" y=\"30\" width=\"14\" height=\"34\" rx=\"6\"/>\n      <rect x=\"59\" y=\"34\" width=\"14\" height=\"30\" rx=\"6\"/>\n      <path d=\"M20 52 Q50 68 73 50 L73 62 Q50 78 20 62 Z\"/>\n    </g>\n    <!-- большой палец -->\n    <path d=\"M18 50 Q10 48 12 38 Q14 30 24 32 L30 40 L24 52Z\" fill=\"url(#sk-{5})\" stroke=\"#5a3616\" stroke-width=\"2.5\" stroke-linejoin=\"round\"/>\n    <!-- линии удара -->\n    <g stroke=\"#ffe0a3\" stroke-width=\"3.5\" stroke-linecap=\"round\" opacity=\".85\">\n      <path d=\"M70 18 L80 8\"/>\n      <path d=\"M78 26 L92 22\"/>\n      <path d=\"M74 36 L88 38\"/>\n    </g>\n  </svg>", [id, id, id, id, id, id]);
}

/* Иконка Зеркала — овальное ручное зеркало с бликом и отражённым лучом. */
function mirrorIcon(id) {
  return _t("<svg class=\"magic-icon\" viewBox=\"0 0 100 100\" aria-hidden=\"true\">\n    <defs>\n      <linearGradient id=\"mg-{0}\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#eefaff\"/>\n        <stop offset=\".45\" stop-color=\"#9fd4ec\"/>\n        <stop offset=\"1\" stop-color=\"#3d7fa6\"/>\n      </linearGradient>\n      <linearGradient id=\"mf-{1}\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#e9eef4\"/>\n        <stop offset=\"1\" stop-color=\"#8a96a6\"/>\n      </linearGradient>\n      <radialGradient id=\"mglow-{2}\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\".5\" stop-color=\"#8fe0ff\" stop-opacity=\".45\"/>\n        <stop offset=\"1\" stop-color=\"#8fe0ff\" stop-opacity=\"0\"/>\n      </radialGradient>\n    </defs>\n    <circle cx=\"50\" cy=\"50\" r=\"48\" fill=\"url(#mglow-{3})\"/>\n    <!-- ручка -->\n    <rect x=\"44\" y=\"72\" width=\"12\" height=\"22\" rx=\"4\" fill=\"url(#mf-{4})\" stroke=\"#4a5563\" stroke-width=\"2.5\"/>\n    <circle cx=\"50\" cy=\"94\" r=\"4\" fill=\"#c9d3de\" stroke=\"#4a5563\" stroke-width=\"2\"/>\n    <!-- оправа и стекло -->\n    <ellipse cx=\"50\" cy=\"42\" rx=\"28\" ry=\"34\" fill=\"url(#mf-{5})\" stroke=\"#4a5563\" stroke-width=\"2.5\"/>\n    <circle cx=\"50\" cy=\"7\" r=\"4.5\" fill=\"#dfe8f0\" stroke=\"#4a5563\" stroke-width=\"2\"/>\n    <ellipse cx=\"50\" cy=\"42\" rx=\"21\" ry=\"27\" fill=\"url(#mg-{6})\"/>\n    <!-- блик -->\n    <path d=\"M36 44 Q36 26 48 20\" stroke=\"#fff\" stroke-width=\"4.5\" stroke-linecap=\"round\" fill=\"none\"/>\n    <path d=\"M40 54 L60 24\" stroke=\"#fff\" stroke-width=\"2.5\" stroke-linecap=\"round\" opacity=\".6\"/>\n    <!-- удар летит в зеркало и отскакивает обратно -->\n    <g fill=\"none\" stroke=\"#fff6c2\" stroke-width=\"4\" stroke-linecap=\"round\">\n      <path d=\"M96 30 L62 42\"/>\n      <path d=\"M62 46 L92 60\"/>\n    </g>\n    <polygon points=\"98,63 84,66 89,53\" fill=\"#fff6c2\"/>\n  </svg>", [id, id, id, id, id, id, id]);
}

/* Иконка Прилива — закрученная волна, гребень которой меняет цвет (синий → зелёный). */
function tideIcon(id) {
  return _t("<svg class=\"magic-icon\" viewBox=\"0 0 100 100\" aria-hidden=\"true\">\n    <defs>\n      <linearGradient id=\"wv-{0}\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\n        <stop offset=\"0\" stop-color=\"#2f7fe0\"/>\n        <stop offset=\".45\" stop-color=\"#2fa6c8\"/>\n        <stop offset=\".75\" stop-color=\"#3ec46d\"/>\n        <stop offset=\"1\" stop-color=\"#7ee89a\"/>\n      </linearGradient>\n      <radialGradient id=\"wglow-{1}\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\".5\" stop-color=\"#3fd6c0\" stop-opacity=\".45\"/>\n        <stop offset=\"1\" stop-color=\"#3fd6c0\" stop-opacity=\"0\"/>\n      </radialGradient>\n    </defs>\n    <circle cx=\"50\" cy=\"50\" r=\"48\" fill=\"url(#wglow-{2})\"/>\n    <!-- волна -->\n    <path d=\"M6 80 C22 78 30 60 34 44 C40 20 64 10 80 22 C90 30 88 46 76 48 C66 50 62 40 68 34\n             C58 34 52 46 54 60 C56 72 68 78 94 80 L94 92 L6 92Z\"\n          fill=\"url(#wv-{3})\" stroke=\"#d8fbff\" stroke-width=\"2.5\" stroke-linejoin=\"round\"/>\n    <!-- пена на гребне -->\n    <path d=\"M40 30 C50 16 70 14 80 24\" stroke=\"#effffb\" stroke-width=\"3.5\" stroke-linecap=\"round\" fill=\"none\"/>\n    <!-- камень синий → зелёный -->\n    <polygon points=\"20,10 30,20 20,30 10,20\" fill=\"#4a86e8\" stroke=\"#dff0ff\" stroke-width=\"2\"/>\n    <path d=\"M33 20 H44 M40 15 L45 20 L40 25\" stroke=\"#effffb\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"/>\n    <polygon points=\"92,56 98,64 92,72 86,64\" fill=\"#3ec46d\" stroke=\"#e0ffe8\" stroke-width=\"2\"/>\n  </svg>", [id, id, id, id]);
}

/* Иконка Жертвы — багровое сердце, пожираемое пламенем, пронзённое кинжалом. */
function sacrificeIcon(id) {
  return _t("<svg class=\"magic-icon\" viewBox=\"0 0 100 100\" aria-hidden=\"true\">\n    <defs>\n      <linearGradient id=\"sh-{0}\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#e0303a\"/>\n        <stop offset=\"1\" stop-color=\"#6a0a14\"/>\n      </linearGradient>\n      <linearGradient id=\"sf-{1}\" x1=\"0\" y1=\"1\" x2=\"0\" y2=\"0\">\n        <stop offset=\"0\" stop-color=\"#ff5a1f\"/>\n        <stop offset=\".6\" stop-color=\"#ff9a2e\"/>\n        <stop offset=\"1\" stop-color=\"#ffe066\"/>\n      </linearGradient>\n      <radialGradient id=\"shglow-{2}\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\".5\" stop-color=\"#ff3a2a\" stop-opacity=\".45\"/>\n        <stop offset=\"1\" stop-color=\"#ff3a2a\" stop-opacity=\"0\"/>\n      </radialGradient>\n    </defs>\n    <circle cx=\"50\" cy=\"50\" r=\"48\" fill=\"url(#shglow-{3})\"/>\n    <!-- пламя над сердцем -->\n    <path d=\"M26 50 C18 34 30 26 30 12 C38 22 42 28 44 36 C46 24 52 16 50 4 C62 16 66 26 62 38\n             C68 32 70 24 70 18 C80 30 82 42 74 52Z\" fill=\"url(#sf-{4})\"/>\n    <!-- сердце -->\n    <path d=\"M50 92 C34 80 14 66 14 48 C14 36 22 30 31 30 C40 30 46 36 50 42 C54 36 60 30 69 30\n             C78 30 86 36 86 48 C86 66 66 80 50 92Z\" fill=\"url(#sh-{5})\" stroke=\"#2a0306\" stroke-width=\"3\" stroke-linejoin=\"round\"/>\n    <path d=\"M24 46 Q26 38 34 37\" stroke=\"#ff9a9a\" stroke-width=\"3.5\" stroke-linecap=\"round\" fill=\"none\"/>\n    <!-- кинжал -->\n    <path d=\"M86 88 L58 60\" stroke=\"#3a2412\" stroke-width=\"7\" stroke-linecap=\"round\"/>\n    <path d=\"M62 54 L70 62\" stroke=\"#c9a64a\" stroke-width=\"5\" stroke-linecap=\"round\"/>\n    <polygon points=\"64,58 36,34 33,31 38,32 66,56\" fill=\"#e8ecf2\" stroke=\"#5a6272\" stroke-width=\"1.5\"/>\n    <!-- капли -->\n    <path d=\"M40 70 C40 76 36 78 36 82 A4 4 0 0 0 44 82 C44 78 40 76 40 70Z\" fill=\"#ff5a4a\"/>\n  </svg>", [id, id, id, id, id, id]);
}

/* Иконка Прорицания — всевидящее око в хрустальном шаре на золотой подставке. */
function divinationIcon(id) {
  return _t("<svg class=\"magic-icon\" viewBox=\"0 0 100 100\" aria-hidden=\"true\">\n    <defs>\n      <radialGradient id=\"db-{0}\" cx=\"40%\" cy=\"35%\" r=\"65%\">\n        <stop offset=\"0\" stop-color=\"#f3e8ff\"/>\n        <stop offset=\".5\" stop-color=\"#9a6ae0\"/>\n        <stop offset=\"1\" stop-color=\"#3a1a78\"/>\n      </radialGradient>\n      <linearGradient id=\"dgold-{1}\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#ffe08a\"/>\n        <stop offset=\"1\" stop-color=\"#a8701c\"/>\n      </linearGradient>\n      <radialGradient id=\"dglow-{2}\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\".5\" stop-color=\"#ffd46a\" stop-opacity=\".4\"/>\n        <stop offset=\"1\" stop-color=\"#ffd46a\" stop-opacity=\"0\"/>\n      </radialGradient>\n    </defs>\n    <circle cx=\"50\" cy=\"50\" r=\"48\" fill=\"url(#dglow-{3})\"/>\n    <!-- лучи -->\n    <g stroke=\"#ffd46a\" stroke-width=\"3.5\" stroke-linecap=\"round\">\n      <path d=\"M50 3 V11\"/><path d=\"M18 14 L24 20\"/><path d=\"M82 14 L76 20\"/>\n      <path d=\"M4 42 H12\"/><path d=\"M88 42 H96\"/>\n    </g>\n    <!-- подставка -->\n    <path d=\"M28 88 Q30 74 38 72 H62 Q70 74 72 88Z\" fill=\"url(#dgold-{4})\" stroke=\"#5a3a0a\" stroke-width=\"2.5\" stroke-linejoin=\"round\"/>\n    <!-- шар -->\n    <circle cx=\"50\" cy=\"44\" r=\"30\" fill=\"url(#db-{5})\" stroke=\"#e6d4ff\" stroke-width=\"2.5\"/>\n    <!-- око -->\n    <path d=\"M28 46 Q50 26 72 46 Q50 64 28 46Z\" fill=\"#fff8e0\" stroke=\"#ffd46a\" stroke-width=\"2.5\" stroke-linejoin=\"round\"/>\n    <circle cx=\"50\" cy=\"46\" r=\"9\" fill=\"#e0a526\"/>\n    <circle cx=\"50\" cy=\"46\" r=\"4.5\" fill=\"#1a0a2e\"/>\n    <circle cx=\"47\" cy=\"43\" r=\"2\" fill=\"#fff\"/>\n    <!-- четыре точки: линия из 4 камней -->\n    <g fill=\"#fff4c2\"><circle cx=\"35\" cy=\"95\" r=\"3\"/><circle cx=\"45\" cy=\"95\" r=\"3\"/><circle cx=\"55\" cy=\"95\" r=\"3\"/><circle cx=\"65\" cy=\"95\" r=\"3\"/></g>\n  </svg>", [id, id, id, id, id, id]);
}

/* Иконка Кулака ярости — кулак, как у Удара, но багровый и в языках пламени. */
function furyIcon(id) {
  return _t("<svg class=\"magic-icon\" viewBox=\"0 0 100 100\" aria-hidden=\"true\">\n    <defs>\n      <linearGradient id=\"fk-{0}\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n        <stop offset=\"0\" stop-color=\"#ff8a6a\"/>\n        <stop offset=\".55\" stop-color=\"#d0302a\"/>\n        <stop offset=\"1\" stop-color=\"#7a0e12\"/>\n      </linearGradient>\n      <linearGradient id=\"ff-{1}\" x1=\"0\" y1=\"1\" x2=\"0\" y2=\"0\">\n        <stop offset=\"0\" stop-color=\"#ff3a1f\"/>\n        <stop offset=\".6\" stop-color=\"#ff8a1f\"/>\n        <stop offset=\"1\" stop-color=\"#ffe066\"/>\n      </linearGradient>\n      <radialGradient id=\"fkglow-{2}\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n        <stop offset=\".5\" stop-color=\"#ff4a1f\" stop-opacity=\".55\"/>\n        <stop offset=\"1\" stop-color=\"#ff4a1f\" stop-opacity=\"0\"/>\n      </radialGradient>\n    </defs>\n    <circle cx=\"50\" cy=\"50\" r=\"48\" fill=\"url(#fkglow-{3})\"/>\n    <!-- пламя вокруг кулака -->\n    <path d=\"M12 70 C4 52 12 40 10 26 C18 34 20 38 22 30 C22 20 30 12 30 2 C40 12 40 20 40 24\n             C44 16 50 12 52 2 C60 12 60 20 58 26 C64 20 70 16 72 6 C80 16 80 28 76 34\n             C82 30 86 26 90 20 C94 36 92 52 86 68Z\" fill=\"url(#ff-{4})\"/>\n    <!-- предплечье -->\n    <rect x=\"38\" y=\"60\" width=\"24\" height=\"30\" rx=\"6\" fill=\"url(#fk-{5})\" stroke=\"#3a0608\" stroke-width=\"2.5\"/>\n    <!-- костяшки -->\n    <g fill=\"url(#fk-{6})\" stroke=\"#3a0608\" stroke-width=\"2.5\" stroke-linejoin=\"round\">\n      <rect x=\"20\" y=\"40\" width=\"14\" height=\"24\" rx=\"6\"/>\n      <rect x=\"33\" y=\"32\" width=\"14\" height=\"32\" rx=\"6\"/>\n      <rect x=\"46\" y=\"30\" width=\"14\" height=\"34\" rx=\"6\"/>\n      <rect x=\"59\" y=\"34\" width=\"14\" height=\"30\" rx=\"6\"/>\n      <path d=\"M20 52 Q50 68 73 50 L73 62 Q50 78 20 62 Z\"/>\n    </g>\n    <!-- большой палец -->\n    <path d=\"M18 50 Q10 48 12 38 Q14 30 24 32 L30 40 L24 52Z\" fill=\"url(#fk-{7})\" stroke=\"#3a0608\" stroke-width=\"2.5\" stroke-linejoin=\"round\"/>\n    <!-- искры -->\n    <g fill=\"#ffe066\"><circle cx=\"84\" cy=\"80\" r=\"3\"/><circle cx=\"14\" cy=\"86\" r=\"2.5\"/><circle cx=\"90\" cy=\"46\" r=\"2\"/></g>\n  </svg>", [id, id, id, id, id, id, id, id]);
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

// Захват: рамка 3x3 из камней.
function squareIcon(id) {
  const cols = ['#2b6fd0', '#d94a3a', '#2fa65a', '#15161a', '#e0b13a'];
  let cells = '';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const mid = r === 1 && c === 1;
    cells += `<rect x="${16 + c * 23}" y="${16 + r * 23}" width="20" height="20" rx="4" fill="${mid ? '#15161a' : cols[(r * 3 + c) % 4]}" stroke="#fff" stroke-opacity=".35"/>`;
  }
  return `<svg class="magic-icon" viewBox="0 0 100 100" aria-hidden="true"><rect x="8" y="8" width="84" height="84" rx="8" fill="none" stroke="#f0c14b" stroke-width="3" stroke-dasharray="8 5"/>${cells}</svg>`;
}

// Дикий рост (приём эльфов): росток, из которого прорастают изумруды.
function growthIcon(id) {
  return `<svg class="magic-icon" viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id="grg-${id}" cx="50%" cy="55%" r="50%"><stop offset=".4" stop-color="#5be08a" stop-opacity=".5"/><stop offset="1" stop-color="#5be08a" stop-opacity="0"/></radialGradient></defs>
    <circle cx="50" cy="52" r="48" fill="url(#grg-${id})"/>
    <path d="M50 92 Q48 70 50 54" stroke="#3a7a3a" stroke-width="5" stroke-linecap="round" fill="none"/>
    <path d="M50 70 Q30 70 22 56 Q40 54 50 66Z" fill="#4fbf63" stroke="#1d5a30" stroke-width="2"/>
    <path d="M50 62 Q70 62 78 48 Q60 46 50 58Z" fill="#6bd67a" stroke="#1d5a30" stroke-width="2"/>
    <polygon points="50,14 64,22 64,38 50,46 36,38 36,22" fill="#2fa65a" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
    <polygon points="50,14 64,22 50,30 36,22" fill="#7be9a0"/>
    <polygon points="22,40 30,44 30,52 22,56 14,52 14,44" fill="#2fa65a" stroke="#fff" stroke-opacity=".4" stroke-width="1.5"/>
    <polygon points="78,32 86,36 86,44 78,48 70,44 70,36" fill="#2fa65a" stroke="#fff" stroke-opacity=".4" stroke-width="1.5"/>
  </svg>`;
}

/* Иконка Выпада — рапира, пронзающая камень, из которого вырывается пламя. */
function pierceIcon(id) {
  return `<svg class="magic-icon" viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id="pglow-${id}" cx="50%" cy="50%" r="50%"><stop offset=".5" stop-color="#ff8a3d" stop-opacity=".45"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient></defs>
    <circle cx="50" cy="50" r="48" fill="url(#pglow-${id})"/>
    <polygon points="50,24 66,40 62,64 38,64 34,40" fill="#4a86e8" stroke="#bcd4ff" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M50 24 Q60 12 54 4 Q70 14 66 30 Q60 24 50 24Z" fill="#ffb347"/>
    <path d="M12 88 L58 42" stroke="#e6ecf5" stroke-width="5" stroke-linecap="round"/>
    <path d="M8 92 L16 84" stroke="#9a6a2c" stroke-width="7" stroke-linecap="round"/>
    <path d="M20 74 L30 84" stroke="#d9b45a" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
}
