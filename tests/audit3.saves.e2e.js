// Полный проход, этап 7: надёжность сохранений в настоящем браузере.
// Запуск: node tests/audit3.saves.e2e.js [--strict] [--only=S05,T02]   (не параллельно с другими браузерными проверками)
// Часть А (S**): битые сохранения ВНУТРИ списков и объектов (существующий tests/save.e2e.js проверяет только неверные типы верхнего уровня).
//   Для каждого случая: страница грузится без ошибок JS → инварианты профиля → открытие всех экранов без ошибок.
// Часть Б (P**): перенос и круг «выгрузка → загрузка», старый ключ v1, __proto__.
// Часть Г (R**): проверка сохранения при загрузке и импорте (SaveGuard, 1.6.5): резерв, отчёт, импорт.
// Часть В (T**): две вкладки, закрытие вкладки, переполненное хранилище.
// Каждый пункт печатает ok/OPEN/FAIL. OPEN = воспроизводится недостаток (описан в NOTES.md); --strict делает OPEN ошибкой.
// Только тестовые копии: каждый случай идёт в новом контексте браузера со своим localStorage — настоящие сохранения не затрагиваются.
const path = require('path');
const { launch } = require('../tools/browser.js');
const { installBot } = require('../tools/auditlib.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const STRICT = process.argv.includes('--strict');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
let okN = 0, openN = 0, failN = 0;
const ok = (id, t, c, d) => { if (c) { okN++; console.log(`  ok    ${id}  ${t}`); } else { failN++; console.log(`  FAIL  ${id}  ${t}${d ? ' — ' + d : ''}`); } };
const open = (id, t, safe, d) => { if (safe) { okN++; console.log(`  ok    ${id}  ${t}`); } else { openN++; console.log(`  OPEN  ${id}  ${t}${d ? ' — ' + d : ''}`); } };
const want = (id) => !ONLY.length || ONLY.some((o) => id.startsWith(o));

// Исправный сохранённый профиль (минимум полей: недостающее достраивается значениями нового профиля).
const BASE = () => ({
  faction: 'dwarf', gender: 'm', name: 'Тест', coins: 1000, xp: 0, wins: 3,
  items: [
    { uid: 'u1', id: 'sword-novice', tier: 1 }, { uid: 'u2', id: 'shield-wood', tier: 1 }, { uid: 'u3', id: 'leather-head', tier: 1 },
    { uid: 'u4', id: 'leather-chest', tier: 1 }, { uid: 'u5', id: 'leather-arms', tier: 1 }, { uid: 'u6', id: 'leather-legs', tier: 1 },
  ],
  loadout: { main: 'u1', off: 'u2', head: 'u3', chest: 'u4', arms: 'u5', legs: 'u6' },
  tutorial: { done: true }, ammoStart: true,
});
const withItem = (o, e) => { o.items.push(e); return o; };

// Случаи части А: [id, название, функция, что именно считать допустимым исходом]
const CASES = [
  ['S01', 'items содержит null', (o) => { o.items.push(null); return o; }],
  ['S02', 'items: вещь с неизвестным id', (o) => withItem(o, { uid: 'x1', id: 'no-such-item', tier: 1 })],
  ['S03', 'items: надета вещь с неизвестным id', (o) => { withItem(o, { uid: 'x1', id: 'no-such-item', tier: 1 }); o.loadout.amulet = 'x1'; return o; }],
  ['S04', 'items: цвет вещи 99 / -3 / "x"', (o) => { o.items.push({ uid: 'x1', id: 'sword-novice', tier: 99 }, { uid: 'x2', id: 'sword-novice', tier: -3 }, { uid: 'x3', id: 'sword-novice', tier: 'x' }); return o; }],
  ['S05', 'items: два одинаковых uid', (o) => { o.items.push({ uid: 'u1', id: 'sword-novice', tier: 1 }); return o; }],
  ['S06', 'items: вещь без uid', (o) => { o.items.push({ id: 'sword-novice', tier: 1 }); return o; }],
  ['S07', 'loadout: uid несуществующей вещи', (o) => { o.loadout.head = 'ghost'; return o; }],
  ['S08', 'loadout: щит в ячейке «main»', (o) => { o.loadout.main = 'u2'; return o; }],
  ['S09', 'loadout: одна вещь в двух ячейках', (o) => { o.loadout.head = 'u1'; return o; }],
  ['S10', 'loadout: лишний ключ и значение-число', (o) => { o.loadout.zzz = 'u1'; o.loadout.legs = 5; return o; }],
  ['S11', 'resources: мусорные значения и ключи', (o) => { o.resources = { 'ore:1': 'abc', 'ore:2': -5, 'zzz:9': 3, 'hide:1': null, 'fang:1': 1e300 }; return o; }],
  ['S12', 'backpack: отрицательные и огромные числа, чужие ключи', (o) => { o.backpack = { potion: -3, bogus: 5, elixir: 1e300 }; return o; }],
  ['S13', 'xp отрицательный', (o) => { o.xp = -100; return o; }],
  ['S14', 'xp = 1e30 (за пределом шкалы)', (o) => { o.xp = 1e30; return o; }],
  ['S15', 'coins отрицательные / дробные', (o) => { o.coins = -50.5; return o; }],
  ['S16', 'map: пустой объект', (o) => { o.map = {}; return o; }],
  ['S17', 'map: части неверного типа', (o) => { o.map = { seed: 'x', pos: 'y', fog: 5, spawns: 'z', state: null }; return o; }],
  ['S18', 'shop: stock = [null]', (o) => { o.shop = { top: 1, stock: [null] }; return o; }],
  ['S19', 'shop: stock — вещи с неизвестным id', (o) => { o.shop = { top: 1, stock: [{ uid: 's1', id: 'nope', tier: 1 }] }; return o; }],
  ['S20', 'market: lots = [null]', (o) => { o.market = { lots: [null], log: [] }; return o; }],
  ['S21', 'market: лот без вещи/ресурса', (o) => { o.market = { lots: [{ kind: 'item', price: 5 }, { kind: 'res' }], log: [null] }; return o; }],
  ['S22', 'pet: неизвестный вид', (o) => { o.pet = { speciesId: 'dragonfly9', tier: 1, durability: 5, maxDurability: 5 }; return o; }],
  ['S23', 'pet: durability строкой', (o) => { o.pet = { speciesId: 'cat', tier: 1, durability: 'x', maxDurability: null }; return o; }],
  ['S24', 'medals.earned: null и запись без id', (o) => { o.medals = { earned: [null, { tier: 1 }, { id: 'zzz', tier: 1 }], fiveStreaks: 0, strikeKills: 0 }; return o; }],
  ['S25', 'bestiary: значения null / неверные', (o) => { o.bestiary = { rat: null, wolf: 5, ghost: { wins: 'x', tier: 99 } }; return o; }],
  ['S26', 'quests/accepted/daily неверного вида', (o) => { o.quests = []; o.accepted = 'a'; o.daily = { date: 5, wins: 'x' }; return o; }],
  ['S27', 'village: уровни -1 и 99', (o) => { o.village = { hall: -1, mill: 99, mine: 'x' }; return o; }],
  ['S28', 'elixirs.bag / cosmetics неверных видов', (o) => { o.elixirs = { active: null, bag: 5 }; o.cosmetics = { titles: 'x', frames: null }; return o; }],
  ['S29', 'story.shards = null; ammo со строками', (o) => { o.story = { shards: null }; o.ammo = { bolt: 'many', arrow: -4 }; return o; }],
  ['S30', 'runeBag/eggs неверных видов', (o) => { o.runeBag = []; o.eggs = { dragon: 'x' }; return o; }],
];

(async () => {
  const b = await launch();
  const ctxOpts = { viewport: { width: 1280, height: 800 }, locale: 'ru-RU' };
  const boot = async (inject, { wait = 2600, hash = '' } = {}) => {
    const ctx = await b.newContext(ctxOpts);
    await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('inj')) { sessionStorage.setItem('inj', '1'); localStorage.setItem('wip-lang', 'ru'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); } } catch (e) {} }, inject || {});
    const p = await ctx.newPage(); p.__errs = [];
    p.on('pageerror', (e) => p.__errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') p.__errs.push('console: ' + m.text()); });
    await p.goto(URL + hash); await p.waitForTimeout(wait);
    return { p, ctx };
  };
  const SCREENS_TO_OPEN = ['shop', 'forge', 'best', 'tavern', 'mill', 'junker', 'library', 'kennel', 'alchemist', 'market', 'village', 'arena', 'valor'];
  const openAll = (p) => p.evaluate(async (names) => {
    const w = (ms) => new Promise((x) => setTimeout(x, ms)); const fails = [];
    for (const n of names) { try { Screens.open(n); await w(150); Screens.close(); await w(40); } catch (e) { fails.push(n + ': ' + e.message); } }
    try { Inventory.open('left'); await w(150); Inventory.close && Inventory.close(); } catch (e) { fails.push('inventory: ' + e.message); }
    try { Inventory.open('left', { armory: true }); await w(150); Inventory.close && Inventory.close(); } catch (e) { fails.push('armory: ' + e.message); }
    return fails;
  }, SCREENS_TO_OPEN);

  /* ---------------- Часть А: вложенные повреждения ---------------- */
  console.log('A. битые данные внутри сохранения (загрузка → инварианты → все экраны)');
  for (const [id, title, mut] of CASES) {
    if (!want(id)) continue;
    const save = mut(BASE());
    const { p, ctx } = await boot({ 'gem-match-profile-v2': JSON.stringify(save) });
    let loaded = false, inv = [], fails = [];
    try {
      loaded = await p.evaluate(() => typeof Profile !== 'undefined' && !!Profile.data && Array.isArray(Profile.data.items));
      if (loaded) {
        await p.evaluate(installBot);
        inv = await p.evaluate(() => window.__A.profileInv());
        fails = await openAll(p);
      }
    } catch (e) { fails.push('evaluate: ' + e.message); }
    const loadErrs = p.__errs.slice();
    const good = loaded && !loadErrs.length && !fails.length;
    open(id, title + ' → страница грузится и экраны открываются', good, !loaded ? 'Profile не создан (игра не запустилась)' : (loadErrs[0] || fails[0] || '').slice(0, 160));
    if (loaded) open(id + 'i', title + ' → инварианты профиля после загрузки', inv.length === 0, inv.slice(0, 3).join('; '));
    await ctx.close();
  }

  /* ---------------- Часть Б: перенос, старый ключ, __proto__ ---------------- */
  console.log('B. выгрузка/загрузка, старый ключ, __proto__');
  if (want('P01')) {
    // Круг: профиль со сделанным прогрессом → exportSave → в чистый контекст importSave → все поля равны
    const { p, ctx } = await boot({ 'gem-match-profile-v2': JSON.stringify({ ...BASE(), coins: 777, xp: 4321, wins: 42, resources: { 'ore:1': 5 }, backpack: { potion: 3 } }) });
    const exp = await p.evaluate(() => Profile.exportSave());
    await ctx.close();
    const c2 = await boot({});
    const r = await c2.p.evaluate((txt) => { const okImp = Profile.importSave(txt); const now = Profile.exportSave(); return { okImp, same: now === txt, coins: Profile.data.coins, xp: Profile.data.xp }; }, exp);
    ok('P01', 'выгрузка → загрузка в чистой вкладке возвращает тот же файл', r.okImp && r.same, JSON.stringify(r));
    // после перезагрузки страницы то же самое хранится
    await c2.p.reload(); await c2.p.waitForTimeout(2200);
    const same2 = await c2.p.evaluate((txt) => Profile.exportSave() === txt, exp);
    ok('P01b', 'после перезагрузки страницы профиль тот же', same2);
    await c2.ctx.close();
  }
  if (want('P02')) {
    // Импорт файла, в котором уровень героя 1, а надеты вещи 10-го цвета (H6): играбельно ли?
    const { p, ctx } = await boot({ 'gem-match-profile-v2': JSON.stringify(BASE()) });
    const r = await p.evaluate(() => {
      const o = JSON.parse(Profile.exportSave());
      o.items.push({ uid: 'hi', id: 'sword-novice', tier: 10 }); o.loadout.main = 'hi'; o.xp = 0;
      Profile.importSave(JSON.stringify(o));
      const it = Gear.item(Profile.data.items.find((x) => x.uid === Profile.data.loadout.main) || {});
      return { worn: Profile.data.loadout.main, level: Profile.level(), wt: it && it.wt };
    });
    open('P02', 'импорт: вещь выше уровня героя не остаётся надетой', r.worn !== 'hi', `надето ${r.worn}, уровень ${r.level}, нужен цвет ${r.wt}`);
    await ctx.close();
  }
  if (want('P03')) {
    const { p, ctx } = await boot({ 'gem-match-profile': JSON.stringify({ wins: 10, backpack: { potion: 7 } }) });
    const r = await p.evaluate(() => ({ wins: Profile.data.wins, coins: Profile.data.coins, potion: Profile.data.backpack.potion, errs: 0 }));
    ok('P03', 'сохранение первой версии (ключ gem-match-profile) переносится', r.wins === 10 && r.coins === 1500 && r.potion === 7 && !p.__errs.length, JSON.stringify(r) + ' ' + (p.__errs[0] || ''));
    await ctx.close();
  }
  if (want('P04')) {
    const proto = '{"__proto__":{"polluted":1},"coins":5,"items":[],"loadout":{"__proto__":{"polluted2":1}},"constructor":{"prototype":{"polluted3":1}}}';
    const { p, ctx } = await boot({ 'gem-match-profile-v2': proto });
    const r = await p.evaluate(() => { const before = ({}).polluted || ({}).polluted2 || ({}).polluted3; const imp = Profile.importSave('{"__proto__":{"polluted4":1},"coins":5,"items":[],"loadout":{"__proto__":{"polluted5":1}}}'); return { before: !!before, after: !!(({}).polluted4 || ({}).polluted5), imp }; });
    ok('P04', '__proto__ / constructor.prototype в сохранении не загрязняют Object.prototype', !r.before && !r.after, JSON.stringify(r));
    ok('P04b', '__proto__: без ошибок JS', !p.__errs.length, p.__errs[0]);
    await ctx.close();
  }
  if (want('P05')) {
    // Большое сохранение: время загрузки и сохранения
    const big = BASE(); for (let i = 0; i < 20000; i++) big.items.push({ uid: 'b' + i, id: 'sword-novice', tier: 1 + (i % 10) });
    const raw = JSON.stringify(big);
    const t0 = Date.now();
    const { p, ctx } = await boot({ 'gem-match-profile-v2': raw }, { wait: 1500 });
    const r = await p.evaluate(() => { const t = performance.now(); Profile.save(); return { ms: Math.round(performance.now() - t), items: Profile.data.items.length }; });
    ok('P05', `сохранение с 20 000 вещей (${(raw.length / 1048576).toFixed(1)} МБ): грузится и сохраняется за разумное время`, r.items >= 20000 && r.ms < 1500 && !p.__errs.length, `save=${r.ms} мс, items=${r.items}, ${p.__errs[0] || ''}`);
    await ctx.close();
  }

  /* ---------------- Часть Г (R**): проверка сохранения при загрузке и импорте (1.6.5, saveguard.js) ---------------- */
  console.log('Г. SaveGuard: резерв, отчёт, импорт');
  if (want('R01')) {
    // сохранение с надетой неизвестной вещью: игра запускается, вещь убрана, исходный текст лежит в резервном ключе
    const save = BASE(); save.items = [...save.items, { uid: 'ghost1', id: 'no-such-item', tier: 1 }]; save.loadout = { ...save.loadout, head: 'ghost1' };
    const raw = JSON.stringify(save);
    const { p, ctx } = await boot({ 'gem-match-profile-v2': raw });
    const r = await p.evaluate(() => ({ has: typeof Profile !== 'undefined' && !!Profile.data, fixes: Profile.saveFixes.length, bak: localStorage.getItem('gem-match-profile-v2-bak'), unknown: Profile.data.items.some((i) => i.id === 'no-such-item'), head: Profile.data.loadout.head }));
    ok('R01', 'неизвестная надетая вещь: игра запускается, вещь убрана, снято с ячейки', r.has && !r.unknown && !r.head, JSON.stringify({ ...r, bak: r.bak ? r.bak.length : null }));
    ok('R01b', 'при починке исходный текст сохранения лежит в резервном ключе', r.fixes > 0 && r.bak === raw, `fixes=${r.fixes}, bak ${r.bak ? r.bak.length : 'нет'} из ${raw.length}`);
    ok('R01c', 'без ошибок JS', !p.__errs.length, p.__errs[0]);
    await ctx.close();
  }
  if (want('R02')) {
    // исправное сохранение: никаких «починок» и резерва
    const raw = JSON.stringify({ ...BASE(), coins: 4321, resources: { 'ore:1': 5 } });
    const { p, ctx } = await boot({ 'gem-match-profile-v2': raw });
    const r = await p.evaluate(() => ({ fixes: Profile.saveFixes.length, bak: localStorage.getItem('gem-match-profile-v2-bak'), coins: Profile.data.coins }));
    ok('R02', 'исправное сохранение: ничего не чинится, резервный ключ не создаётся', r.fixes === 0 && r.bak === null && r.coins === 4321, JSON.stringify(r));
    await ctx.close();
  }
  if (want('R03')) {
    // импорт файла с неизвестной вещью: принимается, вещь убрана; нечитаемый файл — отказ без изменений
    const { p, ctx } = await boot({});
    const r = await p.evaluate(() => {
      const base = JSON.parse(Profile.exportSave());
      base.items.push({ uid: 'ghost1', id: 'no-such-item', tier: 2 }); base.loadout.head = 'ghost1'; base.coins = 999;
      const ok1 = Profile.importSave(JSON.stringify(base));
      const o = { ok1, unknown: Profile.data.items.some((i) => i.id === 'no-such-item'), coins: Profile.data.coins, head: Profile.data.loadout.head };
      o.badJson = Profile.importSave('{not json'); o.badShape = Profile.importSave('[]'); o.nullItems = Profile.importSave(JSON.stringify({ coins: 5, items: [null, 5, 'x'], loadout: {} }));
      o.itemsClean = Profile.data.items.every((i) => i && typeof i.id === 'string');
      return o;
    });
    ok('R03', 'импорт файла с неизвестной вещью: принят, вещь убрана', r.ok1 && !r.unknown && r.coins === 999 && !r.head, JSON.stringify(r));
    ok('R03b', 'нечитаемый файл и файл не той формы: отказ', r.badJson === false && r.badShape === false, JSON.stringify({ badJson: r.badJson, badShape: r.badShape }));
    ok('R03c', 'принятый файл с мусором в списке вещей: мусор убран', r.itemsClean, JSON.stringify(r));
    ok('R03d', 'без ошибок JS', !p.__errs.length, p.__errs[0]);
    await ctx.close();
  }

  /* ---------------- Часть В: вкладки, закрытие, переполнение ---------------- */
  console.log('C. две вкладки, закрытие вкладки, переполненное хранилище');
  if (want('T01')) {
    // Две вкладки одного профиля. Во второй тратим монеты и тратим предмет; затем первая «старая» вкладка сохраняется — перезаписывает ли она новое?
    const ctx = await b.newContext(ctxOpts);
    await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('inj')) { sessionStorage.setItem('inj', '1'); localStorage.setItem('wip-lang', 'ru'); if (!localStorage.getItem('gem-match-profile-v2')) localStorage.setItem('gem-match-profile-v2', s); } } catch (e) {} }, JSON.stringify(BASE()));
    const A = await ctx.newPage(), B = await ctx.newPage(); A.__errs = []; B.__errs = [];
    A.on('pageerror', (e) => A.__errs.push(e.message)); B.on('pageerror', (e) => B.__errs.push(e.message));
    await A.goto(URL); await A.waitForTimeout(2000);
    await B.goto(URL); await B.waitForTimeout(2000);
    // В B: покупаем/добываем — тратим 900 монет и получаем уникальную вещь, сохраняем
    await B.evaluate(() => { Profile.spend(900); Profile.addItem(Gear.makeEntry('sword-novice', 2)); Profile.save(); });
    // В A (старая, не знает о B): просто сохраняется (например, после боя)
    await A.evaluate(() => { Profile.addCoins(1); Profile.save(); });
    const final = await A.evaluate(() => JSON.parse(localStorage.getItem('gem-match-profile-v2')));
    const hasNewItem = final.items.some((e) => e.tier === 2), coins = final.coins;
    open('T01', 'две вкладки: «старая» вкладка не затирает результаты работы второй', hasNewItem && coins === 101, `в файле: вещь цвета 2 ${hasNewItem ? 'есть' : 'ПОТЕРЯНА'}, монет ${coins} (ожидалось 101); последняя запись выигрывает`);
    // Монеты «воскресают»: в A всё ещё 1001; потратили в B 900, A перезаписал → потраченное вернулось
    const aCoins = await A.evaluate(() => Profile.data.coins);
    open('T01b', 'две вкладки: потраченные во второй вкладке монеты не возвращаются', coins < 1000, `после сохранения в старой вкладке в файле ${coins} (вкладка A думала, что у неё ${aCoins})`);
    await ctx.close();
  }
  if (want('T02')) {
    // Закрытие вкладки после покупки/продажи: данные уже в localStorage?
    const { p, ctx } = await boot({ 'gem-match-profile-v2': JSON.stringify(BASE()) });
    const r = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms));
      Profile.addCoins(5000); Screens.openShop(); await w(200);
      const had = Profile.data.items.length, bt = document.querySelector('[data-buy-cat]:not([disabled])'); bt && bt.click(); await w(150);
      const buy = Profile.data.items.length === had + 1;
      const raw = JSON.parse(localStorage.getItem('gem-match-profile-v2'));
      return { coinsMem: Profile.data.coins, coinsDisk: raw.coins, itemsMem: Profile.data.items.length, itemsDisk: raw.items.length, buy: !!buy };
    });
    ok('T02', 'после покупки в лавке файл на диске совпадает с памятью (закрыть вкладку безопасно)', r.coinsMem === r.coinsDisk && r.itemsMem === r.itemsDisk, JSON.stringify(r));
    await ctx.close();
  }
  // T03 (расходник, использованный в бою, сохраняется сразу: game.js useConsumable → `bag[kind]--; Profile.save()`; закрытие вкладки его не возвращает) — проверено чтением кода, не браузером.
  if (want('T04')) {
    // Хранилище переполнится ПОСЛЕ старта (storageOk был true): предупреждает ли игра, что прогресс не сохраняется?
    const { p, ctx } = await boot({ 'gem-match-profile-v2': JSON.stringify(BASE()) });
    const r = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms));
      const old = Storage.prototype.setItem; let thrown = 0;
      Storage.prototype.setItem = function () { thrown++; const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
      Profile.addCoins(123); Profile.save(); await w(300);
      const toast = (document.getElementById('map-toast') || {}).textContent || '';
      const modal = !!document.querySelector('.modal');
      Storage.prototype.setItem = old;
      return { thrown, storageOk: Profile.storageOk, toast: toast.slice(0, 80), modal, coins: Profile.data.coins };
    });
    open('T04', 'хранилище переполнилось уже во время игры: игрок получает предупреждение', /сохран/i.test(r.toast) || r.modal, `Profile.save() молча проглотил ${r.thrown} ошибку(и) записи, storageOk=${r.storageOk}, тост «${r.toast}»`);
    ok('T04b', 'при переполнении игра продолжает работать (без ошибок JS)', !p.__errs.length, p.__errs[0]);
    await ctx.close();
  }
  if (want('T05')) {
    // Хранилище работает, но в нём чужой мусор (много ключей) — игра всё равно сохраняет свой ключ? Проверяем, что важные ключи не пересекаются
    const { p, ctx } = await boot({ 'gem-match-profile-v2': JSON.stringify(BASE()) });
    const keys = await p.evaluate(() => { Profile.save(); return Object.keys(localStorage); });
    console.log('  info  T05  ключи localStorage после игры:', keys.join(', '));
    ok('T05', 'в localStorage нет лишнего (только ключи игры)', keys.every((k) => /^(gem-match|wip-)/.test(k)), keys.join(','));
    await ctx.close();
  }
  if (want('T06')) {
    // Часы: игрок перевёл время назад/вперёд. Появление/возрождение существ на карте и торговые ряды опираются на Date.now()
    const { p, ctx } = await boot({ 'gem-match-profile-v2': JSON.stringify({ ...BASE(), market: { lots: [{ kind: 'res', key: 'ore:1', n: 1, price: 5, listedAt: Date.now() - 3600e3, entry: null }], log: [] } }) });
    const r = await p.evaluate(() => { const lots = Profile.data.market.lots.length; return { lots, now: Date.now() }; });
    console.log('  info  T06  (часы) — лот сохранён, ожидание считается по Date.now:', JSON.stringify(r));
    await ctx.close();
  }

  if (want('T07')) {
    // H7: бой не фиксируется в сохранении. Закрытие вкладки посреди боя в логове: «проигрыш» (конец вылазки + 60 мин ожидания) не наступает.
    const { p, ctx } = await boot({ 'gem-match-profile-v2': JSON.stringify({ ...BASE(), xp: 60000 }) });
    const r1 = await p.evaluate(async () => {
      const w = (ms) => new Promise((x) => setTimeout(x, ms));
      const l = MapView.world.lairs[0]; if (!l) return { noLair: true };
      MapView.showLair(l); await w(200);
      const btn = document.querySelector('[data-lair="enter"]'); if (!btn) return { noBtn: true };
      btn.click(); await w(1800);
      const raw = JSON.parse(localStorage.getItem('gem-match-profile-v2'));
      return { id: l.id, lair: raw.lair, cd: (raw.map && raw.map.lairCd && raw.map.lairCd[l.id]) || 0, inBattle: MapView.inBattle };
    });
    if (r1.noLair || r1.noBtn) console.log('  skip  T07  нет логова/кнопки в этом мире', JSON.stringify(r1));
    else {
      await p.reload(); await p.waitForTimeout(2500);
      const r2 = await p.evaluate((id) => { const L = Profile.data.lair; return { lair: L, cd: (Profile.data.map.lairCd && Profile.data.map.lairCd[id]) || 0 }; }, r1.id);
      console.log('  info  T07  в бою:', JSON.stringify({ lair: r1.lair, inBattle: r1.inBattle }), '→ после закрытия вкладки:', JSON.stringify(r2));
      open('T07', 'закрытие вкладки в бою логова приравнивается к проигрышу (вылазка закончена, ожидание началось)', !r2.lair && r2.cd > Date.now(), `вылазка продолжается (бой ${r2.lair && r2.lair.step} из ${r2.lair && r2.lair.len}), ожидания нет: можно переиграть этот бой без последствий`);
    }
    await ctx.close();
  }

  await b.close();
  console.log(`\nсохранения: ok ${okN}, OPEN ${openN}, FAIL ${failN}`);
  process.exit(failN || (STRICT && openN) ? 1 : 0);
})();
