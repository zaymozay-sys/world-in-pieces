// 2.0.7: подземелье-лабиринт: стены, туман, лестница вниз, глубокие этажи крепче. Браузер; в `npm test` не входит.
const { launch } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path'); const URL = 'file://' + path.join(__dirname, '..', 'index.html#dev-map');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await launch();
  for (const w of [390, 1000]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, hasTouch: w < 500, isMobile: w < 500 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL); await sleep(1800);
    await p.evaluate(() => MapView.devEnterTower(3)); await sleep(1200);
    const s = await p.evaluate(() => { const m = MapView.map; const open = m.cells.filter((c) => c.terrain !== 'mountain').length; let known = 0; for (let i = 0; i < m.cells.length; i++) if (MapView.known(i)) known++;
      return { kind: m.kind, floor: m.floor, walls: m.cells.length - open, open, known, total: m.cells.length, stairs: m.buildings.some((x) => x.id === 'towerStairs') }; });
    ok(s.kind === 'tower' && s.floor === 3 && s.stairs, `${w}px: этаж 3, лестница есть`);
    ok(s.walls > s.open && s.open > 45, `${w}px: лабиринт — стены (${s.walls}) и проходы (${s.open})`);
    ok(s.known < s.open, `${w}px: туман войны — открыто ${s.known} из ${s.total}`);
    // идём к лестнице: рядом с ней встаём и нажимаем
    const f = await p.evaluate(() => { const m = MapView.map, b = m.buildings.find((x) => x.id === 'towerStairs'); const g = m.spawns.find((x) => x.guard);
      const near = HexMap.neighbors ? null : null; MapView.devTeleport(b.idx, 2); return { idx: b.idx, guard: !!g }; });
    ok(f.guard === false, `${w}px: на 3-м этаже стража нет`);
    await p.evaluate(() => MapView.devBuilding('towerStairs')); await sleep(600);
    await p.evaluate(() => { const bt = document.querySelector('[data-act="building"], [data-act="use"]'); if (bt) bt.click(); }); await sleep(900);
    const fl = await p.evaluate(() => MapView.map.floor);
    ok(fl === 4, `${w}px: лестница ведёт на следующий этаж (этаж ${fl})`);
    // глубокий этаж: существа крепче
    const hp = await p.evaluate(async () => { const out = []; for (const f of [8, 30]) { MapView.devEnterTower(f); await new Promise((r) => setTimeout(r, 900)); const sp = MapView.map.spawns.find((x) => !x.guard); out.push([sp.depth, Bestiary.scaled(sp.species, sp.tier, 1, Profile.level()).hp * sp.depth]); } return out; });
    ok(hp[0][0] === 1 && hp[1][0] > 2, `${w}px: глубже существа крепче (множитель ${hp[1][0].toFixed(2)})`);
    ok(errs.length === 0, `${w}px: без ошибок страницы ` + errs.join('|'));
    await ctx.close();
  }
  await b.close();
  console.log(bad ? 'dungeon207 e2e: ПРОВАЛ (' + bad + ')' : 'dungeon207 e2e: всё в порядке');
  process.exit(bad ? 1 : 0);
})();
