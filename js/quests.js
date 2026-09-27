/* Задания от собеседников в зданиях деревни: трактирщик-гоблин в Таверне и мышь на Мельнице.
   Каждое задание — простая цель для новичка, проверяется по профилю игрока (Profile.data), принимать
   отдельно не нужно — собеседник просто перечисляет их в разговоре; получить награду (деньги, вещь
   или расходники) можно, когда цель достигнута. Награду можно забрать только один раз — это помнится
   в Profile.data.quests[id]. Поле giver ('tavern' | 'mill') — просто для фильтрации в нужном экране,
   id остаются едиными и уникальными для обоих собеседников. */

const Q_H = (typeof Hero !== 'undefined') ? Hero : require('./hero.js');

const Quests = (() => {
  const bestiaryCount = (d) => Object.keys(d.bestiary || {}).length;
  const resourceSum = (d) => Object.values(d.resources || {}).reduce((s, n) => s + n, 0);
  const resourceKinds = (d) => new Set(Object.keys(d.resources || {}).map((k) => k.split(':')[0])).size;
  const seenCount = (d) => Object.keys(d.seen || {}).length;
  const itemCount = (d) => (d.items || []).length;
  const levelOf = (d) => Q_H.levelOf(d.xp || 0).level;

  const LIST = [
    // ---------- Таверна: гоблин-трактирщик ----------
    {
      id: 'first-blood',
      giver: 'tavern',
      title: 'Первая кровь',
      desc: 'Победите любое существо в бою — покажите, что не зря забрели в наши края.',
      need: (d) => d.wins || 0,
      goal: 1,
      reward: { coins: 60 },
      rewardText: '60 медных монет',
    },
    {
      id: 'amulet',
      giver: 'tavern',
      title: 'Оберег в дорогу',
      desc: 'Наденьте амулет — в бою без него как без второй руки. Купите в лавке или найдите в бою.',
      need: (d) => (d.loadout && d.loadout.amulet ? 1 : 0),
      goal: 1,
      reward: { coins: 80 },
      rewardText: '80 медных монет',
    },
    {
      id: 'bestiary-3',
      giver: 'tavern',
      title: 'Гроза бестиария',
      desc: 'Победите три разных вида существ — узнайте, с кем вообще имеете дело в здешних краях.',
      need: bestiaryCount,
      goal: 3,
      reward: { item: 'amulet-copper' },
      rewardText: 'Медный амулет',
    },
    {
      id: 'resources-10',
      giver: 'tavern',
      title: 'Запасливый',
      desc: 'Соберите 10 единиц любых ресурсов с побеждённых существ — в хозяйстве пригодится всё.',
      need: resourceSum,
      goal: 10,
      reward: { coins: 40, cons: { scroll: 2 } },
      rewardText: '40 монет и 2 свитка спешки',
    },
    {
      id: 'veteran',
      giver: 'tavern',
      title: 'Проверено боем',
      desc: 'Победите в шести боях — тогда и поговорим всерьёз.',
      need: (d) => d.wins || 0,
      goal: 6,
      reward: { cons: { elixir: 1, potion: 2 } },
      rewardText: 'Эликсир силы и 2 зелья здоровья',
    },

    // ---------- Мельница: добрый мышь ----------
    {
      id: 'level-2',
      giver: 'mill',
      title: 'Второй уровень',
      desc: 'Наберите опыта до второго уровня — мышь верит, что сила растёт понемногу, зерно к зерну.',
      need: (d) => (levelOf(d) >= 2 ? 1 : 0),
      goal: 1,
      reward: { coins: 100 },
      rewardText: '100 медных монет',
    },
    {
      id: 'collector',
      giver: 'mill',
      title: 'Мышиные запасы',
      desc: 'Накопите десять вещей в ранце и на себе — мышь обожает, когда у соседей полно добра про запас.',
      need: itemCount,
      goal: 10,
      reward: { cons: { dust: 2 } },
      rewardText: '2 порции каменной пыли',
    },
    {
      id: 'resource-kinds',
      giver: 'mill',
      title: 'Разносол',
      desc: 'Соберите ресурсы трёх разных видов — не важно сколько, а сколько видов.',
      need: resourceKinds,
      goal: 3,
      reward: { coins: 70, cons: { scroll: 1 } },
      rewardText: '70 монет и свиток спешки',
    },
    {
      id: 'ten-wins',
      giver: 'mill',
      title: 'Десять побед',
      desc: 'Победите в десяти боях — мышь считает зарубки на балке.',
      need: (d) => d.wins || 0,
      goal: 10,
      reward: { item: 'amulet-power' },
      rewardText: 'Амулет силы',
    },
    {
      id: 'scout',
      giver: 'mill',
      title: 'Кто бродит вокруг',
      desc: 'Заметьте на карте пять разных видов существ — мышь сама носа за частокол не сунет, но обожает слушать про тех, кого вы видели.',
      need: seenCount,
      goal: 5,
      reward: { cons: { potion: 2, elixir: 1 } },
      rewardText: '2 зелья здоровья и эликсир силы',
    },
  ];

  // Список заданий с текущим прогрессом. data — Profile.data (или похожий объект в тестах).
  // giver — необязательный фильтр ('tavern' | 'mill'); без него возвращаются все задания.
  function list(data, giver) {
    return LIST.filter((q) => !giver || q.giver === giver).map((q) => {
      const value = Math.min(q.need(data) || 0, q.goal);
      const claimed = !!(data.quests && data.quests[q.id]);
      return { ...q, value, done: value >= q.goal, claimed };
    });
  }

  function find(id) { return LIST.find((q) => q.id === id) || null; }

  function canClaim(data, id) {
    const q = find(id);
    if (!q) return false;
    if (data.quests && data.quests[id]) return false;
    return (q.need(data) || 0) >= q.goal;
  }

  // Выдаёт награду через Profile/Gear (глобалы браузера) и помечает задание полученным. true — выдано.
  function claim(id) {
    if (typeof Profile === 'undefined') return false;
    const data = Profile.data;
    if (!canClaim(data, id)) return false;
    const q = find(id), r = q.reward;
    if (r.coins) Profile.addCoins(r.coins);
    if (r.item) Profile.addItem(Gear.makeEntry(r.item, 1));
    if (r.cons) for (const [k, n] of Object.entries(r.cons)) Profile.addConsumable(k, n);
    data.quests = data.quests || {};
    data.quests[id] = true;
    Profile.save();
    return true;
  }

  return { LIST, list, find, canClaim, claim };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Quests;
