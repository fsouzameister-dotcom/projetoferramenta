import { pool } from "./db";

export type TabulacaoRecord = {
  id: string;
  tenantId: string;
  key: string;
  label: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

let schemaReady = false;

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function mapRow(row: Record<string, unknown>): TabulacaoRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    key: String(row.key),
    label: String(row.label),
    description: row.description ? String(row.description) : null,
    active: Boolean(row.active),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

async function ensureSchema() {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tabulacoes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        key text NOT NULL,
        label text NOT NULL,
        description text,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, key)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tabulacoes_tenant_active
      ON tabulacoes (tenant_id, active, label)
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

export async function listTabulacoesByTenant(tenantId: string): Promise<TabulacaoRecord[]> {
  await ensureSchema();
  const result = await pool.query(
    `SELECT * FROM tabulacoes
     WHERE tenant_id = $1::uuid
     ORDER BY active DESC, label ASC`,
    [tenantId]
  );
  return result.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function createTabulacao(input: {
  tenantId: string;
  key: string;
  label: string;
  description?: string;
}): Promise<TabulacaoRecord> {
  await ensureSchema();
  const key = normalizeKey(input.key || input.label);
  const label = input.label.trim();
  const description = input.description?.trim() || null;
  const result = await pool.query(
    `INSERT INTO tabulacoes (tenant_id, key, label, description, active)
     VALUES ($1::uuid, $2, $3, $4, true)
     RETURNING *`,
    [input.tenantId, key, label, description]
  );
  return mapRow(result.rows[0] as Record<string, unknown>);
}

export async function updateTabulacao(
  input: {
    tenantId: string;
    tabulacaoId: string;
    key?: string;
    label?: string;
    description?: string | null;
    active?: boolean;
  }
): Promise<TabulacaoRecord | null> {
  await ensureSchema();
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (input.key !== undefined) {
    updates.push(`key = $${idx++}`);
    values.push(normalizeKey(input.key));
  }
  if (input.label !== undefined) {
    updates.push(`label = $${idx++}`);
    values.push(input.label.trim());
  }
  if (input.description !== undefined) {
    updates.push(`description = $${idx++}`);
    values.push(input.description ? input.description.trim() : null);
  }
  if (input.active !== undefined) {
    updates.push(`active = $${idx++}`);
    values.push(input.active);
  }
  if (updates.length === 0) return null;
  updates.push("updated_at = now()");
  values.push(input.tenantId, input.tabulacaoId);
  const result = await pool.query(
    `UPDATE tabulacoes
     SET ${updates.join(", ")}
     WHERE tenant_id = $${idx++}::uuid AND id = $${idx}::uuid
     RETURNING *`,
    values
  );
  if (!result.rows[0]) return null;
  return mapRow(result.rows[0] as Record<string, unknown>);
}

export async function deleteTabulacao(
  tenantId: string,
  tabulacaoId: string
): Promise<boolean> {
  await ensureSchema();
  const result = await pool.query(
    `DELETE FROM tabulacoes
     WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, tabulacaoId]
  );
  return (result.rowCount ?? 0) > 0;
}
