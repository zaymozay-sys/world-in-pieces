if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Игровая логика и анимация. Расчёт поля — в engine.js, противник — в ai.js,
   правила боя (урон, приёмы, расходники) — в combat.js, все числа баланса — в balance.js,
   уровни героя — в hero.js. Здесь — ход боя, анимации и интерфейс. */

const RULES = {
  size: 6,               // поле 6x6
  defaultHp: 100,
  firstMove: null,       // для отладки: 'left' или 'right' — кто ходит первым (обычно решает Инициатива)
  defaultLevel: 30,      // уровень противника 1..100
  timing: { swap: 200, clear: 230, fall: 280, shift: 280, spawn: 320, think: 600, burn: 650 },
};

const N = RULES.size;
const ONYX = GEM_TYPES.indexOf('onyx');
const MAGIC_TYPES = ['sapphire', 'ruby', 'emerald'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (n) => Math.floor(Math.random() * n);

const boardEl = document.getElementById('board');
const movesEl = document.getElementById('moves');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('turn-timer');

let grid = [];          // grid[r][c] = { type, ti, value, el } | null
let moves = 0;
let busy = false;       // идёт анимация или ход противника — ввод закрыт
let over = false;
let selected = null;
let aiming = false;      // игрок выбирает центр Огненного креста
let aimKind = null;      // какое заклинание наводится: 'fire' | 'transmute'
let turnDamage = { target: null, amount: 0 };
let turnEvents = { block: 0, blockTarget: null, reflected: 0, attacker: null };   // блоки и рикошеты за ход   // урон, нанесённый за текущий ход
let aimCell = null;      // на сенсорных экранах: клетка, выбранная первым касанием
let turnStats = { stones: 0, dmg: 0, bonus: 1 };   // итоги текущего хода для журнала
let invalidStreak = 0;  // неверных ходов игрока подряд
let rewarded = false;   // награда за победу уже выдана
let shotKilledMonster = false;     // добит метательным оружием — медаль «Меткий стрелок»
let strikeKilledMonster = false;   // текущий монстр добит заклинанием Удар — для медали (Medals.checkStrikeMedal)
// Подсказка бобра-хранителя (Библиотека → «Бобёр», см. Screens.library) на следующий запуск боя:
// { text } — просто баннер-подсказка; { text, spellKey } — вдобавок гарантирует стартовый запас камней
// для этого заклинания. Одноразовая: сбрасывается сразу после применения в startGame().
let beaverTip = null;
function setBeaverTip(tip) { beaverTip = tip; }
// Таймер хода игрока (30с): не походил вовремя — ход автопропускается; 3 таких пропуска подряд — поражение.
let turnTimerHandle = null, turnTimerLeft = 0, skipStreak = 0;
// Скованные столбцы: forSide — чья сторона не может трогать эти камни (Окаменение голема).
let locks = { cols: new Set(), forSide: null };
const veiled = new Set();   // камни, скрытые Туманом призрака (до конца хода игрока)

// Фракция игрока (по умолчанию — гномы, пока игрок не выбрал).
const playerFaction = () => Factions.get(Profile.data.faction) || Factions.get('dwarf');
// Приём существа-противника (id из Bestiary.ABILITIES).
const monsterAbility = () => { const m = Bestiary.MONSTERS[fighters.right.monsterId]; return m ? m.ability : null; };

/* ---------- персонажи ---------- */

const other = (side) => (side === 'left' ? 'right' : 'left');

// У каждого персонажа свой набор камней (counts) и своё ХП.
const fighters = {
  left:  { name: _t("Игрок"),     hp: RULES.defaultHp, max: RULES.defaultHp, base: RULES.defaultHp, counts: {}, magic: false, shield: 0,
           gear: Gear.emptyLoadout(), stats: Gear.stats(Gear.emptyLoadout()), buffs: [], haste: false },
  right: { name: _t("Противник"), hp: RULES.defaultHp, max: RULES.defaultHp, base: RULES.defaultHp, counts: {}, magic: false, level: RULES.defaultLevel, shield: 0,
           monsterId: 'rat', tier: 1, innate: {}, gearBudget: 0, levelOverride: null, swarmSize: 1,
           gear: Gear.emptyLoadout(), stats: Gear.stats(Gear.emptyLoadout()), buffs: [], haste: false, bag: {} },
};



const fEl = (side) => document.getElementById('fighter-' + side);
// kind — какое заклинание ('lightning' по умолчанию): у каждого своя цена (Balance.magic.costs).
const magicCostOf = (side, kind = 'lightning') => Combat.spellCost(fighters[side], kind);
const canAffordMagic = (side, kind = 'lightning') => MAGIC_TYPES.every((t) => fighters[side].counts[t] >= magicCostOf(side, kind));
// Может ли сторона позволить себе хоть одно из пяти заклинаний (для ИИ — решает, стоит ли вообще думать про магию).
const anyMagicAffordable = (side) => Object.keys(MAGICS).some((k) => canAffordMagic(side, k));
// { lightning, fire, transmute, heal, chaos } → может ли сторона позволить себе именно это заклинание (для ИИ).
const affordability = (side) => Object.fromEntries(Object.keys(MAGICS).map((k) => [k, canAffordMagic(side, k)]));

function buildFighter(side) {
  const f = fighters[side];
  const el = fEl(side);
  el.classList.remove('dead', 'active');
  // Чёрные камни не считаем: они только наносят урон.
  const counters = MAGIC_TYPES.map((t) =>
    `<div class="counter" data-type="${t}" title="${GEM_NAMES[t]}">${GEM_SVG[t]}<b>0</b></div>`).join('');
  // Уровень противника стоит прямо рядом с его именем. Имя — в своём .fname (сжимается и обрезается
  // многоточием, если не помещается), чтобы строка с именем никогда не переносилась на вторую
  // строку — иначе карточки игрока и противника оказались бы разной высоты (см. .fighter .name).
  const nameRow = side === 'right'
    ? _t("<div class=\"name\"><span class=\"fname\" style=\"color:{0}\" title=\"{1}\">{2}</span> {3} <label class=\"lvl\">ИИ <input class=\"level\" type=\"number\" min=\"1\" max=\"100\" step=\"1\" value=\"{4}\" title=\"Уровень ИИ противника, 1–100 (глубина и точность его ходов)\"></label></div>", [tierColor(f.tier), f.name, f.name, tierChip(f.tier), f.level])
    : _t("<div class=\"name\"><span class=\"fname\" title=\"{0}\">{1}</span> <span class=\"hero-lvl\" title=\"Уровень героя\">ур. {2}</span></div>", [f.name, f.name, f.level || 1]);
  el.innerHTML = _t("\n    <div class=\"avatar\" title=\"Открыть ранец и экипировку\"></div>\n    {0}\n    <div class=\"hpbar\"><i></i><span class=\"hptext\"></span></div>\n    <div class=\"counters\">{1}</div>\n    <div class=\"gearrow\" title=\"Открыть ранец и экипировку\"></div>\n    <div class=\"statline\"></div>\n    {2}\n    <div class=\"badge\"></div>\n    {3}\n    {4}", [nameRow, counters, side === 'right' ? _t("<div class=\"ability-line\" title=\"{0}\">Приём: <b>{1}</b></div>", [(Bestiary.ability(f.monsterId) || {}).desc || '', (Bestiary.ability(f.monsterId) || {}).name || '—']) : '', side === 'left' ? '<div class="pet-panel" id="pet-panel" hidden><div class="name"><span class="fname"></span></div><div class="hpbar"><i></i><span class="hptext"></span></div></div>' : '', side === 'right' ? '<div class="pet-panel clone-panel" id="clone-panel" hidden><div class="clone-av"></div><div class="clone-body"><div class="name"><span class="fname"></span></div><div class="hpbar"><i></i><span class="hptext"></span></div></div></div>' : '']);

  const lvl = el.querySelector('input.level');
  if (lvl) {
    lvl.addEventListener('change', () => {
      const v = Math.min(100, Math.max(1, Math.floor(Number(lvl.value)) || 1));
      lvl.value = v;
      f.level = v;
      f.levelOverride = v;                            // ручная настройка ИИ действует до выбора другого монстра
      saveSettings();
      f.bag = enemyBag(v);
    });
  }

  el.querySelector('.avatar').addEventListener('click', () => Inventory.open(side));
  el.querySelector('.gearrow').addEventListener('click', () => Inventory.open(side));
  renderAvatar(side);
  renderGear(side);
  renderWallet();
}

/* ---------- снаряжение, характеристики, ранец ---------- */

const enemyBag = (level) => Combat.enemyBag(level);
// Все баффы урона: эликсир силы, Знамя людей, Вой волка.
const buffPower = (f) => Combat.buffPower(f);
const BUFF_NAMES = { power: _t("Боевой настой"), banner: _t("Знамя"), howl: _t("Вой"), weaken: _t("Морок"), mire: _t("Трясина"), sap: _t("Смола") };
const WEAPON_PERK_NAMES = { pierceBlock: _t("Пробивной болт (иногда пробивает Блок)"), armorShred: _t("Крошит Броню с каждым ударом") };
const itemColor = (it) => (it.set && Gear.SETS[it.set] ? Gear.SETS[it.set].color : Gear.NEUTRAL_COLOR);
// Идёт ли бой (или игрок на карте). Снаряжение можно менять вне боя, до первого хода и после конца боя.
let inBattle = false;
function enterBattle() { inBattle = true; }
function leaveBattle() { inBattle = false; }
const canEditGear = () => !inBattle || (moves === 0 && !busy) || over;

// Тестовый режим «x10» (переключатель в окне «О разработчиках»): все характеристики, ХП и урон своего героя ×10.
// Нужен только для проверки сильных персонажей; проценты (Броня, Блок, Рикошет…) упираются в обычные потолки Gear.CAPS.
const testMult = () => (typeof Profile !== 'undefined' && Profile.data && Profile.data.testX10 ? 10 : 1);

function recalcStats(side) {
  const f = fighters[side];
  f.stats = Gear.combine(side === 'left' ? Gear.statsFor(f.gear, Profile.level()) : Gear.stats(f.gear), f.innate || {});   // предметы + врождённые способности
  if (side === 'left') {
    f.stats = Gear.combine(f.stats, Profile.medalsBonus());
    f.stats = Gear.combine(f.stats, Profile.elixirBonus());   // 1.3.6: эликсиры   // + постоянный бонус медалей
    f.stats = Gear.combine(f.stats, Runes.bonusForGear(f.gear));   // + руны, вставленные в снаряжение (js/runes.js)
    if (testMult() > 1) {
      const x = {};
      for (const k in f.stats) x[k] = f.stats[k] * testMult();
      f.stats = Gear.combine(x, {});                               // с обычными потолками
    }
  }
  f.max = (side === 'left' ? f.base * testMult() : f.base) + f.stats.health;
  f.hp = Math.min(f.hp, f.max);
  f.weaponPerk = Gear.weaponPerk(f.gear);                       // приём особого оружия (арбалет, утренняя звезда)
}

// Уровень героя: базовое ХП и урон камней (если ХП не подправлено вручную для проверки).
function applyLevel() {
  const f = fighters.left, L = Profile.level();
  f.level = L;
  f.dmg = Hero.dmgMult(L) * testMult();
  if (!f.hpEdited) f.base = Hero.baseHp(L);
}

// Портрет Бобра-хранителя в учебном бою — тот же рисунок, что и его карточка NPC в Библиотеке
// (см. Screens.library), со встроенным запасным SVG на случай, если файл art/npc/beaver-library-portrait
// не подключен (тот же фолбэк, что и в screens.js).
function beaverPortrait() {
  if (typeof Art !== 'undefined' && Art.hasNpc('beaver-library')) return Art.npcPortrait('beaver-library');
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#241d15"/>
      <path d="M18 42 Q10 30 22 18 Q30 32 31 44Z" fill="#6b4f30"/>
      <ellipse cx="50" cy="60" rx="30" ry="26" fill="#8a6a42"/>
      <circle cx="38" cy="52" r="9" fill="none" stroke="#e3c98a" stroke-width="2"/><circle cx="62" cy="52" r="9" fill="none" stroke="#e3c98a" stroke-width="2"/>
      <path d="M46 52 H54 M29 50 L20 47 M71 50 L80 47" stroke="#e3c98a" stroke-width="2" fill="none"/></svg>`;
}

function renderAvatar(side) {
  const box = fEl(side).querySelector('.avatar');
  if (!box) return;
  const f = fighters[side];
  if (side === 'left') {
    box.innerHTML = Figures.avatar(Factions.heroKind(Profile.data.faction || 'dwarf', Profile.data.gender), f.gear);
  } else {
    box.innerHTML = f.monsterId === 'dragon' ? Figures.avatar('dragon', f.gear)
      : f.monsterId === 'beaver' ? beaverPortrait() : MonsterArt.bust(f.monsterId, f.tier);
    box.style.borderColor = tierColor(f.tier);                       // цвет уровня — на рамке аватара
    box.style.boxShadow = `0 0 12px ${tierColor(f.tier)}88`;
  }
}

// Кошелёк игрока.
function renderWallet() {
  const w = fEl('left').querySelector('.wallet');
  if (w) w.innerHTML = MonsterArt.moneyHtml(Profile.data.coins);
}

// Экономика изменилась (лавка, кузница, награды).
function onEconomyChanged() {
  renderWallet();
  renderBag();
  MapView.renderHud();
}

function renderGear(side) {
  const f = fighters[side];
  const el = fEl(side);
  const row = el.querySelector('.gearrow');
  if (!row) return;
  row.style.display = side === 'right' && !f.gearBudget ? 'none' : '';    // у существ без снаряжения полосы нет
  row.innerHTML = Gear.SLOTS.map((slot) => {
    const it = Gear.item(f.gear[slot]);
    return `<span class="gslot ${it ? 'on' : ''}" title="${Gear.SLOT_NAMES[slot]}: ${it ? it.name : _t("пусто")}">${it ? itemIcon(it.type, itemColor(it), it.id) : ''}</span>`;
  }).join('');
  const st = f.stats, power = st.power + buffPower(f);
  const parts = [];
  if (power) parts.push(_t("Сила +{0}%", [power]));
  if (st.defense) parts.push(_t("Броня {0}%", [st.defense]));
  if (st.block) parts.push(_t("Блок {0}%", [st.block]));
  if (st.ricochet) parts.push(_t("Рикошет {0}%", [st.ricochet]));
  if (st.initiative) parts.push(_t("Иниц. {0}%", [st.initiative]));
  if (st.magic) parts.push(_t("Магия {0}", [st.magic]));
  if (f.weaponPerk) parts.push(WEAPON_PERK_NAMES[f.weaponPerk.type] || '');
  el.querySelector('.statline').textContent = parts.join(' · ') || _t("Без снаряжения");
}

// Снаряжение игрока изменилось в окне ранца.
function onGearChanged() {
  applyFaction();
  rotateHint();
  fighters.left.gear = Profile.gear();
  recalcStats('left');
  if (moves === 0 && !over) fighters.left.hp = fighters.left.max;    // до первого хода здоровье полное
  renderFighters();
  renderGear('left');
  renderAvatar('left');
  MapView.refreshPlayerArt();
  MapView.renderHud();
}

// Игрок выбрал фракцию: вещи чужой фракции снимаются, лавка обновляется.
function chooseFaction(id) {
  const d = Profile.data;
  d.faction = id;
  if (!d.ammoStart) { d.ammoStart = true; Profile.addAmmo(Ammo.forFaction(id), Ammo.PACK); }   // 1.3.0: первая пачка боеприпасов
  for (const slot of Gear.SLOTS) {
    const e = d.loadout[slot] && Profile.item(d.loadout[slot]), it = e && Gear.item(e);
    if (it && it.faction && it.faction !== id) d.loadout[slot] = null;
  }
  Profile.refreshShop();
  Profile.save();
  onGearChanged();
  renderMagic();
  MapView.onFactionChanged();
}

// Фракция игрока: имя героя и врождённые бонусы (растут с уровнем героя).
function applyFaction() {
  const fac = playerFaction();
  fighters.left.name = fac.hero;
  fighters.left.innate = Factions.statsAt(Profile.data.faction || 'dwarf', Hero.tierFloat(Profile.level()));
  fighters.left.ability = null;
  applyLevel();
}

// Учебный бой (см. MapView.startTraining, Screens.library «Начать учебный бой»/«Отточить мастерство»):
// противник — сам Бобёр-хранитель, не вид из бестиария. isTraining() отличает такой бой от обычного —
// по нему наград не даётся (см. grantRewards) и вехи медалей за линию из 5 не копятся (см. resolveBoard).
const TUT = () => (typeof Tutorial !== 'undefined' && Tutorial.inBattle());
const isTraining = () => fighters.right.monsterId === 'beaver';

// Бобёр-хранитель как тренировочный противник: переиспользует характеристики крысы первого тира
// (Bestiary.scaled) — лёгкий, точно проходимый бой, — но без способности, снаряжения и добычи,
// и не заносится в Bestiary.MONSTERS (это не настоящий вид, не должен попадать в бестиарий/добычу).
function setupTrainerBeaver() {
  const tier = 1, f = fighters.right;
  const sc = Bestiary.scaled('rat', tier, 1);
  if (f.monsterId !== 'beaver') f.levelOverride = null;
  Object.assign(f, {
    monsterId: 'beaver', tier, swarmSize: 1,
    name: _t("Бобёр-хранитель"),
    base: f.hpEdited ? f.base : sc.hp, innate: sc.stats, gearBudget: 0,
    dmg: sc.dmg, ability: null,
    level: f.levelOverride || sc.ai,
    gear: Gear.emptyLoadout(),
  });
  if (TUT()) { f.base = 400; f.bag = {}; return; }   // обучение: крепкий Бобёр без зелий
  f.bag = enemyBag(f.level);
}

// Выбирает противника из бестиария (Profile.data.monster) и настраивает его: ХП, способности, ИИ, снаряжение.
function setupEnemy() {
  const sel = Profile.data.monster;
  if (sel.id === 'beaver') return setupTrainerBeaver();
  const id = Bestiary.MONSTERS[sel.id] ? sel.id : 'rat';
  const tier = Tiers.clamp(sel.tier);
  const m = Bestiary.MONSTERS[id], f = fighters.right;
  // Рой (Дикие пчёлы): размер выпадает заново при каждой встрече — 1, 3 или 5 «на деле» в одном бою
  // (см. Bestiary.rollSwarmSize/scaled). У видов без поля swarm всегда 1 и ни на что не влияет.
  const swarmSize = sel.swarm || Bestiary.rollSwarmSize(id, Math.random);
  let sc = Bestiary.scaled(id, tier, swarmSize);
  if (sel.boss) sc = Story.scaleBoss(sc, sel.boss);          // 1.3.0: страж осколка — вдвое крепче
  if (f.monsterId !== id || f.tier !== tier) f.levelOverride = null;
  Object.assign(f, {
    monsterId: id, tier, swarmSize,
    name: sel.boss ? Story.bossName(sel.boss, m.name) : m.swarm ? `${m.name} ×${swarmSize}` : m.name,
    base: f.hpEdited ? f.base : sc.hp, innate: sc.stats, gearBudget: sc.gearBudget,
    dmg: sc.dmg, ability: m.ability,
    level: f.levelOverride || sc.ai,
    gear: sc.gearBudget ? Gear.randomLoadout(sc.gearBudget, Math.random, tier) : Gear.emptyLoadout(),
  });
  f.bag = enemyBag(f.level);
}

function refreshEnemyGear() {
  setupEnemy();
  recalcStats('right');
  fighters.right.hp = fighters.right.max;
  renderFighters();
  renderGear('right');
  renderAvatar('right');
  if (Inventory.isOpen) Inventory.refresh();
}

function renderFighters() {
  for (const side of ['left', 'right']) {
    const f = fighters[side];
    const el = fEl(side);
    if (!el.querySelector('.hpbar')) continue;             // панели ещё не построены (игрок на карте)
    el.querySelector('.hpbar i').style.width = (f.hp / f.max) * 100 + '%';
    el.querySelector('.hptext').textContent = `${f.hp} / ${f.max}`;
    el.classList.toggle('dead', f.hp <= 0);
  }
  renderClonePanel();                                      // двойник Дикого гриба (скрыт, если его нет)
  renderMagic();
}

function renderCounters(side, bumped = []) {
  const f = fighters[side];
  for (const d of fEl(side).querySelectorAll('.counter')) {
    d.querySelector('b').textContent = f.counts[d.dataset.type];
    if (bumped.includes(d.dataset.type)) {
      d.classList.remove('bump');
      void d.offsetWidth;
      d.classList.add('bump');
    }
  }
  renderMagic();
}

/* ---------- Магия ---------- */

const MAGICS = {
  lightning: { name: _t("Шаровая молния"), icon: magicIcon,
    tip: _t("Сильнейшая магия: на один ход каждый собранный камень любого цвета бьёт с множителем x1,5. Включите до Креста или Квадрата — и их камни тоже ударят") },
  fire: { name: _t("Огненный крест"), icon: fireIcon,
    tip: _t("Собирает камни креста (область 5x5) в копилку. Урон: фиксированный + базовый + номиналы обсидианов; обычные камни урона не дают") },
  square: { name: _t("Захват"), icon: squareIcon,
    tip: _t("Собирает квадрат камней 3x3 в копилку. Урон: фиксированный + базовый + номиналы обсидианов; обычные камни урона не дают") },
  transmute: { name: _t("Превращение"), icon: transmuteIcon,
    tip: _t("Выбранный камень и все камни его цвета вокруг (область 3x3) становятся обсидианом") },
  heal: { name: _t("Целебный дождь"), icon: healIcon,
    tip: _t("Лечит на сумму номиналов изумрудов на поле; использованные изумруды теряют один уровень номинала (×5 → ×3 → ×1)") },
  chaos: { name: _t("Хаос"), icon: chaosIcon,
    tip: _t("Выберите центр области 3×3: камни в ней перемешиваются в лучший для вас расклад") },
  pierce: { name: _t("Выпад"), icon: (typeof pierceIcon === 'function' ? pierceIcon : chaosIcon),
    tip: _t("Выберите камень: он сгорит, поле осядет по обычным правилам (каскады — ваши), а ход не тратится. Очень дорого") },
  // Удар доступен всем фракциям с 1-го уровня (как стартовая пятёрка) — в Balance.spellUnlock не упомянут.
  strike: { name: _t("Удар"), icon: strikeIcon,
    tip: _t("Наносит фиксированный базовый урон героя; убийство Ударом идёт в отдельную серию медалей") },
  // Заклинания ниже открываются по уровню героя (Balance.spellUnlock, см. Hero.isSpellUnlocked).
  mirror: { name: _t("Зеркало"), icon: mirrorIcon,
    tip: _t("Следующий полученный удар целиком отражается атакующему") },
  tide: { name: _t("Прилив"), icon: tideIcon,
    tip: _t("Один случайный цвет на поле целиком перекрашивается в другой") },
  sacrifice: { name: _t("Жертва"), icon: sacrificeIcon,
    tip: _t("Сжигает часть своего текущего ХП — следующий собранный камень наносит утроенный урон") },
  divination: { name: _t("Прорицание"), icon: divinationIcon,
    tip: _t("Показывает лучший ход на поле (урон, магия, риск ответа врага). Ход не тратит") },
  fury: { name: _t("Кулак ярости"), icon: (typeof furyIcon === 'function' ? furyIcon : strikeIcon),
    tip: _t("Следующий удар наносит двойной урон. Только пока камней вашего цвета на поле больше (по номиналам), чем любого другого") },
};

// Иконка заклинания или приёма фракции: готовый рисунок из art/spells/ (ключ «spells/<kind>», для приёма —
// «spells/ability-<id приёма>», см. Factions), если он загружен; иначе встроенный SVG из gems.js.
// Рисунок кладётся в тот же <svg class="magic-icon">, чтобы CSS кнопок работал без изменений.
function spellIconHtml(kind, id) {
  const fac = kind === 'faction' ? (Profile.data.faction || 'dwarf') : null;
  const key = fac ? 'spells/ability-' + playerFaction().ability.id : 'spells/' + kind;
  if (typeof Art !== 'undefined' && Art.has(key)) {
    return `<svg class="magic-icon" viewBox="0 0 100 100" aria-hidden="true">` +
      `<image href="${Art.url(key)}" width="100" height="100" preserveAspectRatio="xMidYMid meet"/></svg>`;
  }
  if (fac) return playerFaction().ability.id === 'growth' ? growthIcon(id) : factionIcon(fac);
  return MAGICS[kind] ? MAGICS[kind].icon(id) : '';
}

// Кулак ярости: господствует ли родной цвет фракции героя на поле (Engine.dominantType, с учётом номиналов).
// Возвращает { ok, home, mine, other } — mine/other: сумма номиналов своего цвета и лучшего из прочих.
function furyState() {
  const home = GEM_TYPES.indexOf(playerFaction().gem);
  const typ = typOf(), val = valOf();
  const sums = Engine.typeValueSums(typ, val);
  const mine = sums[home] || 0;
  const other = Math.max(0, ...sums.filter((_, t) => t !== home).map((v) => v || 0));
  return { ok: Engine.dominantType(typ, val) === home, home, mine, other };
}

const spellbarEl = document.getElementById('spellbar');

function buildSpellbar() {
  spellbarEl.innerHTML = `<button type="button" class="magic fac" data-kind="faction"></button>` + Object.keys(MAGICS).map((k) =>
    `<button type="button" class="magic ${k}" data-kind="${k}" title="${MAGICS[k].tip}"></button>`).join('');
  spellbarEl.addEventListener('click', (e) => {
    const b = e.target.closest('button.magic');
    if (!b || b.disabled) return;
    const k = b.dataset.kind;
    if (b.classList.contains('new-spell') && Profile.data.spellSeen) { Profile.data.spellSeen[k] = true; Profile.save(); b.classList.remove('new-spell'); }
    if (k === 'faction') useFactionAbility();
    else if (k === 'lightning') toggleMagic();
    else if (k === 'fire' || k === 'transmute' || k === 'square' || k === 'chaos' || k === 'pierce') toggleAim(k);
    else playerInstant(k);      // heal, chaos, strike, mirror, tide, sacrifice, divination, fury
  });
}

// Доступность заклинания для игрока.
const bagEl = document.getElementById('bagbar');

function bagDisabled(kind) {
  const f = fighters.left, bag = Profile.data.backpack;
  if (busy || over || aiming || !(bag[kind] > 0)) return true;
  if (kind === 'potion') return f.hp >= f.max;
  if (kind === 'elixir') return f.buffs.some((b) => b.kind === 'power');
  if (kind === 'scroll') return f.haste;
  if (kind === 'luck') return !!f.luck;
  if (kind === 'storm') return f.magic || turnSide !== 'left';
  return false;
}

function renderBag() {
  if (!bagEl) return;
  const bag = Profile.data.backpack;
  // Подписи под иконками убраны (экономят место в бою) — название и описание уходят в title (подсказка при наведении).
  const ak = Profile.shotKind(), A = Ammo.CATALOG[ak], an = Profile.ammo(ak);
  const ammoBtn = _t("<button type=\"button\" class=\"bagitem ammo {0}\" data-ammo=\"{1}\" title=\"{2} (выстрел хода не тратит, один за ход): {3}\" {4}>\n       {5}<b>{6}</b></button>", [aiming && aimKind === 'bomb' ? 'on' : '', ak, A.name, A.desc, ammoDisabled() ? 'disabled' : '', Ammo.icon(ak), an]);
  bagEl.innerHTML = ammoBtn + Object.entries(Gear.CONSUMABLES).map(([k, c]) =>
    `<button type="button" class="bagitem ${k}" data-item="${k}" title="${c.name}: ${c.desc}" ${bagDisabled(k) ? 'disabled' : ''}>
       ${itemIcon(k)}<b>${bag[k] || 0}</b></button>`).join('');
}
function ammoDisabled() {
  const ak = Profile.shotKind();
  if (aiming && aimKind === 'bomb') return false;            // повторное нажатие снимает прицел
  return busy || over || aiming || turnSide !== 'left' || fighters.left.ammoShot || !(Profile.ammo(ak) > 0);
}
if (bagEl) bagEl.addEventListener('click', (e) => {
  const a = e.target.closest('button.bagitem.ammo');
  if (a) { if (!a.disabled) useAmmo(a.dataset.ammo); return; }
  const b = e.target.closest('button.bagitem');
  if (b && !b.disabled) useConsumable('left', b.dataset.item);
});

// Боеприпас (js/ammo.js): ход не тратит, один выстрел за свой ход. Шашка гномов — с прицелом по клетке.
function useAmmo(kind, cell = null) {
  const f = fighters.left, e = fighters.right, A = Ammo.CATALOG[kind];
  if (!A || f.ammoShot || !(Profile.ammo(kind) > 0)) return;
  if (A.aim && !cell) { toggleAim('bomb'); renderBag(); return; }
  if (busy || over || turnSide !== 'left') return;
  Profile.takeAmmo(kind);
  f.ammoShot = true;
  const base = Math.round(Combat.strikeDamage(f) * Gear.shotMult(Profile.gear()));   // метательное оружие: сила по цвету
  if (kind === 'bolt') {
    const dealt = dealDamage('right', Ammo.boltDamage(base), true);
    e.buffs = []; e.shield = 0; e.mirrorReady = false; e.tripleNext = false;
    Sound.fire();
    showFloat('right', _t("Болт!"), 'buff');
    logEvent('left', _t("{0}: Освящённый болт — урон {1}, усиления и щит противника сняты", [f.name, dealt]));
  } else if (kind === 'moonarrow') {
    const dealt = dealDamage('right', Ammo.arrowDamage(base), true);
    const got = Ammo.steal(e.counts, MAGIC_TYPES);
    for (const [t, n] of Object.entries(got)) { e.counts[t] -= n; f.counts[t] += n; }
    renderCounters('left', Object.keys(got)); renderCounters('right');
    Sound.lightning();
    logEvent('left', _t("{0}: Лунная стрела — урон {1}, украдено камней: {2}", [f.name, dealt, Object.values(got).reduce((a, b) => a + b, 0)]));
  } else if (kind === 'dart') {
    const dmg = Combat.venomTick(Combat.power(f), f.dmg);
    e.poison = { turns: Math.max(Ammo.DART_TURNS, (e.poison && e.poison.turns) || 0), dmg: Math.max(dmg, (e.poison && e.poison.dmg) || 0) };
    showFloat('right', _t("Яд!"), 'venom');
    Sound.transmute();
    logEvent('left', _t("{0}: Ядовитый дротик — {1} урона в начале каждого из {2} ходов противника", [f.name, dmg, Ammo.DART_TURNS]));
  } else if (kind === 'bomb') {
    stopTurnTimer();
    busy = true;
    renderMagic();
    castFire('left', cell, { shape: 'square', free: true, name: _t("Пороховая шашка") }).then(() => {
      if (over) return;
      busy = false;
      renderMagic(); renderBag(); renderFighters();
      note(_t("Ваш ход"));
      startTurnTimer();
    });
    return;
  }
  if (fighters.right.hp <= 0) shotKilledMonster = true;
  note(A.name + '!');
  flushTurnDamage();
  renderFighters();
  renderBag();
  checkEnd();
}

// Использует расходник (ход не тратится). Возвращает true, если использован.
function useConsumable(side, kind) {
  const f = fighters[side];
  const bag = side === 'left' ? Profile.data.backpack : f.bag;
  if (!(bag[kind] > 0)) return false;
  const ef = Combat.useConsumable(f, kind, MAGIC_TYPES);
  if (!ef) return false;
  if (kind === 'potion') {
    Sound.heal();
    showCenterPop('+' + ef.heal, 'heal', _t("Зелье здоровья"));
    logEvent(side, _t("{0}: Зелье здоровья, +{1} ХП", [f.name, ef.heal]));
  } else if (kind === 'elixir') {
    Sound.lightning();
    logEvent(side, _t("{0}: Боевой настой, +{1}% к урону до конца хода", [f.name, ef.power]));
    note(_t("{0}: Боевой настой", [f.name]));
  } else if (kind === 'dust') {
    renderCounters(side);
    Sound.match(4, 1);
    logEvent(side, _t("{0}: Каменная пыль, +{1} камня каждого вида", [f.name, ef.stones]));
  } else if (kind === 'scroll') {
    Sound.lightning();
    logEvent(side, _t("{0}: Свиток спешки", [f.name]));
    note(_t("{0}: следующий ход даст дополнительный ход", [f.name]));
  } else if (kind === 'storm') {
    Sound.lightning();
    renderMagic();
    logEvent(side, _t("{0}: Зелье грозы — Шаровая молния на этот ход", [f.name]));
    note(_t("Зелье грозы: Шаровая молния включена!"));
  } else if (kind === 'stoneskin') {
    Sound.heal();
    showFloat(side, _t("Каменная кожа"), 'buff');
    logEvent(side, _t("{0}: Каменная кожа — Броня +{1} до конца боя", [f.name, ef.armor]));
  } else if (kind === 'luck') {
    Sound.lightning();
    logEvent(side, _t("{0}: Свиток удачи — +{1}% к монетам и ресурсам за победу в этом бою", [f.name, ef.pct]));
    note(_t("{0}: Свиток удачи применён", [f.name]));
  } else if (kind === 'honeyjar') {
    Sound.heal();
    if (ef.mode === 'hp') {
      showCenterPop('+' + ef.amount, 'heal', _t("Банка мёда"));
      logEvent(side, _t("{0}: Банка мёда — +{1} к максимуму ХП до конца боя", [f.name, ef.amount]));
    } else {
      logEvent(side, _t("{0}: Банка мёда — следующий удар по нему будет заблокирован", [f.name]));
      note(_t("{0}: Банка мёда даёт заряд блока", [f.name]));
    }
  }
  bag[kind]--;
  if (side === 'left') Profile.save();
  renderFighters();
  return true;
}

// Расходники противника: использует по простым правилам в начале своего хода.
async function enemyUseItems() {
  for (const k of Combat.enemyItemPlan(fighters.right, anyMagicAffordable('right'))) if (useConsumable('right', k)) await sleep(650);
}

/* ---------- питомец (см. pets.js) ---------- */
// Боец питомца (Pets.petFighter) на время текущего боя, или null — нет приручённого/годного питомца.
let pet = null;
// Питомец погиб (0 ХП) в ЭТОМ бою — дальше герой сражается с тем же монстром один (см. Combat.turnOrder).
let petFell = false;
const petEl = () => document.getElementById('pet-panel');
const petName = () => (Profile.pet() ? Pets.petDisplayName(Profile.pet().speciesId) : '');
// Жив ли питомец и в строю ли он ПРЯМО СЕЙЧАС (участвует в раунде — см. Combat.turnOrder).
const petAlive = () => !!pet && pet.hp > 0 && !petFell;

// Готовит питомца к новому бою (вызывается из startGame, после того как панель игрока построена).
function setupPet() {
  pet = Profile.hasUsablePet() ? Pets.petFighter(Profile.pet()) : null;
  if (pet) {
    const tr = Pets.useTreats(Profile.pet());                        // 1.3.8: угощения Питомника
    const lk = Profile.slotStats('leash');                          // 1.3.9: поводок усиливает питомца
    if (Object.keys(lk).length) { pet.stats = Gear.combine(pet.stats, { ...lk, health: 0, magic: 0, cunning: 0, initiative: 0 }); const hm = 1 + 0.03 * (lk.health || 0); pet.max = Math.round(pet.max * hm); pet.hp = pet.max; logEvent('left', _t("{0}: поводок придаёт сил", [petName()])); }
    if (tr.hpMult > 1) { pet.max = Math.round(pet.max * tr.hpMult); pet.hp = pet.max; }
    if (tr.defense) pet.stats = Gear.combine(pet.stats, { defense: tr.defense });
    pet.fedBonus = Math.max(Pets.useFeed(Profile.pet()), tr.power);
    if (tr.hpMult > 1 || tr.defense) logEvent('left', _t("{0}: угощение даёт {1}{2}{3}", [petName(), tr.hpMult > 1 ? _t("больше здоровья") : '', tr.hpMult > 1 && tr.defense ? _t(" и ") : '', tr.defense ? _t("крепче броню") : '']));
    Profile.save();
    if (pet.fedBonus > 1) logEvent('left', _t("{0} сыт: удары сильнее на {1}% в этом бою", [petName(), Math.round((pet.fedBonus - 1) * 100)])); }
  if (false) { pet.fedBonus = Pets.useFeed(Profile.pet()); Profile.save(); if (pet.fedBonus > 1) logEvent('left', _t("{0} сыт: удары сильнее на {1}% в этом бою", [petName(), Math.round((pet.fedBonus - 1) * 100)])); }
  petFell = false;
  renderPetPanel();
}

function renderPetPanel() {
  const el = petEl();
  if (!el) return;
  if (!pet) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('fallen', !petAlive());
  el.querySelector('.fname').textContent = petName() + (petAlive() ? '' : _t(" (пал в бою)"));
  el.querySelector('.hpbar i').style.width = Math.max(0, (pet.hp / pet.max) * 100) + '%';
  el.querySelector('.hptext').textContent = `${Math.max(0, pet.hp)} / ${pet.max}`;
}

// Автоатака питомца по тому же монстру, которого бьёт игрок — настоящий второй боец (Combat.hit целиком,
// с блоком/бронёй/рикошетом — см. pets.js: petAttackAmount), а не множитель урона героя. Не требует ввода игрока.
async function petTurn() {
  if (!petAlive() || over) return;
  await sleep(450);
  const r = Combat.hit(pet, Combat.enemyTarget(fighters.right), Pets.petAttackAmount(pet));   // живой двойник гриба прикрывает оригинал
  if (r.kind === 'blockreflect') {
    logEvent('left', _t("{0}: удар заблокирован и отражён, питомец получает {1}", [petName(), r.amount]));
  } else if (r.kind === 'block') {
    logEvent('left', _t("{0}: удар заблокирован", [petName()]));
  } else if (r.kind === 'reflect') {
    logEvent('left', _t("{0}: удар отлетел рикошетом, питомец получает {1}", [petName(), r.amount]));
  } else {
    showDamage('right', r.amount);
    logEvent('left', _t("{0}: атакует — урон {1}", [petName(), r.amount]));
  }
  renderFighters();
  if (checkEnd()) { renderPetPanel(); return; }
  if (pet.hp <= 0) {
    petFell = true;
    logEvent('left', _t("{0} пал в бою — дальше вы сражаетесь одни", [petName()]));
  }
  renderPetPanel();
}

// Передаёт ход противнику: если питомец жив и в строю, он успевает атаковать первым (см. Combat.turnOrder —
// питомец всегда действует сразу после хода героя, перед ходом монстра, и выпадает из очереди, если погиб).
async function passToEnemy() {
  if (over) return;
  if (Combat.turnOrder(true, petAlive()).includes('pet')) await petTurn();
  if (over) return;
  await enemyTurn();
}

/* ---------- двойник Дикого гриба (Спороносец, см. Combat.makeClone) ----------
   Зеркало питомца на стороне противника: боец двойника живёт в fighters.right.clone (null — двойника нет).
   Споры (fighters.right.spores) копятся в resolveBoard('right'); двойник встаёт в начале хода гриба
   (Combat.monsterTurnStart 'clone'), бьёт героя сразу после хода оригинала (Combat.turnOrder, cloneTurn)
   и принимает на себя удары героя и питомца (Combat.enemyTarget в dealDamage/petTurn). */
const CLONE_NAME = _t("Двойник гриба");
const cloneEl = () => document.getElementById('clone-panel');

function renderClonePanel() {
  const el = cloneEl(), f = fighters.right, c = f.clone;
  if (!el) return;
  if (c && c.hp <= 0 && !c.fallLogged) {          // двойник только что пал — одна строка в журнал
    c.fallLogged = true;
    logEvent('left', _t("{0} рассыпается спорами{1}", [CLONE_NAME, f.hp > 0 ? _t(" — дальше бой с оригиналом") : '']));
  }
  if (!Combat.cloneAlive(f)) { el.hidden = true; return; }
  el.hidden = false;
  const av = el.querySelector('.clone-av');
  if (!av.dataset.id) { av.innerHTML = MonsterArt.bust(f.monsterId, f.tier); av.dataset.id = f.monsterId; }   // бледный портрет оригинала
  el.querySelector('.fname').textContent = CLONE_NAME;
  el.querySelector('.hpbar i').style.width = Math.max(0, (c.hp / c.max) * 100) + '%';
  el.querySelector('.hptext').textContent = `${Math.max(0, c.hp)} / ${c.max}`;
}

// Автоатака двойника по герою (питомца не трогает) — как petTurn: Combat.hit целиком, без поля и без ввода.
async function cloneTurn() {
  const f = fighters.right;
  if (over || !Combat.cloneAlive(f)) return;
  await sleep(450);
  const r = Combat.hit(f.clone, fighters.left, Combat.cloneAttackAmount(f.clone));
  if (r.kind === 'block') {
    showFloat('left', _t("Блок!"), 'block');
    logEvent('right', _t("{0}: удар заблокирован", [CLONE_NAME]));
  } else if (r.kind === 'reflect' || r.kind === 'mirror' || r.kind === 'blockreflect') {
    logEvent('right', _t("{0}: удар отлетел обратно, двойник получает {1}", [CLONE_NAME, r.amount]));
  } else {
    showDamage('left', r.amount);
    Sound.hit(r.amount);
    logEvent('right', _t("{0}: бьёт — урон {1}", [CLONE_NAME, r.amount]));
  }
  renderFighters();
  renderClonePanel();
  checkEnd();
}

// Открыто ли заклинание: по уровню героя; в обучении все нужные заклинания доступны.
const spellOpen = (kind) => (typeof TUT === 'function' && TUT()) || Hero.isSpellUnlocked(kind, Profile.level());

function spellDisabled(kind, on, ready) {
  const f = fighters.left;
  if (busy || over) return true;
  if (!spellOpen(kind)) return true;   // не открыто по уровню героя
  if (kind === 'lightning') return aiming || (!on && !ready);
  if (kind === 'fire' || kind === 'transmute' || kind === 'square' || kind === 'chaos' || kind === 'pierce') return (aiming && !on) || (!on && !ready);
  if (aiming || f.magic || !ready) return true;            // heal, chaos, strike, mirror, tide, sacrifice, divination
  if (kind === 'heal' && f.hp >= f.max) return true;
  if (kind === 'fury' && !furyState().ok) return true;      // родной цвет не господствует на поле
  return false;
}

function renderMagic() {
  const f = fighters.left;
  for (const kind of Object.keys(MAGICS)) {
    const btn = spellbarEl.querySelector(`button.${kind}`);
    if (!btn) continue;
    const ready = canAffordMagic('left', kind);
    const on = kind === 'lightning' ? f.magic : (aiming && aimKind === kind);
    btn.classList.toggle('on', on);
    btn.classList.toggle('ready', ready && !on);
    // Подпись на кнопке убрана (экономит место в бою); название, описание, цена и текущее состояние
    // («Отмена»/«Выберите цель») уходят во всплывающую подсказку title при наведении.
    const state = on ? (kind === 'lightning' ? _t("Отмена") : _t("Выберите цель")) : '';
    const cost = magicCostOf('left', kind);
    const needLvl = Balance.spellUnlock[kind];
    const locked = needLvl && !spellOpen(kind);
    btn.title = locked ? _t("{0} — откроется на уровне {1}", [MAGICS[kind].name, needLvl])
      : state ? `${MAGICS[kind].name} — ${state}` : _t("{0}: {1} (по {2} камней каждого вида)", [MAGICS[kind].name, MAGICS[kind].tip, cost]);
    if (kind === 'fury' && !locked && grid && grid[0]) {
      const fs = furyState();
      if (!fs.ok) btn.title += _t("\nНужно, чтобы камней вашего цвета ({0}) на поле было больше, чем любого другого, с учётом номиналов (сейчас: {1} против {2})", [GEM_NAMES[GEM_TYPES[fs.home]], fs.mine, fs.other]);
    }
    btn.innerHTML = spellIconHtml(kind, 'bar-' + kind);
    btn.classList.toggle('locked', !!locked);
    btn.classList.toggle('new-spell', !!(needLvl && !locked && Profile.data.spellSeen && !Profile.data.spellSeen[kind]));
    btn.disabled = spellDisabled(kind, on, ready);
  }
  renderFactionButton();
  const title = document.querySelector('.spell-title');
  if (title) title.textContent = _t("Магия: цена зависит от заклинания (см. подсказку)");
  renderBadge('left');
  renderBadge('right');
  renderBag();
}

function renderBadge(side) {
  const f = fighters[side];
  const badge = fEl(side).querySelector('.badge');
  if (!badge) return;
  const parts = [];
  if (f.magic) parts.push(_t("Шаровая молния"));
  for (const b of f.buffs) parts.push(b.untilTurnEnd ? _t("{0} (до конца хода)", [BUFF_NAMES[b.kind] || _t("Усиление")]) : `${BUFF_NAMES[b.kind] || _t("Усиление")} (${b.turns})`);
  if (f.poison && f.poison.turns > 0) parts.push(_t("Яд ({0})", [f.poison.turns]));
  if (f.haste) parts.push(_t("Спешка"));
  // Спороносец: счётчик спор до следующего двойника (пока лимит двойников за бой не исчерпан).
  if (side === 'right' && f.ability === 'clone' && (f.clonesMade || 0) < Balance.abilities.clone.max) parts.push(_t("Споры {0}/{1}", [f.spores || 0, Balance.abilities.clone.charge]));
  badge.textContent = parts.join(' · ');
  renderGear(side);
  if (side === 'right') renderEnemyColumn();
}

/* ---------- столбец противника (только оформление «3», body.ui-columns) ----------
   Зеркало столбца заклинаний героя по другую сторону поля. У существ заклинаний нет, поэтому здесь его
   собственное: приём (с отсчётом до срабатывания, если он «каждый N-й ход»), действующие на него эффекты
   (f.buffs, яд, молния, спешка), споры Спороносца и расходники противника (f.bag). Подробности — в title.
   В оформлениях «1» и «2» столбец скрыт CSS-ом и не рисуется вовсе. */
const enemyColEl = document.getElementById('enemy-col');
const EC_GLYPH = {
  shield: '<path d="M12 3l7 3v5c0 5-3.4 8.2-7 10-3.6-1.8-7-5-7-10V6z"/>',
  spikes: '<path d="M3 19h18M5 19l2.5-8L10 19M10 19l2-11 2 11M14 19l2.5-8L19 19"/>',
  power:  '<path d="M12 3v13M7 8l5-5 5 5M8 20h8"/>',
  down:   '<path d="M12 21V8M7 16l5 5 5-5M8 4h8"/>',
  drop:   '<path d="M12 3c4 6 6.5 9 6.5 12.2a6.5 6.5 0 0 1-13 0C5.5 12 8 9 12 3z"/><path d="M9.5 15.5a2.6 2.6 0 0 0 2.5 2.5"/>',
  bolt:   '<path d="M13 2L4.5 13.5h6.5L10 22l9-12h-6.5z"/>',
  sand:   '<path d="M6 3h12M6 21h12M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
  spores: '<circle cx="8" cy="9" r="2.6"/><circle cx="15.5" cy="7" r="1.8"/><circle cx="15" cy="15" r="3"/><circle cx="7.5" cy="17" r="1.6"/>',
};
const ecSvg = (g) => `<svg class="ec-glyph" viewBox="0 0 24 24" aria-hidden="true">${EC_GLYPH[g]}</svg>`;
// Подпись «через N ход/хода/ходов».
const turnsWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? _t("ход") : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? _t("хода") : _t("ходов"));
// Свои имена эффектов для столбца (у BUFF_NAMES нет Изворотливости и Возмездия — бейдж «1/2» не трогаем).
const EC_BUFFS = {
  power: ['power', _t("Боевой настой"), _t("урон выше")], banner: ['power', _t("Знамя"), _t("урон выше")], howl: ['power', _t("Вой"), _t("удар сильнее")],
  weaken: ['down', _t("Морок"), _t("урон слабее")], mire: ['down', _t("Трясина"), ''], sap: ['down', _t("Смола"), ''],
  evasion: ['shield', _t("Изворотливость"), _t("Блок")], retribution: ['spikes', _t("Возмездие"), _t("Рикошет")],
};

function renderEnemyColumn() {
  if (!enemyColEl) return;
  if (!document.body.classList.contains('ui-columns')) { enemyColEl.innerHTML = ''; return; }
  const f = fighters.right;
  const tile = (cls, inner, title, num) =>
    `<div class="ec-tile ${cls}" title="${title.replace(/"/g, '&quot;')}">${inner}${num !== undefined && num !== '' ? `<b>${num}</b>` : ''}</div>`;
  const top = [];
  // Приём существа: значок с первой буквой названия; «каждый N-й ход» — число ходов до срабатывания.
  const ab = f.ability && Bestiary.ability(f.monsterId);
  if (ab) {
    const A = Balance.abilities[f.ability] || {};
    let num = '', state = '', cls = 'ability';
    if (A.every) {
      const left = A.every - ((f.turnNo || 0) % A.every);
      num = left;
      state = _t("\nСработает через {0} {1} противника", [left, turnsWord(left)]);
    }
    if (f.ability === 'rage' && f.hp > 0 && f.hp < f.max * A.below) { cls += ' hot'; state = _t("\nСейчас в ярости!"); }
    if ((f.ability === 'undying' && f.revived) || (f.ability === 'charge' && f.charged)) { cls += ' spent'; state = _t("\nУже использован в этом бою"); }
    if (f.ability === 'pinch' && f.stats.block) state += _t("\nБлок сейчас: {0}%", [f.stats.block]);
    top.push(tile(cls, `<i class="ec-letter">${ab.name[0]}</i>`, _t("Приём: {0}\n{1}{2}", [ab.name, ab.desc, state]), num));
  }
  // Споры Спороносца — пока не исчерпан лимит двойников за бой.
  if (f.ability === 'clone' && (f.clonesMade || 0) < Balance.abilities.clone.max) {
    const C = Balance.abilities.clone;
    top.push(tile('spores', ecSvg('spores'), _t("Споры {0}/{1}: набрав {2}, гриб выпустит двойника", [f.spores || 0, C.charge, C.charge]), `${f.spores || 0}`));
  }
  // Эффекты на самом противнике. Одинаковые складываются в один значок (срабатывания подряд у Изворотливости/Возмездия).
  const groups = new Map();
  for (const b of f.buffs) {
    const g = groups.get(b.kind) || { n: 0, amount: 0, turns: 0, untilTurnEnd: false };
    g.n++; g.amount += b.amount || 0; g.turns = Math.max(g.turns, b.turns || 0); g.untilTurnEnd = g.untilTurnEnd || b.untilTurnEnd;
    groups.set(b.kind, g);
  }
  for (const [kind, g] of groups) {
    const [glyph, name, what] = EC_BUFFS[kind] || ['power', BUFF_NAMES[kind] || _t("Усиление"), ''];
    const amt = g.amount ? ` ${what ? what + ' ' : ''}${g.amount > 0 ? '+' : ''}${g.amount}%` : '';
    const dur = g.untilTurnEnd ? _t("до конца хода") : _t("ещё {0} {1}", [g.turns, turnsWord(g.turns)]);
    top.push(tile('buff' + (glyph === 'down' ? ' bad' : ''), ecSvg(glyph), `${name}${g.n > 1 ? ' ×' + g.n : ''}:${amt}, ${dur}`, g.untilTurnEnd ? '' : g.turns));
  }
  if (f.magic) top.push(tile('buff', ecSvg('bolt'), _t("Шаровая молния: в этот ход любые собранные им камни наносят урон")));
  if (f.haste) top.push(tile('buff', ecSvg('sand'), _t("Спешка: следующий ход даст ему дополнительный ход")));
  if (f.poison && f.poison.turns > 0) top.push(tile('bad', ecSvg('drop'), _t("Яд: теряет по {0} ХП в начале хода, ещё {1} {2}", [f.poison.dmg, f.poison.turns, turnsWord(f.poison.turns)]), f.poison.turns));
  // Расходники противника (Combat.enemyBag) — внизу столбца, напротив ранца героя.
  const bag = Object.entries(f.bag || {}).filter(([k, n]) => n > 0 && Gear.CONSUMABLES[k])
    .map(([k, n]) => tile('bag', itemIcon(k), _t("{0} у противника: {1} шт.\n{2}", [Gear.CONSUMABLES[k].name, n, Gear.CONSUMABLES[k].desc]), n));
  enemyColEl.innerHTML = `<div class="ec-group">${top.join('')}</div><div class="ec-group ec-bag">${bag.join('')}</div>`;
}

