/* Автоматический тестовый игрок: настоящая браузерная игра, изолированные сохранения.
   Не меняет игровые исходники и не использует настоящие профили пользователей.
   npm run test:player (smoke) | WIP_PLAYER_MODE=full npm run test:player
   WIP_PLAYER_MODE=release npm run test:player (30 battles)
*/
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launch } = require('../tools/browser.js');

const MODE = ['full', 'release', 'soak'].includes(process.env.WIP_PLAYER_MODE) ? process.env.WIP_PLAYER_MODE : 'smoke';
const BATTLE_COUNT = MODE === 'soak' ? 100 : MODE === 'release' ? 30 : MODE === 'full' ? 10 : 1;
const URL = process.env.WIP_URL || pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const OUTPUT = path.join(__dirname, '..', 'test-results', 'game-player');
fs.mkdirSync(OUTPUT, { recursive: true });
const report = {
  mode: MODE, targetBattles: BATTLE_COUNT, startedAt: new Date().toISOString(), version: 2,
  environment: { node: process.version, commit: process.env.GITHUB_SHA || null },
  checks: [], battles: [], screenshots: [], browserErrors: [], failures: []
};
let browser = null, page = null, scenario = 'initialization', captureNumber = 0;

function record(message, detail) {
  const entry = { scenario, message, detail: detail == null ? null : detail };
  report.checks.push(entry);
  console.log('OK: ' + message + (detail == null ? '' : ' — ' + JSON.stringify(detail)));
}
function ensure(value, message, detail) {
  assert.ok(value, message + (detail == null ? '' : ': ' + JSON.stringify(detail)));
  record(message, detail);
}
async function screenshot(label) {
  if (!page) return;
  const name = String(++captureNumber).padStart(2, '0') + '-' + label.replace(/[^a-z0-9-]+/gi, '-') + '.png';
  try {
    await page.screenshot({ path: path.join(OUTPUT, name), animations: 'disabled', timeout: 15000 });
    report.screenshots.push(name);
  } catch (error) {
    report.failures.push({ scenario, screenshot: name, reason: String(error) });
  }
}
function watchBrowserErrors(target) {
  target.on('pageerror', (error) => report.browserErrors.push({ scenario, kind: 'pageerror', message: error.message }));
  target.on('response', (response) => {
    if (response.status() >= 400) report.browserErrors.push({ scenario, kind: 'http', status: response.status(), url: response.url() });
  });
  target.on('console', (message) => {
    if (message.type() === 'error') report.browserErrors.push({ scenario, kind: 'console', message: message.text() });
  });
}
async function openContext(label, viewport, mobile, lang, hash) {
  scenario = label;
  const context = await browser.newContext({
    viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
    locale: lang === 'ru' ? 'ru-RU' : 'en-US'
  });
  await context.addInitScript((language) => {
    try { localStorage.setItem('wip-lang', language); } catch (e) { /* private sandbox */ }
  }, lang);
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  watchBrowserErrors(page);
  await page.goto(URL + (hash || ''), { waitUntil: 'load' });
  return context;
}
async function menuChecks(label) {
  scenario = label + ': menu';
  await page.locator('#m-more').click();
  const initial = await page.evaluate(() => {
    const menu = document.getElementById('map-menu');
    return {
      open: !menu.hidden,
      sideHidden: menu.querySelector('.mm-side').hidden,
      groupsHidden: [...menu.querySelectorAll('.mm-sub')].every((el) => el.hidden && getComputedStyle(el).display === 'none'),
      headings: menu.querySelectorAll('.mm-head').length
    };
  });
  ensure(initial.open && initial.sideHidden && initial.groupsHidden && initial.headings === 4,
    'Меню открыто, все подразделы изначально скрыты', initial);
  const main = await page.locator('#map-menu .mm-main').boundingBox();
  ensure(!!main && main.x + main.width <= (await page.evaluate(() => innerWidth)) + 2,
    'Основная колонка помещается у правого края');

  for (let i = 0; i < 4; i++) {
    await page.locator('#map-menu .mm-head').nth(i).click();
    const status = await page.evaluate(() => {
      const menu = document.getElementById('map-menu');
      const visible = [...menu.querySelectorAll('.mm-sub')].filter((el) => !el.hidden && getComputedStyle(el).display !== 'none');
      const a = menu.querySelector('.mm-side').getBoundingClientRect();
      const b = menu.querySelector('.mm-main').getBoundingClientRect();
      return { visible: visible.map((x) => x.id), sideHidden: menu.querySelector('.mm-side').hidden,
        sideLeftOfMain: a.right <= b.left + 2, inViewport: a.left >= -2 && b.right <= innerWidth + 2 };
    });
    ensure(status.visible.length === 1 && !status.sideHidden && status.sideLeftOfMain && status.inViewport,
      'Открыт только выбранный подраздел ' + (i + 1), status);
    if (i === 0) await screenshot(label + '-two-columns');
  }
  await page.locator('#map-menu .mm-head').nth(3).click();
  ensure(await page.evaluate(() => document.querySelector('#map-menu .mm-side').hidden &&
    [...document.querySelectorAll('#map-menu .mm-sub')].every((x) => x.hidden)), 'Повторный клик сворачивает подменю');
  await page.locator('#m-more').click();
  ensure(await page.evaluate(() => document.getElementById('map-menu').hidden), 'Главное меню закрывается');
  await page.locator('#m-more').click();
  ensure(await page.evaluate(() => document.querySelector('#map-menu .mm-side').hidden),
    'При повторном открытии подменю остаётся скрытым');
  await page.locator('#m-more').click();
}
async function createNewHero() {
  scenario = 'new character';
  await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });
  const skip = page.locator('[data-coach="skip"]');
  await skip.waitFor({ state: 'visible', timeout: 15000 });
  await skip.click();
  await page.waitForTimeout(350);
  if (await skip.count() && await skip.isVisible()) await skip.click();
  await page.waitForTimeout(900);
  await page.locator('text=Подгорные кланы').click();
  await page.locator('button.primary[data-gender="m"]').click();
  await page.locator('input[data-nick]').fill('Автоигрок');
  await page.locator('button[data-act="start"]').click();
  await page.waitForFunction(() => document.body.classList.contains('mode-map'), null, { timeout: 15000 });
  const profile = await page.evaluate(() => ({ name: Profile.data.name, faction: Profile.data.faction }));
  ensure(profile.name === 'Автоигрок' && profile.faction === 'dwarf',
    'Новый герой создан через игровой интерфейс', profile);
  await screenshot('new-hero-map');
}

