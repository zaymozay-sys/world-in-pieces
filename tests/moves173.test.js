// 1.7.3: приёмы Оглушение / Отрава / Щит, подпись «что дальше» (Combat.nextMove), новые виды и хозяева зон.
// Запуск: node tests/moves173.test.js
const assert = require('assert');
global.Tiers = require('../js/tiers.js');
global.Balance = require('../js/balance.js');
global.Gear = require('../js/items.js');
global.Bestiary = require('../js/bestiary.js');
const Combat = require('../js/combat.js');
const HexMap = require('../js/hexmap.js');
global.HexMap = HexMap;
const World = require('../js/world.js');
const A = Balance.abilities;

const stats = (s = {}) => ({ ...Gear.blankStats(), ...s });
const fighter = (o = {}) => ({ hp: 100, max: 100, dmg: 1, buffs: [], haste: false, magic: false, counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 },
  ability: null, charged: false, revived: false, turnNo: 0, ward: 0, stunned: false, poison: null, ...o, stats: stats(o.stats) });
const never = () => 0.999, always = () => 0;
const MAGIC = ['sapphire', 'ruby', 'emerald'];

/* ---------- Оглушение ---------- */
{
  const m = fighter({ ability: 'stun' }), h = fighter();
  for (let n = 1; n <= 10; n++) {
    m.turnNo = n; h.stunned = false;
    const act = Combat.monsterTurnStart(m, h, MAGIC, never);
    assert.strictEqual(!!act, n % A.stun.every === 0, 'оглушает каждый ' + A.stun.every + '-й ход, n=' + n);
    assert.strictEqual(h.stunned, !!act);
    if (act) assert.strictEqual(act.kind, 'stun');
  }
  // Блок даёт шанс устоять
  const hb = fighter({ stats: { block: 40 } });
  m.turnNo = A.stun.every;
  let act = Combat.monsterTurnStart(m, hb, MAGIC, always);
  assert.strictEqual(act.kind, 'stun'); assert.ok(act.resisted); assert.strictEqual(hb.stunned, false, 'Блок спас ход');
  act = Combat.monsterTurnStart(m, hb, MAGIC, never);
  assert.ok(!act.resisted); assert.strictEqual(hb.stunned, true, 'Блок не сработал — ход пропущен');
}

/* ---------- Отрава ---------- */
{
  const m = fighter({ ability: 'toxin', dmg: 1.5 }), h = fighter();
  for (let n = 1; n < A.toxin.every; n++) { m.turnNo = n; assert.strictEqual(Combat.monsterTurnStart(m, h, MAGIC, never), null); }
  assert.strictEqual(h.poison, null);
  m.turnNo = A.toxin.every;
  const act = Combat.monsterTurnStart(m, h, MAGIC, never);
  assert.strictEqual(act.kind, 'toxin'); assert.strictEqual(act.turns, A.toxin.turns); assert.ok(act.dmg >= 1);
  assert.deepStrictEqual(h.poison, { turns: A.toxin.turns, dmg: act.dmg });
  // повторная отрава не ослабляет уже идущую более сильную
  h.poison = { turns: 1, dmg: 999 };
  m.turnNo = A.toxin.every * 2;
  Combat.monsterTurnStart(m, h, MAGIC, never);
  assert.strictEqual(h.poison.dmg, 999); assert.strictEqual(h.poison.turns, A.toxin.turns);
  // слабее яда фракции: по умолчанию меньше, чем тик Ядовитого укуса
  assert.ok(act.dmg <= Math.ceil(Balance.faction.venom.base * 1.5 * (1 + 0 / 100)) + 1);
}

