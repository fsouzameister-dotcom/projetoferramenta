import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { getTelephonyConfig, type TelephonyConfig } from "./config";
import { pool } from "./db";
import { removeAgentEndpoint, upsertAgentEndpoint } from "./telephony-ari";
import {
  MIN_SECONDS_BETWEEN_CALLS,
  REQUEST_AUTHORIZE_WINDOW_SECONDS,
  computeCallDurations,
  mapDialStatusToCallStatus,
  normalizeBrPhone,
  sipUsernameForUser,
  type VoiceCallStatus,
} from "./telephony-rules";
import { resolveContactAfterAttempt, type VoiceContactOutcome } from "./voice-campaign-rules";
import {
  assertTabulacaoAllowedForQueue,
  listTabulacoesForConversationClose,
  type TabulacaoRecord,
} from "./tabulacoes";
import { ensureSchema as ensureServiceQueuesSchema } from "./service-queues";

let schemaReady = false;

export async function ensureTelephonySchema(): Promise<void> {
  if (schemaReady) return;
  await ensureServiceQueuesSchema();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telephony_user_settings (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      tenant_id uuid NOT NULL,
      enabled boolean NOT NULL DEFAULT false,
      sip_username text UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_telephony_user_settings_tenant
      ON telephony_user_settings (tenant_id, enabled)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS voice_calls (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      direction text NOT NULL DEFAULT 'outbound',
      phone text NOT NULL,
      status text NOT NULL DEFAULT 'requested',
      sip_username text,
      dial_status text,
      hangup_cause text,
      ring_seconds integer NOT NULL DEFAULT 0,
      talk_seconds integer NOT NULL DEFAULT 0,
      tabulacao_id uuid,
      tabulacao_label text,
      tabulated_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      authorized_at timestamptz,
      ended_at timestamptz,
      CONSTRAINT chk_voice_calls_status
        CHECK (status IN ('requested', 'authorized', 'answered', 'no_answer', 'busy', 'cancelled', 'failed')),
      CONSTRAINT chk_voice_calls_direction
        CHECK (direction IN ('outbound', 'inbound'))
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_voice_calls_tenant_created
      ON voice_calls (tenant_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_voice_calls_user_created
      ON voice_calls (user_id, created_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS voice_campaigns (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      name text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      max_attempts integer NOT NULL DEFAULT 5,
      retry_interval_minutes integer NOT NULL DEFAULT 60,
      record_calls boolean NOT NULL DEFAULT false,
      phone_column text,
      name_column text,
      headers jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_voice_campaigns_status CHECK (status IN ('active', 'paused', 'completed'))
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_voice_campaigns_tenant
      ON voice_campaigns (tenant_id, status, created_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS voice_campaign_queues (
      campaign_id uuid NOT NULL REFERENCES voice_campaigns(id) ON DELETE CASCADE,
      queue_id uuid NOT NULL REFERENCES service_queues(id) ON DELETE CASCADE,
      PRIMARY KEY (campaign_id, queue_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS voice_campaign_contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      campaign_id uuid NOT NULL REFERENCES voice_campaigns(id) ON DELETE CASCADE,
      phone text NOT NULL,
      name text,
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL DEFAULT 'pending',
      attempts integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz,
      reserved_by uuid,
      reserved_at timestamptz,
      last_call_id uuid,
      last_result text,
      last_tabulacao_label text,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_voice_campaign_contacts_phone UNIQUE (campaign_id, phone),
      CONSTRAINT chk_voice_campaign_contacts_status
        CHECK (status IN ('pending', 'in_call', 'retry', 'done', 'exhausted', 'do_not_call'))
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_voice_campaign_contacts_pick
      ON voice_campaign_contacts (campaign_id, status, next_attempt_at, created_at)
  `);
  await pool.query(`ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS campaign_id uuid`);
  await pool.query(`ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS contact_id uuid`);
  await pool.query(`ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS recorded boolean NOT NULL DEFAULT false`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_voice_calls_campaign
      ON voice_calls (campaign_id, created_at DESC)
  `);
  schemaReady = true;
}

export function requireTelephonyConfig(): TelephonyConfig {
  const config = getTelephonyConfig();
  if (!config) throw new Error("TELEPHONY_NOT_CONFIGURED");
  return config;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

// --- Liberação por usuário ------------------------------------------------

export type TelephonyUserRow = {
  userId: string;
  name: string;
  email: string;
  roleName: string;
  enabled: boolean;
};

export async function listTelephonyUsers(tenantId: string): Promise<TelephonyUserRow[]> {
  await ensureTelephonySchema();
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, COALESCE(r.name, 'agente') AS role_name,
            COALESCE(s.enabled, false) AS enabled
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     LEFT JOIN telephony_user_settings s ON s.user_id = u.id
     WHERE u.tenant_id = $1::uuid
     ORDER BY u.name ASC NULLS LAST, u.email ASC`,
    [tenantId]
  );
  return result.rows.map((row) => ({
    userId: String(row.id),
    name: String(row.name ?? ""),
    email: String(row.email ?? ""),
    roleName: String(row.role_name),
    enabled: Boolean(row.enabled),
  }));
}

export async function setTelephonyUserEnabled(input: {
  tenantId: string;
  userId: string;
  enabled: boolean;
}): Promise<TelephonyUserRow> {
  await ensureTelephonySchema();
  const user = await pool.query(`SELECT id FROM users WHERE id = $1::uuid AND tenant_id = $2::uuid`, [
    input.userId,
    input.tenantId,
  ]);
  if (!user.rows[0]) throw new Error("TELEPHONY_USER_NOT_FOUND");

  const sipUsername = sipUsernameForUser(input.userId);
  await pool.query(
    `INSERT INTO telephony_user_settings (user_id, tenant_id, enabled, sip_username)
     VALUES ($1::uuid, $2::uuid, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET enabled = EXCLUDED.enabled, sip_username = EXCLUDED.sip_username, updated_at = now()`,
    [input.userId, input.tenantId, input.enabled, sipUsername]
  );

  if (!input.enabled) {
    const config = getTelephonyConfig();
    if (config) {
      await removeAgentEndpoint(config, sipUsername).catch((err) => {
        console.error("[telephony] falha ao remover ramal", sipUsername, err);
      });
    }
  }

  const rows = await listTelephonyUsers(input.tenantId);
  const row = rows.find((r) => r.userId === input.userId);
  if (!row) throw new Error("TELEPHONY_USER_NOT_FOUND");
  return row;
}

export async function isTelephonyEnabledForUser(tenantId: string, userId: string): Promise<boolean> {
  await ensureTelephonySchema();
  const result = await pool.query(
    `SELECT enabled FROM telephony_user_settings WHERE user_id = $1::uuid AND tenant_id = $2::uuid`,
    [userId, tenantId]
  );
  return Boolean(result.rows[0]?.enabled);
}

export async function assertTelephonyEnabled(tenantId: string, userId: string): Promise<void> {
  if (!(await isTelephonyEnabledForUser(tenantId, userId))) {
    throw new Error("TELEPHONY_NOT_ENABLED");
  }
}

// --- Sessão SIP (credenciais efêmeras) -----------------------------------

export type TelephonySession = {
  wsUrl: string;
  sipUri: string;
  username: string;
  password: string;
};

export async function createTelephonySession(tenantId: string, userId: string): Promise<TelephonySession> {
  const config = requireTelephonyConfig();
  await assertTelephonyEnabled(tenantId, userId);
  const sipUsername = sipUsernameForUser(userId);
  const password = randomBytes(24).toString("base64url");
  try {
    await upsertAgentEndpoint(config, { sipUsername, password });
  } catch (err) {
    console.error("[telephony] falha ao provisionar ramal", sipUsername, err);
    throw new Error("TELEPHONY_PROVISION_FAILED");
  }
  return {
    wsUrl: config.voiceWsUrl,
    sipUri: `sip:${sipUsername}@${config.sipDomain}`,
    username: sipUsername,
    password,
  };
}

// --- Ligações -------------------------------------------------------------

export type VoiceCallRecord = {
  id: string;
  userId: string | null;
  userName: string | null;
  phone: string;
  status: VoiceCallStatus;
  dialStatus: string | null;
  hangupCause: string | null;
  ringSeconds: number;
  talkSeconds: number;
  tabulacaoId: string | null;
  tabulacaoLabel: string | null;
  campaignId: string | null;
  campaignName: string | null;
  contactName: string | null;
  recorded: boolean;
  createdAt: string;
  endedAt: string | null;
};

const CALL_SELECT = `
  SELECT c.*, u.name AS user_name, vc.name AS campaign_name, ct.name AS contact_name
  FROM voice_calls c
  LEFT JOIN users u ON u.id = c.user_id
  LEFT JOIN voice_campaigns vc ON vc.id = c.campaign_id
  LEFT JOIN voice_campaign_contacts ct ON ct.id = c.contact_id`;

function mapCall(row: Record<string, unknown>): VoiceCallRecord {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : null,
    userName: row.user_name ? String(row.user_name) : null,
    phone: String(row.phone),
    status: String(row.status) as VoiceCallStatus,
    dialStatus: row.dial_status ? String(row.dial_status) : null,
    hangupCause: row.hangup_cause ? String(row.hangup_cause) : null,
    ringSeconds: Number(row.ring_seconds ?? 0),
    talkSeconds: Number(row.talk_seconds ?? 0),
    tabulacaoId: row.tabulacao_id ? String(row.tabulacao_id) : null,
    tabulacaoLabel: row.tabulacao_label ? String(row.tabulacao_label) : null,
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    campaignName: row.campaign_name ? String(row.campaign_name) : null,
    contactName: row.contact_name ? String(row.contact_name) : null,
    recorded: Boolean(row.recorded),
    createdAt: toIso(row.created_at) ?? "",
    endedAt: toIso(row.ended_at),
  };
}

/** Trava por atendente + regras: uma ligação ativa e intervalo mínimo entre pedidos. Usar dentro de transação. */
export async function assertCanStartCall(client: PoolClient, userId: string): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`voice_call:${userId}`]);
  const active = await client.query(
    `SELECT 1 FROM voice_calls
     WHERE user_id = $1::uuid AND ended_at IS NULL
       AND (
         (status = 'authorized' AND created_at > now() - interval '3 hours')
         OR (status = 'requested' AND created_at > now() - make_interval(secs => $2))
       )
     LIMIT 1`,
    [userId, REQUEST_AUTHORIZE_WINDOW_SECONDS]
  );
  if (active.rows[0]) throw new Error("TELEPHONY_CALL_IN_PROGRESS");

  const recent = await client.query(
    `SELECT 1 FROM voice_calls
     WHERE user_id = $1::uuid AND created_at > now() - make_interval(secs => $2)
     LIMIT 1`,
    [userId, MIN_SECONDS_BETWEEN_CALLS]
  );
  if (recent.rows[0]) throw new Error("TELEPHONY_TOO_FAST");
}

export async function insertCallRequest(
  client: PoolClient,
  input: { tenantId: string; userId: string; phone: string; campaignId?: string; contactId?: string }
): Promise<string> {
  const inserted = await client.query(
    `INSERT INTO voice_calls (tenant_id, user_id, phone, status, sip_username, campaign_id, contact_id)
     VALUES ($1::uuid, $2::uuid, $3, 'requested', $4, $5::uuid, $6::uuid)
     RETURNING id`,
    [
      input.tenantId,
      input.userId,
      input.phone,
      sipUsernameForUser(input.userId),
      input.campaignId ?? null,
      input.contactId ?? null,
    ]
  );
  return String(inserted.rows[0].id);
}

export async function requestOutboundCall(input: {
  tenantId: string;
  userId: string;
  phone: string;
}): Promise<{ callId: string; dialNumber: string }> {
  requireTelephonyConfig();
  await ensureTelephonySchema();
  await assertTelephonyEnabled(input.tenantId, input.userId);
  const normalized = normalizeBrPhone(input.phone);
  if (!normalized) throw new Error("TELEPHONY_INVALID_PHONE");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertCanStartCall(client, input.userId);
    const callId = await insertCallRequest(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      phone: normalized.digits,
    });
    await client.query("COMMIT");
    return { callId, dialNumber: normalized.digits };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Chamado pelo dialplan antes de discar: só libera o pedido feito pelo próprio ramal, para o mesmo número.
 * `record` indica que a campanha da ligação exige gravação.
 */
export async function authorizeCallFromAsterisk(input: {
  callId: string;
  endpoint: string;
  number: string;
}): Promise<{ ok: true; record: boolean } | { ok: false; reason: string }> {
  await ensureTelephonySchema();
  if (!/^[0-9a-f-]{36}$/i.test(input.callId)) return { ok: false, reason: "call_id" };
  const result = await pool.query(
    `UPDATE voice_calls c
     SET status = 'authorized', authorized_at = now(),
         recorded = COALESCE((SELECT record_calls FROM voice_campaigns WHERE id = c.campaign_id), false)
     FROM telephony_user_settings s
     WHERE c.id = $1::uuid
       AND c.status = 'requested'
       AND c.created_at > now() - make_interval(secs => $4)
       AND c.sip_username = $2
       AND c.phone = $3
       AND s.user_id = c.user_id AND s.enabled = true
     RETURNING c.id, c.recorded`,
    [input.callId, input.endpoint, input.number, REQUEST_AUTHORIZE_WINDOW_SECONDS]
  );
  if (!result.rows[0]) return { ok: false, reason: "not_authorized" };
  return { ok: true, record: Boolean(result.rows[0].recorded) };
}

async function applyContactOutcome(
  client: PoolClient | typeof pool,
  input: { callId: string; outcome?: VoiceContactOutcome | null; tabulacaoLabel?: string | null }
): Promise<void> {
  const row = await client.query(
    `SELECT ct.id, ct.attempts, ct.last_call_id, c.status AS call_status,
            vc.max_attempts, vc.retry_interval_minutes
     FROM voice_calls c
     JOIN voice_campaign_contacts ct ON ct.id = c.contact_id
     JOIN voice_campaigns vc ON vc.id = ct.campaign_id
     WHERE c.id = $1::uuid`,
    [input.callId]
  );
  const r = row.rows[0];
  if (!r || String(r.last_call_id) !== input.callId) return;
  const next = resolveContactAfterAttempt({
    callAnswered: r.call_status === "answered",
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    retryIntervalMinutes: Number(r.retry_interval_minutes),
    outcome: input.outcome ?? null,
  });
  await client.query(
    `UPDATE voice_campaign_contacts
     SET status = $2, next_attempt_at = $3, last_result = $4,
         last_tabulacao_label = COALESCE($5, last_tabulacao_label),
         completed_at = CASE WHEN $2 IN ('done', 'exhausted', 'do_not_call') THEN now() ELSE NULL END,
         updated_at = now()
     WHERE id = $1::uuid`,
    [r.id, next.status, next.nextAttemptAt, r.call_status, input.tabulacaoLabel ?? null]
  );
}

/** Chamado pelo hangup handler do dialplan ao fim da ligação. */
export async function finishCallFromAsterisk(input: {
  callId: string;
  dialStatus?: string;
  answeredSeconds?: string;
  dialedSeconds?: string;
  hangupCause?: string;
}): Promise<void> {
  await ensureTelephonySchema();
  if (!/^[0-9a-f-]{36}$/i.test(input.callId)) return;
  const status = mapDialStatusToCallStatus(input.dialStatus);
  const { ringSeconds, talkSeconds } = computeCallDurations({
    dialedSeconds: input.dialedSeconds,
    answeredSeconds: input.answeredSeconds,
  });
  const updated = await pool.query(
    `UPDATE voice_calls
     SET status = $2, dial_status = NULLIF($3, ''), hangup_cause = NULLIF($4, ''),
         ring_seconds = $5, talk_seconds = $6, ended_at = now()
     WHERE id = $1::uuid AND ended_at IS NULL
     RETURNING contact_id, tabulacao_id`,
    [input.callId, status, input.dialStatus ?? "", input.hangupCause ?? "", ringSeconds, talkSeconds]
  );
  const row = updated.rows[0];
  // Se o atendente já tabulou (corrida com o hangup handler), o desfecho dele prevalece.
  if (row?.contact_id && !row.tabulacao_id) {
    await applyContactOutcome(pool, { callId: input.callId });
  }
}

/** O navegador não conseguiu iniciar (ex.: microfone negado) — libera o atendente e devolve o contato. */
export async function abandonRequestedCall(input: {
  tenantId: string;
  userId: string;
  callId: string;
}): Promise<void> {
  await ensureTelephonySchema();
  const result = await pool.query(
    `UPDATE voice_calls SET status = 'failed', ended_at = now()
     WHERE id = $1::uuid AND tenant_id = $2::uuid AND user_id = $3::uuid
       AND status = 'requested' AND ended_at IS NULL
     RETURNING contact_id`,
    [input.callId, input.tenantId, input.userId]
  );
  const contactId = result.rows[0]?.contact_id;
  if (contactId) {
    await pool.query(
      `UPDATE voice_campaign_contacts
       SET status = CASE WHEN attempts > 1 THEN 'retry' ELSE 'pending' END,
           attempts = GREATEST(attempts - 1, 0), next_attempt_at = NULL, updated_at = now()
       WHERE id = $1::uuid AND last_call_id = $2::uuid AND status = 'in_call'`,
      [contactId, input.callId]
    );
  }
}

export async function listAgentRecentCalls(tenantId: string, userId: string): Promise<VoiceCallRecord[]> {
  await ensureTelephonySchema();
  const result = await pool.query(
    `${CALL_SELECT}
     WHERE c.tenant_id = $1::uuid AND c.user_id = $2::uuid
     ORDER BY c.created_at DESC
     LIMIT 20`,
    [tenantId, userId]
  );
  return result.rows.map(mapCall);
}

export async function listTenantCalls(input: {
  tenantId: string;
  from?: string;
  to?: string;
  userId?: string;
  campaignId?: string;
}): Promise<VoiceCallRecord[]> {
  await ensureTelephonySchema();
  const params: unknown[] = [input.tenantId];
  const where = ["c.tenant_id = $1::uuid"];
  if (input.from && /^\d{4}-\d{2}-\d{2}$/.test(input.from)) {
    params.push(input.from);
    where.push(`c.created_at >= ($${params.length}::date AT TIME ZONE 'America/Sao_Paulo')`);
  }
  if (input.to && /^\d{4}-\d{2}-\d{2}$/.test(input.to)) {
    params.push(input.to);
    where.push(`c.created_at < (($${params.length}::date + 1) AT TIME ZONE 'America/Sao_Paulo')`);
  }
  if (input.userId && /^[0-9a-f-]{36}$/i.test(input.userId)) {
    params.push(input.userId);
    where.push(`c.user_id = $${params.length}::uuid`);
  }
  if (input.campaignId && /^[0-9a-f-]{36}$/i.test(input.campaignId)) {
    params.push(input.campaignId);
    where.push(`c.campaign_id = $${params.length}::uuid`);
  }
  const result = await pool.query(
    `${CALL_SELECT}
     WHERE ${where.join(" AND ")}
     ORDER BY c.created_at DESC
     LIMIT 500`,
    params
  );
  return result.rows.map(mapCall);
}

export async function getRecordedCall(
  tenantId: string,
  callId: string
): Promise<{ id: string; recorded: boolean } | null> {
  await ensureTelephonySchema();
  if (!/^[0-9a-f-]{36}$/i.test(callId)) return null;
  const result = await pool.query(
    `SELECT id, recorded FROM voice_calls WHERE id = $1::uuid AND tenant_id = $2::uuid`,
    [callId, tenantId]
  );
  const row = result.rows[0];
  return row ? { id: String(row.id), recorded: Boolean(row.recorded) } : null;
}

// --- Tabulação ------------------------------------------------------------

export async function listTabulacoesForCall(tenantId: string): Promise<TabulacaoRecord[]> {
  return listTabulacoesForConversationClose({ tenantId, queueKey: null });
}

export async function tabulateCall(input: {
  tenantId: string;
  userId: string;
  callId: string;
  tabulacaoId: string;
  outcome?: VoiceContactOutcome | null;
}): Promise<VoiceCallRecord> {
  await ensureTelephonySchema();
  const existing = await pool.query(
    `SELECT id, contact_id FROM voice_calls WHERE id = $1::uuid AND tenant_id = $2::uuid AND user_id = $3::uuid`,
    [input.callId, input.tenantId, input.userId]
  );
  if (!existing.rows[0]) throw new Error("TELEPHONY_CALL_NOT_FOUND");

  let tabulacao: TabulacaoRecord;
  try {
    tabulacao = await assertTabulacaoAllowedForQueue({
      tenantId: input.tenantId,
      tabulacaoId: input.tabulacaoId,
      queueKey: null,
    });
  } catch {
    throw new Error("TELEPHONY_TABULACAO_NOT_ALLOWED");
  }

  await pool.query(
    `UPDATE voice_calls SET tabulacao_id = $2::uuid, tabulacao_label = $3, tabulated_at = now()
     WHERE id = $1::uuid`,
    [input.callId, tabulacao.id, tabulacao.label]
  );
  if (existing.rows[0].contact_id) {
    await applyContactOutcome(pool, {
      callId: input.callId,
      outcome: input.outcome ?? null,
      tabulacaoLabel: tabulacao.label,
    });
  }

  const result = await pool.query(`${CALL_SELECT} WHERE c.id = $1::uuid`, [input.callId]);
  return mapCall(result.rows[0]);
}