/* ---------- приём фракции ---------- */
const CHARGE = Balance.faction.charge;
function addCharge(n) {
  const f = fighters.left, was = f.charge || 0;
  f.charge = Math.min(CHARGE, was + n);
  if (was < CHARGE && f.charge >= CHARGE) note(_t("{0} готов!", [playerFaction().ability.name]));
  renderFactionButton();
}

function renderFactionButton() {
  const btn = spellbarEl.querySelector('button.fac');
  if (!btn) return;
  const fac = playerFaction(), f = fighters.left, charge = f.charge || 0, full = charge >= CHARGE;
  const on = aiming && aimKind === 'growth';
  btn.style.setProperty('--fc', fac.color);
  btn.classList.toggle('ready', full && !on);
  btn.classList.toggle('on', on);
  // Подпись на кнопке убрана (экономит место в бою) — название, описание и заряд уходят в title при наведении.
  btn.title = on ? _t("{0} — Выберите столбец", [fac.ability.name])
    : _t("{0}: {1}. Заряжается камнями «{2}» ({3}/{4}). Ход не тратит.", [fac.ability.name, fac.ability.desc, GEM_NAMES[fac.gem], charge, CHARGE]);
  btn.innerHTML = `${spellIconHtml('faction', 'bar-faction')}
    <i class="charge"><b style="width:${Math.round(charge / CHARGE * 100)}%"></b></i>`;
  btn.disabled = !on && (busy || over || !full || (aiming && aimKind !== 'growth'));
}

