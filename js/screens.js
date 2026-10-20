if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Экраны: Лавка (покупка и продажа), Кузница (улучшение цвета и создание вещей), Бестиарий (выбор противника).
   Все они — окна поверх игры; данные берутся из Profile (inventory.js), Gear (items.js) и Bestiary (bestiary.js). */

const Screens = (() => {
  let root = null;
  let cur = null;
  const QTY_STEPS = [1, 5, 10, 25];
  const st = {
    shop:  { tab: 'buy', resTier: 1, msg: '', consQty: {}, resQty: {}, set: null, kind: 'all', tier: 0 },
    forge: { tab: 'upgrade', sel: null, filter: 'weapon', msg: '', craftTier: 0 },
    best:  { sel: null, tier: 1, q: '', f: 'all', fam: '', view: 'list' },
    // fac: при первом запуске (first) — черновик регистрации (ник, пол, выбранная фракция) до нажатия «Начать игру»,
    // в два шага (step): 'crest' — только гербы фракций, 'detail' — герои выбранной фракции и пол;
    // иначе (обычная смена фракции в Ратуше) — один экран со всеми фракциями, без ника и пола.
    fac:   { first: false, step: 'crest', msg: '', name: '', gender: null, picked: null },
    tavern: { msg: '' },
    mill: { msg: '' },
    lighthouse: { msg: '', tab: 'quests', game: null },
    wreck: { msg: '' },
    chest: { msg: '' },
    junker: { msg: '' },
    login: { msg: '' },
    library: { tab: 'npc', filter: 'weapon', itemTier: 1, msg: '', spellPick: false },
    artistWorkshop: { msg: '' },
    jeweler: { tab: 'cut', msg: '', cutColor: 0 },
    kennel: { msg: '', tab: 'pet' },
    alchemist: { msg: '' },
    market: { tab: 'lots', kind: 'item', sel: null, mult: 1, qty: 1, msg: '' },
    village: { tab: 'build', msg: '' },
    arena: { tab: 'shadows', msg: '' },
    duel: { list: null, busy: false, msg: '' },
    bank: { msg: '' },
    herocard: { msg: '' },
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
  const levelNote = (it) => (Hero.canWear(it.wt, Profile.level()) ? '' : _t(" · <b class=\"warn\">надеть можно с {0}-го уровня</b>", [Hero.itemLevel(it.wt)]));
  const repairPrice = (e, pts) => { const c = Gear.repairCost(e, pts); return c > 0 ? Math.max(1, Math.round(c * Factions.perk(Profile.data.faction, 'forge'))) : 0; };   // 1.6.6: цена починки со скидкой народа
  const junkOf = (it) => Gear.junkValue(Math.round(it.price * Gear.wearFactor(Profile.item(it.uid))));   // 1.6.6: изношенная вещь дешевле
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
    const bonusText = got ? Object.entries(Medals.bonusFor(id, Profile.data.bestiary) || {}).map(([k, v]) => `${STAT_NAMES_RU[k] || k} +${v}`).join(', ') : '';
    // 1.6.2: ступень медали за вид (бронза/серебро/золото) — по числу побед над видом
    const sp0 = Medals.killSpecies(id), wins0 = sp0 ? ((Profile.data.bestiary[sp0] && Profile.data.bestiary[sp0].wins) || 0) : 0;
    const rank = sp0 && got ? Medals.rankOf(sp0, Profile.data.bestiary) : 0, nxt = sp0 && got ? Medals.nextRankWins(wins0) : null;
    const rankText = rank ? ' ' + _t("Ступень: {0}.", [Medals.RANK_NAMES[rank - 1]]) + (nxt ? ' ' + _t("До следующей: {0} побед.", [nxt - wins0]) : '') : '';
    const hiddenSecret = Medals.secretKey(id) && !got;                           // 1.6.2: скрытая медаль до получения
    const title = hiddenSecret ? _t("Скрытая медаль — условие неизвестно") : Medals.nameFor(id) + rankText + ' — ' + (got
      ? (_t("получена") + (tierOpen ? '' : _t("; цвет откроется на уровне {0} (сейчас {1})", [unlockLvl, level])) + (bonusText ? _t(". Бонус: {0}", [bonusText]) : ''))
      : _t("не открыта. Прогресс: {0} / {1}", [progress, need]));
    // значок внутри кружка: для медалей за виды — портрет существа, для остальных — число
    let glyph;
    const species = Medals.killSpecies(id);
    if (species) glyph = (typeof MonsterArt !== 'undefined' && MonsterArt.bust(species, 1)) || `<span class="mg-num">${(Medals.nameFor(id).split(': ')[1] || '?').slice(0, 2)}</span>`;
    else if (Medals.styleKey(id)) glyph = `<span class="mg-num mg-style">${{ flawless: '✚', swift: '⚡', nomagic: '✋', onespell: '◎', alchemist: '⚗' }[Medals.styleKey(id)] || '★'}</span>`;
    else if (id.startsWith('daily:')) glyph = _t("<span class=\"mg-num\">{0}<small>дней</small></span>", [id.slice(6)]);
    else if (id.startsWith('drunk:')) glyph = _t("<span class=\"mg-num\">{0}<small>эликс.</small></span>", [id.slice(6)]);
    else if (Medals.elixirKey(id)) glyph = `<span class="mg-num mg-style">⚗</span>`;
    else if (Medals.secretKey(id)) glyph = `<span class="mg-num mg-style">${got ? '✧' : '?'}</span>`;
    else if (Medals.worldKey(id)) glyph = `<span class="mg-num mg-style">${{ visit: '⌂', chests: '🗝', caches: '◈', altars: '✦' }[Medals.worldKey(id)] || '★'}</span>`;
    else if (id.startsWith('strike:')) glyph = _t("<span class=\"mg-num\">{0}<small>Удар</small></span>", [id.slice(7)]);
    else if (id.startsWith('shot:')) glyph = _t("<span class=\"mg-num\">{0}<small>Выстрел</small></span>", [id.slice(5)]);
    else glyph = _t("<span class=\"mg-num\">{0}<small>линий</small></span>", [id.slice(id.indexOf(':') + 1)]);
    const round = `<div class="medal-round ${got ? 'got' : 'todo'} ${tierOpen ? '' : 'locked'}" data-rank="${rank}" data-tier="${tierOpen ? tier : 0}"
        style="--t:${tierColor(tier)}" data-medal="${id}" data-prog="${progress}" data-need="${need}" data-tip="${title.replace(/"/g, '&quot;')}" tabindex="0" role="button" aria-label="${title.replace(/"/g, '&quot;')}">${glyph}</div>`;
    return round;
  }
  // 1.5.9: нажатие на медаль на Стене доблести — окно «за что дают медаль»
  // 1.6.0: приз билета оформлен как награда за бой — окно с «чипами» добычи; по нажатию на вещь открывается её карточка.
  function ticketReward(r) {
    const p = r.prize || {}, chips = [], tier = Hero.tierFor(Profile.level());
    if (p.res) chips.push(`<button type="button" class="loot-chip" data-rkind="${p.res.kind}" data-rtier="${p.res.tier}" data-cap="${Bestiary.RESOURCES[p.res.kind].name} (${Tiers.get(p.res.tier).name}) ×${p.res.n}">${MonsterArt.resIcon(p.res.kind, p.res.tier)}<b>×${p.res.n}</b></button>`);
    if (p.cons) chips.push(`<button type="button" class="loot-chip" data-cap="${Gear.CONSUMABLES[p.cons].name}: ${Gear.CONSUMABLES[p.cons].desc}">${itemIcon(p.cons)}<b>+1</b></button>`);
    const it = p.item && Profile.item(p.item) ? Gear.item(Profile.item(p.item)) : null;
    if (it) chips.push(`<button type="button" class="loot-chip item r-${it.rarity}" data-uid="${p.item}" data-cap="${it.name}" style="--t:${Tiers.get(it.tier).color}">${itemIcon(it.type, '', it.id)}</button>`);
    const coins = p.coins ? `<p>${_t("Монеты: {0}", [MonsterArt.moneyHtml(p.coins)])}</p>` : '';
    const o = document.createElement('div'); o.className = 'overlay ticket-reward';
    o.innerHTML = `<div><h2>${r.kind === 'jackpot' ? _t("Джекпот!") : _t("Билет сыграл!")}</h2>${coins}${chips.length ? `<div class="loot">${chips.join('')}</div><div class="loot-cap">${it ? it.name : ''}</div>` : ''}<button type="button" class="primary to-map" data-tr-close="1">${_t("Забрать")}</button></div>`;
    o.addEventListener('click', (e) => {
      if (e.target.closest('[data-tr-close]')) return o.remove();
      const c = e.target.closest('.loot-chip'); if (!c) return;
      if (c.dataset.uid) return ItemInfo.open(c.dataset.uid);
      if (c.dataset.rkind) return ResInfo.open(c.dataset.rkind, c.dataset.rtier);
      o.querySelector('.loot-cap').textContent = c.dataset.cap || '';
    });
    document.body.appendChild(o);
  }
  function medalHow(id, got) {
    const species = Medals.killSpecies(id), n = id.slice(id.indexOf(':') + 1);
    return id.startsWith('drunk:') ? _t("Выдаётся за {0} выпитых в боях эликсиров любого вида за всё время игры.", [n]) : Medals.elixirKey(id) ? _t("Выдаётся один раз — за первый выпитый в бою «{0}».", [Elixirs.KINDS[Medals.elixirKey(id)].name]) : id.startsWith('daily:') ? _t("Выдаётся за {0} дней подряд, в каждый из которых вы победили в «Испытании дня».", [n]) : Medals.secretKey(id) ? (got ? _t("Секретная медаль: {0}.", [Medals.SECRET[Medals.secretKey(id)].desc]) : _t("Скрытая медаль. Условие не известно: её нужно открыть самому.")) : Medals.worldKey(id) ? _t("Выдаётся один раз: {0}.", [Medals.WORLD[Medals.worldKey(id)].desc]) : Medals.styleKey(id) ? _t("Выдаётся один раз: {0} (обычный бой с существом).", [Medals.STYLE[Medals.styleKey(id)].desc]) : species ? _t("Выдаётся один раз — за первую победу над существом «{0}».", [(Medals.nameFor(id).split(': ')[1] || species)])
      : id.startsWith('strike:') ? _t("Выдаётся за {0} добиваний противника заклинанием «Удар» за всё время игры.", [n])
      : id.startsWith('shot:') ? _t("Выдаётся за {0} добиваний противника Выстрелом (боеприпасом) за всё время игры.", [n])
      : _t("Выдаётся за {0} собранных линий из 5 камней за всё время игры.", [n]);
  }
  // 1.8.5: подпись медали для окна победы: название, условие, бонус
  function medalCaption(id) {
    const got = !!Profile.medals().find((m) => m.id === id);
    const bonus = Object.entries(Medals.bonusFor(id, Profile.data.bestiary) || {}).map(([k, v]) => `${STAT_NAMES_RU[k] || k} +${v}`).join(', ');
    return Medals.nameFor(id) + ' — ' + medalHow(id, got) + (bonus ? ' ' + _t("Награда: постоянный бонус {0}.", [bonus]) : '');
  }
  function medalPop(el) {
    const id = el.dataset.medal, prog = Number(el.dataset.prog) || 0, need = Number(el.dataset.need) || 1;
    const level = Profile.level(), earned = Profile.medals().find((m) => m.id === id), got = !!earned;
    const unlockLvl = Medals.tierUnlockLevel(id), species = Medals.killSpecies(id), n = id.slice(id.indexOf(':') + 1);
    const how = medalHow(id, got);
    const bonus = Object.entries(Medals.bonusFor(id, Profile.data.bestiary) || {}).map(([k, v]) => `${STAT_NAMES_RU[k] || k} +${v}`).join(', ');
    const status = got ? _t("Получена") : _t("Прогресс: {0} / {1}", [prog, need]);
    const rankLine = species ? `<p class="hint">${_t("Ступени: бронза — 1 победа, серебро — {0} (бонус ×2), золото — {1} (бонус ×3). Сейчас побед: {2}.", [Medals.RANK_WINS[1], Medals.RANK_WINS[2], (Profile.data.bestiary[species] && Profile.data.bestiary[species].wins) || 0])}</p>` : '';
    const favBtn = (mid) => { const isFav = Profile.favMedals().includes(mid), full = !isFav && Profile.favMedals().length >= 3; return `<button type="button" data-act="medal-fav" data-mid="${mid}" ${full ? 'disabled' : ''}>${isFav ? _t("Убрать из избранного") : full ? _t("Избранное занято (3 из 3)") : _t("★ В избранное")}</button> `; };
    const lock = got && level < unlockLvl ? `<p class="hint">${_t("Цвет значка откроется на уровне {0} (сейчас {1}).", [unlockLvl, level])}</p>` : '';
    const html = `<div class="medal-pop-back"><div class="medal-pop" role="dialog" aria-label="${Medals.nameFor(id).replace(/"/g, '&quot;')}">
        <h3>${Medals.secretKey(id) && !got ? '???' : Medals.nameFor(id)}</h3><p>${how}</p>${rankLine}${bonus ? `<p>${_t("Награда: постоянный бонус {0}.", [bonus])}</p>` : ''}
        <p class="mp-status ${got ? 'got' : ''}">${status}</p>${lock}${got ? favBtn(id) : ''}<button type="button" data-act="medal-close">${_t("Понятно")}</button></div></div>`;
    const old = root.querySelector('.medal-pop-back'); if (old) old.remove();
    root.querySelector('.modal').insertAdjacentHTML('beforeend', html);
  }
  const STAT_NAMES_RU = { power: _t("Сила"), health: _t("Здоровье"), armor: _t("Броня"), magic: _t("Магия"), initiative: _t("Проворство"), ricochet: _t("Рикошет"), block: _t("Блок"), rage: _t("Ярость"), fury: _t("Ярость"), defense: _t("Броня"), cunning: _t("Хитрость"), defense: _t("Защита") };
  const mustChoose = () => cur === 'faction' && st.fac.first;

  function mount() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'modal-back';
    root.addEventListener('click', (e) => { const bb = e.target.closest && e.target.closest('button'); keepScroll = !!(bb && Object.keys(bb.dataset).some((k) => /^(buy|vgCos|k?Treat|tryon)/.test(k))); }, true);   // 1.8.4: после покупки список остаётся на месте
    root.addEventListener('click', onClick);
    root.addEventListener('click', markBought);
    root.addEventListener('toggle', (e) => { const d = e.target; if (d.classList && d.classList.contains('tgroup')) titleOpen[d.dataset.g] = d.open; }, true);
    root.addEventListener('input', onInput);
    document.body.appendChild(root);
    document.addEventListener('keydown', onKey);
    ModalFocus.open(root);
  }
  function close() {
    if (root) { ModalFocus.close(root); root.remove(); root = null; }
    document.removeEventListener('keydown', onKey);
    cur = null;
  }
  const onKey = (e) => { if (e.key === 'Escape' && !mustChoose()) close(); };
  function open(id) { mount(); cur = id; render(); }
  const titleOpen = {};      // 1.8.4: какие группы титулов развёрнуты (запоминается, пока открыта страница)
  let keepScroll = false;
  function render() {
    if (root && cur) {
      const sb = keepScroll && root.querySelector('.screen-body'), top = sb ? sb.scrollTop : 0;
      root.innerHTML = SCREENS[cur].html(); addTip(); addScene(); markNeeds(); markToasts();
      if (keepScroll) { const nb = root.querySelector('.screen-body'); if (nb) nb.scrollTop = top; keepScroll = false; }
    }
  }
  // 1.8.1: у окон без своего фона (деревня, справка, стена доблести) он подхватывается, как только картинка ui/bg-<имя> есть в игре
  function addScene() {
    const b = root.querySelector('.screen-body');
    if (!b || b.getAttribute('style') || typeof Art === 'undefined' || !Art.hasScene(cur)) return;
    b.style.cssText = `background-image:linear-gradient(180deg, rgba(20,16,10,.55), rgba(20,16,10,.85)), url('${Art.sceneUrl(cur)}');background-size:cover;background-position:center`;
  }
  // 1.8.4: после нажатия «Купить» строка на секунду загорается зелёным, на кнопке — «✓ Куплено»: видно, куда ушла покупка, даже если список длинный.
  function markBought(e) {
    const b = e.target.closest && e.target.closest('button');
    if (!b || !root) return;
    const ent = Object.entries(b.dataset).find(([k]) => /^(buy|vgCos|k?Treat)/.test(k));
    if (!ent) return;
    const attr = 'data-' + ent[0].replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), val = ent[1];
    const nb = [...root.querySelectorAll('[' + attr + ']')].find((x) => x.getAttribute(attr) === val);
    if (!nb) return;
    const row = nb.closest('.card, .shop-row, li, .row') || nb.parentNode;
    row.classList.add('just-bought');
    const old = nb.textContent;
    if (nb === b) return;                                 // кнопка не перерисовалась — покупка не прошла
    nb.dataset.was = old; nb.classList.add('bought-flash'); nb.textContent = _t("✓ Куплено");
    setTimeout(() => { if (nb.isConnected) { nb.classList.remove('bought-flash'); nb.textContent = old; } row.classList.remove('just-bought'); }, 1600);
  }
  // 1.8.4: плашка подтверждения зелёная с галочкой; сообщения-отказы («Не хватает…», «нельзя…») — жёлтые, без галочки
  function markToasts() {
    for (const t of root.querySelectorAll('.gear-toast')) t.classList.toggle('warn', /не хват|нельзя|недоступ|нет |нужн|сначала|не получ|не удал|уже /i.test(t.textContent));
  }
  // 1.8.1: недоступная «Сварить» подписывает причину прямо на кнопке
  function markNeeds() {
    for (const bt of root.querySelectorAll('button[data-why]')) { bt.classList.add('need'); bt.textContent = bt.dataset.why === 'coin' ? _t("Не хватает монет") : _t("Не хватает ресурсов"); }
  }
  // 1.5.4: подсказка при первом входе в здание (вместо экскурсии по деревне в обучении). Опытным героям — не показываем.
  const TIPS = {
    shop: _t("<b>Лавка.</b> Покупка и продажа вещей, зелий, свитков и ресурсов. Весь ассортимент всегда в продаже; вещи собраны по комплектам, есть примерка."),
    forge: _t("<b>Кузница.</b> Улучшает цвет вещей (от Красного до Обсидианового) и создаёт новые из ресурсов, что выпадают из существ."),
    tavern: _t("<b>Таверна.</b> Гоблин-трактирщик даёт задания — первое уже ждёт тебя: «Первая кровь». Ещё задания есть у Мельника-мыша на Мельнице."),
    best: _t("<b>Охотники.</b> Бестиарий: всё о встреченных существах — их приёмы, добыча и твой шанс на победу."),
    library: _t("<b>Библиотека</b> — мой дом. Здесь летопись <b>осколков Великого Сердца</b>: их хранят стражи с коронами на карте — собери четыре, и проснётся последний. Ещё тут поручение дня и учебные бои. Если что-то забудешь — приходи, проведу обучение заново."),
    jeweler: _t("<b>Ювелирная лавка.</b> Сорока-ювелир гранит самоцветы стражей подземелья, сплавляет печати и скупает камни."),
    artistWorkshop: _t("<b>Мастерская художника.</b> Журавль продаёт руны и вставляет их в вещи: по два гнезда в каждой."),
    mill: _t("<b>Мельница.</b> Мельник-мышь даёт задания и делится мышиной мудростью."),
    junker: _t("<b>Хижина старьёвщика.</b> Скупает ненужные вещи разом — дешевле Лавки, зато не глядя."),
    market: _t("<b>Торговые ряды.</b> Выставляйте вещи и ресурсы на продажу — покупатели находятся со временем."),
    village: _t("<b>Улучшения деревни.</b> Золото можно вложить в здания — улучшения остаются навсегда. В Гардеробе — титулы и рамки портрета."),
    arena: _t("<b>Арена.</b> Тени — копии героев других народов: побеждайте, чтобы подниматься в рангах и получать титулы. А Испытание дня — одно поле и один противник на всех."),
  };
  function addTip() {
    const t = TIPS[cur], d = Profile.data;
    if (!t || (d.wins || 0) >= 30 || (d.tips && d.tips['b:' + cur])) return;
    const body = root.querySelector('.screen-body');
    if (body) body.insertAdjacentHTML('afterbegin', tipBox('b:' + cur, t));
  }
  function onClick(e) {
    if (e.target === root) { if (!mustChoose()) close(); return; }
    const fb = e.target.closest('[data-act=medal-fav]');
    if (fb) { Profile.toggleFavMedal(fb.dataset.mid); const pb = root.querySelector('.medal-pop-back'); if (pb) pb.remove(); if (typeof onEconomyChanged === 'function') onEconomyChanged(); return render(); }
    const mp = e.target.closest('.medal-pop-back');
    if (mp && (e.target === mp || e.target.closest('[data-act=medal-close]'))) { mp.remove(); return; }
    const mt = e.target.closest('[data-medal]');
    if (mt && cur === 'valor') return medalPop(mt);
    const tb = e.target.closest('.tryon-back');                          // 1.6.5: примерка — закрыть по подложке или кнопке «Назад»
    if (tb && (e.target === tb || e.target.closest('[data-act=tryon-close]'))) { tb.remove(); return; }
    const tp = e.target.closest('.tip-box p');                           // 1.8.2: подсказка обрезана — тап раскрывает целиком
    if (tp) { tp.parentNode.classList.toggle('open'); return; }
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.act === 'close') return close();
    if (b.dataset.tryon && cur) return openTryOn(b.dataset.tryon);
    if (b.dataset.tip) { Profile.data.tips = Profile.data.tips || {}; Profile.data.tips[b.dataset.tip] = true; Profile.save(); return render(); }
    if (!SCREENS[cur]) return;                    // 1.6.5 (A2-17): окно уже закрыто, а кнопка ещё жива — клик ничего не делает, а не бросает ошибку
    SCREENS[cur].click(b);
  }
  // Ввод ника: правим состояние и вручную включаем/выключаем кнопку «Начать», не перерисовывая
  // весь экран (иначе поле теряет фокус и курсор при каждой букве).
  function onInput(e) {
    if (cur === 'best' && (e.target.dataset.bq !== undefined || e.target.dataset.bfam !== undefined)) {   // поиск и семейство: обновляем только плитки, чтобы не терять ввод
      const bs = st.best;
      if (e.target.dataset.bq !== undefined) bs.q = e.target.value; else bs.fam = e.target.value;
      const lst = root.querySelector('.beast-list');
      if (lst) lst.innerHTML = bestTiles(bs, Profile.species());
      return;
    }
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
    return _t("<div class=\"ability-box\"><b>Приручение</b><span>Побед над видом: {0}/{1} — приручается после {2}</span></div>", [Math.min(wins, need), need, _nn(need, 'победы', 'побед', 'побед')]);
  }
  const haveNeed = (kind, tier, n) => {
    const have = Profile.res(kind, tier);
    return `<span class="need ${have >= n ? 'ok' : 'no'}">${MonsterArt.resIcon(kind, tier)}${Bestiary.RESOURCES[kind].name} ${have}/${n}</span>`;
  };

  /* =============== 1.6.5: ПОСТОЯННЫЙ КАТАЛОГ ЛАВКИ И ПРИМЕРКА =============== */
  const CAT_KINDS = [
    ['all', _t("Все виды"), () => true],
    ['weapon', _t("Оружие"), (t) => t === 'weapon1' || t === 'weapon2' || t === 'ranged'],
    ['shield', _t("Щиты"), (t) => t === 'shield'],
    ['armor', _t("Броня"), (t) => ['head', 'chest', 'arms', 'legs', 'shoulders', 'gloves'].includes(t)],
    ['other', _t("Украшения и прочее"), (t) => ['amulet', 'bag', 'leash', 'compass', 'belt'].includes(t)],
  ];
  const CAT_TYPE_ORDER = ['weapon1', 'weapon2', 'ranged', 'shield', 'head', 'chest', 'arms', 'legs', 'shoulders', 'gloves', 'amulet', 'bag', 'leash', 'compass', 'belt'];
  // Вкладки комплектов (с числом надетых вещей), виды, цвет (все до вашего) и список карточек. s — состояние окна Лавки (меняется: set/kind/tier).
  function catalogView(s, top) {
    const faction = Profile.data.faction, all = Gear.itemsFor(faction).filter((i) => i.rarity !== 'epic');      // 1.6.6: эпические вещи в Лавке не продаются (Кузница, добыча, события)
    const setIds = Object.keys(Gear.SETS).filter((id) => all.some((i) => i.set === id));
    const hasNone = all.some((i) => !i.set);
    const own = setIds.find((id) => Gear.SETS[id].faction === faction) || setIds[0] || 'all';
    if (!(s.set === 'all' || (s.set === 'none' && hasNone) || setIds.includes(s.set))) s.set = own;
    if (!CAT_KINDS.some((k) => k[0] === s.kind)) s.kind = 'all';
    const tier = (s.tier >= 1 && s.tier <= top) ? s.tier : top;      // 1.6.6: каталог показывает все цвета до вашего
    s.tier = tier;
    const worn = Object.fromEntries(Gear.setProgress(Profile.gear()).map((p) => [p.id, p.count]));
    const setBtn = (id, label, color, extra) => `<button type="button" class="${id === s.set ? 'on' : ''}" data-catset="${id}" ${color ? `style="--c:${color}"` : ''}>${label}${extra}</button>`;
    const setsHtml = `<div class="tabs sub cat-sets">${setBtn('all', _t("Все"), '', '')}${setIds.map((id) => setBtn(id, Gear.SETS[id].name, Gear.SETS[id].color, ` <small>${worn[id] || 0}/${all.filter((i) => i.set === id).length}</small>`)).join('')}${hasNone ? setBtn('none', _t("Без комплекта"), '', '') : ''}</div>`;
    const kindsHtml = `<div class="tabs sub cat-kinds">${CAT_KINDS.map(([k, label]) => `<button type="button" class="${k === s.kind ? 'on' : ''}" data-catkind="${k}">${label}</button>`).join('')}</div>`;
    const tiers = Array.from({ length: top }, (_, i) => i + 1);
    const tierHtml = `<div class="tier-picker cat-tiers">${tiers.map((t) => { const T = Tiers.get(t); return `<button type="button" class="tp ${t === tier ? 'on' : ''}" data-cattier="${t}" style="--t:${T.color};--ti:${T.ink}" title="${T.name}">${t}</button>`; }).join('')}<span class="hint">${_t("Цвет вещей: {0}", [Tiers.get(tier).name])}</span></div>`;
    let info = '';
    if (s.set !== 'all' && s.set !== 'none') {
      const S = Gear.SETS[s.set], total = all.filter((i) => i.set === s.set).length, n = worn[s.set] || 0;
      const rows = Object.entries(S.bonuses).map(([need, b]) => `<span class="${n >= Number(need) ? 'on' : ''}">${_t("{0} шт.: {1}", [need, fmtBonus(b)])}</span>`).join('');
      info = `<div class="set-info" style="--c:${S.color}"><b>${S.name}</b> · ${_t("надето {0} из {1}", [n, total])}<div class="set-bonuses">${rows}</div></div>`;
    }
    const kindFn = CAT_KINDS.find((k) => k[0] === s.kind)[2];
    const bases = all.filter((i) => (s.set === 'all' || (s.set === 'none' ? !i.set : i.set === s.set)) && kindFn(i.type))
      .sort((a, b) => CAT_TYPE_ORDER.indexOf(a.type) - CAT_TYPE_ORDER.indexOf(b.type) || a.cost - b.cost);
    const list = bases.map((b) => {
      const it = Gear.item({ id: b.id, tier }), price = buyPrice(it.price);
      const act = `<button type="button" data-tryon="shop:${b.id}:${tier}">${_t("Примерить")}</button><button type="button" data-buy-cat="${b.id}:${tier}" ${Profile.data.coins >= price ? '' : 'disabled'}>${_t("Купить")}</button>`;
      return itemCard(it, _t("Цена: {0}{1}", [money(price), levelNote(it)]), act);
    }).join('');
    return { head: setsHtml + kindsHtml + tierHtml + info, list };
  }

  // Примерка: портрет героя в обновке и «было → станет» по итоговым характеристикам (так же, как на экране персонажа), смена бонусов комплектов
  // и лимит очков снаряжения. Ничего не покупает и не меняет в профиле.
  const TRY_STATS = [['power', '%'], ['health', ''], ['defense', ''], ['magic', ''], ['initiative', '%'], ['ricochet', '%'], ['block', '%'], ['fury', '%'], ['cunning', '%']];
  const tryBtn = (kind, arg) => `<button type="button" class="tryon-btn" data-tryon="${kind}:${arg}">${_t("Примерить")}</button>`;
  function tryOnSlot(gear, it) {
    if (it.type === 'weapon2') return 'main';
    if (it.type === 'shield') return 'off';
    if (it.type === 'weapon1') {
      const main = Gear.item(gear.main);
      if (!gear.main) return 'main';
      if (!gear.off && !(main && main.type === 'weapon2')) return 'off';
      return 'main';
    }
    return it.type;
  }
  function tryOnHtml(entry, opts = {}) {
    const it = Gear.item(entry); if (!it) return '';
    const gear = Profile.gear(), lv = Profile.level();
    const slot = (opts.replaceUid && Gear.SLOTS.find((x) => gear[x] && gear[x].uid === opts.replaceUid)) || tryOnSlot(gear, it);
    const probe = { ...entry, uid: entry.uid || 'tryon-probe' };
    const next = Gear.equip(gear, probe, slot);
    const before = Profile.totalStats(gear), after = Profile.totalStats(next);
    const check = Gear.canEquip(gear, probe, slot, Profile.data.faction, lv);
    const used0 = Gear.totalCost(gear), used1 = Gear.totalCost(next), budget = Profile.budget();
    const rows = TRY_STATS.filter(([k]) => before[k] || after[k]).map(([k, u]) => {
      const d = after[k] - before[k], cls = d > 0 ? 'up' : d < 0 ? 'down' : '';
      return `<tr class="${cls}"><th>${Gear.STAT_NAMES[k]}</th><td>${before[k]}${u}</td><td>→</td><td>${after[k]}${u}</td><td>${d ? (d > 0 ? '+' : '−') + Math.abs(d) + u : ''}</td></tr>`;
    }).join('');
    const sets0 = Object.fromEntries(Gear.setProgress(gear).map((p) => [p.id, p])), sets1 = Gear.setProgress(next);
    const setLines = sets1.filter((p) => !sets0[p.id] || sets0[p.id].count !== p.count || sets0[p.id].active.length !== p.active.length).map((p) => {
      const was = sets0[p.id] ? sets0[p.id].count : 0, bonus = p.active.length ? p.active[p.active.length - 1] : null;
      return `<li style="--c:${p.color}"><b>${p.name}</b>: ${_t("{0} → {1} из {2}", [was, p.count, p.total])}${bonus ? ' · ' + _t("бонус при {0} шт.: {1}", [bonus.need, fmtBonus(bonus.bonus)]) : ''}</li>`;
    }).join('');
    const lostSets = Object.values(sets0).filter((p) => !sets1.some((q) => q.id === p.id)).map((p) => `<li style="--c:${p.color}"><b>${p.name}</b>: ${_t("{0} → 0", [p.count])}</li>`).join('');
    const warn = [];
    if (!check.ok) warn.push(check.reason);
    if (used1 > budget) warn.push(_t("Не хватает очков снаряжения: нужно {0}, лимит {1}", [used1, budget]));
    const kind = Factions.heroKind(Profile.data.faction || 'dwarf', Profile.data.gender);
    return `<div class="tryon-back"><div class="tryon" role="dialog" aria-label="${_t("Примерка")}">
      <h3>${_t("Примерка: {0}", [it.name])} ${itemChip(it.tier)}</h3>
      <div class="tryon-body"><div class="tryon-fig figure-box">${Figures.figure(kind, next)}</div>
        <div class="tryon-stats"><table><thead><tr><th></th><td>${_t("было")}</td><td></td><td>${_t("станет")}</td><td></td></tr></thead><tbody>${rows || `<tr><td colspan="5">${_t("Характеристики не изменятся")}</td></tr>`}</tbody></table>
        ${(setLines || lostSets) ? `<ul class="tryon-sets">${setLines}${lostSets}</ul>` : ''}</div></div>
      <p class="hint">${_t("Очки снаряжения: {0} → {1} из {2}", [used0, used1, budget])}${Gear.SLOT_NAMES[slot] ? ' · ' + _t("ячейка: {0}", [Gear.SLOT_NAMES[slot]]) : ''}</p>
      ${warn.length ? `<p class="hint warn">${warn.join(' · ')}</p>` : ''}
      ${opts.cost ? opts.cost : ''}
      <div class="tryon-act">${opts.action || ''}<button type="button" data-act="tryon-close">${_t("Назад")}</button></div>
    </div></div>`;
  }
  // Открыть примерку по описанию «вид:аргументы» (кнопки data-tryon в Лавке и Кузнице)
  function openTryOn(spec) {
    const [kind, a, b] = spec.split(':');
    let entry = null, opts = {};
    const mainBtn = (sel) => root.querySelector(sel);
    if (kind === 'shop') {
      entry = { id: a, tier: Number(b) };
      const it = Gear.item(entry), price = buyPrice(it.price), btn = mainBtn(`[data-buy-cat="${a}:${b}"]`);
      opts.action = `<button type="button" class="primary" data-buy-cat="${a}:${b}" ${btn && !btn.disabled ? '' : 'disabled'}>${_t("Купить за {0}", [money(price)])}</button>`;
    } else if (kind === 'craft') {
      entry = { id: a, tier: st.forge.craftTier || 1 };
      const cost = forgeCost(Gear.craftCost(a, entry.tier)), btn = mainBtn(`[data-craft="${a}"]`);
      opts.cost = costHtml(cost);
      opts.action = `<button type="button" class="primary" data-craft="${a}" ${btn && !btn.disabled ? '' : 'disabled'}>${_t("Создать")}</button>`;
    } else if (kind === 'upgrade' || kind === 'refit' || kind === 'temper') {
      const e = Profile.item(a); if (!e) return;
      if (kind === 'upgrade') { entry = { ...e, tier: Math.min(10, (e.tier || 1) + 1) }; opts.action = null; }
      else if (kind === 'refit') { entry = { ...e, fit: true }; }
      else { const tc = Gear.temperCost(e); if (!tc) return; entry = { ...e, plus: tc.plus }; }
      opts.replaceUid = e.uid;
      const attr = { upgrade: 'data-do-upgrade', refit: 'data-do-refit', temper: 'data-do-temper' }[kind], btn = mainBtn(`[${attr}]`);
      const label = { upgrade: _t("Улучшить"), refit: _t("Перековать"), temper: _t("Закалить") }[kind];
      opts.action = `<button type="button" class="primary" ${attr}="1" ${btn && !btn.disabled ? '' : 'disabled'}>${label}</button>`;
    } else return;
    const old = root.querySelector('.tryon-back'); if (old) old.remove();
    const html = tryOnHtml(entry, opts);
    if (html) root.querySelector('.modal').insertAdjacentHTML('beforeend', html);
  }

  /* =============== ЛАВКА =============== */
  const shop = {
    html() {
      const s = st.shop;
      let body = '';
      if (s.tab === 'buy') {
        const top = Profile.shopTop(), cat = catalogView(s, top);
        const items = cat.list || _t("<p class=\"hint\">В этой вкладке нет вещей.</p>");
        const qtyPicker = (kind, key, active) => `<div class="qty-picker">${QTY_STEPS.map((n) => `<button type="button" class="qs ${n === active ? 'on' : ''}" data-qty="${kind}" data-qty-key="${key}" data-qty-n="${n}">×${n}</button>`).join('')}</div>`;
        const cons = Object.entries(Gear.CONSUMABLES).filter(([, c]) => !c.alchemy).map(([k, c]) => {
          const qty = s.consQty[k] || 1, total = buyPrice(Gear.bulkPrice(consPrice(k), qty));
          return _t("<div class=\"card\" style=\"--t:#c9b48a\">{0}<div class=\"card-body\"><span class=\"item-title\">{1}</span><span class=\"item-foot\">{2}</span><span class=\"item-foot\">Цена: {3} за шт. · в ранце: {4}</span></div>\n          <div class=\"card-act\">{5}<button type=\"button\" data-buy-cons=\"{6}\" data-n=\"{7}\" {8}>Купить ×{9} за {10}</button></div></div>", [itemIcon(k), c.name, c.desc, money(buyPrice(consPrice(k))), Profile.data.backpack[k] || 0, qtyPicker('cons', k, qty), k, qty, Profile.data.coins >= total ? '' : 'disabled', qty, money(total)]);
        }).join('');
        const ak = Profile.shotKind(), AM = Ammo.CATALOG[ak], aq = s.ammoQty || Ammo.PACK, atot = buyPrice(Gear.bulkPrice(ammoPrice(ak), aq));
        const ammoCard = _t("<div class=\"card\" style=\"--t:#c9b48a\">{0}<div class=\"card-body\"><span class=\"item-title\">{1}</span><span class=\"item-foot\">{2} Выстрел хода не тратит, один за ход.</span><span class=\"item-foot\">Цена: {3} за шт. · в сумке: {4}</span></div>\n          <div class=\"card-act\"><div class=\"qty-picker\">{5}</div><button type=\"button\" data-buy-ammo=\"{6}\" data-n=\"{7}\" {8}>Купить ×{9} за {10}</button></div></div>", [Ammo.icon(ak), AM.name, AM.desc, money(buyPrice(ammoPrice(ak))), Profile.ammo(ak), [5, 10, 25].map((n) => `<button type="button" class="qs ${n === aq ? 'on' : ''}" data-ammo-qty="${n}">×${n}</button>`).join(''), ak, aq, Profile.data.coins >= atot ? '' : 'disabled', aq, money(atot)]);
        const rt = Math.min(s.resTier, top);
        const res = Object.entries(Bestiary.RESOURCES).map(([k]) => {
          const unit = buyPrice(Bestiary.resPrice(k, rt) * RES_BUY_MARKUP), qty = s.resQty[k] || 1, total = Gear.bulkPrice(unit, qty);
          return _t("<div class=\"card\" style=\"--t:{0}\">{1}<div class=\"card-body\"><span class=\"item-title\">{2}</span><span class=\"item-foot\">Цена: {3} за шт. · у вас: {4}</span></div>\n            <div class=\"card-act\">{5}<button type=\"button\" data-buy-res=\"{6}\" data-n=\"{7}\" {8}>Купить ×{9} за {10}</button></div></div>", [tierColor(rt), MonsterArt.resIcon(k, rt), resLabel(k, rt), money(unit), Profile.res(k, rt), qtyPicker('res', k, qty), k, qty, Profile.data.coins >= total ? '' : 'disabled', qty, money(total)]);
        }).join('');
        body = _t("<h3>Вещи: постоянный каталог</h3>{0}<div class=\"card-list\">{1}</div>\n          <h3>Боеприпасы вашего народа</h3><div class=\"card-list\">{2}</div>\n          <h3>Расходники</h3><div class=\"card-list\">{3}</div>\n          <h3>Ресурсы</h3>{4}<div class=\"card-list\">{5}</div>\n          <p class=\"hint\">Руны теперь продаёт Журавль-художник в Мастерской художника.</p>", [cat.head, items, ammoCard, cons, tierPicker(top, rt, 'restier'), res]);
      } else {
        const items = Profile.data.items.filter((e) => !Profile.equippedUid(e.uid)).map((e) => Gear.item(e))
          .sort((a, b) => b.tier - a.tier).map((it) =>
            itemCard(it, _t("Продать за: {0}", [money(Gear.sellValue(Math.round(it.price * Gear.wearFactor(Profile.item(it.uid)))))]), _t("<button type=\"button\" data-sell-item=\"{0}\">Продать</button>", [it.uid]))).join('') || _t("<p class=\"hint\">Нет вещей на продажу (надетые не продаются).</p>");
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
      if (d.catset) { s.set = d.catset; return render(); }
      if (d.catkind) { s.kind = d.catkind; return render(); }
      if (d.cattier) { s.tier = Number(d.cattier); return render(); }
      if (d.buyCat) {                                 // 1.6.5: покупка из постоянного каталога (вещь создаётся в момент покупки)
        const [id, tr] = d.buyCat.split(':'), tier = Number(tr), top = Profile.shopTop();
        if (!Gear.itemsFor(Profile.data.faction).some((x) => x.id === id && x.rarity !== 'epic') || !(tier >= 1 && tier <= top)) return;
        const it = Gear.item({ id, tier });
        if (!Profile.spend(buyPrice(it.price))) return;
        Profile.addItem(Gear.makeEntry(id, tier));
        s.msg = _t("Куплено: {0} ({1})", [it.name, Tiers.get(it.tier).name]);
        return changed();
      }
      if (d.qty) {
        const store = d.qty === 'cons' ? s.consQty : s.resQty;
        store[d.qtyKey] = Number(d.qtyN);
        return render();
      }
      if (d.buyItem) {                                // устарело (1.6.5): кнопки случайной витрины больше нет; обработчик оставлен для старых тестов
        const e = Profile.shop().stock.find((x) => x.uid === d.buyItem), it = Gear.item(e);
        if (!e || !it) return;
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
        const n = Math.max(1, Number(d.n) || 1), rt = Math.min(s.resTier, Profile.shopTop());
        const total = Gear.bulkPrice(buyPrice(Bestiary.resPrice(d.buyRes, rt) * RES_BUY_MARKUP), n);
        if (!Profile.spend(total)) return;
        Profile.addRes(d.buyRes, rt, n);
        s.msg = _t("Куплено: {0} × {1}", [resLabel(d.buyRes, rt), n]);
        return changed();
      }
      if (d.sellItem) {
        if (!Profile.item(d.sellItem)) return;   // 1.6.4: повторный (устаревший) клик по уже проданной вещи не платит второй раз
        const ent = Profile.item(d.sellItem), it = Gear.item(ent), wf = Gear.wearFactor(ent);     // 1.6.6: изношенная вещь дешевле
        Profile.removeItem(d.sellItem);
        Profile.addCoins(Gear.sellValue(Math.round(it.price * wf)));
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
    ['legs', _t("Поножи"), (t) => t === 'legs'], ['amulet', _t("Амулеты"), (t) => t === 'amulet'], ['bag', _t("Сумки"), (t) => t === 'bag'], ['leash', _t("Поводки"), (t) => t === 'leash'], ['compass', _t("Компасы"), (t) => t === 'compass'], ['belt', _t("Пояса"), (t) => t === 'belt'], ['ranged', _t("Метательное"), (t) => t === 'ranged'],
  ];
  const costHtml = (c) => _t("<div class=\"costs\"><span class=\"need {0}\">Монеты: {1}</span>{2}</div>", [Profile.data.coins >= c.coins ? 'ok' : 'no', money(c.coins), c.res.map((r) => haveNeed(r.kind, r.tier, r.n)).join('')]);
  const canPay = (c) => Profile.data.coins >= c.coins && c.res.every((r) => Profile.res(r.kind, r.tier) >= r.n);
  const pay = (c) => { Profile.spend(c.coins); for (const r of c.res) Profile.takeRes(r.kind, r.tier, r.n); };

  // 1.6.0: подсказки при первом открытии новых вкладок кузницы
  const forgeTip = (tab) => (tab === 'refit' ? tipBox('forge:refit', _t("Вещь цвета на один выше вашего можно перековать за монеты: тогда её можно надеть на 10 уровней раньше. Характеристики не меняются.")) : tab === 'temper' ? tipBox('forge:temper', _t("Закалка усиливает вещь до +5 за монеты. Предел шага растёт с улучшением Кузницы в деревне (Ратуша → «Улучшения деревни»).")) : '');
  /* =============== 1.8.9: стрелки компаса (Кузница) и путевой дневник (Библиотека); логика — js/compass.js =============== */
  const compassState = () => (Profile.data.compass = Compass.clean(Profile.data.compass));
  const cpFactor = () => (evNow().id === 'travel' ? 0.8 : 1);                 // «Неделя странников»: стрелки и дневник на 20% дешевле
  const resNeedHtml = (res) => Object.entries(res).map(([k, n]) => `<span class="need ${resAny(k) >= n ? 'ok' : 'no'}">${Bestiary.RESOURCES[k].name} ${resAny(k)}/${n}</span>`).join(' ');
  const resEnough = (res) => Object.entries(res).every(([k, n]) => resAny(k) >= n);
  function compassForgeBody() {
    const c = compassState(), bt = Profile.beltTier(), P = unitP();
    const intro = bt ? `<p class="hint">${_t("Стрелка переносит героя на материке: «домой» — к Ратуше, «к метке» — на любую вашу метку. Стрелки хранятся только в Поясе (запас каждого вида — {0}) и работают только с надетым Поясом.", [Compass.cap(bt)])}</p>`
      : `<p class="warn hint">${_t("Стрелки хранятся и работают только с Поясом, а пояса на вас нет. Пояс охотника выдаёт Охотничий дом за поручение «Первая добыча».")}</p>`;
    const cards = Compass.KINDS.map((k) => {
      const r = Compass.RECIPES[k], coins = Compass.cost(r, P, cpFactor()), room = Compass.room(c, k, bt);
      const can = bt > 0 && room > 0 && Profile.data.coins >= coins && resEnough(r.res);
      return `<div class="card" style="--t:#c9b48a"><div class="card-body"><span class="item-title">${Compass.NAME[k]()} · ${_t("в поясе {0} из {1}", [Compass.count(c, k), Compass.cap(bt)])}</span><span class="item-foot">${_t("Монеты: {0}", [money(coins)])} · ${resNeedHtml(r.res)}${bt && room <= 0 ? '<br><span class="hint warn">' + _t("Пояс полон") + '</span>' : ''}</span></div><div class="card-act"><button type="button" ${can ? '' : 'disabled'} data-cp-make="${k}">${_t("Сделать")}</button></div></div>`;
    }).join('');
    return `${evBanner()}${intro}<div class="card-list">${cards}</div>`;
  }
  function compassMake(kind) {
    const c = compassState(), bt = Profile.beltTier(), r = Compass.RECIPES[kind];
    if (!r || !Compass.canAdd(c, kind, bt)) return false;
    const coins = Compass.cost(r, unitP(), cpFactor());
    if (Profile.data.coins < coins || !resEnough(r.res)) return false;
    Profile.spend(coins); for (const [k, n] of Object.entries(r.res)) takeResAny(k, n);
    Compass.add(c, kind, bt); Profile.save(); return true;
  }
  function diaryBody() {
    const c = compassState(), P = unitP(), coins = Compass.cost(Compass.DIARY, P, cpFactor());
    if (c.diary) return `<p class="hint">${_t("Путевой дневник у вас уже есть. Откройте журнал на карте (кнопка «Журнал»): у каждой метки появится значок карандаша — название можно вписать.")}</p>`;
    const can = Profile.data.coins >= coins && resEnough(Compass.DIARY.res);
    return `<p class="hint">${_t("В путевом дневнике метки на карте получают названия вместо номеров. Дневник делается один раз.")}</p>
      <div class="card" style="--t:#c9b48a"><div class="card-body"><span class="item-title">${_t("Путевой дневник")}</span><span class="item-foot">${_t("Монеты: {0}", [money(coins)])} · ${resNeedHtml(Compass.DIARY.res)}</span></div><div class="card-act"><button type="button" ${can ? '' : 'disabled'} data-diary-make="1">${_t("Сделать")}</button></div></div>`;
  }
  function diaryMake() {
    const c = compassState(), coins = Compass.cost(Compass.DIARY, unitP(), cpFactor());
    if (c.diary || Profile.data.coins < coins || !resEnough(Compass.DIARY.res)) return false;
    Profile.spend(coins); for (const [k, n] of Object.entries(Compass.DIARY.res)) takeResAny(k, n);
    c.diary = true; Profile.save(); return true;
  }

  /* =============== 1.8.9: самоцветы стражей (Кузница «Огранка»), js/stones.js =============== */
  const gemDot = (c) => `<i class="gem-dot" style="background:${Stones.HEX[c - 1]}"></i>`;
  function jewelerBody(tab) {
    const S = Profile.stones(), J = st.jeweler, gear = Profile.gear(), P = unitP();
    const all = Array.from({ length: Stones.COLORS }, (_, i) => i + 1);
    if (tab === 'seals') {
      return `<p class="hint">${_t("Печать стража сплавляется из трёх самоцветов одного цвета. У двери подземелья она переносит сразу на этаж стража — если вы там уже бывали.")}</p><div class="card-list">${all.map((k) => `<div class="card" style="--t:#c9b48a"><div class="card-body"><span class="item-title">${gemDot(k)} ${_t("Печать «{0}»", [Stones.name(k)])} · ${_t("есть {0}", [S.seals[k]])}</span><span class="item-foot">${_t("{0} самоцвета → этаж {1} подземелья", [Stones.SEAL_COST, Stones.sealFloor(k)])} · ${Stones.name(k)} × ${S.bag[k]}</span></div><div class="card-act"><button type="button" ${S.bag[k] >= Stones.SEAL_COST ? '' : 'disabled'} data-seal-make="${k}">${_t("Сплавить")}</button></div></div>`).join('')}</div>`;
    }
    if (tab === 'sell') {
      const rows = all.filter((c) => S.bag[c] > 0).map((c) => `<div class="card" style="--t:#c9b48a"><div class="card-body"><span class="item-title">${gemDot(c)} ${Stones.name(c)} × ${S.bag[c]}</span><span class="item-foot">${_t("Цена за штуку: {0}", [money(Stones.sellPrice(c, P))])}</span></div><div class="card-act"><button type="button" data-gem-sell="${c}">${_t("Продать 1")}</button></div></div>`).join('');
      return rows ? `<div class="card-list">${rows}</div>` : `<p class="hint">${_t("Самоцветов нет. Их роняют каменные стражи подземелья.")}</p>`;
    }
    const bag = all.map((c) => `<span class="stone-chip ${J.cutColor === c ? 'on' : ''}"><button type="button" data-cut-color="${c}" ${S.bag[c] > 0 ? '' : 'disabled'}>${gemDot(c)} ${Stones.name(c)} × ${S.bag[c]}</button></span>`).join('');
    const c = J.cutColor | 0;
    const rows = Object.entries(gear).filter(([, it]) => it && it.uid).map(([slot, it]) => {
      const cur = it.cut ? `${gemDot(it.cut)} ${Stones.name(it.cut)}` : _t("без огранки");
      const hint = slot === 'belt' ? _t("запас стрелок +{0}", [Stones.beltCap(c || it.cut)]) : (c || it.cut ? Object.entries(Stones.cutBonus(c || it.cut)).map(([k, v]) => `${Gear.STAT_NAMES[k]} +${v}`).join(', ') : '');
      return `<div class="card" style="--t:#c9b48a"><div class="card-body"><span class="item-title">${(Gear.item(it) || {}).name || it.id}</span><span class="item-foot">${cur}${hint ? ' · ' + hint : ''}</span></div><div class="card-act"><button type="button" ${Stones.valid(c) && S.bag[c] > 0 && it.cut !== c ? '' : 'disabled'} data-cut-do="${it.uid}">${_t("Огранить")}</button></div></div>`;
    }).join('');
    return `<p class="hint">${_t("Выберите самоцвет, затем надетую вещь. Одна грань на вещь; новая заменяет старую, камень не возвращается. Пояс получает больший запас стрелок.")}</p><div class="stone-bag">${bag}</div><div class="card-list">${rows}</div>`;
  }
  function stoneCut(uid) {
    const S = Profile.stones(), c = st.jeweler.cutColor | 0, e = Profile.data.items.find((i) => i.uid === uid);
    if (!e || !Stones.valid(c) || e.cut === c || !Stones.take(S, c, Stones.cutCost(c))) return false;
    e.cut = c; Profile.save(); return true;
  }
  const MAGPIE_LINES = [_t("Блестит? Всё, что блестит, приносите мне. Огранить, сплавить, оценить — я сорока, а не слепая курица."), _t("Хороший камень! Видите, как играет?"), _t("Грань легла как по линейке. Теперь вещь сияет.")];
  const jeweler = {
    html() {
      const s = st.jeweler;
      const portrait = (typeof Art !== 'undefined' && Art.hasNpc('magpie-jeweler'))
        ? Art.npcPortrait('magpie-jeweler')
        : `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#1e1a24"/>
            <ellipse cx="50" cy="82" rx="28" ry="9" fill="#34303c"/>
            <path d="M30 80 Q28 50 44 38 Q46 24 56 22 Q66 24 64 38 Q74 52 70 80Z" fill="#1c1c24"/>
            <path d="M44 56 Q52 50 62 58 L60 76 Q50 80 42 74Z" fill="#f4f1e8"/>
            <circle cx="56" cy="30" r="9" fill="#1c1c24"/><circle cx="58" cy="28" r="2.2" fill="#fff"/><circle cx="58.6" cy="28" r="1" fill="#111"/>
            <path d="M63 31 L76 34 L63 37Z" fill="#c9a869"/>
            <path d="M26 40 L30 34 L34 40 L30 46Z" fill="#6aa8e8" stroke="#fff" stroke-width=".8"/>
            <path d="M70 60 L74 54 L78 60 L74 66Z" fill="#e0605a" stroke="#fff" stroke-width=".8"/></svg>`;
      const scene = (typeof Art !== 'undefined' && Art.hasScene('jeweler'))
        ? ` style="background-image:linear-gradient(180deg, rgba(20,16,10,.55), rgba(20,16,10,.85)), url('${Art.sceneUrl('jeweler')}');background-size:cover;background-position:center"` : '';
      const body = `<div class="npc-row"><span class="npc-portrait">${portrait}</span><div class="npc-say"><b>${_t("Сорока-ювелир")}</b><p class="hint">${s.msg || MAGPIE_LINES[0]}</p></div></div>${jewelerBody(s.tab)}`;
      return `<div class="modal" role="dialog" aria-label="${_t("Ювелирная лавка")}">${head(_t("Ювелирная лавка"))}${tabs([['cut', _t("Огранка")], ['seals', _t("Печати")], ['sell', _t("Скупка")]], s.tab)}<div class="screen-body tavern-body"${scene}>${body}</div></div>`;
    },
    click(b) {
      const s = st.jeweler, d = b.dataset;
      if (d.tab) { s.tab = d.tab; s.msg = ''; return render(); }
      if (d.cutColor) { s.cutColor = Number(d.cutColor); return render(); }
      if (d.cutDo) { s.msg = stoneCut(d.cutDo) ? MAGPIE_LINES[2] : _t("Не получилось."); return changed(); }
      if (d.sealMake) { s.msg = Stones.makeSeal(Profile.stones(), Number(d.sealMake)) ? (Profile.save(), _t("Печать сплавлена.")) : _t("Не хватает самоцветов."); return changed(); }
      if (d.gemSell) { const c = Number(d.gemSell), S = Profile.stones(); if (Stones.take(S, c, 1)) { Profile.addCoins(Stones.sellPrice(c, unitP())); Profile.save(); s.msg = MAGPIE_LINES[1]; } return changed(); }
    },
  };

  const forge = {
    html() {
      const s = st.forge;
      let body = '';
      if (s.tab === 'upgrade') {
        const items = Profile.data.items.map((e) => Gear.item(e)).sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name));
        if (!s.sel || !Profile.item(s.sel)) s.sel = items[0] ? items[0].uid : null;
        const list = items.map((it) => `<button type="button" class="itembtn ${s.sel === it.uid ? 'on' : ''}" data-pick="${it.uid}">${itemCard(it, Profile.equippedUid(it.uid) ? _t("в экипировке") : '')}</button>`).join('') || _t("<p class=\"hint\">У вас нет вещей.</p>");
        let detail = _t("<p class=\"hint\">Выберите вещь слева.</p>");
        if (s.sel) {
          const it = Gear.item(Profile.item(s.sel)), cost = forgeCost(Gear.upgradeCost(Profile.item(s.sel)));
          if (!cost) detail = _t("{0}<p class=\"hint\">Эта вещь уже Обсидиановая — выше улучшать некуда.</p>", [itemCard(it, _t("Максимальный уровень"))]);
          else {
            const next = Gear.item({ ...Profile.item(s.sel), tier: it.tier + 1 });
            const lvlWarn = Hero.canWear(next.wt, Profile.level()) ? '' : _t("<p class=\"hint warn\">Вещь цвета «{0}» можно надеть с {1}-го уровня.</p>", [Tiers.get(next.tier).name, Hero.itemLevel(next.wt)]);
            const worn = Profile.equippedUid(it.uid), locked = worn && !canEditGear();
            detail = _t("{0}<div class=\"arrow-down\">повышение до {1}</div>{2}\n              <h3>Стоимость (ресурсы того же цвета, что у вещи)</h3>{3}{4}\n              {5}\n              <div class=\"reset\"><button type=\"button\" data-do-upgrade=\"1\" {6}>Улучшить</button></div>", [itemCard(it, _t("Сейчас")), itemChip(next.tier), itemCard(next, _t("В очках снаряжения: {0} → {1}", [it.cost, next.cost])) + (() => { const dl = Object.keys(next.stats).filter((k) => next.stats[k] !== it.stats[k]).map((k) => `${Gear.STAT_NAMES[k] || k} ${it.stats[k] || 0} → ${next.stats[k]}`).join(', '); return dl ? `<p class="hint">${_t("Было → стало: {0}", [dl])}</p>` : ''; })(), costHtml(cost), lvlWarn, locked ? _t("<p class=\"hint warn\">Надетую вещь можно улучшать до первого хода боя или после его окончания.</p>") : '', canPay(cost) && !locked ? '' : 'disabled']);
            detail += `<div class="reset">${tryBtn('upgrade', it.uid)}</div>`;
          }
        }
        body = `<div class="two-col"><div class="item-list tall">${list}</div><div>${detail}</div></div>`;
      } else if (s.tab === 'refit') {
        // 1.6.0: перековка — вещь следующего цвета за монеты становится носимой на цвет раньше
        const lv = Profile.level();
        const items = Profile.data.items.map((e) => Gear.item(e)).filter((it) => it.tier > 1 && (it.fit || !Hero.canWear(it.tier, lv))).sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name));
        if (!s.sel || !items.some((it) => it.uid === s.sel)) s.sel = items[0] ? items[0].uid : null;
        const list = items.map((it) => `<button type="button" class="itembtn ${s.sel === it.uid ? 'on' : ''}" data-pick="${it.uid}">${itemCard(it, it.fit ? _t("перекована") : '')}</button>`).join('') || `<p class="hint">${_t("Нет вещей, которые можно перековать: нужна вещь цвета на один выше вашего.")}</p>`;
        let detail = `<p class="hint">${_t("Перековка: вещь следующего цвета можно носить на {0} уровней раньше. Характеристики не меняются.", [Balance.hero.levelsPerTier])}</p>`;
        if (s.sel && Profile.item(s.sel)) {
          const e = Profile.item(s.sel), it = Gear.item(e), fc = forgeCost(Gear.fitCost(e, lv));
          if (it.fit) detail = itemCard(it, _t("Уже перекована")) + `<p class="hint">${_t("Теперь её можно надеть с {0}-го уровня.", [Hero.itemLevel(it.wt)])}</p>`;
          else if (!fc) detail = itemCard(it, '') + `<p class="hint warn">${_t("Перековать можно только вещь на один цвет выше вашего.")}</p>`;
          else {
            const can = Profile.data.coins >= fc.coins;
            detail = `${itemCard(it, '')}<p class="hint">${_t("Сейчас: с {0}-го уровня → после перековки: с {1}-го.", [Hero.itemLevel(it.tier), Hero.itemLevel(it.tier - 1)])}</p>
              <div class="costs"><span class="need ${can ? 'ok' : 'no'}">${_t("Монеты: {0}", [money(fc.coins)])}</span></div>
              <div class="row"><button type="button" class="primary" data-do-refit="1" ${can ? '' : 'disabled'}>${_t("Перековать")}</button></div>`;
            detail += `<div class="row">${tryBtn('refit', it.uid)}</div>`;
          }
        }
        body = `<div class="two-col"><div class="item-list tall">${list}</div><div>${detail}</div></div>`;
      } else if (s.tab === 'temper') {
        // 1.5.1: закалка вещей за золото. Предел шага даёт улучшение Кузницы (Ратуша → «Улучшения деревни»).
        const cap = Math.min(Gear.TEMPER_MAX, Village.temperCap(Profile.data.village));
        const items = Profile.data.items.map((e) => Gear.item(e)).sort((a, b) => b.tier - a.tier || b.plus - a.plus || a.name.localeCompare(b.name));
        if (!s.sel || !Profile.item(s.sel)) s.sel = items[0] ? items[0].uid : null;
        const list = items.map((it) => `<button type="button" class="itembtn ${s.sel === it.uid ? 'on' : ''}" data-pick="${it.uid}">${itemCard(it, Profile.equippedUid(it.uid) ? _t("в экипировке") : '')}</button>`).join('') || `<p class="hint">${_t("Вещей нет")}</p>`;
        let detail = `<p class="hint">${_t("Выберите вещь слева.")}</p>`;
        if (s.sel && Profile.item(s.sel)) {
          const e = Profile.item(s.sel), it = Gear.item(e), tc = Gear.temperCost(e);
          const intro = cap <= 0 ? `<p class="hint warn">${_t("Закалка откроется после улучшения Кузницы: Ратуша → «Улучшения деревни».")}</p>` : `<p class="hint">${_t("Закалка до +{0} (больше — после улучшения Кузницы). Каждый шаг усиливает все характеристики вещи на 4%, очки снаряжения не растут.", [cap])}</p>`;
          if (!tc) detail = itemCard(it, _t("Закалка +{0} — максимум", [it.plus])) + intro;
          else {
            const nx = Gear.item({ ...e, plus: tc.plus }), can = it.plus < cap && Profile.data.coins >= tc.coins;
            const delta = Object.keys(nx.stats).filter((k) => nx.stats[k] !== it.stats[k]).map((k) => `${Gear.STAT_NAMES[k] || k} ${it.stats[k]} → ${nx.stats[k]}`).join(', ');
            detail = `${itemCard(it, '')}<div class="arrow-down">${_t("закалка до +{0}", [tc.plus])}</div>${itemCard(nx, delta)}${intro}
              <div class="costs"><span class="need ${Profile.data.coins >= tc.coins ? 'ok' : 'no'}">${_t("Монеты: {0}", [money(tc.coins)])}</span></div>
              <div class="row"><button type="button" class="primary" data-do-temper="1" ${can ? '' : 'disabled'}>${_t("Закалить")}</button></div>`;
            detail += `<div class="row">${tryBtn('temper', it.uid)}</div>`;
          }
        }
        body = `<div class="two-col"><div class="item-list tall">${list}</div><div>${detail}</div></div>`;
      } else if (s.tab === 'repair') {
        // 1.6.6: починка — полный ремонт вещи стоит треть её цены, пункты пропорционально; скидка народа на Кузницу действует
        const worn = Profile.data.items.map((e) => Gear.item(e)).filter((it) => it.dur < it.maxDur).sort((a, b) => a.dur / a.maxDur - b.dur / b.maxDur || b.tier - a.tier);
        if (!s.sel || !worn.some((it) => it.uid === s.sel)) s.sel = worn[0] ? worn[0].uid : null;
        const list = worn.map((it) => `<button type="button" class="itembtn ${s.sel === it.uid ? 'on' : ''}" data-pick="${it.uid}">${itemCard(it, (Profile.equippedUid(it.uid) ? _t("в экипировке · ") : '') + _t("починка целиком: {0}", [money(repairPrice(Profile.item(it.uid)))]))}</button>`).join('') || `<p class="hint">${_t("Все вещи целы.")}</p>`;
        let detail = `<p class="hint">${_t("Каждое поражение снимает 1 пункт прочности с надетых вещей. Сломанная вещь (0) снимается и не надевается, пока её не починят. Полная починка стоит треть цены вещи.")}</p>`;
        if (s.sel && Profile.item(s.sel)) {
          const e = Profile.item(s.sel), it = Gear.item(e), miss = it.maxDur - it.dur;
          const btn = (n, label) => { const c = repairPrice(e, Math.min(n, miss)); return `<button type="button" data-do-repair="${n}" ${Profile.data.coins >= c && miss > 0 ? '' : 'disabled'}>${label} — ${money(c)}</button>`; };
          detail = `${itemCard(it, '')}<div class="budget-bar"><i style="width:${Math.round(100 * it.dur / it.maxDur)}%"></i></div>
            <p class="hint">${_t("Прочность {0} из {1}. Не хватает: {2}.", [it.dur, it.maxDur, miss])}</p>
            <div class="row">${[btn(1, '+1'), miss > 5 ? btn(5, '+5') : '', miss > 10 ? btn(10, '+10') : '', btn(miss, _t("Починить полностью"))].join('')}</div>`;
        }
        const allCost = worn.reduce((sum, it) => sum + repairPrice(Profile.item(it.uid)), 0);
        const all = worn.length > 1 ? `<div class="row"><button type="button" class="primary" data-do-repair-all="1" ${Profile.data.coins >= allCost ? '' : 'disabled'}>${_t("Починить всё ({0}) — {1}", [worn.length, money(allCost)])}</button></div>` : '';
        body = `<div class="two-col"><div class="item-list tall">${list}</div><div>${detail}${all}</div></div>`;
      } else if (s.tab === 'swap') {
        // 1.7.5: обмен цветов ресурсов и подсказка «где добыть»
        const E = Bestiary.EXCHANGE, known = Profile.species();
        const rows = Profile.resList().map((r) => {
          const up = Bestiary.exchangePlan(r.kind, r.tier, 'up'), dn = Bestiary.exchangePlan(r.kind, r.tier, 'down');
          const src = Bestiary.sourcesOf(r.kind).filter((id) => known.includes(id)).map((id) => Bestiary.MONSTERS[id].name).join(', ') || _t("пока неизвестно");
          const bu = up ? `<button type="button" data-swap="${r.kind}:${r.tier}:up" ${r.n >= up.take ? '' : 'disabled'}>${_t("{0} → 1 цвета «{1}»", [up.take, Tiers.get(up.to).name])}</button>` : '';
          const bd = dn ? `<button type="button" data-swap="${r.kind}:${r.tier}:down" ${r.n >= dn.take ? '' : 'disabled'}>${_t("1 → {0} цвета «{1}»", [dn.give, Tiers.get(dn.to).name])}</button>` : '';
          return `<div class="card" style="--t:${tierColor(r.tier)}">${MonsterArt.resIcon(r.kind, r.tier)}<div class="card-body"><span class="item-title">${resLabel(r.kind, r.tier)} × ${r.n}</span><span class="item-foot">${_t("Где добыть: {0}", [src])}</span></div><div class="card-act">${bu}${bd}</div></div>`;
        }).join('') || _t("<p class=\"hint\">Ресурсов пока нет: они выпадают из существ.</p>");
        body = `<p class="hint">${_t("Обмен — только между соседними цветами одного ресурса: {0} → 1 вверх и 1 → {1} вниз. Монеты не нужны.", [E.up, E.downOut])}</p><div class="card-list">${rows}</div>`;
      } else if (s.tab === 'compass') {
        body = compassForgeBody();
      } else if (s.tab === 'ammo') {
        const ak = Profile.shotKind(), AM = Ammo.CATALOG[ak], top = Hero.tierFor(Profile.level());
        const C = Ammo.CRAFT, fee = Math.round(ammoPrice(ak) * 0.3);
        const lo = Math.max(1, top - 1);
        const ok = Profile.resList().filter((r) => r.tier >= lo && r.n >= C.res);
        const list = ok.map((r) => _t("<div class=\"card\" style=\"--t:{0}\">{1}<div class=\"card-body\"><span class=\"item-title\">{2} × {3} → {4} × {5}</span><span class=\"item-foot\">У вас: {6} · работа кузнеца: {7}</span></div>\n          <div class=\"card-act\"><button type=\"button\" data-craft-ammo=\"{8}:{9}\" {10}>Изготовить</button></div></div>", [tierColor(r.tier), MonsterArt.resIcon(r.kind, r.tier), C.res, resLabel(r.kind, r.tier), C.out, AM.short, r.n, money(fee), r.kind, r.tier, Profile.data.coins >= fee ? '' : 'disabled'])).join('')
          || _t("<p class=\"hint\">Нужно {0} одинаковых ресурса: цвет «{1}» или выше — они выпадают из существ.</p>", [C.res, Tiers.get(lo).name]);
        body = _t("<div class=\"card\" style=\"--t:#c9b48a\">{0}<div class=\"card-body\"><span class=\"item-title\">{1} · в сумке {2}</span><span class=\"item-foot\">{3}</span></div></div>\n          <h3>Изготовить из ресурсов</h3><div class=\"card-list\">{4}</div>", [Ammo.icon(ak), AM.name, Profile.ammo(ak), AM.desc, list]);
      } else {
        const f = FILTERS.find((x) => x[0] === s.filter);
        const top = Hero.tierFor(Profile.level());
        if (!s.craftTier || s.craftTier > top) s.craftTier = top;
        const ct = s.craftTier;
        const bases = Gear.itemsFor(Profile.data.faction).filter((b) => f[2](b.type)).sort((a, b) => a.cost - b.cost);
        const list = bases.map((b) => {
          const it = Gear.item({ id: b.id, tier: ct }), cost = forgeCost(Gear.craftCost(b.id, ct));
          return `<div class="craft-unit">${itemCard(it, _t("{0} · из ресурсов цвета «{1}»", [Gear.RARITY_NAMES[b.rarity], Tiers.get(ct).name]), _t("<button type=\"button\" data-craft=\"{0}\" {1}>Создать</button>", [b.id, canPay(cost) ? '' : 'disabled']) + tryBtn('craft', b.id))}${costHtml(cost)}</div>`;
        }).join('');
        body = _t("<div class=\"tabs sub\">{0}</div>\n          <p class=\"hint\">Цвет новой вещи (до цвета вашего уровня):</p>{1}<div class=\"card-list\">{2}</div>", [FILTERS.map(([k, label]) => `<button type="button" class="${k === s.filter ? 'on' : ''}" data-filter="${k}">${label}</button>`).join(''), tierPicker(top, ct, 'crafttier'), list]);
      }
      const res = Profile.resList().map((r) => `<span class="need ok">${MonsterArt.resIcon(r.kind, r.tier)}${resLabel(r.kind, r.tier)} × ${r.n}</span>`).join('') || _t("<span class=\"hint\">Ресурсов нет</span>");
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Кузница\">{0}{1}\n        <div class=\"screen-body tavern-body\"{2}>{3}<div class=\"stock-line\">Ваши ресурсы: {4}</div>{5}</div></div>", [head(_t("Кузница")), tabs([['upgrade', _t("Улучшить цвет")], ['craft', _t("Создать вещь")], ['ammo', _t("Боеприпасы")], ['compass', _t("Стрелки")], ['swap', _t("Обмен")], ['temper', _t("Закалка")], ['refit', _t("Перековка")], ['repair', _t("Починка")]], s.tab), sceneStyle('forge'), s.msg ? `<div class="gear-toast">${s.msg}</div>` : '', res, forgeTip(s.tab) + body]);
    },
    click(b) {
      const s = st.forge, d = b.dataset;
      if (d.tab) { s.tab = d.tab; s.msg = ''; return render(); }
      if (d.cpMake) { s.msg = compassMake(d.cpMake) ? _t("Стрелка в поясе.") : _t("Не получилось: нужен пояс со свободным местом, монеты и ресурсы."); return changed(); }
      if (d.filter) { s.filter = d.filter; return render(); }
      if (d.crafttier) { s.craftTier = Number(d.crafttier); return render(); }
      if (d.pick) { s.sel = d.pick; s.msg = ''; return render(); }
      if (d.doRefit) {
        const e = Profile.item(s.sel), fc = e && forgeCost(Gear.fitCost(e, Profile.level()));
        if (!fc || !Profile.spend(fc.coins)) return;
        e.fit = true;
        Profile.save();
        s.msg = _t("Перекована: {0} — теперь можно надеть с {1}-го уровня", [Gear.item(e).name, Hero.itemLevel(Gear.item(e).wt)]);
        onGearChanged();
        return changed();
      }
      if (d.doRepair) {
        const e = Profile.item(s.sel); if (!e) return;
        const n = Math.max(1, Math.floor(Number(d.doRepair)) || 1), price = repairPrice(e, n);
        if (!price || !Profile.repairItem(e.uid, n, price)) return;
        s.msg = _t("Починено: {0}", [Gear.item(e).name]);
        onGearChanged();
        return changed();
      }
      if (d.doRepairAll) {
        const worn = Profile.data.items.filter((e) => Gear.durOf(e).cur < Gear.durOf(e).max);
        const total = worn.reduce((sum, e) => sum + repairPrice(e), 0);
        if (!worn.length || Profile.data.coins < total) return;
        for (const e of worn) Profile.repairItem(e.uid, undefined, repairPrice(e));
        s.msg = _t("Починено вещей: {0}", [worn.length]);
        onGearChanged();
        return changed();
      }
      if (d.doTemper) {
        const e = Profile.item(s.sel), tc = e && Gear.temperCost(e), cap = Math.min(Gear.TEMPER_MAX, Village.temperCap(Profile.data.village));
        if (!tc || tc.plus > cap || !Profile.spend(tc.coins)) return;
        e.plus = tc.plus;
        Profile.save();
        s.msg = _t("Закалено: {0}", [Gear.item(e).name]);
        onGearChanged();
        return changed();
      }
      if (d.doUpgrade) {
        const e = Profile.item(s.sel), cost = forgeCost(Gear.upgradeCost(e));
        if (!cost || !canPay(cost)) return;
        pay(cost);
        Gear.setTier(e, e.tier + 1);          // 1.6.6: прочность сохраняет долю
        Profile.save();
        const it = Gear.item(e);
        s.msg = _t("Улучшено: {0} — теперь {1}", [it.name, Tiers.get(it.tier).name]);
        // если вещь надета и очки превышены — снимаем её
        const worn = Profile.equippedUid(e.uid);
        if (worn && !Hero.canWear(Gear.item(e).wt, Profile.level())) {
          Profile.data.loadout[worn] = null;
          Profile.save();
          s.msg += _t(". Такой цвет можно надеть только с {0}-го уровня — вещь снята в сумку", [Hero.itemLevel(Gear.item(e).wt)]);
        } else if (worn && Gear.totalCost(Profile.gear()) > Profile.budget()) {
          Profile.data.loadout[worn] = null;
          Profile.save();
          s.msg += _t(". Лимит очков превышен — вещь снята");
        }
        onGearChanged();
        return changed();
      }
      if (d.swap) {
        const [kind, tier, dir] = d.swap.split(':'), pl = Bestiary.exchangePlan(kind, Number(tier), dir);
        if (!pl || !Profile.takeRes(kind, pl.from, pl.take)) return;
        Profile.addRes(kind, pl.to, pl.give);
        s.msg = _t("Обмен: {0} × {1} → {2} × {3}", [resLabel(kind, pl.from), pl.take, resLabel(kind, pl.to), pl.give]);
        return render();
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
  /* 1.6.0: список бестиария — сетка портретов с поиском и фильтрами; на узком экране карточка существа открывается отдельным экраном */
  const bestOrdered = (known) => [...Bestiary.ORDER.filter((x) => known.includes(x)), ...Bestiary.ORDER.filter((x) => !known.includes(x) && HexMap.SPAWN[x])];   // неизвестные — в конец (скрытых вроде щуки в списке нет)
  function bestVisible(s, known) {
    const q = (s.q || '').trim().toLowerCase();
    return bestOrdered(known).filter((id) => {
      const open = known.includes(id), m = Bestiary.MONSTERS[id];
      if (s.f === 'open' && !open) return false;
      if (s.f === 'locked' && open) return false;
      if (s.fam && (!open || m.family !== s.fam)) return false;
      if (q && !(open && m.name.toLowerCase().includes(q))) return false;   // закрытых по имени не ищем
      return true;
    });
  }
  function bestTiles(s, known) {
    const ids = bestVisible(s, known);
    if (!ids.length) return _t("<p class=\"hint\">Никого не нашлось — измените поиск или фильтр.</p>");
    return ids.map((id) => {
      const m = Bestiary.MONSTERS[id], open = known.includes(id);
      return open
        ? _t("<button type=\"button\" class=\"beast {0}\" data-species=\"{1}\" title=\"{3}\"><span class=\"beast-art\">{2}</span><b>{3}</b><small>открыт уровень {4}</small></button>", [s.sel === id ? 'on' : '', id, MonsterArt.has(id) ? MonsterArt.bust(id, Profile.maxTier(id)) : Figures.avatar('dragon', null), m.name, Profile.maxTier(id)])
        : _t("<div class=\"beast locked\" title=\"{2}\"><span class=\"beast-art sil\">{0}</span><b>???</b><small>{1}</small></div>", [MonsterArt.has(id) ? MonsterArt.bust(id, 1) : Figures.avatar('dragon', null), (() => { const z = HexMap.SPAWN[id].tiers, lo = z[0], hi = z[z.length - 1]; return lo === hi ? _t("зона {0}", [lo]) : _t("зоны {0}–{1}", [lo, hi]); })(), _t("Ещё не встречен")]);
    }).join('');
  }
  function bestControls(s, known) {
    const all = bestOrdered(known), fams = [...new Set(known.map((id) => Bestiary.MONSTERS[id].family))];
    const chips = [['all', _t("Все")], ['open', _t("Открытые")], ['locked', _t("Не открыты")]].map(([k, l]) => `<button type="button" class="bchip ${s.f === k ? 'on' : ''}" data-bfilter="${k}">${l}</button>`).join('');
    const bg = (typeof Art !== 'undefined' && Art.has('ui/bg-bag')) ? `--bagbg:url('${new URL(Art.url('ui/bg-bag'), location.href).href}');` : '';
    const scrollImg = typeof Art !== 'undefined' && Art.has('ui/card-scroll') ? `--scrollimg:url('${new URL(Art.url('ui/card-scroll'), location.href).href}');` : '';   // 1.7.6: свиток-картинка для списка семейств
    // 1.6.9: список семейств — на свитке пергамента (раньше — системный выпадающий список белого цвета)
    const pop = s.famOpen ? `<div class="fam-pop"><button type="button" class="fam-back" data-bfampick="0" aria-label="${_t("Закрыть")}"></button><div class="fam-scroll${scrollImg ? ' img' : ''}" style="${bg}${scrollImg}" role="listbox" aria-label="${_t("Семейство")}"><div class="fam-in"><b class="fam-title">${_t("Семейство")}</b>
      <button type="button" class="fam-item ${s.fam ? '' : 'on'}" role="option" data-bfamval="">${_t("Все семейства")}</button>${fams.map((f) => `<button type="button" class="fam-item ${s.fam === f ? 'on' : ''}" role="option" data-bfamval="${escText(f)}">${escText(f)}</button>`).join('')}</div></div></div>` : '';
    return `<div class="beast-ctl"><input type="search" class="beast-q" data-bq placeholder="${_t("Поиск по имени")}" value="${escText(s.q || '')}" aria-label="${_t("Поиск по имени")}">
      <div class="beast-chips">${chips}</div><button type="button" class="fam-btn" data-bfampick="1" aria-haspopup="listbox">${s.fam ? escText(s.fam) : _t("Все семейства")} <span aria-hidden="true">▾</span></button>${pop}
      <small class="hint beast-count">${_t("Открыто {0} из {1}", [known.length, all.length])}</small></div>`;
  }
  const bestNav = (s) => _t("<div class=\"beast-nav\"><button type=\"button\" data-bback=\"1\">‹ К списку</button><button type=\"button\" data-bstep=\"-1\" aria-label=\"Предыдущий\">‹</button><button type=\"button\" data-bstep=\"1\" aria-label=\"Следующий\">›</button></div>");

  // 1.7.5: в карточке существа у каждого ресурса — где ещё он выпадает (из уже встреченных видов).
  const alsoDrops = (kind, self, known) => {
    const o = Bestiary.sourcesOf(kind).filter((id) => id !== self && known.includes(id)).map((id) => Bestiary.MONSTERS[id].name);
    return o.length ? `<div class="bag-row"><small class="hint">${_t("Также выпадает у: {0}", [o.join(', ')])}</small></div>` : '';
  };
  const best = {
    html() {
      const s = st.best, known = Profile.species();
      if (!known.length) {
        return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Бестиарий\">{0}<div class=\"screen-body\">\n          <p class=\"hint\">Вы ещё не встретили ни одного существа. Выйдите за частокол деревни — существа, которых вы увидите на карте, попадут в бестиарий.</p></div></div>", [head(_t("Бестиарий"))]);
      }
      if (!s.sel || !known.includes(s.sel)) s.sel = Profile.data.monster.id in Bestiary.MONSTERS && known.includes(Profile.data.monster.id) ? Profile.data.monster.id : known[0];
      const maxT = Profile.maxTier(s.sel);
      s.tier = Math.max(1, Math.min(s.tier, maxT));
      const list = bestTiles(s, known);
      const m = Bestiary.MONSTERS[s.sel], sc = Bestiary.scaled(s.sel, s.tier);
      const art = MonsterArt.has(s.sel) ? MonsterArt.bust(s.sel, s.tier) : `<div class="dragon-art" style="--t:${tierColor(s.tier)}">${Figures.avatar('dragon', null)}</div>`;
      const drops = m.drops.map(([kind, chance, min, max]) => _t("<div class=\"bag-row\">{0}<span><b>{1}</b> · {2}% · {3} шт.</span></div>", [MonsterArt.resIcon(kind, s.tier), resLabel(kind, s.tier), Math.round(chance * 100), min === max ? min : min + '–' + max]) + alsoDrops(kind, s.sel, known)).join('');
      const coins = Math.round(m.coins * Balance.rewards.coinK * Tiers.PRICE_MULT[s.tier - 1]);
      const innate = Object.entries(sc.stats).filter(([, v]) => v > 0).map(([k, v]) => `<span class="chip">${fmtStat(k, v)}</span>`).join('') || _t("<span class=\"hint\">нет</span>");
      const onMap = !inBattle;
      const L = Profile.level(), myS = Gear.combine(Gear.combine(Gear.statsFor(Profile.gear(), Profile.level()), Factions.statsAt(Profile.data.faction || 'dwarf', Hero.tierFloat(L))), Runes.bonusForGear(Profile.gear()));
      const pWin = Combat.winChance({ max: Hero.baseHp(L) + myS.health, dmg: Hero.dmgMult(L), stats: myS }, { max: sc.hp, dmg: sc.dmg, stats: sc.stats, ai: sc.ai }, s.sel);
      const danger = { label: { easy: _t("Лёгкий"), even: _t("Равный"), hard: _t("Опасный"), deadly: _t("Смертельный") }[Combat.dangerBand(pWin)], pct: Math.round(pWin * 100) };
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Бестиарий\">{0}\n        <div class=\"screen-body two-col beast-layout\" data-view=\"{25}\"{1}><div class=\"beast-side\">{24}<div class=\"beast-list\">{2}</div></div>\n        <div class=\"beast-detail\" style=\"--t:{3}\">\n          {26}<div class=\"beast-hero\">{4}</div>\n          <h3 class=\"beast-name\">{5} {6}</h3><p class=\"hint\"><b>{7}.</b> {8}</p>\n          <div class=\"ability-box\"><b>Приём: {9}</b><span>{10}</span></div>\n          {11}\n          {12}<small class=\"hint\">Доступны цвета, которые вы встречали. Чем дальше от деревни, тем выше цвет.</small>\n          <div class=\"stat-list\"><div><span>ХП</span><b>{13}</b><small>здоровье существа</small></div><div><span>Уровень ИИ</span><b>{14}</b><small>глубина и точность ходов</small></div>{15}\n            <div><span>Опыт</span><b>+{16}</b><small>за победу на вашем уровне</small></div>\n            <div><span>Для вас</span><b>{17}</b><small>шанс победы ~{18}%</small></div></div>\n          <h3>Врождённые свойства</h3><div class=\"chips\">{19}</div>\n          <h3>Добыча</h3><div class=\"bag-row\"><span>Монеты: {20} (примерно)</span></div>{21}<div class=\"bag-row\"><span>Шанс {22}%: вещь, чаще обычная</span></div>\n          {23}\n        </div></div></div>", [head(_t("Бестиарий")), sceneStyle('hunter'), list, tierColor(s.tier), art, m.name, tierChip(s.tier), m.family, m.desc, Bestiary.ability(s.sel).name, Bestiary.ability(s.sel).desc, tameBox(s.sel), tierPicker(maxT, s.tier, 'tier'), sc.hp, sc.ai, sc.gearBudget ? _t("<div><span>Снаряжение</span><b>{0}</b><small>очков: доспехи и оружие</small></div>", [sc.gearBudget]) : '', Hero.xpReward(m, s.tier, Profile.level()), danger.label, danger.pct, innate, money(coins), drops, Math.round(Balance.rewards.itemChance * 100), onMap ? _t("<div class=\"reset\"><button type=\"button\" class=\"primary\" data-show=\"1\">Показать на карте</button></div>") : '', bestControls(s, known), s.view, bestNav(s)]);
    },
    click(b) {
      const s = st.best, d = b.dataset;
      if (d.species) { s.sel = d.species; s.tier = Math.min(s.tier, Profile.maxTier(s.sel)); s.view = 'card'; return render(); }
      if (d.bfampick !== undefined) { s.famOpen = d.bfampick === '1'; return render(); }
      if (d.bfamval !== undefined) { s.fam = d.bfamval; s.famOpen = false; s.view = 'list'; return render(); }
      if (d.bfilter) { s.f = d.bfilter; s.view = 'list'; return render(); }
      if (d.bback) { s.view = 'list'; return render(); }
      if (d.bstep) {   // соседнее открытое существо из текущего списка (поиск и фильтры учитываются)
        const known = Profile.species(), ids = bestVisible(s, known).filter((x) => known.includes(x)), k = ids.indexOf(s.sel);
        if (ids.length) { s.sel = ids[(k + Number(d.bstep) + ids.length) % ids.length]; s.tier = Math.min(s.tier, Profile.maxTier(s.sel)); }
        return render();
      }
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
        return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Добро пожаловать!\"><header><h2>Добро пожаловать!</h2></header>\n          <div class=\"screen-body\"{0}>\n            <p class=\"hint\">Мир «Грань»: Великий кристалл раскололся, и народы спорят за его осколки — камни на поле боя. Выберите герб фракции, за которую хотите играть. В обучении вы вели временного героя-гнома: выбор заменит его, и награды обучения останутся с вами.</p>\n            <div class=\"fac-crest-grid\">{1}</div>\n          </div></div>", [wscene, cards]);
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
      const startBtn = s.first ? _t("<div class=\"reset\">{1}<button type=\"button\" class=\"primary\" data-act=\"start\" {0}>Начать игру!</button></div>", [canStartGame() ? '' : 'disabled', canStartGame() ? '' : `<small class="start-why">${_t("Введите ник и выберите пол героя")}</small>`]) : '';
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
        if (typeof Tutorial !== 'undefined') { if (Tutorial.active) Tutorial.event('faction'); else Tutorial.maybeAutoStart(); }   // 1.5.4: народ выбран после учебного боя
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
        if (r.ok) ticketReward(r);
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

  // 1.7.1: прогноз погоды на сутки (восемь трёхчасовых блоков) и штормовое предупреждение; флаг на мельнице на карте краснеет в те же часы.
  const SKY_ICON = {
    clear: '<circle cx="12" cy="12" r="4.6" fill="#ffd36a"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" stroke="#ffd36a" stroke-width="1.7" stroke-linecap="round"/>',
    night: '<path d="M16.5 15.2A7.2 7.2 0 0 1 9 5.2a7.4 7.4 0 1 0 10.1 9.3 7.2 7.2 0 0 1-2.6.7z" fill="#cfd8ff"/>',
    cloudy: '<path d="M7 18.5h10.2a3.9 3.9 0 0 0 .5-7.8 5.6 5.6 0 0 0-10.7 1.3A3.3 3.3 0 0 0 7 18.5z" fill="#b8c3d6"/>',
    rain: '<path d="M7 14.5h10.2a3.6 3.6 0 0 0 .5-7.2 5.2 5.2 0 0 0-10 1.2A3 3 0 0 0 7 14.5z" fill="#9fb0c8"/><path d="M8.5 17l-1 3M12.5 17l-1 3M16.5 17l-1 3" stroke="#7fb4ff" stroke-width="1.7" stroke-linecap="round"/>',
    fog: '<path d="M4 9h14M6 13h14M4 17h12" stroke="#c9d3de" stroke-width="2.2" stroke-linecap="round"/>',
    storm: '<path d="M7 12.5h10.2a3.6 3.6 0 0 0 .5-7.2 5.2 5.2 0 0 0-10 1.2A3 3 0 0 0 7 12.5z" fill="#7d8aa6"/><path d="M12.8 12.5L9.6 18h2.8l-1.2 4 4.4-6.3h-2.8z" fill="#ffd84a"/>',
    downpour: '<path d="M7 12.5h10.2a3.6 3.6 0 0 0 .5-7.2 5.2 5.2 0 0 0-10 1.2A3 3 0 0 0 7 12.5z" fill="#6f7f9c"/><path d="M7.5 15l-1.4 5M11.5 15l-1.4 5M15.5 15l-1.4 5M19 15l-1.4 5" stroke="#5aa2ff" stroke-width="1.9" stroke-linecap="round"/>',
    thickfog: '<path d="M3.5 7h15M5.5 11h15M3.5 15h15M6 19h11" stroke="#e1e8ef" stroke-width="2.4" stroke-linecap="round"/>',
  };
  const millForecast = () => {
    if (!Sky.pref('weather')) return `<div class="sky-forecast"><h3>${_t("Погода на сутки")}</h3><p class="hint fc-note">${_t("Погода выключена в настройках (меню ☰ на карте): прогноза нет, непогода на игру не влияет.")}</p></div>`;
    const t = Sky.now(), fc = Sky.forecast(t, 8), w = Sky.warning(t);
    const hh = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':00'; };
    const cells = fc.map((b) => {
      const ic = b.kind === 'clear' && Sky.isNight(b.from + 5400000) ? 'night' : b.kind;
      return `<div class="fc-cell${b.severe ? ' sev' : ''}${b.current ? ' now' : ''}" title="${Sky.NAMES[b.kind]}"><b>${b.current ? _t("Сейчас") : hh(b.from)}</b>${typeof Art !== 'undefined' && Art.has('ui/wx-' + ic) ? `<img src="${Art.url('ui/wx-' + ic)}" alt="">` : `<svg viewBox="0 0 24 24" aria-hidden="true">${SKY_ICON[ic] || SKY_ICON.cloudy}</svg>`}<span>${Sky.NAMES[b.kind]}</span></div>`;
    }).join('');
    const nextSevere = fc.find((b) => b.severe && !b.current);
    const note = w ? (w.active ? _t("Штормовое предупреждение: {0} — идёт, ещё {1}", [Sky.NAMES[w.kind], Sky.span(w.left)]) : _t("Штормовое предупреждение: {0} через {1}", [Sky.NAMES[w.kind], Sky.span(w.minutes)]))
      : nextSevere ? _t("Ближайшие три часа спокойны. Дальше возможна непогода: {0}, с {1}", [Sky.NAMES[nextSevere.kind], hh(nextSevere.from)])
      : _t("Ближайшие сутки спокойны: сильной непогоды не ожидается");
    return `<div class="sky-forecast${w ? ' warn' : ''}"><h3>${_t("Погода на сутки")}</h3><div class="fc-row">${cells}</div><p class="hint fc-note">${w ? '⚠ ' : ''}${note}</p></div>`;
  };
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
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Мельница\">{0}\n        <div class=\"screen-body tavern-body mill-body\"{1}>\n          <div class=\"npc-row\"><span class=\"npc-portrait\">{2}</span>\n            <div class=\"npc-say\"><b>Мельник-мыш</b><p class=\"hint\">{3}</p></div></div>\n          {5}\n          <h3>Задания</h3><div class=\"cards\">{4}</div>\n        </div></div>", [head(_t("Мельница")), scene, portrait, s.msg || MOUSE_LINES[0], quests, millForecast()]);
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
  const lighthouseQuests = {
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

  // ---- 1.8.8: мини-игры смотрителя маяка («Обвал», «Пирамида»), жетоны и лавка жетонов ----
  const lhData = () => (Profile.data.lh = LHGames.clean(Profile.data.lh));
  // камни мини-игр — те же рисунки, что на боевом поле (GEM_SVG); особый камень помечен значком поверх
  const lhStone = (t, sp, extra) => (t < 0 ? '<i class="lh-hole"></i>' : `<i class="lh-stone${extra || ''}">${(typeof GEM_SVG !== 'undefined' && GEM_SVG[GEM_TYPES[t]]) || ''}${sp ? `<b class="lh-sp">${sp === 1 ? '✸' : '✦'}</b>` : ''}</i>`);
  // Уроки Бобра: поле 6×6 без новых камней, ходы ограничены; за первое прохождение — монеты и «способ»
  function lessonsBlock(s) {
    const lp = Profile.data.lessons = Lessons.clean(Profile.data.lessons);
    const rows = Lessons.LIST.map((l, i) => {
      const done = lp.done[l.id], open = Lessons.open(Profile.data, l.id);
      return `<div class="card quest-card ${done ? 'is-done' : ''}"><div class="card-body"><span class="item-title">${i + 1}. ${_t(l.name)}</span>
        <span class="item-foot">${done ? _t("Приём освоен") : open ? _t("Ходов: {0} · награда: {1}", [l.limit, money(l.coins)]) : _t("Откроется за поручение Бобра")}</span></div>
        <div class="card-act">${open ? `<button type="button" class="${done ? '' : 'primary'}" data-lesson="${l.id}">${done ? _t("Повторить") : _t("Учиться")}</button>` : ''}</div></div>`;
    }).join('');
    let play = '';
    const l = s.lesson && Lessons.byId(s.lesson);
    if (l) {
      const g = Lessons.game(lp, l.id), cells = [];
      for (let i = 0; i < 36; i++) cells.push(`<button type="button" class="lh-cell${s.lsSel === i ? ' sel' : ''}" data-lscell="${i}" ${g.won || g.failed ? 'disabled' : ''} aria-label="${_t("камень {0}", [i + 1])}">${lhStone(g.typ[i], 0)}</button>`);
      play = `<div class="lesson-play"><p class="hint"><b>${_t(l.name)}.</b> ${_t(l.text)}</p>
        <div class="arena-rank"><small>${_t("Ходов осталось: {0}", [g.left])}</small></div>
        <div class="lh-board">${cells.join('')}</div>
        ${g.won ? `<p class="hint">${_t("Получилось! Четвёрка собрана.")}</p>` : g.failed ? `<p class="hint">${_t("Не вышло. Камни падают вниз и сдвигаются вправо — попробуй другой обмен.")}</p>` : ''}
        ${s.lsMsg ? `<p class="hint">${s.lsMsg}</p>` : ''}
        <div class="arena-act"><button type="button" data-lesson-reset="${l.id}">${_t("Начать заново")}</button></div></div>`;
    }
    return `<div class="arena-act"><button type="button" data-open-login="1">${_t("Награда за заход")}</button></div><h3>${_t("Поручения Бобра")}</h3><p class="hint">${_t("Четвёрка — это дополнительный ход. Бобёр учит собирать её не только «в лоб»: тройка, затем каскад. Наградой за каждое поручение становится новый урок.")}</p><div class="cards">${questCards('library')}</div><h3>${_t("Уроки Бобра")}</h3><div class="cards">${rows}</div>${play}`;
  }
  // Шахматы с Бобром: партия хранится в Profile.data.chess (см. js/chess.js)
  const CH_GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  // фигура: рисунок из art/chess/ (w-k … b-p), если он есть, иначе символ шахматной фигуры
  const chPiece = (p) => {
    const w = Chess.isW(p), t = p.toLowerCase(), key = 'chess/' + (w ? 'w-' : 'b-') + t;
    if (typeof Art !== 'undefined' && Art.has(key)) return `<img class="ch-pic" src="${Art.url(key)}" alt="">`;
    return `<span class="${w ? 'cw' : 'cb'}">${CH_GLYPH[t]}\uFE0E</span>`;
  };
  const chTray = (list, white) => list.map((t) => `<i class="${white ? 'cw' : 'cb'}">${CH_GLYPH[t]}\uFE0E</i>`).join('');
  function chessBlock(s) {
    const cp = Profile.data.chess = Chess.clean(Profile.data.chess), g = cp.game;
    const T = (typeof Tiers !== 'undefined') ? Tiers.LIST : [];
    const lvName = (i) => (T[i] ? T[i].name : String(i + 1));
    const beaten = cp.first.filter(Boolean).length;
    const stats = _t("Побеждено уровней: {0} из {1} · побед {2}, ничьих {3}, поражений {4}", [beaten, Chess.NLEV, cp.wins.reduce((a, x) => a + x, 0), cp.draws.reduce((a, x) => a + x, 0), cp.losses.reduce((a, x) => a + x, 0)]);
    const pick = `<div class="ch-levels">${Array.from({ length: Chess.NLEV }, (_, i) => `<button type="button" class="ch-lv${cp.first[i] ? ' won' : ''}" style="--c:${T[i] ? T[i].color : '#888'};--ink:${T[i] ? T[i].ink : '#fff'}" data-chess-new="${i + 1}" title="${lvName(i)}"><b>${i + 1}</b><small>${lvName(i)}</small></button>`).join('')}</div>`;
    if (!g) return `<p class="hint">${_t("Бобёр играет чёрными и учится у лучших: сыграем? Вы — белые. Выберите уровень по цвету — от красного (самый лёгкий) до обсидианового. За первую победу на каждом уровне — монеты.")}</p>${pick}<p class="hint">${stats}</p>`;
    const { s: pos } = Chess.replay(g), st = Chess.status(pos), legal = Chess.legal(pos), sel = s.cSel;
    const last = g.moves.length ? g.moves[g.moves.length - 1] : '';
    const targets = sel !== undefined && sel !== null ? legal.filter((m) => m.from === sel).map((m) => m.to) : [];
    const boardArt = (typeof Art !== 'undefined' && Art.has('chess/sq-light') && Art.has('chess/sq-dark')) ? ` style="--sq-l:url('${Art.url('chess/sq-light')}');--sq-d:url('${Art.url('chess/sq-dark')}')"` : '';
    const cap = Chess.captured(pos), mlist = Chess.moveList(g);
    const hintCells = s.cHint ? [s.cHint.from, s.cHint.to] : [];
    const kingChk = st.check ? pos.b.indexOf(pos.turn === 'w' ? 'K' : 'k') : -1;
    const cells = [];
    for (let i = 0; i < 64; i++) {
      const p = pos.b[i], dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
      const hl = last && (i === Chess.sqOf(last.slice(0, 2)) || i === Chess.sqOf(last.slice(2, 4)));
      cells.push(`<button type="button" class="ch-cell${dark ? ' ch-d' : ''}${sel === i ? ' sel' : ''}${targets.includes(i) ? ' tgt' : ''}${hl ? ' last' : ''}${i === kingChk ? ' chk' : ''}${hintCells.includes(i) ? ' hint' : ''}" data-chcell="${i}" ${g.over || s.cThink ? 'disabled' : ''} aria-label="${Chess.sqName(i)}${p ? ' ' + CH_GLYPH[p.toLowerCase()] : ''}">${p ? chPiece(p) : ''}${i % 8 === 0 ? `<i class="ch-co ch-rk">${8 - Math.floor(i / 8)}</i>` : ''}${i >= 56 ? `<i class="ch-co ch-fl">${'abcdefgh'[i % 8]}</i>` : ''}</button>`);
    }
    let line;
    if (g.over) line = g.result === 'w' ? _t("Победа! Бобёр пожимает вам лапу.") : g.result === 'b' ? (st.why === 'mate' ? _t("Мат. Бобёр выиграл — попробуйте ещё раз.") : _t("Вы сдались. Бобёр великодушно предлагает реванш.")) : _t("Ничья.");
    else line = s.cThink ? _t("Бобёр думает…") : st.check ? _t("Вам шах!") : _t("Ваш ход (белые).");
    return `<p class="hint">${_t("Уровень: {0}. Ходов сыграно: {1}.", [lvName(g.level - 1), Math.ceil(g.moves.length / 2)])}</p>
      <div class="ch-tray">${chTray(cap.b, false)}${cap.diff > 0 ? `<b>+${cap.diff}</b>` : ''}</div>
      <div class="ch-board"${boardArt}>${cells.join('')}</div>
      <div class="ch-tray">${chTray(cap.w, true)}${cap.diff < 0 ? `<b>+${-cap.diff}</b>` : ''}</div>
      ${s.cPromo ? `<div class="ch-promo"><span>${_t("Превращение пешки:")}</span>${['q', 'r', 'b', 'n'].map((k) => `<button type="button" data-chpromo="${k}">${CH_GLYPH[k]}\uFE0E</button>`).join('')}</div>` : ''}
      <p class="hint ch-line">${line}${s.cMsg ? ' ' + s.cMsg : ''}</p>
      ${g.over ? `<div class="arena-act">${g.moves.length > 1 ? `<button type="button" data-chess-review="1">${_t("Разбор партии")}</button>` : ''}</div>${chessReview(s)}${pick}` : `<div class="arena-act"><button type="button" data-chess-hint="1" ${s.cThink ? 'disabled' : ''}>${_t("Подсказка")}${g.hints ? ' (' + g.hints + ')' : ''}</button>${g.moves.length ? `<button type="button" data-chess-undo="1" ${s.cThink ? 'disabled' : ''}>${_t("Вернуть ход")}</button>` : ''}${s.cConfirm ? `<button type="button" data-chess-resign="1">${_t("Да, сдаюсь")}</button><button type="button" data-chess-resign-no="1">${_t("Продолжить")}</button>` : `<button type="button" data-chess-resign-ask="1">${_t("Сдаться")}</button>`}</div>${s.cHint ? `<p class="hint ch-line">${_t("Подсказка: {0}", [s.cHint.text])}${g.hints === 1 ? ' ' + _t("Партия с подсказками не даёт награды за первую победу.") : ''}</p>` : ''}`}${mlist.length ? `<div class="ch-moves" aria-label="${_t("Ходы партии")}">${mlist.map((m) => `<span><b>${m.n}.</b> ${m.w} ${m.b}</span>`).join('')}</div>` : ''}<p class="hint">${stats}</p>`;
  }
  // разбор партии: самые заметные неточности игрока с лучшим ходом
  function chessReview(s) {
    const r = s.cReview; if (!r) return '';
    const bad = r.filter((x) => x.kind !== 'ok').sort((a, b) => b.loss - a.loss).slice(0, 5).sort((a, b) => a.n - b.n);
    const acc = r.length ? Math.round(100 * r.filter((x) => x.kind === 'ok').length / r.length) : 100;
    const rows = bad.map((x) => `<li>${_t("Ход {0}: вы сыграли {1}, сильнее было {2} — {3}", [x.n, x.played, x.best, x.kind === 'blunder' ? _t("зевок") : _t("неточность")])}</li>`).join('');
    return `<div class="ch-review"><p class="hint"><b>${_t("Разбор партии")}</b>: ${_t("точных ходов {0}%, ходов всего {1}.", [acc, r.length])}${bad.length ? '' : ' ' + _t("Замечаний нет — отлично сыграно!")}</p>${rows ? `<ul class="ch-bad">${rows}</ul>` : ''}</div>`;
  }
  function chessBob(s) {
    s.cThink = true;
    setTimeout(() => {
      const cp = Profile.data.chess = Chess.clean(Profile.data.chess);
      const r = Chess.bobMove(cp); s.cThink = false;
      chessAfter(s, cp);
      Profile.save(); if (Screens.isOpen) render();
    }, 450);
  }
  function chessAfter(s, cp) {
    const g = cp.game;
    if (g && g.over) { const r = Chess.settle(cp); if (r.coins) { Profile.addCoins(r.coins); s.cMsg = _t("Монеты: {0}", [money(r.coins)]); } }
  }
  function lhTabs(s) { return tabs([['quests', _t("Поручения")], ['games', _t("Игры")], ['shop', _t("Лавка жетонов")]], s.tab || 'quests'); }
  function lhFrame(inner) {
    const s = st.lighthouse;
    return `<div class="modal" role="dialog" aria-label="${_t("Маяк")}">${head(_t("Маяк"))}${lhTabs(s)}<div class="screen-body tavern-body mill-body"${sceneStyle('lighthouse')}>${s.msg ? `<div class="gear-toast">${s.msg}</div>` : ''}${inner}</div></div>`;
  }
  function lhGamesHtml() {
    const s = st.lighthouse, d = lhData(), day = Daily.today(), g = s.game;
    if (g) return g.kind === 'av' ? lhAvHtml(g) : lhPyHtml(g);
    const row = (k, text) => {
      const left = LHGames.left(d, k, day), can = LHGames.canPlay(d, k, day);
      return `<div class="card"><div class="card-body"><span class="item-title">${LHGames.GAME_NAME[k]()}</span><p class="hint">${text}</p>
        <p class="hint">${_t("Рекорд: {0}. Зачётных раундов сегодня: {1} из {2}. Билетов: {3}.", [d.best[k], left, LHGames.DAILY_PLAYS, d.tickets])}</p>
        <p class="hint">${_t("Жетоны: от 1 до 5 за раунд — от {0} очков и выше.", [LHGames.TIERS[k][0]])}</p>
        <div class="mc-act"><button type="button" class="primary" data-lhplay="${k}" ${can ? '' : 'disabled'}>${left > 0 ? _t("Играть") : d.tickets ? _t("Играть за билет") : _t("На сегодня всё")}</button></div></div></div>`;
    };
    return `${evBanner()}<p class="hint">${_t("Жетонов маяка: {0}. Игры дают только жетоны — на силу в бою они не влияют.", [d.tokens])}</p><div class="cards">
      ${row('av', _t("В шахте над полем 60 камней и больше нет. Меняйте соседние камни местами и собирайте линии: четыре в ряд дают взрывной камень ✸ (убирает соседей), пять — линейный ✦ (убирает строку или столбец). Запас кончится — раунд окончен."))}
      ${row('py', _t("Три шара — весом 1, 2 и 3, каждый бросается один раз. Выберите шар и нажмите стрелку у строки: он выбьет столько ящиков, каков его вес. Верхние падают вниз, три одного цвета в ряд исчезают сами."))}</div>
      <p class="hint">${_t("Раунд не сохраняется: если выйти раньше, засчитаются набранные очки.")}</p>`;
  }
  function lhResult(g) {
    if (!g.res) return '';
    return `<div class="gear-toast">${_t("Раунд окончен: {0} очков. Жетонов: +{1}.", [g.res.score, g.res.tokens])}${g.res.record ? ' ' + _t("Новый рекорд!") : ''}</div>`;
  }
  function lhAvHtml(g) {
    const a = g.s, cells = [];
    for (let i = 0; i < 36; i++) cells.push(`<button type="button" class="lh-cell${g.sel === i ? ' sel' : ''}" data-lhcell="${i}" ${a.done ? 'disabled' : ''} aria-label="${_t("камень {0}", [i + 1])}">${lhStone(a.typ[i], a.sp[i])}</button>`);
    return `${lhResult(g)}<p class="hint">${_t("Очки: {0} · ходов: {1} · камней в шахте: {2}{3}", [a.score, a.moves, a.reserve.length, a.shuffles < 3 ? ' · ' + _t("перемешиваний: {0}", [a.shuffles]) : ''])}</p>
      <div class="lh-board">${cells.join('')}</div>
      <div class="mc-act"><button type="button" data-lhquit="1">${a.done ? _t("К списку игр") : _t("Закончить раунд")}</button></div>`;
  }
  function lhPyHtml(g) {
    const a = g.s, rows = [];
    for (let rr = 0; rr < 6; rr++) {
      const row = 5 - rr, cells = [];
      for (let c = 0; c < 6; c++) cells.push(lhStone(a.typ[rr * 6 + c], 0, g.hit && g.hit.includes(rr * 6 + c) ? ' hit' : ''));
      const dis = a.done || !a.balls.includes(g.ball) ? 'disabled' : '';
      rows.push(`<div class="lh-row"><button type="button" data-lhthrow="L${row}" ${dis} aria-label="${_t("Бросить слева в строку {0}", [row + 1])}">▶</button><div class="lh-cells">${cells.join('')}</div><button type="button" data-lhthrow="R${row}" ${dis} aria-label="${_t("Бросить справа в строку {0}", [row + 1])}">◀</button></div>`);
    }
    const balls = [1, 2, 3].map((w) => `<button type="button" class="${g.ball === w ? 'on' : ''}" data-lhball="${w}" ${a.balls.includes(w) ? '' : 'disabled'}>${_t("Шар {0}", [w])}</button>`).join('');
    return `${lhResult(g)}<p class="hint">${_t("Очки: {0} · выбито ящиков: {1}", [a.score, a.knocked])}</p>
      <div class="tabs sub">${balls}</div><div class="lh-pyr">${rows.join('')}</div>
      <div class="mc-act"><button type="button" data-lhquit="1">${a.done ? _t("К списку игр") : _t("Закончить раунд")}</button></div>`;
  }
  const LH_ART = { ticket: 'items/ticket-lh', lamp: 'items/badge-lamp', shell: 'items/badge-shell', pearl: 'items/badge-pearl', frame: 'ui/frame-rope' };
  function lhShopHtml() {
    const d = lhData(), items = LHGames.SHOP.map((it) => {
      const have = !it.repeat && d.bought[it.id];
      const key = LH_ART[it.id], pic = key && typeof Art !== 'undefined' && Art.has(key) ? Art.icon(key) : '';       // картинки лавки (если нарисованы): docs/art-prompts-1.8.8.md
      return `<div class="card"><div class="card-body"><span class="item-title">${pic}${it.name()}</span><p class="hint">${it.desc()}</p>
        <div class="mc-act"><button type="button" ${have ? 'disabled' : ''} data-lhbuy="${it.id}">${have ? _t("Есть") : _t("Взять за {0} жет.", [it.cost])}</button></div></div></div>`;
    }).join('');
    return `<p class="hint">${_t("Жетонов маяка: {0}. Билетов: {1}.", [d.tokens, d.tickets])}</p><div class="cards">${items}</div>`;
  }
  function lhFinish(g) {
    if (g.res) return;
    const d = lhData(), r = LHGames.finish(d, g.kind, g.s.score);
    if (evNow().id === 'games' && r.tokens > 0) { d.tokens += 1; r.tokens += 1; }          // 1.8.9: «Неделя игр»
    g.res = { score: g.s.score, tokens: r.tokens, record: r.record };
    if (typeof Chron !== 'undefined' && r.record && g.s.score > 0) Profile.chron('lh', LHGames.GAME_NAME[g.kind]() + ' ' + g.s.score);
    Profile.save();
  }
  const lighthouse = {
    html() {
      const s = st.lighthouse, tab = s.tab || 'quests';
      if (tab === 'quests') return lighthouseQuests.html().replace('</header>', '</header>' + lhTabs(s));
      return lhFrame(tab === 'games' ? lhGamesHtml() : lhShopHtml());
    },
    click(b) {
      const s = st.lighthouse, d = b.dataset;
      if (d.tab) { s.tab = d.tab; s.msg = ''; if (d.tab !== 'games') s.game = null; return render(); }
      if (d.lhplay) {
        const dd = lhData(), k = d.lhplay;
        if (!LHGames.begin(dd, k, Daily.today())) { s.msg = _t("На сегодня раундов не осталось."); return render(); }
        s.msg = ''; s.game = { kind: k, s: k === 'av' ? LHGames.avNew((Date.now() & 0x7fffffff) | 1) : LHGames.pyNew((Date.now() & 0x7fffffff) | 1), sel: null, ball: 3, hit: null, res: null };
        Profile.save(); return render();
      }
      const g = s.game;
      if (d.lhquit && g) { lhFinish(g); s.game = null; s.msg = ''; return render(); }
      if (d.lhbuy) { const r = LHGames.buy(lhData(), d.lhbuy); s.msg = r.ok ? _t("Готово.") : r.why === 'poor' ? _t("Не хватает жетонов.") : r.why === 'full' ? _t("Билетов уже много.") : _t("Уже есть."); if (r.ok) Profile.save(); return render(); }
      if (!g) return questClick(b, 'lighthouse');
      if (d.lhcell !== undefined && g.kind === 'av') {
        const i = +d.lhcell;
        if (g.sel === null) g.sel = i;
        else if (g.sel === i) g.sel = null;
        else { const r = LHGames.avMove(g.s, g.sel, i); g.sel = r.ok ? null : i; if (g.s.done) lhFinish(g); }
        return render();
      }
      if (d.lhball && g.kind === 'py') { g.ball = +d.lhball; return render(); }
      if (d.lhthrow && g.kind === 'py') {
        const r = LHGames.pyThrow(g.s, +d.lhthrow.slice(1), d.lhthrow[0], g.ball);
        if (r.ok) { g.hit = null; const rest = g.s.balls; if (!rest.includes(g.ball)) g.ball = rest[rest.length - 1] || 0; if (g.s.done) lhFinish(g); s.msg = r.hit.length ? _t("Выбито: {0}{1}", [r.hit.length, r.chain ? _t(", цепочка: {0}", [r.chain]) : '']) : _t("Мимо."); }
        return render();
      }
    },
  };
  // Награда сундука — один раз за профиль (Profile.data.chestOpened): монеты, расходники и три части набора «Морской волк».
  // 1.8.7: ремонт бригантины (доски, паутина, лом и монеты любого цвета) → плавание на Затерянный остров
  const SHIP_COST = { coins: 1500, res: { splinter: 20, silk: 10, scrap: 8 } };
  const resAny = (kind) => Profile.resList().filter((r) => r.kind === kind).reduce((n, r) => n + r.n, 0);
  function takeResAny(kind, n) {
    for (const r of Profile.resList()) { if (r.kind !== kind || n <= 0) continue; const t = Math.min(r.n, n); Profile.takeRes(kind, r.tier, t); n -= t; }
  }
  function shipBlock() {
    const d = Profile.data;
    const sh = d.ship || {};
    if (sh.paid && !sh.fixed) {
      const n = sh.pulls || 0;
      return `<h3>${_t("Вытащить бригантину")}</h3><p class="hint">${_t("Материалы вложены, но корабль крепко сидит на мели. Нужны сильные звери — кабаны, лоси, носороги, леопарды, рыси: их упряжка стащит бригантину в воду. Побед над ними: {0} / 5.", [n])}</p><div class="mc-act"><button type="button" class="primary" data-pull="1"${n >= 5 ? '' : ' disabled'}>${_t("Стащить в море")}</button></div>`;
    }
    if (d.ship && d.ship.fixed) return `<h3>${_t("Бригантина на плаву")}</h3><p class="hint">${_t("Бригантина на воде. Можно плыть на Затерянный остров.")}</p><div class="mc-act"><button type="button" class="primary" data-sail="1">${_t("Отплыть на остров")}</button></div>`;
    const rows = Object.entries(SHIP_COST.res).map(([k, n]) => `${Bestiary.RESOURCES[k].name}: ${resAny(k)} / ${n}`).join('; ');
    const ok = d.coins >= SHIP_COST.coins && Object.entries(SHIP_COST.res).every(([k, n]) => resAny(k) >= n);
    return `<h3>${_t("Починить бригантину")}</h3><p class="hint">${_t("Если вернуть кораблю ход, он дойдёт до Затерянного острова. Нужно: {0}; монеты: {1} / {2}.", [rows, d.coins, SHIP_COST.coins])}</p><div class="mc-act"><button type="button" class="primary" data-repair="1"${ok ? '' : ' disabled'}>${_t("Починить")}</button></div>`;
  }
  const wreck = {
    html() {
      const scene = (typeof Art !== 'undefined' && Art.hasScene('wreck'))
        ? ` style="background-image:linear-gradient(180deg, rgba(14,14,20,.5), rgba(14,14,20,.85)), url('${Art.sceneUrl('wreck')}');background-size:cover;background-position:center"` : '';
      const base = _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Кораблекрушение\">{0}\n        <div class=\"screen-body tavern-body\"{1}>\n          <p class=\"hint\">Бригантина лежит на боку, мачта сломана, рваный парус бьётся на ветру. Рядом на песке стоит запертый сундук, а берег охраняет Капитан — бывший командир этого корабля. Победите его, и он оставит части морского набора.</p>\n        </div></div>", [head(_t("Бригантина")), scene]);
      return base.replace(/<\/div><\/div>\s*$/, shipBlock() + '</div></div>');
    },
    click(b) {
      const d = Profile.data;
      if (b.dataset.repair) {
        if (d.ship && d.ship.fixed) return;
        if (d.coins < SHIP_COST.coins || !Object.entries(SHIP_COST.res).every(([k, n]) => resAny(k) >= n)) return;
        if (!Profile.spend(SHIP_COST.coins)) return;
        for (const [k, n] of Object.entries(SHIP_COST.res)) takeResAny(k, n);
        d.ship = { paid: true, pulls: 0 }; Profile.save(); return changed();
      }
      if (b.dataset.pull) {
        if (!d.ship || !d.ship.paid || d.ship.fixed || (d.ship.pulls || 0) < 5) return;
        d.ship = { fixed: true }; Profile.chron('ship', 1); Profile.save(); return changed();
      }
      if (b.dataset.sail && d.ship && d.ship.fixed) { close(); MapView.enterIsland(); }
    },
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
    Profile.addCoins(R.coins); Profile.chron('chest', CHEST_KINDS[k].title);
    const names = [];
    for (const id of R.items) { const e = Gear.makeEntry(id, tier); Profile.addItem(e); names.push(Gear.item(e).name); }
    for (const [c, n] of Object.entries(R.cons)) { Profile.addConsumable(c, n); names.push(`${Gear.CONSUMABLES[c].name} ×${n}`); }
    if (R.egg) { Profile.addEgg(R.egg); names.push(Pets.EGGS[R.egg].name); }
    Profile.save();
    const wm = Profile.noteWorld('chest', k, tier).map((m) => ' ' + _t("<b>Медаль!</b> {0}", [Medals.nameFor(m.id)])).join('');   // 1.6.2
    return _t("Внутри: {0}, {1}.", [money(R.coins), names.join(', ')]) + wm;
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
        itemCard(it, _t("Скупит за: {0}", [money(junkOf(it))]), _t("<button type=\"button\" data-junk-item=\"{0}\">Продать</button>", [it.uid]))).join('')
        || _t("<p class=\"hint\">Продавать нечего (надетые вещи старьёвщик не берёт).</p>");
      const total = items.reduce((sum, it) => sum + junkOf(it), 0);
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
        Profile.addCoins(junkOf(it));
        s.msg = (() => { const n = (Profile.data.junkSold || 0), q = Quests.list(Profile.data, 'junker')[0], tail = q && q.accepted && !q.claimed && !q.done ? _t(" Для ключа уже {0} из {1}.", [q.value, q.goal]) : ''; return JUNKER_SALE[n % JUNKER_SALE.length].replace('%n', it.name) + tail; })();
        return changed();
      }
      if (d.junkAll) {
        const items = Profile.data.items.filter((e) => !Profile.equippedUid(e.uid)).map((e) => Gear.item(e));
        if (!items.length) return;
        let total = 0;
        for (const it of items) { Profile.removeItem(it.uid); total += junkOf(it); }
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
      } else if (s.tab === 'diary') {
        body = diaryBody();
      } else if (s.tab === 'scrolls') {
        // 1.6.6: свитки пишет Бобёр — из «своего» ресурса (Forge.OWN), за четверть цены свитка в монетах
        const cards = Forge.SCROLLS.map((k) => {
          const c = Gear.CONSUMABLES[k], stack = alchStack(2, k), fee = Math.round(consPrice(k) * 0.25);
          return `<div class="card" style="--t:#c9b48a">${itemIcon(k)}<div class="card-body"><span class="item-title">${c.name}</span><span class="item-foot">${c.desc}</span>
            <span class="item-foot">${_t("Нужно: 2 ресурса — {0} (цвет «{1}» или выше) + {2} за работу", [ownNames(k, Hero.tierFor(Profile.level())), Tiers.get(Math.max(1, Hero.tierFor(Profile.level()) - 1)).name, money(fee)])}${stack ? _t(" · возьму из запаса: {0} ({1})", [resLabel(stack.kind, stack.tier), stack.n]) : _t(" · <b class=\"warn\">подходящих ресурсов нет</b>")}</span></div>
            <div class="card-act"><button type="button" data-scroll-brew="${k}" ${stack && Profile.data.coins >= fee ? '' : 'disabled'}>${_t("Написать")}</button></div></div>`;
        }).join('');
        body = `${s.msg ? `<div class="gear-toast">${s.msg}</div>` : ''}<p class="hint">${_t("Бобёр пишет свитки из перьев и ракушек: принесите нужный ресурс и монеты за работу.")}</p><div class="card-list">${cards}</div>`;
      } else if (s.tab === 'chess') {
        body = `<div class="npc-row">${typeof Art !== 'undefined' && Art.has('chess/bob') ? `<span class="npc-portrait"><img src="${Art.url('chess/bob')}" alt=""></span>` : ''}<div class="npc-say"><b>${_t("Бобёр-хранитель")}</b></div></div>${chessBlock(s)}`;
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
          return _t("<div class=\"card story-card {0}\" style=\"--t:{1}\"><span class=\"icon-wrap\">{2}</span>\n            <div class=\"card-body\"><span class=\"item-title\">{3}{4} {5}</span><span class=\"item-foot\">{6}</span>\n              <span class=\"item-foot\">Где: {7}.{8}</span></div>\n            <div class=\"card-act\">{9}</div></div>", [got ? 'is-done' : '', tierColor(ch.tier), ch.species === 'dragon' ? Figures.avatar('dragon', null) : MonsterArt.bust((typeof Art !== 'undefined' && ch.final && Art.hasMonster('dragon-ancient')) ? 'dragon-ancient' : ch.species, ch.tier), got ? (typeof Art !== 'undefined' && Art.has('items/shard') ? `<img class="story-shard" src="${Art.url('items/shard')}" alt="✔"> ` : '✔ ') : '', ch.title, tierChip(ch.tier), ch.lore, ch.where, sleeping ? _t(" Спит, пока не собраны 4 осколка.") : '', got ? _t("<span class=\"badge done\">Осколок у вас</span>") : _t("<button type=\"button\" data-story-find=\"{0}\" {1}>На карте</button>", [ch.id, sleeping ? 'disabled' : ''])]);
        }).join('');
        let storyBlock = _t("<h3>Осколки Великого Сердца: {0}/4{1}</h3>\n          <p class=\"hint\">Самые крупные осколки достались стражам — сильнейшим существам своих земель. Стражи втрое крепче обычных и носят корону на карте.</p>\n          <div class=\"card-list\">{2}</div>", [Story.shards(story), Story.finished(story) ? _t(" · Сердцевина у вас — Грань цела!") : '', chapters]);
        const cyc = Story.cycle(story), newsList = Story.newsAll(story);
        storyBlock += (cyc ? `<p class="hint">${_t("Новый поход: {0}. Стражи крепче, награды больше.", [cyc])}</p>` : '')
          + (newsList.length ? `<h4>${_t("Вести из деревни")}</h4><ul class="story-news-list">${newsList.map((n) => `<li>${n}</li>`).join('')}</ul>` : '')
          + (Story.finished(story) ? `${typeof Art !== 'undefined' && Art.has('items/heart') ? `<img class="heart-pic" src="${Art.url('items/heart')}" alt="">` : ''}<p class="hint"><i>${Story.EPILOGUE}</i></p><button type="button" class="primary" data-story-new="1">${_t("Начать новый поход")}</button>` : '');
        body = _t("<div class=\"npc-row\"><span class=\"npc-portrait\">{0}</span>\n            <div class=\"npc-say\"><b>Бобёр-хранитель</b><p class=\"hint\">{1}</p></div></div>\n          {2}\n          <h3>Поручение дня</h3><div class=\"cards\"><div class=\"card quest-card {3}\">\n            <div class=\"card-body\"><span class=\"item-title\">Дежурный обход</span>\n              <span class=\"item-foot\">Победите сегодня в одном бою — бобёр щедро делится знаниями (и не только).</span>\n              <span class=\"item-foot quest-reward\">Награда: монеты и порция каменной пыли</span></div>\n            <div class=\"card-act\">{4}</div></div></div>\n          <p class=\"hint\">Поручение обновляется каждый день, в полночь по вашему времени.</p>\n          {5}", [portrait, s.msg || BEAVER_LINES[0], storyBlock, q.claimed ? 'is-done' : '', qAct, trainBlock]);
        body += lessonsBlock(s);
      }
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Библиотека\">{0}{1}\n        <div class=\"screen-body tavern-body\"{2}>{3}</div></div>", [head(_t("Библиотека")), tabs([['npc', _t("Бобёр")], ['beasts', _t("Бестиарий")], ['items', _t("Вещи")], ['medals', _t("Медали")], ['chess', _t("Шахматы")], ['scrolls', _t("Свитки")], ['diary', _t("Дневник")]], s.tab), scene, body]);
    },
    click(b) {
      const s = st.library, d = b.dataset;
      if (d.tab) { s.tab = d.tab; s.msg = ''; return render(); }
      if (d.libfilter) { s.filter = d.libfilter; return render(); }
      if (d.chessNew) {
        if (s.cThink) return;
        Chess.newGame(Profile.data.chess = Chess.clean(Profile.data.chess), +d.chessNew); s.cSel = null; s.cMsg = ''; s.cHint = null; s.cReview = null; s.cPromo = null; Profile.save(); return render();
      }
      if (d.chessHint) {
        const cp = Profile.data.chess = Chess.clean(Profile.data.chess); if (s.cThink) return;
        const h = Chess.hint(cp); if (h) { s.cHint = h; s.cSel = null; Profile.save(); } return render();
      }
      if (d.chessReview) { const g = (Profile.data.chess = Chess.clean(Profile.data.chess)).game; if (g) s.cReview = Chess.review(g); return render(); }
      if (d.chpromo) {
        const cp = Profile.data.chess = Chess.clean(Profile.data.chess), pr = s.cPromo; if (!pr || s.cThink || !cp.game || cp.game.over) return;
        s.cPromo = null; s.cSel = null; s.cHint = null; s.cMsg = '';
        const r = Chess.playerMove(cp, Chess.sqName(pr.from) + Chess.sqName(pr.to) + d.chpromo); Profile.save();
        if (r.ok && !cp.game.over) { render(); return chessBob(s); }
        chessAfter(s, cp); Profile.save(); return render();
      }
      if (d.chessUndo) { const cp = Profile.data.chess = Chess.clean(Profile.data.chess); if (!s.cThink && Chess.undo(cp)) { s.cSel = null; s.cHint = null; s.cPromo = null; s.cMsg = ''; Profile.save(); } return render(); }
      if (d.chessResignAsk) { s.cConfirm = true; return render(); }
      if (d.chessResignNo) { s.cConfirm = false; return render(); }
      if (d.chessResign) { s.cConfirm = false; const cp = Profile.data.chess = Chess.clean(Profile.data.chess); if (Chess.resign(cp)) { s.cMsg = ''; chessAfter(s, cp); Profile.save(); } return render(); }
      if (d.chcell !== undefined) {
        const cp = Profile.data.chess = Chess.clean(Profile.data.chess), g = cp.game; if (!g || g.over || s.cThink) return;
        const i = +d.chcell, { s: pos } = Chess.replay(g), legal = Chess.legal(pos);
        if (s.cSel !== undefined && s.cSel !== null && legal.some((m) => m.from === s.cSel && m.to === i)) {
          const m = legal.find((x) => x.from === s.cSel && x.to === i);
          if (m.promo) { s.cPromo = { from: s.cSel, to: i }; return render(); }     // выбор фигуры при превращении
          s.cSel = null; s.cMsg = ''; s.cHint = null;
          const r = Chess.playerMove(cp, Chess.mvStr(m)); Profile.save();
          if (r.ok && !cp.game.over) { render(); return chessBob(s); }
          chessAfter(s, cp); Profile.save(); return render();
        }
        s.cSel = pos.b[i] && Chess.isW(pos.b[i]) && s.cSel !== i && legal.some((m) => m.from === i) ? i : null;
        return render();
      }
      if (d.openLogin) { st.login.msg = ''; return open('login'); }
      if (d.accept || d.claim) return questClick(b, 'library');
      if (d.lesson) { s.lesson = d.lesson; s.lsSel = null; s.lsMsg = ''; Profile.data.lessons = Lessons.clean(Profile.data.lessons); if (!Lessons.open(Profile.data, d.lesson)) return; Lessons.start(Profile.data.lessons, d.lesson); Profile.save(); return render(); }
      if (d.lessonReset) { const lp = Profile.data.lessons = Lessons.clean(Profile.data.lessons); Lessons.start(lp, d.lessonReset); s.lsSel = null; s.lsMsg = ''; Profile.save(); return render(); }
      if (d.lscell !== undefined) {
        const lp = Profile.data.lessons = Lessons.clean(Profile.data.lessons), i = +d.lscell;
        if (!s.lesson) return;
        if (s.lsSel === undefined || s.lsSel === null) s.lsSel = i;
        else if (s.lsSel === i) s.lsSel = null;
        else {
          const r = Lessons.move(lp, s.lesson, s.lsSel, i);
          if (r.ok) {
            s.lsSel = null; s.lsMsg = '';
            if (r.coins) { Profile.addCoins(r.coins); s.lsMsg = _t("Приём освоен! Монеты: {0}", [money(r.coins)]); }
            Profile.save();
          } else { s.lsSel = i; s.lsMsg = _t("Так ничего не соберётся — выбери другую пару соседних камней."); }
        }
        return render();
      }
      if (d.libtier) { s.itemTier = Number(d.libtier); return render(); }
      if (d.diaryMake) { s.msg = diaryMake() ? _t("Бобёр вручил путевой дневник.") : _t("Не хватает монет или материалов."); return changed(); }
      if (d.scrollBrew) {
        const k = d.scrollBrew, stack = Forge.SCROLLS.includes(k) && alchStack(2, k), fee = Math.round(consPrice(k) * 0.25);
        if (!stack || Profile.data.coins < fee || !Profile.takeRes(stack.kind, stack.tier, 2)) return;
        Profile.spend(fee); Profile.addConsumable(k, 1);
        s.msg = _t("Готово: {0}", [Gear.CONSUMABLES[k].name]);
        return changed();
      }
      if (d.openBestiary) return open('best');
      if (d.claimDaily) {
        const r = Daily.claimLibrary();
        if (!r) return;
        s.msg = _t("Держи — {0} и порция каменной пыли. {1}", [_nn(r.coins, 'монета', 'монеты', 'монет'), BEAVER_LINES[1]]);
        return changed();
      }
      if (d.tutorial) { close(); Tutorial.start(true); return; }
      if (d.storyNew) { if (Story.newCycle(Profile.data.story)) { Profile.save(); MapView.reviveBosses(); s.msg = _t("Новый поход начался: стражи вернулись, и они стали крепче."); } return changed(); }
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
      // 1.6.2: строка про комплект раздела: награда за все медали раздела
      const groupLine = (key) => {
        const g = Medals.GROUPS[key], pr = Medals.groupProgress(key, earned), done = Medals.groupDone(key, earned);
        const bonus = Object.entries(g.bonus).map(([k, v]) => `+${v} ${Gear.STAT_NAMES[k] || k}`).join(', ');
        return `<p class="hint group-line ${done ? 'done' : ''}">${done ? '✓ ' : ''}${_t("Комплект «{0}»: {1}", [g.name, bonus])} — ${done ? _t("собран") : _t("осталось {0}", [pr.total - pr.done])}</p><p class="hint group-perk ${done ? 'done' : ''}">${_t("Умение «{0}»: {1}. Реликвия: {2}", [Medals.PERKS[key].name, Medals.PERKS[key].desc, Gear.item({ id: Medals.relicId(key), tier: 1 }).name])}</p>`;
      };
      const favLine = Profile.favMedals().length ? `<p class="hint">${_t("Избранные медали (видны рядом с именем героя): {0}", [Profile.favMedals().map((id) => Medals.nameFor(id)).join(', ')])}</p>` : `<p class="hint">${_t("Нажмите на полученную медаль и выберите «В избранное» — до трёх значков будут стоять рядом с именем героя.")}</p>`;
      const styleTiles = Medals.STYLE_ORDER.map((k) => {
        const mid = Medals.styleMedalId(k);
        return medalTile(mid, earnedFor(mid), level, 0, 1);
      });
      const collRows = Medals.collections().map((c) => {
        const n = Medals.collectionProgress(c, earned), done = n === c.species.length;
        return `<div class="coll-row ${done ? 'done' : ''}"><b>${c.family}</b> <span>${n} / ${c.species.length}</span> <small>${done ? '✓ ' : ''}${_t("+{0}% урона по семейству", [c.pct])}</small></div>`;
      }).join('');
      const dailyTiles = Medals.DAILY_MILESTONES.map((n) => { const mid = Medals.dailyMedalId(n); return medalTile(mid, earnedFor(mid), level, Math.min(n, Profile.dailyStreak()), n); });
      const drunkTiles = Medals.DRUNK_MILESTONES.map((n) => { const mid = Medals.drunkMedalId(n); return medalTile(mid, earnedFor(mid), level, Math.min(n, Profile.elixirsDrunk()), n); });
      const elixirTiles = Medals.ELIXIR_ORDER.map((k) => { const mid = Medals.elixirMedalId(k); return medalTile(mid, earnedFor(mid), level, 0, 1); });
      const secretTiles = Medals.SECRET_ORDER.map((k) => { const mid = Medals.secretMedalId(k); return medalTile(mid, earnedFor(mid), level, 0, 1); });
      const worldTiles = Medals.WORLD_ORDER.map((k) => {
        const mid = Medals.worldMedalId(k), w = Profile.worldStats();
        return medalTile(mid, earnedFor(mid), level, k === 'visit' ? Object.keys(w.visited).length : k === 'caches' ? w.caches : k === 'altars' ? w.altars : 0, k === 'visit' ? 12 : k === 'caches' ? 10 : k === 'altars' ? 5 : 4);
      });
      const body = _t("<p class=\"hint\">Все ваши медали — постоянные бонусы характеристик за первую победу над видом,\n          за вехи линий из 5 камней и за добивания заклинанием Удар. Нажмите на значок — увидите, за что дают медаль, и прогресс;\n          цветной тир-бейдж открывается, когда герой достигает нужного уровня.</p>\n        <h3>За первую победу ({0} / {1})</h3>{15}\n        <div class=\"medal-grid\">{2}</div>\n        <h3>За линии из 5 камней ({3} / {4})</h3>{16}\n        <p class=\"hint\">Собрано всего: {5}</p>\n        <div class=\"medal-grid\">{6}</div>\n        <h3>За добивания Ударом ({7} / {8})</h3>{17}\n        <p class=\"hint\">Добито Ударом всего: {9}</p>\n        <div class=\"medal-grid\">{10}</div>\n        <h3>Меткий стрелок ({11} / {12})</h3>{18}\n        <p class=\"hint\">Добито болтом или стрелой всего: {13}</p>\n        <div class=\"medal-grid\">{14}</div>\n        <h3>Стиль боя ({19} / {20})</h3>{21}\n        <p class=\"hint\">Выдаются один раз, за победу над обычным существом.</p>\n        <div class=\"medal-grid\">{22}</div>\n        <h3>Мир ({23} / {24})</h3>{25}\n        <div class=\"medal-grid\">{26}</div>\n        <h3>Испытание дня ({32} / {33})</h3>{34}\n        <p class=\"hint\">Победа в «Испытании дня» каждый день подряд. Серия сейчас: {35}</p>\n        <div class=\"medal-grid\">{36}</div>\n        <h3>Тайны ({28} / {29})</h3>{30}\n        <p class=\"hint\">Скрытые медали: условия не показываются.</p>\n        <div class=\"medal-grid\">{31}</div>\n        <h3>Коллекции семейств</h3>\n        <p class=\"hint\">Победите всех существ семейства — получите бонус к урону по нему.</p>\n        <div class=\"coll-list\">{27}</div>", [killTiles.filter((_, i) => earnedFor(Medals.killMedalId(Bestiary.ORDER[i]))).length, Bestiary.ORDER.length, killTiles.join(''), earned.filter((m) => m.id.startsWith('streak:')).length, Medals.STREAK_MILESTONES.length, Profile.data.medals.fiveStreaks, streakTiles.join(''), earned.filter((m) => m.id.startsWith('strike:')).length, Medals.STRIKE_MILESTONES.length, Profile.strikeKills(), strikeTiles.join(''), earned.filter((m) => m.id.startsWith('shot:')).length, Medals.SHOT_MILESTONES.length, Profile.shotKills(), shotTiles.join(''), groupLine('kill'), groupLine('streak'), groupLine('strike'), groupLine('shot'), earned.filter((m) => m.id.startsWith('style:')).length, Medals.STYLE_ORDER.length, groupLine('style'), styleTiles.join(''), earned.filter((m) => m.id.startsWith('world:')).length, Medals.WORLD_ORDER.length, groupLine('world'), worldTiles.join(''), collRows, earned.filter((m) => m.id.startsWith('secret:')).length, Medals.SECRET_ORDER.length, groupLine('secret'), secretTiles.join(''), earned.filter((m) => m.id.startsWith('daily:')).length, Medals.DAILY_MILESTONES.length, groupLine('daily'), Profile.dailyStreak(), dailyTiles.join('')])
        + `<h3>${_t("Алхимик ({0} / {1})", [earned.filter((m) => m.id.startsWith('elixir:')).length, Medals.ELIXIR_ORDER.length])}</h3>${groupLine('elixir')}<p class="hint">${_t("Выпейте в бою по одному эликсиру каждого вида.")}</p><div class="medal-grid">${elixirTiles.join('')}</div><h3>${_t("Выпито эликсиров ({0} / {1})", [earned.filter((m) => m.id.startsWith('drunk:')).length, Medals.DRUNK_MILESTONES.length])}</h3><p class="hint">${_t("Выпито в боях всего: {0}", [Profile.elixirsDrunk()])}</p><div class="medal-grid">${drunkTiles.join('')}</div>`;
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Стена доблести\">{0}\n        <div class=\"screen-body tavern-body\">{1}</div></div>", [head(_t("Стена доблести")), favLine + body]);
    },
    click() {},
  };

  const CHECKLIST_URL = 'https://claude.ai/artifact/QhG7ptvQJyXqygJj1Jh1RP';
    const withChecklist = (h) => h.replace('</ul>', () => '</ul>' + thanksHtml()).replace('<div class="test-x10">', '<div class="test-x10"><p class="hint"><a href="' + CHECKLIST_URL + '" target="_blank" rel="noopener">' + _t("Чек-лист проверки графики на телефоне и компьютере ↗") + '</a></p>');
