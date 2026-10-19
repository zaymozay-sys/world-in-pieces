const assert = require('assert');
global._t = (s, a) => (a ? s.replace(/\{(\d+)\}/g, (_, i) => a[i]) : s);
const H = require('../js/herocard.js');
const d = { name: 'Лу', faction: 'dwarf', wins: 30, stats: { battles: 40 }, medals: { earned: [{ id: 'a' }, { id: 'a' }, { id: 'b' }] },
  story: { shards: { x: true, y: false } }, bestiary: { rat: { wins: 3 }, wolf: { wins: 0 } }, tower: { best: 7 }, island: { chestTaken: true }, chron: [{ k: 'lord', a: 1 }] };
const c = H.build(d, { level: 12, medalName: (id) => 'М-' + id });
assert.strictEqual(c.battles, 40); assert.ok(!('losses' in c) && !('winRate' in c), 'только число боёв');
assert.deepStrictEqual(c.medals.map((m) => m.name), ['М-a', 'М-b'], 'медали без повторов');
assert.deepStrictEqual(c.merits.map((m) => m.k), ['shards', 'species', 'tower', 'island', 'lord']);
assert.ok(/Боёв: 40/.test(H.text(c)) && /Лучший уровень подземелья: 7/.test(H.text(c)));
const e = H.build({}, {}); assert.strictEqual(e.battles, 0); assert.deepStrictEqual(e.merits, []);
assert.strictEqual(H.build({ wins: 9, stats: { battles: 3 } }).battles, 9, 'боёв не меньше побед (старые сохранения)');
assert.strictEqual(H.build({ wins: -5, medals: 'x' }).battles, 0);
console.log('herocard: все тесты пройдены');
