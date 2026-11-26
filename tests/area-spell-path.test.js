/* Exercise the actual game.js casting path in an isolated board fixture. */
const assert = require('assert');
const fs = require('fs');
const Balance = require('../js/balance.js');
const Combat = require('../js/combat.js');
const gameSource = fs.readFileSync(require.resolve('../js/game.js'), 'utf8');
const castSource = gameSource.slice(gameSource.indexOf('async function castFire('), gameSource.indexOf('// Конец действия стороны:'));
const afterSource = gameSource.slice(gameSource.indexOf('async function afterSpell('), gameSource.indexOf('// Меняет номинал камня'));
const resolveSource = gameSource.slice(gameSource.indexOf('async function resolveBoard('), gameSource.indexOf('// Хитрость (см. Combat.cunningSteal)'));
function fixture() {
  const noop = () => {};
  const element = () => ({ style: { setProperty: noop }, classList: { add: noop, remove: noop }, appendChild: noop, remove: noop });
  const grid = Array.from({length: 6}, () => Array.from({length: 6}, () => ({ type: 'ruby', ti: 1, value: 1, el: element() })));
  grid[2][2] = {type: 'onyx', ti: 3, value: 1, el: element()};
  const count = { sapphire:20, ruby:20, emerald:20, onyx:0 };
  const f = {counts:count, name:'Hero', magic:false, buffs:[]};
  const data = { charge:0, mult:0, damage:0, cascade:0, finish:null };
  const ctx = {
    N:6, ONYX:3, FIRE_RADIUS:2, grid, Balance, Combat, fighters:{left:f,right:{}},
    other:()=> 'right', stopAim:noop, clearSelection:noop, note:noop, SND:{fire:noop}, wispBlocks:()=>false,
    spendMagic:(_side,_sign,kind)=>{for(const key of ['sapphire','ruby','emerald']) count[key]-=Balance.magic.costs[kind];},
    facOn:()=>true, factionOf:()=>({gem:'ruby'}), document:{createElement:element},
    renderCounters:noop, addCharge:n=>{data.charge+=n;}, turnStats:{stones:0}, Sky:{spellMul:()=>1}, selNow:noop,
    dealDamage:(_target,n,_raw,_cover,m)=>{data.damage=n;data.mult=m;return n*m;}, logEvent:noop, _t:s=>s,
    sleep:async()=>{}, RULES:{timing:{burn:0,fall:0,shift:0}}, sideDown:()=>false, flushTurnDamage:()=>false,
    checkEnd:()=>false, gravityDown:noop, shiftRight:noop,
    afterSpell:async(_side,finish,m)=>{data.finish=finish;data.cascade=m;return 1;}
  };
  const castFire = new Function('ctx','with(ctx){return ('+castSource+')}')(ctx);
  return {castFire,count,data};
}
(async () => {
  const cross = fixture(); await cross.castFire('left',{r:2,c:2});
  assert.deepStrictEqual(cross.count,{sapphire:16,ruby:16,emerald:16,onyx:0});
  assert.strictEqual(cross.data.charge,0);
  assert.strictEqual(cross.data.mult,2);
  assert.strictEqual(cross.data.cascade,1);
  assert.strictEqual(cross.data.finish,true);

  const square = fixture(); await square.castFire('left',{r:2,c:2},{shape:'square'});
  assert.deepStrictEqual(square.count,{sapphire:17,ruby:25,emerald:17,onyx:1});
  assert.strictEqual(square.data.charge,8);
  assert.strictEqual(square.data.mult,1.5);
  assert.strictEqual(square.data.cascade,1.25);
  assert.strictEqual(square.data.finish,true);
  assert.strictEqual(cross.data.damage,square.data.damage,'same obsidian sum and fixed damage');

  const bomb = fixture(); await bomb.castFire('left',{r:2,c:2},{shape:'square',free:true});
  assert.deepStrictEqual(bomb.count,{sapphire:20,ruby:28,emerald:20,onyx:1});
  assert.strictEqual(bomb.data.cascade,1,'free bomb is not Grasp');

  const claw = fixture(); await claw.castFire('left',{r:2,c:2},{shape:'row',free:true,forceFinish:true,collect:true});
  assert.strictEqual(claw.count.ruby,25);
  assert.strictEqual(claw.data.cascade,1);
  assert.strictEqual(claw.data.finish,true);

  // The modifier is forwarded to resolveBoard only for this call, not the next action.
  const multipliers=[];
  const ctx={fighters:{left:{magic:false}},Combat,turnStats:{},resolveBoard:async(_s,m)=>{multipliers.push(m);return true;},
    logTurn:()=>{},flushTurnDamage:()=>false,renderMagic:()=>{},checkEnd:()=>false,isEmptyBoard:()=>false,
    Engine:{hasMoves:()=>true},typOf:()=>[],finishAction:()=>2};
  const afterSpell=new Function('ctx','with(ctx){return ('+afterSource+')}')(ctx);
  await afterSpell('left',true,1.25); await afterSpell('left');
  assert.deepStrictEqual(multipliers,[1.25,1]);
  // Actual resolveBoard damage uses the scoped multiplier; resource gain stays unchanged.
  async function cascadeFixture(mult) {
    const noop=()=>{}, counts={onyx:0}, damage=[];
    const f={counts,magic:false}, grid=Array.from({length:6},()=>Array(6).fill(null));
    for(let i=0;i<3;i++) grid[0][i]={type:'onyx',ti:3,value:1,el:{classList:{add:noop},remove:noop}};
    const bon=Array(36).fill(0); bon[0]=bon[1]=bon[2]=1;
    let first=true;
    const ctx={N:6,ONYX:3,MAGIC_TYPES:['sapphire','ruby','emerald'],fighters:{left:f,right:{}},grid,
      other:()=> 'right',typOf:()=>[],valOf:()=>[],
      Engine:{bonusMap:()=>{if(first){first=false;return bon;}return null;},obsidianBurst:(_t,b)=>b},
      facOn:()=>false,wispBlocks:()=>false,turnStats:{stones:0,dmg:0,bonus:1},SND:{match:noop},
      renderCounters:noop,addCharge:noop,showFloat:noop,flushTurnDamage:()=>false,sleep:async()=>{},
      RULES:{timing:{clear:0,fall:0,shift:0}},dealDamage:(_t,d,_r,_c,m)=>{damage.push([d,m]);return d*m;},
      sideDown:()=>false,gravityDown:noop,shiftRight:noop,applyCunning:noop
    };
    const resolveBoard=new Function('ctx','with(ctx){return ('+resolveSource+')}')(ctx);
    const extra=await resolveBoard('left',mult);
    return {counts,damage,extra};
  }
  assert.deepStrictEqual(await cascadeFixture(1.25),{counts:{onyx:3},damage:[[3,1.25]],extra:false});
  assert.deepStrictEqual(await cascadeFixture(),{counts:{onyx:3},damage:[[3,1]],extra:false});
  console.log('area spell paths: cross, grasp, bomb, claw and scoped cascade OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
