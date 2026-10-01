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
let strikeKilledMonster = false;   // текущий монстр добит заклинанием Удар — для медали (Medals.checkStrikeMedal)
// Подсказка бобра-хранителя (Библиотека → «Бобёр», см. Screens.library) на следующий запуск боя:
// { text } — просто баннер-подсказка; { text, spellKey } — вдобавок гарантирует стартовый запас камней
// для этого заклинания. Одноразовая: сбрасывается сразу после применения в startGame().
let beaverTip = null;
function setBeaverTip(tip) { beaverTip = tip; }
// Таймер хода игрока (30с): не походил вовремя — ход автопропускается; 3 таких пропуска подряд — поражение.
let turnTimerHandle = null, turnTimerLeft = 0, skipStreak = 0;
// Скованные столбцы: forSide — чья сторона не может трогать эти камни (Корни эльфов, Окаменение голема).
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
  left:  { name: 'Игрок',     hp: RULES.defaultHp, max: RULES.defaultHp, base: RULES.defaultHp, counts: {}, magic: false, shield: 0,
           gear: Gear.emptyLoadout(), stats: Gear.stats(Gear.emptyLoadout()), buffs: [], haste: false },
  right: { name: 'Противник', hp: RULES.defaultHp, max: RULES.defaultHp, base: RULES.defaultHp, counts: {}, magic: false, level: RULES.defaultLevel, shield: 0,
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
    ? `<div class="name"><span class="fname" style="color:${tierColor(f.tier)}" title="${f.name}">${f.name}</span> ${tierChip(f.tier)} <label class="lvl">ИИ <input class="level" type="number" min="1" max="100" step="1" value="${f.level}" title="Уровень ИИ противника, 1–100 (глубина и точность его ходов)"></label></div>`
    : `<div class="name"><span class="fname" title="${f.name}">${f.name}</span> <span class="hero-lvl" title="Уровень героя">ур. ${f.level || 1}</span></div>`;
  el.innerHTML = `
    <div class="avatar" title="Открыть ранец и экипировку"></div>
    ${nameRow}
    <div class="hpbar"><i></i><span class="hptext"></span></div>
    <div class="counters">${counters}</div>
    ${side === 'left' ? '<div class="wallet" title="Ваши деньги"></div>' : ''}
    <div class="gearrow" title="Открыть ранец и экипировку"></div>
    <div class="statline"></div>
    ${side === 'right' ? `<div class="ability-line" title="${(Bestiary.ability(f.monsterId) || {}).desc || ''}">Приём: <b>${(Bestiary.ability(f.monsterId) || {}).name || '—'}</b></div>` : ''}
    <div class="badge"></div>
    ${side === 'left' ? '<div class="pet-panel" id="pet-panel" hidden><div class="name"><span class="fname"></span></div><div class="hpbar"><i></i><span class="hptext"></span></div></div>' : ''}
    ${side === 'right' ? '<div class="pet-panel clone-panel" id="clone-panel" hidden><div class="clone-av"></div><div class="clone-body"><div class="name"><span class="fname"></span></div><div class="hpbar"><i></i><span class="hptext"></span></div></div></div>' : ''}`;

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
const BUFF_NAMES = { power: 'Эликсир силы', banner: 'Знамя', howl: 'Вой', weaken: 'Морок', mire: 'Трясина', sap: 'Смола' };
const WEAPON_PERK_NAMES = { pierceBlock: 'Пробивной болт (иногда пробивает Блок)', armorShred: 'Крошит Броню с каждым ударом' };
const itemColor = (it) => (it.set && Gear.SETS[it.set] ? Gear.SETS[it.set].color : Gear.NEUTRAL_COLOR);
// Идёт ли бой (или игрок на карте). Снаряжение можно менять вне боя, до первого хода и после конца боя.
let inBattle = false;
function enterBattle() { inBattle = true; }
function leaveBattle() { inBattle = false; }
const canEditGear = () => !inBattle || (moves === 0 && !busy) || over;

function recalcStats(side) {
  const f = fighters[side];
  f.stats = Gear.combine(Gear.stats(f.gear), f.innate || {});   // предметы + врождённые способности
  if (side === 'left') {
    f.stats = Gear.combine(f.stats, Profile.medalsBonus());   // + постоянный бонус медалей
    f.stats = Gear.combine(f.stats, Runes.bonusForGear(f.gear));   // + руны, вставленные в снаряжение (js/runes.js)
  }
  f.max = f.base + f.stats.health;
  f.hp = Math.min(f.hp, f.max);
  f.weaponPerk = Gear.weaponPerk(f.gear);                       // приём особого оружия (арбалет, утренняя звезда)
}

// Уровень героя: базовое ХП и урон камней (если ХП не подправлено вручную для проверки).
function applyLevel() {
  const f = fighters.left, L = Profile.level();
  f.level = L;
  f.dmg = Hero.dmgMult(L);
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
    return `<span class="gslot ${it ? 'on' : ''}" title="${Gear.SLOT_NAMES[slot]}: ${it ? it.name : 'пусто'}">${it ? itemIcon(it.type, itemColor(it), it.id) : ''}</span>`;
  }).join('');
  const st = f.stats, power = st.power + buffPower(f);
  const parts = [];
  if (power) parts.push(`Сила +${power}%`);
  if (st.defense) parts.push(`Броня ${st.defense}%`);
  if (st.block) parts.push(`Блок ${st.block}%`);
  if (st.ricochet) parts.push(`Рикошет ${st.ricochet}%`);
  if (st.initiative) parts.push(`Иниц. ${st.initiative}%`);
  if (st.magic) parts.push(`Магия ${st.magic}`);
  if (f.weaponPerk) parts.push(WEAPON_PERK_NAMES[f.weaponPerk.type] || '');
  el.querySelector('.statline').textContent = parts.join(' · ') || 'Без снаряжения';
}

