-- Treinos IA: perfil de treino, planos semanais gerados por IA e registro de
-- séries/cargas por exercício (base para a progressão de carga).

-- Preferências estáveis do usuário, salvas uma vez e reaproveitadas a cada plano.
CREATE TABLE IF NOT EXISTS training_profiles (
  user_id          UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  experience       TEXT        NOT NULL DEFAULT 'iniciante'
                   CHECK (experience IN ('iniciante', 'intermediario', 'avancado')),
  days_per_week    INTEGER     NOT NULL DEFAULT 3 CHECK (days_per_week BETWEEN 2 AND 6),
  session_minutes  INTEGER     NOT NULL DEFAULT 50 CHECK (session_minutes BETWEEN 20 AND 120),
  home_equipment   TEXT[]      NOT NULL DEFAULT '{}',
  limitations      TEXT,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Plano semanal. `days` guarda as sessões (A, B, C…) com os exercícios,
-- séries, repetições, descanso e explicação de execução.
CREATE TABLE IF NOT EXISTS workout_plans (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  goal             TEXT        NOT NULL,
  location         TEXT        NOT NULL CHECK (location IN ('casa', 'academia')),
  days_per_week    INTEGER     NOT NULL,
  session_minutes  INTEGER     NOT NULL,
  overview         TEXT,
  schedule         TEXT,
  progression      TEXT,
  safety           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  days             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workout_plans_user_idx ON workout_plans (user_id, created_at DESC);
-- No máximo um plano ativo por usuário.
CREATE UNIQUE INDEX IF NOT EXISTS workout_plans_one_active_idx ON workout_plans (user_id) WHERE is_active;

-- Sessão realizada. O gasto calórico também vai para food_logs (calorias
-- negativas), como os demais treinos, para dashboard, Coach e Telegram.
CREATE TABLE IF NOT EXISTS workout_sessions (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id          UUID        REFERENCES workout_plans(id) ON DELETE SET NULL,
  day_label        TEXT        NOT NULL,
  session_date     DATE        NOT NULL,
  duration_min     INTEGER     CHECK (duration_min BETWEEN 1 AND 300),
  rpe              INTEGER     CHECK (rpe BETWEEN 1 AND 10),
  calories         INTEGER,
  food_log_id      UUID        REFERENCES food_logs(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workout_sessions_user_idx ON workout_sessions (user_id, session_date DESC);

-- Uma linha por série. `exercise_key` é o nome normalizado, usado para achar
-- o histórico do mesmo exercício entre planos diferentes.
CREATE TABLE IF NOT EXISTS workout_sets (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id       UUID        NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_key     TEXT        NOT NULL,
  exercise_name    TEXT        NOT NULL,
  exercise_order   INTEGER     NOT NULL DEFAULT 0,
  set_number       INTEGER     NOT NULL CHECK (set_number BETWEEN 1 AND 20),
  reps             INTEGER     CHECK (reps BETWEEN 0 AND 200),
  seconds          INTEGER     CHECK (seconds BETWEEN 0 AND 3600),
  load_kg          NUMERIC(6,2) CHECK (load_kg >= 0 AND load_kg <= 1000),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workout_sets_user_exercise_idx ON workout_sets (user_id, exercise_key, created_at DESC);
CREATE INDEX IF NOT EXISTS workout_sets_session_idx ON workout_sets (session_id);
