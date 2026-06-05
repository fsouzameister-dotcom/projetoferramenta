import { pool } from "./db";

export type Flow = {
  id: string;
  tenant_id: string;
  name: string;
  channel: string;
  is_active: boolean;
  created_at: string;
};

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE flows
      ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false
    `);
    await client.query(`
      ALTER TABLE flows
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

function mapFlowRow(row: {
  id: string;
  tenant_id: string;
  name: string;
  channel: string;
  is_active?: boolean;
  created_at?: Date | string;
}): Flow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    channel: row.channel,
    is_active: Boolean(row.is_active),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at
          ? String(row.created_at)
          : new Date().toISOString(),
  };
}

export async function listFlowsByTenant(tenantId: string): Promise<Flow[]> {
  await ensureSchema();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, tenant_id, name, channel, is_active, created_at
       FROM flows WHERE tenant_id = $1
       ORDER BY created_at DESC, name ASC`,
      [tenantId]
    );
    return result.rows.map(mapFlowRow);
  } finally {
    client.release();
  }
}

export async function createFlow(data: {
  tenantId: string;
  name: string;
  channel: string;
  isActive?: boolean;
}): Promise<Flow> {
  await ensureSchema();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO flows (id, tenant_id, name, channel, is_active)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       RETURNING id, tenant_id, name, channel, is_active, created_at`,
      [data.tenantId, data.name, data.channel, data.isActive ?? false]
    );
    return mapFlowRow(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function updateFlow(
  flowId: string,
  tenantId: string,
  data: { name?: string; channel?: string; isActive?: boolean }
): Promise<Flow | null> {
  await ensureSchema();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE flows
       SET name = COALESCE($1, name),
           channel = COALESCE($2, channel),
           is_active = COALESCE($3, is_active)
       WHERE id = $4 AND tenant_id = $5
       RETURNING id, tenant_id, name, channel, is_active, created_at`,
      [
        data.name ?? null,
        data.channel ?? null,
        data.isActive ?? null,
        flowId,
        tenantId,
      ]
    );
    const row = result.rows[0];
    return row ? mapFlowRow(row) : null;
  } finally {
    client.release();
  }
}
