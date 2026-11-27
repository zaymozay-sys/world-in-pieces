/* Isolated audit of pet board, spell policy and strict duo outcomes. */
const fs=require('node:fs');
const sim=require('./sim.js');
const P=require('../js/pets.js'),map=require('../js/hexmap.js');
const H=global.Hero,G=global.Gear,C=global.Combat;
const n=Number(process.env.WIP_N||40);
const encounters={1:['rat','wolf'],4:['bandit','orc'],7:['troll','wraith'],10:['dragon','golem']};
const factions=['human','dwarf','elf','lizard'];
const profiles=[{name:'novice',intel:5},{name:'student',intel:25},{name:'trained',intel:50},{name:'master',intel:90},{name:'no-magic',intel:50,only:[]},{name:'prepared',intel:90,prepared:true}];
const xpFor=i=>Math.round(-P.INT_XP*Math.log(Math.max(.0001,1-(i-1)/99)));
const tune={fullSpells:true,economic:true,utility:true};
sim.simulate({n:0,tune}); // configure standard full hero magic policy before individual battle calls
function petFixture(species,tier,q,gear){
 const p=P.makePet(species,tier);p.xp=xpFor(q.intel);
 if(q.prepared){p.trust=100;p.traits=['sturdy','loyal'];p.gear={collar:tier,harness:tier,charm:tier};P.setAmulet(p,'loyal');
   while(P.canEvolve(p))P.evolve(p,'hunter');
   for(const id of ['fang','hide','mettle','guard','nose','learner','quick','bond'])while(P.talentUp(p,id)){}
   P.giveTreat(p,'apple');p.drill=2;
 }
 const tr=P.useTreats(p),pf=P.petFighter(p),lk=gear?.leash?G.item(gear.leash).stats:{};
 pf.stats=G.combine(pf.stats,{...lk,health:0,magic:0,cunning:0,initiative:0});
 pf.max=Math.round(pf.max*(1+.03*(lk.health||0)));
 pf.max=Math.round(pf.max*tr.hpMult);
 if(tr.defense)pf.stats=G.combine(pf.stats,{defense:Math.max(1,Math.round(tr.defense*C.armorUnit(pf.dmg||1)))});
 if(gear&&G.petBonus(gear))pf.max=Math.round(pf.max*1.15);
 pf.fedBonus=Math.max(P.useFeed(p),tr.power,gear&&G.petBonus(gear)?1.1:1);
 const intel=P.dopedIntellect(p,tr.int+(pf.fedBonus>1&&tr.power<pf.fedBonus?P.DOPE_BONE:0));
 const hp=Math.round(pf.max*P.boardHp(p)),dmg=pf.dmg*P.boardDmg(p);
 const h=sim.makeHero({faction:'none',level:H.itemLevel(tier),gear:G.emptyLoadout(),baseHp:hp,dmg});
 Object.assign(h,{stats:pf.stats,stats0:pf.stats,max:hp,hp,base:hp,isPet:true,petBoard:true,petInt:intel,ability:pf.ability,secondWind:pf.secondWind,secondWindFrac:pf.secondWindFrac,fedBonus:pf.fedBonus});
 return {h,intel,p};
}
function kit(tier,faction){
 let g=G.emptyLoadout();const a=G.itemsFor(faction).filter(i=>i.rarity!=='epic');
 for(const slot of ['main','off','head','chest','arms','legs','amulet','leash'])for(const it of a.filter(i=>G.fits(slot,i.type)).sort((a,b)=>b.cost-a.cost||a.id.localeCompare(b.id))){
  const e=G.makeEntry(it.id,tier);if(G.canEquip(g,e,slot,faction,H.itemLevel(tier)).ok){g=G.equip(g,e,slot);break;}
 }return g;
}
function seed(...k){let h=2166136261;for(const ch of k.join('/'))h=Math.imul(h^ch.charCodeAt(0),16777619);sim.seed(h>>>0);}
function sumSpells(dst,src){for(const[k,v]of Object.entries(src))dst[k]=(dst[k]||0)+v;}
const rows=[];
for(const [t,monsters]of Object.entries(encounters)){
 const tier=+t;const pets=[...Object.keys(P.HOME),...Object.values(P.EGGS).filter(e=>(map.SPAWN[e.donor]?.tiers?.[0]??11)<=tier).map(e=>e.species)];
 for(const species of pets)for(const q of profiles)for(const monster of monsters){
  let wins=0,rounds=0,hpLeft=0,spells={};
  for(let k=0;k<n;k++){
   seed('pet',tier,species,monster,k);const {h,intel}=petFixture(species,tier,q);
   const s=sim.Battle(h,sim.makeMonster(monster,tier,{level:H.itemLevel(tier)}),sim.petPlayer(intel,q.only)).run();
   if(s.winner==='left'){wins++;hpLeft+=h.hp/h.max;}rounds+=s.stats.rounds;sumSpells(spells,s.stats.bySpell);
  }
  rows.push({mode:'pet-board',species,tier,monster,profile:q.name,n,win:wins/n,rounds:rounds/n,hpLeft:wins?hpLeft/wins:0,spells});
 }
 console.log('PET BOARD',tier,rows.length*n);
}
// Independent sequential boards: no simultaneous handover/help. Hero death always loses, matching Duo.evaluate.
const duo=[];
for(const[t,monsters]of Object.entries(encounters))for(const faction of factions)for(const monster of monsters){
 const tier=+t,level=H.itemLevel(tier),gear=kit(tier,faction),species=P.homeFor(faction);
 const a=profiles.filter(q=>['novice','trained','prepared'].includes(q.name)).map(q=>({profile:q.name,wins:0,both:0,petWins:0,heroRematch:0,spells:{}}));let solo=0;
 for(let k=0;k<n;k++){
  seed('hero',tier,monster,faction,k);const hero=sim.makeHero({faction,level,gear}),mon=sim.makeMonster(monster,tier,{level});
  const hs=sim.Battle(hero,mon,sim.humanPlayer({skill:.55,top:4})).run();const heroWon=hs.winner==='left';if(heroWon)solo++;
  for(const d of a){
   const q=profiles.find(x=>x.name===d.profile);seed('partner',tier,monster,faction,k);const {h,intel}=petFixture(species,tier,q,gear);
   const pm=sim.makeMonster(monster,tier,{level});const ps=sim.Battle(h,pm,sim.petPlayer(intel)).run();const pw=ps.winner==='left';if(pw)d.petWins++;sumSpells(d.spells,ps.stats.bySpell);
   if(!heroWon)continue;if(pw){d.wins++;d.both++;continue;}
   if(pm.hp<=0)continue;
   d.heroRematch++;const survivor=structuredClone(hero);Object.assign(survivor,{buffs:[],haste:false,magic:false,stunned:false,charge:0});
   seed('rematch',tier,monster,faction,k);const v=sim.Battle(survivor,pm,sim.humanPlayer({skill:.55,top:4})).run();if(v.winner==='left')d.wins++;
  }
 }
 for(const d of a)duo.push({mode:'duo-strict',species,tier,faction,monster,n,profile:d.profile,solo:solo/n,win:d.wins/n,petWin:d.petWins/n,both:d.both/n,heroRematch:d.heroRematch/n,spells:d.spells});
 console.log('DUO',tier,faction,monster,duo.length*n);
}
const count=rows.length*n+duo.length*n*2; // first hero board shared, pet boards and potential rematches extra
fs.writeFileSync(process.env.WIP_OUT||'balance-pets.json',JSON.stringify({n,rows,duo,plannedBoardRuns:count,notes:'Sequential boards, no voluntary transfers or cross-board help; prepared profile includes legal pet gear/talents/treats. Duo hero death always loss.'},null,1));
console.log('DONE',rows.length*n,duo.length*n,'paired scenarios');
