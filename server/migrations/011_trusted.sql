-- Подтверждённые показатели: сервер доверяет росту прогресса только в темпе честной игры (см. savecheck.js).
-- NULL у старых записей: пока считаются равными заявленным (совместимость со сделанными ранее сохранениями).
ALTER TABLE player_checks ADD COLUMN IF NOT EXISTS tx DOUBLE PRECISION;
ALTER TABLE player_checks ADD COLUMN IF NOT EXISTS tw DOUBLE PRECISION;
ALTER TABLE player_checks ADD COLUMN IF NOT EXISTS tf INT;
