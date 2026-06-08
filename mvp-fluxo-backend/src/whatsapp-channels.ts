import { pool } from "./db";
import { encryptSecret, decryptSecret } from "./secrets";
import { fetchTwilioContentTemplates } from "./whatsapp-twilio-api";

export const WHATSAPP_PROVIDER_CLOUD = "whatsapp_cloud_api" as const;
export const WHATSAPP_PROVIDER_TWILIO = "twilio_whatsapp" as const;

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

export type WhatsAppChannelListItem = WhatsAppChannelRow & {
  phone_numbers: WhatsAppPhoneRow[];
  waba_id: string;
  twilio_account_sid: string | null;
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

    await client.query(`
      ALTER TABLE whatsapp_channel_secrets
      ALTER COLUMN waba_id DROP NOT NULL
    `);
    await client.query(`
      ALTER TABLE whatsapp_channel_secrets
      ALTER COLUMN access_token_encrypted DROP NOT NULL
    `);
    await client.query(`
      ALTER TABLE whatsapp_channel_secrets
      ADD COLUMN IF NOT EXISTS twilio_account_sid text
    `);
    await client.query(`
      ALTER TABLE whatsapp_channel_secrets
      ADD COLUMN IF NOT EXISTS twilio_auth_token_encrypted text
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
       VALUES ($1, $2, $3)
       RETURNING id`,
      [input.tenantId, label, WHATSAPP_PROVIDER_CLOUD]
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

export type CreateWhatsAppChannelTwilioInput = {
  tenantId: string;
  label?: string;
  accountSid: string;
  authToken: string;
  /** Número WhatsApp Twilio em E.164, ex.: +551150284949 ou 551150284949 */
  fromWhatsApp: string;
};

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function normalizeTwilioFromDisplay(from: string): string {
  const d = digitsOnly(from);
  if (!d) throw new Error("Número Twilio (from) inválido");
  return `+${d}`;
}

export async function createWhatsAppChannelTwilio(
  input: CreateWhatsAppChannelTwilioInput
): Promise<{ channelId: string; phoneNumberId: string }> {
  await ensureSchema();
  const label = input.label?.trim() || "WhatsApp Twilio";
  const accountSid = input.accountSid.trim();
  const authToken = input.authToken.trim();
  if (!accountSid || !authToken) {
    throw new Error("accountSid e authToken são obrigatórios");
  }
  if (!/^AC[a-f0-9]{32}$/i.test(accountSid)) {
    throw new Error("accountSid Twilio inválido (esperado AC + 32 hex)");
  }

  const display = normalizeTwilioFromDisplay(input.fromWhatsApp);
  const digits = digitsOnly(display);
  const syntheticId = `twilio:${digits}`;

  const client = await pool.connect();
  try {
    const enc = encryptSecret(authToken);
    const created = await client.query<{ id: string }>(
      `INSERT INTO whatsapp_channel_accounts (tenant_id, label, provider)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [input.tenantId, label, WHATSAPP_PROVIDER_TWILIO]
    );
    const channelId = created.rows[0].id;
    await client.query(
      `INSERT INTO whatsapp_channel_secrets (channel_account_id, waba_id, access_token_encrypted, twilio_account_sid, twilio_auth_token_encrypted)
       VALUES ($1, NULL, NULL, $2, $3)`,
      [channelId, accountSid, enc]
    );
    await client.query(
      `INSERT INTO whatsapp_phone_numbers (channel_account_id, phone_number_id, display_phone_number)
       VALUES ($1, $2, $3)`,
      [channelId, syntheticId, display]
    );
    return { channelId, phoneNumberId: syntheticId };
  } finally {
    client.release();
  }
}

export async function listWhatsAppChannels(tenantId: string): Promise<WhatsAppChannelListItem[]> {
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
    const out: WhatsAppChannelListItem[] = [];
    for (const a of accs.rows) {
      const sec = await client.query<{ waba_id: string | null; twilio_account_sid: string | null }>(
        `SELECT waba_id, twilio_account_sid FROM whatsapp_channel_secrets WHERE channel_account_id = $1`,
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
        twilio_account_sid: sec.rows[0]?.twilio_account_sid ?? null,
        phone_numbers: phones.rows,
      });
    }
    return out;
  } finally {
    client.release();
  }
}

/** Resolve tenant pelo phone_number_id da Cloud API (roteamento de webhook Meta). */
export async function resolveTenantByWhatsAppPhoneNumberId(
  phoneNumberId: string
): Promise<{ tenantId: string; channelAccountId: string } | null> {
  await ensureSchema();
  const result = await pool.query<{ tenant_id: string; channel_account_id: string }>(
    `SELECT wca.tenant_id, wca.id AS channel_account_id
     FROM whatsapp_phone_numbers wpn
     JOIN whatsapp_channel_accounts wca ON wca.id = wpn.channel_account_id
     WHERE wpn.phone_number_id = $1
       AND wca.provider = $2
     LIMIT 1`,
    [phoneNumberId.trim(), WHATSAPP_PROVIDER_CLOUD]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { tenantId: row.tenant_id, channelAccountId: row.channel_account_id };
}

export type OutboundWhatsAppContext =
  | {
      provider: typeof WHATSAPP_PROVIDER_CLOUD;
      phoneNumberId: string;
      accessToken: string;
    }
  | {
      provider: typeof WHATSAPP_PROVIDER_TWILIO;
      accountSid: string;
      authToken: string;
      fromE164: string;
    };

export async function updateWhatsAppChannelLabel(
  tenantId: string,
  channelId: string,
  label: string
): Promise<void> {
  await ensureSchema();
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error("label é obrigatório");
  }
  const result = await pool.query(
    `UPDATE whatsapp_channel_accounts
     SET label = $1, updated_at = now()
     WHERE id = $2 AND tenant_id = $3`,
    [trimmed, channelId, tenantId]
  );
  if (result.rowCount === 0) {
    throw new Error("CANAL_NAO_ENCONTRADO");
  }
}

export async function deleteWhatsAppChannel(tenantId: string, channelId: string): Promise<void> {
  await ensureSchema();
  const result = await pool.query(
    `DELETE FROM whatsapp_channel_accounts
     WHERE id = $1 AND tenant_id = $2`,
    [channelId, tenantId]
  );
  if (result.rowCount === 0) {
    throw new Error("CANAL_NAO_ENCONTRADO");
  }
}

/**
 * Primeiro canal do tenant para envio: prioriza Meta (Cloud API), depois Twilio;
 * desempate por data de criação do número.
 */
export async function getOutboundWhatsAppContext(
  tenantId: string
): Promise<OutboundWhatsAppContext | null> {
  await ensureSchema();
  const client = await pool.connect();
  try {
    const row = await client.query<{
      provider: string;
      phone_number_id: string;
      display_phone_number: string | null;
      access_token_encrypted: string | null;
      twilio_account_sid: string | null;
      twilio_auth_token_encrypted: string | null;
    }>(
      `SELECT wca.provider,
              wpn.phone_number_id,
              wpn.display_phone_number,
              ws.access_token_encrypted,
              ws.twilio_account_sid,
              ws.twilio_auth_token_encrypted
       FROM whatsapp_channel_accounts wca
       JOIN whatsapp_phone_numbers wpn ON wpn.channel_account_id = wca.id
       JOIN whatsapp_channel_secrets ws ON ws.channel_account_id = wca.id
       WHERE wca.tenant_id = $1
       ORDER BY CASE wca.provider
                  WHEN 'whatsapp_cloud_api' THEN 0
                  WHEN 'twilio_whatsapp' THEN 1
                  ELSE 2
                END,
                wpn.created_at ASC
       LIMIT 1`,
      [tenantId]
    );
    if (row.rows.length === 0) return null;
    const r = row.rows[0];
    if (r.provider === WHATSAPP_PROVIDER_CLOUD) {
      if (!r.access_token_encrypted || !r.phone_number_id) return null;
      const accessToken = decryptSecret(r.access_token_encrypted);
      return {
        provider: WHATSAPP_PROVIDER_CLOUD,
        phoneNumberId: r.phone_number_id,
        accessToken,
      };
    }
    if (r.provider === WHATSAPP_PROVIDER_TWILIO) {
      if (!r.twilio_account_sid || !r.twilio_auth_token_encrypted) return null;
      const authToken = decryptSecret(r.twilio_auth_token_encrypted);
      const disp = (r.display_phone_number ?? "").trim();
      const fromE164 =
        disp.length > 0
          ? disp.startsWith("+")
            ? disp
            : `+${digitsOnly(disp)}`
          : `+${digitsOnly(r.phone_number_id.replace(/^twilio:/i, ""))}`;
      return {
        provider: WHATSAPP_PROVIDER_TWILIO,
        accountSid: r.twilio_account_sid,
        authToken,
        fromE164,
      };
    }
    return null;
  } finally {
    client.release();
  }
}

/** Contexto de envio para um canal WhatsApp específico do tenant. */
export async function getOutboundWhatsAppContextForChannel(
  tenantId: string,
  channelAccountId: string
): Promise<(OutboundWhatsAppContext & { channelAccountId: string; channelLabel: string }) | null> {
  await ensureSchema();
  const client = await pool.connect();
  try {
    const row = await client.query<{
      channel_id: string;
      label: string;
      provider: string;
      phone_number_id: string;
      display_phone_number: string | null;
      access_token_encrypted: string | null;
      twilio_account_sid: string | null;
      twilio_auth_token_encrypted: string | null;
    }>(
      `SELECT wca.id AS channel_id,
              wca.label,
              wca.provider,
              wpn.phone_number_id,
              wpn.display_phone_number,
              ws.access_token_encrypted,
              ws.twilio_account_sid,
              ws.twilio_auth_token_encrypted
       FROM whatsapp_channel_accounts wca
       JOIN whatsapp_phone_numbers wpn ON wpn.channel_account_id = wca.id
       JOIN whatsapp_channel_secrets ws ON ws.channel_account_id = wca.id
       WHERE wca.tenant_id = $1 AND wca.id = $2::uuid
       ORDER BY wpn.created_at ASC
       LIMIT 1`,
      [tenantId, channelAccountId]
    );
    if (row.rows.length === 0) return null;
    const r = row.rows[0];
    if (r.provider === WHATSAPP_PROVIDER_CLOUD) {
      if (!r.access_token_encrypted || !r.phone_number_id) return null;
      return {
        channelAccountId: r.channel_id,
        channelLabel: r.label,
        provider: WHATSAPP_PROVIDER_CLOUD,
        phoneNumberId: r.phone_number_id,
        accessToken: decryptSecret(r.access_token_encrypted),
      };
    }
    if (r.provider === WHATSAPP_PROVIDER_TWILIO) {
      if (!r.twilio_account_sid || !r.twilio_auth_token_encrypted) return null;
      const disp = (r.display_phone_number ?? "").trim();
      const fromE164 =
        disp.length > 0
          ? disp.startsWith("+")
            ? disp
            : `+${digitsOnly(disp)}`
          : `+${digitsOnly(r.phone_number_id.replace(/^twilio:/i, ""))}`;
      return {
        channelAccountId: r.channel_id,
        channelLabel: r.label,
        provider: WHATSAPP_PROVIDER_TWILIO,
        accountSid: r.twilio_account_sid,
        authToken: decryptSecret(r.twilio_auth_token_encrypted),
        fromE164,
      };
    }
    return null;
  } finally {
    client.release();
  }
}

export type TwilioWebhookResolution = {
  tenantId: string;
  channelAccountId: string;
  authToken: string;
};

/** Roteia webhook Twilio pelo Account SID + número de destino (seu WhatsApp Twilio). */
export async function resolveTenantByTwilioWebhook(
  accountSid: string,
  toWhatsApp: string
): Promise<TwilioWebhookResolution | null> {
  await ensureSchema();
  const toDigits = digitsOnly(toWhatsApp);
  if (!toDigits) return null;

  const synthetic = `twilio:${toDigits}`;

  const result = await pool.query<{
    tenant_id: string;
    channel_account_id: string;
    twilio_auth_token_encrypted: string;
  }>(
    `SELECT wca.tenant_id,
            wca.id AS channel_account_id,
            ws.twilio_auth_token_encrypted
     FROM whatsapp_channel_accounts wca
     JOIN whatsapp_channel_secrets ws ON ws.channel_account_id = wca.id
     JOIN whatsapp_phone_numbers wpn ON wpn.channel_account_id = wca.id
     WHERE wca.provider = $1
       AND ws.twilio_account_sid = $2
       AND ws.twilio_auth_token_encrypted IS NOT NULL
       AND (
         regexp_replace(coalesce(wpn.display_phone_number, ''), '[^0-9]', '', 'g') = $3
         OR wpn.phone_number_id = $4
       )
     LIMIT 1`,
    [WHATSAPP_PROVIDER_TWILIO, accountSid.trim(), toDigits, synthetic]
  );

  const row = result.rows[0];
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    channelAccountId: row.channel_account_id,
    authToken: decryptSecret(row.twilio_auth_token_encrypted),
  };
}

export type TwilioContentTemplateDto = {
  contentSid: string;
  friendlyName: string;
  language: string | null;
  variables: string[];
  bodyPreview: string;
};

/** Usa o primeiro canal Twilio do tenant (Account SID + Auth Token) para listar Content na API da Twilio. */
export async function listTwilioContentTemplatesForTenant(
  tenantId: string
): Promise<TwilioContentTemplateDto[]> {
  await ensureSchema();
  const row = await pool.query<{
    twilio_account_sid: string | null;
    twilio_auth_token_encrypted: string | null;
  }>(
    `SELECT ws.twilio_account_sid, ws.twilio_auth_token_encrypted
     FROM whatsapp_channel_accounts wca
     JOIN whatsapp_channel_secrets ws ON ws.channel_account_id = wca.id
     WHERE wca.tenant_id = $1 AND wca.provider = $2
     ORDER BY wca.created_at ASC
     LIMIT 1`,
    [tenantId, WHATSAPP_PROVIDER_TWILIO]
  );
  const r = row.rows[0];
  if (!r?.twilio_account_sid || !r?.twilio_auth_token_encrypted) {
    return [];
  }
  const authToken = decryptSecret(r.twilio_auth_token_encrypted);
  return fetchTwilioContentTemplates({
    accountSid: r.twilio_account_sid,
    authToken,
  });
}
