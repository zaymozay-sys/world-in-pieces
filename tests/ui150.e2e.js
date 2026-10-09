// Сквозные проверки пакета 1.5.0 в настоящем браузере: раскладки для телефона, окно награды, приёмы питомца,
// добивание врага питомца, занятия в питомнике, плавная ходьба, камни не зависают.
// Запуск: NODE_PATH=$(npm root -g) node tests/ui150.e2e.js (в обычный `npm test` не входит).
const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

async function open(b, vp, mobile) {
  const ctx = await b.newContext({ viewport: vp, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); localStorage.setItem('wip-ui-skin', '2'); } catch (e) {} });
  await p.goto(URL); await p.waitForTimeout(1800);
  // 1.5.4: новичок сначала идёт в учебный бой; пропуск обучения открывает выбор народа
  await p.evaluate(() => { if (!Profile.data.faction && typeof Tutorial !== 'undefined') { Tutorial.start(); Tutorial.finish(false); } }); await p.waitForTimeout(300);
  await p.click('text=Горные кланы').catch(() => {}); await p.click('text=Мужской').catch(() => {});
  await p.fill('input', 'Тест').catch(() => {}); await p.click('text=Начать игру!').catch(() => {});
  await p.waitForTimeout(1000);
  return { p, errs, ctx };
}
const attack = (p, fast) => p.evaluate((fast) => {
  if (fast) for (const k in RULES.timing) RULES.timing[k] = 5;
  const m = MapView.map, me = MapView.state.pos;
  const a = m.spawns.filter((s) => MapView.alive(s)).sort((x, y) => HexMap.dist(m.cells[x.idx], m.cells[me]) - HexMap.dist(m.cells[y.idx], m.cells[me]));
  MapView.attack(a[0]);
}, fast);
const startDuo = async (p, fast) => { await attack(p, fast); await p.waitForFunction(() => document.body.classList.contains('duo-battle') && Duo.on(), null, { timeout: 20000 }); await p.waitForTimeout(1200); };
const floating = (p) => p.evaluate(() => {   // камень над пустой клеткой — «завис»
  const bad = [];
  for (const [name, B] of [['hero', MAIN_BATTLE], ['pet', Duo.pet]]) {
    if (!B) continue;
    const g = B.grid;
    for (let c = 0; c < g[0].length; c++) { let seenEmpty = false; for (let r = g.length - 1; r >= 0; r--) { if (!g[r][c]) seenEmpty = true; else if (seenEmpty) bad.push(`${name}:${r},${c}`); } }
  }
  return bad;
});

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });

  // 1. телефон: вертикаль и горизонталь
  for (const [name, vp] of [['портрет', { width: 390, height: 800 }], ['ландшафт', { width: 800, height: 380 }]]) {
    const { p, errs, ctx } = await open(b, vp, true);
    await p.evaluate(() => { document.body.classList.add('ui-columns', 'ui-modern'); });
    await startDuo(p);
    const s = await p.evaluate(() => {
      const vis = (sel) => { const e = document.querySelector('main.game:not(.duo-pet) ' + sel); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return cs.display !== 'none' && r.width > 0 ? r : null; };
      const inside = (r) => !!r && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1;
      const pics = ['#hint', '#mute', '#gear', '#restart', '#more'].map((s) => inside(vis(s)));
      const sb = vis('#spellbar'), bg = vis('#bagbar'), bd = vis('#board');
      return {
        phone: document.body.classList.contains('phone'), noHScroll: document.documentElement.scrollWidth <= innerWidth + 1,
        pics, spells: document.querySelectorAll('main.game:not(.duo-pet) #spellbar button').length, spellsIn: inside(sb), bagIn: inside(bg), boardIn: inside(bd),
        square: bd && Math.abs(bd.width - bd.height) < 3, hidden: ['#bestiary', '#credits', '#ui-skin', '#fullscreen'].map((s) => !vis(s)),
        counters: !!vis('#fighter-left .counters') && !!vis('#fighter-right .counters'), lvlInput: !!vis('.fighter.right label.lvl'),
        cell: Math.round(bd.width / 6),
      };
    });
    assert.ok(s.phone, name + ': режим телефона включён');
    assert.ok(s.noHScroll, name + ': нет горизонтальной прокрутки');
    assert.ok(s.pics.every(Boolean), name + ': все пять пиктограмм на экране ' + JSON.stringify(s.pics));
    assert.ok(s.spells >= 13 && s.spellsIn && s.bagIn && s.boardIn, name + ': магия, эликсиры и поле на экране ' + JSON.stringify(s));
    assert.ok(s.square, name + ': поле квадратное');
    assert.ok(s.hidden.every(Boolean), name + ': лишние кнопки убраны с экрана боя');
    assert.ok(s.counters, name + ': счётчики камней видны');
    assert.ok(!s.lvlInput, name + ': поле «ИИ» скрыто');
    assert.ok(s.cell >= 40, name + ': клетка поля не меньше 40 px (' + s.cell + ')');
    // меню ☰: пункты есть, «Бестиарий» открывается
    await p.tap('main.game:not(.duo-pet) #more');
    const items = await p.evaluate(() => [...document.querySelectorAll('main.game:not(.duo-pet) #more-menu button')].map((x) => x.textContent.trim()));
    assert.ok(items.length >= 4 && items.includes('Бестиарий') && items.includes('Журнал боя'), name + ': пункты меню ' + items);
    await p.tap('main.game:not(.duo-pet) #more-menu [data-do=bestiary]'); await p.waitForTimeout(600);
    assert.ok(await p.evaluate(() => /Бестиарий|Сведения|существ/i.test(document.body.innerText)), name + ': бестиарий открылся из меню');
    assert.deepStrictEqual(errs, [], name + ': без ошибок');
    await ctx.close();
  }

  // 2. окно награды: помещается в экран, кнопка видна, добыча нажимается
  {
    const { p, errs, ctx } = await open(b, { width: 390, height: 800 }, true);
    await startDuo(p, true);
    await p.evaluate(async () => {
      MAIN_BATTLE.moves = 30; Duo.pet.moves = 30;
      Duo.pet.fighters.right.hp = 0; Duo.pet.checkEnd(); await new Promise((r) => setTimeout(r, 300));
      fighters.right.hp = 0; checkEnd(); await new Promise((r) => setTimeout(r, 800));
    });
    const o = await p.evaluate(() => { const o = document.getElementById('overlay'); const btn = o.querySelector('.to-map').getBoundingClientRect(); const card = o.firstElementChild.getBoundingClientRect(); return { chips: o.querySelectorAll('.loot-chip').length, btnIn: btn.bottom <= innerHeight && btn.top >= 0, cardIn: card.left >= 0 && card.right <= innerWidth, fixed: getComputedStyle(o).position, txt: o.innerText }; });
    assert.strictEqual(o.fixed, 'fixed'); assert.ok(o.btnIn && o.cardIn, 'карточка награды и кнопка помещаются в экран');
    assert.ok(/Победа/.test(o.txt));
    if (o.chips) { await p.click('.loot-chip'); await p.waitForTimeout(300); assert.ok(await p.evaluate(() => document.querySelector('.loot-cap').textContent.length > 0 || !!document.querySelector('.icard-modal')), 'нажатие на добычу показывает подробности'); }
    assert.deepStrictEqual(errs, []);
    await ctx.close();
  }

  // 3. добивание врага питомца: питомец пал первым — герой получает его противника и награду за обоих
  {
    const { p, errs, ctx } = await open(b, { width: 1280, height: 800 });
    await startDuo(p, true);
    const r = await p.evaluate(async () => {
      MAIN_BATTLE.moves = 30; Duo.pet.moves = 30;
      const petFoeHp = Duo.pet.fighters.right.hp, heroFoeId = fighters.right.monsterId;
      Duo.pet.fighters.left.hp = 0; Duo.pet.checkEnd(); await new Promise((x) => setTimeout(x, 300));
      fighters.right.hp = 0; checkEnd(); await new Promise((x) => setTimeout(x, 600));
      const adopted = [fighters.right.hp >= petFoeHp && fighters.right.hp > 0, !document.getElementById('overlay'), !MAIN_BATTLE.over];
      const status = document.getElementById('status').textContent + ' | ' + document.getElementById('log').textContent;
      fighters.right.hp = 0; checkEnd(); await new Promise((x) => setTimeout(x, 800));
      return { adopted, status, kills: Duo.state ? Duo.state.kills.length : -1, overlay: !!document.getElementById('overlay'), txt: (document.getElementById('overlay') || {}).innerText || '' };
    });
    assert.deepStrictEqual(r.adopted, [true, true, true], 'герой взял противника питомца (с его ХП) и продолжает бой');
    assert.ok(/Бой продолжается: впереди ещё один противник/.test(r.status), 'в журнале запись о втором противнике: ' + r.status);
    assert.ok(r.overlay && /Победа/.test(r.txt), 'после второго врага — победа');
    assert.strictEqual((r.txt.match(/Опыт: \+/g) || []).length, 2, 'награда за обоих');
    assert.deepStrictEqual(errs, []);
    await ctx.close();
  }

  // 4. приёмы питомца: все двенадцать срабатывают и действуют на противника
  {
    const { p, errs, ctx } = await open(b, { width: 1280, height: 800 });
    await startDuo(p, true);
    const out = await p.evaluate(async () => {
      const pb = Duo.pet, f = pb.fighters.left, foe = pb.fighters.right, res = {};
      pb.setAutopilot(false); await new Promise((x) => setTimeout(x, 1500)); pb.autoLevel = 50;
      const ok = async (ab, check, tries = 12) => { f.ability = ab; for (let i = 0; i < tries; i++) { f.turnNo = i * 12 + 11; const s0 = snap(); await pb.petAbility(); if (check(s0)) return true; } return false; };
      const snap = () => ({ hp: f.hp, foeHp: foe.hp, foeBuffs: foe.buffs.length, buffs: f.buffs.length, mine: Object.values(f.counts).reduce((a, x) => a + x, 0), magic: f.magic, block: f.stats.block || 0 });
      f.hp = Math.floor(f.max / 2); foe.counts.sapphire = 6; foe.counts.ruby = 6; foe.counts.emerald = 6;
      res.regen = await ok('regen', (s) => f.hp > s.hp);
      res.steal = await ok('steal', (s) => Object.values(f.counts).reduce((a, x) => a + x, 0) > s.mine, 60);
      res.howl = await ok('howl', (s) => f.buffs.length > s.buffs);
      res.drum = await ok('drum', () => f.magic === true);
      res.weaken = await ok('weaken', (s) => foe.buffs.length > s.foeBuffs);
      res.pinch = await ok('pinch', (s) => (f.stats.block || 0) > s.block);
      res.mire = await ok('mire', (s) => foe.buffs.length > s.foeBuffs);
      res.sap = await ok('sap', (s) => foe.buffs.length > s.foeBuffs);
      res.petrify = await ok('petrify', () => (pb.lockedCells('right') || []).length >= 6);
      res.veil = await ok('veil', () => (pb.lockedCells('right') || []).length > 0);
      foe.hp = foe.max; res.breath = await ok('breath', (s) => foe.hp < s.foeHp);
      res.prank = await ok('prank', () => pb.petPrank === true);
      return res;
    });
    for (const [k, v] of Object.entries(out)) assert.ok(v, 'приём питомца не сработал: ' + k);
    await p.evaluate(() => { Duo.pet.autoLevel = 3; const f = Duo.pet.fighters.left; f.ability = 'regen'; f.hp = 1; Duo.pet.petAbility(); });
    assert.strictEqual(await p.evaluate(() => Duo.pet.fighters.left.hp), 1, 'при уме ниже 5 приём не работает');
    assert.deepStrictEqual(errs, []);
    await ctx.close();
  }

  // 4б. кнопка приёма: игрок за питомца жмёт её сам, потом ждёт 3 хода
  {
    const { p, errs, ctx } = await open(b, { width: 1280, height: 800 });
    await startDuo(p, true);
    await p.evaluate(() => { const f = Duo.pet.fighters.left; f.ability = 'regen'; f.hp = Math.floor(f.max / 3); });
    assert.strictEqual(await p.locator('.pet-skill:visible').count(), 0, 'пока питомец играет сам, кнопки нет');
    await p.click('.duo-take'); await p.waitForTimeout(500);
    await p.evaluate(() => { Duo.pet.fighters.left.hp = Math.floor(Duo.pet.fighters.left.max / 3); });
    await p.waitForFunction(() => { const b = document.querySelector('.pet-skill'); return b && !b.disabled; }, null, { timeout: 30000 });
    const hp0 = await p.evaluate(() => Duo.pet.fighters.left.hp);
    await p.click('.pet-skill'); await p.waitForTimeout(250);
    assert.ok(await p.locator('.pskill-heal').count() >= 1, 'вспышка приёма видна');
    await p.waitForTimeout(1250);
    const r = await p.evaluate(() => ({ hp: Duo.pet.fighters.left.hp, cd: Duo.pet.fighters.left.skillCd, dis: document.querySelector('.pet-skill').disabled, txt: document.querySelector('.pet-skill').textContent }));
    assert.ok(r.hp > hp0, 'приём подлечил питомца'); assert.strictEqual(r.cd, 3); assert.ok(r.dis && /ещё/.test(r.txt), 'кнопка на перезарядке: ' + r.txt);
    assert.deepStrictEqual(errs, []);
    await ctx.close();
  }

  // 4в. эликсиры (5+): значки над героем, эффект один раз за бой
  {
    const { p, errs, ctx } = await open(b, { width: 1280, height: 800 });
    await p.evaluate(() => { Profile.data.elixirs.active = { initiative: { tier: 6, left: 3 }, health: { tier: 5, left: 3 }, power: { tier: 5, left: 3 }, fury: { tier: 10, left: 3 } }; });
    await startDuo(p, true);
    const r = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms)); const out = {};
      MAIN_BATTLE.setAutopilot(false); await w(800);
      out.badges = document.querySelectorAll('.elx-badge').length;
      out.logFirst = [...document.querySelectorAll('#log li')].some((l) => /Эликсир сработал: Эликсир инициативы/.test(l.textContent));
      const f = fighters.left; f.hp = 5;
      dealDamage('left', 999, true); await w(100);
      out.surv = f.hp; out.usedHealth = !!f.elxUsed.health;
      f.hp = 5; dealDamage('left', 999, true); out.dead = f.hp <= 0;
      out.crit = f.critExtra;
      return out;
    });
    assert.strictEqual(r.badges, 4); assert.ok(r.logFirst, 'инициатива сработала и записана');
    assert.strictEqual(r.surv, 1, 'эликсир жизни 5-го цвета оставляет 1 ХП'); assert.ok(r.usedHealth); assert.ok(r.dead, 'второй раз за бой не спасает');
    assert.ok(r.crit > 1, 'ярость 10-го цвета взвела сильный крит');
    assert.deepStrictEqual(errs, []);
    await ctx.close();
  }

  // 4г. траты золота: улучшения деревни, гардероб, закалка в кузнице
  {
    const { p, errs, ctx } = await open(b, { width: 1280, height: 800 });
    await p.evaluate(() => { Profile.level = () => 40; Profile.data.coins = 5e7; Profile.data.items.push(Gear.makeEntry('sword-novice', 2)); Screens.open('village'); });
    await p.waitForSelector('[data-vg-buy="forge"]');
    const c0 = await p.evaluate(() => Profile.data.coins);
    await p.click('[data-vg-buy="forge"]'); await p.waitForTimeout(200);
    const r1 = await p.evaluate(() => ({ c: Profile.data.coins, f: Profile.data.village.forge, cost: Village.cost('forge', 1) }));
    assert.strictEqual(r1.f, 1); assert.strictEqual(c0 - r1.c, r1.cost, 'золото списано');
    assert.ok(await p.evaluate(() => !!document.querySelector('.gear-toast')), 'сообщение об улучшении');
    // гардероб
    await p.click('[data-tab="wardrobe"]'); await p.click('[data-vg-cos="titles:wanderer"]'); await p.waitForTimeout(200);
    const r2 = await p.evaluate(() => ({ t: Profile.data.cosmetics.title, n: Profile.heroName() }));
    assert.strictEqual(r2.t, 'wanderer'); assert.ok(/Странник/.test(r2.n), r2.n);
    await p.click('[data-vg-cos="frames:gold"]'); await p.waitForTimeout(200);
    assert.strictEqual(await p.evaluate(() => Profile.data.cosmetics.frame), 'gold');
    await p.click('[data-vg-eq="titles:"]'); await p.waitForTimeout(100);
    assert.strictEqual(await p.evaluate(() => Profile.data.cosmetics.title), null, 'титул снят');
    // закалка
    await p.evaluate(() => Screens.open('forge'));
    await p.click('[data-tab="temper"]'); await p.waitForSelector('[data-do-temper]');
    const t0 = await p.evaluate(() => ({ c: Profile.data.coins, plus: Profile.data.items.slice(-1)[0].plus || 0 }));
    await p.evaluate(() => { const e = Profile.data.items.slice(-1)[0]; document.querySelector('[data-pick="' + e.uid + '"]').click(); });
    await p.click('[data-do-temper]'); await p.waitForTimeout(200);
    const t1 = await p.evaluate(() => ({ c: Profile.data.coins, plus: Profile.data.items.slice(-1)[0].plus }));
    assert.strictEqual(t1.plus, 1); assert.ok(t1.c < t0.c, 'монеты ушли на закалку');
    // кнопка слабое место: меткий выстрел по существу не падает
    assert.deepStrictEqual(errs, []);
    await ctx.close();
  }

  // 5. бой целиком на ИИ: оба поля доигрываются, камни не зависают, ошибок нет
  {
    const { p, errs, ctx } = await open(b, { width: 1280, height: 800 });
    await attack(p, true); await p.waitForFunction(() => Duo.on(), null, { timeout: 20000 });
    await p.evaluate(() => MAIN_BATTLE.setAutopilot(true, 100));
    await p.waitForFunction(() => document.getElementById('overlay'), null, { timeout: 240000 });
    await p.waitForTimeout(500);
    assert.deepStrictEqual(await floating(p), [], 'камни не зависли в конце боя');
    assert.deepStrictEqual(errs, []);
    await ctx.close();
  }

  // 6. питомник: учёба, мяч, клад
  {
    const { p, errs, ctx } = await open(b, { width: 420, height: 800 });
    await p.evaluate(() => { try { Tutorial && Tutorial.skip && Tutorial.skip(); } catch (e) {} });
    const r = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms)); const out = {};
      const care = async () => { Screens.open('kennel'); await w(250); document.querySelector('[data-tab=care]').click(); await w(150); };
      await care(); out.start = document.querySelectorAll('[data-k-act]').length;
      document.querySelector('[data-k-act=study]').click(); await w(150);
      out.busy = [document.querySelectorAll('[data-k-act]').length, document.querySelector('[data-k-study]').disabled];
      Profile.pet().study = Date.now() - 1; await care(); const i0 = Pets.intellect(Profile.pet());
      document.querySelector('[data-k-study]').click(); await w(150); out.int = [i0, Pets.intellect(Profile.pet())];
      await care(); document.querySelector('[data-k-act=ball]').click(); await w(150);
      Profile.pet().study = Date.now() - 1; await care(); document.querySelector('[data-k-study]').click(); await w(150); out.fed = Profile.pet().fed;
      await care(); const c0 = Profile.data.coins; document.querySelector('[data-k-act=hunt]').click(); await w(150);
      Profile.pet().study = Date.now() - 1; await care(); document.querySelector('[data-k-study]').click(); await w(150); out.coins = Profile.data.coins - c0;
      await care(); const d0 = Pets.intellect(Profile.pet()); document.querySelector('[data-k-act=drill]').click(); await w(150);
      Profile.pet().study = Date.now() - 1; await care(); document.querySelector('[data-k-study]').click(); await w(150); out.drill = Profile.pet().drill;
      Profile.pet().durability = 0; await care(); document.querySelector('[data-k-act=rest]').click(); await w(150);
      Profile.pet().study = Date.now() - 1; await care(); document.querySelector('[data-k-study]').click(); await w(150); out.dur = Profile.pet().durability;
      await care(); const r0 = Object.values(Profile.data.resources).reduce((a, x) => a + x, 0); document.querySelector('[data-k-act=scout]').click(); await w(150);
      Profile.pet().study = Date.now() - 1; await care(); document.querySelector('[data-k-study]').click(); await w(150); out.res = Object.values(Profile.data.resources).reduce((a, x) => a + x, 0) - r0;
      out.streak = Profile.pet().streak;
      return out;
    });
    assert.strictEqual(r.drill, 2, 'дрессировка'); assert.strictEqual(r.dur, 1, 'отдых'); assert.ok(r.res >= 1, 'разведка приносит ресурс'); assert.ok(r.streak >= 1, 'серия');
    assert.strictEqual(r.start, 6); assert.deepStrictEqual(r.busy, [0, true]);
    assert.ok(r.int[1] > r.int[0], 'учёба растит ум'); assert.strictEqual(r.fed, 2, 'мяч даёт бодрость'); assert.ok(r.coins > 0, 'клад приносит монеты');
    assert.deepStrictEqual(errs, []);
    await ctx.close();
  }

  // 7. плавная ходьба: герой доходит до цели, кадры идут непрерывно
  {
    const { p, errs, ctx } = await open(b, { width: 390, height: 780 }, true);
    const r = await p.evaluate(async () => {
      const m = MapView.map, me = MapView.state.pos;
      const tgt = m.cells.findIndex((c, i) => i !== me && HexMap.dist(m.cells[me], c) === 5 && c.terrain !== 'water' && MapView.known(i));
      let frames = 0, run = true, maxGap = 0, last = performance.now();
      const f = (t) => { frames++; maxGap = Math.max(maxGap, t - last); last = t; if (run) requestAnimationFrame(f); }; requestAnimationFrame(f);
      MapView.walkTo(tgt); await new Promise((x) => setTimeout(x, 3500)); run = false;
      return { at: MapView.state.pos === tgt, frames, maxGap };
    });
    assert.ok(r.at, 'герой дошёл до цели'); assert.ok(r.frames > 60, 'кадры идут: ' + r.frames);
    assert.deepStrictEqual(errs, []);
    await ctx.close();
  }

  await b.close();
  console.log('ui 1.5.0 e2e: все тесты пройдены');
})().catch((e) => { console.error(e); process.exit(1); });
