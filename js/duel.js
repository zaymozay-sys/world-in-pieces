/* Бой с «тенью» живого игрока (1.9.x). Чистый модуль: карточка героя для сервера и тень соперника для арены.
   Карточка — только то, что нужно для боя (ник, народ, пол, уровень, ранг арены, вещи), без личных данных.
   Тень соперника строится из карточки чужого героя: его вещи — данные другого игрока, поэтому перед боем их очищаем. */
const Duel = (() => {
  const FACTIONS = ['human', 'dwarf', 'elf', 'lizard'];
  const nick = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 24);
  // допустимое значение внутри вещи: число, строка, булево или простой вложенный объект (глубина до 2)
  const plain = (v, depth = 0) => {
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'string') return v.slice(0, 40);
    if (depth < 2 && v && typeof v === 'object' && !Array.isArray(v)) { const o = {}; for (const k of Object.keys(v).slice(0, 12)) o[String(k).slice(0, 20)] = plain(v[k], depth + 1); return o; }
    return 0;
  };
  const cleanGear = (gear, slots, known) => {
    const out = {};
    for (const s of slots) {
      const e = gear && gear[s];
      out[s] = e && typeof e === 'object' && typeof e.id === 'string' && (!known || known(e)) ? plain(e) : null;
      if (out[s]) {                                                    // руны (до 2 id) и огранка (цвет 1..10) — единственные вложенные поля, нужные в бою
        delete out[s].runes; delete out[s].cut;
        if (Array.isArray(e.runes)) { const rs = e.runes.filter((r) => typeof r === 'string' && /^[a-z0-9-]{1,30}$/.test(r)).slice(0, 2); if (rs.length) out[s].runes = rs; }
        if (Number.isInteger(e.cut) && e.cut >= 1 && e.cut <= 10) out[s].cut = e.cut;
      }
    }
    return out;
  };
  // Карточка моего героя: slots — список ячеек (Gear.SLOTS); имя по умолчанию строит игра.
  function makeCard(o, slots) {
    const gear = cleanGear(o.gear, slots, null);
    for (const s of slots) if (gear[s]) delete gear[s].uid;            // уникальный номер вещи чужому не нужен
    return {
      nick: nick(o.nick) || 'Герой', faction: FACTIONS.includes(o.faction) ? o.faction : 'dwarf', gender: o.gender === 'f' ? 'f' : 'm',
      level: Math.max(1, Math.min(100, Math.round(Number(o.level)) || 1)), rank: Math.max(0, Math.min(20, Math.round(Number(o.rank)) || 0)), gear,
    };
  }
  // Тень соперника из карточки: known(entry) — есть ли такая вещь в игре; ум — от ранга соперника на арене.
  function toShadow(card, slots, known, rand = Math.random) {
    if (!card || typeof card !== 'object') return null;
    const level = Math.round(Number(card.level));
    if (!Number.isFinite(level) || level < 1 || level > 100 || !FACTIONS.includes(card.faction) || (card.gender !== 'm' && card.gender !== 'f')) return null;
    const n = nick(card.nick); if (!n) return null;
    const gear = cleanGear(card.gear, slots, known);
    for (const s of slots) if (gear[s]) gear[s].uid = 'duel-' + s;
    const rank = Math.max(0, Math.min(20, Math.round(Number(card.rank)) || 0));
    return { faction: card.faction, gender: card.gender, level, ai: Math.min(100, 30 + rank * 7), seed: Math.floor(rand() * 1e9), nick: n, gear, real: true };
  }
  // Турнир: одинаковый для всех набор вещей по зерну турнира (deps: { Gear, Hero, HexMap })
  function fixedGear(level, seed, deps) {
    const { Gear, Hero, HexMap } = deps, t = Hero.tierFor(level);
    return Gear.randomLoadout(Hero.budget(level), HexMap.rng(seed >>> 0), t);
  }
  // Карточка участника турнира: свои ник, народ и пол, но уровень и вещи — общие
  function fixedCard(who, level, seed, deps) {
    return { v: 1, nick: who.nick, faction: who.faction, gender: who.gender, level, rank: 0, gear: fixedGear(level, seed, deps) };
  }
  return { makeCard, toShadow, cleanGear, nick, FACTIONS, fixedGear, fixedCard };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Duel;
