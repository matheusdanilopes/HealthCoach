-- Reverte db/migrations/003_custom_foods.sql (apaga os rótulos cadastrados).
-- Rode antes o rollback 004.
DROP TABLE IF EXISTS custom_foods;