async function snapshot() {
  return page.evaluate(() => {
    const d = Profile.data;
    return {
      name: d.name, faction: d.faction, level: Profile.level(),
      wins: d.wins || 0, xp: d.xp || 0, coins: d.coins || 0,
      resources: { ...(d.resources || {}) },
      backpack: { ...(d.backpack || {}) },
      elixirs: { ...((d.elixirs && d.elixirs.bag) || {}) },
      items: (d.items || []).map((e) => {
        let name = e.id || 'unknown';
        try { name = Gear.item(e).name || name; } catch (err) {}
        return { uid: e.uid, id: e.id, tier: e.tier, name };
      })
    };
  });
}
function compareInventory(before, after) {
  const bucket = (a, b) => {
    const gained = [], spent = [];
    for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
      const d = (Number((b || {})[key]) || 0) - (Number((a || {})[key]) || 0);
      if (d > 0) gained.push({ key, count: d });
      if (d < 0) spent.push({ key, count: -d });
    }
    return { gained, spent };
  };
  const existing = new Set(before.items.map((x) => x.uid));
  const retained = new Set(after.items.map((x) => x.uid));
  return {
    xp: after.xp - before.xp, coins: after.coins - before.coins,
    resources: bucket(before.resources, after.resources),
    consumables: bucket(before.backpack, after.backpack),
    elixirs: bucket(before.elixirs, after.elixirs),
    itemsGained: after.items.filter((x) => !existing.has(x.uid)),
    itemsLost: before.items.filter((x) => !retained.has(x.uid))
  };
}
function lootText(delta) {
  const list = delta.itemsGained.map((x) => x.name + ' [' + x.id + ', цвет ' + x.tier + ']');
  for (const label of ['resources', 'consumables', 'elixirs']) {
    const title = { resources: 'Ресурс', consumables: 'Расходник', elixirs: 'Эликсир' }[label];
    for (const x of delta[label].gained) list.push(title + ' ' + x.key + ' ×' + x.count);
  }
  return list.join('; ') || 'Нет положительного изменения инвентаря';
}

