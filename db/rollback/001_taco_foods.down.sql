-- Reverte db/migrations/001_taco_foods.sql. Rode antes os rollbacks 004, 003 e 002.
DROP TABLE IF EXISTS taco_foods;
-- pg_trgm fica instalada (pode ser usada por outros objetos); remova à mão se quiser:
-- DROP EXTENSION IF EXISTS pg_trgm;
