-- Рейтинг живых боёв (Эло) и журнал изменений для рейтингов за неделю, месяц и год.
CREATE TABLE IF NOT EXISTS ratings (
  pid TEXT PRIMARY KEY REFERENCES players(pid) ON DELETE CASCADE,
  nick TEXT NOT NULL,
  elo INT NOT NULL DEFAULT 1000,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ratings_elo_idx ON ratings (elo DESC);
CREATE TABLE IF NOT EXISTS rating_log (
  id BIGSERIAL PRIMARY KEY,
  pid TEXT NOT NULL REFERENCES players(pid) ON DELETE CASCADE,
  opp TEXT NOT NULL,
  at BIGINT NOT NULL,
  delta INT NOT NULL,
  win BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS rating_log_pid_at_idx ON rating_log (pid, at);
CREATE INDEX IF NOT EXISTS rating_log_at_idx ON rating_log (at);
-- Кто уже получил награду за турнир (один раз на турнир).
CREATE TABLE IF NOT EXISTS tournament_claims (
  tid TEXT NOT NULL,
  pid TEXT NOT NULL REFERENCES players(pid) ON DELETE CASCADE,
  PRIMARY KEY (tid, pid)
);
