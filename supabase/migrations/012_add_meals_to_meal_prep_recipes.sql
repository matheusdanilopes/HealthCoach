-- Store per-meal portion breakdown alongside the recipe
ALTER TABLE meal_prep_recipes ADD COLUMN IF NOT EXISTS meals JSONB NOT NULL DEFAULT '[]'::jsonb;