// Приёмы фракций ход не тратят: их цена — заряд из родных камней.
async function useFactionAbility() {
  const fac = playerFaction(), f = fighters.left;
  if (aiming && aimKind === 'growth') { stopAim(); note(_t("Ваш ход")); return; }
  if (busy || over || (f.charge || 0) < CHARGE) return;
  const id = fac.ability.id;
  if (id === 'growth') { toggleAim('growth'); renderFactionButton(); return; }
  f.charge = 0;
  const F = Balance.faction;
  if (id === 'banner') {
    f.buffs.push({ kind: 'banner', amount: F.banner.power, turns: F.banner.turns });
    showFloat('left', _t("Знамя!"), 'buff');
    Sound.lightning();
    logEvent('left', _t("{0}: Знамя — +{1}% к урону на {2} хода", [f.name, F.banner.power, F.banner.turns]));
    note(_t("Знамя поднято: +{0}% к урону на {1} хода", [F.banner.power, F.banner.turns]));
  } else if (id === 'venom') {
    const e = fighters.right, dmg = Combat.venomTick(Combat.power(f), f.dmg);
    e.poison = { turns: F.venom.turns, dmg };
    showFloat('right', _t("Яд!"), 'venom');
    Sound.transmute();
    logEvent('left', _t("{0}: Ядовитый укус — {1} урона в начале каждого из {2} ходов противника", [f.name, dmg, F.venom.turns]));
    note(_t("Яд: {0} будет терять по {1} ХП {2} хода", [e.name, dmg, F.venom.turns]));
  } else if (id === 'hammer') {
    busy = true;
    renderMagic();
    await runeHammer();
    busy = false;
  }
  renderMagic();
  renderFighters();
  if (TUT()) Tutorial.event('ability');
}

