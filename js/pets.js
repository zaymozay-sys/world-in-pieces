/* Приручение и питомцы (без интерфейса — можно тестировать в Node).

   Приручить можно только «Звери» (крыса, волк, кабан, …) — мирных/диких существ, которых
   игрок уже побеждал много раз. Разумные враги (орки, разбойники, гоблины) и нежить/элементали
   приручению не поддаются — так решил дизайн (см. docs / обсуждение с игроком).

   Прогресс приручения переиспользует Profile.data.bestiary[id].wins (число побед над видом) —
   отдельного счётчика заводить не нужно. Как только побед хватает, вид можно приручить один раз;
   результат — Profile.data.pet = { speciesId, tier, durability, maxDurability }.

   В бою прирученный питомец — ВТОРОЙ полноценный боец на стороне игрока (см. combat.js:
   turnOrder, petAttackAmount): и герой, и питомец бьют одного и того же дикого противника
   по-настоящему (Combat.hit целиком, с блоком/бронёй/рикошетом), а не «урон героя ×2». */

const PT_B = (typeof Bestiary !== 'undefined') ? Bestiary : require('./bestiary.js');
const PT_T = (typeof Tiers !== 'undefined') ? Tiers : require('./tiers.js');
const PT_G = (typeof Gear !== 'undefined') ? Gear : require('./items.js');

const Pets = (() => {
  // Только это семейство приручаемо. Разумные враги и нежить/элементали — нет (см. заголовок файла).
  const TAMEABLE_FAMILY = 'Звери';
  // Сколько побед над видом нужно, чтобы его можно было приручить (число игрока — 25, оставлено как есть).
  const TAME_WINS = 25;
  // Прочность питомца: сколько поражений он выдерживает, прежде чем станет непригоден к бою
  // (не исчезает — просто не выходит в бой, пока его не восстановят). Простая модель, без полноценного
  // будущего «износа снаряжения» — тот будет сложнее, когда до него дойдёт очередь.
  const MAX_DURABILITY = 3;
  // Питомец наносит удар как доля СВОЕГО максимума ХП (до модификаторов Combat.hit — Силы, крита, брони цели и т.д.),
  // тем же способом, каким заданы яд/трясина (Combat.venomTick/invalidPenalty) — простая процентная формула,
  // а не копия урона героя.
  const PET_HIT_SHARE = 0.12;

  // Красивые боевые имена по виду — по мотивам примеров игрока («Боевой кот/пёс/черепаха/муравей»);
  // своего арта не заводим, статы и спрайт берутся из соответствующего вида бестиария.
  const DISPLAY_NAMES = { rat: 'Боевая крыса', wolf: 'Боевой волк', boar: 'Боевой кабан' };

  const isTameableSpecies = (id) => { const m = PT_B.MONSTERS[id]; return !!m && m.family === TAMEABLE_FAMILY; };
  // Прогресс приручения вида — то же число, что и в бестиарии (см. Profile.recordWin).
  const tameProgress = (bestiary, id) => (bestiary && bestiary[id] && bestiary[id].wins) || 0;
  // Можно ли приручить вид прямо сейчас (приручаемое семейство + побед достаточно).
  const canTame = (bestiary, id) => isTameableSpecies(id) && tameProgress(bestiary, id) >= TAME_WINS;
  const petDisplayName = (id) => DISPLAY_NAMES[id] || (PT_B.MONSTERS[id] ? `Боевой ${PT_B.MONSTERS[id].name.toLowerCase()}` : 'Питомец');

  // Новый питомец из вида id, приручённого на цвете tier. Полная прочность.
  function makePet(id, tier) {
    return { speciesId: id, tier: PT_T.clamp(tier), durability: MAX_DURABILITY, maxDurability: MAX_DURABILITY };
  }

  // Питомец готов выйти в бой, только пока у него есть прочность.
  const isUsable = (pet) => !!pet && pet.durability > 0;

  // Поражение питомца в бою тратит 1 прочность (мутирует и возвращает тот же объект — как Profile хранит остальной прогресс).
  function loseDurability(pet) {
    pet.durability = Math.max(0, pet.durability - 1);
    return pet;
  }
  // Восстановление (будущий магазин/крафт) — полностью возвращает прочность.
  function repair(pet) {
    pet.durability = pet.maxDurability;
    return pet;
  }

  // Боевой объект питомца — тот же формат «бойца», что и герой/существо в combat.js, чтобы Combat.hit
  // работал с ним без каких-либо особых случаев. Статы и ХП — от вида-донора (Bestiary.scaled), урон
  // питомца в бою считает petAttackAmount (см. выше), а не сила камней.
  function petFighter(pet) {
    const sc = PT_B.scaled(pet.speciesId, pet.tier);
    return {
      hp: sc.hp, max: sc.hp, dmg: sc.dmg, stats: PT_G.combine(sc.stats, {}),
      buffs: [], haste: false, magic: false, counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 },
      ability: PT_B.MONSTERS[pet.speciesId].ability, charged: false, revived: false, turnNo: 0,
    };
  }

  // Урон автоатаки питомца (до модификаторов Combat.hit) — доля его собственного максимума ХП.
  const petAttackAmount = (petF) => Math.max(1, Math.round(petF.max * PET_HIT_SHARE));

  return { TAMEABLE_FAMILY, TAME_WINS, MAX_DURABILITY, PET_HIT_SHARE, isTameableSpecies, tameProgress, canTame, petDisplayName, makePet, isUsable, loseDurability, repair, petFighter, petAttackAmount };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Pets;
