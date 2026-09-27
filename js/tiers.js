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
    { id: 1,  name: 'Красный',      color: '#e5483f', ink: '#101114' },
    { id: 2,  name: 'Оранжевый',    color: '#f08a2c', ink: '#101114' },
    { id: 3,  name: 'Жёлтый',       color: '#f4dc3f', ink: '#101114' },
    { id: 4,  name: 'Зелёный',      color: '#48b96c', ink: '#101114' },
    { id: 5,  name: 'Голубой',      color: '#4cc0ee', ink: '#101114' },
    { id: 6,  name: 'Синий',        color: '#4270e6', ink: '#ffffff' },
    { id: 7,  name: 'Фиолетовый',   color: '#a262ee', ink: '#ffffff' },
    { id: 8,  name: 'Серебро',      color: '#c9d0da', ink: '#101114' },
    { id: 9,  name: 'Золото',       color: '#f0c23c', ink: '#101114' },
    { id: 10, name: 'Обсидиановый', color: '#3a3148', ink: '#f2ecff', edge: '#b6a5de' },
  ];
  for (const t of LIST) if (!t.edge) t.edge = t.color;
  const MAX = LIST.length;

  /* Рост по уровням-цветам.
     GROWTH — главный множитель: ХП и урон существ, базовое ХП и урон героя (по его уровню), Здоровье вещей.
       ХП и урон растут одинаково, поэтому бой равных соперников одинаково длинный на любом цвете.
     POWER_MULT — Сила и Магия вещей и существ (растут умеренно).
     PCT_MULT — Броня, Блок, Рикошет, Инициатива (шансы и проценты растут медленно, чтобы не упираться в потолки).
     POINT_MULT — цена вещи в очках снаряжения; PRICE_MULT — цена в монетах и монеты с добычи. */
  const GROWTH     = [1, 1.3, 1.7, 2.2, 2.8, 3.5, 4.4, 5.5, 7, 9];
  const POWER_MULT = [1, 1.15, 1.3, 1.45, 1.6, 1.75, 1.9, 2.05, 2.2, 2.35];
  const PCT_MULT   = [1, 1.12, 1.24, 1.36, 1.48, 1.6, 1.72, 1.84, 1.96, 2.1];
  const POINT_MULT = [1, 1.4, 1.9, 2.5, 3.2, 4, 5, 6.2, 7.6, 9.2];
  const PRICE_MULT = [1, 2.5, 6, 15, 35, 80, 180, 400, 900, 2000];
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
  const STAT_TABLE = { health: GROWTH, power: POWER_MULT, magic: POWER_MULT, defense: PCT_MULT, block: PCT_MULT, ricochet: PCT_MULT, initiative: PCT_MULT };
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
    if (m.gold) parts.push(m.gold + ' зол.');
    if (m.silver) parts.push(m.silver + ' сер.');
    if (m.copper || !parts.length) parts.push(m.copper + ' мед.');
    return parts.join(' ');
  }

  return { LIST, MAX, GROWTH, POWER_MULT, PCT_MULT, POINT_MULT, PRICE_MULT, HP_MULT, SILVER, GOLD, clamp, get, at, statMult, splitMoney, moneyText };
})();

// Для тестов в Node.js (в браузере не используется).
if (typeof module !== 'undefined') module.exports = Tiers;
