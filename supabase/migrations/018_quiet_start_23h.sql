-- Horário silencioso passa a começar às 23h por padrão, levando o fechamento do
-- dia (enviado 1h antes) para as 22h. Preferências já salvas não mudam.
ALTER TABLE notification_preferences ALTER COLUMN quiet_start SET DEFAULT 23;
