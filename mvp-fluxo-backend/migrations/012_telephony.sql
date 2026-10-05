-- Telefonia própria (Asterisk + tronco SIP): liberação por usuário e histórico de ligações.

CREATE TABLE IF NOT EXISTS telephony_user_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  sip_username text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telephony_user_settings_tenant
  ON telephony_user_settings (tenant_id, enabled);

CREATE TABLE IF NOT EXISTS voice_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'outbound',
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  sip_username text,
  dial_status text,
  hangup_cause text,
  ring_seconds integer NOT NULL DEFAULT 0,
  talk_seconds integer NOT NULL DEFAULT 0,
  tabulacao_id uuid,
  tabulacao_label text,
  tabulated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  authorized_at timestamptz,
  ended_at timestamptz,
  CONSTRAINT chk_voice_calls_status
    CHECK (status IN ('requested', 'authorized', 'answered', 'no_answer', 'busy', 'cancelled', 'failed')),
  CONSTRAINT chk_voice_calls_direction
    CHECK (direction IN ('outbound', 'inbound'))
);

CREATE INDEX IF NOT EXISTS idx_voice_calls_tenant_created
  ON voice_calls (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_calls_user_created
  ON voice_calls (user_id, created_at DESC);
