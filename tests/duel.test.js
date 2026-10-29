const assert = require('assert');
const Duel = require('../js/duel.js');
const SLOTS = ['main', 'off', 'chest'];
const card = Duel.makeCard({ nick: ' <b>Лу</b> ', faction: 'elf', gender: 'f', level: 12.4, rank: 3, gear: { main: { uid: 'u1', id: 'sword', tier: 6, cut: 3, runes: ['rune-might', 'x y', 'rune-ward', 'rune-vitality'] }, off: null, chest: { id: 'x'.repeat(100), tier: 1 }, extra: { id: 'bad' } } }, SLOTS);
assert.strictEqual(card.nick, 'bЛу/b'); assert.ok(!/[<>]/.test(card.nick));
assert.strictEqual(card.level, 12); assert.strictEqual(card.faction, 'elf'); assert.strictEqual(card.gear.main.uid, undefined, 'номер вещи не отправляем');
assert.deepStrictEqual(Object.keys(card.gear), SLOTS, 'только известные ячейки');
assert.strictEqual(card.gear.main.cut, 3); assert.deepStrictEqual(card.gear.main.runes, ['rune-might', 'rune-ward'], 'руны: только допустимые, до двух');
// мусор вместо данных
const bad = Duel.makeCard({ nick: '', faction: 'orc', gender: 'q', level: 'abc', rank: -5, gear: null }, SLOTS);
assert.strictEqual(bad.nick, 'Герой'); assert.strictEqual(bad.faction, 'dwarf'); assert.strictEqual(bad.level, 1); assert.strictEqual(bad.rank, 0); assert.strictEqual(bad.gear.main, null);
// тень соперника: неизвестные вещи отбрасываются, ум зависит от ранга
const sh = Duel.toShadow(card, SLOTS, (e) => e.id === 'sword', () => 0.5);
assert.strictEqual(sh.real, true); assert.strictEqual(sh.level, 12); assert.strictEqual(sh.ai, 30 + 3 * 7);
assert.ok(sh.gear.main && sh.gear.main.uid === 'duel-main'); assert.strictEqual(sh.gear.chest, null, 'неизвестная вещь отброшена');
assert.strictEqual(sh.seed, 500000000);
for (const x of [null, 'a', { level: 0, faction: 'elf', gender: 'f', nick: 'a', gear: {} }, { level: 5, faction: 'orc', gender: 'f', nick: 'a', gear: {} }, { level: 5, faction: 'elf', gender: 'f', nick: '', gear: {} }]) assert.strictEqual(Duel.toShadow(x, SLOTS, null), null);
console.log('duel: все тесты пройдены');
