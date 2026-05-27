-- Notification queue (polled by the frontend every 30s)
CREATE TABLE IF NOT EXISTS notification_queue (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  url        TEXT DEFAULT '/',
  category   TEXT,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_user
  ON notification_queue(user_id, is_read, created_at);

-- User notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id     UUID PRIMARY KEY,
  enabled     BOOLEAN DEFAULT TRUE,
  imports     BOOLEAN DEFAULT TRUE,
  processing  BOOLEAN DEFAULT TRUE,
  updates     BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
