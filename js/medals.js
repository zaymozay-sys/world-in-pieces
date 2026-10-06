if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Медали: аккаунтная коллекция наград за (а) первую победу над каждым видом бестиария и (б) круглые
   вехи собранных за все бои линий из 5 камней подряд. Каждая медаль даёт небольшой, но НАВСЕГДА
   постоянный бонус характеристики — заметно меньше, чем даёт вещь того же цвета, чтобы десяток-другой
   медалей не перевешивал обычную прокачку снаряжением (см. js/balance.js: budget растёт с уровнем
   в разы быстрее). Чистая логика без интерфейса — можно тестировать в Node (см. js/daily.js — тот же приём).

   Хранится в Profile.data.medals = { earned: [{ id, tier }], fiveStreaks: 0 }:
     earned      — список уже полученных медалей; tier — цвет героя на момент получения (для свечения медали);
     fiveStreaks — сколько всего линий из 5 камней собрано игроком за все бои (для вех). */

const ME_B = (typeof Bestiary !== 'undefined') ? Bestiary : require('./bestiary.js');
const ME_G = (typeof Gear !== 'undefined') ? Gear : require('./items.js');

const Medals = (() => {
  // Медаль за первую победу над видом. Характеристика подобрана по духу монстра — понемногу разных
  // приёмов, чтобы коллекция медалей давала не один раздутый стат, а всестороннюю прибавку.
  const KILL_STAT = {
    rat: 'initiative', wolf: 'power', bandit: 'block', goblin: 'magic', skeleton: 'defense',
    boar: 'power', troll: 'health', golem: 'defense', wraith: 'ricochet', dragon: 'fury',
    orc: 'power', orcShaman: 'magic', ghoul: 'health', crab: 'block', bolotnik: 'ricochet',
    shadow: 'fury', treant: 'defense', mushroom: 'initiative',
  };
  // Небольшой фиксированный бонус за медаль (в единицах той же характеристики, что и у вещей — см. items.js).
  const KILL_AMOUNT = { power: 1, health: 3, defense: 1, magic: 1, initiative: 1, ricochet: 1, block: 1, fury: 1 };
  const killMedalId = (species) => 'kill:' + species;
  const killSpecies = (id) => (id.startsWith('kill:') ? id.slice(5) : null);

  // Заслужена ли медаль за первую победу над видом. killCounts — Profile.data.bestiary (вид → { wins, tier }).
  // Возвращает id медали, если она положена и ещё не получена, иначе null.
  function checkKillMedal(species, killCounts, earned = []) {
    if (!ME_B.MONSTERS[species]) return null;
    const rec = killCounts && killCounts[species];
    if (!rec || rec.wins < 1) return null;
    const id = killMedalId(species);
    return earned.some((m) => m.id === id) ? null : id;
  }

  // Растущая серия вех по числу собранных за все бои линий из 5 камней — тот же дух, что у чисел
  // ежедневной лотереи и заданий (js/daily.js, js/quests.js): не слишком часто, но и не годами ждать.
  const STREAK_MILESTONES = [50, 150, 300, 600, 1000, 1750, 3000];
  const streakMedalId = (n) => 'streak:' + n;

  // Заслужена ли следующая веха. Возвращает id самой младшей ещё не полученной вехи, которая уже достигнута,
  // либо null. total — Profile.data.medals.fiveStreaks (счётчик всех собранных линий из 5 камней).
  function checkFiveStreakMedal(total, earned = []) {
    for (const n of STREAK_MILESTONES) {
      const id = streakMedalId(n);
      if (total >= n && !earned.some((m) => m.id === id)) return id;
    }
    return null;
  }

  // Растущая серия вех для убийств заклинанием Удар (см. js/combat.js/js/game.js: Удар — универсальное
  // заклинание всех фракций, доступное с 1-го уровня, наносящее фиксированный базовый урон героя; когда
  // им добит монстр, засчитывается в эту отдельную серию, не смешиваясь с медалями «первая победа над
  // видом»). Те же по духу вехи, что у похожих «числовых» серий (see STREAK_MILESTONES) — не слишком
  // часто в начале, но и не годами ждать сотую.
  const STRIKE_MILESTONES = [5, 15, 40, 100, 220, 450, 850, 1500, 2500, 4000];
  const strikeMedalId = (n) => 'strike:' + n;

  // Заслужена ли следующая веха убийств Ударом. total — счётчик добиваний Ударом за все бои
  // (см. Profile.data.medals.strikeKills). Возвращает id самой младшей ещё не полученной достигнутой вехи.
  function checkStrikeMedal(total, earned = []) {
    for (const n of STRIKE_MILESTONES) {
      const id = strikeMedalId(n);
      if (total >= n && !earned.some((m) => m.id === id)) return id;
    }
    return null;
  }

  // 1.3.9 «Меткий стрелок»: добивания метательным оружием (болт, лунная стрела). Те же вехи, бонус — Инициатива.
  const SHOT_MILESTONES = [5, 15, 40, 100, 220, 450, 850, 1500, 2500, 4000];
  const shotMedalId = (n) => 'shot:' + n;
  function checkShotMedal(total, earned = []) {
    for (const n of SHOT_MILESTONES) { const id = shotMedalId(n); if (total >= n && !earned.some((m) => m.id === id)) return id; }
    return null;
  }

  // Бонус характеристик одной медали: { стат: значение }.
  function bonusFor(id) {
    const species = killSpecies(id);
    if (species) {
      const stat = KILL_STAT[species] || 'power';
      return { [stat]: KILL_AMOUNT[stat] };
    }
    if (id.startsWith('streak:')) {
      const n = Number(id.slice(7)), idx = Math.max(0, STREAK_MILESTONES.indexOf(n));
      const amt = 2 + idx;                        // дальние вехи редки — награда за них весомее
      return { power: amt, defense: amt };
    }
    if (id.startsWith('strike:')) {
      const n = Number(id.slice(7)), idx = Math.max(0, STRIKE_MILESTONES.indexOf(n));
      const amt = 1 + idx;                        // та же логика, что у streak: дальше веха — весомее награда
      return { fury: amt };
    }
    if (id.startsWith('shot:')) {
      const idx = Math.max(0, SHOT_MILESTONES.indexOf(Number(id.slice(5))));
      return { initiative: 1 + idx };
    }
    return {};
  }

  /* Уровень героя, необходимый, чтобы значок медали id визуально «открылся» полноценным цветом своего тира
     на Стене доблести (см. js/screens.js), даже если игрок уже выполнил условие получения — см.
     docs/balance.md «Стена доблести». Веха/вид даётся раньше, чем открывается её тир-бейдж: тир растёт
     с индексом вехи (дальняя веха — старше тир), а требуемый уровень героя следует тому же шагу, что и
     открытие вещей по цвету (Hero.itemLevel — один цвет тира на каждые 5 уровней героя). */
  function tierUnlockLevel(id) {
    if (killSpecies(id)) return 1;                              // медали за первую победу видны с самого начала
    const list = id.startsWith('streak:') ? STREAK_MILESTONES : id.startsWith('strike:') ? STRIKE_MILESTONES : id.startsWith('shot:') ? SHOT_MILESTONES : null;
    if (!list) return 1;
    const idx = Math.max(0, list.indexOf(Number(id.slice(id.indexOf(':') + 1))));
    return 1 + idx * 5;                                          // тот же шаг «5 уровней на тир», что и у вещей
  }

  // Суммарный бонус всех полученных медалей — combine-совместимый объект характеристик (см. Gear.combine).
  function bonusStats(earned = []) {
    let s = ME_G.blankStats();
    for (const m of earned) s = ME_G.combine(s, bonusFor(m.id));
    return s;
  }

  // Человекочитаемое название медали (для окна медалей).
  function nameFor(id) {
    const species = killSpecies(id);
    if (species) return ME_B.MONSTERS[species] ? _t("Первая победа: {0}", [ME_B.MONSTERS[species].name]) : id;
    if (id.startsWith('streak:')) return _t("{0} линий из 5 камней", [id.slice(7)]);
    if (id.startsWith('strike:')) return _t("{0} добиваний Ударом", [id.slice(7)]);
    if (id.startsWith('shot:')) return _t("{0} добиваний метким выстрелом", [id.slice(5)]);
    return id;
  }

  return { SHOT_MILESTONES, shotMedalId, checkShotMedal, KILL_STAT, KILL_AMOUNT, STREAK_MILESTONES, STRIKE_MILESTONES, killMedalId, killSpecies, streakMedalId,
    strikeMedalId, checkKillMedal, checkFiveStreakMedal, checkStrikeMedal, bonusFor, bonusStats, nameFor, tierUnlockLevel };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Medals;
