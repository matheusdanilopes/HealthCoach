-- Limpeza do banco: remove tabelas e colunas sem uso e unifica o peso em body_metrics.
-- Rode DEPOIS do deploy do código que não usa mais weight_logs.
-- Idempotente: pode rodar mais de uma vez.

BEGIN;

-- 1. Peso: weight_logs → body_metrics.
--    Num dia com registro nas duas tabelas, vale o salvo por último.
DO $$
BEGIN
  IF to_regclass('public.weight_logs') IS NOT NULL THEN
    INSERT INTO body_metrics (user_id, date, weight, created_at, updated_at)
    SELECT w.user_id, w.log_date, w.weight_kg, w.created_at, w.created_at
    FROM weight_logs w
    ON CONFLICT (user_id, date) DO UPDATE
      SET weight = EXCLUDED.weight, updated_at = EXCLUDED.updated_at
      WHERE EXCLUDED.updated_at > COALESCE(body_metrics.updated_at, body_metrics.created_at);
    DROP TABLE weight_logs;
  END IF;
END $$;

-- 2. Tabelas sem uso no código.
--    food_logs.taco_food_id/custom_food_id sobraram do TACO revertido (PR #101)
--    e são FKs para taco_foods/custom_foods; saem antes das tabelas.
ALTER TABLE food_logs DROP COLUMN IF EXISTS taco_food_id;
ALTER TABLE food_logs DROP COLUMN IF EXISTS custom_food_id;
DROP TABLE IF EXISTS ai_insights;   -- funcionalidade removida (supabase 016)
DROP TABLE IF EXISTS meal_history;  -- nunca usada
DROP TABLE IF EXISTS custom_foods;  -- vazia, fora do schema
DROP TABLE IF EXISTS taco_foods;    -- tabela TACO, nenhum código lê

-- 3. Colunas sem uso.
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS insights;
ALTER TABLE notification_logs DROP COLUMN IF EXISTS attempt;
ALTER TABLE notification_logs DROP COLUMN IF EXISTS endpoint_hint;

COMMIT;
