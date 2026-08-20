import type { PoolClient } from "pg";
import { pool } from "./db";
import {
  computeAvailableSlotsForDate,
  type AppointmentCapacityMode,
  type AvailableSlot,
} from "./appointment-availability";

export type { AppointmentCapacityMode, AvailableSlot };

const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const MIN_LEAD_MINUTES = 15;

let schemaReady = false;

export async function ensureAppointmentSchema(): Promise<void> {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointment_services (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      name text NOT NULL,
      description text,
      duration_minutes integer NOT NULL DEFAULT 30,
      capacity_mode text NOT NULL DEFAULT 'pool',
      pool_capacity integer NOT NULL DEFAULT 1,
      active boolean NOT NULL DEFAULT true,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointment_resources (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      service_id uuid NOT NULL REFERENCES appointment_services(id) ON DELETE CASCADE,
      name text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointment_availability_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      service_id uuid NOT NULL REFERENCES appointment_services(id) ON DELETE CASCADE,
      resource_id uuid REFERENCES appointment_resources(id) ON DELETE CASCADE,
      weekday integer NOT NULL,
      start_time text NOT NULL,
      end_time text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointment_blocks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      service_id uuid REFERENCES appointment_services(id) ON DELETE CASCADE,
      resource_id uuid REFERENCES appointment_resources(id) ON DELETE CASCADE,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      reason text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      service_id uuid NOT NULL REFERENCES appointment_services(id) ON DELETE RESTRICT,
      resource_id uuid REFERENCES appointment_resources(id) ON DELETE SET NULL,
      client_id uuid,
      client_name text,
      phone_e164 text,
      scheduled_start timestamptz NOT NULL,
      scheduled_end timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'booked',
      reminder_sent_at timestamptz,
      external_calendar_event_id text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_appointments_tenant_service_time
    ON appointments (tenant_id, service_id, scheduled_start)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_appointments_tenant_resource_time
    ON appointments (tenant_id, resource_id, scheduled_start)
  `);
  schemaReady = true;
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export type AppointmentServiceRecord = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  capacityMode: AppointmentCapacityMode;
  poolCapacity: number;
  timezone: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function parseServiceMetadata(raw: unknown): { timezone: string } {
  const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { timezone: typeof m.timezone === "string" && m.timezone.trim() ? m.timezone.trim() : DEFAULT_TIMEZONE };
}

function mapServiceRow(row: Record<string, unknown>): AppointmentServiceRecord {
  const meta = parseServiceMetadata(row.metadata);
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    durationMinutes: Number(row.duration_minutes),
    capacityMode: (row.capacity_mode === "resource" ? "resource" : "pool") as AppointmentCapacityMode,
    poolCapacity: Number(row.pool_capacity) || 1,
    timezone: meta.timezone,
    active: Boolean(row.active),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listAppointmentServices(tenantId: string): Promise<AppointmentServiceRecord[]> {
  await ensureAppointmentSchema();
  const result = await pool.query(
    `SELECT * FROM appointment_services WHERE tenant_id = $1::uuid ORDER BY active DESC, name ASC`,
    [tenantId]
  );
  return result.rows.map(mapServiceRow);
}

export async function getAppointmentService(
  tenantId: string,
  serviceId: string
): Promise<AppointmentServiceRecord | null> {
  await ensureAppointmentSchema();
  const result = await pool.query(
    `SELECT * FROM appointment_services WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, serviceId]
  );
  return result.rows[0] ? mapServiceRow(result.rows[0]) : null;
}

export async function createAppointmentService(input: {
  tenantId: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  capacityMode: AppointmentCapacityMode;
  poolCapacity?: number;
  timezone?: string;
  active?: boolean;
}): Promise<AppointmentServiceRecord> {
  await ensureAppointmentSchema();
  if (!input.name.trim()) throw new Error("APPOINTMENT_VALIDATION_ERROR");
  if (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0) {
    throw new Error("APPOINTMENT_VALIDATION_ERROR");
  }
  const result = await pool.query(
    `INSERT INTO appointment_services
       (tenant_id, name, description, duration_minutes, capacity_mode, pool_capacity, active, metadata)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING *`,
    [
      input.tenantId,
      input.name.trim(),
      input.description?.trim() || null,
      Math.round(input.durationMinutes),
      input.capacityMode === "resource" ? "resource" : "pool",
      Math.max(1, Math.round(input.poolCapacity ?? 1)),
      input.active ?? true,
      JSON.stringify({ timezone: input.timezone?.trim() || DEFAULT_TIMEZONE }),
    ]
  );
  return mapServiceRow(result.rows[0]);
}

