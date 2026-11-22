# Email accounts + server cloud saves (standalone site only)

This feature is **not enabled on the public game automatically**. `main` keeps `GEM_SERVER=''`; do not flip the public website to an untested server. VK Mini Apps and Yandex Games retain their platform sign-in flows.

## Architecture

- GitHub Pages (HTML, CSS, JS): renders the game only. It cannot run Node.js or store a PostgreSQL database.
- Separate HTTPS Node.js service (`server/`): authentication, sessions, saves and online play.
- Persistent PostgreSQL: game data + `014_email_accounts.sql` tables; migrations run on server startup.
- Transactional email service (Resend): sends verification and password-reset links using an approved sending domain.

**Prerequisites**: Node.js >= 20 (22 recommended), TLS-enabled public HTTPS hostname for server, PostgreSQL, a verified domain for sender mail, API key, and working backups. Do not use a memory-only backend for real accounts: it loses all data on restart.

## Setup before beta

1. Create test PostgreSQL and Node.js application on a server provider. Start with **staging** only, separate from production.
2. On hosting platform configure the variables in `server/.env.example`: `DATABASE_URL`, `ALLOWED_ORIGINS`, `PUBLIC_SITE_URL`, `RESEND_API_KEY`, `MAIL_FROM`, `PLATFORMS=site`. `MAIL_FROM` must be a verified sender. Never commit or paste actual secret values.
3. For GitHub Pages project URLs use `PUBLIC_SITE_URL=https://<owner>.github.io/<repo>/` (the trailing slash matters for email links). `ALLOWED_ORIGINS` contains only its origin, e.g. `https://<owner>.github.io` (no path). Include your custom-domain origin if used.
4. Deploy `server/` with working WebSocket upgrades and set HTTPS. Check `GET /health` → `{ "ok": true }`.
5. In a **test build** set `window.GEM_SERVER` in `js/config.js` to the **HTTPS** API base, e.g. `https://api.example.com` (never put a key here). Publish the test client on a protected preview site.
6. On the test site: play as guest → save hero → register using an email → confirm link → sign in on another browser/device → confirm same character/coins/items, and that conflicts cannot overwrite progress.
7. Test forgotten-password link, logout, password reset invalidating sessions, wrong password, expiration, interrupted connection, and PostgreSQL backup restoration.
8. Only after approval deploy to production. Keep staging and production databases separate.

## User flow and data safety

- Registering from the standalone website **links the existing guest PID to an email**, after first syncing its current profile.
- Verification link is a one-time 64-hex secret in the URL fragment, **not in an API query string**. Valid for 24 hours.
- Password reset link valid for 30 minutes; resets revoke existing sessions.
- Password is hashed using Node.js `scrypt` with a unique salt; server does not store the plaintext password or log email addresses.
- An email-protected account can no longer log in using its original guest token.
- Signing in on another device first restores the authenticated **server snapshot** and keeps a timestamped local backup of that device's previous save. Local storage is still used as a **cache**, but PostgreSQL is the authoritative cross-device profile store.
- Optimistic concurrency: verified email accounts must send `expectedVersion` on every snapshot write; outdated devices get HTTP 409 and syncing is stopped instead of silently overwriting the newer copy.
- If a save conflicts, a person may need to re-login and intentionally choose the cloud version. Backups are kept locally.
- Account session tokens currently live in browser localStorage for persistent login. This is not immune to XSS: use HTTPS, keep dependencies updated, review dynamic HTML injection and plan CSP hardening before an open release.
- No **email** authentication UI is shown inside Yandex Games/VK. Those platforms must continue using their own verified identities.

## Production precautions

- Email storage and security/privacy notices: an email address is personal data; publish a privacy notice and a data-deletion process before users register.
- Configure TLS, automated daily backup with restoration rehearsal, API uptime/logging without secrets, trusted reverse-proxy settings and rate limits. Test outgoing email deliverability.
- For multiple Node.js instances, replace in-memory mail cooldown/rate-limit state with distributed throttling (Redis or database) and coordinate WebSockets. A single instance is appropriate only for a small beta and measured capacity.
- In-app profile can still be used offline as a cache. Never promise server durability for offline actions before a successful sync. Show a cloud-save status indicator in a later UI pass.
- For stronger security in a public release, plan email change, session management/revocation, notification on password reset, and abuse monitoring.

## Development tests

Run from repository root:

```
node server/tests/account-auth.test.js
node server/tests/server.test.js
node tests/net.test.js
```