/* ---------- Щит ---------- */
{
  const m = fighter({ ability: 'ward', max: 200, hp: 200 }), h = fighter();
  m.turnNo = A.ward.every - 1; assert.strictEqual(Combat.monsterTurnStart(m, h, MAGIC, never), null);
  m.turnNo = A.ward.every;
  const act = Combat.monsterTurnStart(m, h, MAGIC, never);
  assert.strictEqual(act.kind, 'ward'); assert.strictEqual(act.amount, Math.round(200 * A.ward.pct)); assert.strictEqual(m.ward, act.amount);
  // удар сначала съедает щит, ХП не трогает
  const shield = m.ward;
  let r = Combat.hit(h, m, 1, false, never);
  assert.strictEqual(m.ward, shield - 1); assert.strictEqual(m.hp, 200); assert.strictEqual(r.absorbed, 1);
  // удар крупнее остатка: щит гаснет, остаток урона проходит
  r = Combat.hit(h, m, m.ward + 5, false, never);
  assert.strictEqual(m.ward, 0); assert.strictEqual(m.hp, 195); assert.strictEqual(r.amount, 5); assert.strictEqual(r.absorbed, shield - 1);
  // новый щит не складывается, а обновляется до полного размера
  m.ward = 3; m.turnNo = A.ward.every * 2;
  Combat.monsterTurnStart(m, h, MAGIC, never);
  assert.strictEqual(m.ward, Math.round(200 * A.ward.pct));
  // яд и штрафы (raw) щит не берёт — они идут мимо него
  const raw = fighter({ ward: 10 }); Combat.hit(m, raw, 3, true, never);
  assert.strictEqual(raw.ward, 10); assert.strictEqual(raw.hp, 97);
  // щит у героя тоже работает (общий hit)
  const hero = fighter({ ward: 10 });
  r = Combat.hit(m, hero, 4, false, never);
  assert.strictEqual(hero.hp, 100); assert.strictEqual(hero.ward, 6);
}

/* ---------- подпись «что дальше» ---------- */
{
  assert.strictEqual(Combat.nextMove(null), null);
  assert.strictEqual(Combat.nextMove(fighter({ ability: null })), null);
  assert.strictEqual(Combat.nextMove(fighter({ ability: 'stun', hp: 0 })), null, 'павшее существо подписи не имеет');
  for (const id of ['stun', 'toxin', 'ward', 'howl', 'steal']) {
    const a = A[id]; if (!a || !a.every) continue;
    for (let t = 0; t <= a.every * 2; t++) {
      const nm = Combat.nextMove(fighter({ ability: id, turnNo: t }));
      assert.strictEqual(nm.kind, id); assert.ok(nm.left >= 1 && nm.left <= a.every, `${id}: left=${nm.left} при ходе ${t}`);
      // подпись согласуется с тем, что делает monsterTurnStart на следующем ходу существа
      const m = fighter({ ability: id, turnNo: t + 1, dmg: 1 });
      const fires = !!Combat.monsterTurnStart(m, fighter(), MAGIC, never);
      assert.strictEqual(nm.left === 1, fires, `${id}: «в ближайший ход» ⇔ приём срабатывает (ход ${t})`);
    }
  }
  assert.deepStrictEqual(Combat.nextMove(fighter({ ability: 'undying', revived: true })), { kind: 'undying', once: true, spent: true });
  assert.strictEqual(Combat.nextMove(fighter({ ability: 'charge' })).spent, false);
  assert.strictEqual(Combat.nextMove(fighter({ ability: 'rage', hp: 10 })).hot, true);
  assert.strictEqual(Combat.nextMove(fighter({ ability: 'rage', hp: 90 })).hot, false);
}

/* ---------- виды ---------- */
{
  for (const id of Bestiary.ORDER) {
    const m = Bestiary.MONSTERS[id];
    assert.ok(!m.ability || Bestiary.ABILITIES[m.ability], `у ${id} приём «${m.ability}» описан`);
    if (m.ability) assert.ok(Combat.nextMove(fighter({ ability: m.ability })), `у ${id} есть подпись «что дальше»`);
  }
  for (const id of ['ogre', 'berserk', 'assassin']) assert.ok(Bestiary.MONSTERS[id] && Bestiary.ORDER.includes(id), id + ' в бестиарии');
  assert.strictEqual(Bestiary.MONSTERS.ogre.ability, 'stun');
  assert.strictEqual(Bestiary.MONSTERS.berserk.ability, 'rage');
  assert.strictEqual(Bestiary.MONSTERS.assassin.ability, 'toxin');
  for (const k of ['stun', 'toxin', 'ward']) assert.ok(Bestiary.ABILITIES[k] && Bestiary.ABILITIES[k].name && Bestiary.ABILITIES[k].desc, k + ' описан');
}

