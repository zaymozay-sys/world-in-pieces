const http = require('http');
const { load } = require('./config');
const { create, cleanCard, trustedLevel, sha } = require('./app');
const live = require('./live');
const tourWire = require('./tour-wire');
const ratingMod = require('./rating');

(async () => {
  const cfg = load();
  const store = cfg.databaseUrl ? await require('./store-pg').create(cfg.databaseUrl) : require('./store-memory').create();
  if (!cfg.databaseUrl) console.warn('DATABASE_URL не задан: данные в памяти, после перезапуска пропадут');
  const tw = tourWire.make(cfg, { persist: (id, state, startAt, body) => store.saveTournament(id, state, startAt, body) });
  tw.trn.restore(await store.loadTournaments());          // идущий турнир продолжается после перезапуска
  const { handler } = create({ cfg, store, tourney: tw.trn });
  // раз в 6 часов: убираем просроченные сессии и записи журнала старше 6 месяцев
  const purge = () => store.purge(Date.now(), 183 * 86400000).catch((e) => console.error('очистка не удалась', e.message));
  purge(); const purgeTimer = setInterval(purge, 6 * 3600000); purgeTimer.unref();
  let lvCore = null;
  const rh = ratingMod.hook(store, Date.now, (pid, m) => { if (lvCore) lvCore.sendPid(pid, m); });
  const srv = http.createServer(handler);
  const lv = live.attach({ server: srv, store, cfg, sha, live: { cleanCard, cleanCardFor: async (pid, card) => cleanCard(card, await trustedLevel(store, pid)), cfg: { spread: cfg.arenaSpread }, onEnd: (e) => { tw.onEnd(e); rh(e); } } });
  lvCore = lv.core; tw.bind(lv.core);
  srv.listen(cfg.port, () => console.log('сервер слушает порт ' + cfg.port + ', платформы: ' + cfg.platforms.join(',')));
  const stop = () => lv.close() || srv.close(() => store.close().then(() => process.exit(0)));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
})().catch((e) => { console.error(e); process.exit(1); });
