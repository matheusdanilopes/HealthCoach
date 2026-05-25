CREATE TABLE IF NOT EXISTS meal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input_type TEXT NOT NULL CHECK (input_type IN ('text', 'image')),
  raw_text TEXT,
  image_url TEXT,
  parsed_json JSONB NOT NULL,
  total_calories INTEGER NOT NULL,
  total_protein NUMERIC(6,2),
  total_carbs NUMERIC(6,2),
  total_fat NUMERIC(6,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_history_user_created ON meal_history(user_id, created_at DESC);
