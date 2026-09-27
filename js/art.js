/* Графика из папки art/ (готовится tools/build-art.py).
   Список файлов — в js/art-files.js. Если картинки нет, игра рисует по-старому (встроенными SVG),
   поэтому графику можно добавлять по частям. Рисунки вставляются внутрь SVG (<image>), чтобы старый код
   (аватары в кружках, значки на карте) работал без изменений. */

const Art = (() => {
  const files = (typeof ART_FILES !== 'undefined') ? ART_FILES : {};
  const has = (key) => !!files[key];
  const url = (key) => files[key] || null;

  // Обёртка: картинка в квадратном SVG. pad — отступ в долях, bg — фон под картинкой.
  function square(key, { bg = null, zoom = 1, dx = 0, dy = 0 } = {}) {
    const s = 100 * zoom, o = (100 - s) / 2;
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${bg ? `<rect width="100" height="100" fill="${bg}"/>` : ''}` +
      `<image href="${url(key)}" x="${(o + dx).toFixed(1)}" y="${(o + dy).toFixed(1)}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid meet"/></svg>`;
  }

  /* ---------- камни ---------- */
  // Подменяет встроенные SVG камней (GEM_SVG из gems.js) на рисунки, если они есть.
  function applyGems() {
    if (typeof GEM_SVG === 'undefined') return;
    for (const t of GEM_TYPES) if (has('gems/' + t)) GEM_SVG[t] = square('gems/' + t);
  }

  /* ---------- поле ---------- */
  function applyBoard() {
    if (!has('gems/board') || typeof document === 'undefined') return;
    const st = document.createElement('style');
    st.textContent = `.board { background-image: url("${url('gems/board')}"); background-size: cover; background-position: center; }
      .board .cell-bg i { background: rgba(10, 11, 14, .34); border-color: rgba(230, 220, 200, .10); opacity: 1; }`;
    document.head.appendChild(st);
  }

  /* ---------- герои ---------- */
  // kind — «народ-пол» (см. Factions.heroKind), например «dwarf-f»; фон берём по народу, пол в нём не участвует.
  const AVATAR_BG = { dwarf: '#2f3a52', human: '#2d3a5a', elf: '#27402f', lizard: '#3d3a26' };
  const hasPortrait = (kind) => has('heroes/' + kind + '-portrait');
  const portrait = (kind) => square('heroes/' + kind + '-portrait', { bg: AVATAR_BG[kind.split('-')[0]] || '#2f3a52', zoom: 1.12, dy: 4 });

  // Какая из фигур в полный рост подходит к надетому: 1 — простая одежда, 2 — кольчуга и металл,
  // 3 — доспехи своего народа. Если нужной нет, берётся ближайшая из имеющихся.
  function bodyLevel(kind, gear) {
    const worn = (typeof Gear !== 'undefined' && gear) ? Gear.equipped(gear) : [];
    const factionSet = worn.filter((it) => it.set && Gear.SETS[it.set] && Gear.SETS[it.set].faction).length;
    const metal = worn.filter((it) => it.type !== 'amulet' && !/^leather-|^sword-novice$|^shield-wood$|^club$/.test(it.id)).length;
    if (factionSet >= 3) return 3;
    if (metal >= 2 || factionSet >= 1) return 2;
    return 1;
  }
  function bodyKey(kind, gear) {
    const want = bodyLevel(kind, gear);
    for (let l = want; l >= 1; l--) if (has(`heroes/${kind}-body-${l}`)) return `heroes/${kind}-body-${l}`;
    for (let l = want + 1; l <= 3; l++) if (has(`heroes/${kind}-body-${l}`)) return `heroes/${kind}-body-${l}`;
    return null;
  }
  const hasBody = (kind) => !!bodyKey(kind, null);
  function body(kind, gear, label) {
    return `<svg class="figure" viewBox="0 0 200 300" role="img" aria-label="${label || ''}">` +
      `<image href="${url(bodyKey(kind, gear))}" width="200" height="300" preserveAspectRatio="xMidYMax meet"/></svg>`;
  }

  /* ---------- персонажи-собеседники (трактирщик и т. п.) ---------- */
  const hasNpc = (id) => has('npc/' + id + '-portrait');
  const npcPortrait = (id, bg) => square('npc/' + id + '-portrait', { bg: bg || '#241d15', zoom: 1.12, dy: 4 });

  /* ---------- фоновые сцены (интерьеры) — та же папка ui/, что и bg-battle/bg-arena ---------- */
  const hasScene = (id) => has('ui/bg-' + id);
  const sceneUrl = (id) => url('ui/bg-' + id);

  /* ---------- существа ---------- */
  const hasMonster = (id) => has('monsters/' + id);
  // Бюст существа: цветная аура уровня и рисунок. Кольцо уровня рисует игра, на картинке его нет.
  function monster(id, col, size) {
    const g = 'ag' + id + Math.random().toString(36).slice(2, 6);
    return `<svg viewBox="0 0 100 100" ${size ? `width="${size}" height="${size}"` : ''} aria-hidden="true">
      <defs><radialGradient id="${g}" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="${col}" stop-opacity="0"/><stop offset=".85" stop-color="${col}" stop-opacity=".55"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs>
      <circle cx="50" cy="50" r="50" fill="url(#${g})"/>
      <image href="${url('monsters/' + id)}" x="5" y="5" width="90" height="90" preserveAspectRatio="xMidYMid meet"/></svg>`;
  }

  applyGems();
  applyBoard();
  return { has, url, hasPortrait, portrait, hasBody, body, bodyKey, bodyLevel, hasMonster, monster, hasNpc, npcPortrait, hasScene, sceneUrl };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Art;
