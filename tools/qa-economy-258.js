// Economic screening, all 100 hero levels; no browser. node tools/qa-economy-258.js [n=4]
const sim=require('./sim'),H=Hero,G=Gear,B=Bestiary,E=Elixirs,F=Factions;
const Hex=require('../js/hexmap'),W=require('../js/world'),Forge=require('../js/forge'),Ammo=require('../js/ammo');
const n=Math.max(1,Number(process.argv[2]||4)),map=Hex.generate(Hex.sharedSeed()),world=W.place(map);
Hex.ensureCoverage(map,[...world.events,...world.lairs,...world.landmarks].map(x=>x.idx));
const sources=Array.from({length:11},()=>new Set());
for(const [t,f] of [[8,3],[9,7],[10,8]]){const m=Hex.generate(Hex.sharedSeed('tower'),'tower',f);Hex.ensureCoverage(m);for(const s of m.spawns)for(const d of B.MONSTERS[s.species].drops)if(d[1]>0)sources[s.tier].add(d[0]);}
for(const s of map.spawns)for(const d of B.MONSTERS[s.species].drops)if(d[1]>0)sources[s.tier].add(d[0]);
const resourceCost=(kind,t)=>Math.min(...Forge.ownList(kind,t).filter(k=>sources[t].has(k)).map(k=>B.resSellPrice(k,t)));
const elixirCost=(key)=>{const {kind,tier}=E.split(key);return E.KINDS[kind].noBrew?0:E.price(tier)+E.need(tier)*resourceCost(kind,tier);};
const repair=gear=>Object.entries(gear).reduce((a,[slot,e])=>!e||G.WEAR_SLOTS_SKIP.includes(slot)?a:a+G.repairCost({...e,dur:G.durMax(e.tier)-1},1),0);
const sum=(values,fn)=>Object.entries(values).reduce((a,[k,v])=>a+v*fn(k),0);
const sets={human:'crown',dwarf:'rune',elf:'grove',lizard:'scale'};
function fitted(faction,level,t){
  let gear=G.emptyLoadout();
  const pool=G.itemsFor(faction);
  for(const i of pool.filter(i=>i.set===sets[faction])){
    const e=G.makeEntry(i.id,t),slot=G.SLOTS.find(s=>!gear[s]&&G.canEquip(gear,e,s,faction,level).ok);
    if(slot)gear=G.equip(gear,e,slot);
  }
  for(const slot of G.SLOTS)if(!gear[slot]){
    const choices=pool.filter(i=>G.fits(slot,i.type)).map(i=>G.makeEntry(i.id,t)).filter(e=>G.canEquip(gear,e,slot,faction,level).ok);
    choices.sort((a,b)=>G.item(b).cost-G.item(a).cost);
    if(choices.length)gear=G.equip(gear,choices[0],slot);
  }
  return gear;
}
const ammoCraft=(key,level,t)=>{
  const kind=Ammo.parse(key).kind,unit=H.battleConsumablePrice(Ammo.CATALOG[kind].price,level);
  return Math.min(...[...sources[t]].filter(k=>B.RESOURCES[k]).map(k=>(Ammo.brewNeed(null,unit,B.resPrice(k,t))*B.resSellPrice(k,t)+Ammo.brewFee(unit))/Ammo.brewOut(null,1)));
};
const rows=[];
for(let level=1;level<=100;level++){
  const t=H.tierFor(level),targets=map.spawns.filter(s=>s.tier===t&&!s.boss&&!s.zone&&!s.guard&&!Hex.SPAWN[s.species]?.rare);
  const total=Object.fromEntries(['none','light','full','fitted','fittedLight','fittedHeal','fittedPower','fittedShot'].map(k=>[k,{wins:0,net:0,cost:0}]));
  for(const [ix,faction] of F.ORDER.entries()){
    const target=targets[(level*7+ix*13)%targets.length],id=target.species;
    sim.seed(level*100+ix);const gear=sim.typicalGear(level,.9);
    const kind=G.shotKind(gear)||Ammo.forFaction(faction);
    const coin=B.coinsAt(id,t,Hex.lvlOf(target))*F.perk(faction,'coins');
    const res=B.MONSTERS[id].drops.reduce((a,[k,p,lo,hi])=>a+Math.min(1,p/(Balance.gameLength||1))*(lo+hi)/2*B.resSellPrice(k,t),0);
    const loot=coin+res,better=fitted(faction,level,t),shot=G.shotKind(better)||Ammo.forFaction(faction);
    const profiles={none:{},light:{elixirs:{health:t,power:t},ammo:{[kind]:2}},full:{elixirs:Object.fromEntries(E.ORDER.filter(k=>!E.KINDS[k].noBrew&&k!=='food').map(k=>[k,t])),ammo:{[kind]:5}},fitted:{gear:better},fittedLight:{gear:better,elixirs:{health:t,power:t},ammo:{[shot]:2}},fittedHeal:{gear:better,elixirs:{health:t}},fittedPower:{gear:better,elixirs:{power:t}},fittedShot:{gear:better,ammo:{[shot]:1}}};
    for(const [name,opts] of Object.entries(profiles)){
      const g=opts.gear||gear,fix=repair(g);
      const r=sim.simulate({faction,level,monster:id,tier:t,mlvl:Hex.lvlOf(target),gear,n,seedBase:258,player:()=>sim.humanPlayer({onlySpells:Object.keys(Balance.magic.costs).filter(k=>level>=(Balance.spellUnlock[k]||1))}),...opts});
      const expense=(sum(r.elixirsUsed,elixirCost)+sum(r.ammoUsed,k=>name.startsWith('fitted')?ammoCraft(k,level,t):H.battleConsumablePrice(Ammo.CATALOG[Ammo.parse(k).kind].price,level)*F.perk(faction,'shop')))/n;
      const a=total[name];a.wins+=r.win/4;a.cost+=expense/4;a.net+=(r.win*loot-expense-(1-r.win)*fix)/4;
    }
  }
  rows.push({level,tier:t,...Object.fromEntries(Object.entries(total).map(([k,v])=>[k,{win:Math.round(v.wins*100),cost:Math.round(v.cost),net:Math.round(v.net)}]))});
}
console.log(JSON.stringify({n,rows},null,2));
