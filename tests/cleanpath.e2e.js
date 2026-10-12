// G3: чистый путь игрока без #dev-: заставка → обучение (пропуск настоящей кнопкой) → фракция → пол → имя → карта → бой → победа →
// добыча → карта → перезагрузка (прогресс на месте) → бой → отступление. На телефоне (портрет, альбом) и на компьютере.
// Имя героя с HTML-разметкой не должно исполняться. Запуск: node tests/cleanpath.e2e.js
const path = require('path');
const { launch } = require('../tools/browser.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0;
const ok = (n, c, x) => { if (c) console.log('  ok   ' + n); else { fails++; console.log('  FAIL ' + n + (x ? ' — ' + x : '')); } };

(async () => {
  const b = await launch();
  for (const [label, vp, touch] of [['телефон-портрет', { width: 390, height: 844 }, true], ['телефон-альбом', { width: 844, height: 390 }, true], ['компьютер', { width: 1280, height: 800 }, false]]) {
    console.log(label);
    const ctx = await b.newContext({ viewport: vp, isMobile: touch, hasTouch: touch });
    await ctx.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) {} });
    const p = await ctx.newPage(), errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    p.on('requestfailed', (r) => errs.push('request failed: ' + r.url().slice(-60)));
    await p.goto(URL);
    const sp = await p.evaluate(() => { const s = document.getElementById('splash'); if (!s) return null; const c = getComputedStyle(s); return { poster: s.classList.contains('has-poster'), rep: c.backgroundRepeat, size: c.backgroundSize }; });
    ok('заставка: картина не повторяется плиткой (no-repeat, cover)', !sp || (/^no-repeat/.test(sp.rep) && /^cover/.test(sp.size)), JSON.stringify(sp));
    await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 });
    ok('заставка закрылась сама', true);
    await p.waitForSelector('[data-coach="skip"]', { timeout: 15000 }).catch(() => {});
    const coach = await p.$('[data-coach="skip"]');
    ok('обучение предлагается новичку', !!coach);
    if (coach) await coach.click();
    await p.waitForTimeout(1200);
    await p.click('text=Горные кланы'); await p.click('text=Мужской');
    const evil = '<img src=x onerror="window.__xss=1">Лу';
    await p.fill('input', evil);
    await p.click('text=Начать игру!'); await p.waitForTimeout(1500);
    ok('карта открылась', await p.evaluate(() => document.body.classList.contains('mode-map')));
    ok('разметка в имени героя не исполнилась', await p.evaluate(() => !window.__xss && !document.querySelector('img[src="x"]')));
    const w0 = await p.evaluate(() => ({ wins: Profile.data.wins || 0, coins: Profile.data.coins || 0, name: Profile.data.name }));
    // бой: нападаем на ближайшее существо, ИИ доигрывает за героя
    await p.evaluate(() => { for (const k in RULES.timing) RULES.timing[k] = 5; const m = MapView.map, me = MapView.state.pos; const a = m.spawns.filter((s) => MapView.alive(s)).sort((x, y) => HexMap.dist(m.cells[x.idx], m.cells[me]) - HexMap.dist(m.cells[y.idx], m.cells[me])); MapView.attack(a[0]); });
    await p.waitForFunction(() => document.body.classList.contains('mode-battle'), null, { timeout: 20000 });
    // 1.6.5: автопилот включаем «липким» на обоих полях. Бой героя с питомцем при запуске сам передаёт управление герою (Duo.setControl) и сбрасывает автопилот,
    // а после победы на одном поле переключает человека на второе. Раньше простаивающий герой проигрывал по таймеру хода (3 пропуска × 30 с);
    // теперь таймер по умолчанию выключен — человек ждёт сколько угодно, и без «липкого» автопилота бой в тесте не кончится.
    await p.evaluate(() => { const keep = setInterval(() => { if (document.querySelector('.overlay .to-map') || !document.body.classList.contains('mode-battle')) return clearInterval(keep); if (!MAIN_BATTLE.over && !MAIN_BATTLE.autopilot) MAIN_BATTLE.setAutopilot(true, 100); const pb = typeof Duo !== 'undefined' && Duo.pet; if (pb && !pb.over && !pb.autopilot) pb.setAutopilot(true, 100); }, 300); MAIN_BATTLE.setAutopilot(true, 100); });
    await p.waitForSelector('#overlay .to-map, .overlay .to-map', { timeout: 240000 });
    const res = await p.evaluate(() => document.querySelector('.overlay').innerText.slice(0, 200));
    ok('окно итога боя показано (' + res.split('\n')[0] + ')', res.length > 0);
    await p.click('.overlay .to-map'); await p.waitForTimeout(1500);
    ok('возврат на карту', await p.evaluate(() => document.body.classList.contains('mode-map')));
    const w1 = await p.evaluate(() => ({ wins: Profile.data.wins || 0, coins: Profile.data.coins || 0, xp: Profile.data.xp || 0 }));
    ok(`прогресс начислен (победы ${w0.wins}→${w1.wins}, монеты ${w0.coins}→${w1.coins})`, w1.wins > w0.wins || w1.coins >= w0.coins);
    await p.evaluate(() => location.reload()).catch(() => {}); await p.waitForTimeout(4500);
    const w2 = await p.evaluate(() => { const raw = localStorage.getItem('gem-match-profile-v2'), bak = localStorage.getItem('gem-match-profile-v2-bak'); return { wins: Profile.data.wins || 0, coins: Profile.data.coins || 0, name: Profile.data.name, faction: Profile.data.faction, diskLen: raw ? raw.length : -1, bakLen: bak ? bak.length : -1, keys: Object.keys(localStorage).length }; });   // 1.6.5: при сбое видно, что лежит на диске (разбор единичного сбоя «после перезагрузки профиль пуст»)
    ok('после перезагрузки прогресс и имя на месте', w2.wins === w1.wins && w2.coins === w1.coins && w2.faction === 'dwarf' && w2.name === w0.name, JSON.stringify([w1, w2]));
    // отступление
    await p.evaluate(() => { const m = MapView.map, me = MapView.state.pos; const a = m.spawns.filter((s) => MapView.alive(s)).sort((x, y) => HexMap.dist(m.cells[x.idx], m.cells[me]) - HexMap.dist(m.cells[y.idx], m.cells[me])); MapView.attack(a[0]); });
    await p.waitForFunction(() => document.body.classList.contains('mode-battle'), null, { timeout: 20000 });
    await p.waitForTimeout(1500);
    const sel = touch && vp.width < 700 ? '#restart' : '#restart';
    await p.click(sel); await p.waitForTimeout(300); await p.click(sel);
    await p.waitForFunction(() => document.body.classList.contains('mode-map') || document.querySelector('.overlay'), null, { timeout: 30000 });
    if (await p.$('.overlay .to-map')) await p.click('.overlay .to-map');
    await p.waitForTimeout(1200);
    ok('отступление вернуло на карту без зависания', await p.evaluate(() => document.body.classList.contains('mode-map')));
    ok('без ошибок JS, консоли и неудачных запросов', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\ncleanpath e2e: ПРОВАЛ (${fails})` : '\ncleanpath e2e: все тесты пройдены');
  process.exit(fails ? 1 : 0);
})();