// Рунный молот: три камня (не обсидиан) становятся обсидианом x3 так, чтобы не собралась готовая линия.
async function runeHammer() {
  const picked = [], H = Balance.faction.hammer;
  const cand = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c] && grid[r][c].ti !== ONYX) cand.push({ r, c });
  while (picked.length < H.stones && cand.length) {
    const { r, c } = cand.splice(rnd(cand.length), 1)[0];
    if (makesLine(r, c, ONYX)) continue;
    const old = grid[r][c];
    grid[r][c] = { type: 'onyx', ti: ONYX, value: H.value, el: old.el };  // для проверки следующих камней
    picked.push({ r, c, old });
  }
  Sound.transmute();
  logEvent('left', _t("{0}: Рунный молот — {1} камня стали обсидианом x{2}", [fighters.left.name, picked.length, H.value]));
  note(_t("Рунный молот!"));
  for (const p of picked) p.old.el.classList.add('morph');
  await sleep(600);
  for (const { r, c, old } of picked) {
    old.el.remove();
    grid[r][c] = createTile({ type: 'onyx', ti: ONYX, value: H.value }, r, c);
    grid[r][c].el.classList.add('arrive');
  }
  await sleep(350);
  if (!Engine.hasMoves(typOf())) await refillBoard();
}

// Дикий рост (эльфы): выбранный камень и до двух соседних становятся изумрудами; номинал растёт с уровнем героя.
// Ход приём не тратит; если из новых камней сложились линии — они собираются сразу (как после обычного хода).
async function castGrowth(cell) {
  stopAim();
  if (!grid[cell.r] || !grid[cell.r][cell.c]) { note(_t("Выберите камень, а не пустую клетку")); return; }
  stopTurnTimer();
  try { await growthBody(cell); } finally {
    busy = false;
    renderMagic();
    renderFighters();
    if (!over) { note(_t("Ваш ход")); startTurnTimer(); }
    if (TUT()) Tutorial.event('ability');
  }
}
async function growthBody(cell) {
  const f = fighters.left, G = Balance.faction.growth;
  const gem = playerFaction().gem, ti = GEM_TYPES.indexOf(gem);
  let value = G.value;
  for (const [lvl, v] of Object.entries(G.valueFrom)) if (Profile.level() >= Number(lvl)) value = v;
  f.charge = 0;
  busy = true;
  renderMagic();
  const near = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => ({ r: cell.r + dr, c: cell.c + dc }))
    .filter((p) => p.r >= 0 && p.c >= 0 && p.r < N && p.c < N && grid[p.r][p.c]);
  const picks = [cell];
  while (picks.length < G.stones && near.length) picks.push(near.splice(rnd(near.length), 1)[0]);
  note(_t("Дикий рост!"));
  Sound.heal();
  logEvent('left', _t("{0}: Дикий рост — {1} камня стали изумрудами x{2}", [f.name, picks.length, value]));
  for (const p of picks) grid[p.r][p.c].el.classList.add('morph');
  await sleep(600);
  for (const { r, c } of picks) {
    grid[r][c].el.remove();
    grid[r][c] = createTile({ type: gem, ti, value }, r, c);
    grid[r][c].el.classList.add('arrive');
  }
  await sleep(350);
  if (hasMatches()) {
    turnStats = { stones: 0, dmg: 0, bonus: 1 };
    await resolveBoard('left');
    logTurn('left');
    if (flushTurnDamage()) await sleep(500);
    if (checkEnd()) return;
  }
  if (isEmptyBoard() || !Engine.hasMoves(typOf())) await refillBoard();
}

function spendMagic(side, sign, kind = 'lightning') {   // sign: -1 списать, +1 вернуть
  for (const t of MAGIC_TYPES) fighters[side].counts[t] += sign * magicCostOf(side, kind);
  renderCounters(side);
}

// Игрок включает/выключает Магию перед своим ходом.
function toggleMagic() {
  if (busy || over || aiming) return;
  const f = fighters.left;
  if (f.magic) {                                   // отмена: возвращаем ровно уплаченное (цена могла измениться от снаряжения)
    const paid = f.magicFree ? 0 : (f.magicPaid || magicCostOf('left', 'lightning'));   // Зелье грозы — бесплатно, и возврата нет
    for (const t of MAGIC_TYPES) f.counts[t] += paid;
    f.magic = false; f.magicPaid = 0; f.magicFree = false;
    renderCounters('left');
  } else if (canAffordMagic('left', 'lightning')) { f.magicPaid = magicCostOf('left', 'lightning'); f.magic = true; spendMagic('left', -1, 'lightning'); }
  renderMagic();
  if (f.magic) { Sound.lightning(); logEvent('left', _t("Игрок включил Шаровую молнию")); if (TUT()) Tutorial.event('lightning'); }
  note(f.magic ? _t("Шаровая молния: каждый собранный камень наносит урон") : _t("Ваш ход"));
}

/* ---------- урон, ход, сообщения ---------- */

function showDamage(side, amount) {
  const s = document.createElement('div');
  s.className = 'dmg';
  s.textContent = '-' + amount;
  fEl(side).appendChild(s);
  setTimeout(() => s.remove(), 900);
}


// Плавающая надпись над бойцом (Блок!, Рикошет!).
function showFloat(side, text, cls) {
  const s = document.createElement('div');
  s.className = 'dmg ' + cls;
  s.textContent = text;
  fEl(side).appendChild(s);
  setTimeout(() => s.remove(), 1000);
}

// Сообщение о восставшем «Неупокоенном» скелете.
function onRevived(side) {
  const f = fighters[side];
  showFloat(side, _t("Восстал!"), 'heal');
  logEvent(side, _t("{0}: Неупокоенный — встаёт с {1} ХП", [f.name, f.hp]));
  note(_t("{0} восстаёт!", [f.name]));
}
// Снимает ХП без модификаторов (яд, штраф). «Неупокоенный» один раз встаёт вместо смерти.
function loseHp(side, amount) {
  if (Combat.loseHp(fighters[side], amount)) onRevived(side);
}

// Наносит урон по правилам боя (combat.js): Сила и рост урона, Натиск, Блок, Броня, Подлый удар, Рикошет,
// Кровопийца, Неупокоенный. raw = true — урон без модификаторов (штраф, яд). Возвращает урон, который получила цель.
// cover = true: по противнику сначала бьёт живой двойник Дикого гриба (Combat.enemyTarget), перебор урона на
// оригинал не переходит; яд передаёт cover = false — он всегда жжёт того, на кого наложен (оригинал).
// 1.3.6: побочный эффект действующего эликсира (с 5-го цвета)
function elxSide(kind) { const a = Profile.data.elixirs && Profile.data.elixirs.active[kind]; return !!(a && a.left > 0 && a.tier >= 5); }

// Эликсир брони (5+): герой невосприимчив к Мороку, Трясине и Смоле — снимаем только что наложенное.
function elxImmune(kind) {
  if (!elxSide('defense')) return false;
  const b = fighters.left.buffs, i = b.map((x) => x.kind).lastIndexOf(kind);
  if (i >= 0) b.splice(i, 1);
  showFloat('left', _t("Не берёт!"), 'buff'); logEvent('left', _t("Эликсир брони: {0} не действует", [BUFF_NAMES[kind]]));
  return true;
}

function dealDamage(target, amount, raw = false, cover = true) {
  if (amount <= 0) return 0;
  const attackerSide = other(target), attacker = fighters[attackerSide];
  const victim = target === 'right' && cover ? Combat.enemyTarget(fighters.right) : fighters[target];
  if (!raw && attackerSide === 'left') {                       // эликсиры силы и блока (5+)
    if (elxSide('power') && victim.buffs && victim.buffs.some((b) => b.kind === 'weaken') || (elxSide('power') && victim.poison && victim.poison.turns > 0)) amount = Math.round(amount * 1.1);
    if (attacker.elxBlockNext) { amount = Math.round(amount * 1.1); attacker.elxBlockNext = false; }
  }
  const r = Combat.hit(attacker, victim, amount, raw);
  if (r.charged) showFloat(attackerSide, _t("Натиск!"), 'buff');
  if (r.pierceBlock) showFloat(attackerSide, _t("Пробивной болт!"), 'buff');
  if (target === 'left' && (r.kind === 'block' || r.kind === 'blockreflect') && elxSide('block')) victim.elxBlockNext = true;
  if (target === 'left' && (r.kind === 'reflect' || r.kind === 'blockreflect') && elxSide('ricochet')) {   // эликсир рикошета: отражённый удар лечит на 5%
    const h = Math.max(1, Math.round(victim.max * 0.05)); victim.hp = Math.min(victim.max, victim.hp + h); showFloat('left', '+' + h, 'heal');
  }
  if (r.kind === 'blockreflect') {              // 1.3.8: удар заблокирован и ещё отражён атакующему
    showFloat(target, _t("Блок + Рикошет!"), 'ricochet');
    showDamage(attackerSide, r.amount);
    if (r.attackerRevived) onRevived(attackerSide);
    turnEvents.block++;
    turnEvents.blockTarget = target;
    turnEvents.reflected += r.amount;
    turnEvents.attacker = attackerSide;
    renderFighters();
    Sound.hit(r.amount);
    shake();
    return 0;
  }
  if (r.kind === 'block') {
    showFloat(target, _t("Блок!"), 'block');
    turnEvents.block++;
    turnEvents.blockTarget = target;
    Sound.swap();
    return 0;
  }
  if (r.pierce) showFloat(attackerSide, _t("Подлый удар!"), 'buff');
  if (r.shred > 0) showFloat(target, _t("Броня трещит!"), 'debuff');
  if (r.crit && attackerSide === 'left' && elxSide('fury')) { const h = Math.max(1, Math.round(attacker.max * 0.03)); attacker.hp = Math.min(attacker.max, attacker.hp + h); showFloat('left', '+' + h, 'heal'); }
  if (r.crit) { showFloat(attackerSide, _t("Ярость! ×2"), 'crit'); logEvent(attackerSide, _t("{0}: Ярость — двойной урон!", [attacker.name])); }
  if (r.kind === 'reflect') {
    showFloat(target, _t("Рикошет!"), 'ricochet');
    showDamage(attackerSide, r.amount);
    if (r.attackerRevived) onRevived(attackerSide);
    turnEvents.reflected += r.amount;
    turnEvents.attacker = attackerSide;
    renderFighters();
    Sound.hit(r.amount);
    shake();
    return 0;
  }
  if (target === 'left' && victim.hp <= 0 && !victim.elxSaved && elxSide('health')) {   // эликсир жизни: раз за бой выживаем с 1 ХП
    victim.elxSaved = true; victim.hp = 1; showFloat('left', _t("Выжил!"), 'heal'); logEvent('left', _t("{0}: Эликсир жизни — выживание с 1 ХП", [victim.name]));
  }
  showDamage(target, r.amount);
  if (r.revived) onRevived(target);
  turnDamage.target = target;
  turnDamage.amount += r.amount;
  if (r.heal > 0) showFloat(attackerSide, '+' + r.heal, 'heal');
  renderFighters();
  Sound.hit(r.amount);
  if (r.amount >= victim.max * 0.1) shake();
  return r.amount;
}

// Большая цифра по центру поля: сколько урона нанесено за ход.
function showCenterPop(text, kind, caption) {
  const pop = document.createElement('div');
  pop.className = 'center-pop ' + kind;
  pop.innerHTML = `${text}<small>${caption}</small>`;
  boardEl.appendChild(pop);
  setTimeout(() => pop.remove(), 1300);
}

// Вызывается в конце хода: показывает итоговый урон, блоки и рикошеты и обнуляет счётчики.
// true — что-то показано.
function flushTurnDamage() {
  const d = turnDamage, ev = turnEvents;
  turnDamage = { target: null, amount: 0 };
  turnEvents = { block: 0, blockTarget: null, reflected: 0, attacker: null };
  const who = (side) => (side === 'right' ? _t("по противнику") : _t("по игроку"));
  let shown = false;
  if (d.amount > 0) { showCenterPop('-' + d.amount, 'dmg', who(d.target)); shown = true; }
  if (ev.reflected > 0) {
    setTimeout(() => showCenterPop(_t("Рикошет -") + ev.reflected, 'ricochet', who(ev.attacker)), shown ? 500 : 0);
    logEvent(ev.attacker, _t("{0}: рикошет, {1} получает {2}", [fighters[other(ev.attacker)].name, fighters[ev.attacker].name, ev.reflected]));
    shown = true;
  }
  if (ev.block > 0) {
    logEvent(ev.blockTarget, _t("{0}: блок ×{1}", [fighters[ev.blockTarget].name, ev.block]));
    if (!shown) { showCenterPop(_t("Блок!"), 'block', fighters[ev.blockTarget].name); shown = true; }
  }
  return shown;
}

function shake() {
  const g = document.querySelector('.game');
  g.classList.remove('shake');
  void g.offsetWidth;
  g.classList.add('shake');
}

/* ---------- журнал ходов ---------- */

function logEvent(side, text) {
  const list = document.getElementById('log');
  if (!list) return;
  const li = document.createElement('li');
  li.className = side;
  li.textContent = text;
  list.prepend(li);
  // Свёрнутый журнал (см. .log-wrap) можно раскрыть и прокрутить, поэтому храним куда больше 6 строк.
  while (list.children.length > 40) list.lastChild.remove();
}

function logTurn(side) {
  const t = turnStats;
  if (!t.stones) return;
  const parts = [_t("собрано {0}", [t.stones])];
  if (t.bonus > 1) parts.push(_t("линия x{0}", [t.bonus]));
  if (t.dmg) parts.push(_t("урон {0}", [t.dmg]));
  logEvent(side, `${fighters[side].name}: ${parts.join(', ')}`);
}

let turnSide = 'left';
function setTurn(side) {
  if (side !== turnSide) {
    Combat.clearTurnEndBuffs(fighters[turnSide]);   // эликсир силы и т.п. — до конца хода
    fighters[turnSide].magic = false;               // Шаровая молния тоже гаснет, когда ход переходит
    fighters[turnSide].magicPaid = 0;
    fighters[turnSide].magicFree = false;
  }
  turnSide = side;
  if (side === 'left') fighters.left.ammoShot = false;     // боеприпас: один выстрел за свой ход
  fEl('left').classList.toggle('active', side === 'left');
  fEl('right').classList.toggle('active', side === 'right');
  statusEl.textContent = side === 'left' ? _t("Ваш ход") : _t("Противник думает…");
  boardEl.classList.toggle('enemy-turn', side === 'right');   // поле темнее, пока ходит противник
  renderMagic();
  if (side === 'left' && !over) startTurnTimer(); else stopTurnTimer();
}

/* ---------- таймер хода ---------- */

function renderTurnTimer() {
  if (!timerEl) return;
  timerEl.hidden = false;
  timerEl.textContent = _t("Ход истекает через {0} с", [turnTimerLeft]);
  timerEl.classList.toggle('low', turnTimerLeft <= 10);
}

function stopTurnTimer() {
  if (turnTimerHandle) clearInterval(turnTimerHandle);
  turnTimerHandle = null;
  if (timerEl) timerEl.hidden = true;
}

function startTurnTimer() {
  stopTurnTimer();
  if (TUT()) return;                               // в обучении таймера нет — учимся без спешки
  turnTimerLeft = Combat.TURN_TIMER.seconds;
  renderTurnTimer();
  turnTimerHandle = setInterval(() => {
    turnTimerLeft--;
    if (turnTimerLeft <= 0) { onTurnTimeout(); return; }
    renderTurnTimer();
  }, 1000);
}

// Ход игрока не сделан вовремя: ход автоматически передаётся противнику (та же дорога, что и обычный
// ход), а подряд идущие пропуски считаются — на третьем подряд объявляется поражение (Combat.registerSkip).
async function onTurnTimeout() {
  stopTurnTimer();
  if (busy || over || turnSide !== 'left') return;
  if (aiming) stopAim();
  endPlayerAction();
  const r = Combat.registerSkip(skipStreak);
  skipStreak = r.skips;
  logEvent('left', _t("Игрок: ход пропущен по таймеру ({0}/{1} подряд)", [skipStreak, Combat.TURN_TIMER.skipLimit]));
  if (r.defeated) { showOverlay(_t("Поражение")); return; }
  note(_t("Ход пропущен по таймеру ({0}/{1} подряд)", [skipStreak, Combat.TURN_TIMER.skipLimit]));
  busy = true;
  await passToEnemy();
}

let noteTimer = null;
function note(text) {
  statusEl.textContent = text;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    if (over) return;
    const f = fighters[turnSide];
    statusEl.textContent = turnSide === 'left'
      ? (f.magic ? _t("Ваш ход (Шаровая молния включена)") : _t("Ваш ход"))
      : _t("Ход противника…");
  }, 1400);
}

