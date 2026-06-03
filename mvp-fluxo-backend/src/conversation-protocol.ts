import { pool } from "./db";

let counterSchemaReady = false;

async function ensureCounterSchema() {
  if (counterSchemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_protocol_counters (
        tenant_id uuid NOT NULL,
        day_key text NOT NULL,
        last_seq integer NOT NULL DEFAULT 0,
        PRIMARY KEY (tenant_id, day_key)
      )
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS protocol_number text
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS tabulacao_id uuid
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS tabulacao_label text
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS closure_message_status text
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_conv_tenant_protocol
      ON agent_conversations (tenant_id, protocol_number)
      WHERE protocol_number IS NOT NULL
    `);
    counterSchemaReady = true;
  } finally {
    client.release();
  }
}

function dayKeyBr(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}${m}${d}`;
}

async function nextProtocolNumber(tenantId: string): Promise<string> {
  await ensureCounterSchema();
  const dayKey = dayKeyBr();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const counter = await client.query<{ last_seq: number }>(
      `INSERT INTO tenant_protocol_counters (tenant_id, day_key, last_seq)
       VALUES ($1::uuid, $2, 1)
       ON CONFLICT (tenant_id, day_key)
       DO UPDATE SET last_seq = tenant_protocol_counters.last_seq + 1
       RETURNING last_seq`,
      [tenantId, dayKey]
    );
    await client.query("COMMIT");
    const seq = counter.rows[0]?.last_seq ?? 1;
    return `CLI-${dayKey}-${String(seq).padStart(4, "0")}`;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function ensureConversationProtocol(input: {
  tenantId: string;
  conversationId: string;
}): Promise<string> {
  await ensureCounterSchema();
  const existing = await pool.query<{ protocol_number: string | null }>(
    `SELECT protocol_number FROM agent_conversations
     WHERE id = $1::uuid AND tenant_id = $2::uuid`,
    [input.conversationId, input.tenantId]
  );
  const current = existing.rows[0]?.protocol_number?.trim();
  if (current) return current;

  const protocol = await nextProtocolNumber(input.tenantId);
  await pool.query(
    `UPDATE agent_conversations
     SET protocol_number = $1, updated_at = now()
     WHERE id = $2::uuid AND tenant_id = $3::uuid AND protocol_number IS NULL`,
    [protocol, input.conversationId, input.tenantId]
  );
  return protocol;
}
