if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Странствующий торговец (1.8.9): раз в 10 дней на 2 дня приходит в деревню (вкладка «Торговец» в Торговых рядах) и меняет редкий товар
   на ресурсы. Товары (4 штуки) выбираются по номеру цикла — у всех игроков одни и те же. Каждый товар покупается один раз за визит.
   Чистый модуль: состояние Profile.data.trader = { cycle, bought:{ id:true } }. Выдачу товара и списание ресурсов делает экран. */
const Trader = (() => {
  const DAY = 86400000, CYCLE = 10, STAY = 2, OFFSET = 3;       // приходит на 4-й и 5-й день десятидневки
  const dayNum = (now, tzMin) => Math.floor((now - (tzMin || 0) * 60000) / DAY);
  function at(now, tzMin) {
    const d = dayNum(now, tzMin), cycle = Math.floor(d / CYCLE), pos = d - cycle * CYCLE;
    const startMs = cycle * CYCLE * DAY + (tzMin || 0) * 60000;
    return { cycle, active: pos >= OFFSET && pos < OFFSET + STAY, endsAt: startMs + (OFFSET + STAY) * DAY, nextAt: pos < OFFSET + STAY ? startMs + OFFSET * DAY : startMs + (CYCLE + OFFSET) * DAY };
  }
  const rng = (seed) => { let a = (seed | 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const pickFrom = (arr, rand, k) => { const a = arr.slice(), out = []; while (out.length < k && a.length) out.push(a.splice(Math.floor(rand() * a.length), 1)[0]); return out; };
  // pools: { runes:[id], eggs:[id], res:[kind] } — списки подставляет экран (чтобы модуль не зависел от остальных)
  function stock(cycle, pools) {
    const rand = rng(Math.imul(cycle + 7, 2654435761) ^ 0x51ed), out = [];
    const give = (n) => ({ kind: pools.res[Math.floor(rand() * pools.res.length)], n });
    const rune = pickFrom(pools.runes, rand, 1)[0], egg = pickFrom(pools.eggs, rand, 1)[0];
    if (rune) out.push({ id: 'rune:' + rune, get: { type: 'rune', id: rune, n: 1 }, give: give(14) });
    if (egg) out.push({ id: 'egg:' + egg, get: { type: 'egg', id: egg, n: 1 }, give: give(22) });
    out.push({ id: 'cons:luck', get: { type: 'cons', id: 'luck', n: 3 }, give: give(10) });
    out.push({ id: 'cons:honeyjar', get: { type: 'cons', id: 'honeyjar', n: 3 }, give: give(8) });
    return out;
  }
  function clean(t) {
    t = t && typeof t === 'object' ? t : {};
    return { cycle: Number.isFinite(t.cycle) ? Math.floor(t.cycle) : -1, bought: t.bought && typeof t.bought === 'object' && !Array.isArray(t.bought) ? { ...t.bought } : {} };
  }
  function sync(t, cycle) { if (t.cycle !== cycle) { t.cycle = cycle; t.bought = {}; } return t; }
  const canBuy = (t, id) => !t.bought[id];
  function mark(t, id) { if (t.bought[id]) return false; t.bought[id] = true; return true; }
  return { DAY, CYCLE, STAY, at, stock, clean, sync, canBuy, mark };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Trader;