function showOverlay(text, sub = '') {
  stopTurnTimer();
  hideOverlay();
  const o = document.createElement('div');
  o.className = 'overlay';
  o.id = 'overlay';
  o.innerHTML = _t("<div>{0}{1}<button type=\"button\" class=\"primary to-map\">На карту</button></div>", [text, sub ? `<small>${sub}</small>` : '']);
  const result = text === _t("Победа!") ? 'win' : 'loss';
  o.querySelector('.to-map').addEventListener('click', () => MapView.returnFromBattle(result));
  boardEl.appendChild(o);
  over = true;
  // Поражение с питомцем в бою (взят в бой, хоть бы уже и павшим по ходу схватки) — питомец теряет
  // 1 прочность (см. Pets.loseDurability); победа и отступление прочность не трогают.
  if (text === _t("Поражение") && pet) Profile.petLoseDurability();
  if (text === _t("Поражение")) Profile.tickElixirs();
  logEvent(text === _t("Победа!") ? 'left' : 'right', text);
  if (text === _t("Победа!")) Sound.win(); else Sound.lose();
  statusEl.textContent = text;
  renderMagic();
}
function hideOverlay() {
  const o = document.getElementById('overlay');
  if (o) o.remove();
  over = false;
}

/* ---------- поле ---------- */

function buildBoard() {
  boardEl.innerHTML = '';
  const bg = document.createElement('div');
  bg.className = 'cell-bg';
  for (let i = 0; i < N * N; i++) bg.appendChild(document.createElement('i'));
  boardEl.appendChild(bg);
  // Неяркое бело-голубоватое свечение, бегущее по швам между плитками (не по самим камням), пока ходит
  // игрок — тонкая полоска света пробегает вдоль каждой линии сетки, N+1 по горизонтали и по вертикали
  // (см. .turn-glow в CSS). Разный animation-delay на каждой линии — чтобы не мигали все разом.
  const glow = document.createElement('div');
  glow.className = 'turn-glow';
  for (let i = 0; i <= N; i++) {
    const h = document.createElement('i');
    h.className = 'seam seam-h';
    h.style.top = (i * 100 / N) + '%';
    h.style.animationDelay = (i * 0.22).toFixed(2) + 's';
    glow.appendChild(h);
    const v = document.createElement('i');
    v.className = 'seam seam-v';
    v.style.left = (i * 100 / N) + '%';
    v.style.animationDelay = (i * 0.22 + 0.5).toFixed(2) + 's';
    glow.appendChild(v);
  }
  boardEl.appendChild(glow);
  const cross = document.createElement('div');
  cross.className = 'cross';
  cross.hidden = true;
  cross.innerHTML = '<i class="row"></i><i class="col"></i><i class="sq"></i>';
  boardEl.appendChild(cross);
  const lk = document.createElement('div');
  lk.className = 'locks';
  boardEl.appendChild(lk);
}

/* ---------- скованные столбцы и туман ---------- */
function renderLocks() {
  const lk = boardEl.querySelector('.locks');
  if (!lk) return;
  const kind = locks.forSide === 'right' ? 'roots' : 'stone';
  lk.innerHTML = [...locks.cols].map((c) => `<i class="lock-col ${kind}" style="left:${c * 100 / N}%"></i>`).join('');
}
function setLock(col, forSide) {
  locks = { cols: new Set([col]), forSide };
  renderLocks();
}
function clearLocks(forSide) {
  if (forSide && locks.forSide !== forSide) return;
  locks = { cols: new Set(), forSide: null };
  renderLocks();
}
const isLocked = (side, cell) => locks.forSide === side && locks.cols.has(cell.c);
const lockedCells = (side) => {
  if (locks.forSide !== side) return null;
  const out = [];
  for (const c of locks.cols) for (let r = 0; r < N; r++) out.push(r * N + c);
  return out;
};
function veil(count) {
  const tiles = grid.flat().filter(Boolean);
  for (let k = 0; k < count && tiles.length; k++) {
    const t = tiles.splice(rnd(tiles.length), 1)[0];
    t.el.classList.add('veiled');
    veiled.add(t);
  }
}
function clearVeils() {
  for (const t of veiled) t.el.classList.remove('veiled');
  veiled.clear();
}
// Конец действия игрока: снимаются скованность его столбцов (Окаменение) и туман.
function endPlayerAction() {
  clearLocks('left');
  clearVeils();
}

const typOf = () => grid.flat().map((t) => (t ? t.ti : -1));
const valOf = () => grid.flat().map((t) => (t ? t.value : 0));

function setPos(tile, r, c) {
  tile.el.style.transform = `translate(${c * 100}%, ${r * 100}%)`;
}

// Ставит DOM-элемент на место по координатам grid; если клетка пуста
// (камень сдвинулся в другую сторону, а не сюда) — делать нечего.
function placeTile(pos) {
  const t = grid[pos.r][pos.c];
  if (t) setPos(t, pos.r, pos.c);
}

function createTile(data, r, c, fromRow = null) {
  const el = document.createElement('div');
  el.className = 'tile';
  const badge = data.value > 1 ? `<span class="mult x${data.value}">x${data.value}</span>` : '';
  el.innerHTML = `<div class="gem">${GEM_SVG[data.type]}${badge}</div>`;
  const tile = { type: data.type, ti: data.ti, value: data.value, el };
  boardEl.appendChild(el);
  if (fromRow === null) {
    setPos(tile, r, c);
  } else {
    el.classList.add('no-anim');
    setPos(tile, fromRow, c);
    void el.offsetWidth;
    el.classList.remove('no-anim');
    setPos(tile, r, c);
  }
  return tile;
}

function swapCells(a, b) {
  const t = grid[a.r][a.c];
  grid[a.r][a.c] = grid[b.r][b.c];
  grid[b.r][b.c] = t;
}

const hasMatches = () => Engine.bonusMap(typOf()) !== null;
const isEmptyBoard = () => grid.every((row) => row.every((x) => !x));

/* ---------- заполнение поля новыми камнями ---------- */

// Соберёт ли камень вида ti в клетке (r,c) готовую линию.
const makesLine = (r, c, ti) => Engine.makesLine(typOf(), r * N + c, ti);

// Заполняет все пустые клетки (engine.js): нет готовых линий и есть ход.
// Если оставшимися камнями этого не добиться — поле пересобирается целиком.
function fillEmpty() {
  const typ = typOf(), val = valOf();
  const res = Engine.fillEmpty(typ, val, Math.random, Balance.board.multiplierChance, GEM_TYPES.length);
  if (res.rebuilt) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { if (grid[r][c] && grid[r][c].el) grid[r][c].el.remove(); grid[r][c] = null; }
  }
  return res.cells.map((i) => {
    const r = Math.floor(i / N), c = i % N;
    grid[r][c] = { type: GEM_TYPES[typ[i]], ti: typ[i], value: val[i], el: null };
    return { r, c };
  });
}

function spawnFilled(cells) {
  const perCol = {};
  for (const { r, c } of [...cells].sort((a, b) => b.r - a.r)) {
    const k = perCol[c] = (perCol[c] ?? -1) + 1;
    grid[r][c] = createTile(grid[r][c], r, c, -1 - k);
  }
}

async function refillBoard() {
  note(_t("Новые камни"));
  spawnFilled(fillEmpty());
  await sleep(RULES.timing.spawn);
}

/* ---------- новая игра ---------- */

// 1.4.3: на телефоне в вертикальном положении кнопки заклинаний мелкие — подсказка повернуть (первые 3 боя).
function rotateHint() {
  try {
    if (!document.body.classList.contains('mode-battle')) return;                      // только в бою, не при загрузке страницы
    if (!window.matchMedia('(pointer: coarse) and (max-aspect-ratio: 5/4) and (max-width: 520px)').matches) return;
    const d = Profile.data; d.rotateHint = (d.rotateHint || 0);
    if (d.rotateHint >= 3) return;
    d.rotateHint++; Profile.save();
    const h = document.createElement('div');
    h.className = 'rotate-hint'; h.textContent = _t("Совет: в горизонтальном положении кнопки заклинаний крупнее");
    document.body.appendChild(h); setTimeout(() => h.remove(), 5000);
  } catch (e) { /* подсказка не критична */ }
}

// 1.4.7: у героя, уже игравшего, открытые ранее заклинания считаются знакомыми (молча); новые — подсвечиваются и объявляются в журнале боя
function announceNewSpells() {
  const d = Profile.data;
  if (!d.spellSeen) {
    d.spellSeen = {};
    for (const k of Object.keys(MAGICS)) if (Balance.spellUnlock[k] && Hero.isSpellUnlocked(k, Profile.level())) d.spellSeen[k] = true;
    Profile.save();
    return;
  }
  if (TUT()) return;
  const fresh = Object.keys(MAGICS).filter((k) => Balance.spellUnlock[k] && Hero.isSpellUnlocked(k, Profile.level()) && !d.spellSeen[k]);
  if (fresh.length) logEvent('left', _t("Новое заклинание: {0} — кнопка подсвечена, нажмите её.", [fresh.map((k) => MAGICS[k].name).join(', ')]));
  renderMagic();
}
function startGame() {
  aiming = false;
  aimCell = null;
  stopTurnTimer();
  skipStreak = 0;
  const logEl = document.getElementById('log');
  if (logEl) logEl.innerHTML = '';
  hideOverlay();
  buildBoard();
  rewarded = false;
  strikeKilledMonster = false; shotKilledMonster = false;
  fighters.left.hpEdited = fighters.right.hpEdited = false;   // ручная правка ХП действует только в одном бою
  applyFaction();
  fighters.left.gear = Profile.gear();
  setupEnemy();
  clearLocks();
  veiled.clear();
  fighters.left.charge = 0;
  Object.assign(fighters.right, { turnNo: 0, revived: false, charged: false, poison: null, shredDone: 0, shield: 0, spores: 0, clonesMade: 0, clone: null, luck: 0, mirrorReady: false, tripleNext: false, magicPaid: 0 });
  Object.assign(fighters.left, { elxSaved: false, revived: false, charged: false, poison: null, shredDone: 0, shield: 0, doubleNext: false, luck: 0, mirrorReady: false, tripleNext: false, magicPaid: 0 });
  for (const s of ['left', 'right']) {
    fighters[s].buffs = [];
    fighters[s].haste = false;
    recalcStats(s);
    fighters[s].hp = fighters[s].max;
    fighters[s].magic = false;
    fighters[s].counts = Object.fromEntries(GEM_TYPES.map((t) => [t, 0]));
    buildFighter(s);
  }
  setupPet();   // приручённый и годный питомец (если есть) выходит в бой вместе с героем — см. pets.js
  if (pet) logEvent('left', _t("{0} выходит с вами в бой!", [petName()]));
  let trainKey = null;                             // «Отточить мастерство»: какое заклинание тренируем
  if (beaverTip) {
    const tip = beaverTip;
    beaverTip = null;
    trainKey = tip.spellKey || null;
    if (tip.spellKey) {                            // «Отточить мастерство»: гарантируем камни на нужное заклинание
      const need = magicCostOf('left', tip.spellKey);
      for (const t of MAGIC_TYPES) fighters.left.counts[t] += need;
      renderCounters('left');
    }
    logEvent('left', tip.text);
    note(tip.text);
  }
  if (Bestiary.MONSTERS[fighters.right.monsterId] && Bestiary.MONSTERS[fighters.right.monsterId].swarm) {
    logEvent('right', _t("Перед вами {0}!", [fighters.right.name]));
  }
  moves = 0;
  movesEl.textContent = 0;
  selected = null;
  invalidStreak = 0;
  grid = Array.from({ length: N }, () => Array(N).fill(null));
  const startCells = fillEmpty();
  if (TUT()) Tutorial.plantBoard();              // обучение: поле с готовым первым ходом из обсидиана
  // Тренировка Кулака ярости: поднимаем номиналы камней родного цвета (x3, при нужде x5), чтобы условие
  // «свой цвет господствует на поле» выполнялось сразу. Номиналы не создают линий — поле остаётся корректным.
  if (trainKey === 'fury') {
    const home = GEM_TYPES.indexOf(playerFaction().gem);
    for (const v of [3, 5]) {
      if (furyState().ok) break;
      for (const row of grid) for (const t of row) if (t && t.ti === home && t.value < v) t.value = v;
    }
  }
  spawnFilled(startCells);
  busy = false;
  renderFighters();
  announceNewSpells();
  setTurn('left');
  turnDamage = { target: null, amount: 0 };
  turnEvents = { block: 0, blockTarget: null, reflected: 0, attacker: null };

  // Инициатива решает, кто ходит первым.
  const chanceLeft = Combat.firstMoveChance(fighters.left, fighters.right);
  const elxFirst = elxSide('initiative');
  const first = TUT() ? 'left' : RULES.firstMove || (elxFirst ? 'left' : (Math.random() * 100 < chanceLeft ? 'left' : 'right'));
  if (elxFirst) logEvent('left', _t("Эликсир инициативы: первый ход ваш"));
  logEvent('left', _t("Инициатива: ваш шанс первого хода {0}%", [chanceLeft]));
  if (first === 'left') {
    logEvent('left', _t("Первым ходит игрок"));
  } else {
    logEvent('right', _t("Первым ходит противник"));
    busy = true;
    setTimeout(() => { if (!over) enemyTurn(); }, 900);
  }
  if (TUT()) Tutorial.event('board-ready');
  else if (typeof Tutorial !== 'undefined') Tutorial.event('battle');   // обычный бой: окно обучения на карте прячется
}

/* ---------- ход ---------- */

// Меняет два камня. Если ничего не собралось — возвращает обратно и отвечает false.
async function attemptSwap(a, b) {
  Sound.swap();
  swapCells(a, b);
  placeTile(a);
  placeTile(b);
  await sleep(RULES.timing.swap);

  if (hasMatches()) return true;

  Sound.bad();
  swapCells(a, b);
  placeTile(a);
  placeTile(b);
  await sleep(RULES.timing.swap);
  return false;
}

// Награда за победу: опыт, монеты, ресурсы монстра его цвета, иногда вещь и расходник.
// Бой с вручную подправленным ХП — проверочный, награды за него нет.
function grantRewards() {
  if (rewarded) return '';
  const deep = !!(Profile.data.monster && Profile.data.monster.deep);
  const txt = grantRewardsBase();
  return deep ? `${txt}<br>${Screens.deepReward()}` : txt;
}
function grantRewardsBase() {
  if (rewarded) return '';
  rewarded = true;
  if (isTraining()) return _t("Учебный бой: опыт, монеты и добыча не начисляются — это просто тренировка.");
  if (moves < Balance.rewards.minMoves || fighters.left.hpEdited || fighters.right.hpEdited) return _t("Награда не выдана: проверочный бой (ХП изменено вручную) или слишком лёгкий бой");
  const f = fighters.right, R = Balance.rewards;
  const xp = Hero.xpReward(Bestiary.MONSTERS[f.monsterId], f.tier, Profile.level());
  const drops = Bestiary.rollDrops(f.monsterId, f.tier, Math.random, Profile.data.faction);
  // 1.2.9: в режиме «×10» награда выдаётся как обычно (просьба владельца — проверять добычу и ошибки сильным героем).
  drops.coins = Math.round(drops.coins * Factions.perk(Profile.data.faction, 'coins'));   // люди: +10% монет
  const luckPct = fighters.left.luck || 0;                    // Свиток удачи: +% к монетам и ресурсам с этой победы
  if (luckPct) {
    drops.coins = Math.round(drops.coins * (1 + luckPct / 100));
    for (const r of drops.resources) r.n = Math.round(r.n * (1 + luckPct / 100));
  }
  Profile.data.wins++;
  Profile.recordWin(f.monsterId, f.tier);
  Daily.registerWin();
  Profile.addCoins(drops.coins);
  const up = Profile.addXp(xp);
  const killMedal = Profile.checkKillMedal(f.monsterId, Hero.tierFor(Profile.level()));   // первая победа над видом
  const shotMedal = shotKilledMonster ? Profile.registerShotKill(Hero.tierFor(Profile.level())) : null;
  const strikeMedal = strikeKilledMonster ? Profile.registerStrikeKill(Hero.tierFor(Profile.level())) : null;
  const lines = [_t("Опыт: +{0}", [xp]), _t("Монеты: {0}{1}", [Tiers.moneyText(drops.coins), luckPct ? _t(" (со Свитком удачи)") : ''])];
  const eggKind = Profile.rollEgg(f.monsterId);
  if (eggKind) lines.push(_t("<b class=\"lvlup\">Находка!</b> {0} — высиживается в Питомнике", [Pets.EGGS[eggKind].name]));
  if (killMedal) lines.push(_t("<b class=\"lvlup\">Медаль!</b> {0}", [Medals.nameFor(killMedal.id)]));
  if (shotMedal) lines.push(_t("<b class=\"lvlup\">Медаль!</b> {0}", [Medals.nameFor(shotMedal.id)]));
  if (strikeMedal) lines.push(_t("<b class=\"lvlup\">Медаль!</b> {0}", [Medals.nameFor(strikeMedal.id)]));
  for (const r of drops.resources) {
    Profile.addRes(r.kind, r.tier, r.n);
    lines.push(`${Bestiary.RESOURCES[r.kind].name} (${Tiers.get(r.tier).name}) ×${r.n}`);
  }
  if (drops.item) {
    Profile.addItem(drops.item);
    const it = Gear.item(drops.item);
    lines.push(_t("Вещь: {0} ({1})", [it.name, Tiers.get(it.tier).name]));
  }
  if (Math.random() < R.consumableChance) {
    const kinds = Object.keys(Gear.CONSUMABLES), k = kinds[rnd(kinds.length)];
    Profile.addConsumable(k);
    lines.push(`+1 ${Gear.CONSUMABLES[k].name}`);
  }
  if (up.to > up.from) {
    const L = up.to, t = Hero.tierFor(L);
    lines.unshift(_t("<b class=\"lvlup\">Новый уровень {0}!</b> ХП {1}, урон камня ×{2}, очки снаряжения {3}", [L, Hero.baseHp(L), Hero.dmgMult(L), Hero.budget(L)]) +
      (Hero.itemLevel(t) === L ? _t(". Теперь можно надевать вещи цвета «{0}»", [Tiers.get(t).name]) : ''));
    const opened = Object.entries(Balance.spellUnlock).filter(([k, lv]) => lv > up.from && lv <= up.to && MAGICS[k]).map(([k]) => MAGICS[k].name);
    if (opened.length) lines.splice(1, 0, _t("<b class=\"lvlup\">Новое заклинание:</b> {0}", [opened.join(', ')]));   // 1.4.3: не пропустить открытие магии
    Sound.win();
  }
  // 1.3.0: страж осколка — двойные монеты; первая победа — осколок Великого Сердца и награда сюжета.
  const bossId = Profile.data.monster && Profile.data.monster.boss;
  if (bossId && Story.BY_ID[bossId]) {
    const story = Profile.data.story = Profile.data.story || { shards: {} };
    story.shards = story.shards || {};
    Profile.addCoins(drops.coins);
    lines.push(_t("Страж: монеты ×2 (+{0})", [Tiers.moneyText(drops.coins)]));
    if (!story.shards[bossId]) {
      story.shards[bossId] = true;
      const rw = Story.shardReward(bossId), ch = Story.BY_ID[bossId];
      Profile.addCoins(rw.coins);
      Profile.addXp(rw.xp);
      lines.unshift(ch.final
        ? _t("<b class=\"lvlup\">Сердцевина Великого Сердца!</b> Грань снова цела — сюжет пройден. +{0}, опыт +{1}", [Tiers.moneyText(rw.coins), rw.xp])
        : _t("<b class=\"lvlup\">Осколок Великого Сердца! ({0}/4)</b> +{1}, опыт +{2}{3}", [Story.shards(story), Tiers.moneyText(rw.coins), rw.xp, Story.finalOpen(story) ? _t(". На севере пробудился Древний дракон…") : '']));
    }
  }
  Profile.refreshShop();
  Profile.save();
  onEconomyChanged();
  return lines.join('<br>');
}

