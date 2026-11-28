// High-tier recurring economy. No browser; matched fights, resale and repair.
// node tools/qa-high-economy-258.js 12 [first-level] [last-level]
const sim=require('./sim'), H=Hero,G=Gear,B=Bestiary,E=Elixirs,F=Factions;
const Hex=require('../js/hexmap'),W=require('../js/world'),Forge=require('../js/forge'),Ammo=require('../js/ammo');
const n=Math.max(1,Number(process.argv[2]||12));
const first=Math.max(51,Number(process.argv[3]||51)),last=Math.min(100,Number(process.argv[4]||100));
const map=Hex.generate(Hex.sharedSeed()),world=W.place(map);
Hex.ensureCoverage(map,[...world.events,...world.lairs,...world.landmarks].map(x=>x.idx));
const sources=Array.from({length:11},()=>new Set());
for(const [t,f] of [[8,3],[9,7],[10,8]]){const m=Hex.generate(Hex.sharedSeed('tower'),'tower',f);Hex.ensureCoverage(m);for(const s of m.spawns)for(const d of B.MONSTERS[s.species].drops)if(d[1]>0)sources[s.tier].add(d[0]);}
for(const s of map.spawns)for(const d of B.MONSTERS[s.species].drops)if(d[1]>0)sources[s.tier].add(d[0]);
const sum=(a)=>a.reduce((s,x)=>s+x,0);
const mean=a=>sum(a)/a.length;
const sets={human:'crown',dwarf:'rune',elf:'grove',lizard:'scale'};
function gearFor(faction,level,t,complete){
  let gear=G.emptyLoadout();
  const pool=G.itemsFor(faction);
  if(complete)for(const i of pool.filter(i=>i.set===sets[faction])){
    const e=G.makeEntry(i.id,t),slot=G.SLOTS.find(s=>!gear[s]&&G.canEquip(gear,e,s,faction,level).ok);
    if(slot)gear=G.equip(gear,e,slot);
  }
  else for(const [slot,id] of Object.entries(sim.STARTER))if(id)gear[slot]=G.makeEntry(id,t);
  for(const slot of G.SLOTS)if(!gear[slot]){
    const choices=pool.filter(i=>G.fits(slot,i.type)&&!i.relic&&(complete||i.rarity==='common')).map(i=>G.makeEntry(i.id,t)).filter(e=>G.canEquip(gear,e,slot,faction,level).ok);
    choices.sort((a,b)=>G.item(b).cost-G.item(a).cost);
    if(choices.length)gear=G.equip(gear,choices[0],slot);
  }
  return gear;
}
const resale=(id,t,mode)=>{const it=G.item({id,tier:t});return mode==='shop'?G.sellValue(it.price,t):mode==='junk'?G.junkValue(it.price):Math.max(G.sellValue(it.price,t),G.junkValue(it.price));};
function itemLoot(faction,t,mode){
 const values=[];for(const i of G.itemsFor(faction))for(let k=0;k<({common:6,rare:3,epic:1}[i.rarity]);k++)
   values.push(.7*resale(i.id,t,mode)+.3*resale(i.id,Math.max(1,t-1),mode));
 return mean(values)*Balance.rewards.itemChance;
}
function repair(gear,faction){return sum(Object.entries(gear).map(([slot,e])=>!e||G.WEAR_SLOTS_SKIP.includes(slot)?0:Math.max(1,Math.round(G.repairCost({...e,dur:G.durMax(e.tier)-1},1)*F.perk(faction,'forge')))));}
const elixirCost=(kind,t)=>E.price(t)+E.need(t)*Math.min(...Forge.ownList(kind,t).filter(k=>sources[t].has(k)).map(k=>B.resSellPrice(k,t)));
const ammoCost=(kind,level,t)=>{const u=H.battleConsumablePrice(Ammo.CATALOG[kind].price,level);return Math.min(...[...sources[t]].map(k=>(Ammo.brewNeed(null,u,B.resPrice(k,t),1)*B.resSellPrice(k,t)+Ammo.brewFee(u))/Ammo.brewOut(null,1)));};
const rows=[];
for(let level=first;level<=last;level++){
 const t=H.tierFor(level);
 for(const [ix,faction] of F.ORDER.entries())for(const complete of [false,true]){
   const gear=gearFor(faction,level,complete?t:t-1,complete),stats=G.combine(G.statsFor(gear,level),F.statsAt(faction,H.tierFloat(level)));
   const hv={max:H.baseHp(level)+stats.health,dmg:H.dmgMult(level),stats};
   const eligible=map.spawns.filter(s=>s.tier===t&&!s.boss&&!s.zone&&!s.guard&&!Hex.SPAWN[s.species]?.rare);
   const ranked=eligible.map(s=>{const sc=B.scaledAt(s.species,Hex.lvlOf(s),1,level);return {s,p:Combat.winChance(hv,{max:sc.hp,dmg:sc.dmg,stats:sc.stats,ai:sc.ai},s.species)};}).sort((a,b)=>b.p-a.p);
   for(const target of [ranked[ix%Math.min(3,ranked.length)].s,eligible[(level*7+ix*13)%eligible.length]]){
     const id=target.species,mlvl=Hex.lvlOf(target),kind=G.shotKind(gear)||Ammo.forFaction(faction);
     const coins=B.coinsAt(id,t,mlvl)*F.perk(faction,'coins');
     const res=sum(B.MONSTERS[id].drops.map(([k,p,lo,hi])=>Math.min(1,p/(Balance.gameLength||1))*(lo+hi)/2*B.resSellPrice(k,t)));
     const items=itemLoot(faction,t,'best'),fix=repair(gear,faction);
     for(const [profile,opts] of Object.entries({none:{},heal:{elixirs:{health:t}},shot:{ammo:{[kind]:1}},power:{elixirs:{power:t}}})){
       const r=sim.simulate({faction,level,tier:t,mlvl,monster:id,gear,n,seedBase:258,player:()=>sim.humanPlayer({onlySpells:Object.keys(Balance.magic.costs).filter(k=>level>=(Balance.spellUnlock[k]||1))}),...opts});
       const fee=sum(Object.entries(r.elixirsUsed).map(([key,v])=>v*elixirCost(E.split(key).kind,t)))/n;
       const shots=sum(Object.values(r.ammoUsed))/n,ammo=shots*ammoCost(kind,level,t);
       const loot=coins+res+items,loss=(1-r.win)*fix;
       rows.push({level,t,faction,complete,target:id,mlvl,profile,win:r.win,coins,res,items,fix,fee,ammo,net:r.win*loot-loss-fee-ammo,
         cash:r.win*(coins+res*.5+items*.5)-loss-fee-ammo,
         cheapRepair:r.win*loot-loss*(t>=8?.6:.8)-fee-ammo,
         cheaperSupplies:r.win*loot-loss-fee*.7-ammo*.7});
     }
   }
 }
}
console.log(JSON.stringify({n,rows}));
