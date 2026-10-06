if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Фракции игрока (без интерфейса — можно тестировать в Node).

   Мир «Грань»: когда-то Великий кристалл раскололся, его осколки — камни на поле боя,
   и народы спорят за них. У каждой фракции:
     gem     — родной камень: собирая его, вы заряжаете приём фракции;
     stats   — врождённые бонусы к характеристикам (складываются со снаряжением);
     perks   — бонусы вне боя: shop — множитель цен в лавке, coins — множитель монет с добычи,
               forge — множитель цены работы кузницы (в монетах);
     ability — приём фракции в бою: заряжается родными камнями, ход не тратит;
     figure  — какой фигурой рисуется герой (без пола — пол добавляется отдельно, см. heroKind),
     hero/heroF — звание героя, мужской и женский вариант. */

const Factions = (() => {
  // Сколько родных камней (с учётом номиналов и бонусов линии) нужно на приём — см. balance.js.
  const CHARGE = (typeof Balance !== 'undefined') ? Balance.faction.charge : 15;

  const LIST = {
    human: {
      name: _t("Люди"), people: _t("Вольные города"), hero: _t("Странствующий рыцарь"), heroF: _t("Странствующая всадница"), figure: 'human',
      color: '#4a7fe0', gem: 'sapphire',
      desc: _t("Торговцы и рыцари Вольных городов. Умеют договориться и повести за собой."),
      stats: { initiative: 6, block: 5 },
      perks: { shop: 0.9, coins: 1.1 },
      perkText: _t("Лавка дешевле на 10%, монет с добычи на 10% больше"),
      ability: { id: 'banner', name: _t("Знамя"), desc: _t("+50% к урону на 3 ваших хода") },
    },
    dwarf: {
      name: _t("Гномы"), people: _t("Подгорные кланы"), hero: _t("Старый боевой гном"), heroF: _t("Старая боевая гномка"), figure: 'dwarf',
      color: '#d08a3a', gem: 'onyx',
      desc: _t("Рунные кузнецы и воины гор. Крепкие, как камень, из которого вырублены их залы."),
      stats: { defense: 4, block: 4 },
      perks: { forge: 0.85 },
      perkText: _t("Работа кузницы дешевле на 15%"),
      ability: { id: 'hammer', name: _t("Рунный молот"), desc: _t("Три случайных камня становятся обсидианом x3") },
    },
    elf: {
      name: _t("Эльфы"), people: _t("Лесные дома"), hero: _t("Лесной лучник"), heroF: _t("Лесная лучница"), figure: 'elf',
      color: '#3fae63', gem: 'emerald',
      desc: _t("Лучники и друиды древних лесов. Быстры и неуловимы."),
      stats: { initiative: 10, ricochet: 4 },
      perks: {},
      perkText: _t("Чаще ходят первыми, удары чаще отлетают обратно"),
      ability: { id: 'growth', name: _t("Дикий рост"), desc: _t("Выберите камень: он и два соседних прорастают изумрудами x3 (с 10-го уровня — x5), готовые линии собираются сразу") },
    },
    lizard: {
      name: _t("Ящеры"), people: _t("Болотные племена"), hero: _t("Ящер-следопыт"), heroF: _t("Ящерица-следопыт"), figure: 'lizard',
      color: '#c9573c', gem: 'ruby',
      desc: _t("Охотники топей с толстой чешуёй и ядовитыми клинками."),
      stats: { health: 5, power: 4 },
      perks: {},
      perkText: _t("Толстая чешуя: больше здоровья и силы"),
      ability: { id: 'venom', name: _t("Ядовитый укус"), desc: _t("Яд: противник теряет здоровье в начале каждого из 3 своих ходов") },
    },
  };
  const ORDER = ['human', 'dwarf', 'elf', 'lizard'];

  const get = (id) => LIST[id] || null;
  // Код фигуры для графики героя: «народ-пол» (см. art.js), например «dwarf-f».
  const heroKind = (id, gender) => { const f = LIST[id]; return f ? `${f.figure}-${gender === 'f' ? 'f' : 'm'}` : null; };
  // Звание героя с учётом пола (по умолчанию — мужской вариант).
  const heroTitle = (id, gender) => { const f = LIST[id]; return f ? (gender === 'f' ? f.heroF : f.hero) : ''; };
  // Врождённые бонусы фракции растут с уровнем героя, как характеристики вещей его цвета:
  // Здоровье — как ХП, Сила — умеренно, шансы — медленно. tf — «дробный цвет» уровня (Hero.tierFloat).
  function statsAt(id, tf = 1) {
    const f = LIST[id], out = {};
    if (!f || typeof Tiers === 'undefined') return f ? { ...f.stats } : {};
    const T = { health: Tiers.GROWTH, power: Tiers.POWER_MULT, magic: Tiers.POWER_MULT };
    for (const [k, v] of Object.entries(f.stats)) out[k] = Math.round(v * Tiers.at(T[k] || Tiers.PCT_MULT, tf));
    return out;
  }
  // Бонус вне боя (по умолчанию 1 — без изменений).
  const perk = (id, key) => { const f = LIST[id]; return (f && f.perks[key]) || 1; };
  // Урон яда за один ход: растёт с Силой отравителя.
  const venomTick = (power, dmg = 1) => Math.ceil(((typeof Balance !== 'undefined') ? Balance.faction.venom.base : 3) * dmg * (1 + power / 100));

  return { LIST, ORDER, CHARGE, get, heroKind, heroTitle, statsAt, perk, venomTick };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Factions;
