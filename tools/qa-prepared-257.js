// Screening of endgame preparation, not a browser battle run.
// node tools/qa-prepared-257.js [--n=8] [--seed=257] [--level=95] [--ablation=1] [--elite=1] [--tactics=1]
const sim = require('./sim.js');
const G = global.Gear, H = global.Hero, M = global.Medals, B = global.Bestiary;
const R = require('../js/runes.js'), P = require('../js/pets.js'), T = require('../js/talents.js');
const Ammo = require('../js/ammo.js'), Village = require('../js/village.js');
const HexMap = require('../js/hexmap.js');
const World = require('../js/world.js');
const args = Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const N = Math.max(1,Number(args.n||8)), seed = Number(args.seed||257), level = Math.max(5,Math.min(100,Number(args.level||95))), tier = H.tierFor(level);
const factions = { human:'crown', dwarf:'rune', elf:'grove', lizard:'scale' };
const ordinary = tier===10?['golem','wraith','eagle','treant']:[...new Map(Object.entries(HexMap.SPAWN).filter(([id,s])=>!s.rare&&!s.fixed&&s.tiers[0]<=tier&&s.tiers[1]>=tier).map(([id])=>[B.MONSTERS[id].family,id])).values()].slice(0,4);
let targets = ordinary.map((id,i)=>({id,tier,mlvl:level,elite:args.elite==='1'?World.AFFIX_IDS[i%World.AFFIX_IDS.length]:false}));
if(args.floor) {
  const map=HexMap.generate(HexMap.sharedSeed('tower'),'tower',Number(args.floor));
  const guard=map.spawns.find(s=>s.guard);
  targets=[...(guard?[guard]:[]),...map.spawns.filter(s=>!s.guard&&!s.scorp).slice(0,3)].map(s=>({id:s.species,tier:s.tier,mlvl:HexMap.lvlOf(s),depth:s.depth,trait:s.trait}));
}
if(args.zone) {
  const z=World.ZONE_BOSSES[args.zone];
  if(!z)throw Error('Unknown zone '+args.zone);
  targets=[{id:z.species,tier:z.tier,mlvl:H.itemLevel(z.tier),zone:args.zone}];
}
// Реальные слоты героя; Удар не занимает слот. Временный unlockAll не
// используется для сравнения законной прогрессии магии.
const spellLoadout = mode => {
  const priority = {
    mixed: ['lightning','heal','square','temper','fire','mirror','fury','pierce','transmute','tide','sacrifice','chaos'],
    attack: ['fire','square','fury','sacrifice','lightning','pierce','temper','transmute','heal','chaos','tide','mirror'],
    defense: ['heal','mirror','temper','tide','transmute','lightning','square','fire','pierce','fury','chaos','sacrifice']
  }[mode];
  return ['strike', ...priority.filter(k => level >= (Balance.spellUnlock[k] || 1)).slice(0,H.spellSlots(level))];
};

