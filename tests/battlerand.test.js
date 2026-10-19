// Случайные числа боя (js/battlerand.js): общий поток по зерну, прежнее поведение без зерна, охрана от случайных Math.random в бою.
const assert = require('assert');
const fs = require('fs'), path = require('path');
global.BattleRand = require('../js/battlerand.js');
global.Tiers = require('../js/tiers.js'); global.Balance = require('../js/balance.js'); global.Gear = require('../js/items.js');
const Combat = require('../js/combat.js');

// без зерна — это Math.random
assert.strictEqual(BattleRand.seeded, false);
const keep = Math.random; let calls = 0; Math.random = () => { calls++; return 0.25; };
assert.strictEqual(BattleRand.next(), 0.25); assert.strictEqual(calls, 1); Math.random = keep;

// с зерном — воспроизводимый поток, на Math.random не смотрит
BattleRand.seed(42); const a = Array.from({ length: 50 }, () => BattleRand.next());
BattleRand.seed(42); Math.random = () => { throw new Error('Math.random в потоке боя'); };
const b = Array.from({ length: 50 }, () => BattleRand.next()); Math.random = keep;
assert.deepStrictEqual(a, b); assert.ok(a.every((x) => x >= 0 && x < 1));
BattleRand.seed(43); assert.notDeepStrictEqual(a, Array.from({ length: 50 }, () => BattleRand.next()));
assert.strictEqual(BattleRand.seed('abc'), false);
BattleRand.unseed(); assert.strictEqual(BattleRand.seeded, false);

// удары Combat по умолчанию берут общий поток: одно зерно — одни и те же исходы (блок, крит, рикошет…)
const fighter = (n) => ({ name: n, hp: 100000, max: 100000, dmg: 1, stats: { ...Gear.blankStats(), power: 20, defense: 10, block: 30, crit: 30, luck: 10 }, buffs: [], haste: false, magic: false, counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 }, ability: null, charged: false, revived: false, turnNo: 0 });
const play = (seed) => { BattleRand.seed(seed); const A = fighter('a'), B = fighter('b'); const out = []; for (let i = 0; i < 200; i++) { const r = Combat.hit(A, B, 50); out.push(r.kind + r.amount + (r.crit ? 'c' : '')); } return out.join(','); };
Math.random = () => { throw new Error('Math.random в бою'); };
let ok = true; try { assert.strictEqual(play(7), play(7)); assert.notStrictEqual(play(7), play(8)); } catch (e) { if (/Math\.random/.test(e.message)) ok = false; else throw e; } Math.random = keep;
assert.ok(ok, 'Combat.hit не должен трогать Math.random');
BattleRand.unseed();

// охрана: новые Math.random в боевом коде нужно осознанно разобрать (поменять на BattleRand или разрешить здесь)
const count = (f) => (fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8').match(/Math\.random/g) || []).length;
assert.strictEqual(count('combat.js'), 2, 'combat.js: только запасной вариант в battleRand (и упоминание в комментарии)');
const GAME_N = 19;   // 1.9.3: +3 — награда за Владыку замка (выбор вещи из набора; награды боевым исходом не управляют). Известные: подготовка боя (рой, снаряжение тени), добыча и награды, питомец, косметика, интерфейс
assert.strictEqual(count('game.js'), GAME_N, 'game.js: изменилось число Math.random — бой по сети: решите, боевой ли он (BattleRand) или косметика/награда');
console.log('battlerand: все тесты пройдены');
