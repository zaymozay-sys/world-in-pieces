if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Бестиарий, ресурсы и добыча (без интерфейса — можно тестировать в Node).

   Каждый монстр имеет ВИД (характеристики, способности, добыча) и УРОВЕНЬ-цвет (см. tiers.js):
   чем выше цвет, тем больше ХП, сильнее способности, богаче добыча и ресурсы того же цвета. */

const B_T = (typeof Tiers !== 'undefined') ? Tiers : require('./tiers.js');
const B_G = (typeof Gear !== 'undefined') ? Gear : require('./items.js');
const B_B = (typeof Balance !== 'undefined') ? Balance : require('./balance.js');

const Bestiary = (() => {
  // Ресурсы. base — цена в медных монетах на первом уровне (растёт с уровнем).
  const RESOURCES = {
    hide:    { name: _t("Шкура"),        base: 8 },
    fang:    { name: _t("Клык"),         base: 12 },
    bone:    { name: _t("Кость"),        base: 6 },
    scrap:   { name: _t("Железный лом"), base: 10 },
    ore:     { name: _t("Руда"),         base: 15 },
    crystal: { name: _t("Кристалл"),     base: 40 },
    essence: { name: _t("Эссенция"),     base: 60 },
    scale:   { name: _t("Чешуя"),        base: 90 },
    splinter:{ name: _t("Щепка"),        base: 9 },
    honey:   { name: _t("Мёд"),          base: 22 },
    silk:    { name: _t("Паутина"),      base: 11 },
    feather: { name: _t("Перо"),         base: 7 },
    shell:   { name: _t("Ракушка"),      base: 13 },
  };
  const resPrice = (kind, tier) => Math.round(RESOURCES[kind].base * B_T.PRICE_MULT[B_T.clamp(tier) - 1]);

  // Приёмы существ в бою (см. game.js). Делают бои с разными видами непохожими друг на друга.
  const ABILITIES = {
    steal:   { name: _t("Воровство"),        desc: _t("В начале своего хода может утащить у вас 2 камня одного цвета") },
    howl:    { name: _t("Вой"),              desc: _t("Каждый третий ход бьёт на 50% сильнее") },
    backstab:{ name: _t("Подлый удар"),      desc: _t("С шансом 25% его удар не замечает вашей брони") },
    prank:   { name: _t("Пакость"),          desc: _t("В начале своего хода может поменять местами два камня на поле") },
    undying: { name: _t("Неупокоенный"),     desc: _t("Один раз за бой встаёт с 25% здоровья") },
    charge:  { name: _t("Натиск"),           desc: _t("Его первый удар в бою — двойной") },
    regen:   { name: _t("Регенерация"),      desc: _t("В начале каждого своего хода лечит 5% здоровья") },
    petrify: { name: _t("Окаменение"),       desc: _t("Каждый третий ход сковывает камнем столбец: вы не можете трогать его свой следующий ход") },
    veil:    { name: _t("Туман"),            desc: _t("Каждый второй ход прячет от вас 5 камней до конца вашего хода") },
    breath:  { name: _t("Огненное дыхание"), desc: _t("Каждый четвёртый ход сжигает ряд камней; урон — двойные номиналы") },
    rage:    { name: _t("Ярость"),           desc: _t("Раненый (меньше половины здоровья) бьёт на 40% сильнее") },
    drum:    { name: _t("Шаманский бубен"),  desc: _t("Каждый третий ход все собранные им камни наносят урон") },
    vampire: { name: _t("Кровопийца"),       desc: _t("Лечится на половину нанесённого урона") },
    weaken:  { name: _t("Морок"),            desc: _t("Каждый третий ход насылает морок: на ваш следующий ход урон слабее") },
    pinch:   { name: _t("Панцирь"),          desc: _t("Каждый третий ход отращивает новый шип: Блок растёт и остаётся до конца боя") },
    mire:    { name: _t("Трясина"),          desc: _t("Каждый второй ход затягивает поле топью: ошибётесь — штраф ХП будет двойным") },
    sap:     { name: _t("Смола"),            desc: _t("Каждый третий ход заливает камни смолой: ваше следующее заклинание дороже на камень") },
    clone:   { name: _t("Спороносец"),       desc: _t("Копит споры из собранных камней; набрав {0}, выпускает двойника с тем же здоровьем, что сейчас у гриба (до {1} за бой). Двойник бьёт вас каждый раунд и прикрывает оригинал", [B_B.abilities.clone.charge, B_B.abilities.clone.max]) },
    wisp:    { name: _t("Блуждающий огонь"), desc: _t("Засчитываются только камни номиналом x3 и x5: камни x1 исчезают с поля, но не дают ни ресурсов, ни урона") },
    evasion:     { name: _t("Изворотливость"), desc: _t("С шансом в начале своего хода уворачивается: на несколько ходов Блок выше обычного, срабатывания подряд складываются") },
    retribution: { name: _t("Возмездие"),      desc: _t("С шансом в начале своего хода готовится мстить: на несколько ходов чаще отбивает удар Рикошетом, срабатывания подряд складываются") },
    // 1.7.3: три новых приёма, чтобы бои с разными видами не повторяли друг друга
    stun:    { name: _t("Оглушение"),        desc: _t("Каждый пятый ход оглушает: вы пропускаете свой следующий ход. Блок даёт шанс устоять") },
    toxin:   { name: _t("Отрава"),           desc: _t("Каждый четвёртый ход отравляет: {0} ваших хода подряд вы теряете ХП в начале хода. Броня и Блок не помогают", [B_B.abilities.toxin.turns]) },
    ward:    { name: _t("Щит"),              desc: _t("Каждый четвёртый ход ставит щит: он принимает на себя урон, равный {0}% здоровья существа, прежде чем оно начнёт терять ХП", [Math.round(B_B.abilities.ward.pct * 100)]) },
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
      family: _t("Звери"), ability: 'steal', xp: 0.6,
      name: _t("Крыса-падальщик"), unlock: 0, hp: 51, ai: 12, coins: 18, gear: 0,
      stats: { initiative: 10, power: 44 },
      drops: [['hide', 0.7, 1, 2], ['fang', 0.3, 1, 1], ['bone', 0.2, 1, 1]],
      desc: _t("Юркая и трусливая. Часто успевает походить первой, но бьёт слабо."),
    },
    wolf: {
      family: _t("Звери"), ability: 'howl', xp: 0.9,
      name: _t("Волк"), unlock: 0, hp: 76, ai: 18, coins: 27, gear: 0,
      stats: { initiative: 12, power: 58 },
      drops: [['hide', 0.8, 1, 2], ['fang', 0.6, 1, 2]],
      desc: _t("Стайный хищник: быстрые и злые укусы."),
    },
    bandit: {
      family: _t("Разбойники"), ability: 'backstab', xp: 1.0,
      name: _t("Разбойник"), unlock: 1, hp: 79, ai: 28, coins: 30, gear: 0,
      stats: { power: 26, block: 6, initiative: 6 },
      drops: [['scrap', 0.7, 1, 3], ['hide', 0.5, 1, 2]],
      desc: _t("Подлый человек с кинжалом. Иногда блокирует удары краем щита."),
    },
    goblin: {
      family: _t("Гоблины"), ability: 'prank', xp: 0.8,
      name: _t("Гоблин"), unlock: 2, hp: 68, ai: 38, coins: 24, gear: 0,
      stats: { initiative: 15 },
      drops: [['scrap', 0.6, 1, 2], ['bone', 0.5, 1, 2], ['crystal', 0.1, 1, 1]],
      desc: _t("Хитрый и быстрый. Успевает вовремя воспользоваться магией."),
    },
    skeleton: {
      family: _t("Нежить"), ability: 'undying', xp: 1.0,
      name: _t("Скелет-воин"), unlock: 3, hp: 56, ai: 28, coins: 30, gear: 0,
      stats: { defense: 10, block: 6, power: 21 },
      drops: [['bone', 0.9, 1, 3], ['scrap', 0.5, 1, 2]],
      desc: _t("Ржавые латы и пустые глазницы. Прочный, но неповоротливый."),
    },
    boar: {
      family: _t("Звери"), ability: 'rage', xp: 1.0,
      name: _t("Кабан-секач"), unlock: 4, hp: 83, ai: 20, coins: 30, gear: 0,
      stats: { power: 47, defense: 6 },
      drops: [['hide', 0.9, 1, 3], ['fang', 0.7, 1, 2]],
      desc: _t("Прёт напролом. Бьёт больно, защищается толстой шкурой."),
    },
    troll: {
      family: _t("Великаны"), ability: 'regen', xp: 1.4,
      name: _t("Тролль"), unlock: 6, hp: 81, ai: 35, coins: 42, gear: 0,
      stats: { defense: 10, power: 25 },
      drops: [['hide', 0.9, 2, 4], ['bone', 0.6, 1, 3], ['ore', 0.3, 1, 2]],
      desc: _t("Огромный и живучий. Раны затягиваются на глазах."),
    },
    golem: {
      family: _t("Каменные стражи"), ability: 'petrify', xp: 1.4,
      name: _t("Каменный голем"), unlock: 8, hp: 75, ai: 25, coins: 42, gear: 0,
      stats: { defense: 22, block: 8, power: 53 },
      drops: [['ore', 0.9, 2, 4], ['crystal', 0.4, 1, 2]],
      desc: _t("Глыба с рунами. Почти непробиваем, но медлителен."),
    },
    wraith: {
      family: _t("Нежить"), ability: 'veil', xp: 1.4,
      name: _t("Призрак"), unlock: 10, hp: 72, ai: 51, coins: 42, gear: 0,
      stats: { ricochet: 12, block: 10, initiative: 10 },
      drops: [['essence', 0.7, 1, 2], ['crystal', 0.4, 1, 1]],
      desc: _t("Удары скользят сквозь него — и нередко отлетают обратно."),
    },
    dragon: {
      family: _t("Драконы"), ability: 'breath', xp: 2.2,
      name: _t("Дракон"), unlock: 14, hp: 93, ai: 50, coins: 66, gear: 10,
      stats: { defense: 12, ricochet: 6 },
      drops: [['scale', 0.9, 2, 4], ['essence', 0.5, 1, 2], ['fang', 0.6, 1, 3], ['crystal', 0.4, 1, 2]],
      desc: _t("Хозяин гор. Носит доспехи и оружие, ходит осторожно и бьёт наверняка."),
    },
    // --- Орки степных орд ---
    orc: {
      family: _t("Орки"), ability: 'rage', xp: 1.05,
      name: _t("Орк-рубака"), unlock: 5, hp: 79, ai: 30, coins: 32, gear: 0,
      stats: { power: 27, defense: 8 },
      drops: [['scrap', 0.7, 1, 3], ['hide', 0.6, 1, 2], ['fang', 0.4, 1, 2]],
      desc: _t("Воин степных орд с тяжёлым тесаком. Чем сильнее ранен, тем злее бьёт."),
    },
    orcShaman: {
      family: _t("Орки"), ability: 'drum', xp: 1.05,
      name: _t("Орк-шаман"), unlock: 7, hp: 78, ai: 36, coins: 32, gear: 0,
      stats: { ricochet: 6, initiative: 6 },
      drops: [['bone', 0.7, 1, 3], ['crystal', 0.4, 1, 1], ['essence', 0.3, 1, 1]],
      desc: _t("Бьёт в бубен из черепов — и камни на поле начинают жечь."),
    },
    // --- Нежить ---
    ghoul: {
      family: _t("Нежить"), ability: 'vampire', xp: 1.05,
      name: _t("Упырь"), unlock: 5, hp: 74, ai: 30, coins: 32, gear: 0,
      stats: { power: 20, initiative: 8 },
      drops: [['bone', 0.8, 1, 2], ['essence', 0.4, 1, 1], ['hide', 0.3, 1, 1]],
      desc: _t("Бледная тварь с болот. Пьёт чужую силу и так залечивает раны."),
    },
    // --- Болотные твари ---
    crab: {
      family: _t("Болотные твари"), ability: 'ward', xp: 1.0,
      name: _t("Болотный рак"), unlock: 4, hp: 84, ai: 34, coins: 31, gear: 0,
      stats: { defense: 10, block: 8 },
      drops: [['hide', 0.6, 1, 2], ['bone', 0.5, 1, 2]],
      desc: _t("Прячется в тине, выставив клешни. Прячется за панцирем: пока он цел, удары вязнут в нём."),
    },
    bolotnik: {
      family: _t("Болотные твари"), ability: 'mire', xp: 1.1,
      name: _t("Болотник"), unlock: 7, hp: 88, ai: 45, coins: 35, gear: 0,
      stats: { ricochet: 6 },
      drops: [['hide', 0.5, 1, 2], ['essence', 0.3, 1, 1]],
      desc: _t("Хозяин трясины. Затягивает под ряску всё, что ступит мимо кочки."),
    },
    // --- Тени ---
    shadow: {
      family: _t("Тени"), ability: 'weaken', xp: 1.35,
      name: _t("Тень"), unlock: 9, hp: 74, ai: 44, coins: 44, gear: 0,
      stats: { initiative: 8, ricochet: 8 },
      drops: [['essence', 0.6, 1, 2], ['crystal', 0.3, 1, 1]],
      desc: _t("Клочок мрака без лица. Насылает морок — и силы оставляют вас сами."),
    },
    // --- Лесные стражи ---
    treant: {
      family: _t("Лесные стражи"), ability: 'sap', xp: 1.6,
      name: _t("Древень"), unlock: 11, hp: 88, ai: 46, coins: 50, gear: 0,
      stats: { defense: 12, power: 15 },
      drops: [['splinter', 0.9, 2, 4], ['essence', 0.3, 1, 1]],
      desc: _t("Старый страж леса, живая кора и смола. Магия вязнет в его коре."),
    },
    mushroom: {
      family: _t("Лесные стражи"), ability: 'clone', xp: 1.5,
      // hp — только оригинал: Спороносец выпускает двойника с его текущим ХП (обычно ~1 раз за бой), поэтому
      // ХП вдвое ниже прежних 80 — иначе симулятор давал ~20% побед вместо «Равного» (~64%).
      name: _t("Дикий гриб"), unlock: 10, hp: 40, ai: 44, coins: 46, gear: 0,
      stats: { defense: 10, initiative: 4 },
      drops: [['splinter', 0.6, 1, 2], ['essence', 0.4, 1, 2]],
      desc: _t("Раздутая шляпка в пятнах плесени. Накопив спор, выдыхает облако — и рядом встаёт двойник с тем же здоровьем, что осталось у гриба."),
    },
    // --- Лесная мелочь: Изворотливость и Возмездие ---
    lynx: {
      family: _t("Звери"), ability: 'evasion', xp: 0.95,
      name: _t("Рысь"), unlock: 3, hp: 70, ai: 26, coins: 28, gear: 0,
      stats: { initiative: 14, power: 30, block: 8 },
      drops: [['hide', 0.8, 1, 2], ['fang', 0.5, 1, 2]],
      desc: _t("Пятнистая лесная кошка. Чуть запахло бедой — уже не здесь: то и дело уходит из-под удара."),
    },
    hedgehog: {
      family: _t("Звери"), ability: 'retribution', xp: 0.95,
      name: _t("Шипастый ёж"), unlock: 2, hp: 68, ai: 24, coins: 27, gear: 0,
      stats: { defense: 8, power: 22, ricochet: 6 },
      drops: [['hide', 0.6, 1, 2], ['bone', 0.4, 1, 2]],
      desc: _t("Сворачивается в колючий клубок. Ударишь неудачно — шип отдаёт обратно, да ещё больнее прежнего."),
    },
    // --- Пчёлы ---
    // Опасность вида — не в характеристиках одной пчелы, а в неизвестности: у гнезда можно застать
    // как одну отбившуюся пчелу, так и весь потревоженный рой. Бой у нас строго 1-на-1 (см. combat.js),
    // поэтому «сколько пчёл в этом бою» разыгрывается один раз при встрече (см. rollSwarmSize) и
    // умножает ХП и урон единственного бойца — тем сильнее, чем крупнее выпавший рой (см. swarmMult).
    // hp/stats ниже — показатели ОДНОЙ пчелы (рой ×1); ×3 и ×5 — см. swarm.hpMult/dmgMult.
    wildbees: {
      family: _t("Пчёлы"), ability: 'howl', xp: 1.3,
      name: _t("Дикие пчёлы"), unlock: 9, hp: 58, ai: 40, coins: 38, gear: 0,
      stats: { initiative: 16, power: 16, ricochet: 6 },
      drops: [['honey', 0.85, 1, 3], ['essence', 0.15, 1, 1]],
      swarm: {
        sizes: [1, 3, 5], weights: [0.6, 0.3, 0.1],          // чаще всего — одна пчела, изредка — рой из пяти
        hpMult: { 1: 1, 3: 1.8, 5: 2.6 },
        dmgMult: { 1: 1, 3: 1.45, 5: 1.9 },
      },
      desc: _t("Гнездо в дупле гудит непонятно чем: то ли одна отставшая пчела, то ли потревоженный рой. Число жал узнаёшь, только когда уже поздно отступать."),
    },
    // ---- 1.2.0: звери и птицы нижних уровней, существа и разбойники побережья ----
    viper: {
      family: _t("Звери"), ability: 'toxin', xp: 0.8,
      name: _t("Гадюка"), unlock: 2, hp: 70, ai: 20, coins: 22, gear: 0,
      stats: { initiative: 14, power: 56 },
      drops: [['fang', 0.6, 1, 1], ['hide', 0.5, 1, 1]],
      desc: _t("Греется на камнях у дороги. Укус быстрый, и яд работает дольше самого укуса."),
    },
    spider: {
      family: _t("Звери"), ability: 'toxin', xp: 0.9,
      name: _t("Лесной паук"), unlock: 3, hp: 78, ai: 22, coins: 24, gear: 0,
      stats: { initiative: 8, power: 50 },
      drops: [['silk', 0.8, 1, 2], ['fang', 0.3, 1, 1]],
      desc: _t("Плетёт липкие сети между стволами. Его укус отравляет."),
    },
    vulture: {
      family: _t("Звери"), ability: 'charge', xp: 1.0,
      name: _t("Стервятник"), unlock: 4, hp: 70, ai: 22, coins: 28, gear: 0,
      stats: { initiative: 10, power: 44 },
      drops: [['feather', 0.8, 1, 2], ['bone', 0.4, 1, 1], ['hide', 0.3, 1, 1]],
      desc: _t("Кружит над холмами и падает камнем сверху: первый удар в бою — двойной."),
    },
    wisp: {
      family: _t("Духи"), ability: 'wisp', xp: 1.5, boss: true,
      name: _t("Болотный огонёк"), unlock: 5, hp: 38, ai: 20, coins: 40, gear: 0,
      stats: { initiative: 20, power: 26 },
      drops: [['essence', 0.5, 1, 1], ['crystal', 0.35, 1, 1]],
      desc: _t("Мини-босс болот для малых уровней. Хрупкий, но дразнит светом: засчитываются только камни x3 и x5."),
    },
    gull: {
      family: _t("Звери"), ability: 'steal', xp: 0.7,
      name: _t("Чайка-воришка"), unlock: 2, hp: 58, ai: 18, coins: 20, gear: 0,
      stats: { initiative: 18, power: 46 },
      drops: [['feather', 0.8, 1, 2], ['shell', 0.6, 1, 2]],
      desc: _t("Нагло таскает у путников камни прямо из рук. Бьёт слабо, зато ловка."),
    },
    hermit: {
      family: _t("Звери"), ability: 'pinch', xp: 1.0,
      name: _t("Краб-отшельник"), unlock: 3, hp: 82, ai: 20, coins: 29, gear: 0,
      stats: { power: 34, block: 10 },
      drops: [['shell', 0.8, 1, 2], ['scrap', 0.3, 1, 1]],
      desc: _t("Прячется в старой раковине, и с каждым ходом она крепче."),
    },
    smuggler: {
      family: _t("Разбойники"), ability: 'prank', xp: 1.1,
      name: _t("Контрабандист"), unlock: 5, hp: 80, ai: 30, coins: 44, gear: 0,
      stats: { power: 30, initiative: 8, block: 5 },
      drops: [['scrap', 0.6, 1, 2], ['hide', 0.4, 1, 1]],
      desc: _t("Прячет добро в прибрежных пещерах. Ловко подменяет камни на поле."),
    },
    captain: {
      family: _t("Разбойники"), ability: 'rage', xp: 3.0, boss: true, setDrop: 'sea',
      name: _t("Капитан"), unlock: 8, hp: 100, ai: 52, coins: 170, gear: 0,
      stats: { power: 52, block: 10, defense: 4, initiative: 10 },
      drops: [['scrap', 1, 2, 4], ['essence', 0.5, 1, 1], ['crystal', 0.3, 1, 1]],
      desc: _t("Хозяин восточного берега, бывший командир бригантины. Чем сильнее ранен, тем злее бьёт. Хранит части морского набора."),
    },
    pike: {
      family: _t("Твари"), ability: 'evasion', xp: 2.0, boss: true, hidden: true,
      name: _t("Щука-глубинница"), unlock: 99, hp: 64, ai: 45, coins: 120, gear: 0,
      stats: { power: 34, initiative: 12, block: 6, defense: 2 },
      drops: [['scale', 1, 2, 3], ['shell', 0.6, 1, 2]],
      desc: _t("Старая щука, что стережёт затонувший сундук под бригантиной. В её воде камни не слушаются."),
    },
    // --- 1.3.8: новые звери и чудовища ---
    fox: {
      family: _t("Звери"), ability: 'evasion', xp: 0.95,
      name: _t("Лиса-огневка"), unlock: 3, hp: 66, ai: 25, coins: 28, gear: 0,
      stats: { initiative: 16, power: 28, block: 6 },
      drops: [['hide', 0.8, 1, 2], ['fang', 0.4, 1, 2]],
      desc: _t("Рыжая плутовка. Чуть замешкаешься — уже не там, где била: то и дело уходит из-под удара."),
    },
    badger: {
      family: _t("Звери"), ability: 'pinch', xp: 1.0,
      name: _t("Барсук"), unlock: 3, hp: 82, ai: 24, coins: 28, gear: 0,
      stats: { defense: 10, power: 30, block: 4 },
      drops: [['hide', 0.7, 1, 2], ['bone', 0.4, 1, 2]],
      desc: _t("Приземистый и упрямый. Отращивает на хребте жёсткие щетинки: Блок растёт и держится до конца боя."),
    },
    owl: {
      family: _t("Звери"), ability: 'steal', xp: 1.0,
      name: _t("Филин"), unlock: 4, hp: 62, ai: 24, coins: 30, gear: 0,
      stats: { initiative: 18, power: 36 },
      drops: [['feather', 0.9, 1, 2], ['bone', 0.4, 1, 1]],
      desc: _t("Ночной охотник с золотыми глазами. Бесшумно утаскивает у вас камни."),
    },
    otter: {
      family: _t("Звери"), ability: 'backstab', xp: 0.95,
      name: _t("Выдра-разбойница"), unlock: 3, hp: 64, ai: 24, coins: 28, gear: 0,
      stats: { initiative: 20, power: 32 },
      drops: [['hide', 0.7, 1, 2], ['shell', 0.5, 1, 2]],
      desc: _t("Проворная речная воровка. Бьёт исподтишка: иногда её удар не замечает вашей брони."),
    },
    heron: {
      family: _t("Звери"), ability: 'charge', xp: 0.95,
      name: _t("Цапля"), unlock: 3, hp: 60, ai: 22, coins: 26, gear: 0,
      stats: { power: 46, initiative: 8 },
      drops: [['feather', 0.8, 1, 2], ['bone', 0.4, 1, 1]],
      desc: _t("Долговязая болотная охотница. Первый удар клювом в бою — двойной."),
    },
    elk: {
      family: _t("Звери"), ability: 'rage', xp: 1.2,
      name: _t("Лось"), unlock: 5, hp: 110, ai: 30, coins: 38, gear: 0,
      stats: { power: 40, defense: 5, initiative: 6 },
      drops: [['hide', 0.9, 1, 3], ['fang', 0.6, 1, 2], ['bone', 0.5, 1, 2]],
      desc: _t("Сильный лесной зверь с огромными рогами. Каждый третий ход бьёт рогами на 50% сильнее."),
    },
    goat: {
      family: _t("Звери"), ability: 'retribution', xp: 1.05,
      name: _t("Горный козёл"), unlock: 4, hp: 84, ai: 28, coins: 30, gear: 0,
      stats: { initiative: 14, power: 38, ricochet: 6 },
      drops: [['hide', 0.8, 1, 2], ['bone', 0.5, 1, 2]],
      desc: _t("Прыгучий упрямец холмов. Отталкивает удар рогами: чаще отбивает его Рикошетом."),
    },
    eagle: {
      family: _t("Звери"), ability: 'veil', xp: 1.1,
      name: _t("Орёл"), unlock: 5, hp: 80, ai: 28, coins: 34, gear: 0,
      stats: { initiative: 16, power: 50 },
      drops: [['feather', 0.9, 1, 3], ['fang', 0.4, 1, 1]],
      desc: _t("Падает с высоты и закрывает вам обзор крыльями: прячет часть камней на ваш ход."),
    },
    rhino: {
      family: _t("Звери"), ability: 'stun', xp: 1.4,
      name: _t("Носорог"), unlock: 5, hp: 100, ai: 32, coins: 40, gear: 0,
      stats: { power: 44, defense: 14, initiative: 4 },
      drops: [['hide', 1, 1, 3], ['fang', 0.6, 1, 2], ['bone', 0.5, 1, 2]],
      desc: _t("Тяжёлый броневой зверь равнин. Удар тараном оглушает; шкура держит почти всё."),
    },
    leopard: {
      family: _t("Звери"), ability: 'rage', xp: 1.2,
      name: _t("Снежный барс"), unlock: 6, hp: 84, ai: 32, coins: 38, gear: 0,
      stats: { initiative: 20, power: 46, fury: 8 },
      drops: [['hide', 0.9, 1, 2], ['fang', 0.6, 1, 2]],
      desc: _t("Призрак высоких холмов. Холодом сковывает ваш ход: на следующий ход урон слабее."),
    },
    leech: {
      family: _t("Твари"), ability: 'vampire', xp: 1.0,
      name: _t("Гигантская пиявка"), unlock: 3, hp: 70, ai: 24, coins: 28, gear: 0,
      stats: { power: 34, defense: 6 },
      drops: [['hide', 0.5, 1, 1], ['essence', 0.3, 1, 1]],
      desc: _t("Размером с телёнка. Лечится на половину нанесённого вам урона."),
    },
    // --- 1.8.7: выдуманные существа Затерянного острова (встречаются только там) ---
    glowmaw: {
      family: _t("Твари"), ability: 'veil', xp: 1.5,
      name: _t("Фонарник"), unlock: 8, hp: 90, ai: 34, coins: 46, gear: 0,
      stats: { power: 44, defense: 6 },
      drops: [['crystal', 0.5, 1, 1], ['shell', 0.6, 1, 2]],
      desc: _t("Зубастая тварь с живым фонарём на лбу. Заманивает светом, а потом прячет от вас камни в тумане."),
    },
    coralhulk: {
      family: _t("Твари"), ability: 'pinch', xp: 1.6,
      name: _t("Коралловый исполин"), unlock: 8, hp: 110, ai: 30, coins: 50, gear: 0,
      stats: { power: 42, defense: 14, block: 6 },
      drops: [['shell', 0.9, 1, 2], ['ore', 0.5, 1, 2]],
      desc: _t("Ходячий риф: на панцире растут розовые кораллы, которые отрастают вновь после каждого удара."),
    },
    stormray: {
      family: _t("Твари"), ability: 'weaken', xp: 1.6,
      name: _t("Штормовой скат"), unlock: 9, hp: 88, ai: 36, coins: 48, gear: 0,
      stats: { initiative: 22, power: 46, fury: 6 },
      drops: [['scale', 0.6, 1, 2], ['essence', 0.4, 1, 1]],
      desc: _t("Скат, что летает в грозовом воздухе над островом. Его разряды сбивают прицел: следующий ход ваш урон слабее."),
    },
    tidecaller: {
      family: _t("Твари"), ability: 'mire', xp: 1.7,
      name: _t("Приливник"), unlock: 9, hp: 96, ai: 38, coins: 52, gear: 0,
      stats: { power: 44, defense: 9 },
      drops: [['shell', 0.7, 1, 2], ['essence', 0.5, 1, 1]],
      desc: _t("Ракушечный старец с водорослями вместо бороды. Зовёт прилив, и камни вязнут в мокром песке."),
    },
    thornback: {
      family: _t("Твари"), ability: 'charge', xp: 1.7,
      name: _t("Игольчатый секач"), unlock: 10, hp: 100, ai: 40, coins: 54, gear: 0,
      stats: { power: 50, defense: 10, fury: 8 },
      drops: [['hide', 0.8, 1, 2], ['fang', 0.6, 1, 2]],
      desc: _t("Островной кабан-великан с гривой из костяных игл. Первый удар в бою бьёт вдвое сильнее."),
    },
    mimic: {
      family: _t("Твари"), ability: 'prank', xp: 1.3,
      name: _t("Мимик"), unlock: 4, hp: 90, ai: 28, coins: 40, gear: 0,
      stats: { defense: 10, power: 38, block: 6 },
      drops: [['scrap', 0.8, 1, 3], ['crystal', 0.4, 1, 1]],
      desc: _t("Сундук с зубами. Подманивает блеском и переставляет камни на поле, пока вы заглядываетесь."),
    },
    salamander: {
      family: _t("Твари"), ability: 'breath', xp: 1.3,
      name: _t("Саламандра"), unlock: 6, hp: 82, ai: 32, coins: 40, gear: 0,
      stats: { power: 40, defense: 8 },
      drops: [['ore', 0.6, 1, 2], ['essence', 0.4, 1, 1]],
      desc: _t("Огненная ящерица из тёплых болот. Каждый четвёртый ход сжигает ряд камней."),
    },
    bear: {
      family: _t("Звери"), ability: 'petrify', xp: 2.2, boss: true,
      name: _t("Медведь-шатун"), unlock: 5, hp: 150, ai: 36, coins: 90, gear: 0,
      stats: { power: 50, defense: 8, block: 6 },
      drops: [['hide', 1, 2, 3], ['fang', 0.8, 1, 3], ['honey', 0.5, 1, 2]],
      desc: _t("Босс леса: голодный, проснувшийся не вовремя. Рёвом сковывает столбец камней — вы не можете его тронуть."),
    },
    griffin: {
      family: _t("Чудовища"), ability: 'rage', xp: 3.0, boss: true,
      name: _t("Грифон"), unlock: 8, hp: 140, ai: 48, coins: 150, gear: 0,
      stats: { power: 56, initiative: 14, defense: 6 },
      drops: [['feather', 1, 2, 4], ['fang', 0.6, 1, 2], ['essence', 0.5, 1, 1]],
      desc: _t("Босс дальних холмов, орлиная голова на теле льва. Чем сильнее ранен, тем злее бьёт."),
    },
    wyvern: {
      family: _t("Чудовища"), ability: 'toxin', xp: 3.0, boss: true,
      name: _t("Виверна"), unlock: 8, hp: 150, ai: 48, coins: 150, gear: 0,
      stats: { power: 54, defense: 8, initiative: 10 },
      drops: [['scale', 0.8, 1, 2], ['fang', 0.7, 1, 3], ['essence', 0.5, 1, 1]],
      desc: _t("Босс: крылатая ящерица с ядовитым хвостом. Жалит отравой: яд жжёт несколько ходов подряд."),
    },
    basilisk: {
      family: _t("Чудовища"), ability: 'petrify', xp: 3.0, boss: true,
      name: _t("Василиск"), unlock: 8, hp: 135, ai: 48, coins: 150, gear: 0,
      stats: { power: 52, defense: 10, block: 8 },
      drops: [['scale', 0.8, 1, 2], ['crystal', 0.6, 1, 2], ['essence', 0.4, 1, 1]],
      desc: _t("Босс болот: взгляд каменит. Сковывает столбец камнем каждый третий ход."),
    },
    // --- 1.6.7: новые существа — по одному «родному» ресурсу на каждый цвет (см. js/forge.js) ---
    ironscarab: {
      family: _t("Каменные стражи"), ability: 'retribution', xp: 0.85,
      name: _t("Железный скарабей"), unlock: 1, hp: 68, ai: 20, coins: 22, gear: 0,
      stats: { defense: 8, power: 34 },
      drops: [['ore', 0.8, 1, 2], ['scrap', 0.6, 1, 2]],
      desc: _t("Жук в железном панцире: прогрызает штольни и дерётся челюстями-кирками. Ударишь сильнее — ответит."),
    },
    rocklizard: {
      family: _t("Твари"), ability: 'evasion', xp: 0.85,
      name: _t("Скальная ящерица"), unlock: 2, hp: 72, ai: 22, coins: 22, gear: 0,
      stats: { defense: 8, block: 6, power: 32 },
      drops: [['scale', 0.7, 1, 2], ['hide', 0.5, 1, 1]],
      desc: _t("Греется на камнях и сама похожа на камень. Быстро уворачивается, чешуя крепче, чем кажется."),
    },
    moonmoth: {
      family: _t("Духи"), ability: 'veil', xp: 0.9,
      name: _t("Лунный мотылёк"), unlock: 3, hp: 44, ai: 30, coins: 28, gear: 0,
      stats: { initiative: 14, ricochet: 6, power: 20 },
      drops: [['essence', 0.9, 1, 1], ['crystal', 0.6, 1, 2]],
      desc: _t("Летает на свет и роняет лунную пыльцу. Удары скользят мимо — и нередко отлетают обратно."),
    },
    bumblebee: {
      family: _t("Пчёлы"), ability: 'charge', xp: 0.85,
      name: _t("Шмель"), unlock: 2, hp: 60, ai: 22, coins: 22, gear: 0,
      stats: { initiative: 10, power: 30 },
      drops: [['honey', 0.7, 1, 3]],
      desc: _t("Мохнатый, как пёс, и такой же упрямый. Таранит и оставляет после себя липкий мёд."),
    },
    forestling: {
      family: _t("Лесные стражи"), ability: 'sap', xp: 0.9,
      name: _t("Лесовичок"), unlock: 2, hp: 64, ai: 24, coins: 24, gear: 0,
      stats: { defense: 6, block: 4, power: 24 },
      drops: [['splinter', 0.8, 1, 2], ['bone', 0.4, 1, 1]],
      desc: _t("Ворчливый пенёк с мхом на плечах. Не любит, когда ходят по его лесу."),
    },
    barrowman: {
      family: _t("Нежить"), ability: 'undying', xp: 0.85,
      name: _t("Курганник"), unlock: 1, hp: 58, ai: 18, coins: 20, gear: 0,
      stats: { defense: 6, power: 31 },
      drops: [['bone', 0.8, 1, 2], ['scrap', 0.2, 1, 1]],
      desc: _t("Страж древнего кургана в ржавом шлеме. Падает и поднимается снова — один раз."),
    },
    crystalid: {
      family: _t("Каменные стражи"), ability: 'ward', xp: 1.1,
      name: _t("Кристальник"), unlock: 4, hp: 72, ai: 26, coins: 34, gear: 0,
      stats: { defense: 12, power: 30 },
      drops: [['crystal', 0.8, 1, 2], ['ore', 0.5, 1, 2]],
      desc: _t("Каменный коротышка в кристаллах. Кристаллы вспыхивают щитом, об который тупятся удары."),
    },
    firetail: {
      family: _t("Драконы"), ability: 'breath', xp: 1.25,
      name: _t("Огнехвост"), unlock: 6, hp: 76, ai: 30, coins: 40, gear: 0,
      stats: { power: 38, defense: 6 },
      drops: [['scale', 0.7, 1, 2], ['fang', 0.6, 1, 2]],
      desc: _t("Молодой дракон: крылья ещё малы, а хвост уже горит. Дышит огнём, как взрослый."),
    },
    weaver: {
      family: _t("Твари"), ability: 'sap', xp: 1.3,
      name: _t("Паук-ткач"), unlock: 7, hp: 72, ai: 32, coins: 36, gear: 0,
      stats: { initiative: 12, power: 34 },
      drops: [['silk', 0.8, 1, 2], ['fang', 0.4, 1, 1]],
      desc: _t("Пещерный паук с крестом на спине. Липкая нить связывает по рукам и ногам."),
    },
    carapace: {
      family: _t("Твари"), ability: 'pinch', xp: 1.3,
      name: _t("Панцирник"), unlock: 8, hp: 86, ai: 28, coins: 42, gear: 0,
      stats: { defense: 12, block: 6, power: 34 },
      drops: [['shell', 0.8, 1, 2], ['scale', 0.4, 1, 2]],
      desc: _t("Рифовый краб размером с телегу. Панцирь в ракушках выдерживает почти всё, клешня — ещё больше."),
    },
    ironguard: {
      family: _t("Каменные стражи"), ability: 'stun', xp: 1.5,
      name: _t("Железный страж"), unlock: 9, hp: 78, ai: 30, coins: 46, gear: 0,
      stats: { defense: 14, block: 6, power: 38 },
      drops: [['scrap', 0.9, 1, 2], ['ore', 0.6, 1, 2]],
      desc: _t("Пустые латы с поля старой битвы. Внутри никого — и это пугает больше всего. Удар латной перчатки оглушает."),
    },
    boneknight: {
      family: _t("Нежить"), ability: 'ward', xp: 1.5,
      name: _t("Костяной рыцарь"), unlock: 10, hp: 60, ai: 40, coins: 46, gear: 0,
      stats: { defense: 10, block: 6, power: 30 },
      drops: [['bone', 0.9, 1, 2], ['scrap', 0.5, 1, 2]],
      desc: _t("Скелет в чёрных латах, с холодным синим огнём в глазницах. Бьёт чётко, как на параде, и прикрывается чёрным щитом."),
    },
    // --- 1.7.3: новые виды для тонких семей (Великаны, Гоблины, Тени) и новых приёмов ---
    ogre: {
      family: _t("Великаны"), ability: 'stun', xp: 1.5,
      name: _t("Огр"), unlock: 9, hp: 102, ai: 34, coins: 50, gear: 0,
      stats: { power: 42, defense: 10 },
      drops: [['hide', 0.9, 2, 3], ['bone', 0.6, 1, 2], ['ore', 0.5, 1, 2]],
      desc: _t("Людоед с дубиной из целого ствола. Бьёт так, что звенит в ушах и пропадает ход."),
    },
    berserk: {
      family: _t("Гоблины"), ability: 'rage', xp: 1.15,
      name: _t("Гоблин-берсерк"), unlock: 5, hp: 74, ai: 34, coins: 38, gear: 0,
      stats: { power: 46, initiative: 12 },
      drops: [['scrap', 0.6, 1, 2], ['bone', 0.5, 1, 2], ['fang', 0.3, 1, 1]],
      desc: _t("Гоблин, наевшийся мухоморов. Чем сильнее ранен, тем безумнее машет топорами."),
    },
    assassin: {
      family: _t("Тени"), ability: 'toxin', xp: 1.5,
      name: _t("Тень-убийца"), unlock: 10, hp: 62, ai: 42, coins: 52, gear: 0,
      stats: { initiative: 16, power: 40, ricochet: 6 },
      drops: [['essence', 0.6, 1, 2], ['crystal', 0.35, 1, 1], ['silk', 0.3, 1, 1]],
      desc: _t("Тень с чёрным клинком. Порез почти не больно, но яд на лезвии жжёт ещё несколько ходов."),
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
  // Сила — умеренно, шансы (Броня, Блок, Рикошет, Проворство) — медленно.
  // swarmSize — размер роя (см. rollSwarmSize); у обычных видов всегда 1 и ни на что не влияет.
  function scaled(id, tier, swarmSize = 1) {
    const m = MONSTERS[id], t = B_T.clamp(tier);
    const stats = B_G.blankStats();
    const sw = swarmMult(id, swarmSize);
    const dmg = B_T.GROWTH[t - 1] * B_B.damage.stone * sw.dmg * B_B.monsters.dmgScale[t - 1];            // рост урона существа (в бою даёт Силу уровня)
    for (const k in m.stats) stats[k] = Math.round(m.stats[k] * (k === 'power' ? B_T.POWER_MULT[t - 1] * 0.045 * dmg * B_B.monsters.powerMul : B_T.statMult(k, t)));   // Сила существа — число к удару (очко старой шкалы = 0,045 × рост урона)
    return {
      hp: Math.round(m.hp * B_T.GROWTH[t - 1] * sw.hp * B_B.monsters.hpBoost[t - 1]),
      dmg,
      stats: B_G.combine(stats, {}),
      ai: Math.max(1, Math.min(100, m.ai + (t - 1) * B_B.monsters.aiPerTier)),
      gearBudget: Math.round(m.gear * B_T.POINT_MULT[t - 1]),
    };
  }

  // Что упадёт после победы. rand — генератор случайных чисел (для тестов).
  // faction — фракция игрока: вещи чужих фракций не выпадают.
  // 1.6.6: heroTier — цвет героя. Существо слабее цветом ничего из ресурсов не даёт (монеты и опыт остаются): слабых мобов бить невыгодно,
  // ресурсы для малых уровней остаются на рынке. weak = true сообщает экрану награды, почему ресурсов нет.
  const resourcesWeak = (tier, heroTier) => heroTier > 0 && B_T.clamp(tier) < heroTier;
  function rollDrops(id, tier, rand = Math.random, faction, heroTier, boost = 1) {
    const m = MONSTERS[id], t = B_T.clamp(tier);
    const resources = [], weak = resourcesWeak(t, heroTier);
    for (const [kind, chance, min, max] of weak ? [] : m.drops) {
      if (rand() < chance / (B_B.gameLength || 1)) resources.push({ kind, tier: t, n: min + Math.floor(rand() * (max - min + 1)) });
    }
    const coins = Math.round(m.coins * B_B.rewards.coinK * B_T.PRICE_MULT[t - 1] * (0.8 + rand() * 0.4));
    // Предмет: шанс Balance.rewards.itemChance; чаще выпадают обычные вещи, реже редкие и эпические.
    let entry = null;
    if (m.setDrop && rand() < 0.5) {                                   // босс: часть редкого набора (Gear.SETS[setDrop])
      const parts = B_G.ITEMS.filter((i) => i.set === m.setDrop);
      entry = B_G.makeEntry(parts[Math.floor(rand() * parts.length)].id, t);
    } else if (rand() < B_B.rewards.itemChance * boost) {   // boost: ночью шанс вещи выше (1.7.1)
      const pool = [];
      const items = faction ? B_G.itemsFor(faction) : B_G.ITEMS.filter((i) => !i.faction && i.set !== 'sea');
      for (const it of items) for (let k = 0; k < { common: 6, rare: 3, epic: 1 }[it.rarity]; k++) pool.push(it);
      const pick = pool[Math.floor(rand() * pool.length)];
      entry = B_G.makeEntry(pick.id, rand() < 0.3 ? Math.max(1, t - 1) : t);
    }
    return { coins, resources, item: entry, weak };
  }

  // Какие виды открыты при данном числе побед.
  const unlockedSpecies = (wins) => ORDER.filter((id) => MONSTERS[id].unlock <= wins);

  // undefined для id без записи в MONSTERS (например, тренировочный Бобёр-хранитель в учебном бою —
  // см. game.js/setupTrainerBeaver — это не настоящий вид бестиария, у него нет приёма).
  const ability = (id) => (MONSTERS[id] ? ABILITIES[MONSTERS[id].ability] : undefined);

  // 1.7.5: обмен ресурсов одного вида между соседними цветами (Кузница): вверх 3 → 1, вниз 1 → 2. Возвращает порядок обмена или null.
  const EXCHANGE = { up: 3, down: 1, downOut: 2 };
  function exchangePlan(kind, tier, dir) {
    if (!RESOURCES[kind]) return null;
    const to = dir === 'up' ? tier + 1 : tier - 1;
    if (to < 1 || to > B_T.MAX || tier < 1 || tier > B_T.MAX) return null;
    return dir === 'up' ? { kind, from: tier, to, take: EXCHANGE.up, give: 1 } : { kind, from: tier, to, take: EXCHANGE.down, give: EXCHANGE.downOut };
  }
  // 1.7.5: «где добыть» — виды существ, у которых выпадает ресурс (по порядку бестиария).
  const sourcesOf = (kind) => ORDER.filter((id) => MONSTERS[id].drops.some((d) => d[0] === kind));
  return { EXCHANGE, exchangePlan, sourcesOf, RESOURCES, MONSTERS, ORDER, ABILITIES, ability, resPrice, scaled, rollDrops, resourcesWeak, unlockedSpecies, rollSwarmSize, swarmMult };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Bestiary;