// Снаряжение игрока изменилось в окне ранца.
function onGearChanged() {
  applyFaction();
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
    name: 'Бобёр-хранитель',
    base: f.hpEdited ? f.base : sc.hp, innate: sc.stats, gearBudget: 0,
    dmg: sc.dmg, ability: null,
    level: f.levelOverride || sc.ai,
    gear: Gear.emptyLoadout(),
  });
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
  const swarmSize = Bestiary.rollSwarmSize(id, Math.random);
  const sc = Bestiary.scaled(id, tier, swarmSize);
  if (f.monsterId !== id || f.tier !== tier) f.levelOverride = null;
  Object.assign(f, {
    monsterId: id, tier, swarmSize,
    name: m.swarm ? `${m.name} ×${swarmSize}` : m.name,
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
  lightning: { name: 'Шаровая молния', icon: magicIcon,
    tip: 'На один ход каждый собранный камень любого цвета наносит урон по номиналу' },
  fire: { name: 'Огненный крест', icon: fireIcon,
    tip: 'Сжигает строку и столбец выбранной клетки; урон равен номиналам сожжённых камней' },
  transmute: { name: 'Превращение', icon: transmuteIcon,
    tip: 'Выбранный камень и все камни его цвета вокруг (область 3x3) становятся обсидианом' },
  heal: { name: 'Целебный дождь', icon: healIcon,
    tip: 'Лечит на сумму номиналов сапфиров, рубинов и изумрудов на поле' },
  chaos: { name: 'Хаос', icon: chaosIcon,
    tip: 'Перемешивает все камни на поле' },
  // Удар доступен всем фракциям с 1-го уровня (как стартовая пятёрка) — в Balance.spellUnlock не упомянут.
  strike: { name: 'Удар', icon: strikeIcon,
    tip: 'Наносит фиксированный базовый урон героя; убийство Ударом идёт в отдельную серию медалей' },
  // Заклинания ниже открываются по уровню героя (Balance.spellUnlock, см. Hero.isSpellUnlocked).
  mirror: { name: 'Зеркало', icon: mirrorIcon,
    tip: 'Следующий полученный удар целиком отражается атакующему' },
  tide: { name: 'Прилив', icon: tideIcon,
    tip: 'Один случайный цвет на поле целиком перекрашивается в другой' },
  sacrifice: { name: 'Жертва', icon: sacrificeIcon,
    tip: 'Сжигает часть своего текущего ХП — следующий собранный камень наносит утроенный урон' },
  divination: { name: 'Прорицание', icon: divinationIcon,
    tip: 'Подсвечивает доступные ходы с линией из 4+ камней' },
  fury: { name: 'Кулак ярости', icon: (typeof furyIcon === 'function' ? furyIcon : strikeIcon),
    tip: 'Следующий удар наносит двойной урон. Только пока камней вашего цвета на поле больше (по номиналам), чем любого другого' },
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
  if (fac) return factionIcon(fac);
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
    if (k === 'faction') useFactionAbility();
    else if (k === 'lightning') toggleMagic();
    else if (k === 'fire' || k === 'transmute') toggleAim(k);
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
  return false;
}

function renderBag() {
  if (!bagEl) return;
  const bag = Profile.data.backpack;
  // Подписи под иконками убраны (экономят место в бою) — название и описание уходят в title (подсказка при наведении).
  bagEl.innerHTML = Object.entries(Gear.CONSUMABLES).map(([k, c]) =>
    `<button type="button" class="bagitem ${k}" data-item="${k}" title="${c.name}: ${c.desc}" ${bagDisabled(k) ? 'disabled' : ''}>
       ${itemIcon(k)}<b>${bag[k] || 0}</b></button>`).join('');
}
if (bagEl) bagEl.addEventListener('click', (e) => {
  const b = e.target.closest('button.bagitem');
  if (b && !b.disabled) useConsumable('left', b.dataset.item);
});

// Использует расходник (ход не тратится). Возвращает true, если использован.
function useConsumable(side, kind) {
  const f = fighters[side];
  const bag = side === 'left' ? Profile.data.backpack : f.bag;
  if (!(bag[kind] > 0)) return false;
  const ef = Combat.useConsumable(f, kind, MAGIC_TYPES);
  if (!ef) return false;
  if (kind === 'potion') {
    Sound.heal();
    showCenterPop('+' + ef.heal, 'heal', 'Зелье здоровья');
    logEvent(side, `${f.name}: Зелье здоровья, +${ef.heal} ХП`);
  } else if (kind === 'elixir') {
    Sound.lightning();
    logEvent(side, `${f.name}: Эликсир силы, +${ef.power}% к урону до конца хода`);
    note(`${f.name}: Эликсир силы`);
  } else if (kind === 'dust') {
    renderCounters(side);
    Sound.match(4, 1);
    logEvent(side, `${f.name}: Каменная пыль, +${ef.stones} камня каждого вида`);
  } else if (kind === 'scroll') {
    Sound.lightning();
    logEvent(side, `${f.name}: Свиток спешки`);
    note(`${f.name}: следующий ход даст дополнительный ход`);
  } else if (kind === 'luck') {
    Sound.lightning();
    logEvent(side, `${f.name}: Свиток удачи — +${ef.pct}% к монетам и ресурсам за победу в этом бою`);
    note(`${f.name}: Свиток удачи применён`);
  } else if (kind === 'honeyjar') {
    Sound.heal();
    if (ef.mode === 'hp') {
      showCenterPop('+' + ef.amount, 'heal', 'Банка мёда');
      logEvent(side, `${f.name}: Банка мёда — +${ef.amount} к максимуму ХП до конца боя`);
    } else {
      logEvent(side, `${f.name}: Банка мёда — следующий удар по нему будет заблокирован`);
      note(`${f.name}: Банка мёда даёт заряд блока`);
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
  petFell = false;
  renderPetPanel();
}

function renderPetPanel() {
  const el = petEl();
  if (!el) return;
  if (!pet) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('fallen', !petAlive());
  el.querySelector('.fname').textContent = petName() + (petAlive() ? '' : ' (пал в бою)');
  el.querySelector('.hpbar i').style.width = Math.max(0, (pet.hp / pet.max) * 100) + '%';
  el.querySelector('.hptext').textContent = `${Math.max(0, pet.hp)} / ${pet.max}`;
}

// Автоатака питомца по тому же монстру, которого бьёт игрок — настоящий второй боец (Combat.hit целиком,
// с блоком/бронёй/рикошетом — см. pets.js: petAttackAmount), а не множитель урона героя. Не требует ввода игрока.
async function petTurn() {
  if (!petAlive() || over) return;
  await sleep(450);
  const r = Combat.hit(pet, Combat.enemyTarget(fighters.right), Pets.petAttackAmount(pet));   // живой двойник гриба прикрывает оригинал
  if (r.kind === 'block') {
    logEvent('left', `${petName()}: удар заблокирован`);
  } else if (r.kind === 'reflect') {
    logEvent('left', `${petName()}: удар отлетел рикошетом, питомец получает ${r.amount}`);
  } else {
    showDamage('right', r.amount);
    logEvent('left', `${petName()}: атакует — урон ${r.amount}`);
  }
  renderFighters();
  if (checkEnd()) { renderPetPanel(); return; }
  if (pet.hp <= 0) {
    petFell = true;
    logEvent('left', `${petName()} пал в бою — дальше вы сражаетесь одни`);
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
const CLONE_NAME = 'Двойник гриба';
const cloneEl = () => document.getElementById('clone-panel');

function renderClonePanel() {
  const el = cloneEl(), f = fighters.right, c = f.clone;
  if (!el) return;
  if (c && c.hp <= 0 && !c.fallLogged) {          // двойник только что пал — одна строка в журнал
    c.fallLogged = true;
    logEvent('left', `${CLONE_NAME} рассыпается спорами${f.hp > 0 ? ' — дальше бой с оригиналом' : ''}`);
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
    showFloat('left', 'Блок!', 'block');
    logEvent('right', `${CLONE_NAME}: удар заблокирован`);
  } else if (r.kind === 'reflect' || r.kind === 'mirror') {
    logEvent('right', `${CLONE_NAME}: удар отлетел обратно, двойник получает ${r.amount}`);
  } else {
    showDamage('left', r.amount);
    Sound.hit(r.amount);
    logEvent('right', `${CLONE_NAME}: бьёт — урон ${r.amount}`);
  }
  renderFighters();
  renderClonePanel();
  checkEnd();
}

function spellDisabled(kind, on, ready) {
  const f = fighters.left;
  if (busy || over) return true;
  if (!Hero.isSpellUnlocked(kind, Profile.level())) return true;   // не открыто по уровню героя
  if (kind === 'lightning') return aiming || (!on && !ready);
  if (kind === 'fire' || kind === 'transmute') return f.magic || (aiming && !on) || (!on && !ready);
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
    const state = on ? (kind === 'lightning' ? 'Отмена' : 'Выберите цель') : '';
    const cost = magicCostOf('left', kind);
    const needLvl = Balance.spellUnlock[kind];
    const locked = needLvl && !Hero.isSpellUnlocked(kind, Profile.level());
    btn.title = locked ? `${MAGICS[kind].name} — откроется на уровне ${needLvl}`
      : state ? `${MAGICS[kind].name} — ${state}` : `${MAGICS[kind].name}: ${MAGICS[kind].tip} (по ${cost} камней каждого вида)`;
    if (kind === 'fury' && !locked && grid && grid[0]) {
      const fs = furyState();
      if (!fs.ok) btn.title += `\nНужно, чтобы камней вашего цвета (${GEM_NAMES[GEM_TYPES[fs.home]]}) на поле было больше, чем любого другого, с учётом номиналов (сейчас: ${fs.mine} против ${fs.other})`;
    }
    btn.innerHTML = spellIconHtml(kind, 'bar-' + kind);
    btn.classList.toggle('locked', !!locked);
    btn.disabled = spellDisabled(kind, on, ready);
  }
  renderFactionButton();
  const title = document.querySelector('.spell-title');
  if (title) title.textContent = 'Магия: цена зависит от заклинания (см. подсказку)';
  renderBadge('left');
  renderBadge('right');
  renderBag();
}

function renderBadge(side) {
  const f = fighters[side];
  const badge = fEl(side).querySelector('.badge');
  if (!badge) return;
  const parts = [];
  if (f.magic) parts.push('Шаровая молния');
  for (const b of f.buffs) parts.push(b.untilTurnEnd ? `${BUFF_NAMES[b.kind] || 'Усиление'} (до конца хода)` : `${BUFF_NAMES[b.kind] || 'Усиление'} (${b.turns})`);
  if (f.poison && f.poison.turns > 0) parts.push(`Яд (${f.poison.turns})`);
  if (f.haste) parts.push('Спешка');
  // Спороносец: счётчик спор до следующего двойника (пока лимит двойников за бой не исчерпан).
  if (side === 'right' && f.ability === 'clone' && (f.clonesMade || 0) < Balance.abilities.clone.max) parts.push(`Споры ${f.spores || 0}/${Balance.abilities.clone.charge}`);
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
const turnsWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'ход' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'хода' : 'ходов');
// Свои имена эффектов для столбца (у BUFF_NAMES нет Изворотливости и Возмездия — бейдж «1/2» не трогаем).
const EC_BUFFS = {
  power: ['power', 'Эликсир силы', 'урон выше'], banner: ['power', 'Знамя', 'урон выше'], howl: ['power', 'Вой', 'удар сильнее'],
  weaken: ['down', 'Морок', 'урон слабее'], mire: ['down', 'Трясина', ''], sap: ['down', 'Смола', ''],
  evasion: ['shield', 'Изворотливость', 'Блок'], retribution: ['spikes', 'Возмездие', 'Рикошет'],
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
      state = `\nСработает через ${left} ${turnsWord(left)} противника`;
    }
    if (f.ability === 'rage' && f.hp > 0 && f.hp < f.max * A.below) { cls += ' hot'; state = '\nСейчас в ярости!'; }
    if ((f.ability === 'undying' && f.revived) || (f.ability === 'charge' && f.charged)) { cls += ' spent'; state = '\nУже использован в этом бою'; }
    if (f.ability === 'pinch' && f.stats.block) state += `\nБлок сейчас: ${f.stats.block}%`;
    top.push(tile(cls, `<i class="ec-letter">${ab.name[0]}</i>`, `Приём: ${ab.name}\n${ab.desc}${state}`, num));
  }
  // Споры Спороносца — пока не исчерпан лимит двойников за бой.
  if (f.ability === 'clone' && (f.clonesMade || 0) < Balance.abilities.clone.max) {
    const C = Balance.abilities.clone;
    top.push(tile('spores', ecSvg('spores'), `Споры ${f.spores || 0}/${C.charge}: набрав ${C.charge}, гриб выпустит двойника`, `${f.spores || 0}`));
  }
  // Эффекты на самом противнике. Одинаковые складываются в один значок (срабатывания подряд у Изворотливости/Возмездия).
  const groups = new Map();
  for (const b of f.buffs) {
    const g = groups.get(b.kind) || { n: 0, amount: 0, turns: 0, untilTurnEnd: false };
    g.n++; g.amount += b.amount || 0; g.turns = Math.max(g.turns, b.turns || 0); g.untilTurnEnd = g.untilTurnEnd || b.untilTurnEnd;
    groups.set(b.kind, g);
  }
  for (const [kind, g] of groups) {
    const [glyph, name, what] = EC_BUFFS[kind] || ['power', BUFF_NAMES[kind] || 'Усиление', ''];
    const amt = g.amount ? ` ${what ? what + ' ' : ''}${g.amount > 0 ? '+' : ''}${g.amount}%` : '';
    const dur = g.untilTurnEnd ? 'до конца хода' : `ещё ${g.turns} ${turnsWord(g.turns)}`;
    top.push(tile('buff' + (glyph === 'down' ? ' bad' : ''), ecSvg(glyph), `${name}${g.n > 1 ? ' ×' + g.n : ''}:${amt}, ${dur}`, g.untilTurnEnd ? '' : g.turns));
  }
  if (f.magic) top.push(tile('buff', ecSvg('bolt'), 'Шаровая молния: в этот ход любые собранные им камни наносят урон'));
  if (f.haste) top.push(tile('buff', ecSvg('sand'), 'Спешка: следующий ход даст ему дополнительный ход'));
  if (f.poison && f.poison.turns > 0) top.push(tile('bad', ecSvg('drop'), `Яд: теряет по ${f.poison.dmg} ХП в начале хода, ещё ${f.poison.turns} ${turnsWord(f.poison.turns)}`, f.poison.turns));
  // Расходники противника (Combat.enemyBag) — внизу столбца, напротив ранца героя.
  const bag = Object.entries(f.bag || {}).filter(([k, n]) => n > 0 && Gear.CONSUMABLES[k])
    .map(([k, n]) => tile('bag', itemIcon(k), `${Gear.CONSUMABLES[k].name} у противника: ${n} шт.\n${Gear.CONSUMABLES[k].desc}`, n));
  enemyColEl.innerHTML = `<div class="ec-group">${top.join('')}</div><div class="ec-group ec-bag">${bag.join('')}</div>`;
}

/* ---------- приём фракции ---------- */
const CHARGE = Balance.faction.charge;
function addCharge(n) {
  const f = fighters.left, was = f.charge || 0;
  f.charge = Math.min(CHARGE, was + n);
  if (was < CHARGE && f.charge >= CHARGE) note(`${playerFaction().ability.name} готов!`);
  renderFactionButton();
}

function renderFactionButton() {
  const btn = spellbarEl.querySelector('button.fac');
  if (!btn) return;
  const fac = playerFaction(), f = fighters.left, charge = f.charge || 0, full = charge >= CHARGE;
  const on = aiming && aimKind === 'roots';
  btn.style.setProperty('--fc', fac.color);
  btn.classList.toggle('ready', full && !on);
  btn.classList.toggle('on', on);
  // Подпись на кнопке убрана (экономит место в бою) — название, описание и заряд уходят в title при наведении.
  btn.title = on ? `${fac.ability.name} — Выберите столбец`
    : `${fac.ability.name}: ${fac.ability.desc}. Заряжается камнями «${GEM_NAMES[fac.gem]}» (${charge}/${CHARGE}). Ход не тратит.`;
  btn.innerHTML = `${spellIconHtml('faction', 'bar-faction')}
    <i class="charge"><b style="width:${Math.round(charge / CHARGE * 100)}%"></b></i>`;
  btn.disabled = !on && (busy || over || !full || (aiming && aimKind !== 'roots'));
}

// Приёмы фракций ход не тратят: их цена — заряд из родных камней.
async function useFactionAbility() {
  const fac = playerFaction(), f = fighters.left;
  if (aiming && aimKind === 'roots') { stopAim(); note('Ваш ход'); return; }
  if (busy || over || (f.charge || 0) < CHARGE) return;
  const id = fac.ability.id;
  if (id === 'roots') { toggleAim('roots'); renderFactionButton(); return; }
  f.charge = 0;
  const F = Balance.faction;
  if (id === 'banner') {
    f.buffs.push({ kind: 'banner', amount: F.banner.power, turns: F.banner.turns });
    showFloat('left', 'Знамя!', 'buff');
    Sound.lightning();
    logEvent('left', `${f.name}: Знамя — +${F.banner.power}% к урону на ${F.banner.turns} хода`);
    note(`Знамя поднято: +${F.banner.power}% к урону на ${F.banner.turns} хода`);
  } else if (id === 'venom') {
    const e = fighters.right, dmg = Combat.venomTick(Combat.power(f), f.dmg);
    e.poison = { turns: F.venom.turns, dmg };
    showFloat('right', 'Яд!', 'venom');
    Sound.transmute();
    logEvent('left', `${f.name}: Ядовитый укус — ${dmg} урона в начале каждого из ${F.venom.turns} ходов противника`);
    note(`Яд: ${e.name} будет терять по ${dmg} ХП ${F.venom.turns} хода`);
  } else if (id === 'hammer') {
    busy = true;
    renderMagic();
    await runeHammer();
    busy = false;
  }
  renderMagic();
  renderFighters();
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
  logEvent('left', `${fighters.left.name}: Рунный молот — ${picked.length} камня стали обсидианом x${H.value}`);
  note('Рунный молот!');
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

// Корни: столбец скован на следующий ход противника.
function castRoots(col) {
  stopAim();
  fighters.left.charge = 0;
  setLock(col, 'right');
  Sound.heal();
  logEvent('left', `${fighters.left.name}: Корни сковали столбец ${col + 1}`);
  note('Корни: противник не сможет трогать этот столбец свой следующий ход');
  renderMagic();
}

function spendMagic(side, sign, kind = 'lightning') {   // sign: -1 списать, +1 вернуть
  for (const t of MAGIC_TYPES) fighters[side].counts[t] += sign * magicCostOf(side, kind);
  renderCounters(side);
}

// Игрок включает/выключает Магию перед своим ходом.
function toggleMagic() {
  if (busy || over || aiming) return;
  const f = fighters.left;
  if (f.magic) { f.magic = false; spendMagic('left', +1, 'lightning'); }
  else if (canAffordMagic('left', 'lightning')) { f.magic = true; spendMagic('left', -1, 'lightning'); }
  renderMagic();
  if (f.magic) { Sound.lightning(); logEvent('left', 'Игрок включил Шаровую молнию'); }
  note(f.magic ? 'Шаровая молния: каждый собранный камень наносит урон' : 'Ваш ход');
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
  showFloat(side, 'Восстал!', 'heal');
  logEvent(side, `${f.name}: Неупокоенный — встаёт с ${f.hp} ХП`);
  note(`${f.name} восстаёт!`);
}
// Снимает ХП без модификаторов (яд, штраф). «Неупокоенный» один раз встаёт вместо смерти.
function loseHp(side, amount) {
  if (Combat.loseHp(fighters[side], amount)) onRevived(side);
}

// Наносит урон по правилам боя (combat.js): Сила и рост урона, Натиск, Блок, Броня, Подлый удар, Рикошет,
// Кровопийца, Неупокоенный. raw = true — урон без модификаторов (штраф, яд). Возвращает урон, который получила цель.
// cover = true: по противнику сначала бьёт живой двойник Дикого гриба (Combat.enemyTarget), перебор урона на
// оригинал не переходит; яд передаёт cover = false — он всегда жжёт того, на кого наложен (оригинал).
function dealDamage(target, amount, raw = false, cover = true) {
  if (amount <= 0) return 0;
  const attackerSide = other(target), attacker = fighters[attackerSide];
  const victim = target === 'right' && cover ? Combat.enemyTarget(fighters.right) : fighters[target];
  const r = Combat.hit(attacker, victim, amount, raw);
  if (r.charged) showFloat(attackerSide, 'Натиск!', 'buff');
  if (r.pierceBlock) showFloat(attackerSide, 'Пробивной болт!', 'buff');
  if (r.kind === 'block') {
    showFloat(target, 'Блок!', 'block');
    turnEvents.block++;
    turnEvents.blockTarget = target;
    Sound.swap();
    return 0;
  }
  if (r.pierce) showFloat(attackerSide, 'Подлый удар!', 'buff');
  if (r.shred > 0) showFloat(target, 'Броня трещит!', 'debuff');
  if (r.crit) { showFloat(attackerSide, 'Ярость! ×2', 'crit'); logEvent(attackerSide, `${attacker.name}: Ярость — двойной урон!`); }
  if (r.kind === 'reflect') {
    showFloat(target, 'Рикошет!', 'ricochet');
    showDamage(attackerSide, r.amount);
    if (r.attackerRevived) onRevived(attackerSide);
    turnEvents.reflected += r.amount;
    turnEvents.attacker = attackerSide;
    renderFighters();
    Sound.hit(r.amount);
    shake();
    return 0;
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
  const who = (side) => (side === 'right' ? 'по противнику' : 'по игроку');
  let shown = false;
  if (d.amount > 0) { showCenterPop('-' + d.amount, 'dmg', who(d.target)); shown = true; }
  if (ev.reflected > 0) {
    setTimeout(() => showCenterPop('Рикошет -' + ev.reflected, 'ricochet', who(ev.attacker)), shown ? 500 : 0);
    logEvent(ev.attacker, `${fighters[other(ev.attacker)].name}: рикошет, ${fighters[ev.attacker].name} получает ${ev.reflected}`);
    shown = true;
  }
  if (ev.block > 0) {
    logEvent(ev.blockTarget, `${fighters[ev.blockTarget].name}: блок ×${ev.block}`);
    if (!shown) { showCenterPop('Блок!', 'block', fighters[ev.blockTarget].name); shown = true; }
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
  const parts = [`собрано ${t.stones}`];
  if (t.bonus > 1) parts.push(`линия x${t.bonus}`);
  if (t.dmg) parts.push(`урон ${t.dmg}`);
  logEvent(side, `${fighters[side].name}: ${parts.join(', ')}`);
}

let turnSide = 'left';
function setTurn(side) {
  if (side !== turnSide) Combat.clearTurnEndBuffs(fighters[turnSide]);   // эликсир силы и т.п. — до конца хода
  turnSide = side;
  fEl('left').classList.toggle('active', side === 'left');
  fEl('right').classList.toggle('active', side === 'right');
  statusEl.textContent = side === 'left' ? 'Ваш ход' : 'Противник думает…';
  boardEl.classList.toggle('enemy-turn', side === 'right');   // поле темнее, пока ходит противник
  renderMagic();
  if (side === 'left' && !over) startTurnTimer(); else stopTurnTimer();
}

/* ---------- таймер хода ---------- */

function renderTurnTimer() {
  if (!timerEl) return;
  timerEl.hidden = false;
  timerEl.textContent = `Ход истекает через ${turnTimerLeft} с`;
  timerEl.classList.toggle('low', turnTimerLeft <= 10);
}

function stopTurnTimer() {
  if (turnTimerHandle) clearInterval(turnTimerHandle);
  turnTimerHandle = null;
  if (timerEl) timerEl.hidden = true;
}

function startTurnTimer() {
  stopTurnTimer();
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
  const r = Combat.registerSkip(skipStreak);
  skipStreak = r.skips;
  logEvent('left', `Игрок: ход пропущен по таймеру (${skipStreak}/${Combat.TURN_TIMER.skipLimit} подряд)`);
  if (r.defeated) { showOverlay('Поражение'); return; }
  note(`Ход пропущен по таймеру (${skipStreak}/${Combat.TURN_TIMER.skipLimit} подряд)`);
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
      ? (f.magic ? 'Ваш ход (Шаровая молния включена)' : 'Ваш ход')
      : 'Ход противника…';
  }, 1400);
}

function showOverlay(text, sub = '') {
  stopTurnTimer();
  hideOverlay();
  const o = document.createElement('div');
  o.className = 'overlay';
  o.id = 'overlay';
  o.innerHTML = `<div>${text}${sub ? `<small>${sub}</small>` : ''}<button type="button" class="primary to-map">На карту</button></div>`;
  const result = text === 'Победа!' ? 'win' : 'loss';
  o.querySelector('.to-map').addEventListener('click', () => MapView.returnFromBattle(result));
  boardEl.appendChild(o);
  over = true;
  // Поражение с питомцем в бою (взят в бой, хоть бы уже и павшим по ходу схватки) — питомец теряет
  // 1 прочность (см. Pets.loseDurability); победа и отступление прочность не трогают.
  if (text === 'Поражение' && pet) Profile.petLoseDurability();
  logEvent(text === 'Победа!' ? 'left' : 'right', text);
  if (text === 'Победа!') Sound.win(); else Sound.lose();
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
  note('Новые камни');
  spawnFilled(fillEmpty());
  await sleep(RULES.timing.spawn);
}

/* ---------- новая игра ---------- */

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
  strikeKilledMonster = false;
  fighters.left.hpEdited = fighters.right.hpEdited = false;   // ручная правка ХП действует только в одном бою
  applyFaction();
  fighters.left.gear = Profile.gear();
  setupEnemy();
  clearLocks();
  veiled.clear();
  fighters.left.charge = 0;
  Object.assign(fighters.right, { turnNo: 0, revived: false, charged: false, poison: null, shredDone: 0, shield: 0, spores: 0, clonesMade: 0, clone: null });
  Object.assign(fighters.left, { revived: false, charged: false, poison: null, shredDone: 0, shield: 0, doubleNext: false });
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
  if (pet) logEvent('left', `${petName()} выходит с вами в бой!`);
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
    logEvent('right', `Перед вами ${fighters.right.name}!`);
  }
  moves = 0;
  movesEl.textContent = 0;
  selected = null;
  invalidStreak = 0;
  grid = Array.from({ length: N }, () => Array(N).fill(null));
  const startCells = fillEmpty();
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
  setTurn('left');
  turnDamage = { target: null, amount: 0 };
  turnEvents = { block: 0, blockTarget: null, reflected: 0, attacker: null };

  // Инициатива решает, кто ходит первым.
  const chanceLeft = Combat.firstMoveChance(fighters.left, fighters.right);
  const first = RULES.firstMove || (Math.random() * 100 < chanceLeft ? 'left' : 'right');
  logEvent('left', `Инициатива: ваш шанс первого хода ${chanceLeft}%`);
  if (first === 'left') {
    logEvent('left', 'Первым ходит игрок');
  } else {
    logEvent('right', 'Первым ходит противник');
    busy = true;
    setTimeout(() => { if (!over) enemyTurn(); }, 900);
  }
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
  rewarded = true;
  if (isTraining()) return 'Учебный бой: опыт, монеты и добыча не начисляются — это просто тренировка.';
  if (moves < Balance.rewards.minMoves || fighters.left.hpEdited || fighters.right.hpEdited) return 'Награда не выдана: проверочный бой (ХП изменено вручную) или слишком лёгкий бой';
  const f = fighters.right, R = Balance.rewards;
  const xp = Hero.xpReward(Bestiary.MONSTERS[f.monsterId], f.tier, Profile.level());
  const drops = Bestiary.rollDrops(f.monsterId, f.tier, Math.random, Profile.data.faction);
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
  const strikeMedal = strikeKilledMonster ? Profile.registerStrikeKill(Hero.tierFor(Profile.level())) : null;
  const lines = [`Опыт: +${xp}`, `Монеты: ${Tiers.moneyText(drops.coins)}${luckPct ? ' (со Свитком удачи)' : ''}`];
  if (killMedal) lines.push(`<b class="lvlup">Медаль!</b> ${Medals.nameFor(killMedal.id)}`);
  if (strikeMedal) lines.push(`<b class="lvlup">Медаль!</b> ${Medals.nameFor(strikeMedal.id)}`);
  for (const r of drops.resources) {
    Profile.addRes(r.kind, r.tier, r.n);
    lines.push(`${Bestiary.RESOURCES[r.kind].name} (${Tiers.get(r.tier).name}) ×${r.n}`);
  }
  if (drops.item) {
    Profile.addItem(drops.item);
    const it = Gear.item(drops.item);
    lines.push(`Вещь: ${it.name} (${Tiers.get(it.tier).name})`);
  }
  if (Math.random() < R.consumableChance) {
    const kinds = Object.keys(Gear.CONSUMABLES), k = kinds[rnd(kinds.length)];
    Profile.addConsumable(k);
    lines.push(`+1 ${Gear.CONSUMABLES[k].name}`);
  }
  if (up.to > up.from) {
    const L = up.to, t = Hero.tierFor(L);
    lines.unshift(`<b class="lvlup">Новый уровень ${L}!</b> ХП ${Hero.baseHp(L)}, урон камня ×${Hero.dmgMult(L)}, очки снаряжения ${Hero.budget(L)}` +
      (Hero.itemLevel(t) === L ? `. Теперь можно надевать вещи цвета «${Tiers.get(t).name}»` : ''));
    Sound.win();
  }
  Profile.refreshShop();
  Profile.save();
  onEconomyChanged();
  return lines.join('<br>');
}

function checkEnd() {
  if (over) return true;                      // бой уже окончен
  // Победа — только когда пал оригинал И нет живого двойника гриба (награда одна, за одного противника).
  if (Combat.enemyDefeated(fighters.right)) { showOverlay('Победа!', grantRewards()); return true; }
  if (fighters.left.hp <= 0) { Profile.refreshShop(); showOverlay('Поражение'); return true; }
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
  if (busy || over || (fighters.left.magic && kind !== 'roots')) return;
  if (aiming) { stopAim(); note('Ваш ход'); return; }
  if (kind !== 'roots' && !canAffordMagic('left', kind)) return;
  clearSelection();
  aiming = true;
  aimKind = kind;
  boardEl.classList.add('aiming', 'aiming-' + kind);
  note(kind === 'fire' ? 'Огненный крест: выберите центр области' : kind === 'roots' ? 'Корни: выберите столбец' : 'Превращение: выберите камень (не обсидиан)');
  renderMagic();
}

function stopAim() {
  aiming = false;
  aimKind = null;
  aimCell = null;
  boardEl.classList.remove('aiming', 'aiming-fire', 'aiming-transmute', 'aiming-roots');
  hideCross();
  renderMagic();
}

// Подсветка области под курсором: крест (Огненный крест) или квадрат 3x3 (Превращение).
function showCross(cell) {
  const cross = boardEl.querySelector('.cross');
  if (!cross || !cell) return hideCross();
  const u = 100 / N;
  cross.dataset.mode = aimKind || 'fire';
  if (aimKind === 'roots') {
    cross.querySelector('.col').style.cssText = `left:${cell.c * u}%;width:${u}%;top:0;height:100%`;
  } else if (aimKind === 'transmute') {
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
  const shape = opts.shape || 'cross', mult = opts.mult || 1, title = opts.name || 'Огненный крест';
  stopAim();
  clearSelection();
  if (!opts.free) spendMagic(side, -1, 'fire');
  note(`${title}!`);
  Sound.fire();

  const target = other(side);
  const burning = [];
  let dmg = 0, maxDist = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const tile = grid[r][c];
      if (!tile || (shape === 'row' ? r !== cell.r : (r !== cell.r && c !== cell.c))) continue;
      // Крест ('cross', Огненный крест) ограничен областью 5x5 вокруг цели; дыхание дракона ('row') — нет.
      if (shape !== 'row' && (Math.abs(r - cell.r) > FIRE_RADIUS || Math.abs(c - cell.c) > FIRE_RADIUS)) continue;
      const dist = Math.abs(r - cell.r) + Math.abs(c - cell.c);
      maxDist = Math.max(maxDist, dist);
      dmg += tile.value * mult;                     // урон по номиналу камня
      tile.el.style.setProperty('--d', dist * 70 + 'ms');
      tile.el.classList.add('burn');
      const flame = document.createElement('div');
      flame.className = 'flame';
      tile.el.appendChild(flame);
      burning.push({ r, c });
    }
  }
  const dealt = dealDamage(target, dmg);
  logEvent(side, `${fighters[side].name}: ${title}, сожжено ${burning.length}, урон ${dealt}`);
  await sleep(RULES.timing.burn + maxDist * 70);

  for (const { r, c } of burning) {
    grid[r][c].el.remove();
    grid[r][c] = null;
  }
  if (fighters[target].hp <= 0 || fighters[side].hp <= 0) {
    if (flushTurnDamage()) await sleep(500);
    checkEnd();
    return 1;
  }

  gravityDown();
  await sleep(RULES.timing.fall);
  shiftRight();
  await sleep(RULES.timing.shift);
  return afterSpell(side, !opts.free);
}