function checkEnd() {
  if (over) return true;                      // бой уже окончен
  if (TUT()) Tutorial.guard();                // обучение: Бобёр не падает раньше последнего шага
  // Победа — только когда пал оригинал И нет живого двойника гриба (награда одна, за одного противника).
  if (Combat.enemyDefeated(fighters.right)) { showOverlay(_t("Победа!"), grantRewards()); if (TUT()) Tutorial.event('win'); return true; }
  if (fighters.left.hp <= 0) { Profile.refreshShop(); showOverlay(_t("Поражение")); return true; }
  return false;
}

// Один ход стороны side. Возвращает 0 — обмен недопустим, 1 — обычный ход,
// 2 — ход с линией из 4+ камней (даёт дополнительный ход).
async function takeTurn(side, a, b) {
  const ok = await attemptSwap(a, b);
  if (!ok) return 0;

  moves++;
  movesEl.textContent = moves;
  turnStats = { stones: 0, dmg: 0, bonus: 1 };
  const extra = await resolveBoard(side);
  logTurn(side);
  if (flushTurnDamage()) await sleep(500);
  // Шаровая молния действует до конца хода: пока идут дополнительные ходы за линию 4+ (extra),
  // остаётся включённой и снова сработает на следующем сборе камней; выключается только когда
  // ход реально переходит другой стороне (см. Combat.continueMagic, setTurn → clearTurnEndBuffs — тот же приём).
  fighters[side].magic = Combat.continueMagic(fighters[side].magic, extra);
  renderMagic();
  if (checkEnd()) return 1;

  // Новые камни появляются, только когда поле пусто или ходов не осталось.
  if (isEmptyBoard() || !Engine.hasMoves(typOf())) await refillBoard();
  return finishAction(side, extra);
}


/* ---------- Огненный крест ---------- */
// Сжигает крест (строку и столбец) вокруг выбранной клетки, но только внутри области 5x5, центрированной
// на клетке цели (у края поля область меньше — обрезается границей 6x6). За каждый сожжённый камень
// наносится урон, равный его номиналу. FIRE_RADIUS — половина стороны области без центра (2 → 5x5).
const FIRE_RADIUS = 2;

function toggleAim(kind) {
  if (busy || over) return;
  if (aiming) { stopAim(); note(_t("Ваш ход")); return; }
  if (kind !== 'growth' && kind !== 'bomb' && !canAffordMagic('left', kind)) return;
  clearSelection();
  aiming = true;
  aimKind = kind;
  boardEl.classList.add('aiming', 'aiming-' + kind);
  note(kind === 'bomb' ? _t("Пороховая шашка: выберите центр взрыва 3x3") : kind === 'fire' ? _t("Огненный крест: выберите центр области") : kind === 'square' ? _t("Захват: выберите центр квадрата 3x3") : kind === 'chaos' ? _t("Хаос: выберите центр области 3x3") : kind === 'pierce' ? _t("Выпад: выберите камень, он сгорит (ход не тратится)") : kind === 'growth' ? _t("Дикий рост: выберите камень") : _t("Превращение: выберите камень (не обсидиан)"));
  renderMagic();
}

function stopAim() {
  aiming = false;
  aimKind = null;
  aimCell = null;
  boardEl.classList.remove('aiming', 'aiming-fire', 'aiming-transmute', 'aiming-square', 'aiming-growth', 'aiming-bomb', 'aiming-chaos', 'aiming-pierce');
  if (typeof renderBag === 'function') renderBag();
  hideCross();
  renderMagic();
}

// Подсветка области под курсором: крест (Огненный крест) или квадрат 3x3 (Превращение).
function showCross(cell) {
  const cross = boardEl.querySelector('.cross');
  if (!cross || !cell) return hideCross();
  const u = 100 / N;
  cross.dataset.mode = aimKind || 'fire';
  if (aimKind === 'growth' || aimKind === 'pierce') {
    cross.querySelector('.sq').style.cssText = `top:${cell.r * u}%;left:${cell.c * u}%;height:${u}%;width:${u}%`;
  } else if (aimKind === 'transmute' || aimKind === 'square' || aimKind === 'bomb' || aimKind === 'chaos') {
    const r0 = Math.max(0, cell.r - 1), r1 = Math.min(N - 1, cell.r + 1);
    const c0 = Math.max(0, cell.c - 1), c1 = Math.min(N - 1, cell.c + 1);
    cross.querySelector('.sq').style.cssText =
      `top:${r0 * u}%;left:${c0 * u}%;height:${(r1 - r0 + 1) * u}%;width:${(c1 - c0 + 1) * u}%`;
  } else {
    // Крест ограничен областью 5x5 вокруг клетки — подсветка обрезается границей поля, как и сам эффект.
    const rc0 = Math.max(0, cell.c - FIRE_RADIUS), rc1 = Math.min(N - 1, cell.c + FIRE_RADIUS);
    const cr0 = Math.max(0, cell.r - FIRE_RADIUS), cr1 = Math.min(N - 1, cell.r + FIRE_RADIUS);
    cross.querySelector('.row').style.cssText = `top:${cell.r * u}%;height:${u}%;left:${rc0 * u}%;width:${(rc1 - rc0 + 1) * u}%`;
    cross.querySelector('.col').style.cssText = `left:${cell.c * u}%;width:${u}%;top:${cr0 * u}%;height:${(cr1 - cr0 + 1) * u}%`;
  }
  cross.hidden = false;
}

function hideCross() {
  const cross = boardEl.querySelector('.cross');
  if (cross) cross.hidden = true;
}

// Ход-заклинание. Возвращает 1 или 2 (дополнительный ход после каскада с линией 4+).
// opts: free — не тратит камни и ход (дыхание дракона); shape: 'cross' | 'row'; mult — множитель урона; name — название.
async function castFire(side, cell, opts = {}) {
  const shape = opts.shape || 'cross', mult = opts.mult || 1;
  const title = opts.name || (shape === 'point' ? _t("Выпад") : shape === 'square' ? _t("Захват") : _t("Огненный крест"));
  const collect = shape !== 'row';                  // крест и квадрат собирают камни в копилку (дыхание дракона — нет)
  stopAim();
  clearSelection();
  if (!opts.free) spendMagic(side, -1, shape === 'point' ? 'pierce' : shape === 'square' ? 'square' : 'fire');
  note(`${title}!`);
  Sound.fire();

  const target = other(side);
  const burning = [];
  let dmg = 0, maxDist = 0, all = 0, obs = 0, charge = 0;
  const gotTypes = new Set();
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const tile = grid[r][c];
      if (!tile) continue;
      if (shape === 'row') { if (r !== cell.r) continue; }
      else if (shape === 'point') { if (r !== cell.r || c !== cell.c) continue; }
      else if (shape === 'square') { if (Math.abs(r - cell.r) > 1 || Math.abs(c - cell.c) > 1) continue; }
      // Крест ('cross') ограничен областью 5x5 вокруг цели; дыхание дракона ('row') — нет.
      else if ((r !== cell.r && c !== cell.c) || Math.abs(r - cell.r) > FIRE_RADIUS || Math.abs(c - cell.c) > FIRE_RADIUS) continue;
      const dist = Math.abs(r - cell.r) + Math.abs(c - cell.c);
      maxDist = Math.max(maxDist, dist);
      if (collect && wispBlocks(side, tile)) { /* камень x1 исчезает, но ничего не даёт */ }
      else if (collect) {
        all += tile.value;
        if (tile.ti === ONYX) obs += tile.value;
        const fl = fighters[side];
        fl.counts[tile.type] += tile.value;         // в копилку без бонусов линии
        gotTypes.add(tile.type);
        if (side === 'left' && tile.type === playerFaction().gem) charge += tile.value;
      } else dmg += tile.value * mult;              // дыхание: урон по номиналу камня
      tile.el.style.setProperty('--d', dist * 70 + 'ms');
      tile.el.classList.add('burn');
      const flame = document.createElement('div');
      flame.className = 'flame';
      tile.el.appendChild(flame);
      burning.push({ r, c });
    }
  }
  if (collect) {
    // Фиксированный + базовый урон героя + обсидианы; под Шаровой молнией — все собранные камни с её множителем.
    const B = Balance.magic, fx = (shape === 'square' ? B.square : B.cross).fixed;
    const stones = fighters[side].magic ? Math.round(all * B.lightning.mult) : obs;
    dmg = shape === 'point' ? 0 : fx + Combat.strikeDamage(fighters[side]) + stones;   // Выпад: урона нет, ценна позиция
    renderCounters(side, [...gotTypes]);
    if (charge) addCharge(charge);
    turnStats.stones += burning.length;
  }
  const dealt = dealDamage(target, dmg);
  logEvent(side, _t("{0}: {1}, собрано {2}, урон {3}", [fighters[side].name, title, burning.length, dealt]));
  await sleep(RULES.timing.burn + maxDist * 70);

  for (const { r, c } of burning) {
    grid[r][c].el.remove();
    grid[r][c] = null;
  }
  if (sideDown(target) || sideDown(side)) {
    if (flushTurnDamage()) await sleep(500);
    checkEnd();
    return 1;
  }

  gravityDown();
  await sleep(RULES.timing.fall);
  shiftRight();
  await sleep(RULES.timing.shift);
  return afterSpell(side, !opts.free && shape !== 'point');   // Выпад — ход не тратится
}

// Конец действия стороны: баффы теряют по ходу, Свиток спешки даёт дополнительный ход.
function finishAction(side, extra) {
  const f = fighters[side];
  const r = Combat.finishAction(f, extra);
  if (r.haste) {
    logEvent(side, _t("{0}: Свиток спешки — дополнительный ход", [f.name]));
    note(_t("Свиток спешки: дополнительный ход!"));
  }
  renderMagic();
  return r.extra ? 2 : 1;
}

// Общий хвост заклинания: каскады, итоги хода, конец боя, новые камни.
async function afterSpell(side, finish = true) {
  turnStats = { stones: 0, dmg: 0, bonus: 1 };
  const extra = await resolveBoard(side);
  logTurn(side);
  if (flushTurnDamage()) await sleep(500);
  if (finish) fighters[side].magic = Combat.continueMagic(fighters[side].magic, extra);   // Молния не переживает ход (Крест/Захват после неё)
  renderMagic();
  if (checkEnd()) return 1;
  if (isEmptyBoard() || !Engine.hasMoves(typOf())) await refillBoard();
  return finish ? finishAction(side, extra) : (extra ? 2 : 1);
}

// Меняет номинал камня и его значок.
function setTileValue(t, v) {
  t.value = v;
  const g = t.el && t.el.querySelector('.gem');
  if (!g) return;
  const old = g.querySelector('.mult'); if (old) old.remove();
  if (v > 1) g.insertAdjacentHTML('beforeend', `<span class="mult x${v}">x${v}</span>`);
}

// Целебный дождь: лечит на сумму номиналов изумрудов; использованные изумруды теряют уровень номинала.
async function castHeal(side) {
  clearSelection();
  spendMagic(side, -1, 'heal');
  const f = fighters[side];
  // 1.3.8: лечат только изумруды (по номиналам); использованные камни «впитывают» дождь и теряют один уровень номинала
  const EM = GEM_TYPES.indexOf('emerald');
  let sum = 0;
  const soaked = [];
  for (const row of grid) for (const t of row) if (t && t.ti === EM) { sum += t.value; if (t.value > 1) soaked.push(t); }
  const amount = Combat.rainHeal(f, sum);
  for (const t of soaked) setTileValue(t, t.value >= 5 ? 3 : 1);
  note(_t("Целебный дождь!"));
  Sound.heal();

  const rain = document.createElement('div');
  rain.className = 'rain';
  for (let i = 0; i < 12; i++) {
    const d = document.createElement('i');
    d.style.left = 6 + Math.random() * 88 + '%';
    d.style.animationDelay = Math.random() * 0.5 + 's';
    rain.appendChild(d);
  }
  fEl(side).appendChild(rain);
  setTimeout(() => rain.remove(), 1700);

  f.hp += amount;
  renderFighters();
  logEvent(side, _t("{0}: Целебный дождь, +{1} ХП", [f.name, amount]));
  showCenterPop('+' + amount, 'heal', _t("Целебный дождь"));
  await sleep(1000);
  return afterSpell(side);
}

// Хаос игрока (1.3.8): перемешивается область 3x3 вокруг выбранной клетки; из случайных раскладов (и локальных
// улучшений обменами) берётся лучший для игрока по AI.layoutValue — без готовых линий и с ходом на поле.
async function castChaosArea(side, cell) {
  stopAim();
  clearSelection();
  spendMagic(side, -1, 'chaos');
  note(_t("Хаос!"));
  Sound.chaos();
  const cells = [];
  for (let r = Math.max(0, cell.r - 1); r <= Math.min(N - 1, cell.r + 1); r++)
    for (let c = Math.max(0, cell.c - 1); c <= Math.min(N - 1, cell.c + 1); c++) if (grid[r][c]) cells.push({ r, c });
  const tiles = cells.map(({ r, c }) => grid[r][c]);
  const place = (perm) => cells.forEach(({ r, c }, i) => { grid[r][c] = perm[i]; });
  const value = (perm) => { place(perm); return AI.layoutValue(typOf(), valOf()); };
  let best = tiles.slice(), bestV = value(best), cur = best, curV = bestV;
  for (let k = 0; k < 120; k++) {
    const perm = k % 3 ? cur.slice() : tiles.slice();
    if (k % 3) { const i = rnd(perm.length), j = rnd(perm.length); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    else for (let i = perm.length - 1; i > 0; i--) { const j = rnd(i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const v = value(perm);
    if (v > curV) { cur = perm; curV = v; }
    if (v > bestV) { best = perm; bestV = v; }
  }
  if (bestV === -Infinity) {                            // подходящего расклада не нашлось — обычное перемешивание всей области
    for (let k = 0; k < 200 && bestV === -Infinity; k++) {
      const perm = tiles.slice();
      for (let i = perm.length - 1; i > 0; i--) { const j = rnd(i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }
      const v = value(perm); if (v > -Infinity) { best = perm; bestV = v; }
    }
  }
  place(best);
  cells.forEach(({ r, c }, i) => {
    setPos(best[i], r, c);
    best[i].el.classList.add('chaos');
    setTimeout(() => best[i].el.classList.remove('chaos'), 600);
  });
  logEvent(side, _t("{0}: Хаос, область 3x3 перемешана в лучший расклад", [fighters[side].name]));
  await sleep(650);
  return afterSpell(side);
}

// Хаос: камни перемешиваются между занятыми клетками (без готовых линий, с ходом). Используется противником.
async function castChaos(side) {
  clearSelection();
  spendMagic(side, -1, 'chaos');
  note(_t("Хаос!"));
  Sound.chaos();
  logEvent(side, _t("{0}: Хаос, поле перемешано", [fighters[side].name]));

  const cells = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c]) cells.push({ r, c });
  const tiles = cells.map(({ r, c }) => grid[r][c]);
  let chosen = null, fallback = null;
  for (let k = 0; k < 200 && !chosen; k++) {
    const perm = tiles.slice();
    for (let i = perm.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    cells.forEach(({ r, c }, i) => { grid[r][c] = perm[i]; });
    fallback = fallback || perm;
    if (!hasMatches() && Engine.hasMoves(typOf())) chosen = perm;
  }
  const final = chosen || fallback;
  cells.forEach(({ r, c }, i) => {
    grid[r][c] = final[i];
    setPos(final[i], r, c);
    final[i].el.classList.add('chaos');
    setTimeout(() => final[i].el.classList.remove('chaos'), 600);
  });
  await sleep(650);
  return afterSpell(side);
}

// Превращение: камень и все камни его цвета в области 3x3 становятся обсидианом (номинал сохраняется).
async function castTransmute(side, cell) {
  stopAim();
  clearSelection();
  spendMagic(side, -1, 'transmute');
  const center = grid[cell.r][cell.c];
  const targets = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = cell.r + dr, c = cell.c + dc;
      if (r < 0 || c < 0 || r >= N || c >= N) continue;
      const t = grid[r][c];
      if (t && t.ti === center.ti) targets.push({ r, c, tile: t });
    }
  }
  note(_t("Превращение!"));
  Sound.transmute();
  logEvent(side, _t("{0}: Превращение, {1} в обсидиан", [fighters[side].name, targets.length]));
  for (const t of targets) t.tile.el.classList.add('morph');
  await sleep(600);
  for (const { r, c, tile } of targets) {
    tile.el.remove();
    grid[r][c] = createTile({ type: 'onyx', ti: ONYX, value: tile.value }, r, c);
    grid[r][c].el.classList.add('arrive');
  }
  await sleep(350);
  return afterSpell(side);
}

// Зеркало: следующий удар, который получит сторона side, целиком отражается атакующему (см. Combat.hit).
// Одноразовое, эффекта на поле нет — просто взводит флаг и завершает ход, как Целебный дождь/Хаос.
async function castMirror(side) {
  clearSelection();
  spendMagic(side, -1, 'mirror');
  Combat.applyMirror(fighters[side]);
  note(_t("Зеркало!"));
  Sound.transmute();
  logEvent(side, _t("{0}: Зеркало — следующий полученный удар отразится обратно", [fighters[side].name]));
  return afterSpell(side);
}

// Жертва: сжигает часть своего ТЕКУЩЕГО ХП, следующий собранный камень наносит утроенный урон.
async function castSacrifice(side) {
  clearSelection();
  spendMagic(side, -1, 'sacrifice');
  const f = fighters[side];
  const r = Combat.applySacrifice(f);
  note(_t("Жертва!"));
  Sound.heal();
  logEvent(side, _t("{0}: Жертва — {1} ХП, следующий собранный камень нанесёт тройной урон", [f.name, r.loss]));
  showDamage(side, r.loss);
  if (r.revived) onRevived(side);
  renderFighters();
  if (checkEnd()) return 1;
  return afterSpell(side);
}

// Кулак ярости: следующий удар заклинателя — двойной (см. Combat.applyFury / doubleNext в Combat.hit).
// Условие (родной цвет господствует на поле) проверяют spellDisabled/playerInstant. Ход ведёт себя как у Жертвы.
async function castFury(side) {
  clearSelection();
  spendMagic(side, -1, 'fury');
  const f = fighters[side];
  Combat.applyFury(f);
  note(_t("Кулак ярости!"));
  Sound.transmute();
  logEvent(side, _t("Кулак ярости: следующий удар — двойной"));
  renderFighters();
  return afterSpell(side);
}

// Прилив: один случайный присутствующий на поле цвет (кроме обсидиана) целиком превращается в другой
// случайный цвет — управляемый родственник Хаоса (тот перемешивает поле целиком и непредсказуемо).
async function castTide(side) {
  clearSelection();
  spendMagic(side, -1, 'tide');
  const typ = typOf();
  const present = GEM_TYPES.map((_, i) => i).filter((ti) => ti !== ONYX && typ.includes(ti));
  if (!present.length) { note(_t("Прилив: на поле нет камней, которые можно перекрасить")); return afterSpell(side); }
  const from = present[rnd(present.length)];
  const rest = GEM_TYPES.map((_, i) => i).filter((ti) => ti !== ONYX && ti !== from);
  const to = rest[rnd(rest.length)];
  note(_t("Прилив: {0} → {1}!", [GEM_NAMES[GEM_TYPES[from]], GEM_NAMES[GEM_TYPES[to]]]));
  Sound.transmute();
  const changed = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const t = grid[r][c];
    if (t && t.ti === from) changed.push({ r, c, tile: t });
  }
  logEvent(side, _t("{0}: Прилив — {1} камня «{2}» стали «{3}»", [fighters[side].name, changed.length, GEM_NAMES[GEM_TYPES[from]], GEM_NAMES[GEM_TYPES[to]]]));
  for (const { tile } of changed) tile.el.classList.add('morph');
  await sleep(500);
  for (const { r, c, tile } of changed) {
    tile.el.remove();
    grid[r][c] = createTile({ type: GEM_TYPES[to], ti: to, value: tile.value }, r, c);
    grid[r][c].el.classList.add('arrive');
  }
  await sleep(300);
  return afterSpell(side);
}

