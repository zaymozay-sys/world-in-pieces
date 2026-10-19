-- Последние показатели профиля игрока и временная пометка «подозрительный рост».
CREATE TABLE IF NOT EXISTS player_checks (
  pid TEXT PRIMARY KEY REFERENCES players(pid) ON DELETE CASCADE,
  at BIGINT NOT NULL,
  xp DOUBLE PRECISION NOT NULL DEFAULT 0,
  wins DOUBLE PRECISION NOT NULL DEFAULT 0,
  flag_until BIGINT NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT ''
);
