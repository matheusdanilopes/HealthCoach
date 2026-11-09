-- Reverte db/migrations/004_food_logs_nutrition_source.sql. Remove só as colunas
-- novas; os dados originais de food_logs (kcal, macros, nome...) não mudam.
DROP INDEX IF EXISTS idx_food_logs_needs_review;
ALTER TABLE food_logs DROP CONSTRAINT IF EXISTS food_logs_custom_food_fkey;
ALTER TABLE food_logs
  DROP COLUMN IF EXISTS needs_review,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS custom_food_id,
  DROP COLUMN IF EXISTS taco_food_id,
  DROP COLUMN IF EXISTS quantity_g;
