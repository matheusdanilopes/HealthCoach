-- Migration: Hydration integration with meal logging
-- Adds hydration tracking columns to food_logs so beverages from meals
-- can contribute to the daily hydration goal.

ALTER TABLE food_logs
  ADD COLUMN IF NOT EXISTS hydration_ml INTEGER NOT NULL DEFAULT 0
    CHECK (hydration_ml >= 0 AND hydration_ml <= 5000),
  ADD COLUMN IF NOT EXISTS hydration_source TEXT
    CHECK (hydration_source IN ('meal', 'manual')),
  ADD COLUMN IF NOT EXISTS hydration_confidence TEXT
    CHECK (hydration_confidence IN ('high', 'medium', 'low'));

-- Sparse index — only entries with actual hydration contribution
CREATE INDEX IF NOT EXISTS idx_food_logs_hydration
  ON food_logs(user_id, log_date)
  WHERE hydration_ml > 0;
