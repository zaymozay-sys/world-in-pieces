/* Resource availability and gear loot audit. Read-only, expected values from actual drop tables. */
const fs=require('node:fs');require('./sim.js');
const M=require('../js/hexmap.js'),F=require('../js/forge.js'),A=require('../js/ammo.js');
const B=global.Balance,G=global.Gear,Be=global.Bestiary,E=global.Elixirs;
const tiers=[],gaps=[],slow=[],samples=[];let state=257;const rng=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
for(let t=1;t<=10;t++){
 const available=Be.ORDER.filter(id=>{const s=M.SPAWN[id];return s&&s.tiers[0]<=t&&s.tiers[1]>=t;});
 const ordinary=available.filter(id=>{const s=M.SPAWN[id],m=Be.MONSTERS[id];return !s.fixed&&!s.rare&&!m.boss&&!m.hidden;});
 const source={};for(const kind of Object.keys(Be.RESOURCES)){
  const rows=available.flatMap(id=>Be.MONSTERS[id].drops.filter(d=>d[0]===kind).map(d=>({id,y:Math.min(1,d[1]/B.gameLength)*(d[2]+d[3])/2,ordinary:ordinary.includes(id)}))).sort((a,b)=>b.y-a.y);
  source[kind]={all:rows,ordinary:rows.filter(r=>r.ordinary)};
 }
 const required=new Map();
 function check(type,id,recipe){if(!recipe||recipe.ok===false){gaps.push({t,type,id,reason:'no valid plan'});return;}for(const r of recipe.res||[]){if(r.tier!==t)continue;const a=required.get(r.kind)||{count:0,max:0,examples:[]};a.count++;a.max=Math.max(a.max,r.n);if(a.examples.length<3)a.examples.push(type+':'+id);required.set(r.kind,a);}}
 for(const id of [...new Set(global.Factions.ORDER.flatMap(f=>G.craftFor(f,t).map(i=>i.id)))]){check('craft',id,G.craftCost(id,t));if(t<10)check('upgrade',id,G.upgradeCost(G.makeEntry(id,t)));}
 for(const [kind,x]of required){const s=source[kind];if(!s.all.length)gaps.push({t,kind,...x,reason:'no map source'});else if(!s.ordinary.length)gaps.push({t,kind,...x,reason:'only special source',sources:s.all.map(a=>a.id)});else if(x.max/s.ordinary[0].y>100)slow.push({t,kind,needed:x.max,best:s.ordinary[0].id,expectedWins:Math.round(x.max/s.ordinary[0].y),examples:x.examples});}
 for(const k of Object.keys(E.KINDS).filter(k=>k!=='endure')){const opts=F.ownList(k,t);if(!opts.some(r=>source[r]?.all.length))gaps.push({t,type:'elixir',kind:k,reason:'no allowed map source',opts});else if(!opts.some(r=>source[r]?.ordinary.length))gaps.push({t,type:'elixir',kind:k,reason:'only special sources',opts});}
 for(const [group,cfg]of Object.entries(B.brew.groups))if(!cfg.res.some(r=>source[r]?.all.length))gaps.push({t,type:'ammo',kind:group,reason:'no matching resource'});
 // Sample actual regular PvE rolls with faction-weighted gear as the game does.
 const n=10000,rarity={common:0,rare:0,epic:0},itemTier={same:0,lower:0},resCounts={};let item=0,res=0;
 for(let i=0;i<n;i++){const id=ordinary[Math.floor(rng()*ordinary.length)],faction=global.Factions.ORDER[i%4],d=Be.rollDrops(id,t,rng,faction,t,1,global.Hero.itemLevel(t)+4);for(const r of d.resources){res+=r.n;resCounts[r.kind]=(resCounts[r.kind]||0)+r.n;}if(d.item){item++;rarity[G.item(d.item).rarity]++;itemTier[d.item.tier===t?'same':'lower']++;}}
 const result={t,ordinary:ordinary.length,all:available.length,requiredResources:required.size,resourcesWithOrdinarySource:Object.values(source).filter(x=>x.ordinary.length).length,resourcesPerWin:res/n,itemPerWin:item/n,rarityPerWin:Object.fromEntries(Object.entries(rarity).map(([k,v])=>[k,v/n])),sameTierPerWin:itemTier.same/n,lowerTierPerWin:itemTier.lower/n};tiers.push(result);samples.push({t,resCounts,required:Object.fromEntries(required),source});console.log('TIER',JSON.stringify(result));
}
console.log('GAPS',JSON.stringify(gaps));console.log('SLOW',JSON.stringify(slow));fs.writeFileSync(process.env.WIP_OUT||'balance-drops.json',JSON.stringify({tiers,gaps,slow,samples,n:100000,notes:'Ordinary excludes rare/fixed/boss/hidden. All includes map special sources; separate non-map sources not inferred. Expected farming assumes best monster accessible, not actual map travel. Recipes use default valid plan.'},null,1));