// Конец действия стороны: баффы теряют по ходу, Свиток спешки даёт дополнительный ход.
function finishAction(side, extra) {
  const f = fighters[side];
  const r = Combat.finishAction(f, extra);
  if (r.haste) {
    logEvent(side, `${f.name}: Свиток спешки — дополнительный ход`);
    note('Свиток спешки: дополнительный ход!');
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
  if (checkEnd()) return 1;
  if (isEmptyBoard() || !Engine.hasMoves(typOf())) await refillBoard();
  return finish ? finishAction(side, extra) : (extra ? 2 : 1);
}

// Целебный дождь: лечит на сумму номиналов сапфиров, рубинов и изумрудов на поле.
async function castHeal(side) {
  clearSelection();
  spendMagic(side, -1, 'heal');
  const f = fighters[side];
  let sum = 0;
  for (const row of grid) for (const t of row) if (t && t.ti !== ONYX) sum += t.value;
  const amount = Combat.rainHeal(f, sum);
  note('Целебный дождь!');
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
  logEvent(side, `${f.name}: Целебный дождь, +${amount} ХП`);
  showCenterPop('+' + amount, 'heal', 'Целебный дождь');
  await sleep(1000);
  return afterSpell(side);
}

// Хаос: камни перемешиваются между занятыми клетками (без готовых линий, с ходом).
async function castChaos(side) {
  clearSelection();
  spendMagic(side, -1, 'chaos');
  note('Хаос!');
  Sound.chaos();
  logEvent(side, `${fighters[side].name}: Хаос, поле перемешано`);

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
  note('Превращение!');
  Sound.transmute();
  logEvent(side, `${fighters[side].name}: Превращение, ${targets.length} в обсидиан`);
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
  note('Зеркало!');
  Sound.transmute();
  logEvent(side, `${fighters[side].name}: Зеркало — следующий полученный удар отразится обратно`);
  return afterSpell(side);
}

// Жертва: сжигает часть своего ТЕКУЩЕГО ХП, следующий собранный камень наносит утроенный урон.
async function castSacrifice(side) {
  clearSelection();
  spendMagic(side, -1, 'sacrifice');
  const f = fighters[side];
  const r = Combat.applySacrifice(f);
  note('Жертва!');
  Sound.heal();
  logEvent(side, `${f.name}: Жертва — ${r.loss} ХП, следующий собранный камень нанесёт тройной урон`);
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
  note('Кулак ярости!');
  Sound.transmute();
  logEvent(side, 'Кулак ярости: следующий удар — двойной');
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
  if (!present.length) { note('Прилив: на поле нет камней, которые можно перекрасить'); return afterSpell(side); }
  const from = present[rnd(present.length)];
  const rest = GEM_TYPES.map((_, i) => i).filter((ti) => ti !== ONYX && ti !== from);
  const to = rest[rnd(rest.length)];
  note(`Прилив: ${GEM_NAMES[GEM_TYPES[from]]} → ${GEM_NAMES[GEM_TYPES[to]]}!`);
  Sound.transmute();
  const changed = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const t = grid[r][c];
    if (t && t.ti === from) changed.push({ r, c, tile: t });
  }
  logEvent(side, `${fighters[side].name}: Прилив — ${changed.length} камня «${GEM_NAMES[GEM_TYPES[from]]}» стали «${GEM_NAMES[GEM_TYPES[to]]}»`);
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
  const moves = Engine.fourPlusMoves(typOf());
  const cells = new Set();
  for (const { a, b } of moves) { cells.add(a); cells.add(b); }
  note(cells.size ? 'Прорицание: подсвечены доступные сильные ходы' : 'Прорицание: сильных ходов сейчас нет');
  Sound.heal();
  logEvent(side, `${fighters[side].name}: Прорицание — ${moves.length} ходов с линией 4+`);
  if (side === 'left') {
    const hl = Balance.magic.divination.turns * 1600;
    for (const i of cells) {
      const r = Math.floor(i / N), c = i % N;
      const t = grid[r][c];
      if (t && t.el) t.el.classList.add('divination');
    }
    setTimeout(() => boardEl.querySelectorAll('.tile.divination').forEach((el) => el.classList.remove('divination')), hl);
  }
  return afterSpell(side);
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
  note('Удар!');
  Sound.fire();
  const dealt = dealDamage(target, dmg, true);
  logEvent(side, `${f.name}: Удар, урон ${dealt}`);
  if (fighters[target].hp <= 0 && side === 'left') strikeKilledMonster = true;
  if (fighters[target].hp <= 0 || fighters[side].hp <= 0) {
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
    note('Дополнительный ход!');
    startTurnTimer();                                // на дополнительный ход снова даётся 30с
    return;
  }
  await passToEnemy();
}

