ALTER TABLE agent_messages
  ADD COLUMN IF NOT EXISTS image_payload jsonb;
