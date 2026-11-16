-- Período (em dias) que a projeção de peso do dashboard analisa, escolhido no Perfil.
-- NULL = padrão de 14 dias. Rode ANTES do deploy do código que salva esse campo.
-- Idempotente: pode rodar mais de uma vez.

ALTER TABLE users ADD COLUMN IF NOT EXISTS projection_days integer
  CHECK (projection_days BETWEEN 3 AND 90);
