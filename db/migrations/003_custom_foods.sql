-- Alimentos de rótulo (industrializados), cadastrados por usuário e reaproveitados.
-- Valores sempre por 100 g; porcao_g guarda a porção do rótulo informada.
-- Aditiva. Reverter: db/rollback/003_custom_foods.down.sql
CREATE TABLE IF NOT EXISTS custom_foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  nome_normalizado text NOT NULL,
  kcal_100g numeric(7,2) NOT NULL CHECK (kcal_100g >= 0 AND kcal_100g <= 900),
  protein_100g numeric(6,2) CHECK (protein_100g >= 0 AND protein_100g <= 100),
  carbs_100g numeric(6,2) CHECK (carbs_100g >= 0 AND carbs_100g <= 100),
  fat_100g numeric(6,2) CHECK (fat_100g >= 0 AND fat_100g <= 100),
  porcao_g numeric(7,1) CHECK (porcao_g > 0 AND porcao_g <= 5000),
  fonte text NOT NULL DEFAULT 'rotulo' CHECK (fonte = 'rotulo'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nome_normalizado),
  -- Alvo da FK composta de food_logs: garante que o alimento é do mesmo usuário.
  UNIQUE (id, user_id)
);
CREATE INDEX IF NOT EXISTS custom_foods_nome_trgm_idx ON custom_foods USING gin (nome_normalizado gin_trgm_ops);
