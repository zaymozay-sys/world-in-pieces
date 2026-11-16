/* Запуск игры (2.3.9: вынесено из game.js): панель заклинаний, настройки, лента заходов, тень моба, карта, заставка,
   отклик интерфейса. Загружается после game.js и duo.js. Всё, что здесь выполняется, — выполняется один раз при открытии страницы. */
buildSpellbar();
loadSettings();
onGearChanged();
// 1.9.10: лента заходов — отмечаем заход; награду предлагаем, когда обучение позади, есть хотя бы одна победа и на экране
// ничего не открыто (повторяем попытку, пока игрок не освободит экран)
setTimeout(() => {
  if (typeof DevJump !== 'undefined' && DevJump.cmd()) return;   // 2.3.9: в режиме проверок (#dev-…) окно награды не всплывает поверх проверяемого экрана (раньше это зависело от скорости загрузки)
  let can = false;
  try { const d = Profile.data; d.streak = Streak.clean(d.streak); can = Streak.visit(d.streak, Daily.today()); Profile.save(); } catch (e) { return; }
  let tries = 0;
  const offer = () => {
    try {
      const d = Profile.data, tut = d.tutorial || {};
      if (!can || !tut.done || (d.wins || 0) < 1 || Streak.available(d.streak, Daily.today()) === false) return;
      const busy = Screens.isOpen || (typeof Tutorial !== 'undefined' && Tutorial.active) || document.body.classList.contains('mode-battle');
      if (!busy) return Screens.openLogin();
      if (++tries < 20) setTimeout(offer, 3000);
    } catch (e) { /* лента не должна мешать игре */ }
  };
  offer();
}, 2500);
/* 2.3.9: тень под качающимся мобом — отдельный слой. Раньше тень (box-shadow) менялась прямо у портрета: сначала в
   CSS-анимации (перерисовка 60 раз в секунду), потом скриптом 7 раз в секунду — и это оставалось почти всей нагрузкой боя
   в покое. Теперь перед портретом стоит элемент .mob-shadow того же размера: он качается той же анимацией mob-bob, а две
   его части несут крайние тени (0 7px 9px -5px / .75 и 0 11px 12px -7px / .5) и плавно сменяют друг друга прозрачностью
   с той же кривой ease-in-out. Всё это ведёт видеокарта. Скрипт только ставит слой на место портрета и сверяет фазу.
   Слой виден, пока портрет качается; собственная тень портрета (свечение цвета, кольцо оформления) в это время скрыта —
   так было и раньше: анимация тени перекрывала её. После удара, у павшего и при «меньше движения» качания нет — слой
   убирается и портрет показывает своё обычное свечение. */
