/* Ordinary PvE income, liquidation and upgrade cost audit. Read-only, no game state. */
const fs=require('node:fs');
require('./sim.js');
const H=global.Hero,G=global.Gear,B=global.Balance,Be=global.Bestiary,F=global.Factions,E=global.Elixirs;
const MapRules=require('../js/hexmap.js'),P=require('../js/pets.js'),A=require('../js/ammo.js'),Forge=require('../js/forge.js');
let state=256;const rand=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
const n=Number(process.env.WIP_N||400),factions=F.ORDER;
function species(t){return Be.ORDER.filter(id=>{const s=MapRules.SPAWN[id],m=Be.MONSTERS[id];return s&&s.tiers[0]<=t&&s.tiers[1]>=t&&!s.fixed&&!s.rare&&!m.boss&&!m.hidden;});}
function gearKit(t,f){let gear=G.emptyLoadout();const pool=G.itemsFor(f).filter(i=>i.rarity==='common');for(const slot of G.SLOTS){const options=pool.filter(i=>G.fits(slot,i.type)&&(slot!=='main'||i.type==='weapon1')).sort((a,b)=>a.cost-b.cost||a.id.localeCompare(b.id));const ordered=options.length?[...options.slice(Math.floor(options.length/2)),...options.slice(0,Math.floor(options.length/2))]:[];for(const it of ordered){const e=G.makeEntry(it.id,t);if(G.canEquip(gear,e,slot,f,H.itemLevel(t)).ok){gear=G.equip(gear,e,slot);break;}}}return gear;}
const valueRes=rs=>(rs||[]).reduce((s,r)=>s+r.n*Be.resSellPrice(r.kind,r.tier),0);
const sum=(a,fn)=>a.reduce((s,x)=>s+fn(x),0);
function priceForge(c,f){return c&&c.ok!==false?{cash:Math.round(c.coins*F.perk(f,'forge')),resources:valueRes(c.res)}:null;}
function econ(t,f,L,full,loot){
 const gear=gearKit(t,f),entries=Object.values(gear).filter(Boolean),pet=P.makePet(P.homeFor(f),t);
 const buy=sum(entries,e=>Math.round(G.item(e).price*F.perk(f,'shop')));
 const recipes=entries.map(e=>priceForge(G.craftCost(e.id,t),f));
 const forge=recipes.every(Boolean)?sum(recipes,x=>x.cash+x.resources):null;
 const upgrades=t>1?entries.map(e=>priceForge(G.upgradeCost({...e,tier:t-1}),f)):[];
 const upgrade=upgrades.length&&upgrades.every(Boolean)?sum(upgrades,x=>x.cash+x.resources):null;
 const repair=sum(entries.filter(e=>G.item(e).type!=='bag'),e=>Math.max(1,Math.round(G.repairCost({...e,dur:G.durMax(t)-1},1)*F.perk(f,'forge'))));
 const ammo=A.forFaction(f),unit=H.consumablePrice(A.CATALOG[ammo].price,L),fee=A.brewFee(unit),groupResources=Object.keys(Be.RESOURCES).filter(k=>Forge.yieldOf(k,t)>0);
 function craftAmmo(group){const eligible=groupResources.filter(k=>!group||A.groupOf(k)===group);const options=eligible.map(kind=>{const need=A.brewNeed(group,unit,Be.resPrice(kind,t),5),out=A.brewOut(group,5);return {kind,need,out,cash:fee/out,cost:(fee+need*Be.resSellPrice(kind,t))/out};});return options.sort((a,b)=>a.cost-b.cost)[0]||null;}
 function elixir(k){const options=Forge.ownList(k,t).filter(r=>Forge.yieldOf(r,t)>0).map(kind=>({kind,cost:E.price(t,k)+E.need(t)*Be.resSellPrice(kind,t),fee:E.price(t,k)}));return options.sort((a,b)=>a.cost-b.cost)[0]||null;}
 const allElix=Object.keys(E.KINDS).filter(k=>!['endure','food'].includes(k)).map(elixir);
 const petGear=sum(P.GEAR_IDS,id=>{let x=P.makePet(pet.speciesId,t),cost=0;while(P.gearUpCost(x,id)!=null){cost+=P.gearUpCost(x,id);P.gearUp(x,id);}return cost;});
 const petRepair=P.repairCost({...pet,durability:pet.maxDurability-1});
 return {slots:entries.length,buy,forge,upgrade,repair,ammoShop:Math.round(unit*F.perk(f,'shop')),ammoCraft:craftAmmo(null),ammoHeal:craftAmmo('heal'),health:elixir('health'),power:elixir('power'),defense:elixir('defense'),allElix:allElix.every(Boolean)?sum(allElix,x=>x.cost):null,petFeed:P.feedCost(pet)/P.FEED_BATTLES,petApple:P.treatCost(pet,'apple')/P.TREATS.apple.battles,petRepair,petTrainNext:P.trainCost(pet,10),petGear,evolve:t===5||t===10?P.evoCost(pet):0};
}
const rows=[],levelRows=[];let samples=0;
for(const faction of factions){const winCounts={};
 for(let t=1;t<=10;t++){
  const ids=species(t);if(!ids.length)throw Error('No regular monsters at tier '+t);
  let wins=0,xp=0,coins=0,res=0,item=0,bonus=0,daily=0,resN=0,itemN=0;
  for(let L=H.itemLevel(t);L<Math.min(H.itemLevel(t)+B.hero.levelsPerTier,H.MAX_LEVEL);L++){
   const xpWin=sum(ids,id=>H.xpReward(Be.MONSTERS[id],t,L,L))/ids.length,need=H.need(L),w=need/xpWin;
   let cash=0,rv=0,iv=0,rn=0,items=0;
   for(let i=0;i<n;i++){const id=ids[Math.floor(rand()*ids.length)],d=Be.rollDrops(id,t,rand,faction,t,1,L);cash+=Math.round(d.coins*F.perk(faction,'coins'));rv+=valueRes(d.resources);rn+=sum(d.resources,r=>r.n);if(d.item){const it=G.item(d.item);iv+=G.sellValue(it.price,it.tier);items++;}samples++;}
   cash/=n;rv/=n;iv/=n;rn/=n;items/=n;
   let milestones=0;for(const id of ids){const prev=winCounts[id]||0,next=prev+w/ids.length;for(const [count,mult] of [[10,10],[50,30],[100,80]])if(prev<count&&next>=count)milestones+=Math.max(20,Math.round(Be.coinsAt(id,t,L)*F.perk(faction,'coins')*mult));winCounts[id]=next;}
   const dailyHere=w/10*H.consumablePrice(90,L); // 10 wins/day scenario, separate optional source
   wins+=w;xp+=need;coins+=w*cash;res+=w*rv;item+=w*iv;bonus+=milestones;daily+=dailyHere;resN+=w*rn;itemN+=w*items;
   levelRows.push({faction,tier:t,level:L,wins:w,cash,rv,iv,items,xpWin});
  }
  const L=H.itemLevel(t)+4,full=(coins+res+item)/wins,loot={coins:coins/wins,res:res/wins,item:item/wins};
  rows.push({faction,tier:t,species:ids.length,wins,xp,coins:coins/wins,res:res/wins,item:item/wins,resN:resN/wins,itemN:itemN/wins,full,milestone:bonus,dailyPer10Wins:daily,coinTotal:coins,liquidation:coins+res+item,optionalTotal:coins+res+item+bonus+daily,...econ(t,faction,L,full,loot)});
 }
}
fs.writeFileSync(process.env.WIP_OUT||'balance-economy.json',JSON.stringify({samples,n,rows,levelRows,notes:'Equal-weight ordinary accessible species at same level. Standard daylight, no elite, rare, bosses, loot perks. Full liquidation counts all drops as sold; one-time species milestone and daily at 10 wins/day separate. Craft opportunity costs use NPC resale value, not purchase markup. Full common kit not necessarily needed each color.'},null,1));
console.log('SAMPLES',samples,'ROWS',rows.length,'LEVELS',levelRows.length);
