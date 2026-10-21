// Серверная проверка боевой карточки по правилам игры (server/rules — копия модулей клиента).
// Вещи пересобираются из id, цвета, закалки: всё лишнее выбрасывается; ставится только то, что игрок мог бы надеть сам.
const path = require('path');
const R = (n) => require(path.join(__dirname, '..', 'rules', n));
const Gear = R('items.js'), Hero = R('hero.js'), Runes = R('runes.js'), Stones = R('stones.js');
global.Hero = global.Hero || Hero;   // items.js проверяет уровень через глобальный Hero, как в браузере

// Возвращает { gear } с очищенными вещами или { error }. level/faction уже проверены cleanCard.
const check = (card) => {
  const gear = Gear.emptyLoadout ? { ...Gear.emptyLoadout() } : {};
  const slots = Gear.SLOTS;
  for (const s of Object.keys(card.gear)) if (!slots.includes(s)) return { error: 'slot' };
  // двуручное оружие кладём первым: оно освобождает левую руку, остальное порядок не меняет
  const order = ['main', ...slots.filter((s) => s !== 'main')];
  for (const s of order) {
    const e = card.gear[s]; gear[s] = gear[s] || null;
    if (e == null) continue;
    if (typeof e.id !== 'string') return { error: 'item' };
    const clean = { uid: 'c-' + s, id: e.id, tier: Math.max(1, Math.min(10, Math.round(Number(e.tier)) || 1)) };
    if (e.plus > 0) clean.plus = Math.min(5, Math.round(Number(e.plus)) || 0);
    if (e.fit) clean.fit = true;
    if (Array.isArray(e.runes)) { const rs = e.runes.filter((r) => typeof r === 'string' && Runes.CATALOG[r]).slice(0, Runes.socketsFor(clean)); if (rs.length) clean.runes = rs; }   // руны и огранка идут в бой с тенью
    if (Stones.valid(e.cut)) clean.cut = e.cut;
    const ok = Gear.canEquip(gear, clean, s, card.faction, card.level);
    if (!ok.ok) return { error: 'equip' };
    Object.assign(gear, Gear.equip(gear, clean, s));
  }
  for (const s of slots) if (gear[s]) { gear[s] = { ...gear[s] }; delete gear[s].uid; }   // номера вещей чужому не нужны
  if (Gear.totalCost(gear) > Hero.budget(card.level)) return { error: 'budget' };
  return { gear };
};
module.exports = { check };
