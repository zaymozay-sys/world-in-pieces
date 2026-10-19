-- Боевая карточка игрока для боёв «с тенью» на арене: характеристики и вещи, без личных данных.
CREATE TABLE IF NOT EXISTS cards (
  pid TEXT PRIMARY KEY REFERENCES players(pid) ON DELETE CASCADE,
  level INT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cards_level_idx ON cards (level);
