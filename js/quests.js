if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Задания от собеседников в зданиях деревни: трактирщик-гоблин в Таверне и мышь на Мельнице.
   Каждое задание нужно сперва ВЗЯТЬ («Взять задание») — до этого прогресс не считается, даже если
   условие уже выполнено на момент разговора. После взятия прогресс проверяется по профилю игрока
   (Profile.data) как обычно; получить награду (деньги, вещь или расходники) можно, когда цель
   достигнута. Взятые задания хранятся в Profile.data.accepted[id], полученные — в Profile.data.quests[id]
   (и то и другое можно сделать только один раз). Поле giver ('tavern' | 'mill') — просто для фильтрации
   в нужном экране, id остаются едиными и уникальными для обоих собеседников. */

const Q_H = (typeof Hero !== 'undefined') ? Hero : require('./hero.js');

const Quests = (() => {
  const bestiaryCount = (d) => Object.keys(d.bestiary || {}).length;
  const resourceSum = (d) => Object.values(d.resources || {}).reduce((s, n) => s + n, 0);
  const resourceKinds = (d) => new Set(Object.keys(d.resources || {}).map((k) => k.split(':')[0])).size;
  const chestsOpened = (d) => (d.chestOpened ? 1 : 0) + Object.keys(d.xchests || {}).filter((k) => k !== 'obsidian' && d.xchests[k]).length;
  const seenCount = (d) => Object.keys(d.seen || {}).length;
  const itemCount = (d) => (d.items || []).length;
  const levelOf = (d) => Q_H.levelOf(d.xp || 0).level;

  const LIST = [
    // ---------- Таверна: гоблин-трактирщик ----------
    {
      id: 'first-blood',
      giver: 'tavern',
      title: _t("Первая кровь"),
      desc: _t("Победите любое существо в бою — покажите, что не зря забрели в наши края."),
      need: (d) => d.wins || 0,
      goal: 1,
      reward: { coins: 60 },
      rewardText: _t("60 медных монет"),
    },
    {
      id: 'amulet',
      giver: 'tavern',
      title: _t("Оберег в дорогу"),
      desc: _t("Наденьте амулет — в бою без него как без второй руки. Купите в лавке или найдите в бою."),
      need: (d) => (d.loadout && d.loadout.amulet ? 1 : 0),
      goal: 1,
      reward: { coins: 80 },
      rewardText: _t("80 медных монет"),
    },
    {
      id: 'bestiary-3',
      giver: 'tavern',
      title: _t("Гроза бестиария"),
      desc: _t("Победите три разных вида существ — узнайте, с кем вообще имеете дело в здешних краях."),
      need: bestiaryCount,
      goal: 3,
      reward: { item: 'amulet-copper' },
      rewardText: _t("Медный амулет"),
    },
    {
      id: 'resources-10',
      giver: 'tavern',
      title: _t("Запасливый"),
      desc: _t("Соберите 10 единиц любых ресурсов с побеждённых существ — в хозяйстве пригодится всё."),
      need: resourceSum,
      goal: 10,
      reward: { coins: 40, cons: { scroll: 2 } },
      rewardText: _t("40 монет и 2 свитка спешки"),
    },
    {
      id: 'veteran',
      giver: 'tavern',
      title: _t("Проверено боем"),
      desc: _t("Победите в шести боях — тогда и поговорим всерьёз."),
      need: (d) => d.wins || 0,
      goal: 6,
      reward: { cons: { elixir: 1, potion: 2 } },
      rewardText: _t("Боевой настой и 2 зелья здоровья"),
    },

    // ---------- Мельница: добрый мышь ----------
    {
      id: 'level-2',
      giver: 'mill',
      title: _t("Второй уровень"),
      desc: _t("Наберите опыта до второго уровня — мышь верит, что сила растёт понемногу, зерно к зерну."),
      need: (d) => (levelOf(d) >= 2 ? 1 : 0),
      goal: 1,
      reward: { coins: 100 },
      rewardText: _t("100 медных монет"),
    },
    {
      id: 'collector',
      giver: 'mill',
      title: _t("Мышиные запасы"),
      desc: _t("Накопите десять вещей в ранце и на себе — мышь обожает, когда у соседей полно добра про запас."),
      need: itemCount,
      goal: 10,
      reward: { cons: { dust: 2 } },
      rewardText: _t("2 порции каменной пыли"),
    },
    {
      id: 'resource-kinds',
      giver: 'mill',
      title: _t("Разносол"),
      desc: _t("Соберите ресурсы трёх разных видов — не важно сколько, а сколько видов."),
      need: resourceKinds,
      goal: 3,
      reward: { coins: 70, cons: { scroll: 1 } },
      rewardText: _t("70 монет и свиток спешки"),
    },
    {
      id: 'ten-wins',
      giver: 'mill',
      title: _t("Десять побед"),
      desc: _t("Победите в десяти боях — мышь считает зарубки на балке."),
      need: (d) => d.wins || 0,
      goal: 10,
      reward: { item: 'amulet-power' },
      rewardText: _t("Амулет силы"),
    },
    {
      id: 'scout',
      giver: 'mill',
      title: _t("Кто бродит вокруг"),
      desc: _t("Заметьте на карте пять разных видов существ — мышь сама носа за частокол не сунет, но обожает слушать про тех, кого вы видели."),
      need: seenCount,
      goal: 5,
      reward: { cons: { potion: 2, elixir: 1 } },
      rewardText: _t("2 зелья здоровья и эликсир силы"),
    },
  ];

  // Заглушка: ниже добавляются поручения тюленя-смотрителя маяка (giver 'lighthouse'); последнее выдаёт ключ от сундука.
  LIST.push(
    { id: 'lh-scout', giver: 'lighthouse', title: _t("Дальний обзор"), desc: _t("Заметьте на карте восемь разных видов существ — смотритель любит знать, кто бродит у берега."),
      need: seenCount, goal: 8, reward: { coins: 150 }, rewardText: _t("150 медных монет") },
    { id: 'lh-wins', giver: 'lighthouse', title: _t("Огонь не гаснет"), desc: _t("Победите в двадцати боях — береговая нечисть не должна подбираться к маяку."),
      need: (d) => d.wins || 0, goal: 20, reward: { cons: { potion: 3, elixir: 2 } }, rewardText: _t("3 зелья здоровья и 2 эликсира силы") },
    { id: 'lh-level', giver: 'lighthouse', title: _t("Крепкие ноги"), desc: _t("Дорастите героя до восьмого уровня — к кораблю ведёт долгая дорога."),
      need: (d) => (levelOf(d) >= 8 ? 1 : 0), goal: 1, reward: { coins: 300 }, rewardText: _t("300 медных монет") },
    { id: 'lh-three', giver: 'lighthouse', title: _t("Три цветных сундука"), desc: _t("Откройте все три сундука на берегу — сапфировый у бригантины, рубиновый на восточных камнях и изумрудный у маяка. Ключи: у меня, у старьёвщика и у алхимика."),
      need: (d) => chestsOpened(d), goal: 3, reward: { coins: 300 }, rewardText: _t("300 медных монет") },
    { id: 'lh-diary', giver: 'lighthouse', title: _t("Дневник капитана"), desc: _t("Победите Капитана: он носит с собой «Морской дневник» — в нём записано, как дышать под водой и где лежит серебряный сундук."),
      need: (d) => ((d.bestiary && d.bestiary.captain && d.bestiary.captain.wins) ? 1 : 0), goal: 1, reward: { diary: true }, rewardText: _t("«Морской дневник» (рецепт для алхимика)") },
    { id: 'jk-keyshard', giver: 'junker', title: _t("Ржавый ключ"), desc: _t("Продайте мне десять ненужных вещей — из рухляди я сгребу ключ от рубинового сундука на восточных камнях."),
      need: (d) => d.junkSold || 0, goal: 10, reward: { keyRuby: true }, rewardText: _t("Ключ от рубинового сундука") },
    { id: 'lh-key', giver: 'lighthouse', title: _t("Ключ от сундука"), desc: _t("Победите десять разных видов существ — и тюлень отдаст ключ от запертого сундука на восточном берегу, возле бригантины."),
      need: bestiaryCount, goal: 10, reward: { key: true }, rewardText: _t("Ключ от сундука у бригантины") },
  );

  // Список заданий с текущим прогрессом. data — Profile.data (или похожий объект в тестах).
  // giver — необязательный фильтр ('tavern' | 'mill'); без него возвращаются все задания.
  function list(data, giver) {
    return LIST.filter((q) => !giver || q.giver === giver).map((q) => {
      const value = Math.min(q.need(data) || 0, q.goal);
      const claimed = !!(data.quests && data.quests[q.id]);
      const accepted = claimed || !!(data.accepted && data.accepted[q.id]);
      return { ...q, value, done: value >= q.goal, claimed, accepted };
    });
  }

  function find(id) { return LIST.find((q) => q.id === id) || null; }

  function isAccepted(data, id) {
    return !!(data.quests && data.quests[id]) || !!(data.accepted && data.accepted[id]);
  }

  // Взять задание — до этого его прогресс не показывается и наградить нельзя. true — взято.
  function canAccept(data, id) {
    return !!find(id) && !isAccepted(data, id);
  }
  function accept(id) {
    if (typeof Profile === 'undefined') return false;
    const data = Profile.data;
    if (!canAccept(data, id)) return false;
    data.accepted = data.accepted || {};
    data.accepted[id] = true;
    Profile.save();
    return true;
  }

  function canClaim(data, id) {
    const q = find(id);
    if (!q) return false;
    if (data.quests && data.quests[id]) return false;
    if (!isAccepted(data, id)) return false;
    return (q.need(data) || 0) >= q.goal;
  }

  // Выдаёт награду через Profile/Gear (глобалы браузера) и помечает задание полученным. true — выдано.
  function claim(id) {
    if (typeof Profile === 'undefined') return false;
    const data = Profile.data;
    if (!canClaim(data, id)) return false;
    const q = find(id), r = q.reward;
    if (r.key) data.chestKey = true;
    if (r.keyRuby) { data.xkeys = data.xkeys || {}; data.xkeys.ruby = true; }
    if (r.diary) data.diary = true;
    if (r.coins) Profile.addCoins(r.coins);
    if (r.item) Profile.addItem(Gear.makeEntry(r.item, 1));
    if (r.cons) for (const [k, n] of Object.entries(r.cons)) Profile.addConsumable(k, n);
    data.quests = data.quests || {};
    data.quests[id] = true;
    Profile.save();
    return true;
  }

  return { LIST, list, find, canAccept, accept, canClaim, claim };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Quests;
