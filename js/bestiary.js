/* Бестиарий, ресурсы и добыча (без интерфейса — можно тестировать в Node).

   Каждый монстр имеет ВИД (характеристики, способности, добыча) и УРОВЕНЬ-цвет (см. tiers.js):
   чем выше цвет, тем больше ХП, сильнее способности, богаче добыча и ресурсы того же цвета. */

const B_T = (typeof Tiers !== 'undefined') ? Tiers : require('./tiers.js');
const B_G = (typeof Gear !== 'undefined') ? Gear : require('./items.js');
const B_B = (typeof Balance !== 'undefined') ? Balance : require('./balance.js');

const Bestiary = (() => {
  // Ресурсы. base — цена в медных монетах на первом уровне (растёт с уровнем).
  const RESOURCES = {
    hide:    { name: 'Шкура',        base: 8 },
    fang:    { name: 'Клык',         base: 12 },
    bone:    { name: 'Кость',        base: 6 },
    scrap:   { name: 'Железный лом', base: 10 },
    ore:     { name: 'Руда',         base: 15 },
    crystal: { name: 'Кристалл',     base: 40 },
    essence: { name: 'Эссенция',     base: 60 },
    scale:   { name: 'Чешуя',        base: 90 },
  };
  const resPrice = (kind, tier) => Math.round(RESOURCES[kind].base * B_T.PRICE_MULT[B_T.clamp(tier) - 1]);

  // Приёмы существ в бою (см. game.js). Делают бои с разными видами непохожими друг на друга.
  const ABILITIES = {
    steal:   { name: 'Воровство',        desc: 'В начале своего хода может утащить у вас 2 камня одного цвета' },
    howl:    { name: 'Вой',              desc: 'Каждый третий ход бьёт на 50% сильнее' },
    backstab:{ name: 'Подлый удар',      desc: 'С шансом 25% его удар не замечает вашей брони' },
    prank:   { name: 'Пакость',          desc: 'В начале своего хода может поменять местами два камня на поле' },
    undying: { name: 'Неупокоенный',     desc: 'Один раз за бой встаёт с 25% здоровья' },
    charge:  { name: 'Натиск',           desc: 'Его первый удар в бою — двойной' },
    regen:   { name: 'Регенерация',      desc: 'В начале каждого своего хода лечит 5% здоровья' },
    petrify: { name: 'Окаменение',       desc: 'Каждый третий ход сковывает камнем столбец: вы не можете трогать его свой следующий ход' },
    veil:    { name: 'Туман',            desc: 'Каждый второй ход прячет от вас 5 камней до конца вашего хода' },
    breath:  { name: 'Огненное дыхание', desc: 'Каждый четвёртый ход сжигает ряд камней; урон — двойные номиналы' },
    rage:    { name: 'Ярость',           desc: 'Раненый (меньше половины здоровья) бьёт на 40% сильнее' },
    drum:    { name: 'Шаманский бубен',  desc: 'Каждый третий ход все собранные им камни наносят урон' },
    vampire: { name: 'Кровопийца',       desc: 'Лечится на половину нанесённого урона' },
  };

  // unlock — сколько всего побед нужно, чтобы вид появился в бестиарии.
  // Числа подобраны симулятором боёв (tools/balance.js): «типичный» герой своего цвета побеждает крысу ~92%,
  // обычных существ ~64–74%, тролля, голема и призрака ~45%, дракона ~25%; бой длится 7–12 ходов героя.
  // xp — множитель опыта за победу (сильнее вид — больше опыта); coins — монеты за победу на Красном (30 × xp).
  // stats — врождённые характеристики (см. items.js); hp — ХП на первом уровне (Красный);
  // ai — базовый уровень ИИ (растёт с цветом); coins — монеты за победу (медные, уровень 1);
  // drops — [ресурс, шанс, мин., макс.]; gear — есть ли у существа снаряжение (только Дракон);
  // family — семейство (орки и нежить — враги всех фракций); ability — приём в бою (см. ABILITIES).
  const MONSTERS = {
    rat: {
      family: 'Звери', ability: 'steal', xp: 0.6,
      name: 'Крыса-падальщик', unlock: 0, hp: 51, ai: 12, coins: 18, gear: 0,
      stats: { initiative: 10, power: 44 },
      drops: [['hide', 0.7, 1, 2], ['fang', 0.3, 1, 1], ['bone', 0.2, 1, 1]],
      desc: 'Юркая и трусливая. Часто успевает походить первой, но бьёт слабо.',
    },
    wolf: {
      family: 'Звери', ability: 'howl', xp: 0.9,
      name: 'Волк', unlock: 0, hp: 76, ai: 18, coins: 27, gear: 0,
      stats: { initiative: 12, power: 58 },
      drops: [['hide', 0.8, 1, 2], ['fang', 0.6, 1, 2]],
      desc: 'Стайный хищник: быстрые и злые укусы.',
    },
    bandit: {
      family: 'Разбойники', ability: 'backstab', xp: 1.0,
      name: 'Разбойник', unlock: 1, hp: 79, ai: 28, coins: 30, gear: 0,
      stats: { power: 26, block: 6, initiative: 6 },
      drops: [['scrap', 0.7, 1, 3], ['hide', 0.5, 1, 2]],
      desc: 'Подлый человек с кинжалом. Иногда блокирует удары краем щита.',
    },
    goblin: {
      family: 'Гоблины', ability: 'prank', xp: 0.8,
      name: 'Гоблин', unlock: 2, hp: 68, ai: 38, coins: 24, gear: 0,
      stats: { initiative: 15, magic: 1 },
      drops: [['scrap', 0.6, 1, 2], ['bone', 0.5, 1, 2], ['crystal', 0.1, 1, 1]],
      desc: 'Хитрый и быстрый. Успевает вовремя воспользоваться магией.',
    },
    skeleton: {
      family: 'Нежить', ability: 'undying', xp: 1.0,
      name: 'Скелет-воин', unlock: 3, hp: 56, ai: 28, coins: 30, gear: 0,
      stats: { defense: 10, block: 6, power: 21 },
      drops: [['bone', 0.9, 1, 3], ['scrap', 0.5, 1, 2]],
      desc: 'Ржавые латы и пустые глазницы. Прочный, но неповоротливый.',
    },
    boar: {
      family: 'Звери', ability: 'charge', xp: 1.0,
      name: 'Кабан-секач', unlock: 4, hp: 83, ai: 20, coins: 30, gear: 0,
      stats: { power: 47, defense: 6 },
      drops: [['hide', 0.9, 1, 3], ['fang', 0.7, 1, 2]],
      desc: 'Прёт напролом. Бьёт больно, защищается толстой шкурой.',
    },
    troll: {
      family: 'Великаны', ability: 'regen', xp: 1.4,
      name: 'Тролль', unlock: 6, hp: 81, ai: 35, coins: 42, gear: 0,
      stats: { defense: 10, power: 25 },
      drops: [['hide', 0.9, 2, 4], ['bone', 0.6, 1, 3], ['ore', 0.3, 1, 2]],
      desc: 'Огромный и живучий. Раны затягиваются на глазах.',
    },
    golem: {
      family: 'Каменные стражи', ability: 'petrify', xp: 1.4,
      name: 'Каменный голем', unlock: 8, hp: 75, ai: 25, coins: 42, gear: 0,
      stats: { defense: 22, block: 8, power: 53 },
      drops: [['ore', 0.9, 2, 4], ['crystal', 0.4, 1, 2]],
      desc: 'Глыба с рунами. Почти непробиваем, но медлителен.',
    },
    wraith: {
      family: 'Нежить', ability: 'veil', xp: 1.4,
      name: 'Призрак', unlock: 10, hp: 72, ai: 51, coins: 42, gear: 0,
      stats: { ricochet: 12, block: 10, initiative: 10 },
      drops: [['essence', 0.7, 1, 2], ['crystal', 0.4, 1, 1]],
      desc: 'Удары скользят сквозь него — и нередко отлетают обратно.',
    },
    dragon: {
      family: 'Драконы', ability: 'breath', xp: 2.2,
      name: 'Дракон', unlock: 14, hp: 93, ai: 50, coins: 66, gear: 10,
      stats: { defense: 12, ricochet: 6 },
      drops: [['scale', 0.9, 2, 4], ['essence', 0.5, 1, 2], ['fang', 0.6, 1, 3], ['crystal', 0.4, 1, 2]],
      desc: 'Хозяин гор. Носит доспехи и оружие, ходит осторожно и бьёт наверняка.',
    },
    // --- Орки степных орд ---
    orc: {
      family: 'Орки', ability: 'rage', xp: 1.05,
      name: 'Орк-рубака', unlock: 5, hp: 79, ai: 30, coins: 32, gear: 0,
      stats: { power: 27, defense: 8 },
      drops: [['scrap', 0.7, 1, 3], ['hide', 0.6, 1, 2], ['fang', 0.4, 1, 2]],
      desc: 'Воин степных орд с тяжёлым тесаком. Чем сильнее ранен, тем злее бьёт.',
    },
    orcShaman: {
      family: 'Орки', ability: 'drum', xp: 1.05,
      name: 'Орк-шаман', unlock: 7, hp: 78, ai: 36, coins: 32, gear: 0,
      stats: { magic: 2, ricochet: 6, initiative: 6 },
      drops: [['bone', 0.7, 1, 3], ['crystal', 0.4, 1, 1], ['essence', 0.3, 1, 1]],
      desc: 'Бьёт в бубен из черепов — и камни на поле начинают жечь.',
    },
    // --- Нежить ---
    ghoul: {
      family: 'Нежить', ability: 'vampire', xp: 1.05,
      name: 'Упырь', unlock: 5, hp: 74, ai: 30, coins: 32, gear: 0,
      stats: { power: 20, initiative: 8 },
      drops: [['bone', 0.8, 1, 2], ['essence', 0.4, 1, 1], ['hide', 0.3, 1, 1]],
      desc: 'Бледная тварь с болот. Пьёт чужую силу и так залечивает раны.',
    },
  };
  const ORDER = Object.keys(MONSTERS);

  // Характеристики монстра на заданном уровне-цвете: ХП и урон растут по Tiers.GROWTH,
  // Сила — умеренно, шансы (Броня, Блок, Рикошет, Инициатива) — медленно.
  function scaled(id, tier) {
    const m = MONSTERS[id], t = B_T.clamp(tier);
    const stats = B_G.blankStats();
    for (const k in m.stats) stats[k] = Math.round(m.stats[k] * B_T.statMult(k, t));
    return {
      hp: Math.round(m.hp * B_T.GROWTH[t - 1]),
      dmg: B_T.GROWTH[t - 1] * B_B.damage.stone,                    // множитель урона камней
      stats: B_G.combine(stats, {}),
      ai: Math.max(1, Math.min(100, m.ai + (t - 1) * B_B.monsters.aiPerTier)),
      gearBudget: Math.round(m.gear * B_T.POINT_MULT[t - 1]),
    };
  }

  // Что упадёт после победы. rand — генератор случайных чисел (для тестов).
  // faction — фракция игрока: вещи чужих фракций не выпадают.
  function rollDrops(id, tier, rand = Math.random, faction) {
    const m = MONSTERS[id], t = B_T.clamp(tier);
    const resources = [];
    for (const [kind, chance, min, max] of m.drops) {
      if (rand() < chance) resources.push({ kind, tier: t, n: min + Math.floor(rand() * (max - min + 1)) });
    }
    const coins = Math.round(m.coins * B_T.PRICE_MULT[t - 1] * (0.8 + rand() * 0.4));
    // Предмет: шанс Balance.rewards.itemChance; чаще выпадают обычные вещи, реже редкие и эпические.
    let entry = null;
    if (rand() < B_B.rewards.itemChance) {
      const pool = [];
      const items = faction ? B_G.itemsFor(faction) : B_G.ITEMS.filter((i) => !i.faction);
      for (const it of items) for (let k = 0; k < { common: 6, rare: 3, epic: 1 }[it.rarity]; k++) pool.push(it);
      const pick = pool[Math.floor(rand() * pool.length)];
      entry = B_G.makeEntry(pick.id, rand() < 0.3 ? Math.max(1, t - 1) : t);
    }
    return { coins, resources, item: entry };
  }

  // Какие виды открыты при данном числе побед.
  const unlockedSpecies = (wins) => ORDER.filter((id) => MONSTERS[id].unlock <= wins);

  const ability = (id) => ABILITIES[MONSTERS[id].ability];

  return { RESOURCES, MONSTERS, ORDER, ABILITIES, ability, resPrice, scaled, rollDrops, unlockedSpecies };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Bestiary;
