// Замер работы игры (не загрузки): node tools/perf-runtime.js [адрес]   (по умолчанию http://localhost:8000/)
// Процессор замедлен в 4 раза («недорогой телефон»), сеть — без ограничений. Для каждого экрана печатает:
//   start  — сколько миллисекунд процессор был занят с открытия страницы до готовности экрана;
//   idle   — какая доля процессора (основной поток) уходит, когда игрок ничего не делает (5 секунд покоя);
//   стили, раскладки — сколько раз за эти 5 секунд браузер пересчитывал стили и раскладку (в покое должно быть около нуля);
//   dom    — число узлов страницы, heap — память кода (МБ), img — число скачанных картинок и их вес (КБ).
// Числа сравнивают «до» и «после» правки на одной и той же машине.
const { chromium } = require('playwright');
const SCENES = [['карта (новичок)', ''], ['карта (луг)', '#dev-map-meadow'], ['бой', '#dev-fight-wolf-3-solo', 24000], ['бой вдвоём', '#dev-fight-wolf-3', 24000], ['страж', '#dev-boss-b1', 24000],
  ['итог боя', '#dev-result-win'], ['сумка', '#dev-scr-bag'], ['бестиарий', '#dev-scr-best'], ['медали', '#dev-scr-medals'], ['деревня', '#dev-scr-village'],
  ['кузница', '#dev-bld-forge'], ['лавка', '#dev-bld-shop']];
const VIEWS = [{ name: 'телефон', width: 390, height: 844, isMobile: true, hasTouch: true }, { name: 'компьютер', width: 1366, height: 768 }];
const FIXED = `(() => { let a = 0x9e3779b9; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;

(async () => {
  const url = process.argv[2] || 'http://localhost:8000/';
  const browser = await chromium.launch();
  const out = [];
  for (const v of VIEWS) for (const [title, hash, wait] of SCENES) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: !!v.isMobile, hasTouch: !!v.hasTouch, locale: 'ru-RU' });
    const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
    await p.addInitScript(FIXED);
    await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    let imgN = 0, imgB = 0;
    p.on('response', (r) => { if (/\.(webp|png|jpg|svg)(\?|$)/.test(r.url())) { imgN++; r.body().then((b) => { imgB += b.length; }).catch(() => {}); } });
    const metr = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    await p.goto(url + hash, { waitUntil: 'load' });
    await p.waitForTimeout(+process.env.WAIT || wait || 9000);   // экран открылся, вступительные анимации закончились; в бою ждём дольше — противник мог ходить первым
    const m0 = await metr();
    const start = Math.round((m0.ScriptDuration + m0.LayoutDuration + m0.RecalcStyleDuration) * 1000);
    const t0 = Date.now(); await p.waitForTimeout(5000);            // покой: игрок ничего не делает
    const m1 = await metr(), dt = (Date.now() - t0) / 1000;
    out.push({ экран: v.name + ': ' + title, start, idle: ((m1.TaskDuration - m0.TaskDuration) / dt * 100).toFixed(1) + '%',
      стили: m1.RecalcStyleCount - m0.RecalcStyleCount, раскладки: m1.LayoutCount - m0.LayoutCount,
      dom: m1.Nodes, heap: Math.round(m1.JSHeapUsedSize / 1048576), img: imgN + ' / ' + Math.round(imgB / 1024) });
    await ctx.close();
  }
  await browser.close();
  console.table(out);
})();
