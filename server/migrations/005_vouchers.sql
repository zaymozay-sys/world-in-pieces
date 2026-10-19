-- Квитанции за живые бои: сервер подтверждает итог, игра один раз забирает награду.
CREATE TABLE IF NOT EXISTS vouchers (
  id BIGSERIAL PRIMARY KEY,
  pid TEXT NOT NULL REFERENCES players(pid) ON DELETE CASCADE,
  at BIGINT NOT NULL,
  win BOOLEAN NOT NULL,
  level INT NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT false,
  claimed BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS vouchers_pid_idx ON vouchers (pid, claimed, at);
