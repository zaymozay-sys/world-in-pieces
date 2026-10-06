if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Обучение у Бобра-хранителя (версия 1.2.5).

   Три части: (1) знакомство на карте, (2) учебный бой против самого Бобра — по шагам, с подсветкой нужных
   кнопок и камней, (3) экскурсия по деревне. Каждый шаг ждёт либо «Далее», либо действия игрока (ход, заклинание,
   приём, победа). Бобёр в учебном бою не бьёт в ответ и не может пасть раньше последнего шага.
   Состояние — Profile.data.tutorial = { done, step }. Пропустить можно в любой момент; пройти заново —
   в Библиотеке (вкладка «Бобёр»). Награда за первое прохождение — 100 монет и 2 зелья здоровья. */

const Tutorial = (() => {
  let box = null, idx = -1, active = false, hlEls = [];
  const name = () => (Profile.data.name ? Profile.data.name : _t("путник"));
  const gemName = () => ({ sapphire: _t("синие сапфиры"), ruby: _t("красные рубины"), emerald: _t("зелёные изумруды") }[playerFaction().gem] || _t("родные камни"));

  // ---------- шаги ----------
  // phase: 'map' | 'battle' | 'village'. wait: 'next' | 'move' | 'cast' | 'lightning' | 'ability' | 'win' | 'map'.
  // target: CSS-селектор (или функция) для подсветки; enter(): что сделать при входе в шаг.
  const STEPS = [
    { phase: 'map', text: () => _t("Здравствуй, {0}! Я Бобёр-хранитель, живу в Библиотеке и знаю о нашем мире всё. Давным-давно разбилось Великое Сердце Грани, и его осколки стали волшебными камнями. За ними охотятся все — и звери, и чудища. Я научу тебя сражаться ими.", [name()]) },
    { phase: 'map', target: '#map-zones', text: _t("Это карта. В центре — наша деревня за частоколом, вокруг — луга, леса, болота, горы и море. Туман рассеивается, когда ты подходишь ближе. Кружки с цифрой — существа: цифра и цвет — их уровень. Чем дальше от деревни, тем они сильнее.") },
    { phase: 'map', text: _t("Прежде чем идти за частокол, потренируемся. В учебном бою нет наград, но и проиграть нельзя — я буду подсказывать каждый шаг. Готов?"), nextLabel: _t("В учебный бой"), next: () => MapView.startTraining('beaver', 1) },

    { phase: 'battle', target: '#board', text: _t("Это поле боя: 36 волшебных камней. Слева — ты, справа — я. Ходите по очереди: за один ход меняешь местами два соседних камня так, чтобы собралось три или больше одинаковых в ряд.") },
    { phase: 'battle', wait: 'move', cells: true, text: _t("Поменяй местами два подсвеченных камня — соберутся три чёрных обсидиана. Запомни главное: <b>урон наносит только обсидиан</b> (чёрный куб).") },
    { phase: 'battle', target: '.fighter.left .counters', text: _t("Видишь, у меня убавилось здоровья! А синие, красные и зелёные камни урона не наносят — они складываются в твою копилку магии. Счётчики видны у твоего портрета: из них оплачиваются заклинания.") },
    { phase: 'battle', target: '#board', text: _t("Ещё правила: линия из 4 камней даёт <b>дополнительный ход</b>, из 5 — тоже и вдобавок бонус ×3. Камни с меткой x3 и x5 стоят втрое и впятеро больше. Обсидиан x5, собранный в линию, взрывает соседние камни. И важно: новые камни не сыплются сверху каждый ход — поле пополняется, только когда опустеет или на нём не останется ходов.") },
    { phase: 'battle', wait: 'move', enter: () => whenIdle(showHint), text: _t("Сделай ещё один ход. Я подсветил лучший обмен — так же работает кнопка «Подсказка» внизу, если не видишь хода.") },
    { phase: 'battle', target: '#spellbar', enter: () => giveStones(12), text: _t("Дарю тебе по 12 камней каждого цвета. Это книга заклинаний: у каждого своя цена — камней каждого вида (наведи на кнопку, чтобы прочитать). Чем выше характеристика «Магия», тем дешевле заклинания.") },
    { phase: 'battle', wait: 'cast', kinds: ['fire', 'square'], target: 'button.magic.fire, button.magic.square', enter: () => giveStones(12), text: _t("«Огненный крест» собирает в копилку камни крестом в области 5×5, а «Захват» — квадратом 3×3. Удар: постоянный урон + твой базовый + номиналы обсидианов. Выбери одно из них и нажми на клетку поля.") },
    { phase: 'battle', wait: 'lightning', target: 'button.magic.lightning', enter: () => giveStones(12), text: _t("«Шаровая молния» — самая сильная магия: весь ход каждый собранный камень, любого цвета, бьёт с силой ×1,5. Включи её!") },
    { phase: 'battle', wait: 'move', text: _t("Молния горит! Теперь собери любую линию — ударят все камни. Хитрость: Молния, а за ней Крест или Захват — самое мощное сочетание в игре.") },
    { phase: 'battle', wait: 'ability', target: 'button.magic.fac', enter: () => { fighters.left.charge = CHARGE; renderFactionButton(); },
      text: () => _t("Это приём твоего народа — «{0}»: {1}. Он заряжается, когда ты собираешь {2}, и хода не тратит. Я зарядил его — попробуй!", [playerFaction().ability.name, playerFaction().ability.desc, gemName()]) },
    { phase: 'battle', target: '#bagbar', text: () => { const A = Ammo.CATALOG[Ammo.forFaction(Profile.data.faction)]; return _t("Внизу — рюкзак. Первым лежит боеприпас твоего народа — <b>{0}</b>: {1} Выстрел хода не тратит, но за ход — только один. Дальше зелья, эликсир силы, каменная пыль и свитки — тоже без траты хода. Всё это продаётся в Лавке, а боеприпасы можно сделать в Кузнице.", [A.name, A.desc]); } },
    { phase: 'battle', target: '#hint, #restart', text: _t("В обычном бою на ход даётся 30 секунд, три пропуска подряд — поражение. «Подсказка» покажет хороший обмен, «Отступить» уводит на карту без награды. Три неверных хода подряд — тоже поражение.") },
    { phase: 'battle', wait: 'win', target: 'button.magic.strike', enter: () => { giveStones(8); weakenBeaver(); },
      text: _t("Я почти без сил — добей меня! Собери обсидиан или примени «Удар» — он бьёт твоим базовым уроном. Победа приносит опыт, монеты, ресурсы и иногда вещи.") },
    { phase: 'battle', wait: 'map', target: '.overlay .to-map', text: _t("Победа! Нажми «На карту» — покажу деревню.") },

    { phase: 'village', building: 'home', text: _t("<b>Ваш дом.</b> Здесь твой герой в полный рост и всё, что на нём надето, а справа — рюкзак. Это оружейная: здесь сундук со всеми вещами и кладовая с ресурсами. Нажми на вещь, чтобы надеть её. Менять снаряжение можно только дома, а в дорогу берёшь рюкзак — эликсиры, расходники и боеприпасы (кнопка «Рюкзак»).") },
    { phase: 'village', building: 'shop', text: _t("<b>Лавка.</b> Покупка и продажа вещей, зелий, свитков и ресурсов. Ассортимент обновляется.") },
    { phase: 'village', building: 'forge', text: _t("<b>Кузница.</b> Улучшает цвет вещей (от Красного до Обсидианового) и создаёт новые из ресурсов, что выпадают из существ.") },
    { phase: 'village', building: 'tavern', text: _t("<b>Таверна.</b> Гоблин-трактирщик даёт задания — первое уже ждёт тебя: «Первая кровь». Ещё задания есть у Мельника-мыша на Мельнице.") },
    { phase: 'village', building: 'hunter', text: _t("<b>Охотники.</b> Бестиарий: всё о встреченных существах — их приёмы, добыча и твой шанс на победу.") },
    { phase: 'village', building: 'library', text: _t("<b>Библиотека</b> — мой дом. Здесь летопись <b>осколков Великого Сердца</b>: их хранят стражи с коронами на карте — собери четыре, и проснётся последний. Ещё тут поручение дня и учебные бои. Если что-то забудешь — приходи, проведу обучение заново.") },
    { phase: 'village', building: 'artistWorkshop', text: _t("<b>Мастерская художника.</b> Журавль продаёт руны и вставляет их в вещи: по два гнезда в каждой.") },
    { phase: 'village', building: 'hall', text: _t("<b>Ратуша</b> — самое большое здание, в центре площади. На площади — <b>Торговые ряды</b>: выставляй вещи и ресурсы на продажу. Здесь твой прогресс, смена фракции и сохранение в файл — чтобы перенести героя на другое устройство.") },
    { phase: 'village', building: 'kennel', text: _t("<b>Питомник</b> — Смотрительница Ласка лечит, кормит и обучает прирученных зверей. Рядом <b>Алхимик</b>: Тётушка Жабка варит зелья из добычи, в том числе такие, каких нет в Лавке.") },
    { phase: 'village', target: '#map-zones', text: _t("Теперь в путь! Начни с существ первого уровня у деревни — крыс, ежей, гадюк. Нажми на существо, посмотри шанс победы и выбери «Подойти и напасть». За обучение — 100 монет и 2 зелья здоровья. Удачи!"), nextLabel: _t("Начать игру") },
  ];

  const cur = () => STEPS[idx];
  // 1.2.9: «учебный бой» — только пока на поле настоящий Бобёр-тренер; иначе обучение не трогает обычные бои.
  const inBattle = () => active && cur() && cur().phase === 'battle'
    && typeof fighters !== 'undefined' && fighters.right && fighters.right.monsterId === 'beaver';
  const inMapMode = () => typeof document !== 'undefined' && !document.body.classList.contains('mode-battle');
  let pending = null;                      // отложенный переход к следующему шагу (после действия игрока)
  const firstIdx = (phase) => STEPS.findIndex((x) => x.phase === phase);
  const waitIdx = (w) => STEPS.findIndex((x) => x.wait === w);

  // ---------- помощники для боя ----------
  // Ждёт, пока поле успокоится (ход Бобра, осыпание камней), и только тогда выполняет fn.
  function whenIdle(fn, tries = 40) {
    if (!inBattle()) return;
    if (typeof busy !== 'undefined' && (busy || turnSide !== 'left') && tries > 0) { setTimeout(() => whenIdle(fn, tries - 1), 150); return; }
    fn();
  }
  function giveStones(n) {
    const f = fighters.left;
    for (const t of MAGIC_TYPES) f.counts[t] = Math.max(f.counts[t], n);
    renderCounters('left');
    renderMagic();
  }
  function weakenBeaver() {
    const e = fighters.right;
    e.hp = Math.min(e.hp, 1);                     // любой удар или обсидиан добьёт
    renderFighters();
  }
  // До последнего шага Бобёр не падает: здоровье не ниже половины.
  function guardBeaver() {  // вызывается и из checkEnd — до проверки победы
    if (!inBattle() || cur().wait === 'win' || !fighters.right) return;
    const e = fighters.right;
    if (e.hp < e.max * 0.5) { e.hp = Math.round(e.max * 0.5); renderFighters(); }
  }

  // Учебное поле: внизу два обсидиана и третий над соседней клеткой — первый ход наверняка соберёт обсидиан.
  let planted = null;
  function plantBoard() {
    if (!inBattle()) return;
    const ON = GEM_TYPES.indexOf('onyx'), other = GEM_TYPES.indexOf('sapphire');
    for (let attempt = 0; attempt < 400; attempt++) {
      const typ = Array.from({ length: N * N }, () => Math.floor(Math.random() * GEM_TYPES.length));
      const set = (r, c, t) => { typ[r * N + c] = t; };
      set(N - 1, 0, ON); set(N - 1, 1, ON); set(N - 2, 2, ON); set(N - 1, 2, other);
      if (Engine.bonusMap(typ)) continue;                                   // готовых линий быть не должно
      const t2 = typ.slice(); [t2[(N - 2) * N + 2], t2[(N - 1) * N + 2]] = [t2[(N - 1) * N + 2], t2[(N - 2) * N + 2]];
      if (!Engine.bonusMap(t2)) continue;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const t = typ[r * N + c];
        grid[r][c] = { type: GEM_TYPES[t], ti: t, value: 1, el: null };
      }
      planted = [{ r: N - 2, c: 2 }, { r: N - 1, c: 2 }];
      return;
    }
  }

  // ---------- подсветка ----------
  function clearHl() {
    for (const el of hlEls) el.classList.remove('coach-hl', 'coach-cell');
    hlEls = [];
    if (typeof MapView !== 'undefined' && MapView.coachRing) MapView.coachRing(null);
  }
  function highlight() {
    clearHl();
    if (!active) return;
    const s = cur();
    if (!s) return;
    if (s.cells && planted && typeof grid !== 'undefined') {
      for (const p of planted) { const t = grid[p.r] && grid[p.r][p.c]; if (t && t.el) { t.el.classList.add('coach-cell'); hlEls.push(t.el); } }
    }
    if (s.target) for (const el of document.querySelectorAll(s.target)) { el.classList.add('coach-hl'); hlEls.push(el); }
    if (s.building && typeof MapView !== 'undefined' && MapView.coachRing) MapView.coachRing(s.building);
    place();
  }
  // Окно реплики не должно закрывать то, что показываем: цель в нижней части экрана — окно сверху, иначе снизу.
  function place() {
    if (!box) return;
    // В бою окно по умолчанию сверху (внизу кнопки «Подсказка», «Отступить» и ранец), на карте — снизу;
    // если подсвеченное оказалось на той же стороне — окно переезжает на другую.
    const mid = hlEls.map((el) => el.getBoundingClientRect()).filter((r) => r.height && r.height < innerHeight * 0.6).map((r) => (r.top + r.bottom) / 2);
    const top = cur() && cur().phase === 'battle'
      ? !mid.some((y) => y < innerHeight * 0.4)
      : mid.some((y) => y > innerHeight * 0.55);
    box.classList.toggle('at-top', top);
  }

  // ---------- окно реплики ----------
  function portrait() {
    return (typeof Art !== 'undefined' && Art.hasNpc('beaver-library')) ? Art.npcPortrait('beaver-library')
      : '<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#241d15"/><ellipse cx="50" cy="60" rx="30" ry="26" fill="#8a6a42"/><circle cx="38" cy="52" r="9" fill="none" stroke="#e3c98a" stroke-width="2"/><circle cx="62" cy="52" r="9" fill="none" stroke="#e3c98a" stroke-width="2"/></svg>';
  }
  function render() {
    if (!active) { if (box) box.hidden = true; clearHl(); return; }
    const s = cur();
    // На карте и в деревне окно прячется, пока идёт обычный бой (оно вернётся при возврате на карту).
    if (s && s.phase !== 'battle' && !inMapMode()) { if (box) box.hidden = true; clearHl(); return; }
    if (!box) {
      box = document.createElement('div');
      box.className = 'coach';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', _t("Обучение"));
      document.body.appendChild(box);
      box.addEventListener('click', onClick);
    }
    const total = STEPS.filter((x) => !hiddenStep(x)).length, shown = STEPS.slice(0, idx + 1).filter((x) => !hiddenStep(x)).length, text = typeof s.text === 'function' ? s.text() : s.text;
    const waiting = s.wait && s.wait !== 'next';
    box.className = 'coach coach-' + s.phase;
    box.hidden = false;
    box.innerHTML = _t("<span class=\"coach-portrait\">{0}</span>\n      <div class=\"coach-body\"><b class=\"coach-name\">Бобёр-хранитель <small>{1} / {2}</small></b>\n        <p>{3}</p>\n        <div class=\"coach-act\">\n          {4}\n          <button type=\"button\" class=\"coach-skip\" data-coach=\"skip\">Пропустить обучение</button>\n        </div></div>", [portrait(), shown, total, text, waiting ? _t("<span class=\"coach-wait\">Жду твоего действия…</span>") : `<button type="button" class="primary" data-coach="next">${s.nextLabel || _t("Далее")}</button>`]);
    setTimeout(highlight, 60);
  }
  function onClick(e) {
    const b = e.target.closest('button[data-coach]');
    if (!b) return;
    if (b.dataset.coach === 'skip') return finish(false);
    const s = cur();
    if (s.next && !inMapMode()) return;      // «В учебный бой» — только с карты, не посреди обычного боя
    go(idx + 1);                 // сначала шаг вперёд: бой, запущенный в next(), уже видит фазу «battle»
    if (s.next) s.next();
  }
  // Здания, ещё закрытые по числу побед (см. unlocks.js), в обучении не показываем — о них скажет сообщение «Открыто: …»
  const hiddenStep = (s) => !!(s.building && typeof Unlocks !== 'undefined' && typeof Profile !== 'undefined' && !Unlocks.isOpen(Profile.data, s.building));
  function go(i) {
    if (!active) return;
    idx = i;
    while (idx < STEPS.length && hiddenStep(STEPS[idx])) idx++;
    if (idx >= STEPS.length) return finish(true);
    Profile.data.tutorial = Object.assign(Profile.data.tutorial || {}, { step: idx });
    Profile.save();
    const s = cur();
    if (s.enter) { try { s.enter(); } catch (err) { /* бой ещё не готов */ } }
    render();
  }

  // ---------- события игры ----------
  function schedule(i, ms) {
    clearTimeout(pending);
    pending = setTimeout(() => { pending = null; go(i); }, ms);
  }
  function event(kind, detail) {
    if (!active) return;
    guardBeaver();
    const s = cur();
    if (!s) return;
    if (kind === 'board-ready') return highlight();
    if (kind === 'battle') return render();                 // начался бой: окно на карте/в деревне прячется
    if (kind === 'map' && s.phase === 'battle') {
      // Вернулись на карту посреди учебного боя. Победа уже была («На карту» нажали сразу) — к экскурсии по деревне;
      // отступление или поражение — снова к приглашению в учебный бой.
      const won = s.wait === 'win' && typeof fighters !== 'undefined' && fighters.right && fighters.right.hp <= 0;
      clearTimeout(pending); pending = null;
      return go(s.wait === 'map' || won ? waitIdx('map') + 1 : firstIdx('battle') - 1);
    }
    if (kind === 'map') return render();
    if (pending || s.wait !== kind) return;                 // один переход на одно действие
    if (kind === 'cast' && s.kinds && !s.kinds.includes(detail)) return;
    schedule(idx + 1, kind === 'win' ? 900 : 500);
  }

  function start(force = false) {
    if (!force && Profile.data.tutorial && Profile.data.tutorial.done) return;
    active = true;
    Profile.data.tutorial = Object.assign(Profile.data.tutorial || {}, { done: false });
    if (typeof Screens !== 'undefined' && Screens.isOpen) Screens.close();
    go(0);
  }
  function finish(completed) {
    active = false;
    clearTimeout(pending); pending = null;
    clearHl();
    if (box) box.hidden = true;
    const d = Profile.data, first = !(d.tutorial && d.tutorial.rewarded);
    d.tutorial = Object.assign(d.tutorial || {}, { done: true, step: null });
    if (completed && first) {
      d.tutorial.rewarded = true;
      Profile.addCoins(100);
      Profile.addConsumable('potion', 2);
      if (typeof MapView !== 'undefined' && MapView.toast) MapView.toast(_t("Бобёр вручил 100 монет и 2 зелья здоровья. В путь!"));
    }
    Profile.save();
    if (typeof MapView !== 'undefined') MapView.renderHud();
  }
  // Перезагрузка посреди обучения — начинаем заново с первого шага (поле step сохраняется, но бой не восстановить).
  function resumeIfStarted() {
    const d = Profile.data, t = d.tutorial;
    if (d.faction && t && !t.done && t.step !== null && t.step !== undefined) setTimeout(() => start(true), 900);
  }
  // Новый герой (ещё ни одной победы) — обучение начинается само.
  function maybeAutoStart() {
    const d = Profile.data;
    if (d.faction && !(d.tutorial && d.tutorial.done) && !(d.wins > 0)) setTimeout(() => start(), 600);
  }

  return { _go: go, start, finish, event, resumeIfStarted, plantBoard, guard: guardBeaver, enemySkips: () => inBattle(), maybeAutoStart, inBattle, get active() { return active; }, get planted() { return planted; }, STEPS };
})();
