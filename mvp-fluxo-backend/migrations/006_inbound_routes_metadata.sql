-- Coluna metadata em rotas inbound (gatilhos por mensagem, ex. Cadastrar-se)

ALTER TABLE inbound_entry_routes
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
