-- Credentials for standalone-site email accounts; no email is stored in public player cards.
CREATE TABLE IF NOT EXISTS email_accounts (
  pid TEXT PRIMARY KEY REFERENCES players(pid) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  pid TEXT NOT NULL REFERENCES email_accounts(pid) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS email_tokens_expires ON email_tokens(expires_at);
