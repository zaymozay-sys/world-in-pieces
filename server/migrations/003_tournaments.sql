-- Турниры живых игроков: состояние целиком (участники, сетка), чтобы турнир пережил перезапуск сервера.
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  start_at BIGINT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tournaments_state_idx ON tournaments (state, start_at);
