/* Pet spell isolation, shared prices and capped preparation burst; real game.js paths. */
const assert=require('assert'),fs=require('fs');
const sim=require('../tools/sim.js'),B=require('../js/balance.js'),Combat=require('../js/combat.js'),Pets=require('../js/pets.js');
const source=fs.readFileSync(require.resolve('../js/game.js'),'utf8');
const get=name=>source.slice(source.indexOf('async function '+name+'('),source.indexOf('\n}',source.indexOf('async function '+name+'('))+2);
const bind=(name,ctx)=>new Function('ctx','with(ctx){return ('+get(name)+')}')(ctx);
assert.deepStrictEqual(B.petMagic.costs,{fang:3,lick:4,claw:4});
assert.strictEqual(Combat.spellCost({isPet:true,buffs:[]},'claw'),4);
assert.strictEqual(Combat.spellCost({isPet:true,buffs:[]},'lightning'),Infinity);
assert.strictEqual(Combat.spellCost({buffs:[]},'lightning'),B.magic.costs.lightning);
assert.strictEqual(Combat.preparationDamageMult({tripleNext:true}),3);
assert.strictEqual(Combat.preparationDamageMult({doubleNext:true}),2);
assert.strictEqual(Combat.preparationDamageMult({tripleNext:true,doubleNext:true}),4);

const t=Array(36).fill(-1),v=Array(36).fill(0);
for(let i=0;i<6;i++){t[i]=0;v[i]=1;}
for(let i=6;i<11;i++){t[i]=3;v[i]=5;}
const f={counts:{sapphire:10,ruby:10,emerald:10},hp:100,max:100};
assert.strictEqual(Pets.petBestRow(t,v,f,{}).r,1,'valuable row, not simply most occupied');
assert.strictEqual(Pets.petBestRow(t,v,f,{},false).r,0,'donor breath keeps old row selection');

(async()=>{
  const noop=()=>{},spent=[],finish=[],f={hp:50,max:100,name:'pet'};
  const ctx={fighters:{left:f},Balance:B,clearSelection:noop,spendMagic:(_s,_n,k)=>spent.push(k),note:noop,_t:s=>s,SND:{heal:noop},showFloat:noop,logEvent:noop,renderFighters:noop,sleep:async()=>{},afterSpell:async(...a)=>{finish.push(a);return 1;}};
  const lick=bind('castPetLick',ctx);
  await lick();assert.strictEqual(f.hp,80);assert.deepStrictEqual(spent,['lick']);
  assert.strictEqual(f.petLastHealTurn,0,'successful heal records the current turn');
  f.hp=100;assert.strictEqual(await lick(),0);assert.deepStrictEqual(spent,['lick']);
  let used=null;const claw=bind('castPetClaw',{Balance:B,petBestRow:()=>({r:1}),spendMagic:(_s,_n,k)=>spent.push(k),castFire:async(_s,cell,opts)=>{used={cell,opts};return 1;},_t:s=>s});
  await claw();assert.deepStrictEqual(used.cell,{r:1,c:0});assert.deepStrictEqual(used.opts.damageRule,B.petMagic.clawDamage);
  assert.strictEqual(used.opts.collect,true);assert.strictEqual(used.opts.forceFinish,true);
  assert.deepStrictEqual(spent,['lick','claw']);
  const noClaw=bind('castPetClaw',{petBestRow:()=>({r:-1}),spendMagic:()=>{throw Error('invalid charge');}});
  assert.strictEqual(await noClaw(),0);

  sim.seed(21);
  const {h,intl}=sim.petAsHero({species:'dog',tier:1,int:40},1);
  h.counts={sapphire:20,ruby:20,emerald:20,onyx:0};
  let checked=false;
  const p=sim.petPlayer(intl),choose=p.choose;
  p.choose=(S,f,A,l)=>{assert.deepStrictEqual(Object.keys(A).sort(),['claw','fang','lick']);checked=true;return choose(S,f,A,l);};
  const r=sim.Battle(h,sim.makeMonster('rat',1,{level:1,aiLevel:15}),p).run();
  assert.ok(checked);assert.ok(Object.keys(r.stats.bySpell).every(k=>['fang','lick','claw'].includes(k)));

  // Health bonuses are applied in petFighter, not a second time when entering the board.
  const mk=Pets.makePet('dog',7);mk.xp=2000;mk.trust=100;mk.traits=['sturdy','loyal'];mk.gear={harness:7};
  assert.ok(Pets.petMul(mk,'hp')>1);
  assert.strictEqual(Pets.boardHp(mk),Pets.BOARD_HP);
  const rare=Pets.makePet('griffinchick',7);rare.xp=2000;rare.trust=100;
  assert.strictEqual(Pets.boardHp(rare),Pets.BOARD_HP*1.35);

  // Earlier claw choice, an ordinary low-risk position after a heal, and a finishing attack.
  const tactical=sim.petAsHero({species:'dog',tier:1,int:25},1).h;
  const enemy=sim.makeMonster('rat',1,{level:1});
  tactical.counts={sapphire:10,ruby:10,emerald:10,onyx:0};
  const board=Array(36).fill(0),values=Array(36).fill(1);
  tactical.hp=tactical.max;enemy.hp=enemy.max=1000;
  assert.strictEqual(Pets.petSpellPlan(tactical,enemy,board,values,25,['claw']),'claw');
  assert.strictEqual(Pets.petSpellPlan(tactical,enemy,board,values,24,['claw']),null);
  tactical.max=1000;tactical.hp=300;tactical.turnNo=8;tactical.petLastHealTurn=7;
  assert.notStrictEqual(Pets.petSpellPlan(tactical,enemy,board,values,25),'lick');
  enemy.hp=1;
  assert.strictEqual(Pets.petSpellPlan(tactical,enemy,board,values,25),'fang');

  const pair=sim.simulate({faction:'human',level:1,baseHp:1,gear:Gear.emptyLoadout(),monster:'rat',tier:1,n:20,seedBase:255,duo:{species:'dog',tier:10,int:90}});
  assert.strictEqual(pair.win,pair.strictWin,'hero death may not be rescued by the pet');
  assert.ok(Math.abs(pair.killsPerBattle-2*pair.win)<1e-9,'losing both-board outcomes grant no kills');

  for(const faction of ['human','lizard']){
    sim.seed(40);const h=sim.makeHero({faction,level:1,baseHp:1000,gear:sim.STARTER});h.charge=B.faction.charge;
    const p=sim.humanPlayer({useMagic:false}),choose=p.choose;let checked=false;
    p.choose=(S,f,A,l)=>{
      if(!checked){checked=true;if(faction==='human')assert.ok(f.buffs.some(b=>b.kind==='banner'&&b.pct===B.faction.banner.pct));
        else assert.ok(S.f.right.poison?.layers?.length===1);}
      return choose(S,f,A,l);
    };
    sim.Battle(h,sim.makeMonster('rat',1,{level:1,aiLevel:15}),p).run(3);assert.ok(checked);
  }
  console.log('pet magic, faction parity, scoped combo cap OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
