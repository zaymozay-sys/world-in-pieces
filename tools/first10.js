/* Прогон «первых минут» (2.2.4): новый игрок на телефоне проходит обучение у Бобра настоящими нажатиями (камни, заклинания, «На карту»),
   скриншоты каждого шага — в /tmp/f10. Запуск: node tools/first10.js [390x844|1021x658]  (≈3–4 мин; запускать в фоне). */
const {launch}=require('./browser.js');
const [W,H]=(process.argv[2]||'390x844').split('x').map(Number);
(async()=>{const b=await launch();const ctx=await b.newContext({viewport:{width:W,height:H},hasTouch:W<500,isMobile:W<500});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{try{localStorage.setItem('wip-lang','ru')}catch(e){}});
await p.goto(''+require('url').pathToFileURL(require('path').join(__dirname,'..','index.html')).href+'');await p.waitForTimeout(8000);
await p.click('text=В учебный бой').catch(e=>console.log('нет кнопки боя'));
let last='',lastDid='';
for(let i=0;i<110;i++){
 await p.waitForTimeout(900);
 const s=await p.evaluate(()=>{const box=document.querySelector('.coach');const st=Tutorial.STEPS;return {act:Tutorial.active,txt:box?box.innerText.replace(/\s+/g,' ').slice(0,170):'',btns:[...document.querySelectorAll('button')].filter(x=>x.offsetParent&&!x.disabled).map(x=>x.textContent.trim()).filter(x=>x&&x.length<24).slice(0,12),over:document.body.className}});
 const key=s.txt;if(key!==last){last=key;console.log(i,s.act,s.txt,'|',s.btns.join(','));await p.screenshot({path:`/tmp/f10/${W}-b${String(i).padStart(2,'0')}.png`});}
 if(!s.act){console.log('обучение закончено/не активно');break}
 // действия
 const did=await p.evaluate(async()=>{
  const vis=(s)=>[...document.querySelectorAll(s)].find(e=>e.offsetParent&&!e.disabled);
  const nx=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&/^(Далее|Понятно|Продолжить)/.test(e.textContent.trim()));
  if(nx){nx.click();return 'next'}
  const tm=vis('.overlay .to-map');if(tm){tm.click();return 'tomap'}
  const hl=document.querySelector('.tut-hl,.hl,[class*=highlight]');
  for(const s of ['button.magic.lightning','button.magic.fire','button.magic.square','button.magic.strike']){const b=document.querySelector(s);if(b&&b.offsetParent&&!b.disabled&&!b.classList.contains('off')&&b.classList.contains('coach-hl')){b.click();return 'cast '+s}}
  return 'move'});
 if(did.startsWith('cast')){await p.waitForTimeout(250);const bd=await p.$('#board');if(bd){const r=await bd.boundingBox();await p.mouse.click(r.x+r.width*0.5,r.y+r.height*0.5);}}
 if(did==='move'){ let hs=await p.$$('.coach-cell, .hint'); if(hs.length<2){const hb=await p.$('#hint');if(hb){await hb.click().catch(()=>{});await p.waitForTimeout(300);hs=await p.$$('.hint, .coach-cell');}} if(hs.length>=2){await hs[0].click().catch(()=>{});await p.waitForTimeout(150);await hs[1].click().catch(()=>{});} }
 if(did!=='move'&&did!=='next'&&did!==lastDid){console.log('  действие:',did);}lastDid=did;
}
console.log(errs);await b.close()})()
