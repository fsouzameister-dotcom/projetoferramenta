-- Cadastro mestre (cliente final do tenant) + telefones + mailings
-- Não confundir com `tenants` (clientes da plataforma ClientOn).

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  external_id text,
  name text NOT NULL,
  email text,
  document text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_tenant_name
  ON clients (tenant_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_tenant_external
  ON clients (tenant_id, external_id)
  WHERE external_id IS NOT NULL;

-- Um número pode existir uma vez por tenant; vários números por cliente.
CREATE TABLE IF NOT EXISTS client_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  label text,
  is_primary boolean NOT NULL DEFAULT false,
  is_whatsapp boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_phones_tenant_phone
  ON client_phones (tenant_id, phone_e164);

CREATE INDEX IF NOT EXISTS idx_client_phones_client
  ON client_phones (client_id);

-- Campanha / lista de disparo (WhatsApp, SMS, etc.)
CREATE TABLE IF NOT EXISTS mailings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  flow_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mailings_tenant_status
  ON mailings (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS mailing_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  mailing_id uuid NOT NULL REFERENCES mailings(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  phone_e164 text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  error_code text,
  error_description text,
  sent_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailing_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS idx_mailing_recipients_mailing_status
  ON mailing_recipients (mailing_id, status);

-- Vínculo: conversa do agente → cliente consolidado (se tabela já existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agent_conversations'
  ) THEN
    ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_agent_conversations_client
      ON agent_conversations (tenant_id, client_id)
      WHERE client_id IS NOT NULL;
  END IF;
END $$;
