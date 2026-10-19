global._t = (s, a) => (a ? s.replace(/\{(\d+)\}/g, (_, i) => a[i]) : s);
const Trader = require('../js/trader.js'), Crafts = require('../js/crafts.js'), Decor = require('../js/decor.js'), Mail = require('../js/mail.js'), Run = require('../js/run.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const DAY = 86400000;

// --- торговец: приходит раз в 10 дней на 2 дня, товары по циклу одинаковы ---
let act = 0; for (let d = 0; d < 100; d++) if (Trader.at(d * DAY + 1000, 0).active) act++;
ok(act === 20, 'trader active 2 of 10 days: ' + act);
const a = Trader.at(3 * DAY + 5, 0), b = Trader.at(4 * DAY + 5, 0), c0 = Trader.at(5 * DAY + 5, 0);
ok(a.active && b.active && !c0.active && a.endsAt === 5 * DAY, 'trader window');
ok(Trader.at(0, 0).nextAt === 3 * DAY && c0.nextAt === 13 * DAY, 'trader next');
const pools = { runes: ['r1', 'r2', 'r3'], eggs: ['e1', 'e2'], res: ['hide', 'bone', 'ore'] };
const s1 = Trader.stock(5, pools), s2 = Trader.stock(5, pools), s3 = Trader.stock(6, pools);
ok(JSON.stringify(s1) === JSON.stringify(s2), 'stock stable'); ok(s1.length === 4, 'stock 4'); ok(JSON.stringify(s1) !== JSON.stringify(s3), 'stock differs by cycle');
ok(s1.every((x) => pools.res.includes(x.give.kind) && x.give.n > 0 && x.get.n > 0), 'stock shape');
const t = Trader.sync(Trader.clean(null), 5);
ok(Trader.mark(t, s1[0].id) && !Trader.mark(t, s1[0].id) && !Trader.canBuy(t, s1[0].id), 'buy once');
Trader.sync(t, 6); ok(Trader.canBuy(t, s1[0].id), 'new visit resets');
ok(Trader.clean({ cycle: 'x', bought: [] }).cycle === -1 && Object.keys(Trader.clean({ bought: [1] }).bought).length === 0, 'trader clean');

// --- промыслы ---
const cr = Crafts.clean(null), day = '2026-10-19', t0 = 1e12;
ok(Crafts.start(cr, 'mill', t0, day).ok && !Crafts.start(cr, 'mill', t0, day).ok && Crafts.start(cr, 'mill', t0, day).why === 'busy', 'craft busy');
ok(!Crafts.ready(cr, 'mill', t0 + 1000) && Crafts.ready(cr, 'mill', t0 + 3 * Crafts.HOUR), 'craft ready after 3h');
ok(!Crafts.collect(cr, 'mill', t0, day).ok, 'cannot collect early');
for (let i = 0; i < 3; i++) { if (i) Crafts.start(cr, 'mill', t0, day); ok(Crafts.collect(cr, 'mill', t0 + 4 * Crafts.HOUR, day).ok, 'collect ' + i); }
ok(Crafts.start(cr, 'mill', t0, day).why === 'limit', 'daily limit');
ok(Crafts.start(cr, 'mill', t0, '2026-10-20').ok, 'next day ok');
ok(Crafts.reward('mill', 100, 3).coins === 140 && Crafts.reward('kennel', 50, 3).res[0] === 'honey' && Crafts.reward('library', 50, 1).cons[0] === 'scroll', 'craft rewards');
ok(Crafts.cost('library', 50) === 100, 'craft cost');
ok(Crafts.clean({ mill: { at: -5, n: 99 } }).mill.at === 0 && Crafts.clean({ mill: { n: 99 } }).mill.n === 3, 'crafts clean');

// --- декор ---
const dc = Decor.clean(null);
ok(Decor.buy(dc, 'wall-banner', 1e9).ok && Decor.owns(dc, 'wall-banner') && dc.put.wall === 'wall-banner', 'decor buy+put');
ok(!Decor.buy(dc, 'wall-banner', 1e9).ok && Decor.buy(dc, 'wall-trophy', 5).why === 'poor' && Decor.buy(dc, 'zzz', 1e9).why === 'none', 'decor rules');
Decor.buy(dc, 'wall-trophy', 1e9); ok(dc.put.wall === 'wall-trophy', 'new replaces slot');
ok(Decor.put(dc, 'wall-banner') && dc.put.wall === 'wall-banner' && Decor.clear(dc, 'wall') && !dc.put.wall, 'put/clear');
for (const it of Decor.ITEMS) Decor.buy(dc, it.id, 1e12);
ok(Decor.filled(dc) === 6 && Decor.ownCount(dc) === Decor.ITEMS.length, 'all decor');
const dirty = Decor.clean({ own: { 'wall-banner': true, bogus: true }, put: { wall: 'garden-pond', floor: 'floor-rug' } });
ok(Decor.ownCount(dirty) === 1 && !dirty.put.wall && !dirty.put.floor, 'decor clean');
ok(Decor.trophies({ trophies: { mimic: 2, griffin: 0, x: 'a' } }).length === 1, 'trophies list');

// --- почта ---
const m = Mail.clean(null);
let got = Mail.sync(m, { wins: 0, level: 1 }, 1);
ok(got.length === 1 && got[0] === 'welcome' && Mail.unread(m) === 1, 'welcome only');
ok(Mail.sync(m, { wins: 0, level: 1 }, 2).length === 0, 'no duplicates');
got = Mail.sync(m, { wins: 12, level: 5, battles: 12, medals: 0, pet: true }, 3);
ok(['win1', 'win10', 'lvl5', 'pet'].every((x) => got.includes(x)) && got.length === 4, 'conditions: ' + got);
const g = Mail.claim(m, 'win1'); ok(g && g.cons.potion === 1 && Mail.claim(m, 'win1') === null, 'gift once');
ok(Mail.claim(m, 'medals5') === null, 'no letter no gift');
Mail.sync(m, { medals: 9 }, 4); ok(m.box.find((e) => e.id === 'medals5').claimed === true, 'no gift => claimed');
ok(Mail.read(m, 'welcome') && Mail.unread(m) === m.box.length - 1 - 0 + 0 - (m.box.filter((e) => e.read).length - 1), 'read marks');
ok(Mail.clean({ box: [{ id: 'nope' }, { id: 'welcome' }, { id: 'welcome' }, null] }).box.length === 1, 'mail clean');
ok(Mail.LETTERS.every((l) => l.subject() && l.body() && l.from()), 'letters have text');

// --- условия забега ---
const r = Run.clean({ mod: 'bad' }); ok(r.mod === '', 'bad mod ignored');
Run.start(r, 'stun'); ok(r.mod === 'stun' && Run.modMult('stun') === 1.4 && Run.shadow(r, 10, 5, ['a', 'b']).rule === 'stun', 'mod applied');
Run.start(r); ok(r.mod === '' && Run.shadow(r, 10, 5, ['a', 'b']).rule === null && Run.modMult('') === 1, 'no mod');

// --- события недели ---
const Events = require('../js/events.js');
const mon = Date.UTC(2026, 9, 19) + 3600000;       // понедельник 19.10.2026, 01:00 UTC
const seq = []; for (let w = 0; w < 8; w++) seq.push(Events.current(mon + w * 7 * DAY, 0).id);
ok(new Set(seq.slice(0, 4)).size === 4 && seq[0] === seq[4] && seq[3] === seq[7], 'events rotate by week: ' + seq);
ok(Events.current(mon, 0).id === Events.current(mon + 6 * DAY, 0).id && Events.current(mon, 0).id !== Events.current(mon + 7 * DAY, 0).id, 'week boundary is Monday');
ok(Events.current(mon - DAY, 0).id !== Events.current(mon, 0).id, 'Sunday belongs to previous week');
ok(Events.endsAt(mon, 0) === mon - 3600000 + 7 * DAY, 'endsAt = next Monday: ' + (Events.endsAt(mon, 0) - mon));
ok(Events.mul('hunt', 'run') === 1.25 && Events.mul('games', 'puzzle') === 1.5 && Events.mul('hunt', 'puzzle') === 1 && Events.mul('craft', 'craft') === 1.5, 'multipliers');
ok(Events.LIST.every((e) => e.name() && e.desc()), 'event texts');

// --- стрелки компаса и путевой дневник ---
const Compass = require('../js/compass.js');
const cp = Compass.clean(null);
ok(cp.arrows.home === 0 && cp.arrows.mark === 0 && cp.diary === false, 'compass fresh');
ok(!Compass.add(cp, 'home', 0) && Compass.count(cp, 'home') === 0, 'no belt: cannot add');
ok(Compass.cap(0) === 0 && Compass.cap(1) === 5 && Compass.cap(10) === 14, 'cap by belt tier');
for (let i = 0; i < 5; i++) ok(Compass.add(cp, 'home', 1), 'add ' + i);
ok(!Compass.add(cp, 'home', 1) && Compass.room(cp, 'home', 1) === 0, 'cap reached');
ok(Compass.add(cp, 'home', 3) , 'bigger belt, more room');
ok(!Compass.canUse(cp, 'home', 0) && Compass.canUse(cp, 'home', 1), 'use needs belt');
ok(Compass.use(cp, 'home', 2) && Compass.count(cp, 'home') === 5, 'use spends one');
ok(!Compass.canUse(cp, 'mark', 5) && !Compass.add(cp, 'bad', 5), 'unknown/empty kinds');
ok(Compass.clean({ arrows: { home: -3, mark: 'x' }, diary: 1 }).arrows.home === 0 && Compass.clean({ diary: 1 }).diary === true, 'compass clean');
ok(Compass.cost(Compass.RECIPES.mark, 50) === 150 && Compass.cost(Compass.RECIPES.mark, 50, 0.8) === 120, 'recipe cost');
const nm = {};
ok(Compass.setName(nm, 5, '  Мой   <b>лагерь</b> ') && nm[5] === 'Мой bлагерь/b', 'name cleaned: ' + nm[5]);
ok(Compass.cleanName('x'.repeat(50)).length === Compass.NAME_MAX, 'name max');
Compass.setName(nm, 5, '   '); ok(!(5 in nm), 'empty name removes');
Compass.setName(nm, 1, 'a'); Compass.setName(nm, 2, 'b'); Compass.prune(nm, [2]); ok(!(1 in nm) && nm[2] === 'b', 'prune names');
console.log(fails ? 'extras189: ' + fails + ' ошибок' : 'extras189: все тесты пройдены'); process.exit(fails ? 1 : 0);

// 1.8.9: самоцветы стражей
{
  const Stones = require('../js/stones.js');
  const S = Stones.clean(null);
  assert.strictEqual(Stones.guardColor(5), 1); assert.strictEqual(Stones.guardColor(50), 10); assert.strictEqual(Stones.guardColor(100), 10); assert.strictEqual(Stones.guardColor(7), 0);
  assert.ok(Stones.add(S, 3, 2)); assert.strictEqual(Stones.count(S, 3), 2); assert.strictEqual(Stones.seenCount(S), 1);
  assert.ok(!Stones.makeSeal(S, 3)); Stones.add(S, 3, 1); assert.ok(Stones.makeSeal(S, 3)); assert.strictEqual(S.seals[3], 1);
  assert.ok(!Stones.canSeal(S, 3, 10)); assert.ok(Stones.canSeal(S, 3, 15)); assert.strictEqual(Stones.useSeal(S, 3, 15), 15); assert.strictEqual(S.seals[3], 0);
  assert.ok(!Stones.valid(0) && !Stones.valid(11)); assert.strictEqual(Stones.beltCap(10), 5); assert.strictEqual(Stones.dropCount(0.1), 2); assert.strictEqual(Stones.dropCount(0.9), 1);
  assert.deepStrictEqual(Stones.clean({ bag: { 1: -5, 2: 'x' } }).bag[1], 0);
}
