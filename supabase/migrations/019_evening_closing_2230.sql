-- Fechamento do dia passa a sair 30 min antes do início do silêncio (antes: 1h antes).
-- Silêncio padrão passa de 22h para 23h → fechamento às 22:30.

-- 1. Novo padrão do silêncio + migra quem ainda estava no padrão antigo (22h).
ALTER TABLE notification_preferences ALTER COLUMN quiet_start SET DEFAULT 23;
UPDATE notification_preferences SET quiet_start = 23, updated_at = NOW() WHERE quiet_start = 22;

-- 2. Agendador passa a rodar a cada 30 min (:00 = notificações normais, :30 = fechamento).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'healthcoach-notifications';

SELECT cron.schedule(
  'healthcoach-notifications',
  '0,30 * * * *',
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
