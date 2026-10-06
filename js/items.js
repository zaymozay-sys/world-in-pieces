if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Предметы, сеты и подсчёт характеристик (без интерфейса — можно тестировать в Node).

   Характеристики (у каждого предмета свой набор):
     power      — Сила: +% к наносимому урону
     health     — Здоровье: + к максимуму ХП
     defense    — Броня: −% к получаемому урону (максимум 60%)
     magic      — Магия: каждые 4 очка снижают цену заклинаний на 1 камень каждого вида (минимум 2)
     initiative — Инициатива: +% к шансу первого хода в бою (максимум 50)
     ricochet   — Рикошет: шанс (максимум 40%), что удар отлетит в нападающего; отлетает урон за вычетом брони цели
     block      — Блок: шанс (максимум 50%) полностью заблокировать удар
     fury       — Ярость: шанс (максимум 35%) нанести двойной урон одним ударом (считается до Брони цели)
     cunning    — Хитрость: шанс (максимум 30%), что после сбора камней противником заберёшь половину
                  собранных им магических камней (сапфир/рубин/изумруд) — см. Combat.cunningSteal

   Ячейки: правая рука (main), левая рука (off), шлем, нагрудник, наручи, поножи, амулет.
   Типы предметов: weapon1 (одноручное, в любую руку), weapon2 (двуручное, занимает обе руки),
   shield (только в левую руку), head, chest, arms, legs, amulet, shoulders, gloves (1.3.2). */

const T = (typeof Tiers !== 'undefined') ? Tiers : require('./tiers.js');   // уровни-цвета

