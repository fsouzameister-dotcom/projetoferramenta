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
