import { pool } from "./db";

export type QueueTimeSlot = { start: string; end: string };

export type QueueBusinessHours = {
  timezone: string;
  schedule: Partial<
    Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", QueueTimeSlot[]>
  >;
};

export type ServiceQueueRecord = {
  id: string;
  tenantId: string;
  key: string;
  label: string;
  description: string | null;
  active: boolean;
  businessHours: QueueBusinessHours | null;
  userIds: string[];
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

function parseBusinessHours(raw: unknown): QueueBusinessHours | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const timezone =
    typeof obj.timezone === "string" && obj.timezone.trim()
      ? obj.timezone.trim()
      : "America/Sao_Paulo";
  const scheduleRaw = obj.schedule;
  if (!scheduleRaw || typeof scheduleRaw !== "object") {
    return { timezone, schedule: {} };
  }
  const schedule: QueueBusinessHours["schedule"] = {};
  for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const) {
    const slots = (scheduleRaw as Record<string, unknown>)[day];
    if (!Array.isArray(slots)) continue;
    schedule[day] = slots
      .map((slot) => {
        if (!slot || typeof slot !== "object") return null;
        const s = slot as Record<string, unknown>;
        const start = typeof s.start === "string" ? s.start.trim() : "";
        const end = typeof s.end === "string" ? s.end.trim() : "";
        if (!start || !end) return null;
        return { start, end };
      })
      .filter((x): x is QueueTimeSlot => x !== null);
  }
  return { timezone, schedule };
}

function mapRow(
  row: Record<string, unknown>,
  userIds: string[]
): ServiceQueueRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    key: String(row.key),
    label: String(row.label),
    description: row.description ? String(row.description) : null,
    active: Boolean(row.active),
    businessHours: parseBusinessHours(row.business_hours),
    userIds,
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

async function loadUserIdsByQueue(queueIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (queueIds.length === 0) return map;
  const result = await pool.query<{ queue_id: string; user_id: string }>(
    `SELECT queue_id, user_id::text
     FROM queue_user_permissions
     WHERE queue_id = ANY($1::uuid[])`,
    [queueIds]
  );
  for (const row of result.rows) {
    const list = map.get(row.queue_id) ?? [];
    list.push(row.user_id);
    map.set(row.queue_id, list);
  }
  return map;
}