async function closeOptionalDialogs() {
  const close = page.locator('.modal button:has-text("Закрыть")').first();
  if (await close.count() && await close.isVisible()) {
    await close.click();
    await page.waitForTimeout(350);
  }
}
async function fight(number) {
  scenario = 'battle ' + number;
  await closeOptionalDialogs();
  const before = await snapshot();
  // Выбираем ближайшего обычного противника подходящего цвета. Убитых MapView.alive исключает.
  const enemy = await page.evaluate(() => {
    const m = MapView.map, me = MapView.state.pos, tier = Hero.tierFor(Profile.level());
    const pool = m.spawns.filter((sp) => MapView.alive(sp) && !sp.boss && !sp.guard && !sp.castle && !sp.rare)
      .map((sp) => ({ sp, distance: HexMap.dist(m.cells[sp.idx], m.cells[me]) }))
      .sort((a, b) => (a.sp.tier <= tier ? 0 : 1) - (b.sp.tier <= tier ? 0 : 1)
        || Math.abs(a.sp.tier - tier) - Math.abs(b.sp.tier - tier) || a.distance - b.distance);
    if (!pool.length) return null;
    const choice = pool[0];
    MapView.attack(choice.sp);
    return { species: choice.sp.species, tier: choice.sp.tier, id: choice.sp.id, distance: choice.distance };
  });
  ensure(!!enemy, 'Есть противник для боя ' + number, enemy);
  await page.waitForFunction(() => document.body.classList.contains('mode-battle'), null, { timeout: 45000 });
  // Победа и награды не задаются тестом. Бой ведёт игровой автопилот.
  await page.evaluate(() => {
    for (const k in RULES.timing) RULES.timing[k] = 5;
    const keep = setInterval(() => {
      if (document.querySelector('.overlay .to-map') || !document.body.classList.contains('mode-battle')) return clearInterval(keep);
      if (!MAIN_BATTLE.over && !MAIN_BATTLE.autopilot) MAIN_BATTLE.setAutopilot(true, 100);
      const pet = typeof Duo !== 'undefined' && Duo.pet;
      if (pet && !pet.over && !pet.autopilot) pet.setAutopilot(true, 100);
    }, 300);
    MAIN_BATTLE.setAutopilot(true, 100);
  });
  await page.waitForSelector('.overlay .to-map', { timeout: 240000 });
  const reward = await page.evaluate(() => {
    const root = document.querySelector('.overlay');
    return {
      text: (root?.innerText || '').slice(0, 1400),
      chips: [...(root?.querySelectorAll('.loot-chip') || [])].map((x) =>
        x.dataset.cap || x.getAttribute('title') || x.innerText.trim()).filter(Boolean)
    };
  });
  ensure(!!reward.text, 'Есть экран итогов боя ' + number);
  // Для длинного прогона — контрольный скриншот раз в 10 боёв и при каждом поражении.
  // В отчёте сохраняются все результаты независимо от числа скриншотов.
  if (!['soak', 'release'].includes(MODE) || number === 1 || number % 10 === 0 || /Поражение|Defeat/i.test(reward.text)) {
    await screenshot('battle-' + number + '-result');
  }
  await page.waitForTimeout(1300);
  await page.evaluate(() => document.querySelector('.overlay .to-map').click());
  await page.waitForFunction(() => document.body.classList.contains('mode-map'), null, { timeout: 20000 });
  const after = await snapshot();
  const headline = reward.text.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 4).join(' ');
  const result = after.wins > before.wins ? 'win' : /Поражение|Defeat/i.test(headline) ? 'loss' : 'unknown';
  const delta = compareInventory(before, after);
  report.battles.push({ number, enemy, result, before, after, delta, reward });
  ensure(result !== 'unknown', 'Итог боя определён корректно', headline);
  ensure(before.name === after.name && before.faction === after.faction,
    'Герой не менялся между боями');
  record('Бой ' + number + '/' + BATTLE_COUNT + ': ' + (result === 'win' ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'),
    { opponent: enemy.species, xp: delta.xp, coins: delta.coins, loot: lootText(delta) });
}

