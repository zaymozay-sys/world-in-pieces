/* Профиль игрока (прогресс, деньги, вещи, ресурсы, бестиарий) и окно «Ранец и экипировка».
   Профиль хранится в браузере (localStorage), если он доступен. */

const I_PT = (typeof Pets !== 'undefined') ? Pets : require('./pets.js');

const Profile = (() => {
  const KEY = 'gem-match-profile-v2';
  const OLD_KEY = 'gem-match-profile';
  const START_KIT = { 'sword-novice': 'main', 'shield-wood': 'off', 'leather-head': 'head', 'leather-chest': 'chest', 'leather-arms': 'arms', 'leather-legs': 'legs' };

  const fresh = () => {
    const items = [], loadout = Gear.emptyLoadout();
    for (const [id, slot] of Object.entries(START_KIT)) {
      const e = Gear.makeEntry(id, 1);
      items.push(e);
      loadout[slot] = e.uid;
    }
    return {
      wins: 0,
      xp: 0,                                       // опыт героя; уровень считается из него (hero.js)
      coins: 500,                                  // в медных монетах
      items,                                       // все вещи игрока: { uid, id, tier }
      loadout,                                     // ячейка → uid надетой вещи
      resources: {},                               // 'вид:уровень' → количество
      backpack: { potion: 2, elixir: 1, dust: 1, scroll: 1 },
      bestiary: {},                                // вид → { wins, tier } (tier — высший открытый уровень)
      quests: {},                                  // задания трактирщика: id → true (награда уже получена)
      accepted: {},                                // задания, которые игрок взял (см. js/quests.js): id → true
      daily: { date: '', wins: 0, questClaimed: false, lottery: false },   // ежедневные механики (см. js/daily.js)
      medals: { earned: [], fiveStreaks: 0, strikeKills: 0 },   // медали: полученные { id, tier }, счётчик линий из 5
                                                     // камней и счётчик добиваний Ударом (js/medals.js)
      monster: { id: 'rat', tier: 1 },             // текущий (последний) противник
      name: '',                                    // ник игрока; выбирается при первом запуске
      faction: null,                               // фракция игрока (см. factions.js); выбирается при первом запуске
      gender: null,                                // 'm' или 'f' — какой фигурой рисуется герой; выбирается при первом запуске
      seen: {},                                    // встреченные на карте виды: вид → высший цвет
      map: null,                                   // состояние карты (см. mapview.js)
      shop: null,
      ui: 'classic',                               // оформление экрана боя: 'classic' (старое), 'modern' (новое) или 'columns' (колонки)
      pet: null,                                    // прирученный питомец: { speciesId, tier, durability, maxDurability } (см. pets.js) или null
      runeBag: {},                                  // запас рун (см. runes.js): id руны → количество
    };
  };

  let data = fresh();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) {
      data = { ...fresh(), ...saved };
      data.loadout = { ...Gear.emptyLoadout(), ...(saved.loadout || {}) };
      // старые сохранения могли не знать о счётчике добиваний Ударом (см. Medals.STRIKE_MILESTONES)
      data.medals = { earned: [], fiveStreaks: 0, strikeKills: 0, ...(saved.medals || {}) };
      // прогресс из версии без уровней: опыт по числу побед (примерно 4 победы на уровень)
      if (saved.xp === undefined) data.xp = Hero.totalFor(1 + Math.floor((saved.wins || 0) / 4));
    } else {
      // перенос прогресса из первой версии (там вещи хранились по id)
      const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
      if (old) {
        data.wins = old.wins || 0;
        data.backpack = { ...data.backpack, ...(old.backpack || {}) };
        data.coins = 500 + data.wins * 100;
      }
    }
  } catch (e) { /* без хранилища */ }

  // Снимает вещи не по уровню и лишние сверх лимита очков (например, после перехода со старой версии).
  (function fitLoadout() {
    const L = Hero.levelOf(data.xp).level;
    const worn = () => Gear.SLOTS.filter((s) => data.loadout[s]).map((s) => ({ s, e: data.items.find((i) => i.uid === data.loadout[s]) }));
    for (const { s, e } of worn()) if (!e || !Hero.canWear(e.tier || 1, L)) data.loadout[s] = null;
    const cost = () => worn().reduce((sum, { e }) => sum + Gear.item(e).cost, 0);
    while (cost() > Hero.budget(L)) {
      const top = worn().sort((a, b) => Gear.item(b.e).cost - Gear.item(a.e).cost)[0];
      data.loadout[top.s] = null;
    }
  })();

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* без хранилища */ } };
  const findItem = (uid) => data.items.find((i) => i.uid === uid) || null;
  const resKey = (kind, tier) => kind + ':' + tier;
  const rnd = (n) => Math.floor(Math.random() * n);

  // Ассортимент лавки: обновляется после каждого боя; вещи цвета вашего уровня и на цвет ниже.
  function makeShop() {
    const top = Hero.tierFor(Hero.levelOf(data.xp).level);
    const pool = [];
    for (const it of Gear.itemsFor(data.faction)) for (let k = 0; k < { common: 6, rare: 3, epic: 1 }[it.rarity]; k++) pool.push(it);
    const stock = [];
    for (let i = 0; i < 8; i++) stock.push(Gear.makeEntry(pool[rnd(pool.length)].id, Math.max(1, top - rnd(2))));
    return { top, stock };
  }

  const api = {
    get data() { return data; },
    save,
    reset() { data = fresh(); save(); },

    // Вещи и снаряжение
    item: findItem,
    // Снаряжение в виде «ячейка → экземпляр» (для расчётов и рисунков).
    gear() {
      const g = Gear.emptyLoadout();
      for (const s of Gear.SLOTS) g[s] = data.loadout[s] ? findItem(data.loadout[s]) : null;
      return g;
    },
    equippedUid: (uid) => Gear.SLOTS.find((s) => data.loadout[s] === uid) || null,
    addItem(entry) { data.items.push(entry); save(); },
    removeItem(uid) {
      for (const s of Gear.SLOTS) if (data.loadout[s] === uid) data.loadout[s] = null;
      data.items = data.items.filter((i) => i.uid !== uid);
      save();
    },
    // Уровень героя и опыт.
    level: () => Hero.levelOf(data.xp).level,
    levelInfo: () => Hero.levelOf(data.xp),
    // Добавляет опыт. Возвращает { from, to } — уровень до и после.
    addXp(n) { const from = Hero.levelOf(data.xp).level; data.xp += n; save(); return { from, to: Hero.levelOf(data.xp).level }; },
    // Лимит очков снаряжения растёт с уровнем.
    budget: () => Hero.budget(Hero.levelOf(data.xp).level),
    // Цена расходника растёт с уровнем (вместе с доходом).
    consumablePrice: (k) => Hero.consumablePrice(Gear.CONSUMABLES[k].price, Hero.levelOf(data.xp).level),

    // Деньги
    addCoins(n) { data.coins += n; save(); },
    spend(n) { if (data.coins < n) return false; data.coins -= n; save(); return true; },

    // Ресурсы
    res: (kind, tier) => data.resources[resKey(kind, tier)] || 0,
    addRes(kind, tier, n) { data.resources[resKey(kind, tier)] = (data.resources[resKey(kind, tier)] || 0) + n; save(); },
    takeRes(kind, tier, n) {
      if ((data.resources[resKey(kind, tier)] || 0) < n) return false;
      data.resources[resKey(kind, tier)] -= n;
      if (!data.resources[resKey(kind, tier)]) delete data.resources[resKey(kind, tier)];
      save();
      return true;
    },
    resList() {
      return Object.entries(data.resources).map(([k, n]) => { const [kind, tier] = k.split(':'); return { kind, tier: Number(tier), n }; })
        .sort((a, b) => a.tier - b.tier || a.kind.localeCompare(b.kind));
    },

    // Расходники
    addConsumable(kind, n = 1) { data.backpack[kind] = (data.backpack[kind] || 0) + n; save(); },

    // Руны (см. runes.js): хранятся в запасе, пока не вставлены в вещь (см. ItemInfo в этом файле).
    rune: (id) => (data.runeBag || {})[id] || 0,
    addRune(id, n = 1) { data.runeBag = data.runeBag || {}; data.runeBag[id] = (data.runeBag[id] || 0) + n; save(); },

    // Бестиарий: вид попадает в него, когда вы встретили его на карте (или уже побеждали).
    species: () => Bestiary.ORDER.filter((id) => (data.seen && data.seen[id]) || data.bestiary[id]),
    // Высший цвет вида, который можно посмотреть в бестиарии: встреченный или следующий за побеждённым.
    maxTier: (id) => Math.max(data.bestiary[id] ? data.bestiary[id].tier : 1, (data.seen && data.seen[id]) || 1),
    recordWin(id, tier) {
      const rec = data.bestiary[id] || { wins: 0, tier: 1 };
      rec.wins++;
      if (tier >= rec.tier) rec.tier = Math.min(Tiers.MAX, tier + 1);
      data.bestiary[id] = rec;
      save();
    },

    // Медали (см. js/medals.js). tier — цвет героя на момент получения, для свечения медали в интерфейсе.
    medals: () => data.medals.earned,
    hasMedal: (id) => data.medals.earned.some((m) => m.id === id),
    grantMedal(id, tier) {
      if (api.hasMedal(id)) return null;
      const m = { id, tier: Tiers.clamp(tier) };
      data.medals.earned.push(m);
      save();
      return m;
    },
    // После победы: если это первая победа над видом, выдаёт медаль. Возвращает медаль или null.
    checkKillMedal(id, tier) {
      const wonId = Medals.checkKillMedal(id, data.bestiary, data.medals.earned);
      return wonId ? api.grantMedal(wonId, tier) : null;
    },
    // Вызывается при сборе линии из 5 камней (см. resolveBoard в game.js). Считает и, если пройдена
    // очередная веха, выдаёт медаль. Возвращает медаль или null.
    registerFiveStreak(tier) {
      data.medals.fiveStreaks++;
      const wonId = Medals.checkFiveStreakMedal(data.medals.fiveStreaks, data.medals.earned);
      const m = wonId ? api.grantMedal(wonId, tier) : null;
      save();
      return m;
    },
    // Вызывается, когда монстр добит заклинанием Удар (см. game.js/dealDamage). Считает и, если пройдена
    // очередная веха (Medals.STRIKE_MILESTONES), выдаёт медаль. Возвращает медаль или null.
    registerStrikeKill(tier) {
      data.medals.strikeKills = (data.medals.strikeKills || 0) + 1;
      const wonId = Medals.checkStrikeMedal(data.medals.strikeKills, data.medals.earned);
      const m = wonId ? api.grantMedal(wonId, tier) : null;
      save();
      return m;
    },
    strikeKills: () => data.medals.strikeKills || 0,
    // Суммарный постоянный бонус характеристик от всех полученных медалей (см. recalcStats в game.js).
    medalsBonus: () => Medals.bonusStats(data.medals.earned),

    // Приручение и питомец (см. pets.js). Только один активный питомец за раз.
    canTame: (id) => I_PT.canTame(data.bestiary, id),
    pet: () => data.pet,
    hasUsablePet: () => I_PT.isUsable(data.pet),
    // Приручает вид (заменяет текущего питомца, если был). Возвращает false, если условия ещё не выполнены.
    tame(id, tier) {
      if (!api.canTame(id)) return false;
      data.pet = I_PT.makePet(id, tier);
      save();
      return true;
    },
    // Питомец проиграл бой вместе с героем — теряет 1 прочность (см. pets.js: loseDurability).
    petLoseDurability() { if (data.pet) { I_PT.loseDurability(data.pet); save(); } },
    repairPet() { if (data.pet) { I_PT.repair(data.pet); save(); } },

    // Лавка
    shop() { if (!data.shop) { data.shop = makeShop(); save(); } return data.shop; },
    refreshShop() { data.shop = makeShop(); save(); },
    removeFromShop(uid) { if (data.shop) data.shop.stock = data.shop.stock.filter((e) => e.uid !== uid); save(); },

    // Перенос сохранения: выгрузка в файл и загрузка обратно (например, на другом устройстве или в другом браузере).
    exportSave() { return JSON.stringify(data, null, 2); },
    // json — текст файла сохранения. Возвращает true при успехе, false — если файл не похож на сохранение
    // «Хрупкого мира» (сохранение не трогается). Недостающие поля достраиваются значениями нового профиля.
    importSave(json) {
      let parsed;
      try { parsed = JSON.parse(json); } catch (e) { return false; }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
      if (typeof parsed.coins !== 'number' || !Array.isArray(parsed.items) || typeof parsed.loadout !== 'object') return false;
      data = { ...fresh(), ...parsed };
      data.loadout = { ...Gear.emptyLoadout(), ...(parsed.loadout || {}) };
      save();
      return true;
    },
  };
  return api;
})();