function equipment(faction, set) {
  let gear = G.emptyLoadout();
  const entries = G.ITEMS.filter(i=>i.set===set).map(i=>G.makeEntry(i.id,tier));
  for(const e of entries) {
    const slot = G.SLOTS.find(s=>!gear[s]&&G.canEquip(gear,e,s,faction,level).ok);
    if(slot)gear=G.equip(gear,e,slot);
  }
  if(G.setProgress(gear).find(s=>s.id===set)?.count!==G.setMaxPieces(set))throw Error('Incomplete '+set);
  // Fill free slots with ordinary legal shop items, choosing a strong item for the slot.
  for(const slot of G.SLOTS) {
    if(gear[slot])continue;
    const pool=G.itemsFor(faction).filter(i=>G.fits(slot,i.type)&&!i.relic).map(i=>G.makeEntry(i.id,tier))
      .filter(e=>G.canEquip(gear,e,slot,faction,level).ok);
    pool.sort((a,b)=>G.item(b).cost-G.item(a).cost);
    if(pool.length)gear=G.equip(gear,pool[0],slot);
  }
  return gear;
}
function enhance(gear) {
  const out=JSON.parse(JSON.stringify(gear));
  for(const [slot,e] of Object.entries(out)) {
    if(!e)continue;
    e.plus=Math.min(G.TEMPER_MAX,Math.floor(tier/2));
    const rune=G.item(e).type==='weapon2'?'rune-might2':G.item(e).type==='weapon1'?'rune-might':'rune-insight';
    for(let i=0;i<R.socketsFor(e);i++) R.insert(e,rune,i,tier);
    if(tier>=8) {
      if(slot!=='belt')e.cut=tier;
      e.gems=[tier,8];
    }
  }
  return out;
}
function medals(max) {
  const ids=[...new Set([
    ...M.GROUP_ORDER.flatMap(k=>M.GROUPS[k].ids()),
    ...M.ELIXIR_ORDER.map(M.elixirMedalId), ...M.SPELL_MILESTONES.map(M.spellMedalId),
    ...M.MASTER_ORDER.flatMap(k=>M.MASTER[k].ms.map(n=>M.masterMedalId(k,n)))
  ])].filter(id=>M.tierUnlockLevel(id)<=level&&(!M.killSpecies(id)||tier>=10||HexMap.SPAWN[M.killSpecies(id)]?.tiers[0]<=tier));
  const earned=ids.filter(id=>max||(!id.startsWith('m:')&&!id.startsWith('kill:')&&M.tierUnlockLevel(id)<=31)).map(id=>({id}));
  const bestiary=Object.fromEntries(B.ORDER.map(id=>[id,{wins:max?M.winsLadder(id).at(-1):0,tier}]));
  const s=M.bonusStats(earned,bestiary);
  if(s.defense)s.defense=Math.max(1,Math.round(s.defense*Combat.armorUnit(H.dmgMult(level))));
  const talents=T.clean({power:99,health:99,defense:99,block:99,initiative:99,cunning:99},level);
  return { extra:G.combine(s,T.bonus(talents)), earned };
}
function pet() {
  const p=P.makePet('dog',tier);p.xp=8000;p.traits=['sturdy','loyal'];p.trust=P.TRUST_MAX;
  P.evolve(p,'warden');P.evolve(p,'warden');
  for(const kind of P.GEAR_IDS)for(let i=0;i<tier;i++)P.gearUp(p,kind);
  P.setAmulet(p,'loyal');
  for(const kind of P.TALENT_IDS)while(P.talentUp(p,kind)){}
  for(const kind of P.TREAT_ORDER)P.giveTreat(p,kind);
  return p;
}
function prepared(gear,faction,max,mode='mixed') {
  const shot=G.shotKind(gear)||Ammo.forFaction(faction);
  const m=medals(max),perk=k=>M.hasPerk(m.earned,k);
  return {
    gear:enhance(gear),extra:m.extra,earned:m.earned,bless:'might',
    elixirs:Object.fromEntries(Elixirs.ORDER.filter(k=>k!=='food').map(k=>[k,tier])),
    elxExtra:Village.elixirExtra({alchemist:tier===10?10:Math.floor(tier/2)})+(perk('elixir')?4:0),
    // Prepared profile assumes brewing mastery 4 (70 crafted charges).
    ammo:{[shot+':light']:1,[shot+':hard']:4,[shot]:5},
    boost:{shot:perk('shot'),style:perk('style'),daily:perk('daily'),streak:perk('streak')},
    player:()=>{
      const p=sim.humanPlayer({onlySpells:spellLoadout(mode)});
      p.items=(S,h,use)=>{
        for(const key of Object.keys(h.bag)) {
          const k=G.parseCons(key).base;
          if(h.bag[key]>0&&(k!=='potion'||h.hp<h.max*.6))use('left',key);
        }
      };
      return p;
    },
    bag:Object.fromEntries(Object.keys(G.CONSUMABLES).filter(k=>k!=='potion'&&k!=='elixir').map(k=>[G.COLORED.includes(k)?G.tierKey(k,tier):k,1]))
  };
}
// Same seeds and enemies in each profile. The pet profile deliberately requires two opponents
// and does not yet simulate live cross-board help; it cannot be compared as a simple damage buff.
for(const faction of Object.keys(factions)) {
  const gear=equipment(faction,factions[faction]);
  const profiles={plain:{gear,player:()=>sim.humanPlayer({onlySpells:spellLoadout('mixed')})},prepared:prepared(gear,faction,false),stress:prepared(gear,faction,true)};
  profiles.duo={...profiles.stress,duo:{entry:pet(),foodTier:tier}};
  if(args.tactics==='1') {
    profiles.attack=prepared(gear,faction,false,'attack');
    profiles.defense=prepared(gear,faction,false,'defense');
  }
  if(args.ablation) {
    const p=profiles.prepared,base=profiles.plain;
    profiles.gearOnly={...base,gear:p.gear};
    profiles.medalsOnly={...base,extra:p.extra,earned:p.earned,boost:p.boost};
    profiles.ammoOnly={...base,ammo:p.ammo};
    profiles.elixirOnly={...base,elixirs:p.elixirs,elxExtra:p.elxExtra};
    profiles.itemsOnly={...base,bag:p.bag,player:p.player};
    profiles.altarOnly={...base,bless:p.bless};
  }
  const rows={};
  for(const [name,opts] of Object.entries(profiles)) {
    let win=0,actions=0,ammo=0;
    for(const target of targets) {
      const monster=target.id;
      const familyPct=M.familyBonus(opts.earned||[],B.MONSTERS[monster].family);
      const r=sim.simulate({faction,level,monster,tier:target.tier,mlvl:target.mlvl,depth:target.depth,trait:target.trait,zone:target.zone,n:N,seedBase:seed,pairedFactions:true,elite:target.elite,player:'avg',...opts,tune:{fullSpells:true,utility:true},boost:{...opts.boost,familyPct}});
      win+=r.win;actions+=r.actions;ammo+=Object.values(r.ammoUsed).reduce((a,b)=>a+b,0)/N;
    }
    rows[name]={winPct:Math.round(100*win/targets.length),actions:Math.round(actions/targets.length*10)/10,ammoPerBattle:Math.round(ammo/targets.length*10)/10};
  }
  console.log(JSON.stringify({faction,level,tier,targets,perTarget:N,spells:Object.fromEntries(['mixed','attack','defense'].map(k=>[k,spellLoadout(k)])),rows}));
}