// Заклинание с выбором клетки (Огненный крест, Превращение).
async function playerCast(cell) {
  const kind = aimKind;
  stopTurnTimer();
  skipStreak = 0;                             // реальный ход — сбрасывает счётчик пропусков по таймеру
  busy = true;
  renderMagic();
  invalidStreak = 0;
  const res = kind === 'transmute' ? await castTransmute('left', cell) : await castFire('left', cell);
  endPlayerAction();
  await afterPlayerSpell(res);
}

// Заклинания без выбора цели (Целебный дождь, Хаос).
const INSTANT_CASTERS = {
  heal: castHeal, chaos: castChaos, strike: castStrike,
  mirror: castMirror, tide: castTide, sacrifice: castSacrifice, divination: castDivination, fury: castFury,
};
async function playerInstant(kind) {
  if (busy || over || aiming || fighters.left.magic || !canAffordMagic('left', kind)) return;
  if (!Hero.isSpellUnlocked(kind, Profile.level())) return;
  if (kind === 'heal' && fighters.left.hp >= fighters.left.max) return;
  if (kind === 'fury' && !furyState().ok) return;
  stopTurnTimer();
  skipStreak = 0;                             // реальный ход — сбрасывает счётчик пропусков по таймеру
  busy = true;
  renderMagic();
  invalidStreak = 0;
  const res = await INSTANT_CASTERS[kind]('left');
  endPlayerAction();
  await afterPlayerSpell(res);
}

