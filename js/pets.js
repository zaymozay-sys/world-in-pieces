if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
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
  const TAMEABLE_FAMILY = _t("Звери");
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
  const DISPLAY_NAMES = { rat: _t("Боевая крыса"), wolf: _t("Боевой волк"), boar: _t("Боевой кабан"), lynx: _t("Боевая рысь"), hedgehog: _t("Боевой ёж"), viper: _t("Боевая гадюка"),
    spider: _t("Боевой паук"), vulture: _t("Боевой стервятник"), gull: _t("Боевая чайка"), fox: _t("Боевая лиса"), badger: _t("Боевой барсук"), owl: _t("Боевой филин"),
    otter: _t("Боевая выдра"), heron: _t("Боевая цапля"), elk: _t("Боевой лось"), goat: _t("Боевой козёл"), eagle: _t("Боевой орёл"), rhino: _t("Боевой носорог"),
    leopard: _t("Боевой барс"), bear: _t("Боевой медведь") };

  /* ---------- Домашние питомцы фракций и питомцы из яиц (1.3.9) ----------
     Домашний питомец — у каждой фракции свой, его можно оставить дома или взять в бой.
     Статы берутся у вида-донора из бестиария; в бестиарии как враги эти виды не встречаются. */
  const HOME = {
    dog:     { donor: 'wolf',      faction: 'human',  name: _t("Боевой пёс") },
    cat:     { donor: 'lynx',      faction: 'elf',    name: _t("Боевой кот") },
    hamster: { donor: 'badger',    faction: 'dwarf',  name: _t("Боевой хомяк") },
    turtle:  { donor: 'hedgehog',  faction: 'lizard', name: _t("Боевая черепаха") },
  };
  // Яйца редких питомцев: кто роняет, кого высиживают.
  const EGGS = {
    griffin: { from: 'griffin',    species: 'griffinchick', name: _t("Яйцо грифона"),   chick: _t("Грифонёнок"),        donor: 'griffin' },
    dragon:  { from: 'wyvern',     species: 'dragonling',   name: _t("Драконье яйцо"),  chick: _t("Дракончик"),         donor: 'wyvern' },
    phoenix: { from: 'salamander', species: 'phoenixchick', name: _t("Яйцо феникса"),   chick: _t("Птенец феникса"),    donor: 'salamander' },
  };
  const EGG_DROP = 0.15, HATCH_BATTLES = 5;
  const EGG_BY_SPECIES = Object.fromEntries(Object.entries(EGGS).map(([k, e]) => [e.species, e]));
  const homeFor = (faction) => Object.keys(HOME).find((k) => HOME[k].faction === faction) || null;
  const eggFrom = (monsterId) => Object.keys(EGGS).find((k) => EGGS[k].from === monsterId) || null;
  const donorOf = (id) => (HOME[id] && HOME[id].donor) || (EGG_BY_SPECIES[id] && EGG_BY_SPECIES[id].donor) || id;
  const hatchCost = (tier) => Math.round(400 * PT_T.PRICE_MULT[PT_T.clamp(tier) - 1]);

  const isTameableSpecies = (id) => { const m = PT_B.MONSTERS[id]; return !!m && m.family === TAMEABLE_FAMILY; };
  // Прогресс приручения вида — то же число, что и в бестиарии (см. Profile.recordWin).
  const tameProgress = (bestiary, id) => (bestiary && bestiary[id] && bestiary[id].wins) || 0;
  // Можно ли приручить вид прямо сейчас (приручаемое семейство + побед достаточно).
  const canTame = (bestiary, id) => isTameableSpecies(id) && tameProgress(bestiary, id) >= TAME_WINS;
  const petDisplayName = (id) => (HOME[id] && HOME[id].name) || (EGG_BY_SPECIES[id] && EGG_BY_SPECIES[id].chick) || DISPLAY_NAMES[id] || (PT_B.MONSTERS[id] ? _t("Боевой {0}", [PT_B.MONSTERS[id].name.toLowerCase()]) : _t("Питомец"));

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
    const sc = PT_B.scaled(donorOf(pet.speciesId), pet.tier);
    return {
      hp: sc.hp, max: sc.hp, dmg: sc.dmg, stats: PT_G.combine(sc.stats, {}),
      buffs: [], haste: false, magic: false, counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 },
      ability: PT_B.MONSTERS[donorOf(pet.speciesId)].ability, charged: false, revived: false, turnNo: 0,
    };
  }

  // Урон автоатаки питомца (до модификаторов Combat.hit) — доля его собственного максимума ХП; сытый (корм) — сильнее.
  const petAttackAmount = (petF) => Math.max(1, Math.round(petF.max * PET_HIT_SHARE * (petF.fedBonus || 1)));

  /* ---------- Питомник (1.3.0): платный уход за питомцем ----------
     Цены растут с цветом питомца (Tiers.PRICE_MULT), как всё остальное в игре. */
  const FEED_BATTLES = 3, FEED_BONUS = 1.25;
  const mult = (t) => PT_T.PRICE_MULT[PT_T.clamp(t) - 1];
  const repairCost = (pet) => Math.round(70 * mult(pet.tier) * Math.max(0, pet.maxDurability - pet.durability));
  const feedCost = (pet) => Math.round(45 * mult(pet.tier));
  // Обучение: питомец переходит на следующий цвет (не выше цвета героя). null — дальше нельзя.
  const trainCost = (pet, heroTier) => (pet.tier >= Math.min(PT_T.MAX, heroTier) ? null : Math.round(500 * mult(pet.tier + 1)));
  function feed(pet) { pet.fed = FEED_BATTLES; return pet; }
  function train(pet) { pet.tier = PT_T.clamp(pet.tier + 1); return pet; }
  // Начало боя с питомцем: сытость тратит один бой. Возвращает множитель урона на этот бой.
  function useFeed(pet) { if (!pet || !(pet.fed > 0)) return 1; pet.fed--; return FEED_BONUS; }

  /* ---------- Угощения (1.3.8): продаются в Питомнике, действуют несколько боёв ----------
     bone — прежняя «сытность» (pet.fed); остальные хранятся в pet.treats = { kind: боёв_осталось }. */
  const TREATS = {
    bone:    { name: _t("Сочная косточка"),   price: 45,  battles: 3, desc: _t("Удары питомца сильнее на 25%, ум +8") },
    biscuit: { name: _t("Хрустящий сухарик"), price: 55,  battles: 3, desc: _t("Броня питомца +15, ум +8") },
    honey:   { name: _t("Медовая лепёшка"),   price: 60,  battles: 3, desc: _t("ХП питомца больше на 30%, ум +8") },
    apple:   { name: _t("Золотое яблоко"),    price: 200, battles: 2, desc: _t("Всё сразу: удар +25%, броня +15, ХП +30%, ум +25") },
  };
  const TREAT_ORDER = ['bone', 'biscuit', 'honey', 'apple'];
  const treatCost = (pet, kind) => Math.round(TREATS[kind].price * mult(pet.tier));
  const treatLeft = (pet, kind) => (kind === 'bone' ? (pet.fed || 0) : ((pet.treats && pet.treats[kind]) || 0));
  function giveTreat(pet, kind) {
    const T = TREATS[kind];
    if (kind === 'bone') pet.fed = T.battles;
    else { pet.treats = pet.treats || {}; pet.treats[kind] = T.battles; }
    return pet;
  }
  // Начало боя: прибавки от угощений (без «сочной косточки» — её тратит useFeed) и расход одного боя.
  function useTreats(pet) {
    const out = { defense: 0, hpMult: 1, power: 1, int: 0 };
    if (!pet || !pet.treats) return out;
    for (const k of Object.keys(pet.treats)) {
      if (!(pet.treats[k] > 0)) continue;
      if (k === 'biscuit' || k === 'apple') out.defense += 15;
      if (k === 'honey' || k === 'apple') out.hpMult = 1.3;
      if (k === 'apple') out.power = FEED_BONUS;
      out.int += k === 'apple' ? 25 : 8;                  // допинг: угощение на время боя повышает ум
      pet.treats[k]--;
    }
    return out;
  }

  /* ---------- Опыт питомца (1.4.8): растут ум и цвет ----------
     Питомец играет на своём поле сам (ИИ). Опыт копится за каждый бой на его поле; чем больше опыта,
     тем выше «ум» — уровень ИИ 1..100 (глубина просчёта поля, см. AI.settings; на 100 — максимум), и
     тем раньше он перейдёт на следующий цвет (не выше цвета героя). */
  const BOARD_HP = 1.25;                   // на своём поле питомец крепче: слабому уму нужен запас здоровья
  const INT_XP = 1500, DOPE_BONE = 8;     // ум в бою = ум по опыту + допинг от угощений (до 100)
  const dopedIntellect = (pet, bonus) => Math.min(100, intellect(pet) + (bonus || 0));
  const intellect = (pet) => Math.min(100, Math.max(1, 1 + Math.round(99 * (1 - Math.exp(-((pet && pet.xp) || 0) / INT_XP)))));
  const tierXp = (tier) => Math.round(120 * Math.pow(tier, 1.7));          // опыт, с которого питомец переходит с цвета tier на следующий
  const xpGain = (foeTier, won) => Math.round((won ? 14 : 6) * (1 + 0.4 * (Math.max(1, foeTier) - 1)));
  // Начисляет опыт; цвет растёт сам, но не выше heroTier. Возвращает, на сколько цветов вырос.
  function addXp(pet, n, heroTier) {
    pet.xp = (pet.xp || 0) + Math.max(0, n);
    let up = 0;
    while (pet.tier < Math.min(PT_T.MAX, heroTier) && pet.xp >= tierXp(pet.tier)) { pet.tier++; up++; }
    return up;
  }

  return { BOARD_HP, intellect, dopedIntellect, DOPE_BONE, tierXp, xpGain, addXp, INT_XP, HOME, EGGS, EGG_DROP, HATCH_BATTLES, homeFor, eggFrom, donorOf, hatchCost, TREATS, TREAT_ORDER, treatCost, treatLeft, giveTreat, useTreats, TAMEABLE_FAMILY, TAME_WINS, MAX_DURABILITY, PET_HIT_SHARE, FEED_BATTLES, FEED_BONUS, isTameableSpecies, tameProgress, canTame, petDisplayName, makePet, isUsable, loseDurability, repair, petFighter, petAttackAmount,
    repairCost, feedCost, trainCost, feed, train, useFeed };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Pets;
