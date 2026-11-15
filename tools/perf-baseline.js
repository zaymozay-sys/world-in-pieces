// Замер загрузки: node tools/perf-baseline.js [url]  (по умолчанию http://localhost:8000/)
// Эмуляция: CPU x4, сеть ~1.6 Мбит/с, 150 мс. Печатает JSON с цифрами для сравнения «до/после».
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:8000/';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 90 * 1024 });
  let bytes = 0, reqs = 0, imgBytes = 0, jsBytes = 0, cssBytes = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; reqs++; });
  p.on('response', async (r) => { try { const t = r.headers()['content-type'] || ''; const l = +(r.headers()['content-length'] || 0); if (/image/.test(t)) imgBytes += l; else if (/javascript/.test(t)) jsBytes += l; else if (/css/.test(t)) cssBytes += l; } catch (e) {} });
  const t0 = Date.now();
  await p.goto(url, { waitUntil: 'load', timeout: 120000 });
  const tLoad = Date.now() - t0;
  const m = await p.evaluate(() => ({ dcl: Math.round(performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart), fcp: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0), scripts: document.scripts.length, dom: document.getElementsByTagName('*').length }));
  console.log(JSON.stringify({ url, loadMs: tLoad, requests: reqs, totalKB: Math.round(bytes / 1024), jsKB: Math.round(jsBytes / 1024), cssKB: Math.round(cssBytes / 1024), imgKB: Math.round(imgBytes / 1024), ...m }, null, 1));
  await b.close();
})();
