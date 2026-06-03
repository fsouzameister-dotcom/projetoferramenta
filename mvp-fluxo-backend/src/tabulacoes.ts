import { pool } from "./db";
import {
  ensureSchema as ensureServiceQueuesSchema,
  resolveConversationQueueKey,
} from "./service-queues";

export type TabulacaoRecord = {
  id: string;
  tenantId: string;
  key: string;
  label: string;
  description: string | null;
  active: boolean;
  queueIds: string[];
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

function mapRow(row: Record<string, unknown>, queueIds: string[] = []): TabulacaoRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    key: String(row.key),
    label: String(row.label),
    description: row.description ? String(row.description) : null,
    active: Boolean(row.active),
    queueIds,
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

async function loadQueueIdsByTabulacao(tabulacaoIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (tabulacaoIds.length === 0) return map;
  const result = await pool.query<{ tabulacao_id: string; queue_id: string }>(
    `SELECT tabulacao_id, queue_id::text FROM tabulacao_queues
     WHERE tabulacao_id = ANY($1::uuid[])`,
    [tabulacaoIds]
  );
  for (const row of result.rows) {
    const list = map.get(row.tabulacao_id) ?? [];
    list.push(row.queue_id);
    map.set(row.tabulacao_id, list);
  }
  return map;
}

async function replaceTabulacaoQueues(tabulacaoId: string, queueIds: string[]): Promise<void> {
  await pool.query(`DELETE FROM tabulacao_queues WHERE tabulacao_id = $1::uuid`, [tabulacaoId]);
  const unique = [...new Set(queueIds.map((id) => id.trim()).filter(Boolean))];
  for (const queueId of unique) {
    await pool.query(
      `INSERT INTO tabulacao_queues (tabulacao_id, queue_id) VALUES ($1::uuid, $2::uuid)
       ON CONFLICT DO NOTHING`,
      [tabulacaoId, queueId]
    );
  }
}

async function ensureSchema() {
  if (schemaReady) return;
  await ensureServiceQueuesSchema();
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS tabulacao_queues (
        tabulacao_id uuid NOT NULL REFERENCES tabulacoes(id) ON DELETE CASCADE,
        queue_id uuid NOT NULL REFERENCES service_queues(id) ON DELETE CASCADE,
        PRIMARY KEY (tabulacao_id, queue_id)
      )
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
  const ids = result.rows.map((r) => String((r as Record<string, unknown>).id));
  const queueMap = await loadQueueIdsByTabulacao(ids);
  return result.rows.map((row) => {
    const id = String((row as Record<string, unknown>).id);
    return mapRow(row as Record<string, unknown>, queueMap.get(id) ?? []);
  });
}

async function queryTabulacoesForQueue(tenantId: string, queueKey: string) {
  return pool.query(
    `SELECT DISTINCT t.* FROM tabulacoes t
     WHERE t.tenant_id = $1::uuid AND t.active = true
       AND (
         NOT EXISTS (SELECT 1 FROM tabulacao_queues tq WHERE tq.tabulacao_id = t.id)
         OR EXISTS (
           SELECT 1 FROM tabulacao_queues tq
           INNER JOIN service_queues q ON q.id = tq.queue_id
           WHERE tq.tabulacao_id = t.id
             AND q.tenant_id = $1::uuid
             AND q.key = $2
             AND q.active = true
         )
       )
     ORDER BY t.label ASC`,
    [tenantId, queueKey]
  );
}

/** Tabulações ao encerrar: globais (sem fila) + vinculadas à fila resolvida da conversa. */
export async function listTabulacoesForConversationClose(input: {
  tenantId: string;
  queueKey?: string | null;
}): Promise<TabulacaoRecord[]> {
  await ensureSchema();
  const resolvedKey = await resolveConversationQueueKey(input.tenantId, input.queueKey);
  let result = await queryTabulacoesForQueue(input.tenantId, resolvedKey);

  if (result.rows.length === 0) {
    result = await pool.query(
      `SELECT t.* FROM tabulacoes t
       WHERE t.tenant_id = $1::uuid AND t.active = true
       ORDER BY t.label ASC`,
      [input.tenantId]
    );
  }

  const ids = result.rows.map((r) => String((r as Record<string, unknown>).id));
  const queueMap = await loadQueueIdsByTabulacao(ids);
  return result.rows.map((row) => {
    const id = String((row as Record<string, unknown>).id);
    return mapRow(row as Record<string, unknown>, queueMap.get(id) ?? []);
  });
}

export async function getTabulacaoById(
  tenantId: string,
  tabulacaoId: string
): Promise<TabulacaoRecord | null> {
  await ensureSchema();
  const result = await pool.query(
    `SELECT * FROM tabulacoes WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, tabulacaoId]
  );
  if (!result.rows[0]) return null;
  const id = String((result.rows[0] as Record<string, unknown>).id);
  const queueMap = await loadQueueIdsByTabulacao([id]);
  return mapRow(result.rows[0] as Record<string, unknown>, queueMap.get(id) ?? []);
}

export async function assertTabulacaoAllowedForQueue(input: {
  tenantId: string;
  tabulacaoId: string;
  queueKey?: string | null;
}): Promise<TabulacaoRecord> {
  const resolvedKey = await resolveConversationQueueKey(input.tenantId, input.queueKey);
  const allowed = await listTabulacoesForConversationClose({
    tenantId: input.tenantId,
    queueKey: resolvedKey,
  });
  const found = allowed.find((t) => t.id === input.tabulacaoId);
  if (!found) {
    throw new Error("TABULACAO_NOT_ALLOWED_FOR_QUEUE");
  }
  const full = await getTabulacaoById(input.tenantId, input.tabulacaoId);
  if (!full || !full.active) {
    throw new Error("TABULACAO_NOT_FOUND");
  }
  return full;
}

export async function createTabulacao(input: {
  tenantId: string;
  key: string;
  label: string;
  description?: string;
  queueIds?: string[];
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
  const row = result.rows[0] as Record<string, unknown>;
  const tabulacaoId = String(row.id);
  if (input.queueIds?.length) {
    await replaceTabulacaoQueues(tabulacaoId, input.queueIds);
  }
  const queueMap = await loadQueueIdsByTabulacao([tabulacaoId]);
  return mapRow(row, queueMap.get(tabulacaoId) ?? []);
}

export async function updateTabulacao(
  input: {
    tenantId: string;
    tabulacaoId: string;
    key?: string;
    label?: string;
    description?: string | null;
    active?: boolean;
    queueIds?: string[];
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
  if (updates.length === 0 && input.queueIds === undefined) return null;
  let row: Record<string, unknown> | undefined;
  if (updates.length > 0) {
    updates.push("updated_at = now()");
    values.push(input.tenantId, input.tabulacaoId);
    const result = await pool.query(
      `UPDATE tabulacoes
       SET ${updates.join(", ")}
       WHERE tenant_id = $${idx++}::uuid AND id = $${idx}::uuid
       RETURNING *`,
      values
    );
    row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
  } else {
    const existing = await pool.query(
      `SELECT * FROM tabulacoes WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [input.tenantId, input.tabulacaoId]
    );
    row = existing.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
  }
  if (input.queueIds !== undefined) {
    await replaceTabulacaoQueues(input.tabulacaoId, input.queueIds);
  }
  const queueMap = await loadQueueIdsByTabulacao([input.tabulacaoId]);
  return mapRow(row, queueMap.get(input.tabulacaoId) ?? []);
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
