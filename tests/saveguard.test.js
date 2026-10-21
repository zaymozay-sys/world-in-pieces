// 1.6.5: проверка и починка сохранения (js/saveguard.js). Запуск: node tests/saveguard.test.js [--seed=1] [--n=3000]
// Случаи S01–S30 повторяют повреждения из tests/audit3.saves.e2e.js (полный проход 1.6.4), но на уровне данных — быстро и воспроизводимо.
const assert = require('assert');
global.window = undefined;
require('../js/i18n.js');
global.Tiers = require('../js/tiers.js'); global.Gear = require('../js/items.js'); global.Balance = require('../js/balance.js'); global.Hero = require('../js/hero.js');
global.Bestiary = require('../js/bestiary.js'); global.Elixirs = require('../js/elixirs.js'); global.Ammo = require('../js/ammo.js'); global.Runes = require('../js/runes.js'); global.Pets = require('../js/pets.js');
const SaveGuard = require('../js/saveguard.js');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
let seed = Number(arg('seed', 1)) >>> 0;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

// Исправное «богатое» сохранение: у каждого раздела есть содержимое, чтобы проверить «исправное не трогаем».
const GOOD = () => ({
  faction: 'dwarf', gender: 'm', name: 'Тест', coins: 12345, xp: 4000, wins: 77,
  items: [
    { uid: 'u1', id: 'sword-novice', tier: 1 }, { uid: 'u2', id: 'shield-wood', tier: 1 }, { uid: 'u3', id: 'leather-head', tier: 2, plus: 1 },
    { uid: 'u4', id: 'leather-chest', tier: 3, fit: true }, { uid: 'u5', id: 'leather-arms', tier: 1, runes: [] }, { uid: 'u6', id: 'leather-legs', tier: 1 }, { uid: 'u7', id: 'sword-novice', tier: 4 },
  ],
  loadout: Object.assign(Gear.emptyLoadout(), { main: 'u1', off: 'u2', head: 'u3', chest: 'u4', arms: 'u5', legs: 'u6' }),
  resources: { 'ore:1': 5, 'hide:3': 2, 'crystal:10': 1 }, backpack: { potion: 3, elixir: 1 }, elixirs: { active: {}, bag: { 'cunning:5': 2 } },
  ammo: { bolt: 12 }, runeBag: { [Object.keys(Runes.CATALOG)[0]]: 2 }, eggs: { dragon: 1 }, incubator: { egg: 'griffin', left: 3 },
  shop: { top: 2, stock: [{ uid: 's1', id: 'sword-novice', tier: 2 }, { uid: 's2', id: 'shield-wood', tier: 1 }] },
  market: { lots: [{ id: 'lotA', kind: 'res', key: 'ore:1', n: 3, price: 40, fair: 20, listedAt: 1, checkedAt: 1, entry: null }, { id: 'lotB', kind: 'item', key: null, n: 1, price: 90, fair: 50, listedAt: 1, checkedAt: 1, entry: { uid: 'm1', id: 'sword-novice', tier: 2 } }], log: [{ at: 1, name: 'x', n: 1, price: 5 }] },
  pet: { speciesId: 'wolf', tier: 2, durability: 2, maxDurability: 3 }, petChoice: 'tamed',
  medals: { earned: [{ id: 'kill:rat', tier: 1 }], fiveStreaks: 2, strikeKills: 1 },
  bestiary: { rat: { wins: 5, tier: 2 }, wolf: { wins: 1, tier: 1 } },
});

