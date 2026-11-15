// Кто занимает процессор: node tools/perf-profile.js <режим> <адрес> [ширина высота]
//   режим boot — от открытия страницы до готовности (3 с после загрузки);
//   режим idle — 5 секунд покоя на открытом экране (WAIT=14000 — сколько ждать перед замером, по умолчанию 5000);
//   режим pan  — перетаскивание и масштаб карты.
// Печатает время кода, стилей и раскладки, самые тяжёлые функции (своё время и с вложенными вызовами) и работающие анимации.
// Процессор замедлен в 4 раза. Пример: node tools/perf-profile.js idle "http://localhost:8000/#dev-scr-medals"
const { chromium } = require('playwright');
(async () => {
  const [mode, url, w = '390', h = '844'] = process.argv.slice(2);
  if (!['boot', 'idle', 'pan'].includes(mode) || !url) { console.error('node tools/perf-profile.js boot|idle|pan <адрес> [ширина высота]'); process.exit(2); }
  const phone = +w < 500;
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: +w, height: +h }, isMobile: phone, hasTouch: phone, locale: 'ru-RU' });
  const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  if (process.env.SEED) await p.addInitScript(`(() => { let a = 0x9e3779b9; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`);   // SEED=1 — та же «случайность», что в perf-runtime и visual-diff
  await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await cdp.send('Profiler.enable');
  const metr = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  let m0 = { TaskDuration: 0, ScriptDuration: 0, RecalcStyleDuration: 0, LayoutDuration: 0, RecalcStyleCount: 0, LayoutCount: 0 };
  if (mode === 'boot') { await cdp.send('Profiler.start'); await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(3000); }
  else {
    await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(+process.env.WAIT || 5000);
    m0 = await metr(); await cdp.send('Profiler.start');
    if (mode === 'idle') await p.waitForTimeout(5000);
    else {
      const cx = +w / 2, cy = +h / 2;
      await p.mouse.move(cx, cy); await p.mouse.down();
      for (let i = 0; i < 80; i++) { await p.mouse.move(cx + Math.sin(i / 12) * 300, cy + Math.cos(i / 9) * 180); await p.waitForTimeout(16); }
      await p.mouse.up();
      for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, i % 2 ? 240 : -240); await p.waitForTimeout(120); }
    }
  }
  const { profile } = await cdp.send('Profiler.stop'); const m1 = await metr();
  const d = (k) => Math.round((m1[k] - m0[k]) * 1000);
  console.log(`мс: всего задач ${d('TaskDuration')} | код ${d('ScriptDuration')} | стили ${d('RecalcStyleDuration')} | раскладка ${d('LayoutDuration')} | пересчётов стилей ${m1.RecalcStyleCount - m0.RecalcStyleCount} | раскладок ${m1.LayoutCount - m0.LayoutCount} | узлов ${m1.Nodes}`);
  const dt = profile.timeDeltas, ids = profile.samples, byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const par = new Map(); for (const n of profile.nodes) for (const c of n.children || []) par.set(c, n.id);
  const name = (n) => (n.callFrame.functionName || '(безымянная)') + ' ' + n.callFrame.url.split('/').pop() + ':' + (n.callFrame.lineNumber + 1);
  const self = {}, tot = {};
  ids.forEach((id, i) => {
    const n = byId.get(id), ms = dt[i] / 1000; self[name(n)] = (self[name(n)] || 0) + ms;
    const seen = new Set(); for (let x = id; x; x = par.get(x)) { const q = byId.get(x); if (!q.callFrame.url) continue; const k = name(q); if (!seen.has(k)) { seen.add(k); tot[k] = (tot[k] || 0) + ms; } }
  });
  const top = (o, n) => Object.entries(o).filter(([k]) => !/^\((idle|program)\)/.test(k)).sort((a, c) => c[1] - a[1]).slice(0, n).map(([k, v]) => String(Math.round(v)).padStart(5) + '  ' + k).join('\n');
  console.log('--- своё время, мс\n' + top(self, 12) + '\n--- с вложенными вызовами, мс\n' + top(tot, 16));
  if (mode !== 'boot') console.log('--- работающие анимации [свойства]:', await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => { const t = a.effect && a.effect.target; const ps = a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))); return (a.animationName || 'переход') + '@' + (t ? (t.id || (t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className) || t.tagName) : '?') + '[' + [...new Set(ps)].join(',') + ']'; }).reduce((o, k) => (o[k] = (o[k] || 0) + 1, o), {})));
  await b.close();
})();
