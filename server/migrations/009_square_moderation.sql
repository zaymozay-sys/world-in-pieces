-- Модерация площадки: жалобы на записи и скрытие авторов у себя.
CREATE TABLE IF NOT EXISTS square_reports (
  post_id BIGINT NOT NULL,
  reporter TEXT NOT NULL REFERENCES players(pid) ON DELETE CASCADE,
  author TEXT NOT NULL REFERENCES players(pid) ON DELETE CASCADE,
  at BIGINT NOT NULL,
  PRIMARY KEY (post_id, reporter)
);
CREATE INDEX IF NOT EXISTS square_reports_author_at_idx ON square_reports (author, at);
CREATE INDEX IF NOT EXISTS square_reports_reporter_at_idx ON square_reports (reporter, at);
CREATE TABLE IF NOT EXISTS square_hides (
  pid TEXT NOT NULL REFERENCES players(pid) ON DELETE CASCADE,
  author TEXT NOT NULL REFERENCES players(pid) ON DELETE CASCADE,
  PRIMARY KEY (pid, author)
);