export async function updateAppointmentService(input: {
  tenantId: string;
  serviceId: string;
  name?: string;
  description?: string | null;
  durationMinutes?: number;
  capacityMode?: AppointmentCapacityMode;
  poolCapacity?: number;
  timezone?: string;
  active?: boolean;
}): Promise<AppointmentServiceRecord | null> {
  await ensureAppointmentSchema();
  const existing = await getAppointmentService(input.tenantId, input.serviceId);
  if (!existing) return null;

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new Error("APPOINTMENT_VALIDATION_ERROR");
    updates.push(`name = $${idx++}`);
    values.push(input.name.trim());
  }
  if (input.description !== undefined) {
    updates.push(`description = $${idx++}`);
    values.push(input.description?.trim() || null);
  }
  if (input.durationMinutes !== undefined) {
    if (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0) {
      throw new Error("APPOINTMENT_VALIDATION_ERROR");
    }
    updates.push(`duration_minutes = $${idx++}`);
    values.push(Math.round(input.durationMinutes));
  }
  if (input.capacityMode !== undefined) {
    updates.push(`capacity_mode = $${idx++}`);
    values.push(input.capacityMode === "resource" ? "resource" : "pool");
  }
  if (input.poolCapacity !== undefined) {
    updates.push(`pool_capacity = $${idx++}`);
    values.push(Math.max(1, Math.round(input.poolCapacity)));
  }
  if (input.active !== undefined) {
    updates.push(`active = $${idx++}`);
    values.push(input.active);
  }
  if (input.timezone !== undefined) {
    updates.push(`metadata = jsonb_set(metadata, '{timezone}', to_jsonb($${idx++}::text))`);
    values.push(input.timezone.trim() || DEFAULT_TIMEZONE);
  }
  if (updates.length === 0) return existing;
  updates.push("updated_at = now()");
  values.push(input.tenantId, input.serviceId);
  const result = await pool.query(
    `UPDATE appointment_services SET ${updates.join(", ")}
     WHERE tenant_id = $${idx++}::uuid AND id = $${idx}::uuid
     RETURNING *`,
    values
  );
  return result.rows[0] ? mapServiceRow(result.rows[0]) : null;
}

export async function deleteAppointmentService(tenantId: string, serviceId: string): Promise<boolean> {
  await ensureAppointmentSchema();
  const result = await pool.query(
    `DELETE FROM appointment_services WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, serviceId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export type AppointmentResourceRecord = {
  id: string;
  tenantId: string;
  serviceId: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function mapResourceRow(row: Record<string, unknown>): AppointmentResourceRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    serviceId: String(row.service_id),
    name: String(row.name),
    active: Boolean(row.active),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listAppointmentResources(
  tenantId: string,
  serviceId: string
): Promise<AppointmentResourceRecord[]> {
  await ensureAppointmentSchema();
  const result = await pool.query(
    `SELECT * FROM appointment_resources
     WHERE tenant_id = $1::uuid AND service_id = $2::uuid
     ORDER BY active DESC, name ASC`,
    [tenantId, serviceId]
  );
  return result.rows.map(mapResourceRow);
}

export async function createAppointmentResource(input: {
  tenantId: string;
  serviceId: string;
  name: string;
  active?: boolean;
}): Promise<AppointmentResourceRecord> {
  await ensureAppointmentSchema();
  if (!input.name.trim()) throw new Error("APPOINTMENT_VALIDATION_ERROR");
  const service = await getAppointmentService(input.tenantId, input.serviceId);
  if (!service) throw new Error("APPOINTMENT_SERVICE_NOT_FOUND");
  const result = await pool.query(
    `INSERT INTO appointment_resources (tenant_id, service_id, name, active)
     VALUES ($1::uuid, $2::uuid, $3, $4)
     RETURNING *`,
    [input.tenantId, input.serviceId, input.name.trim(), input.active ?? true]
  );
  return mapResourceRow(result.rows[0]);
}

export async function updateAppointmentResource(input: {
  tenantId: string;
  resourceId: string;
  name?: string;
  active?: boolean;
}): Promise<AppointmentResourceRecord | null> {
  await ensureAppointmentSchema();
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new Error("APPOINTMENT_VALIDATION_ERROR");
    updates.push(`name = $${idx++}`);
    values.push(input.name.trim());
  }
  if (input.active !== undefined) {
    updates.push(`active = $${idx++}`);
    values.push(input.active);
  }
  if (updates.length === 0) {
    const existing = await pool.query(
      `SELECT * FROM appointment_resources WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [input.tenantId, input.resourceId]
    );
    return existing.rows[0] ? mapResourceRow(existing.rows[0]) : null;
  }
  updates.push("updated_at = now()");
  values.push(input.tenantId, input.resourceId);
  const result = await pool.query(
    `UPDATE appointment_resources SET ${updates.join(", ")}
     WHERE tenant_id = $${idx++}::uuid AND id = $${idx}::uuid
     RETURNING *`,
    values
  );
  return result.rows[0] ? mapResourceRow(result.rows[0]) : null;
}

