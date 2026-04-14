import { pool } from "./db";

export type Node = {
  id: string;
  flow_id: string;
  type: string;
  name: string;
  config: any;
  is_start: boolean;
  created_at: string;
  updated_at: string;
};

// Listar nodes de um fluxo
export async function listNodesByFlow(flowId: string): Promise<Node[]> {
  const { rows } = await pool.query<Node>(
    `SELECT * FROM nodes WHERE flow_id = $1 ORDER BY created_at ASC`,
    [flowId]
  );
  return rows;
}

// Criar node
export type CreateNodeInput = {
  flowId: string;
  type: string;
  name: string;
  config: any;
  isStart: boolean;
};

export async function createNode(input: CreateNodeInput): Promise<Node> {
  const { flowId, type, name, config, isStart } = input;

  const { rows } = await pool.query<Node>(
    `
    INSERT INTO nodes (flow_id, type, name, config, is_start)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [flowId, type, name, config, isStart ?? false]
  );

  return rows[0];
}

// Atualizar node
export type UpdateNodeInput = {
  type?: string;
  name?: string;
  config?: any;
  is_start?: boolean;
};

export async function updateNode(
  nodeId: string,
  input: UpdateNodeInput
): Promise<Node> {
  const { type, name, config, is_start } = input;

  const { rows } = await pool.query<Node>(
    `
    UPDATE nodes
    SET 
      type = COALESCE($1, type),
      name = COALESCE($2, name),
      config = COALESCE($3, config),
      is_start = COALESCE($4, is_start),
      updated_at = NOW()
    WHERE id = $5
    RETURNING *
    `,
    [type, name, config, is_start, nodeId]
  );

  if (!rows.length) {
    throw new Error("Node não encontrado");
  }

  return rows[0];
}

// Deletar node
export async function deleteNode(nodeId: string): Promise<void> {
  await pool.query(`DELETE FROM nodes WHERE id = $1`, [nodeId]);
}