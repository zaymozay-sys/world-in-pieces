// 2.0.8: бой идёт с тем существом, которое выбрали на карте: цвет в бою равен цвету на карте, без занижения до цвета героя + 1.
// Запуск: node tests/maptier208.e2e.js
const path = require('path');
const { launch } = require('../tools/browser.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html#dev-map');
let fails = 0;
const ok = (name, cond, extra) => { if (cond) console.log('  ok   ' + name); else { fails++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };
(async () => {
  const b = await launch(); const p = await (await b.newContext({ locale: 'ru-RU', viewport: { width: 900, height: 800 } })).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(2500);
  const r = await p.evaluate(async () => {
    const w = (ms) => new Promise((x) => setTimeout(x, ms)), ht = Hero.tierFor(Profile.level());
    const sp = MapView.map.spawns.find((s) => s.tier > ht + 1 && !s.boss && !s.zone && !s.castle && Bestiary.MONSTERS[s.species]);
    if (!sp) return { none: true };
    return { ht, tier: sp.tier, species: sp.species };
  });
  ok('на карте есть существо сильнее цвета героя + 1', !r.none, JSON.stringify(r));
  ok('цвет на карте выше цвета героя + 1', r.tier > r.ht + 1, JSON.stringify(r));
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'js', 'mapview.js'), 'utf8');
  ok('бой берёт цвет существа как есть (нет занижения)', /tier: sp\.tier, swarm:/.test(src) && !/tier: Math\.min\(sp\.tier, Hero\.tierFor/.test(src));
  ok('события, логова и осада тоже без занижения', /const evTier = \(tier\) => tier;/.test(src) && !/Math\.min\(r\.tier, Hero\.tierFor/.test(src));
  ok('страница без ошибок', errs.length === 0, errs.join('; '));
  await b.close(); console.log(fails ? 'maptier208: ПРОВАЛЫ ' + fails : 'maptier208 e2e: все тесты пройдены'); process.exit(fails ? 1 : 0);
})();
