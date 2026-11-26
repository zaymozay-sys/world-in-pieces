/* Regression: preparation spells, failed casts, and local Chaos routing. */
const assert = require('assert');
const fs = require('fs');
const B = require('../js/balance.js');
const Combat = require('../js/combat.js');
const Engine = require('../js/engine.js');
global.Engine = Engine; global.Balance = B;
const AI = require('../js/ai.js');
const source = fs.readFileSync(require.resolve('../js/game.js'), 'utf8');
const get = name => source.slice(source.indexOf('async function '+name+'('),source.indexOf('\n}',source.indexOf('async function '+name+'('))+2);
const bind = (name,ctx) => new Function('ctx','with(ctx){return ('+get(name)+')}')(ctx);
const noop=()=>{};
const f={hp:50,prepUsed:{},mirrorReady:false,tripleNext:false,doubleNext:false};
assert.ok(Combat.freePreparation('chaos') && Combat.freePreparation('temper') && Combat.freePreparation('mirror'));
assert.ok(!Combat.freePreparation('fury') && !Combat.freePreparation('sacrifice'));
assert.ok(Combat.preparedSpellAvailable(f,'mirror'));
assert.ok(!Combat.preparedSpellAvailable({...f,mirrorReady:true},'mirror'));
assert.ok(!Combat.preparedSpellAvailable({...f,tripleNext:true},'sacrifice'));
assert.ok(!Combat.preparedSpellAvailable({...f,doubleNext:true},'fury'));
assert.ok(!Combat.preparedSpellAvailable({...f,hp:1},'sacrifice'));
assert.ok(!Combat.preparedSpellAvailable({...f,prepUsed:{temper:true}},'temper'));
assert.ok(!Combat.preparedSpellAvailable({...f,magic:true},'chaos'));
assert.strictEqual(B.magic.costs.strike,2);
assert.strictEqual(B.magic.costs.transmute,3);
assert.strictEqual(B.magic.costs.heal,4);
assert.strictEqual(B.magic.costs.pierce,4);
assert.strictEqual(B.magic.costs.mirror,6);
function fixture(){
  const data={spent:[],finished:[],turns:0,clear:0};
  const tile=(ti,value=1)=>({ti,value,type:['sapphire','ruby','emerald','onyx'][ti],el:{classList:{add:noop,remove:noop}}});
  const grid=Array.from({length:6},()=>Array(6).fill(null));
  const fighter={name:'Hero',hp:50,max:100,prepUsed:{},mirrorReady:false,tripleNext:false,doubleNext:false};
  const ctx={Combat,fighters:{left:fighter},N:6,ONYX:3,GEM_TYPES:['sapphire','ruby','emerald','onyx'],grid,
    typOf:()=>grid.flat().map(t=>t?t.ti:-1),valOf:()=>grid.flat().map(t=>t?t.value:0),
    clearSelection:noop,stopAim:noop,spendMagic:(_s,_n,k)=>data.spent.push(k),note:noop,_t:s=>s,_nn:n=>n,
    SND:{heal:noop,transmute:noop,chaos:noop},logEvent:noop,sleep:async()=>{},renderFighters:noop,
    afterSpell:async(_s,finish=true)=>{data.finished.push(finish);return 1;},
    setTileValue:(t,v)=>{t.value=v;},setPos:noop,setTimeout:noop,
    temperCells:()=>[{r:1,c:1}].filter(p=>grid[p.r][p.c]&&grid[p.r][p.c].value<5)
  };
  return {ctx,data,grid,fighter,tile};
}
(async()=>{
  let z=fixture();
  const mirror=bind('castMirror',z.ctx);
  await mirror('left');
  assert.strictEqual(z.fighter.mirrorReady,true);
  assert.deepStrictEqual(z.data.spent,['mirror']);
  assert.deepStrictEqual(z.data.finished,[false]);
  assert.strictEqual(await mirror('left'),0);
  assert.deepStrictEqual(z.data.spent,['mirror']);

  z=fixture();z.grid[1][1]=z.tile(1,1);
  const temper=bind('castTemper',z.ctx);
  await temper('left',{r:1,c:1});
  assert.strictEqual(z.grid[1][1].value,3);
  assert.strictEqual(z.fighter.prepUsed.temper,true);
  assert.deepStrictEqual(z.data.finished,[false]);
  assert.strictEqual(await temper('left',{r:1,c:1}),0);
  assert.deepStrictEqual(z.data.spent,['temper']);

  z=fixture();z.grid[1][1]=z.tile(1,5);
  assert.strictEqual(await bind('castTemper',z.ctx)('left',{r:1,c:1}),0);
  assert.deepStrictEqual(z.data.spent,[]);

  z=fixture();z.grid[1][1]=z.tile(3);
  assert.strictEqual(await bind('castTide',z.ctx)('left'),0);
  assert.strictEqual(await bind('castTransmute',z.ctx)('left',{r:1,c:1}),0);
  assert.strictEqual(await bind('castTransmute',z.ctx)('left',{r:1,c:0}),0);
  assert.strictEqual(await bind('castFire',z.ctx)('left',{r:1,c:0},{shape:'point'}),0);
  z.fighter.hp=1; assert.strictEqual(await bind('castSacrifice',z.ctx)('left'),0);
  z.fighter.doubleNext=true; assert.strictEqual(await bind('castFury',z.ctx)('left'),0);
  assert.deepStrictEqual(z.data.spent,[]);

  z=fixture();z.grid[0][0]=z.tile(0);z.grid[0][1]=z.tile(1);
  let counter=0;z.ctx.rnd=n=>(counter++)%n;z.ctx.AI={layoutValue:()=>0};
  const chaos=bind('castChaosArea',z.ctx);
  assert.strictEqual(await chaos('left',{r:0,c:0}),0,'unchanged layout does not spend stones');
  assert.deepStrictEqual(z.data.spent,[]);
  z.ctx.AI={layoutValue:t=>t[0]===1?1:0};
  await chaos('left',{r:0,c:0});
  assert.deepStrictEqual(z.data.spent,['chaos']);
  assert.strictEqual(z.fighter.prepUsed.chaos,true);
  assert.deepStrictEqual(z.data.finished,[false]);
  assert.strictEqual(await chaos('left',{r:0,c:0}),0);

  // The player keeps the action after a failed cast AND after a paid preparation.
  for(const res of [0,1]){
    const calls={pass:0,clear:0};
    const ctx={busy:false,over:false,aimKind:'temper',fighters:{left:{hp:50}},
      Combat,canAffordMagic:()=>true,stopAim:noop,note:noop,_t:s=>s,tipOnce:noop,stopTurnTimer:noop,
      skipStreak:0,renderMagic:noop,invalidStreak:0,LIVE:null,castTemper:async()=>res,
      endPlayerAction:()=>calls.clear++,TUT:()=>false,renderCounters:noop,startTurnTimer:noop,
      afterPlayerSpell:async()=>calls.pass++};
    await bind('playerCast',ctx)({r:0,c:0});
    assert.strictEqual(ctx.busy,false);
    assert.deepStrictEqual(calls,{pass:0,clear:0});
  }
  assert.ok(source.includes("k === 'temper' || k === 'chaos') toggleAim(k)"),'Chaos button uses target selection');
  const typ=Array(36).fill(-1), val=Array(36).fill(0); let seed=12345;
  const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  Engine.fillEmpty(typ,val,rng,B.board.multiplierChance);
  const before=AI.layoutValue(typ,val);
  AI.choose(typ.slice(),val.slice(),100,100,1,{}, {want:[30,0,0]});
  assert.strictEqual(AI.layoutValue(typ,val),before,'Chaos does not inherit AI colour preferences');
  console.log('utility spells: rules, guards, local Chaos and retained turn OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