async function playerMove(a, b) {
  if (isLocked('left', a) || isLocked('left', b)) {
    clearSelection();
    note('Этот столбец скован камнем — выберите другой ход');
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
    logEvent('left', `Игрок: неверный ход, -${pen} ХП (${invalidStreak}/${lim})`);
    flushTurnDamage();
    if (invalidStreak >= lim || fighters.left.hp <= 0) {
      showOverlay('Поражение');
      return;                                   // busy остаётся true до новой игры
    }
    note(`Неверный ход: -${pen} ХП (${invalidStreak}/${lim} подряд). Ход переходит к противнику`);
    await sleep(900);
    await passToEnemy();                        // неверный ход — очередь противника (и питомца)
    return;
  }
  invalidStreak = 0;
  if (over) return;
  if (ok === 2) {                              // линия из 4+ камней — ходите ещё раз
    busy = false;
    renderMagic();
    note('Дополнительный ход!');
    startTurnTimer();                          // на дополнительный ход снова даётся 30с
    return;
  }
  await passToEnemy();
}

async function enemyTurn() {
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
    if (!mv) { note(`${f.name} не нашёл хода`); break; }

    let res;
    const SPELL_NAMES = { fire: 'Огненный крест', transmute: 'Превращение', heal: 'Целебный дождь', chaos: 'Хаос' };
    if (SPELL_NAMES[mv.kind]) {
      note(`Противник использует ${SPELL_NAMES[mv.kind]}!`);
      await sleep(700);
      const cell = mv.idx !== undefined ? { r: Math.floor(mv.idx / N), c: mv.idx % N } : null;
      res = mv.kind === 'fire' ? await castFire('right', cell)
        : mv.kind === 'transmute' ? await castTransmute('right', cell)
        : mv.kind === 'heal' ? await castHeal('right')
        : await castChaos('right');
    } else {
      if (mv.kind === 'lightning') {
        f.magic = true;
        spendMagic('right', -1, 'lightning');
        renderMagic();
        note('Противник использует Шаровую молнию!');
        Sound.lightning();
        logEvent('right', 'Противник использует Шаровую молнию');
        await sleep(700);
      }
      const a = { r: Math.floor(mv.a / N), c: mv.a % N };
      const b = { r: Math.floor(mv.b / N), c: mv.b % N };
      res = await takeTurn('right', a, b);
    }
    if (over) return;
    if (res !== 2 || fighters.right.hp <= 0) break;
    note('Противник ходит ещё раз!');          // у него тоже была линия из 4+
  }
  // Двойник гриба ходит сразу после оригинала (см. Combat.turnOrder: [..., monster, clone]).
  if (Combat.turnOrder(false, false, Combat.cloneAlive(fighters.right)).includes('clone')) await cloneTurn();
  if (over) return;
  clearLocks('right');                         // Корни держат только один ход противника
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
    showFloat('right', 'Яд', 'venom');
    const dealt = dealDamage('right', f.poison.dmg, true, false);   // яд жжёт оригинал, двойник его не прикрывает
    logEvent('left', `Яд: ${f.name} теряет ${dealt} ХП`);
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
      showFloat('right', '+' + act.heal, 'heal'); renderFighters(); say(`Регенерация, +${act.heal} ХП`);
      break;
    case 'steal':
      renderCounters('left'); showFloat('left', `−${act.stones}`, 'ricochet'); say(`Воровство: утащила ${act.stones} (${GEM_NAMES[act.type]})`);
      break;
    case 'prank':
      if (prankSwap()) say('Пакость: поменял два камня местами'); else acted = false;
      break;
    case 'howl':
      say(`Вой! Этот ход бьёт на ${A.howl.power}% сильнее`); renderMagic();
      break;
    case 'petrify': {
      const cols = [...Array(N).keys()].filter((c) => grid.some((row) => row[c]));
      if (cols.length) { setLock(cols[rnd(cols.length)], 'left'); say('Окаменение: один столбец скован на ваш ход'); } else acted = false;
      break;
    }
    case 'veil':
      veil(act.stones); say(`Туман: ${act.stones} камней скрыты до конца вашего хода`);
      break;
    case 'drum':
      renderMagic(); say('Шаманский бубен: этот ход все камни жгут');
      break;
    case 'weaken':
      showFloat('left', 'Морок', 'debuff'); say('Морок: на ваш следующий ход урон слабее'); renderMagic();
      break;
    case 'pinch':
      renderGear('right');
      say(act.add > 0 ? `Панцирь: новый шип, Блок +${act.add}` : 'Панцирь: панцирь уже не может стать крепче');
      break;
    case 'mire':
      showFloat('left', 'Трясина', 'debuff'); say('Трясина: ошибётесь на этот ход — штраф ХП будет двойным'); renderMagic();
      break;
    case 'sap':
      showFloat('left', 'Смола', 'debuff'); say(`Смола: заклинание на ваш следующий ход дороже на ${act.extra} камень каждого цвета`); renderMagic();
      break;
    case 'clone':
      showFloat('right', 'Двойник!', 'buff'); renderFighters(); renderMagic(); say(`Спороносец: из облака спор встаёт двойник с ${act.hp} ХП`);
      break;
    case 'evasion':
      showFloat('right', 'Изворотливость', 'buff'); say(`Изворотливость: Блок выше на ${act.amount} ещё ${A.evasion.turns} хода`); renderFighters();
      break;
    case 'retribution':
      showFloat('right', 'Возмездие', 'buff'); say(`Возмездие: Рикошет выше на ${act.amount} ещё ${A.retribution.turns} хода`); renderFighters();
      break;
    case 'breath': {
      let best = -1, bestN = 0;
      for (let r = 0; r < N; r++) { const n = grid[r].filter(Boolean).length; if (n > bestN) { bestN = n; best = r; } }
      if (best < 0) { acted = false; break; }
      say('Огненное дыхание!');
      await sleep(500);
      await castFire('right', { r: best, c: 0 }, { free: true, shape: 'row', mult: act.mult, name: 'Огненное дыхание' });
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
      f.counts[tile.type] += amount;
      if (MAGIC_TYPES.includes(tile.type)) gained[tile.type] = (gained[tile.type] || 0) + amount;
      if (tile.type === home) charge += amount;  // родные камни заряжают приём фракции
      // Урон наносит только обсидиан (или камни любого цвета в режиме Магии) — в том числе клетки,
      // взорванные взрывом обсидиана x5: если взорванный сосед сам не обсидиан, урона не даёт,
      // только ресурсы (подтверждено пользователем: взрыв собирает соседей в копилку, но «боевой
      // эффект» — только если сосед тоже был обсидианом). Клетки исчезают с поля сразу же в этом же
      // проходе — ниже идут gravity/shiftRight, они не ждут следующего хода игрока.
      if (tile.ti === ONYX || f.magic) dmg += amount;
      if (bon[i] > maxBonus) maxBonus = bon[i];
      bumped.add(tile.type);
      tile.el.classList.add('pop');
    }
    let cleared = 0, has5 = false;
    for (let i = 0; i < N * N; i++) { if (bon[i]) cleared++; if (bon[i] === 3) has5 = true; }
    turnStats.stones += cleared;
    turnStats.bonus = Math.max(turnStats.bonus, maxBonus);
    Sound.match(cleared, maxBonus);
    if (maxBonus > 1) { extra = true; note(`Бонус x${maxBonus}! Дополнительный ход`); }
    // Линия ровно из 5 камней (бонус x3, см. Engine.bonusFor) копится в счётчик медалей игрока
    // (см. js/medals.js) — вехи считаются по всем боям сразу, не по одному бою.
    if (side === 'left' && has5 && !isTraining()) {
      const medal = Profile.registerFiveStreak(Hero.tierFor(Profile.level()));
      if (medal) note(`<b class="lvlup">Медаль!</b> ${Medals.nameFor(medal.id)}`);
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
    turnStats.dmg += dealDamage(target, dmg);
    await sleep(RULES.timing.clear);

    for (let i = 0; i < N * N; i++) {
      if (!bon[i]) continue;
      const r = Math.floor(i / N), c = i % N;
      grid[r][c].el.remove();
      grid[r][c] = null;
    }
    if (fighters[target].hp <= 0 || f.hp <= 0) return extra;                // бой окончен (в т. ч. рикошетом)

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
  showFloat(thiefSide, 'Хитрость', 'ricochet');
  logEvent(thiefSide, `${fighters[thiefSide].name}: Хитрость — украдено ${res.total} камней`);
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
      if (!t || t.ti === ONYX) { note('Выберите камень, не обсидиан'); return; }
    }
    const same = aimCell && aimCell.r === cell.r && aimCell.c === cell.c;
    if (e.pointerType === 'touch' && !same) {     // на телефоне: первое касание целится, второе поджигает
      aimCell = cell;
      showCross(cell);
      note(aimKind === 'roots' ? 'Коснитесь ещё раз, чтобы сковать столбец' : 'Коснитесь ещё раз, чтобы поджечь');
      return;
    }
    if (aimKind === 'roots') castRoots(cell.c); else playerCast(cell);
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
  note('Подсказка: этот обмен собирает камни');
}
document.getElementById('hint').addEventListener('click', showHint);