export async function deleteAppointmentResource(tenantId: string, resourceId: string): Promise<boolean> {
  await ensureAppointmentSchema();
  const result = await pool.query(
    `DELETE FROM appointment_resources WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, resourceId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Regras de expediente (availability rules)
// ---------------------------------------------------------------------------

export type AvailabilityRuleRecord = {
  id: string;
  serviceId: string;
  resourceId: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
};

function mapRuleRow(row: Record<string, unknown>): AvailabilityRuleRecord {
  return {
    id: String(row.id),
    serviceId: String(row.service_id),
    resourceId: row.resource_id ? String(row.resource_id) : null,
    weekday: Number(row.weekday),
    startTime: String(row.start_time),
    endTime: String(row.end_time),
  };
}

export async function listAvailabilityRules(
  tenantId: string,
  serviceId: string
): Promise<AvailabilityRuleRecord[]> {
  await ensureAppointmentSchema();
  const result = await pool.query(
    `SELECT * FROM appointment_availability_rules
     WHERE tenant_id = $1::uuid AND service_id = $2::uuid
     ORDER BY weekday ASC, start_time ASC`,
    [tenantId, serviceId]
  );
  return result.rows.map(mapRuleRow);
}

/** Substitui todas as regras de expediente de um serviço (ou de um recurso específico dele). */
export async function replaceAvailabilityRules(input: {
  tenantId: string;
  serviceId: string;
  resourceId?: string | null;
  rules: { weekday: number; startTime: string; endTime: string }[];
}): Promise<AvailabilityRuleRecord[]> {
  await ensureAppointmentSchema();
  const service = await getAppointmentService(input.tenantId, input.serviceId);
  if (!service) throw new Error("APPOINTMENT_SERVICE_NOT_FOUND");
  for (const rule of input.rules) {
    if (rule.weekday < 0 || rule.weekday > 6) throw new Error("APPOINTMENT_VALIDATION_ERROR");
    if (!/^\d{2}:\d{2}$/.test(rule.startTime) || !/^\d{2}:\d{2}$/.test(rule.endTime)) {
      throw new Error("APPOINTMENT_VALIDATION_ERROR");
    }
    if (rule.startTime >= rule.endTime) throw new Error("APPOINTMENT_VALIDATION_ERROR");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.resourceId) {
      await client.query(
        `DELETE FROM appointment_availability_rules
         WHERE tenant_id = $1::uuid AND service_id = $2::uuid AND resource_id = $3::uuid`,
        [input.tenantId, input.serviceId, input.resourceId]
      );
    } else {
      await client.query(
        `DELETE FROM appointment_availability_rules
         WHERE tenant_id = $1::uuid AND service_id = $2::uuid AND resource_id IS NULL`,
        [input.tenantId, input.serviceId]
      );
    }
    for (const rule of input.rules) {
      await client.query(
        `INSERT INTO appointment_availability_rules
           (tenant_id, service_id, resource_id, weekday, start_time, end_time)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)`,
        [input.tenantId, input.serviceId, input.resourceId ?? null, rule.weekday, rule.startTime, rule.endTime]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return listAvailabilityRules(input.tenantId, input.serviceId);
}

// ---------------------------------------------------------------------------
// Bloqueios
// ---------------------------------------------------------------------------

export type AppointmentBlockRecord = {
  id: string;
  serviceId: string | null;
  resourceId: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

function mapBlockRow(row: Record<string, unknown>): AppointmentBlockRecord {
  return {
    id: String(row.id),
    serviceId: row.service_id ? String(row.service_id) : null,
    resourceId: row.resource_id ? String(row.resource_id) : null,
    startsAt: row.starts_at instanceof Date ? row.starts_at.toISOString() : String(row.starts_at),
    endsAt: row.ends_at instanceof Date ? row.ends_at.toISOString() : String(row.ends_at),
    reason: row.reason ? String(row.reason) : null,
  };
}

export async function listAppointmentBlocks(
  tenantId: string,
  serviceId: string,
  range?: { from: string; to: string }
): Promise<AppointmentBlockRecord[]> {
  await ensureAppointmentSchema();
  if (range) {
    const result = await pool.query(
      `SELECT * FROM appointment_blocks
       WHERE tenant_id = $1::uuid AND service_id = $2::uuid
         AND starts_at < $4::timestamptz AND ends_at > $3::timestamptz
       ORDER BY starts_at ASC`,
      [tenantId, serviceId, range.from, range.to]
    );
    return result.rows.map(mapBlockRow);
  }
  const result = await pool.query(
    `SELECT * FROM appointment_blocks WHERE tenant_id = $1::uuid AND service_id = $2::uuid ORDER BY starts_at ASC`,
    [tenantId, serviceId]
  );
  return result.rows.map(mapBlockRow);
}

export async function createAppointmentBlock(input: {
  tenantId: string;
  serviceId: string;
  resourceId?: string | null;
  startsAt: string;
  endsAt: string;
  reason?: string;
}): Promise<AppointmentBlockRecord> {
  await ensureAppointmentSchema();
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt >= endsAt) {
    throw new Error("APPOINTMENT_VALIDATION_ERROR");
  }
  const result = await pool.query(
    `INSERT INTO appointment_blocks (tenant_id, service_id, resource_id, starts_at, ends_at, reason)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::timestamptz, $5::timestamptz, $6)
     RETURNING *`,
    [input.tenantId, input.serviceId, input.resourceId ?? null, startsAt.toISOString(), endsAt.toISOString(), input.reason?.trim() || null]
  );
  return mapBlockRow(result.rows[0]);
}

export async function deleteAppointmentBlock(tenantId: string, blockId: string): Promise<boolean> {
  await ensureAppointmentSchema();
  const result = await pool.query(
    `DELETE FROM appointment_blocks WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, blockId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Disponibilidade
