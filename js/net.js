/* Слой связи с площадками (1.9.0, подготовка). Игра обращается только сюда, а не к SDK площадок напрямую.
   Пока сервера нет: основное сохранение остаётся в localStorage (синхронно, как раньше), а Net
   - определяет площадку (site / yandex / vk),
   - выдаёт внутренний номер игрока (pid), не зависящий от площадки,
   - по желанию зеркалит снимок профиля в хранилище площадки (дебаунс), когда адаптер это умеет.
   Адаптеры яндекса и ВК — заготовки по общему знанию API: перед запуском СВЕРИТЬ с актуальной документацией площадок (TODO(verify)).
   Чистый модуль: окружение (window, SDK) передаётся снаружи, поэтому тестируется в Node. */
const Net = (() => {
  const PID_RE = /^p-[0-9a-z]{8}-[0-9a-z]{8}-[0-9a-z]{8}$/;
  const newPid = (rnd = Math.random) => {
    const part = () => Math.floor(rnd() * 36 ** 8).toString(36).padStart(8, '0');
    return 'p-' + part() + '-' + part() + '-' + part();
  };
  const validPid = (s) => typeof s === 'string' && PID_RE.test(s);

  // какая площадка: по подключённым SDK и параметрам адреса (env = { YaGames, vkBridge, search })
  function detect(env = {}) {
    if (env.YaGames) return 'yandex';
    if (env.vkBridge || /(^|[?&])vk_user_id=/.test(env.search || '')) return 'vk';
    return 'site';
  }

  // Адаптеры. Общий вид: { id, init(env) → Promise, externalId() → string|null, pull() → Promise<string|null>, push(snapshot) → Promise<boolean>, canMirror }
  const siteAdapter = () => ({
    id: 'site', canMirror: false,
    proof: (env) => (env.guest ? { platform: 'site', guest: env.guest } : null),
    init: async () => true,
    externalId: () => null,
    pull: async () => null,
    push: async () => false,
  });
  const yandexAdapter = () => { // сверено с докой Яндекс Игр (окт. 2026): getUniqueID — постоянный id; setData до 200 КБ, лимит 100 запросов/5 мин (поэтому дебаунс >= 4 с и защита по размеру)
    let player = null;
    return {
      id: 'yandex', canMirror: true,
      async init(env) { const ysdk = await env.YaGames.init(); player = await ysdk.getPlayer({ signed: true }); return true; },
      proof: () => (player && player.signature ? { platform: 'yandex', signature: player.signature } : null),
      externalId: () => (player && player.getUniqueID ? String(player.getUniqueID()) : null),
      async pull() { const d = player && player.getData ? await player.getData(['snapshot']) : null; return d && typeof d.snapshot === 'string' ? d.snapshot : null; },
      async push(s) { if (!player || !player.setData || String(s).length > 150000) return false; await player.setData({ snapshot: s }, true); return true; },
    };
  };
  // параметры запуска ВК из адреса (?vk_user_id=…&sign=…): сервер сам проверит подпись
  const launchParams = (search) => {
    const out = {};
    String(search || '').replace(/^\?/, '').split('&').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) { try { out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* битый параметр пропускаем */ } } });
    const keep = {};
    Object.keys(out).forEach((k) => { if (k.indexOf('vk_') === 0 || k === 'sign') keep[k] = out[k]; });
    return keep;
  };
  const vkAdapter = () => { // сверено (окт. 2026): VKWebAppInit возвращает {result:true}; хранилище ВК: значение до 4096 байт, до 1000 ключей — снимок профиля там не поместится, его хранит свой сервер. TODO(verify): подпись запуска (sign) для сервера
    let uid = null;
    return {
      id: 'vk', canMirror: false,
      proof: (env) => { const p = launchParams(env.search); return p.sign ? { platform: 'vk', params: p } : null; },
      async init(env) { await env.vkBridge.send('VKWebAppInit'); try { const u = await env.vkBridge.send('VKWebAppGetUserInfo'); uid = u && u.id ? String(u.id) : null; } catch (e) { uid = null; } return true; },
      externalId: () => uid,
      pull: async () => null,
      push: async () => false,
    };
  };
  const ADAPTERS = { site: siteAdapter, yandex: yandexAdapter, vk: vkAdapter };

  // Свой сервер (server/): вход по подписи площадки, снимок профиля с версией. Работает, только если игре дали адрес (env.serverUrl) и fetch.
  const makeRemote = (env, adapter, now) => {
    const base = String(env.serverUrl || '').replace(/\/+$/, '');
    let token = null, authing = null, off = false, lastVer = Number(env.lastVersion) || 0;
    const call = async (method, path, body) => {
      const r = await env.fetch(base + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body == null ? undefined : JSON.stringify(body) });
      let j = null; try { j = await r.json(); } catch (e) { j = null; }
      return { code: r.status, json: j };
    };
    const auth = async () => {
      if (off) return false;
      if (token) return true;
      if (authing) return authing;
      authing = (async () => {
        const pid = env.getPid ? env.getPid() : null;
        const proof = adapter.proof ? adapter.proof(env) : null;
        if (!proof || !validPid(pid)) return false;
        const r = await call('POST', '/auth', Object.assign({ pid }, proof));
        if (r.code === 200 && r.json && r.json.token) { token = r.json.token; return true; }
        return false;
      })();
      try { return await authing; } finally { authing = null; }
    };
    return {
      get enabled() { return !!base && !off; },
      get lastVersion() { return lastVer; },
      auth,
      // отправка: версия = время, всегда больше предыдущей
      async push(snapshot) {
        if (!(await auth())) return false;
        const version = Math.max(now(), lastVer + 1);
        let r = await call('PUT', '/snapshot', { version, snapshot });
        if (r.code === 401) { token = null; if (!(await auth())) return false; r = await call('PUT', '/snapshot', { version, snapshot }); }
        if (r.code === 200) { lastVer = version; if (env.saveVersion) env.saveVersion(version); return true; }
        if (r.code === 409 && r.json && r.json.serverVersion) lastVer = Number(r.json.serverVersion) || lastVer;
        return false;
      },
      // есть ли на сервере снимок новее нашего последнего отправленного
      async newer() {
        if (!(await auth())) return null;
        const r = await call('GET', '/snapshot');
        if (r.code !== 200 || !r.json || typeof r.json.snapshot !== 'string') return null;
        return Number(r.json.version) > lastVer ? { version: Number(r.json.version), snapshot: r.json.snapshot } : null;
      },
      // боевая карточка героя для боёв с тенью живого игрока и подбор соперников по уровню
      async putCard(card) { if (!(await auth())) return false; const r = await call('PUT', '/card', { card }); return r.code === 200; },
      async opponents(level) {
        if (!(await auth())) return null;
        const r = await call('GET', '/opponents?level=' + encodeURIComponent(Math.round(level)));
        return r.code === 200 && r.json && Array.isArray(r.json.list) ? r.json.list : null;
      },
      // адрес и токен для боя в реальном времени (WebSocket, см. js/live.js)
      async liveAccess() { if (!(await auth())) return null; return { url: base.replace(/^http/, 'ws') + '/live', token }; },
      // турнир: состояние, запись, выход (бой по сетке приходит по WebSocket)
      async tourney() { if (!(await auth())) return null; const r = await call('GET', '/tournament'); return r.code === 200 && r.json ? r.json : null; },
      async tourneyJoin(info) { if (!(await auth())) return null; const r = await call('POST', '/tournament/join', info); return r.code === 200 && r.json ? r.json : { error: (r.json && r.json.error) || 'fail' }; },
      // награда за турнир: сервер выдаёт её один раз и возвращает вид турнира для расчёта
      async tourneyClaim(id) { if (!(await auth())) return null; const r = await call('POST', '/tournament/claim', { id }); return r.code === 200 && r.json ? r.json : null; },
      // рейтинг: period — all | week | month | year
      async depth() { if (!(await auth())) return null; const r = await call('GET', '/depth'); return r.code === 200 && r.json && Array.isArray(r.json.list) ? r.json : null; },
      async seasonBoard(kind) { if (!(await auth())) return null; const r = await call('GET', '/rating/season/board?kind=' + encodeURIComponent(kind)); return r.code === 200 && r.json && Array.isArray(r.json.list) ? r.json : null; },
      async factions() { if (!(await auth())) return null; const r = await call('GET', '/factions'); return r.code === 200 && r.json && Array.isArray(r.json.list) ? r.json : null; },
      async factionClaim(id) { if (!(await auth())) return null; const r = await call('POST', '/factions/claim', { id }); return r.code === 200 && r.json ? r.json : null; },
      async square() { if (!(await auth())) return null; const r = await call('GET', '/square'); return r.code === 200 && r.json && Array.isArray(r.json.posts) ? r.json : (r.code === 409 ? { error: 'no-card' } : null); },
      async squarePost(text) { if (!(await auth())) return { error: 'net' }; const r = await call('POST', '/square/post', { text }); return r.code === 200 ? { ok: true } : { error: (r.json && r.json.error) || 'net' }; },
      async squareReport(id) { if (!(await auth())) return { error: 'net' }; const r = await call('POST', '/square/report', { id }); return r.code === 200 ? { ok: true } : { error: (r.json && r.json.error) || 'net' }; },
      async squareHide(id) { if (!(await auth())) return false; const r = await call('POST', '/square/hide', { id }); return r.code === 200; },
      async squareUnhide() { if (!(await auth())) return false; const r = await call('POST', '/square/unhide', {}); return r.code === 200; },
      async squareDelete(id) { if (!(await auth())) return false; const r = await call('POST', '/square/delete', { id }); return r.code === 200 && !!(r.json && r.json.deleted); },
      async rating(period) { if (!(await auth())) return null; const r = await call('GET', '/rating?period=' + encodeURIComponent(period)); return r.code === 200 && r.json && Array.isArray(r.json.list) ? r.json : null; },
      // награды сезона: что положено за прошлую неделю и месяц, и одноразовое получение
      async funnel(e) { if (!base || off) return false; try { const r = await call('POST', '/funnel', { e }); return r.code === 200; } catch (x) { return false; } },
      async seasonList() { if (!(await auth())) return null; const r = await call('GET', '/rating/season'); return r.code === 200 && r.json && Array.isArray(r.json.list) ? r.json.list : null; },
      async seasonClaim(id) { if (!(await auth())) return null; const r = await call('POST', '/rating/season/claim', { id }); return r.code === 200 && r.json ? r.json : null; },
      // квитанции за подтверждённые живые бои (сервер отдаёт каждую один раз)
      async rewardsClaim() { if (!(await auth())) return null; const r = await call('POST', '/rewards/claim', {}); return r.code === 200 && r.json && Array.isArray(r.json.list) ? r.json.list : null; },
      async tourneyLeave() { if (!(await auth())) return false; const r = await call('POST', '/tournament/leave', {}); return r.code === 200; },
      accept(version) { lastVer = version; if (env.saveVersion) env.saveVersion(version); },
      // удалить всё о себе на сервере и больше туда не писать (иначе следующее сохранение создало бы запись заново)
      async deleteMe() { if (!(await auth())) return false; const r = await call('DELETE', '/me'); if (r.code === 200) { token = null; off = true; if (env.onDeleted) env.onDeleted(); return true; } return false; },
    };
  };

  const create = (env = {}, opts = {}) => {
    const platform = opts.platform || detect(env);
    const adapter = (opts.adapter) || ADAPTERS[platform]();
    const delay = opts.delay != null ? opts.delay : 4000;
    const setT = opts.setTimeout || (typeof setTimeout === 'function' ? setTimeout : null);
    const clearT = opts.clearTimeout || (typeof clearTimeout === 'function' ? clearTimeout : null);
    const remote = env.serverUrl && typeof env.fetch === 'function' ? makeRemote(env, adapter, opts.now || Date.now) : null;
    let ready = false, timer = null, last = null, lastCard = null, failures = 0;
    const api = {
      platform, adapter, remote, env,
      get ready() { return ready; },
      get failures() { return failures; },
      async init() { try { await adapter.init(env); ready = true; } catch (e) { ready = false; failures++; } return ready; },
      externalId: () => { try { return adapter.externalId(); } catch (e) { return null; } },
      // внутренний номер: берём из профиля, иначе создаём и кладём в профиль
      pidFor(data) { if (data && !validPid(data.pid)) data.pid = newPid(opts.rnd); return data ? data.pid : null; },
      // зеркало снимка: вызывать после каждого сохранения профиля; реально отправится не чаще раза в delay мс
      mirror(snapshot) {
        if (!(adapter.canMirror || remote) || !ready || typeof snapshot !== 'string') return false;
        last = snapshot;
        if (timer || !setT) return true;
        timer = setT(() => { timer = null; api.flush(); }, delay);
        return true;
      },
      async flush() {
        if (timer && clearT) { clearT(timer); timer = null; }
        if (last == null || !(adapter.canMirror || remote) || !ready) return false;
        const s = last; last = null;
        let ok = false;
        if (adapter.canMirror) { try { ok = !!(await adapter.push(s)); } catch (e) { failures++; } }
        if (remote) {
          try { ok = !!(await remote.push(s)) || ok; } catch (e) { failures++; }
          // карточка героя уходит на сервер вместе со снимком, но только когда она изменилась
          if (env.getCard) { try { const c = JSON.stringify(env.getCard()); if (c !== lastCard && (await remote.putCard(JSON.parse(c)))) lastCard = c; } catch (e) { failures++; } }
        }
        return ok;
      },
      async pull() { if (!ready) return null; try { return await adapter.pull(); } catch (e) { failures++; return null; } },
    };
    return api;
  };
  // единственный экземпляр игры: Net.boot(...) вызывается один раз при запуске, Net.current — для остального кода
  let current = null;
  const boot = (env, opts) => {
    current = create(env, opts);
    return current.init().then((ok) => {
      // после входа: нет ли на сервере сохранения новее (например, играли на другом устройстве)
      if (ok && current.remote && env.onNewer) { return current.remote.newer().then((n) => { if (n) env.onNewer(n, current.remote); return ok; }).catch(() => ok); }
      return ok;
    });
  };
  return { boot, get current() { return current; }, create, detect, newPid, validPid, ADAPTERS, siteAdapter, yandexAdapter, vkAdapter };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Net;
