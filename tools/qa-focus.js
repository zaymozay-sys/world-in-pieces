/* Isolated balance audit: native faction ammo and single elixirs. No gameplay files modified. */
const fs = require('node:fs');
const path = require('node:path');
const sourcePath = path.join(__dirname, 'sim.js');
let source = fs.readFileSync(sourcePath, 'utf8');
function patch(a, b) {
  if (source.split(a).length !== 2) throw Error('Missing or ambiguous audit anchor: ' + a);
  source = source.replace(a, b);
}
patch("const AI = require(J('ai.js'));", "const AI = require(J('ai.js'));\nconst QAAmmo = require(J('ammo.js'));");
patch("Combat.useConsumable(f, kind, MAGIC_NAMES)","Combat.useConsumable(f, kind, MAGIC_NAMES, rand)");
patch("    const h = S.f.left, t = h.elxPlan[kind]; delete h.elxPlan[kind];", "    const h = S.f.left, t = h.elxPlan[kind]; delete h.elxPlan[kind];\n    S.stats.bySpell['elixir:'+kind]=(S.stats.bySpell['elixir:'+kind]||0)+1;");
// The old automatic policy did not drink these two turn-based elixirs.
patch("else if (kind === 'power') {", "else if (kind === 'power' || kind === 'leech' || kind === 'venom') {");
const ammo = `
  function qaShoot() {
    const h=S.f.left,e=S.f.right,o=player.qaAmmo;
    if(!o||h.isPet||S.over||h.qaShotTurn===h.turnNo||(h.qaShots||0)>=o.count)return;
    const kind=Gear.shotKind(h.gear)||QAAmmo.forFaction(h.faction);
    const variant=o.variant||null;
    if(variant&&!QAAmmo.unlocked(variant,o.mastery))throw Error('Unavailable ammo variant');
    const aim=kind==='bomb'?bestSquare(S):null;
    if(kind==='bomb'&&!aim)return;
    if(variant==='light'&&!h.qaLightUsed)h.qaLightUsed=true;else h.qaShotTurn=h.turnNo;
    h.qaShots=(h.qaShots||0)+1;
    const key='ammo:'+kind+':'+(variant||'normal');
    S.stats.bySpell[key]=(S.stats.bySpell[key]||0)+1;
    const fam=Bestiary.MONSTERS[e.id]?.family;
    const base=Math.round(Combat.strikeDamage(h)*Gear.shotMult(h.gear));
    const mult=QAAmmo.multV(kind,fam,variant)*QAAmmo.dmgMul(variant);
    h.hp=Math.min(h.max,h.hp+QAAmmo.healAmount(variant,Elixirs.heal(Hero.tierFor(h.heroLevel))));
    for(const t of MAGIC_NAMES)h.counts[t]+=QAAmmo.charmStones(kind,variant);
    if(kind==='bolt'){
      hit('left',Math.round(QAAmmo.boltDamage(base)*mult),true);
      e.buffs=[];e.shield=0;e.mirrorReady=false;e.tripleNext=false;e.doubleNext=false;
    }else if(kind==='moonarrow'){
      hit('left',Math.round(QAAmmo.arrowDamage(base)*mult),true);
      for(const[t,n]of Object.entries(QAAmmo.steal(e.counts,MAGIC_NAMES,QAAmmo.stealCount(kind,variant)))){e.counts[t]-=n;h.counts[t]+=n;}
    }else if(kind==='dart'){
      const dmg=Math.max(1,Math.round(Combat.venomTick(Combat.power(h),h.dmg)*mult));
      e.poison={turns:Math.max(QAAmmo.DART_TURNS,e.poison?.turns||0),dmg:Math.max(dmg,e.poison?.dmg||0)};
    }else if(kind==='bomb')burn('left',aim.idx,'square',mult,true);
    checkEnd();
  }
`;
patch('  function heroTurn() {',ammo+'\n  function heroTurn() {');
patch('      if (player.items) player.items(S, h, useItem);','      if (player.items) player.items(S, h, useItem);\n      qaShoot();\n      if(player.qaAmmo?.variant===\'light\')qaShoot();\n      if (checkEnd()) return;');
const copy = path.join(__dirname,'sim-qa-focus.generated.js');
fs.writeFileSync(copy,source);
const sim=require(copy);
const H=global.Hero,G=global.Gear,E=global.Elixirs,Be=global.Bestiary,F=global.Factions,B=global.Balance;
const Ammo=require('../js/ammo.js'), map=require('../js/hexmap.js');
const n=Number(process.env.WIP_N||60);
const factions=['human','dwarf','elf','lizard'];
const selected={1:['rat','wolf'],4:['bandit','orc'],7:['troll','wraith'],10:['dragon','golem']};
const variants=['hard','hunt','heal','charm','light'];
const elixirs=Object.keys(E.KINDS).filter(k=>!['food','endure'].includes(k));
const profiles=[{name:'baseline'}, {name:'ammo-1',shot:1}, {name:'ammo-5',shot:5}, ...variants.map(v=>({name:'ammo-'+v,shot:5,variant:v})), ...elixirs.map(k=>({name:'elixir-'+k,elix:k}))];
function kit(tier, faction) {
  const pool=G.itemsFor(faction).filter(i=>i.rarity!=='epic');
  let gear=G.emptyLoadout();
  for(const slot of ['main','off','head','chest','arms','legs','amulet']){
    const choices=pool.filter(i=>G.fits(slot,i.type)).sort((a,b)=>b.cost-a.cost||a.id.localeCompare(b.id));
    for(const it of choices){const entry=G.makeEntry(it.id,tier);if(G.canEquip(gear,entry,slot,faction,H.itemLevel(tier)).ok){gear=G.equip(gear,entry,slot);break;}}
  }
  return gear;
}
const rows=[];
for(const [t,monsters] of Object.entries(selected))for(const faction of factions){
  const tier=+t,level=H.itemLevel(tier),gear=kit(tier,faction),kind=Ammo.forFaction(faction);
  for(const monster of monsters){
    const w=map.SPAWN[monster]?.tiers;if(!w||tier<w[0]||tier>w[1])throw Error('Invalid encounter');
    for(const p of profiles){
      const r=sim.simulate({monster,tier,level,faction,n,seedBase:256,gear,
        player:()=>{const q=sim.humanPlayer({skill:.55,top:4});if(p.shot)q.qaAmmo={count:p.shot,variant:p.variant,mastery:5};return q;},
        elixirs:p.elix?{[p.elix]:tier}:undefined,tune:{fullSpells:true,economic:true,utility:true}});
      const used=Object.entries(r.bySpell).filter(([k])=>k.startsWith('ammo:')||k.startsWith('elixir:')).reduce((s,[,v])=>s+v,0)/n;
      const reward=Be.coinsAt(monster,tier)*F.perk(faction,'coins');
      // Shop price for ordinary ammo; enhanced ammo is crafted, estimated resource+fee input at the recipe target before rounding.
      const shopPrice=H.consumablePrice(Ammo.CATALOG[kind].price,level);
      const unit=p.shot?(p.variant?shopPrice*B.brew.share*B.brew.groups[p.variant].mul:shopPrice*F.perk(faction,'shop')):p.elix?E.price(tier,p.elix):0;
      rows.push({profile:p.name,tier,level,faction,monster,kind,n,win:r.win,actions:r.actions,used,unit,coinReward:reward,feeOrEstimatedCost:used*unit,expectedCoins:r.win*reward-used*unit,casts:r.bySpell});
    }
  }
  console.log('DONE',tier,faction,rows.length* n);
}
const output=path.resolve(process.env.WIP_OUT||'balance-focus.json');
fs.writeFileSync(output,JSON.stringify({n,gear:'7 main slots, no ranged override; legal common/rare',rows},null,1));
console.log('COMPLETED',rows.length*n,output);
fs.unlinkSync(copy);
