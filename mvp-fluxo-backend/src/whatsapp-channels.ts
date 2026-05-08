import { pool } from "./db";
import { encryptSecret, decryptSecret } from "./secrets";

export type WhatsAppChannelRow = {
  id: string;
  tenant_id: string;
  label: string;
  provider: string;
  created_at: string;
  updated_at: string;
};

export type WhatsAppPhoneRow = {
  id: string;
  channel_account_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
};

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_channel_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        label text NOT NULL DEFAULT 'WhatsApp',
        provider text NOT NULL DEFAULT 'whatsapp_cloud_api',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_channel_secrets (
        channel_account_id uuid PRIMARY KEY REFERENCES whatsapp_channel_accounts(id) ON DELETE CASCADE,
        waba_id text NOT NULL,
        access_token_encrypted text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_phone_numbers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_account_id uuid NOT NULL REFERENCES whatsapp_channel_accounts(id) ON DELETE CASCADE,
        phone_number_id text NOT NULL,
        display_phone_number text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (phone_number_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_whatsapp_phone_channel
      ON whatsapp_phone_numbers (channel_account_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_whatsapp_channel_tenant
      ON whatsapp_channel_accounts (tenant_id)
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

export type CreateWhatsAppChannelOptionBInput = {
  tenantId: string;
  label?: string;
  wabaId: string;
  accessToken: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
};

export async function createWhatsAppChannelOptionB(
  input: CreateWhatsAppChannelOptionBInput
): Promise<{ channelId: string; phoneNumberId: string }> {
  await ensureSchema();
  const label = input.label?.trim() || "WhatsApp";
  const wabaId = input.wabaId.trim();
  const token = input.accessToken.trim();
  const phoneNumberId = input.phoneNumberId.trim();
  if (!wabaId || !token || !phoneNumberId) {
    throw new Error("wabaId, accessToken e phoneNumberId são obrigatórios");
  }

  const client = await pool.connect();
  try {
    const enc = encryptSecret(token);
    const created = await client.query<{ id: string }>(
      `INSERT INTO whatsapp_channel_accounts (tenant_id, label, provider)
       VALUES ($1, $2, 'whatsapp_cloud_api')
       RETURNING id`,
      [input.tenantId, label]
    );
    const channelId = created.rows[0].id;
    await client.query(
      `INSERT INTO whatsapp_channel_secrets (channel_account_id, waba_id, access_token_encrypted)
       VALUES ($1, $2, $3)`,
      [channelId, wabaId, enc]
    );
    await client.query(
      `INSERT INTO whatsapp_phone_numbers (channel_account_id, phone_number_id, display_phone_number)
       VALUES ($1, $2, $3)`,
      [channelId, phoneNumberId, input.displayPhoneNumber?.trim() || null]
    );
    return { channelId, phoneNumberId };
  } finally {
    client.release();
  }
}

export async function listWhatsAppChannels(tenantId: string): Promise<
  (WhatsAppChannelRow & { phone_numbers: WhatsAppPhoneRow[]; waba_id: string })[]
> {
  await ensureSchema();
  const client = await pool.connect();
  try {
    const accs = await client.query<WhatsAppChannelRow>(
      `SELECT id, tenant_id, label, provider, created_at::text, updated_at::text
       FROM whatsapp_channel_accounts
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );
    const out: (WhatsAppChannelRow & { phone_numbers: WhatsAppPhoneRow[]; waba_id: string })[] = [];
    for (const a of accs.rows) {
      const sec = await client.query<{ waba_id: string }>(
        `SELECT waba_id FROM whatsapp_channel_secrets WHERE channel_account_id = $1`,
        [a.id]
      );
      const phones = await client.query<WhatsAppPhoneRow>(
        `SELECT id, channel_account_id, phone_number_id, display_phone_number
         FROM whatsapp_phone_numbers
         WHERE channel_account_id = $1`,
        [a.id]
      );
      out.push({
        ...a,
        waba_id: sec.rows[0]?.waba_id ?? "",
        phone_numbers: phones.rows,
      });
    }
    return out;
  } finally {
    client.release();
  }
}

/** Resolve tenant pelo phone_number_id da Cloud API (roteamento de webhook). */
export async function resolveTenantByWhatsAppPhoneNumberId(
  phoneNumberId: string
): Promise<{ tenantId: string; channelAccountId: string } | null> {
  await ensureSchema();
  const result = await pool.query<{ tenant_id: string; channel_account_id: string }>(
    `SELECT wca.tenant_id, wca.id AS channel_account_id
     FROM whatsapp_phone_numbers wpn
     JOIN whatsapp_channel_accounts wca ON wca.id = wpn.channel_account_id
     WHERE wpn.phone_number_id = $1
     LIMIT 1`,
    [phoneNumberId.trim()]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { tenantId: row.tenant_id, channelAccountId: row.channel_account_id };
}

export type OutboundWhatsAppContext = {
  tenantId: string;
  phoneNumberId: string;
  accessToken: string;
};

/** Primeiro número do tenant (Fase 1: um canal por tenant costuma bastar). */
export async function getOutboundWhatsAppContext(
  tenantId: string
): Promise<OutboundWhatsAppContext | null> {
  await ensureSchema();
  const client = await pool.connect();
  try {
    const row = await client.query<{
      phone_number_id: string;
      access_token_encrypted: string;
    }>(
      `SELECT wpn.phone_number_id, ws.access_token_encrypted
       FROM whatsapp_channel_accounts wca
       JOIN whatsapp_phone_numbers wpn ON wpn.channel_account_id = wca.id
       JOIN whatsapp_channel_secrets ws ON ws.channel_account_id = wca.id
       WHERE wca.tenant_id = $1
       ORDER BY wpn.created_at ASC
       LIMIT 1`,
      [tenantId]
    );
    if (row.rows.length === 0) return null;
    const accessToken = decryptSecret(row.rows[0].access_token_encrypted);
    return {
      tenantId,
      phoneNumberId: row.rows[0].phone_number_id,
      accessToken,
    };
  } finally {
    client.release();
  }
}
