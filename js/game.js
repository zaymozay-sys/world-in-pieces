if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Игровая логика и анимация. Расчёт поля — в engine.js, противник — в ai.js,
   правила боя (урон, приёмы, расходники) — в combat.js, все числа баланса — в balance.js,
   уровни героя — в hero.js. Здесь — ход боя, анимации и интерфейс. */

const RULES = {
  size: 6,               // поле 6x6
  defaultHp: 100,
  firstMove: null,       // для отладки: 'left' или 'right' — кто ходит первым (обычно решает Проворство)
  defaultLevel: 30,      // уровень противника 1..100
  timing: { swap: 200, clear: 230, fall: 280, shift: 280, spawn: 320, think: 600, burn: 650 },
};

// 1.6.4: скорость анимаций — настройка устройства (не профиль): быстро ×0.6, обычно ×1, медленно ×1.5. Меняет только паузы и
// плавность движения камней (RULES.timing и CSS-переменная --anim); правила, баланс и таймер хода не затрагивает.
const AnimSpeed = (() => {
  const KEY = 'wip-anim', F = { normal: 1, fast: 0.6, slow: 1.5 }, ORDER = ['normal', 'fast', 'slow'], BASE = { ...RULES.timing };
  let cur = 'normal';
  try { const v = localStorage.getItem(KEY); if (F[v]) cur = v; } catch (e) { /* без хранилища — обычная */ }
  const apply = () => {
    for (const k in BASE) RULES.timing[k] = Math.round(BASE[k] * F[cur]);
    try { document.documentElement.style.setProperty('--anim', String(F[cur])); } catch (e) { /* нет страницы */ }
  };
  const label = () => cur === 'fast' ? _t("Анимации: быстрые") : cur === 'slow' ? _t("Анимации: медленные") : _t("Анимации: обычные");
  const cycle = () => { cur = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length]; try { localStorage.setItem(KEY, cur); } catch (e) { /* не страшно */ } apply(); return cur; };
  apply();
  return { label, cycle, apply, get mode() { return cur; } };
})();

// 1.6.5: таймер хода — настройка устройства (не профиль). По умолчанию ВЫКЛ: в боях с существами можно думать сколько угодно.
// Включённый таймер — Combat.TURN_TIMER.seconds (30 с) на ход, три пропуска подряд — поражение; пока открыто окно (ранец, справка,
// карточки), время стоит. Бой против живого игрока (PvP, позже) вёл бы таймер всегда и без пауз: host.pvp === true (на сервере).
const TurnTimerSetting = (() => {
  const KEY = 'wip-turn-timer';
  let on = false;
  try { on = localStorage.getItem(KEY) === '30'; } catch (e) { /* без хранилища — выключен */ }
  const set = (v) => {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '30' : 'off'); } catch (e) { /* не страшно */ }
    try { window.dispatchEvent(new Event('turn-timer-changed')); } catch (e) { /* нет страницы */ }
    return on;
  };
  return {
    get on() { return on; }, set, toggle: () => set(!on),
    label: () => on ? _t("Таймер хода: 30 с") : _t("Таймер хода: выкл"),
    short: () => on ? _t("Таймер: 30 с") : _t("Таймер: выкл"),
  };
})();

// 1.6.5 (заготовка, ВЫКЛЮЧЕНА: AdPause.enabled = false): когда появится реклама, при долгом раздумье над ходом (idleMs, по умолчанию 2 мин
// без нажатий) игроку предлагается пауза на рекламу. Кнопка «Нет, продолжаем игру» закрывает сообщение и начинает отсчёт заново.
// Сама реклама подключается через AdPause.onAccept (пока пусто — кнопка согласия закрывает сообщение).
const AdPause = (() => {
  const cfg = { enabled: false, idleMs: 120000, onAccept: null };
  let timer = null, pop = null;
  const clear = () => { if (timer) clearTimeout(timer); timer = null; };
  const hide = () => { if (pop) { pop.remove(); pop = null; } };
  const show = () => {
    timer = null;
    if (!cfg.enabled || pop || typeof document === 'undefined') return;
    pop = document.createElement('div');
    pop.className = 'modal-back adpause-back';
    pop.innerHTML = `<div class="modal adpause" role="dialog" aria-label="${_t("Пауза на рекламу")}"><p>${_t("Пока думаете над ходом, можно сделать паузу на рекламу")}</p><div class="adpause-act"><button type="button" class="primary" data-adpause="yes">${_t("Сделать паузу")}</button><button type="button" data-adpause="no">${_t("Нет, продолжаем игру")}</button></div></div>`;
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-adpause]'); if (!b) return;
      const yes = b.dataset.adpause === 'yes'; hide();
      if (yes && typeof cfg.onAccept === 'function') { try { cfg.onAccept(); } catch (err) { /* реклама не должна ломать бой */ } }
      arm();
    });
    document.body.appendChild(pop);
  };
  function arm() { clear(); if (cfg.enabled && !pop) timer = setTimeout(show, cfg.idleMs); }
  const touch = () => { if (timer) arm(); };       // любое нажатие игрока — отсчёт заново
  if (typeof document !== 'undefined') { document.addEventListener('pointerdown', touch, true); document.addEventListener('keydown', touch, true); }
  return { cfg, arm, disarm() { clear(); hide(); }, get shown() { return !!pop; },
    get enabled() { return cfg.enabled; }, set enabled(v) { cfg.enabled = !!v; if (!v) { clear(); hide(); } } };
})();

