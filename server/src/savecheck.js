// Проверка правдоподобия сохранения. Сохранение принимается всегда (честный игрок ничего не теряет);
// при подозрительном росте игрок на FLAG_MS помечается: рейтинг и награды за онлайн-бои ему не засчитываются.
// Монеты по росту не проверяем: в игре они в медных монетах и в старших цветах растут на порядки.
const FLAG_MS = 7 * 86400000;
const LIMITS = { xpFlat: 150000, xpPerHour: 400000, winsFlat: 60, winsPerHour: 400, floorMax: 5000, floorFlat: 15, floorPerHour: 12, xpMax: 1e7, winsMax: 1e7, coinsMax: 1e15 };
// Подтверждённый прогресс (2.0.2): сервер не видит боёв, поэтому доверяет росту опыта, побед и этажей Башни
// только в темпе, не превышающем честную игру. Заявленное сверх этого принимается в сохранение (его можно восстановить),
// но не попадает в рейтинг глубины и не позволяет публиковать карточку соответствующего уровня.
const START = { xp: 600, wins: 10, floor: 3 };           // что засчитывается новому аккаунту при первом сохранении
const TRUST = { xpPerHour: 60000, winsPerHour: 400, floorPerHour: 12 };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const metrics = (p) => ({ coins: num(p.coins), xp: num(p.xp), wins: num(p.wins), floor: p.tower && typeof p.tower === 'object' ? num(p.tower.best) : null });

// prev: { at, xp, wins } или null; возвращает { reason } (пусто — всё в порядке) и новые показатели
// Подтверждённые показатели после сохранения: растут от прежних подтверждённых не быстрее TRUST в час.
// Старые записи без подтверждённых значений считаются подтверждёнными как есть.
const trust = (m, prev, now) => {
  const hours = prev ? Math.max(0, (now - prev.at) / 3600000) : 0;
  const one = (claimed, tprev, start, rate) => {
    if (claimed === null) return tprev === null ? 0 : tprev;
    const allowed = tprev === null ? start : tprev + rate * hours;
    return Math.max(0, Math.min(claimed, allowed));
  };
  const base = (t, c) => (prev ? (t != null ? t : (c != null ? c : null)) : null);
  return {
    xp: Math.floor(one(m.xp, base(prev && prev.tx, prev && prev.xp), START.xp, TRUST.xpPerHour)),
    wins: Math.floor(one(m.wins, base(prev && prev.tw, prev && prev.wins), START.wins, TRUST.winsPerHour)),
    floor: Math.floor(one(m.floor, base(prev && prev.tf, prev && prev.floor), START.floor, TRUST.floorPerHour)),
  };
};
const check = (parsed, prev, now) => {
  const m = metrics(parsed), out = { m, reason: '' };
  if (m.coins !== null && (m.coins < 0 || m.coins > LIMITS.coinsMax)) out.reason = 'coins-range';
  else if (m.xp !== null && (m.xp < 0 || m.xp > LIMITS.xpMax)) out.reason = 'xp-range';
  else if (m.wins !== null && (m.wins < 0 || m.wins > LIMITS.winsMax || !Number.isInteger(m.wins))) out.reason = 'wins-range';
  else if (m.floor !== null && (m.floor < 0 || m.floor > LIMITS.floorMax || !Number.isInteger(m.floor))) out.reason = 'floor-range';
  else if (prev && m.floor !== null && m.floor - prev.floor > LIMITS.floorFlat + LIMITS.floorPerHour * Math.max(0, (now - prev.at) / 3600000)) out.reason = 'floor-jump';
  else if (prev && m.xp !== null) {
    const hours = Math.max(0, (now - prev.at) / 3600000);
    if (m.xp - prev.xp > LIMITS.xpFlat + LIMITS.xpPerHour * hours) out.reason = 'xp-jump';
    else if (m.wins !== null && m.wins - prev.wins > LIMITS.winsFlat + LIMITS.winsPerHour * hours) out.reason = 'wins-jump';
  }
  out.trusted = trust(m, prev, now);
  return out;
};
module.exports = { check, trust, FLAG_MS, LIMITS, START, TRUST };
