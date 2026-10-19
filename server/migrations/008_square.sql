-- Площадка народа: короткие записи игроков одной фракции (хранятся неделю).
CREATE TABLE IF NOT EXISTS square_posts (
  id BIGSERIAL PRIMARY KEY,
  faction TEXT NOT NULL,
  pid TEXT NOT NULL REFERENCES players(pid) ON DELETE CASCADE,
  nick TEXT NOT NULL,
  body TEXT NOT NULL,
  at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS square_posts_faction_at_idx ON square_posts (faction, at);
CREATE INDEX IF NOT EXISTS square_posts_pid_at_idx ON square_posts (pid, at);
