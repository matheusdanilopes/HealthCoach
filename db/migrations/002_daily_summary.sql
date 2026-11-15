-- Resumo diário por usuário: uma linha por dia com qualquer registro.
-- Feito para análise (IA, SQL ad hoc): junta food_logs, water_logs,
-- body_metrics e workout_sessions com as mesmas regras do app.
-- Idempotente.

CREATE OR REPLACE VIEW daily_summary AS
WITH days AS (
  SELECT user_id, log_date AS date FROM food_logs
  UNION SELECT user_id, log_date FROM water_logs
  UNION SELECT user_id, date FROM body_metrics
  UNION SELECT user_id, session_date FROM workout_sessions
),
food AS (
  SELECT user_id, log_date AS date,
    SUM(calories)     FILTER (WHERE calories > 0)  AS kcal_consumed,
    SUM(protein)      FILTER (WHERE calories > 0)  AS protein_g,
    SUM(carbs)        FILTER (WHERE calories > 0)  AS carbs_g,
    SUM(fat)          FILTER (WHERE calories > 0)  AS fat_g,
    COUNT(*)          FILTER (WHERE calories > 0)  AS food_entries,
    COUNT(DISTINCT meal_type) FILTER (WHERE calories > 0) AS meals,
    -SUM(calories)    FILTER (WHERE calories < 0)  AS kcal_burned,
    SUM(hydration_ml) FILTER (WHERE calories >= 0) AS water_from_food_ml
  FROM food_logs
  GROUP BY user_id, log_date
),
water AS (
  SELECT user_id, log_date AS date, SUM(amount_ml) AS water_manual_ml
  FROM water_logs
  GROUP BY user_id, log_date
),
training AS (
  SELECT user_id, session_date AS date,
    COUNT(*)                AS workout_sessions,
    SUM(duration_min)       AS workout_minutes,
    ROUND(AVG(rpe), 1)      AS workout_avg_rpe
  FROM workout_sessions
  GROUP BY user_id, session_date
)
SELECT
  d.user_id,
  d.date,
  COALESCE(f.kcal_consumed, 0)::int                                AS kcal_consumed,
  ROUND(COALESCE(f.protein_g, 0), 1)                               AS protein_g,
  ROUND(COALESCE(f.carbs_g, 0), 1)                                 AS carbs_g,
  ROUND(COALESCE(f.fat_g, 0), 1)                                   AS fat_g,
  COALESCE(f.food_entries, 0)::int                                 AS food_entries,
  COALESCE(f.meals, 0)::int                                        AS meals,
  COALESCE(f.kcal_burned, 0)::int                                  AS kcal_burned,
  (COALESCE(f.kcal_consumed, 0) - COALESCE(f.kcal_burned, 0))::int AS kcal_net,
  (COALESCE(w.water_manual_ml, 0) + COALESCE(f.water_from_food_ml, 0))::int AS water_ml,
  COALESCE(w.water_manual_ml, 0)::int                              AS water_manual_ml,
  COALESCE(f.water_from_food_ml, 0)::int                           AS water_from_food_ml,
  COALESCE(t.workout_sessions, 0)::int                             AS workout_sessions,
  t.workout_minutes::int                                           AS workout_minutes,
  t.workout_avg_rpe,
  b.weight                                                         AS weight_kg,
  b.body_fat                                                       AS body_fat_pct,
  b.muscle_mass                                                    AS muscle_mass_kg,
  b.visceral_fat,
  u.target_calories,
  u.target_protein_g,
  u.target_water_ml
FROM days d
JOIN users u          ON u.id = d.user_id
LEFT JOIN food f      ON f.user_id = d.user_id AND f.date = d.date
LEFT JOIN water w     ON w.user_id = d.user_id AND w.date = d.date
LEFT JOIN training t  ON t.user_id = d.user_id AND t.date = d.date
LEFT JOIN body_metrics b ON b.user_id = d.user_id AND b.date = d.date;

COMMENT ON VIEW daily_summary IS
  'Uma linha por usuário e dia (data no fuso de Brasília) com qualquer registro. Ponto de partida para análises.';
COMMENT ON COLUMN daily_summary.kcal_consumed IS 'kcal ingeridas (food_logs com calories > 0)';
COMMENT ON COLUMN daily_summary.kcal_burned IS 'kcal gastas em treino, positivo (food_logs com calories < 0)';
COMMENT ON COLUMN daily_summary.kcal_net IS 'kcal_consumed - kcal_burned';
COMMENT ON COLUMN daily_summary.meals IS 'Refeições distintas (meal_type) com comida registrada';
COMMENT ON COLUMN daily_summary.water_ml IS 'Água total: water_manual_ml + water_from_food_ml';
COMMENT ON COLUMN daily_summary.water_manual_ml IS 'Água registrada manualmente (water_logs)';
COMMENT ON COLUMN daily_summary.water_from_food_ml IS 'Água de bebidas/refeições (food_logs.hydration_ml)';
COMMENT ON COLUMN daily_summary.workout_sessions IS 'Treinos registrados pelo Treinos IA (workout_sessions)';
COMMENT ON COLUMN daily_summary.weight_kg IS 'Peso do dia (body_metrics), NULL se não pesou';
COMMENT ON COLUMN daily_summary.target_calories IS 'Meta ATUAL do usuário (não histórica)';
COMMENT ON COLUMN daily_summary.target_protein_g IS 'Meta ATUAL do usuário (não histórica)';
COMMENT ON COLUMN daily_summary.target_water_ml IS 'Meta ATUAL do usuário (não histórica)';

-- Convenções das tabelas de origem, para quem consulta direto.
COMMENT ON COLUMN food_logs.calories IS 'kcal. Positivo = comida, NEGATIVO = treino (gasto calórico)';
COMMENT ON COLUMN food_logs.hydration_ml IS 'Água contida na bebida/refeição, soma com water_logs para a água do dia';
COMMENT ON COLUMN food_logs.log_date IS 'Data no fuso de Brasília';
COMMENT ON TABLE body_metrics IS 'Todo registro de peso (dashboard e Pesagem), um por dia, composição corporal opcional';
