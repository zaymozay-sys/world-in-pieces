// Турнир (клиент, 1.9.x): запись, ожидание боя по сетке, итоги и награда. Бои идут через js/live.js (WebSocket).
// Модуль чистый: связь с сервером (remote), сокет и запуск боя (onBattle) передаются снаружи — проверяется в Node.
const Tourney = (() => {
  // Награда по итогам: за каждый выигранный раунд — доля монет, победителю — большая награда и титул.
  // view — вид завершённого турнира с сервера; me — { out } запись участника (out: в каком раунде вылетел, 0 — чемпион).
  function reward(view, myPid, coin) {
    if (!view || view.state !== 'done') return null;
    const total = view.rounds.length, champ = view.championPid === myPid;
    const mine = view.entrants && view.me ? view.me : null;
    if (!champ && !mine) return null;
    const won = champ ? total : Math.max(0, (mine.out || 1) - 1);
    const coins = champ ? coin * (6 + 4 * total) : coin * 2 * won;
    return { champion: champ, roundsWon: won, rounds: total, coins, title: champ ? 'tourneyChamp' : null };
  }
  // Награда сезона: тройка лучших за прошлую неделю или месяц (item от сервера: { kind, place }); титул — только за первое место
  const SEASON_MULT = { week: [8, 5, 3], month: [20, 12, 8] };
  function seasonReward(item, coin) {
    const m = item && SEASON_MULT[item.kind]; if (!m || !(item.place >= 1 && item.place <= 3)) return null;
    return { coins: coin * m[item.place - 1], title: item.place === 1 ? (item.kind === 'week' ? 'ratingWeek' : 'ratingMonth') : null, kind: item.kind, place: item.place };
  }
  // 1.9.4: награда бойцам народа-победителя недели: как за второе место недельного рейтинга
  const folkReward = (coin) => coin * 5;
  // Ранги живых боёв: по числу побед над настоящими игроками (победы подтверждены сервером квитанциями)
  const PVP_RANKS = [
    { id: 'pvp1', at: 1, name: 'Новобранец дуэлей', mult: 2 }, { id: 'pvp2', at: 5, name: 'Дуэлянт', mult: 5 }, { id: 'pvp3', at: 15, name: 'Боец', mult: 10 },
    { id: 'pvp4', at: 40, name: 'Ветеран', mult: 20 }, { id: 'pvp5', at: 100, name: 'Мастер дуэлей', mult: 40 }, { id: 'pvp6', at: 250, name: 'Легенда арены', mult: 80 },
  ];
  // индекс достигнутого ранга (-1 — ещё нет), следующий ранг и сколько побед до него
  const pvpRank = (wins) => {
    let i = -1; for (let k = 0; k < PVP_RANKS.length; k++) if (wins >= PVP_RANKS[k].at) i = k;
    const next = PVP_RANKS[i + 1] || null;
    return { index: i, rank: i >= 0 ? PVP_RANKS[i] : null, next, left: next ? next.at - wins : 0 };
  };
  const place = (view, me) => {
    if (!view || !me) return null;
    if (view.championPid && me.pid === view.championPid) return 1;
    return null;
  };

  const create = ({ remote, Live, WS, onBattle, onChange = () => {}, setT = setTimeout, clrT = clearTimeout, pollMs = 20000 }) => {
    const S = { tour: null, last: null, serverNow: 0, offset: 0, msg: '', net: null, busy: false };
    let poll = null, stopped = false;
    const emit = () => { try { onChange(S); } catch (e) { /* интерфейс не должен ронять связь */ } };
    const active = () => S.tour && S.tour.joined && (S.tour.state === 'open' || S.tour.state === 'running');
    const closeNet = () => { if (S.net) { try { S.net.close(); } catch (e) { /* уже закрыт */ } S.net = null; } };
    const openNet = async () => {
      if (S.net || stopped || !Live || !WS) return;
      const acc = await remote.liveAccess(); if (!acc || S.net || stopped) return;
      const net = Live.create({ url: acc.url, token: acc.token, WS, retryMs: 2000, retries: 200 }); S.net = net;
      net.stay(true);
      net.on('tour', (m) => { if (m && m.tour) { S.tour = m.tour; if (m.tour.state === 'done' || m.tour.state === 'cancelled') S.last = m.tour.state === 'done' ? m.tour : S.last; emit(); } });
      net.on('matched', (m) => { if (m.tourney) { S.net = null; onBattle(net, m); } });
      net.on('lost', () => { if (S.net === net) { S.net = null; S.msg = 'lost'; emit(); } });
      net.on('auth-fail', () => { if (S.net === net) { S.net = null; } });
      net.connect();
    };
    const refresh = async () => {
      const r = await remote.tourney(); if (!r) return S;
      S.tour = r.tour; S.last = r.last || S.last; S.offset = (r.now || Date.now()) - Date.now();
      if (active()) openNet(); else if (S.tour && !S.tour.joined) closeNet();
      emit(); return S;
    };
    const waiting = () => !!(S.tour && S.tour.me && S.tour.me.match && S.tour.me.match.state === 'wait');
    const schedule = () => { if (stopped) return; poll = setT(async () => { try { await refresh(); } catch (e) { /* повторим */ } schedule(); }, waiting() ? Math.min(pollMs, 4000) : pollMs); };   // пока ждём явку — обновляем чаще, чтобы отсчёт был живым
    return {
      state: S, refresh,
      start() { stopped = false; refresh().catch(() => {}); schedule(); },
      stop() { stopped = true; if (poll) clrT(poll); closeNet(); },
      async join(info) { S.busy = true; emit(); const r = await remote.tourneyJoin(info); S.busy = false; S.msg = r && r.error ? r.error : ''; if (r && r.tour) { S.tour = r.tour; openNet(); } emit(); return r; },
      async leave() { await remote.tourneyLeave(); closeNet(); await refresh(); },
      // после боя турнира связь нужна снова (следующий раунд)
      resume() { S.net = null; if (active()) openNet(); },
      secondsLeft(ts) { return Math.max(0, Math.round((ts - (Date.now() + S.offset)) / 1000)); },
      secondsToStart() { return S.tour ? Math.max(0, Math.round((S.tour.startAt - (Date.now() + S.offset)) / 1000)) : 0; },
    };
  };
  return { create, reward, place, seasonReward, folkReward, PVP_RANKS, pvpRank };
})();
if (typeof module !== 'undefined') module.exports = Tourney;
