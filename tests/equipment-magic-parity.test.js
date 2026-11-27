/* Equipment and consumable parity checks for the balance simulator. */
const assert=require('assert'),sim=require('../tools/sim.js'),B=require('../js/balance.js'),Combat=require('../js/combat.js'),Gear=require('../js/items.js');
const f=sim.makeHero({faction:'human',level:91,gear:sim.STARTER});
assert.deepStrictEqual(f.weaponPerk,Gear.weaponPerk(f.gear));
assert.deepStrictEqual(f.stats,Gear.combine(Gear.statsFor(f.gear,91),Factions.statsAt('human',Hero.tierFloat(91))));
// Из одного и того же снаряжения симулятор должен получить руны, огранку и самоцветы ровно один раз.
{
  const Runes = require('../js/runes.js');
  const gear = Gear.emptyLoadout();
  gear.main = { ...Gear.makeEntry('sword-novice', 9), runes: ['rune-might', 'rune-might'], cut: 9, gems: [1, 8] };
  const extra = { health: 20, power: 3 };
  const naked = Gear.combine(Gear.statsFor(gear,91),Factions.statsAt('human',Hero.tierFloat(91)));
  const bonuses = Runes.bonusForGear(gear);
  assert.ok(bonuses.power > 4 && bonuses.defense > 0);
  const expected = Gear.combine(Gear.combine(naked, bonuses), extra);
  const hero = sim.makeHero({faction:'human',level:91,gear,extra});
  assert.deepStrictEqual(hero.stats, expected);
  assert.strictEqual(hero.max, Hero.baseHp(91) + expected.health);
  const normal = Combat.heroPreview(Hero.baseHp(91), Hero.dmgMult(91), expected);
  assert.deepStrictEqual(normal, {max:hero.max,dmg:hero.dmg,stats:hero.stats});
  const debug = Combat.heroPreview(Hero.baseHp(91), Hero.dmgMult(91), expected, 10);
  const capped = Gear.combine(Object.fromEntries(Object.entries(expected).map(([k,v])=>[k,v*10])), {});
  assert.deepStrictEqual(debug.stats, capped);
  assert.strictEqual(debug.max, Hero.baseHp(91)*10+capped.health);
  assert.strictEqual(debug.dmg, Hero.dmgMult(91)*10);
}
// Старые расходники используют цвет бойца, а не цвет 1 или уровень ИИ.
for (const fighter of [sim.makeHero({faction:'human',level:91,baseHp:10000}), sim.makeMonster('wraith',10,{level:91,aiLevel:20})]) {
  fighter.hp = 1;
  const effect = Combat.useConsumable(fighter, 'potion', ['sapphire','ruby','emerald']);
  assert.strictEqual(effect.heal, Math.min(fighter.max-1,Elixirs.heal(10)));
  assert.strictEqual(Combat.useConsumable(fighter,'elixir',[]).pct,Elixirs.powerPct(10));
}
function stormBattle(){
  sim.seed(51);
  const h=sim.makeHero({faction:'human',level:91,gear:sim.STARTER,bag:{'storm@10':1},baseHp:10000});
  const m=sim.makeMonster('wraith',10,{level:91,aiLevel:20});
  let used=false,checked=false;
  const p=sim.humanPlayer({useMagic:false}),choose=p.choose;
  p.items=(S,h,use)=>{if(!used){used=use('left','storm@10');assert.ok(used);}};
  p.choose=(S,h,A,l)=>{if(!checked){checked=true;assert.strictEqual(h.stormMult,B.consumables.ladders.storm[9]);assert.strictEqual(h.magic,true);}return choose(S,h,A,l);};
  sim.Battle(h,m,p).run(3);
  assert.ok(used&&checked);assert.strictEqual(h.stormMult,0);assert.strictEqual(h.magicFree,false);
}
stormBattle();
// Подготовка расходников: реальные запасы и только собственный вид боеприпаса.
{
  const cases = [['human','bolt'],['dwarf','bomb'],['elf','moonarrow'],['lizard','dart']];
  for (const [faction,kind] of cases) {
    const stock = { [kind]: 3, [kind+':light']: 1, 'not-stock': 999 };
    const r = sim.simulate({ faction, level: 51, monster:'troll',tier:6,n:3,baseHp:10000,ammo:stock,aiLevel:10,seedBase:731 });
    assert.ok((r.ammoUsed[kind]||0)+(r.ammoUsed[kind+':light']||0)>0, faction);
    assert.ok((r.ammoUsed[kind]||0)<=9 && (r.ammoUsed[kind+':light']||0)<=3);
    assert.strictEqual(r.ammoUsed['not-stock'],undefined);
    assert.strictEqual(stock[kind],3,'запас профиля не изменяется моделью');
  }
  const h=sim.makeHero({faction:'human',level:91,baseHp:10000,elixirs:{road:10}});
  const m=sim.makeMonster('wraith',10,{level:91,aiLevel:1});
  const initial=h.hp, max=h.max;
  let checked=false;
  const p=sim.humanPlayer({useMagic:false}),choose=p.choose;
  p.choose=(S,h,A,l)=>{if(!checked){checked=true;assert.ok(h.max>max);assert.ok(h.hp<=initial,'тоник не восстанавливает ХП');}return choose(S,h,A,l);};
  sim.Battle(h,m,p).run(3);
  assert.ok(checked);
}
{
  const World=require('../js/world.js'),Pets=require('../js/pets.js');
  const base=sim.makeHero({faction:'human',level:91});
  assert.strictEqual(sim.makeHero({faction:'human',level:91,bless:'might'}).dmg,base.dmg*(1+World.BLESSINGS.might.amount/100));
  const blessed=sim.makeHero({faction:'human',level:91,bless:'stone'});
  assert.strictEqual(blessed.max,Math.round(base.max*(1+World.BLESSINGS.stone.amount/100)));
  sim.seed(4);
  const h=sim.makeHero({faction:'human',level:91,elixirs:{defense:10},elxExtra:5,bless:'stone',baseHp:10000});
  const m=sim.makeMonster('wraith',10,{level:91,aiLevel:1});
  const p=sim.humanPlayer({useMagic:false}),choose=p.choose;
  let checked=false;
  p.choose=(S,h,A,l)=>{if(!checked){checked=true;const plan={};Elixirs.drink(plan,'defense',10,5);assert.deepStrictEqual(h.elx.defense,plan.defense);assert.strictEqual(h.max,Math.round((h.base+h.stats.health)*(1+World.BLESSINGS.stone.amount/100)));}return choose(S,h,A,l);};
  sim.Battle(h,m,p).run(3);assert.ok(checked);
  const pet=Pets.makePet('dog',10);pet.xp=8000;pet.traits=['sturdy','loyal'];
  Pets.evolve(pet,'warden');Pets.evolve(pet,'warden');
  for (let i=0;i<10;i++) Pets.gearUp(pet,'harness');
  Pets.giveTreat(pet,'apple');
  const before=JSON.stringify(pet);
  const prepared=sim.petAsHero({entry:pet},91);
  assert.ok(prepared.h.max>sim.petAsHero({species:'dog',tier:10,int:50},91).h.max);
  assert.ok(prepared.intl>=Pets.intellect(pet));
  assert.strictEqual(JSON.stringify(pet),before,'модель не тратит угощение настоящего профиля');
}
console.log('equipment and storm parity OK');
