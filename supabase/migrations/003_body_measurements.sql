-- Body measurements tracking table
CREATE TABLE IF NOT EXISTS body_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  waist       NUMERIC(5,1) CHECK (waist > 0 AND waist < 300),
  abdomen     NUMERIC(5,1) CHECK (abdomen > 0 AND abdomen < 300),
  hips        NUMERIC(5,1) CHECK (hips > 0 AND hips < 300),
  chest       NUMERIC(5,1) CHECK (chest > 0 AND chest < 300),
  right_arm   NUMERIC(5,1) CHECK (right_arm > 0 AND right_arm < 150),
  left_arm    NUMERIC(5,1) CHECK (left_arm > 0 AND left_arm < 150),
  right_thigh NUMERIC(5,1) CHECK (right_thigh > 0 AND right_thigh < 150),
  left_thigh  NUMERIC(5,1) CHECK (left_thigh > 0 AND left_thigh < 150),
  right_calf  NUMERIC(5,1) CHECK (right_calf > 0 AND right_calf < 100),
  left_calf   NUMERIC(5,1) CHECK (left_calf > 0 AND left_calf < 100),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_body_measurements_user_date ON body_measurements(user_id, date);
