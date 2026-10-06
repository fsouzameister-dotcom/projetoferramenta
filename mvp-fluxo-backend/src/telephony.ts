import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { getTelephonyConfig, type TelephonyConfig } from "./config";
import { pool } from "./db";
import { removeAgentEndpoint, upsertAgentEndpoint } from "./telephony-ari";
import {
  MIN_SECONDS_BETWEEN_CALLS,
  REQUEST_AUTHORIZE_WINDOW_SECONDS,
  classifyCallResult,
  computeCallDurations,
  mapDialStatusToCallStatus,
  normalizeBrPhone,
  sipUsernameForUser,
  VOICE_CALL_RESULTS,
  type VoiceCallResult,
  type VoiceCallStatus,
} from "./telephony-rules";
import {
  parseCallbackAt,
  resolveContactAfterAttempt,
  resolveContactAfterResult,
  type ContactNextState,
  type VoiceContactOutcome,
} from "./voice-campaign-rules";
import { getCampaignTabulacao, listCampaignTabulacoes } from "./voice-campaign-tabulacoes";
import {
  assertTabulacaoAllowedForQueue,
  listTabulacoesForConversationClose,
  type TabulacaoRecord,
} from "./tabulacoes";
import { ensureTelephonySchema } from "./telephony-schema";

export { ensureTelephonySchema };

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

// --- Configurações do tenant ----------------------------------------------

export type TelephonyTenantSettings = { recordManualCalls: boolean };

export async function getTelephonyTenantSettings(tenantId: string): Promise<TelephonyTenantSettings> {
  await ensureTelephonySchema();
  const result = await pool.query(
    `SELECT record_manual_calls FROM telephony_tenant_settings WHERE tenant_id = $1::uuid`,
    [tenantId]
  );
  return { recordManualCalls: result.rows[0] ? Boolean(result.rows[0].record_manual_calls) : true };
}

