// Тесты подбора графики: какая фигура героя показывается по надетому и что происходит, если картинки нет.
// Запуск: node tests/art.test.js
const assert = require('assert');
global.Tiers = require('../js/tiers.js');
global.Balance = require('../js/balance.js');
global.Gear = require('../js/items.js');
const fs = require('fs'), path = require('path');

// список файлов берём из настоящей папки art/ (то, что лежит в репозитории)
global.ART_FILES = {};
(function walk(dir, base) {
  if (!fs.existsSync(dir)) return;
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) walk(p, base + n + '/');
    else if (n.endsWith('.webp')) global.ART_FILES[base + n.slice(0, -5)] = 'art/' + base + n;
  }
})(path.join(__dirname, '..', 'art'), '');
const Art = require('../js/art.js');

// каждый файл из манифеста существует и не пустой
for (const [k, f] of Object.entries(ART_FILES)) assert.ok(fs.statSync(path.join(__dirname, '..', f)).size > 500, k);

const worn = (ids) => { let g = Gear.emptyLoadout(); const slots = { 'sword-novice': 'main', 'shield-wood': 'off', 'leather-head': 'head', 'leather-chest': 'chest', 'leather-arms': 'arms', 'leather-legs': 'legs' };
  for (const id of ids) g = Gear.equip(g, id, slots[id] || Gear.item(id).type === 'shield' ? 'off' : (Gear.item(id).type.startsWith('weapon') ? 'main' : Gear.item(id).type)); return g; };

// стартовая одежда → фигура 1; металл → 2; три вещи своего набора → 3
assert.strictEqual(Art.bodyLevel('human', worn(['sword-novice', 'shield-wood', 'leather-head', 'leather-chest'])), 1);
assert.strictEqual(Art.bodyLevel('human', worn(['sword-two', 'guard-shield', 'guard-head', 'guard-chest'])), 2);
assert.strictEqual(Art.bodyLevel('human', worn(['crown-sword', 'crown-shield', 'crown-head', 'crown-chest'])), 3);
assert.strictEqual(Art.bodyLevel('human', null), 1);

// если нужной картинки нет — берётся ближайшая; если нет ни одной — null (игра рисует старой SVG-фигурой)
Art.has; // манифест уже загружен
const have = (k) => Art.has(k);
if (have('heroes/elf-f-body-1') && !have('heroes/elf-f-body-3')) assert.strictEqual(Art.bodyKey('elf-f', worn(['crown-sword', 'crown-shield', 'crown-head'])), 'heroes/elf-f-body-1');
assert.strictEqual(Art.bodyKey('nobody', null), null);
assert.strictEqual(Art.hasBody('nobody'), false);
assert.strictEqual(Art.hasMonster('no-such-monster'), false);
assert.strictEqual(Art.hasPortrait('no-such'), false);
// пол без картинки (например, «human-f» до загрузки) не подставляет чужой — игра рисует старой SVG-фигурой
if (have('heroes/human-m-portrait') && !have('heroes/human-f-portrait')) assert.strictEqual(Art.hasPortrait('human-f'), false);

// обёртки возвращают SVG с картинкой внутри (старый код заменяет '<svg ' в начале строки)
if (Art.hasPortrait('dwarf-m')) assert.ok(Art.portrait('dwarf-m').startsWith('<svg ') && Art.portrait('dwarf-m').includes('<image'));
if (Art.hasMonster('rat')) assert.ok(Art.monster('rat', '#e5483f').startsWith('<svg '));

// у каждого вида из бестиария есть портрет: файл из art/monsters или векторный рисунок из monsterart.js
// (Дракон рисуется фигурой из figures.js — см. renderAvatar в game.js)
{
  global.Art = Art;
  const Bestiary = require('../js/bestiary.js');
  const MonsterArt = require('../js/monsterart.js');
  for (const id of Object.keys(Bestiary.MONSTERS)) {
    if (id === 'dragon') continue;
    assert.ok(Art.hasMonster(id) || MonsterArt.has(id), `нет портрета существа: ${id}`);
    assert.ok(MonsterArt.bust(id, 3).startsWith('<svg'), `пустой портрет: ${id}`);
  }
  for (const id of ['lynx', 'hedgehog']) assert.ok(MonsterArt.has(id), `нет векторного рисунка: ${id}`);
}

console.log('art: все тесты пройдены');