const muteBtn = document.getElementById('mute');
const renderMute = () => { muteBtn.textContent = Sound.muted ? 'Звук: выкл' : 'Звук: вкл'; };
muteBtn.addEventListener('click', () => { Sound.setMuted(!Sound.muted); renderMute(); Sound.swap(); });
renderMute();

// Оформление экрана боя: «1» — прежнее, «2» — новое (та же разметка, другая облицовка, см. css/style.css).
// Переключается прямо в бою, оба варианта остаются доступны, выбор запоминается в профиле.
// «3» — «колонки» (Profile.data.ui = 'columns'): та же бронзовая облицовка, что у «2» (класс ui-modern), плюс
// своя раскладка (класс ui-columns): герой | столбец заклинаний | поле | столбец противника | противник,
// ранец под полем. Раскладка целиком в CSS; game.js только рисует столбец противника (renderEnemyColumn).
// Кнопка ходит по кругу 1 → 2 → 3 → 1; неизвестное значение в старом сохранении считается «1».
const UI_SKINS = ['classic', 'modern', 'columns'];
const UI_SKIN_TIPS = ['новое оформление экрана боя', 'оформление «колонки»', 'прежнее оформление экрана боя'];
const uiSkinBtn = document.getElementById('ui-skin');
function renderUiSkin() {
  const i = Math.max(0, UI_SKINS.indexOf(Profile.data.ui));
  const skin = UI_SKINS[i];
  document.body.classList.toggle('ui-modern', skin === 'modern' || skin === 'columns');
  document.body.classList.toggle('ui-columns', skin === 'columns');
  uiSkinBtn.textContent = 'Оформление: ' + (i + 1);
  uiSkinBtn.title = 'Переключить на ' + UI_SKIN_TIPS[i];
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
  if (e.key === 'Escape' && aiming) { stopAim(); note('Ваш ход'); }
});

// «Отступить»: уйти с поля боя на карту (награды нет, существо остаётся). Нужно подтверждение.
let fleeArmed = null;
const restartBtn = document.getElementById('restart');
restartBtn.addEventListener('click', () => {
  if (over) return MapView.returnFromBattle(Combat.enemyDefeated(fighters.right) ? 'win' : 'loss');
  if (busy) return;
  if (!fleeArmed) {
    restartBtn.textContent = 'Точно отступить?';
    fleeArmed = setTimeout(() => { restartBtn.textContent = 'Отступить'; fleeArmed = null; }, 2500);
    return;
  }
  clearTimeout(fleeArmed);
  fleeArmed = null;
  restartBtn.textContent = 'Отступить';
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
  fsBtn.textContent = on ? 'Свернуть' : 'Полный экран';
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
    if (typeof Art !== 'undefined' && Art.has(key)) {
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