export async function updateTelephonyTenantSettings(
  tenantId: string,
  input: { recordManualCalls: boolean }
): Promise<TelephonyTenantSettings> {
  await ensureTelephonySchema();
  await pool.query(
    `INSERT INTO telephony_tenant_settings (tenant_id, record_manual_calls)
     VALUES ($1::uuid, $2)
     ON CONFLICT (tenant_id) DO UPDATE SET record_manual_calls = EXCLUDED.record_manual_calls, updated_at = now()`,
    [tenantId, input.recordManualCalls]
  );
  return getTelephonyTenantSettings(tenantId);
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
  result: VoiceCallResult | null;
  tabulacaoIsSuccess: boolean | null;
  callbackAt: string | null;
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
    result: row.result ? (String(row.result) as VoiceCallResult) : null,
    tabulacaoIsSuccess: row.tabulacao_is_success == null ? null : Boolean(row.tabulacao_is_success),
    callbackAt: toIso(row.callback_at),
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
         recorded = CASE
           WHEN c.campaign_id IS NOT NULL
             THEN COALESCE((SELECT record_calls FROM voice_campaigns WHERE id = c.campaign_id), false)
           ELSE COALESCE((SELECT record_manual_calls FROM telephony_tenant_settings WHERE tenant_id = c.tenant_id), true)
         END
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

type ContactCallContext = { attempts: number; maxAttempts: number; retryIntervalMinutes: number };

/**
 * Atualiza o contato da campanha ligado à ligação. Ignora se o contato já foi reservado por outra ligação
 * (ex.: reserva expirada e repassada) ou se `compute` não define destino.
 */
async function updateContactAfterCall(
  callId: string,
  compute: (ctx: ContactCallContext) => ContactNextState | null,
  extra: { result?: VoiceCallResult | null; tabulacaoLabel?: string | null; callbackUserId?: string | null } = {}
): Promise<void> {
  const row = await pool.query(
    `SELECT ct.id, ct.attempts, ct.last_call_id, vc.max_attempts, vc.retry_interval_minutes
     FROM voice_calls c
     JOIN voice_campaign_contacts ct ON ct.id = c.contact_id
     JOIN voice_campaigns vc ON vc.id = ct.campaign_id
     WHERE c.id = $1::uuid`,
    [callId]
  );
  const r = row.rows[0];
  if (!r || String(r.last_call_id) !== callId) return;
  const next = compute({
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    retryIntervalMinutes: Number(r.retry_interval_minutes),
  });
  if (!next) return;
  await pool.query(
    `UPDATE voice_campaign_contacts
     SET status = $2, next_attempt_at = $3,
         last_call_result = COALESCE($4, last_call_result),
         last_tabulacao_label = COALESCE($5, last_tabulacao_label),
         callback_user_id = $6::uuid,
         completed_at = CASE WHEN $2 IN ('done', 'exhausted', 'do_not_call', 'invalid') THEN now() ELSE NULL END,
         updated_at = now()
     WHERE id = $1::uuid`,
    [r.id, next.status, next.nextAttemptAt, extra.result ?? null, extra.tabulacaoLabel ?? null, extra.callbackUserId ?? null]
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
  const result = classifyCallResult(input.dialStatus, input.hangupCause);
  const { ringSeconds, talkSeconds } = computeCallDurations({
    dialedSeconds: input.dialedSeconds,
    answeredSeconds: input.answeredSeconds,
  });
  const updated = await pool.query(
    `UPDATE voice_calls
     SET status = $2, dial_status = NULLIF($3, ''), hangup_cause = NULLIF($4, ''),
         ring_seconds = $5, talk_seconds = $6, ended_at = now(),
         result = CASE WHEN tabulated_at IS NOT NULL AND result IS NOT NULL THEN result ELSE $7 END
     WHERE id = $1::uuid AND ended_at IS NULL
     RETURNING contact_id, tabulated_at, result`,
    [input.callId, status, input.dialStatus ?? "", input.hangupCause ?? "", ringSeconds, talkSeconds, result]
  );
  const row = updated.rows[0];
  // Atendida espera a tabulação do operador; se ele já tabulou/marcou caixa postal, o desfecho dele prevalece.
  if (row?.contact_id && !row.tabulated_at) {
    const finalResult = String(row.result) as VoiceCallResult;
    await updateContactAfterCall(input.callId, (ctx) => resolveContactAfterResult({ ...ctx, result: finalResult }), {
      result: finalResult,
    });
  }
}

/** Operador identificou caixa postal: encerra sem tabulação e reagenda o contato. */
export async function markCallVoicemail(input: {
  tenantId: string;
  userId: string;
  callId: string;
}): Promise<VoiceCallRecord> {
  await ensureTelephonySchema();
  const updated = await pool.query(
    `UPDATE voice_calls
     SET result = 'voicemail', tabulacao_id = NULL, tabulacao_label = 'Caixa postal',
         tabulacao_is_success = false, tabulated_at = now()
     WHERE id = $1::uuid AND tenant_id = $2::uuid AND user_id = $3::uuid
     RETURNING contact_id`,
    [input.callId, input.tenantId, input.userId]
  );
  if (!updated.rows[0]) throw new Error("TELEPHONY_CALL_NOT_FOUND");
  if (updated.rows[0].contact_id) {
    await updateContactAfterCall(input.callId, (ctx) => resolveContactAfterResult({ ...ctx, result: "voicemail" }), {
      result: "voicemail",
      tabulacaoLabel: "Caixa postal",
    });
  }
  const result = await pool.query(`${CALL_SELECT} WHERE c.id = $1::uuid`, [input.callId]);
  return mapCall(result.rows[0]);
}

/** Motivos que o operador informa ao desligar antes de atender (a operadora tocou um aviso em vez de sinalizar). */
export const AGENT_MARKABLE_RESULTS: VoiceCallResult[] = ["unavailable", "invalid_number", "no_answer", "cancelled"];

export async function markCallResultByAgent(input: {
  tenantId: string;
  userId: string;
  callId: string;
  result: string;
}): Promise<VoiceCallRecord> {
  await ensureTelephonySchema();
  if (!AGENT_MARKABLE_RESULTS.includes(input.result as VoiceCallResult)) throw new Error("TELEPHONY_RESULT_INVALID");
  if (!/^[0-9a-f-]{36}$/i.test(input.callId)) throw new Error("TELEPHONY_CALL_NOT_FOUND");
  const result = input.result as VoiceCallResult;
  const updated = await pool.query(
    `UPDATE voice_calls
     SET result = $4, tabulated_at = now()
     WHERE id = $1::uuid AND tenant_id = $2::uuid AND user_id = $3::uuid AND status <> 'answered'
     RETURNING contact_id`,
    [input.callId, input.tenantId, input.userId, result]
  );
  if (!updated.rows[0]) throw new Error("TELEPHONY_CALL_NOT_FOUND");
  if (updated.rows[0].contact_id) {
    await updateContactAfterCall(input.callId, (ctx) => resolveContactAfterResult({ ...ctx, result }), { result });
  }
  const row = await pool.query(`${CALL_SELECT} WHERE c.id = $1::uuid`, [input.callId]);
  return mapCall(row.rows[0]);
}

export async function getAgentCall(tenantId: string, userId: string, callId: string): Promise<VoiceCallRecord> {
  await ensureTelephonySchema();
  if (!/^[0-9a-f-]{36}$/i.test(callId)) throw new Error("TELEPHONY_CALL_NOT_FOUND");
  const result = await pool.query(
    `${CALL_SELECT} WHERE c.id = $1::uuid AND c.tenant_id = $2::uuid AND c.user_id = $3::uuid`,
    [callId, tenantId, userId]
  );
  if (!result.rows[0]) throw new Error("TELEPHONY_CALL_NOT_FOUND");
  return mapCall(result.rows[0]);
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

export type TenantCallFilter = {
  tenantId: string;
  from?: string;
  to?: string;
  userId?: string;
  campaignId?: string;
  result?: string;
};

/** Filtro do histórico (datas no fuso de São Paulo). Usado na listagem e na exportação. */
export function buildTenantCallFilter(input: TenantCallFilter): { where: string; params: unknown[] } {
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
  if (input.campaignId === "manual") {
    where.push(`c.campaign_id IS NULL`);
  } else if (input.campaignId && /^[0-9a-f-]{36}$/i.test(input.campaignId)) {
    params.push(input.campaignId);
    where.push(`c.campaign_id = $${params.length}::uuid`);
  }
  if (input.result && VOICE_CALL_RESULTS.includes(input.result as VoiceCallResult)) {
    params.push(input.result);
    where.push(`c.result = $${params.length}`);
  }
  return { where: where.join(" AND "), params };
}

export async function listTenantCalls(input: TenantCallFilter): Promise<VoiceCallRecord[]> {
  await ensureTelephonySchema();
  const { where, params } = buildTenantCallFilter(input);
  const result = await pool.query(
    `${CALL_SELECT}
     WHERE ${where}
     ORDER BY c.created_at DESC
     LIMIT 500`,
    params
  );
  return result.rows.map(mapCall);
}

/** Ligações para exportação, com os dados da planilha do contato. */
export async function listTenantCallsForExport(
  input: TenantCallFilter
): Promise<(VoiceCallRecord & { contactData: Record<string, string> | null })[]> {
  await ensureTelephonySchema();
  const { where, params } = buildTenantCallFilter(input);
  const result = await pool.query(
    `SELECT c.*, u.name AS user_name, vc.name AS campaign_name, ct.name AS contact_name, ct.data AS contact_data
     FROM voice_calls c
     LEFT JOIN users u ON u.id = c.user_id
     LEFT JOIN voice_campaigns vc ON vc.id = c.campaign_id
     LEFT JOIN voice_campaign_contacts ct ON ct.id = c.contact_id
     WHERE ${where}
     ORDER BY c.created_at ASC
     LIMIT 100000`,
    params
  );
  return result.rows.map((row) => ({
    ...mapCall(row),
    contactData: (row.contact_data as Record<string, string> | null) ?? null,
  }));
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

export type CallTabulacaoOption = {
  id: string;
  label: string;
  description: string | null;
  outcome: VoiceContactOutcome | null;
  isSuccess: boolean;
};

/** Ligação de campanha usa as tabulações da campanha; manual usa as tabulações gerais da Operação. */
export async function listTabulacoesForCall(input: {
  tenantId: string;
  userId: string;
  callId?: string | null;
}): Promise<{ kind: "campaign" | "general"; items: CallTabulacaoOption[] }> {
  await ensureTelephonySchema();
  if (input.callId && /^[0-9a-f-]{36}$/i.test(input.callId)) {
    const call = await pool.query(
      `SELECT campaign_id FROM voice_calls WHERE id = $1::uuid AND tenant_id = $2::uuid AND user_id = $3::uuid`,
      [input.callId, input.tenantId, input.userId]
    );
    const campaignId = call.rows[0]?.campaign_id ? String(call.rows[0].campaign_id) : null;
    if (campaignId) {
      const tabs = await listCampaignTabulacoes({ tenantId: input.tenantId, campaignId, onlyActive: true });
      return {
        kind: "campaign",
        items: tabs.map((t) => ({
          id: t.id,
          label: t.label,
          description: t.description,
          outcome: t.outcome,
          isSuccess: t.isSuccess,
        })),
      };
    }
  }
  const general = await listTabulacoesForConversationClose({ tenantId: input.tenantId, queueKey: null });
  return {
    kind: "general",
    items: general.map((t) => ({ id: t.id, label: t.label, description: t.description, outcome: null, isSuccess: false })),
  };
}

export async function tabulateCall(input: {
  tenantId: string;
  userId: string;
  callId: string;
  tabulacaoId: string;
  callbackAt?: unknown;
}): Promise<VoiceCallRecord> {
  await ensureTelephonySchema();
  const existing = await pool.query(
    `SELECT id, contact_id, campaign_id, result FROM voice_calls
     WHERE id = $1::uuid AND tenant_id = $2::uuid AND user_id = $3::uuid`,
    [input.callId, input.tenantId, input.userId]
  );
  const call = existing.rows[0];
  if (!call) throw new Error("TELEPHONY_CALL_NOT_FOUND");

  if (call.campaign_id) {
    const tab = await getCampaignTabulacao(String(call.campaign_id), input.tabulacaoId);
    if (!tab) throw new Error("TELEPHONY_TABULACAO_NOT_ALLOWED");
    const callbackAt = tab.outcome === "callback" ? parseCallbackAt(input.callbackAt) : null;
    if (tab.outcome === "callback" && !callbackAt) throw new Error("TELEPHONY_CALLBACK_INVALID");
    await pool.query(
      `UPDATE voice_calls
       SET tabulacao_id = $2::uuid, tabulacao_label = $3, tabulacao_is_success = $4, callback_at = $5,
           tabulated_at = now()
       WHERE id = $1::uuid`,
      [input.callId, tab.id, tab.label, tab.isSuccess, callbackAt]
    );
    if (call.contact_id) {
      await updateContactAfterCall(
        input.callId,
        (ctx) => resolveContactAfterAttempt({ ...ctx, callAnswered: true, outcome: tab.outcome, callbackAt }),
        {
          result: (call.result as VoiceCallResult | null) ?? "answered",
          tabulacaoLabel: tab.label,
          callbackUserId: tab.outcome === "callback" ? input.userId : null,
        }
      );
    }
  } else {
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
  }

  const result = await pool.query(`${CALL_SELECT} WHERE c.id = $1::uuid`, [input.callId]);
  return mapCall(result.rows[0]);
}
