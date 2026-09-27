// Быстрая проверка баланса на симуляторе (tools/sim.js): роли существ, длина боя, оценка опасности.
// Полный отчёт — node tools/balance.js и node tools/career.js. Запуск: node tests/balance.test.js
const assert = require('assert');
const sim = require('../tools/sim.js');
const { Hero, Bestiary, Combat, Gear, Factions, Balance } = global;

const run = (monster, tier, n = 48) => {
  const L = Hero.itemLevel(tier);
  let win = 0, acts = 0;
  for (const faction of ['human', 'dwarf', 'elf', 'lizard']) {
    const r = sim.simulate({ faction, level: L, monster, tier, n: n / 4, gear: () => sim.typicalGear(L), seedBase: 11 });
    win += r.win / 4; acts += r.actions / 4;
  }
  return { win, acts };
};

// крыса — лёгкая, разбойник — «равный», тролль — опасный, дракон — смертельный (для героя своего цвета)
const rat = run('rat', 1), bandit = run('bandit', 3), troll = run('troll', 6), dragon = run('dragon', 9);
assert.ok(rat.win >= 0.8, 'крыса: ' + rat.win);
assert.ok(bandit.win >= 0.5 && bandit.win <= 0.85, 'разбойник: ' + bandit.win);
assert.ok(troll.win >= 0.2 && troll.win <= 0.7, 'тролль: ' + troll.win);
assert.ok(dragon.win <= 0.5, 'дракон: ' + dragon.win);
// бой обычного существа длится 8–12 ходов героя (с запасом на разброс малой выборки)
assert.ok(bandit.acts >= 7 && bandit.acts <= 13, 'длина боя: ' + bandit.acts);
assert.ok(rat.acts < bandit.acts, 'бой с крысой короче');

// оценка опасности по видам совпадает с их ролью (герой своего цвета со средним снаряжением)
const T = 5, L = Hero.itemLevel(T);
const avg = (id) => {
  let p = 0;
  for (let k = 0; k < 20; k++) {
    sim.seed(500 + k);
    const g = sim.typicalGear(L), st = Gear.combine(Gear.stats(g), Factions.statsAt('elf', Hero.tierFloat(L)));
    const sc = Bestiary.scaled(id, T);
    p += Combat.winChance({ max: Hero.baseHp(L) + st.health, dmg: Hero.dmgMult(L), stats: st }, { max: sc.hp, dmg: sc.dmg, stats: sc.stats, ai: sc.ai }, id) / 20;
  }
  return p;
};
const band = (id) => Combat.dangerBand(avg(id));
assert.strictEqual(band('rat'), 'easy');
for (const id of ['wolf', 'bandit', 'boar', 'orc', 'ghoul']) assert.ok(['even', 'easy'].includes(band(id)), id + ': ' + band(id));
for (const id of ['troll', 'golem', 'wraith']) assert.strictEqual(band(id), 'hard', id);
assert.ok(['deadly', 'hard'].includes(band('dragon')));
const even = ['wolf', 'bandit', 'skeleton', 'boar', 'orc', 'ghoul', 'orcShaman'].map(avg);
const mean = even.reduce((s, x) => s + x, 0) / even.length;
assert.ok(mean >= 0.6 && mean <= 0.75, 'средний шанс против «равных»: ' + mean.toFixed(2));

console.log('balance: все тесты пройдены');
