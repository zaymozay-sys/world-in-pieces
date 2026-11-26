/* Equipment and consumable parity checks for the balance simulator. */
const assert=require('assert'),sim=require('../tools/sim.js'),B=require('../js/balance.js'),Combat=require('../js/combat.js'),Gear=require('../js/items.js');
const f=sim.makeHero({faction:'human',level:91,gear:sim.STARTER});
assert.deepStrictEqual(f.weaponPerk,Gear.weaponPerk(f.gear));
assert.deepStrictEqual(f.stats,Gear.combine(Gear.statsFor(f.gear,91),Factions.statsAt('human',Hero.tierFloat(91))));
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
console.log('equipment and storm parity OK');
