-- Backend scheduler state for hydration reminders.
-- Updated whenever a water log is created or deleted via /api/water.
-- Used by the cron job to determine next reminder and for diagnostics.

CREATE TABLE IF NOT EXISTS hydration_reminder_state (
  user_id              UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  log_date             DATE    NOT NULL,
  daily_target_ml      INTEGER NOT NULL DEFAULT 2500,
  daily_consumed_ml    INTEGER NOT NULL DEFAULT 0,
  last_water_at        TIMESTAMPTZ,
  next_reminder_at     TIMESTAMPTZ,
  last_computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hydration_reminder_due
  ON hydration_reminder_state (next_reminder_at)
  WHERE next_reminder_at IS NOT NULL;
