-- Schema consolidado do HealthCoach no Neon (equivalente às migrations 001–018 do Supabase + db/migrations).
-- Agendamentos (pg_cron/pg_net/Vault) continuam no Supabase; ver README.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  birth_date date,
  sex text CHECK (sex = ANY (ARRAY['male','female'])),
  height_cm numeric(5,1),
  current_weight numeric(5,2),
  activity_level text CHECK (activity_level = ANY (ARRAY['sedentary','light','moderate','active','very_active'])),
  tdee integer,
  target_calories integer,
  target_water_ml integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  target_protein_g numeric(5,1),
  custom_tmb integer
);

-- TMB informada manualmente no Perfil (NULL = calculada pela fórmula com o peso atual).
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_tmb integer;

CREATE TABLE IF NOT EXISTS food_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_name text NOT NULL,
  meal_type text NOT NULL CHECK (meal_type = ANY (ARRAY['breakfast','morning_snack','lunch','afternoon_snack','dinner','supper','pre_workout','post_workout','other','snack'])),
  calories integer NOT NULL CHECK (calories >= -5000 AND calories <= 5000),
  protein numeric(6,2) CHECK (protein >= 0),
  carbs numeric(6,2) CHECK (carbs >= 0),
  fat numeric(6,2) CHECK (fat >= 0),
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  hydration_ml integer NOT NULL DEFAULT 0 CHECK (hydration_ml >= 0 AND hydration_ml <= 5000),
  hydration_source text CHECK (hydration_source = ANY (ARRAY['meal','manual'])),
  hydration_confidence text CHECK (hydration_confidence = ANY (ARRAY['high','medium','low']))
);
CREATE INDEX IF NOT EXISTS idx_food_logs_user_date ON food_logs (user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_food_logs_hydration ON food_logs (user_id, log_date) WHERE hydration_ml > 0;

CREATE TABLE IF NOT EXISTS water_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_ml integer NOT NULL CHECK (amount_ml > 0 AND amount_ml <= 2000),
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_water_logs_user_date ON water_logs (user_id, log_date);

CREATE TABLE IF NOT EXISTS weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_kg numeric(5,2) NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, log_date)
);

