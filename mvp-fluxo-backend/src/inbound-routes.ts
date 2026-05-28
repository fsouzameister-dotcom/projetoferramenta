import { pool } from "./db";

export const INBOUND_SOURCE_TYPES = [
  "whatsapp_meta",
  "twilio_whatsapp",
  "landing_page",
  "site_form",
  "facebook_lead",
  "instagram_lead",
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

  const result = await pool.query<InboundEntryRouteRow>(
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
  const row = result.rows[0];
  if (!row) return null;
  return { ...row, metadata: (row.metadata as Record<string, unknown>) ?? {} };
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
  const sourceKey = input.sourceKey.trim();
  const flowId = input.flowId.trim();
  if (!label || !sourceType || !sourceKey || !flowId) {
    throw new Error("VALIDATION");
  }
  if (!INBOUND_SOURCE_TYPES.includes(sourceType as InboundSourceType)) {
    throw new Error("INVALID_SOURCE_TYPE");
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
  const sourceKey = data.sourceKey?.trim();
  const flowId = data.flowId?.trim();
  if (sourceType && !INBOUND_SOURCE_TYPES.includes(sourceType as InboundSourceType)) {
    throw new Error("INVALID_SOURCE_TYPE");
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
