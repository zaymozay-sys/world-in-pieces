/* Reproducible spell economy study. node tools/spell-economy-study.js --n=30 --seed=20261127
   This is a simulation, not a browser test; win rates are relative to the selected scenarios. */
const sim = require('./sim.js');
const n = Number(process.argv.find(a=>a.startsWith('--n='))?.split('=')[1] || 30);
const seedBase = Number(process.argv.find(a=>a.startsWith('--seed='))?.split('=')[1] || 20261127);
if (!Number.isInteger(n) || n < 1 || n > 10000 || !Number.isInteger(seedBase)) throw Error('Invalid n or seed');
const strategies = [['mixed',null],['lightning',['lightning']],['fire',['fire']],['square',['square']]];
for (const [name,onlySpells] of strategies) {
  const rows = [], bySpell = {}, areaImpact = {};
  for (const faction of ['dwarf','human','elf','lizard']) for (const [monster,level,tier] of [['rat',1,1],['bandit',21,3],['troll',61,7]]) {
    const r = sim.simulate({ monster,level,tier,faction,n,seedBase,aiLevel:20,
      gear:level===1?sim.STARTER:()=>sim.typicalGear(level),
      player:()=>sim.humanPlayer({onlySpells}), tune:{fullSpells:true,economic:true,tacticalLightning:true} });
    rows.push({faction,level,win:r.win,rounds:r.rounds});
    for (const [k,v] of Object.entries(r.bySpell)) bySpell[k]=(bySpell[k]||0)+v;
    for (const [kind,values] of Object.entries(r.areaImpact)) {
      const total=areaImpact[kind]||(areaImpact[kind]={});
      for(const [k,v] of Object.entries(values)) total[k]=(total[k]||0)+v;
    }
  }
  const win=rows.reduce((s,r)=>s+r.win,0)/rows.length;
  console.log(JSON.stringify({strategy:name,battles:n*rows.length,win,bySpell,areaImpact,rows}));
}
