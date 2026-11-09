-- Origem do cálculo de cada lançamento. Colunas novas, todas opcionais:
-- registros antigos ficam como estão (source NULL = anterior a esta mudança).
-- Nenhum UPDATE/DELETE em dados existentes.
-- Aditiva. Reverter: db/rollback/004_food_logs_nutrition_source.down.sql
ALTER TABLE food_logs
  ADD COLUMN IF NOT EXISTS quantity_g numeric(7,1) CHECK (quantity_g > 0 AND quantity_g <= 5000),
  ADD COLUMN IF NOT EXISTS taco_food_id integer REFERENCES taco_foods(id),
  ADD COLUMN IF NOT EXISTS custom_food_id uuid,
  ADD COLUMN IF NOT EXISTS source text CHECK (source = ANY (ARRAY['taco','rotulo','estimado','manual'])),
  ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false;

-- custom_food_id só pode apontar para um alimento do mesmo usuário.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_logs_custom_food_fkey') THEN
    ALTER TABLE food_logs ADD CONSTRAINT food_logs_custom_food_fkey
      FOREIGN KEY (custom_food_id, user_id) REFERENCES custom_foods (id, user_id)
      ON DELETE SET NULL (custom_food_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_food_logs_needs_review ON food_logs (user_id, log_date) WHERE needs_review;
