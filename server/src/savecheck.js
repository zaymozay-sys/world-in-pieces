// Проверка правдоподобия сохранения. Сохранение принимается всегда (честный игрок ничего не теряет);
// при подозрительном росте игрок на FLAG_MS помечается: рейтинг и награды за онлайн-бои ему не засчитываются.
// Монеты по росту не проверяем: в игре они в медных монетах и в старших цветах растут на порядки.
const FLAG_MS = 7 * 86400000;
const LIMITS = { xpFlat: 150000, xpPerHour: 400000, winsFlat: 60, winsPerHour: 400, floorMax: 5000, floorFlat: 15, floorPerHour: 12, xpMax: 1e7, winsMax: 1e7, coinsMax: 1e15 };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const metrics = (p) => ({ coins: num(p.coins), xp: num(p.xp), wins: num(p.wins), floor: p.tower && typeof p.tower === 'object' ? num(p.tower.best) : null });

// prev: { at, xp, wins } или null; возвращает { reason } (пусто — всё в порядке) и новые показатели
const check = (parsed, prev, now) => {
  const m = metrics(parsed), out = { m, reason: '' };
  if (m.coins !== null && (m.coins < 0 || m.coins > LIMITS.coinsMax)) out.reason = 'coins-range';
  else if (m.xp !== null && (m.xp < 0 || m.xp > LIMITS.xpMax)) out.reason = 'xp-range';
  else if (m.wins !== null && (m.wins < 0 || m.wins > LIMITS.winsMax || !Number.isInteger(m.wins))) out.reason = 'wins-range';
  else if (m.floor !== null && (m.floor < 0 || m.floor > LIMITS.floorMax || !Number.isInteger(m.floor))) out.reason = 'floor-range';
  else if (prev && prev.floor > 0 && m.floor !== null && m.floor - prev.floor > LIMITS.floorFlat + LIMITS.floorPerHour * Math.max(0, (now - prev.at) / 3600000)) out.reason = 'floor-jump';
  else if (prev && m.xp !== null) {
    const hours = Math.max(0, (now - prev.at) / 3600000);
    if (m.xp - prev.xp > LIMITS.xpFlat + LIMITS.xpPerHour * hours) out.reason = 'xp-jump';
    else if (m.wins !== null && m.wins - prev.wins > LIMITS.winsFlat + LIMITS.winsPerHour * hours) out.reason = 'wins-jump';
  }
  return out;
};
module.exports = { check, FLAG_MS, LIMITS };
