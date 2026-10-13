if (typeof _t === 'undefined' && typeof require === 'function') require('./i18n.js'); // i18n
/* Осада деревни (1.7.0). Без интерфейса — можно тестировать в Node.

   К воротам приходит волна существ зоны героя (3–5). Герой выходит и бьёт их обычными боями. Защита деревни:
   башни у ворот перед боем снимают часть ХП с врага (volley), забор держит осаду дольше (minutes) и прячет часть
   добычи (theft); всё растёт с уровнем Ратуши (0…5). Если время вышло, а враги остались, они уносят часть монет и
   одну пачку ресурсов (до 10%) и убегают — «похитители» стоят на карте ещё полчаса, победа над ними возвращает добычу.
   Осада приходит раз в сутки (решение владельца: без «раз в 10 побед») и только когда игрок на карте. */

const Siege = (() => {
  const MIN_WINS = 5;             // новичка не трогаем
  const LOOT_MIN = 30;            // сколько минут похитители ждут на карте
  const GRACE_MS = 60000;         // время, добавляемое после боя, если срок вышел посреди него
  const HALL_MAX = 5;

  const clampHall = (n) => Math.max(0, Math.min(HALL_MAX, Math.floor(Number(n) || 0)));
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  // last — { day } про прошлую осаду (или null). Возвращает, пора ли: раз в календарные сутки, не раньше пятой победы.
  function due(last, now, wins) {
    if (!(wins >= MIN_WINS)) return false;
    return !(last && typeof last === 'object' && last.day === dayKey(now));
  }
  const started = (last, now, wins) => ({ day: dayKey(now), wins });

  const size = (heroTier) => 3 + (heroTier >= 4 ? 1 : 0) + (heroTier >= 8 ? 1 : 0);

  // Оборона по уровню Ратуши: volley — доля ХП врага, снимаемая башнями; minutes — длительность осады; theft — доля добычи, что унесут при провале.
  function defense(hall) {
    const L = clampHall(hall);
    return { volley: Math.round((0.08 + 0.03 * L) * 100) / 100, minutes: 8 + L, theft: Math.round((0.10 - 0.01 * L) * 100) / 100 };
  }

  // cells — свободные соты у ворот (по порядку предпочтения); pickSpecies(tier, rand) — вид существа.
  function make(rand, heroTier, cells, pickSpecies, now, hall) {
    const n = Math.min(size(heroTier), cells.length), D = defense(hall);
    const raiders = [];
    for (let i = 0; i < n; i++) raiders.push({ id: `s${now}-${i}`, idx: cells[i], species: pickSpecies(heroTier, rand), tier: heroTier, dead: false });
    return { id: now, t0: now, t1: now + D.minutes * 60000, tier: heroTier, total: n, raiders, over: false, looters: null, lootEnds: 0 };
  }

  const remaining = (s) => (s ? s.raiders.filter((r) => !r.dead).length : 0);
  const active = (s) => !!s && !s.over && remaining(s) > 0;
  const expired = (s, now) => !!s && !s.over && now >= s.t1;
  const timeLeft = (s, now) => (s ? Math.max(0, s.t1 - now) : 0);

  // Отбить одного: возвращает { won } — все ли побеждены.
  function kill(s, id) {
    const r = s && s.raiders.find((x) => x.id === id);
    if (!r || r.dead) return { won: false, ok: false };
    r.dead = true;
    return { won: remaining(s) === 0, ok: true };
  }

  // Что унесут оставшиеся: coins — монеты героя, stacks — [{kind,tier,n}] его ресурсов.
  function theft(hall, left, total, coins, stacks, rand = Math.random) {
    if (!(left > 0) || !(total > 0)) return { coins: 0, res: null };
    const F = defense(hall).theft * Math.min(1, left / total);
    const c = Math.max(0, Math.floor((Number(coins) || 0) * F));
    const pool = (stacks || []).filter((x) => x && x.n >= 3);
    let res = null;
    if (pool.length) {
      const x = pool[Math.floor(rand() * pool.length)], n = Math.floor(x.n * F);
      if (n >= 1) res = { kind: x.kind, tier: x.tier, n };
    }
    return { coins: c, res };
  }

  // Делит добычу на k похитителей (остаток — первым).
  function split(loot, k) {
    const out = [];
    for (let i = 0; i < k; i++) out.push({ coins: 0, res: null });
    if (!k) return out;
    const c = loot.coins || 0, base = Math.floor(c / k), rest = c - base * k;
    out.forEach((o, i) => { o.coins = base + (i === 0 ? rest : 0); });
    if (loot.res && loot.res.n > 0) {
      const n = loot.res.n, per = Math.floor(n / k), rest2 = n - per * k;
      out.forEach((o, i) => { const m = per + (i === 0 ? rest2 : 0); if (m > 0) o.res = { kind: loot.res.kind, tier: loot.res.tier, n: m }; });
    }
    return out;
  }

  // Срок вышел: оставшиеся становятся похитителями с долей добычи. loot — общая добыча (см. theft).
  function expire(s, now, loot) {
    if (!s || s.over) return s;
    const left = s.raiders.filter((r) => !r.dead), parts = split(loot || { coins: 0, res: null }, left.length);
    s.over = true;
    s.looters = left.map((r, i) => ({ id: r.id, idx: r.idx, species: r.species, tier: r.tier, loot: parts[i], dead: false }));
    s.lootEnds = now + LOOT_MIN * 60000;
    return s;
  }
  const liveLooters = (s, now) => (s && s.over && s.looters && now < s.lootEnds ? s.looters.filter((l) => !l.dead) : []);
  // Победа над похитителем: возвращает его добычу.
  function killLooter(s, id) {
    const l = s && s.looters && s.looters.find((x) => x.id === id);
    if (!l || l.dead) return null;
    l.dead = true;
    return l.loot;
  }

  // Награда за полную победу: коэффициент к монетам тайника (cacheCoins) и число ресурсов.
  const rewardCoins = (cache, total) => Math.round(cache * (1 + total * 0.6));

  // Проверка сохранённого состояния (битые данные — null).
  function sane(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.raiders)) return null;
    const okR = (r) => r && typeof r.id === 'string' && Number.isInteger(r.idx) && r.idx >= 0 && typeof r.species === 'string' && Number.isInteger(r.tier) && r.tier >= 1 && r.tier <= 10;
    if (!s.raiders.every(okR) || !Number.isFinite(s.t1) || !Number.isFinite(s.t0)) return null;
    if (s.looters && !(Array.isArray(s.looters) && s.looters.every(okR))) return null;
    return s;
  }

  return { MIN_WINS, LOOT_MIN, GRACE_MS, HALL_MAX, dayKey, due, started, size, defense, make, remaining, active, expired, timeLeft, kill, theft, split, expire, liveLooters, killLooter, rewardCoins, sane };
})();

if (typeof module !== 'undefined') module.exports = Siege;
