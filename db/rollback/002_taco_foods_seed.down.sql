-- Reverte db/migrations/002_taco_foods_seed.sql. Falha se algum food_logs ainda
-- apontar para a TACO (rode antes o rollback 004).
DELETE FROM taco_foods WHERE id BETWEEN 1 AND 597;
