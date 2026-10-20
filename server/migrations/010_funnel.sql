-- Анонимная воронка новичка: счётчики событий по дням (без идентификаторов игроков).
CREATE TABLE IF NOT EXISTS funnel_counts (
  day DATE NOT NULL,
  event TEXT NOT NULL,
  n BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event)
);