/* ---------- общие кусочки интерфейса ---------- */

// Экранирование текста от игрока (ник) перед вставкой в innerHTML.
const escText = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Цвет уровня для обводок и свечения (у обсидиана — светлый отблеск, чтобы было видно на тёмном).
const tierColor = (t) => Tiers.get(t).edge;
const setColorOf = (it) => (it.set && Gear.SETS[it.set] ? Gear.SETS[it.set].color : Gear.NEUTRAL_COLOR);

const fmtStat = (k, v) => ({
  power: `+${v}% Сила`, health: `+${v} Здоровье`, defense: `+${v}% Броня`, magic: `+${v} Магия`,
  initiative: `+${v}% Инициатива`, ricochet: `+${v}% Рикошет`, block: `+${v}% Блок`, fury: `+${v}% Ярость`,
  cunning: `+${v}% Хитрость`,
}[k]);
const fmtBonus = (b) => Object.entries(b).map(([k, v]) => fmtStat(k, v)).join(', ');
const statChips = (stats) => Object.entries(stats).map(([k, v]) => `<span class="chip">${fmtStat(k, v)}</span>`).join('');
const tierChip = (t) => `<span class="tier-chip" data-tier="${t}" style="--t:${Tiers.get(t).color};--ti:${Tiers.get(t).ink}">Ур.${t} ${Tiers.get(t).name}</span>`;