CREATE TABLE IF NOT EXISTS body_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  weight numeric(5,2) NOT NULL CHECK (weight > 0 AND weight < 500),
  muscle_mass numeric(5,2) CHECK (muscle_mass >= 0 AND muscle_mass < 200),
  body_fat numeric(5,2) CHECK (body_fat >= 0 AND body_fat <= 100),
  visceral_fat numeric(5,2) CHECK (visceral_fat >= 0 AND visceral_fat <= 30),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS body_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  waist numeric(6,2) CHECK (waist > 0 AND waist < 300),
  neck numeric(6,2) CONSTRAINT body_measurements_abdomen_check CHECK (neck > 0 AND neck < 300),
  hips numeric(6,2) CHECK (hips > 0 AND hips < 300),
  chest numeric(6,2) CHECK (chest > 0 AND chest < 300),
  right_arm numeric(6,2) CHECK (right_arm > 0 AND right_arm < 150),
  left_arm numeric(6,2) CHECK (left_arm > 0 AND left_arm < 150),
  right_thigh numeric(6,2) CHECK (right_thigh > 0 AND right_thigh < 150),
  left_thigh numeric(6,2) CHECK (left_thigh > 0 AND left_thigh < 150),
  right_calf numeric(6,2) CHECK (right_calf > 0 AND right_calf < 100),
  left_calf numeric(6,2) CHECK (left_calf > 0 AND left_calf < 100),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'behavior' CHECK (type = ANY (ARRAY['nutrition','hydration','workout','body','behavior','motivation'])),
  priority text NOT NULL DEFAULT 'informativo' CHECK (priority = ANY (ARRAY['informativo','atencao','positivo','recomendacao'])),
  title text NOT NULL,
  message text NOT NULL,
  cta text,
  metadata jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ai_insights_user_generated ON ai_insights (user_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS meal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input_type text NOT NULL CHECK (input_type = ANY (ARRAY['text','image'])),
  raw_text text,
  image_url text,
  parsed_json jsonb NOT NULL,
  total_calories integer NOT NULL,
  total_protein numeric(6,2),
  total_carbs numeric(6,2),
  total_fat numeric(6,2),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meal_history_user_created ON meal_history (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS meal_prep_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  meal_count integer NOT NULL DEFAULT 10,
  goal text NOT NULL DEFAULT 'emagrecimento',
  budget text NOT NULL DEFAULT 'economico',
  plan_label text DEFAULT 'A',
  avg_calories integer,
  avg_protein integer,
  avg_carbs integer,
  avg_fat integer,
  estimated_cost numeric(10,2),
  cost_per_meal numeric(10,2),
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  shopping_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_explanation text,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  porcoes integer,
  tempo_preparo_min integer,
  tempo_cozimento_min integer,
  meals jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS meal_prep_recipes_user_idx ON meal_prep_recipes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hydration boolean NOT NULL DEFAULT true,
  meals boolean NOT NULL DEFAULT true,
  workouts boolean NOT NULL DEFAULT true,
  insights boolean NOT NULL DEFAULT true,
  goals boolean NOT NULL DEFAULT true,
  quiet_start integer NOT NULL DEFAULT 22,
  quiet_end integer NOT NULL DEFAULT 7,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category = ANY (ARRAY['hydration','meal','workout','insight','goal','system','test'])),
  title text NOT NULL,
  body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  status text NOT NULL DEFAULT 'sent' CHECK (status = ANY (ARRAY['sent','failed','expired','retrying'])),
  attempt integer NOT NULL DEFAULT 1,
  error_msg text,
  endpoint_hint text,
  ref text
);
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_sent ON notification_logs (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs (status) WHERE status = ANY (ARRAY['failed','retrying']);
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_ref ON notification_logs (user_id, ref, sent_at DESC) WHERE ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS telegram_links (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id bigint UNIQUE,
  username text,
  linked_at timestamptz,
  link_token text UNIQUE,
  link_token_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_messages (
  chat_id bigint NOT NULL,
  message_id integer NOT NULL,
  kind text NOT NULL,
  delete_after timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_due ON telegram_messages (delete_after);

CREATE TABLE IF NOT EXISTS training_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  experience text NOT NULL DEFAULT 'iniciante' CHECK (experience = ANY (ARRAY['iniciante','intermediario','avancado'])),
  days_per_week integer NOT NULL DEFAULT 3 CHECK (days_per_week >= 2 AND days_per_week <= 6),
  session_minutes integer NOT NULL DEFAULT 50 CHECK (session_minutes >= 20 AND session_minutes <= 120),
  home_equipment text[] NOT NULL DEFAULT '{}'::text[],
  limitations text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workout_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal text NOT NULL,
  location text NOT NULL CHECK (location = ANY (ARRAY['casa','academia'])),
  days_per_week integer NOT NULL,
  session_minutes integer NOT NULL,
  overview text,
  schedule text,
  progression text,
  safety jsonb NOT NULL DEFAULT '[]'::jsonb,
  days jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workout_plans_user_idx ON workout_plans (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS workout_plans_one_active_idx ON workout_plans (user_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS workout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES workout_plans(id) ON DELETE SET NULL,
  day_label text NOT NULL,
  session_date date NOT NULL,
  duration_min integer CHECK (duration_min >= 1 AND duration_min <= 300),
  rpe integer CHECK (rpe >= 1 AND rpe <= 10),
  calories integer,
  food_log_id uuid REFERENCES food_logs(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workout_sessions_user_idx ON workout_sessions (user_id, session_date DESC);

CREATE TABLE IF NOT EXISTS workout_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_key text NOT NULL,
  exercise_name text NOT NULL,
  exercise_order integer NOT NULL DEFAULT 0,
  set_number integer NOT NULL CHECK (set_number >= 1 AND set_number <= 20),
  reps integer CHECK (reps >= 0 AND reps <= 200),
  seconds integer CHECK (seconds >= 0 AND seconds <= 3600),
  load_kg numeric(6,2) CHECK (load_kg >= 0 AND load_kg <= 1000),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workout_sets_session_idx ON workout_sets (session_id);
CREATE INDEX IF NOT EXISTS workout_sets_user_exercise_idx ON workout_sets (user_id, exercise_key, created_at DESC);

-- Chat do Coach. Gravado para que a resposta não se perca quando a conexão cai
-- (o app a busca aqui), e para registrar como cada resposta foi produzida.
-- meta: { "provider": "gemini", "model": "...", "rounds": 2, "durationMs": 8200,
--         "usage": { "input": 9100, "output": 420, "thinking": 800 },
--         "tools": [{ "name": "log_food", "args": {...}, "result": "...", "ms": 40 }],
--         "intent": "food_logging", "fallback": "follow_up" }
-- rating: 👍 (1) / 👎 (-1) dado pelo usuário no chat, com comentário opcional.
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['user','assistant'])),
  content text NOT NULL,
  food_log_id uuid REFERENCES food_logs(id) ON DELETE SET NULL,
  meta jsonb,
  rating smallint CHECK (rating IN (-1, 1)),
  rating_comment text,
  rated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages (user_id, conversation_id, created_at);
-- Busca dos 👎 para revisar respostas ruins.
CREATE INDEX IF NOT EXISTS chat_messages_rated_idx ON chat_messages (rated_at DESC) WHERE rating IS NOT NULL;

-- ─── TACO, rótulos e origem do cálculo de kcal (db/migrations 001–004) ───
-- O seed da TACO (591 alimentos) fica em db/migrations/002_taco_foods_seed.sql.

-- TACO 4ª edição (NEPA/UNICAMP): valores por 100 g, base do cálculo de kcal e
-- macros feito pelo app (a IA só identifica alimento + gramas).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS taco_foods (
  id integer PRIMARY KEY,                      -- "Número do Alimento" na TACO
  nome text NOT NULL,                          -- descrição oficial, ex.: 'Arroz, tipo 1, cozido'
  nome_normalizado text NOT NULL,              -- minúsculo, sem acento/pontuação (busca)
  categoria text NOT NULL,
  kcal_100g numeric(7,2) NOT NULL CHECK (kcal_100g >= 0 AND kcal_100g <= 900),
  protein_100g numeric(6,2) CHECK (protein_100g >= 0 AND protein_100g <= 100),
  carbs_100g numeric(6,2) CHECK (carbs_100g >= 0 AND carbs_100g <= 100),
  fat_100g numeric(6,2) CHECK (fat_100g >= 0 AND fat_100g <= 100)
);
-- Busca aproximada (pg_trgm).
CREATE INDEX IF NOT EXISTS taco_foods_nome_trgm_idx ON taco_foods USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS taco_foods_nome_normalizado_trgm_idx ON taco_foods USING gin (nome_normalizado gin_trgm_ops);

-- Alimentos de rótulo (industrializados), cadastrados por usuário e reaproveitados.
-- Valores sempre por 100 g; porcao_g guarda a porção do rótulo informada.
CREATE TABLE IF NOT EXISTS custom_foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  nome_normalizado text NOT NULL,
  kcal_100g numeric(7,2) NOT NULL CHECK (kcal_100g >= 0 AND kcal_100g <= 900),
  protein_100g numeric(6,2) CHECK (protein_100g >= 0 AND protein_100g <= 100),
  carbs_100g numeric(6,2) CHECK (carbs_100g >= 0 AND carbs_100g <= 100),
  fat_100g numeric(6,2) CHECK (fat_100g >= 0 AND fat_100g <= 100),
  porcao_g numeric(7,1) CHECK (porcao_g > 0 AND porcao_g <= 5000),
  fonte text NOT NULL DEFAULT 'rotulo' CHECK (fonte = 'rotulo'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nome_normalizado),
  -- Alvo da FK composta de food_logs: garante que o alimento é do mesmo usuário.
  UNIQUE (id, user_id)
);
CREATE INDEX IF NOT EXISTS custom_foods_nome_trgm_idx ON custom_foods USING gin (nome_normalizado gin_trgm_ops);

-- Origem do cálculo de cada lançamento. Colunas novas, todas opcionais:
-- registros antigos ficam como estão (source NULL = anterior a esta mudança).
-- Nenhum UPDATE/DELETE em dados existentes.
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
