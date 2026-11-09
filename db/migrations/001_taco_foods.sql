-- TACO 4ª edição (NEPA/UNICAMP): valores por 100 g, base do cálculo de kcal e
-- macros feito pelo app (a IA só identifica alimento + gramas).
-- Aditiva. Reverter: db/rollback/001_taco_foods.down.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS taco_foods (
  id integer PRIMARY KEY,                      -- "Número do Alimento" na TACO
  nome text NOT NULL,                          -- descrição oficial, ex.: 'Arroz, tipo 1, cozido'
  nome_normalizado text NOT NULL,              -- minúsculo, sem acento/pontuação (busca)
  categoria text NOT NULL,
  kcal_100g numeric(7,2) NOT NULL CHECK (kcal_100g >= 0 AND kcal_100g <= 900),
  protein_100g numeric(6,2) CHECK (protein_100g >= 0 AND protein_100g <= 100),
  carbs_100g numeric(6,2) CHECK (carbs_100g >= 0 AND carbs_100g <= 100),
  fat_100g numeric(6,2) CHECK (fat_100g >= 0 AND fat_100g <= 100)
);
-- Busca aproximada (pg_trgm).
CREATE INDEX IF NOT EXISTS taco_foods_nome_trgm_idx ON taco_foods USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS taco_foods_nome_normalizado_trgm_idx ON taco_foods USING gin (nome_normalizado gin_trgm_ops);
