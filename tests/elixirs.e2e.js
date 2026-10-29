// 1.6.0: эликсиры в бою и плоская броня в настоящем браузере.
// Запуск: node tests/elixirs.e2e.js   (Playwright — не параллельно с другими e2e)
const { launch: launchBrowser } = require(require('path').join(__dirname, '..', 'tools', 'browser.js'));
const path = require('path');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL:', m); } };
(async () => {
  const b = await launchBrowser();

  // ---- бой ----
  {
    const ctx = await b.newContext({ locale: 'ru-RU', viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL + '#dev-fight-wolf-2-solo'); await p.waitForTimeout(2500);
    const r = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms)); const o = {};
      Profile.data.testX10 = false;
      for (const [k, t, n] of [['power', 3, 2], ['defense', 4, 1], ['health', 2, 2], ['stones', 1, 1], ['swap', 1, 2], ['cunning', 5, 1]]) Profile.addElixir(k, t, n);
      const f = fighters.left, count = (k, t) => (Profile.elixirBag().find((e) => e.kind === k && e.tier === t) || { n: 0 }).n;
      busy = false; over = false; aiming = false;
      applyLevel(); recalcStats('left'); f.elx = {}; f.elxCd = 0; f.counts = { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 };

      // 1. только в свой ход
      turnSide = 'right';
      o.enemyTurn = useElixir('power', 3); o.bagAfterRefusal = count('power', 3);
      turnSide = 'left';

      // 2. бесплатно: ход остаётся у героя, расходуется из сумки
      const mv = moves; const p0 = f.stats.power, m0 = (Profile.medalsBonus().power || 0);
      o.drankPower = useElixir('power', 3);
      o.stillMine = turnSide === 'left' && moves === mv; o.bagPower = count('power', 3);
      o.medalPow = (Profile.medalsBonus().power || 0) - m0;     // 1.7.5: за первый выпитый эликсир вида даётся медаль «Алхимик» (комплект с +3 силы) — вычитаем её вклад
      o.powerUp = f.elxPct || 0; o.powerStat = f.stats.power - p0;   // 2.0.4: 3-й цвет = +30% к суммарной Силе (не прибавка к стату)
      o.twice = useElixir('power', 3);                          // тот же вид уже действует
      // 3. Сила переживает бонусный ход (ход героя не меняется), кончается вместе с ходом
      setTurn('left'); o.keptOnExtra = f.elx.power && f.elx.power.left === 1 && f.elxPct === o.powerUp;
      setTurn('right'); o.goneAfterTurn = !f.elx.power && !f.elxPct && f.stats.power === p0 + o.medalPow;
      setTurn('left');
      // длинный эликсир: брони хватает на 10 ходов
      const d0 = f.stats.defense;
      o.drankDef = useElixir('defense', 4); o.defLeft = f.elx.defense.left; o.defUp = f.stats.defense >= d0;
      for (let i = 0; i < 3; i++) { setTurn('right'); setTurn('left'); }
      o.defLeft3 = f.elx.defense.left;

      // 4. Жизнь — цифрой; общий запас «раз в 3 хода» с Камнями
      f.hp = 10; const hp0 = f.hp, extra = Village.elixirExtra(Profile.data.village);
      o.drankHealth = useElixir('health', 2); o.healed = f.hp - hp0; o.healExpected = Math.min(f.max - hp0, Math.round(Elixirs.heal(2) * (1 + 0.05 * extra)));
      o.stonesBlocked = useElixir('stones', 1); o.why = elxWhy('stones', 1);
      o.cd = f.elxCd;
      for (let i = 0; i < 3; i++) { setTurn('right'); setTurn('left'); }
      o.cdLater = f.elxCd;
      // 5. Камни — по 4 каждого магического вида на 1-м цвете
      o.drankStones = useElixir('stones', 1);
      o.stones = ['sapphire', 'ruby', 'emerald'].map((t) => f.counts[t]); o.stonesExpected = Elixirs.stonesGain(1);
      // 6. Превращение: 5 камней самого частого вида → в самый редкий
      for (let i = 0; i < 3; i++) { setTurn('right'); setTurn('left'); }
      f.counts = { sapphire: 9, ruby: 2, emerald: 5, onyx: 0 };
      o.drankSwap = useElixir('swap', 1); o.swapped = ['sapphire', 'ruby', 'emerald'].map((t) => f.counts[t]);
      for (let i = 0; i < 3; i++) { setTurn('right'); setTurn('left'); }
      f.counts = { sapphire: 4, ruby: 4, emerald: 4, onyx: 0 };
      const before = count('swap', 1); o.swapEven = useElixir('swap', 1); o.swapEvenKept = count('swap', 1) === before; o.swapWhy = elxWhy('swap', 1);
      f.counts = { sapphire: 3, ruby: 0, emerald: 1, onyx: 0 };       // разница 3 — переносим один (половина разницы)
      o.swapSmall = useElixir('swap', 1); o.swapSmallRes = ['sapphire', 'ruby', 'emerald'].map((t) => f.counts[t]);

      // 7. Броня вычитает цифры
      f.stats.block = 0; f.stats.ricochet = 0; f.hp = f.max; f.buffs = []; f.shield = 0;
      const mon = fighters.right; mon.buffs = []; mon.stats.fury = 0; mon.stats.cunning = 0; mon.ability = null; mon.charged = false; mon.weaponPerk = null;
      const lose = (amount, def) => { f.stats.defense = def; f.hp = f.max; dealDamage('left', amount); return f.max - f.hp; };
      f.stats.defense = 10; o.armor = Combat.armorOf(f);
      o.loss0 = lose(10, 0); o.loss30 = lose(10, 10);                 // разница = число брони
      o.small0 = lose(1, 0); o.small60 = lose(1, 60);                  // слабый удар: пол 20% и не меньше 1
      o.mit = [Combat.mitigate(3, 1), Combat.mitigate(10, 100), Combat.mitigate(2, 50)];
      return o;
    });
    ok(r.enemyTurn === false && r.bagAfterRefusal === 2, 'в ход противника эликсир не пьётся и не тратится');
    ok(r.drankPower && r.stillMine && r.bagPower === 1, 'Сила пьётся бесплатно, из сумки убывает: ' + JSON.stringify([r.drankPower, r.stillMine, r.bagPower]));
    ok(r.powerUp === 30, 'Эликсир силы 3-го цвета: +30% к суммарной Силе: ' + r.powerUp);
    ok(r.twice === false, 'действующий вид повторно не пьётся');
    ok(r.keptOnExtra && r.goneAfterTurn, 'Сила живёт до конца хода (в т. ч. бонусного) и снимается при передаче хода');
    ok(r.drankDef && r.defLeft === 10 && r.defLeft3 === 7, 'Броня держится 10 своих ходов: ' + r.defLeft3);
    ok(r.drankHealth && r.healed === r.healExpected && r.healed > 0, `Жизнь лечит цифрой ${r.healed} из ${r.healExpected}`);
    ok(r.stonesBlocked === false && r.cd === 3 && /раз в/.test(r.why), 'Камни не пьются сразу после Жизни (общий запас 3 хода): ' + r.why);
    ok(r.cdLater === 0, 'через 3 хода запас восстановился: ' + r.cdLater);
    ok(r.drankStones && r.stones.every((n) => n === r.stonesExpected && n === 4), 'Камни: по 4 каждого вида на 1-м цвете: ' + r.stones);
    ok(r.drankSwap && JSON.stringify(r.swapped) === '[6,5,5]', 'Превращение: не больше половины разницы (9 и 2 → переносим 3, а не 5): ' + r.swapped);
    ok(r.swapEven === false && r.swapEvenKept && /поровну/.test(r.swapWhy), 'при равных камнях менять нечего, эликсир не тратится');
    ok(r.swapSmall && JSON.stringify(r.swapSmallRes) === '[2,1,1]', 'малая разница — переносим один камень, самый частый не опустошается: ' + r.swapSmallRes);
    ok(r.armor > 1 && r.loss0 - r.loss30 === r.armor, `Броня вычитает число, а не проценты: ${r.loss0} − ${r.armor} = ${r.loss30}`);
    ok(r.small60 >= 1 && r.small60 >= Math.ceil(r.small0 * 0.2) && r.small60 <= r.small0, `пол урона: ${r.small0} → ${r.small60}`);
    ok(JSON.stringify(r.mit) === '[2,2,1]', 'Броня 1, удар 3 → 2; пол 20% удара, не меньше 1: ' + r.mit);
    ok(errs.length === 0, 'ошибки страницы: ' + errs.join('; '));

    // меню в бою и окно сумки: «Выпить» работает только в бою; на карте кнопки неактивны
    await p.evaluate(() => { turnSide = 'left'; busy = false; });
    await p.click('[data-elxmenu]'); await p.waitForSelector('.elx-menu:not([hidden]) [data-elx]');
    const menu = await p.evaluate(() => [...document.querySelectorAll('.elx-menu [data-elx]')].length);
    ok(menu >= 1, 'меню эликсиров показывает сумку: ' + menu);
    await p.click('[data-elx-close]');
    await p.evaluate(() => Inventory.open('left')); await p.waitForTimeout(400);
    const stat = await p.evaluate(() => (document.querySelector('.stat-list') || {}).textContent || '');
    ok(/из каждого удара/.test(stat) && /к каждому удару/.test(stat) && /ХП всего/.test(stat), 'у характеристик подписано, во что они превращаются');
    await p.evaluate(() => { Inventory.close && Inventory.close(); leaveBattle(); Inventory.open('left'); }); await p.waitForTimeout(400);
    const mapDrink = await p.evaluate(() => [...document.querySelectorAll('[data-drink]')].map((x) => x.disabled));
    ok(mapDrink.length > 0 && mapDrink.every(Boolean), 'вне боя «Выпить» неактивна: ' + mapDrink);
    ok(errs.length === 0, 'ошибки страницы: ' + errs.join('; '));
    await ctx.close();
  }

  // ---- старое сохранение: Инициатива → Хитрость, действующие эликсиры сброшены ----
  {
    const ctx = await b.newContext({ locale: 'ru-RU', viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('inj')) { sessionStorage.setItem('inj', 1); localStorage.setItem('wip-lang', 'ru'); localStorage.setItem('gem-match-profile-v2', JSON.stringify({ faction: 'elf', name: 'X', elixirs: { bag: { 'initiative:3': 2, 'power:2': 1 }, active: { power: { tier: 5, left: 3 } } } })); } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(1500);
    const r = await p.evaluate(() => ({ bag: Profile.elixirBag().map((e) => `${e.kind}:${e.tier}x${e.n}`).sort(), active: Object.keys(Profile.data.elixirs.active) }));
    ok(JSON.stringify(r.bag) === '["cunning:3x2","power:2x1"]', 'Инициатива → Хитрость в сохранении: ' + r.bag);
    ok(r.active.length === 0, 'старые «действующие» эликсиры сброшены');
    ok(errs.length === 0, 'ошибки страницы: ' + errs.join('; '));
    await ctx.close();
  }

  await b.close();
  if (bad) { console.log('elixirs e2e: ошибок', bad); process.exit(1); }
  console.log('elixirs e2e: все тесты пройдены');
})();
