// Проверка подписи площадки. Возвращает внешний id игрока или null.
const crypto = require('crypto');

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ВКонтакте: sign = base64url(HMAC-SHA256(секрет, строка из параметров vk_*, отсортированных по имени, вида a=1&b=2)).
// Алгоритм по описанию проверки подписи запуска мини-приложений ВК.
const verifyVk = (params, secret, opts = {}) => {
  if (!secret || !params || typeof params !== 'object' || typeof params.sign !== 'string') return null;
  const keys = Object.keys(params).filter(k => k.indexOf('vk_') === 0).sort();
  if (!keys.length || !params.vk_user_id) return null;
  const str = keys.map(k => k + '=' + encodeURIComponent(String(params[k]))).join('&');
  const sign = b64url(crypto.createHmac('sha256', secret).update(str).digest());
  if (!eq(sign, params.sign)) return null;
  const ts = Number(params.vk_ts);
  const now = opts.now != null ? opts.now : Math.floor(Date.now() / 1000);
  if (opts.maxAgeSec && Number.isFinite(ts) && now - ts > opts.maxAgeSec) return null;
  return String(params.vk_user_id);
};

// Яндекс Игры: player.signature = "<подпись>.<JSON>", обе части в base64. По документации (раздел про покупки):
// подпись = base64(HMAC-SHA256(секретный ключ, РАСКОДИРОВАННАЯ строка JSON)); ключ создаётся в консоли при подключении покупок.
// TODO(verify): поля внутри JSON игрока в документации не перечислены — id ищем в нескольких местах; проверить на настоящей подписи с площадки.
const verifyYandex = (signature, secret) => {
  if (!secret || typeof signature !== 'string') return null;
  const i = signature.indexOf('.');
  if (i < 1) return null;
  const sig = signature.slice(0, i);
  let json;
  try { json = Buffer.from(signature.slice(i + 1), 'base64').toString('utf8'); } catch (e) { return null; }
  const want = crypto.createHmac('sha256', secret).update(json).digest('base64');
  if (!eq(want, sig)) return null;
  try {
    const p = JSON.parse(json);
    const d = p && typeof p.data === 'object' && p.data ? p.data : p;
    const id = d && (d.uniqueID != null ? d.uniqueID : d.id != null ? d.id : (p && p.id != null ? p.id : null));
    return id != null ? String(id) : null;
  } catch (e) { return null; }
};

// Сайт: гостевой токен придумывает игра (не короче 32 символов); у нас в базе только его хеш.
const verifySite = (guest) => {
  if (typeof guest !== 'string' || guest.length < 32 || guest.length > 128 || !/^[A-Za-z0-9_-]+$/.test(guest)) return null;
  return crypto.createHash('sha256').update(guest).digest('hex');
};

const externalId = (platform, body, cfg) => {
  if (platform === 'site') return verifySite(body.guest);
  if (platform === 'yandex') return verifyYandex(body.signature, cfg.yandexSecret);
  if (platform === 'vk') return verifyVk(body.params, cfg.vkSecret, { maxAgeSec: cfg.vkMaxAgeSec });
  return null;
};
module.exports = { verifyVk, verifyYandex, verifySite, externalId, b64url };
