/* Автоматический тестовый игрок: настоящая браузерная игра, изолированные сохранения.
   Не меняет игровые исходники и не использует настоящие профили пользователей.
   npm run test:player (smoke) | WIP_PLAYER_MODE=full npm run test:player
*/
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launch } = require('../tools/browser.js');

const MODE = process.env.WIP_PLAYER_MODE === 'full' ? 'full' : 'smoke';
const URL = process.env.WIP_URL || pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const OUTPUT = path.join(__dirname, '..', 'test-results', 'game-player');
fs.mkdirSync(OUTPUT, { recursive: true });
const report = {
  mode: MODE, startedAt: new Date().toISOString(), version: 1,
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
  await page.locator('text=Мужской').click();
  await page.locator('input').fill('Автоигрок');
  await page.locator('text=Начать игру!').click();
  await page.waitForFunction(() => document.body.classList.contains('mode-map'), null, { timeout: 15000 });
  const profile = await page.evaluate(() => ({ name: Profile.data.name, faction: Profile.data.faction }));
  ensure(profile.name === 'Автоигрок' && profile.faction === 'dwarf',
    'Новый герой создан через игровой интерфейс', profile);
  await screenshot('new-hero-map');
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
  const before = await page.evaluate(() => ({
    wins: Profile.data.wins || 0, coins: Profile.data.coins || 0, xp: Profile.data.xp || 0
  }));
  const enemy = await page.evaluate(() => {
    const map = MapView.map, pos = MapView.state.pos;
    const candidates = map.spawns.filter((s) => MapView.alive(s)).map((s) => ({
      spawn: s, distance: HexMap.dist(map.cells[s.idx], map.cells[pos])
    })).sort((a, b) => a.distance - b.distance);
    if (!candidates.length) return null;
    const chosen = candidates[0];
    MapView.attack(chosen.spawn);
    return { type: chosen.spawn.species || chosen.spawn.id || 'unknown', distance: chosen.distance };
  });
  ensure(!!enemy, 'Найден доступный противник', enemy);
  await page.waitForFunction(() => document.body.classList.contains('mode-battle'), null, { timeout: 20000 });
  // Бой решается настоящим игровым автопилотом; тест не подменяет результат и не выдаёт награды сам.
  await page.evaluate(() => {
    for (const key in RULES.timing) RULES.timing[key] = 5;
    const keep = setInterval(() => {
      if (document.querySelector('.overlay .to-map') || !document.body.classList.contains('mode-battle')) {
        clearInterval(keep);
        return;
      }
      if (!MAIN_BATTLE.over && !MAIN_BATTLE.autopilot) MAIN_BATTLE.setAutopilot(true, 100);
      const pet = typeof Duo !== 'undefined' && Duo.pet;
      if (pet && !pet.over && !pet.autopilot) pet.setAutopilot(true, 100);
    }, 300);
    MAIN_BATTLE.setAutopilot(true, 100);
  });
  await page.waitForSelector('.overlay .to-map', { timeout: 240000 });
  const outcome = await page.evaluate(() => ({
    summary: (document.querySelector('.overlay')?.innerText || '').slice(0, 240),
    wins: Profile.data.wins || 0, coins: Profile.data.coins || 0, xp: Profile.data.xp || 0
  }));
  ensure(outcome.summary.length > 0, 'Бой завершился игровым экраном результата', outcome.summary);
  report.battles.push({ number, enemy, before, after: outcome });
  await screenshot('battle-' + number + '-result');
  await page.waitForTimeout(1300);
  await page.evaluate(() => document.querySelector('.overlay .to-map').click());
  await page.waitForFunction(() => document.body.classList.contains('mode-map'), null, { timeout: 16000 });
  record('Возврат на карту после боя ' + number, { wins: outcome.wins, coins: outcome.coins });
}
async function checkSave() {
  scenario = 'save persistence';
  const before = await page.evaluate(() => ({
    name: Profile.data.name, faction: Profile.data.faction,
    wins: Profile.data.wins || 0, coins: Profile.data.coins || 0, xp: Profile.data.xp || 0
  }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof Profile !== 'undefined' &&
    document.body.classList.contains('mode-map') && !document.getElementById('splash'),
    null, { timeout: 20000 });
  const after = await page.evaluate(() => ({
    name: Profile.data.name, faction: Profile.data.faction,
    wins: Profile.data.wins || 0, coins: Profile.data.coins || 0, xp: Profile.data.xp || 0
  }));
  ensure(before.name === after.name && before.faction === after.faction &&
    before.wins === after.wins && before.coins === after.coins && before.xp === after.xp,
    'Прогресс сохранён после перезагрузки страницы', { before, after });
}
function writeReport() {
  report.finishedAt = new Date().toISOString();
  const json = path.join(OUTPUT, 'report.json');
  fs.writeFileSync(json, JSON.stringify(report, null, 2), 'utf8');
  const lines = ['# Автоматический тестовый игрок', '',
    'Режим: ' + report.mode, 'Дата: ' + report.finishedAt, '',
    '## Проверки', ...report.checks.map((x) => '- ✓ ' + x.scenario + ': ' + x.message),
    '', '## Бои', ...report.battles.map((b) =>
      '- Бой ' + b.number + ': ' + b.enemy.type + ', победы ' + b.before.wins + ' → ' + b.after.wins +
      ', монеты ' + b.before.coins + ' → ' + b.after.coins),
    '', '## Ошибки', ...(report.browserErrors.concat(report.failures).map((e) => '- ' + JSON.stringify(e))),
    ...(report.browserErrors.length || report.failures.length ? [] : ['- Не зарегистрированы']),
    '', '## Скриншоты', ...report.screenshots.map((file) => '- ' + file), ''];
  fs.writeFileSync(path.join(OUTPUT, 'report.md'), lines.join('\n'), 'utf8');
  console.log('Отчёты сохранены в test-results/game-player/');
}
(async () => {
  try {
    browser = await launch();
    let context = await openContext('desktop RU', { width: 1280, height: 800 }, false, 'ru');
    await createNewHero();
    await menuChecks('desktop-ru');
    await fight(1);
    await checkSave();
    if (MODE === 'full') await fight(2);
    await context.close();
    page = null;

    context = await openContext('mobile EN', { width: 390, height: 844 }, true, 'en', '#dev-map-meadow');
    await page.waitForFunction(() => document.body.classList.contains('mode-map') &&
      typeof MapView !== 'undefined' && typeof Profile !== 'undefined' && !!Profile.data.faction,
      null, { timeout: 20000 });
    await menuChecks('mobile-en');
    await context.close();
    page = null;

    if (MODE === 'full') {
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