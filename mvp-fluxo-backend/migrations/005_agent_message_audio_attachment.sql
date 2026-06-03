ALTER TABLE agent_messages
  ADD COLUMN IF NOT EXISTS audio_payload jsonb;

ALTER TABLE agent_messages
  ADD COLUMN IF NOT EXISTS attachment_payload jsonb;
