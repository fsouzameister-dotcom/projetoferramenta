import { pool } from "./db";

interface Flow {
  id: string;
  tenant_id: string;
  name: string;
  channel: string;
}

export async function listFlowsByTenant(tenantId: string): Promise<Flow[]> {
  const client = await pool.connect();
  try {
    const result = await client.query<Flow>(
      `SELECT id, tenant_id, name, channel FROM flows WHERE tenant_id = $1`,
      [tenantId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export async function createFlow(data: {
  tenantId: string;
  name: string;
  channel: string;
}): Promise<Flow> {
  const client = await pool.connect();
  try {
    const result = await client.query<Flow>(
      `INSERT INTO flows (id, tenant_id, name, channel) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING *`,
      [data.tenantId, data.name, data.channel]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
