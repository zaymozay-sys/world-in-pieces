/* Бой вдвоём (2.3.9: вынесено из game.js). Загружается сразу после game.js: использует createBattle, MAIN_BATTLE и MAIN_HOST. */
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

  function begin(petF, opts = {}) {
    end();
    const pd = Profile.pet();
    if (!BATTLE_TEMPLATE || !pd) return;
    st = { control: 'hero', tab: 'hero', waiting: null, result: { hero: null, pet: null }, kills: [], petOutcomes: [], done: false, pd, help: { 'hp-h2p': 0, 'hp-p2h': 0, 'st-h2p': 0, 'st-p2h': 0 }, noHelp: !!opts.noHelp, helpOpen: false };
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
      name: Pets.petTitle(pd), speciesId: pd.speciesId, tier: pd.tier, hpMult: Pets.boardHp(pd), dmgMult: Pets.boardDmg(pd),
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
      '<button type="button" class="duo-take"></button><button type="button" class="duo-help" hidden></button><div class="duo-helpmenu" hidden></div>';
    bar.querySelector('[data-tab=pet] .dt-av').innerHTML = petB.petPortrait(petB.fighters.left);
    bar.addEventListener('click', (e) => {
      const t = e.target.closest('.duo-tab'), k = e.target.closest('.duo-take'), hb = e.target.closest('.duo-help'), ha = e.target.closest('[data-help]');
      if (ha) { if (!ha.disabled) help(ha.dataset.help); }
      else if (hb) { st.helpOpen = !st.helpOpen; renderBar(); }
      else if (t) setTab(t.dataset.tab);
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
    const ha = e.target.closest('[data-help]');
    if (ha) { if (!ha.disabled) help(ha.dataset.help); return; }
    if (e.target.closest('.pq-help')) { st.helpOpen = !st.helpOpen; renderBar(); return; }
    if (e.target.closest('.pq.ally')) {   // 2.3.5: нажатие на карточку напарника всегда меняет управление (на ждущего — только взгляд)
      const go = e.target.closest('.pq.ally').dataset.go;
      if (st.waiting === go || (st.result[go] && st.result[go].result !== 'wait')) { if (st.tab !== go) setTab(go); return; }
      setControl(st.control === 'pet' ? 'hero' : 'pet', true);
      return;
    }
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
      const w = st.waiting === x.go;
      const a = plaque(x.mate, x.av[0], w ? 'ally wait' : 'ally', x.go, false), f = w ? '' : plaque(x.foe, x.av[1], 'foe', x.go, hide);
      // 2.3.7: в золотом оформлении десктопа верхняя .duo-bar с кнопкой «Помощь» скрыта (см. battle-dock.css) —
      // карточка партнёра (.pq-in > .pq.ally) там же переехала под карточки бойцов, поэтому кнопка «Помощь»
      // дублируется прямо в .pq-in, иначе обмен здоровьем/камнями между героем и питомцем вовсе недоступен.
      const helpBtn = st.noHelp || st.done ? '' : `<button type="button" class="pq-help">${_t("Помощь")}</button><div class="pq-helpmenu" hidden></div>`;
      setHtml(m.inL, a + helpBtn); setHtml(m.inR, f);
      if (!st.noHelp && !st.done) renderPqHelp(m.inL);
      setHtml(m.row, a + f + `<button type="button" class="pq-take"${takeState.hidden ? ' hidden' : ''}>${esc(takeState.text)}</button>`);
    }
  }
  function renderPqHelp(inL) {
    const hm = inL.querySelector('.pq-helpmenu');
    if (!hm) return;
    hm.hidden = !st.helpOpen;
    if (hm.hidden) return;
    const row2 = (act, label) => { const why = helpCheck(act); return `<button type="button" data-help="${act}" ${why ? 'disabled' : ''} title="${esc(why)}">${label}${why ? `<small>${esc(why)}</small>` : ''}</button>`; };
    setHtml(hm, row2('hp-h2p', _t("Отдать питомцу здоровье")) + row2('hp-p2h', _t("Взять здоровье у питомца")) + row2('st-h2p', _t("Передать питомцу камни")) + row2('st-p2h', _t("Взять камни у питомца")));
  }
  const foeNum = (b) => (typeof Sky !== 'undefined' && Sky.hidesEnemy(Profile.data.monster) ? '?' : `${Math.max(0, b.foeHp)}/${b.foeMax}`);
  function renderSolo() {
    if (!bar || st) return;
    const b = M().brief(), f = b.foe, boss = Profile.data.monster && Profile.data.monster.boss, ch = boss && typeof Story !== 'undefined' ? Story.BY_ID[boss] : null;
    const nm = bar.querySelector('.dt-name');
    const label = ch ? (ch.id === 'b5' ? _t("Последний осколок") : _t("Страж осколка {0}", [ch.id.slice(1)])) : '';
    const gr = (Profile.data.monster && Profile.data.monster.grow) || 0, key = f.name + '|' + f.tier + '|' + label + '|' + gr;
    if (nm.dataset.key !== key) {
      nm.dataset.key = key; nm.textContent = f.name + (label ? ' · ' + label + ' ' : ' ');
      nm.insertAdjacentHTML('beforeend', tierChip(f.tier, gr));
    }
    const hpW = Math.max(0, b.foeHp / b.foeMax * 100) + '%', hpI = bar.querySelector('.dt-hp i');
    if (hpI.style.width !== hpW) hpI.style.width = hpW;       // 2.3.9: страницу трогаем, только когда значение изменилось (функция идёт каждые 400 мс)
    const pt = b.pet ? ` · ${b.pet.name}${b.pet.alive ? '' : _t(" (пал в бою)")} ${Math.max(0, b.pet.hp)}/${b.pet.max}` : '';
    const smT = `${_t("Герой")} ${Math.max(0, b.hp)}/${b.max}${pt} · ${_t("враг")} ${foeNum(b)}`, sm = bar.querySelector('small');
    if (sm.textContent !== smT) sm.textContent = smT;
    setStones(bar.querySelector('.solo-tab'), M().fighters.left, M().fighters.right);
    const tm = mountTeam(mainEl());
    if (tm) {
      const ab = mainEl().querySelector('.fighter.right .ability-line'), A = Bestiary.ability(M().fighters.right.monsterId);
      const what = A && A.name ? `${A.name}: ${A.desc}` : (ab ? ab.textContent.trim() : '');
      const info = ((label ? label + ' · ' : '') + what).trim();
      const fr = M().fighters.right, mm = typeof window.mobMagicHtml === 'function' && fr && fr.hp > 0 ? window.mobMagicHtml(fr) : '';
      setHtml(tm.row, mm || `<div class="pq-info">${esc(info)}</div>`);
    }
    watchBarH();
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
    watchBarH();
    th.classList.toggle('on', st.tab === 'hero'); tp.classList.toggle('on', st.tab === 'pet');
    th.classList.toggle('mine', st.control === 'hero'); tp.classList.toggle('mine', st.control === 'pet');
    th.classList.toggle('down', !!st.result.hero && st.result.hero.result !== 'wait'); tp.classList.toggle('down', !!st.result.pet && st.result.pet.result !== 'wait');
    th.classList.toggle('wait', st.waiting === 'hero'); tp.classList.toggle('wait', st.waiting === 'pet');
    if (st.waiting === 'hero') th.querySelector('small').textContent = `${Math.max(0, h.hp)}/${h.max} · ${_t("ждёт")}`;
    if (st.waiting === 'pet') tp.querySelector('small').textContent = `${Math.max(0, p.hp)}/${p.max} · ${_t("ждёт")}`;
    const take = bar.querySelector('.duo-take');
    const petOver = !!st.result.pet, heroOver = !!st.result.hero;
    take.textContent = st.control === 'pet' ? _t("Играть за героя") : _t("Играть за питомца");
    take.hidden = st.done || !!st.waiting || (st.control === 'hero' ? petOver || (petB.brief().hp <= 0) : heroOver);
    takeState = { text: take.textContent, hidden: take.hidden };
    renderHelp();
    renderTeam();
  }

  /* ---------- Взаимовыручка (2.2.0): герой и питомец делятся здоровьем и камнями ----------
     Отдающий теряет 10% своего здоровья, получающий восстанавливает столько же единиц своего здоровья (не выше максимума).
     Камни: отдаётся до 2 каждого вида. Питомец делится здоровьем с доверия «Друг» (50), камнями — «Верный» (75). Каждое действие — до 2 раз за бой.
     Каждая помощь укрепляет доверие (+1). В бою по сети отключено. */
  const HELP = { lose: 0.10, stones: 2, uses: 2, trustHp: 50, trustSt: 75 };
  const helpWho = (act) => { const h2p = act.endsWith('h2p'); return { giver: h2p ? M().fighters.left : petB.fighters.left, recv: h2p ? petB.fighters.left : M().fighters.left, h2p }; };
  function helpCheck(act) {
    if (!st || !petB || st.noHelp || st.done) return _t("Сейчас недоступно");
    if (st.help[act] >= HELP.uses) return _t("Исчерпано: {0 раз|раза|раз} за бой", [HELP.uses]);
    const { giver, recv, h2p } = helpWho(act), over = h2p ? st.result.pet : st.result.hero;
    if (over || giver.hp <= 0 || recv.hp <= 0) return _t("Участник уже выбыл");
    if (act.startsWith('hp')) {
      if (!h2p && Pets.trustOf(st.pd) < HELP.trustHp) return _t("Питомец доверяет вам недостаточно: нужен уровень «{0}»", [Pets.trustName({ trust: HELP.trustHp })]);
      if (giver.hp <= giver.max * 0.4) return _t("Отдающему нужно больше 40% здоровья");
      if (recv.hp >= recv.max) return _t("Здоровье уже полное");
    } else {
      if (!h2p && Pets.trustOf(st.pd) < HELP.trustSt) return _t("Питомец доверяет вам недостаточно: нужен уровень «{0}»", [Pets.trustName({ trust: HELP.trustSt })]);
      if (!MAGIC_TYPES.some((x) => (giver.counts && giver.counts[x]) > 0)) return _t("Нет камней для передачи");
    }
    return '';
  }
  function help(act) {
    if (helpCheck(act)) return;
    const { giver, recv, h2p } = helpWho(act), gb = h2p ? M() : petB, rb = h2p ? petB : M();
    const gName = h2p ? Profile.data.name || _t("Герой") : Pets.petTitle(st.pd), rName = h2p ? Pets.petTitle(st.pd) : Profile.data.name || _t("Герой");
    if (act.startsWith('hp')) {
      const lose = Math.min(giver.hp - 1, Math.round(giver.max * HELP.lose)), gain = Math.min(recv.max - recv.hp, lose);
      giver.hp -= lose; recv.hp += gain;
      gb.logEvent('left', _t("{0} делится здоровьем: −{1}", [gName, lose])); rb.logEvent('left', _t("{0} получает от друга здоровье: +{1}", [rName, gain]));
    } else {
      let n = 0;
      for (const x of MAGIC_TYPES) { const k = Math.min(HELP.stones, (giver.counts && giver.counts[x]) || 0); giver.counts[x] -= k; recv.counts[x] = (recv.counts[x] || 0) + k; n += k; }
      gb.logEvent('left', _t("{0} передаёт камни: {1}", [gName, n])); rb.logEvent('left', _t("{0} получает камни: {1}", [rName, n]));
    }
    st.help[act]++; Pets.addTrust(st.pd, 1); Profile.save();
    gb.renderFighters(); rb.renderFighters(); gb.renderCounters('left'); rb.renderCounters('left');
    renderBar();
  }
  function renderHelp() {
    const hb = bar.querySelector('.duo-help'), hm = bar.querySelector('.duo-helpmenu');
    if (!hb || !hm) return;
    hb.hidden = st.noHelp || st.done; hb.textContent = _t("Помощь");
    hm.hidden = hb.hidden || !st.helpOpen;
    if (hm.hidden) return;
    const row = (act, label) => { const why = helpCheck(act); return `<button type="button" data-help="${act}" ${why ? 'disabled' : ''} title="${esc(why)}">${label}${why ? `<small>${esc(why)}</small>` : ''}</button>`; };
    setHtml(hm, row('hp-h2p', _t("Отдать питомцу здоровье")) + row('hp-p2h', _t("Взять здоровье у питомца")) + row('st-h2p', _t("Передать питомцу камни")) + row('st-p2h', _t("Взять камни у питомца")));
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

  // 2.3.8: на поле id сменился ход (новый каскад/ход противника), а бой на нём ещё не завершён. Если напарник на
  // другом поле уже победил и ждёт (st.waiting), даём шанс, что живой противник этого поля прямо сейчас перескочит
  // к ждущему — не дожидаясь, чем закончится бой на этом поле. Тот же бросок и функция переноса, что и в ended().
  function turnChanged(id) {
    if (!st || st.done) return;
    const other = id === 'hero' ? 'pet' : 'hero';
    if (st.waiting !== other || st.result[id]) return;
    if (BattleRand.next() < 0.5) transferFoe(id, other);
  }
  // Поле id закончилось: 'win' — противник повержен, 'loss' — наш боец пал.
  function ended(id, result) {
    if (!st) return;
    const b = boards()[id];
    const foe = structuredClone(b.fighters.right);
    st.result[id] = { result, foe };
    if (result === 'win') st.kills.push(foe);
    if (id === 'pet') st.petOutcomes.push({ tier: foe.tier, won: result === 'win' });
    if (id === 'pet' && result === 'win' && st.pd) {            // «Амулет целителя»: победа питомца лечит героя
      const hp = Pets.amuletPower(st.pd, 'healer'), hf = M().fighters.left;
      if (hp > 0 && hf && hf.hp > 0) { const add = Math.min(hf.max - hf.hp, Math.round(hf.max * hp)); if (add > 0) { hf.hp += add; M().logEvent('left', _t("Амулет целителя: герой лечится на {0}", [add])); M().renderFighters(); } }
    }
    const other = id === 'hero' ? 'pet' : 'hero';
    /* 2.3.5: наш боец победил, а второй монстр ещё дерётся. Монстр с равной вероятностью либо переходит на поле
       победителя (его прежний соперник ждёт), либо остаётся где был (ждёт победитель). Ждущий вступает, когда до
       него дойдёт очередь: его соперник пал или монстр вернулся к нему. */
    if (result === 'win' && !st.result[other] && st.waiting !== other) {
      if (BattleRand.next() < 0.5) { transferFoe(other, id); return; }   // боевой бросок: в бою по сети у обеих сторон одинаковый
      st.waiting = id;
      boards()[id].logEvent('left', _t("Второй противник не идёт сюда — {0} ждёт своего часа", [boards()[id].fighters.left.name]));
      boards()[id].showWaitOverlay(_t("Ждите — противник второго поля ещё жив.<br>Если он победит, перейдёт сюда."));
      if (st.control === id) setControl(other, true);
      else if (st.tab === id) setTab(other);
      renderBar();
      return;
    }
    if (result === 'win' && st.waiting === other) { st.result[other] = { result: 'wait' }; boards()[other].hideWaitOverlay(); }   // монстров больше нет — ждавший свободен
    // Боец пал, а его напарник ждал без противника: монстр павшего переходит к ждавшему (герой ждать может только живым).
    if (result === 'loss' && id === 'pet' && st.waiting === other) {
      st.result[id].taken = true;
      st.waiting = null;
      const b = boards()[other], mine = st;
      b.hideWaitOverlay();
      b.whenIdle().then(() => {
        if (!st || st !== mine || st.done) return;
        b.adoptFoe(foe, false);
        b.resumeAfterAdopt();
        b.note(_t("Противник переходит сюда!"));
        b.logEvent('left', _t("{0} дождался: противник павшего напарника теперь здесь", [b.fighters.left.name]));
        setControl(other, true);
        renderBar();
      });
      renderBar();
      return;
    }
    if (!st.result[other] && st.waiting !== other) {      // второе поле ещё идёт — переключаем игрока на него
      if (st.control === id) setControl(other, true);
      else if (st.tab === id) setTab(other);
    }
    renderBar();
    evaluate();
  }
  // 2.3.5: переходя к победителю, монстр немного «злеет» — получает случайную прибавку к одной характеристике,
  // чтобы первый из нас победивший не доставался второму слишком лёгкой добычей. Бросок — BattleRand (сетевой бой).
  const TRANSFER_BUFF_STATS = ['power', 'defense', 'initiative', 'block'];
  function angrierFoe(foe) {
    const stat = TRANSFER_BUFF_STATS[Math.floor(BattleRand.next() * TRANSFER_BUFF_STATS.length)];
    const base = (foe.stats && foe.stats[stat]) || (foe.innate && foe.innate[stat]) || 0;
    const add = Math.max(1, Math.round(base * 0.12) || (stat === 'power' ? 2 : 1));
    foe.innate = { ...(foe.innate || {}) };           // переживёт recalcStats, если он когда-то случится для этого бойца
    foe.innate[stat] = (foe.innate[stat] || 0) + add;
    foe.stats = { ...(foe.stats || {}) };              // но характеристики применяем и сразу — adoptFoe пересчёт не делает
    foe.stats[stat] = (foe.stats[stat] || 0) + add;
    foe.angrier = { stat, add };                      // для отображения в логе/карточке
    return foe;
  }
  // Живой монстр переходит с поля from на поле to (к только что победившему бойцу); боец from остаётся ждать.
  function transferFoe(from, to) {
    const mine = st, fb = boards()[from], tb = boards()[to];
    fb.whenIdle().then(() => {
      if (!st || st !== mine || st.done || st.result[from]) return;   // пока ждали, поле from само закончилось — переход отменяется
      const foe = angrierFoe(structuredClone(fb.fighters.right));
      fb.over = true; fb.stopTurnTimer(); fb.setAutopilot(false);
      fb.fighters.right.hp = 0;                            // на покинутом поле врага больше нет
      st.waiting = from;
      st.result[to] = null;
      fb.logEvent('left', _t("{0} переходит на другое поле — {1} ждёт своего часа", [foe.name, fb.fighters.left.name]));
      tb.whenIdle().then(() => {
        if (!st || st !== mine || st.done) return;
        tb.adoptFoe(foe, false);
        tb.resumeAfterAdopt();
        tb.note(_t("Второй противник переходит сюда — и выглядит злее!"));
        const statName = (typeof Gear !== 'undefined' && Gear.STAT_NAMES[foe.angrier.stat]) || foe.angrier.stat;
        tb.logEvent('left', _t("{0} переходит сюда — бой продолжается ({1} +{2})", [foe.name, statName, foe.angrier.add]));
        setControl(to, true);
        renderBar();
      });
    });
  }
  function evaluate() {
    const r = st.result;
    // 2.0.8: победа в бою вдвоём засчитывается, только если выжил герой. Пал герой — бой проигран, питомец за него не добивает.
    if (r.hero && r.hero.result === 'loss') return finish('loss');
    if (!r.hero || !r.pet) return;
    const alive = ['hero', 'pet'].filter((k) => r[k] && (r[k].result === 'win' || r[k].result === 'wait'));
    const foesLeft = ['hero', 'pet'].filter((k) => r[k] && r[k].result === 'loss' && !r[k].taken);
    if (!foesLeft.length) return finish('win');
    if (!alive.length) return finish('loss');
    const k = alive[0], src = r[foesLeft[0]], foe = src.foe;       // герой добивает противника павшего питомца
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
    // 2.0.8: поражение героя не даёт ничего, как в обычном бою (раньше за убитого питомцем врага платили и при поражении)
    let txt = result === 'win' ? m.grantDuoRewards(st.kills, true) : '';
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
    for (const o of st.petOutcomes) Pets.addTrust(pd, o.won ? 2 : -2);      // 2.1.6: доверие растёт от побед вместе и падает от поражений
    Profile.save();
    const name = Pets.petTitle(pd), after = Pets.intellect(pd);
    let line = _t("<br>{0}: опыт +{1}, ум {2} → {3}", [name, gain, before, after]).replace(/^<br>/, '');
    line += _t(" Доверие: {0}/{1}.", [Pets.trustOf(pd), Pets.TRUST_MAX]);
    if (up) line += _t(". <b class=\"lvlup\">Новый цвет: {0}!</b>", [Tiers.get(pd.tier).name]);
    if (!pd.firstWin && st.petOutcomes.some((o) => o.won)) { pd.firstWin = true; line += `<br><i>${Story.PET_LINES.firstWin}</i>`; Profile.save(); }
    return `<div class="rw-pet">${line}</div>`;
  }
  // Отступление: награда за уже убитых противников.
  function flee() {
    if (!st || st.done) return;
    st.done = true;
    petGrowth();     // 2.0.8: отступление, как и поражение, добычи не даёт
  }
  // 1.6.9: высота полосы сверху нужна CSS, чтобы карточки бойцов и поле не уезжали под неё (на телефонах с вырезом и при крупном шрифте)
  function syncBarH() {
    if (!bar) return;
    const h = Math.ceil(bar.getBoundingClientRect().height);
    if (h > 0 && document.documentElement.style.getPropertyValue('--duo-h') !== h + 'px') document.documentElement.style.setProperty('--duo-h', h + 'px');
  }
  window.addEventListener('resize', () => syncBarH());
  // 2.3.9: высота полосы измеряется, когда она действительно изменилась (ResizeObserver), а не каждые 400 мс —
  // замер страницы в таймере заставлял браузер заново считать раскладку боя по два-три раза в секунду.
  let barRO = null, barROFor = null;
  function watchBarH() {
    if (typeof ResizeObserver === 'undefined') { syncBarH(); return; }
    if (barROFor === bar) return;
    if (barRO) barRO.disconnect();
    barROFor = bar; syncBarH();
    if (bar) { barRO = new ResizeObserver(() => syncBarH()); barRO.observe(bar); }
  }
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
  return { wanted, begin, solo, end, ended, turnChanged, flee, on, setTab, setControl, get state() { return st; }, get pet() { return petB; } };
})();
