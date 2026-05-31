-- Add timing and serving fields to meal_prep_recipes
ALTER TABLE meal_prep_recipes ADD COLUMN IF NOT EXISTS porcoes            INTEGER;
ALTER TABLE meal_prep_recipes ADD COLUMN IF NOT EXISTS tempo_preparo_min  INTEGER;
ALTER TABLE meal_prep_recipes ADD COLUMN IF NOT EXISTS tempo_cozimento_min INTEGER;