async function checkSave() {
  scenario = 'save persistence';
  const savedState = () => page.evaluate(() => {
    const key = 'gem-match-profile-v2';
    let raw = null, parsed = null, readError = null;
    try {
      raw = localStorage.getItem(key);
      if (raw) parsed = JSON.parse(raw);
    } catch (error) { readError = String(error); }
    return {
      urlProtocol: location.protocol, origin: location.origin,
      storageOk: Profile.storageOk, stale: Profile.stale, rawLength: raw ? raw.length : 0,
      parsed: parsed ? { name: parsed.name, faction: parsed.faction, wins: parsed.wins,
        coins: parsed.coins, xp: parsed.xp } : null,
      readError
    };
  });
  const before = await page.evaluate(() => ({
    name: Profile.data.name, faction: Profile.data.faction,
    wins: Profile.data.wins || 0, coins: Profile.data.coins || 0, xp: Profile.data.xp || 0
  }));
  const storageBefore = await savedState();
  record('Хранилище перед перезагрузкой', storageBefore);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof Profile !== 'undefined' &&
    document.body.classList.contains('mode-map') && !document.getElementById('splash'),
    null, { timeout: 20000 });
  const after = await page.evaluate(() => ({
    name: Profile.data.name, faction: Profile.data.faction,
    wins: Profile.data.wins || 0, coins: Profile.data.coins || 0, xp: Profile.data.xp || 0
  }));
  const storageAfter = await savedState();
  ensure(storageBefore.rawLength > 0 && storageBefore.storageOk &&
    before.name === after.name && before.faction === after.faction &&
    before.wins === after.wins && before.coins === after.coins && before.xp === after.xp,
    'Прогресс сохранён после перезагрузки страницы',
    { before, after, storageBefore, storageAfter });
}
function writeReport() {
  report.finishedAt = new Date().toISOString();
  const battles = report.battles;
  report.summary = {
    planned: BATTLE_COUNT, completed: battles.length,
    wins: battles.filter((b) => b.result === 'win').length,
    losses: battles.filter((b) => b.result === 'loss').length,
    unknown: battles.filter((b) => b.result === 'unknown').length,
    xp: battles.reduce((a, b) => a + b.delta.xp, 0),
    coins: battles.reduce((a, b) => a + b.delta.coins, 0),
    errors: report.failures.length + report.browserErrors.length
  };
  fs.writeFileSync(path.join(OUTPUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  const safe = (value) => String(value == null ? '' : value).replace(/[|\r\n]/g, ' ');
  const lines = [
    '# Хрупкий мир — отчёт автоматического игрока', '',
    'Режим: ' + MODE + ' · ' + report.finishedAt,
    '', '## Сводка',
    '- Боёв: ' + report.summary.completed + '/' + report.summary.planned,
    '- Побед: ' + report.summary.wins,
    '- Поражений: ' + report.summary.losses,
    '- Опыт: ' + (report.summary.xp >= 0 ? '+' : '') + report.summary.xp,
    '- Монеты (изменение): ' + (report.summary.coins >= 0 ? '+' : '') + report.summary.coins,
    '- Ошибок: ' + report.summary.errors, '',
    '## Каждый бой',
    '| № | Противник | Итог | Опыт | Монеты | Фактические изменения инвентаря |',
    '|---:|---|---|---:|---:|---|',
    ...battles.map((b) =>
      '| ' + b.number + ' | ' + safe(b.enemy.species + ', цвет ' + b.enemy.tier) +
      ' | ' + (b.result === 'win' ? 'Победа' : b.result === 'loss' ? 'Поражение' : 'Не определён') +
      ' | ' + b.delta.xp + ' | ' + b.delta.coins + ' | ' + safe(lootText(b.delta)) + ' |'),
    '', '## Награды, показанные игрой',
    ...battles.map((b) => '- Бой ' + b.number + ': ' + safe(b.reward.chips.join('; ') || b.reward.text.slice(0, 350))),
    '', '## Ошибки',
    ...report.failures.concat(report.browserErrors).map((x) => '- ' + safe(JSON.stringify(x))),
    ...(report.failures.length || report.browserErrors.length ? [] : ['- Нет']),
    '', '## Скриншоты', ...report.screenshots.map((x) => '- ' + x),
    '', '## Проверки', ...report.checks.map((x) => '- ✓ ' + x.scenario + ': ' + x.message), ''
  ];
  fs.writeFileSync(path.join(OUTPUT, 'report.md'), lines.join('\n'), 'utf8');
  console.log('ИТОГ: ' + JSON.stringify(report.summary));
  console.log('Отчёты сохранены в test-results/game-player/');
}

(async () => {
  try {
    browser = await launch();
    let context = await openContext('desktop RU', { width: 1280, height: 800 }, false, 'ru');
    await createNewHero();
    await menuChecks('desktop-ru');
    for (let number = 1; number <= BATTLE_COUNT; number++) {
      await fight(number);
      if (number === 1 || number === BATTLE_COUNT || number === 5 || (['soak', 'release'].includes(MODE) && number % 20 === 0)) await checkSave();
    }
    ensure(report.battles.length === BATTLE_COUNT, 'Все запланированные бои завершены',
      { planned: BATTLE_COUNT, finished: report.battles.length });
    await context.close();
    page = null;

    context = await openContext('mobile EN', { width: 390, height: 844 }, true, 'en', '#dev-map-meadow');
    await page.waitForFunction(() => document.body.classList.contains('mode-map') &&
      typeof MapView !== 'undefined' && typeof Profile !== 'undefined' && !!Profile.data.faction,
      null, { timeout: 20000 });
    await menuChecks('mobile-en');
    await context.close();
    page = null;

    if (MODE !== 'smoke') {
      context = await openContext('landscape RU', { width: 844, height: 390 }, true, 'ru', '#dev-map-meadow');
      await page.waitForFunction(() => document.body.classList.contains('mode-map') &&
        typeof Profile !== 'undefined' && !!Profile.data.faction, null, { timeout: 20000 });
      await menuChecks('landscape-ru');
      await context.close();
      page = null;
    }
    assert.equal(report.browserErrors.length, 0, 'Ошибки JavaScript/консоли: ' + JSON.stringify(report.browserErrors.slice(0, 3)));
  } catch (error) {
    report.failures.push({ scenario, reason: error.stack || String(error) });
    console.error('FAIL:', error.stack || error);
    await screenshot('failure');
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    writeReport();
  }
})();