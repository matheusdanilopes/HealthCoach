-- Body metrics tracking table
CREATE TABLE IF NOT EXISTS body_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  weight NUMERIC(5,2) NOT NULL CHECK (weight > 0 AND weight < 500),
  muscle_mass NUMERIC(5,2) CHECK (muscle_mass >= 0 AND muscle_mass < 200),
  body_fat NUMERIC(5,2) CHECK (body_fat >= 0 AND body_fat <= 100),
  visceral_fat NUMERIC(5,2) CHECK (visceral_fat >= 0 AND visceral_fat <= 30),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_body_metrics_user_date ON body_metrics(user_id, date);