// Карточка предмета: иконка со свечением цвета уровня, название, характеристики и произвольная нижняя строка.
// Если у предмета есть uid (это экземпляр игрока/противника, не абстрактный образец из энциклопедии),
// в правом верхнем углу карточки при наведении появляется значок «i» — открывает подробности (см. ItemInfo).
function itemCard(it, foot = '', actions = '', cls = '') {
  const set = it.set ? `<span class="tag" style="--c:${Gear.SETS[it.set].color}">${Gear.SETS[it.set].name}</span>` : '';
  const hands = it.type === 'weapon2' ? '<span class="tag hand">2 руки</span>' : it.type === 'weapon1' ? '<span class="tag hand">1 рука</span>' : '';
  const runeBadge = (it.runes || []).filter((id) => id && Runes.CATALOG[id])
    .map((id) => `<span class="rune-badge" style="--rc:${Runes.CATALOG[id].color}" title="${Runes.CATALOG[id].name}"></span>`).join('');
  const info = it.uid ? `<button type="button" class="card-info" data-info-item="${it.uid}" title="Подробнее" aria-label="Подробнее об этом предмете">i</button>` : '';
  return `<div class="card r-${it.rarity} ${cls}" data-tier="${it.tier}" style="--t:${tierColor(it.tier)}">
    <span class="icon-wrap">${itemIcon(it.type, '', it.id)}${runeBadge}</span>
    <div class="card-body"><span class="item-title">${it.name} ${tierChip(it.tier)} ${set}${hands}</span>
      <span class="chips">${statChips(it.stats)}</span>${foot ? `<span class="item-foot">${foot}</span>` : ''}</div>
    ${actions ? `<div class="card-act">${actions}</div>` : ''}${info}</div>`;
}

