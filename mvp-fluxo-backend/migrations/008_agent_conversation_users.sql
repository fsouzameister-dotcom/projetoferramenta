-- Vincula atendimento humano ao usuário do sistema (assumiu / encerrou).
ALTER TABLE agent_conversations
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_conversations_assigned_user
  ON agent_conversations (tenant_id, assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_conversations_closed_by_user
  ON agent_conversations (tenant_id, closed_by_user_id)
  WHERE closed_by_user_id IS NOT NULL;