// 1.8.9: благодарности помощникам; список пополняется вручную (сюда добавляют имена)
  const THANKS = [];
  const thanksHtml = () => `<p class="hint">${_t("Благодарим за помощь в создании игры:")}</p>${THANKS.length ? `<ul class="credits-list">${THANKS.map((n) => `<li>${String(n).replace(/</g, '&lt;')}</li>`).join('')}</ul>` : `<p class="hint">${_t("Со временем этот раздел заполнится именами.")}</p>`}`;
const credits = {
    html() {
      return withChecklist(_t("<div class=\"modal\" role=\"dialog\" aria-label=\"О разработчиках\">{0}\n        <div class=\"screen-body credits-body\">\n          <p class=\"hint\">Игру создали:</p>\n          <ul class=\"credits-list\">\n            <li>Воробьев Александр Сергеевич</li>\n            <li>Никифоренко Екатерина Эдуардовна</li>\n          </ul>\n          <p class=\"hint\">© 2026 Воробьев Александр Сергеевич, Никифоренко Екатерина Эдуардовна. Все права защищены.</p>\n          <div class=\"test-x10\">\n            <label class=\"switch\"><button type=\"button\" role=\"switch\" aria-checked=\"{1}\" data-testx10=\"1\" class=\"{2}\"><i></i></button>\n              <span><b>Тест: характеристики героя ×10</b> — {3}</span></label>\n            <label class=\"switch\"><button type=\"button\" role=\"switch\" aria-checked=\"{4}\" data-testspells=\"1\" class=\"{5}\"><i></i></button>\n              <span><b>Тест: все виды магии открыты</b> — {6}</span></label>\n            {7}\n            <p class=\"hint\">Награды за победы в этом режиме выдаются как обычно — удобно проверять добычу. Для проверки сильных персонажей: Сила, Здоровье, Броня и остальные характеристики, ХП и урон вашего героя умножаются на 10 (проценты упираются в обычные потолки). Не забудьте выключить.</p>\n          </div>\n        </div></div>", [head(_t("О разработчиках")), Profile.data.testX10 ? 'true' : 'false', Profile.data.testX10 ? 'on' : '', Profile.data.testX10 ? _t("включено") : _t("выключено"), Profile.data.testAllSpells ? 'true' : 'false', Profile.data.testAllSpells ? 'on' : '', Profile.data.testAllSpells ? _t("включено") : _t("выключено"), typeof inBattle !== 'undefined' && inBattle && typeof over !== 'undefined' && !over ? _t("<p class=\"hint warn\">Во время боя переключать нельзя.</p>") : '']));
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
  // 1.8.8: дневник питомца под карточкой питомца
  function diaryHtml(pet) {
    if (!pet) return '';
    const list = Profile.petDiaryTick().slice(-6).reverse();
    const rows = list.length ? list.map((e) => `<li><span class="jr-unk">${Chron.dateStr(e.t)}</span> ${e.s}</li>`).join('') : `<li class="jr-unk">${_t("Пока записей нет: питомец расскажет, чем занимался, когда вы вернётесь.")}</li>`;
    return `<h3>${_t("Дневник питомца")}</h3><ul class="jr-list">${rows}</ul>`;
  }
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
        petCard = _t("<div class=\"card\" style=\"--t:{0}\"><span class=\"icon-wrap pet-ico\">{1}</span>\n            <div class=\"card-body\"><span class=\"item-title\">{2} {3}</span>\n              <span class=\"item-foot\">ХП {4} · удар ≈ {5} · прочность {6}/{7}{8}</span></div></div>", [tierColor(pet.tier), petArt(pet), Pets.petDisplayName(pet.speciesId), colorChip(pet.tier), Math.round(pf.max * Pets.boardHp(pet)), Pets.petAttackAmount(pf), pet.durability, pet.maxDurability, (pet.fed > 0 ? _t(" · сыт ещё {0} {1}", [pet.fed, pet.fed === 1 ? _t("бой") : _t("боя")]) : '') + _t(" · ум {0}/100 · опыт {1}", [Pets.intellect(pet), pet.xp || 0]) + (Pets.battleReady(pet) ? '' : _t(" · ещё не готов к бою: позанимайтесь в «Уходе»")) + (pf.ability && typeof PET_ABILITIES !== 'undefined' && PET_ABILITIES.includes(pf.ability) && Bestiary.ability(Pets.donorOf(pet.speciesId)) ? _t(" · приём «{0}» (с ума {1})", [Bestiary.ability(Pets.donorOf(pet.speciesId)).name, 20]) : '')]);
        const sl = Pets.studyLeft(pet), canStudy = Pets.studyOpen(pet);
        const actCard = (k, title, foot, btn, dis, extra = '') => `<div class="card" style="--t:#8fc7a0"><div class="card-body"><span class="item-title">${title}</span><span class="item-foot">${foot}</span></div><div class="card-act"><button type="button" ${extra} ${dis ? 'disabled' : ''}>${btn}</button></div></div>`;
        const ACT_NAME = { study: _t("Учёба"), ball: _t("Игра с мячом"), hunt: _t("Поиск клада"), drill: _t("Дрессировка"), rest: _t("Отдых"), scout: _t("Разведка") };
        let studyCard;
        if (sl >= 0) studyCard = actCard('', ACT_NAME[pet.studyKind || 'study'], sl > 0 ? _t("Занят: ещё {0} мин.", [Math.ceil(sl / 60000)]) : _t("Занятие окончено — забирайте!"), _t("Забрать"), sl > 0, 'data-k-study="1"');
        else studyCard = actCard('', ACT_NAME.study, canStudy ? _t("3 минуты: ум растёт и без боёв (до {0} из 100).", [Pets.STUDY_CAP]) : _t("Дальше ум растёт только в боях."), _t("Начать"), !canStudy, 'data-k-act="study"')
          + actCard('', ACT_NAME.ball, _t("3 минуты: питомец бодр — удары сильнее на 25% в ближайшие 2 боя."), _t("Начать"), false, 'data-k-act="ball"')
          + actCard('', ACT_NAME.hunt, _t("5 минут: питомец найдёт клад — {0}.", [money(Pets.huntCoins(pet))]), _t("Начать"), false, 'data-k-act="hunt"')
          + actCard('', ACT_NAME.drill, _t("5 минут: ум выше на {0} в ближайшие 2 боя.", [Pets.DRILL_INT]), _t("Начать"), false, 'data-k-act="drill"')
          + actCard('', ACT_NAME.rest, _t("4 минуты: питомец отдыхает и возвращает 1 прочность."), _t("Начать"), pet.durability >= pet.maxDurability, 'data-k-act="rest"')
          + actCard('', ACT_NAME.scout, _t("8 минут: питомец принесёт 1–2 ресурса."), _t("Начать"), false, 'data-k-act="scout"')
          + (pet.streak ? `<p class="hint">${_t("Занятия подряд: {0} дн. На 3-й и 7-й день — бонус опыта.", [pet.streak])}</p>` : '');
        care = _t("<div class=\"card-list\">\n            <div class=\"card\" style=\"--t:#c9b48a\"><div class=\"card-body\"><span class=\"item-title\">Подлечить</span><span class=\"item-foot\">Возвращает всю прочность (питомец теряет её, когда бой проигран). {0}</span></div>\n              <div class=\"card-act\"><button type=\"button\" data-k-repair=\"1\" {1}>Подлечить</button></div></div>\n            {2}\n            <div class=\"card\" style=\"--t:{3}\"><div class=\"card-body\"><span class=\"item-title\">Обучение</span><span class=\"item-foot\">{4}</span></div>\n              <div class=\"card-act\"><button type=\"button\" data-k-train=\"1\" {5}>Обучить</button></div></div>\n          </div>", [rc ? _t("Цена: {0}", [money(rc)]) : _t("Прочность полная."), rc && Profile.data.coins >= rc ? '' : 'disabled', Pets.TREAT_ORDER.map((k) => { const T = Pets.TREATS[k], c = Pets.treatCost(pet, k), left = Pets.treatLeft(pet, k);
              return _t("<div class=\"card\" style=\"--t:#d9b26a\"><div class=\"card-body\"><span class=\"item-title\">{0}{1}</span><span class=\"item-foot\">{2} на {3} {4}. Цена {5}.</span></div>\n              <div class=\"card-act\"><button type=\"button\" data-k-treat=\"{6}\" {7}>Купить</button></div></div>", [T.name, left > 0 ? _t(" · ещё {0} {1}", [left, left === 1 ? _t("бой") : _t("боя")]) : '', T.desc, T.battles, T.battles === 2 ? _t("боя") : _t("боя"), money(c), k, Profile.data.coins >= c && !(left >= T.battles) ? '' : 'disabled']); }).join(''), tierColor(Math.min(10, pet.tier + 1)), tc ? _t("Питомец станет цвета «{0}»: больше ХП и удар. Цена: {1}", [Tiers.get(pet.tier + 1).name, money(tc)]) : _t("Выше цвета вашего героя питомца не обучить."), tc && Profile.data.coins >= tc ? '' : 'disabled']);
        care = care.replace('<div class="card-list">', '<div class="card-list">' + studyCard);
      }
      const eggTab = hatch || _t("<p class=\"hint\">Яйца редких питомцев падают с грифона, виверны и саламандры. Принесите яйцо — высидим здесь.</p>");
      const kt = s.tab || 'pet';
      const body = tipBox('kennel', _t("Три вкладки: «Питомец» — выбор спутника, «Уход» — корм, лакомства и ремонт, «Инкубатор» — высидеть яйцо редкого питомца (яйца падают с грифона, виверны и саламандры).")) + tabs([['pet', _t("Питомец")], ['care', _t("Уход")], ['egg', _t("Инкубатор") + (inc ? ' •' : '')]], kt) + (kt === 'care' ? care : kt === 'egg' ? eggTab.replace(_t("<h3>Инкубатор</h3>"), '') : choose.replace(/<h3>[^<]*<\/h3>/, '') + petCard + diaryHtml(pet));
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Питомник\">{0}\n        <div class=\"screen-body tavern-body\"{1}><div class=\"npc-row\"><span class=\"npc-portrait\">{2}</span>\n          <div class=\"npc-say\"><b>Смотрительница Ласка</b><p class=\"hint\">{3}</p></div></div>{4}</div></div>", [head(_t("Питомник")), sceneStyle('kennel'), npcPortrait('kennel-keeper', '#9a7a52', '#2a1a10'), s.msg || _t("Заходи, заходи. Домашний питомец — твой друг на всю жизнь; зверей из леса можно приручить после 25 побед над видом. Покормлю, подлечу, научу новому — всё за честную монету."), body]);
    },
    click(b) {
      const s = st.kennel, d = b.dataset, pet = Profile.pet();
      if (d.tab) { s.tab = d.tab; s.msg = ''; return render(); }
      const ht = Hero.tierFor(Profile.level());
      if (d.kChoose) { Profile.setPetChoice(d.kChoose); s.msg = d.kChoose === 'none' ? _t("Ладно, посидит дома.") : _t("Вот и славно, пойдёт с вами."); return changed(); }
      if (d.kHatch) { if (Profile.startHatch(d.kHatch, ht)) s.msg = _t("Яйцо в тепле. Приходи через несколько боёв."); return changed(); }
      if (d.kCollect) { const p = Profile.collectHatch(ht); if (p) s.msg = _t("{0} — твой!", [Pets.petDisplayName(p.speciesId)]) + " " + Story.PET_LINES.hatch; return changed(); }
      if (!pet) return;
      if (d.kAct) { if (Pets.studyStart(pet, Date.now(), d.kAct, Village.studyFactor(Profile.data.village))) s.msg = _t("Питомец занялся делом. Вернитесь через несколько минут."); Profile.save(); return changed(); }
      if (d.kStudy) {
        const r = Pets.studyCollect(pet, Hero.tierFor(Profile.level()));
        if (r) {
          if (r.kind === 'study') s.msg = _t("Урок усвоен: ум {0} → {1}.", [r.before, r.after]);
          else if (r.kind === 'ball') s.msg = _t("Набегался и бодр: удары сильнее на 25% в ближайшие 2 боя.");
          else if (r.kind === 'hunt') { Profile.addCoins(r.coins); s.msg = _t("Нашёл клад: {0}!", [money(r.coins)]); }
          else if (r.kind === 'drill') s.msg = _t("Выучил новое: ум выше на {0} в ближайшие 2 боя.", [Pets.DRILL_INT]);
          else if (r.kind === 'rest') s.msg = r.gain ? _t("Отдохнул: прочность +1.") : _t("Отдохнул, но прочность и так полная.");
          else { Profile.addRes(r.res.kind, r.res.tier, r.res.n); s.msg = _t("Принёс ресурс: {0} ×{1}.", [Bestiary.RESOURCES[r.res.kind].name, r.res.n]); }
          if (r.streakInfo && r.streakInfo.bonus) s.msg += ' ' + _t("Серия {0} дн.: бонус опыта +{1}!", [r.streakInfo.streak, r.streakInfo.bonus]);
        }
        Profile.save(); return changed();
      }
      if (d.kRepair) { const c = Pets.repairCost(pet); if (!c || !Profile.spend(c)) return; Pets.repair(pet); s.msg = _t("Как новенький! Прочность восстановлена."); Profile.save(); return changed(); }
      if (d.kTreat) { const k = d.kTreat, c = Pets.treatCost(pet, k); if (!Pets.TREATS[k] || !Profile.spend(c)) return; Pets.giveTreat(pet, k); s.msg = _t("{0}: питомец доволен!", [Pets.TREATS[k].name]); Profile.save(); return changed(); }
      if (d.kFeed) { const c = Pets.feedCost(pet); if (!Profile.spend(c)) return; Pets.feed(pet); s.msg = _t("Наелся — {0} будет бодрее.", [_nn(Pets.FEED_BATTLES, 'бой', 'боя', 'боёв')]); Profile.save(); return changed(); }
      if (d.kTrain) { const c = Pets.trainCost(pet, Hero.tierFor(Profile.level())); if (!c || !Profile.spend(c)) return; Pets.train(pet); s.msg = _t("Готово: теперь он цвета «{0}».", [Tiers.get(pet.tier).name]); Profile.save(); return changed(); }
    },
  };

  /* =============== АЛХИМИК (1.3.0): зелья из ресурсов =============== */
  // Ресурсы — любого вида, цвета героя или на цвет ниже; берётся подходящая стопка с наименьшим цветом.
  const RECIPES = [
    { out: 'potion', n: 2, res: 2 }, { out: 'elixir', n: 1, res: 2 }, { out: 'dust', n: 2, res: 2 }, { out: 'honeyjar', n: 1, res: 2 },
    { out: 'storm', n: 1, res: 3 }, { out: 'stoneskin', n: 1, res: 3 },
  ];
  // 1.6.6: у каждого расходника и эликсира свой ресурс (Forge.OWN): первым берётся «свой» вид, у которого на цвете есть источник; запасные — следом
  const alchStack = (need, out) => {
    const lo = Math.max(1, Hero.tierFor(Profile.level()) - 1), own = out ? Forge.ownList(out, Hero.tierFor(Profile.level())) : null;
    return Profile.resList().filter((r) => r.tier >= lo && r.n >= need && (!own || own.includes(r.kind)))
      .sort((a, b) => (own ? own.indexOf(a.kind) - own.indexOf(b.kind) : 0) || a.tier - b.tier || b.n - a.n)[0] || null;
  };
  const elixStack = (tier, kind) => {
    const own = kind ? Forge.ownList(kind, tier) : null;
    return Profile.resList().filter((r) => r.tier === tier && r.n >= Elixirs.need(tier) && (!own || own.includes(r.kind)))
      .sort((a, b) => (own ? own.indexOf(a.kind) - own.indexOf(b.kind) : 0) || b.n - a.n)[0] || null;
  };
  const ownNames = (key, tier) => Forge.ownList(key, tier).map((k) => Bestiary.RESOURCES[k].name).join(' / ');
  const alchFee = (rc) => Math.round(consPrice(rc.out) * 0.25 * rc.n);
  const alchemist = {
    html() {
      const s = st.alchemist;
      const lo = Math.max(1, Hero.tierFor(Profile.level()) - 1);
      const cards = RECIPES.map((rc, i) => {
        const c = Gear.CONSUMABLES[rc.out], stack = alchStack(rc.res, rc.out), fee = alchFee(rc);
        return _t("<div class=\"card\" style=\"--t:#8fd08a\">{0}<div class=\"card-body\"><span class=\"item-title\">{1} × {2}{3}</span><span class=\"item-foot\">{4}</span>\n            <span class=\"item-foot\">Нужно: {5} ресурса — {11} (цвет «{6}» или выше) + {7} за работу{8}</span></div>\n          <div class=\"card-act\"><button type=\"button\" data-brew=\"{9}\" {10}>Сварить</button></div></div>", [itemIcon(rc.out), c.name, rc.n, c.alchemy ? _t(" <span class=\"tag\" style=\"--c:#8fd08a\">только здесь</span>") : '', c.desc, rc.res, Tiers.get(lo).name, money(fee), stack ? _t(" · возьму из запаса: {0} ({1})", [resLabel(stack.kind, stack.tier), stack.n]) : _t(" · <b class=\"warn\">подходящих ресурсов нет</b>"), i, stack ? (Profile.data.coins >= fee ? '' : 'disabled data-why="coin"') : 'disabled data-why="res"', ownNames(rc.out, Hero.tierFor(Profile.level()))]);
      }).join('');
      const dd = Profile.data, ks = alchStack(3), kfee = 150, bs = Profile.resList().filter((r) => r.kind === 'shell' && r.n >= 2).sort((a, b) => a.tier - b.tier)[0], bfee = 400;
      let extra = '';
      if (!(dd.xkeys && dd.xkeys.emerald) && !(dd.xchests && dd.xchests.emerald)) {
        const nd = dd.backpack.dust || 0;
        extra += _t("<div class=\"card\" style=\"--t:#37c46a\"><div class=\"card-body\"><span class=\"item-title\">Живой ключ <span class=\"tag\" style=\"--c:#8fd08a\">только здесь</span></span><span class=\"item-foot\">Открывает изумрудный сундук у маяка. Нужно: 3 одинаковых ресурса + каменная пыль ×2 (есть {0}) + {1}{2}</span></div>\n          <div class=\"card-act\"><button type=\"button\" data-brew-key=\"1\" {3}>Сварить</button></div></div>", [nd, money(kfee), ks ? _t(" · возьму из запаса: {0}", [resLabel(ks.kind, ks.tier)]) : _t(" — подходящих ресурсов нет"), ks && nd >= 2 ? (dd.coins >= kfee ? '' : 'disabled data-why="coin"') : 'disabled data-why="res"']);
      }
      if (dd.diary && !dd.breath && !(dd.xchests && dd.xchests.obsidian)) {
        extra += _t("<div class=\"card\" style=\"--t:#4fa3d8\"><div class=\"card-body\"><span class=\"item-title\">Зелье подводного дыхания <span class=\"tag\" style=\"--c:#8fd08a\">по дневнику</span></span><span class=\"item-foot\">На один нырок к серебряному сундуку. Нужно: 2 ракушки одного цвета{0} + {1}</span></div>\n          <div class=\"card-act\"><button type=\"button\" data-brew-breath=\"1\" {2}>Сварить</button></div></div>", [bs ? _t(" (возьму из запаса: {0})", [resLabel(bs.kind, bs.tier)]) : _t(" — ракушек нет (выпадают из крабов и речных тварей)"), money(bfee), bs ? (dd.coins >= bfee ? '' : 'disabled data-why="coin"') : 'disabled data-why="res"']);
      }
      if (dd.breath) extra += _t("<p class=\"hint\">Зелье подводного дыхания готово — ныряйте у серебряного сундука.</p>");
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Алхимик\">{0}\n        <div class=\"screen-body tavern-body\"{1}><div class=\"npc-row\"><span class=\"npc-portrait\">{2}</span>\n          <div class=\"npc-say\"><b>Тётушка Жабка, алхимик</b><p class=\"hint\">{3}</p></div></div>\n          {4}\n          <div class=\"card-list\">{5}{6}</div>\n          <h3>Эликсиры</h3><p class=\"hint\">Эликсиры пьются в бою, в любой свой ход, бесплатно (ход не тратится): Сила — на один ход, перед ударом; Броня, Блок, Рикошет, Ярость и Хитрость — на 10 ходов; Жизнь, Камни и Превращение — сразу, раз в 3 хода. Нужно {7} одинаковых ресурса цвета эликсира и монеты за работу.</p>\n          {8}\n          <div class=\"card-list\">{9}</div></div></div>", [head(_t("Алхимик")), sceneStyle('alchemist'), npcPortrait('alchemist', '#6f8a4a', '#f2d24a'), s.msg || _t("Ква! Неси добычу — сварю такое, чего в Лавке не купишь."), tipBox('alchemist', _t("Здесь же варятся «Живой ключ» и зелье подводного дыхания — карточки появляются, когда они нужны по поручениям.")), extra, cards, Elixirs.need(1), tierPicker(Math.max(1, Hero.tierFor(Profile.level())), s.etier || 1, 'elix-tier'), Elixirs.ORDER.map((k) => {
            const et = s.etier || 1, res = elixStack(et, k), fee = Elixirs.price(et, k);
            return _t("<div class=\"card\" style=\"--t:{0}\">{1}<div class=\"card-body\"><span class=\"item-title\">{2}</span>\n              <span class=\"item-foot\">{3}. Нужно: {4} ресурса (цвет «{5}»){6} + {7}</span></div>\n              <div class=\"card-act\"><button type=\"button\" data-elix-brew=\"{8}\" {9}>Сварить</button></div></div>", [tierColor(et), Elixirs.icon(k, et), Elixirs.KINDS[k].name, Elixirs.describe(k, et), Elixirs.need(et), Tiers.get(et).name, res ? _t(" (возьму из запаса: {0})", [resLabel(res.kind, res.tier)]) : _t(" — нужен: {0}", [ownNames(k, et)]), money(fee), k, res ? (Profile.data.coins >= fee ? '' : 'disabled data-why="coin"') : 'disabled data-why="res"']);
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
        const et = s.etier || 1, res = elixStack(et, d.elixBrew), fee = Elixirs.price(et, d.elixBrew);
        if (!res || Profile.data.coins < fee || !Profile.takeRes(res.kind, res.tier, Elixirs.need(et))) return;
        Profile.spend(fee); Profile.addElixir(d.elixBrew, et, 1);
        s.msg = _t("Готово: {0}, цвет «{1}». Ква!", [Elixirs.KINDS[d.elixBrew].name, Tiers.get(et).name]);
        return changed();
      }
      if (d.brew === undefined) return;
      const rc = RECIPES[Number(d.brew)], stack = alchStack(rc.res, rc.out), fee = alchFee(rc);
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
        body = _t("<h3>Ваши лоты ({0}/{1})</h3><div class=\"card-list\">{2}</div><h3>Проданное</h3>{3}", [M.lots.length, Village.maxLots(Profile.data.village), lots, log]);
      } else if (s.tab === 'trader') {
        body = traderBody();
      } else {
        const assets = mkAssets(s.kind);
        const a = assets.find((x) => x.key === s.sel) || null;
        const list = assets.map((x) => `<button type="button" class="btile ${a && a.key === x.key ? 'on' : ''}" data-mk-pick="${x.key}" ${x.tier ? `style="--c:${tierColor(x.tier)}"` : ''}>${x.icon}<span>${x.name}${x.have > 1 ? ' × ' + x.have : ''}</span></button>`).join('') || _t("<p class=\"hint\">Здесь пока нечего выставить.</p>");
        let panel = _t("<p class=\"hint\">Выберите, что продать.</p>");
        if (a) {
          const n = s.kind === 'item' ? 1 : Math.min(a.have, s.qty === 'all' ? a.have : s.qty);
          const fair = Market.fairUnit(s.kind, a.key, a.entry, a.unit) * n, price = Math.max(1, Math.round(fair * s.mult)), fee = Market.fee(price, Village.feeRate(Profile.data.village));
          const qty = s.kind === 'item' ? '' : `<div class="qty-picker">${[1, 5, 10, 'all'].map((q) => `<button type="button" class="qs ${s.qty === q ? 'on' : ''}" data-mk-qty="${q}">${q === 'all' ? _t("все") : '×' + q}</button>`).join('')}</div>`;
          const prices = `<div class="qty-picker">${Market.PRICE_STEPS.map((m) => `<button type="button" class="qs ${s.mult === m ? 'on' : ''}" data-mk-mult="${m}">${money(Math.max(1, Math.round(fair * m)))}</button>`).join('')}</div>`;
          const full = (M.lots || []).length >= Village.maxLots(Profile.data.village);
          panel = _t("<div class=\"pick-detail\"><b>{0} × {1}</b>{2}\n            <p class=\"hint\">Цена за лот (справедливая — {3}):</p>{4}\n            <p class=\"hint\">{5}. Сбор за место: {6} — не возвращается.</p>\n            {7}\n            <div class=\"pick-act\"><button type=\"button\" class=\"primary\" data-mk-list=\"1\" {8}>Выставить за {9}</button></div></div>", [a.name, n, qty, money(fair), prices, Market.etaText(price, fair), money(fee), full ? _t("<p class=\"hint warn\">Не больше {0} лотов одновременно.</p>", [Village.maxLots(Profile.data.village)]) : '', !full && Profile.data.coins >= fee ? '' : 'disabled', money(price)]);
        }
        body = _t("<div class=\"tabs sub\">{0}</div>\n          <div class=\"two-col\"><div class=\"bag-grid\">{1}</div><div>{2}</div></div>\n          <p class=\"hint\">Надетые вещи не выставляются — сначала снимите их в оружейной.</p>", [MK_KINDS.map(([k, label]) => `<button type="button" class="${k === s.kind ? 'on' : ''}" data-mk-kind="${k}">${label}</button>`).join(''), list, panel]);
      }
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Торговые ряды\">{0}{1}\n        <div class=\"screen-body tavern-body\"{2}>{3}<p class=\"hint\">Здесь выставляют объявления о продаже. Пока покупатели — странствующие купцы: чем ближе цена к справедливой, тем быстрее купят. Когда у игры появится сервер, ваши лоты увидят другие игроки.</p>\n        {4}{5}</div></div>", [head(_t("Торговые ряды")), tabs([['lots', _t("Мои лоты")], ['sell', _t("Выставить")], ['trader', _t("Торговец")]], s.tab), sceneStyle('market'), typeof Art !== 'undefined' && Art.hasNpc('merchant') ? _t("<div class=\"npc-row\"><span class=\"npc-portrait\">{0}</span><div class=\"npc-say\"><b>Странствующий купец</b><p class=\"hint\">Присматриваюсь к объявлениям: чем справедливее цена, тем быстрее куплю.</p></div></div>", [Art.npcPortrait('merchant')]) : '', s.msg ? `<div class="gear-toast">${s.msg}</div>` : '', body]);
    },
    click(b) {
      const s = st.market, d = b.dataset;
      if (d.tab) { s.tab = d.tab; s.msg = ''; return render(); }
      if (d.trBuy) { const deal = traderBuy(d.trBuy); s.msg = deal ? _t("Обмен состоялся.") : _t("Не получилось: не хватает ресурсов."); return changed(); }
      if (d.mkKind) { s.kind = d.mkKind; s.sel = null; s.qty = 1; s.mult = 1; return render(); }
      if (d.mkPick) { s.sel = d.mkPick; s.msg = ''; return render(); }
      if (d.mkQty) { s.qty = d.mkQty === 'all' ? 'all' : Number(d.mkQty); return render(); }
      if (d.mkMult) { s.mult = Number(d.mkMult); return render(); }
      if (d.mkList) {
        const a = mkAssets(s.kind).find((x) => x.key === s.sel);
        const M = Profile.data.market;
        if (!a || M.lots.length >= Village.maxLots(Profile.data.village)) return;
        const n = s.kind === 'item' ? 1 : Math.min(a.have, s.qty === 'all' ? a.have : s.qty);
        const fair = Market.fairUnit(s.kind, a.key, a.entry, a.unit) * n, price = Math.max(1, Math.round(fair * s.mult)), fee = Market.fee(price, Village.feeRate(Profile.data.village));
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
      const blds = Object.entries(Unlocks.NEED).sort((a, b) => a[1] - b[1]).map(([id, n]) => _t("{0} — после {1}", [Unlocks.NAMES[id], _nn(n, 'победы', 'побед', 'побед')])).join('; ');
      const card = (t, body, art = '') => `<div class="card quest-card help-card"><div class="card-body"><span class="item-title">${t}</span>${art ? `<div class="help-art">${art}</div>` : ''}<span class="item-foot help-text">${body}</span></div></div>`;
      // 1.6.0: справка с картинками — камни, заклинания (плитки с иконками), вещи, питомец, эликсиры
      const gemsOf = (types, cls = '') => types.map((t) => `<span class="ha-gem ${cls}">${GEM_SVG[t]}</span>`).join('');
      const artBattle = `<span class="ha-ex">${gemsOf(['ruby', 'ruby', 'ruby'])}<small>${_t("3 камня — удар")}</small></span><span class="ha-ex">${gemsOf(['emerald', 'emerald', 'emerald', 'emerald'])}<small>${_t("4 и больше — ещё ход")}</small></span>`;
      const spellTiles = (typeof MAGICS !== 'undefined' && typeof Balance !== 'undefined' && typeof spellIconHtml === 'function')
        ? `<div class="help-spells">${Object.entries(Balance.spellUnlock).filter(([k]) => MAGICS[k]).sort((a, b) => a[1] - b[1]).map(([k, lv]) => `<div class="hs-tile" title="${String(MAGICS[k].tip || '').replace(/"/g, '&quot;')}"><span class="hs-ico">${spellIconHtml(k, 'help-' + k)}</span><b>${MAGICS[k].name}</b><small>${_t("с {0}-го уровня", [lv])}</small></div>`).join('')}</div>` : '';
      let artGear = '', artPet = '', artElix = '';
      try { artGear = Gear.itemsFor(Profile.data.faction).slice(0, 5).map((b) => `<span class="ha-ico">${itemIcon(b.type, '', b.id)}</span>`).join(''); } catch (err) { /* без картинок */ }
      try { const hp = Profile.homePet(); if (hp) artPet = `<span class="ha-ico big">${(typeof Art !== 'undefined' && Art.has('pets/' + hp.speciesId)) ? `<img src="${Art.url('pets/' + hp.speciesId)}" alt="">` : MonsterArt.bust(Pets.donorOf(hp.speciesId), hp.tier)}</span>`; } catch (err) { /* без картинок */ }
      try { artElix = [Elixirs.ORDER[0]].map((k) => `<span class="ha-ico">${Elixirs.icon(k, 4)}</span>`).join('') + ['potion', 'elixir', 'dust'].filter((k) => Gear.CONSUMABLES[k]).map((k) => `<span class="ha-ico">${itemIcon(k)}</span>`).join(''); } catch (err) { /* без картинок */ }
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Как играть\">{0}\n        <div class=\"screen-body tavern-body\"><p class=\"hint\">Короткая справка. Всё, что не открыто, игра подсказывает сама — по мере прохождения.</p><div class=\"cards\">\n        {1}\n        {2}\n        {3}\n        {4}\n        {5}\n        {6}\n        {7}\n        {8}\n        </div></div></div>", [head(_t("Как играть")), card(_t("Бой"), _t("Меняйте местами два соседних камня, чтобы собрать линию из трёх и больше камней одного цвета. Собранные камни бьют врага и копятся для заклинаний. Линия из четырёх и больше камней даёт дополнительный ход. Над ходом можно думать сколько угодно; при желании в меню включается «Таймер хода»: 30 секунд на ход, три пропуска подряд — и бой проигран. «Ур.» везде — уровень героя: у существа — на каком уровне бой идёт на равных, у вещи — с какого её можно надеть. Цвет задаёт десяток: цвет 4 — это уровни 31–40, новое существо этого цвета начинает с Ур.31 и растёт до Ур.40."), artBattle), card(_t("Заклинания"), _t("Кнопки магии — рядом с полем; цена указана в камнях разных цветов (подсказка — по нажатию или наведению). Новое заклинание в бою подсвечено, пока вы его не нажмёте."), spellTiles), card(_t("Снаряжение"), _t("Вещи надеваются в оружейной вашего дома. Лимит — очки снаряжения, они растут с уровнем. В дорогу берутся эликсиры, расходники и боеприпасы (кнопка «Сумка»)."), artGear), card(_t("Питомцы и яйца"), _t("Победив зверя достаточное число раз, его можно приручить. Питомник: выбор спутника, уход и инкубатор. Яйца редких питомцев падают с грифона, виверны и саламандры."), artPet), card(_t("Эликсиры и зелья"), _t("Алхимик варит зелья и эликсиры из добытых ресурсов. Эликсиры пьются в бою в любой свой ход и ход не тратят: одни действуют 10 ходов, Сила — один ход, остальные мгновенные (Жизнь, Камни, Превращение) — раз в 3 хода. Боевые расходники лечат и усиливают прямо в бою."), artElix), card(_t("Задания"), _t("У трактирщика, мельника, тюленя на маяке и старьёвщика есть поручения с наградами. Строка «Следующая цель» внизу карты подскажет, что делать сейчас.")), card(_t("Сундуки побережья"), _t("На восточном и западном берегу стоят цветные сундуки. Ключи — за поручения тюленя, старьёвщика и алхимика. Серебряный сундук на дне открывается после трёх цветных.")), card(_t("Когда что открывается"), _t("Здания открываются по числу побед: {0}. Остальные доступны сразу.", [blds]))]);
    },
    click() {},
  };
  /* =============== УЛУЧШЕНИЯ ДЕРЕВНИ И ГАРДЕРОБ (1.5.1) =============== */
  // 1.7.0: оборона деревни в осаде растёт с уровнем Ратуши
  const siegeLine = () => {
    const L = Village.lvl(Profile.data.village, 'hall'), D = Siege.defense(L), N = Siege.defense(Math.min(Village.MAX, L + 1));
    return `<p class="hint">${_t("Оборона от осады (Ратуша {0}): башни снимают {1}% ХП с врага перед боем, осада длится {2} мин., унесут не больше {3}% добычи. Следующий уровень Ратуши: {4}% / {5} мин. / {6}%. Осада приходит раз в сутки.", [L, Math.round(D.volley * 100), D.minutes, Math.round(D.theft * 100), Math.round(N.volley * 100), N.minutes, Math.round(N.theft * 100)])}</p>`;
  };
  /* =============== 1.8.9: промыслы, дом, почта, странствующий торговец (js/crafts.js, decor.js, mail.js, trader.js) =============== */
  const evNow = () => Events.current(Date.now(), new Date().getTimezoneOffset());
  const evBanner = () => { const e = evNow(); return `<p class="event-week"><b>${_t("Событие недели: {0}", [e.name()])}</b> — ${e.desc()}.</p>`; };
  const craftsState = () => (Profile.data.crafts = Crafts.clean(Profile.data.crafts));
  const decorState = () => (Profile.data.decor = Decor.clean(Profile.data.decor));
  const mailState = () => (Profile.data.mail = Mail.clean(Profile.data.mail));
  const traderState = () => (Profile.data.trader = Trader.clean(Profile.data.trader));
  const unitP = () => Math.max(1, Profile.consumablePrice('potion'));
  const hm = (ms) => { const m = Math.ceil(ms / 60000), h = Math.floor(m / 60); return h ? _t("{0} ч {1} мин", [h, m % 60]) : _t("{0} мин", [m]); };
  function mailCtx() {
    const d = Profile.data;
    return { wins: d.wins || 0, level: Profile.level(), battles: (d.stats && d.stats.battles) || 0, medals: Profile.medals().length, pet: !!d.pet, trophies: typeof RareHunt !== 'undefined' ? RareHunt.trophyCount(d) : 0, decor: Decor.ownCount(decorState()), puzzle: (d.puzzle && d.puzzle.total) || 0, dungeon: (d.tower && d.tower.best) || 0 };
  }
  function mailSync() { const m = mailState(); const fresh = Mail.sync(m, mailCtx(), Date.now()); if (fresh.length) Profile.save(); return m; }
  function giftText(g) {
    const parts = [];
    if (g.p) parts.push(money(g.p * unitP()));
    for (const [k, n] of Object.entries(g.cons || {})) parts.push(`${Gear.CONSUMABLES[k].name} × ${n}`);
    return parts.join(', ');
  }
  function giveGift(g) { if (g.p) Profile.addCoins(g.p * unitP()); for (const [k, n] of Object.entries(g.cons || {})) Profile.addConsumable(k, n); }
  function craftReward(id) {
    const r = Crafts.reward(id, unitP(), Hero.tierFor(Profile.level()));
    if (evNow().id === 'craft') { if (r.coins) r.coins = Math.round(r.coins * Events.mul('craft', 'craft')); if (r.res) r.res = [r.res[0], r.res[1], r.res[2] + 1]; }
    return r;
  }
  function craftRewardText(id) {
    const r = craftReward(id);
    if (r.coins) return money(r.coins);
    if (r.res) return `${Bestiary.RESOURCES[r.res[0]].name} × ${r.res[2]}`;
    return `${Gear.CONSUMABLES[r.cons[0]].name} × ${r.cons[1]}`;
  }
  function craftsBody() {
    const c = craftsState(), now = Date.now(), day = Daily.today();
    const cards = Crafts.IDS.map((id) => {
      const J = Crafts.JOBS[id], cost = Crafts.cost(id, unitP()), left = Crafts.left(c, id, day);
      let foot = `${J.desc()}<br>${_t("Вложить: {0} · вернётся: {1} · время: {2} ч · сборов сегодня осталось: {3}", [money(cost), craftRewardText(id), J.hours, left])}`, act;
      if (Crafts.ready(c, id, now)) act = `<button type="button" class="primary" data-cr-take="${id}">${_t("Забрать")}</button>`;
      else if (Crafts.running(c, id)) { act = `<button type="button" disabled>${_t("Ещё {0}", [hm(Crafts.msLeft(c, id, now))])}</button>`; }
      else if (left <= 0) act = `<button type="button" disabled>${_t("До завтра")}</button>`;
      else act = `<button type="button" ${Profile.data.coins >= cost ? '' : 'disabled'} data-cr-start="${id}">${_t("Начать")}</button>`;
      return `<div class="card" style="--t:#c9b48a"><div class="card-body"><span class="item-title">${J.name()}</span><span class="item-foot">${foot}</span></div><div class="card-act">${act}</div></div>`;
    }).join('');
    return `${evBanner()}<p class="hint">${_t("Поставили дело — можно заниматься другим, а потом вернуться и забрать. Идёт и тогда, когда игра закрыта.")}</p><div class="card-list">${cards}</div>`;
  }
  function homeBody() {
    const d = decorState();
    const slotTile = (sl) => { const id = d.put[sl], it = id && Decor.BY_ID[id]; return `<div class="home-slot${it ? ' on' : ''}"><span class="hs-ic">${it ? it.icon : '＋'}</span><b>${Decor.SLOT_NAME[sl]()}</b><small>${it ? it.name() : _t("пусто")}</small>${it ? `<button type="button" data-dc-clear="${sl}">${_t("Убрать")}</button>` : ''}</div>`; };
    const row = (it) => {
      const own = Decor.owns(d, it.id), on = d.put[it.slot] === it.id;
      const act = own ? (on ? `<button type="button" disabled>${_t("Стоит")}</button>` : `<button type="button" data-dc-put="${it.id}">${_t("Поставить")}</button>`)
        : `<button type="button" ${Profile.data.coins >= it.price ? '' : 'disabled'} data-dc-buy="${it.id}">${_t("Купить")}: ${money(it.price)}</button>`;
      return `<div class="card" style="--t:#c9b48a"><div class="card-body"><span class="item-title">${it.icon} ${it.name()}${on ? ' ✓' : ''}</span><span class="item-foot">${Decor.SLOT_NAME[it.slot]()}</span></div><div class="card-act">${act}</div></div>`;
    };
    const tr = Decor.trophies(Profile.data).map((t) => { const m = Bestiary.MONSTERS[t.id]; return `<li>${m ? m.name : t.id} × ${t.n}</li>`; }).join('');
    return `<p class="hint">${_t("Украшения силу не дают — это просто красиво. Заполнены места: {0} из 6; украшений в коллекции: {1}. Все шесть мест — титул «Хозяин дома», десять украшений — «Коллекционер».", [Decor.filled(d), Decor.ownCount(d)])}</p>
      <div class="home-slots">${Decor.SLOTS.map(slotTile).join('')}</div>
      <h3>${_t("Зал трофеев")}</h3>${tr ? `<ul class="arena-list">${tr}</ul>` : `<p class="hint">${_t("Пока пусто. Редкие звери, которые раз в неделю бродят по карте, оставляют трофеи.")}</p>`}
      <h3>${_t("Украшения")}</h3><div class="card-list">${Decor.ITEMS.map(row).join('')}</div>`;
  }
  function mailBody() {
    const m = mailSync(), esc2 = (x) => String(x).replace(/</g, '&lt;');
    const list = m.box.slice().reverse().map((e) => {
      const l = Mail.BY_ID[e.id], g = l.gift, wasNew = !e.read;
      return `<div class="card letter${wasNew ? ' new' : ''}" style="--t:#c9b48a"><div class="card-body"><span class="item-title">${esc2(l.subject())}</span><span class="item-foot"><i>${esc2(l.from())}</i><br>${esc2(l.body())}${g ? `<br>${_t("Подарок: {0}", [giftText(g)])}` : ''}</span></div>${g ? `<div class="card-act">${e.claimed ? `<button type="button" disabled>${_t("Получено")}</button>` : `<button type="button" class="primary" data-ml-claim="${e.id}">${_t("Забрать")}</button>`}</div>` : ''}</div>`;
    }).join('');
    for (const e of m.box) e.read = true;                       // открытая вкладка — все письма прочитаны (подарки остаются)
    return `<p class="hint">${_t("Письма от жителей деревни и от самой игры. Письма между игроками появятся, когда у игры будет сервер.")}</p><div class="card-list">${list || `<p class="hint">${_t("Писем пока нет.")}</p>`}</div>`;
  }
  function traderBody() {
    const now = Date.now(), at = Trader.at(now, new Date().getTimezoneOffset()), T = Trader.sync(traderState(), at.cycle);
    if (!at.active) {
      const when = new Date(at.nextAt).toLocaleDateString(typeof I18N !== 'undefined' && I18N.lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'long' });
      return `<p class="hint">${_t("Странствующий торговец появляется раз в десять дней и стоит два дня. Следующий приход — {0}. Он меняет редкие товары на ресурсы: копите шкуры, кости и руду.", [when])}</p>`;
    }
    const pools = { runes: Object.keys(Runes.CATALOG), eggs: Object.keys(Pets.EGGS), res: Object.keys(Bestiary.RESOURCES) };
    const nameOf = (g) => g.type === 'rune' ? Runes.CATALOG[g.id].name : g.type === 'egg' ? Pets.EGGS[g.id].name : Gear.CONSUMABLES[g.id].name;
    const rows = Trader.stock(at.cycle, pools).map((deal) => {
      const have = resAny(deal.give.kind), can = have >= deal.give.n && Trader.canBuy(T, deal.id);
      const act = !Trader.canBuy(T, deal.id) ? `<button type="button" disabled>${_t("Продано")}</button>` : `<button type="button" ${can ? '' : 'disabled'} data-tr-buy="${deal.id}">${_t("Обменять")}</button>`;
      return `<div class="card" style="--t:#c9b48a"><div class="card-body"><span class="item-title">${nameOf(deal.get)}${deal.get.n > 1 ? ' × ' + deal.get.n : ''}</span><span class="item-foot">${_t("Отдать: {0} × {1} (любого цвета) · у вас: {2}", [Bestiary.RESOURCES[deal.give.kind].name, deal.give.n, have])}</span></div><div class="card-act">${act}</div></div>`;
    }).join('');
    return `<p class="hint">${_t("Торговец у ворот до {0}. Каждый товар — один раз за визит.", [new Date(at.endsAt).toLocaleDateString(typeof I18N !== 'undefined' && I18N.lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'long' })])}</p><div class="card-list">${rows}</div>`;
  }
  function traderBuy(id) {
    const at = Trader.at(Date.now(), new Date().getTimezoneOffset()); if (!at.active) return null;
    const T = Trader.sync(traderState(), at.cycle);
    const deal = Trader.stock(at.cycle, { runes: Object.keys(Runes.CATALOG), eggs: Object.keys(Pets.EGGS), res: Object.keys(Bestiary.RESOURCES) }).find((x) => x.id === id);
    if (!deal || !Trader.canBuy(T, id) || resAny(deal.give.kind) < deal.give.n) return null;
    takeResAny(deal.give.kind, deal.give.n); Trader.mark(T, id);
    const g = deal.get;
    if (g.type === 'rune') Profile.addRune(g.id, g.n); else if (g.type === 'egg') Profile.addEgg(g.id); else Profile.addConsumable(g.id, g.n);
    Profile.save(); return deal;
  }

  const village = {
    html() {
      const s = st.village, V = Profile.data.village || {}, C = Profile.data.cosmetics, ht = Hero.tierFor(Profile.level());
      const card = (title, foot, act = '', color = '#c9b48a') => `<div class="card" style="--t:${color}"><div class="card-body"><span class="item-title">${title}</span><span class="item-foot">${foot}</span></div>${act ? `<div class="card-act">${act}</div>` : ''}</div>`;
      let body;
      if (s.tab === 'build') {
        const cards = Village.IDS.map((id) => {
          const I = Village.INFO[id], n = Village.lvl(V, id), nx = Village.next(V, id, ht);
          const dots = '●'.repeat(n) + '○'.repeat(Village.MAX - n);
          const now = n ? I.perk(n) : _t("пока без улучшений");
          let act, foot = `${I.unit}<br>${_t("Сейчас")}: ${now}`;
          if (!nx) act = `<span class="hint">${_t("Максимум")}</span>`;
          else {
            foot += `<br>${_t("Дальше")}: ${I.perk(nx.level)}`;
            const can = nx.ok && Profile.data.coins >= nx.cost;
            act = `<button type="button" ${can ? '' : 'disabled'} data-vg-buy="${id}">${_t("Улучшить")}: ${money(nx.cost)}</button>`;
            if (!nx.ok) foot += `<br><span class="hint warn">${_t("Открывается с цвета «{0}»", [Tiers.get(nx.reqTier).name])}</span>`;
            else if (!can) foot += `<br><span class="hint warn">${_t("Не хватает монет")}: ${money(nx.cost - Profile.data.coins)}</span>`;
          }
          return card(`${I.name} <small>${dots}</small>`, foot, act);
        }).join('');
        body = `<p class="hint">${_t("Золото можно вложить в деревню: улучшения остаются навсегда. Уровень k открывается с цвета героя 2k, цена растёт вместе с добычей.")}</p>${siegeLine()}<div class="card-list">${cards}</div>`;
      } else if (s.tab === 'crafts') { body = craftsBody();
      } else if (s.tab === 'home') { body = homeBody();
      } else if (s.tab === 'mail') { body = mailBody();
      } else {
        const storyDone = !!(Profile.data.story && Profile.data.story.shards && Profile.data.story.shards.b5);
        const row = (kind, it) => {
          const own = Village.owns(C, kind, it.id), on = C[kind === 'titles' ? 'title' : 'frame'] === it.id;
          const locked = it.story && !storyDone;
          const act = own ? `<button type="button" data-vg-eq="${kind}:${on ? '' : it.id}">${on ? _t("Снять") : _t("Надеть")}</button>`
            : it.earn ? `<button type="button" disabled>${_t("Не получено")}</button>`
            : it.arena ? `<button type="button" disabled>${_t("Арена: {0}", [World.RANKS[it.arena]])}</button>`
            : it.season ? `<button type="button" disabled>${_t("Сезон арены: {0}", [World.RANKS[World.SEASON_TITLE_RANK]])}</button>`
            : `<button type="button" ${Profile.data.coins >= it.price && !locked ? '' : 'disabled'} data-vg-cos="${kind}:${it.id}">${_t("Купить")}: ${money(it.price)}</button>`;
          const swatch = it.color ? `<i class="frame-swatch" style="background:${it.color};box-shadow:0 0 8px ${it.color}"></i> ` : '';
          return card(`${swatch}${it.name}${on ? ' ✓' : ''}`, locked ? _t("Откроется после победы над Древним драконом") : own ? (it.arena || it.season ? _t("Получено на арене") : it.earn ? _t("Получено") : _t("Куплено")) : it.earn ? `${_t("Как получить")}: ${it.how}` : it.arena ? _t("Награда за ранг арены") : it.season ? _t("Награда за сезон арены") : '', act, it.color || '#c9b48a');
        };
        body = `<p class="hint">${_t("Титулы и рамки портрета силу не меняют — это просто красиво.")}</p>
          <h3>${_t("Титулы")}</h3><div class="card-list">${(() => {
            const grp = (t) => t.earn && (t.earn.decor || t.earn.decorOwn || t.earn.stones) ? _t("За дом") : t.arena || t.season ? _t("Арена") : !t.earn ? _t("Продаются в Гардеробе") : t.earn.group ? _t("За медали") : (t.earn.medal || t.earn.explore) ? _t("За мир") : t.earn.tier ? _t("По цвету героя") : _t("Редкие: боссы дальних земель");
            const groups = [];
            for (const t of Village.TITLES) { const g = grp(t); let G = groups.find((x) => x.g === g); if (!G) groups.push(G = { g, list: [] }); G.list.push(t); }
            return groups.map((G) => {
              const have = G.list.filter((t) => Village.owns(C, 'titles', t.id)).length;
              const open = titleOpen[G.g] !== undefined ? titleOpen[G.g] : have > 0;
              return `<details class="tgroup" data-g="${G.g}"${open ? ' open' : ''}><summary class="tgrp">${G.g} <small>${have} / ${G.list.length}</small></summary>${G.list.map((t) => row('titles', t)).join('')}</details>`;
            }).join('');
          })()}</div>
          <h3>${_t("Рамки портрета")}</h3><div class="card-list">${Village.FRAMES.map((f) => row('frames', f)).join('')}</div>`;
      }
      return `<div class="modal" role="dialog" aria-label="${_t("Улучшения деревни")}">${head(_t("Улучшения деревни"))}${tabs([['build', _t("Здания")], ['wardrobe', _t("Гардероб")], ['crafts', _t("Промыслы")], ['home', _t("Дом")], ['mail', Mail.unread(mailSync()) && s.tab !== 'mail' ? _t("Почта ({0})", [Mail.unread(mailState())]) : _t("Почта")]], s.tab)}
        <div class="screen-body tavern-body">${s.msg ? `<div class="gear-toast">${s.msg}</div>` : ''}${body}</div></div>`;
    },
    click(b) {
      const s = st.village, d = b.dataset;
      if (d.tab) { s.tab = d.tab; s.msg = ''; return render(); }
      if (d.crStart || d.crTake) {
        const c = craftsState(), now = Date.now(), day = Daily.today();
        if (d.crStart) {
          const cost = Crafts.cost(d.crStart, unitP());
          if (Profile.data.coins < cost) return;
          const r = Crafts.start(c, d.crStart, now, day);
          if (r.ok) { Profile.spend(cost); s.msg = _t("Дело поставлено: {0}", [Crafts.JOBS[d.crStart].name()]); Profile.save(); return changed(); }
          return;
        }
        const id = d.crTake, rw = craftReward(id);
        if (Crafts.collect(c, id, now, day).ok) {
          if (rw.coins) Profile.addCoins(rw.coins); else if (rw.res) Profile.addRes(rw.res[0], rw.res[1], rw.res[2]); else Profile.addConsumable(rw.cons[0], rw.cons[1]);
          s.msg = _t("Забрано: {0}", [craftRewardText(id)]); Profile.save(); return changed();
        }
        return;
      }
      if (d.dcBuy) { const dd = decorState(), it = Decor.BY_ID[d.dcBuy]; if (it && Decor.buy(dd, it.id, Profile.data.coins).ok) { Profile.data.coins -= it.price; s.msg = _t("Куплено и поставлено: {0}", [it.name()]); Profile.save(); return changed(); } return; }
      if (d.dcPut) { const dd = decorState(); if (Decor.put(dd, d.dcPut)) { Profile.save(); return render(); } return; }
      if (d.dcClear) { const dd = decorState(); if (Decor.clear(dd, d.dcClear)) { Profile.save(); return render(); } return; }
      if (d.mlClaim) { const g = Mail.claim(mailState(), d.mlClaim); if (g) { giveGift(g); s.msg = _t("Подарок получен: {0}", [giftText(g)]); Profile.save(); return changed(); } return; }
      if (d.vgBuy) {
        if (Profile.buyVillage(d.vgBuy)) { const I = Village.INFO[d.vgBuy]; s.msg = _t("Улучшено: {0} — {1}", [I.name, I.perk(Village.lvl(Profile.data.village, d.vgBuy))]); return changed(); }
        return;
      }
      if (d.vgCos) { const [kind, id] = d.vgCos.split(':'); if (Profile.buyCosmetic(kind, id)) { Profile.equipCosmetic(kind, id); s.msg = _t("Куплено и надето"); return changed(); } return; }
      if (d.vgEq) { const [kind, id] = d.vgEq.split(':'); Profile.equipCosmetic(kind, id || null); if (typeof onEconomyChanged === 'function') onEconomyChanged(); return render(); }
    },
  };

  /* =============== 1.5.4: АРЕНА — Арена теней и Испытание дня (World) =============== */
  // 1.7.4: награда за прошедший сезон выдаётся при входе в окно арены (один раз).
  function payPending(a) {
    const p = a.pending;
    if (!p) return;
    a.pending = null;
    Profile.addCoins(p.coins);
    let msg = _t("Итог сезона {0}: лучший ранг — {1}. Награда: {2}", [World.seasonLabel(p.season), World.RANKS[p.best], money(p.coins)]);
    if (p.title) {
      const C = Profile.data.cosmetics = Profile.data.cosmetics || Village.fresh();
      if (!C.titles.includes('seasonChamp')) { C.titles.push('seasonChamp'); msg += ' ' + _t("Титул «{0}» — в Гардеробе Ратуши", [Village.TITLES.find((t) => t.id === 'seasonChamp').name]); }
    }
    st.arena.msg = msg; Profile.save();
  }
  const duelOn = () => typeof Net !== 'undefined' && !!(Net.current && Net.current.remote && Net.current.remote.enabled);   // 1.9.x: вкладка «Игроки» только при подключении к серверу
  function arenaState() {
    const d = Profile.data, a = d.arena = Object.assign(World.freshArena(), d.arena || {});
    World.arenaSync(a, Daily.today(), Hero.tierFor(Profile.level()));
    payPending(a);
    if (!a.next) { a.next = World.shadow(a.rank, Profile.level()); a.next.nick = Names.randomStarName(); }
    return a;
  }
  function challengeState() {
    const d = Profile.data, day = Daily.today(), c = d.challenge = Object.assign(World.freshChallenge(), d.challenge || {});
    if (c.day !== day) { c.day = day; c.tries = 0; c.best = 0; }
    return c;
  }
  const runState = () => { const r = Profile.data.run = Run.clean(Profile.data.run); return r; };
  const arena = {
    html() {
      const s = st.arena;
      let body;
      if (s.tab === 'shadows') {
        const a = arenaState(), nx = a.next, F = Factions.get(nx.faction), rule = World.arenaRule(Daily.today());
        const rv = a.revenge, revLeft = World.REVENGE_DAILY - (a.revs || 0);
        const titles = Object.entries(World.RANK_TITLES).map(([r, id]) => `<li class="${a.best >= Number(r) ? 'ok' : ''}">${World.RANKS[r]} — «${Village.TITLES.find((t) => t.id === id).name}»</li>`).join('');
        body = `<p class="hint">${_t("Тени — копии героев других народов под управлением ИИ. Победа — звезда, три звезды — новый ранг. Поражение снимает звезду, но ранг не отнимает. Питомцы на арену не ходят.")}</p>
          <div class="arena-rank"><b>${World.RANKS[a.rank]}</b> <span class="stars">${'★'.repeat(a.stars)}${'☆'.repeat(World.STARS - a.stars)}</span>
            <small>${_t("Побед {0} · поражений {1} · боёв с наградой сегодня {2}/{3}", [a.wins, a.losses, a.fights, World.ARENA_DAILY])}</small></div>
          <div class="arena-foe"><span class="arena-fig">${Figures.avatar(Factions.heroKind(nx.faction, nx.gender), null)}</span>
            <div><b>${escText(nx.nick)}</b><small>${_t("Тень: {0} · уровень {1} · ум {2}", [F.name, nx.level, nx.ai])}</small></div></div>
          <div class="arena-rule"><b>${rule.name}</b><small>${rule.desc}. ${_t("Победа при условии дня: монет на {0}% больше.", [Math.round(World.RULE_BONUS * 100)])}</small></div>
          <div class="arena-act"><button type="button" class="primary" data-arena="fight">${_t("В бой")}</button><button type="button" data-arena="reroll">${_t("Другой противник")}</button>
            ${rv ? `<button type="button" data-arena="revenge" ${revLeft > 0 ? '' : 'disabled'}>${_t("Реванш: {0} ({1})", [escText(rv.nick), revLeft])}</button>` : ''}</div>
          <h3>${_t("Титулы за ранги")}</h3><ul class="arena-list">${titles}</ul>`;
      } else if (s.tab === 'players') {
        if (!st.duel.vAsked) { st.duel.vAsked = true; try { if (typeof claimLiveRewards === 'function') claimLiveRewards(); } catch (e) { /* без связи */ } }
        const D = st.duel, lv = Profile.level();
        const rows = (D.list || []).map((o, i) => { const c = o.card, F = Factions.get(c.faction);
          return `<div class="arena-foe"><span class="arena-fig">${Figures.avatar(Factions.heroKind(c.faction, c.gender), null)}</span>
            <div><b>${escText(c.nick)}</b><small>${_t("Тень игрока: {0} · уровень {1} · ранг {2}", [F ? F.name : '', c.level, World.RANKS[Math.min(c.rank || 0, World.RANKS.length - 1)]])}</small></div>
            <button type="button" class="primary" data-arena="duel-fight" data-i="${i}">${_t("Вызвать")}</button></div>`; }).join('');
        const pvp = Object.assign({ wins: 0, losses: 0 }, Profile.data.pvp || {}), pr = typeof Tourney !== 'undefined' ? Tourney.pvpRank(pvp.wins) : null;
        const pvpLine = pr ? `<div class="arena-rank"><b>${_t("Живые бои: победы {0}, поражения {1}", [pvp.wins, pvp.losses])}</b><small>${pr.rank ? _t("Ранг: {0}", [_t(pr.rank.name)]) : _t("Ранга пока нет")}${pr.next ? ' · ' + _t("До «{0}»: ещё {1}", [_t(pr.next.name), pr.left]) : ''}</small></div>` : '';
        body = pvpLine + `<p class="hint">${_t("Тени живых игроков: их настоящие вещи и умения, бой идёт с ИИ вместо соперника, поэтому ждать, пока он зайдёт в игру, не нужно. Показываем тех, кто близок вам по уровню. Награда и звёзды — как на арене теней.")}</p>
          <div class="arena-act">${D.live ? `<button type="button" class="primary" disabled>${D.live === 'wait' ? _t("Ищем соперника…") : _t("Подключаемся…")}</button><button type="button" data-arena="live-cancel">${_t("Отмена")}</button>` : `<button type="button" class="primary" data-arena="live-find">${_t("Живой бой")}</button>`}</div>
          <div class="arena-act"><button type="button" class="primary" data-arena="duel-find"${D.busy || D.live ? ' disabled' : ''}>${D.busy ? _t("Ищем…") : _t("Найти соперников (уровень {0})", [lv])}</button></div>
          ${D.msg ? `<p class="hint">${escText(D.msg)}</p>` : ''}${rows}`;
      } else if (s.tab === 'tourney') {
        const T = typeof TourneyClient !== 'undefined' ? TourneyClient : null;
        if (T && !T.started) { T.start(); }
        const S = T ? T.state : null, tv = S && S.tour, when = (ts) => new Date(ts).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const hint = `<p class="hint">${_t("Турнир живых игроков: все выходят с одинаковым уровнем ({0}) и одинаковыми вещами, поэтому решают ходы и заклинания. Питомец, расходники, эликсиры, умения и вещи из рюкзака не участвуют. Проиграл — выбыл; победитель получает титул и монеты.", [tv ? tv.level : 50])}</p>`;
        if (!tv) body = hint + `<p class="hint">${S && S.msg ? escText(S.msg) : _t("Загрузка…")}</p>`;
        else {
          const me = tv.me, bracket = (tv.rounds || []).map((r, i) => `<div class="tr-round"><b>${_t("Раунд {0}", [i + 1])}</b>` + r.map((m) => `<div class="tr-match"><span class="${m.w && m.w === m.a ? 'ok' : ''}">${escText(m.a || '—')}</span> <small>${_t("против")}</small> <span class="${m.w && m.w === m.b ? 'ok' : ''}">${escText(m.b || _t("(пропуск)"))}</span></div>`).join('') + '</div>').join('');
          let st1 = '', act = '';
          if (tv.state === 'open') {
            const sec = T.secondsToStart(), mm = Math.floor(sec / 60), h = Math.floor(mm / 60);
            st1 = `<b>${_t("Начало: {0}", [when(tv.startAt)])}</b><small>${h > 0 ? _t("До начала: {0} ч {1} мин", [h, mm % 60]) : _t("До начала: {0} мин", [mm])} · ${_t("Записано: {0} из {1}", [tv.size, 16])}</small>`;
            act = tv.joined ? `<p class="hint">${_t("Вы записаны. Не закрывайте игру: бой начнётся сам, когда подойдёт очередь.")}</p><div class="arena-act"><button type="button" data-arena="tour-leave">${_t("Выйти из турнира")}</button></div>`
              : `<div class="arena-act"><button type="button" class="primary" data-arena="tour-join"${S.busy ? ' disabled' : ''}>${_t("Записаться")}</button></div>`;
          } else if (tv.state === 'running') {
            const out = me && me.out;
            st1 = `<b>${_t("Турнир идёт: раунд {0}", [tv.round])}</b><small>${_t("Участников: {0}", [tv.size])}</small>`;
            act = !tv.joined ? `<p class="hint">${_t("Запись закрыта. Следующий турнир — позже.")}</p>` : out ? `<p class="hint">${_t("Вы вылетели в раунде {0}. Спасибо за игру!", [out])}</p>` : (() => {
              const mt = me && me.match;
              if (mt && mt.state === 'wait') {
                const sec = T.secondsLeft(mt.deadline);
                const line = S.msg === 'lost' || !mt.meOnline ? _t("Связь потеряна — возвращайтесь: бой с {0} начнётся, как только вы подключитесь. Осталось {1} с, потом — поражение.", [escText(mt.opp), sec])
                  : mt.oppOnline ? _t("Бой с {0} вот-вот начнётся…", [escText(mt.opp)])
                    : _t("Ждём соперника {0}: у него нет связи. Осталось {1} с, потом вам засчитают победу.", [escText(mt.opp), sec]);
                return `<p class="hint">${line}</p>`;
              }
              return `<p class="hint">${_t("Оставайтесь в игре: ваш бой начнётся сам.")}</p>`;
            })();
          } else if (tv.state === 'done') st1 = `<b>${_t("Турнир окончен")}</b>`;
          const lastc = S.last && S.last.champion ? `<p class="hint">${_t("Последний чемпион: {0}", [escText(S.last.champion)])}</p>` : '';
          body = hint + `<div class="arena-rank">${st1}</div>${act}${S.msg ? `<p class="hint">${escText(S.msg)}</p>` : ''}${bracket ? `<h3>${_t("Сетка")}</h3>${bracket}` : ''}${lastc}`;
        }
      } else if (s.tab === 'rating') {
        const R = st.rating = st.rating || { period: 'all', data: {}, busy: false, msg: '' };
        if (!R.seasonAsked) { R.seasonAsked = true; try { if (typeof claimSeasonRewards === 'function') claimSeasonRewards(); } catch (e) { /* без связи */ } }
        const per = [['all', _t("Общий")], ['week', _t("Неделя")], ['month', _t("Месяц")], ['year', _t("Год")], ['depth', _t("Глубина")], ['cweek', _t("Сезон: неделя")], ['cmonth', _t("Сезон: месяц")], ['folk', _t("Народы")]];
        const dt = R.data[R.period];
        if (!dt && !R.busy && !R.msg) {
          const rem = Net.current && Net.current.remote, p0 = R.period;
          if (rem && rem.rating && (p0 !== 'depth' || rem.depth) && (p0.charAt(0) !== 'c' || rem.seasonBoard) && (p0 !== 'folk' || rem.factions)) { R.busy = true; Promise.resolve(p0 === 'folk' ? rem.factions() : p0 === 'depth' ? rem.depth() : p0.charAt(0) === 'c' ? rem.seasonBoard(p0 === 'cweek' ? 'week' : 'month') : rem.rating(p0)).then((r) => { R.busy = false; if (r) R.data[p0] = r; else R.msg = _t("Нет связи с сервером. Попробуйте позже."); if (Screens.isOpen && Screens.arenaTab() === 'rating') render(); }).catch(() => { R.busy = false; R.msg = _t("Нет связи с сервером. Попробуйте позже."); if (Screens.isOpen) render(); }); }
        }
        const seas = R.period === 'cweek' || R.period === 'cmonth';
        const folk = R.period === 'folk';
        const rows = dt && folk ? dt.list.map((r) => `<tr class="${r.faction === dt.me ? 'me' : ''}"><td>${dt.list.indexOf(r) + 1}</td><td>${escText(Factions.get(r.faction).name)}</td><td>${(r.score > 0 ? '+' : '') + r.score}</td><td>${r.players}</td></tr>`).join('') : dt && seas ? dt.list.map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.place}</td><td>${escText(r.nick)}</td><td>${(r.score > 0 ? '+' : '') + r.score}</td><td>${r.games}</td></tr>`).join('') : dt && R.period === 'depth' ? dt.list.map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.place}</td><td>${escText(r.nick)}</td><td>${r.floor}</td></tr>`).join('') : dt ? dt.list.map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.place}</td><td>${escText(r.nick)}</td><td>${R.period === 'all' ? r.elo : (r.score > 0 ? '+' : '') + r.score}</td><td>${r.wins}/${r.losses}</td></tr>`).join('') : '';
        const seasHint = seas && dt ? (() => {
          const left = Math.max(0, Math.ceil((dt.end - dt.now) / 86400000)), pt = dt.prev && dt.prev.top && dt.prev.top.length ? dt.prev.top.map((x) => `${x.place}. ${escText(x.nick)} (${x.score > 0 ? '+' : ''}${x.score})`).join(' · ') : _t("никого");
          return `<p class="hint">${_t("Сезон закончится через {0} дн. В начале нового очки обнуляются. В зачёт идут игроки, сыгравшие от {1} боёв; тройка лучших получает награду, победитель — титул. Прошлый сезон: {2}", [left, dt.minGames, pt])}</p>`
            + (dt.me ? `<p class="hint">${_t("Ваше место: {0} · очки сезона: {1} · боёв: {2}", [dt.me.place, (dt.me.score > 0 ? '+' : '') + dt.me.score, dt.me.games])}</p>` : `<p class="hint">${_t("Вас пока нет в списке: сыграйте живые бои сезона.")}</p>`);
        })() : '';
        const folkHint = folk && dt ? (() => {
          const left = Math.max(0, Math.ceil((dt.end - dt.now) / 86400000)), pw = dt.prev && dt.prev.winner ? escText(Factions.get(dt.prev.winner).name) : _t("никто");
          return `<p class="hint">${_t("Битва народов: очки народа — сумма изменений рейтинга всех его игроков за неделю (бои с другими народами переносят очки победителю, бои своих ничего не меняют). Неделя закончится через {0} дн. Побеждает народ с лучшим положительным счётом, где играли хотя бы {1} игрока; его бойцы, сыгравшие от {2} боёв, получают награду. Победитель прошлой недели: {3}.", [left, dt.minPlayers, dt.minGames, pw])}</p>`
            + (dt.me ? `<p class="hint">${_t("Ваш народ: {0}", [escText(Factions.get(dt.me).name)])}</p>` : `<p class="hint">${_t("Ваш народ появится в списке после первого живого боя.")}</p>`);
        })() : '';
        const me = folk ? folkHint : seas ? seasHint : R.period === 'depth' ? (dt ? `<p class="hint">${_t("Рейтинг глубины: лучший пройденный уровень подземелья. Хранитель глубин ждёт на каждом 10-м уровне. Мой лучший уровень: {0}", [(Profile.data.tower && Profile.data.tower.best) || 0])}</p>` : '') : dt && dt.me ? `<p class="hint">${_t("Ваше место: {0} · {1}: {2} · победы/поражения: {3}/{4}", [dt.me.place, R.period === 'all' ? _t("рейтинг") : _t("очки за период"), R.period === 'all' ? dt.me.elo : dt.me.score, dt.me.wins, dt.me.losses])}</p>` : (dt ? `<p class="hint">${_t("Вас пока нет в списке: сыграйте живой бой.")}</p>` : '');
        body = `<p class="hint">${_t("Рейтинг живых боёв: за победу очки растут, за поражение — падают; победа над сильным даёт больше. Турнирные бои в рейтинг не входят. Недельный, месячный и годовой списки считаются по очкам, набранным за период. Тройка лучших прошлой недели и прошлого месяца получает монеты, победитель — ещё и титул.")}</p>
          <div class="arena-act">${per.map(([k, n]) => `<button type="button" data-arena="rate-per" data-per="${k}"${R.period === k ? ' class="primary"' : ''}>${n}</button>`).join('')}<button type="button" data-arena="rate-reload">${_t("Обновить")}</button></div>
          ${R.busy ? `<p class="hint">${_t("Загрузка…")}</p>` : ''}${R.msg ? `<p class="hint">${escText(R.msg)}</p>` : ''}${me}
          ${rows ? `<div class="rate-wrap"><table class="rate-tab"><thead><tr><th>#</th><th>${folk ? _t("Народ") : _t("Игрок")}</th><th>${folk ? _t("Очки недели") : R.period === 'depth' ? _t("Уровень") : seas ? _t("Очки сезона") : R.period === 'all' ? _t("Рейтинг") : _t("Очки")}</th>${R.period === 'depth' ? '' : folk ? `<th>${_t("Игроков")}</th>` : seas ? `<th>${_t("Боёв")}</th>` : `<th>${_t("П/Пор")}</th>`}</tr></thead><tbody>${rows}</tbody></table></div>` : ''}`;
      } else if (s.tab === 'square') {
        const Q = st.sq = st.sq || { data: null, busy: false, msg: '', draft: '' }, rem = Net.current && Net.current.remote;
        if (!Q.data && !Q.busy && !Q.msg && rem && rem.square) {
          Q.busy = true;
          Promise.resolve(rem.square()).then((r) => { Q.busy = false; if (r && r.faction) Q.data = r; else Q.msg = r && r.error === 'no-card' ? _t("Площадка откроется после первого боя на арене или в турнире: сервер должен узнать ваш народ.") : _t("Нет связи с сервером. Попробуйте позже."); if (Screens.isOpen && Screens.arenaTab() === 'square') render(); })
            .catch(() => { Q.busy = false; Q.msg = _t("Нет связи с сервером. Попробуйте позже."); if (Screens.isOpen) render(); });
        }
        const D = Q.data, ago = (t) => { const m = Math.max(0, Math.floor((D.now - t) / 60000)); return m < 1 ? _t("только что") : m < 60 ? _t("{0} мин назад", [m]) : m < 1440 ? _t("{0} ч назад", [Math.floor(m / 60)]) : _t("{0} дн. назад", [Math.floor(m / 1440)]); };
        body = `<p class="hint">${_t("Площадка народа: короткие записи игроков вашего народа — зовите на турнир, ищите напарников, хвалитесь. Записи видят только свои и хранятся неделю. Ссылки и контакты запрещены, писать можно раз в 20 секунд.")}</p>
          ${Q.busy ? `<p class="hint">${_t("Загрузка…")}</p>` : ''}${Q.msg ? `<p class="hint">${escText(Q.msg)}</p>` : ''}${Q.note ? `<p class="hint">${escText(Q.note)}</p>` : ''}
          ${D ? `<div class="arena-rank"><b>${escText(Factions.get(D.faction).name)}</b><small>${D.online.length ? _t("Сейчас в сети: {0}", [D.online.map(escText).join(', ')]) : _t("Сейчас в сети никого нет")}</small></div>
            <div class="sq-form"><input type="text" id="sq-text" class="sq-text" maxlength="${D.max}" placeholder="${_t("Ваша запись")}" value="${escText(Q.draft)}"><button type="button" class="primary" data-arena="sq-send">${_t("Написать")}</button><button type="button" data-arena="sq-reload">${_t("Обновить")}</button></div>
            ${D.posts.length ? `<ul class="arena-list sq-list">${D.posts.map((p) => `<li><b>${escText(p.nick)}</b> <small>${ago(p.at)}</small>${p.mine ? ` <button type="button" class="sq-del" data-arena="sq-del" data-id="${p.id}" aria-label="${_t("Удалить")}">✕</button>` : ` <button type="button" class="sq-del" data-arena="sq-report" data-id="${p.id}">${_t("Пожаловаться")}</button><button type="button" class="sq-del" data-arena="sq-hide" data-id="${p.id}">${_t("Скрыть автора")}</button>`}<br>${escText(p.text)}</li>`).join('')}</ul>` : `<p class="hint">${_t("Пока тихо. Напишите первым!")}</p>`}
            ${D.hidden ? `<p class="hint">${_t("Скрытых авторов: {0}.", [D.hidden])} <button type="button" class="sq-del" data-arena="sq-unhide">${_t("Показать всех")}</button></p>` : ''}` : ''}`;
      } else if (s.tab === 'run') {
        const r = runState(), T = Hero.tierFor(Profile.level()), nxt = r.on ? Run.shadow(r, Profile.level(), (Profile.data.map && Profile.data.map.seed) | 0, Factions.ORDER) : null;
        const money1 = (n) => MonsterArt.moneyHtml(n);
        body = `<p class="hint">${_t("Забег — серия боёв с тенями подряд, каждая сильнее предыдущей. За каждую победу в копилку идут монеты: после волны можно продолжить или забрать. Поражение или бегство отнимают {0}% копилки.", [Math.round((1 - Run.LOSS_KEEP) * 100)])}</p>
          <div class="arena-rank"><b>${r.on ? _t("Волна {0} из {1}", [r.wave, Run.MAX_WAVE]) : _t("Забег не начат")}</b>
            <small>${_t("Рекорд: волна {0} · наибольшая копилка: {1} · забегов: {2}", [r.best || '—', r.bestPot ? money1(r.bestPot) : '—', r.runs])}</small></div>
          ${r.on ? `<p>${_t("В копилке: {0}", [money1(r.pot)])}</p><div class="arena-foe"><span class="arena-fig">${Figures.avatar(Factions.heroKind(nxt.faction, nxt.gender), null)}</span>
            <div><b>${escText(nxt.nick)}</b><small>${_t("Тень: {0} · уровень {1} · ум {2}", [Factions.get(nxt.faction).name, nxt.level, Math.round(nxt.ai)])}</small></div></div>
            <p class="hint">${Run.left(r, Daily.today()) > 0 ? _t("Награда за эту волну: {0}", [money1(Run.waveReward(r.wave, Math.round(World.arenaCoins(Math.max(1, T), 2) * 0.5 * Run.modMult(r.mod) * Events.mul(evNow().id, 'run'))))]) : _t("Монеты за сегодня уже набраны: волны идут в рекорд без наград.")} ${_t("Монетных волн сегодня: {0}/{1}", [Run.DAILY_WAVES - Run.left(r, Daily.today()), Run.DAILY_WAVES])}</p>
            <div class="arena-act"><button type="button" class="primary" data-arena="run-next">${_t("В бой: волна {0}", [r.wave])}</button><button type="button" data-arena="run-cash"${r.pot > 0 ? '' : ' disabled'}>${_t("Забрать {0}", [money1(r.pot)])}</button></div>`
          : `<h3>${_t("Условие забега")}</h3><div class="arena-mods">${[['', _t("Без условий"), _t("обычные тени"), 1], ...Object.keys(Run.MODS).map((id) => { const R = World.ARENA_RULES.find((x) => x.id === id); return [id, R.name, R.desc, Run.MODS[id]]; })].map(([id, nm, ds, m]) => `<button type="button" class="arena-mod${(s.mod || '') === id ? ' on' : ''}" data-runmod="${id}" aria-pressed="${(s.mod || '') === id}"><b>${nm}</b> <em>${m > 1 ? '×' + String(m).replace('.', ',') : ''}</em><small>${ds}</small></button>`).join('')}</div>
            <p class="hint">${_t("Условие действует на весь забег; монеты за каждую волну умножаются на множитель.")}</p>
            <div class="arena-act"><button type="button" class="primary" data-arena="run-start">${_t("Начать забег")}</button></div>`}`;
      } else if (s.tab === 'puzzle') {
        const pz = Profile.data.puzzle = Puzzle.clean(Profile.data.puzzle); Puzzle.sync(pz, Daily.today());
        const g = Puzzle.game(pz, pz.day), cells = [];
        for (let i = 0; i < 36; i++) cells.push(`<button type="button" class="lh-cell${s.pzSel === i ? ' sel' : ''}" data-pzcell="${i}" ${pz.done ? 'disabled' : ''} aria-label="${_t("камень {0}", [i + 1])}">${lhStone(g.typ[i], g.sp[i])}</button>`);
        const star = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
        body = `${evBanner()}<p class="hint">${_t("Головоломка дня: одно поле на всех, всего {0} ходов. Набирайте очки — линии из 4 дают взрывной камень ✸, из 5 — линейный ✦. Звёзды: {1} / {2} / {3} очков; за каждую новую звезду — монеты (раз в день).", [Puzzle.MOVES, Puzzle.STARS[0], Puzzle.STARS[1], Puzzle.STARS[2]])}</p>
          <div class="arena-rank"><b>${star(pz.stars)}</b> <small>${_t("Очки: {0} · ходов осталось: {1} · рекорд: {2} · решено дней: {3}", [g.score, Puzzle.movesLeft(pz), pz.best || '—', pz.total])}</small></div>
          <div class="lh-board">${cells.join('')}</div>
          ${pz.done ? `<p class="hint">${_t("На сегодня всё. Новая головоломка — завтра.")}</p>` : ''}`;
      } else if (s.tab === 'results') {
        const a = arenaState(), tot = a.wins + a.losses, pct = tot ? Math.round(a.wins * 100 / tot) : 0;
        const ruleName = (id) => (World.ARENA_RULES.find((r) => r.id === id) || {}).name || '';
        const hist = (a.history || []).map((h) => `<li>${World.seasonLabel(h.s)}: <b>${World.RANKS[h.best]}</b> · ${_t("побед {0} · поражений {1}", [h.w, h.l])}</li>`).join('');
        const log = (a.log || []).map((e) => `<li class="${e.win ? 'ok' : ''}">${e.day} · ${e.win ? '✔' : '✘'} ${escText(e.nick || '')}${e.rule ? ' · ' + ruleName(e.rule) : ''}${e.rev ? ' · ' + _t("реванш") : ''}</li>`).join('');
        body = `<p class="hint">${_t("Сезон длится неделю (с понедельника). В конце недели ранг опускается на 2 ступени, а за лучший ранг сезона — монеты; с ранга «{0}» ещё и титул.", [World.RANKS[World.SEASON_TITLE_RANK]])}</p>
          <div class="arena-rank"><b>${_t("Сезон {0}", [World.seasonLabel(a.season)])}</b>
            <small>${_t("Лучший ранг: {0} · побед {1} · поражений {2}", [World.RANKS[a.sBest || 0], a.sWins || 0, a.sLosses || 0])}</small></div>
          <ul class="arena-list"><li>${_t("Всего: побед {0}, поражений {1} ({2}%)", [a.wins, a.losses, pct])}</li>
            <li>${_t("Серия побед: {0} · лучшая серия: {1}", [a.streak || 0, a.bestStreak || 0])}</li>
            <li>${_t("Лучший ранг за всё время: {0}", [World.RANKS[a.best]])}</li></ul>
          ${hist ? `<h3>${_t("Прошлые сезоны")}</h3><ul class="arena-list">${hist}</ul>` : ''}
          ${log ? `<h3>${_t("Последние бои")}</h3><ul class="arena-list">${log}</ul>` : ''}`;
      } else {
        const c = challengeState(), ch = World.challengeFor(c.day), m = Bestiary.MONSTERS[ch.species], left = World.CH_TRIES - c.tries;
        const hist = Object.entries(c.history).sort().reverse().slice(0, 7).map(([k, v]) => `<li>${k}: <b>${v}</b></li>`).join('');
        body = `<p class="hint">${_t("Одно испытание на всех в этот день: то же поле, тот же противник и одинаковый герой 25-го уровня — без вещей, зелий, эликсиров и питомца. Заклинания — те, что вы уже открыли. Очки: победа — 1000, плюс за оставшееся ХП и за скорость.")}</p>
          <div class="arena-foe"><span class="arena-fig">${MonsterArt.bust(ch.species, ch.tier)}</span>
            <div><b>${m.name}</b> ${tierChip(ch.tier)}<small>${_t("Испытание {0}", [/^\d{4}-\d\d-\d\d$/.test(c.day) ? c.day.split("-").reverse().join(".") : c.day])}</small></div></div>
          <p>${_t("Попыток сегодня: {0} из {1} · лучший результат: {2}", [left, World.CH_TRIES, c.best || '—'])}</p>
          <div class="arena-act"><button type="button" class="primary" data-arena="challenge" ${left > 0 ? '' : 'disabled'}>${left > 0 ? _t("Начать попытку") : _t("Попытки закончились — до завтра")}</button><button type="button" data-arena="share" ${c.best ? '' : 'disabled'}>${_t("Скопировать результат")}</button></div>
          ${hist ? `<h3>${_t("Ваши результаты")}</h3><ul class="arena-list">${hist}</ul>` : ''}`;
      }
      return `<div class="modal" role="dialog" aria-label="${_t("Арена")}">${head(_t("Арена"))}${tabs([['shadows', _t("Арена теней")], ...(duelOn() ? [['players', _t("Игроки")], ['tourney', _t("Турнир")], ['rating', _t("Рейтинг")], ['square', _t("Площадка")]] : []), ['run', _t("Забег")], ['daily', _t("Испытание дня")], ['puzzle', _t("Головоломка")], ['results', _t("Мои результаты")]], s.tab)}
        <div class="screen-body tavern-body"${sceneStyle('arena')}>${s.msg ? `<div class="gear-toast">${s.msg}</div>` : ''}${body}</div></div>`;   // 1.7.5: фон-колизей ui/bg-arena (картинка лежала без дела)
    },
    click(b) {
      const s = st.arena, d = b.dataset;
      { const inp = root && root.querySelector && root.querySelector('#sq-text'); if (inp && st.sq) st.sq.draft = inp.value; }
      if (d.arena === 'sq-reload') { st.sq = st.sq || { draft: '' }; st.sq.data = null; st.sq.msg = ''; st.sq.note = ''; return render(); }
      if (d.arena === 'sq-send') {
        const Q = st.sq, rem = Net.current && Net.current.remote; if (!Q || !rem || !rem.squarePost || Q.sending) return;
        const text = (Q.draft || '').trim(); if (!text) return;
        Q.sending = true;
        Promise.resolve(rem.squarePost(text)).then((r) => {
          Q.sending = false;
          if (r && r.ok) { Q.draft = ''; Q.data = null; Q.msg = ''; }
          else { const e = r && r.error; Q.msg = e === 'slow' ? _t("Слишком часто: подождите 20 секунд.") : e === 'daily' ? _t("На сегодня записей достаточно: возвращайтесь завтра.") : e === 'link' ? _t("Ссылки и контакты в записях запрещены.") : e === 'dup' ? _t("Такая запись уже есть.") : e === 'long' ? _t("Слишком длинная запись.") : e === 'flagged' || e === 'muted' ? _t("Сейчас писать нельзя.") : _t("Нет связи с сервером. Попробуйте позже."); }
          if (Screens.isOpen && Screens.arenaTab() === 'square') render();
        }).catch(() => { Q.sending = false; });
        return;
      }
      if (d.arena === 'sq-report' || d.arena === 'sq-hide' || d.arena === 'sq-unhide') {
        const rem = Net.current && Net.current.remote; if (!rem) return;
        const done = (msg) => { if (st.sq) { st.sq.data = null; st.sq.note = msg || ''; } if (Screens.isOpen && Screens.arenaTab() === 'square') render(); };
        if (d.arena === 'sq-unhide') { Promise.resolve(rem.squareUnhide && rem.squareUnhide()).then(() => done()); return; }
        if (d.arena === 'sq-hide') { Promise.resolve(rem.squareHide && rem.squareHide(Number(d.id))).then(() => done(_t("Автор скрыт: его записей вы больше не увидите."))); return; }
        Promise.resolve(rem.squareReport && rem.squareReport(Number(d.id))).then((r) => done(r && r.ok ? _t("Жалоба отправлена. Если на автора пожалуются несколько игроков, запись пропадёт, а писать он не сможет.") : r && r.error === 'daily' ? _t("На сегодня жалоб достаточно.") : _t("Нет связи с сервером. Попробуйте позже.")));
        return;
      }
      if (d.arena === 'sq-del') {
        const rem = Net.current && Net.current.remote; if (!rem || !rem.squareDelete) return;
        Promise.resolve(rem.squareDelete(Number(d.id))).then(() => { if (st.sq) { st.sq.data = null; st.sq.msg = ''; } if (Screens.isOpen && Screens.arenaTab() === 'square') render(); });
        return;
      }
      if (d.tab) { s.tab = d.tab; s.msg = ''; return render(); }
      if (d.pzcell !== undefined) {
        const pz = Profile.data.puzzle = Puzzle.clean(Profile.data.puzzle), i = +d.pzcell; Puzzle.sync(pz, Daily.today());
        if (pz.done) return;
        if (s.pzSel === undefined || s.pzSel === null) s.pzSel = i;
        else if (s.pzSel === i) s.pzSel = null;
        else {
          const r = Puzzle.move(pz, pz.day, s.pzSel, i);
          if (r.ok) { s.pzSel = null; if (r.coins) { r.coins = Math.round(r.coins * Events.mul(evNow().id, 'puzzle')); Profile.addCoins(r.coins); s.msg = _t("Звезда! Монеты: {0}", [money(r.coins)]); } else s.msg = ''; Profile.save(); }
          else s.pzSel = i;
        }
        return render();
      }
      if (d.runmod !== undefined) { s.mod = d.runmod; return render(); }
      if (d.arena === 'duel-find') {
        const rem = Net.current && Net.current.remote; if (!rem || st.duel.busy) return;
        st.duel.busy = true; st.duel.msg = ''; render();
        Promise.resolve()
          .then(() => (Net.current.env && Net.current.env.getCard ? rem.putCard(Net.current.env.getCard()) : false))
          .then(() => rem.opponents(Profile.level()))
          .then((list) => { st.duel.busy = false; st.duel.list = list || []; st.duel.msg = list === null ? _t("Нет связи с сервером. Попробуйте позже.") : (list.length ? '' : _t("Пока нет подходящих соперников. Позовите друзей в игру!")); render(); })
          .catch(() => { st.duel.busy = false; st.duel.msg = _t("Нет связи с сервером. Попробуйте позже."); render(); });
        return;
      }
      if (d.arena === 'rate-per') { const R = st.rating = st.rating || { period: 'all', data: {}, busy: false, msg: '' }; R.period = d.per; R.msg = ''; return render(); }
      if (d.arena === 'rate-reload') { const R = st.rating = st.rating || { period: 'all', data: {}, busy: false, msg: '' }; delete R.data[R.period]; R.msg = ''; return render(); }
      if (d.arena === 'tour-join' || d.arena === 'tour-leave') {
        const T = typeof TourneyClient !== 'undefined' ? TourneyClient : null; if (!T) return;
        if (d.arena === 'tour-leave') { T.leave().then(() => render()); return; }
        const c = Net.current.env.getCard();
        T.join({ nick: c.nick, faction: c.faction, gender: c.gender }).then((r) => { if (r && r.error) T.state.msg = r.error === 'closed' ? _t("Запись закрыта") : r.error === 'full' ? _t("Все места заняты") : _t("Не получилось записаться. Попробуйте позже."); render(); });
        return;
      }
      if (d.arena === 'live-cancel') { const D = st.duel; if (D.net) { try { D.net.leave(); D.net.close(); } catch (e) { /* уже закрыт */ } } D.net = null; D.live = null; return render(); }
      if (d.arena === 'live-find') {
        const rem = Net.current && Net.current.remote, D = st.duel; if (!rem || D.live || typeof Live === 'undefined' || typeof WebSocket === 'undefined') return;
        D.live = 'connect'; D.msg = ''; render();
        const fail = (msg) => { if (D.net) { try { D.net.close(); } catch (e) { /* уже закрыт */ } } D.net = null; D.live = null; D.msg = msg; if (Screens.isOpen) render(); };
        const card = Net.current.env.getCard();
        Promise.resolve().then(() => rem.putCard(card)).then(() => rem.liveAccess()).then((acc) => {
          if (!acc) return fail(_t("Нет связи с сервером. Попробуйте позже."));
          const net = Live.create({ url: acc.url, token: acc.token, WS: WebSocket }); D.net = net;
          net.on('ready', () => { if (D.net === net) { D.live = 'wait'; net.queue(card); if (Screens.isOpen) render(); } });
          net.on('noopp', () => fail(_t("Живых соперников рядом по уровню сейчас нет. Попробуйте позже или вызовите тень игрока.")));
          net.on('auth-fail', () => fail(_t("Нет связи с сервером. Попробуйте позже.")));
          net.on('lost', () => fail(_t("Связь с сервером потеряна.")));
          net.on('err', (m) => { if (m && m.e === 'busy') fail(_t("Вы уже в бою. Дождитесь его окончания.")); });
          net.on('matched', (m) => {
            const sh = liveBegin({ net, role: m.role, first: m.first, seed: m.seed, opp: m.opp, myCard: card });
            if (!sh) return fail(_t("Не получилось подготовить бой с этим игроком."));
            D.net = null; D.live = null;
            const a = arenaState(); World.arenaSync(a, Daily.today(), Hero.tierFor(Profile.level())); Profile.save();
            MapView.startSpecial({ id: 'bandit', tier: Hero.tierFor(sh.level), arena: sh });
          });
          net.connect();
        }).catch(() => fail(_t("Нет связи с сервером. Попробуйте позже.")));
        return;
      }
      if (d.arena === 'duel-fight') {
        const o = (st.duel.list || [])[Number(d.i)]; if (!o) return;
        const sh = Duel.toShadow(o.card, Gear.SLOTS, (e) => { try { return !!Gear.item(e); } catch (er) { return false; } });
        if (!sh) { st.duel.msg = _t("Не получилось подготовить бой с этим игроком."); return render(); }
        const a = arenaState(); World.arenaSync(a, Daily.today(), Hero.tierFor(Profile.level()));
        sh.rule = World.arenaRule(Daily.today()).id; Profile.save();
        return MapView.startSpecial({ id: 'bandit', tier: Hero.tierFor(sh.level), arena: sh });
      }
      if (d.arena === 'reroll') { const a = arenaState(); a.next = null; arenaState(); Profile.save(); s.msg = ''; return render(); }
      if (d.arena === 'fight') {
        const a = arenaState(), nx = a.next; a.next = null; s.msg = ''; nx.rule = World.arenaRule(Daily.today()).id; Profile.save();
        return MapView.startSpecial({ id: 'bandit', tier: Hero.tierFor(nx.level), arena: nx });
      }
      if (d.arena === 'revenge') {
        const a = arenaState(), rv = a.revenge;
        if (!rv || (a.revs || 0) >= World.REVENGE_DAILY) return;
        a.revs = (a.revs || 0) + 1; a.revenge = null; s.msg = ''; Profile.save();
        return MapView.startSpecial({ id: 'bandit', tier: Hero.tierFor(rv.level), arena: { ...rv, rev: true, rule: World.arenaRule(Daily.today()).id } });
      }
      if (d.arena === 'run-start' || d.arena === 'run-next') {
        const r = runState();
        if (d.arena === 'run-start') { if (r.on) return; Run.start(r, s.mod || ''); }
        else if (!r.on) return;
        const sh = Run.shadow(r, Profile.level(), (Profile.data.map && Profile.data.map.seed) | 0, Factions.ORDER);
        Profile.save(); s.msg = '';
        return MapView.startSpecial({ id: 'bandit', tier: Hero.tierFor(sh.level), run: sh });
      }
      if (d.arena === 'run-cash') {
        const r = runState();
        if (!r.on || r.pot <= 0) return;
        const c = Run.cash(r); Profile.addCoins(c); Profile.save(); s.msg = _t("Забег завершён: получено {0}.", [money(c)]); return render();
      }
      if (d.arena === 'challenge') {
        const c = challengeState();
        if (c.tries >= World.CH_TRIES) return;
        c.tries++; s.msg = ''; Profile.save();
        return MapView.startSpecial({ ...((ch) => ({ id: ch.species, tier: ch.tier, challenge: ch }))(World.challengeFor(c.day)) });
      }
      if (d.arena === 'share') {
        const c = challengeState(), text = _t("Хрупкий мир · Испытание {0}: {1}", [c.day, _nn(c.best, 'очко', 'очка', 'очков')]);
        const done = () => { s.msg = _t("Скопировано: {0}", [text]); render(); };
        const fail = () => { s.msg = _t("Скопируйте вручную: {0}", [text]); render(); };
        try { navigator.clipboard.writeText(text).then(done, fail); } catch (e) { fail(); }
      }
    },
  };

  /* =============== БАНК (1.8.6: вклад, ставка растёт с серией заходов; логика — js/bank.js) =============== */
  const bankState = () => { const b = Profile.data.bank = Bank.clean(Profile.data.bank); return b; };
  // 1.8.8: «Визитка героя» — сводка для показа другим игрокам (пока копируется текстом; на сервере те же данные покажем онлайн)
  const herocard = {
    html() {
      const c = HeroCard.build(Profile.data, { level: Profile.level(), medalName: (id) => Medals.nameFor(id) });
      const fac = (typeof Factions !== 'undefined' && Factions.get(c.faction)) ? Factions.get(c.faction).name : '';
      const merits = c.merits.length ? c.merits.map((m) => `<li>${HeroCard.meritText(m)}</li>`).join('') : `<li class="jr-unk">${_t("Заслуг пока нет: победите стража или спуститесь в подземелье.")}</li>`;
      const medals = c.medals.length ? `<p class="hint">${c.medals.slice(0, 40).map((m) => m.name).join(' · ')}</p>` : `<p class="hint">${_t("Медалей пока нет.")}</p>`;
      return `<div class="modal" role="dialog" aria-label="${_t("Визитка героя")}">${head(_t("Визитка героя"))}<div class="screen-body tavern-body">
        <h3>${c.name || Profile.heroName()}</h3><p class="hint">${fac ? fac + ' · ' : ''}${_t("уровень {0}", [c.level])}</p>
        <p>${_t("Боёв: {0}", [c.battles])}</p>
        <h3>${_t("Заслуги")}</h3><ul class="jr-list">${merits}</ul>
        <h3>${_t("Медали: {0}", [c.medals.length])}</h3>${medals}
        <div class="mc-act"><button type="button" data-copycard="1">${_t("Скопировать визитку")}</button></div>
        <p class="hint">${st.herocard.msg || _t("Когда появится сервер, эту визитку смогут увидеть другие игроки.")}</p></div></div>`;
    },
    click(b) {
      if (!b.dataset.copycard) return;
      const t = HeroCard.text(HeroCard.build(Profile.data, { level: Profile.level(), medalName: (id) => Medals.nameFor(id) }));
      const ok = () => { st.herocard.msg = _t("Визитка скопирована."); render(); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, () => { st.herocard.msg = t; render(); }); else { st.herocard.msg = t; render(); }
    },
  };
  const bank = {
    html() {
      const s = st.bank, b = bankState();
      const gain = Bank.visit(b, Date.now());
      if (gain > 0) { Profile.save(); s.msg = _t("Проценты за серию заходов: +{0}.", [gain]); } else if (!s.msg) Profile.save();
      const btn = (act, n, label, can) => `<button type="button" data-bank="${act}" data-n="${n}"${can ? '' : ' disabled'}>${label}</button>`;
      const coins = Profile.data.coins, dep = b.dep, room = Bank.CAP - dep;
      const pct = (x) => (Math.round(x * 1000) / 10).toString().replace('.', ',');
      return _t("<div class=\"modal\" role=\"dialog\" aria-label=\"Банк\">{0}\n        <div class=\"screen-body tavern-body\">\n          <p class=\"hint\">{1}</p>\n          <h3>Вклад</h3>\n          <p>На счёте: <b>{2}</b> · лимит {3}.</p>\n          <p>Серия заходов: <b>{4}</b> дн. · ставка сегодня: <b>{5}%</b> в сутки (потолок {6}%). Завтра, если зайдёте: +{7}.</p>\n          <div class=\"reset\">{8}</div><div class=\"reset\">{9}</div>\n        </div></div>", [head(_t("Банк")), s.msg || _t("Добро пожаловать. Если играете каждый день, ставка медленно растёт. Пропустили день — ставка снова 0."), money(dep), money(Bank.CAP), b.streak, pct(Bank.rate(b.streak)), pct(Bank.RATE_MAX), Bank.tomorrow(b),
        [100, 1000].map((n) => btn('dep', n, _t("Внести {0}", [n]), coins >= n && room >= n)).join('') + btn('dep', Math.min(coins, room), _t("Внести всё"), Math.min(coins, room) > 0),
        [100, 1000].map((n) => btn('wd', n, _t("Снять {0}", [n]), dep >= n)).join('') + btn('wd', dep, _t("Снять всё"), dep > 0)]);
    },
    click(b) {
      const s = st.bank, bk = bankState(), d = b.dataset, n = Number(d.n) || 0;
      if (d.bank === 'dep') { if (n > 0 && bk.dep + n <= Bank.CAP && Profile.spend(n)) { Bank.deposit(bk, n); s.msg = _t("Внесено: {0}.", [money(n)]); } }
      else if (d.bank === 'wd') { if (Bank.withdraw(bk, n)) { Profile.addCoins(n); s.msg = _t("Снято: {0}.", [money(n)]); } }
      else return;
      Profile.save();
      changed();
    },
  };

  // Лента заходов (js/streak.js): одна награда в день, пропуск ничего не сбрасывает
  const loginReward = (r) => [r.coins ? money(r.coins) : '', ...Object.entries(r.cons || {}).map(([k, n]) => `${(typeof Gear !== 'undefined' && Gear.CONSUMABLES[k]) ? Gear.CONSUMABLES[k].name : k}${n > 1 ? ' ×' + n : ''}`)].filter(Boolean).join(' + ');
  const login = {
    html() {
      const sk = Profile.data.streak = Streak.clean(Profile.data.streak), today = Daily.today(), can = Streak.available(sk, today);
      const cells = Streak.REWARDS.map((r, i) => {
        const done = i < sk.pos || (!can && i === (sk.pos + Streak.REWARDS.length - 1) % Streak.REWARDS.length && sk.total > 0), cur = can && i === sk.pos;
        return `<div class="login-cell${done ? ' done' : ''}${cur ? ' cur' : ''}"><b>${_t("День {0}", [i + 1])}</b><span>${loginReward(r)}</span>${done ? '<i>✓</i>' : ''}</div>`;
      }).join('');
      const nx = Streak.next(sk);
      return `<div class="modal" role="dialog" aria-label="${_t("Награда за заход")}">${head(_t("Награда за заход"))}
        <div class="screen-body">
          <p class="hint">${_t("Заходите в игру — за каждый день полагается подарок. Пропуск ничего не сбрасывает: лента просто продолжится с того же места.")}</p>
          <div class="login-ribbon">${cells}</div>
          <p class="hint">${_t("Дней подряд: {0} · рекорд: {1} · всего подарков: {2}", [sk.run, sk.best, sk.total])}${sk.run > 0 && sk.run % 7 === 0 ? ' · ' + _t("неделя подряд — добавка к награде!") : ''}</p>
          <div class="arena-act">${can ? `<button type="button" class="primary" data-login-claim="1">${_t("Забрать: {0}", [loginReward(nx)])}</button>` : `<span class="badge done">${_t("Сегодня подарок получен — до завтра!")}</span>`}</div>
          ${st.login.msg ? `<p class="hint">${st.login.msg}</p>` : ''}
        </div></div>`;
    },
    click(b) {
      if (!b.dataset.loginClaim) return;
      const sk = Profile.data.streak = Streak.clean(Profile.data.streak), r = Streak.claim(sk, Daily.today()); if (!r) return;
      if (r.coins) Profile.addCoins(r.coins);
      for (const [k, n] of Object.entries(r.cons || {})) Profile.addConsumable(k, n);
      Profile.save(); st.login.msg = _t("Получено: {0}", [loginReward(r)]);
      changed();
    },
  };
  const SCREENS = { login, herocard, bank, help, shop, forge, best, faction, tavern, mill, lighthouse, wreck, chest, junker, library, artistWorkshop, jeweler, valor, credits, kennel, alchemist, market, village, arena };
  return { medalTile, medalCaption, open, close, refresh: render, get isOpen() { return !!root; }, get screen() { return cur; }, arenaTab: () => (st.arena && st.arena.tab), openShop: () => open('shop'), openForge: () => open('forge'), openBestiary: () => open('best'),
    openTavern: () => { st.tavern.msg = ''; open('tavern'); },
    openJunker: () => { st.junker.msg = ''; open('junker'); },
    openMill: () => { st.mill.msg = ''; open('mill'); },
    openLighthouse: () => { st.lighthouse.msg = ''; st.lighthouse.tab = 'quests'; st.lighthouse.game = null; open('lighthouse'); },
    openHeroCard: () => open('herocard'),
    openWreck: () => { st.wreck.msg = ''; open('wreck'); },
    openChest: (kind) => { st.chest.msg = ''; st.chest.kind = kind || 'sapphire'; open('chest'); },
    deepReward,
    openLogin: () => { st.login.msg = ''; open('login'); },
    openLibrary: () => { st.library.tab = 'npc'; st.library.msg = ''; open('library'); },
    openJeweler: () => { st.jeweler.msg = ''; open('jeweler'); },
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


/* 1.7.6: подсказка к медали на свитке (только при наведении мыши): название, суть и прогресс. Родная всплывающая подсказка убрана. */
(function () {
  let tip = null, cur = null;
  const hide = () => { if (tip) tip.hidden = true; cur = null; };
  const make = () => { if (tip) return tip; tip = document.createElement('div'); tip.className = 'medal-tip'; tip.hidden = true; tip.setAttribute('role', 'tooltip'); try { if (Art.has('ui/card-scroll')) tip.style.setProperty('--scrollimg', `url('${new URL(Art.url('ui/card-scroll'), location.href).href}')`); } catch (e) { /* без картинки — цветной фон */ } document.body.appendChild(tip); return tip; };
  document.addEventListener('mouseover', (e) => {
    const m = e.target.closest && e.target.closest('.medal-round[data-tip]');
    if (!m) { if (cur) hide(); return; }
    if (m === cur) return;
    cur = m;
    const t = make(), full = m.dataset.tip || '', k = full.indexOf(' — ');
    const name = k > 0 ? full.slice(0, k) : full, rest = k > 0 ? full.slice(k + 3) : '';
    t.innerHTML = '<div class="mt-in"><b></b><span></span></div>';
    t.querySelector('b').textContent = name; t.querySelector('span').textContent = rest;
    t.hidden = false;
    const r = m.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    let y = r.top - h - 6; if (y < 8) y = Math.min(r.bottom + 6, window.innerHeight - h - 8);
    t.style.left = x + 'px'; t.style.top = y + 'px';
  });
  document.addEventListener('scroll', hide, true);
  document.addEventListener('click', hide, true);
})();
