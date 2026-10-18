-- Remoção da funcionalidade de insights por IA (card do dashboard e
-- notificação "Insights IA"). Rode depois do deploy do código que não usa
-- mais estas estruturas.

DROP TABLE IF EXISTS ai_insights;

ALTER TABLE notification_preferences DROP COLUMN IF EXISTS insights;
