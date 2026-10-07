if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Экраны: Лавка (покупка и продажа), Кузница (улучшение цвета и создание вещей), Бестиарий (выбор противника).
   Все они — окна поверх игры; данные берутся из Profile (inventory.js), Gear (items.js) и Bestiary (bestiary.js). */

const Screens = (() => {
  let root = null;
  let cur = null;
  const QTY_STEPS = [1, 5, 10, 25];
  const st = {
    shop:  { tab: 'buy', resTier: 1, msg: '', consQty: {}, resQty: {} },
    forge: { tab: 'upgrade', sel: null, filter: 'weapon', msg: '', craftTier: 0 },
    best:  { sel: null, tier: 1 },
    // fac: при первом запуске (first) — черновик регистрации (ник, пол, выбранная фракция) до нажатия «Начать игру»,
    // в два шага (step): 'crest' — только гербы фракций, 'detail' — герои выбранной фракции и пол;
    // иначе (обычная смена фракции в Ратуше) — один экран со всеми фракциями, без ника и пола.
    fac:   { first: false, step: 'crest', msg: '', name: '', gender: null, picked: null },
    tavern: { msg: '' },
    mill: { msg: '' },
    lighthouse: { msg: '' },
    wreck: { msg: '' },
    chest: { msg: '' },
    junker: { msg: '' },
    library: { tab: 'npc', filter: 'weapon', itemTier: 1, msg: '', spellPick: false },
    artistWorkshop: { msg: '' },
    kennel: { msg: '', tab: 'pet' },
    alchemist: { msg: '' },
    market: { tab: 'lots', kind: 'item', sel: null, mult: 1, qty: 1, msg: '' },
  };
  const money = (n) => MonsterArt.moneyHtml(n);
  const RES_BUY_MARKUP = 3;            // ресурсы в лавке дороже, чем при продаже
  // Руны (js/runes.js): продаёт Журавль-художник в Мастерской художника (см. SCREENS.artistWorkshop
  // ниже) — раньше, пока здания не было, руны временно продавались в Лавке. Цена — между дорогим
  // расходником и дешёвой вещью 1-го цвета: руна слабее целого предмета, но действует постоянно.
  const RUNE_PRICE = 140;
  // Бонусы фракции: люди покупают дешевле, у гномов дешевле работа кузницы.
  const buyPrice = (p) => Math.round(p * Factions.perk(Profile.data.faction, 'shop'));
  const consPrice = (k) => Profile.consumablePrice(k);       // растёт с уровнем героя
  const ammoPrice = (k) => Hero.consumablePrice(Ammo.CATALOG[k].price, Profile.level());   // 1.3.0: боеприпасы
  const levelNote = (it) => (Hero.canWear(it.tier, Profile.level()) ? '' : _t(" · <b class=\"warn\">надеть можно с {0}-го уровня</b>", [Hero.itemLevel(it.tier)]));
  const forgeCost = (c) => (c ? { ...c, coins: Math.round(c.coins * Factions.perk(Profile.data.faction, 'forge')) } : c);

  /* Общий значок медали — используется и на вкладке «Медали» в Библиотеке, и на Стене доблести у дома
     (см. SCREENS.valor ниже), чтобы не дублировать разметку/логику в двух местах.
     earned — запись { id, tier } из Profile.medals(), если медаль уже получена, иначе null.
     progress/need — для ещё не полученной медали: текущий счётчик и порог следующей вехи/вида (для title).
     Тир-бейдж «открывается» (получает цвет своего тира по CSS data-tier, см. tier-glow в css/style.css)
     только когда уровень героя достиг Medals.tierUnlockLevel(id) — до этого показывается нейтральным,
     даже если сама медаль уже получена (см. ТЗ «Стена доблести»). */
  function medalTile(id, earned, level, progress, need) {
    const unlockLvl = Medals.tierUnlockLevel(id);
    const tierOpen = level >= unlockLvl;
    const tier = earned ? earned.tier : 1;
    const got = !!earned;
    const bonusText = got ? Object.entries(Medals.bonusFor(id) || {}).map(([k, v]) => `${STAT_NAMES_RU[k] || k} +${v}`).join(', ') : '';
    const title = Medals.nameFor(id) + ' — ' + (got
      ? (_t("получена") + (tierOpen ? '' : _t("; цвет откроется на уровне {0} (сейчас {1})", [unlockLvl, level])) + (bonusText ? _t(". Бонус: {0}", [bonusText]) : ''))
      : _t("не открыта. Прогресс: {0} / {1}", [progress, need]));
    // значок внутри кружка: для медалей за виды — портрет существа, для остальных — число
    let glyph;
    const species = Medals.killSpecies(id);
    if (species) glyph = (typeof MonsterArt !== 'undefined' && MonsterArt.bust(species, 1)) || `<span class="mg-num">${(Medals.nameFor(id).split(': ')[1] || '?').slice(0, 2)}</span>`;
    else if (id.startsWith('strike:')) glyph = _t("<span class=\"mg-num\">{0}<small>Удар</small></span>", [id.slice(7)]);
    else if (id.startsWith('shot:')) glyph = _t("<span class=\"mg-num\">{0}<small>Выстрел</small></span>", [id.slice(5)]);
    else glyph = _t("<span class=\"mg-num\">{0}<small>линий</small></span>", [id.slice(id.indexOf(':') + 1)]);
    return `<div class="medal-round ${got ? 'got' : 'todo'} ${tierOpen ? '' : 'locked'}" data-tier="${tierOpen ? tier : 0}"
        style="--t:${tierColor(tier)}" title="${title.replace(/"/g, '&quot;')}" tabindex="0" aria-label="${title.replace(/"/g, '&quot;')}">${glyph}</div>`;
  }
  const STAT_NAMES_RU = { power: _t("Сила"), health: _t("Здоровье"), armor: _t("Броня"), magic: _t("Магия"), initiative: _t("Инициатива"), ricochet: _t("Рикошет"), block: _t("Блок"), rage: _t("Ярость"), cunning: _t("Хитрость"), defense: _t("Защита") };
  const mustChoose = () => cur === 'faction' && st.fac.first;

  function mount() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'modal-back';
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    document.body.appendChild(root);
    document.addEventListener('keydown', onKey);
  }
  function close() {
    if (root) { root.remove(); root = null; }
    document.removeEventListener('keydown', onKey);
    cur = null;
  }
  const onKey = (e) => { if (e.key === 'Escape' && !mustChoose()) close(); };
  function open(id) { mount(); cur = id; render(); }
  function render() { if (root && cur) root.innerHTML = SCREENS[cur].html(); }
  function onClick(e) {
    if (e.target === root) { if (!mustChoose()) close(); return; }
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.act === 'close') return close();
    if (b.dataset.tip) { Profile.data.tips = Profile.data.tips || {}; Profile.data.tips[b.dataset.tip] = true; Profile.save(); return render(); }
    SCREENS[cur].click(b);
  }
  // Ввод ника: правим состояние и вручную включаем/выключаем кнопку «Начать», не перерисовывая
  // весь экран (иначе поле теряет фокус и курсор при каждой букве).
  function onInput(e) {
    if (cur !== 'faction' || e.target.dataset.nick === undefined) return;
    st.fac.name = e.target.value;
    const btn = root.querySelector('[data-act="start"]');
    if (btn) btn.disabled = !canStartGame();
  }
  const canStartGame = () => !!(st.fac.name && st.fac.name.trim() && st.fac.gender && st.fac.picked);
  const head = (title) => _t("<header><h2>{0}</h2><span class=\"wallet-head\">{1}</span><button type=\"button\" class=\"close\" data-act=\"close\">Закрыть</button></header>", [title, money(Profile.data.coins)]);
  const tabs = (items, active) => `<div class="tabs">${items.map(([k, label]) => `<button type="button" class="${k === active ? 'on' : ''}" data-tab="${k}">${label}</button>`).join('')}</div>`;
  const tierPicker = (max, active, attr) => `<div class="tier-picker">${Tiers.LIST.map((t) => `<button type="button" class="tp ${t.id === active ? 'on' : ''}" data-tier="${t.id}" style="--t:${t.color};--ti:${t.ink}" ${t.id > max ? 'disabled' : ''} data-${attr}="${t.id}" title="${t.name}">${t.id}</button>`).join('')}</div>`;
  // Короткая подсказка при первом открытии окна; гаснет по кнопке «Понятно» (Profile.data.tips)
  const tipBox = (id, text) => (Profile.data.tips && Profile.data.tips[id]) ? '' : _t("<div class=\"tip-box\"><p><b>Подсказка.</b> {0}</p><button type=\"button\" data-tip=\"{1}\">Понятно</button></div>", [text, id]);
  const changed = () => { if (typeof onEconomyChanged === 'function') onEconomyChanged(); render(); };
  // Приручение (см. pets.js): прогресс/кнопка в карточке вида бестиария, показывается только для приручаемого
  // семейства («Звери»). Текущий питомец (если это его вид) — с прочностью и кнопкой ремонта.
  function tameBox(id) {
    if (!Pets.isTameableSpecies(id)) return '';
    const cur = Profile.tamedPet();
    if (cur && cur.speciesId === id) {
      const dur = `${cur.durability}/${cur.maxDurability}`;
      return _t("<div class=\"ability-box\"><b>Питомец: {0}</b><span>Прочность: {1}{2}</span>\n        {3}</div>", [Pets.petDisplayName(id), dur, Pets.isUsable(cur) ? '' : _t(" — не может выйти в бой, пока не восстановлена"), Pets.isUsable(cur) ? '' : _t("<p class=\"hint warn\">Подлечить питомца можно в Питомнике.</p>")]);
    }
    const wins = Pets.tameProgress(Profile.data.bestiary, id), need = Pets.TAME_WINS;
    if (Pets.canTame(Profile.data.bestiary, id)) {
      return _t("<div class=\"ability-box\"><b>Приручение: готово</b><span>Побед над видом: {0}/{1}</span>\n        <div class=\"reset\"><button type=\"button\" class=\"primary\" data-tame=\"{2}\">Приручить</button></div></div>", [wins, need, id]);
    }
    return _t("<div class=\"ability-box\"><b>Приручение</b><span>Побед над видом: {0}/{1} — приручается после {2} побед</span></div>", [Math.min(wins, need), need, need]);
  }
  const haveNeed = (kind, tier, n) => {
    const have = Profile.res(kind, tier);
    return `<span class="need ${have >= n ? 'ok' : 'no'}">${MonsterArt.resIcon(kind, tier)}${Bestiary.RESOURCES[kind].name} ${have}/${n}</span>`;
  };

  /* =============== ЛАВКА =============== */
  const shop = {
    html() {
      const s = st.shop, sh = Profile.shop();
      let body = '';
      if (s.tab === 'buy') {
        const items = sh.stock.map((e) => {
          const it = Gear.item(e);
          return itemCard(it, _t("Цена: {0}{1}", [money(buyPrice(it.price)), levelNote(it)]), _t("<button type=\"button\" data-buy-item=\"{0}\" {1}>Купить</button>", [it.uid, Profile.data.coins >= buyPrice(it.price) ? '' : 'disabled']));
        }).join('') || _t("<p class=\"hint\">Всё раскуплено. Новые товары появятся после следующего боя.</p>");
        const qtyPicker = (kind, key, active) => `<div class="qty-picker">${QTY_STEPS.map((n) => `<button type="button" class="qs ${n === active ? 'on' : ''}" data-qty="${kind}" data-qty-key="${key}" data-qty-n="${n}">×${n}</button>`).join('')}</div>`;
        const cons = Object.entries(Gear.CONSUMABLES).filter(([, c]) => !c.alchemy).map(([k, c]) => {
          const qty = s.consQty[k] || 1, total = buyPrice(Gear.bulkPrice(consPrice(k), qty));
          return _t("<div class=\"card\" style=\"--t:#c9b48a\">{0}<div class=\"card-body\"><span class=\"item-title\">{1}</span><span class=\"item-foot\">{2}</span><span class=\"item-foot\">Цена: {3} за шт. · в ранце: {4}</span></div>\n          <div class=\"card-act\">{5}<button type=\"button\" data-buy-cons=\"{6}\" data-n=\"{7}\" {8}>Купить ×{9} за {10}</button></div></div>", [itemIcon(k), c.name, c.desc, money(buyPrice(consPrice(k))), Profile.data.backpack[k] || 0, qtyPicker('cons', k, qty), k, qty, Profile.data.coins >= total ? '' : 'disabled', qty, money(total)]);
        }).join('');
        const ak = Profile.shotKind(), AM = Ammo.CATALOG[ak], aq = s.ammoQty || Ammo.PACK, atot = buyPrice(Gear.bulkPrice(ammoPrice(ak), aq));
        const ammoCard = _t("<div class=\"card\" style=\"--t:#c9b48a\">{0}<div class=\"card-body\"><span class=\"item-title\">{1}</span><span class=\"item-foot\">{2} Выстрел хода не тратит, один за ход.</span><span class=\"item-foot\">Цена: {3} за шт. · в рюкзаке: {4}</span></div>\n          <div class=\"card-act\"><div class=\"qty-picker\">{5}</div><button type=\"button\" data-buy-ammo=\"{6}\" data-n=\"{7}\" {8}>Купить ×{9} за {10}</button></div></div>", [Ammo.icon(ak), AM.name, AM.desc, money(buyPrice(ammoPrice(ak))), Profile.ammo(ak), [5, 10, 25].map((n) => `<button type="button" class="qs ${n === aq ? 'on' : ''}" data-ammo-qty="${n}">×${n}</button>`).join(''), ak, aq, Profile.data.coins >= atot ? '' : 'disabled', aq, money(atot)]);
        const rt = Math.min(s.resTier, sh.top);
        const res = Object.entries(Bestiary.RESOURCES).map(([k]) => {
          const unit = buyPrice(Bestiary.resPrice(k, rt) * RES_BUY_MARKUP), qty = s.resQty[k] || 1, total = Gear.bulkPrice(unit, qty);
          return _t("<div class=\"card\" style=\"--t:{0}\">{1}<div class=\"card-body\"><span class=\"item-title\">{2}</span><span class=\"item-foot\">Цена: {3} за шт. · у вас: {4}</span></div>\n            <div class=\"card-act\">{5}<button type=\"button\" data-buy-res=\"{6}\" data-n=\"{7}\" {8}>Купить ×{9} за {10}</button></div></div>", [tierColor(rt), MonsterArt.resIcon(k, rt), resLabel(k, rt), money(unit), Profile.res(k, rt), qtyPicker('res', k, qty), k, qty, Profile.data.coins >= total ? '' : 'disabled', qty, money(total)]);
        }).join('');
        body = _t("<h3>Вещи (цвет растёт с уровнем героя: сейчас до «{0}»)</h3><div class=\"card-list\">{1}</div>\n          <h3>Боеприпасы вашего народа</h3><div class=\"card-list\">{2}</div>\n          <h3>Расходники</h3><div class=\"card-list\">{3}</div>\n          <h3>Ресурсы</h3>{4}<div class=\"card-list\">{5}</div>\n          <p class=\"hint\">Руны теперь продаёт Журавль-художник в Мастерской художника.</p>", [Tiers.get(sh.top).name, items, ammoCard, cons, tierPicker(sh.top, rt, 'restier'), res]);
      } else {
        const items = Profile.data.items.filter((e) => !Profile.equippedUid(e.uid)).map((e) => Gear.item(e))
          .sort((a, b) => b.tier - a.tier).map((it) =>
            itemCard(it, _t("Продать за: {0}", [money(Gear.sellValue(it.price))]), _t("<button type=\"button\" data-sell-item=\"{0}\">Продать</button>", [it.uid]))).join('') || _t("<p class=\"hint\">Нет вещей на продажу (надетые не продаются).</p>");
        const cons = Object.entries(Gear.CONSUMABLES).filter(([k]) => Profile.data.backpack[k] > 0).map(([k, c]) => _t("\n          <div class=\"card\" style=\"--t:#c9b48a\">{0}<div class=\"card-body\"><span class=\"item-title\">{1} × {2}</span><span class=\"item-foot\">За штуку: {3}</span></div>\n          <div class=\"card-act\"><button type=\"button\" data-sell-cons=\"{4}\">Продать 1</button></div></div>", [itemIcon(k), c.name, Profile.data.backpack[k], money(Gear.sellValue(consPrice(k))), k])).join('') || _t("<p class=\"hint\">Расходников нет.</p>");
        const res = Profile.resList().map((r) => {
          const p = Bestiary.resPrice(r.kind, r.tier);
          return _t("<div class=\"card\" style=\"--t:{0}\">{1}<div class=\"card-body\"><span class=\"item-title\">{2} × {3}</span><span class=\"item-foot\">За штуку: {4}</span></div>\n            <div class=\"card-act\"><button type=\"button\" data-sell-res=\"{5}:{6}\" data-n=\"1\">×1</button><button type=\"button\" data-sell-res=\"{7}:{8}\" data-n=\"all\">Все</button></div></div>", [tierColor(r.tier), MonsterArt.resIcon(r.kind, r.tier), resLabel(r.kind, r.tier), r.n, money(p), r.kind, r.tier, r.kind, r.tier]);
        }).join('') || _t("<p class=\"hint\">Ресурсов нет. Они выпадают из монстров.</p>");
        body = _t("<h3>Вещи</h3><div class=\"card-list\">{0}</div><h3>Расходники</h3><div class=\"card-list\">{1}</div><h3>Ресурсы</h3><div class=\"card-list\">{2}</div>", [items, cons, res]);
      }
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Лавка\">{0}{1}\n        <div class=\"screen-body tavern-body\"{2}>{3}{4}</div></div>", [head(_t("Лавка")), tabs([['buy', _t("Купить")], ['sell', _t("Продать")]], s.tab), sceneStyle('shop'), s.msg ? `<div class="gear-toast">${s.msg}</div>` : '', body]);
    },
    click(b) {
      const s = st.shop, d = b.dataset;
      if (d.tab) { s.tab = d.tab; s.msg = ''; return render(); }
      if (d.restier) { s.resTier = Number(d.restier); return render(); }
      if (d.qty) {
        const store = d.qty === 'cons' ? s.consQty : s.resQty;
        store[d.qtyKey] = Number(d.qtyN);
        return render();
      }
      if (d.buyItem) {
        const e = Profile.shop().stock.find((x) => x.uid === d.buyItem), it = Gear.item(e);
        if (!Profile.spend(buyPrice(it.price))) return;
        Profile.removeFromShop(e.uid); Profile.addItem(e);
        s.msg = _t("Куплено: {0} ({1})", [it.name, Tiers.get(it.tier).name]);
        return changed();
      }
      if (d.ammoQty) { s.ammoQty = Number(d.ammoQty); return render(); }
      if (d.buyAmmo) {
        const n = Math.max(1, Number(d.n) || 1), total = buyPrice(Gear.bulkPrice(ammoPrice(d.buyAmmo), n));
        if (!Profile.spend(total)) return;
        Profile.addAmmo(d.buyAmmo, n);
        s.msg = _t("Куплено: {0} × {1}", [Ammo.CATALOG[d.buyAmmo].name, n]);
        return changed();
      }
      if (d.buyCons) {
        const c = Gear.CONSUMABLES[d.buyCons], n = Math.max(1, Number(d.n) || 1), total = buyPrice(Gear.bulkPrice(consPrice(d.buyCons), n));
        if (!Profile.spend(total)) return;
        Profile.addConsumable(d.buyCons, n);
        s.msg = _t("Куплено: {0} × {1}", [c.name, n]);
        return changed();
      }
      if (d.buyRes) {
        const n = Math.max(1, Number(d.n) || 1), rt = Math.min(s.resTier, Profile.shop().top);
        const total = Gear.bulkPrice(buyPrice(Bestiary.resPrice(d.buyRes, rt) * RES_BUY_MARKUP), n);
        if (!Profile.spend(total)) return;
        Profile.addRes(d.buyRes, rt, n);
        s.msg = _t("Куплено: {0} × {1}", [resLabel(d.buyRes, rt), n]);
        return changed();
      }
      if (d.sellItem) {
        const it = Gear.item(Profile.item(d.sellItem));
        Profile.removeItem(d.sellItem);
        Profile.addCoins(Gear.sellValue(it.price));
        s.msg = _t("Продано: {0}", [it.name]);
        return changed();
      }
      if (d.sellCons) {
        const c = Gear.CONSUMABLES[d.sellCons];
        if (!(Profile.data.backpack[d.sellCons] > 0)) return;
        Profile.data.backpack[d.sellCons]--;
        Profile.addCoins(Gear.sellValue(consPrice(d.sellCons)));
        s.msg = _t("Продано: {0}", [c.name]);
        return changed();
      }
      if (d.sellRes) {
        const [kind, tier] = d.sellRes.split(':'), have = Profile.res(kind, Number(tier));
        const n = d.n === 'all' ? have : 1;
        if (!Profile.takeRes(kind, Number(tier), n)) return;
        Profile.addCoins(Bestiary.resPrice(kind, Number(tier)) * n);
        s.msg = _t("Продано: {0} × {1}", [resLabel(kind, Number(tier)), n]);
        return changed();
      }
    },
  };

  /* =============== КУЗНИЦА =============== */
  const FILTERS = [
    ['weapon', _t("Оружие"), (t) => t === 'weapon1' || t === 'weapon2'], ['shield', _t("Щиты"), (t) => t === 'shield'],
    ['head', _t("Шлемы"), (t) => t === 'head'], ['chest', _t("Нагрудники"), (t) => t === 'chest'], ['arms', _t("Наручи"), (t) => t === 'arms'],
    ['shoulders', _t("Наплечники"), (t) => t === 'shoulders'], ['gloves', _t("Перчатки"), (t) => t === 'gloves'],
    ['legs', _t("Поножи"), (t) => t === 'legs'], ['amulet', _t("Амулеты"), (t) => t === 'amulet'], ['bag', _t("Сумки"), (t) => t === 'bag'], ['leash', _t("Поводки"), (t) => t === 'leash'], ['compass', _t("Компасы"), (t) => t === 'compass'], ['ranged', _t("Метательное"), (t) => t === 'ranged'],
  ];
  const costHtml = (c) => _t("<div class=\"costs\"><span class=\"need {0}\">Монеты: {1}</span>{2}</div>", [Profile.data.coins >= c.coins ? 'ok' : 'no', money(c.coins), c.res.map((r) => haveNeed(r.kind, r.tier, r.n)).join('')]);
  const canPay = (c) => Profile.data.coins >= c.coins && c.res.every((r) => Profile.res(r.kind, r.tier) >= r.n);
  const pay = (c) => { Profile.spend(c.coins); for (const r of c.res) Profile.takeRes(r.kind, r.tier, r.n); };

  const forge = {
    html() {
      const s = st.forge;
      let body = '';
      if (s.tab === 'upgrade') {
        const items = Profile.data.items.map((e) => Gear.item(e)).sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name));
        if (!s.sel || !Profile.item(s.sel)) s.sel = items[0] ? items[0].uid : null;
        const list = items.map((it) => `<button type="button" class="itembtn ${s.sel === it.uid ? 'on' : ''}" data-pick="${it.uid}">${itemCard(it, Profile.equippedUid(it.uid) ? _t("надет") : '')}</button>`).join('') || _t("<p class=\"hint\">У вас нет вещей.</p>");
        let detail = _t("<p class=\"hint\">Выберите вещь слева.</p>");
        if (s.sel) {
          const it = Gear.item(Profile.item(s.sel)), cost = forgeCost(Gear.upgradeCost(Profile.item(s.sel)));
          if (!cost) detail = _t("{0}<p class=\"hint\">Эта вещь уже Обсидиановая — выше улучшать некуда.</p>", [itemCard(it, _t("Максимальный уровень"))]);
          else {
            const next = Gear.item({ ...Profile.item(s.sel), tier: it.tier + 1 });
            const lvlWarn = Hero.canWear(next.tier, Profile.level()) ? '' : _t("<p class=\"hint warn\">Вещь цвета «{0}» можно надеть с {1}-го уровня.</p>", [Tiers.get(next.tier).name, Hero.itemLevel(next.tier)]);
            const worn = Profile.equippedUid(it.uid), locked = worn && !canEditGear();
            detail = _t("{0}<div class=\"arrow-down\">повышение до {1}</div>{2}\n              <h3>Стоимость (ресурсы того же цвета, что у вещи)</h3>{3}{4}\n              {5}\n              <div class=\"reset\"><button type=\"button\" data-do-upgrade=\"1\" {6}>Улучшить</button></div>", [itemCard(it, _t("Сейчас")), tierChip(next.tier), itemCard(next, _t("В очках снаряжения: {0} → {1}", [it.cost, next.cost])), costHtml(cost), lvlWarn, locked ? _t("<p class=\"hint warn\">Надетую вещь можно улучшать до первого хода боя или после его окончания.</p>") : '', canPay(cost) && !locked ? '' : 'disabled']);
          }
        }
        body = `<div class="two-col"><div class="item-list tall">${list}</div><div>${detail}</div></div>`;
      } else if (s.tab === 'ammo') {
        const ak = Profile.shotKind(), AM = Ammo.CATALOG[ak], top = Hero.tierFor(Profile.level());
        const C = Ammo.CRAFT, fee = Math.round(ammoPrice(ak) * 0.3);
        const lo = Math.max(1, top - 1);
        const ok = Profile.resList().filter((r) => r.tier >= lo && r.n >= C.res);
        const list = ok.map((r) => _t("<div class=\"card\" style=\"--t:{0}\">{1}<div class=\"card-body\"><span class=\"item-title\">{2} × {3} → {4} × {5}</span><span class=\"item-foot\">У вас: {6} · работа кузнеца: {7}</span></div>\n          <div class=\"card-act\"><button type=\"button\" data-craft-ammo=\"{8}:{9}\" {10}>Изготовить</button></div></div>", [tierColor(r.tier), MonsterArt.resIcon(r.kind, r.tier), C.res, resLabel(r.kind, r.tier), C.out, AM.short, r.n, money(fee), r.kind, r.tier, Profile.data.coins >= fee ? '' : 'disabled'])).join('')
          || _t("<p class=\"hint\">Нужно {0} одинаковых ресурса цвета «{1}» или выше — они выпадают из существ.</p>", [C.res, Tiers.get(lo).name]);
        body = _t("<div class=\"card\" style=\"--t:#c9b48a\">{0}<div class=\"card-body\"><span class=\"item-title\">{1} · в рюкзаке {2}</span><span class=\"item-foot\">{3}</span></div></div>\n          <h3>Изготовить из ресурсов</h3><div class=\"card-list\">{4}</div>", [Ammo.icon(ak), AM.name, Profile.ammo(ak), AM.desc, list]);
      } else {
        const f = FILTERS.find((x) => x[0] === s.filter);
        const top = Hero.tierFor(Profile.level());
        if (!s.craftTier || s.craftTier > top) s.craftTier = top;
        const ct = s.craftTier;
        const bases = Gear.itemsFor(Profile.data.faction).filter((b) => f[2](b.type)).sort((a, b) => a.cost - b.cost);
        const list = bases.map((b) => {
          const it = Gear.item({ id: b.id, tier: ct }), cost = forgeCost(Gear.craftCost(b.id, ct));
          return `<div>${itemCard(it, _t("{0} · из ресурсов цвета «{1}»", [Gear.RARITY_NAMES[b.rarity], Tiers.get(ct).name]), _t("<button type=\"button\" data-craft=\"{0}\" {1}>Создать</button>", [b.id, canPay(cost) ? '' : 'disabled']))}${costHtml(cost)}</div>`;
        }).join('');
        body = _t("<div class=\"tabs sub\">{0}</div>\n          <p class=\"hint\">Цвет новой вещи (до цвета вашего уровня):</p>{1}<div class=\"card-list\">{2}</div>", [FILTERS.map(([k, label]) => `<button type="button" class="${k === s.filter ? 'on' : ''}" data-filter="${k}">${label}</button>`).join(''), tierPicker(top, ct, 'crafttier'), list]);
      }
      const res = Profile.resList().map((r) => `<span class="need ok">${MonsterArt.resIcon(r.kind, r.tier)}${resLabel(r.kind, r.tier)} × ${r.n}</span>`).join('') || _t("<span class=\"hint\">Ресурсов нет</span>");
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Кузница\">{0}{1}\n        <div class=\"screen-body tavern-body\"{2}>{3}<div class=\"stock-line\">Ваши ресурсы: {4}</div>{5}</div></div>", [head(_t("Кузница")), tabs([['upgrade', _t("Улучшить цвет")], ['craft', _t("Создать вещь")], ['ammo', _t("Боеприпасы")]], s.tab), sceneStyle('forge'), s.msg ? `<div class="gear-toast">${s.msg}</div>` : '', res, body]);
    },
    click(b) {
      const s = st.forge, d = b.dataset;
      if (d.tab) { s.tab = d.tab; s.msg = ''; return render(); }
      if (d.filter) { s.filter = d.filter; return render(); }
      if (d.crafttier) { s.craftTier = Number(d.crafttier); return render(); }
      if (d.pick) { s.sel = d.pick; s.msg = ''; return render(); }
      if (d.doUpgrade) {
        const e = Profile.item(s.sel), cost = forgeCost(Gear.upgradeCost(e));
        if (!cost || !canPay(cost)) return;
        pay(cost);
        e.tier++;
        Profile.save();
        const it = Gear.item(e);
        s.msg = _t("Улучшено: {0} — теперь {1}", [it.name, Tiers.get(it.tier).name]);
        // если вещь надета и очки превышены — снимаем её
        const worn = Profile.equippedUid(e.uid);
        if (worn && !Hero.canWear(e.tier, Profile.level())) {
          Profile.data.loadout[worn] = null;
          Profile.save();
          s.msg += _t(". Такой цвет можно надеть только с {0}-го уровня — вещь снята в рюкзак", [Hero.itemLevel(e.tier)]);
        } else if (worn && Gear.totalCost(Profile.gear()) > Profile.budget()) {
          Profile.data.loadout[worn] = null;
          Profile.save();
          s.msg += _t(". Лимит очков превышен — вещь снята");
        }
        onGearChanged();
        return changed();
      }
      if (d.craftAmmo) {
        const [kind, tier] = d.craftAmmo.split(':'), ak = Profile.shotKind(), fee = Math.round(ammoPrice(ak) * 0.3);
        if (Profile.data.coins < fee || !Profile.takeRes(kind, Number(tier), Ammo.CRAFT.res)) return;
        Profile.spend(fee);
        Profile.addAmmo(ak, Ammo.CRAFT.out);
        s.msg = _t("Изготовлено: {0} × {1}", [Ammo.CATALOG[ak].name, Ammo.CRAFT.out]);
        return changed();
      }
      if (d.craft) {
        const cost = forgeCost(Gear.craftCost(d.craft, s.craftTier || 1));
        if (!canPay(cost)) return;
        pay(cost);
        const e = Gear.makeEntry(d.craft, s.craftTier || 1);
        Profile.addItem(e);
        s.msg = _t("Создано: {0}", [Gear.item(e).name]);
        return changed();
      }
    },
  };

  /* =============== БЕСТИАРИЙ =============== */
  const best = {
    html() {
      const s = st.best, known = Profile.species();
      if (!known.length) {
        return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Бестиарий\">{0}<div class=\"screen-body\">\n          <p class=\"hint\">Вы ещё не встретили ни одного существа. Выйдите за частокол деревни — существа, которых вы увидите на карте, попадут в бестиарий.</p></div></div>", [head(_t("Бестиарий"))]);
      }
      if (!s.sel || !known.includes(s.sel)) s.sel = Profile.data.monster.id in Bestiary.MONSTERS && known.includes(Profile.data.monster.id) ? Profile.data.monster.id : known[0];
      const maxT = Profile.maxTier(s.sel);
      s.tier = Math.max(1, Math.min(s.tier, maxT));
      const ordered = [...Bestiary.ORDER.filter((x) => known.includes(x)), ...Bestiary.ORDER.filter((x) => !known.includes(x) && HexMap.SPAWN[x])];   // неизвестные — в конец (скрытых вроде щуки в списке нет)
      const list = ordered.map((id) => {
        const m = Bestiary.MONSTERS[id], open = known.includes(id);
        return open
          ? _t("<button type=\"button\" class=\"beast {0}\" data-species=\"{1}\"><span class=\"beast-art\">{2}</span><span><b>{3}</b><small>открыт уровень {4}</small></span></button>", [s.sel === id ? 'on' : '', id, MonsterArt.has(id) ? MonsterArt.bust(id, Profile.maxTier(id)) : Figures.avatar('dragon', null), m.name, Profile.maxTier(id)])
          : _t("<div class=\"beast locked\"><span class=\"beast-art sil\">{0}</span><span><b>???</b><small>встречается в зонах {1}</small></span></div>", [MonsterArt.has(id) ? MonsterArt.bust(id, 1) : Figures.avatar('dragon', null), HexMap.SPAWN[id].tiers.join('–')]);
      }).join('');
      const m = Bestiary.MONSTERS[s.sel], sc = Bestiary.scaled(s.sel, s.tier);
      const art = MonsterArt.has(s.sel) ? MonsterArt.bust(s.sel, s.tier) : `<div class="dragon-art" style="--t:${tierColor(s.tier)}">${Figures.avatar('dragon', null)}</div>`;
      const drops = m.drops.map(([kind, chance, min, max]) => _t("<div class=\"bag-row\">{0}<span><b>{1}</b> · {2}% · {3} шт.</span></div>", [MonsterArt.resIcon(kind, s.tier), resLabel(kind, s.tier), Math.round(chance * 100), min === max ? min : min + '–' + max])).join('');
      const coins = Math.round(m.coins * Tiers.PRICE_MULT[s.tier - 1]);
      const innate = Object.entries(sc.stats).filter(([, v]) => v > 0).map(([k, v]) => `<span class="chip">${fmtStat(k, v)}</span>`).join('') || _t("<span class=\"hint\">нет</span>");
      const onMap = !inBattle;
      const L = Profile.level(), myS = Gear.combine(Gear.combine(Gear.statsFor(Profile.gear(), Profile.level()), Factions.statsAt(Profile.data.faction || 'dwarf', Hero.tierFloat(L))), Runes.bonusForGear(Profile.gear()));
      const pWin = Combat.winChance({ max: Hero.baseHp(L) + myS.health, dmg: Hero.dmgMult(L), stats: myS }, { max: sc.hp, dmg: sc.dmg, stats: sc.stats, ai: sc.ai }, s.sel);
      const danger = { label: { easy: _t("Лёгкий"), even: _t("Равный"), hard: _t("Опасный"), deadly: _t("Смертельный") }[Combat.dangerBand(pWin)], pct: Math.round(pWin * 100) };
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Бестиарий\">{0}\n        <div class=\"screen-body two-col beast-layout\"{1}><div class=\"beast-list\">{2}</div>\n        <div class=\"beast-detail\" style=\"--t:{3}\">\n          <div class=\"beast-hero\">{4}</div>\n          <h3 class=\"beast-name\">{5} {6}</h3><p class=\"hint\"><b>{7}.</b> {8}</p>\n          <div class=\"ability-box\"><b>Приём: {9}</b><span>{10}</span></div>\n          {11}\n          {12}<small class=\"hint\">Доступны цвета, которые вы встречали. Чем дальше от деревни, тем выше цвет.</small>\n          <div class=\"stat-list\"><div><span>ХП</span><b>{13}</b><small>здоровье существа</small></div><div><span>Уровень ИИ</span><b>{14}</b><small>глубина и точность ходов</small></div>{15}\n            <div><span>Опыт</span><b>+{16}</b><small>за победу на вашем уровне</small></div>\n            <div><span>Для вас</span><b>{17}</b><small>шанс победы ~{18}%</small></div></div>\n          <h3>Врождённые свойства</h3><div class=\"chips\">{19}</div>\n          <h3>Добыча</h3><div class=\"bag-row\"><span>Монеты: {20} (примерно)</span></div>{21}<div class=\"bag-row\"><span>Шанс {22}%: вещь, чаще обычная</span></div>\n          {23}\n        </div></div></div>", [head(_t("Бестиарий")), sceneStyle('hunter'), list, tierColor(s.tier), art, m.name, tierChip(s.tier), m.family, m.desc, Bestiary.ability(s.sel).name, Bestiary.ability(s.sel).desc, tameBox(s.sel), tierPicker(maxT, s.tier, 'tier'), sc.hp, sc.ai, sc.gearBudget ? _t("<div><span>Снаряжение</span><b>{0}</b><small>очков: доспехи и оружие</small></div>", [sc.gearBudget]) : '', Hero.xpReward(m, s.tier, Profile.level()), danger.label, danger.pct, innate, money(coins), drops, Math.round(Balance.rewards.itemChance * 100), onMap ? _t("<div class=\"reset\"><button type=\"button\" class=\"primary\" data-show=\"1\">Показать на карте</button></div>") : '']);
    },
    click(b) {
      const s = st.best, d = b.dataset;
      if (d.species) { s.sel = d.species; s.tier = Math.min(s.tier, Profile.maxTier(s.sel)); return render(); }
      if (d.tier) { s.tier = Number(d.tier); return render(); }
      if (d.show) {
        close();
        MapView.focusSpecies(s.sel);
      }
      if (d.tame) { if (Profile.tame(d.tame, s.tier)) render(); return; }
      if (d.repairPet) { Profile.repairPet(); return render(); }
    },
  };

  /* =============== ФРАКЦИЯ (и первая регистрация: ник, пол, фракция) ===============
     При первом запуске (s.first) — два шага: 'crest' (только гербы, выбор фракции) и 'detail'
     (герои выбранной фракции, оба пола, ник и «Начать игру»). Вне первого запуска (смена фракции
     из Ратуши) — как раньше, один экран сразу со всеми фракциями, без ника и пола. */
  const factionCrest = (id) => {
    const f = Factions.LIST[id], chosen = st.fac.picked === id;
    const art = (typeof Art !== 'undefined' && Art.has('ui/emblem-' + id))
      ? `<img class="fac-crest-img" src="${Art.url('ui/emblem-' + id)}" alt="">` : factionIcon(id, 'fac-crest-icon');
    return `<button type="button" class="fac-crest ${chosen ? 'on' : ''}" style="--fc:${f.color}" data-pick-faction="${id}">
      ${art}<b>${f.name}</b><small>${f.people}</small></button>`;
  };
  const faction = {
    html() {
      const s = st.fac, curF = Profile.data.faction;
      if (s.first && s.step !== 'detail') {
        const cards = Factions.ORDER.map((id) => factionCrest(id)).join('');
        // 1.2.8: фон приветствия — иллюстрация деревни и округи (ui/map-overview), если есть
        const wscene = (typeof Art !== 'undefined' && Art.has('ui/map-overview'))
          ? ` style="background-image:linear-gradient(180deg, rgba(20,16,10,.25), rgba(20,16,10,.7)), url('${Art.url('ui/map-overview')}');background-size:cover;background-position:center"` : '';
        return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Добро пожаловать!\"><header><h2>Добро пожаловать!</h2></header>\n          <div class=\"screen-body\"{0}>\n            <p class=\"hint\">Мир «Грань»: Великий кристалл раскололся, и народы спорят за его осколки — камни на поле боя. Выберите герб фракции, за которую хотите играть.</p>\n            <div class=\"fac-crest-grid\">{1}</div>\n          </div></div>", [wscene, cards]);
      }
      const draftGender = s.first ? s.gender : Profile.data.gender;
      const ids = s.first ? [s.picked] : Factions.ORDER;
      const cards = ids.map((id) => {
        const f = Factions.LIST[id];
        const stats = Object.entries(f.stats).map(([k, v]) => `<span class="chip">${fmtStat(k, v)}</span>`).join('');
        const chosen = s.first ? true : curF === id;
        const fig = Figures.figure(Factions.heroKind(id, draftGender || 'm'), !s.first && chosen ? Profile.gear() : null);
        const genderBtns = _t("<button type=\"button\" class=\"primary {0}\" data-gender=\"m\">Мужской</button><button type=\"button\" class=\"primary {1}\" data-gender=\"f\">Женский</button>", [s.gender === 'm' ? 'on' : '', s.gender === 'f' ? 'on' : '']);
        const btn = s.first ? `<div class="gender-pick">${genderBtns}</div>`
          : `<button type="button" class="primary" data-faction="${id}" ${chosen ? 'disabled' : ''}>${chosen ? _t("Ваша фракция") : _t("Выбрать")}</button>`;
        return _t("<div class=\"fac-card {0} {1}\" style=\"--fc:{2}\">\n          <div class=\"fac-fig\">{3}</div>\n          <div class=\"fac-body\">\n            <div class=\"fac-head\">{4}<span><b>{5}</b><small>{6} · герой: {7}</small></span></div>\n            <p class=\"hint\">{8}</p>\n            <div class=\"fac-row\"><span class=\"fac-gem\">{9}</span><span>Родной камень: <b>{10}</b> — заряжает приём</span></div>\n            <div class=\"ability-box\"><b>Приём «{11}»</b><span>{12}. Ход не тратит.</span></div>\n            <div class=\"chips\">{13}</div>\n            <p class=\"hint\">{14}</p>\n            {15}\n          </div></div>", [s.first ? 'pick-mode' : '', chosen ? 'on' : '', f.color, fig, factionIcon(id, 'fac-emblem'), f.name, f.people, Factions.heroTitle(id, draftGender || 'm'), f.desc, GEM_SVG[f.gem], GEM_NAMES[f.gem], f.ability.name, f.ability.desc, stats, f.perkText, btn]);
      }).join('');
      const title = s.first ? _t("{0}: выберите героя", [Factions.LIST[s.picked].name]) : _t("Фракция");
      const lead = s.first
        ? _t("Представьтесь и выберите, кем вы будете играть.")
        : _t("Сменить фракцию можно в любой момент в Ратуше. Вещи чужой фракции при этом снимаются.");
      const backBtn = s.first ? _t("<button type=\"button\" class=\"close\" data-act=\"back\">← Назад к гербам</button>") : '';
      const reg = s.first ? _t("<div class=\"reg-row\">\n          <label class=\"reg-field\"><span>Ваш ник</span><input type=\"text\" maxlength=\"20\" placeholder=\"Как вас называть?\" value=\"{0}\" data-nick></label>\n          <button type=\"button\" class=\"link-btn\" data-random-name=\"1\">Не знаю, как назваться → случайное имя</button>\n        </div>", [escText(s.name)]) : '';
      const startBtn = s.first ? _t("<div class=\"reset\"><button type=\"button\" class=\"primary\" data-act=\"start\" {0}>Начать игру!</button></div>", [canStartGame() ? '' : 'disabled']) : '';
      return `<div class="modal" role="dialog" aria-label="${title}"><header>${backBtn}<h2>${title}</h2>${s.first ? '' : _t("<button type=\"button\" class=\"close\" data-act=\"close\">Закрыть</button>")}</header>
        <div class="screen-body"><p class="hint">${lead}</p>${reg}${s.msg ? `<div class="gear-toast">${s.msg}</div>` : ''}<div class="fac-grid">${cards}</div>${startBtn}</div></div>`;
    },
    click(b) {
      const s = st.fac, d = b.dataset;
      if (d.pickFaction) { s.picked = d.pickFaction; if (s.first) s.step = 'detail'; return render(); }
      if (d.act === 'back') { s.step = 'crest'; return render(); }
      if (d.gender) { s.gender = d.gender; return render(); }
      if (d.randomName) { s.name = Names.randomStarName(); return render(); }
      if (d.act === 'start') {
        if (!canStartGame()) return;
        Profile.data.name = s.name.trim();
        Profile.data.gender = s.gender;
        chooseFaction(s.picked);
        s.first = false;
        close();
        if (typeof Tutorial !== 'undefined') Tutorial.maybeAutoStart();   // новый герой — сразу к Бобру на обучение
        return;
      }
      if (!d.faction) return;
      chooseFaction(d.faction);
      close();
    },
  };

  /* =============== ТАВЕРНА (гоблин-трактирщик и его задания) =============== */
  const GOBLIN_LINES = [
    _t("Присаживайся, путник. Сорок лет наливаю эль и слушаю байки — со мной не соскучишься."),
    _t("За частоколом неспокойно, но такому, как ты, найдётся, чем поживиться. Дам пару советов задаром."),
    _t("Кружку с дороги? А, снаряжения на кружку не хватает — тогда вот с чем могу помочь."),
  ];
  const tavern = {
    html() {
      const s = st.tavern;
      const portrait = (typeof Art !== 'undefined' && Art.hasNpc('goblin-tavern'))
        ? Art.npcPortrait('goblin-tavern')
        : `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#241d15"/>
            <circle cx="50" cy="58" r="30" fill="#7a9a52"/><circle cx="38" cy="52" r="5" fill="#1c1c1c"/><circle cx="62" cy="52" r="5" fill="#1c1c1c"/>
            <path d="M36 70 Q50 82 64 70" stroke="#1c1c1c" stroke-width="3" fill="none" stroke-linecap="round"/>
            <path d="M20 44 L34 30 M80 44 L66 30" stroke="#5f7d3e" stroke-width="8" stroke-linecap="round"/></svg>`;
      const quests = questCards('tavern');
      const scene = (typeof Art !== 'undefined' && Art.hasScene('tavern'))
        ? ` style="background-image:linear-gradient(180deg, rgba(20,16,10,.55), rgba(20,16,10,.85)), url('${Art.sceneUrl('tavern')}');background-size:cover;background-position:center"` : '';
      // Билет лотереи: один в день, «беспроигрышный» — какой-то приз выпадает всегда (см. js/daily.js про баланс).
      const price = Daily.ticketPrice(), bought = !Daily.canBuyTicket(Profile.data);
      const ticketAct = bought ? _t("<span class=\"badge done\">Билет на сегодня уже куплен</span>")
        : _t("<button type=\"button\" class=\"primary\" data-buy-ticket=\"1\" {0}>Купить билет</button>", [Profile.data.coins >= price ? '' : 'disabled']);
      const lottery = _t("<h3>Лотерея</h3><div class=\"cards\"><div class=\"card quest-card\">\n          <div class=\"card-body\"><span class=\"item-title\">Билет удачи</span>\n            <span class=\"item-foot\">Один билет в день — приз выпадает всегда: ресурсы, монеты, расходник, реже вещь, совсем редко — джекпот.</span>\n            <span class=\"item-foot quest-reward\">Цена: {0}</span></div>\n          <div class=\"card-act\">{1}</div></div></div>", [money(price), ticketAct]);
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Таверна\">{0}\n        <div class=\"screen-body tavern-body\"{1}>\n          <div class=\"npc-row\"><span class=\"npc-portrait\">{2}</span>\n            <div class=\"npc-say\"><b>Старый гоблин-трактирщик</b><p class=\"hint\">{3}</p></div></div>\n          <h3>Задания</h3><div class=\"cards\">{4}</div>{5}\n        </div></div>", [head(_t("Таверна")), scene, portrait, s.msg || GOBLIN_LINES[0], quests, lottery]);
    },
    click(b) {
      if (b.dataset.buyTicket) {
        const r = Daily.buyTicket();
        st.tavern.msg = r.ok ? _t("Билет сыграл: {0}! {1}", [r.text, GOBLIN_LINES[2]])
          : r.reason === 'coins' ? _t("Не хватает монет на билет — приходи, как разбогатеешь.")
          : _t("Билет на сегодня уже куплен — заходи завтра.");
        return changed();
      }
      questClick(b, 'tavern');
    },
  };

  // Общий рендер карточек заданий одного собеседника (giver — 'tavern' | 'mill').
  function questCards(giver) {
    return Quests.list(Profile.data, giver).map((q) => {
      let act;
      if (q.claimed) act = _t("<span class=\"badge done\">Получено</span>");
      else if (!q.accepted) act = _t("<button type=\"button\" class=\"primary\" data-accept=\"{0}\">Взять задание</button>", [q.id]);
      else if (q.done) act = _t("<button type=\"button\" class=\"primary\" data-claim=\"{0}\">Забрать награду</button>", [q.id]);
      else act = `<span class="quest-progress">${q.value} / ${q.goal}</span>`;
      return _t("<div class=\"card quest-card {0}\">\n        <div class=\"card-body\"><span class=\"item-title\">{1}</span><span class=\"item-foot\">{2}</span>\n          <span class=\"item-foot quest-reward\">Награда: {3}</span></div>\n        <div class=\"card-act\">{4}</div></div>", [q.claimed ? 'is-done' : '', q.title, q.desc, q.rewardText, act]);
    }).join('');
  }
  // Общий обработчик клика «Взять задание» / «Забрать награду» для экранов с заданиями. giver задаёт текст ответа.
  // Особые реплики отдельных поручений (иначе — общие по персонажу)
  const QUEST_SAY = {
    accept: {
      'jk-keyshard': _t("Ключ, говоришь? Дело нехитрое: тащи десяток ненужного хлама, я из железок скую. Рубины на камнях ждать не любят."),
      'lh-three': _t("Три сундука на берегу — сапфировый, рубиновый и изумрудный. Открой все, и я расскажу про четвёртый."),
      'lh-diary': _t("Капитан сам расскажет, где что лежит — если его как следует попросить. Дневник всегда при нём."),
    },
    claim: {
      'jk-keyshard': _t("Ха! Десяток — как договаривались. Вот ключ: ржавый, зато крепкий. Рубиновый сундук на восточных камнях — твой."),
      'lh-three': _t("Все три открыты! Теперь слушай: под бригантиной, на дне, лежит серебряный сундук с обсидианом. Но без дневника Капитана туда не нырнуть."),
      'lh-diary': _t("Дневник! Тётушка Жабка по его записям сварит зелье подводного дыхания. А там уж и щуку навестишь."),
    },
  };
  const JUNKER_SALE = [
    _t("Забрал: %n. Железка к железке — глядишь, и ключ выйдет."),
    _t("%n? Сойдёт. Всё, что блестит, я в дело пущу. Остальное — в переплавку."),
    _t("Взял %n. Хлам для одних — клад для другого, вот мой девиз."),
    _t("Ага, %n. Не жалей, вещи без дела только пыль собирают."),
  ];
  function questClick(b, giver) {
    const d = b.dataset;
    if (d.accept) {
      if (!Quests.accept(d.accept)) return;
      st[giver].msg = QUEST_SAY.accept[d.accept] || giver === 'lighthouse' ? _t("Добро. Огонь горит — вернёшься, когда управишься.") : giver === 'mill' ? _t("Заметано — как сделаешь, возвращайся за наградой.") : _t("По рукам. Сделаешь — возвращайся, не обижу.");
      changed();
      return;
    }
    if (!d.claim) return;
    const q = Quests.find(d.claim);
    if (!Quests.claim(d.claim)) return;
    const line = QUEST_SAY.claim[d.claim] || giver === 'lighthouse' ? (QUEST_SAY.claim[d.claim] || (q.reward.key ? _t("Вот ключ. Сундук на бригантине у восточного берега — не потеряй.") : _t("Держи — {0}. Море тебя не забудет.", [q.rewardText.toLowerCase()]))) : giver === 'mill' ? _t("Держи — {0}. И заходи ещё, дело для тебя найдётся.", [q.rewardText.toLowerCase()])
      : _t("Держи — {0}. И заглядывай ещё, дело найдётся.", [q.rewardText.toLowerCase()]);
    st[giver].msg = line;
    changed();
  }

  /* =============== МЕЛЬНИЦА (мельник-мыш и его задания) =============== */
  const MOUSE_LINES = [
    _t("Заходи, заходи — мука свежая, жернова не скрипят. Тут для всякого дело найдётся."),
    _t("У нас в деревне без дела никто не сидит — даже мышь при работе. Помогу, чем смогу."),
    _t("Зерно берегу с осени, на всех хватит. А тебе, гляжу, амулет бы посерьёзнее не помешал."),
  ];
  const mill = {
    html() {
      const s = st.mill;
      const portrait = (typeof Art !== 'undefined' && Art.hasNpc('mouse-mill'))
        ? Art.npcPortrait('mouse-mill')
        : `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#241d15"/>
            <circle cx="28" cy="28" r="13" fill="#cdbca3"/><circle cx="72" cy="28" r="13" fill="#cdbca3"/>
            <circle cx="28" cy="28" r="6.5" fill="#e6c3c8"/><circle cx="72" cy="28" r="6.5" fill="#e6c3c8"/>
            <circle cx="50" cy="57" r="29" fill="#d9c7ab"/><circle cx="42" cy="52" r="4.2" fill="#1c1c1c"/><circle cx="58" cy="52" r="4.2" fill="#1c1c1c"/>
            <ellipse cx="50" cy="61" rx="4.5" ry="3.2" fill="#e08a9a"/>
            <path d="M18 60 L38 58 M18 67 L38 63 M82 60 L62 58 M82 67 L62 63" stroke="#a99878" stroke-width="1.4" stroke-linecap="round"/></svg>`;
      const quests = questCards('mill');
      const scene = (typeof Art !== 'undefined' && Art.hasScene('mill'))
        ? ` style="background-image:linear-gradient(180deg, rgba(20,16,10,.55), rgba(20,16,10,.85)), url('${Art.sceneUrl('mill')}');background-size:cover;background-position:center"` : '';
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Мельница\">{0}\n        <div class=\"screen-body tavern-body mill-body\"{1}>\n          <div class=\"npc-row\"><span class=\"npc-portrait\">{2}</span>\n            <div class=\"npc-say\"><b>Мельник-мыш</b><p class=\"hint\">{3}</p></div></div>\n          <h3>Задания</h3><div class=\"cards\">{4}</div>\n        </div></div>", [head(_t("Мельница")), scene, portrait, s.msg || MOUSE_LINES[0], quests]);
    },
    click(b) { questClick(b, 'mill'); },
  };

  /* =============== МАЯК (тюлень-смотритель) и БРИГАНТИНА (сундук) — версия 1.1.10 =============== */
  const SEAL_LINES = [
    _t("Ух-х, гость! Огонь я берегу уже тридцать зим. Рыбаки спят спокойно, пока он горит. Поможешь — отплачу."),
    _t("Туман ползёт с моря, а я свечу. Береговая нечисть боится луча — но на одном луче дело не держится."),
    _t("На восточном берегу лежит бригантина. Сундук в ней заперт, а ключ у меня. Заслужи — отдам."),
  ];
  const sealLine = () => {
    const d = Profile.data;
    if (d.xchests && d.xchests.obsidian) return _t("Серебряный сундук твой. Больше нам с морем делить нечего — разве что чай.");
    if (d.breath) return _t("Дыхание готово? Ныряй к серебряному сундуку у бригантины. Щука там старая и злая — течение сковывает камни.");
    if (d.diary) return _t("Дневник у тебя? Отнеси тётушке Жабке: «Зелье подводного дыхания» варится по его записям.");
    if (chestsOpenedCount() >= 3) return _t("Три сундука открыты! Теперь слушай: под бригантиной в воде лежит ещё один, серебряный, с обсидианом. Сначала добудь у Капитана его дневник.");
    if (d.chestKey) return SEAL_LINES[2] + _t(" Ещё два сундука лежат на берегу: рубиновый — ключ у старьёвщика, изумрудный — ключ сварит алхимик.");
    return SEAL_LINES[0];
  };
  const chestsOpenedCount = () => { const d = Profile.data; return (d.chestOpened ? 1 : 0) + ['ruby', 'emerald'].filter((k) => d.xchests && d.xchests[k]).length; };
  const lighthouse = {
    html() {
      const s = st.lighthouse;
      const portrait = (typeof Art !== 'undefined' && Art.hasNpc('seal-lighthouse'))
        ? Art.npcPortrait('seal-lighthouse')
        : `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#1d2a36"/>
            <ellipse cx="50" cy="62" rx="30" ry="27" fill="#8e98a2"/><circle cx="50" cy="46" r="24" fill="#a3adb7"/>
            <circle cx="41" cy="42" r="3.6" fill="#15161a"/><circle cx="59" cy="42" r="3.6" fill="#15161a"/>
            <ellipse cx="50" cy="52" rx="6" ry="4" fill="#2a2d33"/><path d="M50 56 V61 M44 60 Q50 64 56 60" stroke="#2a2d33" stroke-width="1.4" fill="none"/>
            <path d="M22 50 L38 52 M22 56 L38 56 M78 50 L62 52 M78 56 L62 56" stroke="#e8edf1" stroke-width="1.2"/>
            <path d="M30 28 Q50 8 70 28 L66 32 Q50 20 34 32Z" fill="#2d4a6e"/></svg>`;
      const scene = (typeof Art !== 'undefined' && Art.hasScene('lighthouse'))
        ? ` style="background-image:linear-gradient(180deg, rgba(14,20,28,.55), rgba(14,20,28,.85)), url('${Art.sceneUrl('lighthouse')}');background-size:cover;background-position:center"` : '';
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Маяк\">{0}\n        <div class=\"screen-body tavern-body mill-body\"{1}>\n          <div class=\"npc-row\"><span class=\"npc-portrait\">{2}</span>\n            <div class=\"npc-say\"><b>Тюлень-смотритель</b><p class=\"hint\">{3}</p></div></div>\n          <h3>Поручения</h3><div class=\"cards\">{4}</div>\n        </div></div>", [head(_t("Маяк")), scene, portrait, s.msg || sealLine(), questCards('lighthouse')]);
    },
    click(b) { questClick(b, 'lighthouse'); },
  };
  // Награда сундука — один раз за профиль (Profile.data.chestOpened): монеты, расходники и три части набора «Морской волк».
  const CHEST_REWARD = { coins: 600, items: ['sea-cutlass', 'sea-head', 'sea-amulet'], cons: { potion: 3, elixir: 2, scroll: 2 } };
  const wreck = {
    html() {
      const scene = (typeof Art !== 'undefined' && Art.hasScene('wreck'))
        ? ` style="background-image:linear-gradient(180deg, rgba(14,14,20,.5), rgba(14,14,20,.85)), url('${Art.sceneUrl('wreck')}');background-size:cover;background-position:center"` : '';
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Кораблекрушение\">{0}\n        <div class=\"screen-body tavern-body\"{1}>\n          <p class=\"hint\">Бригантина лежит на боку, мачта сломана, рваный парус бьётся на ветру. Рядом на песке стоит запертый сундук, а берег охраняет Капитан — бывший командир этого корабля. Победите его, и он оставит части морского набора.</p>\n        </div></div>", [head(_t("Бригантина")), scene]);
    },
    click() {},
  };
  const CHEST_KINDS = {
    sapphire: { title: _t("Сапфировый сундук"), hold: _t("Тяжёлый сундук из тёмного дерева, в крышке — сапфиры."), keyHint: _t("Ключ, говорят, хранит тюлень-смотритель на западном маяке и отдаёт за поручения."),
      reward: { coins: 600, items: ['sea-cutlass', 'sea-head', 'sea-amulet'], cons: { potion: 3, elixir: 2, scroll: 2 }, egg: null } },
    ruby: { title: _t("Рубиновый сундук"), hold: _t("Сундук с рубинами в крышке, окованный красной медью."), keyHint: _t("Замок ржавый и хитрый. Ключ мастерит старьёвщик — за десять проданных ему вещей."),
      reward: { coins: 600, items: ['sea-harpoon', 'sea-arms'], cons: { elixir: 3, scroll: 1, potion: 2 } } },
    emerald: { title: _t("Изумрудный сундук"), hold: _t("Сундук, оплетённый зелёным мхом, с изумрудами в крышке."), keyHint: _t("Замок живой — металл ему не подходит. Нужен «Живой ключ», его варит алхимик Жабка."),
      reward: { coins: 600, items: ['sea-chest', 'sea-legs', 'sea-buckler'], cons: { potion: 6 } } },
    obsidian: { title: _t("Сундук на дне"), hold: _t("Серебряный сундук с чёрным обсидианом лежит на дне под бригантиной."), keyHint: '',
      reward: { coins: 1500, items: ['hammer', 'compass-star', 'leash-silver'], cons: { elixir: 2 }, egg: 'dragon' } },
  };
  // Сводка по четырём сундукам: что уже открыто и что делать дальше
  function chestTracker() {
    const d = Profile.data;
    const row = (k, title, next) => `<div class="card quest-card ${chestOpenedOf(k) ? 'is-done' : ''}"><div class="card-body"><span class="item-title">${title}</span><span class="item-foot">${chestOpenedOf(k) ? _t("Открыт") : next}</span></div></div>`;
    return _t("<h3>Сундуки побережья</h3><div class=\"cards\">\n      {0}\n      {1}\n      {2}\n      {3}</div>", [row('sapphire', _t("Сапфировый (у бригантины)"), d.chestKey ? _t("Ключ есть — откройте сундук") : _t("Ключ у тюленя-смотрителя на маяке")), row('ruby', _t("Рубиновый (восточные камни)"), chestHasKey('ruby') ? _t("Ключ есть — откройте сундук") : _t("Ключ мастерит старьёвщик за 10 проданных вещей")), row('emerald', _t("Изумрудный (у маяка)"), chestHasKey('emerald') ? _t("Ключ есть — откройте сундук") : _t("«Живой ключ» варит алхимик")), row('obsidian', _t("Серебряный (на дне)"), chestsOpenedCount() < 3 ? _t("Сначала откройте три цветных") : !d.diary ? _t("Нужен дневник Капитана") : !d.breath ? _t("Сварите зелье подводного дыхания") : _t("Готово к нырку"))]);
  }
  const chestOpenedOf = (k) => { const d = Profile.data; return k === 'sapphire' ? !!d.chestOpened : !!(d.xchests && d.xchests[k]); };
  const chestHasKey = (k) => { const d = Profile.data; return k === 'sapphire' ? !!d.chestKey : !!(d.xkeys && d.xkeys[k]); };
  function giveChest(k) {
    const R = CHEST_KINDS[k].reward, d = Profile.data, tier = Math.max(1, Hero.tierFor(Profile.level()));
    if (k === 'sapphire') d.chestOpened = true; else { d.xchests = d.xchests || {}; d.xchests[k] = true; }
    Profile.addCoins(R.coins);
    const names = [];
    for (const id of R.items) { const e = Gear.makeEntry(id, tier); Profile.addItem(e); names.push(Gear.item(e).name); }
    for (const [c, n] of Object.entries(R.cons)) { Profile.addConsumable(c, n); names.push(`${Gear.CONSUMABLES[c].name} ×${n}`); }
    if (R.egg) { Profile.addEgg(R.egg); names.push(Pets.EGGS[R.egg].name); }
    Profile.save();
    return _t("Внутри: {0}, {1}.", [money(R.coins), names.join(', ')]);
  }
  const chest = {
    html() {
      const s = st.chest, d = Profile.data, k = s.kind || 'sapphire', K = CHEST_KINDS[k];
      let body;
      if (chestOpenedOf(k)) body = _t("<p class=\"hint\">Сундук открыт и пуст. Только чайки кричат над мачтой.</p>");
      else if (k === 'obsidian') {
        if (chestsOpenedCount() < 3) body = _t("<p class=\"hint\">Сундук виден сквозь воду, но до него не добраться. Сначала откройте три цветных сундука на берегу — тюлень-смотритель расскажет, что делать дальше.</p>");
        else if (!d.breath) body = _t("<p class=\"hint\">Нужно «Зелье подводного дыхания»: рецепт — в «Морском дневнике» Капитана, варит алхимик.</p>");
        else body = _t("<p class=\"hint\">Вы выпили зелье и готовы нырнуть. Под водой часть камней скована течением, а у сундука кружит Щука-глубинница.</p><div class=\"mc-act\"><button type=\"button\" class=\"primary\" data-dive=\"1\">Нырнуть</button></div>");
      } else if (!chestHasKey(k)) body = `<p class="hint">${K.keyHint}</p>`;
      else body = _t("<p class=\"hint\">Ключ подходит к замку.</p><div class=\"mc-act\"><button type=\"button\" class=\"primary\" data-chest=\"1\">Открыть сундук</button></div>");
      const scene = (typeof Art !== 'undefined' && Art.hasScene('wreck'))
        ? ` style="background-image:linear-gradient(180deg, rgba(14,14,20,.5), rgba(14,14,20,.85)), url('${Art.sceneUrl('wreck')}');background-size:cover;background-position:center"` : '';
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Сундук\">{0}\n        <div class=\"screen-body tavern-body\"{1}>{2}<p class=\"hint\">{3}</p>{4}{5}</div></div>", [head(K.title), scene, tipBox('chests', _t("На берегу четыре сундука: сапфировый, рубиновый, изумрудный и серебряный на дне. Ключи достаются за поручения тюленя, старьёвщика и алхимика. Состояние всех сундуков — ниже.")), s.msg || K.hold, body, chestTracker()]);
    },
    click(b) {
      const s = st.chest, d = Profile.data, k = s.kind || 'sapphire';
      if (b.dataset.dive) {
        if (k !== 'obsidian' || !d.breath || chestOpenedOf(k)) return;
        d.breath = false; Profile.save();
        close();
        return MapView.startTraining('pike', Math.max(1, Hero.tierFor(Profile.level())), { deep: true });
      }
      if (!b.dataset.chest || chestOpenedOf(k) || !chestHasKey(k)) return;
      s.msg = _t("Замок щёлкнул! ") + giveChest(k);
      changed();
    },
  };
  // Награда за победу над Щукой (вызывается из боя, см. grantRewards в game.js).
  const deepReward = () => _t("<b class=\"lvlup\">Серебряный сундук открыт!</b> {0}", [chestOpenedOf('obsidian') ? _t("Он уже пуст.") : giveChest('obsidian')]);

  /* =============== ХИЖИНА СТАРЬЁВЩИКА (скупка ненужных вещей одним махом) =============== */
  // Платит меньше Лавки (см. Gear.junkValue) — зато скупает всё ненужное разом, одной кнопкой, без
  // возни с каждой вещью по отдельности. Разница в цене — цена скорости и удобства (см. дизайн-документ).
  const JUNKER_LINES = [
    _t("Тащи, что не жалко — я не привередливый. Плачу похуже Лавки, зато всё сразу и без разговоров."),
    _t("В Лавке за вещь дадут больше, да морока дольше — там всё по одной. А я — раз, монеты в руку, и свободен."),
    _t("Ходят слухи, в городе когда-нибудь заведут доску объявлений — там платили бы щедрее. Но то ж ждать надо, а я тут, сейчас."),
  ];
  const junker = {
    html() {
      const s = st.junker;
      const portrait = (typeof Art !== 'undefined' && Art.hasNpc('junker'))
        ? Art.npcPortrait('junker')
        : `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#241d15"/>
            <path d="M18 90 Q20 46 50 40 Q80 46 82 90Z" fill="#6b6255"/>
            <circle cx="50" cy="46" r="24" fill="#c9a77a"/><circle cx="41" cy="44" r="3.6" fill="#1c1c1c"/><circle cx="59" cy="44" r="3.6" fill="#1c1c1c"/>
            <path d="M38 56 Q50 62 62 56" stroke="#6b4a2b" stroke-width="2.4" fill="none" stroke-linecap="round"/>
            <path d="M26 30 Q50 14 74 30 L70 36 Q50 24 30 36Z" fill="#8a7f6e"/>
            <circle cx="76" cy="66" r="12" fill="#7a6a4a" stroke="#3a332b" stroke-width="1.6"/></svg>`;
      const items = Profile.data.items.filter((e) => !Profile.equippedUid(e.uid)).map((e) => Gear.item(e)).sort((a, b) => b.tier - a.tier);
      const rows = items.map((it) =>
        itemCard(it, _t("Скупит за: {0}", [money(Gear.junkValue(it.price))]), _t("<button type=\"button\" data-junk-item=\"{0}\">Продать</button>", [it.uid]))).join('')
        || _t("<p class=\"hint\">Продавать нечего (надетые вещи старьёвщик не берёт).</p>");
      const total = items.reduce((sum, it) => sum + Gear.junkValue(it.price), 0);
      const scene = (typeof Art !== 'undefined' && Art.hasScene('junker'))
        ? ` style="background-image:linear-gradient(180deg, rgba(20,16,10,.55), rgba(20,16,10,.85)), url('${Art.sceneUrl('junker')}');background-size:cover;background-position:center"` : '';
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Хижина старьёвщика\">{0}\n        <div class=\"screen-body tavern-body\"{1}>\n          <div class=\"npc-row\"><span class=\"npc-portrait\">{2}</span>\n            <div class=\"npc-say\"><b>Старьёвщик</b><p class=\"hint\">{3}</p></div></div>\n          {4}\n          <h3>Поручения</h3><div class=\"cards\">{5}</div>\n          <h3>Ненужные вещи</h3><div class=\"card-list\">{6}</div>\n        </div></div>", [head(_t("Хижина старьёвщика")), scene, portrait, s.msg || JUNKER_LINES[0], items.length > 1 ? _t("<div class=\"reset\"><button type=\"button\" class=\"primary\" data-junk-all=\"1\">Продать всё ненужное — сразу {0}</button></div>", [money(total)]) : '', questCards('junker'), rows]);
    },
    click(b) {
      const s = st.junker, d = b.dataset;
      if (d.accept || d.claim) return questClick(b, 'junker');
      if (d.junkItem) {
        const it = Gear.item(Profile.item(d.junkItem));
        if (!it) return;
        Profile.removeItem(d.junkItem);
        Profile.data.junkSold = (Profile.data.junkSold || 0) + 1;
        Profile.addCoins(Gear.junkValue(it.price));
        s.msg = (() => { const n = (Profile.data.junkSold || 0), q = Quests.list(Profile.data, 'junker')[0], tail = q && q.accepted && !q.claimed && !q.done ? _t(" Для ключа уже {0} из {1}.", [q.value, q.goal]) : ''; return JUNKER_SALE[n % JUNKER_SALE.length].replace('%n', it.name) + tail; })();
        return changed();
      }
      if (d.junkAll) {
        const items = Profile.data.items.filter((e) => !Profile.equippedUid(e.uid)).map((e) => Gear.item(e));
        if (!items.length) return;
        let total = 0;
        for (const it of items) { Profile.removeItem(it.uid); total += Gear.junkValue(it.price); }
        Profile.data.junkSold = (Profile.data.junkSold || 0) + items.length;
        Profile.addCoins(total);
        s.msg = _t("Забрал всё разом, {0} шт. — вот {1}. {2}", [items.length, money(total), JUNKER_LINES[2]]);
        return changed();
      }
    },
  };

  /* =============== БИБЛИОТЕКА (бобёр-хранитель: поручение дня, вход в бестиарий, энциклопедия вещей) =============== */
  const BEAVER_LINES = [
    _t("Тс-с, тише — тут всё разложено по полочкам. Спрашивай, чем помочь."),
    _t("Держи — и заходи ещё, у меня всегда найдётся дело для любопытного."),
    _t("Читаю всё, что приносят охотники — так и бестиарий пополняется, свиток за свитком."),
  ];
  const library = {
    html() {
      const s = st.library;
      const portrait = (typeof Art !== 'undefined' && Art.hasNpc('beaver-library'))
        ? Art.npcPortrait('beaver-library')
        : `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#241d15"/>
            <path d="M18 42 Q10 30 22 18 Q30 32 31 44Z" fill="#6b4f30"/>
            <ellipse cx="50" cy="60" rx="30" ry="26" fill="#8a6a42"/>
            <circle cx="38" cy="52" r="9" fill="none" stroke="#e3c98a" stroke-width="2"/><circle cx="62" cy="52" r="9" fill="none" stroke="#e3c98a" stroke-width="2"/>
            <path d="M46 52 H54 M29 50 L20 47 M71 50 L80 47" stroke="#e3c98a" stroke-width="2" fill="none"/>
            <circle cx="38" cy="52" r="4.5" fill="#2c2115"/><circle cx="62" cy="52" r="4.5" fill="#2c2115"/>
            <ellipse cx="50" cy="66" rx="10" ry="8" fill="#c9ad82"/>
            <rect x="44" y="68" width="5" height="9" rx="1.4" fill="#f4ecd8"/><rect x="51" y="68" width="5" height="9" rx="1.4" fill="#f4ecd8"/></svg>`;
      const scene = (typeof Art !== 'undefined' && Art.hasScene('library'))
        ? ` style="background-image:linear-gradient(180deg, rgba(20,16,10,.55), rgba(20,16,10,.85)), url('${Art.sceneUrl('library')}');background-size:cover;background-position:center"` : '';
      let body;
      if (s.tab === 'beasts') {
        const n = Profile.species().length;
        body = _t("<p class=\"hint\">{0}</p>\n          <div class=\"reset\"><button type=\"button\" class=\"primary\" data-open-bestiary=\"1\">Открыть бестиарий</button></div>", [n ? _t("Бестиарий пополняется: в нём уже {0} из {1} видов.", [n, Bestiary.ORDER.length]) : _t("Бестиарий ещё пуст — выйдите за частокол: встреченные существа появятся здесь сами.")]);
      } else if (s.tab === 'items') {
        const f = FILTERS.find((x) => x[0] === s.filter) || FILTERS[0];
        const bases = Gear.ITEMS.filter((b) => f[2](b.type)).sort((a, b) => (a.faction || '').localeCompare(b.faction || '') || a.cost - b.cost);
        const list = bases.map((b) => {
          const it = Gear.item({ id: b.id, tier: s.itemTier });
          const fac = b.faction ? _t(" · только фракция «{0}»", [Factions.get(b.faction).name]) : '';
          return itemCard(it, `${Gear.RARITY_NAMES[it.rarity]}${fac}`);
        }).join('') || _t("<p class=\"hint\">Таких вещей нет.</p>");
        const cons = Object.entries(Gear.CONSUMABLES).map(([k, c]) => `
          <div class="card" style="--t:#c9b48a">${itemIcon(k)}<div class="card-body"><span class="item-title">${c.name}</span><span class="item-foot">${c.desc}</span></div></div>`).join('');
        const sets = Object.values(Gear.SETS).map((set) => _t("\n          <div class=\"set\" style=\"--c:{0}\"><b>Набор «{1}»{2}</b>\n            {3}</div>", [set.color, set.name, set.faction ? _t(" (фракция «{0}»)", [Factions.get(set.faction).name]) : '', Object.entries(set.bonuses).map(([n, b]) => _t("<div class=\"off\">{0} шт.: {1}</div>", [n, fmtBonus(b)])).join('')])).join('');
        body = _t("<div class=\"tabs sub\">{0}</div>\n          <p class=\"hint\">Цвет для просмотра (справочно — характеристики вещи растут вместе с цветом):</p>{1}\n          <div class=\"card-list\">{2}</div>\n          <h3>Расходники</h3><div class=\"card-list\">{3}</div>\n          <h3>Наборы</h3>{4}", [FILTERS.map(([k, label]) => `<button type="button" class="${k === s.filter ? 'on' : ''}" data-libfilter="${k}">${label}</button>`).join(''), tierPicker(Tiers.MAX, s.itemTier, 'libtier'), list, cons, sets]);
      } else if (s.tab === 'medals') {
        // Полная коллекция медалей переехала на Стену доблести у вашего дома (см. SCREENS.valor) —
        // там же теперь показывается и серия «Удар», и тир-бейджи, открывающиеся по уровню героя.
        // Здесь — только короткая витрина последних трёх и указатель, куда идти за остальным.
        const earned = Profile.medals().slice(-3).reverse();
        body = _t("<p class=\"hint\">Медали копятся на весь аккаунт и дают небольшой, но постоянный бонус характеристик.\n            Полная коллекция — на Стене доблести у вашего дома («Ранец и экипировка» → «Стена доблести»).</p>\n          {0}", [earned.length ? _t("<h3>Последние полученные</h3><div class=\"medal-grid\">{0}</div>", [earned.map((m) => medalTile(m.id, m, Profile.level(), 0, 0)).join('')]) : _t("<p class=\"hint\">Пока ни одной — победите кого-нибудь впервые.</p>")]);
      } else {
        const q = Daily.libraryQuest(Profile.data);
        const qAct = q.claimed ? _t("<span class=\"badge done\">Получено</span>")
          : q.done ? _t("<button type=\"button\" class=\"primary\" data-claim-daily=\"1\">Забрать награду</button>")
          : `<span class="quest-progress">${q.value} / ${q.goal}</span>`;
        // Тренировка у бобра: настоящий бой против самого Бобра-хранителя (см. MapView.startTraining,
        // Game.setupTrainerBeaver) — безопасный и без наград (см. Game.isTraining/grantRewards), с одной
        // подсказкой-баннером в начале (см. beaverTip в game.js).
        const spellKeys = (typeof Balance !== 'undefined') ? Object.keys(Balance.magic.costs) : [];
        const spellName = (k) => (typeof MAGICS !== 'undefined' && MAGICS[k]) ? MAGICS[k].name : k;
        const spellTip = (k) => (typeof MAGICS !== 'undefined' && MAGICS[k]) ? MAGICS[k].tip : '';
        const trainBlock = _t("<h3>Тренировка</h3>\n          <div class=\"cards\">\n            <div class=\"card\" style=\"--t:#c9b48a\"><div class=\"card-body\"><span class=\"item-title\">Обучение с самого начала</span>\n              <span class=\"item-foot\">Бобёр заново проведёт по карте, учебному бою и деревне — шаг за шагом.</span></div>\n              <div class=\"card-act\"><button type=\"button\" class=\"primary\" data-tutorial=\"1\">Пройти обучение заново</button></div></div>\n            <div class=\"card\" style=\"--t:#c9b48a\"><div class=\"card-body\"><span class=\"item-title\">Учебный бой</span>\n              <span class=\"item-foot\">Настоящий бой с безопасным противником и подсказкой от бобра в начале.</span></div>\n              <div class=\"card-act\"><button type=\"button\" data-train-start=\"1\">Начать учебный бой</button></div></div>\n            <div class=\"card\" style=\"--t:#c9b48a\"><div class=\"card-body\"><span class=\"item-title\">Оттачивание мастерства</span>\n              <span class=\"item-foot\">Выберите заклинание — в учебном бою сразу получите камни, чтобы сразу его опробовать.</span></div>\n              <div class=\"card-act\"><button type=\"button\" data-train-spell=\"1\">{0}</button></div></div>\n          </div>\n          {1}", [s.spellPick ? _t("Скрыть список") : _t("Отточить мастерство"), s.spellPick ? `<div class="card-list">${spellKeys.map((k) => `<button type="button" class="itembtn-inline" data-train-pick="${k}" title="${spellTip(k)}">${spellName(k)}</button>`).join('')}</div>` : '']);
        const story = Profile.data.story || { shards: {} };
        const chapters = Story.CHAPTERS.map((ch) => {
          const got = story.shards && story.shards[ch.id], sleeping = ch.final && !Story.finalOpen(story);
          return _t("<div class=\"card story-card {0}\" style=\"--t:{1}\"><span class=\"icon-wrap\">{2}</span>\n            <div class=\"card-body\"><span class=\"item-title\">{3}{4} {5}</span><span class=\"item-foot\">{6}</span>\n              <span class=\"item-foot\">Где: {7}.{8}</span></div>\n            <div class=\"card-act\">{9}</div></div>", [got ? 'is-done' : '', tierColor(ch.tier), ch.species === 'dragon' ? Figures.avatar('dragon', null) : MonsterArt.bust(ch.species, ch.tier), got ? '✔ ' : '', ch.title, tierChip(ch.tier), ch.lore, ch.where, sleeping ? _t(" Спит, пока не собраны 4 осколка.") : '', got ? _t("<span class=\"badge done\">Осколок у вас</span>") : _t("<button type=\"button\" data-story-find=\"{0}\" {1}>На карте</button>", [ch.id, sleeping ? 'disabled' : ''])]);
        }).join('');
        const storyBlock = _t("<h3>Осколки Великого Сердца: {0}/4{1}</h3>\n          <p class=\"hint\">Самые крупные осколки достались стражам — сильнейшим существам своих земель. Стражи вдвое крепче обычных и носят корону на карте.</p>\n          <div class=\"card-list\">{2}</div>", [Story.shards(story), Story.finished(story) ? _t(" · Сердцевина у вас — Грань цела!") : '', chapters]);
        body = _t("<div class=\"npc-row\"><span class=\"npc-portrait\">{0}</span>\n            <div class=\"npc-say\"><b>Бобёр-хранитель</b><p class=\"hint\">{1}</p></div></div>\n          {2}\n          <h3>Поручение дня</h3><div class=\"cards\"><div class=\"card quest-card {3}\">\n            <div class=\"card-body\"><span class=\"item-title\">Дежурный обход</span>\n              <span class=\"item-foot\">Победите сегодня в одном бою — бобёр щедро делится знаниями (и не только).</span>\n              <span class=\"item-foot quest-reward\">Награда: монеты и порция каменной пыли</span></div>\n            <div class=\"card-act\">{4}</div></div></div>\n          <p class=\"hint\">Поручение обновляется каждый день, в полночь по вашему времени.</p>\n          {5}", [portrait, s.msg || BEAVER_LINES[0], storyBlock, q.claimed ? 'is-done' : '', qAct, trainBlock]);
      }
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Библиотека\">{0}{1}\n        <div class=\"screen-body tavern-body\"{2}>{3}</div></div>", [head(_t("Библиотека")), tabs([['npc', _t("Бобёр")], ['beasts', _t("Бестиарий")], ['items', _t("Вещи")], ['medals', _t("Медали")]], s.tab), scene, body]);
    },
    click(b) {
      const s = st.library, d = b.dataset;
      if (d.tab) { s.tab = d.tab; s.msg = ''; return render(); }
      if (d.libfilter) { s.filter = d.libfilter; return render(); }
      if (d.libtier) { s.itemTier = Number(d.libtier); return render(); }
      if (d.openBestiary) return open('best');
      if (d.claimDaily) {
        const r = Daily.claimLibrary();
        if (!r) return;
        s.msg = _t("Держи — {0} монет и порция каменной пыли. {1}", [r.coins, BEAVER_LINES[1]]);
        return changed();
      }
      if (d.tutorial) { close(); Tutorial.start(true); return; }
      if (d.storyFind) { close(); MapView.focusBoss(d.storyFind); return; }
      if (d.trainSpell) { s.spellPick = !s.spellPick; return render(); }
      if (d.trainStart) {
        close();
        MapView.startTraining('beaver', 1);
        setBeaverTip({ text: _t("Бобёр советует: подбирайте камни в линию 4+, чтобы получить дополнительный ход!") });
        return;
      }
      if (d.trainPick) {
        const key = d.trainPick, name = (typeof MAGICS !== 'undefined' && MAGICS[key]) ? MAGICS[key].name : key,
          tip = (typeof MAGICS !== 'undefined' && MAGICS[key]) ? MAGICS[key].tip : '';
        close();
        MapView.startTraining('beaver', 1);
        setBeaverTip({ text: _t("Бобёр советует отточить «{0}»: камни уже наготове. {1}", [name, tip]), spellKey: key });
        return;
      }
    },
  };

  /* =============== МАСТЕРСКАЯ ХУДОЖНИКА (Журавль-художник: продажа и вставка рун) =============== */
  const CRANE_LINES = [
    _t("А, заходи. Резец в руке, узор ещё не досох — но на тебя время найдётся."),
    _t("Держи, вставляй смело — гнёзд теперь два, камень такой узор выдержит."),
    _t("Каждая руна — со своим рисунком. Смотри не перепутай, какая куда просится."),
  ];
  const artistWorkshop = {
    html() {
      const s = st.artistWorkshop;
      const portrait = (typeof Art !== 'undefined' && Art.hasNpc('crane-artist'))
        ? Art.npcPortrait('crane-artist')
        : `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#241d15"/>
            <ellipse cx="50" cy="78" rx="26" ry="10" fill="#3a332b"/>
            <path d="M32 78 Q30 46 44 30 Q40 20 46 12 Q52 20 50 30 Q64 44 64 78Z" fill="#e7e2d8"/>
            <path d="M44 30 Q50 34 56 30" stroke="#c9c2b2" stroke-width="1.6" fill="none"/>
            <circle cx="46" cy="24" r="8.5" fill="#f4f1e8"/><circle cx="43.5" cy="22.5" r="1.6" fill="#1c1c1c"/>
            <path d="M46 25 L60 27 L46 29Z" fill="#c9573c"/>
            <rect x="34" y="52" width="24" height="22" rx="2" fill="#8a6a42" opacity=".9"/>
            <path d="M38 56 L48 62 M52 58 L44 66" stroke="#e3c98a" stroke-width="1.6"/></svg>`;
      const scene = (typeof Art !== 'undefined' && Art.hasScene('artistWorkshop'))
        ? ` style="background-image:linear-gradient(180deg, rgba(20,16,10,.55), rgba(20,16,10,.85)), url('${Art.sceneUrl('artistWorkshop')}');background-size:cover;background-position:center"` : '';
      const runes = Runes.ORDER.map((id) => {
        const r = Runes.CATALOG[id], price = buyPrice(RUNE_PRICE);
        return _t("<div class=\"card\" style=\"--t:{0}\"><span class=\"icon-wrap\">{1}</span>\n          <div class=\"card-body\"><span class=\"item-title\">{2}</span><span class=\"item-foot\">{3}</span><span class=\"item-foot\">Цена: {4} · в запасе: {5}</span></div>\n          <div class=\"card-act\"><button type=\"button\" data-buy-rune=\"{6}\" {7}>Купить</button></div></div>", [r.color, Runes.icon(id), r.name, r.desc, money(price), Profile.rune(id), id, Profile.data.coins >= price ? '' : 'disabled']);
      }).join('');
      const body = _t("<div class=\"npc-row\"><span class=\"npc-portrait\">{0}</span>\n          <div class=\"npc-say\"><b>Журавль-художник</b><p class=\"hint\">{1}</p></div></div>\n        <h3>Руны</h3><p class=\"hint\">Вставляются в любую надетую вещь, по 2 гнезда на вещь — кнопка «i» на карточке предмета.</p>\n        <div class=\"card-list\">{2}</div>", [portrait, s.msg || CRANE_LINES[0], runes]);
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Мастерская художника\">{0}\n        <div class=\"screen-body tavern-body\"{1}>{2}</div></div>", [head(_t("Мастерская художника")), scene, body]);
    },
    click(b) {
      const s = st.artistWorkshop, d = b.dataset;
      if (d.buyRune) {
        const price = buyPrice(RUNE_PRICE);
        if (!Profile.spend(price)) return;
        Profile.addRune(d.buyRune);
        s.msg = _t("Куплено: {0}. {1}", [Runes.CATALOG[d.buyRune].name, CRANE_LINES[1]]);
        return changed();
      }
    },
  };

  /* =============== О РАЗРАБОТЧИКАХ =============== */
  /* Стена доблести (у дома): вся коллекция медалей — за первую победу над каждым видом, за вехи линий
     из 5 камней и за добивания Ударом (js/medals.js) — со значками, открывающимися по тиру не раньше,
     чем герой достигнет нужного уровня (Medals.tierUnlockLevel), и подсказкой прогресса при наведении
     (см. medalTile выше — тот же рендер, что раньше стоял во вкладке «Медали» Библиотеки). */
  const valor = {
    html() {
      const level = Profile.level(), earned = Profile.medals();
      const earnedFor = (id) => earned.find((m) => m.id === id) || null;
      const killTiles = Bestiary.ORDER.map((id) => {
        const mid = Medals.killMedalId(id);
        const rec = Profile.data.bestiary[id];
        return medalTile(mid, earnedFor(mid), level, Math.min(1, (rec && rec.wins) || 0), 1);
      });
      const streakTiles = Medals.STREAK_MILESTONES.map((n) => {
        const mid = Medals.streakMedalId(n);
        return medalTile(mid, earnedFor(mid), level, Math.min(n, Profile.data.medals.fiveStreaks), n);
      });
      const strikeTiles = Medals.STRIKE_MILESTONES.map((n) => {
        const mid = Medals.strikeMedalId(n);
        return medalTile(mid, earnedFor(mid), level, Math.min(n, Profile.strikeKills()), n);
      });
      const shotTiles = Medals.SHOT_MILESTONES.map((n) => {
        const mid = Medals.shotMedalId(n);
        return medalTile(mid, earnedFor(mid), level, Math.min(n, Profile.shotKills()), n);
      });
      const body = _t("<p class=\"hint\">Все ваши медали — постоянные бонусы характеристик за первую победу над видом,\n          за вехи линий из 5 камней и за добивания заклинанием Удар. Наведите на значок — увидите прогресс;\n          цветной тир-бейдж открывается, когда герой достигает нужного уровня.</p>\n        <h3>За первую победу ({0} / {1})</h3>\n        <div class=\"medal-grid\">{2}</div>\n        <h3>За линии из 5 камней ({3} / {4})</h3>\n        <p class=\"hint\">Собрано всего: {5}</p>\n        <div class=\"medal-grid\">{6}</div>\n        <h3>За добивания Ударом ({7} / {8})</h3>\n        <p class=\"hint\">Добито Ударом всего: {9}</p>\n        <div class=\"medal-grid\">{10}</div>\n        <h3>Меткий стрелок ({11} / {12})</h3>\n        <p class=\"hint\">Добито болтом или стрелой всего: {13}</p>\n        <div class=\"medal-grid\">{14}</div>", [killTiles.filter((_, i) => earnedFor(Medals.killMedalId(Bestiary.ORDER[i]))).length, Bestiary.ORDER.length, killTiles.join(''), earned.filter((m) => m.id.startsWith('streak:')).length, Medals.STREAK_MILESTONES.length, Profile.data.medals.fiveStreaks, streakTiles.join(''), earned.filter((m) => m.id.startsWith('strike:')).length, Medals.STRIKE_MILESTONES.length, Profile.strikeKills(), strikeTiles.join(''), earned.filter((m) => m.id.startsWith('shot:')).length, Medals.SHOT_MILESTONES.length, Profile.shotKills(), shotTiles.join('')]);
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Стена доблести\">{0}\n        <div class=\"screen-body tavern-body\">{1}</div></div>", [head(_t("Стена доблести")), body]);
    },
    click() {},
  };

  const credits = {
    html() {
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"О разработчиках\">{0}\n        <div class=\"screen-body credits-body\">\n          <p class=\"hint\">Игру создали:</p>\n          <ul class=\"credits-list\">\n            <li>Воробьев Александр Сергеевич</li>\n            <li>Никифоренко Екатерина Эдуардовна</li>\n          </ul>\n          <p class=\"hint\">© 2026 Воробьев Александр Сергеевич, Никифоренко Екатерина Эдуардовна. Все права защищены.</p>\n          <div class=\"test-x10\">\n            <label class=\"switch\"><button type=\"button\" role=\"switch\" aria-checked=\"{1}\" data-testx10=\"1\" class=\"{2}\"><i></i></button>\n              <span><b>Тест: характеристики героя ×10</b> — {3}</span></label>\n            <label class=\"switch\"><button type=\"button\" role=\"switch\" aria-checked=\"{4}\" data-testspells=\"1\" class=\"{5}\"><i></i></button>\n              <span><b>Тест: все виды магии открыты</b> — {6}</span></label>\n            {7}\n            <p class=\"hint\">Награды за победы в этом режиме выдаются как обычно — удобно проверять добычу. Для проверки сильных персонажей: Сила, Здоровье, Броня и остальные характеристики, ХП и урон вашего героя умножаются на 10 (проценты упираются в обычные потолки). Не забудьте выключить.</p>\n          </div>\n        </div></div>", [head(_t("О разработчиках")), Profile.data.testX10 ? 'true' : 'false', Profile.data.testX10 ? 'on' : '', Profile.data.testX10 ? _t("включено") : _t("выключено"), Profile.data.testAllSpells ? 'true' : 'false', Profile.data.testAllSpells ? 'on' : '', Profile.data.testAllSpells ? _t("включено") : _t("выключено"), typeof inBattle !== 'undefined' && inBattle && typeof over !== 'undefined' && !over ? _t("<p class=\"hint warn\">Во время боя переключать нельзя.</p>") : '']);
    },
    click(b) {
      if (b.dataset.testspells) {   // 1.3.8: тест — все виды магии открыты
        Profile.data.testAllSpells = !Profile.data.testAllSpells;
        Profile.save();
        if (typeof renderMagic === 'function') try { renderMagic(); } catch (e) { /* вне боя поля ещё нет */ }
        changed();
        return;
      }
      if (!b.dataset.testx10) return;
      if (typeof inBattle !== 'undefined' && inBattle && typeof over !== 'undefined' && !over) return;   // посреди боя — нельзя
      Profile.data.testX10 = !Profile.data.testX10;
      Profile.save();
      if (typeof applyLevel === 'function') applyLevel();
      if (typeof onGearChanged === 'function') onGearChanged();
      changed();
    },
  };


  /* =============== ПИТОМНИК (1.3.0): платный уход за питомцем =============== */
  const NPC_SVG = (fur, eye) => `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#241d15"/><ellipse cx="50" cy="62" rx="30" ry="28" fill="${fur}"/><circle cx="40" cy="55" r="4" fill="${eye}"/><circle cx="60" cy="55" r="4" fill="${eye}"/></svg>`;
  const npcPortrait = (id, fur, eye) => (typeof Art !== 'undefined' && Art.hasNpc(id)) ? Art.npcPortrait(id) : NPC_SVG(fur, eye);
  const sceneStyle = (id) => (typeof Art !== 'undefined' && Art.hasScene(id))
    ? ` style="background-image:linear-gradient(180deg, rgba(20,16,10,.55), rgba(20,16,10,.85)), url('${Art.sceneUrl(id)}');background-size:cover;background-position:center"` : '';
  const kennel = {
    html() {
      const s = st.kennel, pet = Profile.pet();
      const ch = Profile.petChoice(), home = Profile.homePet(), tamed = Profile.tamedPet(), inc = Profile.incubator(), eggs = Profile.eggs(), ht = Hero.tierFor(Profile.level());
      const petArt = (p) => (typeof Art !== 'undefined' && Art.has('pets/' + p.speciesId)) ? `<img src="${Art.url('pets/' + p.speciesId)}" alt="">` : MonsterArt.bust(Pets.donorOf(p.speciesId), p.tier);
      const choose = _t("<h3>Кто идёт в бой</h3><div class=\"tabs\">\n          {0}\n          {1}\n          <button type=\"button\" class=\"{2}\" data-k-choose=\"none\">Оставить дома</button></div>", [home ? `<button type="button" class="${ch === 'home' ? 'on' : ''}" data-k-choose="home">${Pets.petDisplayName(home.speciesId)}</button>` : '', tamed ? `<button type="button" class="${ch === 'tamed' ? 'on' : ''}" data-k-choose="tamed">${Pets.petDisplayName(tamed.speciesId)}</button>` : '', ch === 'none' ? 'on' : '']);
      const eggKinds = Object.keys(Pets.EGGS).filter((k) => eggs[k] > 0);
      const hatch = (inc || eggKinds.length) ? _t("<h3>Инкубатор</h3><div class=\"card-list\">\n          {0}\n          {1}</div>", [inc ? _t("<div class=\"card\" style=\"--t:#e0b050\"><div class=\"card-body\"><span class=\"item-title\">{0}</span><span class=\"item-foot\">{1}</span></div>\n            <div class=\"card-act\"><button type=\"button\" data-k-collect=\"1\" {2}>Забрать</button></div></div>", [Pets.EGGS[inc.egg].name, inc.left > 0 ? _t("Согревается: ещё {0} {1}", [inc.left, inc.left === 1 ? _t("бой") : _t("боя")]) : _t("Вылупился: {0}!", [Pets.EGGS[inc.egg].chick]), inc.left > 0 ? 'disabled' : '']) : '', inc ? '' : eggKinds.map((k) => _t("<div class=\"card\" style=\"--t:#e0b050\"><div class=\"card-body\"><span class=\"item-title\">{0} × {1}</span><span class=\"item-foot\">Высидеть за {2} боёв. Цена {3}. Вылупившийся питомец заменит прирученного.</span></div>\n            <div class=\"card-act\"><button type=\"button\" data-k-hatch=\"{4}\" {5}>Высидеть</button></div></div>", [Pets.EGGS[k].name, eggs[k], Pets.HATCH_BATTLES, money(Pets.hatchCost(ht)), k, Profile.data.coins >= Pets.hatchCost(ht) ? '' : 'disabled'])).join('')]) : '';
      let petCard = '', care = '';
      if (!pet) {
        petCard = _t("<p class=\"hint\">Питомец не выбран. {0}</p>", [home || tamed ? _t("Выберите, кто идёт в бой, кнопками выше.") : _t("Приручить можно зверя (крыса, волк, кабан, рысь, ёж…): победите вид {0} раз — в бестиарии у Охотников появится кнопка «Приручить».", [Pets.TAME_WINS])]);
        care = _t("<p class=\"hint\">Уход нужен питомцу, который идёт в бой. Выберите питомца на вкладке «Питомец».</p>");
      } else {
        const heroTier = Hero.tierFor(Profile.level());
        const rc = Pets.repairCost(pet), fc = Pets.feedCost(pet), tc = Pets.trainCost(pet, heroTier);
        const pf = Pets.petFighter(pet);
        petCard = _t("<div class=\"card\" style=\"--t:{0}\"><span class=\"icon-wrap pet-ico\">{1}</span>\n            <div class=\"card-body\"><span class=\"item-title\">{2} {3}</span>\n              <span class=\"item-foot\">ХП {4} · удар ≈ {5} · прочность {6}/{7}{8}</span></div></div>", [tierColor(pet.tier), petArt(pet), Pets.petDisplayName(pet.speciesId), tierChip(pet.tier), Math.round(pf.max * Pets.BOARD_HP), Pets.petAttackAmount(pf), pet.durability, pet.maxDurability, (pet.fed > 0 ? _t(" · сыт ещё {0} {1}", [pet.fed, pet.fed === 1 ? _t("бой") : _t("боя")]) : '') + _t(" · ум {0}/100 · опыт {1}", [Pets.intellect(pet), pet.xp || 0])]);
        care = _t("<div class=\"card-list\">\n            <div class=\"card\" style=\"--t:#c9b48a\"><div class=\"card-body\"><span class=\"item-title\">Подлечить</span><span class=\"item-foot\">Возвращает всю прочность (питомец теряет её, когда бой проигран). {0}</span></div>\n              <div class=\"card-act\"><button type=\"button\" data-k-repair=\"1\" {1}>Подлечить</button></div></div>\n            {2}\n            <div class=\"card\" style=\"--t:{3}\"><div class=\"card-body\"><span class=\"item-title\">Обучение</span><span class=\"item-foot\">{4}</span></div>\n              <div class=\"card-act\"><button type=\"button\" data-k-train=\"1\" {5}>Обучить</button></div></div>\n          </div>", [rc ? _t("Цена: {0}", [money(rc)]) : _t("Прочность полная."), rc && Profile.data.coins >= rc ? '' : 'disabled', Pets.TREAT_ORDER.map((k) => { const T = Pets.TREATS[k], c = Pets.treatCost(pet, k), left = Pets.treatLeft(pet, k);
              return _t("<div class=\"card\" style=\"--t:#d9b26a\"><div class=\"card-body\"><span class=\"item-title\">{0}{1}</span><span class=\"item-foot\">{2} на {3} {4}. Цена {5}.</span></div>\n              <div class=\"card-act\"><button type=\"button\" data-k-treat=\"{6}\" {7}>Купить</button></div></div>", [T.name, left > 0 ? _t(" · ещё {0} {1}", [left, left === 1 ? _t("бой") : _t("боя")]) : '', T.desc, T.battles, T.battles === 2 ? _t("боя") : _t("боя"), money(c), k, Profile.data.coins >= c && !(left >= T.battles) ? '' : 'disabled']); }).join(''), tierColor(Math.min(10, pet.tier + 1)), tc ? _t("Питомец станет цвета «{0}»: больше ХП и удар. Цена: {1}", [Tiers.get(pet.tier + 1).name, money(tc)]) : _t("Выше цвета вашего героя питомца не обучить."), tc && Profile.data.coins >= tc ? '' : 'disabled']);
      }
      const eggTab = hatch || _t("<p class=\"hint\">Яйца редких питомцев падают с грифона, виверны и саламандры. Принесите яйцо — высидим здесь.</p>");
      const kt = s.tab || 'pet';
      const body = tipBox('kennel', _t("Три вкладки: «Питомец» — выбор спутника, «Уход» — корм, лакомства и ремонт, «Инкубатор» — высидеть яйцо редкого питомца (яйца падают с грифона, виверны и саламандры).")) + tabs([['pet', _t("Питомец")], ['care', _t("Уход")], ['egg', _t("Инкубатор") + (inc ? ' •' : '')]], kt) + (kt === 'care' ? care : kt === 'egg' ? eggTab.replace(_t("<h3>Инкубатор</h3>"), '') : choose.replace(/<h3>[^<]*<\/h3>/, '') + petCard);
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Питомник\">{0}\n        <div class=\"screen-body tavern-body\"{1}><div class=\"npc-row\"><span class=\"npc-portrait\">{2}</span>\n          <div class=\"npc-say\"><b>Смотрительница Ласка</b><p class=\"hint\">{3}</p></div></div>{4}</div></div>", [head(_t("Питомник")), sceneStyle('kennel'), npcPortrait('kennel-keeper', '#9a7a52', '#2a1a10'), s.msg || _t("Заходи, заходи. Домашний питомец — твой друг на всю жизнь; зверей из леса можно приручить после 25 побед над видом. Покормлю, подлечу, научу новому — всё за честную монету."), body]);
    },
    click(b) {
      const s = st.kennel, d = b.dataset, pet = Profile.pet();
      if (d.tab) { s.tab = d.tab; s.msg = ''; return render(); }
      const ht = Hero.tierFor(Profile.level());
      if (d.kChoose) { Profile.setPetChoice(d.kChoose); s.msg = d.kChoose === 'none' ? _t("Ладно, посидит дома.") : _t("Вот и славно, пойдёт с вами."); return changed(); }
      if (d.kHatch) { if (Profile.startHatch(d.kHatch, ht)) s.msg = _t("Яйцо в тепле. Приходи через несколько боёв."); return changed(); }
      if (d.kCollect) { const p = Profile.collectHatch(ht); if (p) s.msg = _t("{0} — твой!", [Pets.petDisplayName(p.speciesId)]); return changed(); }
      if (!pet) return;
      if (d.kRepair) { const c = Pets.repairCost(pet); if (!c || !Profile.spend(c)) return; Pets.repair(pet); s.msg = _t("Как новенький! Прочность восстановлена."); Profile.save(); return changed(); }
      if (d.kTreat) { const k = d.kTreat, c = Pets.treatCost(pet, k); if (!Pets.TREATS[k] || !Profile.spend(c)) return; Pets.giveTreat(pet, k); s.msg = _t("{0}: питомец доволен!", [Pets.TREATS[k].name]); Profile.save(); return changed(); }
      if (d.kFeed) { const c = Pets.feedCost(pet); if (!Profile.spend(c)) return; Pets.feed(pet); s.msg = _t("Наелся — {0} боя будет бодрее.", [Pets.FEED_BATTLES]); Profile.save(); return changed(); }
      if (d.kTrain) { const c = Pets.trainCost(pet, Hero.tierFor(Profile.level())); if (!c || !Profile.spend(c)) return; Pets.train(pet); s.msg = _t("Готово: теперь он цвета «{0}».", [Tiers.get(pet.tier).name]); Profile.save(); return changed(); }
    },
  };

  /* =============== АЛХИМИК (1.3.0): зелья из ресурсов =============== */
  // Ресурсы — любого вида, цвета героя или на цвет ниже; берётся подходящая стопка с наименьшим цветом.
  const RECIPES = [
    { out: 'potion', n: 2, res: 2 }, { out: 'elixir', n: 1, res: 2 }, { out: 'dust', n: 2, res: 2 },
    { out: 'storm', n: 1, res: 3 }, { out: 'stoneskin', n: 1, res: 3 },
  ];
  const alchStack = (need) => {
    const lo = Math.max(1, Hero.tierFor(Profile.level()) - 1);
    return Profile.resList().filter((r) => r.tier >= lo && r.n >= need).sort((a, b) => a.tier - b.tier || b.n - a.n)[0] || null;
  };
  const elixStack = (tier) => Profile.resList().filter((r) => r.tier === tier && r.n >= Elixirs.need(tier)).sort((a, b) => b.n - a.n)[0] || null;
  const alchFee = (rc) => Math.round(consPrice(rc.out) * 0.25 * rc.n);
  const alchemist = {
    html() {
      const s = st.alchemist;
      const lo = Math.max(1, Hero.tierFor(Profile.level()) - 1);
      const cards = RECIPES.map((rc, i) => {
        const c = Gear.CONSUMABLES[rc.out], stack = alchStack(rc.res), fee = alchFee(rc);
        return _t("<div class=\"card\" style=\"--t:#8fd08a\">{0}<div class=\"card-body\"><span class=\"item-title\">{1} × {2}{3}</span><span class=\"item-foot\">{4}</span>\n            <span class=\"item-foot\">Нужно: {5} одинаковых ресурса цвета «{6}» или выше + {7} за работу{8}</span></div>\n          <div class=\"card-act\"><button type=\"button\" data-brew=\"{9}\" {10}>Сварить</button></div></div>", [itemIcon(rc.out), c.name, rc.n, c.alchemy ? _t(" <span class=\"tag\" style=\"--c:#8fd08a\">только здесь</span>") : '', c.desc, rc.res, Tiers.get(lo).name, money(fee), stack ? _t(" · возьму: {0} ({1})", [resLabel(stack.kind, stack.tier), stack.n]) : _t(" · <b class=\"warn\">подходящих ресурсов нет</b>"), i, stack && Profile.data.coins >= fee ? '' : 'disabled']);
      }).join('');
      const dd = Profile.data, ks = alchStack(3), kfee = 150, bs = Profile.resList().filter((r) => r.kind === 'shell' && r.n >= 2).sort((a, b) => a.tier - b.tier)[0], bfee = 400;
      let extra = '';
      if (!(dd.xkeys && dd.xkeys.emerald) && !(dd.xchests && dd.xchests.emerald)) {
        const nd = dd.backpack.dust || 0;
        extra += _t("<div class=\"card\" style=\"--t:#37c46a\"><div class=\"card-body\"><span class=\"item-title\">Живой ключ <span class=\"tag\" style=\"--c:#8fd08a\">только здесь</span></span><span class=\"item-foot\">Открывает изумрудный сундук у маяка. Нужно: 3 одинаковых ресурса + 2 каменной пыли (есть {0}) + {1}{2}</span></div>\n          <div class=\"card-act\"><button type=\"button\" data-brew-key=\"1\" {3}>Сварить</button></div></div>", [nd, money(kfee), ks ? _t(" · возьму: {0}", [resLabel(ks.kind, ks.tier)]) : _t(" — подходящих ресурсов нет"), ks && nd >= 2 && dd.coins >= kfee ? '' : 'disabled']);
      }
      if (dd.diary && !dd.breath && !(dd.xchests && dd.xchests.obsidian)) {
        extra += _t("<div class=\"card\" style=\"--t:#4fa3d8\"><div class=\"card-body\"><span class=\"item-title\">Зелье подводного дыхания <span class=\"tag\" style=\"--c:#8fd08a\">по дневнику</span></span><span class=\"item-foot\">На один нырок к серебряному сундуку. Нужно: 2 ракушки одного цвета{0} + {1}</span></div>\n          <div class=\"card-act\"><button type=\"button\" data-brew-breath=\"1\" {2}>Сварить</button></div></div>", [bs ? _t(" (возьму: {0})", [resLabel(bs.kind, bs.tier)]) : _t(" — ракушек нет (выпадают из крабов и речных тварей)"), money(bfee), bs && dd.coins >= bfee ? '' : 'disabled']);
      }
      if (dd.breath) extra += _t("<p class=\"hint\">Зелье подводного дыхания готово — ныряйте у серебряного сундука.</p>");
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Алхимик\">{0}\n        <div class=\"screen-body tavern-body\"{1}><div class=\"npc-row\"><span class=\"npc-portrait\">{2}</span>\n          <div class=\"npc-say\"><b>Тётушка Жабка, алхимик</b><p class=\"hint\">{3}</p></div></div>\n          {4}\n          <div class=\"card-list\">{5}{6}</div>\n          <h3>Эликсиры</h3><p class=\"hint\">Прибавка к характеристике на несколько боёв. Нужно {7} одинаковых ресурса цвета эликсира и монеты за работу. Выпить — в рюкзаке героя.</p>\n          {8}\n          <div class=\"card-list\">{9}</div></div></div>", [head(_t("Алхимик")), sceneStyle('alchemist'), npcPortrait('alchemist', '#6f8a4a', '#f2d24a'), s.msg || _t("Ква! Неси добычу — сварю такое, чего в Лавке не купишь."), tipBox('alchemist', _t("Здесь же варятся «Живой ключ» и зелье подводного дыхания — карточки появляются, когда они нужны по поручениям.")), extra, cards, Elixirs.need(1), tierPicker(Math.max(1, Hero.tierFor(Profile.level())), s.etier || 1, 'elix-tier'), Elixirs.ORDER.map((k) => {
            const et = s.etier || 1, res = elixStack(et), fee = Elixirs.price(et);
            return _t("<div class=\"card\" style=\"--t:{0}\">{1}<div class=\"card-body\"><span class=\"item-title\">{2}</span>\n              <span class=\"item-foot\">{3}. Нужно: {4} ресурса цвета «{5}»{6} + {7}</span></div>\n              <div class=\"card-act\"><button type=\"button\" data-elix-brew=\"{8}\" {9}>Сварить</button></div></div>", [tierColor(et), Elixirs.icon(k, et), Elixirs.KINDS[k].name, Elixirs.describe(k, et), Elixirs.need(et), Tiers.get(et).name, res ? _t(" (возьму: {0})", [resLabel(res.kind, res.tier)]) : _t(" — таких нет"), money(fee), k, res && Profile.data.coins >= fee ? '' : 'disabled']);
          }).join('')]);
    },
    click(b) {
      const s = st.alchemist, d = b.dataset;
      if (d.elixTier !== undefined) { s.etier = Number(d.elixTier); return changed(); }
      if (d.brewKey) {
        const ks = alchStack(3);
        if (!ks || Profile.data.coins < 150 || (Profile.data.backpack.dust || 0) < 2 || !Profile.takeRes(ks.kind, ks.tier, 3)) return;
        Profile.spend(150); Profile.data.backpack.dust -= 2;
        Profile.data.xkeys = Profile.data.xkeys || {}; Profile.data.xkeys.emerald = true; Profile.save();
        s.msg = _t("Готово: «Живой ключ» шевелится в ладони. Неси к изумрудному сундуку у маяка. Ква!");
        return changed();
      }
      if (d.brewBreath) {
        const bs = Profile.resList().filter((r) => r.kind === 'shell' && r.n >= 2).sort((a, b) => a.tier - b.tier)[0];
        if (!bs || Profile.data.coins < 400 || !Profile.takeRes(bs.kind, bs.tier, 2)) return;
        Profile.spend(400); Profile.data.breath = true; Profile.save();
        s.msg = _t("Готово: зелье подводного дыхания. Выпьешь у серебряного сундука — хватит на один нырок. Ква!");
        return changed();
      }
      if (d.elixBrew !== undefined) {
        const et = s.etier || 1, res = elixStack(et), fee = Elixirs.price(et);
        if (!res || Profile.data.coins < fee || !Profile.takeRes(res.kind, res.tier, Elixirs.need(et))) return;
        Profile.spend(fee); Profile.addElixir(d.elixBrew, et, 1);
        s.msg = _t("Готово: {0}, цвет «{1}». Ква!", [Elixirs.KINDS[d.elixBrew].name, Tiers.get(et).name]);
        return changed();
      }
      if (d.brew === undefined) return;
      const rc = RECIPES[Number(d.brew)], stack = alchStack(rc.res), fee = alchFee(rc);
      if (!stack || Profile.data.coins < fee || !Profile.takeRes(stack.kind, stack.tier, rc.res)) return;
      Profile.spend(fee);
      Profile.addConsumable(rc.out, rc.n);
      s.msg = _t("Готово: {0} × {1}. Ква!", [Gear.CONSUMABLES[rc.out].name, rc.n]);
      return changed();
    },
  };

  /* =============== ТОРГОВЫЕ РЯДЫ (1.3.0): объявления о продаже =============== */
  const MK_KINDS = [['item', _t("Вещи")], ['res', _t("Ресурсы")], ['cons', _t("Расходники")], ['ammo', _t("Боеприпасы")]];
  function mkAssets(kind) {
    if (kind === 'item') return Profile.data.items.filter((e) => !Profile.equippedUid(e.uid)).map((e) => ({ key: e.uid, have: 1, name: Gear.item(e).name, icon: itemIcon('', '', e.id), tier: e.tier, entry: e }));
    if (kind === 'res') return Profile.resList().map((r) => ({ key: r.kind + ':' + r.tier, have: r.n, name: resLabel(r.kind, r.tier), icon: MonsterArt.resIcon(r.kind, r.tier), tier: r.tier }));
    if (kind === 'cons') return Object.entries(Gear.CONSUMABLES).filter(([k]) => Profile.data.backpack[k] > 0).map(([k, c]) => ({ key: k, have: Profile.data.backpack[k], name: c.name, icon: itemIcon(k), unit: consPrice(k) }));
    return Ammo.ORDER.filter((k) => Profile.ammo(k) > 0).map((k) => ({ key: k, have: Profile.ammo(k), name: Ammo.CATALOG[k].name, icon: Ammo.icon(k), unit: Hero.consumablePrice(Ammo.CATALOG[k].price, Profile.level()) }));
  }
  const lotIcon = (lot) => lot.kind === 'item' ? itemIcon('', '', lot.entry.id) : lot.kind === 'res' ? MonsterArt.resIcon(lot.key.split(':')[0], Number(lot.key.split(':')[1])) : lot.kind === 'cons' ? itemIcon(lot.key) : Ammo.icon(lot.key);
  function mkTake(kind, a, n) {
    if (kind === 'item') { Profile.data.items = Profile.data.items.filter((e) => e.uid !== a.key); Profile.save(); return true; }
    if (kind === 'res') { const [k, t] = a.key.split(':'); return Profile.takeRes(k, Number(t), n); }
    if (kind === 'cons') { if ((Profile.data.backpack[a.key] || 0) < n) return false; Profile.data.backpack[a.key] -= n; Profile.save(); return true; }
    if (Profile.ammo(a.key) < n) return false; Profile.data.ammo[a.key] -= n; Profile.save(); return true;
  }
  function mkReturn(lot) {
    if (lot.kind === 'item') return Profile.addItem(lot.entry);
    if (lot.kind === 'res') { const [k, t] = lot.key.split(':'); return Profile.addRes(k, Number(t), lot.n); }
    if (lot.kind === 'cons') return Profile.addConsumable(lot.key, lot.n);
    return Profile.addAmmo(lot.key, lot.n);
  }
  const market = {
    html() {
      const s = st.market, M = Profile.data.market || { lots: [], log: [] };
      const sold = Profile.marketTick();
      if (sold.length) s.msg = _t("Продано: ") + sold.map((l) => _t("{0}{1} за {2}", [l.name, l.n > 1 ? ' × ' + l.n : '', MonsterArt.moneyHtml(l.price)])).join(', ');
      let body;
      if (s.tab === 'lots') {
        const lots = M.lots.map((l) => _t("<div class=\"card\" style=\"--t:#c9b48a\">{0}<div class=\"card-body\"><span class=\"item-title\">{1}{2}</span>\n            <span class=\"item-foot\">Цена: {3} · {4}</span></div>\n          <div class=\"card-act\"><button type=\"button\" data-mk-withdraw=\"{5}\">Снять</button></div></div>", [lotIcon(l), l.name, l.n > 1 ? ' × ' + l.n : '', money(l.price), Market.etaText(l.price, l.fair), l.id])).join('') || _t("<p class=\"hint\">Лотов нет. Выставьте что-нибудь на вкладке «Выставить».</p>");
        const log = M.log.map((r) => _t("<div class=\"bag-row\"><span>{0} — {1}{2} за {3}</span></div>", [new Date(r.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), r.name, r.n > 1 ? ' × ' + r.n : '', money(r.price)])).join('') || _t("<p class=\"hint\">Продаж ещё не было.</p>");
        body = _t("<h3>Ваши лоты ({0}/{1})</h3><div class=\"card-list\">{2}</div><h3>Проданное</h3>{3}", [M.lots.length, Market.MAX_LOTS, lots, log]);
      } else {
        const assets = mkAssets(s.kind);
        const a = assets.find((x) => x.key === s.sel) || null;
        const list = assets.map((x) => `<button type="button" class="btile ${a && a.key === x.key ? 'on' : ''}" data-mk-pick="${x.key}" ${x.tier ? `style="--c:${tierColor(x.tier)}"` : ''}>${x.icon}<span>${x.name}${x.have > 1 ? ' × ' + x.have : ''}</span></button>`).join('') || _t("<p class=\"hint\">Здесь пока нечего выставить.</p>");
        let panel = _t("<p class=\"hint\">Выберите, что продать.</p>");
        if (a) {
          const n = s.kind === 'item' ? 1 : Math.min(a.have, s.qty === 'all' ? a.have : s.qty);
          const fair = Market.fairUnit(s.kind, a.key, a.entry, a.unit) * n, price = Math.max(1, Math.round(fair * s.mult)), fee = Market.fee(price);
          const qty = s.kind === 'item' ? '' : `<div class="qty-picker">${[1, 5, 10, 'all'].map((q) => `<button type="button" class="qs ${s.qty === q ? 'on' : ''}" data-mk-qty="${q}">${q === 'all' ? _t("все") : '×' + q}</button>`).join('')}</div>`;
          const prices = `<div class="qty-picker">${Market.PRICE_STEPS.map((m) => `<button type="button" class="qs ${s.mult === m ? 'on' : ''}" data-mk-mult="${m}">${money(Math.max(1, Math.round(fair * m)))}</button>`).join('')}</div>`;
          const full = (M.lots || []).length >= Market.MAX_LOTS;
          panel = _t("<div class=\"pick-detail\"><b>{0} × {1}</b>{2}\n            <p class=\"hint\">Цена за лот (справедливая — {3}):</p>{4}\n            <p class=\"hint\">{5}. Сбор за место: {6} — не возвращается.</p>\n            {7}\n            <div class=\"pick-act\"><button type=\"button\" class=\"primary\" data-mk-list=\"1\" {8}>Выставить за {9}</button></div></div>", [a.name, n, qty, money(fair), prices, Market.etaText(price, fair), money(fee), full ? _t("<p class=\"hint warn\">Не больше {0} лотов одновременно.</p>", [Market.MAX_LOTS]) : '', !full && Profile.data.coins >= fee ? '' : 'disabled', money(price)]);
        }
        body = _t("<div class=\"tabs sub\">{0}</div>\n          <div class=\"two-col\"><div class=\"bag-grid\">{1}</div><div>{2}</div></div>\n          <p class=\"hint\">Надетые вещи не выставляются — сначала снимите их в оружейной.</p>", [MK_KINDS.map(([k, label]) => `<button type="button" class="${k === s.kind ? 'on' : ''}" data-mk-kind="${k}">${label}</button>`).join(''), list, panel]);
      }
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Торговые ряды\">{0}{1}\n        <div class=\"screen-body tavern-body\"{2}>{3}<p class=\"hint\">Здесь выставляют объявления о продаже. Пока покупатели — странствующие купцы: чем ближе цена к справедливой, тем быстрее купят. Когда у игры появится сервер, ваши лоты увидят другие игроки.</p>\n        {4}{5}</div></div>", [head(_t("Торговые ряды")), tabs([['lots', _t("Мои лоты")], ['sell', _t("Выставить")]], s.tab), sceneStyle('market'), typeof Art !== 'undefined' && Art.hasNpc('merchant') ? _t("<div class=\"npc-row\"><span class=\"npc-portrait\">{0}</span><div class=\"npc-say\"><b>Странствующий купец</b><p class=\"hint\">Присматриваюсь к объявлениям: чем справедливее цена, тем быстрее куплю.</p></div></div>", [Art.npcPortrait('merchant')]) : '', s.msg ? `<div class="gear-toast">${s.msg}</div>` : '', body]);
    },
    click(b) {
      const s = st.market, d = b.dataset;
      if (d.tab) { s.tab = d.tab; s.msg = ''; return render(); }
      if (d.mkKind) { s.kind = d.mkKind; s.sel = null; s.qty = 1; s.mult = 1; return render(); }
      if (d.mkPick) { s.sel = d.mkPick; s.msg = ''; return render(); }
      if (d.mkQty) { s.qty = d.mkQty === 'all' ? 'all' : Number(d.mkQty); return render(); }
      if (d.mkMult) { s.mult = Number(d.mkMult); return render(); }
      if (d.mkList) {
        const a = mkAssets(s.kind).find((x) => x.key === s.sel);
        const M = Profile.data.market;
        if (!a || M.lots.length >= Market.MAX_LOTS) return;
        const n = s.kind === 'item' ? 1 : Math.min(a.have, s.qty === 'all' ? a.have : s.qty);
        const fair = Market.fairUnit(s.kind, a.key, a.entry, a.unit) * n, price = Math.max(1, Math.round(fair * s.mult)), fee = Market.fee(price);
        if (Profile.data.coins < fee || !mkTake(s.kind, a, n)) return;
        Profile.spend(fee);
        const lot = Market.makeLot(s.kind, s.kind === 'item' ? a.entry.uid : a.key, n, price, fair, a.entry);
        lot.name = a.name;
        M.lots.push(lot);
        Profile.save();
        s.sel = null; s.msg = _t("Выставлено: {0}{1} за {2}", [a.name, n > 1 ? ' × ' + n : '', money(price)]);
        return changed();
      }
      if (d.mkWithdraw) {
        const M = Profile.data.market, lot = M.lots.find((l) => l.id === d.mkWithdraw);
        if (!lot) return;
        M.lots = M.lots.filter((l) => l !== lot);
        mkReturn(lot);
        Profile.save();
        s.msg = _t("Снято с продажи: {0}", [lot.name]);
        return changed();
      }
    },
  };

  /* =============== СПРАВКА «КАК ИГРАТЬ» (1.4.7) =============== */
  const help = {
    html() {
      const spells = (typeof MAGICS !== 'undefined' && typeof Balance !== 'undefined')
        ? Object.entries(Balance.spellUnlock).filter(([k]) => MAGICS[k]).sort((a, b) => a[1] - b[1]).map(([k, lv]) => _t("{0} — с {1}-го уровня", [MAGICS[k].name, lv])).join('; ') : '';
      const blds = Object.entries(Unlocks.NEED).sort((a, b) => a[1] - b[1]).map(([id, n]) => _t("{0} — после {1} побед", [Unlocks.NAMES[id], n])).join('; ');
      const card = (t, body) => `<div class="card quest-card"><div class="card-body"><span class="item-title">${t}</span><span class="item-foot help-text">${body}</span></div></div>`;
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Как играть\">{0}\n        <div class=\"screen-body tavern-body\"><p class=\"hint\">Короткая справка. Всё, что не открыто, игра подсказывает сама — по мере прохождения.</p><div class=\"cards\">\n        {1}\n        {2}\n        {3}\n        {4}\n        {5}\n        {6}\n        {7}\n        {8}\n        </div></div></div>", [head(_t("Как играть")), card(_t("Бой"), _t("Меняйте местами два соседних камня, чтобы собрать линию из трёх и больше камней одного цвета. Собранные камни бьют врага и копятся для заклинаний. Линия из четырёх и больше камней даёт дополнительный ход. На ход даётся 30 секунд: три пропуска подряд — и бой проигран.")), card(_t("Заклинания"), _t("Кнопки магии — рядом с полем; цена указана в камнях разных цветов (подсказка — по нажатию или наведению). Открываются по уровням: {0}. Новое заклинание в бою подсвечено, пока вы его не нажмёте.", [spells])), card(_t("Снаряжение"), _t("Вещи надеваются в оружейной вашего дома. Лимит — очки снаряжения, они растут с уровнем. В дорогу берутся эликсиры, расходники и боеприпасы (кнопка «Рюкзак»).")), card(_t("Питомцы и яйца"), _t("Победив зверя достаточное число раз, его можно приручить. Питомник: выбор спутника, уход и инкубатор. Яйца редких питомцев падают с грифона, виверны и саламандры.")), card(_t("Эликсиры и зелья"), _t("Алхимик варит зелья и эликсиры из добытых ресурсов. Эликсиры усиливают героя на несколько боёв; боевые расходники лечат и усиливают прямо в бою.")), card(_t("Задания"), _t("У трактирщика, мельника, тюленя на маяке и старьёвщика есть поручения с наградами. Строка «Следующая цель» внизу карты подскажет, что делать сейчас.")), card(_t("Сундуки побережья"), _t("На восточном и западном берегу стоят цветные сундуки. Ключи — за поручения тюленя, старьёвщика и алхимика. Серебряный сундук на дне открывается после трёх цветных.")), card(_t("Когда что открывается"), _t("Здания открываются по числу побед: {0}. Остальные доступны сразу.", [blds]))]);
    },
    click() {},
  };
  const SCREENS = { help, shop, forge, best, faction, tavern, mill, lighthouse, wreck, chest, junker, library, artistWorkshop, valor, credits, kennel, alchemist, market };
  return { open, close, refresh: render, get isOpen() { return !!root; }, openShop: () => open('shop'), openForge: () => open('forge'), openBestiary: () => open('best'),
    openTavern: () => { st.tavern.msg = ''; open('tavern'); },
    openJunker: () => { st.junker.msg = ''; open('junker'); },
    openMill: () => { st.mill.msg = ''; open('mill'); },
    openLighthouse: () => { st.lighthouse.msg = ''; open('lighthouse'); },
    openWreck: () => { st.wreck.msg = ''; open('wreck'); },
    openChest: (kind) => { st.chest.msg = ''; st.chest.kind = kind || 'sapphire'; open('chest'); },
    deepReward,
    openLibrary: () => { st.library.tab = 'npc'; st.library.msg = ''; open('library'); },
    openArtistWorkshop: () => { st.artistWorkshop.msg = ''; open('artistWorkshop'); },
    openValor: () => open('valor'),
    openCredits: () => open('credits'),
    openFactions: (first = false) => {
      st.fac.first = first; st.fac.msg = '';
      if (first) {
        st.fac.name = Profile.data.name || ''; st.fac.gender = Profile.data.gender || null; st.fac.picked = Profile.data.faction || null;
        st.fac.step = st.fac.picked ? 'detail' : 'crest';
      }
      open('faction');
    } };
})();
