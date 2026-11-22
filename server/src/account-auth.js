// Email sign-in for the standalone website. This does not replace VK/Yandex identity.
// Never put email addresses or plaintext passwords in logs, audit rows or URLs.
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const emailOf = (x) => {
  if (typeof x !== 'string') return null;
  const v = x.trim().toLowerCase();
  return v.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(v) ? v : null;
};
const passOk = (p) => typeof p === 'string' && p.length >= 12 && p.length <= 128;
const passwordHash = async (p) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(p, Buffer.from(salt, 'hex'), 64, { N: 16384, r: 8, p: 1 })).toString('hex');
  return `scrypt$16384$${salt}$${hash}`;
};
const verifyPassword = async (p, encoded) => {
  if (typeof p !== 'string' || p.length > 128 || !/^scrypt\$16384\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(encoded || '')) return false;
  const parts = encoded.split('$');
  const hash = await scrypt(p, Buffer.from(parts[2], 'hex'), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(hash, Buffer.from(parts[3], 'hex'));
};
const newSecret = () => crypto.randomBytes(32).toString('hex');
const TOKEN_LIFE = { verify: 24 * 3600000, reset: 30 * 60000 };

function create({ cfg, store, now = Date.now, authed, session, send, readBody, mailer }) {
  const mailCooldowns = new Map();
  const available = () => !!(cfg.mailApiKey && cfg.mailFrom && /^https:\/\//.test(cfg.publicSiteUrl || ''));
  const deliver = mailer || (async (to, purpose, secret) => {
    const link = cfg.publicSiteUrl.replace(/#.*$/, '').replace(/\/$/, '/') + '#wip-email-' + purpose + '=' + secret;
    const subject = purpose === 'verify' ? 'World in Pieces — подтвердите почту' : 'World in Pieces — смена пароля';
    const text = purpose === 'verify' ? `Подтвердите адрес почты, чтобы сохранить героя: ${link}\nСсылка действительна 24 часа.\nЕсли это не вы — проигнорируйте письмо.` : `Чтобы сменить пароль, откройте ссылку: ${link}\nСсылка действительна 30 минут.\nЕсли это не вы — проигнорируйте письмо.`;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + cfg.mailApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.mailFrom, to: [to], subject, text }),
    });
    if (!r.ok) { console.error('Отправка письма не удалась:', r.status); throw new Error('mail_unavailable'); }
  });
  const deliverToken = async (account, purpose) => {
    const key = purpose + ':' + account.pid;
    if (now() - (mailCooldowns.get(key) || 0) < 60000) return false;
    mailCooldowns.set(key, now());
    if (mailCooldowns.size > 5000) for (const [k, t] of mailCooldowns) if (now() - t > 60000) mailCooldowns.delete(k);
    const secret = newSecret();
    await store.emailTokenPut(account.pid, purpose, sha(secret), now() + TOKEN_LIFE[purpose]);
    try { await deliver(account.email, purpose, secret); } catch (e) { mailCooldowns.delete(key); throw e; }
    return true;
  };
  const issue = async (pid) => {
    const token = newSecret();
    await store.createSession(sha(token), pid, now() + (cfg.sessionDays || 30) * 86400000);
    const saved = await store.getSnapshot(pid);
    return { pid, token, snapshot: saved ? saved.body : null, version: saved ? saved.version : 0 };
  };
  async function route(req, res, url, origin) {
    const reply = (code, data) => { send(res, code, data, origin); return true; };
    const method = req.method;
    if (url === '/account/status' && method === 'GET') {
      const pid = await authed(req); if (!pid) return reply(401, { error: 'auth' });
      const a = await store.emailByPid(pid);
      return reply(200, { email: a ? a.email : null, verified: !!(a && a.verified), pid });
    }
    if (!available()) return reply(503, { error: 'email_not_configured' });
    if (url === '/account/register' && method === 'POST') {
      const pid = await authed(req); if (!pid) return reply(401, { error: 'auth' });
      if (await store.playerPlatform(pid) !== 'site') return reply(403, { error: 'site_only' });
      if (await store.emailByPid(pid)) return reply(409, { error: 'account_exists' });
      const b = await readBody(req), email = b && emailOf(b.email);
      if (!email || !passOk(b.password)) return reply(400, { error: 'input' });
      const account = { pid, email, passwordHash: await passwordHash(b.password), verified: false };
      if (!(await store.emailCreate(account))) return reply(409, { error: 'email_taken' });
      try { await deliverToken(account, 'verify'); } catch (e) { return reply(503, { error: 'mail_unavailable', retry: true }); }
      return reply(200, { pending: true });
    }
    if (url === '/account/resend' && method === 'POST') {
      const pid = await authed(req); if (!pid) return reply(401, { error: 'auth' });
      const a = await store.emailByPid(pid); if (!a || a.verified) return reply(400, { error: 'not_pending' });
      try { if (!(await deliverToken(a, 'verify'))) return reply(429, { error: 'try_later' }); } catch (e) { return reply(503, { error: 'mail_unavailable' }); }
      return reply(200, { pending: true });
    }
    if (url === '/account/verify' && method === 'POST') {
      const b = await readBody(req);
      if (!b || typeof b.token !== 'string' || !/^[0-9a-f]{64}$/.test(b.token)) return reply(400, { error: 'token' });
      const pid = await store.emailTokenConsume(sha(b.token), 'verify', now());
      if (!pid) return reply(400, { error: 'token' });
      await store.emailVerify(pid);
      await store.revokeSessions(pid); // Guest token stops working once the character is email-protected.
      return reply(200, await issue(pid));
    }
    if (url === '/account/login' && method === 'POST') {
      const b = await readBody(req), email = b && emailOf(b.email);
      if (!email || typeof b.password !== 'string' || b.password.length > 128) return reply(401, { error: 'credentials' });
      const a = await store.emailByAddress(email);
      // Equal-cost password derivation for both known and unknown emails.
      const fallback = 'scrypt$16384$00000000000000000000000000000000$' + '0'.repeat(128);
      const ok = await verifyPassword(b.password, a ? a.passwordHash : fallback);
      if (!a || !ok) return reply(401, { error: 'credentials' });
      if (!a.verified) return reply(403, { error: 'verify_required' });
      return reply(200, await issue(a.pid));
    }
    if (url === '/account/reset/request' && method === 'POST') {
      const b = await readBody(req), email = b && emailOf(b.email);
      if (email) {
        const a = await store.emailByAddress(email);
        if (a && a.verified) try { await deliverToken(a, 'reset'); } catch (e) { console.error('Не удалось отправить письмо восстановления'); }
      }
      return reply(200, { accepted: true }); // never disclose whether an email exists
    }
    if (url === '/account/reset/confirm' && method === 'POST') {
      const b = await readBody(req);
      if (!b || typeof b.token !== 'string' || !/^[0-9a-f]{64}$/.test(b.token) || !passOk(b.password)) return reply(400, { error: 'input' });
      const pid = await store.emailTokenConsume(sha(b.token), 'reset', now());
      if (!pid) return reply(400, { error: 'token' });
      await store.emailSetPassword(pid, await passwordHash(b.password));
      await store.revokeSessions(pid);
      return reply(200, await issue(pid));
    }
    if (url === '/account/logout' && method === 'POST') {
      const token = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization || '');
      if (token) await store.deleteSession(sha(token[1]));
      return reply(200, { ok: true });
    }
    return reply(404, { error: 'unknown' });
  }
  return { route, available };
}
module.exports = { create, emailOf, passOk, passwordHash, verifyPassword };