const resLabel = (kind, tier) => `${Bestiary.RESOURCES[kind].name} · ${Tiers.get(tier).name}`;

/* ---------- всплывающие подробности о предмете (значок «i» на карточке) + вставка рун ---------- */

const ItemInfo = (() => {
  let pop = null, uid = null;

  function findOwner(id) {
    // Предмет может принадлежать игроку или быть снаряжением текущего противника в бою.
    const mine = Profile.item(id);
    if (mine) return { entry: mine, owner: 'left' };
    if (typeof fighters !== 'undefined' && fighters.right && fighters.right.gear) {
      for (const s of Gear.SLOTS) {
        const e = fighters.right.gear[s];
        if (e && typeof e === 'object' && e.uid === id) return { entry: e, owner: 'right' };
      }
    }
    return null;
  }

  function render() {
    if (!pop) return;
    const found = findOwner(uid);
    if (!found) return close();
    const { entry, owner } = found;
    const it = Gear.item(entry);
    const set = it.set ? `<span class="tag" style="--c:${Gear.SETS[it.set].color}">${Gear.SETS[it.set].name}</span>` : '';
    const worn = owner === 'left' ? Profile.equippedUid(uid) : Gear.SLOTS.find((s) => fighters.right.gear[s] && fighters.right.gear[s].uid === uid);
    const locked = worn && typeof canEditGear === 'function' && !canEditGear();
    let runeBlock = '';
    if (owner === 'left') {
      const sockets = Runes.socketsFor(it);
      const bag = Profile.data.runeBag || {};
      const owned = Runes.ORDER.filter((id) => bag[id] > 0);
      const ownedHint = owned.length
        ? `<p class="hint">Есть в запасе: ${owned.map((id) => `${Runes.CATALOG[id].name} × ${bag[id]}`).join(', ')}</p>`
        : '<p class="hint">Рун в запасе нет — их можно купить и вставить в Мастерской художника.</p>';
      const slots = Array.from({ length: sockets }, (_, slot) => {
        const runeId = entry.runes && entry.runes[slot];
        const cur = runeId && Runes.CATALOG[runeId];
        if (cur) {
          return `<div class="bag-row"><span style="color:${cur.color}">●</span><span><b>${cur.name}</b><br><small>${cur.desc}</small></span></div>
            <div class="reset"><button type="button" data-rune-remove="${slot}" ${locked ? 'disabled' : ''}>Извлечь руну (вернётся в запас)</button></div>`;
        }
        return owned.length
          ? `<p class="hint">Гнездо ${slot + 1} пустое: ${owned.map((id) => `<button type="button" class="itembtn-inline" data-rune-insert="${id}" data-rune-slot="${slot}" ${locked ? 'disabled' : ''}>${Runes.CATALOG[id].name}</button>`).join(' ')}</p>`
          : `<p class="hint">Гнездо ${slot + 1} пустое.</p>`;
      }).join('');
      runeBlock = `<h3>Руны (${sockets} гнезда)</h3>${slots}${ownedHint}
        ${locked ? '<p class="hint warn">Руну можно менять до первого хода боя или после его окончания.</p>' : ''}`;
    }
    pop.innerHTML = `<div class="modal item-info-modal" role="dialog" aria-label="Подробности о предмете">
      <header><h2>${it.name} ${tierChip(it.tier)} ${set}</h2><button type="button" class="close" data-act="close">Закрыть</button></header>
      <div class="screen-body">
        <div class="card-list"><div class="card" style="--t:${tierColor(it.tier)}"><span class="icon-wrap">${itemIcon(it.type, '', it.id)}</span>
          <div class="card-body"><span class="chips">${statChips(it.stats)}</span>
            <span class="item-foot">${Gear.RARITY_NAMES[it.rarity]} · ${Gear.TYPE_NAMES[it.type]} · ${it.cost} оч.</span></div></div></div>
        ${runeBlock}
      </div></div>`;
  }

  function open(id) {
    uid = id;
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'modal-back item-info-back';
      pop.addEventListener('click', onClick);
      document.body.appendChild(pop);
    }
    render();
  }
  function close() { if (pop) { pop.remove(); pop = null; } uid = null; }
  function onClick(e) {
    if (e.target === pop) return close();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'close') return close();
    if (b.dataset.runeInsert) {
      const entry = Profile.item(uid);
      if (!entry) return;
      const bag = Profile.data.runeBag || (Profile.data.runeBag = {});
      const id = b.dataset.runeInsert, slot = Number(b.dataset.runeSlot) || 0;
      if (!(bag[id] > 0)) return;
      const prev = entry.runes && entry.runes[slot];
      if (prev && Runes.CATALOG[prev]) { bag[prev] = (bag[prev] || 0) + 1; }   // старая руна в этом гнезде — обратно в запас
      Runes.insert(entry, id, slot);
      bag[id]--;
      if (!bag[id]) delete bag[id];
      Profile.save();
      if (typeof onGearChanged === 'function') onGearChanged();
      return render();
    }
    if (b.dataset.runeRemove !== undefined) {
      const entry = Profile.item(uid);
      const slot = Number(b.dataset.runeRemove) || 0;
      const runeId = entry && entry.runes && entry.runes[slot];
      if (!runeId) return;
      const bag = Profile.data.runeBag || (Profile.data.runeBag = {});
      bag[runeId] = (bag[runeId] || 0) + 1;
      Runes.remove(entry, slot);
      Profile.save();
      if (typeof onGearChanged === 'function') onGearChanged();
      return render();
    }
  }
  return { open, close };
})();