const Gear = (() => {
  const SLOTS = ['main', 'off', 'head', 'shoulders', 'chest', 'arms', 'gloves', 'legs', 'amulet', 'bag', 'leash', 'compass', 'ranged'];   // 1.3.2: + наплечники и перчатки; 1.3.6: + сумка
  const SLOT_NAMES = {
    main: _t("Правая рука"), off: _t("Левая рука"), head: _t("Шлем"), chest: _t("Нагрудник"),
    arms: _t("Наручи"), legs: _t("Поножи"), amulet: _t("Амулет"), shoulders: _t("Наплечники"), gloves: _t("Перчатки"), bag: _t("Сумка"), leash: _t("Поводок"), compass: _t("Компас"), ranged: _t("Метательное"),
  };
  const STAT_NAMES = { power: _t("Сила"), health: _t("Здоровье"), defense: _t("Броня"), magic: _t("Магия"), initiative: _t("Инициатива"), ricochet: _t("Рикошет"), block: _t("Блок"), fury: _t("Ярость"), cunning: _t("Хитрость") };
  const TYPE_NAMES = {
    weapon1: _t("Одноручное оружие"), weapon2: _t("Двуручное оружие"), shield: _t("Щит"),
    head: _t("Шлем"), chest: _t("Нагрудник"), arms: _t("Наручи"), legs: _t("Поножи"), amulet: _t("Амулет"),
    shoulders: _t("Наплечники"), gloves: _t("Перчатки"), bag: _t("Сумка"), leash: _t("Поводок"), compass: _t("Компас"), ranged: _t("Метательное"),
  };
  const RARITY_NAMES = { common: _t("Обычный"), rare: _t("Редкий"), epic: _t("Эпический") };
  const MAX_DEFENSE = 60;
  // Потолки характеристик (не «ломают» бой)
  const CAPS = { defense: 60, initiative: 50, ricochet: 40, block: 50, fury: 35, cunning: 30 };

  // Комплекты: бонус действует, когда надето не меньше указанного числа предметов набора.
  const SETS = {
    guard:    { name: _t("Страж"),    color: '#6aa8e8', bonuses: { 2: { health: 10 }, 3: { defense: 6, block: 3 }, 4: { health: 20, defense: 6 }, 5: { power: 10, block: 5 } } },
    berserk:  { name: _t("Берсерк"),  color: '#e0605a', bonuses: { 2: { power: 5 }, 3: { power: 5, health: 5 }, 4: { power: 8, initiative: 4 }, 5: { health: 10, power: 5 }, 6: { power: 12, ricochet: 4, fury: 8 } } },
    mage:     { name: _t("Чародей"),  color: '#b58cff', bonuses: { 2: { magic: 1 }, 3: { magic: 1, ricochet: 3 }, 4: { magic: 1, power: 6 }, 5: { magic: 1, defense: 4 }, 6: { magic: 2, power: 8, ricochet: 4 } } },
    // Наборы фракций: надеть может только своя фракция.
    crown:    { name: _t("Корона"),   color: '#4a7fe0', faction: 'human',  bonuses: { 2: { initiative: 4 }, 3: { power: 5, block: 3 }, 4: { health: 15 }, 5: { power: 8, initiative: 4 } } },
    rune:     { name: _t("Руна"),     color: '#d08a3a', faction: 'dwarf',  bonuses: { 2: { defense: 4 }, 3: { block: 4, health: 8 }, 4: { defense: 5, power: 5 }, 5: { block: 6, health: 12 } } },
    grove:    { name: _t("Роща"),     color: '#3fae63', faction: 'elf',    bonuses: { 2: { initiative: 5 }, 3: { ricochet: 4, magic: 1 }, 4: { initiative: 5, power: 5 }, 5: { ricochet: 5, magic: 1 } } },
    scale:    { name: _t("Чешуя"),    color: '#c9573c', faction: 'lizard', bonuses: { 2: { health: 10 }, 3: { power: 5, ricochet: 3 }, 4: { health: 15, block: 3 }, 5: { power: 8, health: 10 } } },
    sea:      { name: _t("Морской волк"), color: '#3aa6c4', rare: true, bonuses: { 2: { initiative: 4 }, 3: { power: 5, defense: 3 }, 4: { health: 15, block: 4 }, 5: { power: 8, ricochet: 4 }, 6: { power: 10, initiative: 5, fury: 4 }, 7: { health: 15, defense: 5 }, 8: { power: 12, health: 20, cunning: 8 } } },
    wanderer: { name: _t("Странник"), color: '#5fc98a', bonuses: { 2: { health: 6, initiative: 3 }, 3: { defense: 3, power: 3 }, 4: { health: 10, magic: 1, initiative: 4, cunning: 6 }, 5: { power: 6, block: 3 }, 6: { health: 12, power: 6, defense: 4 } } },
  };
  const NEUTRAL_COLOR = '#a9adb8';

  // id, название, тип, набор, редкость, характеристики[, фракция]
  const RAW = [
    // --- Корона (люди): знаменосцы Вольных городов ---
    ['crown-sword',  _t("Меч знаменосца"),      'weapon1', 'crown', 'rare',   { power: 9, initiative: 3 }, 'human'],
    ['crown-shield', _t("Геральдический щит"),  'shield',  'crown', 'rare',   { defense: 6, block: 7 }, 'human'],
    ['crown-head',   _t("Шлем с плюмажем"),     'head',    'crown', 'common', { health: 7, defense: 2, initiative: 2 }, 'human'],
    ['crown-chest',  _t("Бригантина"),          'chest',   'crown', 'rare',   { health: 12, defense: 4, block: 2 }, 'human'],
    ['crown-amulet', _t("Печать гильдии"),      'amulet',  'crown', 'epic',   { initiative: 4, magic: 1, health: 4 }, 'human'],
    // --- Руна (гномы): кованое железо с рунами ---
    ['rune-hammer',  _t("Рунный молот"),        'weapon2', 'rune',  'epic',   { power: 20, defense: 3 }, 'dwarf'],
    ['rune-head',    _t("Рунный шлем"),         'head',    'rune',  'common', { defense: 4, health: 6 }, 'dwarf'],
    ['rune-chest',   _t("Рунная кираса"),       'chest',   'rune',  'rare',   { defense: 6, health: 10 }, 'dwarf'],
    ['rune-arms',    _t("Рунные наручи"),       'arms',    'rune',  'rare',   { block: 5, defense: 2 }, 'dwarf'],
    ['rune-legs',    _t("Кованые сапоги"),      'legs',    'rune',  'common', { defense: 4, health: 7, block: 2 }, 'dwarf'],
    // --- Роща (эльфы): лук, листья и живое дерево ---
    ['grove-bow',    _t("Длинный лук"),         'weapon2', 'grove', 'epic',   { power: 14, initiative: 6 }, 'elf'],
    ['grove-head',   _t("Венец листьев"),       'head',    'grove', 'common', { magic: 1, initiative: 5, ricochet: 1, health: 3 }, 'elf'],
    ['grove-chest',  _t("Плащ из листьев"),     'chest',   'grove', 'rare',   { health: 10, ricochet: 3, initiative: 2 }, 'elf'],
    ['grove-legs',   _t("Мягкие сапоги"),       'legs',    'grove', 'common', { initiative: 5, defense: 1 }, 'elf'],
    ['grove-amulet', _t("Семя древа"),          'amulet',  'grove', 'rare',   { magic: 2, health: 6, ricochet: 2 }, 'elf'],
    // --- Чешуя (ящеры): панцири, кости и яд ---
    ['scale-blade',  _t("Ядовитый клинок"),     'weapon1', 'scale', 'rare',   { power: 10, ricochet: 2 }, 'lizard'],
    ['scale-shield', _t("Щит из панциря"),      'shield',  'scale', 'common', { defense: 5, block: 5, health: 4 }, 'lizard'],
    ['scale-chest',  _t("Чешуйчатый доспех"),   'chest',   'scale', 'rare',   { health: 14, defense: 4 }, 'lizard'],
    ['scale-arms',   _t("Костяные наручи"),     'arms',    'scale', 'common', { power: 4, block: 3 }, 'lizard'],
    ['scale-amulet', _t("Клык змея"),           'amulet',  'scale', 'epic',   { power: 6, ricochet: 3 }, 'lizard'],
    // --- Страж (защита и здоровье) ---
    ['guard-head',  _t("Шлем стража"),      'head',   'guard', 'common', { health: 8, defense: 3, block: 2 }],
    ['guard-chest', _t("Кираса стража"),    'chest',  'guard', 'common', { health: 15, defense: 5, ricochet: 2 }],
    ['guard-arms',  _t("Наручи стража"),    'arms',   'guard', 'common', { defense: 3, block: 3, power: 2 }],
    ['guard-legs',  _t("Поножи стража"),    'legs',   'guard', 'rare',   { health: 10, defense: 4, initiative: 2 }],
    ['guard-shield',_t("Щит стража"),       'shield', 'guard', 'rare',   { defense: 6, block: 10, health: 4 }],
    // --- Берсерк (сила) ---
    ['berserk-axe',   _t("Топор берсерка"),     'weapon2', 'berserk', 'rare',   { power: 22, initiative: 2 }],
    ['berserk-head',  _t("Шлем берсерка"),      'head',    'berserk', 'common', { power: 4, health: 4, initiative: 3 }],
    ['berserk-chest', _t("Кираса берсерка"),    'chest',   'berserk', 'rare',   { power: 5, health: 10, ricochet: 2 }],
    ['berserk-arms',  _t("Наручи берсерка"),    'arms',    'berserk', 'rare',   { power: 6, initiative: 2 }],
    ['berserk-legs',  _t("Поножи берсерка"),    'legs',    'berserk', 'rare',   { power: 3, health: 6, initiative: 4 }],
    ['berserk-amulet',_t("Амулет ярости"),      'amulet',  'berserk', 'epic',   { power: 10, ricochet: 4, health: 5, fury: 10 }],
    // --- Чародей (магия) ---
    ['mage-staff',  _t("Посох чародея"),    'weapon2', 'mage', 'rare',   { magic: 4, power: 10, initiative: 2 }],
    ['mage-head',   _t("Колпак чародея"),   'head',    'mage', 'common', { magic: 1, health: 5, initiative: 2 }],
    ['mage-chest',  _t("Мантия чародея"),   'chest',   'mage', 'rare',   { magic: 2, health: 10, defense: 2, ricochet: 3 }],
    ['mage-arms',   _t("Наручи чародея"),   'arms',    'mage', 'epic',   { magic: 2, power: 4, block: 2 }],
    ['mage-legs',   _t("Поножи чародея"),   'legs',    'mage', 'rare',   { magic: 2, defense: 2, initiative: 3 }],
    ['mage-amulet', _t("Кристалл чародея"), 'amulet',  'mage', 'epic',   { magic: 3, health: 8, ricochet: 5 }],
    // --- Странник (баланс) ---
    ['wand-dagger', _t("Кинжал странника"),   'weapon1', 'wanderer', 'common', { power: 8, initiative: 4 }],
    ['wand-blade',  _t("Клинок странника"),   'weapon1', 'wanderer', 'rare',   { power: 10, defense: 1, block: 3 }],
    ['wand-head',   _t("Капюшон странника"),  'head',    'wanderer', 'common', { health: 6, power: 2, initiative: 3 }],
    ['wand-chest',  _t("Плащ странника"),     'chest',   'wanderer', 'common', { health: 12, defense: 3, block: 2 }],
    ['wand-legs',   _t("Сапоги странника"),   'legs',    'wanderer', 'common', { health: 8, defense: 2, magic: 1, initiative: 4 }],
    ['wand-amulet', _t("Талисман странника"), 'amulet',  'wanderer', 'rare',   { health: 10, magic: 1, ricochet: 3 }],
    // --- Морской волк: редкий набор побережья (сундук у бригантины и Капитан); в лавке, кузнице и обычной добыче не встречается ---
    ['sea-cutlass', _t("Абордажная сабля"),   'weapon1', 'sea', 'rare', { power: 12, initiative: 4 }],
    ['sea-harpoon', _t("Гарпун"),             'weapon2', 'sea', 'epic', { power: 23, ricochet: 4 }],
    ['sea-buckler', _t("Якорный щит"),        'shield',  'sea', 'rare', { defense: 6, block: 8 }],
    ['sea-head',    _t("Шляпа капитана"),     'head',    'sea', 'rare', { health: 8, defense: 2, initiative: 3 }],
    ['sea-chest',   _t("Бушлат морехода"),    'chest',   'sea', 'rare', { health: 14, defense: 4, block: 3 }],
    ['sea-arms',    _t("Перчатки такелажника"),'arms',   'sea', 'rare', { defense: 3, power: 3, block: 2 }],
    ['sea-legs',    _t("Сапоги морехода"),    'legs',    'sea', 'rare', { health: 9, defense: 2, initiative: 4 }],
    ['sea-amulet',  _t("Компас штурмана"),    'amulet',  'sea', 'epic', { initiative: 5, magic: 1, cunning: 6 }],
    // --- 1.3.2: наплечники и перчатки фракций (входят в наборы своих фракций) ---
    ['crown-shoulders', _t("Наплечники знаменосца"), 'shoulders', 'crown', 'rare',   { defense: 3, health: 5, block: 2 }, 'human'],
    ['crown-gloves',    _t("Латные перчатки рыцаря"),'gloves',    'crown', 'rare',   { power: 4, block: 2, initiative: 1 }, 'human'],
    ['rune-shoulders',  _t("Рунные наплечники"),     'shoulders', 'rune',  'rare',   { defense: 4, health: 5, block: 1 }, 'dwarf'],
    ['rune-gloves',     _t("Кузнечные рукавицы"),    'gloves',    'rune',  'common', { power: 4, defense: 2 }, 'dwarf'],
    ['grove-shoulders', _t("Наплечники из коры"),    'shoulders', 'grove', 'rare',   { initiative: 3, ricochet: 2, health: 4 }, 'elf'],
    ['grove-gloves',    _t("Перчатки лучника"),      'gloves',    'grove', 'rare',   { power: 4, initiative: 3 }, 'elf'],
    ['scale-shoulders', _t("Наплечники из панциря"), 'shoulders', 'scale', 'rare',   { health: 7, defense: 2, block: 2 }, 'lizard'],
    ['scale-gloves',    _t("Когтистые перчатки"),    'gloves',    'scale', 'rare',   { power: 5, ricochet: 2 }, 'lizard'],
    // --- Без набора ---
    ['sword-novice', _t("Меч новичка"),       'weapon1', null, 'common', { power: 6 }],
    ['club',         _t("Дубина"),            'weapon1', null, 'common', { power: 7, health: 3 }],
    ['sword-two',    _t("Двуручный меч"),     'weapon2', null, 'rare',   { power: 18, block: 2 }],
    ['hammer',       _t("Тяжёлый молот"),     'weapon2', null, 'epic',   { power: 28, health: 6 }],
    ['shield-wood',  _t("Деревянный щит"),    'shield',  null, 'common', { defense: 5, block: 5 }],
    ['leather-head', _t("Кожаный шлем"),      'head',    null, 'common', { health: 5, defense: 1 }],
    ['leather-chest',_t("Кожаная куртка"),    'chest',   null, 'common', { health: 8, defense: 2 }],
    ['leather-arms', _t("Кожаные наручи"),    'arms',    null, 'common', { defense: 2, block: 1 }],
    ['leather-legs', _t("Кожаные поножи"),    'legs',    null, 'common', { health: 5, defense: 1, initiative: 1 }],
    ['leather-shoulders',_t("Кожаные наплечники"),'shoulders', null, 'common', { health: 4, defense: 1 }],
    ['leather-gloves',   _t("Кожаные перчатки"),  'gloves',    null, 'common', { power: 2, block: 1 }],
    ['amulet-copper',_t("Медный амулет"),     'amulet',  null, 'common', { health: 6, block: 1 }],
    ['amulet-power', _t("Амулет силы"),       'amulet',  null, 'rare',   { power: 8, ricochet: 2 }],
    ['amulet-spark', _t("Амулет искры"),      'amulet',  null, 'rare',   { magic: 2, initiative: 2 }],
    ['bag-satchel',  _t("Дорожная сумка"),    'bag',     null, 'common', { health: 5, initiative: 1 }],
    ['bag-herbal',   _t("Сумка травника"),    'bag',     null, 'rare',   { health: 9, magic: 1, block: 1 }],
    ['bag-courier',  _t("Сумка гонца"),       'bag',     null, 'rare',   { initiative: 4, cunning: 3 }],
    ['bag-bandolier',_t("Патронташ охотника"),'bag',     null, 'epic',   { power: 5, initiative: 3, fury: 4 }],
    ['leash-rope',   _t("Верёвочный поводок"), 'leash',   null, 'common', { health: 3, initiative: 1 }],
    ['leash-chain',  _t("Цепной поводок"),     'leash',   null, 'rare',   { power: 4, block: 2 }],
    ['leash-silver', _t("Серебряный поводок"), 'leash',   null, 'epic',   { health: 8, initiative: 3, ricochet: 2 }],
    ['compass-brass',_t("Латунный компас"),    'compass', null, 'common', { initiative: 2, cunning: 1 }],
    ['compass-sea',  _t("Морской компас"),     'compass', null, 'rare',   { cunning: 5, initiative: 2 }],
    ['compass-star', _t("Звёздный компас"),    'compass', null, 'epic',   { cunning: 8, magic: 2, initiative: 3 }],
    // 1.3.6: метательное — стоит в центральной ячейке между руками и заменяет спец. снаряд народа
    ['crossbow-hunt',  _t("Охотничий арбалет"),   'ranged', null, 'common', { power: 3, initiative: 1 }],
    ['crossbow-siege', _t("Осадный арбалет"),     'ranged', null, 'rare',   { power: 7, block: 1 }],
    ['crossbow-repeater',_t("Скорострельный арбалет"),'ranged', null, 'epic', { power: 8, initiative: 3, fury: 3 }],
    ['petard-clay',    _t("Глиняная петарда"),    'ranged', null, 'common', { power: 3, fury: 1 }],
    ['petard-iron',    _t("Железная петарда"),    'ranged', null, 'rare',   { power: 6, fury: 2 }],
    ['petard-fire',    _t("Огненная петарда"),    'ranged', null, 'epic',   { power: 8, fury: 3, ricochet: 2 }],
    ['amulet-fox',   _t("Амулет лиса"),       'amulet',  null, 'epic',   { cunning: 8, initiative: 3 }],
    // --- Особое оружие: помимо характеристик, даёт приём в бою (см. perk, combat.js) ---
    ['crossbow-heavy', _t("Тяжёлый арбалет"),   'weapon2', null, 'rare', { power: 13, initiative: 3 }, null, { type: 'pierceBlock' }],
    ['morningstar',    _t("Утренняя звезда"),   'weapon1', null, 'rare', { power: 11, defense: 1 }, null, { type: 'armorShred' }],
  ];

  // Цена предмета в очках снаряжения — считается из его характеристик.
  const costOf = (s) => Math.round((s.power || 0) + (s.health || 0) * 0.5 + (s.defense || 0) * 1.5 + (s.magic || 0) * 4
    + (s.initiative || 0) * 2 + (s.ricochet || 0) * 2.5 + (s.block || 0) * 2 + (s.fury || 0) * 2.5 + (s.cunning || 0) * 2.5);

  const ITEMS = RAW.map(([id, name, type, set, rarity, stats, faction, perk]) => ({ id, name, type, set, rarity, stats, faction: faction || null, perk: perk || null, cost: costOf(stats) }));
  // Вещи, доступные фракции: общие + её собственные.
  const itemsFor = (faction) => ITEMS.filter((i) => i.set !== 'sea' && (!i.faction || i.faction === faction));   // набор «Морской волк» — только особая добыча
  const BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

  const emptyLoadout = () => Object.fromEntries(SLOTS.map((s) => [s, null]));

  /* ---------- предметы-экземпляры и уровни ---------- */
  // В ячейке лежит либо id базового предмета (тогда это Красный, уровень 1),
  // либо экземпляр { uid, id, tier } — конкретная вещь игрока или противника.
  let uidCounter = 1;
  const newUid = () => 'i' + Date.now().toString(36) + (uidCounter++).toString(36);
  const makeEntry = (id, tier = 1) => ({ uid: newUid(), id, tier: T.clamp(tier) });
  const entryKey = (e) => (typeof e === 'string' ? e : (e.uid || e.id));

  const scaleStats = (stats, tier) => Object.fromEntries(Object.entries(stats)
    .map(([k, v]) => [k, v > 0 ? Math.max(1, Math.round(v * T.statMult(k, tier))) : v]));   // у каждой характеристики свой темп роста
  // Цена в медных монетах: растёт с уровнем гораздо быстрее, чем очки.
  const priceAt = (cost1, tier) => Math.round(cost1 * 10 * T.PRICE_MULT[tier - 1]);
  const sellValue = (price) => Math.round(price * 0.4);
  // Старьёвщик платит меньше Лавки — зато скупает всё разом, одной кнопкой (см. Screens.openJunker).
  const junkValue = (price) => Math.round(price * 0.25);

  // Полное описание предмета с учётом уровня.
  function item(entry) {
    if (!entry) return null;
    const e = typeof entry === 'string' ? { id: entry, tier: 1 } : entry;
    const base = BY_ID[e.id];
    if (!base) return null;
    const tier = T.clamp(e.tier || 1);
    return {
      ...base, uid: e.uid || null, tier, base,
      stats: tier === 1 ? base.stats : scaleStats(base.stats, tier),
      cost: Math.round(base.cost * T.POINT_MULT[tier - 1]),
      price: priceAt(base.cost, tier),
      runes: Array.isArray(e.runes) ? e.runes : (e.rune ? [e.rune] : undefined),
    };
  }

  // 1.3.6: какой выстрел даёт метательное оружие в центральной ячейке (null — ничего не надето: выстрел народа)
  function shotKind(gear) {
    const it = item(gear && gear.ranged);
    if (!it) return null;
    return it.id.startsWith('crossbow') ? 'bolt' : 'bomb';
  }
  // Множитель силы выстрела по цвету метательного оружия
  const shotMult = (gear) => { const it = item(gear && gear.ranged); return it ? 1 + 0.15 * ((it.tier || 1) - 1) : 1; };

  // Какие типы предметов подходят для ячейки.
  function fits(slot, type) {
    if (slot === 'main') return type === 'weapon1' || type === 'weapon2';
    if (slot === 'off') return type === 'weapon1' || type === 'shield';
    return type === slot;
  }

  // Можно ли надеть предмет в ячейку (с учётом двуручного оружия). Возвращает { ok, reason }.
  // level — уровень героя: вещь цвета N можно надеть с уровня (N − 1) × 5 + 1 (см. hero.js).
  function canEquip(gear, entry, slot, faction, level) {
    const it = item(entry);
    if (!it) return { ok: false, reason: _t("Неизвестный предмет") };
    if (it.faction && faction && it.faction !== faction) return { ok: false, reason: _t("Эта вещь только для своей фракции") };
    if (level && typeof Hero !== 'undefined' && !Hero.canWear(it.tier, level)) return { ok: false, reason: _t("Эту вещь можно надеть с {0}-го уровня", [Hero.itemLevel(it.tier)]) };
    if (!fits(slot, it.type)) return { ok: false, reason: _t("Этот предмет сюда не подходит") };
    const main = item(gear.main);
    if (slot === 'off' && main && main.type === 'weapon2') return { ok: false, reason: _t("В правой руке двуручное оружие") };
    // один и тот же предмет нельзя надеть в две ячейки
    for (const s of SLOTS) if (s !== slot && gear[s] && entryKey(gear[s]) === entryKey(entry)) return { ok: false, reason: _t("Этот предмет уже надет") };
    return { ok: true };
  }

  // Новое снаряжение после надевания. Двуручное оружие освобождает левую руку.
  function equip(gear, entry, slot) {
    const next = { ...gear, [slot]: entry };
    if (slot === 'main' && item(entry).type === 'weapon2') next.off = null;
    return next;
  }

  function unequip(gear, slot) { return { ...gear, [slot]: null }; }

  // Приём особого оружия, если такое надето в правую или левую руку (см. perk у RAW-записи выше).
  const weaponPerk = (gear) => {
    const main = item(gear.main), off = item(gear.off);
    return (main && main.perk) || (off && off.perk) || null;
  };

  const equipped = (gear) => SLOTS.map((s) => item(gear[s])).filter(Boolean);
  const totalCost = (gear) => equipped(gear).reduce((sum, it) => sum + it.cost, 0);

  // Сколько предметов каждого набора надето и какие бонусы действуют.
  function setProgress(gear) {
    const counts = {};
    for (const it of equipped(gear)) if (it.set) counts[it.set] = (counts[it.set] || 0) + 1;
    return Object.entries(counts).map(([id, count]) => {
      const set = SETS[id];
      const active = [], next = [];
      for (const [need, b] of Object.entries(set.bonuses)) (count >= Number(need) ? active : next).push({ need: Number(need), bonus: b });
      const total = ITEMS.filter((i) => i.set === id).length;
      return { id, name: set.name, color: set.color, count, total, active, next };
    });
  }

  const blankStats = () => ({ power: 0, health: 0, defense: 0, magic: 0, initiative: 0, ricochet: 0, block: 0, fury: 0, cunning: 0 });
  const capStats = (s) => { for (const k in CAPS) s[k] = Math.max(0, Math.min(CAPS[k], s[k])); return s; };

  // Итоговые характеристики: предметы + бонусы наборов.
  function stats(gear) {
    const s = blankStats();
    for (const it of equipped(gear)) for (const k in it.stats) s[k] += it.stats[k];
    for (const p of setProgress(gear)) for (const a of p.active) for (const k in a.bonus) s[k] += a.bonus[k];
    return capStats(s);
  }

  // Характеристики вещей героя уровня L: подуровень внутри цвета даёт до +1% (Hero.clothBonus).
  function statsFor(gear, L) {
    const s = stats(gear), k = (typeof Hero !== 'undefined' && L) ? Hero.clothBonus(L) : 0;
    if (k > 0) for (const key in s) s[key] = Math.round(s[key] * (1 + k));
    return capStats(s);
  }

  // Складывает характеристики (предметы + врождённые способности монстра).
  function combine(a, b) {
    const s = blankStats();
    for (const k in s) s[k] = (a[k] || 0) + (b[k] || 0);
    return capStats(s);
  }

  // Цена заклинания (камней каждого вида) при заданной Магии.
  const spellCost = (base, magic) => Math.max(2, base - Math.floor(magic / 4));

  // Снаряжение противника: случайный набор нужного уровня в пределах очков (предпочитает вещи одного набора).
  function randomLoadout(budget, rand = Math.random, tier = 1) {
    let gear = emptyLoadout();
    const favorite = Object.keys(SETS)[Math.floor(rand() * Object.keys(SETS).length)];
    const order = ['main', 'chest', 'head', 'legs', 'arms', 'amulet', 'off', 'shoulders', 'gloves'].sort(() => rand() - 0.5);
    let left = budget;
    for (const slot of order) {
      const options = ITEMS.filter((it) => !it.faction).map((it) => makeEntry(it.id, tier)).filter((e) => {
        const it = item(e);
        return it.cost <= left && fits(slot, it.type) && canEquip(gear, e, slot).ok;
      });
      if (!options.length || rand() < 0.1) continue;
      const weighted = [];
      for (const e of options) {
        const it = item(e);
        for (let k = 0; k < (it.set === favorite ? 4 : 1) + Math.min(3, Math.floor(it.cost / (10 * T.POINT_MULT[tier - 1]))); k++) weighted.push(e);
      }
      const pick = weighted[Math.floor(rand() * weighted.length)];
      gear = equip(gear, pick, slot);
      left -= item(pick).cost;
    }
    return gear;
  }

  /* ---------- кузница: улучшение и создание ---------- */
  // Какие ресурсы нужны для вещей каждого типа.
  const FORGE_KINDS = {
    weapon1: ['ore', 'fang'], weapon2: ['ore', 'fang'],
    shield: ['scrap', 'hide'], head: ['scrap', 'hide'], chest: ['scrap', 'hide'], arms: ['scrap', 'hide'], legs: ['scrap', 'hide'],
    shoulders: ['scrap', 'hide'], gloves: ['scrap', 'hide'],
    amulet: ['crystal', 'essence'], bag: ['hide', 'scrap'], leash: ['hide', 'scrap'], compass: ['ore', 'crystal'], ranged: ['ore', 'scrap'],
  };

  // Повышение уровня предмета на 1: ресурсы ТЕКУЩЕГО цвета + монеты. null — уровень максимальный.
  function upgradeCost(entry) {
    const it = item(entry);
    if (!it || it.tier >= T.MAX) return null;
    const t = it.tier, kinds = FORGE_KINDS[it.type];
    return {
      coins: Math.round((priceAt(it.base.cost, t + 1) - it.price) * 0.35),
      res: [{ kind: kinds[0], tier: t, n: 3 + t }, { kind: kinds[1], tier: t, n: 2 + Math.floor(t / 2) }],
    };
  }

  // Создание вещи цвета tier из ресурсов того же цвета (дешевле покупки, но нужны ресурсы).
  function craftCost(baseId, tier = 1) {
    const b = BY_ID[baseId], t = T.clamp(tier);
    const n = { common: 4, rare: 8, epic: 14 }[b.rarity];
    const kinds = FORGE_KINDS[b.type];
    return { coins: Math.round(b.cost * 10 * 0.5 * T.PRICE_MULT[t - 1]), res: [{ kind: kinds[0], tier: t, n }, { kind: kinds[1], tier: t, n: Math.ceil(n / 2) }] };
  }

  // Расходуемые вещи ранца. price — цена для героя 1-го уровня; дальше растёт вместе с доходом (Hero.priceScale).
  const CONSUMABLES = {
    potion: { name: _t("Зелье здоровья"), price: 50, desc: _t("Мгновенно лечит на 18% максимума ХП. Ход не тратится.") },
    elixir: { name: _t("Боевой настой"), price: 150, desc: _t("+35% к урону до конца хода. Ход не тратится.") },
    dust:   { name: _t("Каменная пыль"), price: 80, desc: _t("Даёт по 3 сапфира, рубина и изумруда. Ход не тратится.") },
    scroll: { name: _t("Свиток спешки"), price: 120, desc: _t("Ваш следующий ход даст дополнительный ход. Ход не тратится.") },
    luck:   { name: _t("Свиток удачи"), price: 220, desc: _t("Используйте один раз за бой: +50% к монетам и ресурсам с этой победы. Ход не тратится.") },
    honeyjar: { name: _t("Банка мёда"), price: 180, desc: _t("Наугад: либо мгновенно +25% к максимуму ХП до конца боя, либо гарантированно блокирует следующий удар по вам. Ход не тратится.") },
    // 1.3.0: только у Алхимика (в Лавке не продаются)
    storm: { name: _t("Зелье грозы"), price: 260, alchemy: true, desc: _t("Бесплатно включает Шаровую молнию на этот ход: каждый собранный камень бьёт ×1,5. Ход не тратится.") },
    stoneskin: { name: _t("Каменная кожа"), price: 240, alchemy: true, desc: _t("Повышает вашу Броню на 25 до конца боя (общий потолок Брони сохраняется). Ход не тратится.") },
  };

  // Цена покупки n штук по единичной цене unitPrice (используется Лавкой для покупки расходников/ресурсов
  // партиями — ×1/×5/×10/×25). Чистая функция: сама цена расходника/ресурса не меняется, только сумма за n штук.
  const bulkPrice = (unitPrice, n) => Math.round(unitPrice) * Math.max(1, Math.round(n));

  return {
    itemsFor, SLOTS, SLOT_NAMES, STAT_NAMES, TYPE_NAMES, RARITY_NAMES, SETS, ITEMS, CONSUMABLES, FORGE_KINDS,
    MAX_DEFENSE, CAPS, NEUTRAL_COLOR, item, makeEntry, entryKey, priceAt, sellValue, junkValue, emptyLoadout, shotKind, shotMult, fits, canEquip, equip, unequip,
    equipped, totalCost, setProgress, stats, statsFor, combine, blankStats, spellCost, weaponPerk, randomLoadout, upgradeCost, craftCost, bulkPrice,
  };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Gear;
