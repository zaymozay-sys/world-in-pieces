/* Dynamic PvE career comparison, original vs candidate prices; isolated simulation. */
const fs=require('node:fs'),sim=require('./sim.js');
const MapRules=require('../js/hexmap.js'),Forge=require('../js/forge.js');
const H=global.Hero,G=global.Gear,B=global.Balance,Be=global.Bestiary,F=global.Factions,C=global.Combat,E=global.Elixirs;
const tierSpecies={};for(let t=1;t<=10;t++)tierSpecies[t]=Be.ORDER.filter(id=>{const s=MapRules.SPAWN[id],m=Be.MONSTERS[id];return s&&s.tiers[0]<=t&&s.tiers[1]>=t&&!s.fixed&&!s.rare&&!m.boss&&!m.hidden;});
const oldFee=[2,6,17,48,120,296,720,2560,5600,14400];
const cap=Number(process.env.WIP_MAX_BATTLES||14000),runs=Number(process.env.WIP_RUNS||1),factions=(process.env.WIP_FACTIONS||F.ORDER.join(',')).split(',');
const stress=process.env.WIP_STRESS==='1';
sim.simulate({n:0,tune:{fullSpells:true,economic:true,utility:!stress,tacticalLightning:!stress}});
const sum=(a,f)=>a.reduce((s,v)=>s+f(v),0);
function career(faction,mode,seed){
 let p={level:1,xp:0,coins:500,gear:G.emptyLoadout(),res:{},bag:{potion:2,elixir:1,dust:1,scroll:1},elixirStock:0,wins:0,losses:0,byMonster:{}};
 for(const [slot,id]of Object.entries(sim.STARTER))if(id)p.gear[slot]=G.makeEntry(id,1);
 const levels={},shop=F.perk(faction,'shop'),forge=F.perk(faction,'forge'),coins=F.perk(faction,'coins');
 const cons=(base,L)=>Math.max(1,Math.round((mode==='old'?H.consumablePrice(base,L):H.battleConsumablePrice(base,L))*shop));
 const active=()=>Object.fromEntries(Object.entries(p.gear).map(([s,e])=>[s,e&&!G.item(e).broken?e:null]));
 const view=g=>{const st=G.combine(G.statsFor(g,p.level),F.statsAt(faction,H.tierFloat(p.level)));return {max:H.baseHp(p.level)+st.health,dmg:H.dmgMult(p.level),stats:st};};
 const sale=e=>e?G.sellValue(Math.round(G.item(e).price*G.wearFactor(e)),G.item(e).tier):0;
 function prediction(g,id,t,l){const m=Be.scaledAt(id,l,1,p.level);return C.winChance(view(g),{max:m.hp,dmg:m.dmg,stats:m.stats,ai:m.ai},id);}
 function repair(row){for(const slot of G.SLOTS){if(G.WEAR_SLOTS_SKIP.includes(slot))continue;const e=p.gear[slot];if(!e)continue;const d=G.durOf(e);if(d.cur===d.max)continue;const cost=mode==='old'?Math.max(1,Math.round(G.item(e).price/3*(d.max-d.cur)/d.max)):G.repairCost(e);const pay=Math.max(1,Math.round(cost*forge));if(p.coins>=pay){p.coins-=pay;row.repair+=pay;delete e.dur;}}}
 function buyEquipment(t,row){
  const g=active(),ref=tierSpecies[t].includes('orc')?'orc':tierSpecies[t][Math.floor(tierSpecies[t].length/2)],L=p.level,reserve=cons(50,L)*4;
  let base=prediction(g,ref,t,L),best=null;
  for(const item of G.itemsFor(faction).filter(i=>i.rarity!=='epic'))for(const slot of G.SLOTS.filter(s=>G.fits(s,item.type))){
   const e=G.makeEntry(item.id,t);if(!G.canEquip(g,e,slot,faction,L).ok)continue;
   const newGear=G.equip(g,e,slot),pay=Math.round(G.item(e).price*shop),replacement=sum(G.SLOTS.filter(s=>g[s]&&g[s]!==newGear[s]),s=>sale(g[s]));
   if(pay>p.coins-reserve)continue;const gain=prediction(newGear,ref,t,L)-base;
   if(gain<=.001)continue;const score=gain/Math.max(1,pay-replacement);if(!best||score>best.score)best={newGear,pay,replacement,score};
  }
  if(best){p.coins+=best.replacement-best.pay;row.buy+=best.pay;row.sales+=best.replacement;row.buys++;p.gear=best.newGear;}
  for(const slot of G.SLOTS){const e=p.gear[slot];if(!e||G.item(e).tier>=t||G.item(e).broken)continue;const q=G.upgradeCost(e);if(!q||q.ok===false)continue;const pay=Math.round(q.coins*forge);if(p.coins-pay<reserve||!q.res.every(r=>(p.res[r.kind+':'+r.tier]||0)>=r.n))continue;p.coins-=pay;row.forge+=pay;row.forges++;for(const r of q.res)p.res[r.kind+':'+r.tier]-=r.n;G.setTier(e,G.item(e).tier+1);}
 }
 let b=0,lastShop=-1,poorStreak=0,maxPoor=0;
 for(;b<cap&&p.level<100;b++){
  sim.seed((Math.imul(seed+1,2654435761)^Math.imul(b+1,1597334677))>>>0);
  const L=p.level,t=H.tierFor(L),row=levels[L]||(levels[L]={level:L,battles:0,wins:0,coinsStart:p.coins,coinsEnd:p.coins,coinsEarned:0,sales:0,milestone:0,daily:0,repair:0,buy:0,buys:0,forge:0,forges:0,potions:0,elixirs:0,elixirFee:0,gearTier:0,equipped:0,broken:0});
  repair(row);
  if(lastShop!==L||b%15===0){buyEquipment(t,row);lastShop=L;}
  const g=active(),candidates=[];
  for(let mt=Math.max(1,t-1);mt<=t;mt++)for(const id of tierSpecies[mt]){const ml=mt===t?L:H.itemLevel(mt)+9;const win=prediction(g,id,mt,ml),xp=H.xpReward(Be.MONSTERS[id],mt,L,ml);candidates.push({id,mt,ml,win,score:win*xp});}
  let pool=candidates.filter(q=>q.win>=.55).sort((a,b)=>b.score-a.score);if(!pool.length)pool=candidates.sort((a,b)=>b.win-a.win);
  const pick=pool[Math.floor(sim.rand()*Math.min(3,pool.length))];
  const price=cons(50,L);while((p.bag.potion||0)<2&&p.coins>=price*3){p.coins-=price;p.bag.potion=(p.bag.potion||0)+1;row.potions+=price;}
  if(!p.elixirStock&&pick.win<.75){const fee=mode==='old'?oldFee[t-1]:E.price(t,'health');const kind=Forge.ownList('health',t).find(k=>(p.res[k+':'+t]||0)>=E.need(t));if(kind&&p.coins>=fee+price*4){p.coins-=fee;row.elixirFee+=fee;p.res[kind+':'+t]-=E.need(t);p.elixirStock++;}}
  const useElixir=p.elixirStock>0&&pick.win<.75,hero=sim.makeHero({faction,level:L,gear:g,bag:p.bag,elixirs:useElixir?{health:t}:undefined});
  const mon=sim.makeMonster(pick.id,pick.mt,{mlvl:pick.ml,level:L});const s=sim.Battle(hero,mon,sim.humanPlayer({skill:stress?.35:.55,top:stress?6:4,items:pick.win<.8})).run();
  if(useElixir&&!hero.elxPlan.health){p.elixirStock--;row.elixirs++;}p.bag=hero.bag;
  row.battles++;row.gearTier+=sum(Object.values(g).filter(Boolean),e=>G.item(e).tier)/Math.max(1,Object.values(g).filter(Boolean).length);row.equipped+=Object.values(g).filter(Boolean).length;
  if(s.winner==='left'){
   row.wins++;p.wins++;p.xp+=H.xpReward(Be.MONSTERS[pick.id],pick.mt,L,pick.ml);
   const d=Be.rollDrops(pick.id,pick.mt,sim.rand,faction,t,1,pick.ml),cash=Math.round(d.coins*coins);p.coins+=cash;row.coinsEarned+=cash;
   for(const r of d.resources){const key=r.kind+':'+r.tier,target=r.n*(stress?.25:.5),ss=Math.floor(target)+(sim.rand()<target-Math.floor(target)?1:0);p.res[key]=(p.res[key]||0)+r.n-ss;const pay=ss*Be.resSellPrice(r.kind,r.tier);p.coins+=pay;row.sales+=pay;}
   if(d.item){const pay=sale(d.item);p.coins+=pay;row.sales+=pay;}
   const count=p.byMonster[pick.id]=(p.byMonster[pick.id]||0)+1,mul={10:10,50:30,100:80}[count];if(mul){const pay=Math.max(20,Math.round(cash*mul));p.coins+=pay;row.milestone+=pay;}
   if(!stress&&p.wins%10===0){const pay=H.consumablePrice(90,L);p.coins+=pay;row.daily+=pay;p.bag.dust=(p.bag.dust||0)+1;}
   p.level=H.levelOf(p.xp).level;
  }else{p.losses++;for(const slot of G.SLOTS){if(G.WEAR_SLOTS_SKIP.includes(slot))continue;const e=p.gear[slot];if(e)e.dur=Math.max(0,G.durOf(e).cur-1);}}
  row.broken+=Object.values(p.gear).filter(e=>e&&G.item(e).broken).length;row.coinsEnd=p.coins;
  if(p.coins<price*2)poorStreak++;else poorStreak=0;maxPoor=Math.max(maxPoor,poorStreak);
  if(b%1000===999)console.log('PROGRESS',mode,faction,seed,b+1,p.level,p.coins);
 }
 return {mode,faction,seed,stress,battles:b,level:p.level,wins:p.wins,losses:p.losses,coins:p.coins,maxPoor,levels:Object.values(levels),notes:stress?'Ordinary solo PvE, weaker policy, 25% resources sold, no daily bonus, no ammo or pet; equipment and healing replenished from earnings.':'Ordinary solo PvE, 50% resources sold, daily every 10 wins.'};
}
const out=[];
for(const mode of (process.env.WIP_MODES||'old,new').split(','))for(const faction of factions)for(let r=0;r<runs;r++){const c=career(faction,mode,256+r);out.push(c);console.log('RESULT',mode,faction,c.level,c.battles,c.wins,c.coins,c.maxPoor);fs.writeFileSync(process.env.WIP_OUT||'balance-career.json',JSON.stringify(out,null,1));}
