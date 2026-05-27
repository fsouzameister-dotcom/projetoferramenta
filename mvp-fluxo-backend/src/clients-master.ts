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

export type MasterClientWithPhones = {
  client: MasterClientRecord;
  phones: MasterClientPhoneRecord[];
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

export async function getMasterClientById(input: {
  tenantId: string;
  clientId: string;
}): Promise<MasterClientRecord | null> {
  const result = await pool.query(
    `SELECT * FROM clients
     WHERE tenant_id = $1::uuid AND id = $2::uuid
     LIMIT 1`,
    [input.tenantId, input.clientId]
  );
  if (!result.rows[0]) return null;
  return mapRow(result.rows[0] as Record<string, unknown>);
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

export async function updateMasterClient(input: {
  tenantId: string;
  clientId: string;
  name?: string;
  email?: string | null;
  document?: string | null;
  externalId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<MasterClientRecord | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (input.name !== undefined) {
    sets.push(`name = $${idx++}`);
    values.push(input.name.trim());
  }
  if (input.email !== undefined) {
    sets.push(`email = $${idx++}`);
    values.push(input.email ? input.email.trim() : null);
  }
  if (input.document !== undefined) {
    sets.push(`document = $${idx++}`);
    values.push(input.document ? input.document.trim() : null);
  }
  if (input.externalId !== undefined) {
    sets.push(`external_id = $${idx++}`);
    values.push(input.externalId ? input.externalId.trim() : null);
  }
  if (input.metadata !== undefined) {
    sets.push(`metadata = $${idx++}::jsonb`);
    values.push(JSON.stringify(input.metadata ?? {}));
  }
  if (sets.length === 0) return null;
  sets.push("updated_at = now()");
  values.push(input.tenantId, input.clientId);
  const result = await pool.query(
    `UPDATE clients
     SET ${sets.join(", ")}
     WHERE tenant_id = $${idx++}::uuid AND id = $${idx}::uuid
     RETURNING *`,
    values
  );
  if (!result.rows[0]) return null;
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

export async function updateMasterClientPhone(input: {
  tenantId: string;
  clientId: string;
  phoneId: string;
  phoneE164?: string;
  label?: string | null;
  isPrimary?: boolean;
  isWhatsApp?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<MasterClientPhoneRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (input.phoneE164 !== undefined) {
      const normalized = normalizeE164(input.phoneE164);
      if (!normalized) throw new Error("INVALID_PHONE_E164");
      sets.push(`phone_e164 = $${idx++}`);
      values.push(normalized);
    }
    if (input.label !== undefined) {
      sets.push(`label = $${idx++}`);
      values.push(input.label ? input.label.trim() : null);
    }
    if (input.isWhatsApp !== undefined) {
      sets.push(`is_whatsapp = $${idx++}`);
      values.push(Boolean(input.isWhatsApp));
    }
    if (input.metadata !== undefined) {
      sets.push(`metadata = $${idx++}::jsonb`);
      values.push(JSON.stringify(input.metadata ?? {}));
    }
    if (sets.length === 0 && input.isPrimary === undefined) {
      await client.query("ROLLBACK");
      return null;
    }

    if (input.isPrimary) {
      await client.query(
        `UPDATE client_phones
         SET is_primary = false, updated_at = now()
         WHERE tenant_id = $1::uuid AND client_id = $2::uuid`,
        [input.tenantId, input.clientId]
      );
      sets.push(`is_primary = true`);
    } else if (input.isPrimary === false) {
      sets.push(`is_primary = false`);
    }
    sets.push("updated_at = now()");
    values.push(input.tenantId, input.clientId, input.phoneId);
    const result = await client.query(
      `UPDATE client_phones
       SET ${sets.join(", ")}
       WHERE tenant_id = $${idx++}::uuid AND client_id = $${idx++}::uuid AND id = $${idx}::uuid
       RETURNING *`,
      values
    );
    await client.query("COMMIT");
    if (!result.rows[0]) return null;
    return mapPhoneRow(result.rows[0] as Record<string, unknown>);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteMasterClientPhone(input: {
  tenantId: string;
  clientId: string;
  phoneId: string;
}): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM client_phones
     WHERE tenant_id = $1::uuid AND client_id = $2::uuid AND id = $3::uuid`,
    [input.tenantId, input.clientId, input.phoneId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteMasterClient(input: {
  tenantId: string;
  clientId: string;
}): Promise<{ ok: boolean; blockedReason?: "linked_conversation" }> {
  const linked = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'agent_conversations'
       AND column_name = 'client_id'`
  );
  if ((linked.rowCount ?? 0) > 0) {
    const inUse = await pool.query(
      `SELECT 1
       FROM agent_conversations
       WHERE tenant_id = $1::uuid AND client_id = $2::uuid
       LIMIT 1`,
      [input.tenantId, input.clientId]
    );
    if ((inUse.rowCount ?? 0) > 0) {
      return { ok: false, blockedReason: "linked_conversation" };
    }
  }

  const result = await pool.query(
    `DELETE FROM clients
     WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [input.tenantId, input.clientId]
  );
  return { ok: (result.rowCount ?? 0) > 0 };
}

export async function getMasterClientWithPhones(input: {
  tenantId: string;
  clientId: string;
}): Promise<MasterClientWithPhones | null> {
  const client = await getMasterClientById({
    tenantId: input.tenantId,
    clientId: input.clientId,
  });
  if (!client) return null;
  const phones = await listMasterClientPhones({
    tenantId: input.tenantId,
    clientId: input.clientId,
  });
  return { client, phones };
}