// Значок «i» на карточке открывает подробности, не задевая клик по самой карточке/кнопке вокруг неё
// (карточки часто вложены в свою собственную кнопку выбора — см. itembtn в Inventory/Screens), поэтому
// слушаем клик на фазе погружения (capture) и останавливаем его раньше, чем он дойдёт до внешней кнопки.
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.card-info');
    if (!b) return;
    e.stopPropagation();
    e.preventDefault();
    ItemInfo.open(b.dataset.infoItem);
  }, true);
}

/* ---------- окно «Ранец и экипировка» ---------- */

const Inventory = (() => {
  let root = null;
  let tab = 'left';          // чьё снаряжение смотрим: 'left' (игрок) или 'right' (противник)
  let sel = 'main';          // выбранная ячейка
  let toast = '';
  let resetArmed = false;

  function open(which = 'left') {
    tab = which;
    sel = 'main';
    toast = '';
    resetArmed = false;
    if (!root) {
      root = document.createElement('div');
      root.className = 'modal-back';
      root.addEventListener('click', onClick);
      document.body.appendChild(root);
      document.addEventListener('keydown', onKey);
    }
    render();
  }

  function close() {
    if (root) { root.remove(); root = null; }
    document.removeEventListener('keydown', onKey);
  }
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  function statsBlock(stats) {
    // У каждого заклинания своя цена (Balance.magic.costs) — показываем диапазон мин..макс по всем пяти.
    const costs = Object.keys(Balance.magic.costs).map((k) => Combat.spellCost({ stats, buffs: [] }, k));
    const lo = Math.min(...costs), hi = Math.max(...costs);
    const costLabel = lo === hi ? `${lo}` : `${lo}–${hi}`;
    return `<div class="stat-list">
      <div><span>Сила</span><b>+${stats.power}%</b><small>к урону</small></div>
      <div><span>Здоровье</span><b>+${stats.health}</b><small>к максимуму ХП</small></div>
      <div><span>Броня</span><b>${stats.defense}%</b><small>меньше урона${stats.defense >= Gear.CAPS.defense ? ' (максимум)' : ''}</small></div>
      <div><span>Магия</span><b>${stats.magic}</b><small>цена заклинаний: ${costLabel} камней каждого вида</small></div>
      <div><span>Инициатива</span><b>+${stats.initiative}%</b><small>шанс первого хода</small></div>
      <div><span>Рикошет</span><b>${stats.ricochet}%</b><small>удар отлетает в нападающего (за вычетом брони)</small></div>
      <div><span>Блок</span><b>${stats.block}%</b><small>полностью блокирует удар</small></div>
      <div><span>Ярость</span><b>${stats.fury}%</b><small>шанс удвоить урон одним ударом</small></div>
      <div><span>Хитрость</span><b>${stats.cunning || 0}%</b><small>шанс отнять половину магических камней, собранных противником</small></div>
    </div>`;
  }

  // Уровень, опыт, ХП и урон героя.
  function heroLine(lv, stats) {
    const pct = lv.need === Infinity ? 100 : Math.round(lv.into / lv.need * 100);
    return `<div class="hero-level"><b>Уровень ${lv.level}</b><span>${lv.need === Infinity ? 'максимальный' : `опыт ${lv.into} / ${lv.need}`}</span>
      <div class="xpbar"><i style="width:${pct}%"></i></div>
      <small>ХП ${Hero.baseHp(lv.level) + stats.health} · урон камня ×${Hero.dmgMult(lv.level)} · вещи до цвета «${Tiers.get(Hero.tierFor(lv.level)).name}»</small></div>`;
  }

  function render() {
    if (!root) return;
    const mine = tab === 'left';
    const monsterId = fighters.right.monsterId;
    const dragon = monsterId === 'dragon';
    const showGear = mine || dragon;           // у остальных существ снаряжения нет
    const gear = mine ? Profile.gear() : fighters.right.gear;
    const fac = Factions.get(Profile.data.faction) || Factions.get('dwarf');
    const lv = Profile.levelInfo();
    const stats = mine ? Gear.combine(Gear.combine(Gear.stats(gear), Factions.statsAt(Profile.data.faction || 'dwarf', Hero.tierFloat(lv.level))), Runes.bonusForGear(gear)) : fighters.right.stats;
    const used = Gear.totalCost(gear);
    const budget = mine ? Profile.budget() : fighters.right.gearBudget;
    const editable = mine && canEditGear();
    const mainItem = Gear.item(gear.main);
    const twoHand = mainItem && mainItem.type === 'weapon2';

    const slots = Gear.SLOTS.map((s) => {
      const it = Gear.item(gear[s]);
      const blocked = s === 'off' && twoHand;
      return `<button type="button" class="slot ${sel === s ? 'sel' : ''} ${it ? 'filled' : ''}" data-slot="${s}"
          ${it ? `style="--c:${tierColor(it.tier)}"` : ''}>
        ${it ? itemIcon(it.type, '', it.id) : slotIcon(s)}
        <span class="slot-name">${Gear.SLOT_NAMES[s]}</span>
        <span class="slot-item">${it ? it.name : blocked ? 'Занято двуручным' : 'Пусто'}</span></button>`;
    }).join('');

    let list = '';
    if (mine) {
      const own = Profile.data.items.filter((e) => Gear.fits(sel, Gear.item(e).type))
        .map((e) => Gear.item(e))
        .sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name));
      list = own.map((it) => {
        const worn = Profile.equippedUid(it.uid);
        const on = Profile.data.loadout[sel] === it.uid;
        const alien = it.faction && it.faction !== Profile.data.faction;
        const low = !Hero.canWear(it.tier, lv.level);
        const foot = `${Gear.RARITY_NAMES[it.rarity]} · ${it.cost} оч.${worn && !on ? ` · надет: ${Gear.SLOT_NAMES[worn]}` : ''}${alien ? ` · только для фракции «${Factions.get(it.faction).name}»` : ''}${low ? ` · <b class="warn">с ${Hero.itemLevel(it.tier)}-го уровня</b>` : ''}`;
        return `<button type="button" class="itembtn ${on ? 'on' : ''}" data-item="${it.uid}" ${editable ? '' : 'disabled'}>${itemCard(it, foot)}</button>`;
      }).join('') || '<p class="hint">Нет подходящих вещей. Их можно купить в Лавке, создать в Кузнице или получить после боя.</p>';
    }

    const sets = Gear.setProgress(gear).map((p) => `
      <div class="set" style="--c:${p.color}"><b>Набор «${p.name}» ${p.count}/${p.total}</b>
        ${p.active.map((a) => `<div class="on">${a.need} шт.: ${fmtBonus(a.bonus)}</div>`).join('')}
        ${p.next.slice(0, 1).map((a) => `<div class="off">ещё до ${a.need} шт.: ${fmtBonus(a.bonus)}</div>`).join('')}
      </div>`).join('') || '<p class="hint">Наборов нет: собирайте предметы одного набора — они усиливают друг друга.</p>';

    const bag = mine ? Profile.data.backpack : fighters.right.bag;
    const bagHtml = Object.entries(Gear.CONSUMABLES).map(([k, c]) => `
      <div class="bag-row">${itemIcon(k)}<span><b>${c.name}</b> × ${bag[k] || 0}<br><small>${c.desc}</small></span></div>`).join('');
    const resHtml = mine ? (Profile.resList().map((r) => `<div class="bag-row">${MonsterArt.resIcon(r.kind, r.tier)}<span><b>${resLabel(r.kind, r.tier)}</b> × ${r.n}</span></div>`).join('') || '<p class="hint">Ресурсов пока нет: они выпадают из монстров.</p>') : '';

    const pct = budget ? Math.min(100, Math.round(used / budget * 100)) : 0;
    const enemyName = Bestiary.MONSTERS[monsterId].name;
    let left = '';
    if (dragon || mine) left = `<div class="figure-box">${Figures.figure(mine ? Factions.heroKind(Profile.data.faction || 'dwarf', Profile.data.gender) : 'dragon', gear)}</div>`;
    else left = `<div class="figure-box monster-box">${MonsterArt.bust(monsterId, fighters.right.tier)}</div>`;

    root.innerHTML = `
      <div class="modal" role="dialog" aria-label="Ранец и экипировка">
        <header>
          <h2>Ранец и экипировка</h2>
          <span class="wallet-head">${MonsterArt.moneyHtml(Profile.data.coins)}</span>
          ${mine ? '<button type="button" class="valor-link" data-act="valor">Стена доблести</button>' : ''}
          <button type="button" class="close" data-act="close">Закрыть</button>
        </header>
        <div class="tabs">
          <button type="button" class="${mine ? 'on' : ''}" data-tab="left">${Profile.data.name ? escText(Profile.data.name) : fac.name + ': ' + Factions.heroTitle(Profile.data.faction || 'dwarf', Profile.data.gender)}</button>
          <button type="button" class="${mine ? '' : 'on'}" data-tab="right">Противник: ${enemyName}</button>
        </div>
        <div class="gear-layout">
          <section class="gear-left">
            ${left}
            ${mine ? heroLine(lv, stats) : ''}
            ${statsBlock(stats)}
          </section>
          <section class="gear-right">
            ${showGear ? `<div class="budget"><div class="budget-bar"><i style="width:${pct}%" class="${used > budget ? 'over' : ''}"></i></div>
              <span>Очки снаряжения: <b>${used}</b> / ${budget}${mine ? ' (растут с уровнем)' : ''}</span></div>` : ''}
            ${mine && !editable ? '<p class="hint warn">Менять снаряжение можно до первого хода боя или после его окончания.</p>' : ''}
            ${showGear ? `<div class="slots">${slots}</div>` : `<p class="hint">${Bestiary.MONSTERS[monsterId].desc}<br>У этого существа нет снаряжения — только врождённые способности (слева).</p>`}
            <div class="gear-toast">${toast}</div>
            ${mine ? `<h3>${Gear.SLOT_NAMES[sel]}: ваши вещи</h3><div class="item-list">${list}</div>` : ''}
            ${showGear ? `<h3>Наборы</h3>${sets}` : ''}
            <h3>Ранец</h3>${bagHtml}
            ${mine ? `<h3>Ресурсы</h3>${resHtml}` : ''}
            ${mine ? `<div class="reset"><button type="button" data-act="reset">${resetArmed ? 'Точно сбросить? Нажмите ещё раз' : 'Сбросить весь прогресс'}</button></div>` : ''}
          </section>
        </div>
      </div>`;
  }

  function say(text) { toast = text; render(); }

  function onClick(e) {
    if (e.target === root) return close();
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.act === 'close') return close();
    if (t.dataset.act === 'valor') { if (typeof Screens !== 'undefined') Screens.openValor(); return; }
    if (t.dataset.tab) { tab = t.dataset.tab; sel = 'main'; toast = ''; return render(); }
    if (t.dataset.slot) { sel = t.dataset.slot; toast = ''; resetArmed = false; return render(); }
    if (t.dataset.act === 'reset') {
      if (!resetArmed) { resetArmed = true; return render(); }
      Profile.reset();
      resetArmed = false;
      MapView.reset();
      onGearChanged();
      return say('Прогресс сброшен');
    }
    if (t.dataset.item) equipItem(t.dataset.item);
  }

  function equipItem(uid) {
    const load = Profile.data.loadout;
    if (load[sel] === uid) {                         // повторный клик снимает вещь
      load[sel] = null;
      Profile.save();
      onGearChanged();
      return say('Вещь снята');
    }
    const gear = Profile.gear();
    const entry = Profile.item(uid);
    const check = Gear.canEquip(gear, entry, sel, Profile.data.faction, Profile.level());
    if (!check.ok) return say(check.reason);
    const next = Gear.equip(gear, entry, sel);
    const cost = Gear.totalCost(next);
    if (cost > Profile.budget()) return say(`Не хватает очков: нужно ${cost}, лимит ${Profile.budget()}`);
    const dropped = gear.off && !next.off;
    load[sel] = uid;
    if (dropped) load.off = null;
    Profile.save();
    onGearChanged();
    say(dropped ? 'Двуручное оружие заняло обе руки: левая рука освобождена' : 'Надето');
  }

  return { open, close, refresh: () => render(), get isOpen() { return !!root; } };
})();
