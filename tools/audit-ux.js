/* Измерения интерфейса глазами нового игрока (полный проход, этап 7/8): ТОЛЬКО то, что можно измерить —
   размер шрифта, контраст текста, размер целей касания, число нажатий до цели, прокрутка. Субъективных оценок здесь нет.
   Запуск: node tools/audit-ux.js [--vp=390x844] [--lang=ru] [--json=file]   (не параллельно с другими браузерными проверками)
   Правила сравнения (стандарты): цель касания ≥ 24×24 CSS px (WCAG 2.2, 2.5.8, минимум) и ≥ 44×44 (рекомендуемо, WCAG 2.5.5 / Apple HIG);
   контраст ≥ 4,5:1 для обычного текста и ≥ 3:1 для крупного (WCAG 1.4.3); шрифт ≥ 12 px считаем читаемым минимумом на телефоне. */
const path = require('path'), fs = require('fs');
const { launch } = require('./browser.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const VP = arg('vp', '390x844').split('x').map(Number), LANG = arg('lang', 'ru');

// Измеритель — выполняется в странице. Для каждого видимого узла с текстом: размер шрифта и контраст с первым непрозрачным фоном
// предков (если фон — картинка/градиент, контраст помечается «unknown» и не засчитывается ни в плюс, ни в минус).
function measure() {
  const out = { fonts: [], contrast: [], targets: [], hscroll: document.documentElement.scrollWidth > innerWidth + 1, unknownBg: 0, texts: 0, pix: [] };
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = (el) => {
    const stack = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;     // картинка/градиент: не оцениваем
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  };
  const vis = (el) => {
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (!(cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth)) return false;
    // не перекрыт ли элемент другим слоем (окно поверх карты): в центре видимой части сверху должен быть он сам или его потомок/предок
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(x, y);
    return !!top && (top === el || el.contains(top) || top.contains(el));
  };
  const label = (el) => { const t = (el.getAttribute('aria-label') || el.textContent || el.id || el.className || el.tagName).toString().replace(/\s+/g, ' ').trim().slice(0, 36); return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' «' + t + '»'; };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n; (n = walker.nextNode());) {
    const t = n.nodeValue.trim(); if (!t) continue;
    const el = n.parentElement; if (!el || seen.has(el) || !vis(el)) continue;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
    seen.add(el); out.texts++;
    const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
    if (fs < 4) continue;                 // текст спрятан (иконочная кнопка с font-size:0): человек его не видит — не считаем
    out.fonts.push({ fs, el: label(el) });
    const fg = parse(el instanceof SVGElement && cs.fill && cs.fill.startsWith('rgb') ? cs.fill : cs.color), bg = bgOf(el);   // у SVG-подписей цвет текста — fill, а не color
    if (!fg) { out.unknownBg++; continue; }
    if (!bg) { const rg = document.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect(); out.pix.push({ x: r.left, y: r.top, w: r.width, h: r.height, fg, fs, bold: parseInt(cs.fontWeight, 10) >= 700, el: label(el) }); out.unknownBg++; continue; }
    const f = fg.a < 1 ? over(fg, bg) : fg, L1 = lum(f), L2 = lum(bg), hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    const ratio = (hi + 0.05) / (lo + 0.05), large = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    out.contrast.push({ ratio: +ratio.toFixed(2), large, need: large ? 3 : 4.5, el: label(el) });
  }
  for (const el of document.querySelectorAll('button, a[href], [role=button], input, select, textarea, [data-act], .tile')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    out.targets.push({ w: Math.round(r.width), h: Math.round(r.height), el: label(el) });
  }
  return out;
}

// Контраст там, где фон — картинка или градиент: прячем весь текст, снимаем экран и берём в рамке текста ХУДШИЙ (самый близкий по яркости) из 15 пикселей.
async function pixelContrast(p, items) {
  if (!items.length) return [];
  await p.addStyleTag({ content: '*{color:transparent !important;text-shadow:none !important;caret-color:transparent !important} text,tspan{fill:transparent !important;stroke:transparent !important}', }).then(async (h) => {
    p.__hide = h;
  });
  await p.waitForTimeout(80);
  const png = (await p.screenshot({ type: 'png' })).toString('base64');
  await p.evaluate(() => { for (const s of document.querySelectorAll('style')) if (s.textContent.startsWith('*{color:transparent')) s.remove(); });
  return p.evaluate(async ({ png, items }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = (r, gg, b) => 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b);
    const res = [];
    for (const it of items) {
      const Lf = lum(it.fg.r, it.fg.g, it.fg.b); let worst = Infinity;
      for (let i = 0; i < 15; i++) {
        const x = Math.round(Math.min(img.width - 1, Math.max(0, it.x + it.w * (0.1 + 0.8 * ((i % 5) / 4))))), y = Math.round(Math.min(img.height - 1, Math.max(0, it.y + it.h * (0.2 + 0.6 * (Math.floor(i / 5) / 2)))));
        const d = g.getImageData(x, y, 1, 1).data, Lb = lum(d[0], d[1], d[2]), hi = Math.max(Lf, Lb), lo = Math.min(Lf, Lb);
        worst = Math.min(worst, (hi + 0.05) / (lo + 0.05));
      }
      const large = it.fs >= 24 || (it.fs >= 18.66 && it.bold);
      res.push({ ratio: +worst.toFixed(2), large, need: large ? 3 : 4.5, el: it.el, fs: it.fs });
    }
    return res;
  }, { png, items });
}

