/* Экраны: Лавка (покупка и продажа), Кузница (улучшение цвета и создание вещей), Бестиарий (выбор противника).
   Все они — окна поверх игры; данные берутся из Profile (inventory.js), Gear (items.js) и Bestiary (bestiary.js). */

const Screens = (() => {
  let root = null;
  let cur = null;
  const st = {
    shop:  { tab: 'buy', resTier: 1, msg: '' },
    forge: { tab: 'upgrade', sel: null, filter: 'weapon', msg: '', craftTier: 0 },
    best:  { sel: null, tier: 1 },
    // fac: при первом запуске (first) — черновик регистрации (ник, пол, выбранная фракция) до нажатия «Начать игру»;
    // иначе — просто смена фракции в любой момент (без ника и пола).
    fac:   { first: false, msg: '', name: '', gender: null, picked: null },
    tavern: { msg: '' },
    mill: { msg: '' },
  };
  const money = (n) => MonsterArt.moneyHtml(n);
  const RES_BUY_MARKUP = 3;            // ресурсы в лавке дороже, чем при продаже
  // Бонусы фракции: люди покупают дешевле, у гномов дешевле работа кузницы.
  const buyPrice = (p) => Math.round(p * Factions.perk(Profile.data.faction, 'shop'));
  const consPrice = (k) => Profile.consumablePrice(k);       // растёт с уровнем героя
  const levelNote = (it) => (Hero.canWear(it.tier, Profile.level()) ? '' : ` · <b class="warn">надеть можно с ${Hero.itemLevel(it.tier)}-го уровня</b>`);
  const forgeCost = (c) => (c ? { ...c, coins: Math.round(c.coins * Factions.perk(Profile.data.faction, 'forge')) } : c);
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
  const tierPicker = (max, active, attr) => `<div class="tier-picker">${Tiers.LIST.map((t) => `<button type="button" class="tp ${t.id === active ? 'on' : ''}" style="--t:${t.color};--ti:${t.ink}" ${t.id > max ? 'disabled' : ''} data-${attr}="${t.id}" title="${t.name}">${t.id}</button>`).join('')}</div>`;
  const changed = () => { if (typeof onEconomyChanged === 'function') onEconomyChanged(); render(); };
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
        const cons = Object.entries(Gear.CONSUMABLES).map(([k, c]) => `
          <div class="card" style="--t:#c9b48a">${itemIcon(k)}<div class="card-body"><span class="item-title">${c.name}</span><span class="item-foot">${c.desc}</span><span class="item-foot">Цена: ${money(buyPrice(consPrice(k)))} · в ранце: ${Profile.data.backpack[k] || 0}</span></div>
          <div class="card-act"><button type="button" data-buy-cons="${k}" ${Profile.data.coins >= buyPrice(consPrice(k)) ? '' : 'disabled'}>Купить</button></div></div>`).join('');
        const rt = Math.min(s.resTier, sh.top);
        const res = Object.entries(Bestiary.RESOURCES).map(([k]) => {
          const p = buyPrice(Bestiary.resPrice(k, rt) * RES_BUY_MARKUP);
          return `<div class="card" style="--t:${tierColor(rt)}">${MonsterArt.resIcon(k, rt)}<div class="card-body"><span class="item-title">${resLabel(k, rt)}</span><span class="item-foot">Цена: ${money(p)} · у вас: ${Profile.res(k, rt)}</span></div>
            <div class="card-act"><button type="button" data-buy-res="${k}" data-n="1" ${Profile.data.coins >= p ? '' : 'disabled'}>×1</button><button type="button" data-buy-res="${k}" data-n="5" ${Profile.data.coins >= p * 5 ? '' : 'disabled'}>×5</button></div></div>`;
        }).join('');
        body = `<h3>Вещи (цвет растёт с уровнем героя: сейчас до «${Tiers.get(sh.top).name}»)</h3><div class="card-list">${items}</div>
          <h3>Расходники</h3><div class="card-list">${cons}</div>
          <h3>Ресурсы</h3>${tierPicker(sh.top, rt, 'restier')}<div class="card-list">${res}</div>`;
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
      if (d.buyItem) {
        const e = Profile.shop().stock.find((x) => x.uid === d.buyItem), it = Gear.item(e);
        if (!Profile.spend(buyPrice(it.price))) return;
        Profile.removeFromShop(e.uid); Profile.addItem(e);
        s.msg = `Куплено: ${it.name} (${Tiers.get(it.tier).name})`;
        return changed();
      }
      if (d.buyCons) {
        const c = Gear.CONSUMABLES[d.buyCons];
        if (!Profile.spend(buyPrice(consPrice(d.buyCons)))) return;
        Profile.addConsumable(d.buyCons);
        s.msg = `Куплено: ${c.name}`;
        return changed();
      }
      if (d.buyRes) {
        const n = Number(d.n), rt = Math.min(s.resTier, Profile.shop().top), p = buyPrice(Bestiary.resPrice(d.buyRes, rt) * RES_BUY_MARKUP) * n;
        if (!Profile.spend(p)) return;
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
      const L = Profile.level(), myS = Gear.combine(Gear.stats(Profile.gear()), Factions.statsAt(Profile.data.faction || 'dwarf', Hero.tierFloat(L)));
      const pWin = Combat.winChance({ max: Hero.baseHp(L) + myS.health, dmg: Hero.dmgMult(L), stats: myS }, { max: sc.hp, dmg: sc.dmg, stats: sc.stats, ai: sc.ai }, s.sel);
      const danger = { label: { easy: 'Лёгкий', even: 'Равный', hard: 'Опасный', deadly: 'Смертельный' }[Combat.dangerBand(pWin)], pct: Math.round(pWin * 100) };
      return `<div class="modal" role="dialog" aria-label="Бестиарий">${head('Бестиарий')}
        <div class="screen-body two-col beast-layout"><div class="beast-list">${list}</div>
        <div class="beast-detail" style="--t:${tierColor(s.tier)}">
          <div class="beast-hero">${art}</div>
          <h3 class="beast-name">${m.name} ${tierChip(s.tier)}</h3><p class="hint"><b>${m.family}.</b> ${m.desc}</p>
          <div class="ability-box"><b>Приём: ${Bestiary.ability(s.sel).name}</b><span>${Bestiary.ability(s.sel).desc}</span></div>
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
    },
  };

  /* =============== ФРАКЦИЯ (и первая регистрация: ник, пол, фракция) =============== */
  const faction = {
    html() {
      const s = st.fac, curF = Profile.data.faction;
      const draftGender = s.first ? s.gender : Profile.data.gender;
      const cards = Factions.ORDER.map((id) => {
        const f = Factions.LIST[id];
        const stats = Object.entries(f.stats).map(([k, v]) => `<span class="chip">${fmtStat(k, v)}</span>`).join('');
        const chosen = s.first ? s.picked === id : curF === id;
        const fig = Figures.figure(Factions.heroKind(id, draftGender || 'm'), !s.first && chosen ? Profile.gear() : null);
        const btn = s.first
          ? `<button type="button" class="primary" data-pick-faction="${id}">${chosen ? 'Выбрано' : 'Выбрать'}</button>`
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
      const title = s.first ? 'Добро пожаловать!' : 'Фракция';
      const lead = s.first
        ? 'Мир «Грань»: Великий кристалл раскололся, и народы спорят за его осколки — камни на поле боя. Представьтесь и выберите, за кого вы.'
        : 'Сменить фракцию можно в любой момент в Ратуше. Вещи чужой фракции при этом снимаются.';
      const reg = s.first ? `<div class="reg-row">
          <label class="reg-field"><span>Ваш ник</span><input type="text" maxlength="20" placeholder="Как вас называть?" value="${escText(s.name)}" data-nick></label>
          <div class="reg-field"><span>Персонаж</span><div class="gender-pick">
            <button type="button" class="${s.gender === 'm' ? 'on' : ''}" data-gender="m">Мужской</button>
            <button type="button" class="${s.gender === 'f' ? 'on' : ''}" data-gender="f">Женский</button>
          </div></div>
        </div>` : '';
      const startBtn = s.first ? `<div class="reset"><button type="button" class="primary" data-act="start" ${canStartGame() ? '' : 'disabled'}>Начать игру!</button></div>` : '';
      return `<div class="modal" role="dialog" aria-label="${title}"><header><h2>${title}</h2>${s.first ? '' : '<button type="button" class="close" data-act="close">Закрыть</button>'}</header>
        <div class="screen-body"><p class="hint">${lead}</p>${reg}${s.msg ? `<div class="gear-toast">${s.msg}</div>` : ''}<div class="fac-grid">${cards}</div>${startBtn}</div></div>`;
    },
    click(b) {
      const s = st.fac, d = b.dataset;
      if (d.pickFaction) { s.picked = d.pickFaction; return render(); }
      if (d.gender) { s.gender = d.gender; return render(); }
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
      return `<div class="modal" role="dialog" aria-label="Таверна">${head('Таверна')}
        <div class="screen-body tavern-body"${scene}>
          <div class="npc-row"><span class="npc-portrait">${portrait}</span>
            <div class="npc-say"><b>Старый гоблин-трактирщик</b><p class="hint">${s.msg || GOBLIN_LINES[0]}</p></div></div>
          <h3>Задания</h3><div class="cards">${quests}</div>
        </div></div>`;
    },
    click(b) { questClick(b, 'tavern'); },
  };

  // Общий рендер карточек заданий одного собеседника (giver — 'tavern' | 'mill').
  function questCards(giver) {
    return Quests.list(Profile.data, giver).map((q) => {
      let act;
      if (q.claimed) act = '<span class="badge done">Получено</span>';
      else if (q.done) act = `<button type="button" class="primary" data-claim="${q.id}">Забрать награду</button>`;
      else act = `<span class="quest-progress">${q.value} / ${q.goal}</span>`;
      return `<div class="card quest-card ${q.claimed ? 'is-done' : ''}">
        <div class="card-body"><span class="item-title">${q.title}</span><span class="item-foot">${q.desc}</span>
          <span class="item-foot quest-reward">Награда: ${q.rewardText}</span></div>
        <div class="card-act">${act}</div></div>`;
    }).join('');
  }
  // Общий обработчик клика «Забрать награду» для экранов с заданиями. giver задаёт текст ответа.
  function questClick(b, giver) {
    const d = b.dataset;
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

  const SCREENS = { shop, forge, best, faction, tavern, mill };
  return { open, close, refresh: render, get isOpen() { return !!root; }, openShop: () => open('shop'), openForge: () => open('forge'), openBestiary: () => open('best'),
    openTavern: () => { st.tavern.msg = ''; open('tavern'); },
    openMill: () => { st.mill.msg = ''; open('mill'); },
    openFactions: (first = false) => {
      st.fac.first = first; st.fac.msg = '';
      if (first) { st.fac.name = Profile.data.name || ''; st.fac.gender = Profile.data.gender || null; st.fac.picked = Profile.data.faction || null; }
      open('faction');
    } };
})();
