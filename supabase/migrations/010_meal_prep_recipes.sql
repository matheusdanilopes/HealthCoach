-- Tabela para persistir receitas de marmita aprovadas pelo usuário
CREATE TABLE IF NOT EXISTS meal_prep_recipes (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  meal_count       INTEGER     NOT NULL DEFAULT 10,
  goal             TEXT        NOT NULL DEFAULT 'emagrecimento',
  budget           TEXT        NOT NULL DEFAULT 'economico',
  plan_label       TEXT        DEFAULT 'A',
  avg_calories     INTEGER,
  avg_protein      INTEGER,
  avg_carbs        INTEGER,
  avg_fat          INTEGER,
  estimated_cost   NUMERIC(10,2),
  cost_per_meal    NUMERIC(10,2),
  ingredients      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  steps            JSONB       NOT NULL DEFAULT '[]'::jsonb,
  shopping_list    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  ai_explanation   TEXT,
  is_favorite      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meal_prep_recipes_user_idx
  ON meal_prep_recipes (user_id, created_at DESC);
