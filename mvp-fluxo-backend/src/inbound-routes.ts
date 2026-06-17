import { pool } from "./db";
import { matchesInboundTrigger } from "./flow-field-validators";
import { WHATSAPP_PROVIDER_TWILIO } from "./whatsapp-channels";
import { buildCtwaSourceKey, type CtwaReferral } from "./ctwa-referral";

export const INBOUND_SOURCE_TYPES = [
  "whatsapp_meta",
  "twilio_whatsapp",
  "landing_page",
  "site_form",
  "facebook_lead",
  "instagram_lead",
  "ctwa",
  "custom",
] as const;

export type InboundSourceType = (typeof INBOUND_SOURCE_TYPES)[number];

export type InboundEntryRouteRow = {
  id: string;
  tenant_id: string;
  label: string;
  source_type: string;
  source_key: string;
  flow_id: string;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS inbound_entry_routes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        label text NOT NULL,
        source_type text NOT NULL,
        source_key text NOT NULL,
        flow_id uuid NOT NULL,
        active boolean NOT NULL DEFAULT true,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_route_tenant_source
      ON inbound_entry_routes (tenant_id, source_type, source_key)
    `);
    await client.query(`
      ALTER TABLE inbound_entry_routes
      ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

export async function listInboundRoutes(tenantId: string): Promise<InboundEntryRouteRow[]> {
  await ensureSchema();
  const result = await pool.query<InboundEntryRouteRow>(
    `SELECT id, tenant_id, label, source_type, source_key, flow_id, active,
            metadata, created_at::text, updated_at::text
     FROM inbound_entry_routes
     WHERE tenant_id = $1
     ORDER BY source_type ASC, source_key ASC`,
    [tenantId]
  );
  return result.rows.map((row) => ({
    ...row,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  }));
}

export async function resolveInboundRoute(input: {
  tenantId: string;
  sourceType: string;
  sourceKey: string;
}): Promise<InboundEntryRouteRow | null> {
  await ensureSchema();
  const sourceKey = input.sourceKey.trim();
  const sourceType = input.sourceType.trim();
  if (!sourceKey || !sourceType) return null;

  const exact = await pool.query<InboundEntryRouteRow>(
    `SELECT id, tenant_id, label, source_type, source_key, flow_id, active,
            metadata, created_at::text, updated_at::text
     FROM inbound_entry_routes
     WHERE tenant_id = $1
       AND source_type = $2
       AND source_key = $3
       AND active = true
     LIMIT 1`,
    [input.tenantId, sourceType, sourceKey]
  );
  const exactRow = exact.rows[0];
  if (exactRow) {
    return { ...exactRow, metadata: (exactRow.metadata as Record<string, unknown>) ?? {} };
  }

  if (sourceType === WHATSAPP_PROVIDER_TWILIO) {
    const incomingDigits = twilioRoutePhoneDigits(sourceKey);
    if (incomingDigits) {
      const fallback = await pool.query<InboundEntryRouteRow>(
        `SELECT id, tenant_id, label, source_type, source_key, flow_id, active,
                metadata, created_at::text, updated_at::text
         FROM inbound_entry_routes
         WHERE tenant_id = $1
           AND source_type = $2
           AND active = true
           AND (
             source_key = $3
             OR regexp_replace(
                  CASE
                    WHEN source_key ~* '^twilio:' THEN regexp_replace(source_key, '^twilio:[^:]+:', '')
                    ELSE source_key
                  END,
                  '[^0-9]', '', 'g'
                ) = $3
           )
         ORDER BY
           CASE WHEN source_key = $4 THEN 0 ELSE 1 END,
           updated_at DESC
         LIMIT 1`,
        [input.tenantId, sourceType, incomingDigits, sourceKey]
      );
      const fallbackRow = fallback.rows[0];
      if (fallbackRow) {
        return { ...fallbackRow, metadata: (fallbackRow.metadata as Record<string, unknown>) ?? {} };
      }
    }
  }

  return null;
}

/** Rota dedicada para Click-to-WhatsApp (anúncio Meta → primeira mensagem WA). */
export async function resolveCtwaInboundRoute(input: {
  tenantId: string;
  referral: CtwaReferral;
}): Promise<InboundEntryRouteRow | null> {
  const primaryKey = buildCtwaSourceKey(input.referral);
  const exact = await resolveInboundRoute({
    tenantId: input.tenantId,
    sourceType: "ctwa",
    sourceKey: primaryKey,
  });
  if (exact) return exact;

  if (primaryKey !== "default") {
    return resolveInboundRoute({
      tenantId: input.tenantId,
      sourceType: "ctwa",
      sourceKey: "default",
    });
  }
  return null;
}

/**
 * Roteia pela primeira mensagem quando a rota tem metadata.message_triggers.
 * Ex.: ["cadastrar-se"] → Fluxo Fox Pesquisas.
 */
export async function resolveInboundRouteByFirstMessage(input: {
  tenantId: string;
  sourceType: string;
  sourceKey: string;
  messageText: string;
}): Promise<InboundEntryRouteRow | null> {
  await ensureSchema();
  const messageText = input.messageText?.trim();
  if (!messageText) return null;

  const sourceType = input.sourceType.trim();
  const sourceKey = input.sourceKey.trim();
  if (!sourceType || !sourceKey) return null;

  const candidates = await pool.query<InboundEntryRouteRow>(
    `SELECT id, tenant_id, label, source_type, source_key, flow_id, active,
            metadata, created_at::text, updated_at::text
     FROM inbound_entry_routes
     WHERE tenant_id = $1
       AND source_type = $2
       AND active = true
       AND jsonb_array_length(COALESCE(metadata->'message_triggers', '[]'::jsonb)) > 0
     ORDER BY updated_at DESC`,
    [input.tenantId, sourceType]
  );

  const incomingDigits =
    sourceType === WHATSAPP_PROVIDER_TWILIO ? twilioRoutePhoneDigits(sourceKey) : "";

  for (const row of candidates.rows) {
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const triggers = Array.isArray(meta.message_triggers)
      ? meta.message_triggers.map((t) => String(t))
      : [];
    if (!triggers.length || !matchesInboundTrigger(messageText, triggers)) {
      continue;
    }

    const routeKey = row.source_key.trim();
    const routeDigits =
      sourceType === WHATSAPP_PROVIDER_TWILIO ? twilioRoutePhoneDigits(routeKey) : "";
    const sameChannel =
      routeKey === sourceKey ||
      (incomingDigits && routeDigits && incomingDigits === routeDigits) ||
      meta.match_any_source_key === true;

    if (sameChannel) {
      return { ...row, metadata: meta };
    }
  }

  return null;
}

export async function createInboundRoute(input: {
  tenantId: string;
  label: string;
  sourceType: string;
  sourceKey: string;
  flowId: string;
  active?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<InboundEntryRouteRow> {
  await ensureSchema();
  const label = input.label.trim();
  const sourceType = input.sourceType.trim();
  let sourceKey = input.sourceKey.trim();
  const flowId = input.flowId.trim();
  if (!label || !sourceType || !sourceKey || !flowId) {
    throw new Error("VALIDATION");
  }
  if (!INBOUND_SOURCE_TYPES.includes(sourceType as InboundSourceType)) {
    throw new Error("INVALID_SOURCE_TYPE");
  }
  if (sourceType === WHATSAPP_PROVIDER_TWILIO) {
    sourceKey = await normalizeTwilioSourceKeyForTenant(input.tenantId, sourceKey);
  }

  try {
    const result = await pool.query<InboundEntryRouteRow>(
      `INSERT INTO inbound_entry_routes (tenant_id, label, source_type, source_key, flow_id, active, metadata)
       VALUES ($1, $2, $3, $4, $5::uuid, $6, $7::jsonb)
       RETURNING id, tenant_id, label, source_type, source_key, flow_id, active,
                 metadata, created_at::text, updated_at::text`,
      [
        input.tenantId,
        label,
        sourceType,
        sourceKey,
        flowId,
        input.active ?? true,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    const row = result.rows[0];
    return { ...row, metadata: (row.metadata as Record<string, unknown>) ?? {} };
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") throw new Error("ROUTE_DUPLICATE");
    throw e;
  }
}

export async function updateInboundRoute(
  tenantId: string,
  routeId: string,
  data: {
    label?: string;
    sourceType?: string;
    sourceKey?: string;
    flowId?: string;
    active?: boolean;
    metadata?: Record<string, unknown>;
  }
): Promise<InboundEntryRouteRow | null> {
  await ensureSchema();
  const existing = await pool.query<InboundEntryRouteRow>(
    `SELECT id FROM inbound_entry_routes WHERE id = $1 AND tenant_id = $2`,
    [routeId, tenantId]
  );
  if (existing.rows.length === 0) return null;

  const label = data.label?.trim();
  const sourceType = data.sourceType?.trim();
  let sourceKey = data.sourceKey?.trim();
  const flowId = data.flowId?.trim();
  if (sourceType && !INBOUND_SOURCE_TYPES.includes(sourceType as InboundSourceType)) {
    throw new Error("INVALID_SOURCE_TYPE");
  }
  if (sourceKey && (sourceType === WHATSAPP_PROVIDER_TWILIO || !sourceType)) {
    const effectiveType =
      sourceType ??
      (
        await pool.query<{ source_type: string }>(
          `SELECT source_type FROM inbound_entry_routes WHERE id = $1 AND tenant_id = $2`,
          [routeId, tenantId]
        )
      ).rows[0]?.source_type;
    if (effectiveType === WHATSAPP_PROVIDER_TWILIO) {
      sourceKey = await normalizeTwilioSourceKeyForTenant(tenantId, sourceKey);
    }
  }

  try {
    const result = await pool.query<InboundEntryRouteRow>(
      `UPDATE inbound_entry_routes
       SET label = COALESCE($3, label),
           source_type = COALESCE($4, source_type),
           source_key = COALESCE($5, source_key),
           flow_id = COALESCE($6::uuid, flow_id),
           active = COALESCE($7, active),
           metadata = COALESCE($8::jsonb, metadata),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, tenant_id, label, source_type, source_key, flow_id, active,
                 metadata, created_at::text, updated_at::text`,
      [
        routeId,
        tenantId,
        label ?? null,
        sourceType ?? null,
        sourceKey ?? null,
        flowId ?? null,
        data.active ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );
    const row = result.rows[0];
    return { ...row, metadata: (row.metadata as Record<string, unknown>) ?? {} };
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") throw new Error("ROUTE_DUPLICATE");
    throw e;
  }
}

export async function deleteInboundRoute(tenantId: string, routeId: string): Promise<boolean> {
  await ensureSchema();
  const result = await pool.query(
    `DELETE FROM inbound_entry_routes WHERE id = $1 AND tenant_id = $2`,
    [routeId, tenantId]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Chave de origem para canal Meta (phone_number_id do webhook). */
export function whatsAppMetaSourceKey(phoneNumberId: string): string {
  return `meta:${phoneNumberId.trim()}`;
}

/** Chave de origem para canal Twilio (número de destino do webhook). */
export function whatsAppTwilioSourceKey(accountSid: string, toWhatsApp: string): string {
  const digits = toWhatsApp.replace(/\D/g, "");
  return `twilio:${accountSid.trim()}:${digits}`;
}

/** Extrai só os dígitos do número WhatsApp de uma chave Twilio (com ou sem prefixo). */
export function twilioRoutePhoneDigits(sourceKey: string): string {
  const trimmed = sourceKey.trim();
  if (!trimmed) return "";
  const prefixed = trimmed.match(/^twilio:[^:]+:(\d+)$/i);
  if (prefixed) return prefixed[1];
  return trimmed.replace(/\D/g, "");
}

async function normalizeTwilioSourceKeyForTenant(
  tenantId: string,
  sourceKey: string
): Promise<string> {
  const trimmed = sourceKey.trim();
  if (!trimmed || /^twilio:/i.test(trimmed)) return trimmed;

  const digits = twilioRoutePhoneDigits(trimmed);
  if (!digits) return trimmed;

  const result = await pool.query<{ twilio_account_sid: string }>(
    `SELECT ws.twilio_account_sid
     FROM whatsapp_channel_accounts wca
     JOIN whatsapp_channel_secrets ws ON ws.channel_account_id = wca.id
     JOIN whatsapp_phone_numbers wpn ON wpn.channel_account_id = wca.id
     WHERE wca.tenant_id = $1
       AND wca.provider = $2
       AND ws.twilio_account_sid IS NOT NULL
       AND (
         regexp_replace(coalesce(wpn.display_phone_number, ''), '[^0-9]', '', 'g') = $3
         OR regexp_replace(wpn.phone_number_id, '[^0-9]', '', 'g') = $3
       )
     ORDER BY wca.created_at ASC
     LIMIT 1`,
    [tenantId, WHATSAPP_PROVIDER_TWILIO, digits]
  );

  const accountSid = result.rows[0]?.twilio_account_sid?.trim();
  if (!accountSid) return trimmed;
  return whatsAppTwilioSourceKey(accountSid, digits);
}
