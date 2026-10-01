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
    junker: { msg: '' },
    library: { tab: 'npc', filter: 'weapon', itemTier: 1, msg: '', spellPick: false },
    artistWorkshop: { msg: '' },
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
  const levelNote = (it) => (Hero.canWear(it.tier, Profile.level()) ? '' : ` · <b class="warn">надеть можно с ${Hero.itemLevel(it.tier)}-го уровня</b>`);
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
    const title = got
      ? (tierOpen ? 'Получено' : `Получено — тир откроется на уровне ${unlockLvl} (сейчас ${level})`)
      : `Прогресс: ${progress} / ${need}`;
    const b = got ? Medals.bonusFor(id) : {};
    return `<div class="card medal ${got ? '' : 'todo'} ${tierOpen ? '' : 'locked'}" data-tier="${tierOpen ? tier : 0}"
        style="--t:${tierColor(tier)}" title="${title}">
      <div class="card-body"><span class="item-title">${Medals.nameFor(id)}</span>
        ${got ? `<span class="chips">${statChips(b)}</span>` : `<span class="item-foot">${progress} / ${need}</span>`}</div></div>`;
  }
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
  const head = (title) => `<header><h2>${title}</h2><span class="wallet-head">${money(Profile.data.coins)}</span><button type="button" class="close" data-act="close">Закрыть</button></header>`;
  const tabs = (items, active) => `<div class="tabs">${items.map(([k, label]) => `<button type="button" class="${k === active ? 'on' : ''}" data-tab="${k}">${label}</button>`).join('')}</div>`;
  const tierPicker = (max, active, attr) => `<div class="tier-picker">${Tiers.LIST.map((t) => `<button type="button" class="tp ${t.id === active ? 'on' : ''}" data-tier="${t.id}" style="--t:${t.color};--ti:${t.ink}" ${t.id > max ? 'disabled' : ''} data-${attr}="${t.id}" title="${t.name}">${t.id}</button>`).join('')}</div>`;
  const changed = () => { if (typeof onEconomyChanged === 'function') onEconomyChanged(); render(); };
  // Приручение (см. pets.js): прогресс/кнопка в карточке вида бестиария, показывается только для приручаемого
  // семейства («Звери»). Текущий питомец (если это его вид) — с прочностью и кнопкой ремонта.
  function tameBox(id) {
    if (!Pets.isTameableSpecies(id)) return '';
    const cur = Profile.pet();
    if (cur && cur.speciesId === id) {
      const dur = `${cur.durability}/${cur.maxDurability}`;
      return `<div class="ability-box"><b>Питомец: ${Pets.petDisplayName(id)}</b><span>Прочность: ${dur}${Pets.isUsable(cur) ? '' : ' — не может выйти в бой, пока не восстановлена'}</span>
        ${Pets.isUsable(cur) ? '' : '<div class="reset"><button type="button" class="primary" data-repair-pet="1">Восстановить питомца</button></div>'}</div>`;
    }
    const wins = Pets.tameProgress(Profile.data.bestiary, id), need = Pets.TAME_WINS;
    if (Pets.canTame(Profile.data.bestiary, id)) {
      return `<div class="ability-box"><b>Приручение: готово</b><span>Побед над видом: ${wins}/${need}</span>
        <div class="reset"><button type="button" class="primary" data-tame="${id}">Приручить</button></div></div>`;
    }
    return `<div class="ability-box"><b>Приручение</b><span>Побед над видом: ${Math.min(wins, need)}/${need} — приручается после ${need} побед</span></div>`;
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
          return itemCard(it, `Цена: ${money(buyPrice(it.price))}${levelNote(it)}`, `<button type="button" data-buy-item="${it.uid}" ${Profile.data.coins >= buyPrice(it.price) ? '' : 'disabled'}>Купить</button>`);
        }).join('') || '<p class="hint">Всё раскуплено. Новые товары появятся после следующего боя.</p>';
        const qtyPicker = (kind, key, active) => `<div class="qty-picker">${QTY_STEPS.map((n) => `<button type="button" class="qs ${n === active ? 'on' : ''}" data-qty="${kind}" data-qty-key="${key}" data-qty-n="${n}">×${n}</button>`).join('')}</div>`;
        const cons = Object.entries(Gear.CONSUMABLES).map(([k, c]) => {
          const qty = s.consQty[k] || 1, total = buyPrice(Gear.bulkPrice(consPrice(k), qty));
          return `<div class="card" style="--t:#c9b48a">${itemIcon(k)}<div class="card-body"><span class="item-title">${c.name}</span><span class="item-foot">${c.desc}</span><span class="item-foot">Цена: ${money(buyPrice(consPrice(k)))} за шт. · в ранце: ${Profile.data.backpack[k] || 0}</span></div>
          <div class="card-act">${qtyPicker('cons', k, qty)}<button type="button" data-buy-cons="${k}" data-n="${qty}" ${Profile.data.coins >= total ? '' : 'disabled'}>Купить ×${qty} за ${money(total)}</button></div></div>`;
        }).join('');
        const rt = Math.min(s.resTier, sh.top);
        const res = Object.entries(Bestiary.RESOURCES).map(([k]) => {
          const unit = buyPrice(Bestiary.resPrice(k, rt) * RES_BUY_MARKUP), qty = s.resQty[k] || 1, total = Gear.bulkPrice(unit, qty);
          return `<div class="card" style="--t:${tierColor(rt)}">${MonsterArt.resIcon(k, rt)}<div class="card-body"><span class="item-title">${resLabel(k, rt)}</span><span class="item-foot">Цена: ${money(unit)} за шт. · у вас: ${Profile.res(k, rt)}</span></div>
            <div class="card-act">${qtyPicker('res', k, qty)}<button type="button" data-buy-res="${k}" data-n="${qty}" ${Profile.data.coins >= total ? '' : 'disabled'}>Купить ×${qty} за ${money(total)}</button></div></div>`;
        }).join('');
        body = `<h3>Вещи (цвет растёт с уровнем героя: сейчас до «${Tiers.get(sh.top).name}»)</h3><div class="card-list">${items}</div>
          <h3>Расходники</h3><div class="card-list">${cons}</div>
          <h3>Ресурсы</h3>${tierPicker(sh.top, rt, 'restier')}<div class="card-list">${res}</div>
          <p class="hint">Руны теперь продаёт Журавль-художник в Мастерской художника.</p>`;
      } else {
        const items = Profile.data.items.filter((e) => !Profile.equippedUid(e.uid)).map((e) => Gear.item(e))
          .sort((a, b) => b.tier - a.tier).map((it) =>
            itemCard(it, `Продать за: ${money(Gear.sellValue(it.price))}`, `<button type="button" data-sell-item="${it.uid}">Продать</button>`)).join('') || '<p class="hint">Нет вещей на продажу (надетые не продаются).</p>';
        const cons = Object.entries(Gear.CONSUMABLES).filter(([k]) => Profile.data.backpack[k] > 0).map(([k, c]) => `
          <div class="card" style="--t:#c9b48a">${itemIcon(k)}<div class="card-body"><span class="item-title">${c.name} × ${Profile.data.backpack[k]}</span><span class="item-foot">За штуку: ${money(Gear.sellValue(consPrice(k)))}</span></div>
          <div class="card-act"><button type="button" data-sell-cons="${k}">Продать 1</button></div></div>`).join('') || '<p class="hint">Расходников нет.</p>';
        const res = Profile.resList().map((r) => {
          const p = Bestiary.resPrice(r.kind, r.tier);
          return `<div class="card" style="--t:${tierColor(r.tier)}">${MonsterArt.resIcon(r.kind, r.tier)}<div class="card-body"><span class="item-title">${resLabel(r.kind, r.tier)} × ${r.n}</span><span class="item-foot">За штуку: ${money(p)}</span></div>
            <div class="card-act"><button type="button" data-sell-res="${r.kind}:${r.tier}" data-n="1">×1</button><button type="button" data-sell-res="${r.kind}:${r.tier}" data-n="all">Все</button></div></div>`;
        }).join('') || '<p class="hint">Ресурсов нет. Они выпадают из монстров.</p>';
        body = `<h3>Вещи</h3><div class="card-list">${items}</div><h3>Расходники</h3><div class="card-list">${cons}</div><h3>Ресурсы</h3><div class="card-list">${res}</div>`;
      }
      return `<div class="modal" role="dialog" aria-label="Лавка">${head('Лавка')}${tabs([['buy', 'Купить'], ['sell', 'Продать']], s.tab)}
        <div class="screen-body">${s.msg ? `<div class="gear-toast">${s.msg}</div>` : ''}${body}</div></div>`;
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
        s.msg = `Куплено: ${it.name} (${Tiers.get(it.tier).name})`;
        return changed();
      }
      if (d.buyCons) {
        const c = Gear.CONSUMABLES[d.buyCons], n = Math.max(1, Number(d.n) || 1), total = buyPrice(Gear.bulkPrice(consPrice(d.buyCons), n));
        if (!Profile.spend(total)) return;
        Profile.addConsumable(d.buyCons, n);
        s.msg = `Куплено: ${c.name} × ${n}`;
        return changed();
      }
      if (d.buyRes) {
        const n = Math.max(1, Number(d.n) || 1), rt = Math.min(s.resTier, Profile.shop().top);
        const total = Gear.bulkPrice(buyPrice(Bestiary.resPrice(d.buyRes, rt) * RES_BUY_MARKUP), n);
        if (!Profile.spend(total)) return;
        Profile.addRes(d.buyRes, rt, n);
        s.msg = `Куплено: ${resLabel(d.buyRes, rt)} × ${n}`;
        return changed();
      }
      if (d.sellItem) {
        const it = Gear.item(Profile.item(d.sellItem));
        Profile.removeItem(d.sellItem);
        Profile.addCoins(Gear.sellValue(it.price));
        s.msg = `Продано: ${it.name}`;
        return changed();
      }
      if (d.sellCons) {
        const c = Gear.CONSUMABLES[d.sellCons];
        if (!(Profile.data.backpack[d.sellCons] > 0)) return;
        Profile.data.backpack[d.sellCons]--;
        Profile.addCoins(Gear.sellValue(consPrice(d.sellCons)));
        s.msg = `Продано: ${c.name}`;
        return changed();
      }
      if (d.sellRes) {
        const [kind, tier] = d.sellRes.split(':'), have = Profile.res(kind, Number(tier));
        const n = d.n === 'all' ? have : 1;
        if (!Profile.takeRes(kind, Number(tier), n)) return;
        Profile.addCoins(Bestiary.resPrice(kind, Number(tier)) * n);
        s.msg = `Продано: ${resLabel(kind, Number(tier))} × ${n}`;
        return changed();
      }
    },
  };

  /* =============== КУЗНИЦА =============== */
  const FILTERS = [
    ['weapon', 'Оружие', (t) => t === 'weapon1' || t === 'weapon2'], ['shield', 'Щиты', (t) => t === 'shield'],
    ['head', 'Шлемы', (t) => t === 'head'], ['chest', 'Нагрудники', (t) => t === 'chest'], ['arms', 'Наручи', (t) => t === 'arms'],
    ['legs', 'Поножи', (t) => t === 'legs'], ['amulet', 'Амулеты', (t) => t === 'amulet'],
  ];
  const costHtml = (c) => `<div class="costs"><span class="need ${Profile.data.coins >= c.coins ? 'ok' : 'no'}">Монеты: ${money(c.coins)}</span>${c.res.map((r) => haveNeed(r.kind, r.tier, r.n)).join('')}</div>`;
  const canPay = (c) => Profile.data.coins >= c.coins && c.res.every((r) => Profile.res(r.kind, r.tier) >= r.n);
  const pay = (c) => { Profile.spend(c.coins); for (const r of c.res) Profile.takeRes(r.kind, r.tier, r.n); };

  const forge = {
    html() {
      const s = st.forge;
      let body = '';
      if (s.tab === 'upgrade') {
        const items = Profile.data.items.map((e) => Gear.item(e)).sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name));
        if (!s.sel || !Profile.item(s.sel)) s.sel = items[0] ? items[0].uid : null;
        const list = items.map((it) => `<button type="button" class="itembtn ${s.sel === it.uid ? 'on' : ''}" data-pick="${it.uid}">${itemCard(it, Profile.equippedUid(it.uid) ? 'надет' : '')}</button>`).join('') || '<p class="hint">У вас нет вещей.</p>';
        let detail = '<p class="hint">Выберите вещь слева.</p>';
        if (s.sel) {
          const it = Gear.item(Profile.item(s.sel)), cost = forgeCost(Gear.upgradeCost(Profile.item(s.sel)));
          if (!cost) detail = `${itemCard(it, 'Максимальный уровень')}<p class="hint">Эта вещь уже Обсидиановая — выше улучшать некуда.</p>`;
          else {
            const next = Gear.item({ ...Profile.item(s.sel), tier: it.tier + 1 });
            const lvlWarn = Hero.canWear(next.tier, Profile.level()) ? '' : `<p class="hint warn">Вещь цвета «${Tiers.get(next.tier).name}» можно надеть с ${Hero.itemLevel(next.tier)}-го уровня.</p>`;
            const worn = Profile.equippedUid(it.uid), locked = worn && !canEditGear();
            detail = `${itemCard(it, 'Сейчас')}<div class="arrow-down">повышение до ${tierChip(next.tier)}</div>${itemCard(next, `В очках снаряжения: ${it.cost} → ${next.cost}`)}
              <h3>Стоимость (ресурсы того же цвета, что у вещи)</h3>${costHtml(cost)}${lvlWarn}
              ${locked ? '<p class="hint warn">Надетую вещь можно улучшать до первого хода боя или после его окончания.</p>' : ''}
              <div class="reset"><button type="button" data-do-upgrade="1" ${canPay(cost) && !locked ? '' : 'disabled'}>Улучшить</button></div>`;
          }
        }
        body = `<div class="two-col"><div class="item-list tall">${list}</div><div>${detail}</div></div>`;
      } else {
        const f = FILTERS.find((x) => x[0] === s.filter);
        const top = Hero.tierFor(Profile.level());
        if (!s.craftTier || s.craftTier > top) s.craftTier = top;
        const ct = s.craftTier;
        const bases = Gear.itemsFor(Profile.data.faction).filter((b) => f[2](b.type)).sort((a, b) => a.cost - b.cost);
        const list = bases.map((b) => {
          const it = Gear.item({ id: b.id, tier: ct }), cost = forgeCost(Gear.craftCost(b.id, ct));
          return `<div>${itemCard(it, `${Gear.RARITY_NAMES[b.rarity]} · из ресурсов цвета «${Tiers.get(ct).name}»`, `<button type="button" data-craft="${b.id}" ${canPay(cost) ? '' : 'disabled'}>Создать</button>`)}${costHtml(cost)}</div>`;
        }).join('');
        body = `<div class="tabs sub">${FILTERS.map(([k, label]) => `<button type="button" class="${k === s.filter ? 'on' : ''}" data-filter="${k}">${label}</button>`).join('')}</div>
          <p class="hint">Цвет новой вещи (до цвета вашего уровня):</p>${tierPicker(top, ct, 'crafttier')}<div class="card-list">${list}</div>`;
      }
      const res = Profile.resList().map((r) => `<span class="need ok">${MonsterArt.resIcon(r.kind, r.tier)}${resLabel(r.kind, r.tier)} × ${r.n}</span>`).join('') || '<span class="hint">Ресурсов нет</span>';
      return `<div class="modal" role="dialog" aria-label="Кузница">${head('Кузница')}${tabs([['upgrade', 'Улучшить цвет'], ['craft', 'Создать вещь']], s.tab)}
        <div class="screen-body">${s.msg ? `<div class="gear-toast">${s.msg}</div>` : ''}<div class="stock-line">Ваши ресурсы: ${res}</div>${body}</div></div>`;
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
        s.msg = `Улучшено: ${it.name} — теперь ${Tiers.get(it.tier).name}`;
        // если вещь надета и очки превышены — снимаем её
        const worn = Profile.equippedUid(e.uid);
        if (worn && Gear.totalCost(Profile.gear()) > Profile.budget()) {
          Profile.data.loadout[worn] = null;
          Profile.save();
          s.msg += '. Лимит очков превышен — вещь снята';
        }
        onGearChanged();
        return changed();
      }
      if (d.craft) {
        const cost = forgeCost(Gear.craftCost(d.craft, s.craftTier || 1));
        if (!canPay(cost)) return;
        pay(cost);
        const e = Gear.makeEntry(d.craft, s.craftTier || 1);
        Profile.addItem(e);
        s.msg = `Создано: ${Gear.item(e).name}`;
        return changed();
      }
    },
  };

  /* =============== БЕСТИАРИЙ =============== */
  const best = {
    html() {
      const s = st.best, known = Profile.species();
      if (!known.length) {
        return `<div class="modal" role="dialog" aria-label="Бестиарий">${head('Бестиарий')}<div class="screen-body">
          <p class="hint">Вы ещё не встретили ни одного существа. Выйдите за частокол деревни — существа, которых вы увидите на карте, попадут в бестиарий.</p></div></div>`;
      }
      if (!s.sel || !known.includes(s.sel)) s.sel = Profile.data.monster.id in Bestiary.MONSTERS && known.includes(Profile.data.monster.id) ? Profile.data.monster.id : known[0];
      const maxT = Profile.maxTier(s.sel);
      s.tier = Math.max(1, Math.min(s.tier, maxT));
      const list = Bestiary.ORDER.map((id) => {
        const m = Bestiary.MONSTERS[id], open = known.includes(id);
        return open
          ? `<button type="button" class="beast ${s.sel === id ? 'on' : ''}" data-species="${id}"><span class="beast-art">${MonsterArt.has(id) ? MonsterArt.bust(id, Profile.maxTier(id)) : Figures.avatar('dragon', null)}</span><span><b>${m.name}</b><small>открыт уровень ${Profile.maxTier(id)}</small></span></button>`
          : `<div class="beast locked"><span class="beast-art q">?</span><span><b>???</b><small>встречается в зонах ${HexMap.SPAWN[id].tiers.join('–')}</small></span></div>`;
      }).join('');
      const m = Bestiary.MONSTERS[s.sel], sc = Bestiary.scaled(s.sel, s.tier);
      const art = MonsterArt.has(s.sel) ? MonsterArt.bust(s.sel, s.tier) : `<div class="dragon-art" style="--t:${tierColor(s.tier)}">${Figures.avatar('dragon', null)}</div>`;
      const drops = m.drops.map(([kind, chance, min, max]) => `<div class="bag-row">${MonsterArt.resIcon(kind, s.tier)}<span><b>${resLabel(kind, s.tier)}</b> · ${Math.round(chance * 100)}% · ${min === max ? min : min + '–' + max} шт.</span></div>`).join('');
      const coins = Math.round(m.coins * Tiers.PRICE_MULT[s.tier - 1]);
      const innate = Object.entries(sc.stats).filter(([, v]) => v > 0).map(([k, v]) => `<span class="chip">${fmtStat(k, v)}</span>`).join('') || '<span class="hint">нет</span>';
      const onMap = !inBattle;
      const L = Profile.level(), myS = Gear.combine(Gear.combine(Gear.stats(Profile.gear()), Factions.statsAt(Profile.data.faction || 'dwarf', Hero.tierFloat(L))), Runes.bonusForGear(Profile.gear()));
      const pWin = Combat.winChance({ max: Hero.baseHp(L) + myS.health, dmg: Hero.dmgMult(L), stats: myS }, { max: sc.hp, dmg: sc.dmg, stats: sc.stats, ai: sc.ai }, s.sel);
      const danger = { label: { easy: 'Лёгкий', even: 'Равный', hard: 'Опасный', deadly: 'Смертельный' }[Combat.dangerBand(pWin)], pct: Math.round(pWin * 100) };
      return `<div class="modal" role="dialog" aria-label="Бестиарий">${head('Бестиарий')}
        <div class="screen-body two-col beast-layout"><div class="beast-list">${list}</div>
        <div class="beast-detail" style="--t:${tierColor(s.tier)}">
          <div class="beast-hero">${art}</div>
          <h3 class="beast-name">${m.name} ${tierChip(s.tier)}</h3><p class="hint"><b>${m.family}.</b> ${m.desc}</p>
          <div class="ability-box"><b>Приём: ${Bestiary.ability(s.sel).name}</b><span>${Bestiary.ability(s.sel).desc}</span></div>
          ${tameBox(s.sel)}
          ${tierPicker(maxT, s.tier, 'tier')}<small class="hint">Доступны цвета, которые вы встречали. Чем дальше от деревни, тем выше цвет.</small>
          <div class="stat-list"><div><span>ХП</span><b>${sc.hp}</b><small>здоровье существа</small></div><div><span>Уровень ИИ</span><b>${sc.ai}</b><small>глубина и точность ходов</small></div>${sc.gearBudget ? `<div><span>Снаряжение</span><b>${sc.gearBudget}</b><small>очков: доспехи и оружие</small></div>` : ''}
            <div><span>Опыт</span><b>+${Hero.xpReward(m, s.tier, Profile.level())}</b><small>за победу на вашем уровне</small></div>
            <div><span>Для вас</span><b>${danger.label}</b><small>шанс победы ~${danger.pct}%</small></div></div>
          <h3>Врождённые свойства</h3><div class="chips">${innate}</div>
          <h3>Добыча</h3><div class="bag-row"><span>Монеты: ${money(coins)} (примерно)</span></div>${drops}<div class="bag-row"><span>Шанс ${Math.round(Balance.rewards.itemChance * 100)}%: вещь, чаще обычная</span></div>
          ${onMap ? '<div class="reset"><button type="button" class="primary" data-show="1">Показать на карте</button></div>' : ''}
        </div></div></div>`;
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
        return `<div class="modal" role="dialog" aria-label="Добро пожаловать!"><header><h2>Добро пожаловать!</h2></header>
          <div class="screen-body">
            <p class="hint">Мир «Грань»: Великий кристалл раскололся, и народы спорят за его осколки — камни на поле боя. Выберите герб фракции, за которую хотите играть.</p>
            <div class="fac-crest-grid">${cards}</div>
          </div></div>`;
      }
      const draftGender = s.first ? s.gender : Profile.data.gender;
      const ids = s.first ? [s.picked] : Factions.ORDER;
      const cards = ids.map((id) => {
        const f = Factions.LIST[id];
        const stats = Object.entries(f.stats).map(([k, v]) => `<span class="chip">${fmtStat(k, v)}</span>`).join('');
        const chosen = s.first ? true : curF === id;
        const fig = Figures.figure(Factions.heroKind(id, draftGender || 'm'), !s.first && chosen ? Profile.gear() : null);
        const genderBtns = `<button type="button" class="primary ${s.gender === 'm' ? 'on' : ''}" data-gender="m">Мужской</button><button type="button" class="primary ${s.gender === 'f' ? 'on' : ''}" data-gender="f">Женский</button>`;
        const btn = s.first ? `<div class="gender-pick">${genderBtns}</div>`
          : `<button type="button" class="primary" data-faction="${id}" ${chosen ? 'disabled' : ''}>${chosen ? 'Ваша фракция' : 'Выбрать'}</button>`;
        return `<div class="fac-card ${s.first ? 'pick-mode' : ''} ${chosen ? 'on' : ''}" style="--fc:${f.color}">
          <div class="fac-fig">${fig}</div>
          <div class="fac-body">
            <div class="fac-head">${factionIcon(id, 'fac-emblem')}<span><b>${f.name}</b><small>${f.people} · герой: ${Factions.heroTitle(id, draftGender || 'm')}</small></span></div>
            <p class="hint">${f.desc}</p>
            <div class="fac-row"><span class="fac-gem">${GEM_SVG[f.gem]}</span><span>Родной камень: <b>${GEM_NAMES[f.gem]}</b> — заряжает приём</span></div>
            <div class="ability-box"><b>Приём «${f.ability.name}»</b><span>${f.ability.desc}. Ход не тратит.</span></div>
            <div class="chips">${stats}</div>
            <p class="hint">${f.perkText}</p>
            ${btn}
          </div></div>`;
      }).join('');
      const title = s.first ? `${Factions.LIST[s.picked].name}: выберите героя` : 'Фракция';
      const lead = s.first
        ? 'Представьтесь и выберите, кем вы будете играть.'
        : 'Сменить фракцию можно в любой момент в Ратуше. Вещи чужой фракции при этом снимаются.';
      const backBtn = s.first ? '<button type="button" class="close" data-act="back">← Назад к гербам</button>' : '';
      const reg = s.first ? `<div class="reg-row">
          <label class="reg-field"><span>Ваш ник</span><input type="text" maxlength="20" placeholder="Как вас называть?" value="${escText(s.name)}" data-nick></label>
          <button type="button" class="link-btn" data-random-name="1">Не знаю, как назваться → случайное имя</button>
        </div>` : '';
      const startBtn = s.first ? `<div class="reset"><button type="button" class="primary" data-act="start" ${canStartGame() ? '' : 'disabled'}>Начать игру!</button></div>` : '';
      return `<div class="modal" role="dialog" aria-label="${title}"><header>${backBtn}<h2>${title}</h2>${s.first ? '' : '<button type="button" class="close" data-act="close">Закрыть</button>'}</header>
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
        return close();
      }
      if (!d.faction) return;
      chooseFaction(d.faction);
      close();
    },
  };

  /* =============== ТАВЕРНА (гоблин-трактирщик и его задания) =============== */
  const GOBLIN_LINES = [
    'Присаживайся, путник. Сорок лет наливаю эль и слушаю байки — со мной не соскучишься.',
    'За частоколом неспокойно, но такому, как ты, найдётся, чем поживиться. Дам пару советов задаром.',
    'Кружку с дороги? А, снаряжения на кружку не хватает — тогда вот с чем могу помочь.',
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
      const ticketAct = bought ? '<span class="badge done">Билет на сегодня уже куплен</span>'
        : `<button type="button" class="primary" data-buy-ticket="1" ${Profile.data.coins >= price ? '' : 'disabled'}>Купить билет</button>`;
      const lottery = `<h3>Лотерея</h3><div class="cards"><div class="card quest-card">
          <div class="card-body"><span class="item-title">Билет удачи</span>
            <span class="item-foot">Один билет в день — приз выпадает всегда: ресурсы, монеты, расходник, реже вещь, совсем редко — джекпот.</span>
            <span class="item-foot quest-reward">Цена: ${money(price)}</span></div>
          <div class="card-act">${ticketAct}</div></div></div>`;
      return `<div class="modal" role="dialog" aria-label="Таверна">${head('Таверна')}
        <div class="screen-body tavern-body"${scene}>
          <div class="npc-row"><span class="npc-portrait">${portrait}</span>
            <div class="npc-say"><b>Старый гоблин-трактирщик</b><p class="hint">${s.msg || GOBLIN_LINES[0]}</p></div></div>
          <h3>Задания</h3><div class="cards">${quests}</div>${lottery}
        </div></div>`;
    },
    click(b) {
      if (b.dataset.buyTicket) {
        const r = Daily.buyTicket();
        st.tavern.msg = r.ok ? `Билет сыграл: ${r.text}! ${GOBLIN_LINES[2]}`
          : r.reason === 'coins' ? 'Не хватает монет на билет — приходи, как разбогатеешь.'
          : 'Билет на сегодня уже куплен — заходи завтра.';
        return changed();
      }
      questClick(b, 'tavern');
    },
  };

  // Общий рендер карточек заданий одного собеседника (giver — 'tavern' | 'mill').
  function questCards(giver) {
    return Quests.list(Profile.data, giver).map((q) => {
      let act;
      if (q.claimed) act = '<span class="badge done">Получено</span>';
      else if (!q.accepted) act = `<button type="button" class="primary" data-accept="${q.id}">Взять задание</button>`;
      else if (q.done) act = `<button type="button" class="primary" data-claim="${q.id}">Забрать награду</button>`;
      else act = `<span class="quest-progress">${q.value} / ${q.goal}</span>`;
      return `<div class="card quest-card ${q.claimed ? 'is-done' : ''}">
        <div class="card-body"><span class="item-title">${q.title}</span><span class="item-foot">${q.desc}</span>
          <span class="item-foot quest-reward">Награда: ${q.rewardText}</span></div>
        <div class="card-act">${act}</div></div>`;
    }).join('');
  }
  // Общий обработчик клика «Взять задание» / «Забрать награду» для экранов с заданиями. giver задаёт текст ответа.
  function questClick(b, giver) {
    const d = b.dataset;
    if (d.accept) {
      if (!Quests.accept(d.accept)) return;
      st[giver].msg = giver === 'mill' ? 'Заметано — как сделаешь, возвращайся за наградой.' : 'По рукам. Сделаешь — возвращайся, не обижу.';
      changed();
      return;
    }
    if (!d.claim) return;
    const q = Quests.find(d.claim);
    if (!Quests.claim(d.claim)) return;
    const line = giver === 'mill' ? `Держи — ${q.rewardText.toLowerCase()}. И заходи ещё, дело для тебя найдётся.`
      : `Держи — ${q.rewardText.toLowerCase()}. И заглядывай ещё, дело найдётся.`;
    st[giver].msg = line;
    changed();
  }

  /* =============== МЕЛЬНИЦА (мельник-мыш и его задания) =============== */
  const MOUSE_LINES = [
    'Заходи, заходи — мука свежая, жернова не скрипят. Тут для всякого дело найдётся.',
    'У нас в деревне без дела никто не сидит — даже мышь при работе. Помогу, чем смогу.',
    'Зерно берегу с осени, на всех хватит. А тебе, гляжу, амулет бы посерьёзнее не помешал.',
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
      return `<div class="modal" role="dialog" aria-label="Мельница">${head('Мельница')}
        <div class="screen-body tavern-body mill-body"${scene}>
          <div class="npc-row"><span class="npc-portrait">${portrait}</span>
            <div class="npc-say"><b>Мельник-мыш</b><p class="hint">${s.msg || MOUSE_LINES[0]}</p></div></div>
          <h3>Задания</h3><div class="cards">${quests}</div>
        </div></div>`;
    },
    click(b) { questClick(b, 'mill'); },
  };

  /* =============== ХИЖИНА СТАРЬЁВЩИКА (скупка ненужных вещей одним махом) =============== */
  // Платит меньше Лавки (см. Gear.junkValue) — зато скупает всё ненужное разом, одной кнопкой, без
  // возни с каждой вещью по отдельности. Разница в цене — цена скорости и удобства (см. дизайн-документ).
  const JUNKER_LINES = [
    'Тащи, что не жалко — я не привередливый. Плачу похуже Лавки, зато всё сразу и без разговоров.',
    'В Лавке за вещь дадут больше, да морока дольше — там всё по одной. А я — раз, монеты в руку, и свободен.',
    'Ходят слухи, в городе когда-нибудь заведут доску объявлений — там платили бы щедрее. Но то ж ждать надо, а я тут, сейчас.',
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
        itemCard(it, `Скупит за: ${money(Gear.junkValue(it.price))}`, `<button type="button" data-junk-item="${it.uid}">Продать</button>`)).join('')
        || '<p class="hint">Продавать нечего (надетые вещи старьёвщик не берёт).</p>';
      const total = items.reduce((sum, it) => sum + Gear.junkValue(it.price), 0);
      const scene = (typeof Art !== 'undefined' && Art.hasScene('junker'))
        ? ` style="background-image:linear-gradient(180deg, rgba(20,16,10,.55), rgba(20,16,10,.85)), url('${Art.sceneUrl('junker')}');background-size:cover;background-position:center"` : '';
      return `<div class="modal" role="dialog" aria-label="Хижина старьёвщика">${head('Хижина старьёвщика')}
        <div class="screen-body tavern-body"${scene}>
          <div class="npc-row"><span class="npc-portrait">${portrait}</span>
            <div class="npc-say"><b>Старьёвщик</b><p class="hint">${s.msg || JUNKER_LINES[0]}</p></div></div>
          ${items.length > 1 ? `<div class="reset"><button type="button" class="primary" data-junk-all="1">Продать всё ненужное — сразу ${money(total)}</button></div>` : ''}
          <h3>Ненужные вещи</h3><div class="card-list">${rows}</div>
        </div></div>`;
    },
    click(b) {
      const s = st.junker, d = b.dataset;
      if (d.junkItem) {
        const it = Gear.item(Profile.item(d.junkItem));
        if (!it) return;
        Profile.removeItem(d.junkItem);
        Profile.addCoins(Gear.junkValue(it.price));
        s.msg = `Забрал: ${it.name}. ${JUNKER_LINES[1]}`;
        return changed();
      }
      if (d.junkAll) {
        const items = Profile.data.items.filter((e) => !Profile.equippedUid(e.uid)).map((e) => Gear.item(e));
        if (!items.length) return;
        let total = 0;
        for (const it of items) { Profile.removeItem(it.uid); total += Gear.junkValue(it.price); }
        Profile.addCoins(total);
        s.msg = `Забрал всё разом, ${items.length} шт. — вот ${money(total)}. ${JUNKER_LINES[2]}`;
        return changed();
      }
    },
  };

  /* =============== БИБЛИОТЕКА (бобёр-хранитель: поручение дня, вход в бестиарий, энциклопедия вещей) =============== */
  const BEAVER_LINES = [
    'Тс-с, тише — тут всё разложено по полочкам. Спрашивай, чем помочь.',
    'Держи — и заходи ещё, у меня всегда найдётся дело для любопытного.',
    'Читаю всё, что приносят охотники — так и бестиарий пополняется, свиток за свитком.',
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
        body = `<p class="hint">${n ? `Бестиарий пополняется: в нём уже ${n} из ${Bestiary.ORDER.length} видов.` : 'Бестиарий ещё пуст — выйдите за частокол: встреченные существа появятся здесь сами.'}</p>
          <div class="reset"><button type="button" class="primary" data-open-bestiary="1">Открыть бестиарий</button></div>`;
      } else if (s.tab === 'items') {
        const f = FILTERS.find((x) => x[0] === s.filter) || FILTERS[0];
        const bases = Gear.ITEMS.filter((b) => f[2](b.type)).sort((a, b) => (a.faction || '').localeCompare(b.faction || '') || a.cost - b.cost);
        const list = bases.map((b) => {
          const it = Gear.item({ id: b.id, tier: s.itemTier });
          const fac = b.faction ? ` · только фракция «${Factions.get(b.faction).name}»` : '';
          return itemCard(it, `${Gear.RARITY_NAMES[it.rarity]}${fac}`);
        }).join('') || '<p class="hint">Таких вещей нет.</p>';
        const cons = Object.entries(Gear.CONSUMABLES).map(([k, c]) => `
          <div class="card" style="--t:#c9b48a">${itemIcon(k)}<div class="card-body"><span class="item-title">${c.name}</span><span class="item-foot">${c.desc}</span></div></div>`).join('');
        const sets = Object.values(Gear.SETS).map((set) => `
          <div class="set" style="--c:${set.color}"><b>Набор «${set.name}»${set.faction ? ` (фракция «${Factions.get(set.faction).name}»)` : ''}</b>
            ${Object.entries(set.bonuses).map(([n, b]) => `<div class="off">${n} шт.: ${fmtBonus(b)}</div>`).join('')}</div>`).join('');
        body = `<div class="tabs sub">${FILTERS.map(([k, label]) => `<button type="button" class="${k === s.filter ? 'on' : ''}" data-libfilter="${k}">${label}</button>`).join('')}</div>
          <p class="hint">Цвет для просмотра (справочно — характеристики вещи растут вместе с цветом):</p>${tierPicker(Tiers.MAX, s.itemTier, 'libtier')}
          <div class="card-list">${list}</div>
          <h3>Расходники</h3><div class="card-list">${cons}</div>
          <h3>Наборы</h3>${sets}`;
      } else if (s.tab === 'medals') {
        // Полная коллекция медалей переехала на Стену доблести у вашего дома (см. SCREENS.valor) —
        // там же теперь показывается и серия «Удар», и тир-бейджи, открывающиеся по уровню героя.
        // Здесь — только короткая витрина последних трёх и указатель, куда идти за остальным.
        const earned = Profile.medals().slice(-3).reverse();
        body = `<p class="hint">Медали копятся на весь аккаунт и дают небольшой, но постоянный бонус характеристик.
            Полная коллекция — на Стене доблести у вашего дома («Ранец и экипировка» → «Стена доблести»).</p>
          ${earned.length ? `<h3>Последние полученные</h3><div class="card-list">${earned.map((m) => medalTile(m.id, m, Profile.level(), 0, 0)).join('')}</div>` : '<p class="hint">Пока ни одной — победите кого-нибудь впервые.</p>'}`;
      } else {
        const q = Daily.libraryQuest(Profile.data);
        const qAct = q.claimed ? '<span class="badge done">Получено</span>'
          : q.done ? '<button type="button" class="primary" data-claim-daily="1">Забрать награду</button>'
          : `<span class="quest-progress">${q.value} / ${q.goal}</span>`;
        // Тренировка у бобра: настоящий бой против самого Бобра-хранителя (см. MapView.startTraining,
        // Game.setupTrainerBeaver) — безопасный и без наград (см. Game.isTraining/grantRewards), с одной
        // подсказкой-баннером в начале (см. beaverTip в game.js).
        const spellKeys = (typeof Balance !== 'undefined') ? Object.keys(Balance.magic.costs) : [];
        const spellName = (k) => (typeof MAGICS !== 'undefined' && MAGICS[k]) ? MAGICS[k].name : k;
        const spellTip = (k) => (typeof MAGICS !== 'undefined' && MAGICS[k]) ? MAGICS[k].tip : '';
        const trainBlock = `<h3>Тренировка</h3>
          <div class="cards">
            <div class="card" style="--t:#c9b48a"><div class="card-body"><span class="item-title">Учебный бой</span>
              <span class="item-foot">Настоящий бой с безопасным противником и подсказкой от бобра в начале.</span></div>
              <div class="card-act"><button type="button" data-train-start="1">Начать учебный бой</button></div></div>
            <div class="card" style="--t:#c9b48a"><div class="card-body"><span class="item-title">Оттачивание мастерства</span>
              <span class="item-foot">Выберите заклинание — в учебном бою сразу получите камни, чтобы сразу его опробовать.</span></div>
              <div class="card-act"><button type="button" data-train-spell="1">${s.spellPick ? 'Скрыть список' : 'Отточить мастерство'}</button></div></div>
          </div>
          ${s.spellPick ? `<div class="card-list">${spellKeys.map((k) => `<button type="button" class="itembtn-inline" data-train-pick="${k}" title="${spellTip(k)}">${spellName(k)}</button>`).join('')}</div>` : ''}`;
        body = `<div class="npc-row"><span class="npc-portrait">${portrait}</span>
            <div class="npc-say"><b>Бобёр-хранитель</b><p class="hint">${s.msg || BEAVER_LINES[0]}</p></div></div>
          <h3>Поручение дня</h3><div class="cards"><div class="card quest-card ${q.claimed ? 'is-done' : ''}">
            <div class="card-body"><span class="item-title">Дежурный обход</span>
              <span class="item-foot">Победите сегодня в одном бою — бобёр щедро делится знаниями (и не только).</span>
              <span class="item-foot quest-reward">Награда: монеты и порция каменной пыли</span></div>
            <div class="card-act">${qAct}</div></div></div>
          <p class="hint">Поручение обновляется каждый день, в полночь по вашему времени.</p>
          ${trainBlock}`;
      }
      return `<div class="modal" role="dialog" aria-label="Библиотека">${head('Библиотека')}${tabs([['npc', 'Бобёр'], ['beasts', 'Бестиарий'], ['items', 'Вещи'], ['medals', 'Медали']], s.tab)}
        <div class="screen-body tavern-body"${scene}>${body}</div></div>`;
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
        s.msg = `Держи — ${r.coins} монет и порция каменной пыли. ${BEAVER_LINES[1]}`;
        return changed();
      }
      if (d.trainSpell) { s.spellPick = !s.spellPick; return render(); }
      if (d.trainStart) {
        close();
        MapView.startTraining('beaver', 1);
        setBeaverTip({ text: 'Бобёр советует: подбирайте камни в линию 4+, чтобы получить дополнительный ход!' });
        return;
      }
      if (d.trainPick) {
        const key = d.trainPick, name = (typeof MAGICS !== 'undefined' && MAGICS[key]) ? MAGICS[key].name : key,
          tip = (typeof MAGICS !== 'undefined' && MAGICS[key]) ? MAGICS[key].tip : '';
        close();
        MapView.startTraining('beaver', 1);
        setBeaverTip({ text: `Бобёр советует отточить «${name}»: камни уже наготове. ${tip}`, spellKey: key });
        return;
      }
    },
  };

  /* =============== МАСТЕРСКАЯ ХУДОЖНИКА (Журавль-художник: продажа и вставка рун) =============== */
  const CRANE_LINES = [
    'А, заходи. Резец в руке, узор ещё не досох — но на тебя время найдётся.',
    'Держи, вставляй смело — гнёзд теперь два, камень такой узор выдержит.',
    'Каждая руна — со своим рисунком. Смотри не перепутай, какая куда просится.',
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
        return `<div class="card" style="--t:${r.color}"><span class="icon-wrap"><span class="rune-icon" style="--rc:${r.color}"></span></span>
          <div class="card-body"><span class="item-title">${r.name}</span><span class="item-foot">${r.desc}</span><span class="item-foot">Цена: ${money(price)} · в запасе: ${Profile.rune(id)}</span></div>
          <div class="card-act"><button type="button" data-buy-rune="${id}" ${Profile.data.coins >= price ? '' : 'disabled'}>Купить</button></div></div>`;
      }).join('');
      const body = `<div class="npc-row"><span class="npc-portrait">${portrait}</span>
          <div class="npc-say"><b>Журавль-художник</b><p class="hint">${s.msg || CRANE_LINES[0]}</p></div></div>
        <h3>Руны</h3><p class="hint">Вставляются в любую надетую вещь, по 2 гнезда на вещь — кнопка «i» на карточке предмета.</p>
        <div class="card-list">${runes}</div>`;
      return `<div class="modal" role="dialog" aria-label="Мастерская художника">${head('Мастерская художника')}
        <div class="screen-body tavern-body"${scene}>${body}</div></div>`;
    },
    click(b) {
      const s = st.artistWorkshop, d = b.dataset;
      if (d.buyRune) {
        const price = buyPrice(RUNE_PRICE);
        if (!Profile.spend(price)) return;
        Profile.addRune(d.buyRune);
        s.msg = `Куплено: ${Runes.CATALOG[d.buyRune].name}. ${CRANE_LINES[1]}`;
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
      const body = `<p class="hint">Все ваши медали — постоянные бонусы характеристик за первую победу над видом,
          за вехи линий из 5 камней и за добивания заклинанием Удар. Наведите на значок — увидите прогресс;
          цветной тир-бейдж открывается, когда герой достигает нужного уровня.</p>
        <h3>За первую победу (${killTiles.filter((_, i) => earnedFor(Medals.killMedalId(Bestiary.ORDER[i]))).length} / ${Bestiary.ORDER.length})</h3>
        <div class="card-list">${killTiles.join('')}</div>
        <h3>За линии из 5 камней (${earned.filter((m) => m.id.startsWith('streak:')).length} / ${Medals.STREAK_MILESTONES.length})</h3>
        <p class="hint">Собрано всего: ${Profile.data.medals.fiveStreaks}</p>
        <div class="card-list">${streakTiles.join('')}</div>
        <h3>За добивания Ударом (${earned.filter((m) => m.id.startsWith('strike:')).length} / ${Medals.STRIKE_MILESTONES.length})</h3>
        <p class="hint">Добито Ударом всего: ${Profile.strikeKills()}</p>
        <div class="card-list">${strikeTiles.join('')}</div>`;
      return `<div class="modal" role="dialog" aria-label="Стена доблести">${head('Стена доблести')}
        <div class="screen-body tavern-body">${body}</div></div>`;
    },
    click() {},
  };

  const credits = {
    html() {
      return `<div class="modal" role="dialog" aria-label="О разработчиках">${head('О разработчиках')}
        <div class="screen-body credits-body">
          <p class="hint">Игру создали:</p>
          <ul class="credits-list">
            <li>Воробьев Александр Сергеевич</li>
            <li>Никифоренко Екатерина Эдуардовна</li>
          </ul>
          <p class="hint">© 2026 Воробьев Александр Сергеевич, Никифоренко Екатерина Эдуардовна. Все права защищены.</p>
        </div></div>`;
    },
    click() {},
  };

  const SCREENS = { shop, forge, best, faction, tavern, mill, junker, library, artistWorkshop, valor, credits };
  return { open, close, refresh: render, get isOpen() { return !!root; }, openShop: () => open('shop'), openForge: () => open('forge'), openBestiary: () => open('best'),
    openTavern: () => { st.tavern.msg = ''; open('tavern'); },
    openJunker: () => { st.junker.msg = ''; open('junker'); },
    openMill: () => { st.mill.msg = ''; open('mill'); },
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
