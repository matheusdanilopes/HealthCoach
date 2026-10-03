-- Mensagens enviadas pelo bot, para apagá-las do chat quando perderem utilidade.
-- O Telegram só permite apagar mensagens com menos de 48h.
CREATE TABLE IF NOT EXISTS telegram_messages (
  chat_id      BIGINT      NOT NULL,
  message_id   INTEGER     NOT NULL,
  kind         TEXT        NOT NULL,   -- 'reminder' | 'reply' | 'summary'
  delete_after TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chat_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_messages_due ON telegram_messages(delete_after);

-- Limpeza a cada 10 minutos (usa os mesmos segredos do agendador de notificações).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'healthcoach-telegram-cleanup';

SELECT cron.schedule(
  'healthcoach-telegram-cleanup',
  '*/10 * * * *',
  $$
  SELECT net.http_get(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_url')
           || '/api/telegram/cleanup',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    timeout_milliseconds := 30000
  );
  $$
);

NOTIFY pgrst, 'reload schema';
