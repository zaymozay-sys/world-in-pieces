-- Лучший уровень подземелья из последнего сохранения (для рейтинга глубины).
ALTER TABLE player_checks ADD COLUMN IF NOT EXISTS floor INT NOT NULL DEFAULT 0;
