// Проверка нажатий в бою на матрице экранов (1.6.4): соло-бой и бой вдвоём, портрет и альбом, пятиточечный hit-test.
// Запуск: node tools/hit-audit.js [--out=/tmp/hit] [--vp=390x844,667x375] [--scenes=solo,duo] [--lang=ru|en] [--shots]
// Код возврата 1, если найден хотя бы один дефект kind ∈ {offscreen, blocked, small, clip, hscroll, dupid}.
const path = require('path'), fs = require('fs');
const { launch } = require('./browser.js');
const { hitReport } = require('./hitlib.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };
const OUT = arg('out', '/tmp/hit'); fs.mkdirSync(OUT, { recursive: true });
const LANG = arg('lang', 'ru'), SHOTS = process.argv.includes('--shots');
const ALL = ['320x568', '360x640', '375x667', '390x844', '414x896', '568x320', '667x375', '736x414', '844x390', '932x430', '768x1024', '1024x768', '1280x800', '1366x768'];
const VPS = arg('vp', ALL.join(',')).split(',').map((s) => s.split('x').map(Number));
const SCENES = arg('scenes', 'solo,duo').split(',');
const BAD = new Set(['offscreen', 'blocked', 'small', 'clip', 'hscroll', 'dupid']);
(async () => {
  const b = await launch(); const rows = []; let bad = 0;
  for (const [w, h] of VPS) {
    const touch = Math.min(w, h) <= 900;   // планшеты и телефоны — касание; ноутбук и десктоп — мышь
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
    await ctx.addInitScript((lg) => { try { localStorage.setItem('wip-lang', lg); localStorage.setItem('wip-turn-timer', '30'); /* 1.6.5: таймер включён — самая широкая вёрстка */ } catch (e) {} }, LANG);
    for (const sc of SCENES) {
      const p = await ctx.newPage(), errs = [];
      p.on('pageerror', (e) => errs.push(e.message));
      const cmd = sc === 'solo' ? 'fight-goblin-3-solo' : 'fight-goblin-3';
      await p.goto(URL + '#dev-' + cmd); await p.waitForTimeout(3600);
      if (sc === 'duo') {   // питомец нужен для двух полей: выдаём яйцо-питомца тестовому профилю и перезапускаем бой
        const duo = await p.evaluate(() => typeof Duo !== 'undefined' && Duo.on());
        if (!duo) { rows.push({ vp: `${w}x${h}`, sc, kind: 'note', el: 'дуо-бой не запустился (нет питомца в тестовом профиле)' }); await p.close(); continue; }
      }
      const f = await p.evaluate(hitReport);
      const states = [''];
      if (sc === 'duo') states.push('pet-tab');
      for (const st of states) {
        let ff = f;
        if (st === 'pet-tab') { await p.evaluate(() => { const t = document.querySelectorAll('.duo-tab'); if (t[1]) t[1].click(); }); await p.waitForTimeout(500); ff = await p.evaluate(hitReport); }
        for (const e of ff) { rows.push({ vp: `${w}x${h}`, sc: sc + (st ? ':' + st : ''), ...e }); if (BAD.has(e.kind)) bad++; }
        if (SHOTS || ff.some((e) => BAD.has(e.kind))) await p.screenshot({ path: `${OUT}/${w}x${h}-${sc}${st ? '-' + st : ''}.png` });
      }
      for (const e of errs) { rows.push({ vp: `${w}x${h}`, sc, kind: 'js', el: e }); bad++; }
      await p.close();
    }
    await ctx.close();
  }
  await b.close();
  fs.writeFileSync(OUT + '/hit-report.json', JSON.stringify(rows, null, 1));
  for (const r of rows) if (BAD.has(r.kind) || r.kind === 'js' || r.kind === 'note') console.log(`${r.vp.padEnd(9)} ${r.sc.padEnd(12)} ${r.kind.padEnd(9)} ${r.el} ${r.text ? '«' + r.text + '» ' : ''}${r.rect || ''} ${r.by ? 'закрыто: ' + r.by + ' ' + r.missed : ''}${r.size ? ' ' + r.size : ''}`);
  console.log('\nклетка поля (px):'); for (const r of rows.filter((x) => x.kind === 'info')) console.log(`  ${r.vp.padEnd(9)} ${r.sc.padEnd(12)} клетка ${r.cell}`);
  console.log(`\nдефектов: ${bad}`); process.exit(bad ? 1 : 0);
})();
