import { pool } from "./db";

export type KnowledgeBaseRecord = {
  id: string;
  tenant_id: string;
  key: string;
  name: string;
  description: string | null;
  content: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

let schemaReady = false;

export async function ensureKnowledgeBaseSchema(): Promise<void> {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_knowledge_bases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        key text NOT NULL,
        name text NOT NULL,
        description text,
        content jsonb NOT NULL DEFAULT '{}'::jsonb,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, key)
      )
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

function mapRow(row: Record<string, unknown>): KnowledgeBaseRecord {
  const content =
    row.content && typeof row.content === "object" && !Array.isArray(row.content)
      ? (row.content as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    key: String(row.key),
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    content,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listKnowledgeBases(tenantId: string): Promise<KnowledgeBaseRecord[]> {
  await ensureKnowledgeBaseSchema();
  const result = await pool.query(
    `SELECT * FROM ai_knowledge_bases
     WHERE tenant_id = $1::uuid
     ORDER BY is_active DESC, name ASC`,
    [tenantId]
  );
  return result.rows.map((r) => mapRow(r as Record<string, unknown>));
}

export async function getKnowledgeBaseById(
  tenantId: string,
  id: string
): Promise<KnowledgeBaseRecord | null> {
  await ensureKnowledgeBaseSchema();
  const result = await pool.query(
    `SELECT * FROM ai_knowledge_bases WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, id]
  );
  if (!result.rows[0]) return null;
  return mapRow(result.rows[0] as Record<string, unknown>);
}

export async function createKnowledgeBase(input: {
  tenantId: string;
  key: string;
  name: string;
  description?: string;
  content?: Record<string, unknown>;
}): Promise<KnowledgeBaseRecord> {
  await ensureKnowledgeBaseSchema();
  const result = await pool.query(
    `INSERT INTO ai_knowledge_bases (tenant_id, key, name, description, content)
     VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [
      input.tenantId,
      input.key.trim().toLowerCase().replace(/\s+/g, "_"),
      input.name.trim(),
      input.description?.trim() || null,
      JSON.stringify(input.content ?? {}),
    ]
  );
  return mapRow(result.rows[0] as Record<string, unknown>);
}

export async function updateKnowledgeBase(input: {
  tenantId: string;
  id: string;
  name?: string;
  description?: string;
  content?: Record<string, unknown>;
  isActive?: boolean;
}): Promise<KnowledgeBaseRecord | null> {
  await ensureKnowledgeBaseSchema();
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const set = (col: string, val: unknown) => {
    updates.push(`${col} = $${i++}`);
    values.push(val);
  };
  if (input.name !== undefined) set("name", input.name.trim());
  if (input.description !== undefined) set("description", input.description.trim() || null);
  if (input.content !== undefined) set("content", JSON.stringify(input.content));
  if (input.isActive !== undefined) set("is_active", input.isActive);
  if (updates.length === 0) return getKnowledgeBaseById(input.tenantId, input.id);
  set("updated_at", new Date().toISOString());
  values.push(input.tenantId, input.id);
  const result = await pool.query(
    `UPDATE ai_knowledge_bases SET ${updates.join(", ")}
     WHERE tenant_id = $${i++} AND id = $${i}
     RETURNING *`,
    values
  );
  if (!result.rows[0]) return null;
  return mapRow(result.rows[0] as Record<string, unknown>);
}

/** Monta trecho de contexto RAG a partir de bases estruturadas (tabelas/regras em JSON). */
export async function buildKnowledgeContext(input: {
  tenantId: string;
  knowledgeBaseIds: string[];
  queryHint?: string;
}): Promise<string> {
  if (!input.knowledgeBaseIds.length) return "";
  const chunks: string[] = [];
  for (const id of input.knowledgeBaseIds) {
    const kb = await getKnowledgeBaseById(input.tenantId, id);
    if (!kb?.is_active) continue;
    const { content } = kb;
    if (Array.isArray(content.tables)) {
      chunks.push(`### Base: ${kb.name}\nTabelas:\n${JSON.stringify(content.tables, null, 2)}`);
    }
    if (Array.isArray(content.rules)) {
      chunks.push(`### Base: ${kb.name}\nRegras:\n${JSON.stringify(content.rules, null, 2)}`);
    }
    if (typeof content.text === "string" && content.text.trim()) {
      chunks.push(`### Base: ${kb.name}\n${content.text.trim()}`);
    }
    if (chunks.length === 0 && Object.keys(content).length > 0) {
      chunks.push(`### Base: ${kb.name}\n${JSON.stringify(content, null, 2)}`);
    }
  }
  if (!chunks.length) return "";
  return `\n\n## Bases de conhecimento\n${chunks.join("\n\n")}`;
}
