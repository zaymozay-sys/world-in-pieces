if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Уровни-цвета и деньги (без интерфейса — можно тестировать в Node).

   Десять уровней по возрастанию мощи: сначала радуга, затем благородные металлы и обсидиан.
     1 Красный → 2 Оранжевый → 3 Жёлтый → 4 Зелёный → 5 Голубой → 6 Синий → 7 Фиолетовый →
     8 Серебро → 9 Золото → 10 Обсидиановый.
   Уровень есть у предметов, монстров и ресурсов; от него зависят характеристики, цена и добыча.
   color — цвет уровня, ink — цвет текста на нём, edge — цвет обводки на тёмном фоне.

   Деньги — медные, серебряные и золотые монеты: 1 серебряная = 100 медных, 1 золотая = 100 серебряных.
   Внутри игры всё хранится в медных. */

const Tiers = (() => {
  const LIST = [
    { id: 1,  name: _t("Красный"),      color: '#e5483f', ink: '#101114' },
    { id: 2,  name: _t("Оранжевый"),    color: '#f08a2c', ink: '#101114' },
    { id: 3,  name: _t("Жёлтый"),       color: '#f4dc3f', ink: '#101114' },
    { id: 4,  name: _t("Зелёный"),      color: '#48b96c', ink: '#101114' },
    { id: 5,  name: _t("Голубой"),      color: '#4cc0ee', ink: '#101114' },
    { id: 6,  name: _t("Синий"),        color: '#4270e6', ink: '#ffffff' },
    { id: 7,  name: _t("Фиолетовый"),   color: '#a262ee', ink: '#ffffff' },
    { id: 8,  name: _t("Серебро"),      color: '#c9d0da', ink: '#101114' },
    { id: 9,  name: _t("Золото"),       color: '#f0c23c', ink: '#101114' },
    { id: 10, name: _t("Обсидиановый"), color: '#3a3148', ink: '#f2ecff', edge: '#b6a5de' },
  ];
  for (const t of LIST) if (!t.edge) t.edge = t.color;
  const MAX = LIST.length;

  /* Рост по уровням-цветам.
     GROWTH — главный множитель: ХП и урон существ, базовое ХП и урон героя (по его уровню), Здоровье вещей.
       ХП и урон растут одинаково, поэтому бой равных соперников одинаково длинный на любом цвете.
     POWER_ABS — Сила вещей (число, прибавляемое к удару).
     PCT_MULT — Броня, Блок, Рикошет, Проворство (шансы и проценты растут медленно, чтобы не упираться в потолки).
     POINT_MULT — цена вещи в очках снаряжения; PRICE_MULT — цена в монетах и монеты с добычи. */
  const GROWTH     = [1, 1.3, 1.7, 2.2, 2.8, 3.5, 4.4, 5.5, 7, 9];
  // Старая шкала Силы («очки»): относительный рост вещей по цветам. Сила в бою теперь плоская (прибавка к удару),
  // поэтому очко старой шкалы на цвете t равно POWER_MULT[t] × 0,045 × рост урона героя на этом цвете (см. POWER_ABS).
  const POWER_MULT = [1, 1.15, 1.3, 1.45, 1.6, 1.75, 1.9, 2.05, 2.2, 2.35];
  // Рост урона героя на середине цвета (Hero.dmgMult((t − 1)·10 + 5)): цвет 1 = ур. 5, цвет 7 = ур. 65.
  const HERO_DMG = [1.67, 2.17, 2.83, 3.63, 4.59, 5.75, 7.22, 9.09, 11.61, 14.93];
  // Сила вещей: множитель базового значения вещи на цвете — Сила прибавляется к удару числом (удар = камни + Сила).
  const POWER_ABS = POWER_MULT.map((m, i) => Math.round(m * 0.045 * HERO_DMG[i] * 1000) / 1000);
  // 2.0.5: шансы и Броня идут от ≈25% потолка на цвете 1 к ≈90% на цвете 10 (+7 п.п. за цвет); раньше стартовали у потолка и почти не росли
  const PCT_MULT   = [0.35, 0.455, 0.56, 0.665, 0.77, 0.875, 0.98, 1.085, 1.19, 1.295];
  // 2.0.7: плоская Броня — число вычитается из удара как есть. Множитель базового значения вещи (и существа) на цвете:
  // «старое очко» Брони × 0,045 × рост урона цвета. ARMOR_UNIT — во что превращается одно старое очко на цвете t.
  const ARMOR_UNIT = HERO_DMG.map((d) => 0.045 * d);
  const ARMOR_ABS = PCT_MULT.map((m, i) => Math.round(m * ARMOR_UNIT[i] * 1000) / 1000);
  const POINT_MULT = [1, 1.4, 1.9, 2.5, 3.2, 4, 5, 6.2, 7.6, 9.2];
  const PRICE_MULT = [1, 2.5, 6, 15, 35, 80, 150, 280, 480, 780];
  const HP_MULT = GROWTH;                                                        // старое имя

  const clamp = (t) => Math.max(1, Math.min(MAX, Math.round(t) || 1));
  const get = (t) => LIST[clamp(t) - 1];

  // Значение таблицы для дробного уровня (например, 2.4 — между Оранжевым и Жёлтым): рост геометрический;
  // выше Обсидианового продолжается с тем же темпом.
  function at(table, t) {
    if (t <= 1) return table[0];
    const i = Math.floor(t) - 1, f = t - Math.floor(t);
    if (i >= table.length - 1) {
      const r = table[table.length - 1] / table[table.length - 2];
      return table[table.length - 1] * Math.pow(r, t - table.length);
    }
    return table[i] * Math.pow(table[i + 1] / table[i], f);
  }
  // Множитель характеристики stat на уровне-цвете tier.
  const STAT_TABLE = { health: GROWTH, power: POWER_ABS, defense: ARMOR_ABS, block: PCT_MULT, ricochet: PCT_MULT, initiative: PCT_MULT, fury: PCT_MULT, cunning: PCT_MULT };
  const statMult = (stat, tier) => (STAT_TABLE[stat] || POWER_MULT)[clamp(tier) - 1];

  /* ---------- деньги ---------- */
  const SILVER = 100, GOLD = 10000;
  function splitMoney(n) {
    n = Math.max(0, Math.floor(n));
    return { gold: Math.floor(n / GOLD), silver: Math.floor((n % GOLD) / SILVER), copper: n % SILVER };
  }
  // «3з 25с 40м» — текстом (для подсказок и журнала)
  function moneyText(n) {
    const m = splitMoney(n);
    const parts = [];
    if (m.gold) parts.push(m.gold + _t(" зол."));
    if (m.silver) parts.push(m.silver + _t(" сер."));
    if (m.copper || !parts.length) parts.push(m.copper + _t(" мед."));
    return parts.join(' ');
  }

  return { LIST, MAX, GROWTH, POWER_MULT, POWER_ABS, HERO_DMG, PCT_MULT, ARMOR_ABS, ARMOR_UNIT, POINT_MULT, PRICE_MULT, HP_MULT, SILVER, GOLD, clamp, get, at, statMult, splitMoney, moneyText };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Tiers;
