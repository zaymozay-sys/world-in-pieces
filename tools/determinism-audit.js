// Аудит случайности боя: один и тот же бой дважды при одинаковом зерне Math.random — одинаковый ли ход?
const {launch}=require('./browser.js');
const SEED=Number(process.argv[2]||12345);
const run=async(b,tm)=>{ const ctx=await b.newContext({viewport:{width:1280,height:800}}); const p=await ctx.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message));
 await ctx.addInitScript((seed)=>{ let a=seed>>>0; window.__calls=0; Math.random=function(){ window.__calls++; a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; },SEED);
 await p.goto('file://'+require('path').join(__dirname,'..','index.html')); await p.waitForTimeout(2500);
 await p.evaluate(()=>{ Profile.data.name='T'; Profile.data.faction='dwarf'; });
 await p.evaluate(()=>{ MapView.startSpecial({ id:'bandit', tier:1, arena:{faction:'elf',gender:'f',level:3,ai:50,seed:777,nick:'Тень',rule:'stun'} }); });
 await p.waitForTimeout(2500);
 await p.evaluate((TM)=>{ for (const k in RULES.timing) RULES.timing[k]=TM; setAutopilot(true,60); window.__trace=[]; window.__last=''; window.__iv=setInterval(()=>{ const s=turnSide+'|'+fighters.left.hp+'|'+fighters.right.hp+'|'+(fighters.left.counts?JSON.stringify(fighters.left.counts):'')+'|'+(fighters.right.counts?JSON.stringify(fighters.right.counts):''); if(s!==window.__last){window.__last=s; window.__trace.push(s);} },20); },tm);
 await p.waitForFunction(()=>over===true,null,{timeout:90000}).catch(()=>{});
 await p.waitForTimeout(500);
 const r=await p.evaluate(()=>({trace:window.__trace, over, calls:window.__calls}));
 await ctx.close(); return {...r,errs};
};
(async()=>{ const b=await launch(); const A=await run(b,5), B=await run(b,40);
 console.log('шагов',A.trace.length,B.trace.length,'вызовов random',A.calls,B.calls,'ошибки',A.errs.length+B.errs.length);
 let d=-1; for(let i=0;i<Math.max(A.trace.length,B.trace.length);i++) if(A.trace[i]!==B.trace[i]){d=i;break;}
 console.log(d<0?'ОДИНАКОВО: бой повторился шаг в шаг':'РАСХОЖДЕНИЕ на шаге '+d+'\nA: '+A.trace[d]+'\nB: '+B.trace[d]);
 await b.close();})();
