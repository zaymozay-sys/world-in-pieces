// Настройки только из переменных окружения; ключей в коде нет.
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const load = (env = process.env) => ({
  port: num(env.PORT, 8080),
  databaseUrl: env.DATABASE_URL || '',
  // какие платформы принимает ЭТО развёртывание (по облакам: yandex-облако = site,yandex; VK Cloud = vk)
  platforms: (env.PLATFORMS || 'site').split(',').map(s => s.trim()).filter(Boolean),
  yandexSecret: env.YANDEX_SECRET || '',
  vkSecret: env.VK_SECRET || '',
  vkMaxAgeSec: num(env.VK_MAX_AGE_SEC, 86400),
  allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  maxBody: num(env.MAX_BODY, 300 * 1024),
  sessionDays: num(env.SESSION_DAYS, 30),
  keepSnapshots: num(env.KEEP_SNAPSHOTS, 3),
  arenaSpread: num(env.ARENA_SPREAD, 5), // на сколько уровней может отличаться соперник
  tourneyHours: (env.TOURNEY_HOURS || '17').split(',').map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h < 24), // часы начала турнира по UTC
  tourneyLevel: num(env.TOURNEY_LEVEL, 50),   // уровень героя у всех участников
  rateIp: num(env.RATE_IP, 120),       // запросов в минуту с адреса
  statsKey: env.STATS_KEY || '',      // ключ для чтения счётчиков воронки (/funnel); пусто — чтение выключено
  rateAuth: num(env.RATE_AUTH, 20),    // входов в минуту с адреса
});
module.exports = { load };
