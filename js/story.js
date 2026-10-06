if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Сюжет «Осколки Великого Сердца» и боссы зон (версия 1.3.0). Без интерфейса — можно тестировать в Node.

   Легенда: Великое Сердце Грани раскололось; самые крупные осколки достались сильнейшим существам —
   стражам своих земель. Бобёр-хранитель (Библиотека) ведёт летопись: кто владеет осколком и где искать.
   Четыре стража — по одному на полосу цветов (2, 4, 6, 8). Капитан (побережье, цвет 8) — один из них.
   Когда четыре осколка собраны, у северного края карты пробуждается последний страж — Древний дракон (цвет 10):
   он держит сердцевину. Победа над ним завершает сюжет.

   Страж — обычное существо своего вида, но вдвое крепче и сильнее (HP_MULT, POWER), с короной на карте.
   Его можно побеждать снова (как других существ — он возвращается через время), но осколок даётся один раз. */

const ST_T = (typeof Tiers !== 'undefined') ? Tiers : require('./tiers.js');

const Story = (() => {
  // angle — направление от деревни на карте (градусы экрана: 0 — восток, 90 — юг, -90 — север).
  const CHAPTERS = [
    { id: 'b1', species: 'wolf', tier: 2, angle: 90, title: _t("Вожак стаи"), where: _t("на юге, в лесах второго цвета"),
      lore: _t("Огромный волк проглотил первый осколок — с тех пор стая не знает страха.") },
    { id: 'b2', species: 'bandit', tier: 4, angle: -60, title: _t("Атаман разбойников"), where: _t("на северо-востоке, у дорог четвёртого цвета"),
      lore: _t("Атаман носит осколок в рукояти сабли и говорит, что купил его. Врёт.") },
    { id: 'b3', species: 'orcShaman', tier: 6, angle: 150, title: _t("Шаман Орды"), where: _t("на юго-западе, в землях шестого цвета"),
      lore: _t("Шаман вплёл осколок в бубен — его заклинания стали злее.") },
    { id: 'b4', species: 'captain', tier: 8, title: _t("Капитан"), where: _t("на восточном берегу, у бригантины"), existing: true,
      lore: _t("Капитан нашёл осколок в трюме своего корабля — и из-за него сел на мель.") },
    { id: 'b5', species: 'dragon', tier: 10, angle: -90, title: _t("Древний дракон"), where: _t("у северного края карты"), final: true,
      lore: _t("Сердцевина Сердца — у древнего дракона. Он проснётся, когда четыре осколка будут вместе.") },
  ];
  const BY_ID = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));
  const HP_MULT = 2, POWER = 20;

  // Страж: ХП вдвое и +20% Силы к виду. Капитан уже босс по своему виду — его не усиливаем повторно.
  function scaleBoss(sc, bossId) {
    const ch = BY_ID[bossId];
    if (!ch || ch.existing) return sc;
    return { ...sc, hp: Math.round(sc.hp * HP_MULT), stats: { ...sc.stats, power: (sc.stats.power || 0) + POWER } };
  }
  const bossName = (bossId, baseName) => (BY_ID[bossId] && !BY_ID[bossId].existing ? BY_ID[bossId].title : baseName);

  const shards = (story) => CHAPTERS.filter((c) => !c.final && story && story.shards && story.shards[c.id]).length;
  const finalOpen = (story) => shards(story) >= 4;
  const finished = (story) => !!(story && story.shards && story.shards.b5);

  // Награда за осколок (один раз): монеты по цвету стража и опыт. Финал — втрое больше.
  function shardReward(bossId) {
    const ch = BY_ID[bossId];
    const coins = Math.round(400 * ST_T.PRICE_MULT[ch.tier - 1] * (ch.final ? 3 : 1));
    return { coins, xp: (ch.final ? 600 : 120) * Math.ceil(ch.tier / 2) };
  }

  return { CHAPTERS, BY_ID, HP_MULT, POWER, scaleBoss, bossName, shards, finalOpen, finished, shardReward };
})();

if (typeof module !== 'undefined') module.exports = Story;
