// Обход всей графики: окна, здания, бой, награда — в разных размерах экрана и оформлениях.
// Ищет: горизонтальную прокрутку, элементы за краем экрана, обрезанный текст, мелкие кнопки, наложение кнопок,
// сломанные картинки, асимметрию левой/правой панелей боя, сдвиг поля. Снимки — в папку OUT.
// Запуск: NODE_PATH=$(npm root -g) node tools/layout-audit.js [--quick] [--out=/tmp/audit]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const OUT = (process.argv.find((a) => a.startsWith('--out=')) || '--out=/tmp/audit').slice(6);
const QUICK = process.argv.includes('--quick');
const arg = (n) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3).split(',') : null; };
fs.mkdirSync(OUT, { recursive: true });
const VIEWPORTS = QUICK ? [['phone-p', 390, 844, 1], ['desk', 1280, 800, 0]] : [
  ['phone-p', 390, 844, 1], ['phone-l', 844, 390, 1], ['tablet', 768, 1024, 1], ['laptop', 1366, 650, 0], ['desk', 1280, 800, 0], ['wide', 1920, 1080, 0]];
const SKINS = ['3'];   // с 1.5.2 оформление одно («колонки»); номер оставлен в именах файлов
const BUILDINGS = ['hall', 'artistWorkshop', 'junker', 'forge', 'shop', 'hunter', 'tavern', 'library', 'home', 'mill', 'kennel', 'arena', 'alchemist'];
const SCENES = [
  ...BUILDINGS.map((x) => 'bld-' + x), 'scr-bag', 'scr-best', 'scr-medals', 'scr-village', 'scr-credits',
  'scr-arena', 'scr-trial', 'ev-merchant', 'ev-altar', 'ev-lair', 'map-village', 'map-meadow', 'fight-goblin-3', 'fight-wolf-2', 'fight-rat-1-solo', 'boss-b1', 'result-win', 'result-loss'];