const mobShadow = (() => {
  if (typeof document === 'undefined') return () => {};
  const avatars = document.getElementsByClassName('avatar');   // живой список: без обхода документа
  const shOf = new WeakMap();
  const bobOf = (av) => { try { return av.getAnimations().find((x) => x.animationName === 'mob-bob' && x.playState !== 'idle' && x.playState !== 'finished') || null; } catch (e) { return null; } };
  const off = (av) => { const sh = shOf.get(av); if (sh && sh.classList.contains('on')) sh.classList.remove('on'); if (av.classList.contains('has-sh')) av.classList.remove('has-sh'); };
  function sync(av) {
    if (!av.isConnected || !av.closest('.fighter.right')) return;
    const a = bobOf(av);
    if (!a || !av.offsetWidth) { off(av); return; }                    // не качается или не на экране — тени нет
    let sh = shOf.get(av);
    if (!sh || sh.nextElementSibling !== av) {
      if (sh) sh.remove();
      sh = document.createElement('i'); sh.className = 'mob-shadow'; sh.setAttribute('aria-hidden', 'true');
      if (typeof sh.getAnimations !== 'function') return;              // старый браузер: остаётся неподвижная тень из CSS
      av.parentNode.insertBefore(sh, av); shOf.set(av, sh);
    }
    const w = av.offsetWidth, h = av.offsetHeight, key = av.offsetLeft + ',' + av.offsetTop + ',' + w + ',' + h;
    if (sh.dataset.k !== key || !sh.classList.contains('on')) {
      sh.dataset.k = key;
      sh.style.borderRadius = getComputedStyle(av).borderRadius;      // портрет бывает круглым и со скруглёнными углами (оформление)
      sh.style.width = w + 'px'; sh.style.height = h + 'px'; sh.style.left = av.offsetLeft + 'px'; sh.style.top = av.offsetTop + 'px';
      sh.classList.add('on'); av.classList.add('has-sh');
      const dx = av.offsetLeft - sh.offsetLeft, dy = av.offsetTop - sh.offsetTop;   // если точка отсчёта у слоя другая — поправка
      if (dx) sh.style.left = av.offsetLeft + dx + 'px';
      if (dy) sh.style.top = av.offsetTop + dy + 'px';
    }
    // фаза: слой и его части идут строго в такт с качанием портрета
    try { if (a.startTime != null) for (const x of sh.getAnimations({ subtree: true })) if (x.startTime !== a.startTime) x.startTime = a.startTime; } catch (e) { /* без сверки тень просто идёт со своей фазой */ }
  }
  function all() {
    if (!document.body.classList.contains('mode-battle') || document.hidden) return;
    for (const av of avatars) sync(av);
  }
  setInterval(all, 1000);                                              // место портрета могло измениться (раскладка, поворот, новый бой)
  window.addEventListener('resize', () => requestAnimationFrame(all));
  document.addEventListener('animationstart', (e) => {
    const t = e.target; if (!t || !t.classList || !t.classList.contains('avatar')) return;
    if (e.animationName === 'mob-hurt') off(t);                        // удар снимает качание — тень убираем сразу
    else if (e.animationName === 'mob-bob') { sync(t); requestAnimationFrame(() => sync(t)); }
  });
  return all;
})();
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
    const fx = SplashFx.play(el, {
      title: _t('Хрупкий мир'), sub: _t('Хрупкий мир') === 'Хрупкий мир' ? 'W O R L D   I N   P I E C E S' : '',
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
              if (v.win) Profile.noteMaster('pvp', pv.wins, false);   // 2.3.8: лесенка «Победитель живых»
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

// 2.0.9: имя бойца обрезано — полное имя в подсказке и по нажатию
document.addEventListener('click', (e) => {
  const n = e.target.closest && e.target.closest('.fighter .fname');
  if (!n || n.scrollWidth <= n.clientWidth) return;
  n.title = n.textContent;
  let t = document.getElementById('name-pop');
  if (!t) { t = document.createElement('div'); t.id = 'name-pop'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = n.textContent; t.hidden = false;
  const r = n.getBoundingClientRect();
  t.style.left = Math.max(8, Math.min(window.innerWidth - t.offsetWidth - 8, r.left)) + 'px'; t.style.top = (r.bottom + 6) + 'px';
  clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 2500);
});

// 2.0.9: отклик интерфейса — недоступная кнопка «качается», кошелёк подпрыгивает при изменении суммы
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest && e.target.closest('button:disabled');
  if (!b || b.classList.contains('nope')) return;
  b.classList.add('nope'); setTimeout(() => b.classList.remove('nope'), 320);
}, true);
(() => {
  if (typeof MutationObserver !== 'function' || typeof document === 'undefined') return;
  let lastW;
  // 2.3.9: «живой» список кошельков на странице. Раньше при каждом изменении страницы (в бою — много раз в секунду) кошелёк
  // искался обходом всего документа из десятков тысяч узлов; теперь, пока кошелька нет, проверка мгновенная.
  const heads = document.getElementsByClassName('wallet-head');
  const mo = new MutationObserver((ms) => {
    let shown = false; for (const h of heads) if (h.closest('.modal-back')) { shown = true; break; }
    if (!shown) { lastW = undefined; return; }
    for (const m of ms) {
      const n = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      const w = n && n.closest && (n.closest('.wallet-head') || (n.querySelector && n.querySelector('.wallet-head')));
      if (!w) continue;
      const t = w.textContent;
      if (lastW !== undefined && lastW !== t) { w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); }
      lastW = t;
    }
  });
  const start = () => mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

/* 2.4.1: длинное нажатие на телефоне показывает подсказку (title) — наведения на сенсорном экране нет */
(() => {
  let timer = null, tip = null, sx = 0, sy = 0, shownAt = 0;
  const hide = () => { if (tip) { tip.remove(); tip = null; } };
  const cancel = () => { clearTimeout(timer); timer = null; };
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    hide(); cancel();
    const t = e.target.closest && e.target.closest('[title]');
    if (!t || !t.getAttribute('title')) return;
    sx = e.clientX; sy = e.clientY;
    timer = setTimeout(() => {
      const txt = t.getAttribute('title'); if (!txt) return;
      tip = document.createElement('div'); tip.className = 'longpress-tip'; tip.textContent = txt;
      document.body.appendChild(tip);
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.max(6, Math.min(innerWidth - w - 6, sx - w / 2)) + 'px';
      tip.style.top = Math.max(6, sy - h - 18) + 'px';
      shownAt = Date.now();
    }, 500);
  }, { passive: true });
  document.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); }, { passive: true });
  for (const ev of ['pointerup', 'pointercancel', 'scroll']) document.addEventListener(ev, () => { cancel(); if (tip) setTimeout(hide, Math.max(0, 1800 - (Date.now() - shownAt))); }, { passive: true, capture: true });
})();

/* 2.4.2: имя в панели бойца не переносится на вторую строку — шрифт уменьшается, пока имя не поместится (не меньше 8 px) */
(() => {
  let busy = false, queued = false;
  const fit = () => {
    if (busy) return; busy = true;
    try {
      for (const n of document.querySelectorAll('.fighter .fname')) {
        n.style.fontSize = '';
        if (!n.clientWidth) continue;
        let fs = parseFloat(getComputedStyle(n).fontSize) || 13;
        while (n.scrollWidth > n.clientWidth + 1 && fs > 8) { fs -= 0.5; n.style.fontSize = fs + 'px'; }
      }
    } finally { busy = false; }
  };
  const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; fit(); }); };
  const start = () => { new MutationObserver(later).observe(document.body, { childList: true, subtree: true, characterData: true }); window.addEventListener('resize', later); later(); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
