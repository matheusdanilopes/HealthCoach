-- Notification system expansion: logs, preferences, retry queue

-- Per-notification delivery log (auditing & monitoring)
CREATE TABLE IF NOT EXISTS notification_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category     TEXT NOT NULL CHECK (category IN ('hydration', 'meal', 'workout', 'insight', 'goal', 'system', 'test')),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at    TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'expired', 'retrying')),
  attempt      INTEGER NOT NULL DEFAULT 1,
  error_msg    TEXT,
  endpoint_hint TEXT  -- last 16 chars of endpoint for debugging
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_user_sent
  ON notification_logs(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status
  ON notification_logs(status) WHERE status IN ('failed', 'retrying');

-- Per-user notification preferences per category
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hydration  BOOLEAN NOT NULL DEFAULT true,
  meals      BOOLEAN NOT NULL DEFAULT true,
  workouts   BOOLEAN NOT NULL DEFAULT true,
  insights   BOOLEAN NOT NULL DEFAULT true,
  goals      BOOLEAN NOT NULL DEFAULT true,
  quiet_start INTEGER NOT NULL DEFAULT 22,  -- hour (0-23) Brazil time
  quiet_end   INTEGER NOT NULL DEFAULT 7,   -- hour (0-23) Brazil time
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Retry queue for failed notifications
CREATE TABLE IF NOT EXISTS notification_retry_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category     TEXT NOT NULL,
  payload      JSONB NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error   TEXT
);

CREATE INDEX IF NOT EXISTS idx_notification_retry_due
  ON notification_retry_queue(next_retry_at)
  WHERE attempts < max_attempts;

-- Extend push_subscriptions with platform info and last_used tracking
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS platform    TEXT,  -- 'ios', 'android', 'desktop'
  ADD COLUMN IF NOT EXISTS user_agent  TEXT,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_used
  ON push_subscriptions(last_used_at);