// Проверки в странице. Возвращает список находок.
function inPage() {
  const F = [], vw = innerWidth, vh = innerHeight;
  const vis = (e) => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && r.width > 1 && r.height > 1; };
  const desc = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (e.textContent && e.children.length < 3 ? ' «' + e.textContent.trim().slice(0, 24) + '»' : '');
  const scrollAncestor = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowY + s.overflowX) && (p.scrollHeight > p.clientHeight + 2 || p.scrollWidth > p.clientWidth + 2)) return p; } return null; };
  const all = [...document.body.querySelectorAll('*')].filter(vis);
  if (document.documentElement.scrollWidth > vw + 1) F.push(['hscroll', 'страница шире экрана на ' + (document.documentElement.scrollWidth - vw) + ' px']);
  const sh = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  if (sh > vh + 1) F.push(['vscroll', 'страница выше экрана на ' + (sh - vh) + ' px (' + sh + ' из ' + vh + ')']);
  // «живые» элементы: те, до которых реально можно дотронуться (не закрыты окном поверх)
  const live = (e) => { const r = e.getBoundingClientRect(), x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), y = r.top + r.height / 2; if (y < 0 || y > vh) return true; const t = document.elementFromPoint(x, y); return !t || e.contains(t) || t.contains(e); };
  const IGNORE = (e) => e.closest('label.lvl') || e.closest('#credits-screen, .credits, .test-x10'); // поле «ИИ» — для проверки баланса
  const ctl = all.filter((e) => !IGNORE(e)).filter((e) => /^(BUTTON|A|SELECT|INPUT|LABEL|SUMMARY)$/.test(e.tagName) || e.getAttribute('role') === 'button' || e.dataset && (e.dataset.act || e.dataset.pick)).filter(live);
  for (const e of all) {
    const r = e.getBoundingClientRect(); if (e.closest('svg') && e.tagName !== 'svg') continue;
    if (e.tagName === 'IMG' && e.complete && e.naturalWidth === 0) F.push(['img', 'не загрузилась картинка: ' + desc(e) + ' ' + (e.getAttribute('src') || '').slice(0, 50)]);
    if (/(auto|scroll)/.test(getComputedStyle(e).overflow + getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 40 && !/(log|tabs|card-list)/.test(e.className + '')) F.push(['hover', 'внутренняя горизонтальная прокрутка: ' + desc(e)]);
    if (getComputedStyle(e).position !== 'fixed' && !scrollAncestor(e) && (r.right > vw + 2 || r.left < -2) && r.width < vw * 1.5 && !/^(IMG|svg|DIV)$/.test(e.tagName)) F.push(['offscreen', 'за краем по горизонтали: ' + desc(e) + ' [' + [r.left, r.right].map(Math.round) + ']']);
    const s = getComputedStyle(e);
    if (e.children.length === 0 && e.textContent.trim() && /(hidden|clip)/.test(s.overflow + s.overflowX) && e.scrollWidth > e.clientWidth + 2 && s.textOverflow !== 'ellipsis') F.push(['clip', 'текст обрезан: ' + desc(e) + ' (' + e.scrollWidth + ' > ' + e.clientWidth + ')']);
  }
  const touch = matchMedia('(pointer:coarse)').matches;
  const MIN = touch ? 36 : 24;
  for (const e of ctl) { const r = e.getBoundingClientRect(); if (e.tagName === 'LABEL' && !e.querySelector('input,select')) continue; if (!scrollAncestor(e) && (r.top > vh || r.bottom < 0)) { if (r.top > vh) F.push(['fold', 'кнопка ниже экрана: ' + desc(e) + ' (y=' + Math.round(r.top) + ')']); continue; } if ((r.width < MIN || r.height < MIN) && !e.disabled) F.push(['small', 'мелкая кнопка ' + Math.round(r.width) + '×' + Math.round(r.height) + ': ' + desc(e)]); }
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
    const a = ctl[i], c = ctl[j]; if (a.contains(c) || c.contains(a)) continue;
    const x = a.getBoundingClientRect(), y = c.getBoundingClientRect();
    const w = Math.min(x.right, y.right) - Math.max(x.left, y.left), h = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
    const clipped = (el, r) => { const p = scrollAncestor(el); if (!p) return false; const q = p.getBoundingClientRect(); return r.top < q.top - 2 || r.bottom > q.bottom + 2 || r.left < q.left - 2 || r.right > q.right + 2; }; if (clipped(a, x) || clipped(c, y)) continue;
    if (w > 4 && h > 4 && w * h > 0.25 * Math.min(x.width * x.height, y.width * y.height) && !(getComputedStyle(a).pointerEvents === 'none' || getComputedStyle(c).pointerEvents === 'none')) F.push(['overlap', 'кнопки налезают: ' + desc(a) + ' и ' + desc(c)]);
  }
  // симметрия боя
  const L = document.getElementById('fighter-left'), R = document.getElementById('fighter-right'), B = document.getElementById('board');
  if (L && R && B && vis(L) && vis(R)) {
    const l = L.getBoundingClientRect(), r = R.getBoundingClientRect(), b = B.getBoundingClientRect();
    if (Math.abs(l.width - r.width) > 2) F.push(['sym', 'панели бойцов разной ширины: ' + Math.round(l.width) + ' и ' + Math.round(r.width)]);
    if (Math.abs(l.height - r.height) > 2) F.push(['sym', 'панели бойцов разной высоты: ' + Math.round(l.height) + ' и ' + Math.round(r.height)]);
    if (Math.abs((l.left) - (vw - r.right)) > 3 && l.left < b.left && r.left > b.right) F.push(['sym', 'панели не зеркальны по краям: слева ' + Math.round(l.left) + ', справа ' + Math.round(vw - r.right)]);
    if (Math.abs((b.left + b.right) / 2 - vw / 2) > 4 && l.left < b.left && r.left > b.right) F.push(['sym', 'поле не по центру: центр ' + Math.round((b.left + b.right) / 2) + ' из ' + Math.round(vw / 2)]);
    const pair = (sel) => { const a = L.querySelector(sel), c = R.querySelector(sel); if (!a || !c || !vis(a) || !vis(c)) return; const x = a.getBoundingClientRect(), y = c.getBoundingClientRect(); if (Math.abs(x.width - y.width) > 2 || Math.abs(x.height - y.height) > 2) F.push(['sym', sel + ' разного размера: ' + Math.round(x.width) + '×' + Math.round(x.height) + ' и ' + Math.round(y.width) + '×' + Math.round(y.height)]); if (Math.abs(x.top - y.top) > 2) F.push(['sym', sel + ' на разной высоте: ' + Math.round(x.top) + ' и ' + Math.round(y.top)]); };
    ['.avatar', '.hpbar', '.counters', '.name'].forEach(pair);
    // поле должно быть квадратным
    if (Math.abs(b.width - b.height) > 2) F.push(['sym', 'поле не квадратное: ' + Math.round(b.width) + '×' + Math.round(b.height)]);
    const cells = [...B.querySelectorAll('.tile')].map((t) => t.getBoundingClientRect()), ws = new Set(cells.map((c) => Math.round(c.width)));
    if (ws.size > 2) F.push(['sym', 'камни разного размера: ' + [...ws].join(', ')]);
  }
  return F;
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const report = [], boardPos = {};
  const VPF = arg('vp'), SCF = arg('scenes');
  for (const [vn, w, h, touch] of VIEWPORTS.filter((v) => !VPF || VPF.includes(v[0]))) for (const skin of SKINS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: !!touch, hasTouch: !!touch, deviceScaleFactor: 1 });
    await ctx.addInitScript((sk) => { try { localStorage.setItem('wip-lang', 'ru'); localStorage.setItem('wip-ui-skin', sk); } catch (e) {} }, skin);
    for (const sc of SCENES.filter((x) => !SCF || SCF.some((f) => x.startsWith(f)))) {
      const p = await ctx.newPage(), errs = [];
      p.on('pageerror', (e) => errs.push(e.message));
      try {
        await p.goto(URL + '#dev-' + sc.replace('-solo', '')); await p.waitForTimeout(/^(fight|boss|result)/.test(sc) ? 3200 : 1800);
        await p.waitForTimeout(500);
        if (sc.startsWith('result')) await p.waitForTimeout(2000);
        const f = await p.evaluate(inPage);
        for (const e of errs) f.push(['js', e]);
        const key = `${vn}-s${skin}-${sc}`;
        if (/^(fight|boss)/.test(sc)) { const bp = await p.evaluate(() => { const B = document.getElementById('board'); const r = B && B.getBoundingClientRect(); return r && [r.left, r.top, r.width].map(Math.round).join(','); }); (boardPos[`${vn}-s${skin}`] = boardPos[`${vn}-s${skin}`] || {})[sc] = bp; }
        if (f.length || skin === '3' && /^(fight-goblin|result-win|bld-forge|scr-village)/.test(sc)) await p.screenshot({ path: `${OUT}/${key}.png` });
        for (const [kind, msg] of f) report.push({ vp: vn, skin, scene: sc, kind, msg });
      } catch (e) { report.push({ vp: vn, skin, scene: sc, kind: 'crash', msg: String(e.message).slice(0, 120) }); }
      await p.close();
    }
    await ctx.close();
  }
  await b.close();
  // положение поля между боями должно совпадать в одном размере экрана
  for (const k in boardPos) { const vals = [...new Set(Object.values(boardPos[k]))]; if (vals.length > 1) report.push({ vp: k, skin: '', scene: 'бои', kind: 'shift', msg: 'поле стоит по-разному в разных боях: ' + JSON.stringify(boardPos[k]) }); }
  fs.writeFileSync(OUT + '/report.json', JSON.stringify(report, null, 1));
  // свёртка: одинаковые находки по сцене/виду/размеру/оформлению
  const g = {};
  for (const r of report) { const k = r.kind + ' | ' + r.msg.replace(/\[[-\d,]+\]|\(y=\d+\)|\d+/g, '#'); (g[k] = g[k] || []).push(`${r.vp}/s${r.skin}/${r.scene}`); }
  const lines = Object.entries(g).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `${String(v.length).padStart(4)}× ${k}\n       напр.: ${v.slice(0, 3).join(', ')}`);
  fs.writeFileSync(OUT + '/summary.txt', lines.join('\n'));
  console.log(lines.slice(0, 60).join('\n')); console.log('\nвсего находок:', report.length, '· групп:', lines.length, '· снимки и report.json →', OUT);
})();
