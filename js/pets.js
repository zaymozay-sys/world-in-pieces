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
  /* ---------- Черты и кличка (2.1.5) ----------
     При приручении/вылуплении питомец получает две разные черты: у каждой есть сильная и слабая сторона.
     Множители: hit — удар, hp — здоровье, xp — опыт, find — клад и разведка, speed — время занятий (меньше = быстрее), save — шанс не потерять прочность. */
  const TRAITS = {
    brave:    { name: _t("Смелый"),         desc: _t("Удар сильнее на 10%, здоровья меньше на 5%."),               mul: { hit: 1.10, hp: 0.95 } },
    sturdy:   { name: _t("Крепкий"),        desc: _t("Здоровья больше на 12%, занятия дольше на 10%."),            mul: { hp: 1.12, speed: 1.10 } },
    swift:    { name: _t("Шустрый"),        desc: _t("Занятия короче на 15%, удар слабее на 5%."),                 mul: { speed: 0.85, hit: 0.95 } },
    clever:   { name: _t("Сообразительный"), desc: _t("Опыт растёт на 15% быстрее, здоровья меньше на 5%."),        mul: { xp: 1.15, hp: 0.95 } },
    lucky:    { name: _t("Везучий"),        desc: _t("Клад и разведка богаче на 20%, опыт меньше на 10%."),        mul: { find: 1.20, xp: 0.90 } },
    greedy:   { name: _t("Жадный"),         desc: _t("Клад богаче на 25%, удар слабее на 5%."),                    mul: { find: 1.25, hit: 0.95 } },
    careful:  { name: _t("Осторожный"),     desc: _t("С шансом 20% не теряет прочность в проигранном бою, удар слабее на 5%."), mul: { save: 0.20, hit: 0.95 } },
    loyal:    { name: _t("Преданный"),      desc: _t("Удар и здоровье выше на 6%, клад и разведка беднее на 15%."), mul: { hit: 1.06, hp: 1.06, find: 0.85 } },
    calm:     { name: _t("Спокойный"),      desc: _t("Опыт растёт на 10% быстрее, занятия дольше на 10%."),         mul: { xp: 1.10, speed: 1.10 } },
    fierce:   { name: _t("Свирепый"),       desc: _t("Удар сильнее на 15%, опыт меньше на 10%."),                  mul: { hit: 1.15, xp: 0.90 } },
  };
  const TRAIT_IDS = Object.keys(TRAITS);
  function rollTraits(rng = Math.random) {
    const pool = TRAIT_IDS.slice(), out = [];
    for (let i = 0; i < 2; i++) out.push(pool.splice(Math.floor(rng() * pool.length) % pool.length, 1)[0]);
    return out;
  }
  const traitsOf = (pet) => ((pet && Array.isArray(pet.traits)) ? pet.traits.filter((t) => TRAITS[t]) : []);
  const traitMul = (pet, key) => traitsOf(pet).reduce((m, t) => m * (TRAITS[t].mul[key] || 1), 1);
  const NAME_MAX = 16;
  // Кличка: буквы, цифры, пробел, дефис, апостроф; до 16 знаков. Возвращает очищенную строку или null.
  function cleanName(s) {
    const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    if (!t || t.length > NAME_MAX || !/^[\p{L}\p{N} '\-]+$/u.test(t)) return null;
    return t;
  }
  function setName(pet, s) { const n = cleanName(s); if (!pet || !n) return false; pet.name = n; return true; }
  const petTitle = (pet) => (pet && pet.name) || petDisplayName(pet && pet.speciesId);


  /* ---------- Доверие и таланты (2.1.6) ----------
     Доверие 0–100 растёт от совместных побед, ухода и занятий, падает от поражений. Оно слегка усиливает питомца (до +10% к удару и здоровью)
     и даёт очки талантов. Очков: на 1 меньше цвета питомца, плюс по одному за каждые 50 доверия. Таланты — две ветки, у каждого до 2 уровней. */
  const TRUST_MAX = 100;
  const TRUST_NAMES = [[75, _t("Верный")], [50, _t("Друг")], [25, _t("Знакомый")], [0, _t("Настороженный")]];
  const trustOf = (pet) => Math.max(0, Math.min(TRUST_MAX, Math.round((pet && pet.trust) || 0)));
  const trustName = (pet) => (TRUST_NAMES.find(([lo]) => trustOf(pet) >= lo) || TRUST_NAMES[3])[1];
  const TALENTS = {
    fang:    { branch: 'fighter', name: _t("Острые клыки"),   desc: _t("Удар сильнее на 6% за уровень."),                   max: 2, per: { hit: 0.06 } },
    hide:    { branch: 'fighter', name: _t("Толстая шкура"),   desc: _t("Здоровья больше на 6% за уровень."),                max: 2, per: { hp: 0.06 } },
    guard:   { branch: 'fighter', name: _t("Страж"),           desc: _t("Шанс не потерять прочность в проигранном бою +10% за уровень."), max: 2, save: 0.10 },
    mettle:  { branch: 'fighter', name: _t("Выучка"),          desc: _t("Удар и здоровье выше на 3% за уровень."),          max: 2, per: { hit: 0.03, hp: 0.03 } },
    nose:    { branch: 'helper',  name: _t("Чутьё"),           desc: _t("Клад и разведка богаче на 10% за уровень."),       max: 2, per: { find: 0.10 } },
    learner: { branch: 'helper',  name: _t("Любознательный"),  desc: _t("Опыт растёт на 8% быстрее за уровень."),           max: 2, per: { xp: 0.08 } },
    quick:   { branch: 'helper',  name: _t("Проворство"),      desc: _t("Занятия короче на 8% за уровень."),               max: 2, per: { speed: -0.08 } },
    bond:    { branch: 'helper',  name: _t("Привязанность"),   desc: _t("Доверие растёт на 50% быстрее за уровень."),       max: 2, bond: 0.5 },
  };
  const TALENT_IDS = Object.keys(TALENTS);
  const BRANCH_NAMES = { fighter: _t("Боец"), helper: _t("Помощник") };
  const talentRank = (pet, id) => Math.max(0, Math.min(TALENTS[id] ? TALENTS[id].max : 0, Math.floor(((pet && pet.talents) || {})[id] || 0)));
  const talentsSpent = (pet) => TALENT_IDS.reduce((n, id) => n + talentRank(pet, id), 0);
  const talentPoints = (pet) => Math.max(0, (pet ? Math.max(0, pet.tier - 1) + Math.floor(trustOf(pet) / 50) + evoStage(pet) : 0) - talentsSpent(pet));
  function talentUp(pet, id) {
    if (!pet || !TALENTS[id] || talentRank(pet, id) >= TALENTS[id].max || talentPoints(pet) < 1) return false;
    pet.talents = pet.talents || {}; pet.talents[id] = talentRank(pet, id) + 1; return true;
  }
  const talentResetCost = (pet) => (talentsSpent(pet) ? Math.round(300 * mult(pet.tier)) : 0);
  function talentReset(pet) { if (pet) pet.talents = {}; return pet; }
  const talentMul = (pet, key) => TALENT_IDS.reduce((m, id) => m * (1 + ((TALENTS[id].per || {})[key] || 0) * talentRank(pet, id)), 1);
  // шанс уберечь прочность в проигранном бою: черты и таланты складываются как независимые шансы
  const saveChance = (pet) => {
    let keep = 1 - Math.min(0.95, traitMul(pet, 'save') < 1 ? traitMul(pet, 'save') : 0);
    for (const id of TALENT_IDS) keep *= 1 - Math.min(0.95, (TALENTS[id].save || 0) * talentRank(pet, id));
    return 1 - keep;
  };

  /* ---------- Эволюция и снаряжение (2.1.8) ----------
     На 5-м цвете питомец выбирает путь: «Охотник» (удар) или «Страж» (здоровье); на 10-м цвете путь усиливается («Вожак»). Каждая ступень даёт очко талантов.
     Снаряжение — ошейник (удар), сбруя (здоровье), амулет (опыт и находки): у каждой вещи свой цвет (не выше цвета питомца), её можно улучшать за монеты. */
  const EVO_TIERS = [5, 10];
  const EVOS = {
    hunter: { name: _t("Охотник"), desc: _t("Путь удара: +12% к удару, на 10-м цвете ещё +8%."),     per: [{ hit: 0.12 }, { hit: 0.08 }] },
    warden: { name: _t("Защитник"), desc: _t("Путь защиты: +12% к здоровью, на 10-м цвете ещё +8%."), per: [{ hp: 0.12 }, { hp: 0.08 }] },
  };
  const EVO_TITLES = [_t("Матёрый"), _t("Вожак")];
  const evoStage = (pet) => (pet && EVOS[pet.evo] ? Math.min(2, Math.max(1, Math.floor(pet.evoStage || 1))) : 0);
  const canEvolve = (pet) => !!pet && ((evoStage(pet) === 0 && pet.tier >= EVO_TIERS[0]) || (evoStage(pet) === 1 && pet.tier >= EVO_TIERS[1]));
  const evoCost = (pet) => Math.round(1200 * mult(pet.tier));
  function evolve(pet, path) {
    if (!canEvolve(pet)) return false;
    if (evoStage(pet) === 0) { if (!EVOS[path]) return false; pet.evo = path; pet.evoStage = 1; return true; }
    pet.evoStage = 2; return true;
  }
  const evoTitle = (pet) => (evoStage(pet) ? EVO_TITLES[evoStage(pet) - 1] + ' · ' + EVOS[pet.evo].name : '');
  const evoMul = (pet, key) => { const st = evoStage(pet); let m = 1; for (let i = 0; i < st; i++) m *= 1 + (EVOS[pet.evo].per[i][key] || 0); return m; };
  const GEAR = {
    collar:  { name: _t("Ошейник"), desc: _t("Удар сильнее на 2% за цвет вещи."),              per: { hit: 0.02 } },
    harness: { name: _t("Сбруя"),   desc: _t("Здоровья больше на 2% за цвет вещи."),           per: { hp: 0.02 } },
    charm:   { name: _t("Амулет"),  desc: _t("Особый эффект на выбор: верность, целитель, удача или учёба."), per: { xp: 0.02, find: 0.02 } },
  };
  const GEAR_IDS = Object.keys(GEAR);
  const gearTier = (pet, id) => Math.max(0, Math.min((pet && pet.tier) || 0, Math.floor(((pet && pet.gear) || {})[id] || 0)));
  const gearUpCost = (pet, id) => (!pet || !GEAR[id] || gearTier(pet, id) >= Math.min(PT_T.MAX, pet.tier) ? null : Math.round(250 * mult(gearTier(pet, id) + 1)));
  function gearUp(pet, id) { if (gearUpCost(pet, id) == null) return false; pet.gear = pet.gear || {}; pet.gear[id] = gearTier(pet, id) + 1; return true; }
  const gearMul = (pet, key) => GEAR_IDS.reduce((m, id) => m * (id === 'charm' && amuletId(pet) !== 'scholar' ? 1 : (1 + ((GEAR[id].per[key]) || 0) * gearTier(pet, id))), 1);
  /* Амулеты: слот амулета даёт один особый эффект на выбор; его сила растёт с цветом вещи. */
  const AMULETS = {
    loyal:   { name: _t("Амулет верности"),  desc: (t) => _t("Раз за бой питомец встаёт после гибели с {0}% здоровья.", [Math.round(amuletValue('loyal', t) * 100)]) },
    healer:  { name: _t("Амулет целителя"),  desc: (t) => _t("Когда питомец побеждает врага на своём поле, он лечит героя на {0}% здоровья.", [Math.round(amuletValue('healer', t) * 100)]) },
    fortune: { name: _t("Амулет удачи"),     desc: (t) => _t("С шансом {0}% монет с побеждённого врага становится вдвое больше.", [Math.round(amuletValue('fortune', t) * 100)]) },
    scholar: { name: _t("Амулет учёбы"),     desc: (t) => _t("Опыт и находки больше на {0}%.", [2 * t]) },
  };
  const AMULET_IDS = Object.keys(AMULETS);
  function amuletValue(id, t) { return id === 'loyal' ? 0.2 + 0.03 * t : id === 'healer' ? 0.06 + 0.01 * t : id === 'fortune' ? 0.05 + 0.015 * t : 0; }
  const amuletId = (pet) => (gearTier(pet, 'charm') > 0 ? (AMULETS[pet.amulet] ? pet.amulet : 'scholar') : null);
  const amuletPower = (pet, id) => (amuletId(pet) === id ? amuletValue(id, gearTier(pet, 'charm')) : 0);
  const amuletSwapCost = (pet) => Math.round(250 * mult(Math.max(1, gearTier(pet, 'charm'))));
  // выбрать вид амулета: первый раз вместе с изготовлением (цена как у улучшения), потом смена за монеты (цвет вещи сохраняется)
  function setAmulet(pet, id) { if (!pet || !AMULETS[id]) return false; pet.amulet = id; return true; }

  // итоговый множитель: черты × таланты × доверие (последнее только для удара и здоровья)
  const petMul = (pet, key) => traitMul(pet, key) * talentMul(pet, key) * evoMul(pet, key) * gearMul(pet, key) * ((key === 'hit' || key === 'hp') ? 1 + trustOf(pet) / 1000 : 1);
  function addTrust(pet, n) {
    if (!pet || !n) return pet;
    const bond = TALENT_IDS.reduce((m, id) => m + (TALENTS[id].bond || 0) * talentRank(pet, id), 0);
    const d = n > 0 ? Math.round(n * (1 + bond)) : n;
    pet.trust = Math.max(0, Math.min(TRUST_MAX, trustOf(pet) + d)); return pet;
  }

  function makePet(id, tier, rng) {
    const p = { speciesId: id, tier: PT_T.clamp(tier), durability: MAX_DURABILITY, maxDurability: MAX_DURABILITY };
    if (rng) p.traits = rollTraits(rng);       // без rng (старые вызовы и тесты) черт нет
    return p;
  }

  // Питомец готов выйти в бой, только пока у него есть прочность.
  const isUsable = (pet) => !!pet && pet.durability > 0;

  // Поражение питомца в бою тратит 1 прочность (мутирует и возвращает тот же объект — как Profile хранит остальной прогресс).
  function loseDurability(pet, rng = Math.random) {
    if (saveChance(pet) > 0 && rng() < saveChance(pet)) return pet;     // «Осторожный», талант «Страж»
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
      hp: Math.round(sc.hp * petMul(pet, 'hp')), max: Math.round(sc.hp * petMul(pet, 'hp')), hitMul: petMul(pet, 'hit'), dmg: sc.dmg, stats: PT_G.combine(sc.stats, {}),
      buffs: [], haste: false, magic: false, counts: { sapphire: 0, ruby: 0, emerald: 0, onyx: 0 },
      ability: PT_B.MONSTERS[donorOf(pet.speciesId)].ability, charged: false, revived: false, turnNo: 0,
      ...(amuletPower(pet, 'loyal') ? { secondWind: true, secondWindFrac: amuletPower(pet, 'loyal') } : {}),     // «Амулет верности»: один раз встаёт
    };
  }

  // Урон автоатаки питомца (до модификаторов Combat.hit) — доля его собственного максимума ХП; сытый (корм) — сильнее.
  const petAttackAmount = (petF) => Math.max(1, Math.round(petF.max * PET_HIT_SHARE * (petF.fedBonus || 1) * (petF.hitMul || 1)));

  /* ---------- Питомник (1.3.0): платный уход за питомцем ----------
     Цены растут с цветом питомца (Tiers.PRICE_MULT), как всё остальное в игре. */
  const FEED_BATTLES = 3, FEED_BONUS = 1.25;
  const mult = (t) => PT_T.PRICE_MULT[PT_T.clamp(t) - 1];
  const repairCost = (pet) => Math.round(70 * mult(pet.tier) * Math.max(0, pet.maxDurability - pet.durability));
  const feedCost = (pet) => Math.round(45 * mult(pet.tier));
  // Обучение: питомец переходит на следующий цвет (не выше цвета героя). null — дальше нельзя.
  const trainCost = (pet, heroTier) => (pet.tier >= Math.min(PT_T.MAX, heroTier) ? null : Math.round(500 * mult(pet.tier + 1)));
  function feed(pet) { pet.fed = FEED_BATTLES; addTrust(pet, 1); return pet; }
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
    addTrust(pet, 2);
    return pet;
  }
  // Начало боя: прибавки от угощений (без «сочной косточки» — её тратит useFeed) и расход одного боя.
  const DRILL_INT = 12;
  function useTreats(pet) {
    const out = { defense: 0, hpMult: 1, power: 1, int: 0 };
    if (pet && pet.drill > 0) { out.int += DRILL_INT; pet.drill--; }      // 1.5.1: дрессировка — ум выше на 2 боя
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
  const NOVICE_INT = 10, NOVICE_HP = 1.9, BOARD_DMG = 1.3;   // 1.5.0: новичок (ум < 10) на своём поле ещё крепче
  const isRare = (pet) => !!pet && !!EGG_BY_SPECIES[pet.speciesId];     // питомец из яйца: зверь-донор сильнее, ИИ врага крепче
  const boardHp = (pet) => (intellect(pet) < NOVICE_INT ? NOVICE_HP : BOARD_HP) * (isRare(pet) ? 1.35 : 1) * petMul(pet, 'hp');
  const boardDmg = (pet) => BOARD_DMG * (isRare(pet) ? 1.2 : 1) * petMul(pet, 'hit');
  const BOARD_HP = 1.6;                   // на своём поле питомец крепче: слабому уму нужен запас здоровья
  const INT_XP = 1500, DOPE_BONE = 8;     // ум в бою = ум по опыту + допинг от угощений (до 100)
  const dopedIntellect = (pet, bonus) => Math.min(100, intellect(pet) + (bonus || 0));
  const intellect = (pet) => Math.min(100, Math.max(1, 1 + Math.round(99 * (1 - Math.exp(-((pet && pet.xp) || 0) / INT_XP)))));
  const tierXp = (tier) => Math.round(120 * Math.pow(tier, 1.7));          // опыт, с которого питомец переходит с цвета tier на следующий
  const xpGain = (foeTier, won) => Math.round((won ? 14 : 10) * (1 + 0.4 * (Math.max(1, foeTier) - 1)));
  // Начисляет опыт; цвет растёт сам, но не выше heroTier. Возвращает, на сколько цветов вырос.
  function addXp(pet, n, heroTier) {
    pet.xp = (pet.xp || 0) + Math.max(0, Math.round(n * petMul(pet, 'xp')));
    let up = 0;
    while (pet.tier < Math.min(PT_T.MAX, heroTier) && pet.xp >= tierXp(pet.tier)) { pet.tier++; up++; }
    return up;
  }

  // 1.5.0: учёба в питомнике — ум растёт и без боёв, но только до STUDY_CAP (дальше — только в боях).
  const STUDY_MS = 3 * 60000, STUDY_XP = 45, STUDY_CAP = 25, READY_INT = 5;
  const ACTS = { study: { ms: STUDY_MS }, ball: { ms: STUDY_MS }, hunt: { ms: 5 * 60000 }, drill: { ms: 5 * 60000 }, rest: { ms: 4 * 60000 }, scout: { ms: 8 * 60000 } };    // учёба, мяч (бодрость на 2 боя), поиск клада (монеты)
  const studyOpen = (pet) => !!pet && intellect(pet) < STUDY_CAP;
  const studyLeft = (pet, now = Date.now()) => (pet && pet.study ? Math.max(0, pet.study - now) : -1);   // -1: ничем не занят
  function studyStart(pet, now = Date.now(), kind = 'study', speed = 1) {      // speed < 1 — улучшение Питомника
    if (!pet || pet.study || !ACTS[kind] || (kind === 'study' && !studyOpen(pet))) return false;
    pet.study = now + Math.round(ACTS[kind].ms * Math.max(0.2, speed * petMul(pet, 'speed'))); pet.studyKind = kind; return true;
  }
  const huntCoins = (pet) => Math.round(40 * mult(pet.tier) * petMul(pet, 'find'));
  // Серия дней: занятие в новый день подряд растит серию; на 3-й и 7-й день — бонус опыта.
  const dayOf = (now) => Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / 86400000);
  const STREAK_BONUS = { 3: 60, 7: 150 };
  function streakTick(pet, heroTier, now) {
    const d = dayOf(now);
    if (pet.streakDay === d) return { streak: pet.streak || 1, bonus: 0 };
    pet.streak = pet.streakDay === d - 1 ? (pet.streak || 0) + 1 : 1;
    pet.streakDay = d;
    const bonus = STREAK_BONUS[pet.streak] || 0;
    if (bonus) addXp(pet, bonus, heroTier);
    return { streak: pet.streak, bonus };
  }
  function studyCollect(pet, heroTier, now = Date.now(), rng = Math.random) {
    if (!pet || !pet.study || pet.study > now) return null;
    const kind = pet.studyKind || 'study';
    pet.study = 0; pet.studyKind = null;
    const before = intellect(pet);
    let res;
    if (kind === 'ball') { pet.fed = Math.max(pet.fed || 0, 2); res = { kind }; }
    else if (kind === 'hunt') res = { kind, coins: huntCoins(pet) };
    else if (kind === 'drill') { pet.drill = 2; res = { kind }; }
    else if (kind === 'rest') { const g = Math.min(1, pet.maxDurability - pet.durability); pet.durability += g; res = { kind, gain: g }; }
    else if (kind === 'scout') {
      const kinds = PT_B.PRIZE_RESOURCES, k = kinds[Math.floor(rng() * kinds.length)];
      res = { kind, res: { kind: k, tier: Math.max(1, Math.min(pet.tier, heroTier)), n: 1 + Math.floor(rng() * 2) + (petMul(pet, 'find') > 1 && rng() < petMul(pet, 'find') - 1 ? 1 : 0) } };
    } else { const up = addXp(pet, STUDY_XP, heroTier); res = { kind, up }; }
    addTrust(pet, 1);
    res.before = before; res.after = intellect(pet);
    Object.assign(res, { streakInfo: streakTick(pet, heroTier, now) });
    res.after = intellect(pet);
    return res;
  }
  const battleReady = (pet) => intellect(pet) >= READY_INT;
  // 2.2.2: поручения — запасной питомец из зверинца уходит на несколько боёв героя и возвращается с добычей
  const ERRANDS = { coins: { name: _t("Поиск монет"), battles: 4 }, forage: { name: _t("Сбор добычи"), battles: 5 } };
  const FORAGE_KINDS = ['hide', 'fang', 'bone', 'scrap', 'ore', 'splinter', 'honey', 'silk'];
  const errandOf = (pet) => (pet && pet.errand && ERRANDS[pet.errand.kind]) ? pet.errand : null;
  const errandReady = (pet) => { const e = errandOf(pet); return !!e && e.left <= 0; };
  const sendErrand = (pet, kind) => { if (!pet || !ERRANDS[kind] || errandOf(pet)) return false; pet.errand = { kind, left: ERRANDS[kind].battles }; return true; };
  const errandTick = (pet) => { const e = errandOf(pet); if (e && e.left > 0) e.left--; };
  const errandTake = (pet, rnd = Math.random) => {   // награда: монеты или ресурс цвета питомца; доверие даёт добавку
    if (!errandReady(pet)) return null;
    const kind = pet.errand.kind; pet.errand = null;
    if (kind === 'coins') return { coins: Math.round(huntCoins(pet) * 1.2) };
    return { res: FORAGE_KINDS[Math.floor(rnd() * FORAGE_KINDS.length)], tier: Math.max(1, pet.tier || 1), n: 2 + Math.floor(trustOf(pet) / 100) + (rnd() < 0.3 ? 1 : 0) };
  };
  return { ERRANDS, errandOf, errandReady, sendErrand, errandTick, errandTake, AMULETS, AMULET_IDS, amuletId, amuletPower, amuletValue, amuletSwapCost, setAmulet, EVO_TIERS, EVO_TITLES, EVOS, evoStage, canEvolve, evoCost, evolve, evoTitle, GEAR, GEAR_IDS, gearTier, gearUpCost, gearUp, TRUST_MAX, trustOf, trustName, TALENTS, TALENT_IDS, BRANCH_NAMES, talentRank, talentsSpent, talentPoints, talentUp, talentReset, talentResetCost, saveChance, petMul, addTrust, TRAITS, TRAIT_IDS, rollTraits, traitsOf, traitMul, NAME_MAX, cleanName, setName, petTitle, DRILL_INT, STREAK_BONUS, BOARD_DMG, boardDmg, isRare, boardHp, NOVICE_INT, STUDY_MS, STUDY_XP, STUDY_CAP, READY_INT, ACTS, huntCoins, studyOpen, studyLeft, studyStart, studyCollect, battleReady, BOARD_HP, intellect, dopedIntellect, DOPE_BONE, tierXp, xpGain, addXp, INT_XP, HOME, EGGS, EGG_DROP, HATCH_BATTLES, homeFor, eggFrom, donorOf, hatchCost, TREATS, TREAT_ORDER, treatCost, treatLeft, giveTreat, useTreats, TAMEABLE_FAMILY, TAME_WINS, MAX_DURABILITY, PET_HIT_SHARE, FEED_BATTLES, FEED_BONUS, isTameableSpecies, tameProgress, canTame, petDisplayName, makePet, isUsable, loseDurability, repair, petFighter, petAttackAmount,
    repairCost, feedCost, trainCost, feed, train, useFeed };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Pets;
