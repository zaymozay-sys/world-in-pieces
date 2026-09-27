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
  left:  { name: 'Игрок',     hp: RULES.defaultHp, max: RULES.defaultHp, base: RULES.defaultHp, counts: {}, magic: false,
           gear: Gear.emptyLoadout(), stats: Gear.stats(Gear.emptyLoadout()), buffs: [], haste: false },
  right: { name: 'Противник', hp: RULES.defaultHp, max: RULES.defaultHp, base: RULES.defaultHp, counts: {}, magic: false, level: RULES.defaultLevel,
           monsterId: 'rat', tier: 1, innate: {}, gearBudget: 0, levelOverride: null,
           gear: Gear.emptyLoadout(), stats: Gear.stats(Gear.emptyLoadout()), buffs: [], haste: false, bag: {} },
};



const fEl = (side) => document.getElementById('fighter-' + side);
const magicCostOf = (side) => Combat.spellCost(fighters[side]);
const canAffordMagic = (side) => MAGIC_TYPES.every((t) => fighters[side].counts[t] >= magicCostOf(side));

function buildFighter(side) {
  const f = fighters[side];
  const el = fEl(side);
  el.classList.remove('dead', 'active');
  // Чёрные камни не считаем: они только наносят урон.
  const counters = MAGIC_TYPES.map((t) =>
    `<div class="counter" data-type="${t}" title="${GEM_NAMES[t]}">${GEM_SVG[t]}<b>0</b></div>`).join('');
  // Уровень противника стоит прямо рядом с его именем.
  const nameRow = side === 'right'
    ? `<div class="name"><span style="color:${tierColor(f.tier)}">${f.name}</span> ${tierChip(f.tier)} <label class="lvl">ИИ <input class="level" type="number" min="1" max="100" step="1" value="${f.level}" title="Уровень ИИ противника, 1–100 (глубина и точность его ходов)"></label></div>`
    : `<div class="name">${f.name} <span class="hero-lvl" title="Уровень героя">ур. ${f.level || 1}</span></div>`;
  el.innerHTML = `
    <div class="avatar" title="Открыть ранец и экипировку"></div>
    ${nameRow}
    <div class="hpbar"><i></i></div>
    <div class="hptext"></div>
    <div class="counters">${counters}</div>
    ${side === 'left' ? '<div class="wallet" title="Ваши деньги"></div>' : ''}
    <div class="gearrow" title="Открыть ранец и экипировку"></div>
    <div class="statline"></div>
    ${side === 'right' ? `<div class="ability-line" title="${(Bestiary.ability(f.monsterId) || {}).desc || ''}">Приём: <b>${(Bestiary.ability(f.monsterId) || {}).name || '—'}</b></div>` : ''}
    <div class="badge"></div>
    <label class="hpset">ХП <input class="hp" type="number" min="1" step="1" value="${f.base}" title="Базовое ХП (снаряжение добавляет своё)"></label>`;

  el.querySelector('input.hp').addEventListener('change', (e) => {
    const v = Math.max(1, Math.floor(Number(e.target.value)) || 1);
    e.target.value = v;
    f.base = v;                     // базовое ХП; снаряжение добавляет своё
    f.hpEdited = true;              // ручная правка — для проверки; награды за такой бой нет
    recalcStats(side);
    f.hp = f.max;                   // смена максимума восстанавливает ХП
    if (over && fighters.left.hp > 0 && fighters.right.hp > 0) {
      hideOverlay();
      invalidStreak = 0;
      setTurn('left');
      busy = false;
    }
    saveSettings();
    renderFighters();
  });

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
const BUFF_NAMES = { power: 'Эликсир силы', banner: 'Знамя', howl: 'Вой' };
const itemColor = (it) => (it.set && Gear.SETS[it.set] ? Gear.SETS[it.set].color : Gear.NEUTRAL_COLOR);
// Идёт ли бой (или игрок на карте). Снаряжение можно менять вне боя, до первого хода и после конца боя.
let inBattle = false;
function enterBattle() { inBattle = true; }
function leaveBattle() { inBattle = false; }
const canEditGear = () => !inBattle || (moves === 0 && !busy) || over;

function recalcStats(side) {
  const f = fighters[side];
  f.stats = Gear.combine(Gear.stats(f.gear), f.innate || {});   // предметы + врождённые способности
  f.max = f.base + f.stats.health;
  f.hp = Math.min(f.hp, f.max);
}

// Уровень героя: базовое ХП и урон камней (если ХП не подправлено вручную для проверки).
function applyLevel() {
  const f = fighters.left, L = Profile.level();
  f.level = L;
  f.dmg = Hero.dmgMult(L);
  if (!f.hpEdited) f.base = Hero.baseHp(L);
}

function renderAvatar(side) {
  const box = fEl(side).querySelector('.avatar');
  if (!box) return;
  const f = fighters[side];
  if (side === 'left') {
    box.innerHTML = Figures.avatar(Factions.heroKind(Profile.data.faction || 'dwarf', Profile.data.gender), f.gear);
  } else {
    box.innerHTML = f.monsterId === 'dragon' ? Figures.avatar('dragon', f.gear) : MonsterArt.bust(f.monsterId, f.tier);
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

// Выбирает противника из бестиария (Profile.data.monster) и настраивает его: ХП, способности, ИИ, снаряжение.
function setupEnemy() {
  const sel = Profile.data.monster;
  const id = Bestiary.MONSTERS[sel.id] ? sel.id : 'rat';
  const tier = Tiers.clamp(sel.tier);
  const m = Bestiary.MONSTERS[id], sc = Bestiary.scaled(id, tier), f = fighters.right;
  if (f.monsterId !== id || f.tier !== tier) f.levelOverride = null;
  Object.assign(f, {
    monsterId: id, tier, name: m.name, base: f.hpEdited ? f.base : sc.hp, innate: sc.stats, gearBudget: sc.gearBudget,
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
  transmute: { name: 'Превращение', bar: 'Превра\u00ADщение', icon: transmuteIcon,   // мягкий перенос для узкой кнопки
    tip: 'Выбранный камень и все камни его цвета вокруг (область 3x3) становятся обсидианом' },
  heal: { name: 'Целебный дождь', icon: healIcon,
    tip: 'Лечит на сумму номиналов сапфиров, рубинов и изумрудов на поле' },
  chaos: { name: 'Хаос', icon: chaosIcon,
    tip: 'Перемешивает все камни на поле' },
};

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
    else playerInstant(k);
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
  return false;
}

function renderBag() {
  if (!bagEl) return;
  const bag = Profile.data.backpack;
  bagEl.innerHTML = Object.entries(Gear.CONSUMABLES).map(([k, c]) =>
    `<button type="button" class="bagitem ${k}" data-item="${k}" title="${c.name}: ${c.desc}" ${bagDisabled(k) ? 'disabled' : ''}>
       ${itemIcon(k)}<b>${bag[k] || 0}</b><span>${c.name}</span></button>`).join('');
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
    logEvent(side, `${f.name}: Эликсир силы, +${ef.power}% к урону на ${ef.turns} хода`);
    note(`${f.name}: Эликсир силы`);
  } else if (kind === 'dust') {
    renderCounters(side);
    Sound.match(4, 1);
    logEvent(side, `${f.name}: Каменная пыль, +${ef.stones} камня каждого вида`);
  } else if (kind === 'scroll') {
    Sound.lightning();
    logEvent(side, `${f.name}: Свиток спешки`);
    note(`${f.name}: следующий ход даст дополнительный ход`);
  }
  bag[kind]--;
  if (side === 'left') Profile.save();
  renderFighters();
  return true;
}

// Расходники противника: использует по простым правилам в начале своего хода.
async function enemyUseItems() {
  for (const k of Combat.enemyItemPlan(fighters.right, canAffordMagic('right'))) if (useConsumable('right', k)) await sleep(650);
}

function spellDisabled(kind, on, ready) {
  const f = fighters.left;
  if (busy || over) return true;
  if (kind === 'lightning') return aiming || (!on && !ready);
  if (kind === 'fire' || kind === 'transmute') return f.magic || (aiming && !on) || (!on && !ready);
  if (aiming || f.magic || !ready) return true;            // heal, chaos
  if (kind === 'heal' && f.hp >= f.max) return true;
  return false;
}

function renderMagic() {
  const f = fighters.left;
  const ready = canAffordMagic('left');
  for (const kind of Object.keys(MAGICS)) {
    const btn = spellbarEl.querySelector(`button.${kind}`);
    if (!btn) continue;
    const on = kind === 'lightning' ? f.magic : (aiming && aimKind === kind);
    btn.classList.toggle('on', on);
    btn.classList.toggle('ready', ready && !on);
    let label = MAGICS[kind].bar || MAGICS[kind].name;
    if (on) label = kind === 'lightning' ? 'Отмена' : 'Выберите цель';
    btn.innerHTML = MAGICS[kind].icon('bar-' + kind) + `<span>${label}</span>`;
    btn.disabled = spellDisabled(kind, on, ready);
  }
  renderFactionButton();
  const title = document.querySelector('.spell-title');
  if (title) { const c = magicCostOf('left'); title.textContent = `Магия: по ${c} камней каждого вида`; }
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
  for (const b of f.buffs) parts.push(`${BUFF_NAMES[b.kind] || 'Усиление'} (${b.turns})`);
  if (f.poison && f.poison.turns > 0) parts.push(`Яд (${f.poison.turns})`);
  if (f.haste) parts.push('Спешка');
  badge.textContent = parts.join(' · ');
  renderGear(side);
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
  btn.title = `${fac.ability.name}: ${fac.ability.desc}. Заряжается камнями «${GEM_NAMES[fac.gem]}» (${charge}/${CHARGE}). Ход не тратит.`;
  btn.innerHTML = `${factionIcon(Profile.data.faction || 'dwarf')}<span>${on ? 'Выберите столбец' : fac.ability.name}</span>
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

function spendMagic(side, sign) {          // sign: -1 списать, +1 вернуть
  for (const t of MAGIC_TYPES) fighters[side].counts[t] += sign * magicCostOf(side);
  renderCounters(side);
}

// Игрок включает/выключает Магию перед своим ходом.
function toggleMagic() {
  if (busy || over || aiming) return;
  const f = fighters.left;
  if (f.magic) { f.magic = false; spendMagic('left', +1); }
  else if (canAffordMagic('left')) { f.magic = true; spendMagic('left', -1); }
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
function dealDamage(target, amount, raw = false) {
  if (amount <= 0) return 0;
  const attackerSide = other(target), attacker = fighters[attackerSide];
  const r = Combat.hit(attacker, fighters[target], amount, raw);
  if (r.charged) showFloat(attackerSide, 'Натиск!', 'buff');
  if (r.kind === 'block') {
    showFloat(target, 'Блок!', 'block');
    turnEvents.block++;
    turnEvents.blockTarget = target;
    Sound.swap();
    return 0;
  }
  if (r.pierce) showFloat(attackerSide, 'Подлый удар!', 'buff');
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
  if (r.amount >= fighters[target].max * 0.1) shake();
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
  while (list.children.length > 6) list.lastChild.remove();
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
  turnSide = side;
  fEl('left').classList.toggle('active', side === 'left');
  fEl('right').classList.toggle('active', side === 'right');
  statusEl.textContent = side === 'left' ? 'Ваш ход' : 'Противник думает…';
  renderMagic();
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
  hideOverlay();
  const o = document.createElement('div');
  o.className = 'overlay';
  o.id = 'overlay';
  o.innerHTML = `<div>${text}${sub ? `<small>${sub}</small>` : ''}<button type="button" class="primary to-map">На карту</button></div>`;
  const result = text === 'Победа!' ? 'win' : 'loss';
  o.querySelector('.to-map').addEventListener('click', () => MapView.returnFromBattle(result));
  boardEl.appendChild(o);
  over = true;
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
  const logEl = document.getElementById('log');
  if (logEl) logEl.innerHTML = '';
  hideOverlay();
  buildBoard();
  rewarded = false;
  fighters.left.hpEdited = fighters.right.hpEdited = false;   // ручная правка ХП действует только в одном бою
  applyFaction();
  fighters.left.gear = Profile.gear();
  setupEnemy();
  clearLocks();
  veiled.clear();
  fighters.left.charge = 0;
  Object.assign(fighters.right, { turnNo: 0, revived: false, charged: false, poison: null });
  Object.assign(fighters.left, { revived: false, charged: false, poison: null });
  for (const s of ['left', 'right']) {
    fighters[s].buffs = [];
    fighters[s].haste = false;
    recalcStats(s);
    fighters[s].hp = fighters[s].max;
    fighters[s].magic = false;
    fighters[s].counts = Object.fromEntries(GEM_TYPES.map((t) => [t, 0]));
    buildFighter(s);
  }
  moves = 0;
  movesEl.textContent = 0;
  selected = null;
  invalidStreak = 0;
  grid = Array.from({ length: N }, () => Array(N).fill(null));
  spawnFilled(fillEmpty());
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
  setPos(grid[a.r][a.c], a.r, a.c);
  setPos(grid[b.r][b.c], b.r, b.c);
  await sleep(RULES.timing.swap);

  if (hasMatches()) return true;

  Sound.bad();
  swapCells(a, b);
  setPos(grid[a.r][a.c], a.r, a.c);
  setPos(grid[b.r][b.c], b.r, b.c);
  await sleep(RULES.timing.swap);
  return false;
}

// Награда за победу: опыт, монеты, ресурсы монстра его цвета, иногда вещь и расходник.
// Бой с вручную подправленным ХП — проверочный, награды за него нет.
function grantRewards() {
  if (rewarded) return '';
  rewarded = true;
  if (moves < Balance.rewards.minMoves || fighters.left.hpEdited || fighters.right.hpEdited) return 'Награда не выдана: проверочный бой (ХП изменено вручную) или слишком лёгкий бой';
  const f = fighters.right, R = Balance.rewards;
  const xp = Hero.xpReward(Bestiary.MONSTERS[f.monsterId], f.tier, Profile.level());
  const drops = Bestiary.rollDrops(f.monsterId, f.tier, Math.random, Profile.data.faction);
  drops.coins = Math.round(drops.coins * Factions.perk(Profile.data.faction, 'coins'));   // люди: +10% монет
  Profile.data.wins++;
  Profile.recordWin(f.monsterId, f.tier);
  Profile.addCoins(drops.coins);
  const up = Profile.addXp(xp);
  const lines = [`Опыт: +${xp}`, `Монеты: ${Tiers.moneyText(drops.coins)}`];
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
  if (fighters.right.hp <= 0) { showOverlay('Победа!', grantRewards()); return true; }
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
  fighters[side].magic = false;             // Магия действует на один ход
  renderMagic();
  if (checkEnd()) return 1;

  // Новые камни появляются, только когда поле пусто или ходов не осталось.
  if (isEmptyBoard() || !Engine.hasMoves(typOf())) await refillBoard();
  return finishAction(side, extra);
}


/* ---------- Огненный крест ---------- */
// Сжигает всю строку и весь столбец выбранной клетки (крест на поле 6x6).
// За каждый сожжённый камень наносится урон, равный его номиналу.

function toggleAim(kind) {
  if (busy || over || (fighters.left.magic && kind !== 'roots')) return;
  if (aiming) { stopAim(); note('Ваш ход'); return; }
  if (kind !== 'roots' && !canAffordMagic('left')) return;
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
    cross.querySelector('.row').style.cssText = `top:${cell.r * u}%;height:${u}%;left:0;width:100%`;
    cross.querySelector('.col').style.cssText = `left:${cell.c * u}%;width:${u}%;top:0;height:100%`;
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
  if (!opts.free) spendMagic(side, -1);
  note(`${title}!`);
  Sound.fire();

  const target = other(side);
  const burning = [];
  let dmg = 0, maxDist = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const tile = grid[r][c];
      if (!tile || (shape === 'row' ? r !== cell.r : (r !== cell.r && c !== cell.c))) continue;
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
  spendMagic(side, -1);
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
  spendMagic(side, -1);
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
  spendMagic(side, -1);
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

async function afterPlayerSpell(res) {
  if (over) return;
  if (res === 2) {                                  // каскад с линией 4+ — ходите ещё раз
    busy = false;
    renderMagic();
    note('Дополнительный ход!');
    return;
  }
  await enemyTurn();
}

// Заклинание с выбором клетки (Огненный крест, Превращение).
async function playerCast(cell) {
  const kind = aimKind;
  busy = true;
  renderMagic();
  invalidStreak = 0;
  const res = kind === 'transmute' ? await castTransmute('left', cell) : await castFire('left', cell);
  endPlayerAction();
  await afterPlayerSpell(res);
}

// Заклинания без выбора цели (Целебный дождь, Хаос).
async function playerInstant(kind) {
  if (busy || over || aiming || fighters.left.magic || !canAffordMagic('left')) return;
  if (kind === 'heal' && fighters.left.hp >= fighters.left.max) return;
  busy = true;
  renderMagic();
  invalidStreak = 0;
  const res = kind === 'heal' ? await castHeal('left') : await castChaos('left');
  endPlayerAction();
  await afterPlayerSpell(res);
}

async function playerMove(a, b) {
  if (isLocked('left', a) || isLocked('left', b)) {
    clearSelection();
    note('Этот столбец скован камнем — выберите другой ход');
    return;
  }
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
    await enemyTurn();                          // неверный ход — очередь противника
    return;
  }
  invalidStreak = 0;
  if (over) return;
  if (ok === 2) {                              // линия из 4+ камней — ходите ещё раз
    busy = false;
    renderMagic();
    note('Дополнительный ход!');
    return;
  }
  await enemyTurn();
}

async function enemyTurn() {
  setTurn('right');
  if (await enemyTurnStart()) return;            // яд и приёмы существа; true — бой окончен
  for (;;) {
    await sleep(RULES.timing.think);
    await enemyUseItems();

    const f = fighters.right;
    const v = Combat.aiView(f, fighters.left);          // ХП в «камнях» с учётом роста урона, Силы и Брони
    const mv = AI.choose(typOf(), valOf(), v.hpMe, v.hpOpp, f.level, canAffordMagic('right') && !f.magic,
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
        spendMagic('right', -1);
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
    if (res !== 2) break;
    note('Противник ходит ещё раз!');          // у него тоже была линия из 4+
  }
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

  if (f.poison && f.poison.turns > 0) {
    f.poison.turns--;
    showFloat('right', 'Яд', 'venom');
    const dealt = dealDamage('right', f.poison.dmg, true);
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
  let bon = Engine.bonusMap(typOf());
  while (bon) {
    const bumped = new Set();
    let dmg = 0, maxBonus = 1, charge = 0;
    const home = side === 'left' ? playerFaction().gem : null;
    for (let i = 0; i < N * N; i++) {
      if (!bon[i]) continue;
      const tile = grid[Math.floor(i / N)][i % N];
      const amount = tile.value * bon[i];        // номинал камня x бонус линии
      f.counts[tile.type] += amount;
      if (tile.type === home) charge += amount;  // родные камни заряжают приём фракции
      // Обычно урон наносит только обсидиан; в режиме Магии — камни любого цвета.
      if (tile.ti === ONYX || f.magic) dmg += amount;
      if (bon[i] > maxBonus) maxBonus = bon[i];
      bumped.add(tile.type);
      tile.el.classList.add('pop');
    }
    let cleared = 0;
    for (let i = 0; i < N * N; i++) if (bon[i]) cleared++;
    turnStats.stones += cleared;
    turnStats.bonus = Math.max(turnStats.bonus, maxBonus);
    Sound.match(cleared, maxBonus);
    if (maxBonus > 1) { extra = true; note(`Бонус x${maxBonus}! Дополнительный ход`); }
    renderCounters(side, [...bumped]);
    if (charge) addCharge(charge);
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

    bon = Engine.bonusMap(typOf());                 // 3. возможный каскад
  }
  return extra;
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
  if (!cell || !grid[cell.r][cell.c]) return;
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
  if (to.r >= 0 && to.c >= 0 && to.r < N && to.c < N && grid[to.r][to.c]) playerMove(drag.cell, to);
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

// Настройки для проверки баланса. ХП теперь задают уровень героя и цвет существа; ручная правка ХП
// действует только в текущем бою и не сохраняется.
const SETTINGS_KEY = 'gem-match-settings';
function saveSettings() { /* ничего не сохраняем между запусками */ }
function loadSettings() {
  try { localStorage.removeItem(SETTINGS_KEY); } catch (e) { /* без хранилища */ }
}

document.getElementById('gear').addEventListener('click', () => Inventory.open('left'));
document.getElementById('bestiary').addEventListener('click', () => Screens.openBestiary());

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
  if (over) return MapView.returnFromBattle(fighters.right.hp <= 0 ? 'win' : 'loss');
  if (busy) return;
  if (!fleeArmed) {
    restartBtn.textContent = 'Точно отступить?';
    fleeArmed = setTimeout(() => { restartBtn.textContent = 'Отступить'; fleeArmed = null; }, 2500);
    return;
  }
  clearTimeout(fleeArmed);
  fleeArmed = null;
  restartBtn.textContent = 'Отступить';
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