// Инварианты, которые обязаны выполняться после normalize на ЛЮБОМ входе.
function check(d, tag) {
  const bad = (m) => assert.fail(tag + ': ' + m);
  if (!isInt(d.coins) || d.coins < 0) bad('coins=' + d.coins);
  if (!Number.isFinite(d.xp) || d.xp < 0) bad('xp=' + d.xp);
  if (!isInt(d.wins) || d.wins < 0) bad('wins=' + d.wins);
  assert(Array.isArray(d.items), tag + ': items не массив');
  const uids = new Set();
  for (const e of d.items) {
    if (!isObj(e) || typeof e.uid !== 'string' || !e.uid) bad('вещь без uid');
    if (uids.has(e.uid)) bad('дубль uid ' + e.uid);
    uids.add(e.uid);
    if (!Gear.item(e)) bad('неизвестная вещь ' + e.id);
    if (!isInt(e.tier) || e.tier < 1 || e.tier > 10) bad('цвет ' + e.tier);
  }
  const used = new Set();
  assert(isObj(d.loadout), tag + ': loadout не объект');
  for (const k of Object.keys(d.loadout)) if (!Gear.SLOTS.includes(k)) bad('лишняя ячейка ' + k);
  for (const s of Gear.SLOTS) {
    const u = d.loadout[s]; if (u === null) continue;
    if (typeof u !== 'string' || !uids.has(u)) bad('надета несуществующая ' + s);
    if (used.has(u)) bad('одна вещь в двух ячейках ' + u);
    used.add(u);
    if (!Gear.fits(s, Gear.item(d.items.find((i) => i.uid === u)).type)) bad('не подходит ячейке ' + s);
  }
  const cnts = { resources: d.resources, backpack: d.backpack, elixirs: d.elixirs.bag, ammo: d.ammo, runeBag: d.runeBag, eggs: d.eggs || {} };
  for (const [n, o] of Object.entries(cnts)) { assert(isObj(o), tag + ': ' + n + ' не объект'); for (const [k, v] of Object.entries(o)) if (!isInt(v) || v < 0) bad(n + '.' + k + '=' + v); }   // 1.6.5: нулевой остаток допустим (израсходованный расходник)
  for (const k of Object.keys(d.resources)) { const [kind, t] = k.split(':'); if (!Bestiary.RESOURCES[kind] || !(Number(t) >= 1 && Number(t) <= 10)) bad('ресурс ' + k); }
  for (const k of Object.keys(d.backpack)) if (!Gear.CONSUMABLES[k]) bad('расходник ' + k);
  if (d.shop !== null && d.shop !== undefined) { assert(isObj(d.shop) && Array.isArray(d.shop.stock) && d.shop.stock.every((e) => Gear.item(e)), tag + ': лавка'); }
  assert(isObj(d.market) && Array.isArray(d.market.lots) && Array.isArray(d.market.log), tag + ': ряды');
  for (const l of d.market.lots) {
    assert(typeof l.id === 'string' && Number.isFinite(l.price) && l.price > 0 && Number.isFinite(l.fair) && l.n >= 1 && Number.isFinite(l.checkedAt), tag + ': лот');
    if (l.kind === 'item') assert(Gear.item(l.entry), tag + ': лот-вещь');
  }
  if (d.pet) { assert(Bestiary.MONSTERS[Pets.donorOf(d.pet.speciesId)], tag + ': питомец'); assert(Number.isFinite(d.pet.durability) && d.pet.durability >= 0 && d.pet.durability <= d.pet.maxDurability, tag + ': прочность питомца'); }
  if (d.petChoice === 'tamed') assert(d.pet, tag + ': petChoice без питомца');
  assert(Array.isArray(d.medals.earned) && d.medals.earned.every((m) => isObj(m) && typeof m.id === 'string'), tag + ': медали');
  for (const [id, r] of Object.entries(d.bestiary || {})) assert(Bestiary.MONSTERS[id] && isInt(r.wins) && r.wins >= 0 && r.tier >= 1 && r.tier <= 10, tag + ': бестиарий ' + id);
}

// 0. Исправное сохранение остаётся БЕЗ ИЗМЕНЕНИЙ, notes пуст.
{
  const g = GOOD(), before = clone(g), r = SaveGuard.normalize(g);
  assert.deepStrictEqual(r.notes, [], 'на исправном сохранении были правки: ' + r.notes.join('; '));
  assert.deepStrictEqual(g, before, 'исправное сохранение изменилось');
  check(g, 'GOOD');
}

