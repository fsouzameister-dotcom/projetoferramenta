import { pool } from "./db";
import { ensureSchema as ensureServiceQueuesSchema } from "./service-queues";

let schemaReady = false;

export async function ensureTelephonySchema(): Promise<void> {
  if (schemaReady) return;
  await ensureServiceQueuesSchema();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telephony_user_settings (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      tenant_id uuid NOT NULL,
      enabled boolean NOT NULL DEFAULT false,
      sip_username text UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_telephony_user_settings_tenant
      ON telephony_user_settings (tenant_id, enabled)
  `);
  await pool.query(`
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
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_voice_calls_tenant_created
      ON voice_calls (tenant_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_voice_calls_user_created
      ON voice_calls (user_id, created_at DESC)
  `);
  await pool.query(`
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
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_voice_campaigns_tenant
      ON voice_campaigns (tenant_id, status, created_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS voice_campaign_queues (
      campaign_id uuid NOT NULL REFERENCES voice_campaigns(id) ON DELETE CASCADE,
      queue_id uuid NOT NULL REFERENCES service_queues(id) ON DELETE CASCADE,
      PRIMARY KEY (campaign_id, queue_id)
    )
  `);
  await pool.query(`
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
        CHECK (status IN ('pending', 'in_call', 'retry', 'done', 'exhausted', 'do_not_call', 'invalid'))
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_voice_campaign_contacts_pick
      ON voice_campaign_contacts (campaign_id, status, next_attempt_at, created_at)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telephony_tenant_settings (
      tenant_id uuid PRIMARY KEY,
      record_manual_calls boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS campaign_id uuid`);
  await pool.query(`ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS contact_id uuid`);
  await pool.query(`ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS recorded boolean NOT NULL DEFAULT false`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_voice_calls_campaign
      ON voice_calls (campaign_id, created_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS voice_campaign_tabulacoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      campaign_id uuid NOT NULL REFERENCES voice_campaigns(id) ON DELETE CASCADE,
      label text NOT NULL,
      description text,
      outcome text NOT NULL DEFAULT 'done',
      is_success boolean NOT NULL DEFAULT false,
      sort_order integer NOT NULL DEFAULT 0,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_voice_campaign_tabulacoes_outcome CHECK (outcome IN ('done', 'retry', 'do_not_call', 'callback'))
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_voice_campaign_tabulacoes_campaign
      ON voice_campaign_tabulacoes (campaign_id, active, sort_order)
  `);
  await pool.query(`ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS result text`);
  await pool.query(`ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS tabulacao_is_success boolean`);
  await pool.query(`ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS callback_at timestamptz`);
  await pool.query(`ALTER TABLE voice_campaign_contacts ADD COLUMN IF NOT EXISTS callback_user_id uuid`);
  await pool.query(`ALTER TABLE voice_campaign_contacts ADD COLUMN IF NOT EXISTS last_call_result text`);
  const statusCheck = await pool.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'chk_voice_campaign_contacts_status'`
  );
  if (!String(statusCheck.rows[0]?.def ?? "").includes("invalid")) {
    await pool.query(`ALTER TABLE voice_campaign_contacts DROP CONSTRAINT IF EXISTS chk_voice_campaign_contacts_status`);
    await pool.query(`
      ALTER TABLE voice_campaign_contacts ADD CONSTRAINT chk_voice_campaign_contacts_status
        CHECK (status IN ('pending', 'in_call', 'retry', 'done', 'exhausted', 'do_not_call', 'invalid'))
    `);
  }
  schemaReady = true;
}
