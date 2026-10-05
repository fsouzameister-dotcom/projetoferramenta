-- Campanhas de voz (discagem preview): mailing próprio de telefonia, separado das campanhas de WhatsApp.

CREATE TABLE IF NOT EXISTS voice_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  max_attempts integer NOT NULL DEFAULT 5,
  retry_interval_minutes integer NOT NULL DEFAULT 60,
  record_calls boolean NOT NULL DEFAULT false,
  phone_column text,
  name_column text,
  headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_voice_campaigns_status CHECK (status IN ('active', 'paused', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_voice_campaigns_tenant
  ON voice_campaigns (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS voice_campaign_queues (
  campaign_id uuid NOT NULL REFERENCES voice_campaigns(id) ON DELETE CASCADE,
  queue_id uuid NOT NULL REFERENCES service_queues(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, queue_id)
);

CREATE TABLE IF NOT EXISTS voice_campaign_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES voice_campaigns(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  reserved_by uuid,
  reserved_at timestamptz,
  last_call_id uuid,
  last_result text,
  last_tabulacao_label text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_voice_campaign_contacts_phone UNIQUE (campaign_id, phone),
  CONSTRAINT chk_voice_campaign_contacts_status
    CHECK (status IN ('pending', 'in_call', 'retry', 'done', 'exhausted', 'do_not_call'))
);

CREATE INDEX IF NOT EXISTS idx_voice_campaign_contacts_pick
  ON voice_campaign_contacts (campaign_id, status, next_attempt_at, created_at);

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS campaign_id uuid;
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS recorded boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_voice_calls_campaign
  ON voice_calls (campaign_id, created_at DESC);
