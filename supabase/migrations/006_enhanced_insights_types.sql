-- Extend ai_insights type constraint to include hydration and motivation categories
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'ai_insights'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%nutrition%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_insights DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE ai_insights
  ADD CONSTRAINT ai_insights_type_check
  CHECK (type IN ('nutrition', 'hydration', 'workout', 'body', 'behavior', 'motivation'));