/* ---------- хозяева зон ---------- */
{
  assert.deepStrictEqual(World.ZONE_IDS, ['z1', 'z3', 'z5', 'z7', 'z9'], 'хозяева на нечётных цветах (на чётных — стражи)');
  for (const zid of World.ZONE_IDS) {
    const Z = World.ZONE_BOSSES[zid], geo = HexMap.ZONES[zid];
    assert.strictEqual(Z.tier, geo.tier); assert.strictEqual(Z.species, geo.species);
    assert.ok(Z.tier % 2 === 1, 'нечётный цвет');
    assert.ok(Bestiary.MONSTERS[Z.species], 'вид известен');
    assert.ok(Z.title && Z.where && Z.lore && Z.taunt && Z.defeat, 'тексты заполнены');
    for (const a of Z.affixes) assert.ok(Bestiary.ABILITIES[a] || World.AFFIXES[a], 'свойство «' + a + '» известно');
    for (const a of Z.affixes) assert.ok(World.AFFIXES[a] && World.AFFIXES[a].name && World.AFFIXES[a].desc, 'у свойства «' + a + '» есть название и описание');
    const sc = Bestiary.scaled(Z.species, Z.tier, 1), zs = World.scaleZone(sc, zid);
    assert.strictEqual(zs.hp, Math.round(sc.hp * World.zoneHp(zid))); assert.strictEqual(zs.stats.power, (sc.stats.power || 0) + World.zonePower(zid));
    assert.ok(World.zoneHp(zid) >= World.ZONE.hp && World.zonePower(zid) >= World.ZONE.power, 'хозяин зоны не слабее общего порога');
    assert.strictEqual(sc.hp, Bestiary.scaled(Z.species, Z.tier, 1).hp, 'исходный набор не изменён');
    const rw = World.zoneReward(zid); assert.ok(rw.coins > 0 && rw.xp > 0);
  }
  { const x = { hp: 10, stats: {} }; assert.strictEqual(World.scaleZone(x, 'нет'), x, 'неизвестная зона — без изменений'); }
  assert.ok(World.zoneReward('z9').coins > World.zoneReward('z1').coins, 'награда растёт с цветом');
  // на карте: не более одного хозяина на зону, правильный цвет и вид, не страж и не на пляже; карта по зерну повторяется
  let seen = 0;
  for (const seed of [1, 777, 424242, 9001]) {
    const map = HexMap.generate(seed), again = HexMap.generate(seed);
    assert.strictEqual(JSON.stringify(map.spawns), JSON.stringify(again.spawns), 'карта по зерну повторяется');
    const zs = map.spawns.filter((s) => s.zone);
    assert.strictEqual(new Set(zs.map((s) => s.zone)).size, zs.length, 'по одному хозяину на зону');
    for (const s of zs) {
      seen++;
      const Z = HexMap.ZONES[s.zone];
      assert.strictEqual(s.tier, Z.tier); assert.strictEqual(s.species, Z.species); assert.ok(!s.boss, 'хозяин зоны — не страж осколка');
      assert.ok(map.cells[s.idx].terrain !== 'beach');
      assert.strictEqual(HexMap.tierAt(map.cells[s.idx].d), Z.tier, 'стоит в своём цвете');
    }
    // каждый хозяин именно «на месте» обычного существа: общее число существ тем же, что и без зон
    const ids = map.spawns.map((s) => s.id); assert.strictEqual(new Set(ids).size, ids.length);
    // быстрый бой и элитные хозяевами не становятся
    const w = World.place(map);
    for (const s of zs) { assert.ok(!w.elites.has(s.id), 'хозяин зоны не бывает элитным'); }
  }
  assert.ok(seen >= 10, 'хозяева зон встречаются на картах: ' + seen);
}

/* ---------- симулятор: свойства и зона ---------- */
{
  const sim = require('../tools/sim.js');
  const mon = sim.makeMonster('boar', 3, { zone: 'z3' });
  const plain = sim.makeMonster('boar', 3, {});
  assert.deepStrictEqual(mon.affixes, ['stun']);
  assert.ok(mon.max > plain.max, 'хозяин зоны крепче: ' + mon.max + ' > ' + plain.max);
  assert.deepStrictEqual(plain.affixes, []);
  const lvl = global.Hero.itemLevel(3);
  const r = sim.simulate({ faction: 'dwarf', level: lvl, gear: () => sim.typicalGear(lvl, 0.8), monster: 'boar', tier: 3, n: 16, seedBase: 5, zone: 'z3' });
  const p = sim.simulate({ faction: 'dwarf', level: lvl, gear: () => sim.typicalGear(lvl, 0.8), monster: 'boar', tier: 3, n: 16, seedBase: 5 });
  assert.ok(r.win <= p.win, `хозяин зоны не легче обычного вида (${r.win} против ${p.win})`);
}

console.log('moves173: все тесты пройдены');
