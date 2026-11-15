// Сравнение картинки «до» и «после»: node tools/visual-diff.js <адрес-до> <адрес-после> [папка-для-снимков]
// Открывает одни и те же экраны игры в двух сборках и считает отличающиеся точки. Нужен, чтобы убедиться: оптимизация
// не изменила то, что видит игрок. Случайность и время зафиксированы (одинаковая карта, одинаковое время суток),
// анимации остановлены в одной точке (PHASE=0.5 — на середине, чтобы сравнить пик мерцаний). SCENES=a,b — только эти экраны. MOTION=1 — без режима «меньше движения» (иначе часть анимаций в игре выключена). Пример:
//   git worktree add /tmp/base <старый-коммит>; (cd /tmp/base && python3 -m http.server 8001 &); python3 -m http.server 8002 &
//   node tools/visual-diff.js http://localhost:8001/ http://localhost:8002/
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const SCENES = ['', '#dev-map-meadow', '#dev-map-forest', '#dev-map-mountain', '#dev-map-sea', '#dev-bld-forge', '#dev-bld-shop',
  '#dev-scr-bag', '#dev-scr-best', '#dev-scr-medals', '#dev-scr-village', '#dev-fight-wolf-3', '#dev-fight-wolf-3-solo', '#dev-boss-b1', '#dev-result-win', '#dev-result-loss'];
const VIEWS = [{ name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true }, { name: 'desk', width: 1366, height: 768 }];
const FIXED = `(() => { let a = 0x9e3779b9; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;

async function shot(browser, base, scene, v) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: !!v.isMobile, hasTouch: !!v.hasTouch, locale: 'ru-RU', reducedMotion: process.env.MOTION ? 'no-preference' : 'reduce' });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date('2026-06-15T12:00:00'));
  await p.addInitScript(FIXED);
  const errs = []; p.on('pageerror', (e) => errs.push(String(e.message || e)));
  await p.goto(base + scene, { waitUntil: 'load' });
  await p.waitForTimeout(3500);
  // Все анимации останавливаются в одной и той же точке: в начале (по умолчанию) или на середине (PHASE=0.5) —
  // так сравнивается и «пик» мерцаний. Разовые анимации (появление окна) и переходы доводятся до конца.
  await p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; caret-color: transparent !important; }' });
  await p.evaluate((phase) => { for (const a of document.getAnimations()) { try { const t = a.effect.getComputedTiming(), d = typeof t.duration === 'number' ? t.duration : 0; if (t.iterations !== Infinity) { a.finish(); continue; } a.pause(); a.currentTime = (t.delay || 0) + d * phase; } catch (e) { /* анимация уже закончилась */ } } }, +process.env.PHASE || 0);
  await p.waitForTimeout(400);
  const buf = await p.screenshot();
  await ctx.close();
  return { buf, errs };
}

(async () => {
  const only = (process.env.SCENES || '').split(',').filter(Boolean);
  const [a, b, out = 'test-results/visual-diff'] = process.argv.slice(2);
  if (!a || !b) { console.error('нужны два адреса: до и после'); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const cmpCtx = await browser.newContext(); const cmp = await cmpCtx.newPage();
  let bad = 0;
  for (const v of VIEWS) for (const s of SCENES) {
    if (only.length && !only.includes(s.replace('#dev-', '') || 'start')) continue;
    const [x, y] = [await shot(browser, a, s, v), await shot(browser, b, s, v)];
    const diff = await cmp.evaluate(async ([u1, u2]) => {
      const load = (u) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = u; });
      const [i1, i2] = [await load(u1), await load(u2)];
      if (i1.width !== i2.width || i1.height !== i2.height) return -1;
      const px = (i) => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
      const [d1, d2] = [px(i1), px(i2)]; let n = 0;
      for (let k = 0; k < d1.length; k += 4) if (Math.abs(d1[k] - d2[k]) + Math.abs(d1[k + 1] - d2[k + 1]) + Math.abs(d1[k + 2] - d2[k + 2]) > 24) n++;
      return n;
    }, ['data:image/png;base64,' + x.buf.toString('base64'), 'data:image/png;base64,' + y.buf.toString('base64')]);
    const name = v.name + '-' + (s.replace('#dev-', '') || 'start');
    const total = v.width * v.height * (v.isMobile ? 1 : 1), pct = diff < 0 ? 100 : diff / total * 100;
    const mark = pct > 0.05 ? 'ОТЛИЧИЕ' : 'ок';
    if (pct > 0.05 || y.errs.length) { bad++; fs.writeFileSync(path.join(out, name + '-do.png'), x.buf); fs.writeFileSync(path.join(out, name + '-posle.png'), y.buf); }
    console.log(`${mark.padEnd(8)} ${name.padEnd(26)} ${pct.toFixed(3)}%${y.errs.length ? '  ошибки на странице: ' + y.errs.slice(0, 2).join(' | ') : ''}`);
  }
  await browser.close();
  console.log(bad ? `Отличий: ${bad}. Снимки — в ${out}` : 'Отличий нет.');
  process.exit(bad ? 1 : 0);
})();