// 1. Случаи S01–S30 (то же, что в e2e): после normalize инварианты выполнены, второй проход ничего не меняет.
const CASES = {
  S01: (o) => o.items.push(null), S02: (o) => o.items.push({ uid: 'x1', id: 'no-such-item', tier: 1 }),
  S03: (o) => { o.items.push({ uid: 'x1', id: 'no-such-item', tier: 1 }); o.loadout.amulet = 'x1'; },
  S04: (o) => o.items.push({ uid: 'x1', id: 'sword-novice', tier: 99 }, { uid: 'x2', id: 'sword-novice', tier: -3 }, { uid: 'x3', id: 'sword-novice', tier: 'x' }),
  S05: (o) => o.items.push({ uid: 'u1', id: 'sword-novice', tier: 1 }), S06: (o) => o.items.push({ id: 'sword-novice', tier: 1 }),
  S07: (o) => { o.loadout.head = 'ghost'; }, S08: (o) => { o.loadout.main = 'u2'; }, S09: (o) => { o.loadout.head = 'u1'; }, S10: (o) => { o.loadout.zzz = 'u1'; o.loadout.legs = 5; },
  S11: (o) => { o.resources = { 'ore:1': 'abc', 'ore:2': -5, 'zzz:9': 3, 'hide:1': null, 'fang:1': 1e300, 'ore:11': 2, 'ore:1.5': 1 }; },
  S12: (o) => { o.backpack = { potion: -3, bogus: 5, elixir: 1e300 }; },
  S13: (o) => { o.xp = -100; }, S15: (o) => { o.coins = -50.5; }, S15b: (o) => { o.coins = 12.7; },
  S18: (o) => { o.shop = { top: 1, stock: [null] }; }, S19: (o) => { o.shop = { top: 1, stock: [{ uid: 's1', id: 'nope', tier: 1 }] }; },
  S20: (o) => { o.market = { lots: [null], log: [] }; }, S21: (o) => { o.market = { lots: [{ kind: 'item', price: 5 }, { kind: 'res' }], log: [null] }; },
  S22: (o) => { o.pet = { speciesId: 'dragonfly9', tier: 1, durability: 5, maxDurability: 5 }; },
  S23: (o) => { o.pet = { speciesId: 'wolf', tier: 1, durability: 'x', maxDurability: null }; },
  S24: (o) => { o.medals = { earned: [null, { tier: 1 }, { id: 'zzz', tier: 1 }], fiveStreaks: 0, strikeKills: 0 }; },
  S25: (o) => { o.bestiary = { rat: null, wolf: 5, ghost: { wins: 'x', tier: 99 }, boar: { wins: -3, tier: 99 } }; },
  S28: (o) => { o.elixirs = { active: null, bag: 5 }; },
  S29: (o) => { o.ammo = { bolt: 'many', arrow: -4 }; }, S30: (o) => { o.runeBag = []; o.eggs = { dragon: 'x' }; },
  S31: (o) => { o.incubator = { egg: 'nope', left: -1 }; }, S32: (o) => { o.petChoice = 'tamed'; o.pet = null; },
};
for (const [id, mut] of Object.entries(CASES)) {
  const g = GOOD(); mut(g);
  assert.doesNotThrow(() => SaveGuard.normalize(g), id + ': normalize бросил исключение');
  check(g, id);
  const second = SaveGuard.normalize(g);
  assert.deepStrictEqual(second.notes, [], id + ': повторный проход нашёл правки: ' + second.notes.join('; '));
}

// 2. Точные ожидания на ключевые случаи (не только «не упало»)
{
  const g = GOOD(); g.items.push({ uid: 'x1', id: 'no-such-item', tier: 1 }); g.loadout.amulet = 'x1'; SaveGuard.normalize(g);
  assert.strictEqual(g.loadout.amulet, null, 'S03: неизвестная надетая вещь должна сняться');
  assert(!g.items.some((e) => e.uid === 'x1'), 'S03: неизвестная вещь должна уйти из items');
  const h = GOOD(); h.items.push({ uid: 'u1', id: 'shield-wood', tier: 1 }); SaveGuard.normalize(h);
  assert.strictEqual(new Set(h.items.map((e) => e.uid)).size, h.items.length, 'S05: uid уникальны');
  assert.strictEqual(h.items.find((e) => e.uid === 'u1').id, 'sword-novice', 'S05: первая вещь сохраняет свой uid (надетое не сбивается)');
  assert.strictEqual(h.loadout.main, 'u1');
  const k = GOOD(); k.coins = 12.7; SaveGuard.normalize(k); assert.strictEqual(k.coins, 12);
  const m = GOOD(); m.coins = -5; SaveGuard.normalize(m); assert.strictEqual(m.coins, 0);
  const q = GOOD(); q.loadout.main = 'u2'; SaveGuard.normalize(q); assert.strictEqual(q.loadout.main, null, 'щит нельзя держать в ячейке main'); assert.strictEqual(q.loadout.off, 'u2');
}

// 2б. Нулевые остатки — обычное состояние игры (расходник использован до конца): профиль не меняется и не считается «починенным»
{
  const g = GOOD(); g.backpack.scroll = 0; g.backpack.luck = 0; g.resources['ore:2'] = 0; g.ammo.bolt = 0; g.elixirs.bag['cunning:6'] = 0;
  const before = JSON.stringify(g), r = SaveGuard.normalize(g);
  assert.deepStrictEqual(r.notes, [], 'нулевые остатки не должны попадать в «починку»: ' + r.notes.join('; '));
  assert.strictEqual(JSON.stringify(g), before, 'нулевые остатки не должны меняться');
  const z = GOOD(); z.backpack.scroll = -3; z.backpack.luck = 0.5; z.backpack.nope = 0; const r2 = SaveGuard.normalize(z);
  assert(!('scroll' in z.backpack) && !('luck' in z.backpack) && !('nope' in z.backpack), 'отрицательное, дробное и неизвестное по-прежнему убираются');
  assert.strictEqual(r2.notes.length, 3, 'три правки: ' + r2.notes.join('; '));
}

