import { pool } from "./db";

export type MasterClientRecord = {
  id: string;
  tenantId: string;
  externalId: string | null;
  name: string;
  email: string | null;
  document: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MasterClientPhoneRecord = {
  id: string;
  tenantId: string;
  clientId: string;
  phoneE164: string;
  label: string | null;
  isPrimary: boolean;
  isWhatsApp: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: Record<string, unknown>): MasterClientRecord {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    externalId: row.external_id ? String(row.external_id) : null,
    name: String(row.name),
    email: row.email ? String(row.email) : null,
    document: row.document ? String(row.document) : null,
    metadata,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

function mapPhoneRow(row: Record<string, unknown>): MasterClientPhoneRecord {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    clientId: String(row.client_id),
    phoneE164: String(row.phone_e164),
    label: row.label ? String(row.label) : null,
    isPrimary: Boolean(row.is_primary),
    isWhatsApp: Boolean(row.is_whatsapp),
    metadata,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

function normalizeE164(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const normalized = raw.replace(/[^\d+]/g, "");
  if (normalized.startsWith("+")) return normalized;
  return `+${normalized.replace(/\D/g, "")}`;
}

export async function listMasterClientsByTenant(input: {
  tenantId: string;
  search?: string;
  limit?: number;
}): Promise<MasterClientRecord[]> {
  const clauses = ["tenant_id = $1::uuid"];
  const params: unknown[] = [input.tenantId];
  let idx = 2;
  if (input.search?.trim()) {
    clauses.push(`(name ILIKE $${idx} OR email ILIKE $${idx} OR document ILIKE $${idx})`);
    params.push(`%${input.search.trim()}%`);
    idx += 1;
  }
  const limit = typeof input.limit === "number" && input.limit > 0 ? Math.min(input.limit, 200) : 50;
  params.push(limit);
  const result = await pool.query(
    `SELECT * FROM clients
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${idx}`,
    params
  );
  return result.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function createMasterClient(input: {
  tenantId: string;
  name: string;
  email?: string;
  document?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
}): Promise<MasterClientRecord> {
  const result = await pool.query(
    `INSERT INTO clients (tenant_id, name, email, document, external_id, metadata)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [
      input.tenantId,
      input.name.trim(),
      input.email?.trim() || null,
      input.document?.trim() || null,
      input.externalId?.trim() || null,
      JSON.stringify(input.metadata ?? {}),
    ]
  );
  return mapRow(result.rows[0] as Record<string, unknown>);
}

export async function listMasterClientPhones(input: {
  tenantId: string;
  clientId: string;
}): Promise<MasterClientPhoneRecord[]> {
  const result = await pool.query(
    `SELECT * FROM client_phones
     WHERE tenant_id = $1::uuid AND client_id = $2::uuid
     ORDER BY is_primary DESC, created_at ASC`,
    [input.tenantId, input.clientId]
  );
  return result.rows.map((row) => mapPhoneRow(row as Record<string, unknown>));
}

export async function createMasterClientPhone(input: {
  tenantId: string;
  clientId: string;
  phoneE164: string;
  label?: string;
  isPrimary?: boolean;
  isWhatsApp?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<MasterClientPhoneRecord> {
  const phoneE164 = normalizeE164(input.phoneE164);
  if (!phoneE164) {
    throw new Error("INVALID_PHONE_E164");
  }
  const clientCheck = await pool.query(
    `SELECT id FROM clients WHERE id = $1::uuid AND tenant_id = $2::uuid`,
    [input.clientId, input.tenantId]
  );
  if (!clientCheck.rows[0]) {
    throw new Error("CLIENT_NOT_FOUND");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.isPrimary) {
      await client.query(
        `UPDATE client_phones
         SET is_primary = false, updated_at = now()
         WHERE tenant_id = $1::uuid AND client_id = $2::uuid`,
        [input.tenantId, input.clientId]
      );
    }
    const inserted = await client.query(
      `INSERT INTO client_phones (
        tenant_id, client_id, phone_e164, label, is_primary, is_whatsapp, metadata
      ) VALUES (
        $1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb
      )
      RETURNING *`,
      [
        input.tenantId,
        input.clientId,
        phoneE164,
        input.label?.trim() || null,
        Boolean(input.isPrimary),
        input.isWhatsApp !== undefined ? Boolean(input.isWhatsApp) : true,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    await client.query("COMMIT");
    return mapPhoneRow(inserted.rows[0] as Record<string, unknown>);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
