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
    splinter:{ name: 'Щепка',        base: 9 },
    honey:   { name: 'Мёд',          base: 22 },
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
    weaken:  { name: 'Морок',            desc: 'Каждый третий ход насылает морок: на ваш следующий ход урон слабее' },
    pinch:   { name: 'Панцирь',          desc: 'Каждый третий ход отращивает новый шип: Блок растёт и остаётся до конца боя' },
    mire:    { name: 'Трясина',          desc: 'Каждый второй ход затягивает поле топью: ошибётесь — штраф ХП будет двойным' },
    sap:     { name: 'Смола',            desc: 'Каждый третий ход заливает камни смолой: ваше следующее заклинание дороже на камень' },
    clone:   { name: 'Спороносец',       desc: `Копит споры из собранных камней; набрав ${B_B.abilities.clone.charge}, выпускает двойника с тем же здоровьем, что сейчас у гриба (до ${B_B.abilities.clone.max} за бой). Двойник бьёт вас каждый раунд и прикрывает оригинал` },
    evasion:     { name: 'Изворотливость', desc: 'С шансом в начале своего хода уворачивается: на несколько ходов Блок выше обычного, срабатывания подряд складываются' },
    retribution: { name: 'Возмездие',      desc: 'С шансом в начале своего хода готовится мстить: на несколько ходов чаще отбивает удар Рикошетом, срабатывания подряд складываются' },
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
    // --- Болотные твари ---
    crab: {
      family: 'Болотные твари', ability: 'pinch', xp: 1.0,
      name: 'Болотный рак', unlock: 4, hp: 84, ai: 34, coins: 31, gear: 0,
      stats: { defense: 10, block: 8 },
      drops: [['hide', 0.6, 1, 2], ['bone', 0.5, 1, 2]],
      desc: 'Прячется в тине, выставив клешни. С каждым ударом по нему панцирь только крепче.',
    },
    bolotnik: {
      family: 'Болотные твари', ability: 'mire', xp: 1.1,
      name: 'Болотник', unlock: 7, hp: 88, ai: 45, coins: 35, gear: 0,
      stats: { magic: 1, ricochet: 6 },
      drops: [['hide', 0.5, 1, 2], ['essence', 0.3, 1, 1]],
      desc: 'Хозяин трясины. Затягивает под ряску всё, что ступит мимо кочки.',
    },
    // --- Тени ---
    shadow: {
      family: 'Тени', ability: 'weaken', xp: 1.35,
      name: 'Тень', unlock: 9, hp: 74, ai: 44, coins: 44, gear: 0,
      stats: { initiative: 8, ricochet: 8 },
      drops: [['essence', 0.6, 1, 2], ['crystal', 0.3, 1, 1]],
      desc: 'Клочок мрака без лица. Насылает морок — и силы оставляют вас сами.',
    },
    // --- Лесные стражи ---
    treant: {
      family: 'Лесные стражи', ability: 'sap', xp: 1.6,
      name: 'Древень', unlock: 11, hp: 88, ai: 46, coins: 50, gear: 0,
      stats: { defense: 12, power: 15 },
      drops: [['splinter', 0.9, 2, 4], ['essence', 0.3, 1, 1]],
      desc: 'Старый страж леса, живая кора и смола. Магия вязнет в его коре.',
    },
    mushroom: {
      family: 'Лесные стражи', ability: 'clone', xp: 1.5,
      // hp — только оригинал: Спороносец выпускает двойника с его текущим ХП (обычно ~1 раз за бой), поэтому
      // ХП вдвое ниже прежних 80 — иначе симулятор давал ~20% побед вместо «Равного» (~64%).
      name: 'Дикий гриб', unlock: 10, hp: 40, ai: 44, coins: 46, gear: 0,
      stats: { defense: 10, magic: 1, initiative: 4 },
      drops: [['splinter', 0.6, 1, 2], ['essence', 0.4, 1, 2]],
      desc: 'Раздутая шляпка в пятнах плесени. Накопив спор, выдыхает облако — и рядом встаёт двойник с тем же здоровьем, что осталось у гриба.',
    },
    // --- Лесная мелочь: Изворотливость и Возмездие ---
    lynx: {
      family: 'Звери', ability: 'evasion', xp: 0.95,
      name: 'Рысь', unlock: 3, hp: 70, ai: 26, coins: 28, gear: 0,
      stats: { initiative: 14, power: 30, block: 8 },
      drops: [['hide', 0.8, 1, 2], ['fang', 0.5, 1, 2]],
      desc: 'Пятнистая лесная кошка. Чуть запахло бедой — уже не здесь: то и дело уходит из-под удара.',
    },
    hedgehog: {
      family: 'Звери', ability: 'retribution', xp: 0.95,
      name: 'Шипастый ёж', unlock: 2, hp: 68, ai: 24, coins: 27, gear: 0,
      stats: { defense: 8, power: 22, ricochet: 6 },
      drops: [['hide', 0.6, 1, 2], ['bone', 0.4, 1, 2]],
      desc: 'Сворачивается в колючий клубок. Ударишь неудачно — шип отдаёт обратно, да ещё больнее прежнего.',
    },
    // --- Пчёлы ---
    // Опасность вида — не в характеристиках одной пчелы, а в неизвестности: у гнезда можно застать
    // как одну отбившуюся пчелу, так и весь потревоженный рой. Бой у нас строго 1-на-1 (см. combat.js),
    // поэтому «сколько пчёл в этом бою» разыгрывается один раз при встрече (см. rollSwarmSize) и
    // умножает ХП и урон единственного бойца — тем сильнее, чем крупнее выпавший рой (см. swarmMult).
    // hp/stats ниже — показатели ОДНОЙ пчелы (рой ×1); ×3 и ×5 — см. swarm.hpMult/dmgMult.
    wildbees: {
      family: 'Пчёлы', ability: 'howl', xp: 1.3,
      name: 'Дикие пчёлы', unlock: 9, hp: 58, ai: 40, coins: 38, gear: 0,
      stats: { initiative: 16, power: 16, ricochet: 6 },
      drops: [['honey', 0.85, 1, 3], ['essence', 0.15, 1, 1]],
      swarm: {
        sizes: [1, 3, 5], weights: [0.6, 0.3, 0.1],          // чаще всего — одна пчела, изредка — рой из пяти
        hpMult: { 1: 1, 3: 1.8, 5: 2.6 },
        dmgMult: { 1: 1, 3: 1.45, 5: 1.9 },
      },
      desc: 'Гнездо в дупле гудит непонятно чем: то ли одна отставшая пчела, то ли потревоженный рой. Число жал узнаёшь, только когда уже поздно отступать.',
    },
  };
  const ORDER = Object.keys(MONSTERS);

  // Рой (см. wildbees): один раз при встрече выпадает размер роя — сколько на деле пчёл в этом бою.
  // Возвращает 1 у видов без поля swarm (обычная особь).
  function rollSwarmSize(id, rand = Math.random) {
    const m = MONSTERS[id];
    if (!m || !m.swarm) return 1;
    const { sizes, weights } = m.swarm;
    const sum = weights.reduce((a, b) => a + b, 0);
    let x = rand() * sum;
    for (let i = 0; i < sizes.length; i++) { x -= weights[i]; if (x <= 0) return sizes[i]; }
    return sizes[sizes.length - 1];
  }

  // Множители ХП/урона для выпавшего размера роя. { hp: 1, dmg: 1 } у видов без swarm.
  function swarmMult(id, size) {
    const m = MONSTERS[id];
    if (!m || !m.swarm) return { hp: 1, dmg: 1 };
    return { hp: m.swarm.hpMult[size] || 1, dmg: m.swarm.dmgMult[size] || 1 };
  }

  // Характеристики монстра на заданном уровне-цвете: ХП и урон растут по Tiers.GROWTH,
  // Сила — умеренно, шансы (Броня, Блок, Рикошет, Инициатива) — медленно.
  // swarmSize — размер роя (см. rollSwarmSize); у обычных видов всегда 1 и ни на что не влияет.
  function scaled(id, tier, swarmSize = 1) {
    const m = MONSTERS[id], t = B_T.clamp(tier);
    const stats = B_G.blankStats();
    for (const k in m.stats) stats[k] = Math.round(m.stats[k] * B_T.statMult(k, t));
    const sw = swarmMult(id, swarmSize);
    return {
      hp: Math.round(m.hp * B_T.GROWTH[t - 1] * sw.hp),
      dmg: B_T.GROWTH[t - 1] * B_B.damage.stone * sw.dmg,            // множитель урона камней
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

  // undefined для id без записи в MONSTERS (например, тренировочный Бобёр-хранитель в учебном бою —
  // см. game.js/setupTrainerBeaver — это не настоящий вид бестиария, у него нет приёма).
  const ability = (id) => (MONSTERS[id] ? ABILITIES[MONSTERS[id].ability] : undefined);

  return { RESOURCES, MONSTERS, ORDER, ABILITIES, ability, resPrice, scaled, rollDrops, unlockedSpecies, rollSwarmSize, swarmMult };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Bestiary;