export async function ensureSchema() {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_queues (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        key text NOT NULL,
        label text NOT NULL,
        description text,
        active boolean NOT NULL DEFAULT true,
        business_hours jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, key)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS queue_user_permissions (
        queue_id uuid NOT NULL REFERENCES service_queues(id) ON DELETE CASCADE,
        user_id uuid NOT NULL,
        permission text NOT NULL DEFAULT 'agent',
        PRIMARY KEY (queue_id, user_id)
      )
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

export async function ensureDefaultQueue(tenantId: string): Promise<ServiceQueueRecord> {
  await ensureSchema();
  const existing = await pool.query(
    `SELECT id FROM service_queues WHERE tenant_id = $1::uuid AND key = 'geral'`,
    [tenantId]
  );
  if (existing.rows.length > 0) {
    const rows = await listQueuesByTenant(tenantId);
    const found = rows.find((q) => q.key === "geral");
    if (found) return found;
  }
  return createQueue({
    tenantId,
    key: "geral",
    label: "Geral",
    description: "Fila padrão do tenant",
    active: true,
    userIds: [],
    businessHours: null,
  });
}

export async function listQueuesByTenant(tenantId: string): Promise<ServiceQueueRecord[]> {
  await ensureSchema();
  const result = await pool.query(
    `SELECT * FROM service_queues WHERE tenant_id = $1::uuid ORDER BY active DESC, label ASC`,
    [tenantId]
  );
  const ids = result.rows.map((r) => String((r as Record<string, unknown>).id));
  const userMap = await loadUserIdsByQueue(ids);
  return result.rows.map((row) =>
    mapRow(row as Record<string, unknown>, userMap.get(String(row.id)) ?? [])
  );
}

export async function getQueueByKey(
  tenantId: string,
  key: string
): Promise<ServiceQueueRecord | null> {
  await ensureSchema();
  const normalized = normalizeKey(key);
  const result = await pool.query(
    `SELECT * FROM service_queues WHERE tenant_id = $1::uuid AND key = $2`,
    [tenantId, normalized]
  );
  if (!result.rows[0]) return null;
  const id = String((result.rows[0] as Record<string, unknown>).id);
  const userMap = await loadUserIdsByQueue([id]);
  return mapRow(result.rows[0] as Record<string, unknown>, userMap.get(id) ?? []);
}

async function replaceQueueUsers(queueId: string, userIds: string[]): Promise<void> {
  await pool.query(`DELETE FROM queue_user_permissions WHERE queue_id = $1::uuid`, [queueId]);
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  for (const userId of unique) {
    await pool.query(
      `INSERT INTO queue_user_permissions (queue_id, user_id, permission)
       VALUES ($1::uuid, $2::uuid, 'agent')
       ON CONFLICT DO NOTHING`,
      [queueId, userId]
    );
  }
}

export async function createQueue(input: {
  tenantId: string;
  key: string;
  label: string;
  description?: string;
  active?: boolean;
  businessHours?: QueueBusinessHours | null;
  userIds?: string[];
}): Promise<ServiceQueueRecord> {
  await ensureSchema();
  const key = normalizeKey(input.key || input.label);
  const result = await pool.query(
    `INSERT INTO service_queues (tenant_id, key, label, description, active, business_hours)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [
      input.tenantId,
      key,
      input.label.trim(),
      input.description?.trim() || null,
      input.active ?? true,
      input.businessHours ? JSON.stringify(input.businessHours) : null,
    ]
  );
  const row = result.rows[0] as Record<string, unknown>;
  const queueId = String(row.id);
  await replaceQueueUsers(queueId, input.userIds ?? []);
  const userMap = await loadUserIdsByQueue([queueId]);
  return mapRow(row, userMap.get(queueId) ?? []);
}

export async function updateQueue(input: {
  tenantId: string;
  queueId: string;
  key?: string;
  label?: string;
  description?: string | null;
  active?: boolean;
  businessHours?: QueueBusinessHours | null;
  userIds?: string[];
}): Promise<ServiceQueueRecord | null> {
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
  if (input.businessHours !== undefined) {
    updates.push(`business_hours = $${idx++}`);
    values.push(input.businessHours ? JSON.stringify(input.businessHours) : null);
  }
  if (updates.length === 0 && input.userIds === undefined) return null;
  if (updates.length > 0) {
    updates.push("updated_at = now()");
    values.push(input.tenantId, input.queueId);
    const result = await pool.query(
      `UPDATE service_queues
       SET ${updates.join(", ")}
       WHERE tenant_id = $${idx++}::uuid AND id = $${idx}::uuid
       RETURNING *`,
      values
    );
    if (!result.rows[0]) return null;
    if (input.userIds !== undefined) {
      await replaceQueueUsers(input.queueId, input.userIds);
    }
    const userMap = await loadUserIdsByQueue([input.queueId]);
    return mapRow(result.rows[0] as Record<string, unknown>, userMap.get(input.queueId) ?? []);
  }
  const exists = await pool.query(
    `SELECT * FROM service_queues WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [input.tenantId, input.queueId]
  );
  if (!exists.rows[0]) return null;
  if (input.userIds !== undefined) {
    await replaceQueueUsers(input.queueId, input.userIds);
  }
  const userMap = await loadUserIdsByQueue([input.queueId]);
  return mapRow(exists.rows[0] as Record<string, unknown>, userMap.get(input.queueId) ?? []);
}

export async function deleteQueue(tenantId: string, queueId: string): Promise<boolean> {
  await ensureSchema();
  const result = await pool.query(
    `DELETE FROM service_queues WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, queueId]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Verifica se a fila está em horário de atendimento (para relatórios / futuro roteamento). */
export function isQueueWithinBusinessHours(
  hours: QueueBusinessHours | null,
  at: Date = new Date()
): boolean {
  if (!hours) return true;
  const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const day = dayKeys[at.getDay()];
  const slots = hours.schedule[day];
  if (!slots?.length) return false;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: hours.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(at);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const nowMin = Number(hour) * 60 + Number(minute);
  return slots.some((slot) => {
    const [sh, sm] = slot.start.split(":").map(Number);
    const [eh, em] = slot.end.split(":").map(Number);
    const startMin = sh * 60 + (sm || 0);
    const endMin = eh * 60 + (em || 0);
    return nowMin >= startMin && nowMin <= endMin;
  });
}
