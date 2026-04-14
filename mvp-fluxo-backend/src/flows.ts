import { pool } from "./db";

export type Flow = {
  id: string;
  tenant_id: string;
  name: string;
  channel: string;
  created_at: string;
  updated_at: string;
};

// Listar flows de um tenant
export async function listFlowsByTenant(tenantId: string): Promise<Flow[]> {
  const { rows } = await pool.query<Flow>(
    `SELECT * FROM flows WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows;
}

// Buscar flow por ID
export async function getFlowById(flowId: string): Promise<Flow | null> {
  const { rows } = await pool.query<Flow>(
    `SELECT * FROM flows WHERE id = $1`,
    [flowId]
  );
  return rows[0] || null;
}

// Criar flow
export type CreateFlowInput = {
  tenantId: string;
  name: string;
  channel: string;
};

export async function createFlow(input: CreateFlowInput): Promise<Flow> {
  const { tenantId, name, channel } = input;

  const { rows } = await pool.query<Flow>(
    `
    INSERT INTO flows (tenant_id, name, channel)
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [tenantId, name, channel]
  );

  return rows[0];
}