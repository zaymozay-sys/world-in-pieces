// Трофейные эликсиры существ в живой игре: проигрыш → существо забирает эликсиры (по цвету), видно в карточке; в бою пьёт; убито → остаток возвращается.
// Запуск: node tests/trophy204.e2e.js (Playwright, не параллельно с другими e2e)
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
  await p.evaluate(() => {
    Profile.data.tutorial = { done: true, step: 99 }; Profile.data.wins = 30; Profile.data.petStay = true;
    Profile.addElixir('power', 5, 1); Profile.addElixir('defense', 3, 3); Profile.addElixir('stones', 9, 5);
    window.__sp = MapView.map.spawns.find((s) => !s.boss && s.tier === 1 && MapView.alive(s) && !MapView.eliteOf(s) && MapView.known(s.idx));
  });
  const bagN = (k) => p.evaluate((key) => Profile.data.elixirs.bag[key] || 0, k);
  const attack = async () => {
    await p.evaluate(() => { const nb = HexMap.neighbors(MapView.map, window.__sp.idx).find((n) => MapView.map.cells[n] && n !== window.__sp.idx); MapView.state.pos = nb; MapView.tap(window.__sp.idx); }); await sleep(600);
    await p.evaluate(() => document.querySelector('#map-card [data-act=attack]').click()); await sleep(3500);
  };
  const toMap = async () => { await p.evaluate(() => document.querySelector('.overlay .to-map').click()); await sleep(2200); };
  // 1. проигрыш существу 1-го цвета: забирает 1 эликсир — самый ценный для него (сила 5-го цвета), «камни» не трогает
  await attack();
  await p.evaluate(() => { fighters.left.hp = 0; checkEnd(); }); await sleep(2200); await toMap();
  const loot1 = await p.evaluate(() => (MapView.state.loot || {})[window.__sp.id]);
  ok(loot1 && loot1['power:5'] === 1 && Object.keys(loot1).length === 1, 'после проигрыша существо несёт 1 эликсир силы: ' + JSON.stringify(loot1));
  ok((await bagN('power:5')) === 0 && (await bagN('stones:9')) === 5 && (await bagN('defense:3')) === 3, 'у героя забрано только нужное существу');
  const note = await p.evaluate(() => { MapView.tap(window.__sp.idx); return new Promise((r) => setTimeout(() => r(/Несёт трофеи/.test(document.querySelector('#map-card').textContent)), 300)); });
  ok(note, 'в карточке существа видно, что оно несёт трофеи');
  // 2. новый бой: существо пьёт отнятый эликсир силы (+50% к Силе), запас в бою уменьшается
  await attack();
  const r = await p.evaluate(async () => {
    const f = fighters.right, before = f.stats.power; f.turnNo = 1; f.hp = f.max;
    const dmg0 = Combat.power(f);
    await enemyUseElixirs();
    return { pct: f.elxPct, left: Profile.data.monster.loot, dmgUp: Combat.power(f) / Math.max(0.0001, dmg0) };
  });
  ok(r.pct === 50 && Object.keys(r.left).length === 0, 'существо выпило эликсир силы: ' + JSON.stringify(r));
  // 3. пал герой снова — существо забрало ещё (защита 3-го цвета), прежний эликсир выпит и не возвращается
  await p.evaluate(() => { fighters.left.hp = 0; checkEnd(); }); await sleep(2200); await toMap();
  const loot2 = await p.evaluate(() => (MapView.state.loot || {})[window.__sp.id]);
  ok(loot2 && loot2['defense:3'] === 1 && !loot2['power:5'], 'второе поражение: новый трофей, выпитое не вернулось: ' + JSON.stringify(loot2));
  // 4. победа над существом: остаток возвращается в сумку
  await attack();
  await p.evaluate(() => { moves = 30; fighters.right.hp = 0; checkEnd(); }); await sleep(2200); await toMap();
  const fin = { bag: await bagN('defense:3'), loot: await p.evaluate(() => (MapView.state.loot || {})[window.__sp.id]) };
  ok(fin.bag >= 2 && !fin.loot, 'убитое существо вернуло невыпитое: ' + JSON.stringify(fin));
  // 5. оценка опасности учитывает трофеи: броня, блок, здоровье и сила существа растут
  const w = await p.evaluate(() => {
    const sc = Bestiary.scaled('boar', 5), o = MapView.withLoot(sc, { 'defense:9': 2, 'block:9': 1, 'health:9': 3, 'power:9': 7 });
    return { hp: [sc.hp, o.hp], def: [sc.stats.defense || 0, o.stats.defense], blk: [sc.stats.block || 0, o.stats.block], pow: [sc.stats.power || 0, o.stats.power] };
  });
  ok(w.hp[1] > w.hp[0] && w.def[1] > w.def[0] && w.blk[1] > w.blk[0] && w.pow[1] > w.pow[0], 'withLoot усиливает оценку: ' + JSON.stringify(w));
  ok(errs.length === 0, 'ошибки: ' + errs.join('; '));
  await b.close();
  console.log(bad ? 'trophy204 e2e: ПРОВАЛ (' + bad + ')' : 'trophy204 e2e: все проверки пройдены'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
