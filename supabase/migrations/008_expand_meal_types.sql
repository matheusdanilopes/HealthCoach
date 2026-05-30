-- Expand meal_type CHECK constraint to include all 9 new categories.
-- Existing 'snack' records remain valid (legacy compatibility).
ALTER TABLE food_logs
  DROP CONSTRAINT IF EXISTS food_logs_meal_type_check;

ALTER TABLE food_logs
  ADD CONSTRAINT food_logs_meal_type_check
  CHECK (meal_type IN (
    'breakfast',
    'morning_snack',
    'lunch',
    'afternoon_snack',
    'dinner',
    'supper',
    'pre_workout',
    'post_workout',
    'other',
    'snack'
  ));
