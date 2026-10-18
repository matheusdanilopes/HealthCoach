-- Meta diária de proteína (g). O código já lê esta coluna (Coach IA, Chat IA,
-- Evolução, Marmitas e notificações do Telegram), mas ela não existia no banco:
-- toda consulta que a pedia falhava e caía nos valores padrão.
ALTER TABLE users ADD COLUMN IF NOT EXISTS target_protein_g NUMERIC(5,1);