const N = RULES.size;
const ONYX = GEM_TYPES.indexOf('onyx');
const MAGIC_TYPES = ['sapphire', 'ruby', 'emerald'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (n) => Math.floor(BattleRand.next() * n);   // случайный выбор в бою: общий поток BattleRand (см. js/battlerand.js)

// Бой как фабрика: основной экземпляр — на странице, второй (поле питомца) — на копии разметки.
function createBattle(host) {
  const root = host.root;
  // 1.6.4 (WIP-07): во втором поле (копия разметки) id переименованы в pet-<id>, исходное имя хранится в data-bid
  const $ = (id) => root.querySelector('[id="' + id + '"], [data-bid="' + id + '"]') || (host.main ? document.getElementById(id) : null);
  const SND = host.sound || Sound;
const PET = host.role === 'pet';          // поле питомца: тот же бой на копии разметки, за героя играет питомец
let autopilot = !!host.autopilot;         // ходы нашей стороны ведёт ИИ
let autoLevel = host.autoLevel || 100;    // уровень ИИ автопилота, 1..100 (у питомца растёт с опытом)
let autoPending = false;
// 1.6.5 (A2-21): сколько пауз (sleep) этого поля сейчас в полёте. Пока хоть одна есть, ход (каскад, заклинание) ещё не доигран и держит старые
// координаты камней. Свой sleep внутри поля (тень общего) считает паузы; whenIdle() ждёт, когда их не останется.
let sleepsPending = 0;
const sleep = (ms) => { sleepsPending++; return new Promise((r) => setTimeout(() => { sleepsPending--; r(); }, ms)); };
// Бой вдвоём: выживший добивает чужого противника. finishBoard вызывается прямо из dealDamage посреди каскада, и принять нового противника сразу нельзя —
// каскад ещё ждёт на sleep, потом проверит sideDown (по новому, живому противнику это уже ложь) и пойдёт дальше по устаревшим координатам.
// Поэтому передачу откладываем, пока поле само не дойдёт до выхода по sideDown и не уберёт за собой. Предохранитель: не ждать дольше ~10 с.
function whenIdle() {
  return new Promise((res) => {
    let n = 0;
    const tick = () => { if (sleepsPending === 0 || ++n > 700) res(); else setTimeout(tick, 15); };
    setTimeout(tick, 0);
  });
}
const boardEl = $('board');
const movesEl = $('moves');
const statusEl = $('status');
const timerEl = $('turn-timer');

let grid = [];          // grid[r][c] = { type, ti, value, el } | null
let moves = 0;
let battleStyle = { spells: 0, elixirs: 0 };   // 1.6.2: для медалей за стиль боя
let busy = false;       // идёт анимация или ход противника — ввод закрыт
let over = false;
let selected = null;
let aiming = false;      // игрок выбирает центр Огненного креста
let aimKind = null;      // какое заклинание наводится: 'fire' | 'transmute'
// 1.7.3: «Анализ боя» — счётчики за бой (кнопка в окне итога). dmgTag помечает источник урона по герою (штраф, яд, стая).
let rec = null, dmgTag = '';
function newRec() { return { turns: 0, dealt: 0, taken: 0, pen: 0, poison: 0, pack: 0, blocks: 0, absorbed: 0, stuns: 0, stunResist: 0 }; }
rec = newRec();
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
// 1.9.7: подсказка при первом событии — только в обычном бою героя (не в обучении, тренировке и онлайн-дуэли)
function tipOnce(id) { if (typeof Tips !== 'undefined' && host.main && !TUT() && !isTraining() && !LIVE) Tips.fire(Profile.data, id) && Profile.save(); }
// 1.9.7: мягкий старт — в первых боях новичка противник играет хуже, подсказка под рукой, а после долгого раздумья ходит сама
const HINT_WINS = 10, SOFT_WINS = 5, IDLE_HINT_MS = 25000;
const softStart = () => host.main && !LIVE && !isTraining() && !TUT() && (Profile.data.wins || 0) < SOFT_WINS;
const softWins0 = () => softStart() && (Profile.data.wins || 0) < 3;
const softLevel = (lvl) => (softStart() ? Math.max(1, Math.round(lvl * [0.2, 0.35, 0.5, 0.65, 0.8][Math.min(4, Profile.data.wins || 0)])) : lvl);
let idleHint = null;
function stopIdleHint() { clearTimeout(idleHint); idleHint = null; }
function startIdleHint() {
  stopIdleHint();
  if (!softStart()) return;
  idleHint = setTimeout(() => { if (!over && !busy && turnSide === 'left' && !windowOpen()) { showHint(); tipOnce('idle'); } }, IDLE_HINT_MS);
}
// после проигрыша в первых боях — одна строка о причине и что делать
function earlyLossHelp() {
  if (!softStart() || typeof Tips === 'undefined') return;
  const lost = rec.taken + rec.pen + rec.poison + rec.pack, E = fighters.right;
  const text = rec.pen * 4 >= lost && rec.pen > 0 ? _t("Много здоровья ушло на неверные ходы. Перед ходом ищите линию из 3 одинаковых камней — кнопка «Подсказка» покажет удачный обмен.")
    : rec.dealt * 3 < E.max ? _t("Мало урона. Собирайте линии из 4 камней: они дают дополнительный ход и бонус ×2 — этому учит Бобёр в Библиотеке.")
    : _t("Противник оказался сильнее. Загляните в посёлок: купите оружие и броню — и возвращайтесь.");
  Tips.show(text);
}
let beaverTip = null;
function setBeaverTip(tip) { beaverTip = tip; }
// Таймер хода игрока (30с): не походил вовремя — ход автопропускается; 3 таких пропуска подряд — поражение.
let turnTimerHandle = null, turnTimerLeft = 0, skipStreak = 0;
// 1.9.x: бой в реальном времени с живым игроком (js/live.js). LIVE живёт от старта боя до выхода с поля.
let LIVE = null, livePending = null, invalidStreakR = 0;
const liveLevel = () => (LIVE && LIVE.fixed ? LIVE.fixed.level : Profile.level());   // турнир: уровень один для всех
const tourneyFight = () => !!(LIVE && LIVE.fixed);               // бой турнира: ни наград арены, ни износа своих вещей
const liveSide = (role) => (LIVE && role === LIVE.role ? 'left' : 'right');   // чья сторона на нашем экране: свои — слева
let boardRand = BattleRand.next;                         // 1.5.4: генератор новых камней (в Испытании дня — по зерну дня)
let specialDone = false;                             // 1.5.4: итог арены/испытания уже записан
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



const fEl = (side) => $('fighter-' + side);
// kind — какое заклинание ('lightning' по умолчанию): у каждого своя цена (Balance.magic.costs).
const magicCostOf = (side, kind = 'lightning') => Combat.spellCost(fighters[side], kind);
const canAffordMagic = (side, kind = 'lightning') => !fighters[side].isPet && MAGIC_TYPES.every((t) => fighters[side].counts[t] >= magicCostOf(side, kind));
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

  { // 1.8.1: на телефоне вместо «ур. N» / «Ур.N Цвет» — цифра в кружке цвета уровня (CSS .lv-dot)
    const dotTier = side === 'right' ? f.tier : Hero.tierFor(f.level || 1), tc = Tiers.get(dotTier), nm = el.querySelector('.name');
    if (nm && tc) nm.insertAdjacentHTML('afterbegin', `<span class="lv-dot" style="--t:${tc.color};--ti:${tc.ink}" aria-hidden="true">${side === 'right' ? f.tier : (f.level || 1)}</span>`);
  }
  miniCounters(side);
  if (!host.main) for (const e of el.querySelectorAll('[id]')) { e.setAttribute('data-bid', e.id); e.id = 'pet-' + e.id; }   // 1.6.4 (WIP-07): id во втором поле уникальны
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
function leaveBattle() { inBattle = false; liveLeave(); if (!PET && typeof Duo !== 'undefined') Duo.end(); }
const canEditGear = () => !inBattle || (moves === 0 && !busy) || over;

// Тестовый режим «x10» (переключатель в окне «О разработчиках»): все характеристики, ХП и урон своего героя ×10.
// Нужен только для проверки сильных персонажей; проценты (Броня, Блок, Рикошет…) упираются в обычные потолки Gear.CAPS.
const testMult = () => (typeof Profile !== 'undefined' && Profile.data && Profile.data.testX10 ? 10 : 1);

function recalcStats(side) {
  const f = fighters[side];
  if (PET && side === 'left') return;               // боец питомца уже посчитан (Pets.petFighter)
  if (side === 'left' && cardFight()) {             // равные условия: как у тени по карточке
    f.stats = Gear.combine(Gear.stats(f.gear), f.innate || {});
    if (f.tempDef) f.stats.defense = (f.stats.defense || 0) + f.tempDef;
    f.max = f.base + f.stats.health + (f.tempMax || 0); f.hp = Math.min(f.hp, f.max); f.weaponPerk = Gear.weaponPerk(f.gear);
    return;
  }
  if (side === 'left' && isChallenge()) {           // 1.5.4: Испытание дня — одинаковый для всех герой без вещей и бонусов
    f.stats = Gear.combine(Gear.stats(Gear.emptyLoadout()), {});
    f.max = f.base + f.stats.health; f.hp = Math.min(f.hp, f.max); f.weaponPerk = null;
    return;
  }
  f.stats = Gear.combine(side === 'left' ? Gear.statsFor(f.gear, Profile.level()) : Gear.stats(f.gear), f.innate || {});   // предметы + врождённые способности
  if (side === 'left') {
    f.stats = Gear.combine(f.stats, Profile.medalsBonus());
    f.stats = Gear.combine(f.stats, Elixirs.bonusStats(f.elx));   // 1.6.0: эликсиры, выпитые в этом бою
    f.stats = Gear.combine(f.stats, Runes.bonusForGear(f.gear));   // + руны, вставленные в снаряжение (js/runes.js)
    if (testMult() > 1) {
      const x = {};
      for (const k in f.stats) x[k] = f.stats[k] * testMult();
      f.stats = Gear.combine(x, {});                               // с обычными потолками
    }
  }
  if (f.tempDef) f.stats.defense = (f.stats.defense || 0) + f.tempDef;   // Каменная кожа держится весь бой
  f.max = (side === 'left' ? f.base * testMult() : f.base) + f.stats.health;
  if (side === 'left' && f.bless === 'stone') f.max = Math.round(f.max * (1 + World.BLESSINGS.stone.amount / 100));   // 1.5.4: алтарь
  if (f.tempMax) f.max += f.tempMax;                                      // Банка мёда
  f.hp = Math.min(f.hp, f.max);
  f.weaponPerk = Gear.weaponPerk(f.gear);                       // приём особого оружия (арбалет, утренняя звезда)
}

// Уровень героя: базовое ХП и урон камней (если ХП не подправлено вручную для проверки).
function applyLevel() {
  const f = fighters.left, L = liveLevel();
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
  if (side === 'left' && f.isPet) {
    box.innerHTML = petPortrait(f);
    box.style.borderColor = tierColor(f.tier);
  } else if (side === 'left') {
    box.innerHTML = Figures.avatar(Factions.heroKind(Profile.data.faction || 'dwarf', Profile.data.gender), f.gear);
  } else {
    box.innerHTML = f.shadowHero ? Figures.avatar(Factions.heroKind(f.shadowHero.faction, f.shadowHero.gender), f.gear)
      : f.monsterId === 'dragon' ? Figures.avatar('dragon', f.gear)
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
  if (st.defense) parts.push(_t("Броня −{0}", [Combat.armorOf(f)]));
  if (st.block) parts.push(_t("Блок {0}%", [st.block]));
  if (st.ricochet) parts.push(_t("Рикошет {0}%", [st.ricochet]));
  if (st.initiative) parts.push(_t("Провор. {0}%", [st.initiative]));
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
  Profile.save();                               // 1.6.5: Лавка — постоянный каталог, витрину при смене народа обновлять не нужно
  onGearChanged();
  renderMagic();
  MapView.onFactionChanged();
}

// Фракция игрока: имя героя и врождённые бонусы (растут с уровнем героя).
function applyFaction() {
  const fac = playerFaction();
  fighters.left.name = Factions.heroTitle(Profile.data.faction || 'dwarf', Profile.data.gender) || fac.hero;   // 1.7.7: у героини — женское звание («Боевая гномка»), а не мужское
  fighters.left.innate = Factions.statsAt(Profile.data.faction || 'dwarf', Hero.tierFloat(Profile.level()));
  fighters.left.ability = null;
  applyLevel();
}

// Учебный бой (см. MapView.startTraining, Screens.library «Начать учебный бой»/«Отточить мастерство»):
// противник — сам Бобёр-хранитель, не вид из бестиария. isTraining() отличает такой бой от обычного —
// по нему наград не даётся (см. grantRewards) и вехи медалей за линию из 5 не копятся (см. resolveBoard).
const TUT = () => (typeof Tutorial !== 'undefined' && Tutorial.inBattle());
const isTraining = () => fighters.right.monsterId === 'beaver';
// 1.5.4: особые бои — Арена теней (sel.arena) и Испытание дня (sel.challenge): без питомца, награда своя.
const selNow = () => (host.main && Profile.data.monster) || {};
const isChallenge = () => !!selNow().challenge;
// 1.9.x: бой с карточкой живого игрока — равные условия: только вещи, народ и уровень (без медалей, рун, эликсиров, умений)
const cardFight = () => { const a = selNow().arena; return !!(a && a.gear); };
const isArena = () => !!selNow().arena || !!selNow().lord || !!selNow().run;      // 1.8.6: хозяин замка — тень героя, бой как на арене (без питомца)

// Бобёр-хранитель как тренировочный противник: переиспользует характеристики крысы первого тира
// (Bestiary.scaled) — лёгкий, точно проходимый бой, — но без способности, снаряжения и добычи,
// и не заносится в Bestiary.MONSTERS (это не настоящий вид, не должен попадать в бестиарий/добычу).
function setupTrainerBeaver() {
  const tier = 1, f = fighters.right;
  const sc = Bestiary.scaled('rat', tier, 1);
  if (f.monsterId !== 'beaver') f.levelOverride = null;
  Object.assign(f, {
    monsterId: 'beaver', tier, swarmSize: 1, affixes: [], elite: false, guardian: null, enraged: false, shadowHero: null,
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
  if (sel.lord) return setupShadow(sel.lord);
  if (sel.arena) return setupShadow(sel.arena);
  if (sel.run) return setupShadow(sel.run);             // 1.8.8: «Забег» — тень текущей волны
  const id = Bestiary.MONSTERS[sel.id] ? sel.id : 'rat';
  const tier = Tiers.clamp(sel.tier);
  const m = Bestiary.MONSTERS[id], f = fighters.right;
  // Рой (Дикие пчёлы): размер выпадает заново при каждой встрече — 1, 3 или 5 «на деле» в одном бою
  // (см. Bestiary.rollSwarmSize/scaled). У видов без поля swarm всегда 1 и ни на что не влияет.
  const swarmSize = sel.swarm || Bestiary.rollSwarmSize(id, Math.random);
  let sc = Bestiary.scaled(id, tier, swarmSize);
  if (sel.boss) sc = Story.scaleBoss(sc, sel.boss, Story.cycle(Profile.data.story));          // 1.3.0: страж осколка — вдвое крепче
  // 1.5.4: элитное существо — крепче, злее и со свойством (вторым приёмом); у стража — свои свойства и особый приём.
  const G = sel.boss && World.GUARDIANS[sel.boss];
  const ZB = sel.zone && World.ZONE_BOSSES[sel.zone];                      // 1.7.3: хозяин зоны — крупнее и злее, с добавочным приёмом
  if (ZB) sc = World.scaleZone(sc, sel.zone);
  const affixes = sel.elite ? [World.affixFor(sel.elite, m.ability)] : G ? G.affixes.filter((a) => a !== m.ability) : ZB ? ZB.affixes.filter((a) => a !== m.ability) : [];
  if (sel.elite) sc = { ...sc, hp: Math.round(sc.hp * World.ELITE.hp), dmg: sc.dmg * World.ELITE.dmg };
  if (sel.volley > 0) sc = { ...sc, hp: Math.max(1, Math.round(sc.hp * (1 - sel.volley))) };   // 1.7.0: осада — башни у ворот уже обстреляли врага
  if (Sky.hpMul(sel) !== 1) sc = { ...sc, hp: Math.round(sc.hp * Sky.hpMul(sel)) };            // 1.7.1: ночью существа крепче (+10% ХП)
  if (f.monsterId !== id || f.tier !== tier) f.levelOverride = null;
  if (sel.boss && host.main && Story.BY_ID[sel.boss]) setTimeout(() => logEvent('right', Story.BY_ID[sel.boss].taunt), 300);
  if (ZB && host.main) setTimeout(() => logEvent('right', ZB.taunt), 300);
  if (sel.volley > 0 && host.main) setTimeout(() => logEvent('right', _t("Башни обстреляли врага: −{0}% ХП", [Math.round(sel.volley * 100)])), 350);
  if (host.main && (sel.night || sel.wx)) setTimeout(() => {                                         // 1.7.1: ночь и непогода — одной строкой в журнал
    if (sel.night) logEvent('right', _t("Ночь: существа крепче на 10% ХП, добыча богаче"));
    if (sel.wx) logEvent('right', Sky.effectLines(sel.wx, false).slice(-1)[0]);
  }, 360);   // 1.5.1: страж говорит перед боем
  Object.assign(f, {
    monsterId: id, tier, swarmSize,
    name: (sel.boss ? Story.bossName(sel.boss, m.name) : ZB ? ZB.title : m.swarm ? `${m.name} ×${swarmSize}` : m.name) + (sel.elite ? ' ★' : '') + (sel.trait && Bestiary.ABILITIES[sel.trait] ? ' · ' + Bestiary.ABILITIES[sel.trait].name : ''),
    affixes, elite: !!sel.elite, guardian: sel.boss || null, enraged: false, shadowHero: null,
    base: f.hpEdited ? f.base : sc.hp, innate: sc.stats, gearBudget: sc.gearBudget,
    dmg: sc.dmg, ability: sel.trait && Bestiary.ABILITIES[sel.trait] ? sel.trait : m.ability, trait: sel.trait || null,   // 1.9.3: дух замка со своим приёмом
    level: f.levelOverride || sc.ai,
    gear: sc.gearBudget ? Gear.randomLoadout(sc.gearBudget, sel.challenge ? HexMap.rng(sel.challenge.seed + 1) : Math.random, tier) : Gear.emptyLoadout(),   // испытание: снаряжение по зерну дня
  });
  f.bag = enemyBag(f.level);
  if (host.main && (affixes.length || (G && G.mech))) setTimeout(() => {
    for (const a of affixes) logEvent('right', _t("{0}: свойство «{1}» — {2}", [f.name, World.AFFIXES[a].name, World.AFFIXES[a].desc]));
    if (G && G.mech) logEvent('right', _t("{0}: «{1}» — {2}", [f.name, G.name, G.desc]));
  }, 400);
}

// 1.5.4: Арена теней — противник-тень, копия героя другого народа под управлением ИИ (World.shadow).
// Внутри — вид «разбойник» (для служебных таблиц), но без его приёма и добычи; портрет — фигура героя.
function setupShadow(a) {
  const f = fighters.right, L = a.level, t = Hero.tierFor(L);
  f.levelOverride = null;
  const rand = HexMap.rng(a.seed || 1);
  Object.assign(f, {
    monsterId: 'bandit', tier: t, swarmSize: 1, name: a.nick,
    base: Hero.baseHp(L), innate: a.fixed ? {} : Factions.statsAt(a.faction, Hero.tierFloat(L)), gearBudget: Hero.budget(L),
    dmg: Hero.dmgMult(L), ability: null, affixes: [], elite: false, guardian: null, enraged: false,
    level: a.ai, gear: a.gear ? { ...Gear.emptyLoadout(), ...a.gear } : Gear.randomLoadout(Hero.budget(L), rand, t),   // 1.9.x: у тени живого игрока — его настоящие вещи
    shadowHero: { faction: a.faction, gender: a.gender, level: L },
  });
  // 1.7.4: условие дня (World.arenaRule) — приём, здоровье, сила удара или ум теней.
  const rule = a.rule && World.ARENA_RULES.find((r) => r.id === a.rule);
  if (rule) {
    if (rule.ability) f.ability = rule.ability;
    if (rule.hp) f.base = Math.round(f.base * rule.hp);
    if (rule.dmg) f.dmg *= rule.dmg;
    if (rule.ai) f.level = Math.min(100, f.level + rule.ai);
  }
  f.bag = enemyBag(f.level);
}
// Приём противника: у существ — по виду, у теней — тот, что дало условие дня.
const enemyAbility = (f) => (f.shadowHero || f.trait ? (f.ability ? Bestiary.ABILITIES[f.ability] : undefined) : Bestiary.ability(f.monsterId));

function refreshEnemyGear() {
  setupEnemy();
  recalcStats('right');
  fighters.right.hp = fighters.right.max;
  renderFighters();
  renderGear('right');
  renderAvatar('right');
  if (Inventory.isOpen) Inventory.refresh();
}

// 1.7.1: ночь и непогода этого боя — метка на панели противника; в густом тумане числа ХП и камней врага размыты.
function renderSkyFx() {
  const el = fEl('right'), sel = Profile.data.monster || {};     // и на поле питомца: туман и ночь общие для обоих полей
  if (!el) return;
  const tags = [sel.night ? _t("Ночь") : '', sel.wx ? Sky.NAMES[sel.wx] : ''].filter(Boolean);
  if (tags.length) el.dataset.sky = tags.join(' · '); else delete el.dataset.sky;
  el.classList.toggle('fog-enemy', Sky.hidesEnemy(sel));
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
  renderSkyFx();
  renderClonePanel();                                      // двойник Дикого гриба (скрыт, если его нет)
  renderElxBadges();
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
  miniCounters(side);
  renderMagic();
}
// 1.8.3: на коротких телефонах стоя счётчики камней уходят из карточек бойцов — дублируем их мелко по краям строки хода (видны только там, см. .mini-cnt в CSS)
function miniCounters(side) {
  if (!host.main) return;
  const center = document.querySelector('.arena .center'), src = fEl(side).querySelector('.counters');
  if (!center || !src) return;
  let box = center.querySelector('.mini-cnt');
  if (!box) { box = document.createElement('div'); box.className = 'mini-cnt'; box.setAttribute('aria-hidden', 'true'); box.innerHTML = '<span class="mc mc-left"></span><span class="mc mc-right"></span>'; center.appendChild(box); }
  box.querySelector(side === 'left' ? '.mc-left' : '.mc-right').innerHTML = [...src.querySelectorAll('.counter')].map((d) => `<i class="mc-i" data-type="${d.dataset.type}">${d.querySelector('svg') ? d.querySelector('svg').outerHTML : ''}<b>${d.querySelector('b').textContent}</b></i>`).join('');
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

const spellbarEl = $('spellbar');

function buildSpellbar() {
  spellbarEl.innerHTML = `<button type="button" class="magic fac" data-kind="faction"></button>` + Object.keys(MAGICS).map((k) =>
    `<button type="button" class="magic ${k}" data-kind="${k}" title="${MAGICS[k].tip}"></button>`).join('');
  [...spellbarEl.children].forEach((b, i) => { if (i < 10) b.dataset.key = String((i + 1) % 10); });   // 1.5.5: клавиши 1–9, 0 (на компьютере в углу кнопки)
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
const bagEl = $('bagbar');

function bagDisabled(kind) {
  const f = fighters.left, bag = Profile.data.backpack;
  if (busy || over || aiming || !(bag[kind] > 0) || isChallenge() || LIVE) return true;
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
  const nElx = Profile.elixirBag().reduce((a, e) => a + e.n, 0);
  const elxBtn = `<button type="button" class="bagitem elxmenu" data-elxmenu title="${_t("Эликсиры: пьются бесплатно, в любой свой ход")}" ${busy || over || isChallenge() || cardFight() || !!LIVE || PET || !host.main ? 'disabled' : ''}>${Elixirs.icon('power', 5).replace(/<text[^>]*>.*?<\/text>/, '')}<b>${nElx}</b></button>`;
  bagEl.innerHTML = ammoBtn + elxBtn + Object.entries(Gear.CONSUMABLES).map(([k, c]) =>
    `<button type="button" class="bagitem ${k}" data-item="${k}" data-state="${(bag[k] || 0) > 0 ? (bagDisabled(k) ? 'wait' : 'ready') : 'empty'}" title="${c.name}: ${c.desc}" aria-label="${c.name}: ${bag[k] || 0}" ${bagDisabled(k) ? 'disabled' : ''}>
       ${itemIcon(k)}<b>${bag[k] || 0}</b></button>`).join('');
  for (const bt of bagEl.querySelectorAll('button.bagitem.ammo, button.bagitem.elxmenu')) {      // 1.6.4: остальные два тоже получают состояние и подпись
    const n = (bt.querySelector('b') || {}).textContent || '0';
    bt.dataset.state = Number(n) > 0 ? (bt.disabled ? 'wait' : 'ready') : 'empty';
    bt.setAttribute('aria-label', (bt.title || '').split(':')[0] + ': ' + n);
  }
}
function ammoDisabled() {
  const ak = Profile.shotKind();
  if (aiming && aimKind === 'bomb') return false;            // повторное нажатие снимает прицел
  return busy || over || aiming || turnSide !== 'left' || fighters.left.ammoShot || !(Profile.ammo(ak) > 0) || isChallenge() || !!LIVE;
}
if (bagEl) bagEl.addEventListener('click', (e) => {
  if (e.target.closest('[data-elxmenu]')) { if (!e.target.closest('button').disabled) openElxMenu(); return; }
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
  const base = Math.round(Combat.strikeDamage(f) * Gear.shotMult(Profile.gear()) * (!isChallenge() && !cardFight() && Profile.perk('shot') ? 1.35 : 1));   // метательное оружие: сила по цвету
  const fam = (Bestiary.MONSTERS[e.monsterId] || {}).family, am = Ammo.mult(kind, fam);   // 1.5.1: слабости семейств
  if (am > 1) showFloat('right', _t("Слабое место!"), 'crit'); else if (am < 1) showFloat('right', _t("Не берёт!"), 'debuff');
  if (kind === 'bolt') {
    const dealt = dealDamage('right', Math.round(Ammo.boltDamage(base) * am), true);
    e.buffs = []; e.shield = 0; e.mirrorReady = false; e.tripleNext = false;
    SND.fire();
    showFloat('right', _t("Болт!"), 'buff');
    logEvent('left', _t("{0}: Освящённый болт — урон {1}, усиления и щит противника сняты", [f.name, dealt]));
  } else if (kind === 'moonarrow') {
    const dealt = dealDamage('right', Math.round(Ammo.arrowDamage(base) * am), true);
    const got = Ammo.steal(e.counts, MAGIC_TYPES);
    for (const [t, n] of Object.entries(got)) { e.counts[t] -= n; f.counts[t] += n; }
    renderCounters('left', Object.keys(got)); renderCounters('right');
    SND.lightning();
    logEvent('left', _t("{0}: Лунная стрела — урон {1}, украдено камней: {2}", [f.name, dealt, Object.values(got).reduce((a, b) => a + b, 0)]));
  } else if (kind === 'dart') {
    const dmg = Math.max(1, Math.round(Combat.venomTick(Combat.power(f), f.dmg) * am));
    e.poison = { turns: Math.max(Ammo.DART_TURNS, (e.poison && e.poison.turns) || 0), dmg: Math.max(dmg, (e.poison && e.poison.dmg) || 0) };
    showFloat('right', _t("Яд!"), 'venom');
    SND.transmute();
    logEvent('left', _t("{0}: Ядовитый дротик — {1} урона в начале каждого из {2} ходов противника", [f.name, dmg, Ammo.DART_TURNS]));
  } else if (kind === 'bomb') {
    stopTurnTimer();
    busy = true;
    renderMagic();
    castFire('left', cell, { shape: 'square', free: true, mult: am, name: _t("Пороховая шашка") }).then(() => {
      if (over) return;
      busy = false;
      renderMagic(); renderBag(); renderFighters();
      note(_t("Ваш ход"));
      startTurnTimer();
    }).catch(() => {                                  // 1.6.4: сбой анимации шашки не должен навсегда запирать ввод (busy)
      if (over) return;
      busy = false;
      renderMagic(); renderBag(); renderFighters();
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
    SND.heal();
    showCenterPop('+' + ef.heal, 'heal', _t("Зелье здоровья"));
    logEvent(side, _t("{0}: Зелье здоровья, +{1} ХП", [f.name, ef.heal]));
  } else if (kind === 'elixir') {
    SND.lightning();
    logEvent(side, _t("{0}: Боевой настой, +{1}% к урону до конца хода", [f.name, ef.power]));
    note(_t("{0}: Боевой настой", [f.name]));
  } else if (kind === 'dust') {
    renderCounters(side);
    SND.match(4, 1);
    logEvent(side, _t("{0}: Каменная пыль, +{1} каждого вида", [f.name, _nn(ef.stones, 'камень', 'камня', 'камней')]));
  } else if (kind === 'scroll') {
    SND.lightning();
    logEvent(side, _t("{0}: Свиток спешки", [f.name]));
    note(_t("{0}: следующий ход даст дополнительный ход", [f.name]));
  } else if (kind === 'storm') {
    SND.lightning();
    renderMagic();
    logEvent(side, _t("{0}: Зелье грозы — Шаровая молния на этот ход", [f.name]));
    note(_t("Зелье грозы: Шаровая молния включена!"));
  } else if (kind === 'stoneskin') {
    SND.heal();
    showFloat(side, _t("Каменная кожа"), 'buff');
    logEvent(side, _t("{0}: Каменная кожа — Броня +{1} до конца боя", [f.name, ef.armor]));
  } else if (kind === 'luck') {
    SND.lightning();
    logEvent(side, _t("{0}: Свиток удачи — +{1}% к монетам и ресурсам за победу в этом бою", [f.name, ef.pct]));
    note(_t("{0}: Свиток удачи применён", [f.name]));
  } else if (kind === 'honeyjar') {
    SND.heal();
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
const petEl = () => $('pet-panel');
const petName = () => (Profile.pet() ? Pets.petDisplayName(Profile.pet().speciesId) : '');
// Жив ли питомец и в строю ли он ПРЯМО СЕЙЧАС (участвует в раунде — см. Combat.turnOrder).
const petAlive = () => !!pet && pet.hp > 0 && !petFell;

// Готовит питомца к новому бою (вызывается из startGame, после того как панель игрока построена).
function setupPet() {
  pet = Profile.hasUsablePet() && !isArena() && !isChallenge() ? Pets.petFighter(Profile.pet()) : null;
  if (pet) {
    const tr = Pets.useTreats(Profile.pet());                        // 1.3.8: угощения Питомника
    const lk = Profile.slotStats('leash');                          // 1.3.9: поводок усиливает питомца
    if (Object.keys(lk).length) { pet.stats = Gear.combine(pet.stats, { ...lk, health: 0, magic: 0, cunning: 0, initiative: 0 }); const hm = 1 + 0.03 * (lk.health || 0); pet.max = Math.round(pet.max * hm); pet.hp = pet.max; logEvent('left', _t("{0}: поводок придаёт сил", [petName()])); }
    if (tr.hpMult > 1) { pet.max = Math.round(pet.max * tr.hpMult); pet.hp = pet.max; }
    if (tr.defense) pet.stats = Gear.combine(pet.stats, { defense: tr.defense });
    pet.fedBonus = Math.max(Pets.useFeed(Profile.pet()), tr.power);
    pet.intBonus = tr.int + (pet.fedBonus > 1 && tr.power < pet.fedBonus ? Pets.DOPE_BONE : 0);   // допинг: угощения повышают ум в этом бою
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
async function passToEnemy(noEnd = false) {
  if (over) return;
  if (LIVE && !noEnd) LIVE.net.act({ k: 'end', h: liveHash(), s: globalThis.__LIVE_DEBUG ? liveState() : undefined }, true);   // ход закончен: соперник узнаёт и сверяет состояние
  if (host.main) Profile.battleMoved();           // 1.6.6: ход сделан (камни, заклинание, пропуск по таймеру)
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
const cloneEl = () => $('clone-panel');

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
    SND.hit(r.amount);
    logEvent('right', _t("{0}: бьёт — урон {1}", [CLONE_NAME, r.amount]));
  }
  renderFighters();
  renderClonePanel();
  checkEnd();
}

// Открыто ли заклинание: по уровню героя; в обучении все нужные заклинания доступны.
const spellOpen = (kind) => (typeof TUT === 'function' && TUT()) || Hero.isSpellUnlocked(kind, liveLevel());

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

// 1.8.5: кнопка «Подсказка» нужна только на обучении; после него её убираем (прорицание остаётся заклинанием)
function syncHintBtn() {
  const t = Profile.data.tutorial;
  // 1.9.7: «Подсказка» остаётся, пока у героя меньше 10 побед (мягкий старт)
  document.body.classList.toggle('no-hint', !!(t && t.done) && !(typeof Tutorial !== 'undefined' && Tutorial.active) && (Profile.data.wins || 0) >= HINT_WINS);
}
function renderMagic() {
  syncHintBtn();
  const f = fighters.left;
  updatePetSkill();
  for (const kind of Object.keys(MAGICS)) {
    const btn = spellbarEl.querySelector(`button.${kind}`);
    if (!btn) continue;
    const ready = canAffordMagic('left', kind);
    if (ready && spellOpen(kind)) tipOnce('spell');
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
      : state ? `${MAGICS[kind].name} — ${state}` : _t("{0}: {1} (по {2} каждого вида)", [MAGICS[kind].name, MAGICS[kind].tip, _nn(cost, 'камень', 'камня', 'камней')]);
    if (kind === 'fury' && !locked && grid && grid[0]) {
      const fs = furyState();
      if (!fs.ok) btn.title += _t("\nНужно, чтобы камней вашего цвета ({0}) на поле было больше, чем любого другого, с учётом номиналов (сейчас: {1} против {2})", [GEM_NAMES[GEM_TYPES[fs.home]], fs.mine, fs.other]);
    }
    btn.innerHTML = spellIconHtml(kind, 'bar-' + kind);
    btn.classList.toggle('locked', !!locked);
    btn.classList.toggle('new-spell', !!(needLvl && !locked && Profile.data.spellSeen && !Profile.data.spellSeen[kind]));
    btn.disabled = spellDisabled(kind, on, ready);
    // 1.6.4 (WIP-10): явное состояние кнопки — «закрыто по уровню / не хватает камней / ждите / готово / выбрано» (CSS по data-state) и подпись для скринридера
    btn.dataset.state = locked ? 'locked' : on ? 'on' : (!btn.disabled && ready) ? 'ready' : !ready ? 'need' : 'wait';
    btn.setAttribute('aria-label', btn.title.split('\n')[0]); btn.setAttribute('aria-pressed', String(!!on));
  }
  renderFactionButton();
  const title = root.querySelector('.spell-title');
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
  if (f.ward > 0) parts.push(_t("Щит {0}", [f.ward]));
  if (f.haste) parts.push(_t("Спешка"));
  // Спороносец: счётчик спор до следующего двойника (пока лимит двойников за бой не исчерпан).
  if (side === 'right' && f.ability === 'clone' && (f.clonesMade || 0) < Balance.abilities.clone.max) parts.push(_t("Споры {0}/{1}", [f.spores || 0, Balance.abilities.clone.charge]));
  badge.textContent = parts.join(' · ');
  renderGear(side);
  if (side === 'right') { renderEnemyColumn(); renderAbilityLine(); }
}

// 1.7.3: подпись «что дальше» — рядом с названием приёма (во всех оформлениях, где строка приёма видна).
function nextMoveText(f) {
  const nm = Combat.nextMove(f);
  if (!nm) return '';
  if (nm.left !== undefined) return nm.left === 1 ? _t("в ближайший ход") : _t("через {0} {1}", [nm.left, turnsWord(nm.left)]);
  if (nm.once) return nm.spent ? _t("уже использован") : nm.kind === 'undying' ? _t("воскреснет один раз") : _t("первый удар двойной");
  if (nm.kind === 'rage') return nm.hot ? _t("в ярости!") : _t("при ХП ниже {0}%", [nm.below]);
  if (nm.kind === 'clone') return nm.spent ? _t("двойники кончились") : _t("споры {0}/{1}", [nm.spores, nm.need]);
  if (nm.kind === 'regen') return _t("лечит {0}% каждый ход", [nm.heal]);
  if (nm.chance) return _t("шанс {0}% каждый ход", [nm.chance]);
  return _t("действует постоянно");
}
function renderAbilityLine() {
  const root = fEl('right'), line = root && root.querySelector('.ability-line');
  if (!line) return;
  const ea = enemyAbility(fighters.right);           // у тени приём задаёт условие дня — обновляем подпись
  const bn = line.querySelector('b');
  if (bn) { bn.textContent = (ea && ea.name) || '—'; line.title = (ea && ea.desc) || ''; }
  let sp = line.querySelector('.next');
  if (!sp) { sp = document.createElement('span'); sp.className = 'next'; line.appendChild(sp); }
  const nm = fighters.right.hp > 0 ? Combat.nextMove(fighters.right) : null, t = nextMoveText(fighters.right);
  sp.textContent = t ? ' · ' + t : '';
  const soon = !!nm && (nm.left === 1 || (nm.kind === 'rage' && nm.hot));
  sp.classList.toggle('soon', soon);
  // Узкий экран: строка приёма и значки скрыты, поэтому та же подпись — в хвосте строки хода (#status::after, см. CSS).
  const ab = enemyAbility(fighters.right);
  const show = turnSide === 'left' && !over && !!t && !!ab;
  statusEl.dataset.next = show ? ` · ${ab.name}: ${t}` : '';
  statusEl.toggleAttribute('data-soon', show && soon);
}

/* ---------- столбец противника (только оформление «3», body.ui-columns) ----------
   Зеркало столбца заклинаний героя по другую сторону поля. У существ заклинаний нет, поэтому здесь его
   собственное: приём (с отсчётом до срабатывания, если он «каждый N-й ход»), действующие на него эффекты
   (f.buffs, яд, молния, спешка), споры Спороносца и расходники противника (f.bag). Подробности — в title.
   В оформлениях «1» и «2» столбец скрыт CSS-ом и не рисуется вовсе. */
const enemyColEl = $('enemy-col');
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
  const ab = f.ability && enemyAbility(f);
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
    if (!A.every && nextMoveText(f)) state += '\n' + nextMoveText(f);
    top.push(tile(cls, `<i class="ec-letter">${ab.name[0]}</i>`, _t("Приём: {0}\n{1}{2}", [ab.name, ab.desc, state]), num));
  }
  if (f.ward > 0) top.push(tile('buff', ecSvg('shield'), _t("Щит: примет ещё {0} урона, прежде чем существо начнёт терять ХП", [f.ward]), f.ward));
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
// Народ стороны: у героя — выбранный, у тени живого игрока — народ соперника; у существ народа нет.
const factionOf = (side) => (side === 'left' ? playerFaction() : (fighters.right.shadowHero ? Factions.get(fighters.right.shadowHero.faction) : null));
const heroLevelOf = (side) => (side === 'left' ? liveLevel() : ((fighters.right.shadowHero && fighters.right.shadowHero.level) || fighters.right.level));
// Приёмы народов в живом бою у обоих игроков (в турнире — нет, там у всех всё одинаковое)
const facOn = (side) => side === 'left' || (!!LIVE && !tourneyFight());
function addCharge(n, side = 'left') {
  if (tourneyFight()) return;       // в турнире приёмов народов нет: заряд не копится ни у кого (иначе у зеркальных сторон он разойдётся)
  const f = fighters[side], was = f.charge || 0, fac = factionOf(side);
  f.charge = Math.min(CHARGE, was + n);
  if (side === 'left' && fac && was < CHARGE && f.charge >= CHARGE) note(_t("{0} готов!", [fac.ability.name]));
  if (side === 'left') renderFactionButton();
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
  btn.dataset.state = on ? 'on' : !full ? 'need' : btn.disabled ? 'wait' : 'ready';        // 1.6.4 (WIP-10)
  btn.setAttribute('aria-label', btn.title.split('\n')[0]); btn.setAttribute('aria-pressed', String(!!on));
}

// Приёмы фракций ход не тратят: их цена — заряд из родных камней.
async function useFactionAbility(side = 'left') {
  const fac = factionOf(side), f = fighters[side], foe = fighters[other(side)];
  if (!fac) return;
  if (side === 'left') {
    if (aiming && aimKind === 'growth') { stopAim(); note(_t("Ваш ход")); return; }
    if (busy || over || (f.charge || 0) < CHARGE || tourneyFight()) return;     // в турнире приёмов народов нет (равные условия)
  }
  const id = fac.ability.id;
  if (id === 'growth' && side === 'left') { toggleAim('growth'); renderFactionButton(); return; }
  if (side === 'left' && LIVE && id !== 'growth') LIVE.net.act({ k: 'fac' });
  f.charge = 0;
  const F = Balance.faction;
  if (id === 'banner') {
    f.buffs.push({ kind: 'banner', amount: F.banner.power, turns: F.banner.turns });
    showFloat(side, _t("Знамя!"), 'buff');
    SND.lightning();
    logEvent(side, _t("{0}: Знамя — +{1}% к урону на {2}", [f.name, F.banner.power, `${F.banner.turns} ${turnsWord(F.banner.turns)}`]));
    if (side === 'left') note(_t("Знамя поднято: +{0}% к урону на {1} хода", [F.banner.power, F.banner.turns]));
  } else if (id === 'venom') {
    const dmg = Combat.venomTick(Combat.power(f), f.dmg);
    foe.poison = { turns: F.venom.turns, dmg };
    showFloat(other(side), _t("Яд!"), 'venom');
    SND.transmute();
    logEvent(side, _t("{0}: Ядовитый укус — {1} урона в начале каждого из {2} ходов противника", [f.name, dmg, F.venom.turns]));
    if (side === 'left') note(_t("Яд: {0} будет терять по {1} ХП {2}", [foe.name, dmg, `${F.venom.turns} ${turnsWord(F.venom.turns)}`]));
  } else if (id === 'hammer') {
    const keep = busy;
    busy = true;
    renderMagic();
    await runeHammer(side);
    if (side === 'left') busy = false; else busy = keep;
  }
  renderMagic();
  renderFighters();
  if (TUT() && side === 'left') Tutorial.event('ability');
}

// Рунный молот: три камня (не обсидиан) становятся обсидианом x3 так, чтобы не собралась готовая линия.
async function runeHammer(side = 'left') {
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
  SND.transmute();
  logEvent(side, _t("{0}: Рунный молот — {1} стали обсидианом x{2}", [fighters[side].name, _nn(picked.length, 'камень', 'камня', 'камней'), H.value]));
  if (side === 'left') note(_t("Рунный молот!"));
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
  if (LIVE) LIVE.net.act({ k: 'fac', i: cell.r * N + cell.c });
  try { await growthBody(cell); } finally {
    busy = false;
    renderMagic();
    renderFighters();
    if (!over) { note(_t("Ваш ход")); startTurnTimer(); }
    if (TUT()) Tutorial.event('ability');
  }
}
async function growthBody(cell, side = 'left') {
  const f = fighters[side], G = Balance.faction.growth;
  const gem = factionOf(side).gem, ti = GEM_TYPES.indexOf(gem);
  let value = G.value;
  for (const [lvl, v] of Object.entries(G.valueFrom)) if (heroLevelOf(side) >= Number(lvl)) value = v;
  f.charge = 0;
  const keepBusy = busy;
  busy = true;
  renderMagic();
  const near = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => ({ r: cell.r + dr, c: cell.c + dc }))
    .filter((p) => p.r >= 0 && p.c >= 0 && p.r < N && p.c < N && grid[p.r][p.c]);
  const picks = [cell];
  while (picks.length < G.stones && near.length) picks.push(near.splice(rnd(near.length), 1)[0]);
  if (side === 'left') note(_t("Дикий рост!"));
  SND.heal();
  logEvent(side, _t("{0}: Дикий рост — {1} стали изумрудами x{2}", [f.name, _nn(picks.length, 'камень', 'камня', 'камней'), value]));
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
    await resolveBoard(side);
    logTurn(side);
    if (flushTurnDamage()) await sleep(500);
    if (checkEnd()) return;
  }
  if (isEmptyBoard() || !Engine.hasMoves(typOf())) await refillBoard();
  if (side !== 'left') busy = keepBusy;
}

function spendMagic(side, sign, kind = 'lightning') {   // sign: -1 списать, +1 вернуть
  if (side === 'left') battleStyle.spells = Math.max(0, battleStyle.spells - sign);
  for (const t of MAGIC_TYPES) fighters[side].counts[t] += sign * magicCostOf(side, kind);
  renderCounters(side);
}

// Игрок включает/выключает Магию перед своим ходом.
function toggleMagic(side = 'left') {
  if (over || (side === 'left' && (busy || aiming))) return;   // у соперника (right) busy стоит на время его хода — это нормально
  if (side === 'left' && LIVE) LIVE.net.act({ k: 'lm' });
  const f = fighters[side];
  if (f.magic) {                                   // отмена: возвращаем ровно уплаченное (цена могла измениться от снаряжения)
    const paid = f.magicFree ? 0 : (f.magicPaid || magicCostOf(side, 'lightning'));   // Зелье грозы — бесплатно, и возврата нет
    for (const t of MAGIC_TYPES) f.counts[t] += paid;
    f.magic = false; f.magicPaid = 0; f.magicFree = false;
    renderCounters(side);
  } else if (canAffordMagic(side, 'lightning')) { f.magicPaid = magicCostOf(side, 'lightning'); f.magic = true; spendMagic(side, -1, 'lightning'); }
  renderMagic();
  if (f.magic) { SND.lightning(); logEvent(side, side === 'left' ? _t("Игрок включил Шаровую молнию") : _t("Противник использует Шаровую молнию")); if (TUT()) Tutorial.event('lightning'); }
  if (side === 'left') note(f.magic ? _t("Шаровая молния: каждый собранный камень наносит урон") : _t("Ваш ход"));
}

/* ---------- урон, ход, сообщения ---------- */

function showDamage(side, amount) {
  const s = document.createElement('div');
  s.className = 'dmg';
  s.textContent = '-' + amount;
  fEl(side).appendChild(s);
  setTimeout(() => s.remove(), 900);
  const av = fEl(side).querySelector('.avatar');           // 1.8.3: «живой» моб — при ударе портрет вздрагивает и наклоняется (CSS .hurt)
  if (av) { av.classList.remove('hurt'); void av.offsetWidth; av.classList.add('hurt'); }
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
// 1.5.1: эликсиры с 5-го цвета дают один заметный эффект за бой (Elixirs.effect), он срабатывает сам.
// Только для героя (поле питомца эликсиры не пьёт). Значки действующих эликсиров — над портретом героя.
function elxTier(kind) {
  if (!host.main || isChallenge()) return 0;
  const a = fighters.left.elx && fighters.left.elx[kind];
  return a && a.left > 0 && a.tier >= Elixirs.FX_MIN ? a.tier : 0;
}
const elxSide = (kind) => elxTier(kind) > 0;
function elxMark(kind) {                                   // эффект сработал: значок гаснет, строка в журнале
  const f = fighters.left; f.elxUsed = f.elxUsed || {};
  f.elxUsed[kind] = true;
  showFloat('left', Elixirs.KINDS[kind].name, 'buff');
  logEvent('left', _t("Эликсир сработал: {0} — {1}", [Elixirs.KINDS[kind].name, Elixirs.sideText(kind, elxTier(kind))]));
  renderElxBadges();
}
function elxFire(kind) {                                   // один раз с каждого выпитого эликсира; вернёт эффект или null
  const f = fighters.left, t = elxTier(kind);
  if (!t || (f.elxUsed && f.elxUsed[kind])) return null;
  elxMark(kind);
  return Elixirs.effect(kind, t);
}
function elxArm() {                                        // начало боя: эликсиры не действуют, пока их не выпьют
  const f = fighters.left;
  f.elx = {}; f.elxUsed = {}; f.elxCd = 0; f.critExtra = 0;
  renderElxBadges();
}
// 1.6.0: эликсиры пьются в бою в любой момент своего хода, ход не тратят; расходуются из сумки.
const elxExtra = () => Village.elixirExtra(Profile.data.village) + (Profile.perk('elixir') ? 4 : 0);   // 1.7.5: умение «Мастер зелий» — +20% (4 шага по 5%)
// «Превращение»: вид магических камней, которого у героя больше всего → вид, которого меньше всего (null — поровну)
function elxSwapPlan(f) {
  let hi = null, lo = null;
  for (const t of MAGIC_TYPES) { const n = f.counts[t] || 0; if (!hi || n > hi.n) hi = { t, n }; if (!lo || n < lo.n) lo = { t, n }; }
  return hi && lo && hi.n - lo.n >= 2 ? { from: hi.t, to: lo.t, have: hi.n, low: lo.n } : null;     // 1.8.0: разница меньше 2 — переносить нечего
}
function elxWhy(kind, tier) {                              // причина, по которой выпить нельзя ('' — можно)
  const f = fighters.left, K = Elixirs.KINDS[kind];
  if (!host.main || PET || isChallenge()) return _t("Здесь эликсиры не пьют");
  if (over || busy || aiming || turnSide !== 'left') return _t("Эликсир пьётся в свой ход");
  if (K.mode === 'instant') {
    if (f.elxCd > 0) return _t("Мгновенные эликсиры — раз в {0}: ещё {1}", [_nn(Elixirs.INSTANT_CD, 'ход', 'хода', 'ходов'), _nn(f.elxCd, 'ход', 'хода', 'ходов')]);
    if (kind === 'health' && f.hp >= f.max) return _t("Здоровье и так полное");
    if (kind === 'swap' && !elxSwapPlan(f)) return _t("Камней поровну — менять нечего");
    return '';
  }
  const cur = f.elx && f.elx[kind];
  if (cur && cur.left > 0 && (cur.tier > tier || (K.mode === 'turn' && cur.tier >= tier))) return _t("Этот вид уже действует");
  return '';
}
function useElixir(kind, tier) {
  const why = elxWhy(kind, tier);
  if (why) { note(why); return false; }
  const f = fighters.left, K = Elixirs.KINDS[kind], mult = 1 + 0.05 * elxExtra();
  if (!Profile.takeElixir(kind, tier)) return false;
  battleStyle.elixirs++;
  const elxMedals = Profile.noteElixir(kind, tier);                      // 1.7.5: медали: за каждый вид эликсира и за число выпитых
  elxMedals.forEach((m, i) => {
    const rl = m.relic ? _t(" Комплект собран: умение «{0}», реликвия «{1}»!", [Medals.PERKS.elixir.name, Gear.item({ id: m.relic, tier: 1 }).name]) : '';
    setTimeout(() => { note(_t("Медаль! {0}", [Medals.nameFor(m.id)]) + rl); logEvent('left', _t("Медаль! {0}", [Medals.nameFor(m.id)]) + rl); }, 600 + i * 1400);
  });
  if (K.mode === 'instant') {
    f.elxCd = Elixirs.INSTANT_CD;                          // уменьшается в начале каждого хода героя: снова можно через 3 хода
    if (kind === 'health') {
      const h = Math.min(f.max - f.hp, Math.round(Elixirs.heal(tier) * mult));
      f.hp += h; SND.heal();
      showCenterPop('+' + h, 'heal', K.name);
      logEvent('left', _t("{0}: {1}, +{2} ХП", [f.name, K.name, h]));
    } else if (kind === 'swap') {
      const pl = elxSwapPlan(f), n = Elixirs.swapMove(tier, pl.have, pl.low, mult);
      f.counts[pl.from] -= n; f.counts[pl.to] += n;
      renderCounters('left', [pl.from, pl.to]); SND.transmute();
      logEvent('left', _t("{0}: {1} — {2} из одного вида в другой", [f.name, K.name, _nn(n, 'камень', 'камня', 'камней')]));
    } else {
      const n = Math.round(Elixirs.stonesGain(tier) * mult);
      for (const t of MAGIC_TYPES) f.counts[t] += n;
      renderCounters('left'); SND.match(4, 1);
      logEvent('left', _t("{0}: {1}, +{2} каждого вида", [f.name, K.name, _nn(n, 'камень', 'камня', 'камней')]));
    }
  } else {
    Elixirs.drink(f.elx, kind, tier, elxExtra());
    f.elxUsed[kind] = false;
    if (kind === 'fury' && tier >= Elixirs.FX_MIN) f.critExtra = Elixirs.effect('fury', tier).v - 2;
    elxRecalc();
    SND.lightning();
    showFloat('left', K.name, 'buff');
    logEvent('left', _t("{0}: {1} — {2}", [f.name, K.name, Elixirs.describe(kind, tier)]));
    note(_t("{0}: {1}", [f.name, K.name]));
  }
  Profile.save();
  renderFighters(); renderBag(); renderElxMenu();
  return true;
}
function elxRecalc() {                                     // характеристики с учётом действующих эликсиров (ХП не трогаем)
  const f = fighters.left, hp = f.hp;
  recalcStats('left');
  f.hp = Math.min(hp, f.max);
}
function elxTurnEnd() {                                    // конец хода героя: сроки эликсиров уменьшаются
  const f = fighters.left;
  if (!f.elx || !Object.keys(f.elx).length) return;
  Elixirs.tick(f.elx);
  if (!f.elx.fury) f.critExtra = 0;
  elxRecalc();
}
let elxBadgeKey = '';
function renderElxBadges() {
  if (!host.main) return;
  const box = fEl('left'); if (!box) return;
  const used = fighters.left.elxUsed || {}, el = fighters.left.elx || {};
  const act = Elixirs.ORDER.filter((k) => el[k] && el[k].left > 0);
  const key = act.map((k) => k + el[k].tier + ':' + el[k].left + (used[k] ? 'u' : '')).join('|');
  if (key === elxBadgeKey && box.querySelector('.elx-badges')) return;
  elxBadgeKey = key;
  let row = box.querySelector('.elx-badges');
  if (!act.length) { if (row) row.remove(); return; }
  if (!row) { row = document.createElement('div'); row.className = 'elx-badges'; box.appendChild(row); }
  row.innerHTML = act.map((k) => `<span class="elx-badge${used[k] ? ' used' : ''}" title="${Elixirs.KINDS[k].name}: ${Elixirs.describe(k, el[k].tier)} · ${_t("осталось: {0}", [_nn(el[k].left, 'ход', 'хода', 'ходов')])}${used[k] ? ' — ' + _t("уже сработал") : ''}">${Elixirs.icon(k, el[k].tier)}<i>${el[k].left}</i></span>`).join('');
}
// Меню эликсиров в бою: кнопка-флакон в панели сумки открывает список всех эликсиров из сумки.
let elxMenuEl = null;
function renderElxMenu() {
  if (!elxMenuEl || elxMenuEl.hidden) return;
  const list = Profile.elixirBag();
  elxMenuEl.querySelector('.elx-menu-list').innerHTML = list.length ? list.map((e) => {
    const why = elxWhy(e.kind, e.tier);
    return `<div class="bag-row">${Elixirs.icon(e.kind, e.tier)}<span><b>${Elixirs.KINDS[e.kind].name}</b> · ${_t("цвет «{0}» × {1}", [Tiers.get(e.tier).name, e.n])}<br><small>${Elixirs.describe(e.kind, e.tier)}</small>${why ? `<br><small class="elx-why">${why}</small>` : ''}</span><button type="button" data-elx="${e.kind}:${e.tier}" ${why ? 'disabled' : ''}>${_t("Выпить")}</button></div>`;
  }).join('') : `<p class="hint">${_t("Эликсиров в сумке нет. Их варит Тётушка Жабка у Алхимика.")}</p>`;
}
function openElxMenu() {
  if (!elxMenuEl) {
    elxMenuEl = document.createElement('div');
    elxMenuEl.className = 'elx-menu'; elxMenuEl.hidden = true;
    elxMenuEl.innerHTML = `<div class="elx-menu-box" role="dialog" aria-label="${_t("Эликсиры")}"><div class="elx-menu-head"><b>${_t("Эликсиры")}</b><button type="button" data-elx-close aria-label="${_t("Закрыть")}">✕</button></div><p class="hint">${_t("Пьются в свой ход бесплатно: ход не тратится. Сила — перед ударом, на этот ход; остальные — на 10 ходов; Жизнь, Камни и Превращение — раз в 3 хода.")}</p><div class="elx-menu-list"></div></div>`;
    elxMenuEl.addEventListener('click', (e) => {
      if (e.target === elxMenuEl || e.target.closest('[data-elx-close]')) { elxMenuEl.hidden = true; return; }
      const b = e.target.closest('[data-elx]');
      if (b && !b.disabled) { const { kind, tier } = Elixirs.split(b.dataset.elx); useElixir(kind, tier); }
    });
    document.body.appendChild(elxMenuEl);
  }
  elxMenuEl.hidden = false;
  renderElxMenu();
}
function elxImmune() { return false; }                      // 1.5.1: невосприимчивость заменена «первым ударом слабее»

function dealDamage(target, amount, raw = false, cover = true) {
  const tag = dmgTag; dmgTag = '';
  if (amount <= 0) return 0;
  const attackerSide = other(target), attacker = fighters[attackerSide];
  const victim = target === 'right' && cover ? Combat.enemyTarget(fighters.right) : fighters[target];
  if (!raw && attackerSide === 'left') {                       // эликсир силы: первый ваш удар в бою сильнее
    const fx = elxFire('power'); if (fx) amount = Math.round(amount * fx.v);
  }
  if (!raw && attackerSide === 'left' && target === 'right') {   // 1.6.2: коллекция медалей — урон по семейству
    const pct = Medals.familyBonus(Profile.medals(), (Bestiary.MONSTERS[fighters.right.monsterId] || {}).family);
    if (pct) amount = Math.max(1, Math.round(amount * (1 + pct / 100)));
  }
  if (!raw && attackerSide === 'left' && target === 'right' && !isChallenge() && !cardFight() && !PET && Profile.perk('strike') && victim.hp < victim.max * 0.3) {
    amount = Math.max(1, Math.round(amount * 1.25));            // 1.6.3: умение «Добивание»
  }
  if (!raw && target === 'left') {                             // эликсир брони: первый удар по вам слабее
    const fx = elxFire('defense'); if (fx) amount = Math.max(1, Math.round(amount * (1 - fx.v / 100)));
  }
  const r = Combat.hit(attacker, victim, amount, raw);
  if (r.charged) showFloat(attackerSide, _t("Натиск!"), 'buff');
  if (r.pierceBlock) showFloat(attackerSide, _t("Пробивной болт!"), 'buff');
  if (target === 'left' && (r.kind === 'block' || r.kind === 'blockreflect')) {     // эликсир блока: контрудар
    const fx = elxFire('block');
    if (fx) {
      const d = Math.max(1, Math.round(amount * fx.v / 100)), rev = Combat.loseHp(attacker, d);
      showFloat(attackerSide, _t("Контрудар!"), 'ricochet'); showDamage(attackerSide, d); if (rev) onRevived(attackerSide);
    }
  }
  if (target === 'left' && (r.kind === 'reflect' || r.kind === 'blockreflect')) {   // эликсир рикошета: первый рикошет лечит
    const fx = elxFire('ricochet');
    if (fx) { const h = Math.max(1, Math.round((victim.dmg || 1) * Balance.damage.stone * fx.v)); victim.hp = Math.min(victim.max, victim.hp + h); showFloat('left', '+' + h, 'heal'); }
  }
  if (r.kind === 'blockreflect') {              // 1.3.8: удар заблокирован и ещё отражён атакующему
    if (target === 'left') rec.blocks++;
    showFloat(target, _t("Блок + Рикошет!"), 'ricochet');
    showDamage(attackerSide, r.amount);
    if (r.attackerRevived) onRevived(attackerSide);
    turnEvents.block++;
    turnEvents.blockTarget = target;
    turnEvents.reflected += r.amount;
    turnEvents.attacker = attackerSide;
    renderFighters();
    SND.hit(r.amount);
    shake();
    return 0;
  }
  if (r.kind === 'block') {
    if (target === 'left') rec.blocks++;
    showFloat(target, _t("Блок!"), 'block');
    turnEvents.block++;
    turnEvents.blockTarget = target;
    SND.swap();
    return 0;
  }
  if (r.absorbed > 0) {                          // 1.7.3: Щит существа принял удар на себя
    if (target === 'right') rec.absorbed += r.absorbed;
    showFloat(target, _t("Щит −{0}", [r.absorbed]), 'block');
    if (r.amount <= 0) { renderFighters(); SND.swap(); return 0; }
  }
  if (r.pierce) showFloat(attackerSide, _t("Подлый удар!"), 'buff');
  if (r.shred > 0) showFloat(target, _t("Броня трещит!"), 'debuff');
  if (r.critExtra) elxMark('fury');                        // эликсир ярости: первый крит бил сильнее
  if (r.crit) { showFloat(attackerSide, _t("Ярость! ×2"), 'crit'); logEvent(attackerSide, _t("{0}: Ярость — двойной урон!", [attacker.name])); }
  if (r.kind === 'reflect') {
    showFloat(target, _t("Рикошет!"), 'ricochet');
    showDamage(attackerSide, r.amount);
    if (r.attackerRevived) onRevived(attackerSide);
    turnEvents.reflected += r.amount;
    turnEvents.attacker = attackerSide;
    renderFighters();
    SND.hit(r.amount);
    shake();
    return 0;
  }
  showDamage(target, r.amount);
  if (target === 'right') rec.dealt += r.amount;
  else if (tag === 'pen') rec.pen += r.amount;
  else if (tag === 'poison') rec.poison += r.amount;
  else if (tag === 'pack') rec.pack += r.amount;
  else rec.taken += r.amount;
  if (r.revived) onRevived(target);
  turnDamage.target = target;
  turnDamage.amount += r.amount;
  if (r.heal > 0) showFloat(attackerSide, '+' + r.heal, 'heal');
  renderFighters();
  SND.hit(r.amount);
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
  const g = root.querySelector('.game') || root;
  g.classList.remove('shake');
  void g.offsetWidth;
  g.classList.add('shake');
}

/* ---------- журнал ходов ---------- */

function logEvent(side, text) {
  const list = $('log');
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
  const prevTurn = turnSide;
  if (side !== turnSide) {
    if (turnSide === 'left') elxTurnEnd();           // 1.6.0: сроки эликсиров героя
    Combat.clearTurnEndBuffs(fighters[turnSide]);   // эликсир силы и т.п. — до конца хода
    fighters[turnSide].magic = false;               // Шаровая молния тоже гаснет, когда ход переходит
    fighters[turnSide].magicPaid = 0;
    fighters[turnSide].magicFree = false;
  }
  turnSide = side;
  if (side === 'left' && side !== prevTurn) rec.turns++;
  if (side === 'left' && fighters.left.skillCd > 0 && side !== prevTurn) fighters.left.skillCd--;
  if (side === 'left' && fighters.left.elxCd > 0 && side !== prevTurn) fighters.left.elxCd--;
  if (side === 'left') fighters.left.ammoShot = false;     // боеприпас: один выстрел за свой ход
  fEl('left').classList.toggle('active', side === 'left');
  fEl('right').classList.toggle('active', side === 'right');
  statusEl.textContent = side === 'left' ? (PET && !autopilot ? _t("Ход питомца — ваш") : PET ? _t("Ход питомца") : _t("Ваш ход")) : _t("Противник думает…");
  boardEl.classList.toggle('enemy-turn', side === 'right');   // поле темнее, пока ходит противник
  renderMagic();
  renderAbilityLine();
  if (side === 'left' && !over) startTurnTimer(); else stopTurnTimer();
}

/* ---------- таймер хода ---------- */

function renderTurnTimer() {
  if (!timerEl) return;
  timerEl.hidden = false;
  // 1.6.4 (WIP-03): на узком экране видно только «28 с», полная фраза — в aria-label и на широком экране
  const full = _t("Ход истекает через {0} с", [turnTimerLeft]);
  timerEl.setAttribute('role', 'timer'); timerEl.setAttribute('aria-label', full);
  timerEl.innerHTML = '<span class="tt-lead" aria-hidden="true">' + _t("Ход истекает через") + ' </span><b class="tt-n" aria-hidden="true">' + _t("{0} с", [turnTimerLeft]) + '</b>';
  timerEl.classList.toggle('low', turnTimerLeft <= 10);
}

function stopTurnTimer() {
  stopIdleHint();
  if (turnTimerHandle) clearInterval(turnTimerHandle);
  turnTimerHandle = null;
  if (timerEl) timerEl.hidden = true;
  if (host.main) AdPause.disarm();
}

// 1.6.5: таймер хода включается настройкой (в PvP — всегда); пока открыто окно, время стоит (в PvP — не стоит).
const timerActive = () => TurnTimerSetting.on || host.pvp === true;
const windowOpen = () => !!document.querySelector('.modal-back, .medal-pop-back, .tryon-back');
// Настройку переключили посреди боя: выключили — убрать таймер, включили — запустить на текущем ходу игрока
function retimer() {
  if (over) return;
  if (!timerActive()) { if (turnTimerHandle) stopTurnTimer(); return; }
  if (turnSide === 'left' && !busy && !autopilot && !turnTimerHandle) startTurnTimer();
}
if (host.main) window.addEventListener('turn-timer-changed', retimer);

function startTurnTimer() {
  stopTurnTimer();
  if (autopilot) { kickAuto(); return; }            // нашу сторону ведёт ИИ — таймера нет
  if (TUT()) return;                               // в обучении таймера нет — учимся без спешки
  if (host.main && !PET) AdPause.arm();             // заготовка рекламной паузы (выключена)
  startIdleHint();
  if (!timerActive()) return;                      // 1.6.5: таймер хода выключен настройкой — думайте сколько нужно
  turnTimerLeft = Combat.TURN_TIMER.seconds;
  renderTurnTimer();
  turnTimerHandle = setInterval(() => {
    if (host.pvp !== true && windowOpen()) return;  // окно открыто — время стоит
    turnTimerLeft--;
    if (turnTimerLeft <= 0) { onTurnTimeout(); return; }
    renderTurnTimer();
  }, 1000);
}


/* ---------- бой в реальном времени (1.9.x): помощники ----------
   Схема «зеркала»: у каждого игрока он слева, соперник справа; оба клиента считают бой по одному зерну
   (BattleRand) и ходы друг друга. Свои действия уходят на сервер (LIVE.net.act), ходы соперника приходят
   через LIVE.net.next() и выполняются той же дорогой, что и ходы ИИ за правую сторону. */
const liveCell = (i) => ({ r: Math.floor(i / N), c: i % N });
// Отпечаток состояния боя, одинаковый для обоих клиентов: порядок бойцов — по ролям (A, B), а не «слева/справа».
function liveState() {
  if (!LIVE) return '';
  const st = (f) => [f.hp, f.max, f.shield || 0, f.magic ? 1 : 0, f.charge || 0, (f.buffs || []).map((b) => b.kind + b.turns).join('.'), f.poison ? f.poison.turns + 'p' + f.poison.dmg : 0, ...GEM_TYPES.map((t) => f.counts[t] || 0)].join(',');
  const A = LIVE.role === 'A' ? fighters.left : fighters.right, B = LIVE.role === 'A' ? fighters.right : fighters.left;
  const g = grid.map((row) => row.map((t) => (t ? t.ti + ':' + t.value : '-')).join(' ')).join('/');
  return st(A) + '|' + st(B) + '|' + g;
}
function liveHash() {
  const str = liveState(); let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function liveLeave() {
  if (!LIVE) return;
  try { LIVE.net.close(); } catch (e) { /* уже закрыт */ }
  const wasTourney = !!LIVE.fixed;
  LIVE = null; livePending = null; host.pvp = false; BattleRand.unseed();
  if (wasTourney && globalThis.TourneyClient) globalThis.TourneyClient.resume();   // турнир: связь нужна снова — ждём следующий раунд
}
// Конец боя по слову сервера (сдача, пропуски хода, итог): если наш клиент ещё не закончил — заканчиваем.
function liveFinish(m) {
  if (over) return;
  LIVE.reported = true;
  const iWin = m.winner === LIVE.role;
  if (m.winner === 'draw') { over = true; showOverlay(_t("Бой прерван"), _t("Связь с соперником потеряна или бой разошёлся. Результат не засчитан.")); return; }
  if (iWin) { fighters.right.hp = 0; renderFighters(); checkEnd(); } else { fighters.left.hp = 0; renderFighters(); checkEnd(); }
}
// Применяет действие соперника к правой стороне. true — бой окончен.
async function liveApply(a) {
  const f = fighters.right;
  if (a.k === 'lm') { toggleMagic('right'); return over; }
  if (a.k === 'mv') {
    const ok = await takeTurn('right', liveCell(a.a), liveCell(a.b));
    if (over) return true;
    if (!ok) {                                          // неверный ход соперника: тот же штраф, что и у нас (playerMove)
      invalidStreakR++;
      const pen = Combat.invalidPenalty(f), lim = Balance.invalid.limit;
      dmgTag = 'pen'; dealDamage('right', pen, true);
      logEvent('right', _t("{0}: неверный ход, -{1} ХП ({2}/{3})", [f.name, pen, invalidStreakR, lim]));
      flushTurnDamage();
      if (invalidStreakR >= lim || f.hp <= 0) { checkEnd(); if (!over) { f.hp = 0; renderFighters(); checkEnd(); } return true; }
      await sleep(900);
    } else invalidStreakR = 0;
    return over;
  }
  if (a.k === 'cast') {
    const cell = liveCell(a.i), kind = a.kind;
    invalidStreakR = 0;
    if (kind === 'chaos') await castChaosArea('right', cell); else if (kind === 'transmute') await castTransmute('right', cell);
    else if (kind === 'square') await castFire('right', cell, { shape: 'square' }); else if (kind === 'pierce') await castFire('right', cell, { shape: 'point' });
    else await castFire('right', cell);
    return over;
  }
  if (a.k === 'fac') { if (factionOf('right') && factionOf('right').ability.id === 'growth') await growthBody(liveCell(a.i), 'right'); else await useFactionAbility('right'); return over; }
  if (a.k === 'inst' && INSTANT_CASTERS[a.kind]) { invalidStreakR = 0; await INSTANT_CASTERS[a.kind]('right'); return over; }
  return over;
}
// Ход соперника: ждём его действия из сети, пока не придёт «конец хода» (или пропуск, или конец боя). true — бой окончен.
async function liveRemoteTurn() {
  note(_t("Ход соперника"));
  for (;;) {
    const m = await LIVE.net.next();
    if (over) return true;
    if (m.end) { liveFinish(m); return true; }
    if (m.timeout) {
      if (m.side === LIVE.role) continue;               // это про нас: обработает liveSkipMine
      logEvent('right', _t("{0}: ход пропущен по таймеру ({1}/{2} подряд)", [fighters.right.name, m.strikes || 1, Combat.TURN_TIMER.skipLimit]));
      note(_t("Соперник не успел: ход переходит к вам"));
      return false;
    }
    const a = m.act; if (!a) continue;
    if (a.k === 'end') {
      if (a.h && a.h !== liveHash()) {
        if (globalThis.__LIVE_DEBUG) globalThis.__desync = { theirs: a.s, mine: liveState() }; LIVE.net.forfeit(); LIVE.reported = true; over = true; showOverlay(_t("Бой прерван"), _t("Бой у вас и у соперника разошёлся. Результат не засчитан.")); return true; }
      return false;
    }
    if (await liveApply(a)) return true;
  }
}
// Наше время вышло (так решил сервер): ход уходит сопернику.
async function liveSkipMine(m) {
  if (!LIVE || over || busy || turnSide !== 'left') return;
  stopTurnTimer();
  if (aiming) stopAim();
  endPlayerAction();
  logEvent('left', _t("Игрок: ход пропущен по таймеру ({0}/{1} подряд)", [m.strikes || 1, Combat.TURN_TIMER.skipLimit]));
  note(_t("Ход пропущен по таймеру ({0}/{1} подряд)", [m.strikes || 1, Combat.TURN_TIMER.skipLimit]));
  busy = true;
  await passToEnemy(true);
}
// Запуск боя с живым соперником: cfg { net, role, first, seed, opp (карточка), myCard }. Вызывает карта (MapView.startSpecial).
function liveBegin(cfg) {
  const slots = Gear.SLOTS, known = (id) => !!Gear.item(id);
  let myCard = cfg.myCard, oppCard = cfg.opp;
  if (cfg.fixed) {                                               // турнир: общий уровень и общие вещи, свои — только ник, народ и пол
    const deps = { Gear, Hero, HexMap };
    myCard = Duel.fixedCard(cfg.myCard, cfg.fixed.level, cfg.fixed.seed, deps);
    oppCard = Duel.fixedCard(cfg.opp, cfg.fixed.level, cfg.fixed.seed, deps);
  }
  const mine = Duel.toShadow(myCard, slots, known, () => 0.5);
  livePending = { net: cfg.net, role: cfg.role, first: cfg.first, seed: cfg.seed, fixed: cfg.fixed || null, myGear: { ...Gear.emptyLoadout(), ...mine.gear }, reported: false };
  cfg.net.on('timeout', (m) => { if (LIVE && m.side === LIVE.role) liveSkipMine(m); });
  cfg.net.on('rating', (m) => { if (m.voucher) setTimeout(() => { try { globalThis.claimLiveRewards && globalThis.claimLiveRewards(); } catch (e) { /* без связи */ } }, 800); try { MapView.toast(_t("Рейтинг: {0} ({1})", [m.elo, (m.delta > 0 ? '+' : '') + m.delta]), 4000); } catch (e) { /* карта закрыта */ } });
  const sh = Duel.toShadow(oppCard, slots, known, () => 0.5);
  if (sh && cfg.fixed) sh.fixed = true;
  return sh;
}

// Ход игрока не сделан вовремя: ход автоматически передаётся противнику (та же дорога, что и обычный
// ход), а подряд идущие пропуски считаются — на третьем подряд объявляется поражение (Combat.registerSkip).
async function onTurnTimeout() {
  stopTurnTimer();
  if (LIVE) return;                                  // в живом бою время ведёт сервер (liveSkipMine)
  if (busy || over || turnSide !== 'left') return;
  if (aiming) stopAim();
  endPlayerAction();
  const r = Combat.registerSkip(skipStreak);
  skipStreak = r.skips;
  logEvent('left', _t("Игрок: ход пропущен по таймеру ({0}/{1} подряд)", [skipStreak, Combat.TURN_TIMER.skipLimit]));
  if (r.defeated) { defeat(); return; }
  note(_t("Ход пропущен по таймеру ({0}/{1} подряд)", [skipStreak, Combat.TURN_TIMER.skipLimit]));
  if (petPrank) { petPrank = false; if (prankSwap()) { note(_t("Пакость питомца: поле перемешано")); await sleep(500); } }
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

// 1.7.3: «Анализ боя» — сводка и главная причина исхода одной строкой (по счётчикам rec).
function battleAnalysis(result) {
  const H = fighters.left, E = fighters.right, pct = (a, b) => Math.round(100 * a / Math.max(1, b));
  const lost = rec.taken + rec.pen + rec.poison + rec.pack;
  const li = [
    _t("Ходов героя: {0}", [rec.turns]),
    _t("Нанесено урона: {0} из {1} ХП противника ({2}%)", [rec.dealt, E.max, pct(rec.dealt, E.max)]),
    _t("Получено урона: {0} из {1} ХП героя ({2}%)", [lost, H.max, pct(lost, H.max)]),
  ];
  if (lost > 0) li.push(_t("Из полученного: ударами {0}, ядом {1}, штрафами за неверные ходы {2}", [rec.taken + rec.pack, rec.poison, rec.pen]));
  if (rec.blocks) li.push(_t("Заблокировано ударов: {0}", [rec.blocks]));
  if (rec.absorbed) li.push(_t("Щит противника принял урона: {0}", [rec.absorbed]));
  if (rec.stuns || rec.stunResist) li.push(_t("Оглушений: {0} (устояли: {1})", [rec.stuns, rec.stunResist]));
  let verdict;
  if (result === 'win') verdict = _t("Победа: потеряно {0}% здоровья.", [pct(lost, H.max)]);
  else {
    const c = [
      [rec.poison / Math.max(1, H.max), _t("Главная беда — яд: он снял {0} ХП ({1}% здоровья), а Броня и Блок от него не помогают. Помогают зелья и более короткий бой.", [rec.poison, pct(rec.poison, H.max)]), 0.12],
      [rec.stuns * 0.12, _t("Вас оглушили: потеряно ходов — {0}. Блок даёт шанс устоять, наденьте вещи с Блоком.", [rec.stuns]), 0.12],
      [rec.absorbed / Math.max(1, rec.dealt + rec.absorbed), _t("Щит противника принял {0} урона ({1}% ваших ударов). Бейте крупными линиями, пока щит не растаял.", [rec.absorbed, pct(rec.absorbed, rec.dealt + rec.absorbed)]), 0.25],
      [rec.pen / Math.max(1, H.max), _t("Неверные ходы стоили {0} ХП ({1}% здоровья): ищите ход заранее.", [rec.pen, pct(rec.pen, H.max)]), 0.1],
    ].filter((x) => x[0] >= x[2]).sort((a, b) => b[0] / b[2] - a[0] / a[2])[0];
    verdict = c ? c[1] : rec.dealt >= E.max * 0.5
      ? _t("Вы почти победили: не хватило {0} ХП урона. Эликсир или зелье перед боем могут решить дело.", [Math.max(0, E.hp)])
      : _t("Противник бил сильнее, чем вы: усильте Броню и оружие, выпейте эликсир или возьмите питомца.");
  }
  return `<ul>${li.map((x) => `<li>${x}</li>`).join('')}</ul><p class="an-verdict">${verdict}</p>`;
}

function showOverlay(text, sub = '') {
  stopTurnTimer();
  if (LIVE && !LIVE.reported) { LIVE.reported = true; LIVE.net.result(text === _t("Победа!") ? LIVE.role : (LIVE.role === 'A' ? 'B' : 'A')); }
  hideOverlay();
  const o = document.createElement('div');
  o.className = 'overlay';
  o.id = 'overlay';
  o.innerHTML = _t("<div>{0}{1}<button type=\"button\" class=\"primary to-map\">На карту</button></div>", [text, sub ? `<small>${sub}</small><div class="loot-cap"></div>` : '']);
  const result = text === _t("Победа!") ? 'win' : 'loss';
  o.querySelector('.to-map').addEventListener('click', () => MapView.returnFromBattle(result));
  if (result === 'loss' && host.main && MapView.reviveOk && MapView.reviveOk()) {      // платное воскрешение на месте гибели
    const cost = World.reviveCost(Hero.tierFloat(Profile.level())), b = document.createElement('button');
    b.type = 'button'; b.className = 'revive-btn'; b.disabled = Profile.data.coins < cost;
    b.innerHTML = _t("Воскреснуть на месте — {0}", [MonsterArt.moneyHtml(cost)]);
    b.addEventListener('click', () => { if (Profile.spend(cost)) MapView.returnFromBattle('revive'); });
    o.querySelector('.to-map').insertAdjacentElement('beforebegin', b);
  }
  if (host.main && !TUT()) {                                    // 1.7.3: «Анализ боя»
    const an = document.createElement('div'), ab = document.createElement('button');
    an.className = 'analysis'; an.hidden = true;
    ab.type = 'button'; ab.className = 'an-btn'; ab.textContent = _t("Анализ боя");
    ab.addEventListener('click', () => { if (an.hidden) an.innerHTML = battleAnalysis(result); an.hidden = !an.hidden; ab.setAttribute('aria-expanded', String(!an.hidden)); });
    o.querySelector('.to-map').insertAdjacentElement('beforebegin', an);
    o.querySelector('.to-map').insertAdjacentElement('beforebegin', ab);
  }
  // 1.6.6: итог боя в сохранении: победа снимает отметку «бой идёт», поражение изнашивает надетые вещи на 1 пункт
  const wear = host.main ? Profile.battleEnd(result, { noWear: tourneyFight() }) : null;
  if (wear && wear.worn) {
    const w = document.createElement('small'); w.className = 'wear-note';
    w.textContent = _t("Прочность надетых вещей: −1") + (wear.broken.length ? _t(". Сломались: {0}. Чинятся в Кузнице", [wear.broken.join(', ')]) : '');
    o.querySelector('.to-map').insertAdjacentElement('beforebegin', w);
  }
  (root.nodeType === 1 ? root : boardEl).appendChild(o);
  o.addEventListener('click', (e) => {                       // 1.5.0: добыча — картинки, по нажатию подробности
    const c = e.target.closest('.loot-chip'); if (!c) return;
    if (c.dataset.uid && Profile.item(c.dataset.uid)) return ItemInfo.open(c.dataset.uid);
    const cap = o.querySelector('.loot-cap'); if (cap) cap.textContent = c.dataset.cap || '';
    if (c.dataset.rkind) return ResInfo.open(c.dataset.rkind, c.dataset.rtier);
  });
  over = true;
  // Поражение с питомцем в бою (взят в бой, хоть бы уже и павшим по ходу схватки) — питомец теряет
  // 1 прочность (см. Pets.loseDurability); победа и отступление прочность не трогают.
  if (text === _t("Поражение") && pet) { Profile.petLoseDurability(); logEvent('left', Story.PET_LINES.hurt); }
  logEvent(text === _t("Победа!") ? 'left' : 'right', text);
  if (text === _t("Победа!")) SND.win(); else SND.lose();
  statusEl.textContent = text;
  statusEl.dataset.next = '';
  renderMagic();
}
function hideOverlay() {
  const o = $('overlay');
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
  if (!forSide) { for (const t of foeVeiled) t.el.classList.remove('veiled'); foeVeiled.clear(); }
  if (forSide && locks.forSide !== forSide) return;
  locks = { cols: new Set(), forSide: null };
  renderLocks();
}
const isLocked = (side, cell) => locks.forSide === side && locks.cols.has(cell.c);
const lockedCells = (side) => {
  const out = [];
  if (side === 'right' && foeVeiled.size) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c] && foeVeiled.has(grid[r][c])) out.push(r * N + c);
  if (locks.forSide !== side) return out.length ? out : null;
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
  const res = Engine.fillEmpty(typ, val, boardRand, Balance.board.multiplierChance, GEM_TYPES.length);
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

// 1.6.9: явный переход к новому полю — строка-сообщение, свечение поля. Если на поле остались камни, но ходов нет, они растворяются и
// уходят ВСЕ (поле собирается заново целиком — старые камни среди новых не остаются), а потом сыплются новые.
async function refillBoard() {
  const wasEmpty = isEmptyBoard();
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  note(wasEmpty ? _t("Поле разобрано") : _t("Ходов не осталось — новое поле"));
  if (!calm && boardEl) {
    boardEl.classList.add('refilling');
    setTimeout(() => { if (boardEl) boardEl.classList.remove('refilling'); }, 1300);
  }
  if (!wasEmpty) {
    if (!calm && boardEl) {
      for (const row of grid) for (const t of row) if (t && t.el) t.el.classList.add('dissolve');
      await sleep(RULES.timing.clear + 80);
    }
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { if (grid[r][c] && grid[r][c].el) grid[r][c].el.remove(); grid[r][c] = null; }
  } else if (!calm && boardEl) await sleep(RULES.timing.clear);
  spawnFilled(fillEmpty());
  await sleep(RULES.timing.spawn + (calm ? 0 : 120));
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
  const logEl = $('log');
  if (logEl) logEl.innerHTML = '';
  hideOverlay();
  buildBoard();
  rewarded = false;
  specialDone = false;
  strikeKilledMonster = false; shotKilledMonster = false;
  fighters.left.hpEdited = fighters.right.hpEdited = false;   // ручная правка ХП действует только в одном бою
  if (LIVE) { if (!(livePending && livePending.net === LIVE.net)) { try { LIVE.net.close(); } catch (e) { /* уже закрыт */ } } LIVE = null; }   // новая игра на этом поле — старая связь не нужна
  if (livePending) { LIVE = livePending; livePending = null; BattleRand.seed(LIVE.seed); host.pvp = true; invalidStreakR = 0; }
  applyFaction();
  if (LIVE && LIVE.fixed) fighters.left.innate = {};            // турнир: врождённых способностей народа нет ни у кого
  fighters.left.gear = LIVE ? LIVE.myGear : Profile.gear();
  const sel0 = selNow();
  boardRand = sel0.challenge ? HexMap.rng(sel0.challenge.seed) : BattleRand.next;      // 1.5.4: поле испытания одно на всех
  if (sel0.challenge) {
    const L = World.CH_HERO.level;
    Object.assign(fighters.left, { gear: Gear.emptyLoadout(), innate: {}, base: Hero.baseHp(L), dmg: Hero.dmgMult(L), level: L });
  }
  // 1.5.4: благословение алтаря — на несколько обычных боёв (не на арене и не в испытании)
  const bl = host.main && !sel0.arena && !sel0.challenge && sel0.id !== 'beaver' && Profile.data.blessing && Profile.data.blessing.fights > 0 ? Profile.data.blessing.kind : null;
  fighters.left.bless = bl;
  if (bl === 'might') fighters.left.dmg *= 1 + World.BLESSINGS.might.amount / 100;
  setupEnemy();
  clearLocks();
  veiled.clear();
  fighters.left.charge = 0; fighters.right.charge = 0;
  rec = newRec();
  Object.assign(fighters.right, { tempMax: 0, tempDef: 0, turnNo: 0, revived: false, charged: false, poison: null, ward: 0, stunned: false, shredDone: 0, shield: 0, spores: 0, clonesMade: 0, clone: null, luck: 0, mirrorReady: false, tripleNext: false, magicPaid: 0 });
  Object.assign(fighters.left, { revived2: false, secondWind: false, elx: {}, elxCd: 0, elxUsed: {}, tempMax: 0, tempDef: 0, revived: false, charged: false, poison: null, ward: 0, stunned: false, shredDone: 0, shield: 0, doubleNext: false, luck: 0, mirrorReady: false, tripleNext: false, magicPaid: 0 });
  elxArm();                                          // 1.5.1: эффекты эликсиров на новый бой
  for (const s of ['left', 'right']) {
    fighters[s].buffs = [];
    fighters[s].haste = false;
    recalcStats(s);
    fighters[s].hp = fighters[s].max;
    fighters[s].magic = false;
    fighters[s].counts = Object.fromEntries(GEM_TYPES.map((t) => [t, 0]));
    buildFighter(s);
  }
  if (!isChallenge() && !PET && !cardFight()) {   // 1.6.3: умения за комплекты медалей
    if (Profile.perk('streak')) fighters.left.charge = Math.floor(CHARGE / 2);
    if (Profile.perk('style')) fighters.left.shield = 1;
    if (Profile.perk('daily')) fighters.left.secondWind = true;
    huntBonus = Profile.huntTake();                                         // 1.8.6: заряженный Пояс охотника
    if (huntBonus) { fighters.left.dmg *= 1.25; logEvent('left', _t("Пояс охотника заряжен: урон и добыча +25%")); }
  }
  if (host.main && sel0.lairHp != null) fighters.left.hp = Math.max(1, Math.min(fighters.left.max, Math.round(sel0.lairHp)));   // 1.5.4: логово — ХП между боями не восстанавливается
  if (bl) logEvent('left', _t("Благословение алтаря: {0} (ещё боёв: {1})", [World.BLESSINGS[bl].desc, Profile.data.blessing.fights]));
  setupPet();   // приручённый и годный питомец (если есть) выходит в бой вместе с героем — см. pets.js
  if (!PET && typeof Duo !== 'undefined') Duo.end();
  const duoPet = (!PET && pet && typeof Duo !== 'undefined' && Duo.wanted()) ? pet : null;
  if (duoPet) { pet = null; renderPetPanel(); }       // питомец играет на втором поле (см. Duo)
  if (pet) logEvent('left', _t("{0} выходит с вами в бой!", [petName()]));
  if (duoPet) logEvent('left', _t("{0} выходит на второе поле — переключайтесь между вкладками", [petName()]));
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
  if (host.main && !TUT() && !isTraining()) Profile.battleStart();     // 1.6.6: «бой идёт» — закрытие вкладки после первого хода считается поражением
  battleStyle = { spells: 0, elixirs: 0 };
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

  if (duoPet) Duo.begin(duoPet);
  else if (!PET && !TUT() && typeof Duo !== 'undefined') Duo.solo();
  if (!PET && typeof fitBattleHeight === 'function') requestAnimationFrame(fitBattleHeight);
  // Проворство решает, кто ходит первым.
  const chanceLeft = Combat.firstMoveChance(fighters.left, fighters.right);
    const first = LIVE ? liveSide(LIVE.first) : TUT() || isChallenge() ? 'left' : RULES.firstMove || (BattleRand.next() * 100 < chanceLeft ? 'left' : 'right');
  logEvent('left', _t("Проворство: ваш шанс первого хода {0}%", [chanceLeft]));
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
  SND.swap();
  swapCells(a, b);
  placeTile(a);
  placeTile(b);
  await sleep(RULES.timing.swap);

  if (hasMatches()) return true;

  SND.bad();
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
// Бой вдвоём: за каждого убитого противника — своя награда (при победе, поражении и отступлении).
function grantDuoRewards(foes, extra) {
  if (rewarded) return '';
  rewarded = true;
  if (!foes.length) return '';
  if (moves < Balance.rewards.minMoves || fighters.left.hpEdited || fighters.right.hpEdited) return _t("Награда не выдана: проверочный бой (ХП изменено вручную) или слишком лёгкий бой");
  const deep = !!(Profile.data.monster && Profile.data.monster.deep);
  const txt = foes.map((f, i) => rewardFor(f, i === 0)).join('<br>');
  return deep && extra ? `${txt}<br>${Screens.deepReward()}` : txt;
}
function grantRewardsBase() {
  if (rewarded) return '';
  rewarded = true;
  if (isTraining()) return _t("Учебный бой: опыт, монеты и добыча не начисляются — это просто тренировка.");
  if (isArena() || isChallenge()) return specialResult(true);
  if (moves < Balance.rewards.minMoves || fighters.left.hpEdited || fighters.right.hpEdited) return _t("Награда не выдана: проверочный бой (ХП изменено вручную) или слишком лёгкий бой");
  return rewardFor(fighters.right);
}
// Награда за одного поверженного противника f (в бою вдвоём — за каждого убитого своя).
function rewardFor(f, first = true, opts = {}) {
  const R = Balance.rewards;
  // 1.5.4: элитное — опыт и монеты больше; быстрый бой — половина, без вещей и находок
  const k = (opts.quick ? World.QUICK.share : 1), ke = f.elite ? World.ELITE : null;
  const xp = Math.round(Hero.xpReward(Bestiary.MONSTERS[f.monsterId], f.tier, Profile.level()) * k * (ke ? ke.xp : 1) * (!isChallenge() && Profile.perk('world') ? 1.15 : 1));
  const skyFx = selNow();                                                    // 1.7.1: ночью добыча богаче на 15%
  const lm = Sky.lootMul(skyFx);
  const drops = Bestiary.rollDrops(f.monsterId, f.tier, Math.random, Profile.data.faction, Hero.tierFor(Profile.level()), lm);
  if (selNow().castle && !drops.item && !opts.quick && Math.random() < (selNow().trait ? 0.12 : 0.06)) {   // 1.9.3: духи со своим приёмом роняют одежду вдвое чаще
    const pieces = selNow().castleSet ? Gear.ITEMS.filter((i) => i.set === selNow().castleSet) : [];
    drops.item = pieces.length ? Gear.makeEntry(pieces[Math.floor(Math.random() * pieces.length)].id, f.tier) : Bestiary.rollDrops(f.monsterId, f.tier, Math.random, Profile.data.faction, Hero.tierFor(Profile.level()), 1e6).item;
  }   // 1.8.6: духи замка в доспехах — иногда роняют одежду
  drops.coins = Math.round(drops.coins * k * (ke ? ke.coins : 1) * lm);
  if (lm !== 1) for (const r of drops.resources) r.n = Math.max(1, Math.round(r.n * lm));
  if (opts.quick) drops.item = null;
  // 1.2.9: в режиме «×10» награда выдаётся как обычно (так удобно проверять добычу и ошибки сильным героем).
  drops.coins = Math.round(drops.coins * Factions.perk(Profile.data.faction, 'coins'));   // люди: +10% монет
  const luckPct = fighters.left.luck || 0;                    // Свиток удачи: +% к монетам и ресурсам с этой победы
  if (luckPct) {
    drops.coins = Math.round(drops.coins * (1 + luckPct / 100));
    for (const r of drops.resources) r.n = Math.round(r.n * (1 + luckPct / 100));
  }
  if (huntBonus) { drops.coins = Math.round(drops.coins * 1.25); for (const r of drops.resources) r.n = Math.max(1, Math.round(r.n * 1.25)); huntBonus = false; }
  const mp = (k) => !isChallenge() && Profile.perk(k);                                  // 1.6.3: умения за комплекты медалей
  if (mp('kill')) { drops.coins = Math.round(drops.coins * 1.25); for (const r of drops.resources) r.n = Math.max(1, Math.round(r.n * 1.25)); }
  Profile.data.wins++;
  Profile.noteBattle();
  if (typeof Chron !== 'undefined') { const w = Chron.winMark(Profile.data, Profile.data.wins); if (w) Profile.save(); }
  if (Profile.huntWin()) MapView.toast(_t("Пояс охотника заряжен: в следующем бою урон и добыча +25%"), 3500);
  Profile.recordWin(f.monsterId, f.tier);
  { const sh = Profile.data.ship;       // 1.8.7: сильные звери помогают вытащить бригантину в море
    if (sh && sh.paid && !sh.fixed && ['boar', 'elk', 'rhino', 'leopard', 'lynx'].includes(f.monsterId) && (sh.pulls || 0) < 5) {
      sh.pulls = (sh.pulls || 0) + 1; MapView.toast(_t("Зверь потянул бригантину: {0} / 5", [sh.pulls]), 3000); } }
  Daily.registerWin();
  Profile.addCoins(drops.coins);
  const up = Profile.addXp(xp);
  const killMedal = Profile.checkKillMedal(f.monsterId, Hero.tierFor(Profile.level()));   // первая победа над видом
  const shotMedal = first && shotKilledMonster ? Profile.registerShotKill(Hero.tierFor(Profile.level())) : null;
  const strikeMedal = first && strikeKilledMonster ? Profile.registerStrikeKill(Hero.tierFor(Profile.level())) : null;
  const styleMedals = first && !opts.quick ? Profile.registerBattleStyle({ fullHp: fighters.left.hp >= fighters.left.max, moves, spells: battleStyle.spells, elixirs: battleStyle.elixirs }, Hero.tierFor(Profile.level())) : [];
  const secretMedals = first && !opts.quick ? Profile.noteSecret({ win: true, hpLeft: Math.round(fighters.left.hp), tier: f.tier, heroTier: Hero.tierFor(Profile.level()) }) : [];
  const chips = [];
  const lines = [_t("Опыт: +{0}", [xp]), _t("Монеты: {0}{1}", [MonsterArt.moneyHtml(drops.coins), luckPct ? _t(" (со Свитком удачи)") : ''])];
  const eggKind = opts.quick ? null : Profile.rollEgg(f.monsterId);
  if (eggKind) lines.push(_t("<b class=\"lvlup\">Находка!</b> {0} — высиживается в Питомнике", [Pets.EGGS[eggKind].name]));
  if (killMedal) lines.push(_t("<b class=\"lvlup\">Медаль!</b> {0}", [Medals.nameFor(killMedal.id)]));
  if (shotMedal) lines.push(_t("<b class=\"lvlup\">Медаль!</b> {0}", [Medals.nameFor(shotMedal.id)]));
  if (strikeMedal) lines.push(_t("<b class=\"lvlup\">Медаль!</b> {0}", [Medals.nameFor(strikeMedal.id)]));
  for (const sm of secretMedals) lines.push(_t("<b class=\"lvlup\">Секретная медаль!</b> {0}", [Medals.nameFor(sm.id)]));
  for (const sm of styleMedals) lines.push(_t("<b class=\"lvlup\">Медаль!</b> {0}", [Medals.nameFor(sm.id)]));
  for (const m of [killMedal, shotMedal, strikeMedal, ...secretMedals, ...styleMedals]) {      // 1.6.3: собран комплект — умение и реликвия
    if (m && m.relic) { const gk = m.relic.slice(6); lines.push(_t("<b class=\"lvlup\">Комплект собран!</b> Умение «{0}»: {1}. Реликвия: {2}", [Medals.PERKS[gk].name, Medals.PERKS[gk].desc, Gear.item({ id: m.relic, tier: 1 }).name])); }
  }
  for (const m of [killMedal, shotMedal, strikeMedal, ...secretMedals, ...styleMedals]) {        // 1.8.5: медаль — картинкой в добыче, по нажатию/наведению — суть
    if (!m) continue;
    const e = Profile.medals().find((x) => x.id === m.id), cap = Screens.medalCaption(m.id);
    chips.push(`<button type="button" class="loot-chip medal-chip" data-cap="${cap.replace(/"/g, '&quot;')}" title="${cap.replace(/"/g, '&quot;')}">${Screens.medalTile(m.id, e || { id: m.id, tier: 1 }, Profile.level(), 1, 1).replace(/ data-medal="[^"]*"| data-tip="[^"]*"| tabindex="0"| role="button"/g, '')}</button>`);
  }
  if (drops.weak) lines.push(`<span class="hint">${_t("Существо слабее вашего цвета: ресурсов нет")}</span>`);   // 1.6.6
  for (const r of drops.resources) {
    if (Math.random() < Village.granaryChance(Profile.data.village)) r.n *= 2;      // 1.5.1: амбар Мельницы — находка удваивается
    Profile.addRes(r.kind, r.tier, r.n);
    lines.push(`${Bestiary.RESOURCES[r.kind].name} (${Tiers.get(r.tier).name}) ×${r.n}`);
    chips.push(`<button type="button" class="loot-chip" data-rkind="${r.kind}" data-rtier="${r.tier}" data-cap="${Bestiary.RESOURCES[r.kind].name} (${Tiers.get(r.tier).name}) ×${r.n}" title="${Bestiary.RESOURCES[r.kind].name}">${MonsterArt.resIcon(r.kind, r.tier)}<b>×${r.n}</b></button>`);
  }
  if (drops.item) {
    Profile.addItem(drops.item);
    const it = Gear.item(drops.item);
    if (it.rarity && it.rarity !== 'common') setTimeout(() => SND.rare(), 900);      // 1.5.1: звон редкой добычи
    lines.push(_t("Вещь: {0} ({1})", [it.name, Tiers.get(it.tier).name]));
    chips.push(`<button type="button" class="loot-chip item r-${it.rarity}" data-uid="${drops.item.uid}" data-cap="${it.name}" title="${it.name}" style="--t:${Tiers.get(it.tier).color}">${itemIcon(it.type, '', it.id)}</button>`);
  }
  if (!opts.quick && Math.random() < R.consumableChance + (!isChallenge() && Profile.perk('secret') ? 0.1 : 0)) {
    const kinds = Object.keys(Gear.CONSUMABLES), k = kinds[rnd(kinds.length)];
    Profile.addConsumable(k);
    lines.push(`+1 ${Gear.CONSUMABLES[k].name}`);
    chips.push(`<button type="button" class="loot-chip" data-cap="${Gear.CONSUMABLES[k].name}: ${Gear.CONSUMABLES[k].desc}" title="${Gear.CONSUMABLES[k].name}">${itemIcon(k)}<b>+1</b></button>`);
  }
  if (up.to > up.from) {
    const L = up.to, t = Hero.tierFor(L);
    lines.unshift(_t("<b class=\"lvlup\">Новый уровень {0}!</b> ХП {1}, урон камня ×{2}, очки снаряжения {3}", [L, Hero.baseHp(L), Hero.dmgMult(L), Hero.budget(L)]) +
      (Hero.itemLevel(t) === L ? _t(". Теперь можно надевать вещи цвета «{0}»", [Tiers.get(t).name]) : ''));
    const opened = Object.entries(Balance.spellUnlock).filter(([k, lv]) => lv > up.from && lv <= up.to && MAGICS[k]).map(([k]) => MAGICS[k].name);
    if (opened.length) lines.splice(1, 0, _t("<b class=\"lvlup\">Новое заклинание:</b> {0}", [opened.join(', ')]));   // 1.4.3: не пропустить открытие магии
    SND.win();
  }
  // 1.3.0: страж осколка — двойные монеты; первая победа — осколок Великого Сердца и награда сюжета.
  const bossId = Profile.data.monster && Profile.data.monster.boss;
  if (bossId && Story.BY_ID[bossId]) {
    const story = Profile.data.story = Profile.data.story || { shards: {} };
    story.shards = story.shards || {};
    Profile.addCoins(drops.coins);
    lines.push(_t("Страж: монеты ×2 (+{0})", [MonsterArt.moneyHtml(drops.coins)]));
    lines.push(`<i class="boss-defeat">${Story.BY_ID[bossId].defeat}</i>`);
    if (!story.shards[bossId]) {
      story.shards[bossId] = true;
      Profile.chron('shard', Story.BY_ID[bossId].title);
      const rw = Story.shardReward(bossId, Story.cycle(story)), ch = Story.BY_ID[bossId];
      Profile.addCoins(rw.coins);
      Profile.addXp(rw.xp);
      lines.unshift(ch.final
        ? _t("<b class=\"lvlup\">Сердцевина Великого Сердца!</b> Грань снова цела — сюжет пройден. +{0}, опыт +{1}", [MonsterArt.moneyHtml(rw.coins), rw.xp])
        : _t("<b class=\"lvlup\">Осколок Великого Сердца! ({0}/4)</b> +{1}, опыт +{2}{3}", [Story.shards(story), MonsterArt.moneyHtml(rw.coins), rw.xp, Story.finalOpen(story) ? _t(". На севере пробудился Древний дракон…") : '']));
      setTimeout(() => SND.shard(), 700);
      lines.push(ch.final ? `<i class="story-news">${Story.EPILOGUE}</i>` : `<i class="story-news">${Story.news(story)}</i>`);
    }
  }
  // 1.7.3: хозяин зоны — монеты ×2; первая победа — трофей: монеты, опыт и редкая вещь вашего цвета.
  const zoneId = Profile.data.monster && Profile.data.monster.zone, ZB = !opts.quick && zoneId && World.ZONE_BOSSES[zoneId];
  if (ZB) {
    Profile.addCoins(drops.coins);
    lines.push(_t("Хозяин зоны: монеты ×2 (+{0})", [MonsterArt.moneyHtml(drops.coins)]));
    lines.push(`<i class="boss-defeat">${ZB.defeat}</i>`);
    const won = Profile.data.zoneWon = Profile.data.zoneWon || {};
    if (!won[zoneId]) {
      won[zoneId] = true;
      const rw = World.zoneReward(zoneId);
      Profile.addCoins(rw.coins);
      Profile.addXp(rw.xp);
      const pool = Gear.itemsFor(Profile.data.faction).filter((i) => i.rarity === 'rare' && !i.relic);
      const pick = pool.length ? pool[rnd(pool.length)] : null;
      let trophy = '';
      if (pick) {
        const entry = Gear.makeEntry(pick.id, ZB.tier);
        Profile.addItem(entry);
        const it = Gear.item(entry);
        trophy = _t(", вещь: {0}", [it.name]);
        chips.push(`<button type="button" class="loot-chip item r-${it.rarity}" data-uid="${entry.uid}" data-cap="${it.name}" title="${it.name}" style="--t:${Tiers.get(it.tier).color}">${itemIcon(it.type, '', it.id)}</button>`);
      }
      lines.unshift(_t("<b class=\"lvlup\">Трофей хозяина зоны!</b> +{0}, опыт +{1}{2}", [MonsterArt.moneyHtml(rw.coins), rw.xp, trophy]));
      setTimeout(() => SND.rare(), 700);
    }
  }
  Profile.save();
  onEconomyChanged();
  return lines.join('<br>') + (chips.length ? `<div class="loot">${chips.join('')}</div>` : '');
}

// Поражение нашей стороны на этом поле: в бою вдвоём итог подводит Duo, иначе — экран «Поражение».
let huntBonus = false;
function defeat() {
  earlyLossHelp();
  if (!tourneyFight()) Profile.huntLoss();
  if (!isTraining()) { Profile.noteBattle(); Profile.save(); }   // считается любой бой, исход не важен
  if (typeof Profile !== 'undefined' && !isTraining() && moves >= Balance.rewards.minMoves) Profile.noteSecret({ win: false });   // 1.6.2: серия поражений
  if (host.coord) finishBoard('loss'); else showOverlay(_t("Поражение"), host.main && (isArena() || isChallenge()) ? specialResult(false) : '');
}

// 1.5.4: быстрый бой с картой (MapView.quickFight) — награда за слабое, уже побеждённое существо без боя.
function quickReward(monsterId, tier) {
  const keep = { luck: fighters.left.luck, shot: shotKilledMonster, strike: strikeKilledMonster };
  fighters.left.luck = 0; shotKilledMonster = false; strikeKilledMonster = false;
  try { return rewardFor({ monsterId, tier }, false, { quick: true }); } finally { fighters.left.luck = keep.luck; shotKilledMonster = keep.shot; strikeKilledMonster = keep.strike; }
}

// 1.5.4: итог боя на Арене теней или в Испытании дня (победа, поражение, отступление — один раз за бой).
function specialResult(win) {
  if (specialDone) return '';
  specialDone = true;
  const sel = selNow(), d = Profile.data, lines = [], T = Hero.tierFor(Profile.level());
  if (sel.lord) {
    if (win) {                                                // 1.8.6: награда за хозяина замка — монеты, опыт-победа и вещь высшего цвета
      const coins = Math.round(World.cacheCoins(Math.max(6, T)) * 3);
      Profile.addCoins(coins);
      lines.push(_t("Монеты: {0}", [MonsterArt.moneyHtml(coins)]));
      const it = Bestiary.rollDrops('bandit', Math.max(6, T), Math.random, d.faction, T, 1e6).item;
      if (it) { Profile.addItem(it); lines.push(_t("Трофей замка: {0}", [Gear.item(it).name])); }
      // 1.9.3: хозяин замка сильнее духов — ещё эссенция, эликсиры и вещь из набора замка (раз в 20 часов, пока он не вернулся)
      const ess = 2 + Math.floor(T / 3); Profile.addRes('essence', Math.max(6, T), ess); lines.push(_t("Эссенция: {0}", [ess]));
      Profile.addConsumable('elixir', 2); lines.push(_t("Эликсиры: 2"));
      const sets = Object.keys(Gear.SETS).filter((id) => (!Gear.SETS[id].faction || Gear.SETS[id].faction === d.faction) && Gear.ITEMS.some((i) => i.set === id)).sort();
      if (sets.length && Math.random() < 0.5) { const pieces = Gear.ITEMS.filter((i) => i.set === sets[Math.floor(Math.random() * sets.length)]); const e2 = Gear.makeEntry(pieces[Math.floor(Math.random() * pieces.length)].id, Math.max(6, T)); Profile.addItem(e2); lines.push(_t("Доспех духа: {0}", [Gear.item(e2).name])); }
      Profile.data.wins++;
    }
  } else if (sel.run) {                                       // 1.8.8: «Забег» — копилка растёт с каждой волной, поражение отнимает часть
    const r = d.run = Run.clean(d.run);
    if (r.on) {
      if (win) {
        const wv = r.wave, res = Run.win(r, Math.round(World.arenaCoins(Math.max(1, T), 2) * 0.5 * Run.modMult(r.mod) * Events.mul(Events.current(Date.now(), new Date().getTimezoneOffset()).id, 'run')), Daily.today());
        Profile.data.wins++;
        lines.push(res.add ? _t("Волна {0} пройдена: в копилку +{1} (всего {2})", [wv, MonsterArt.moneyHtml(res.add), MonsterArt.moneyHtml(r.pot)]) : _t("Волна {0} пройдена. Монеты за сегодня уже набраны — рекорд всё равно растёт.", [wv]));
        if (res.done) { const c = Run.cash(r); Profile.addCoins(c); lines.push(_t("<b class=\"lvlup\">Все волны пройдены!</b> Выплата: {0}", [MonsterArt.moneyHtml(c)])); }
      } else {
        const c = Run.lose(r); Profile.addCoins(c);
        lines.push(c ? _t("Забег окончен. Из копилки спасено: {0}", [MonsterArt.moneyHtml(c)]) : _t("Забег окончен."));
      }
    }
  } else if (sel.arena && sel.arena.fixed) {                 // бой турнира: рейтинг и монеты арены не трогаем, награда — за итог турнира
    lines.push(win ? _t("Победа в бою турнира!") : _t("Поражение в бою турнира"));
  } else if (sel.arena && LIVE && !LIVE.fixed) {              // живой бой: награду и звёзды ранга выдаёт сервер по квитанции (applyVoucher)
    lines.push(win ? _t("Победа в живом бою! Награду подтвердит сервер.") : _t("Поражение в живом бою. Итог подтвердит сервер."));
  } else if (sel.arena) {
    const a = d.arena = Object.assign(World.freshArena(), d.arena || {});
    World.arenaSync(a, Daily.today(), T);
    const sh = sel.arena, rule = sh.rule && World.ARENA_RULES.find((x) => x.id === sh.rule), rev = !!sh.rev;
    const before = a.rank, r = World.arenaResult(a, win, rev);
    World.arenaLog(a, { day: Daily.today(), nick: sh.nick, f: sh.faction, win, rule: sh.rule || '', rev, rank: before });
    if (!win && !rev) a.revenge = { ...sh, rev: true, rule: sh.rule };       // реванш: тот же противник, поражение не снимает звезду
    if (win && rev) a.revenge = null;
    if (win) {
      if (a.fights < World.ARENA_DAILY) {
        a.fights++;
        let c = World.arenaCoins(T, a.rank);
        if (rule) { const extra = Math.round(c * World.RULE_BONUS); c += extra; lines.push(_t("Условие дня «{0}»: +{1}", [rule.name, MonsterArt.moneyHtml(extra)])); }
        Profile.addCoins(c);
        lines.push(_t("Монеты: {0} (боёв с наградой сегодня: {1}/{2})", [MonsterArt.moneyHtml(c), a.fights, World.ARENA_DAILY]));
      } else lines.push(_t("Сегодня монеты за арену уже получены ({0}/{0}) — звёзды по-прежнему идут в зачёт", [World.ARENA_DAILY]));
      Profile.data.wins++;
      Daily.registerWin();
    }
    if (r.rankUp) {
      const c = World.rankCoins(T, a.rank);
      Profile.addCoins(c);
      lines.unshift(_t("<b class=\"lvlup\">Новый ранг: {0}!</b> +{1}", [World.RANKS[a.rank], MonsterArt.moneyHtml(c)]));
      const tid = World.RANK_TITLES[a.rank];
      d.cosmetics = d.cosmetics || Village.fresh();
      if (tid && !d.cosmetics.titles.includes(tid)) { d.cosmetics.titles.push(tid); lines.splice(1, 0, _t("<b class=\"lvlup\">Титул!</b> «{0}» — наденьте в Гардеробе Ратуши", [Village.TITLES.find((t) => t.id === tid).name])); }
    }
    lines.push(_t("{0}: звёзды {1}/{2}", [World.RANKS[a.rank], '★'.repeat(a.stars) + '☆'.repeat(World.STARS - a.stars), World.STARS]) + (!win && before === a.rank ? (rev ? _t(" (реванш: звезда не снята)") : _t(" (поражение: −1 звезда)")) : ''));
    if (!win && !rev && a.revs < World.REVENGE_DAILY) lines.push(_t("Можно взять реванш у этой тени (сегодня {0}/{1})", [a.revs, World.REVENGE_DAILY]));
  } else if (sel.challenge) {
    const c = d.challenge = Object.assign(World.freshChallenge(), d.challenge || {});
    const L = fighters.left, R = fighters.right;
    const score = World.challengeScore(win, L.hp / L.max, moves, 1 - Math.max(0, R.hp) / R.max);
    const first = c.paid !== sel.challenge.day;
    c.best = c.day === sel.challenge.day ? Math.max(c.best, score) : score;
    c.day = sel.challenge.day;
    c.history[c.day] = c.best;
    const keys = Object.keys(c.history).sort();
    while (keys.length > 14) delete c.history[keys.shift()];
    lines.push(_t("Очки: <b>{0}</b> · лучший результат сегодня: {1}", [score, c.best]));
    lines.push(win ? _t("Победа за {0}, осталось {1}% ХП", [`${moves} ${turnsWord(moves)}`, Math.round(L.hp / L.max * 100)]) : _t("Нанесено урона: {0}%", [Math.round((1 - Math.max(0, R.hp) / R.max) * 100)]));
    if (win) { const dm = Profile.registerChallengeWin(sel.challenge.day); if (dm) lines.push(_t("<b class=\"lvlup\">Медаль!</b> {0}", [Medals.nameFor(dm.id)])); }   // 1.6.2: серия дней
    if (first) { c.paid = sel.challenge.day; const cn = World.arenaCoins(T, 2); Profile.addCoins(cn); lines.push(_t("За участие сегодня: {0}", [MonsterArt.moneyHtml(cn)])); }
  }
  Profile.save();
  onEconomyChanged();
  return lines.join('<br>');
}
function finishBoard(result) {
  over = true; busy = true;
  stopTurnTimer();
  statusEl.textContent = result === 'win' ? _t("Противник повержен") : _t("Боец пал");
  renderMagic();
  host.coord.ended(host.id, result);
}

/* ---------- автопилот и поле питомца (бой вдвоём, см. Duo внизу файла) ---------- */

const portraitOf = (p) => (typeof Art !== 'undefined' && Art.has('pets/' + p.speciesId)) ? `<img src="${Art.url('pets/' + p.speciesId)}" alt="">` : MonsterArt.bust(Pets.donorOf(p.speciesId), p.tier);
function petPortrait(p) { return portraitOf(p); }

// Включает/выключает автопилот нашей стороны на этом поле.
function setAutopilot(on, level) {
  autopilot = !!on;
  if (level) autoLevel = level;
  if (autopilot) { if (aiming) stopAim(); stopTurnTimer(); kickAuto(); }
  else if (turnSide === 'left' && !busy && !over) startTurnTimer();
  renderMagic();
}
function kickAuto() {
  if (!autopilot || over || busy || turnSide !== 'left' || autoPending) return;
  autoPending = true;
  setTimeout(() => { autoTurn(); }, 450);
}
// Ход нашей стороны ведёт ИИ (тот же AI.choose, что у противника, но за 'left').
// Кнопка приёма питомца, когда им играет человек: раз в 3 хода питомца, ход не тратит.
const PET_SKILL_CD = 3;
function updatePetSkill() {
  const f = fighters.left, box = fEl('left');
  if (!box) return;
  let btn = box.querySelector('.pet-skill');
  const has = !!(host.role === 'pet' && f.isPet && f.ability && PET_ABILITIES.includes(f.ability));
  if (!has) { if (btn) btn.remove(); return; }
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'pet-skill';
    btn.addEventListener('click', usePetSkill);
    box.appendChild(btn);
  }
  const cd = f.skillCd || 0, ready = !autopilot && !over && !busy && turnSide === 'left' && cd === 0;
  const nm = (Bestiary.ability(f.ability) || {}).name || '';
  btn.hidden = autopilot;
  btn.disabled = !ready;
  btn.textContent = cd > 0 ? _t("Приём «{0}»: ещё {1} {2}", [nm, cd, cd === 1 ? _t("ход") : _t("хода")]) : _t("Приём «{0}»", [nm]);
  btn.title = (Bestiary.ability(f.ability) || {}).desc || '';
}
async function usePetSkill() {
  const f = fighters.left;
  if (autopilot || over || busy || turnSide !== 'left' || (f.skillCd || 0) > 0) return;
  busy = true; stopTurnTimer();
  const ok = await petAbility(true);
  if (over) return;
  if (ok) f.skillCd = PET_SKILL_CD; else note(_t("Приём сейчас ни к чему"));
  busy = false; startTurnTimer(); renderMagic();
}

// 1.5.0: приём питомца — приём вида-донора в начале хода питомца, когда ум ≥ PET_ABILITY_INT (1.5.1: 5 — с первого боя).
// Только те, что не требуют поля противника: лечение, воровство камней, вой, бубен, морок, панцирь, трясина, смола.
const PET_ABILITY_INT = 5, PET_ABILITIES = ['regen', 'steal', 'howl', 'drum', 'weaken', 'pinch', 'mire', 'sap', 'petrify', 'veil', 'breath', 'prank'];
const foeVeiled = new Set();                       // туман питомца: камни, которые противник не может двигать на свой ход
let petPrank = false;                              // пакость питомца — в конце его хода, чтобы не портить поле ему самому
// 1.5.1: вспышка приёма — цветное свечение на том бойце, на кого приём действует, и звук.
const PET_FX = { regen: ['left', 'heal'], howl: ['left', 'buff'], drum: ['left', 'buff'], pinch: ['left', 'block'], prank: ['left', 'buff'],
  steal: ['right', 'steal'], weaken: ['right', 'weaken'], mire: ['right', 'mire'], sap: ['right', 'sap'], petrify: ['right', 'stone'], veil: ['right', 'veil'], breath: ['right', 'fire'] };
function petFx(kind) {
  const fx = PET_FX[kind]; if (!fx) return;
  const box = fEl(fx[0]); if (!box) return;
  const cls = 'pskill-' + fx[1];
  box.classList.remove(cls); void box.offsetWidth; box.classList.add(cls);
  setTimeout(() => box.classList.remove(cls), 1100);
  if (kind === 'howl' || kind === 'breath' || kind === 'petrify') SND.growl(); else SND.pet();
}
async function petAbility(force = false) {
  const f = fighters.left;
  if (!f.isPet || !f.ability || !PET_ABILITIES.includes(f.ability) || (!force && autoLevel < PET_ABILITY_INT)) return false;
  const t0 = f.turnNo || 0;
  let act = null;
  for (let k = 0; k < (force ? 30 : 1) && !act; k++) {      // force — кнопка: подбираем ход, на котором приём точно срабатывает
    f.turnNo = force ? (k + 1) * 12 - 1 : t0;
    f.turnNo++;
    act = Combat.monsterTurnStart(f, fighters.right, MAGIC_TYPES);
  }
  if (force) f.turnNo = t0;
  const foe = fighters.right;
  if (!act) return false;
  petFx(act.kind);
  const A = Balance.abilities, nm = (Bestiary.ability(f.ability) || {}).name || '';
  if (act.kind === 'regen') { showFloat('left', '+' + act.heal, 'heal'); renderFighters(); }
  else if (act.kind === 'howl' || act.kind === 'drum' || act.kind === 'pinch') showFloat('left', nm, 'buff');
  else if (act.kind === 'steal') { f.counts[act.type] = (f.counts[act.type] || 0) + act.stones; renderCounters('left'); renderCounters('right'); showFloat('right', `−${act.stones}`, 'ricochet'); }
  else if (act.kind === 'weaken' || act.kind === 'mire') showFloat('right', nm, 'debuff');
  else if (act.kind === 'petrify') {
    const cols = [...Array(N).keys()].filter((c) => grid.some((row) => row[c]));
    if (!cols.length) return false;
    setLock(cols[rnd(cols.length)], 'right'); showFloat('right', nm, 'debuff');
  } else if (act.kind === 'veil') {
    const tiles = grid.flat().filter(Boolean);
    for (let k = 0; k < act.stones && tiles.length; k++) { const t = tiles.splice(rnd(tiles.length), 1)[0]; t.el.classList.add('veiled'); foeVeiled.add(t); }
    showFloat('right', nm, 'debuff');
  } else if (act.kind === 'prank') { petPrank = true; }
  else if (act.kind === 'breath') {
    const pick = () => { let best = -1, bestN = 0; for (let r = 0; r < N; r++) { const n = grid[r].filter(Boolean).length; if (n > bestN) { bestN = n; best = r; } } return best; };
    if (pick() < 0) return false;
    logEvent('left', _t("{0}: приём «{1}»", [f.name, nm]));
    await sleep(500);
    if (over) return false;
    const row = pick();                       // за полсекунды поле могло измениться
    if (row < 0) return false;
    await castFire('left', { r: row, c: 0 }, { free: true, shape: 'row', mult: act.mult, name: nm });
    return true;
  }
  logEvent('left', _t("{0}: приём «{1}»", [f.name, nm]));
  renderMagic();
  return true;
}

async function autoTurn() {
  autoPending = false;
  if (!autopilot || over || busy || turnSide !== 'left') return;
  if (aiming) stopAim();
  busy = true;
  skipStreak = 0;
  stopTurnTimer();
  renderMagic();
  const SPELL_NAMES = { fire: _t("Огненный крест"), square: _t("Захват"), transmute: _t("Превращение"), heal: _t("Целебный дождь"), chaos: _t("Хаос") };
  await petAbility();
  if (over) return;
  for (;;) {
    await sleep(RULES.timing.think);
    if (over) return;
    if (!autopilot) { busy = false; renderMagic(); startTurnTimer(); return; }   // управление передали нам посреди хода
    const f = fighters.left;
    const v = Combat.aiView(f, fighters.right);
    const afford = (f.isPet || f.magic) ? {} : Object.fromEntries(Object.keys(MAGICS).map((k) => [k, spellOpen(k) && canAffordMagic('left', k)]));
    const mv = AI.choose(typOf(), valOf(), v.hpMe, v.hpOpp, autoLevel, afford, { maxMe: v.maxMe, healMult: v.healMult, locked: lockedCells('left') });
    if (!mv) { note(_t("{0} не нашёл хода", [f.name])); break; }
    let res;
    if (SPELL_NAMES[mv.kind]) {
      note(_t("{0}: {1}!", [f.name, SPELL_NAMES[mv.kind]]));
      await sleep(500);
      const cell = mv.idx !== undefined ? { r: Math.floor(mv.idx / N), c: mv.idx % N } : null;
      res = mv.kind === 'fire' ? await castFire('left', cell)
        : mv.kind === 'square' ? await castFire('left', cell, { shape: 'square' })
        : mv.kind === 'transmute' ? await castTransmute('left', cell)
        : mv.kind === 'heal' ? await castHeal('left')
        : await castChaos('left');
    } else {
      if (mv.kind === 'lightning') {
        f.magicPaid = magicCostOf('left', 'lightning'); f.magic = true;
        spendMagic('left', -1, 'lightning');
        renderMagic();
        SND.lightning();
        await sleep(500);
      }
      const a = { r: Math.floor(mv.a / N), c: mv.a % N };
      const b = { r: Math.floor(mv.b / N), c: mv.b % N };
      res = await takeTurn('left', a, b);
    }
    if (over) return;
    if (res !== 2 || fighters.left.hp <= 0) break;
  }
  busy = true;
  await passToEnemy();
}

// Поле питомца: точная копия противника героя против питомца. cfg: { fighter (Pets.petFighter+), foe (снимок), level (ум), name, speciesId, tier }
function startPetGame(cfg) {
  aiming = false; aimCell = null;
  stopTurnTimer();
  skipStreak = 0;
  hideOverlay();
  buildBoard();
  rewarded = true;
  clearLocks();
  veiled.clear();
  cfg.fighter.dmg = (cfg.fighter.dmg || 1) * (cfg.dmgMult || Pets.BOARD_DMG);
  cfg.fighter.max = Math.round(cfg.fighter.max * (cfg.hpMult || Pets.BOARD_HP)); cfg.fighter.hp = cfg.fighter.max;
  Object.assign(fighters.left, cfg.fighter, {
    isPet: true, name: cfg.name, speciesId: cfg.speciesId, tier: cfg.tier,
    gear: Gear.emptyLoadout(), innate: {}, base: cfg.fighter.max, level: cfg.level,
    counts: Object.fromEntries(GEM_TYPES.map((t) => [t, 0])), buffs: [], haste: false, magic: false, charge: 0, shield: 0, luck: 0,
  });
  adoptFoe(cfg.foe, true);
  buildFighter('left');
  const el = fEl('left');
  const nm = el.querySelector('.fname');
  if (nm) nm.textContent = cfg.name;
  for (const sel of ['.wallet', '.gearrow', '.hero-lvl']) { const x = el.querySelector(sel); if (x) x.style.display = 'none'; }
  renderAvatar('left'); renderCounters('left');
  moves = 0; movesEl.textContent = 0;
  selected = null; invalidStreak = 0;
  grid = Array.from({ length: N }, () => Array(N).fill(null));
  const startCells = fillEmpty();
  spawnFilled(startCells);
  busy = false;
  renderFighters();
  setTurn('left');
  turnDamage = { target: null, amount: 0 };
  turnEvents = { block: 0, blockTarget: null, reflected: 0, attacker: null };
  const chanceLeft = Combat.firstMoveChance(fighters.left, fighters.right);
  if (Math.random() * 100 < chanceLeft) logEvent('left', _t("Первым ходит питомец"));
  else {
    logEvent('right', _t("Первым ходит противник"));
    busy = true;
    setTimeout(() => { if (!over) enemyTurn(); }, 900);
  }
}

// Подставляет на поле противника (снимок): при старте поля питомца и когда уцелевший боец добивает чужого противника.
function adoptFoe(foe, fresh) {
  const keep = fighters.right;
  for (const k of Object.keys(keep)) delete keep[k];
  Object.assign(keep, structuredClone(foe));
  if (fresh) Object.assign(keep, { hp: keep.max, buffs: [], clone: null, counts: Object.fromEntries(GEM_TYPES.map((t) => [t, 0])) });
  clearLocks('right');
  buildFighter('right');
  renderAvatar('right'); renderGear('right'); renderCounters('right');
  renderEnemyColumn();
  renderFighters();
}
// Продолжить бой на этом поле против новой подстановки: поле жива, ход за нами.
async function resumeAfterAdopt() {
  over = false; busy = true;                       // пока доводим поле, ввод закрыт
  const o = $('overlay'); if (o) o.remove();
  // 1.6.5 (A2-21): бой на этом поле мог закончиться посреди хода (resolveBoard/castFire выходят сразу, едва кто-то пал), и поле «оживало» как есть:
  // камни могли висеть над пустыми клетками, на поле оставалась несыгранная линия, а если ходов не осталось вовсе — ход игрока при поле без ходов
  // (ходить нечем, бой завис: в дуэли выживший добивал чужого противника на таком поле). Доводим его как после обычного хода: падение; если поле пусто,
  // без ходов или на нём осталась готовая линия — новые камни (fillEmpty пересоберёт поле целиком, если оставшимися не обойтись). «Редкое» поле
  // (камней мало, но ход есть и линий нет) не трогаем: в этой игре поле намеренно редеет.
  gravityDown(); shiftRight();
  const typ = typOf();
  if (isEmptyBoard() || Engine.bonusMap(typ) || !Engine.hasMoves(typ)) await refillBoard();
  busy = false;
  renderMagic();
  setTurn('left');
}
function brief() {
  const l = fighters.left, r = fighters.right;
  return { hp: l.hp, max: l.max, name: l.name, foeHp: r.hp, foeMax: r.max, foeName: r.name, over, turn: turnSide, tier: l.tier, foe: r, pet: pet ? { name: petName(), hp: pet.hp, max: pet.max, alive: petAlive() } : null };
}

function checkEnd() {
  if (over) return true;                      // бой уже окончен
  if (TUT()) Tutorial.guard();                // обучение: Бобёр не падает раньше последнего шага
  if (host.coord && Combat.enemyDefeated(fighters.right)) { finishBoard('win'); return true; }   // бой вдвоём: итог подводит Duo
  // Победа — только когда пал оригинал И нет живого двойника гриба (награда одна, за одного противника).
  if (Combat.enemyDefeated(fighters.right)) { showOverlay(_t("Победа!"), grantRewards()); if (TUT()) Tutorial.event('win'); return true; }
  if (fighters.left.hp <= 0) { defeat(); return true; }
  return false;
}

// Один ход стороны side. Возвращает 0 — обмен недопустим, 1 — обычный ход,
// 2 — ход с линией из 4+ камней (даёт дополнительный ход).
async function takeTurn(side, a, b) {
  const ok = await attemptSwap(a, b);
  if (!ok) return 0;
  if (host.main && side === 'left') Profile.battleMoved();

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
  SND.fire();

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
        if (facOn(side) && factionOf(side) && tile.type === factionOf(side).gem) charge += tile.value;
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
    const stones = fighters[side].magic ? Math.round(all * B.lightning.mult * Sky.spellMul(selNow(), 'lightning')) : obs;
    dmg = shape === 'point' ? 0 : fx + Combat.strikeDamage(fighters[side]) + stones;   // Выпад: урона нет, ценна позиция
    if (mult !== 1 && dmg > 0) dmg = Math.max(1, Math.round(dmg * mult));            // 1.5.1: слабость семейства (шашка)
    const fm = Sky.spellMul(selNow(), 'fire');                            // 1.7.1: ливень гасит огонь
    if (fm !== 1 && dmg > 0) dmg = Math.max(1, Math.round(dmg * fm));
    renderCounters(side, [...gotTypes]);
    if (charge) addCharge(charge, side);
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
  const amount = Combat.rainHeal(f, Math.round(sum * Sky.spellMul(selNow(), 'heal')));   // 1.7.1: ливень усиливает Целебный дождь
  for (const t of soaked) setTileValue(t, t.value >= 5 ? 3 : 1);
  note(_t("Целебный дождь!"));
  SND.heal();

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
  SND.chaos();
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
  SND.chaos();
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
  SND.transmute();
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
  SND.transmute();
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
  SND.heal();
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
  SND.transmute();
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
  SND.transmute();
  const changed = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const t = grid[r][c];
    if (t && t.ti === from) changed.push({ r, c, tile: t });
  }
  logEvent(side, _t("{0}: Прилив — {1} «{2}» стали «{3}»", [fighters[side].name, _nn(changed.length, 'камень', 'камня', 'камней'), GEM_NAMES[GEM_TYPES[from]], GEM_NAMES[GEM_TYPES[to]]]));
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
  SND.heal();
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
  SND.fire();
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
  if (busy || over) return;                   // 1.6.5 (A2-16): ход уже идёт или бой окончен — второй вызов не запускает второе заклинание
  const kind = aimKind;
  if (!canAffordMagic('left', kind)) { stopAim(); note(_t("Не хватает камней на это заклинание")); tipOnce('short'); return; }
  stopTurnTimer();
  skipStreak = 0;                             // реальный ход — сбрасывает счётчик пропусков по таймеру
  busy = true;
  renderMagic();
  invalidStreak = 0;
  if (LIVE) LIVE.net.act({ k: 'cast', kind, i: cell.r * N + cell.c });
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
  if (LIVE) LIVE.net.act({ k: 'inst', kind });
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
  if (busy || over) return;                   // 1.6.5 (A2-16): то же для хода камнями
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
  if (LIVE) LIVE.net.act({ k: 'mv', a: a.r * N + a.c, b: b.r * N + b.c });
  const ok = await takeTurn('left', a, b);
  endPlayerAction();
  if (!ok) {
    invalidStreak++;
    const pen = Combat.invalidPenalty(fighters.left), lim = Balance.invalid.limit;
    dmgTag = 'pen';
    dealDamage('left', pen, true);
    logEvent('left', _t("Игрок: неверный ход, -{0} ХП ({1}/{2})", [pen, invalidStreak, lim]));
    flushTurnDamage();
    if (!TUT() && (invalidStreak >= lim || fighters.left.hp <= 0)) {
      defeat();
      return;                                   // busy остаётся true до новой игры
    }
    note(_t("Неверный ход: -{0} ХП ({1}/{2} подряд). Ход переходит к противнику", [pen, invalidStreak, lim]));
    tipOnce('wrong');
    await sleep(900);
    await passToEnemy();                        // неверный ход — очередь противника (и питомца)
    return;
  }
  invalidStreak = 0;
  if (TUT()) Tutorial.event('move');
  if (over) return;
  if (ok === 2) {                              // линия из 4+ камней — ходите ещё раз
    tipOnce('four');
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
  if (LIVE) { if (await liveRemoteTurn()) return; }
  else if (fighters.right.hp > 0) for (;;) {
    await sleep(RULES.timing.think);
    await enemyUseItems();

    const f = fighters.right;
    const v = Combat.aiView(f, fighters.left);          // ХП в «камнях» с учётом роста урона, Силы и Брони
    const mv = AI.choose(typOf(), valOf(), v.hpMe, v.hpOpp, softLevel(f.level), f.magic || softWins0() ? {} : affordability('right'),
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
        SND.lightning();
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
  for (const t of foeVeiled) t.el.classList.remove('veiled');
  foeVeiled.clear();
  if (!PET && Profile.data.monster && Profile.data.monster.deep) {   // «У дна»: под водой течение сковывает один столбец на ваш ход
    setLock(rnd(N), 'left');
    logEvent('right', _t("Течение: один столбец скован на ваш ход"));
  }
  // 1.7.3: Оглушение — герой пропускает ход, существо ходит ещё раз.
  if (fighters.left.stunned && !over) {
    fighters.left.stunned = false;
    rec.stuns++;
    showFloat('left', _t("Ход пропущен"), 'debuff');
    note(_t("Вы оглушены: ход пропущен"));
    logEvent('left', _t("{0}: оглушён, ход пропущен", [fighters.left.name]));
    await sleep(900);
    return enemyTurn();
  }
  // 1.7.3: Отрава существа — яд жжёт героя в начале его хода.
  if (await heroPoisonTick()) return;
  busy = false;
  setTurn('left');
}

// Яд на герое (приём Отрава): в начале хода героя теряет ХП, броня и Блок не помогают. true — бой окончен.
async function heroPoisonTick() {
  const f = fighters.left;
  if (!f.poison || !(f.poison.turns > 0) || f.hp <= 0 || over) return false;
  f.poison.turns--;
  showFloat('left', _t("Яд"), 'venom');
  dmgTag = 'poison';
  const dealt = dealDamage('left', f.poison.dmg, true, false);
  logEvent('right', _t("Яд: {0} теряет {1} ХП", [f.name, dealt]));
  flushTurnDamage();
  renderFighters(); renderMagic();
  await sleep(700);
  return checkEnd();
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

  const A = Balance.abilities;
  // Показ приёма существа (и свойства элитного/стража — тот же набор приёмов).
  const showAct = async (act) => {
  let acted = !!act;
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
      showFloat('left', _t("Смола"), 'debuff'); say(_t("Смола: заклинание на ваш следующий ход дороже на {0} каждого цвета", [_nn(act.extra, 'камень', 'камня', 'камней')])); renderMagic();
      break;
    case 'clone':
      showFloat('right', _t("Двойник!"), 'buff'); renderFighters(); renderMagic(); say(_t("Спороносец: из облака спор встаёт двойник с {0} ХП", [act.hp]));
      break;
    case 'stun':
      if (act.resisted) { rec.stunResist++; showFloat('left', _t("Устояли!"), 'block'); say(_t("Оглушение: вы устояли — Блок спас ход")); }
      else { showFloat('left', _t("Оглушены!"), 'debuff'); say(_t("Оглушение: вы пропустите свой следующий ход")); SND.growl(); }
      renderFighters();
      break;
    case 'toxin':
      showFloat('left', _t("Яд!"), 'venom'); say(_t("Отрава: в начале ваших ходов −{0} ХП, {1}", [act.dmg, `${act.turns} ${turnsWord(act.turns)}`])); renderFighters(); renderMagic();
      break;
    case 'ward':
      showFloat('right', _t("Щит +{0}", [act.amount]), 'buff'); say(_t("Щит: следующие {0} урона уйдут в щит", [act.amount])); renderFighters();
      break;
    case 'evasion':
      showFloat('right', _t("Изворотливость"), 'buff'); say(_t("Изворотливость: Блок выше на {0} ещё {1}", [act.amount, `${A.evasion.turns} ${turnsWord(A.evasion.turns)}`])); renderFighters();
      break;
    case 'retribution':
      showFloat('right', _t("Возмездие"), 'buff'); say(_t("Возмездие: Рикошет выше на {0} ещё {1}", [act.amount, `${A.retribution.turns} ${turnsWord(A.retribution.turns)}`])); renderFighters();
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
  return acted;
  };
  let acted = await showAct(Combat.monsterTurnStart(f, me, MAGIC_TYPES));
  if (over) return true;
  // 1.5.4: свойства элитного существа и стража — вторым действием в начале хода
  for (const ax of f.affixes || []) {
    if (acted) await sleep(450);
    const keep = f.ability;
    let a2 = null;
    f.ability = ax;
    try { a2 = Combat.monsterTurnStart(f, me, MAGIC_TYPES); } finally { f.ability = keep; }
    acted = (await showAct(a2)) || acted;
    if (over) return true;
  }
  const G = f.guardian && World.GUARDIANS[f.guardian];
  if (G && G.mech === 'pack' && f.hp > 0 && f.turnNo % World.PACK.every === 0) {
    if (acted) await sleep(450);
    showFloat('left', _t("Стая"), 'debuff');
    dmgTag = 'pack';
    const dealt = dealDamage('left', Math.max(1, Math.round(me.max * World.PACK.bite)), true, false);
    say(_t("Зов стаи: волки кусают на {0} ХП", [dealt]));
    flushTurnDamage(); renderFighters(); renderMagic();
    acted = true;
    await sleep(650);
    if (checkEnd()) return true;
  }
  if (G && G.mech === 'enrage' && !f.enraged && f.hp > 0 && f.hp <= f.max * World.ENRAGE.at) {
    f.enraged = true;
    f.dmg *= 1 + World.ENRAGE.power / 100;
    showFloat('right', _t("Ярость!"), 'buff');
    say(_t("Ярость дракона: урон +{0}% до конца боя", [World.ENRAGE.power]));
    acted = true;
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
  let step = 0;                                      // 1.8.9: номер шага каскада за ход (со 2-го — надпись и всё более высокий звук)
  while (bon) {
    step++;
    const bumped = new Set();
    let dmg = 0, maxBonus = 1, charge = 0;
    const home = facOn(side) && factionOf(side) ? factionOf(side).gem : null;
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
      // только ресурсы (так задумано: взрыв собирает соседей в копилку, но «боевой
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
    SND.match(cleared, maxBonus, step);
    if (step >= 2) showFloat(side, _t("Каскад ×{0}", [step]), 'cascade');
    if (has5) { const bd = document.getElementById('board'); if (bd) { bd.classList.add('flash5'); setTimeout(() => bd.classList.remove('flash5'), 450); } }
    if (maxBonus > 1) { extra = true; note(_t("Бонус x{0}! Дополнительный ход", [maxBonus])); }
    // Линия ровно из 5 камней (бонус x3, см. Engine.bonusFor) копится в счётчик медалей игрока
    // (см. js/medals.js) — вехи считаются по всем боям сразу, не по одному бою.
    if (side === 'left' && has5 && !isTraining() && !PET) {
      const medal = Profile.registerFiveStreak(Hero.tierFor(Profile.level()));
      if (medal) note(_t("<b class=\"lvlup\">Медаль!</b> {0}", [Medals.nameFor(medal.id)]));
    }
    renderCounters(side, [...bumped]);
    if (charge) addCharge(charge, side);
    // Споры Дикого гриба: всё, что он собрал за проход (номинал × бонус линии), — см. Combat.addSpores.
    if (side === 'right' && f.ability === 'clone') {
      let got = 0;
      for (let i = 0; i < N * N; i++) if (bon[i]) got += grid[Math.floor(i / N)][i % N].value * bon[i];
      Combat.addSpores(f, got);
      renderBadge('right');
    }
    turnStats.dmg += dealDamage(target, f.magic ? Math.round(dmg * Balance.magic.lightning.mult * Sky.spellMul(selNow(), 'lightning')) : dmg);
    await sleep(RULES.timing.clear);

    for (let i = 0; i < N * N; i++) {
      if (!bon[i]) continue;
      const r = Math.floor(i / N), c = i % N;
      grid[r][c].el.remove();
      grid[r][c] = null;
    }
    if (sideDown(target) || sideDown(side)) { gravityDown(); shiftRight(); return extra; }   // бой окончен (в т. ч. рикошетом); 1.5.0: камни не зависают

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
    } else if (boardEl) {                       // 1.8.4: ход в пустую клетку — подсвечиваем и её (раньше светился только один камень)
      const g = document.createElement('div');
      g.className = 'hint-ghost';
      g.style.transform = `translate(${(i % N) * 100}%, ${Math.floor(i / N) * 100}%)`;
      boardEl.appendChild(g);
      setTimeout(() => g.remove(), 2500);
    }
  }
  note(_t("Подсказка: этот обмен собирает камни"));
}
$('hint').addEventListener('click', showHint);

const muteBtn = $('mute');
const renderMute = () => {
  muteBtn.classList.toggle('off', !!SND.muted); muteBtn.textContent = SND.muted ? _t("Звук: выкл") : _t("Звук: вкл");
  muteBtn.setAttribute('aria-label', muteBtn.textContent); muteBtn.setAttribute('aria-pressed', String(!!SND.muted));   // 1.6.4 (WIP-05): состояние слышно и скринридеру
};
muteBtn.addEventListener('click', () => { SND.setMuted(!SND.muted); renderMute(); SND.swap(); });
renderMute();

// Оформление экрана боя — «колонки» (раньше были ещё «1» и «2», убраны в 1.5.2): бронзовая облицовка (класс ui-modern), плюс
// своя раскладка (класс ui-columns): герой | столбец заклинаний | поле | столбец противника | противник,
// ранец под полем. Раскладка целиком в CSS; game.js только рисует столбец противника (renderEnemyColumn).

// 1.5.2: подгонка высоты. Поле берёт высоту окна минус «обвязка» (--chrome, на телефоне и планшете — свои числа), но
// обвязка зависит от экрана, оформления, полосы сверху и числа рядов ранца, поэтому заранее её не угадать. Меряем, на
// сколько страница выше окна, и уменьшаем сторону поля (--board; от неё считаются и кнопки заклинаний, и столбцы), пока
// нижний ряд кнопок не окажется на экране. Если уменьшение ничего не даёт, возвращаем как было.
let fitBusy = false;
function fitBattleHeight() {
  if (!host.main || fitBusy) return;
  const b = document.body;
  fitBusy = true;
  try {
    b.style.removeProperty('--board');
    if (!b.classList.contains('mode-battle') || !b.classList.contains('ui-columns')) return;   // прежние оформления 1 и 2 — длинная страница с прокруткой, их не трогаем
    const H = () => Math.max(document.documentElement.scrollHeight, b.scrollHeight);
    let ov = H() - window.innerHeight;
    if (ov <= 0) return;
    const start = boardEl.getBoundingClientRect().width;
    let size = start;
    for (let i = 0; i < 4 && ov > 0; i++) {
      size = Math.max(150, size - ov - 1);
      b.style.setProperty('--board', size + 'px');
      const now = H() - window.innerHeight;
      if (now >= ov) { b.style.removeProperty('--board'); return; }   // не помогло
      ov = now;
    }
  } finally { fitBusy = false; }
}
if (host.main) {
  let fitT = 0;
  const later = () => { clearTimeout(fitT); fitT = setTimeout(fitBattleHeight, 120); };
  window.addEventListener('resize', later); window.addEventListener('orientationchange', later);
  document.addEventListener('fullscreenchange', later); document.addEventListener('webkitfullscreenchange', later);
  window.addEventListener('load', later);
}
// 1.5.2: оформления «1» и «2» убраны, остались «колонки» (прежнее «3») — единственное оформление боя.
// Профиль по-прежнему хранит поле ui, но оно не используется; старые сохранения открываются так же.
function renderUiSkin() {
  document.body.classList.add('ui-modern', 'ui-columns');
  // 1.7.6: фон боя — лесная поляна (ui/bg-battle), панели заклинаний и сумки — кожаная панель (ui/panel); картинки лежали без дела
  try {
    if (typeof Art !== 'undefined') {
      if (Art.has('ui/bg-battle')) document.body.style.setProperty('--battle-bg', `url('${new URL(Art.url('ui/bg-battle'), location.href).href}')`);
      if (Art.has('ui/panel')) document.body.style.setProperty('--panel-img', `url('${new URL(Art.url('ui/panel'), location.href).href}')`);
    }
  } catch (e) { /* без картинок остаётся цветной фон */ }
  renderEnemyColumn();
  if (host.main) setTimeout(fitBattleHeight, 0);
}
renderUiSkin();

// Настройки для проверки баланса. ХП теперь задают уровень героя и цвет существа; ручная правка ХП
// действует только в текущем бою и не сохраняется.
const SETTINGS_KEY = 'gem-match-settings';
function saveSettings() { /* ничего не сохраняем между запусками */ }
function loadSettings() {
  try { localStorage.removeItem(SETTINGS_KEY); } catch (e) { /* без хранилища */ }
}

$('gear').addEventListener('click', () => Inventory.open('left'));
$('bestiary').addEventListener('click', () => Screens.openBestiary());
$('credits').addEventListener('click', () => Screens.openCredits());

// Новый бой с выбранным в бестиарии противником.
function startBattle() { if (!busy || over) startGame(); }
boardEl.addEventListener('pointerleave', () => { if (aiming) hideCross(); });
// 1.5.5: горячие клавиши боя (по коду клавиши — работают и в русской раскладке): H — подсказка, I — сумка, B — бестиарий, 1–9 и 0 — заклинания по порядку.
if (host.main) document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (!document.body.classList.contains('mode-battle') || document.querySelector('.modal, .overlay')) return;
  const c = e.code, press = (id) => { const b = $(id); if (b && !b.disabled) { e.preventDefault(); b.click(); } };
  if (c === 'KeyH') return document.body.classList.contains('no-hint') ? undefined : press('hint');
  if (c === 'KeyI') return press('gear');
  if (c === 'KeyB') return press('bestiary');
  const m = /^Digit(\d)$/.exec(c);
  if (m) { const b = spellbarEl.children[(Number(m[1]) + 9) % 10]; if (b && !b.disabled && b.offsetParent) { e.preventDefault(); b.click(); } }
});
// 1.5.9: долгое нажатие на заклинание или предмет (сенсорный экран) показывает описание — всплывающая подсказка title на телефоне и планшете не видна
(function longPressTips() {
  try {
  let pop = document.querySelector('.lp-tip');
  if (!pop) { pop = document.createElement('div'); pop.className = 'lp-tip'; pop.hidden = true; document.body.appendChild(pop); }
  const HOLD = 450;
  let timer = null, hideT = null, swallow = false, sx = 0, sy = 0;
  const hide = () => { pop.hidden = true; clearTimeout(hideT); };
  for (const box of [spellbarEl, bagEl].filter((x) => x && typeof x.addEventListener === 'function')) {
    box.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const b = e.target.closest('button[title]');
      if (!b || !b.title) return;
      hide(); sx = e.clientX; sy = e.clientY; clearTimeout(timer);
      timer = setTimeout(() => {
        pop.textContent = b.title; pop.hidden = false; swallow = true;
        const r = b.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
        pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
        pop.style.top = (r.top - h - 10 < 8 ? r.bottom + 10 : r.top - h - 10) + 'px';
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (er) { /* не страшно */ } }
      }, HOLD);
    });
    const end = () => { clearTimeout(timer); if (!pop.hidden) { clearTimeout(hideT); hideT = setTimeout(hide, 3000); } };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
    box.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 12) clearTimeout(timer); });
    box.addEventListener('contextmenu', (e) => { if (e.pointerType !== 'mouse') e.preventDefault(); });
    box.addEventListener('click', (e) => { if (swallow) { swallow = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  }
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !e.target.closest('.magic, .bagitem')) hide(); }, true);
  } catch (err) { /* подсказки по долгому нажатию — не критично */ }
})();
if (host.main) document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && aiming) { stopAim(); note(_t("Ваш ход")); }
});

// «Отступить»: уйти с поля боя на карту (награды нет, существо остаётся). Нужно подтверждение.
let fleeArmed = null;
const restartBtn = $('restart');
restartBtn.addEventListener('click', () => {
  const duoOn = !!(host.coord && host.coord.on());
  if (over && !duoOn) return MapView.returnFromBattle(Combat.enemyDefeated(fighters.right) ? 'win' : 'loss');
  if (busy && !duoOn && !LIVE) return;
  if (!fleeArmed) {
    restartBtn.textContent = _t("Точно отступить?");
    restartBtn.classList.add('armed');
    fleeArmed = setTimeout(() => { restartBtn.textContent = _t("Отступить"); restartBtn.classList.remove('armed'); fleeArmed = null; }, 2500);
    return;
  }
  clearTimeout(fleeArmed);
  fleeArmed = null;
  restartBtn.textContent = _t("Отступить");
  restartBtn.classList.remove('armed');
  stopTurnTimer();
  if (LIVE && !LIVE.reported) { LIVE.reported = true; LIVE.net.forfeit(); }    // сдаться живому сопернику — поражение
  if (duoOn) host.coord.flee();                    // награда за уже убитых противников — и при отступлении
  const fled = host.main ? Profile.battleEnd('flee', { noWear: tourneyFight() }) : null;      // 1.6.6: сдача после первого хода — поражение (−1 прочность); до первого хода — просто уход
  MapView.returnFromBattle('flee');
  if (fled) Profile.huntLoss();
  if (fled && fled.worn) setTimeout(() => MapView.toast(_t("Отступление после первого хода — поражение: прочность надетых вещей −1") + (fled.broken.length ? _t(". Сломались: {0}", [fled.broken.join(', ')]) : '')), 700);
});

// Полноэкранный режим. Где браузер не умеет (например, iPhone Safari) — запасной режим:
// страница занимает всё окно. Ещё удобнее добавить игру на главный экран: она откроется без панелей браузера.
const fsBtn = $('fullscreen');
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
if (host.main) document.addEventListener('fullscreenchange', renderFs);
if (host.main) document.addEventListener('webkitfullscreenchange', renderFs);
if (host.main) document.addEventListener('keydown', (e) => {
  if ((e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') && !/INPUT|TEXTAREA/.test(e.target.tagName)) toggleFullscreen();
});
renderFs();

// Телефон (1.4.9): пиктограммы вместо кнопок, редкие кнопки — в меню ☰
if (host.main) {
  const moreBtn = $('more'), moreMenu = $('more-menu');
  const phoneMq = () => {
    const small = Math.min(window.innerWidth, window.innerHeight) <= 520 && matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('phone', small || (typeof location !== 'undefined' && /[?&]phone\b/.test(location.search)));
  };
  phoneMq(); window.addEventListener('resize', phoneMq); window.addEventListener('orientationchange', phoneMq);
  moreBtn.addEventListener('click', (e) => { e.stopPropagation(); moreMenu.hidden = !moreMenu.hidden; });
  document.addEventListener('click', (e) => { if (!moreMenu.hidden && !moreMenu.contains(e.target)) moreMenu.hidden = true; });
  moreMenu.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-do]'); if (!b) return;
    moreMenu.hidden = true;
    if (b.dataset.do === 'log') { const d = $('log-wrap'); d.open = !d.open; d.scrollIntoView({ block: 'nearest' }); }
    else if (b.dataset.do === 'anim') { AnimSpeed.cycle(); b.textContent = AnimSpeed.label(); note(AnimSpeed.label()); }     // 1.6.4
    else if (b.dataset.do === 'timer') { TurnTimerSetting.toggle(); note(TurnTimerSetting.label()); }     // 1.6.5
    else $(b.dataset.do).click();
  });
  const animBtn = moreMenu.querySelector('[data-do=anim]'); if (animBtn) animBtn.textContent = AnimSpeed.label();
  // 1.6.5: настройка «Таймер хода» — в меню ☰ (телефон) и кнопкой внизу (компьютер); подписи следят за настройкой, где бы её ни переключили
  const timerMenuBtn = moreMenu.querySelector('[data-do=timer]'), timerBtn = $('timer-btn');
  const renderTimerBtns = () => {
    if (timerMenuBtn) timerMenuBtn.textContent = TurnTimerSetting.label();
    if (timerBtn) { timerBtn.textContent = TurnTimerSetting.short(); timerBtn.classList.toggle('off', !TurnTimerSetting.on); timerBtn.setAttribute('aria-pressed', String(TurnTimerSetting.on)); timerBtn.setAttribute('aria-label', TurnTimerSetting.label()); }
  };
  renderTimerBtns(); window.addEventListener('turn-timer-changed', renderTimerBtns);
  if (timerBtn) timerBtn.addEventListener('click', () => { TurnTimerSetting.toggle(); note(TurnTimerSetting.label()); });
  if (!(rootEl.requestFullscreen || rootEl.webkitRequestFullscreen)) moreMenu.querySelector('[data-do=fullscreen]').remove();   // iOS
}

  return Object.defineProperties({}, {
  BUFF_NAMES: { get: () => BUFF_NAMES, enumerable: true, configurable: true },
  CHARGE: { get: () => CHARGE, enumerable: true, configurable: true },
  CLONE_NAME: { get: () => CLONE_NAME, enumerable: true, configurable: true },
  EC_BUFFS: { get: () => EC_BUFFS, enumerable: true, configurable: true },
  EC_GLYPH: { get: () => EC_GLYPH, enumerable: true, configurable: true },
  FIRE_RADIUS: { get: () => FIRE_RADIUS, enumerable: true, configurable: true },
  INSTANT_CASTERS: { get: () => INSTANT_CASTERS, enumerable: true, configurable: true },
  MAGICS: { get: () => MAGICS, enumerable: true, configurable: true },
  PET: { get: () => PET, enumerable: true, configurable: true },
  PET_ABILITY_INT: { get: () => PET_ABILITY_INT, enumerable: true, configurable: true },
  PET_FX: { get: () => PET_FX, enumerable: true, configurable: true },
  PET_SKILL_CD: { get: () => PET_SKILL_CD, enumerable: true, configurable: true },
  SETTINGS_KEY: { get: () => SETTINGS_KEY, enumerable: true, configurable: true },
  TUT: { get: () => TUT, enumerable: true, configurable: true },
  WEAPON_PERK_NAMES: { get: () => WEAPON_PERK_NAMES, enumerable: true, configurable: true },
  addCharge: { get: () => addCharge, enumerable: true, configurable: true },
  adjacent: { get: () => adjacent, enumerable: true, configurable: true },
  adoptFoe: { get: () => adoptFoe, enumerable: true, configurable: true },
  affordability: { get: () => affordability, enumerable: true, configurable: true },
  afterPlayerSpell: { get: () => afterPlayerSpell, enumerable: true, configurable: true },
  afterSpell: { get: () => afterSpell, enumerable: true, configurable: true },
  aimCell: { get: () => aimCell, set: (v) => { aimCell = v; }, enumerable: true, configurable: true },
  aimKind: { get: () => aimKind, set: (v) => { aimKind = v; }, enumerable: true, configurable: true },
  aiming: { get: () => aiming, set: (v) => { aiming = v; }, enumerable: true, configurable: true },
  ammoDisabled: { get: () => ammoDisabled, enumerable: true, configurable: true },
  announceNewSpells: { get: () => announceNewSpells, enumerable: true, configurable: true },
  anyMagicAffordable: { get: () => anyMagicAffordable, enumerable: true, configurable: true },
  applyCunning: { get: () => applyCunning, enumerable: true, configurable: true },
  applyFaction: { get: () => applyFaction, enumerable: true, configurable: true },
  applyLevel: { get: () => applyLevel, enumerable: true, configurable: true },
  attemptSwap: { get: () => attemptSwap, enumerable: true, configurable: true },
  autoLevel: { get: () => autoLevel, set: (v) => { autoLevel = v; }, enumerable: true, configurable: true },
  autoPending: { get: () => autoPending, set: (v) => { autoPending = v; }, enumerable: true, configurable: true },
  autoTurn: { get: () => autoTurn, enumerable: true, configurable: true },
  autopilot: { get: () => autopilot, set: (v) => { autopilot = v; }, enumerable: true, configurable: true },
  bagDisabled: { get: () => bagDisabled, enumerable: true, configurable: true },
  bagEl: { get: () => bagEl, enumerable: true, configurable: true },
  beaverPortrait: { get: () => beaverPortrait, enumerable: true, configurable: true },
  beaverTip: { get: () => beaverTip, set: (v) => { beaverTip = v; }, enumerable: true, configurable: true },
  boardEl: { get: () => boardEl, enumerable: true, configurable: true },
  boardRand: { get: () => boardRand, set: (v) => { boardRand = v; }, enumerable: true, configurable: true },
  brief: { get: () => brief, enumerable: true, configurable: true },
  buffPower: { get: () => buffPower, enumerable: true, configurable: true },
  buildBoard: { get: () => buildBoard, enumerable: true, configurable: true },
  buildFighter: { get: () => buildFighter, enumerable: true, configurable: true },
  buildSpellbar: { get: () => buildSpellbar, enumerable: true, configurable: true },
  busy: { get: () => busy, set: (v) => { busy = v; }, enumerable: true, configurable: true },
  canAffordMagic: { get: () => canAffordMagic, enumerable: true, configurable: true },
  canEditGear: { get: () => canEditGear, enumerable: true, configurable: true },
  castChaos: { get: () => castChaos, enumerable: true, configurable: true },
  castChaosArea: { get: () => castChaosArea, enumerable: true, configurable: true },
  castDivination: { get: () => castDivination, enumerable: true, configurable: true },
  castFire: { get: () => castFire, enumerable: true, configurable: true },
  castFury: { get: () => castFury, enumerable: true, configurable: true },
  castGrowth: { get: () => castGrowth, enumerable: true, configurable: true },
  castHeal: { get: () => castHeal, enumerable: true, configurable: true },
  castMirror: { get: () => castMirror, enumerable: true, configurable: true },
  castSacrifice: { get: () => castSacrifice, enumerable: true, configurable: true },
  castStrike: { get: () => castStrike, enumerable: true, configurable: true },
  castTide: { get: () => castTide, enumerable: true, configurable: true },
  castTransmute: { get: () => castTransmute, enumerable: true, configurable: true },
  cellFromEvent: { get: () => cellFromEvent, enumerable: true, configurable: true },
  checkEnd: { get: () => checkEnd, enumerable: true, configurable: true },
  chooseFaction: { get: () => chooseFaction, enumerable: true, configurable: true },
  clearLocks: { get: () => clearLocks, enumerable: true, configurable: true },
  clearSelection: { get: () => clearSelection, enumerable: true, configurable: true },
  clearVeils: { get: () => clearVeils, enumerable: true, configurable: true },
  cloneEl: { get: () => cloneEl, enumerable: true, configurable: true },
  cloneTurn: { get: () => cloneTurn, enumerable: true, configurable: true },
  createTile: { get: () => createTile, enumerable: true, configurable: true },
  dealDamage: { get: () => dealDamage, enumerable: true, configurable: true },
  defeat: { get: () => defeat, enumerable: true, configurable: true },
  drag: { get: () => drag, set: (v) => { drag = v; }, enumerable: true, configurable: true },
  ecSvg: { get: () => ecSvg, enumerable: true, configurable: true },
  elxArm: { get: () => elxArm, enumerable: true, configurable: true },
  elxBadgeKey: { get: () => elxBadgeKey, set: (v) => { elxBadgeKey = v; }, enumerable: true, configurable: true },
  elxFire: { get: () => elxFire, enumerable: true, configurable: true },
  useElixir: { get: () => useElixir, enumerable: true, configurable: true },
  elxWhy: { get: () => elxWhy, enumerable: true, configurable: true },
  openElxMenu: { get: () => openElxMenu, enumerable: true, configurable: true },
  elxImmune: { get: () => elxImmune, enumerable: true, configurable: true },
  elxMark: { get: () => elxMark, enumerable: true, configurable: true },
  elxSide: { get: () => elxSide, enumerable: true, configurable: true },
  elxTier: { get: () => elxTier, enumerable: true, configurable: true },
  endPlayerAction: { get: () => endPlayerAction, enumerable: true, configurable: true },
  enemyBag: { get: () => enemyBag, enumerable: true, configurable: true },
  enemyColEl: { get: () => enemyColEl, enumerable: true, configurable: true },
  enemyTurn: { get: () => enemyTurn, enumerable: true, configurable: true },
  enemyTurnStart: { get: () => enemyTurnStart, enumerable: true, configurable: true },
  enemyUseItems: { get: () => enemyUseItems, enumerable: true, configurable: true },
  enterBattle: { get: () => enterBattle, enumerable: true, configurable: true },
  fEl: { get: () => fEl, enumerable: true, configurable: true },
  fighters: { get: () => fighters, enumerable: true, configurable: true },
  fillEmpty: { get: () => fillEmpty, enumerable: true, configurable: true },
  finishAction: { get: () => finishAction, enumerable: true, configurable: true },
  finishBoard: { get: () => finishBoard, enumerable: true, configurable: true },
  fitBattleHeight: { get: () => fitBattleHeight, enumerable: true, configurable: true },
  fitBusy: { get: () => fitBusy, set: (v) => { fitBusy = v; }, enumerable: true, configurable: true },
  fleeArmed: { get: () => fleeArmed, set: (v) => { fleeArmed = v; }, enumerable: true, configurable: true },
  flushTurnDamage: { get: () => flushTurnDamage, enumerable: true, configurable: true },
  foeVeiled: { get: () => foeVeiled, enumerable: true, configurable: true },
  fsActive: { get: () => fsActive, enumerable: true, configurable: true },
  fsBtn: { get: () => fsBtn, enumerable: true, configurable: true },
  furyState: { get: () => furyState, enumerable: true, configurable: true },
  grantDuoRewards: { get: () => grantDuoRewards, enumerable: true, configurable: true },
  grantRewards: { get: () => grantRewards, enumerable: true, configurable: true },
  grantRewardsBase: { get: () => grantRewardsBase, enumerable: true, configurable: true },
  gravityDown: { get: () => gravityDown, enumerable: true, configurable: true },
  grid: { get: () => grid, set: (v) => { grid = v; }, enumerable: true, configurable: true },
  growthBody: { get: () => growthBody, enumerable: true, configurable: true },
  hasMatches: { get: () => hasMatches, enumerable: true, configurable: true },
  hideCross: { get: () => hideCross, enumerable: true, configurable: true },
  hideOverlay: { get: () => hideOverlay, enumerable: true, configurable: true },
  inBattle: { get: () => inBattle, set: (v) => { inBattle = v; }, enumerable: true, configurable: true },
  invalidStreak: { get: () => invalidStreak, set: (v) => { invalidStreak = v; }, enumerable: true, configurable: true },
  isArena: { get: () => isArena, enumerable: true, configurable: true },
  isChallenge: { get: () => isChallenge, enumerable: true, configurable: true },
  isEmptyBoard: { get: () => isEmptyBoard, enumerable: true, configurable: true },
  isLocked: { get: () => isLocked, enumerable: true, configurable: true },
  isTraining: { get: () => isTraining, enumerable: true, configurable: true },
  itemColor: { get: () => itemColor, enumerable: true, configurable: true },
  kickAuto: { get: () => kickAuto, enumerable: true, configurable: true },
  leaveBattle: { get: () => leaveBattle, enumerable: true, configurable: true },
  loadSettings: { get: () => loadSettings, enumerable: true, configurable: true },
  lockedCells: { get: () => lockedCells, enumerable: true, configurable: true },
  locks: { get: () => locks, set: (v) => { locks = v; }, enumerable: true, configurable: true },
  logEvent: { get: () => logEvent, enumerable: true, configurable: true },
  logTurn: { get: () => logTurn, enumerable: true, configurable: true },
  loseHp: { get: () => loseHp, enumerable: true, configurable: true },
  magicCostOf: { get: () => magicCostOf, enumerable: true, configurable: true },
  makesLine: { get: () => makesLine, enumerable: true, configurable: true },
  monsterAbility: { get: () => monsterAbility, enumerable: true, configurable: true },
  moves: { get: () => moves, set: (v) => { moves = v; }, enumerable: true, configurable: true },
  movesEl: { get: () => movesEl, enumerable: true, configurable: true },
  muteBtn: { get: () => muteBtn, enumerable: true, configurable: true },
  note: { get: () => note, enumerable: true, configurable: true },
  noteTimer: { get: () => noteTimer, set: (v) => { noteTimer = v; }, enumerable: true, configurable: true },
  onEconomyChanged: { get: () => onEconomyChanged, enumerable: true, configurable: true },
  onGearChanged: { get: () => onGearChanged, enumerable: true, configurable: true },
  onRevived: { get: () => onRevived, enumerable: true, configurable: true },
  onTurnTimeout: { get: () => onTurnTimeout, enumerable: true, configurable: true },
  other: { get: () => other, enumerable: true, configurable: true },
  over: { get: () => over, set: (v) => { over = v; }, enumerable: true, configurable: true },
  passToEnemy: { get: () => passToEnemy, enumerable: true, configurable: true },
  pet: { get: () => pet, set: (v) => { pet = v; }, enumerable: true, configurable: true },
  petAbility: { get: () => petAbility, enumerable: true, configurable: true },
  petAlive: { get: () => petAlive, enumerable: true, configurable: true },
  petEl: { get: () => petEl, enumerable: true, configurable: true },
  petFell: { get: () => petFell, set: (v) => { petFell = v; }, enumerable: true, configurable: true },
  petFx: { get: () => petFx, enumerable: true, configurable: true },
  petName: { get: () => petName, enumerable: true, configurable: true },
  petPortrait: { get: () => petPortrait, enumerable: true, configurable: true },
  petPrank: { get: () => petPrank, set: (v) => { petPrank = v; }, enumerable: true, configurable: true },
  petTurn: { get: () => petTurn, enumerable: true, configurable: true },
  placeTile: { get: () => placeTile, enumerable: true, configurable: true },
  playerCast: { get: () => playerCast, enumerable: true, configurable: true },
  playerFaction: { get: () => playerFaction, enumerable: true, configurable: true },
  playerInstant: { get: () => playerInstant, enumerable: true, configurable: true },
  playerMove: { get: () => playerMove, enumerable: true, configurable: true },
  portraitOf: { get: () => portraitOf, enumerable: true, configurable: true },
  prankSwap: { get: () => prankSwap, enumerable: true, configurable: true },
  quickReward: { get: () => quickReward, enumerable: true, configurable: true },
  recalcStats: { get: () => recalcStats, enumerable: true, configurable: true },
  refillBoard: { get: () => refillBoard, enumerable: true, configurable: true },
  refreshEnemyGear: { get: () => refreshEnemyGear, enumerable: true, configurable: true },
  renderAvatar: { get: () => renderAvatar, enumerable: true, configurable: true },
  renderBadge: { get: () => renderBadge, enumerable: true, configurable: true },
  renderBag: { get: () => renderBag, enumerable: true, configurable: true },
  renderClonePanel: { get: () => renderClonePanel, enumerable: true, configurable: true },
  renderCounters: { get: () => renderCounters, enumerable: true, configurable: true },
  renderElxBadges: { get: () => renderElxBadges, enumerable: true, configurable: true },
  renderEnemyColumn: { get: () => renderEnemyColumn, enumerable: true, configurable: true },
  renderFactionButton: { get: () => renderFactionButton, enumerable: true, configurable: true },
  renderFighters: { get: () => renderFighters, enumerable: true, configurable: true },
  renderFs: { get: () => renderFs, enumerable: true, configurable: true },
  renderGear: { get: () => renderGear, enumerable: true, configurable: true },
  renderLocks: { get: () => renderLocks, enumerable: true, configurable: true },
  renderMagic: { get: () => renderMagic, enumerable: true, configurable: true },
  renderMute: { get: () => renderMute, enumerable: true, configurable: true },
  renderPetPanel: { get: () => renderPetPanel, enumerable: true, configurable: true },
  renderTurnTimer: { get: () => renderTurnTimer, enumerable: true, configurable: true },
  renderUiSkin: { get: () => renderUiSkin, enumerable: true, configurable: true },
  renderWallet: { get: () => renderWallet, enumerable: true, configurable: true },
  resolveBoard: { get: () => resolveBoard, enumerable: true, configurable: true },
  restartBtn: { get: () => restartBtn, enumerable: true, configurable: true },
  resumeAfterAdopt: { get: () => resumeAfterAdopt, enumerable: true, configurable: true },
  whenIdle: { get: () => whenIdle, enumerable: true, configurable: true },
  rewardFor: { get: () => rewardFor, enumerable: true, configurable: true },
  rewarded: { get: () => rewarded, set: (v) => { rewarded = v; }, enumerable: true, configurable: true },
  rootEl: { get: () => rootEl, enumerable: true, configurable: true },
  rotateHint: { get: () => rotateHint, enumerable: true, configurable: true },
  runeHammer: { get: () => runeHammer, enumerable: true, configurable: true },
  saveSettings: { get: () => saveSettings, enumerable: true, configurable: true },
  selNow: { get: () => selNow, enumerable: true, configurable: true },
  selected: { get: () => selected, set: (v) => { selected = v; }, enumerable: true, configurable: true },
  setAutopilot: { get: () => setAutopilot, enumerable: true, configurable: true },
  setBeaverTip: { get: () => setBeaverTip, enumerable: true, configurable: true },
  setLock: { get: () => setLock, enumerable: true, configurable: true },
  setPos: { get: () => setPos, enumerable: true, configurable: true },
  setTileValue: { get: () => setTileValue, enumerable: true, configurable: true },
  setTurn: { get: () => setTurn, enumerable: true, configurable: true },
  setupEnemy: { get: () => setupEnemy, enumerable: true, configurable: true },
  setupPet: { get: () => setupPet, enumerable: true, configurable: true },
  setupShadow: { get: () => setupShadow, enumerable: true, configurable: true },
  setupTrainerBeaver: { get: () => setupTrainerBeaver, enumerable: true, configurable: true },
  shake: { get: () => shake, enumerable: true, configurable: true },
  shiftRight: { get: () => shiftRight, enumerable: true, configurable: true },
  shotKilledMonster: { get: () => shotKilledMonster, set: (v) => { shotKilledMonster = v; }, enumerable: true, configurable: true },
  showCenterPop: { get: () => showCenterPop, enumerable: true, configurable: true },
  showCross: { get: () => showCross, enumerable: true, configurable: true },
  showDamage: { get: () => showDamage, enumerable: true, configurable: true },
  showFloat: { get: () => showFloat, enumerable: true, configurable: true },
  showHint: { get: () => showHint, enumerable: true, configurable: true },
  showOverlay: { get: () => showOverlay, enumerable: true, configurable: true },
  sideDown: { get: () => sideDown, enumerable: true, configurable: true },
  spawnFilled: { get: () => spawnFilled, enumerable: true, configurable: true },
  specialDone: { get: () => specialDone, set: (v) => { specialDone = v; }, enumerable: true, configurable: true },
  specialResult: { get: () => specialResult, enumerable: true, configurable: true },
  spellDisabled: { get: () => spellDisabled, enumerable: true, configurable: true },
  spellIconHtml: { get: () => spellIconHtml, enumerable: true, configurable: true },
  spellOpen: { get: () => spellOpen, enumerable: true, configurable: true },
  spellbarEl: { get: () => spellbarEl, enumerable: true, configurable: true },
  spendMagic: { get: () => spendMagic, enumerable: true, configurable: true },
  startBattle: { get: () => startBattle, enumerable: true, configurable: true },
  startGame: { get: () => startGame, enumerable: true, configurable: true },
  startPetGame: { get: () => startPetGame, enumerable: true, configurable: true },
  startTurnTimer: { get: () => startTurnTimer, enumerable: true, configurable: true },
  statusEl: { get: () => statusEl, enumerable: true, configurable: true },
  stopAim: { get: () => stopAim, enumerable: true, configurable: true },
  stopTurnTimer: { get: () => stopTurnTimer, enumerable: true, configurable: true },
  strikeKilledMonster: { get: () => strikeKilledMonster, set: (v) => { strikeKilledMonster = v; }, enumerable: true, configurable: true },
  swapCells: { get: () => swapCells, enumerable: true, configurable: true },
  takeTurn: { get: () => takeTurn, enumerable: true, configurable: true },
  testMult: { get: () => testMult, enumerable: true, configurable: true },
  timerEl: { get: () => timerEl, enumerable: true, configurable: true },
  toggleAim: { get: () => toggleAim, enumerable: true, configurable: true },
  toggleFullscreen: { get: () => toggleFullscreen, enumerable: true, configurable: true },
  toggleMagic: { get: () => toggleMagic, enumerable: true, configurable: true },
  turnDamage: { get: () => turnDamage, set: (v) => { turnDamage = v; }, enumerable: true, configurable: true },
  turnEvents: { get: () => turnEvents, set: (v) => { turnEvents = v; }, enumerable: true, configurable: true },
  turnSide: { get: () => turnSide, set: (v) => { turnSide = v; }, enumerable: true, configurable: true },
  turnStats: { get: () => turnStats, set: (v) => { turnStats = v; }, enumerable: true, configurable: true },
  turnTimerHandle: { get: () => turnTimerHandle, set: (v) => { turnTimerHandle = v; }, enumerable: true, configurable: true },
  turnTimerLeft: { get: () => turnTimerLeft, set: (v) => { turnTimerLeft = v; }, enumerable: true, configurable: true },
  turnsWord: { get: () => turnsWord, enumerable: true, configurable: true },
  typOf: { get: () => typOf, enumerable: true, configurable: true },
  updatePetSkill: { get: () => updatePetSkill, enumerable: true, configurable: true },
  useAmmo: { get: () => useAmmo, enumerable: true, configurable: true },
  useConsumable: { get: () => useConsumable, enumerable: true, configurable: true },
  useFactionAbility: { get: () => useFactionAbility, enumerable: true, configurable: true },
  usePetSkill: { get: () => usePetSkill, enumerable: true, configurable: true },
  valOf: { get: () => valOf, enumerable: true, configurable: true },
  veil: { get: () => veil, enumerable: true, configurable: true },
  veiled: { get: () => veiled, enumerable: true, configurable: true },
  liveBegin: { get: () => liveBegin, enumerable: true, configurable: true },
  liveHash: { get: () => liveHash, enumerable: true, configurable: true },
  liveActive: { get: () => !!LIVE, enumerable: true, configurable: true },
  wispBlocks: { get: () => wispBlocks, enumerable: true, configurable: true }
  });
}
const BATTLE_TEMPLATE = (typeof document !== 'undefined' && document.querySelector('main.game')) ? document.querySelector('main.game').cloneNode(true) : null;
const MAIN_HOST = { main: true, id: 'hero', root: (typeof document !== 'undefined' && document.querySelector('main.game')) || document };
const MAIN_BATTLE = createBattle(MAIN_HOST);
Object.defineProperties(globalThis, Object.getOwnPropertyDescriptors(MAIN_BATTLE));

/* ---------- Бой вдвоём: два поля одновременно (1.4.8) ----------
   Герой дерётся со своим противником на основном поле, питомец — с точной копией того же противника на втором
   (createBattle с role 'pet'). Питомца ведёт ИИ с «умом» из его опыта (Pets.intellect); игрок может переключиться
   на вкладку «Питомец» и взять его под себя («Играть за питомца») — тогда героя ведёт ИИ на полную силу.
   Итог подводит Duo: убитые противники дают награду при победе, поражении и отступлении; если один из наших пал,
   а другой выжил, выживший добивает оставшегося противника на своём поле. */
const Duo = (() => {
  let petB = null, petHost = null, bar = null, tick = null, st = null;
  const M = () => MAIN_BATTLE;
  const mainEl = () => MAIN_HOST.root;
  const silent = new Proxy({}, { get: (_, k) => {
    const real = typeof Sound !== 'undefined' ? Sound[k] : undefined;
    if (typeof real !== 'function') return real;
    return (...a) => (st && st.tab === 'pet' ? real.apply(Sound, a) : undefined);
  } });

  const on = () => !!st;
  function wanted() {
    const sel = Profile.data.monster || {};
    return !isTrainingNow() && !(typeof Tutorial !== 'undefined' && Tutorial.inBattle()) && !sel.boss && !sel.arena && !sel.challenge && Profile.petInBattle();
  }
  const isTrainingNow = () => MAIN_BATTLE.fighters.right.monsterId === 'beaver';
  const boards = () => ({ hero: M(), pet: petB });

  function begin(petF) {
    end();
    const pd = Profile.pet();
    if (!BATTLE_TEMPLATE || !pd) return;
    st = { control: 'hero', tab: 'hero', result: { hero: null, pet: null }, kills: [], petOutcomes: [], done: false, pd };
    const root = BATTLE_TEMPLATE.cloneNode(true);
    root.classList.add('duo-pet', 'duo-hidden');
    for (const e of root.querySelectorAll('[id]')) { e.setAttribute('data-bid', e.id); e.id = 'pet-' + e.id; }   // 1.6.4 (WIP-07): id в документе уникальны
    mainEl().after(root);
    petHost = { role: 'pet', id: 'pet', root, sound: silent, autopilot: true, autoLevel: Pets.dopedIntellect(pd, petF.intBonus), coord: Duo };
    MAIN_HOST.coord = Duo;
    petB = createBattle(petHost);
    petB.buildSpellbar();
    petB.startPetGame({
      fighter: petF, foe: structuredClone(M().fighters.right), level: Pets.dopedIntellect(pd, petF.intBonus),
      name: Pets.petDisplayName(pd.speciesId), speciesId: pd.speciesId, tier: pd.tier, hpMult: Pets.boardHp(pd), dmgMult: Pets.boardDmg(pd),
    });
    buildBar();
    document.body.classList.add('duo-battle');
    tick = setInterval(renderBar, 400);
  }

  function buildBar() {
    bar = document.createElement('div');
    bar.className = 'duo-bar';
    bar.innerHTML = '<button type="button" class="duo-tab on" data-tab="hero"><span class="dt-name"></span><span class="dt-hp"><i></i></span><small></small><span class="dt-st"></span></button>' +
      '<button type="button" class="duo-tab" data-tab="pet"><span class="dt-av"></span><span class="dt-name"></span><span class="dt-hp"><i></i></span><small></small><span class="dt-st"></span></button>' +
      '<button type="button" class="duo-take"></button>';
    bar.querySelector('[data-tab=pet] .dt-av').innerHTML = petB.petPortrait(petB.fighters.left);
    bar.addEventListener('click', (e) => {
      const t = e.target.closest('.duo-tab'), k = e.target.closest('.duo-take');
      if (t) setTab(t.dataset.tab);
      else if (k) setControl(st.control === 'pet' ? 'hero' : 'pet', true);
    });
    mainEl().before(bar);
    renderBar();
  }

  // 1.5.2: бой без питомца — та же полоса сверху (имя и цвет противника, у стража — подпись), чтобы поле стояло на месте
  // в любом бою: с питомцем, без него и со стражем.
  function solo() {
    end();
    bar = document.createElement('div');
    bar.className = 'duo-bar solo';
    bar.innerHTML = '<div class="duo-tab solo-tab"><span class="dt-name"></span><span class="dt-hp"><i></i></span><small></small><span class="dt-st"></span></div>';
    mainEl().before(bar);
    document.body.classList.add('duo-battle', 'solo-battle');
    renderSolo();
    tick = setInterval(renderSolo, 400);
    if (typeof fitBattleHeight === 'function') fitBattleHeight();
  }
  // 1.7.1: в густом тумане ХП врага не видно и в сводке над полем
  // 1.7.7: камни, собранные каждым участником боя, видны всегда — своя и вражеская горсть рядом (в тумане у врага «?»).
  const stoneChips = (f, hide) => MAGIC_TYPES.map((t) => `<i class="sc" title="${GEM_NAMES[t]}">${GEM_SVG[t]}<b>${hide ? '?' : (f.counts && f.counts[t]) || 0}</b></i>`).join('');
  const stonesRow = (own, foe) => {
    const hide = typeof Sky !== 'undefined' && Sky.hidesEnemy(Profile.data.monster);
    return `<span class="sg own">${stoneChips(own, false)}</span><span class="sv">⚔</span><span class="sg foe">${stoneChips(foe, hide)}</span>`;
  };
  const setStones = (tab, own, foe) => {
    const el = tab.querySelector('.dt-st'); if (!el) return;
    const html = stonesRow(own, foe);
    if (el.dataset.k !== html) { el.dataset.k = html; el.innerHTML = html; }
  };
  // 1.7.7 (эскизы А и Б): плашки участников боя. У каждого — портрет, имя, ХП и свои камни. Бойцы второго поля (питомец и
  // копия врага; на втором поле — герой и его враг) стоят под карточками (компьютер, Б) или отдельной строкой над полем
  // (телефон, А); нажатие на плашку открывает то поле. В бою один на один строка — подпись приёма врага (и стража).
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const avatarOf = (root, side) => { const a = root.querySelector(`.fighter.${side} .avatar`); return a ? a.innerHTML : ''; };
  function plaque(f, av, kind, go, hideNums) {
    const pct = hideNums ? 100 : Math.max(0, Math.min(100, f.hp / Math.max(1, f.max) * 100));
    const txt = hideNums ? '?' : `${Math.max(0, f.hp)}/${f.max}`;
    return `<div class="pq ${kind}${f.hp <= 0 ? ' down' : ''}" data-go="${go}" role="button" tabindex="0" title="${esc(f.name)}"><span class="pq-av">${av}</span><span class="pq-nm">${esc(f.name)}</span><span class="pq-hp"><i style="width:${pct.toFixed(1)}%"></i><b>${txt}</b></span><span class="pq-st">${stoneChips(f, hideNums)}</span></div>`;
  }
  function mountTeam(root) {
    const ar = root.querySelector('.arena'), L = root.querySelector('.fighter.left'), R = root.querySelector('.fighter.right');
    if (!ar || !L || !R) return null;
    const make = (parent, cls) => {
      let e = parent.querySelector(':scope > .' + cls);
      if (!e) {
        e = document.createElement('div'); e.className = cls; parent.appendChild(e);
        e.addEventListener('click', onTeamClick);
        e.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest('.pq')) { ev.preventDefault(); onTeamClick(ev); } });
      }
      return e;
    };
    return { row: make(ar, 'pq-row'), inL: make(L, 'pq-in'), inR: make(R, 'pq-in') };
  }
  function onTeamClick(e) {
    if (!st) return;
    if (e.target.closest('.pq-take')) { setControl(st.control === 'pet' ? 'hero' : 'pet', true); return; }
    const g = e.target.closest('[data-go]');
    if (g && g.dataset.go !== st.tab) setTab(g.dataset.go);
  }
  const setHtml = (el, html) => { if (el.dataset.k !== html) { el.dataset.k = html; el.innerHTML = html; } };
  let takeState = { text: '', hidden: true };
  function renderTeam() {
    if (!st || !petB || !petHost) return;
    const hide = typeof Sky !== 'undefined' && Sky.hidesEnemy(Profile.data.monster);
    const mainR = mainEl(), petR = petHost.root;
    const sets = [
      { root: mainR, mate: petB.fighters.left, foe: petB.fighters.right, av: [avatarOf(petR, 'left'), avatarOf(petR, 'right')], go: 'pet' },
      { root: petR, mate: M().fighters.left, foe: M().fighters.right, av: [avatarOf(mainR, 'left'), avatarOf(mainR, 'right')], go: 'hero' },
    ];
    for (const x of sets) {
      const m = mountTeam(x.root); if (!m) continue;
      const a = plaque(x.mate, x.av[0], 'ally', x.go, false), f = plaque(x.foe, x.av[1], 'foe', x.go, hide);
      setHtml(m.inL, a); setHtml(m.inR, f);
      setHtml(m.row, a + f + `<button type="button" class="pq-take"${takeState.hidden ? ' hidden' : ''}>${esc(takeState.text)}</button>`);
    }
  }
  const foeNum = (b) => (typeof Sky !== 'undefined' && Sky.hidesEnemy(Profile.data.monster) ? '?' : `${Math.max(0, b.foeHp)}/${b.foeMax}`);
  function renderSolo() {
    if (!bar || st) return;
    const b = M().brief(), f = b.foe, boss = Profile.data.monster && Profile.data.monster.boss, ch = boss && typeof Story !== 'undefined' ? Story.BY_ID[boss] : null;
    const nm = bar.querySelector('.dt-name');
    const label = ch ? (ch.id === 'b5' ? _t("Последний осколок") : _t("Страж осколка {0}", [ch.id.slice(1)])) : '';
    const key = f.name + '|' + f.tier + '|' + label;
    if (nm.dataset.key !== key) {
      nm.dataset.key = key; nm.textContent = f.name + (label ? ' · ' + label + ' ' : ' ');
      nm.insertAdjacentHTML('beforeend', tierChip(f.tier));
    }
    bar.querySelector('.dt-hp i').style.width = Math.max(0, b.foeHp / b.foeMax * 100) + '%';
    const pt = b.pet ? ` · ${b.pet.name}${b.pet.alive ? '' : _t(" (пал в бою)")} ${Math.max(0, b.pet.hp)}/${b.pet.max}` : '';
    bar.querySelector('small').textContent = `${_t("Герой")} ${Math.max(0, b.hp)}/${b.max}${pt} · ${_t("враг")} ${foeNum(b)}`;
    setStones(bar.querySelector('.solo-tab'), M().fighters.left, M().fighters.right);
    const tm = mountTeam(mainEl());
    if (tm) {
      const ab = mainEl().querySelector('.fighter.right .ability-line'), A = Bestiary.ability(M().fighters.right.monsterId);
      const what = A && A.name ? `${A.name}: ${A.desc}` : (ab ? ab.textContent.trim() : '');
      const info = ((label ? label + ' · ' : '') + what).trim();
      setHtml(tm.row, `<div class="pq-info">${esc(info)}</div>`);
    }
    syncBarH();
  }

  function renderBar() {
    if (!st || !bar) return;
    const h = M().brief(), p = petB.brief();
    const fill = (b, f, o) => { b.querySelector('.dt-hp i').style.width = Math.max(0, f.hp / f.max * 100) + '%'; };
    const th = bar.querySelector('[data-tab=hero]'), tp = bar.querySelector('[data-tab=pet]');
    th.querySelector('.dt-name').textContent = _t("Герой");
    th.querySelector('small').textContent = `${Math.max(0, h.hp)}/${h.max} · ${_t("враг")} ${foeNum(h)}`;
    tp.querySelector('.dt-name').textContent = _t("Питомец");
    tp.querySelector('small').textContent = `${Math.max(0, p.hp)}/${p.max} · ${_t("враг")} ${foeNum(p)}`;
    fill(th, h); fill(tp, p);
    setStones(th, M().fighters.left, M().fighters.right);
    setStones(tp, petB.fighters.left, petB.fighters.right);
    syncBarH();
    th.classList.toggle('on', st.tab === 'hero'); tp.classList.toggle('on', st.tab === 'pet');
    th.classList.toggle('mine', st.control === 'hero'); tp.classList.toggle('mine', st.control === 'pet');
    th.classList.toggle('down', !!st.result.hero); tp.classList.toggle('down', !!st.result.pet);
    const take = bar.querySelector('.duo-take');
    const petOver = !!st.result.pet, heroOver = !!st.result.hero;
    take.textContent = st.control === 'pet' ? _t("Играть за героя") : _t("Играть за питомца");
    take.hidden = st.done || (st.control === 'hero' ? petOver || (petB.brief().hp <= 0) : heroOver);
    takeState = { text: take.textContent, hidden: take.hidden };
    renderTeam();
  }

  function setTab(t) {
    if (!st) return;
    st.tab = t;
    mainEl().classList.toggle('duo-hidden', t === 'pet');
    petHost.root.classList.toggle('duo-hidden', t !== 'pet');
    renderBar();
  }
  function setControl(c, follow) {
    if (!st) return;
    st.control = c;
    M().setAutopilot(c === 'pet', 100);
    petB.setAutopilot(c === 'hero', Pets.dopedIntellect(st.pd, petB.fighters.left.intBonus));
    if (follow) setTab(c);
    renderBar();
  }

  // Поле id закончилось: 'win' — противник повержен, 'loss' — наш боец пал.
  function ended(id, result) {
    if (!st) return;
    const b = boards()[id];
    const foe = structuredClone(b.fighters.right);
    st.result[id] = { result, foe };
    if (result === 'win') st.kills.push(foe);
    if (id === 'pet') st.petOutcomes.push({ tier: foe.tier, won: result === 'win' });
    const other = id === 'hero' ? 'pet' : 'hero';
    if (!st.result[other]) {                              // второе поле ещё идёт — переключаем игрока на него
      if (st.control === id) setControl(other, true);
      else if (st.tab === id) setTab(other);
    }
    renderBar();
    evaluate();
  }
  function evaluate() {
    const r = st.result;
    if (!r.hero || !r.pet) return;
    const alive = ['hero', 'pet'].filter((k) => r[k].result === 'win');
    const foesLeft = ['hero', 'pet'].filter((k) => r[k].result === 'loss' && !r[k].taken);
    if (!foesLeft.length) return finish('win');
    if (!alive.length) return finish('loss');
    const k = alive[0], src = r[foesLeft[0]], foe = src.foe;       // выживший добивает оставшегося противника
    src.taken = true;
    r[k] = null;
    // 1.6.5 (A2-21): если победа выжившего пришла посреди его же каскада, ждём, пока поле доиграет ход (whenIdle), и только потом принимаем чужого противника
    const mine = st, b = boards()[k];
    b.whenIdle().then(() => {
      if (!st || st !== mine || st.done) return;
      b.adoptFoe(foe, false);
      b.resumeAfterAdopt();
      b.note(k === 'hero' ? _t("Добиваем врага питомца!") : _t("Добиваем врага героя!"));
      b.logEvent('left', _t("Бой продолжается: впереди ещё один противник"));
      setControl(k, true);
      renderBar();
    });
  }
  function finish(result) {
    st.done = true;
    const m = M();
    if (result === 'loss' && st.result.pet && st.petOutcomes.some((o) => !o.won)) Profile.petLoseDurability();
    let txt = m.grantDuoRewards(st.kills, result === 'win');
    txt += petGrowth();
    setTab('hero');
    m.showOverlay(result === 'win' ? _t("Победа!") : _t("Поражение"), txt);
    renderBar();
  }
  // Питомец копит опыт: растут ум и цвет.
  function petGrowth() {
    const pd = Profile.pet();
    if (!pd || !st.petOutcomes.length) return '';
    const before = Pets.intellect(pd), heroTier = Hero.tierFor(Profile.level());
    let gain = 0;
    for (const o of st.petOutcomes) gain += Pets.xpGain(o.tier, o.won);
    const up = Pets.addXp(pd, gain, heroTier);
    Profile.save();
    const name = Pets.petDisplayName(pd.speciesId), after = Pets.intellect(pd);
    let line = _t("<br>{0}: опыт +{1}, ум {2} → {3}", [name, gain, before, after]);
    if (up) line += _t(". <b class=\"lvlup\">Новый цвет: {0}!</b>", [Tiers.get(pd.tier).name]);
    if (!pd.firstWin && st.petOutcomes.some((o) => o.won)) { pd.firstWin = true; line += `<br><i>${Story.PET_LINES.firstWin}</i>`; Profile.save(); }
    return line;
  }
  // Отступление: награда за уже убитых противников.
  function flee() {
    if (!st || st.done) return;
    st.done = true;
    const txt = M().grantDuoRewards(st.kills, false);
    petGrowth();
    if (txt) setTimeout(() => MapView.toast(_t("Отступили, но добыча за павших врагов — ваша")), 50);
  }
  // 1.6.9: высота полосы сверху нужна CSS, чтобы карточки бойцов и поле не уезжали под неё (на телефонах с вырезом и при крупном шрифте)
  function syncBarH() {
    if (!bar) return;
    const h = Math.ceil(bar.getBoundingClientRect().height);
    if (h > 0 && document.documentElement.style.getPropertyValue('--duo-h') !== h + 'px') document.documentElement.style.setProperty('--duo-h', h + 'px');
  }
  window.addEventListener('resize', () => syncBarH());
  function end() {
    document.documentElement.style.removeProperty('--duo-h');
    if (tick) { clearInterval(tick); tick = null; }
    if (petB) { petB.over = true; petB.stopTurnTimer(); petB.setAutopilot(false); }
    if (petHost) petHost.root.remove();
    if (bar) bar.remove();
    for (const e of mainEl().querySelectorAll('.pq-row, .pq-in')) e.remove();
    bar = null; petB = null; petHost = null; st = null;
    MAIN_HOST.coord = null;
    mainEl().classList.remove('duo-hidden');
    document.body.classList.remove('duo-battle', 'solo-battle');
    if (typeof fitBattleHeight === 'function') fitBattleHeight();
    if (MAIN_BATTLE.autopilot) MAIN_BATTLE.setAutopilot(false);
  }
  return { wanted, begin, solo, end, ended, flee, on, setTab, setControl, get state() { return st; }, get pet() { return petB; } };
})();
buildSpellbar();
loadSettings();
onGearChanged();
MapView.init();                 // игра начинается на карте; бой — при нападении на существо
if (typeof Tutorial !== 'undefined') Tutorial.boot();   // 1.5.4: новичок — сразу в учебный бой; перезагрузка посреди обучения — заново
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
    const anyPoster = ['m', 'm2', 'f'].map((x) => 'ui/bg-splash-poster-' + x).filter((k) => typeof Art !== 'undefined' && Art.has(k));   // нет афиши своего пола — любая есть
    const pool = posters.length ? posters : anyPoster;
    const poster = pool[Math.floor(Math.random() * pool.length)];
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
  const hideAll = () => {
    if (mq.removeEventListener) mq.removeEventListener('change', applyOrientation); else mq.removeListener(applyOrientation);
    el.classList.add('hide');
    setTimeout(() => el.remove(), 500);
  };
  // 1.7.5: сначала осколки собираются в название (SplashFx), потом — афиша; нажатие пропускает. Без canvas или при «меньше движения» — как раньше (2 с).
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof SplashFx !== 'undefined' && !reduce && !!document.createElement('canvas').getContext) {
    const poster = el.classList.contains('has-poster'), wasStyle = el.style.backgroundImage;
    el.classList.remove('has-poster'); el.style.backgroundImage = '';
    el.classList.add('fx');
    let ended = false;
    const keys = Math.random() < 0.5 ? [1, 2, 3, 4, 5, 6].map((n) => 'ui/shard-' + n) : ['gems/sapphire', 'gems/emerald', 'gems/ruby', 'gems/onyx'];   // 1.8.2: вторая заставка — те же осколки-точки, но из наших 4 камней; выбор случайный
    const urls = keys.filter((k) => typeof Art !== 'undefined' && Art.has(k)).map((k) => Art.url(k));
    const fx = SplashFx.play(el, {
      title: _t('Хрупкий мир'), sub: _t('Хрупкий мир') === 'Хрупкий мир' ? 'W O R L D   I N   P I E C E S' : '', shardUrls: urls,
      onEnd: () => {
        if (ended) return; ended = true;
        if (poster) el.classList.add('has-poster'); else el.style.backgroundImage = wasStyle;
        fx.canvas.classList.add('gone');                         // золотое название растворяется, под ним — афиша
        setTimeout(() => { fx.stop(); hideAll(); }, poster ? 1700 : 500);
      },
    });
    el.addEventListener('click', () => { if (!ended) { ended = true; fx.stop(); hideAll(); } });
    return;
  }
  setTimeout(hideAll, 2000);
})();

