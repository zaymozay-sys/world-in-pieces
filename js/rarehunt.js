/* Охота за редким зверем (1.8.8): раз в неделю на карте на три дня появляется «блуждающий» редкий зверь и уходит.
   Чистый модуль: всё зависит только от даты и зерна карты (у всех игроков на одной карте один зверь в одну неделю). */
const RareHunt = (() => {
  const DAY = 86400000, CYCLE = 7, STAY = 3;
  const SPECIES = ['mimic', 'griffin', 'basilisk', 'wyvern', 'crystalid'];
  const dayNum = (now, tzMin) => Math.floor((now - (tzMin || 0) * 60000) / DAY);
  // tzMin — смещение часового пояса в минутах (как у Date.getTimezoneOffset): границы суток по местному времени
  function at(now, tzMin) {
    const d = dayNum(now, tzMin), cycle = Math.floor(d / CYCLE), pos = d - cycle * CYCLE;
    const startMs = cycle * CYCLE * DAY + (tzMin || 0) * 60000;
    return { cycle, active: pos < STAY, species: SPECIES[cycle % SPECIES.length], endsAt: startMs + STAY * DAY, nextAt: startMs + CYCLE * DAY };
  }
  // клетка зверя: выбирается из подходящих (индексы, отсортированные) по циклу и зерну карты
  function pick(cands, seed, cycle) {
    if (!cands.length) return null;
    let h = (Math.imul((seed | 0) ^ 0x7a4e, 2654435761) + Math.imul(cycle + 1, 40503)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    return cands[h % cands.length];
  }
  // награда за победу: монеты ×3 от «тайника» цвета героя, ресурсы и трофей (счётчик в data.trophies)
  const reward = (cacheCoins) => ({ coins: Math.round(cacheCoins * 3), res: [['essence', 3], ['crystal', 2]] });
  function trophy(data, species) {
    const t = data.trophies = data.trophies && typeof data.trophies === 'object' && !Array.isArray(data.trophies) ? data.trophies : {};
    t[species] = (Number.isFinite(t[species]) ? t[species] : 0) + 1;
    return t[species];
  }
  const trophyCount = (data) => Object.values((data && data.trophies) || {}).reduce((n, x) => n + (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0), 0);
  return { DAY, CYCLE, STAY, SPECIES, at, pick, reward, trophy, trophyCount };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RareHunt;