// Прорицание: чистая подсказка — на поле подсвечиваются все клетки, с которых доступен ход, собирающий
// линию 4+ (Engine.fourPlusMoves). Прямого боевого эффекта нет (см. Balance.magic.divination.turns).
async function castDivination(side) {
  clearSelection();
  spendMagic(side, -1, 'divination');
  const best = AI.advise(typOf(), valOf());
  note(best ? _t("Прорицание: лучший ход подсвечен") : _t("Прорицание: ходов нет"));
  Sound.heal();
  logEvent(side, _t("{0}: Прорицание{1}", [fighters[side].name, best ? _t(" — лучший ход найден") : '']));
  if (side === 'left' && best) {
    const hl = Balance.magic.divination.turns * 4000;
    boardEl.classList.add('divining');
    for (const i of [best.a, best.b]) {
      const t = grid[Math.floor(i / N)][i % N];
      if (t && t.el) t.el.classList.add('divination');
    }
    const clear = () => { boardEl.classList.remove('divining'); boardEl.querySelectorAll('.tile.divination').forEach((el) => el.classList.remove('divination')); };
    setTimeout(clear, hl);
    boardEl.addEventListener('pointerdown', clear, { once: true });
  }
  return 0;                                        // 0 — ход не потрачен
}

// Удар: универсальное заклинание всех фракций (та же цена «камней каждого вида», что у остальных заклинаний
// — см. Balance.magic.costs.strike). Наносит фиксированный, «сырой» урон, равный базовому урону героя
// (Combat.strikeDamage) — без Силы, крита, Блока и Брони (raw = true в dealDamage), поэтому не зависит от
// снаряжения цели и не масштабируется никакими усилениями. Если этим ударом монстр добит, засчитывается
// в отдельную серию медалей «Удар» (Medals.checkStrikeMedal — см. checkEnd/grantRewards).
async function castStrike(side) {
  clearSelection();
  spendMagic(side, -1, 'strike');
  const f = fighters[side], target = other(side);
  const dmg = Combat.strikeDamage(f);
  note(_t("Удар!"));
  Sound.fire();
  const dealt = dealDamage(target, dmg, true);
  logEvent(side, _t("{0}: Удар, урон {1}", [f.name, dealt]));
  if (sideDown(target) && side === 'left') strikeKilledMonster = true;
  if (sideDown(target) || sideDown(side)) {
    if (flushTurnDamage()) await sleep(500);
    checkEnd();
    return 1;
  }
  if (flushTurnDamage()) await sleep(400);
  return afterSpell(side);
}

async function afterPlayerSpell(res) {
  if (over) return;
  if (res === 2) {                                  // каскад с линией 4+ — ходите ещё раз
    busy = false;
    renderMagic();
    note(_t("Дополнительный ход!"));
    startTurnTimer();                                // на дополнительный ход снова даётся 30с
    return;
  }
  await passToEnemy();
}

// Заклинание с выбором клетки (Огненный крест, Превращение).
async function playerCast(cell) {
  const kind = aimKind;
  if (!canAffordMagic('left', kind)) { stopAim(); note(_t("Не хватает камней на это заклинание")); return; }
  stopTurnTimer();
  skipStreak = 0;                             // реальный ход — сбрасывает счётчик пропусков по таймеру
  busy = true;
  renderMagic();
  invalidStreak = 0;
  const res = kind === 'chaos' ? await castChaosArea('left', cell) : kind === 'transmute' ? await castTransmute('left', cell)
    : kind === 'square' ? await castFire('left', cell, { shape: 'square' }) : kind === 'pierce' ? await castFire('left', cell, { shape: 'point' }) : await castFire('left', cell);
  endPlayerAction();
  if (TUT()) Tutorial.event('cast', kind);
  if (kind === 'pierce') {                          // Выпад: ход не тратится — ходим дальше
    if (over) return;
    busy = false; renderMagic(); renderCounters('left'); note(_t("Ваш ход")); startTurnTimer();
    return;
  }
  await afterPlayerSpell(res);
}

// Заклинания без выбора цели (Целебный дождь, Хаос).
const INSTANT_CASTERS = {
  heal: castHeal, chaos: castChaos, strike: castStrike,
  mirror: castMirror, tide: castTide, sacrifice: castSacrifice, divination: castDivination, fury: castFury,
};
async function playerInstant(kind) {
  if (busy || over || aiming || fighters.left.magic || !canAffordMagic('left', kind)) return;
  if (!spellOpen(kind)) return;
  if (kind === 'heal' && fighters.left.hp >= fighters.left.max) return;
  if (kind === 'fury' && !furyState().ok) return;
  stopTurnTimer();
  skipStreak = 0;                             // реальный ход — сбрасывает счётчик пропусков по таймеру
  busy = true;
  renderMagic();
  invalidStreak = 0;
  const res = await INSTANT_CASTERS[kind]('left');
  endPlayerAction();
  if (TUT()) Tutorial.event('cast', kind);
  if (res === 0) {                                  // Прорицание: ход не тратится
    busy = false; renderMagic(); renderCounters('left'); startTurnTimer();
    return;
  }
  await afterPlayerSpell(res);
}

async function playerMove(a, b) {
  if (isLocked('left', a) || isLocked('left', b)) {
    clearSelection();
    note(_t("Этот столбец скован камнем — выберите другой ход"));
    return;
  }
  stopTurnTimer();
  skipStreak = 0;                               // реальный ход — сбрасывает счётчик пропусков по таймеру
  busy = true;
  renderMagic();
  clearSelection();
  const ok = await takeTurn('left', a, b);
  endPlayerAction();
  if (!ok) {
    invalidStreak++;
    const pen = Combat.invalidPenalty(fighters.left), lim = Balance.invalid.limit;
    dealDamage('left', pen, true);
    logEvent('left', _t("Игрок: неверный ход, -{0} ХП ({1}/{2})", [pen, invalidStreak, lim]));
    flushTurnDamage();
    if (!TUT() && (invalidStreak >= lim || fighters.left.hp <= 0)) {
      showOverlay(_t("Поражение"));
      return;                                   // busy остаётся true до новой игры
    }
    note(_t("Неверный ход: -{0} ХП ({1}/{2} подряд). Ход переходит к противнику", [pen, invalidStreak, lim]));
    await sleep(900);
    await passToEnemy();                        // неверный ход — очередь противника (и питомца)
    return;
  }
  invalidStreak = 0;
  if (TUT()) Tutorial.event('move');
  if (over) return;
  if (ok === 2) {                              // линия из 4+ камней — ходите ещё раз
    busy = false;
    renderMagic();
    note(_t("Дополнительный ход!"));
    startTurnTimer();                          // на дополнительный ход снова даётся 30с
    return;
  }
  await passToEnemy();
}

async function enemyTurn() {
  if (TUT()) {                                   // обучение: Бобёр не отвечает — только объясняет
    setTurn('right');
    note(_t("Бобёр-хранитель пропускает ход — учись спокойно"));
    await sleep(600);
    if (over) return;
    busy = false;
    setTurn('left');
    return;
  }
  setTurn('right');
  if (await enemyTurnStart()) return;            // яд и приёмы существа; true — бой окончен
  // Оригинал Дикого гриба мог пасть (яд, рикошет), пока стоит его двойник — тогда ходит только двойник.
  if (fighters.right.hp > 0) for (;;) {
    await sleep(RULES.timing.think);
    await enemyUseItems();

    const f = fighters.right;
    const v = Combat.aiView(f, fighters.left);          // ХП в «камнях» с учётом роста урона, Силы и Брони
    const mv = AI.choose(typOf(), valOf(), v.hpMe, v.hpOpp, f.level, f.magic ? {} : affordability('right'),
      { maxMe: v.maxMe, healMult: v.healMult, locked: lockedCells('right') });
    if (!mv) { note(_t("{0} не нашёл хода", [f.name])); break; }

    let res;
    const SPELL_NAMES = { fire: _t("Огненный крест"), square: _t("Захват"), transmute: _t("Превращение"), heal: _t("Целебный дождь"), chaos: _t("Хаос") };
    if (SPELL_NAMES[mv.kind]) {
      note(_t("Противник использует {0}!", [SPELL_NAMES[mv.kind]]));
      await sleep(700);
      const cell = mv.idx !== undefined ? { r: Math.floor(mv.idx / N), c: mv.idx % N } : null;
      res = mv.kind === 'fire' ? await castFire('right', cell)
        : mv.kind === 'square' ? await castFire('right', cell, { shape: 'square' })
        : mv.kind === 'transmute' ? await castTransmute('right', cell)
        : mv.kind === 'heal' ? await castHeal('right')
        : await castChaos('right');
    } else {
      if (mv.kind === 'lightning') {
        f.magic = true;
        spendMagic('right', -1, 'lightning');
        renderMagic();
        note(_t("Противник использует Шаровую молнию!"));
        Sound.lightning();
        logEvent('right', _t("Противник использует Шаровую молнию"));
        await sleep(700);
      }
      const a = { r: Math.floor(mv.a / N), c: mv.a % N };
      const b = { r: Math.floor(mv.b / N), c: mv.b % N };
      res = await takeTurn('right', a, b);
    }
    if (over) return;
    if (res !== 2 || fighters.right.hp <= 0) break;
    note(_t("Противник ходит ещё раз!"));          // у него тоже была линия из 4+
  }
  // Двойник гриба ходит сразу после оригинала (см. Combat.turnOrder: [..., monster, clone]).
  if (Combat.turnOrder(false, false, Combat.cloneAlive(fighters.right)).includes('clone')) await cloneTurn();
  if (over) return;
  clearLocks('right');                         // Корни держат только один ход противника
  if (Profile.data.monster && Profile.data.monster.deep) {   // «У дна»: под водой течение сковывает один столбец на ваш ход
    setLock(rnd(N), 'left');
    logEvent('right', _t("Течение: один столбец скован на ваш ход"));
  }
  busy = false;
  setTurn('left');
}

// Начало хода существа: яд (приём ящеров) и приёмы самого существа (решает combat.js, поле меняем здесь).
// Возвращает true, если бой окончен.
async function enemyTurnStart() {
  const f = fighters.right, me = fighters.left;
  f.turnNo = (f.turnNo || 0) + 1;
  const say = (text) => { note(`${f.name}: ${text}`); logEvent('right', `${f.name}: ${text}`); };

  if (f.poison && f.poison.turns > 0 && f.hp > 0) {   // пал оригинал гриба, а двойник ещё стоит — яду жечь некого
    f.poison.turns--;
    showFloat('right', _t("Яд"), 'venom');
    const dealt = dealDamage('right', f.poison.dmg, true, false);   // яд жжёт оригинал, двойник его не прикрывает
    logEvent('left', _t("Яд: {0} теряет {1} ХП", [f.name, dealt]));
    flushTurnDamage();
    renderMagic();
    await sleep(700);
    if (checkEnd()) return true;
  }

  const act = Combat.monsterTurnStart(f, me, MAGIC_TYPES);
  let acted = !!act;
  const A = Balance.abilities;
  if (act) switch (act.kind) {
    case 'regen':
      showFloat('right', '+' + act.heal, 'heal'); renderFighters(); say(_t("Регенерация, +{0} ХП", [act.heal]));
      break;
    case 'steal':
      renderCounters('left'); showFloat('left', `−${act.stones}`, 'ricochet'); say(_t("Воровство: утащила {0} ({1})", [act.stones, GEM_NAMES[act.type]]));
      break;
    case 'prank':
      if (prankSwap()) say(_t("Пакость: поменял два камня местами")); else acted = false;
      break;
    case 'howl':
      say(_t("Вой! Этот ход бьёт на {0}% сильнее", [A.howl.power])); renderMagic();
      break;
    case 'petrify': {
      const cols = [...Array(N).keys()].filter((c) => grid.some((row) => row[c]));
      if (cols.length) { setLock(cols[rnd(cols.length)], 'left'); say(_t("Окаменение: один столбец скован на ваш ход")); } else acted = false;
      break;
    }
    case 'veil':
      veil(act.stones); say(_t("Туман: {0} камней скрыты до конца вашего хода", [act.stones]));
      break;
    case 'drum':
      renderMagic(); say(_t("Шаманский бубен: этот ход все камни жгут"));
      break;
    case 'weaken':
      if (elxImmune('weaken')) break;
      showFloat('left', _t("Морок"), 'debuff'); say(_t("Морок: на ваш следующий ход урон слабее")); renderMagic();
      break;
    case 'pinch':
      renderGear('right');
      say(act.add > 0 ? _t("Панцирь: новый шип, Блок +{0}", [act.add]) : _t("Панцирь: панцирь уже не может стать крепче"));
      break;
    case 'mire':
      if (elxImmune('mire')) break;
      showFloat('left', _t("Трясина"), 'debuff'); say(_t("Трясина: ошибётесь на этот ход — штраф ХП будет двойным")); renderMagic();
      break;
    case 'sap':
      if (elxImmune('sap')) break;
      showFloat('left', _t("Смола"), 'debuff'); say(_t("Смола: заклинание на ваш следующий ход дороже на {0} камень каждого цвета", [act.extra])); renderMagic();
      break;
    case 'clone':
      showFloat('right', _t("Двойник!"), 'buff'); renderFighters(); renderMagic(); say(_t("Спороносец: из облака спор встаёт двойник с {0} ХП", [act.hp]));
      break;
    case 'evasion':
      showFloat('right', _t("Изворотливость"), 'buff'); say(_t("Изворотливость: Блок выше на {0} ещё {1} хода", [act.amount, A.evasion.turns])); renderFighters();
      break;
    case 'retribution':
      showFloat('right', _t("Возмездие"), 'buff'); say(_t("Возмездие: Рикошет выше на {0} ещё {1} хода", [act.amount, A.retribution.turns])); renderFighters();
      break;
    case 'breath': {
      let best = -1, bestN = 0;
      for (let r = 0; r < N; r++) { const n = grid[r].filter(Boolean).length; if (n > bestN) { bestN = n; best = r; } }
      if (best < 0) { acted = false; break; }
      say(_t("Огненное дыхание!"));
      await sleep(500);
      await castFire('right', { r: best, c: 0 }, { free: true, shape: 'row', mult: act.mult, name: _t("Огненное дыхание") });
      if (over) return true;
      break;
    }
    default: acted = false;
  }
  if (acted) await sleep(650);
  return over;
}

// Пакость гоблина: меняет местами два случайных камня (так, чтобы не собралась линия и остался ход).
function prankSwap() {
  const cells = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c]) cells.push({ r, c });
  for (let k = 0; k < 40 && cells.length > 1; k++) {
    const a = cells[rnd(cells.length)], b = cells[rnd(cells.length)];
    if (grid[a.r][a.c].ti === grid[b.r][b.c].ti) continue;
    swapCells(a, b);
    if (!hasMatches() && Engine.hasMoves(typOf())) {
      setPos(grid[a.r][a.c], a.r, a.c);
      setPos(grid[b.r][b.c], b.r, b.c);
      return true;
    }
    swapCells(a, b);
  }
  return false;
}

