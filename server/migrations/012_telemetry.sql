-- Отчёты тестировщиков: бои, ошибки, сообщения о проблемах (хранятся 30 дней).
CREATE TABLE IF NOT EXISTS telemetry (
  id BIGSERIAL PRIMARY KEY,
  at BIGINT NOT NULL,
  pid TEXT NOT NULL,
  nick TEXT NOT NULL DEFAULT '',
  ver TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS telemetry_at ON telemetry(at);
CREATE INDEX IF NOT EXISTS telemetry_kind_at ON telemetry(kind, at);