// Сцены: как попасть на экран из настоящего интерфейса (без чит-кнопок), чтобы измерять то, что видит игрок
const SCENES = [
  ['карта', async (p) => { await p.goto(URL + '#dev-map-meadow'); await p.waitForTimeout(3600); }],
  ['бой', async (p) => { await p.goto(URL + '#dev-fight-goblin-3-solo'); await p.waitForTimeout(3600); }],
  ...['shop', 'forge', 'best', 'tavern', 'junker', 'alchemist', 'kennel', 'market', 'village', 'arena', 'valor'].map((n) => [n, async (p) => {
    await p.goto(URL + '#dev-map-village'); await p.waitForTimeout(3300);
    await p.evaluate((s) => Screens.open(s), n); await p.waitForTimeout(500);
  }]),
  ['герой (сумка)', async (p) => { await p.goto(URL + '#dev-map-village'); await p.waitForTimeout(3300); await p.evaluate(() => Inventory.open('left')); await p.waitForTimeout(500); }],
  ['арсенал', async (p) => { await p.goto(URL + '#dev-map-village'); await p.waitForTimeout(3300); await p.evaluate(() => Inventory.open('left', { armory: true })); await p.waitForTimeout(500); }],
];

(async () => {
  const b = await launch(), rows = [];
  const touch = Math.min(...VP) <= 900;
  const ctx = await b.newContext({ viewport: { width: VP[0], height: VP[1] }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript((lg) => { try { localStorage.setItem('wip-lang', lg); } catch (e) {} }, LANG);
  for (const [name, go] of SCENES) {
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    try { await go(p); } catch (e) { errs.push('сцена: ' + e.message); }
    const m = await p.evaluate(measure).catch((e) => ({ err: e.message }));
    if (m.err) { rows.push({ scene: name, error: m.err }); await p.close(); continue; }
    const pix = await pixelContrast(p, m.pix).catch(() => []);
    m.contrast.push(...pix); m.unknownBg -= pix.length;
    const small = m.fonts.filter((f) => f.fs < 12), tiny = m.fonts.filter((f) => f.fs < 10);
    const lowC = m.contrast.filter((c) => c.ratio < c.need);
    const t24 = m.targets.filter((t) => t.w < 24 || t.h < 24), t44 = m.targets.filter((t) => t.w < 44 || t.h < 44);
    const minFs = m.fonts.length ? Math.min(...m.fonts.map((f) => f.fs)) : null;
    rows.push({
      scene: name, texts: m.texts, minFont: minFs, fontsUnder12: small.length, fontsUnder10: tiny.length,
      contrastChecked: m.contrast.length, contrastUnknownBg: m.unknownBg, contrastFail: lowC.length,
      worstContrast: lowC.sort((a, b) => a.ratio - b.ratio).slice(0, 12),
      targets: m.targets.length, targetsUnder24: t24.length, targetsUnder44: t44.length, targetMinSide: m.targets.length ? Math.min(...m.targets.map((t) => Math.min(t.w, t.h))) : null, targetMedianSide: m.targets.length ? m.targets.map((t) => Math.min(t.w, t.h)).sort((a, b) => a - b)[Math.floor(m.targets.length / 2)] : null, worstTargets: t24.sort((a, b) => a.w * a.h - b.w * b.h).slice(0, 3),
      hscroll: m.hscroll, smallFontEx: small.sort((a, b) => a.fs - b.fs).slice(0, 3), errs,
    });
    await p.close();
  }
  await b.close();
  console.log(`окно ${VP.join('×')} ${touch ? '(касание)' : '(мышь)'} язык ${LANG}`);
  console.log('сцена'.padEnd(16), 'тексты шрифт<12 <10  контраст: ниже нормы/проверено(не измерено)  целей  <24  <44  гориз.прокрутка');
  for (const r of rows) {
    if (r.error) { console.log(r.scene.padEnd(16), 'ошибка:', r.error); continue; }
    console.log(r.scene.padEnd(16), String(r.texts).padStart(5), String(r.fontsUnder12).padStart(8), String(r.fontsUnder10).padStart(4), (r.contrastFail + '/' + r.contrastChecked + '(+' + r.contrastUnknownBg + ')').padStart(26), String(r.targets).padStart(10), String(r.targetsUnder24).padStart(5), String(r.targetsUnder44).padStart(5), r.hscroll ? ' ДА' : ' нет', r.errs.length ? ' ошибки JS: ' + r.errs[0] : '');
  }
  const jf = process.argv.find((a) => a.startsWith('--json='));
  if (jf) fs.writeFileSync(jf.slice(7), JSON.stringify({ vp: VP, lang: LANG, rows }, null, 1));
})();
