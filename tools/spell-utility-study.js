/* Compare current spell utility rules against the preceding cascade candidate.
   node tools/spell-utility-study.js --n=50 --seed=20261201 */
const sim=require('./sim.js'), B=require('../js/balance.js');
const n=Number(process.argv.find(a=>a.startsWith('--n='))?.split('=')[1]||50);
const seedBase=Number(process.argv.find(a=>a.startsWith('--seed='))?.split('=')[1]||20261201);
if(!Number.isInteger(n)||n<1||n>10000||!Number.isInteger(seedBase))throw Error('Invalid n or seed');
const saved={...B.magic.costs},free=B.magic.freePrep.slice();
for(const name of ['oldRules','candidateMixed','candidateNoMirror','candidateMirrorOnly','candidateForcedCombo']){
  Object.assign(B.magic.costs,saved);B.magic.freePrep=free.slice();
  if(name==='oldRules'){Object.assign(B.magic.costs,{transmute:4,heal:5,temper:3,mirror:5,strike:3,pierce:6});B.magic.freePrep=[];}
  const factory=()=>{
    const p=sim.humanPlayer({onlySpells:name==='candidateMirrorOnly'?['mirror']:null}), choose=p.choose;
    if(name==='candidateNoMirror')p.choose=(S,h,A,locked)=>{A.mirror=false;return choose(S,h,A,locked);};
    if(name==='candidateForcedCombo')p.choose=(S,h,A,locked)=>{
      if(A.fury&&h.tripleNext&&!h.doubleNext)return {kind:'fury'};
      if(A.sacrifice&&!h.tripleNext&&!h.doubleNext&&h.hp>h.max*.65&&A.lightning)return {kind:'sacrifice'};
      return choose(S,h,A,locked);
    };
    return p;
  };
  const rows=[],bySpell={},burst={maxShare:0,halfHits:0,fullHits:0,totalHits:0};
  for(const faction of ['dwarf','human','elf','lizard'])for(const [monster,level,tier] of [['rat',1,1],['bandit',21,3],['troll',61,7]]){
    const r=sim.simulate({monster,level,tier,faction,n,seedBase,aiLevel:35,gear:level===1?sim.STARTER:()=>sim.typicalGear(level),
      player:factory,tune:{fullSpells:true,economic:true,utility:true}});
    rows.push({faction,level,win:r.win,rounds:r.rounds,spells:r.spells});
    for(const[k,v] of Object.entries(r.bySpell))bySpell[k]=(bySpell[k]||0)+v;
    burst.maxShare=Math.max(burst.maxShare,r.burst.maxShare);for(const k of ['halfHits','fullHits','totalHits'])burst[k]+=r.burst[k];
  }
  console.log(JSON.stringify({name,battles:n*rows.length,win:rows.reduce((s,r)=>s+r.win,0)/rows.length,bySpell,burst,rows}));
}
Object.assign(B.magic.costs,saved);B.magic.freePrep=free;