// 1.9.0: слой связи с площадкой (js/net.js): определяет сайт / Яндекс Игры / ВКонтакте; без сервера игра работает как раньше
(function () {
  try {
    if (typeof Net === 'undefined') return;
    const w = typeof window !== 'undefined' ? window : {};
    const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
    // гостевой токен сайта: придумываем один раз и храним у себя (на сервере — только его хеш)
    let guest = ls('wip-guest');
    if (!guest || guest.length < 32) { guest = ''; const a = '0123456789abcdefghijklmnopqrstuvwxyz'; for (let i = 0; i < 40; i++) guest += a[Math.floor((w.crypto && w.crypto.getRandomValues ? w.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 : Math.random()) * a.length)]; ls('wip-guest', guest); }
    Net.boot({
      YaGames: w.YaGames, vkBridge: w.vkBridge, search: typeof location !== 'undefined' ? location.search : '',
      serverUrl: ls('wip-sync-off') === '1' ? '' : (w.GEM_SERVER || ''), onDeleted: () => ls('wip-sync-off', '1'), fetch: typeof fetch === 'function' ? fetch.bind(w) : undefined, guest,
      getPid: () => (Profile.data ? Profile.data.pid : null),
      getCard: () => Duel.makeCard({ nick: Profile.data.name || '', faction: Profile.data.faction, gender: Profile.data.gender, level: Profile.level(), rank: (Profile.data.arena && Profile.data.arena.rank) || 0, gear: Profile.gear() }, Gear.SLOTS),
      lastVersion: Number(ls('wip-sync-ver')) || 0, saveVersion: (v) => ls('wip-sync-ver', String(v)),
      onNewer: (n, remote) => {
        // на сервере есть более новое сохранение: спрашиваем в окне, а не заменяем молча; своё сохранение откладываем в запас
        if (typeof document === 'undefined') return;
        const back = document.createElement('div'); back.className = 'modal-back'; back.style.display = 'flex';
        back.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><header><h2>' + _t("Сохранение на сервере") + '</h2></header><div style="padding:14px 16px"><p>' + _t("На сервере есть более новое сохранение, например с другого устройства. Загрузить его? Текущее сохранение останется в запасе.") + '</p><div class="card-act" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button type="button" class="primary" data-x="yes">' + _t("Загрузить с сервера") + '</button><button type="button" data-x="no">' + _t("Оставить моё") + '</button></div></div></div>';
        back.addEventListener('click', (e) => {
          const b = e.target.closest && e.target.closest('button'); if (!b) return;
          back.remove();
          if (b.dataset.x !== 'yes') { remote.accept(n.version); return; }   // «оставить моё»: больше не спрашиваем про эту версию
          const cur = ls('gem-match-profile-v2'); if (cur) ls('gem-match-profile-v2-device-bak', cur);
          ls('gem-match-profile-v2', n.snapshot); remote.accept(n.version);
          if (typeof location !== 'undefined') location.reload();
        });
        document.body.appendChild(back);
      },
    });
    // турнир живых игроков: клиент создаётся, когда есть связь с сервером; опрос включается при открытии вкладки или после записи
    if (typeof Tourney !== 'undefined' && typeof Live !== 'undefined' && w.WebSocket) {
      const ensure = () => {
        const cur = Net.current; if (!cur || !cur.remote || !cur.remote.enabled || w.TourneyClient) return;
        const T = Tourney.create({
          remote: cur.remote, Live, WS: w.WebSocket,
          onBattle: (net, m) => {
            const c = cur.env.getCard();
            const sh = liveBegin({ net, role: m.role, first: m.first, seed: m.seed, opp: m.opp, myCard: { nick: c.nick, faction: c.faction, gender: c.gender }, fixed: { level: m.tourney.level, seed: m.tourney.seed } });
            if (!sh) return;
            MapView.startSpecial({ id: 'bandit', tier: Hero.tierFor(sh.level), arena: sh });
          },
          onChange: (S) => {
            if (S.last && S.last.state === 'done') {
              const d = Profile.data; d.tourney = d.tourney || { claimed: [] }; const lid = S.last.id;
              // награду определяет и выдаёт сервер (один раз на игрока); у нас запоминаем только, что уже спрашивали
              if (!d.tourney.claimed.includes(lid) && !T.claiming) {
                T.claiming = true;
                Promise.resolve(Net.current && Net.current.remote && Net.current.remote.tourneyClaim ? Net.current.remote.tourneyClaim(lid) : null).then((cl) => {
                  T.claiming = false; if (!cl) return;             // нет связи — спросим при следующем обновлении
                  d.tourney.claimed.push(lid); if (d.tourney.claimed.length > 20) d.tourney.claimed.shift();
                  if (!cl.view) { Profile.save(); return; }        // уже выдано ранее
                  const r = Tourney.reward(cl.view, d.pid, World.arenaCoins(Hero.tierFor(Profile.level()), 2));
                  if (r && (r.coins || r.title)) {
                    if (r.coins) Profile.addCoins(r.coins);
                    d.cosmetics = d.cosmetics || Village.fresh();
                    if (r.title && !d.cosmetics.titles.includes(r.title)) d.cosmetics.titles.push(r.title);
                    Profile.save();
                  try { MapView.toast(r.champion ? _t("Вы победили в турнире! Монеты: {0}, титул «Победитель турнира» — в Гардеробе Ратуши", [r.coins]) : _t("Турнир окончен. Выиграно раундов: {0}. Монеты: {1}", [r.roundsWon, r.coins]), 6000); } catch (e) { /* карты может не быть */ }
                  }
                }).catch(() => { T.claiming = false; });
              }
            }
            try { if (typeof Screens !== 'undefined' && Screens.isOpen && Screens.screen === 'arena' && Screens.arenaTab() === 'tourney') Screens.refresh(); } catch (e) { /* экран закрыт */ }
          },
        });
        T.started = false; const st0 = T.start; T.start = () => { T.started = true; st0(); };
        w.TourneyClient = T;
        // награды сезона: спрашиваем у сервера, берём каждую один раз (локально помним только, что уже брали)
        // квитанции за живые бои: каждая гасится на сервере один раз; монеты — только если сервер счёл бой оплачиваемым
        w.claimLiveRewards = async () => {
          const rem = Net.current && Net.current.remote; if (!rem || !rem.rewardsClaim || w.__voucherBusy) return;
          w.__voucherBusy = true;
          try {
            const list = (await rem.rewardsClaim()) || [];
            for (const v of list) {
              const d = Profile.data, T = Hero.tierFor(Profile.level());
              const a = d.arena = Object.assign(World.freshArena(), d.arena || {});
              World.arenaSync(a, Daily.today(), T);
              const before = a.rank, r = World.arenaResult(a, !!v.win, false);
              World.arenaLog(a, { day: Daily.today(), nick: _t("Живой игрок"), f: '', win: !!v.win, rule: '', rev: false, rank: before });
              let coins = 0;
              const pv = d.pvp = Object.assign({ wins: 0, losses: 0 }, d.pvp || {});
              let pvpUp = null;
              if (v.win) {
                const rk0 = Tourney.pvpRank(pv.wins).index; pv.wins++; const rk1 = Tourney.pvpRank(pv.wins);
                if (rk1.index > rk0) { pvpUp = rk1.rank; const c = World.arenaCoins(T, 2) * pvpUp.mult; Profile.addCoins(c); coins += c; d.cosmetics = d.cosmetics || Village.fresh(); if (!d.cosmetics.titles.includes(pvpUp.id)) d.cosmetics.titles.push(pvpUp.id); }
              } else pv.losses++;
              if (v.win) { if (v.paid) { const c0 = World.arenaCoins(T, a.rank); Profile.addCoins(c0); coins += c0; } Profile.data.wins++; Daily.registerWin(); }
              if (r.rankUp) {
                const c = World.rankCoins(T, a.rank); Profile.addCoins(c); coins += c;
                const tid = World.RANK_TITLES[a.rank]; d.cosmetics = d.cosmetics || Village.fresh();
                if (tid && !d.cosmetics.titles.includes(tid)) d.cosmetics.titles.push(tid);
              }
              Profile.save();
              if (pvpUp) { try { MapView.toast(_t("Новый ранг живых боёв: {0}! Титул — в Гардеробе Ратуши", [_t(pvpUp.name)]), 6000); } catch (e) { /* карта закрыта */ } }
              try { MapView.toast(v.win ? (coins ? _t("Живой бой: победа! Монеты: {0}", [coins]) : _t("Живой бой: победа засчитана (монеты за сегодня выданы)")) : _t("Живой бой: поражение засчитано"), 4500); } catch (e) { /* карта закрыта */ }
            }
          } catch (e) { /* нет связи — заберём позже */ } finally { w.__voucherBusy = false; }
        };
        w.claimSeasonRewards = async () => {
          const rem = Net.current && Net.current.remote; if (!rem || !rem.seasonList || w.__seasonBusy) return;
          w.__seasonBusy = true;
          try {
            const d = Profile.data; d.season = d.season || { claimed: [] };
            const list = (await rem.seasonList()) || [];
            for (const it of list) {
              if (d.season.claimed.includes(it.id)) continue;
              const cl = await rem.seasonClaim(it.id); if (!cl) continue;
              d.season.claimed.push(it.id); if (d.season.claimed.length > 30) d.season.claimed.shift();
              if (!cl.reward) { Profile.save(); continue; }
              const r = Tourney.seasonReward(cl.reward, World.arenaCoins(Hero.tierFor(Profile.level()), 2));
              if (!r) continue;
              Profile.addCoins(r.coins);
              d.cosmetics = d.cosmetics || Village.fresh();
              if (r.title && !d.cosmetics.titles.includes(r.title)) d.cosmetics.titles.push(r.title);
              Profile.save();
              try { MapView.toast(_t(r.kind === 'week' ? "Рейтинг прошлой недели: место {0}! Монеты: {1}" : "Рейтинг прошлого месяца: место {0}! Монеты: {1}", [r.place, r.coins]), 6000); } catch (e) { /* карта закрыта */ }
            }
            // 1.9.4: «Битва народов» — награда бойцам победившего народа прошлой недели
            if (rem.factions && rem.factionClaim) {
              const fw = await rem.factions();
              if (fw && fw.prev && fw.prev.eligible && !d.season.claimed.includes('f:' + fw.prev.id)) {
                const cl = await rem.factionClaim(fw.prev.id);
                if (cl) {
                  d.season.claimed.push('f:' + fw.prev.id); if (d.season.claimed.length > 30) d.season.claimed.shift();
                  if (cl.reward) {
                    const coins = Tourney.folkReward(World.arenaCoins(Hero.tierFor(Profile.level()), 2));
                    Profile.addCoins(coins); Profile.save();
                    try { MapView.toast(_t("Ваш народ — «{0}» — победил в Битве народов! Монеты: {1}", [Factions.get(cl.reward.faction).name, coins]), 6000); } catch (e) { /* без карты */ }
                  } else Profile.save();
                }
              }
            }
          } catch (e) { /* нет связи — спросим позже */ } finally { w.__seasonBusy = false; }
        };
        if (ls('wip-tourney') === '1') T.start();
        const j = T.join; T.join = async (info) => { const r = await j(info); if (r && r.tour) { ls('wip-tourney', '1'); if (!T.started) T.start(); } return r; };
        const l = T.leave; T.leave = async () => { await l(); ls('wip-tourney', '0'); };
      };
      const t0 = setInterval(() => { ensure(); if (w.TourneyClient) clearInterval(t0); }, 1000);
    }
  } catch (e) { /* связь с площадкой не критична */ }
})();
