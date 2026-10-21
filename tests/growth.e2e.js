// Рост существ в живой игре: проигрыш обычному существу даёт ему шаг, и это видно в подписи уровня и в карточке; победа обнуляет.
// Запуск: node tests/growth.e2e.js (Playwright, не параллельно с другими e2e)
const { launch } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } };
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) { /* ничего */ } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(__dirname, '..', 'index.html') + '#dev-map-meadow'); await sleep(2600);
  const first = await p.evaluate(async () => {
    Profile.data.tutorial = { done: true, step: 99 }; Profile.data.wins = 30; Profile.data.petStay = true;
    const sp = MapView.map.spawns.find((s) => !s.boss && s.tier === 1 && MapView.alive(s) && !MapView.eliteOf(s) && MapView.known(s.idx));
    window.__sp = sp; MapView.tap(sp.idx); await new Promise((r) => setTimeout(r, 300));
    return { chip: document.querySelector('#map-card .tier-chip').textContent, note: /Окрепло/.test(document.querySelector('#map-card').textContent) };
  });
  ok(/Ур\.01/.test(first.chip) && !first.note, 'до проигрыша: Ур.01 и без пометки: ' + JSON.stringify(first));
  const lose = async () => {
    await p.evaluate(() => { const nb = HexMap.neighbors(MapView.map, window.__sp.idx).find((n) => MapView.map.cells[n] && n !== window.__sp.idx); MapView.state.pos = nb; MapView.tap(window.__sp.idx); }); await sleep(600);
    await p.evaluate(() => document.querySelector('#map-card [data-act=attack]').click()); await sleep(3500);
    await p.evaluate(() => { fighters.left.hp = 0; checkEnd(); }); await sleep(2200);
    await p.evaluate(() => document.querySelector('.overlay .to-map').click()); await sleep(2200);
    return p.evaluate(() => { MapView.tap(window.__sp.idx); return new Promise((r) => setTimeout(() => r({ grow: (MapView.state.grow || {})[window.__sp.id] || 0, chip: document.querySelector('#map-card .tier-chip').textContent, note: /Окрепло/.test(document.querySelector('#map-card').textContent) }), 400)); });
  };
  const a = await lose();
  ok(a.grow === 1 && /Ур\.02/.test(a.chip) && a.note, 'после первого проигрыша шаг виден в подписи и карточке: ' + JSON.stringify(a));
  const c = await lose();
  ok(c.grow === 2 && /Ур\.03/.test(c.chip), 'после второго — Ур.03: ' + JSON.stringify(c));
  // победа обнуляет
  await p.evaluate(() => { const nb = HexMap.neighbors(MapView.map, window.__sp.idx)[0]; MapView.state.pos = nb; MapView.tap(window.__sp.idx); }); await sleep(600);
  await p.evaluate(() => document.querySelector('#map-card [data-act=attack]').click()); await sleep(3500);
  await p.evaluate(() => { moves = 30; fighters.right.hp = 0; checkEnd(); }); await sleep(2200);
  await p.evaluate(() => document.querySelector('.overlay .to-map').click()); await sleep(2200);
  ok(await p.evaluate(() => !(MapView.state.grow || {})[window.__sp.id]), 'убитое существо обнуляется');
  ok(errs.length === 0, 'ошибки: ' + errs.join('; '));
  await b.close();
  console.log(bad ? 'growth e2e: ПРОВАЛ (' + bad + ')' : 'growth e2e: все проверки пройдены'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
