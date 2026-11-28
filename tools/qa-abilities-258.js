// Paired spell ablation and medal progression audit. No browser.
const sim=require('./sim'),B=Balance,H=Hero,G=Gear,M=Medals,F=Factions;
const n=Math.max(1,Number(process.argv[2]||8));
for(const level of [35,95]){
  const t=H.tierFor(level),targets=t===4?['wolf','bandit','boar','skeleton']:['golem','wraith','eagle','treant'];
  // Nominal unlocks, independent of the temporary unlock-all testing switch.
  const spells=Object.keys(B.magic.costs).filter(k=>level>=(B.spellUnlock[k]||1));
  const rows=[];
  for(const omit of [null,...spells]){
    let win=0,actions=0,cast=0,by={};
    for(const [ix,faction] of F.ORDER.entries())for(const id of targets){
      sim.seed(level*10+ix);const gear=sim.typicalGear(level,1);
      const r=sim.simulate({faction,level,tier:t,mlvl:level,monster:id,n,gear,seedBase:258,player:()=>sim.humanPlayer({onlySpells:omit?spells.filter(k=>k!==omit):spells}),tune:{fullSpells:true,utility:true}});
      win+=r.win;actions+=r.actions;
      for(const [k,v] of Object.entries(r.bySpell)){by[k]=(by[k]||0)+v;cast+=v;}
    }
    rows.push({omit,win:Math.round(100*win/16),actions:+(actions/16).toFixed(1),casts:cast,by});
  }
  console.log(JSON.stringify({level,spells,rows}));
}
for(const group of M.GROUP_ORDER){
  const ids=M.GROUPS[group].ids(),earned=ids.map(id=>({id}));
  const stats=M.bonusStats(earned);
  console.log(JSON.stringify({group,medals:ids.length,last:ids.at(-1),stats,perk:M.PERKS[group]?.desc||null}));
}
