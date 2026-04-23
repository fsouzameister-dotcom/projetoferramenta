import { pool } from "./db";
import type { PoolClient } from "pg";

type NodePosition = { x: number; y: number } | null;

interface Node {
  id: string;
  flow_id: string;
  type: string;
  name: string;
  config: unknown;
  is_start: boolean;
  position?: NodePosition;
}

let hasPositionColumnCache: boolean | null = null;

async function hasPositionColumn(client: PoolClient) {
  if (hasPositionColumnCache !== null) {
    return hasPositionColumnCache;
  }
  const result = await client.query(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'nodes'
        AND column_name = 'position'
    ) AS has_position`
  );
  hasPositionColumnCache = Boolean(result.rows[0]?.has_position);
  return hasPositionColumnCache;
}

export async function listNodesByFlow(
  flowId: string,
  tenantId: string
): Promise<Node[]> {
  const client = await pool.connect();
  try {
    const flowCheck = await client.query(
      `SELECT id FROM flows WHERE id = $1 AND tenant_id = $2`,
      [flowId, tenantId]
    );
    if (flowCheck.rows.length === 0) {
      throw new Error("Flow not found or does not belong to this tenant");
    }
    const withPosition = await hasPositionColumn(client);
    const result = withPosition
      ? await client.query<Node>(`SELECT * FROM nodes WHERE flow_id = $1`, [flowId])
      : await client.query<Node>(
          `SELECT id, flow_id, type, name, config, is_start, NULL::jsonb AS position
           FROM nodes WHERE flow_id = $1`,
          [flowId]
        );
    return result.rows;
  } finally {
    client.release();
  }
}

export async function createNode(
  data: {
    flowId: string;
    type: string;
    name: string;
    config?: unknown;
    isStart?: boolean;
    position?: NodePosition;
  },
  tenantId: string
): Promise<Node> {
  const client = await pool.connect();
  try {
    const flowCheck = await client.query(
      `SELECT id FROM flows WHERE id = $1 AND tenant_id = $2`,
      [data.flowId, tenantId]
    );
    if (flowCheck.rows.length === 0) {
      throw new Error("Flow not found or does not belong to this tenant");
    }

    const withPosition = await hasPositionColumn(client);
    const result = withPosition
      ? await client.query<Node>(
          `INSERT INTO nodes (id, flow_id, type, name, config, is_start, position)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            data.flowId,
            data.type,
            data.name,
            data.config ?? {},
            data.isStart ?? false,
            data.position ?? null,
          ]
        )
      : await client.query<Node>(
          `INSERT INTO nodes (id, flow_id, type, name, config, is_start)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
           RETURNING *`,
          [
            data.flowId,
            data.type,
            data.name,
            data.config ?? {},
            data.isStart ?? false,
          ]
        );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function updateNode(
  nodeId: string,
  data: {
    type?: string;
    name?: string;
    config?: unknown;
    is_start?: boolean;
    position?: NodePosition;
  },
  tenantId: string,
  flowId: string
): Promise<Node | null> {
  const client = await pool.connect();
  try {
    const nodeCheck = await client.query(
      `SELECT n.id FROM nodes n JOIN flows f ON n.flow_id = f.id WHERE n.id = $1 AND f.id = $2 AND f.tenant_id = $3`,
      [nodeId, flowId, tenantId]
    );
    if (nodeCheck.rows.length === 0) {
      throw new Error("Node not found or does not belong to this tenant");
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.type !== undefined) {
      setClauses.push(`type = $${paramIndex++}`);
      values.push(data.type);
    }
    if (data.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.config !== undefined) {
      setClauses.push(`config = $${paramIndex++}`);
      values.push(data.config);
    }
    if (data.is_start !== undefined) {
      setClauses.push(`is_start = $${paramIndex++}`);
      values.push(data.is_start);
    }
    if (data.position !== undefined && (await hasPositionColumn(client))) {
      setClauses.push(`position = $${paramIndex++}`);
      values.push(data.position);
    }

    if (setClauses.length === 0) {
      return null;
    }

    values.push(nodeId);

    const result = await client.query<Node>(
      `UPDATE nodes SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

export async function deleteNode(
  nodeId: string,
  tenantId: string,
  flowId: string
): Promise<void> {
  const client = await pool.connect();
  try {
    const nodeCheck = await client.query(
      `SELECT n.id FROM nodes n JOIN flows f ON n.flow_id = f.id WHERE n.id = $1 AND f.id = $2 AND f.tenant_id = $3`,
      [nodeId, flowId, tenantId]
    );
    if (nodeCheck.rows.length === 0) {
      throw new Error("Node not found or does not belong to this tenant");
    }

    await client.query(`DELETE FROM nodes WHERE id = $1`, [nodeId]);
  } finally {
    client.release();
  }
}
