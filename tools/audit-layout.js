/* Аудит вёрстки (2.2.3): открывает каждый экран при нескольких размерах окна и ищет то, что глазами видно сразу:
   наезд соседних плиток друг на друга, текст, вылезающий из своей рамки, горизонтальную прокрутку страницы,
   кнопки за пределами окна. Запуск: node tools/audit-layout.js [--fail]   (--fail — код выхода 1 при находках).
   Профиль для проверки наполняется «богатым»: открыт весь бестиарий, есть питомцы, деньги, снаряжение. */
const path = require('path');
const { launch } = require('./browser.js');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const VPS = (process.env.VPS ? JSON.parse(process.env.VPS) : [[1021, 658], [1280, 720], [817, 526], [820, 1180], [390, 844], [360, 640]]);
const SKIP = new Set(['login', 'credits']);
const measure = () => {
  const out = [], root = document.querySelector('.modal') || document.body;
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const name = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  // 1. соседи в одной сетке/ряду не должны пересекаться
  root.querySelectorAll('*').forEach((p) => {
    const cs = getComputedStyle(p); if (cs.display !== 'grid' && cs.display !== 'flex') return;
    const kids = [...p.children].filter((k) => vis(k) && getComputedStyle(k).position !== 'absolute' && getComputedStyle(k).position !== 'fixed');
    if (kids.length > 400) return;
    const rs = kids.map((k) => k.getBoundingClientRect()), pr = p.getBoundingClientRect();
    const sc = (cs.overflowY !== 'visible') ? pr : null;
    let n = 0;
    for (let i = 0; i < rs.length && n < 3; i++) for (let j = i + 1; j < rs.length && n < 3; j++) {
      const a = rs[i], b = rs[j], w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 4 && h > 4 && w * h > 0.15 * Math.min(a.width * a.height, b.width * b.height)) { out.push('наезд: ' + name(p) + ' → ' + name(kids[i]) + ' и ' + name(kids[j])); n++; }
    }
  });
  // 2. текст не должен вылезать за рамку плитки/кнопки
  root.querySelectorAll('button, .card, .beast, .tile, .chip, .bchip, li').forEach((e) => {
    if (!vis(e)) return; const cs = getComputedStyle(e);
    if (cs.overflow === 'visible' && e.scrollHeight > e.clientHeight + 3 && e.clientHeight > 0 && e.children.length < 8) out.push('текст вылезает: ' + name(e) + ' (' + e.scrollHeight + '>' + e.clientHeight + ')');
    const er = e.getBoundingClientRect();
    e.querySelectorAll(':scope > *').forEach((c) => { if (!vis(c)) return; const r = c.getBoundingClientRect(); if (cs.position !== 'fixed' && getComputedStyle(c).position !== 'absolute' && (r.bottom > er.bottom + 4 || r.right > er.right + 4) && cs.overflow === 'visible' && er.height < 200) out.push('содержимое за рамкой: ' + name(e) + ' ← ' + name(c)); });
  });
  // 3. страница не должна прокручиваться вбок
  const de = document.documentElement; if (de.scrollWidth > de.clientWidth + 2) out.push('горизонтальная прокрутка страницы: ' + de.scrollWidth + '>' + de.clientWidth);
  // 4. кнопки целиком за правым краем окна
  root.querySelectorAll('button').forEach((b) => { if (!vis(b)) return; const r = b.getBoundingClientRect(); let a = b, clip = false; while ((a = a.parentElement) && a !== document.body) { const o = getComputedStyle(a); if (o.overflowX !== 'visible' && a.scrollWidth > a.clientWidth + 2) { clip = true; break; } } if (!clip && (r.left < -2 || r.right > innerWidth + 2)) out.push('кнопка за окном: ' + (b.textContent || '').trim().slice(0, 24)); });
  return [...new Set(out)];
};
(async () => {
  const b = await launch(); let total = 0; const only = process.argv.find((a) => a.startsWith('--only='));
  for (const [W, H] of VPS) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: W < 500 }), p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.addInitScript(() => { try { localStorage.setItem('wip-lang', 'ru'); } catch (e) {} });
    await p.goto(URL); await p.waitForTimeout(1500);
    await p.evaluate(() => { if (!Profile.data.faction && typeof Tutorial !== 'undefined') { Tutorial.start(); Tutorial.finish(false); } }); await p.waitForTimeout(300);
    await p.click('text=Горные кланы').catch(() => {}); await p.click('text=Мужской').catch(() => {}); await p.fill('input', 'Тест').catch(() => {}); await p.waitForTimeout(800);
    await p.evaluate(() => {
      const d = Profile.data; Object.keys(Bestiary.MONSTERS).forEach((id, i) => { if (i % 3 !== 2) d.bestiary[id] = { wins: 3 + i % 30, tier: 1 + i % 5, byTier: { 1: 3 } }; });
      d.wins = 40; d.xp = Hero.totalFor(14); d.coins = 90000; d.pet = Object.assign(Pets.makePet('wolf', 3), { xp: 300, trust: 120 }); d.stable = [Pets.makePet('wolf', 2), Object.assign(Pets.makePet('wolf', 1), { errand: { kind: 'coins', left: 2 } })];
      Profile.save();
    });
    const ids = await p.evaluate(() => Object.keys(Screens.SCREENS || {}));
    const list = ids.length ? ids : ['shop', 'forge', 'best', 'tavern', 'mill', 'lighthouse', 'wreck', 'chest', 'junker', 'library', 'valor', 'kennel', 'alchemist', 'market', 'village', 'arena', 'herocard', 'bank', 'wiki', 'whatsnew', 'help', 'sparkshop'];
    for (const id of list) {
      if (SKIP.has(id) || (only && !id.includes(only.slice(7)))) continue;
      await p.evaluate((i) => { try { Screens.open(i); } catch (e) {} }, id); await p.waitForTimeout(350);
      const f = await p.evaluate(measure);
      if (f.length) { total += f.length; console.log(`[${W}x${H}] ${id}:`); f.slice(0, 8).forEach((x) => console.log('   ' + x)); }
      await p.evaluate(() => { try { Screens.close(); } catch (e) {} }); await p.waitForTimeout(80);
    }
    if (errs.length) console.log(`[${W}x${H}] ошибки страницы:`, errs.slice(0, 3));
    await ctx.close();
  }
  await b.close(); console.log(total ? `Находок: ${total}` : 'Аудит вёрстки: чисто');
  if (total && process.argv.includes('--fail')) process.exit(1);
})();
