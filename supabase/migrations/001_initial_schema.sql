-- HealthCoach AI — Neon PostgreSQL schema
-- Run this in your Neon SQL editor

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  birth_date DATE,
  sex TEXT CHECK (sex IN ('male', 'female')),
  height_cm NUMERIC(5,1),
  current_weight NUMERIC(5,2),
  activity_level TEXT CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  tdee INTEGER,
  target_calories INTEGER,
  target_protein_g NUMERIC(5,1),
  target_carbs_g NUMERIC(5,1),
  target_fat_g NUMERIC(5,1),
  target_water_ml INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS food_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  calories INTEGER NOT NULL CHECK (calories >= -5000 AND calories <= 5000),
  protein NUMERIC(6,2) CHECK (protein >= 0),
  carbs NUMERIC(6,2) CHECK (carbs >= 0),
  fat NUMERIC(6,2) CHECK (fat >= 0),
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS water_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_ml INTEGER NOT NULL CHECK (amount_ml > 0 AND amount_ml <= 2000),
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_kg NUMERIC(5,2) NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_food_logs_user_date ON food_logs(user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_water_logs_user_date ON water_logs(user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date ON weight_logs(user_id, log_date);

