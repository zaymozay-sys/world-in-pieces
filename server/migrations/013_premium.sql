-- Искры Сердца: баланс, журнал операций (ref уникален — защита от двойной обработки) и купленные права.
CREATE TABLE IF NOT EXISTS premium_wallet (
  pid TEXT PRIMARY KEY,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  test_at BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS premium_ledger (
  id BIGSERIAL PRIMARY KEY,
  pid TEXT NOT NULL,
  delta BIGINT NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT NOT NULL UNIQUE,
  at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS premium_ledger_pid ON premium_ledger(pid, at);
CREATE TABLE IF NOT EXISTS premium_rights (
  pid TEXT NOT NULL,
  item TEXT NOT NULL,
  at BIGINT NOT NULL,
  PRIMARY KEY (pid, item)
);