// ---------------------------------------------------------------------------

function dayWindowUtc(dateStr: string): { from: string; to: string } {
  const from = new Date(`${dateStr}T00:00:00.000Z`);
  const to = new Date(from.getTime() + 26 * 60 * 60 * 1000); // margem p/ fusos negativos
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function getAvailableSlots(
  tenantId: string,
  serviceId: string,
  dateStr: string
): Promise<AvailableSlot[]> {
  await ensureAppointmentSchema();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error("APPOINTMENT_INVALID_DATE");
  const service = await getAppointmentService(tenantId, serviceId);
  if (!service) throw new Error("APPOINTMENT_SERVICE_NOT_FOUND");

  const resources =
    service.capacityMode === "resource"
      ? (await listAppointmentResources(tenantId, serviceId)).filter((r) => r.active)
      : [];

  const rulesRaw = await listAvailabilityRules(tenantId, serviceId);
  const rules = rulesRaw.map((r) => ({
    resourceId: r.resourceId,
    weekday: r.weekday,
    startTime: r.startTime,
    endTime: r.endTime,
  }));

  const { from, to } = dayWindowUtc(dateStr);

  const busyResult = await pool.query<{ resource_id: string | null; start: Date; end: Date }>(
    `SELECT resource_id, scheduled_start AS start, scheduled_end AS end
     FROM appointments
     WHERE tenant_id = $1::uuid AND service_id = $2::uuid AND status = 'booked'
       AND scheduled_start < $4::timestamptz AND scheduled_end > $3::timestamptz`,
    [tenantId, serviceId, from, to]
  );
  const busy = busyResult.rows.map((r) => ({
    resourceId: r.resource_id,
    start: r.start.toISOString(),
    end: r.end.toISOString(),
  }));

  const blocksRaw = await listAppointmentBlocks(tenantId, serviceId, { from, to });
  const blocks = blocksRaw.map((b) => ({ resourceId: b.resourceId, start: b.startsAt, end: b.endsAt }));

  return computeAvailableSlotsForDate({
    dateStr,
    service: {
      durationMinutes: service.durationMinutes,
      capacityMode: service.capacityMode,
      poolCapacity: service.poolCapacity,
      timezone: service.timezone,
    },
    rules,
    resources: resources.map((r) => ({ id: r.id, name: r.name })),
    busy,
    blocks,
    minLeadMinutes: MIN_LEAD_MINUTES,
  });
}

// ---------------------------------------------------------------------------
// Agendamentos
// ---------------------------------------------------------------------------

export type AppointmentRecord = {
  id: string;
  tenantId: string;
  serviceId: string;
  serviceName?: string;
  resourceId: string | null;
  resourceName?: string | null;
  clientName: string | null;
  phoneE164: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  reminderSentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapAppointmentRow(row: Record<string, unknown>): AppointmentRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    serviceId: String(row.service_id),
    serviceName: row.service_name ? String(row.service_name) : undefined,
    resourceId: row.resource_id ? String(row.resource_id) : null,
    resourceName: row.resource_name ? String(row.resource_name) : null,
    clientName: row.client_name ? String(row.client_name) : null,
    phoneE164: row.phone_e164 ? String(row.phone_e164) : null,
    scheduledStart:
      row.scheduled_start instanceof Date ? row.scheduled_start.toISOString() : String(row.scheduled_start),
    scheduledEnd: row.scheduled_end instanceof Date ? row.scheduled_end.toISOString() : String(row.scheduled_end),
    status: String(row.status),
    reminderSentAt:
      row.reminder_sent_at instanceof Date
        ? row.reminder_sent_at.toISOString()
        : row.reminder_sent_at
          ? String(row.reminder_sent_at)
          : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function listAppointments(
  tenantId: string,
  filters: {
    serviceId?: string;
    resourceId?: string;
    status?: string;
    from?: string;
    to?: string;
  } = {}
): Promise<AppointmentRecord[]> {
  await ensureAppointmentSchema();
  const conditions = ["a.tenant_id = $1::uuid"];
  const values: unknown[] = [tenantId];
  let idx = 2;
  if (filters.serviceId) {
    conditions.push(`a.service_id = $${idx++}::uuid`);
    values.push(filters.serviceId);
  }
  if (filters.resourceId) {
    conditions.push(`a.resource_id = $${idx++}::uuid`);
    values.push(filters.resourceId);
  }
  if (filters.status) {
    conditions.push(`a.status = $${idx++}`);
    values.push(filters.status);
  }
  if (filters.from) {
    conditions.push(`a.scheduled_end > $${idx++}::timestamptz`);
    values.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`a.scheduled_start < $${idx++}::timestamptz`);
    values.push(filters.to);
  }
  const result = await pool.query(
    `SELECT a.*, s.name AS service_name, r.name AS resource_name
     FROM appointments a
     JOIN appointment_services s ON s.id = a.service_id
     LEFT JOIN appointment_resources r ON r.id = a.resource_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY a.scheduled_start ASC
     LIMIT 500`,
    values
  );
  return result.rows.map(mapAppointmentRow);
}

export async function getAppointment(tenantId: string, appointmentId: string): Promise<AppointmentRecord | null> {
  await ensureAppointmentSchema();
  const result = await pool.query(
    `SELECT a.*, s.name AS service_name, r.name AS resource_name
     FROM appointments a
     JOIN appointment_services s ON s.id = a.service_id
     LEFT JOIN appointment_resources r ON r.id = a.resource_id
     WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid`,
    [tenantId, appointmentId]
  );
  return result.rows[0] ? mapAppointmentRow(result.rows[0]) : null;
}

/** Confere, dentro de uma transação com lock, se o horário pedido ainda está livre. */
async function assertSlotStillFree(
  client: PoolClient,
  input: {
    tenantId: string;
    service: AppointmentServiceRecord;
    resourceId: string | null;
    start: Date;
    end: Date;
    excludeAppointmentId?: string;
  }
): Promise<void> {
  if (input.service.capacityMode === "resource") {
    if (!input.resourceId) throw new Error("APPOINTMENT_VALIDATION_ERROR");
    const result = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM appointments
       WHERE tenant_id = $1::uuid AND resource_id = $2::uuid AND status = 'booked'
         AND scheduled_start < $4::timestamptz AND scheduled_end > $3::timestamptz
         AND id != COALESCE($5::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
       FOR UPDATE`,
      [input.tenantId, input.resourceId, input.start.toISOString(), input.end.toISOString(), input.excludeAppointmentId ?? null]
    );
    if (Number(result.rows[0]?.n ?? 0) > 0) throw new Error("APPOINTMENT_SLOT_TAKEN");
  } else {
    const result = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM appointments
       WHERE tenant_id = $1::uuid AND service_id = $2::uuid AND status = 'booked'
         AND scheduled_start < $4::timestamptz AND scheduled_end > $3::timestamptz
         AND id != COALESCE($5::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
       FOR UPDATE`,
      [input.tenantId, input.service.id, input.start.toISOString(), input.end.toISOString(), input.excludeAppointmentId ?? null]
    );
    if (Number(result.rows[0]?.n ?? 0) >= input.service.poolCapacity) throw new Error("APPOINTMENT_SLOT_TAKEN");
  }
}

export async function createAppointment(input: {
  tenantId: string;
  serviceId: string;
  resourceId?: string | null;
  scheduledStart: string;
  clientId?: string | null;
  clientName?: string | null;
  phoneE164?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<AppointmentRecord> {
  await ensureAppointmentSchema();
  const service = await getAppointmentService(input.tenantId, input.serviceId);
  if (!service) throw new Error("APPOINTMENT_SERVICE_NOT_FOUND");
  const start = new Date(input.scheduledStart);
  if (Number.isNaN(start.getTime())) throw new Error("APPOINTMENT_INVALID_DATE");
  const end = new Date(start.getTime() + service.durationMinutes * 60_000);

  if (service.capacityMode === "resource" && input.resourceId) {
    const resource = await pool.query(
      `SELECT id FROM appointment_resources WHERE tenant_id = $1::uuid AND id = $2::uuid AND service_id = $3::uuid`,
      [input.tenantId, input.resourceId, input.serviceId]
    );
    if (!resource.rows[0]) throw new Error("APPOINTMENT_RESOURCE_NOT_FOUND");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertSlotStillFree(client, {
      tenantId: input.tenantId,
      service,
      resourceId: input.resourceId ?? null,
      start,
      end,
    });
    const result = await client.query(
      `INSERT INTO appointments
         (tenant_id, service_id, resource_id, client_id, client_name, phone_e164,
          scheduled_start, scheduled_end, status, metadata)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::timestamptz, $8::timestamptz, 'booked', $9::jsonb)
       RETURNING id`,
      [
        input.tenantId,
        input.serviceId,
        service.capacityMode === "resource" ? input.resourceId ?? null : null,
        input.clientId ?? null,
        input.clientName?.trim() || null,
        input.phoneE164?.trim() || null,
        start.toISOString(),
        end.toISOString(),
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    await client.query("COMMIT");
    const created = await getAppointment(input.tenantId, String(result.rows[0].id));
    if (!created) throw new Error("APPOINTMENT_NOT_FOUND");
    return created;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function rescheduleAppointment(input: {
  tenantId: string;
  appointmentId: string;
  scheduledStart: string;
  resourceId?: string | null;
}): Promise<AppointmentRecord | null> {
  await ensureAppointmentSchema();
  const existing = await getAppointment(input.tenantId, input.appointmentId);
  if (!existing) return null;
  if (existing.status !== "booked") throw new Error("APPOINTMENT_INVALID_STATUS");
  const service = await getAppointmentService(input.tenantId, existing.serviceId);
  if (!service) throw new Error("APPOINTMENT_SERVICE_NOT_FOUND");
  const start = new Date(input.scheduledStart);
  if (Number.isNaN(start.getTime())) throw new Error("APPOINTMENT_INVALID_DATE");
  const end = new Date(start.getTime() + service.durationMinutes * 60_000);
  const resourceId = input.resourceId !== undefined ? input.resourceId : existing.resourceId;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertSlotStillFree(client, {
      tenantId: input.tenantId,
      service,
      resourceId: service.capacityMode === "resource" ? resourceId : null,
      start,
      end,
      excludeAppointmentId: input.appointmentId,
    });
    await client.query(
      `UPDATE appointments
       SET scheduled_start = $3::timestamptz, scheduled_end = $4::timestamptz,
           resource_id = $5::uuid, reminder_sent_at = NULL, updated_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [
        input.tenantId,
        input.appointmentId,
        start.toISOString(),
        end.toISOString(),
        service.capacityMode === "resource" ? resourceId : null,
      ]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getAppointment(input.tenantId, input.appointmentId);
}

export async function cancelAppointment(
  tenantId: string,
  appointmentId: string
): Promise<AppointmentRecord | null> {
  await ensureAppointmentSchema();
  const result = await pool.query(
    `UPDATE appointments
     SET status = 'cancelled', updated_at = now()
     WHERE tenant_id = $1::uuid AND id = $2::uuid AND status = 'booked'
     RETURNING id`,
    [tenantId, appointmentId]
  );
  if (!result.rowCount) {
    const existing = await getAppointment(tenantId, appointmentId);
    if (!existing) return null;
    throw new Error("APPOINTMENT_INVALID_STATUS");
  }
  return getAppointment(tenantId, appointmentId);
}

export async function markAppointmentCompleted(
  tenantId: string,
  appointmentId: string,
  status: "completed" | "no_show"
): Promise<AppointmentRecord | null> {
  await ensureAppointmentSchema();
  const result = await pool.query(
    `UPDATE appointments
     SET status = $3, updated_at = now()
     WHERE tenant_id = $1::uuid AND id = $2::uuid AND status = 'booked'
     RETURNING id`,
    [tenantId, appointmentId, status]
  );
  if (!result.rowCount) {
    const existing = await getAppointment(tenantId, appointmentId);
    if (!existing) return null;
    throw new Error("APPOINTMENT_INVALID_STATUS");
  }
  return getAppointment(tenantId, appointmentId);
}

/** Agendamentos que precisam de lembrete (janela de horas antes do início). */
export async function listAppointmentsDueForReminder(leadHours: number): Promise<AppointmentRecord[]> {
  await ensureAppointmentSchema();
  const result = await pool.query(
    `SELECT a.*, s.name AS service_name, r.name AS resource_name
     FROM appointments a
     JOIN appointment_services s ON s.id = a.service_id
     LEFT JOIN appointment_resources r ON r.id = a.resource_id
     WHERE a.status = 'booked'
       AND a.reminder_sent_at IS NULL
       AND a.phone_e164 IS NOT NULL
       AND a.scheduled_start <= now() + ($1::text || ' hours')::interval
       AND a.scheduled_start > now()
     ORDER BY a.scheduled_start ASC
     LIMIT 100`,
    [String(leadHours)]
  );
  return result.rows.map(mapAppointmentRow);
}

export async function markReminderSent(tenantId: string, appointmentId: string): Promise<void> {
  await pool.query(
    `UPDATE appointments SET reminder_sent_at = now() WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, appointmentId]
  );
}