// Сторона выбыла из боя: герой — при ХП 0; противник — только когда пали и он, и двойник Дикого гриба.
const sideDown = (s) => (s === 'right' ? Combat.enemyDefeated(fighters.right) : fighters.left.hp <= 0);

// Приём «Блуждающий огонь» (Болотный огонёк): игроку не засчитываются камни номиналом ниже x3 (ни копилка, ни урон).
const wispBlocks = (side, tile) => side === 'left' && fighters.right.ability === 'wisp' && tile.value < 3;

// Собирает совпадения, начисляет камни и урон стороне side, затем падение и сдвиг.
async function resolveBoard(side) {
  const f = fighters[side];
  const target = other(side);

  let extra = false;                                // была линия из 4+ камней
  const gained = {};                                // магические камни, собранные за весь проход (для Хитрости)
  // Обсидиан x5 (камень номиналом x5): собранный в линию, убирает с поля все камни вокруг себя на расстоянии 1
  // (см. Engine.obsidianBurst) — в этом же проходе, до падения камней; урон даёт только сосед-обсидиан.
  let bon = Engine.obsidianBurst(typOf(), Engine.bonusMap(typOf()), ONYX, valOf());
  while (bon) {
    const bumped = new Set();
    let dmg = 0, maxBonus = 1, charge = 0;
    const home = side === 'left' ? playerFaction().gem : null;
    for (let i = 0; i < N * N; i++) {
      if (!bon[i]) continue;
      const tile = grid[Math.floor(i / N)][i % N];
      const amount = tile.value * bon[i];          // номинал камня x бонус линии (взрыв x5 — множитель 1)
      if (wispBlocks(side, tile)) { bumped.add(tile.type); tile.el.classList.add('pop'); continue; }   // Блуждающий огонь: камни x1 не засчитываются
      f.counts[tile.type] += amount;
      if (MAGIC_TYPES.includes(tile.type)) gained[tile.type] = (gained[tile.type] || 0) + amount;
      if (tile.type === home) charge += amount;  // родные камни заряжают приём фракции
      // Урон наносит только обсидиан (или камни любого цвета в режиме Магии) — в том числе клетки,
      // взорванные взрывом обсидиана x5: если взорванный сосед сам не обсидиан, урона не даёт,
      // только ресурсы (подтверждено пользователем: взрыв собирает соседей в копилку, но «боевой
      // эффект» — только если сосед тоже был обсидианом). Клетки исчезают с поля сразу же в этом же
      // проходе — ниже идут gravity/shiftRight, они не ждут следующего хода игрока.
      if (tile.ti === ONYX || f.magic) dmg += amount;       // под Молнией — множитель Balance.magic.lightning.mult (ниже)
      if (bon[i] > maxBonus) maxBonus = bon[i];
      bumped.add(tile.type);
      tile.el.classList.add('pop');
    }
    let cleared = 0, has5 = false;
    for (let i = 0; i < N * N; i++) { if (bon[i]) cleared++; if (bon[i] === 3) has5 = true; }
    turnStats.stones += cleared;
    turnStats.bonus = Math.max(turnStats.bonus, maxBonus);
    Sound.match(cleared, maxBonus);
    if (maxBonus > 1) { extra = true; note(_t("Бонус x{0}! Дополнительный ход", [maxBonus])); }
    // Линия ровно из 5 камней (бонус x3, см. Engine.bonusFor) копится в счётчик медалей игрока
    // (см. js/medals.js) — вехи считаются по всем боям сразу, не по одному бою.
    if (side === 'left' && has5 && !isTraining()) {
      const medal = Profile.registerFiveStreak(Hero.tierFor(Profile.level()));
      if (medal) note(_t("<b class=\"lvlup\">Медаль!</b> {0}", [Medals.nameFor(medal.id)]));
    }
    renderCounters(side, [...bumped]);
    if (charge) addCharge(charge);
    // Споры Дикого гриба: всё, что он собрал за проход (номинал × бонус линии), — см. Combat.addSpores.
    if (side === 'right' && f.ability === 'clone') {
      let got = 0;
      for (let i = 0; i < N * N; i++) if (bon[i]) got += grid[Math.floor(i / N)][i % N].value * bon[i];
      Combat.addSpores(f, got);
      renderBadge('right');
    }
    turnStats.dmg += dealDamage(target, f.magic ? Math.round(dmg * Balance.magic.lightning.mult) : dmg);
    await sleep(RULES.timing.clear);

    for (let i = 0; i < N * N; i++) {
      if (!bon[i]) continue;
      const r = Math.floor(i / N), c = i % N;
      grid[r][c].el.remove();
      grid[r][c] = null;
    }
    if (sideDown(target) || sideDown(side)) return extra;                // бой окончен (в т. ч. рикошетом)

    gravityDown();                                  // 1. вертикально вниз
    await sleep(RULES.timing.fall);
    shiftRight();                                   // 2. вправо на свободные места
    await sleep(RULES.timing.shift);

    bon = Engine.obsidianBurst(typOf(), Engine.bonusMap(typOf()), ONYX, valOf());   // 3. возможный каскад (+обсидиан x5)
  }
  applyCunning(target, side, gained);
  return extra;
}

// Хитрость (см. Combat.cunningSteal): противник того, кто собирал, может отнять половину собранных магических камней.
function applyCunning(thiefSide, victimSide, gained) {
  const res = Combat.cunningSteal(fighters[thiefSide], fighters[victimSide], gained);
  if (!res) return;
  renderCounters(thiefSide, Object.keys(res.stolen)); renderCounters(victimSide);
  showFloat(thiefSide, _t("Хитрость"), 'ricochet');
  logEvent(thiefSide, _t("{0}: Хитрость — украдено {1} камней", [fighters[thiefSide].name, res.total]));
}

function gravityDown() {
  for (let c = 0; c < N; c++) {
    let write = N - 1;
    for (let r = N - 1; r >= 0; r--) {
      if (grid[r][c]) {
        if (r !== write) {
          grid[write][c] = grid[r][c];
          grid[r][c] = null;
          setPos(grid[write][c], write, c);
        }
        write--;
      }
    }
  }
}

function shiftRight() {
  for (let r = 0; r < N; r++) {
    let write = N - 1;
    for (let c = N - 1; c >= 0; c--) {
      if (grid[r][c]) {
        if (c !== write) {
          grid[r][write] = grid[r][c];
          grid[r][c] = null;
          setPos(grid[r][write], r, write);
        }
        write--;
      }
    }
  }
}

/* ---------- ввод игрока (клик и свайп) ---------- */

function clearSelection() {
  if (selected && grid[selected.r][selected.c]) grid[selected.r][selected.c].el.classList.remove('selected');
  selected = null;
}

function cellFromEvent(e) {
  const rect = boardEl.getBoundingClientRect();
  const c = Math.floor(((e.clientX - rect.left) / rect.width) * N);
  const r = Math.floor(((e.clientY - rect.top) / rect.height) * N);
  if (r < 0 || c < 0 || r >= N || c >= N) return null;
  return { r, c };
}

const adjacent = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

let drag = null;

boardEl.addEventListener('pointerdown', (e) => {
  if (aiming) {                                   // клик выбирает центр Огненного креста
    const cell = cellFromEvent(e);
    if (!cell || busy || over) return;
    if (aimKind === 'transmute') {
      const t = grid[cell.r][cell.c];
      if (!t || t.ti === ONYX) { note(_t("Выберите камень, не обсидиан")); return; }
    }
    if (aimKind === 'growth' && !grid[cell.r][cell.c]) { note(_t("Выберите камень, а не пустую клетку")); return; }
    const same = aimCell && aimCell.r === cell.r && aimCell.c === cell.c;
    if (e.pointerType === 'touch' && !same) {     // на телефоне: первое касание целится, второе поджигает
      aimCell = cell;
      showCross(cell);
      note(aimKind === 'growth' ? _t("Коснитесь ещё раз, чтобы вырастить камни") : _t("Коснитесь ещё раз, чтобы поджечь"));
      return;
    }
    if (aimKind === 'growth') castGrowth(cell); else if (aimKind === 'bomb') { stopAim(); useAmmo('bomb', cell); } else playerCast(cell);
    return;
  }
  if (busy || over) return;
  const cell = cellFromEvent(e);
  if (!cell) return;
  // Начать ход можно с камня, либо (второй клик) с пустой клетки, если рядом уже выбран камень —
  // так его можно "поднять"/сдвинуть в пустое место, если это соберёт линию.
  if (!grid[cell.r][cell.c] && !(selected && adjacent(selected, cell))) return;
  drag = { cell, x: e.clientX, y: e.clientY, swiped: false };
  boardEl.setPointerCapture(e.pointerId);
});

boardEl.addEventListener('pointermove', (e) => {
  if (aiming) { showCross(cellFromEvent(e)); return; }
  if (!drag || drag.swiped || busy) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  const th = boardEl.getBoundingClientRect().width / N * 0.35;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < th) return;
  const to = Math.abs(dx) > Math.abs(dy)
    ? { r: drag.cell.r, c: drag.cell.c + Math.sign(dx) }
    : { r: drag.cell.r + Math.sign(dy), c: drag.cell.c };
  drag.swiped = true;
  // Клетка назначения может быть пустой — это законный ход (камень сдвигается в пустое место).
  if (to.r >= 0 && to.c >= 0 && to.r < N && to.c < N) playerMove(drag.cell, to);
});

boardEl.addEventListener('pointerup', () => {
  if (!drag) return;
  const { cell, swiped } = drag;
  drag = null;
  if (swiped || busy || over) return;

  const pick = (cl) => { selected = cl; grid[cl.r][cl.c].el.classList.add('selected'); };
  if (!selected) pick(cell);
  else if (selected.r === cell.r && selected.c === cell.c) clearSelection();
  else if (adjacent(selected, cell)) playerMove({ ...selected }, cell);
  else { clearSelection(); pick(cell); }
});

// Подсказка: подсвечивает лучший обмен (считает сильный ИИ; ход не тратится).
function showHint() {
  if (busy || over || aiming) return;
  const v = Combat.aiView(fighters.left, fighters.right);
  const mv = AI.choose(typOf(), valOf(), v.hpMe, v.hpOpp, 100, false, { locked: lockedCells('left') });
  if (!mv) return;
  clearSelection();
  for (const i of [mv.a, mv.b]) {
    const tile = grid[Math.floor(i / N)][i % N];
    if (tile) {
      tile.el.classList.add('hint');
      setTimeout(() => tile.el.classList.remove('hint'), 2500);
    }
  }
  note(_t("Подсказка: этот обмен собирает камни"));
}
document.getElementById('hint').addEventListener('click', showHint);

const muteBtn = document.getElementById('mute');
const renderMute = () => { muteBtn.textContent = Sound.muted ? _t("Звук: выкл") : _t("Звук: вкл"); };
muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.muted); renderMute(); Sound.swap(); });
renderMute();

// Оформление экрана боя: «1» — прежнее, «2» — новое (та же разметка, другая облицовка, см. css/style.css).
// Переключается прямо в бою, оба варианта остаются доступны, выбор запоминается в профиле.
// «3» — «колонки» (Profile.data.ui = 'columns'): та же бронзовая облицовка, что у «2» (класс ui-modern), плюс
// своя раскладка (класс ui-columns): герой | столбец заклинаний | поле | столбец противника | противник,
// ранец под полем. Раскладка целиком в CSS; game.js только рисует столбец противника (renderEnemyColumn).
// Кнопка ходит по кругу 1 → 2 → 3 → 1; неизвестное значение в старом сохранении считается «1».
const UI_SKINS = ['classic', 'modern', 'columns'];
const UI_SKIN_TIPS = [_t("новое оформление экрана боя"), _t("оформление «колонки»"), _t("прежнее оформление экрана боя")];
const uiSkinBtn = document.getElementById('ui-skin');
function renderUiSkin() {
  const i = Math.max(0, UI_SKINS.indexOf(Profile.data.ui));
  const skin = UI_SKINS[i];
  document.body.classList.toggle('ui-modern', skin === 'modern' || skin === 'columns');
  document.body.classList.toggle('ui-columns', skin === 'columns');
  uiSkinBtn.textContent = _t("Оформление: ") + (i + 1);
  uiSkinBtn.title = _t("Переключить на ") + UI_SKIN_TIPS[i];
  renderEnemyColumn();
}
uiSkinBtn.addEventListener('click', () => {
  const i = Math.max(0, UI_SKINS.indexOf(Profile.data.ui));
  Profile.data.ui = UI_SKINS[(i + 1) % UI_SKINS.length];
  Profile.save();
  renderUiSkin();
});
renderUiSkin();

// Настройки для проверки баланса. ХП теперь задают уровень героя и цвет существа; ручная правка ХП
// действует только в текущем бою и не сохраняется.
const SETTINGS_KEY = 'gem-match-settings';
function saveSettings() { /* ничего не сохраняем между запусками */ }
function loadSettings() {
  try { localStorage.removeItem(SETTINGS_KEY); } catch (e) { /* без хранилища */ }
}

document.getElementById('gear').addEventListener('click', () => Inventory.open('left'));
document.getElementById('bestiary').addEventListener('click', () => Screens.openBestiary());
document.getElementById('credits').addEventListener('click', () => Screens.openCredits());

// Новый бой с выбранным в бестиарии противником.
function startBattle() { if (!busy || over) startGame(); }
boardEl.addEventListener('pointerleave', () => { if (aiming) hideCross(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && aiming) { stopAim(); note(_t("Ваш ход")); }
});

// «Отступить»: уйти с поля боя на карту (награды нет, существо остаётся). Нужно подтверждение.
let fleeArmed = null;
const restartBtn = document.getElementById('restart');
restartBtn.addEventListener('click', () => {
  if (over) return MapView.returnFromBattle(Combat.enemyDefeated(fighters.right) ? 'win' : 'loss');
  if (busy) return;
  if (!fleeArmed) {
    restartBtn.textContent = _t("Точно отступить?");
    fleeArmed = setTimeout(() => { restartBtn.textContent = _t("Отступить"); fleeArmed = null; }, 2500);
    return;
  }
  clearTimeout(fleeArmed);
  fleeArmed = null;
  restartBtn.textContent = _t("Отступить");
  stopTurnTimer();
  MapView.returnFromBattle('flee');
});

// Полноэкранный режим. Где браузер не умеет (например, iPhone Safari) — запасной режим:
// страница занимает всё окно. Ещё удобнее добавить игру на главный экран: она откроется без панелей браузера.
const fsBtn = document.getElementById('fullscreen');
const rootEl = document.documentElement;
const fsActive = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function renderFs() {
  const on = fsActive() || rootEl.classList.contains('pseudo-fs');
  rootEl.classList.toggle('fs', on);
  fsBtn.textContent = on ? _t("Свернуть") : _t("Полный экран");
}
async function toggleFullscreen() {
  try {
    if (fsActive()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (rootEl.classList.contains('pseudo-fs')) rootEl.classList.remove('pseudo-fs');
    else if (rootEl.requestFullscreen) await rootEl.requestFullscreen({ navigationUI: 'hide' });
    else if (rootEl.webkitRequestFullscreen) rootEl.webkitRequestFullscreen();
    else rootEl.classList.add('pseudo-fs');
  } catch (e) {
    rootEl.classList.toggle('pseudo-fs');          // браузер не разрешил — запасной режим
  }
  renderFs();
}
fsBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', renderFs);
document.addEventListener('webkitfullscreenchange', renderFs);
document.addEventListener('keydown', (e) => {
  if ((e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') && !/INPUT|TEXTAREA/.test(e.target.tagName)) toggleFullscreen();
});
renderFs();

buildSpellbar();
loadSettings();
onGearChanged();
MapView.init();                 // игра начинается на карте; бой — при нападении на существо
if (typeof Tutorial !== 'undefined') Tutorial.resumeIfStarted();   // перезагрузка посреди обучения — заново
MapView.marketNews();           // Торговые ряды: что купили, пока игра была закрыта

// Заставка на 2 секунды при запуске (поверх карты/регистрации — см. z-index в CSS). Фон зависит от
// ориентации экрана; если картинки нет (art/ui/bg-splash-*), остаётся CSS-градиент из style.css.
(function initSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const mq = window.matchMedia('(orientation: portrait)');
  const applyOrientation = () => {
    const portrait = mq.matches;
    el.classList.toggle('splash-portrait', portrait);
    el.classList.toggle('splash-landscape', !portrait);
    const key = 'ui/bg-splash-' + (portrait ? 'portrait' : 'landscape');
    // 1.2.7: афиша с названием игры — пара героев по полу героя (новичку — случайная); название уже на картинке.
    // 1.2.8: в альбомной ориентации — широкая картина (bg-splash-landscape), если есть; афиши — для портретной.
    const g = (typeof Profile !== 'undefined' && Profile.data && Profile.data.gender) || (Math.random() < 0.5 ? 'm' : 'f');
    const posters = (g === 'f' ? ['f'] : ['m', 'm2']).map((x) => 'ui/bg-splash-poster-' + x).filter((k) => typeof Art !== 'undefined' && Art.has(k));
    const poster = posters[Math.floor(Math.random() * posters.length)];
    const wide = !portrait && typeof Art !== 'undefined' && Art.has(key);
    el.classList.remove('has-poster');
    if (poster && !wide) {
      el.classList.add('has-poster');
      el.style.setProperty('--poster', `url('${new URL(Art.url(poster), document.baseURI).href}')`);   // абсолютный адрес: url() в переменной считается от css/
      el.style.backgroundImage = '';
    } else if (typeof Art !== 'undefined' && Art.has(key)) {
      el.style.backgroundImage = `linear-gradient(180deg, rgba(10,10,12,.3), rgba(10,10,12,.7)), url('${Art.url(key)}')`;
    } else {
      el.style.backgroundImage = '';
    }
  };
  applyOrientation();
  if (mq.addEventListener) mq.addEventListener('change', applyOrientation); else mq.addListener(applyOrientation);
  setTimeout(() => {
    if (mq.removeEventListener) mq.removeEventListener('change', applyOrientation); else mq.removeListener(applyOrientation);
    el.classList.add('hide');
    setTimeout(() => el.remove(), 500);
  }, 2000);
})();
