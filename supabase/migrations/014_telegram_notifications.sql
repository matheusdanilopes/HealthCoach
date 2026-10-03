-- Telegram como canal único de notificações (substitui Web Push / VAPID).
--
-- Depois de aplicar esta migration, cadastre os segredos usados pelo agendador
-- (uma única vez, no SQL editor do Supabase):
--
--   SELECT vault.create_secret('https://SEU-APP.vercel.app', 'app_url');
--   SELECT vault.create_secret('<mesmo valor de CRON_SECRET da Vercel>', 'cron_secret');

-- ─── Vínculo usuário ↔ chat do Telegram ──────────────────────────────────────
-- link_token é gerado pelo app e consumido pelo bot via /start <token>.
CREATE TABLE IF NOT EXISTS telegram_links (
  user_id               UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id               BIGINT UNIQUE,
  username              TEXT,
  linked_at             TIMESTAMPTZ,
  link_token            TEXT UNIQUE,
  link_token_expires_at TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Deduplicação por evento (ex.: 'meal:lunch', 'insight:<id>') ─────────────
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS ref TEXT;

CREATE INDEX IF NOT EXISTS idx_notification_logs_user_ref
  ON notification_logs(user_id, ref, sent_at DESC)
  WHERE ref IS NOT NULL;

-- ─── Remoção da infraestrutura de Web Push ───────────────────────────────────
DROP TABLE IF EXISTS notification_retry_queue;
DROP TABLE IF EXISTS hydration_reminder_state;
DROP TABLE IF EXISTS push_subscriptions;

-- ─── Agendador: chama /api/notifications/run de hora em hora ────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'healthcoach-notifications';

SELECT cron.schedule(
  'healthcoach-notifications',
  '0 * * * *',
  $$
  SELECT net.http_get(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_url')
           || '/api/notifications/run',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