// 3. Фаззинг: случайные порчи любой глубины — не бросать исключений, инварианты выполнены, второй проход пуст.
function mutate(v, depth = 0) {
  const r = rnd();
  if (r < 0.04) return null; if (r < 0.08) return undefined; if (r < 0.12) return 'x'; if (r < 0.16) return -1; if (r < 0.2) return 1e300; if (r < 0.24) return NaN; if (r < 0.27) return []; if (r < 0.3) return {};
  if (r < 0.33) return 0.5; if (r < 0.35) return true;
  if (Array.isArray(v)) { const a = v.map((x) => (rnd() < 0.15 ? mutate(x, depth + 1) : x)); if (rnd() < 0.1) a.push(mutate(null, depth + 1)); return a; }
  if (isObj(v)) { const o = {}; for (const [k, x] of Object.entries(v)) { if (rnd() < 0.05) continue; o[k] = depth < 4 && rnd() < 0.2 ? mutate(x, depth + 1) : x; } if (rnd() < 0.1) o['zz' + Math.floor(rnd() * 9)] = mutate(1, depth + 1); return o; }
  return v;
}
const N = Number(arg('n', 3000));
for (let i = 0; i < N; i++) {
  const g = GOOD(), keys = Object.keys(g);
  const hits = 1 + Math.floor(rnd() * 4);
  for (let h = 0; h < hits; h++) { const k = keys[Math.floor(rnd() * keys.length)]; g[k] = depth2(g[k]); }
  function depth2(x) { return rnd() < 0.5 ? mutate(x) : mutate(x, 2); }
  // как при настоящей загрузке: дальше работают только типы верхнего уровня; здесь проверяем и «неверный тип» отдельно в Profile.sanitize,
  // поэтому для проверки normalize возвращаем отсутствующие корневые поля на место, но оставляем порчу внутри
  const base = GOOD();
  for (const k of ['items', 'loadout', 'elixirs', 'market', 'medals', 'resources', 'backpack', 'ammo', 'runeBag']) if (typeof g[k] !== typeof base[k] || Array.isArray(g[k]) !== Array.isArray(base[k]) || g[k] === null) g[k] = base[k];
  for (const k of ['coins', 'xp', 'wins']) if (typeof g[k] !== 'number') g[k] = base[k];
  const tag = 'fuzz#' + i + ' (seed ' + arg('seed', 1) + ')';
  assert.doesNotThrow(() => SaveGuard.normalize(g), tag + ': исключение');
  check(g, tag);
  const second = SaveGuard.normalize(g);
  assert.deepStrictEqual(second.notes, [], tag + ': второй проход нашёл правки: ' + second.notes.join('; '));
}
// 1.6.6: прочность и флаг боя
{
  const g = GOOD(); g.items[0].dur = 7; g.items[1].dur = 9999; g.items[2].dur = -4; g.items[3].dur = 'x'; g.battle = { moved: true };
  SaveGuard.normalize(g);
  assert.strictEqual(g.items[0].dur, 7, 'нормальная прочность сохраняется');
  assert.ok(!('dur' in g.items[1]), 'полная прочность не хранится');
  assert.ok(g.items[2].dur === 0 && g.items[2].uid && !Object.values(g.loadout).includes(g.items[2].uid), 'сломанная вещь снята');
  assert.ok(!('dur' in g.items[3]), 'мусор в dur убран');
  assert.deepStrictEqual(g.battle, { moved: true }, 'флаг боя сохраняется');
  const h = GOOD(); h.battle = 'junk'; SaveGuard.normalize(h); assert.strictEqual(h.battle, null, 'мусорный флаг боя сброшен');
}
// руны, огранка и разделы новых систем
{
  const g = GOOD(); const it = g.items[0];
  it.runes = ['nope', 'rune-insight', 'rune-insight', 'rune-insight']; it.cut = 99;
  g.bank = { dep: 5e6, streak: 3 }; g.streak = 'junk'; g.lessons = { done: 5 };
  SaveGuard.normalize(g);
  assert.ok(!('cut' in g.items[0]) && g.items[0].runes.length <= 2 && g.items[0].runes.every((r) => r !== 'nope'), 'руны и огранка очищены');
  assert.strictEqual(g.bank.dep, 5e6, 'крупный вклад не обрезается');
  assert.ok(g.streak && typeof g.streak === 'object', 'раздел streak приведён к виду');
  const h = GOOD(); SaveGuard.normalize(h); assert.ok(!('bank' in h) || h.bank === GOOD().bank, 'отсутствующие разделы не создаются');
}
console.log(`saveguard: все тесты пройдены (исправный профиль без правок; ${Object.keys(CASES).length} случаев; фаззинг ${N})`);
