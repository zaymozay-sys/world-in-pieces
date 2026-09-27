/* Предметы, сеты и подсчёт характеристик (без интерфейса — можно тестировать в Node).

   Характеристики (у каждого предмета свой набор):
     power      — Сила: +% к наносимому урону
     health     — Здоровье: + к максимуму ХП
     defense    — Броня: −% к получаемому урону (максимум 60%)
     magic      — Магия: каждые 4 очка снижают цену заклинаний на 1 камень каждого вида (минимум 2)
     initiative — Инициатива: +% к шансу первого хода в бою (максимум 50)
     ricochet   — Рикошет: шанс (максимум 40%), что удар отлетит в нападающего; отлетает урон за вычетом брони цели
     block      — Блок: шанс (максимум 50%) полностью заблокировать удар

   Ячейки: правая рука (main), левая рука (off), шлем, нагрудник, наручи, поножи, амулет.
   Типы предметов: weapon1 (одноручное, в любую руку), weapon2 (двуручное, занимает обе руки),
   shield (только в левую руку), head, chest, arms, legs, amulet. */

const T = (typeof Tiers !== 'undefined') ? Tiers : require('./tiers.js');   // уровни-цвета

const Gear = (() => {
  const SLOTS = ['main', 'off', 'head', 'chest', 'arms', 'legs', 'amulet'];
  const SLOT_NAMES = {
    main: 'Правая рука', off: 'Левая рука', head: 'Шлем', chest: 'Нагрудник',
    arms: 'Наручи', legs: 'Поножи', amulet: 'Амулет',
  };
  const STAT_NAMES = { power: 'Сила', health: 'Здоровье', defense: 'Броня', magic: 'Магия', initiative: 'Инициатива', ricochet: 'Рикошет', block: 'Блок' };
  const TYPE_NAMES = {
    weapon1: 'Одноручное оружие', weapon2: 'Двуручное оружие', shield: 'Щит',
    head: 'Шлем', chest: 'Нагрудник', arms: 'Наручи', legs: 'Поножи', amulet: 'Амулет',
  };
  const RARITY_NAMES = { common: 'Обычный', rare: 'Редкий', epic: 'Эпический' };
  const MAX_DEFENSE = 60;
  // Потолки характеристик (не «ломают» бой)
  const CAPS = { defense: 60, initiative: 50, ricochet: 40, block: 50 };

  // Комплекты: бонус действует, когда надето не меньше указанного числа предметов набора.
  const SETS = {
    guard:    { name: 'Страж',    color: '#6aa8e8', bonuses: { 2: { health: 10 }, 3: { defense: 6, block: 3 }, 4: { health: 20, defense: 6 }, 5: { power: 10, block: 5 } } },
    berserk:  { name: 'Берсерк',  color: '#e0605a', bonuses: { 2: { power: 5 }, 3: { power: 5, health: 5 }, 4: { power: 8, initiative: 4 }, 5: { health: 10, power: 5 }, 6: { power: 12, ricochet: 4 } } },
    mage:     { name: 'Чародей',  color: '#b58cff', bonuses: { 2: { magic: 1 }, 3: { magic: 1, ricochet: 3 }, 4: { magic: 1, power: 6 }, 5: { magic: 1, defense: 4 }, 6: { magic: 2, power: 8, ricochet: 4 } } },
    // Наборы фракций: надеть может только своя фракция.
    crown:    { name: 'Корона',   color: '#4a7fe0', faction: 'human',  bonuses: { 2: { initiative: 4 }, 3: { power: 5, block: 3 }, 4: { health: 15 }, 5: { power: 8, initiative: 4 } } },
    rune:     { name: 'Руна',     color: '#d08a3a', faction: 'dwarf',  bonuses: { 2: { defense: 4 }, 3: { block: 4, health: 8 }, 4: { defense: 5, power: 5 }, 5: { block: 6, health: 12 } } },
    grove:    { name: 'Роща',     color: '#3fae63', faction: 'elf',    bonuses: { 2: { initiative: 5 }, 3: { ricochet: 4, magic: 1 }, 4: { initiative: 5, power: 5 }, 5: { ricochet: 5, magic: 1 } } },
    scale:    { name: 'Чешуя',    color: '#c9573c', faction: 'lizard', bonuses: { 2: { health: 10 }, 3: { power: 5, ricochet: 3 }, 4: { health: 15, block: 3 }, 5: { power: 8, health: 10 } } },
    wanderer: { name: 'Странник', color: '#5fc98a', bonuses: { 2: { health: 6, initiative: 3 }, 3: { defense: 3, power: 3 }, 4: { health: 10, magic: 1, initiative: 4 }, 5: { power: 6, block: 3 }, 6: { health: 12, power: 6, defense: 4 } } },
  };
  const NEUTRAL_COLOR = '#a9adb8';

  // id, название, тип, набор, редкость, характеристики[, фракция]
  const RAW = [
    // --- Корона (люди): знаменосцы Вольных городов ---
    ['crown-sword',  'Меч знаменосца',      'weapon1', 'crown', 'rare',   { power: 9, initiative: 3 }, 'human'],
    ['crown-shield', 'Геральдический щит',  'shield',  'crown', 'rare',   { defense: 6, block: 7 }, 'human'],
    ['crown-head',   'Шлем с плюмажем',     'head',    'crown', 'common', { health: 7, defense: 2, initiative: 2 }, 'human'],
    ['crown-chest',  'Бригантина',          'chest',   'crown', 'rare',   { health: 12, defense: 4, block: 2 }, 'human'],
    ['crown-amulet', 'Печать гильдии',      'amulet',  'crown', 'epic',   { initiative: 4, magic: 1, health: 4 }, 'human'],
    // --- Руна (гномы): кованое железо с рунами ---
    ['rune-hammer',  'Рунный молот',        'weapon2', 'rune',  'epic',   { power: 20, defense: 3 }, 'dwarf'],
    ['rune-head',    'Рунный шлем',         'head',    'rune',  'common', { defense: 4, health: 6 }, 'dwarf'],
    ['rune-chest',   'Рунная кираса',       'chest',   'rune',  'rare',   { defense: 6, health: 10 }, 'dwarf'],
    ['rune-arms',    'Рунные наручи',       'arms',    'rune',  'rare',   { block: 5, defense: 2 }, 'dwarf'],
    ['rune-legs',    'Кованые сапоги',      'legs',    'rune',  'common', { defense: 4, health: 7, block: 2 }, 'dwarf'],
    // --- Роща (эльфы): лук, листья и живое дерево ---
    ['grove-bow',    'Длинный лук',         'weapon2', 'grove', 'epic',   { power: 14, initiative: 6 }, 'elf'],
    ['grove-head',   'Венец листьев',       'head',    'grove', 'common', { magic: 1, initiative: 5, ricochet: 1, health: 3 }, 'elf'],
    ['grove-chest',  'Плащ из листьев',     'chest',   'grove', 'rare',   { health: 10, ricochet: 3, initiative: 2 }, 'elf'],
    ['grove-legs',   'Мягкие сапоги',       'legs',    'grove', 'common', { initiative: 5, defense: 1 }, 'elf'],
    ['grove-amulet', 'Семя древа',          'amulet',  'grove', 'rare',   { magic: 2, health: 6, ricochet: 2 }, 'elf'],
    // --- Чешуя (ящеры): панцири, кости и яд ---
    ['scale-blade',  'Ядовитый клинок',     'weapon1', 'scale', 'rare',   { power: 10, ricochet: 2 }, 'lizard'],
    ['scale-shield', 'Щит из панциря',      'shield',  'scale', 'common', { defense: 5, block: 5, health: 4 }, 'lizard'],
    ['scale-chest',  'Чешуйчатый доспех',   'chest',   'scale', 'rare',   { health: 14, defense: 4 }, 'lizard'],
    ['scale-arms',   'Костяные наручи',     'arms',    'scale', 'common', { power: 4, block: 3 }, 'lizard'],
    ['scale-amulet', 'Клык змея',           'amulet',  'scale', 'epic',   { power: 6, ricochet: 3 }, 'lizard'],
    // --- Страж (защита и здоровье) ---
    ['guard-head',  'Шлем стража',      'head',   'guard', 'common', { health: 8, defense: 3, block: 2 }],
    ['guard-chest', 'Кираса стража',    'chest',  'guard', 'common', { health: 15, defense: 5, ricochet: 2 }],
    ['guard-arms',  'Наручи стража',    'arms',   'guard', 'common', { defense: 3, block: 3, power: 2 }],
    ['guard-legs',  'Поножи стража',    'legs',   'guard', 'rare',   { health: 10, defense: 4, initiative: 2 }],
    ['guard-shield','Щит стража',       'shield', 'guard', 'rare',   { defense: 6, block: 10, health: 4 }],
    // --- Берсерк (сила) ---
    ['berserk-axe',   'Топор берсерка',     'weapon2', 'berserk', 'rare',   { power: 22, initiative: 2 }],
    ['berserk-head',  'Шлем берсерка',      'head',    'berserk', 'common', { power: 4, health: 4, initiative: 3 }],
    ['berserk-chest', 'Кираса берсерка',    'chest',   'berserk', 'rare',   { power: 5, health: 10, ricochet: 2 }],
    ['berserk-arms',  'Наручи берсерка',    'arms',    'berserk', 'rare',   { power: 6, initiative: 2 }],
    ['berserk-legs',  'Поножи берсерка',    'legs',    'berserk', 'rare',   { power: 3, health: 6, initiative: 4 }],
    ['berserk-amulet','Амулет ярости',      'amulet',  'berserk', 'epic',   { power: 10, ricochet: 4, health: 5 }],
    // --- Чародей (магия) ---
    ['mage-staff',  'Посох чародея',    'weapon2', 'mage', 'rare',   { magic: 4, power: 10, initiative: 2 }],
    ['mage-head',   'Колпак чародея',   'head',    'mage', 'common', { magic: 1, health: 5, initiative: 2 }],
    ['mage-chest',  'Мантия чародея',   'chest',   'mage', 'rare',   { magic: 2, health: 10, defense: 2, ricochet: 3 }],
    ['mage-arms',   'Наручи чародея',   'arms',    'mage', 'epic',   { magic: 2, power: 4, block: 2 }],
    ['mage-legs',   'Поножи чародея',   'legs',    'mage', 'rare',   { magic: 2, defense: 2, initiative: 3 }],
    ['mage-amulet', 'Кристалл чародея', 'amulet',  'mage', 'epic',   { magic: 3, health: 8, ricochet: 5 }],
    // --- Странник (баланс) ---
    ['wand-dagger', 'Кинжал странника',   'weapon1', 'wanderer', 'common', { power: 8, initiative: 4 }],
    ['wand-blade',  'Клинок странника',   'weapon1', 'wanderer', 'rare',   { power: 10, defense: 1, block: 3 }],
    ['wand-head',   'Капюшон странника',  'head',    'wanderer', 'common', { health: 6, power: 2, initiative: 3 }],
    ['wand-chest',  'Плащ странника',     'chest',   'wanderer', 'common', { health: 12, defense: 3, block: 2 }],
    ['wand-legs',   'Сапоги странника',   'legs',    'wanderer', 'common', { health: 8, defense: 2, magic: 1, initiative: 4 }],
    ['wand-amulet', 'Талисман странника', 'amulet',  'wanderer', 'rare',   { health: 10, magic: 1, ricochet: 3 }],
    // --- Без набора ---
    ['sword-novice', 'Меч новичка',       'weapon1', null, 'common', { power: 6 }],
    ['club',         'Дубина',            'weapon1', null, 'common', { power: 7, health: 3 }],
    ['sword-two',    'Двуручный меч',     'weapon2', null, 'rare',   { power: 18, block: 2 }],
    ['hammer',       'Тяжёлый молот',     'weapon2', null, 'epic',   { power: 28, health: 6 }],
    ['shield-wood',  'Деревянный щит',    'shield',  null, 'common', { defense: 5, block: 5 }],
    ['leather-head', 'Кожаный шлем',      'head',    null, 'common', { health: 5, defense: 1 }],
    ['leather-chest','Кожаная куртка',    'chest',   null, 'common', { health: 8, defense: 2 }],
    ['leather-arms', 'Кожаные наручи',    'arms',    null, 'common', { defense: 2, block: 1 }],
    ['leather-legs', 'Кожаные поножи',    'legs',    null, 'common', { health: 5, defense: 1, initiative: 1 }],
    ['amulet-copper','Медный амулет',     'amulet',  null, 'common', { health: 6, block: 1 }],
    ['amulet-power', 'Амулет силы',       'amulet',  null, 'rare',   { power: 8, ricochet: 2 }],
    ['amulet-spark', 'Амулет искры',      'amulet',  null, 'rare',   { magic: 2, initiative: 2 }],
  ];

  // Цена предмета в очках снаряжения — считается из его характеристик.
  const costOf = (s) => Math.round((s.power || 0) + (s.health || 0) * 0.5 + (s.defense || 0) * 1.5 + (s.magic || 0) * 4
    + (s.initiative || 0) * 2 + (s.ricochet || 0) * 2.5 + (s.block || 0) * 2);

  const ITEMS = RAW.map(([id, name, type, set, rarity, stats, faction]) => ({ id, name, type, set, rarity, stats, faction: faction || null, cost: costOf(stats) }));
  // Вещи, доступные фракции: общие + её собственные.
  const itemsFor = (faction) => ITEMS.filter((i) => !i.faction || i.faction === faction);
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
    };
  }

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
    if (!it) return { ok: false, reason: 'Неизвестный предмет' };
    if (it.faction && faction && it.faction !== faction) return { ok: false, reason: 'Эта вещь только для своей фракции' };
    if (level && typeof Hero !== 'undefined' && !Hero.canWear(it.tier, level)) return { ok: false, reason: `Эту вещь можно надеть с ${Hero.itemLevel(it.tier)}-го уровня` };
    if (!fits(slot, it.type)) return { ok: false, reason: 'Этот предмет сюда не подходит' };
    const main = item(gear.main);
    if (slot === 'off' && main && main.type === 'weapon2') return { ok: false, reason: 'В правой руке двуручное оружие' };
    // один и тот же предмет нельзя надеть в две ячейки
    for (const s of SLOTS) if (s !== slot && gear[s] && entryKey(gear[s]) === entryKey(entry)) return { ok: false, reason: 'Этот предмет уже надет' };
    return { ok: true };
  }

  // Новое снаряжение после надевания. Двуручное оружие освобождает левую руку.
  function equip(gear, entry, slot) {
    const next = { ...gear, [slot]: entry };
    if (slot === 'main' && item(entry).type === 'weapon2') next.off = null;
    return next;
  }

  function unequip(gear, slot) { return { ...gear, [slot]: null }; }

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

  const blankStats = () => ({ power: 0, health: 0, defense: 0, magic: 0, initiative: 0, ricochet: 0, block: 0 });
  const capStats = (s) => { for (const k in CAPS) s[k] = Math.max(0, Math.min(CAPS[k], s[k])); return s; };

  // Итоговые характеристики: предметы + бонусы наборов.
  function stats(gear) {
    const s = blankStats();
    for (const it of equipped(gear)) for (const k in it.stats) s[k] += it.stats[k];
    for (const p of setProgress(gear)) for (const a of p.active) for (const k in a.bonus) s[k] += a.bonus[k];
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
    const order = ['main', 'chest', 'head', 'legs', 'arms', 'amulet', 'off'].sort(() => rand() - 0.5);
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
    amulet: ['crystal', 'essence'],
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
    potion: { name: 'Зелье здоровья', price: 50, desc: 'Мгновенно лечит на 30% максимума ХП. Ход не тратится.' },
    elixir: { name: 'Эликсир силы', price: 150, desc: '+50% к урону на 3 хода. Ход не тратится.' },
    dust:   { name: 'Каменная пыль', price: 80, desc: 'Даёт по 3 сапфира, рубина и изумруда. Ход не тратится.' },
    scroll: { name: 'Свиток спешки', price: 120, desc: 'Ваш следующий ход даст дополнительный ход. Ход не тратится.' },
  };

  return {
    itemsFor, SLOTS, SLOT_NAMES, STAT_NAMES, TYPE_NAMES, RARITY_NAMES, SETS, ITEMS, CONSUMABLES, FORGE_KINDS,
    MAX_DEFENSE, CAPS, NEUTRAL_COLOR, item, makeEntry, entryKey, priceAt, sellValue, emptyLoadout, fits, canEquip, equip, unequip,
    equipped, totalCost, setProgress, stats, combine, blankStats, spellCost, randomLoadout, upgradeCost, craftCost,
  };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Gear;
