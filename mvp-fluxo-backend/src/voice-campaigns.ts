import { parseSpreadsheetBuffer } from "./campaign-spreadsheet";
import { pool } from "./db";
import {
  assertCanStartCall,
  assertTelephonyEnabled,
  ensureTelephonySchema,
  insertCallRequest,
  requireTelephonyConfig,
} from "./telephony";
import { REQUEST_AUTHORIZE_WINDOW_SECONDS } from "./telephony-rules";
import {
  CALLBACK_OWNER_GRACE_MINUTES,
  clampMaxAttempts,
  clampRetryIntervalMinutes,
  prepareVoiceContacts,
  suggestColumn,
  type VoiceCampaignStatus,
} from "./voice-campaign-rules";
import { seedCampaignTabulacoes } from "./voice-campaign-tabulacoes";

const PHONE_CANDIDATES = ["telefone", "celular", "fone", "phone", "whatsapp", "numero", "tel"];
const NAME_CANDIDATES = ["nome", "name", "cliente", "contato", "razaosocial"];
const MAX_IMPORT_ROWS = 50_000;
const INSERT_CHUNK = 1000;
const UUID_RE = /^[0-9a-f-]{36}$/i;

function toIso(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function decodeSpreadsheet(input: { filename?: string; contentBase64?: string }) {
  const filename = String(input.filename ?? "").trim();
  const content = String(input.contentBase64 ?? "").replace(/^data:[^,]*,/, "");
  if (!filename || !content) throw new Error("VOICE_CAMPAIGN_FILE_REQUIRED");
  if (!/\.(xlsx|xls|csv)$/i.test(filename)) throw new Error("VOICE_CAMPAIGN_FILE_INVALID");
  let parsed;
  try {
    parsed = parseSpreadsheetBuffer(Buffer.from(content, "base64"), filename);
  } catch {
    throw new Error("VOICE_CAMPAIGN_FILE_INVALID");
  }
  if (!parsed.headers.length || !parsed.rows.length) throw new Error("VOICE_CAMPAIGN_FILE_EMPTY");
  if (parsed.rows.length > MAX_IMPORT_ROWS) throw new Error("VOICE_CAMPAIGN_FILE_TOO_LARGE");
  return parsed;
}

export function previewVoiceSpreadsheet(input: { filename?: string; contentBase64?: string }) {
  const parsed = decodeSpreadsheet(input);
  return {
    headers: parsed.headers,
    totalRows: parsed.rows.length,
    sampleRows: parsed.rows.slice(0, 5),
    suggestedPhoneColumn: suggestColumn(parsed.headers, PHONE_CANDIDATES),
    suggestedNameColumn: suggestColumn(parsed.headers, NAME_CANDIDATES),
  };
}

// --- Admin ----------------------------------------------------------------

export type VoiceCampaignSummary = {
  id: string;
  name: string;
  status: VoiceCampaignStatus;
  maxAttempts: number;
  retryIntervalMinutes: number;
  recordCalls: boolean;
  queueIds: string[];
  queueLabels: string[];
  createdAt: string;
  counts: {
    total: number;
    pending: number;
    retry: number;
    inCall: number;
    done: number;
    exhausted: number;
    doNotCall: number;
    invalid: number;
    readyNow: number;
  };
};

const SUMMARY_SELECT = `
  SELECT vc.*,
    COALESCE((SELECT array_agg(q.id::text ORDER BY q.label) FROM voice_campaign_queues vq
              JOIN service_queues q ON q.id = vq.queue_id WHERE vq.campaign_id = vc.id), '{}') AS queue_ids,
    COALESCE((SELECT array_agg(q.label ORDER BY q.label) FROM voice_campaign_queues vq
              JOIN service_queues q ON q.id = vq.queue_id WHERE vq.campaign_id = vc.id), '{}') AS queue_labels,
    s.total, s.pending, s.retry, s.in_call, s.done, s.exhausted, s.do_not_call, s.invalid, s.ready_now
  FROM voice_campaigns vc
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status = 'pending')::int AS pending,
      count(*) FILTER (WHERE status = 'retry')::int AS retry,
      count(*) FILTER (WHERE status = 'in_call')::int AS in_call,
      count(*) FILTER (WHERE status = 'done')::int AS done,
      count(*) FILTER (WHERE status = 'exhausted')::int AS exhausted,
      count(*) FILTER (WHERE status = 'do_not_call')::int AS do_not_call,
      count(*) FILTER (WHERE status = 'invalid')::int AS invalid,
      count(*) FILTER (WHERE status IN ('pending', 'retry')
                        AND (next_attempt_at IS NULL OR next_attempt_at <= now()))::int AS ready_now
    FROM voice_campaign_contacts WHERE campaign_id = vc.id
  ) s ON true`;

function mapSummary(row: Record<string, unknown>): VoiceCampaignSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    status: String(row.status) as VoiceCampaignStatus,
    maxAttempts: Number(row.max_attempts),
    retryIntervalMinutes: Number(row.retry_interval_minutes),
    recordCalls: Boolean(row.record_calls),
    queueIds: (row.queue_ids as string[]) ?? [],
    queueLabels: (row.queue_labels as string[]) ?? [],
    createdAt: toIso(row.created_at) ?? "",
    counts: {
      total: Number(row.total ?? 0),
      pending: Number(row.pending ?? 0),
      retry: Number(row.retry ?? 0),
      inCall: Number(row.in_call ?? 0),
      done: Number(row.done ?? 0),
      exhausted: Number(row.exhausted ?? 0),
      doNotCall: Number(row.do_not_call ?? 0),
      invalid: Number(row.invalid ?? 0),
      readyNow: Number(row.ready_now ?? 0),
    },
  };
}

export async function listVoiceQueues(tenantId: string): Promise<{ id: string; label: string }[]> {
  await ensureTelephonySchema();
  const result = await pool.query(
    `SELECT id, label FROM service_queues WHERE tenant_id = $1::uuid AND active = true ORDER BY label`,
    [tenantId]
  );
  return result.rows.map((r) => ({ id: String(r.id), label: String(r.label) }));
}

export async function listVoiceCampaigns(tenantId: string): Promise<VoiceCampaignSummary[]> {
  await ensureTelephonySchema();
  const result = await pool.query(
    `${SUMMARY_SELECT} WHERE vc.tenant_id = $1::uuid ORDER BY vc.created_at DESC`,
    [tenantId]
  );
  return result.rows.map(mapSummary);
}

async function getVoiceCampaignSummary(tenantId: string, campaignId: string): Promise<VoiceCampaignSummary> {
  const result = await pool.query(`${SUMMARY_SELECT} WHERE vc.tenant_id = $1::uuid AND vc.id = $2::uuid`, [
    tenantId,
    campaignId,
  ]);
  if (!result.rows[0]) throw new Error("VOICE_CAMPAIGN_NOT_FOUND");
  return mapSummary(result.rows[0]);
}

async function validQueueIds(tenantId: string, queueIds: unknown): Promise<string[]> {
  const ids = Array.isArray(queueIds) ? queueIds.map(String).filter((id) => UUID_RE.test(id)) : [];
  if (!ids.length) return [];
  const result = await pool.query(
    `SELECT id FROM service_queues WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])`,
    [tenantId, ids]
  );
  return result.rows.map((r) => String(r.id));
}

export type VoiceImportResult = {
  imported: number;
  duplicates: number;
  invalidCount: number;
  invalid: { line: number; value: string }[];
};

async function importContacts(input: {
  tenantId: string;
  campaignId: string;
  filename?: string;
  contentBase64?: string;
  phoneColumn: string;
  nameColumn?: string | null;
}): Promise<VoiceImportResult> {
  const parsed = decodeSpreadsheet(input);
  if (!parsed.headers.includes(input.phoneColumn)) throw new Error("VOICE_CAMPAIGN_PHONE_COLUMN");
  const nameColumn = input.nameColumn && parsed.headers.includes(input.nameColumn) ? input.nameColumn : null;
  const prepared = prepareVoiceContacts({ rows: parsed.rows, phoneColumn: input.phoneColumn, nameColumn });

  let imported = 0;
  for (let i = 0; i < prepared.contacts.length; i += INSERT_CHUNK) {
    const chunk = prepared.contacts.slice(i, i + INSERT_CHUNK);
    const result = await pool.query(
      `INSERT INTO voice_campaign_contacts (tenant_id, campaign_id, phone, name, data)
       SELECT $1::uuid, $2::uuid, t.phone, t.name, t.data
       FROM unnest($3::text[], $4::text[], $5::jsonb[]) AS t(phone, name, data)
       ON CONFLICT (campaign_id, phone) DO NOTHING`,
      [
        input.tenantId,
        input.campaignId,
        chunk.map((c) => c.phone),
        chunk.map((c) => c.name),
        chunk.map((c) => JSON.stringify(c.data)),
      ]
    );
    imported += result.rowCount ?? 0;
  }
  await pool.query(`UPDATE voice_campaigns SET headers = $2::jsonb, updated_at = now() WHERE id = $1::uuid`, [
    input.campaignId,
    JSON.stringify(parsed.headers),
  ]);
  return {
    imported,
    duplicates: prepared.duplicates + (prepared.contacts.length - imported),
    invalidCount: prepared.invalid.length,
    invalid: prepared.invalid.slice(0, 50),
  };
}

export async function createVoiceCampaign(input: {
  tenantId: string;
  userId: string;
  name?: string;
  queueIds?: unknown;
  maxAttempts?: unknown;
  retryIntervalMinutes?: unknown;
  recordCalls?: unknown;
  filename?: string;
  contentBase64?: string;
  phoneColumn?: string;
  nameColumn?: string | null;
}): Promise<{ campaign: VoiceCampaignSummary; result: VoiceImportResult }> {
  await ensureTelephonySchema();
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("VOICE_CAMPAIGN_NAME_REQUIRED");
  const phoneColumn = String(input.phoneColumn ?? "").trim();
  if (!phoneColumn) throw new Error("VOICE_CAMPAIGN_PHONE_COLUMN");
  decodeSpreadsheet(input);
  const queueIds = await validQueueIds(input.tenantId, input.queueIds);

  const inserted = await pool.query(
    `INSERT INTO voice_campaigns
       (tenant_id, name, max_attempts, retry_interval_minutes, record_calls, phone_column, name_column, created_by)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::uuid)
     RETURNING id`,
    [
      input.tenantId,
      name.slice(0, 120),
      clampMaxAttempts(input.maxAttempts),
      clampRetryIntervalMinutes(input.retryIntervalMinutes),
      input.recordCalls === true,
      phoneColumn,
      input.nameColumn || null,
      input.userId,
    ]
  );
  const campaignId = String(inserted.rows[0].id);
  await seedCampaignTabulacoes(input.tenantId, campaignId);
  for (const queueId of queueIds) {
    await pool.query(`INSERT INTO voice_campaign_queues (campaign_id, queue_id) VALUES ($1::uuid, $2::uuid)`, [
      campaignId,
      queueId,
    ]);
  }
  try {
    const result = await importContacts({
      tenantId: input.tenantId,
      campaignId,
      filename: input.filename,
      contentBase64: input.contentBase64,
      phoneColumn,
      nameColumn: input.nameColumn,
    });
    return { campaign: await getVoiceCampaignSummary(input.tenantId, campaignId), result };
  } catch (err) {
    await pool.query(`DELETE FROM voice_campaigns WHERE id = $1::uuid`, [campaignId]);
    throw err;
  }
}

export async function addVoiceCampaignContacts(input: {
  tenantId: string;
  campaignId: string;
  filename?: string;
  contentBase64?: string;
  phoneColumn?: string;
  nameColumn?: string | null;
}): Promise<{ campaign: VoiceCampaignSummary; result: VoiceImportResult }> {
  await ensureTelephonySchema();
  const current = await getVoiceCampaignSummary(input.tenantId, input.campaignId);
  const phoneColumn = String(input.phoneColumn ?? "").trim();
  if (!phoneColumn) throw new Error("VOICE_CAMPAIGN_PHONE_COLUMN");
  const result = await importContacts({
    tenantId: input.tenantId,
    campaignId: current.id,
    filename: input.filename,
    contentBase64: input.contentBase64,
    phoneColumn,
    nameColumn: input.nameColumn,
  });
  return { campaign: await getVoiceCampaignSummary(input.tenantId, current.id), result };
}

export async function updateVoiceCampaign(input: {
  tenantId: string;
  campaignId: string;
  name?: string;
  status?: string;
  queueIds?: unknown;
  maxAttempts?: unknown;
  retryIntervalMinutes?: unknown;
  recordCalls?: unknown;
}): Promise<VoiceCampaignSummary> {
  await ensureTelephonySchema();
  const current = await getVoiceCampaignSummary(input.tenantId, input.campaignId);
  const status =
    input.status === "active" || input.status === "paused" || input.status === "completed"
      ? input.status
      : current.status;
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 120) : current.name;
  await pool.query(
    `UPDATE voice_campaigns
     SET name = $2, status = $3, max_attempts = $4, retry_interval_minutes = $5, record_calls = $6, updated_at = now()
     WHERE id = $1::uuid`,
    [
      current.id,
      name,
      status,
      input.maxAttempts === undefined ? current.maxAttempts : clampMaxAttempts(input.maxAttempts),
      input.retryIntervalMinutes === undefined
        ? current.retryIntervalMinutes
        : clampRetryIntervalMinutes(input.retryIntervalMinutes),
      input.recordCalls === undefined ? current.recordCalls : input.recordCalls === true,
    ]
  );
  if (input.queueIds !== undefined) {
    const queueIds = await validQueueIds(input.tenantId, input.queueIds);
    await pool.query(`DELETE FROM voice_campaign_queues WHERE campaign_id = $1::uuid`, [current.id]);
    for (const queueId of queueIds) {
      await pool.query(`INSERT INTO voice_campaign_queues (campaign_id, queue_id) VALUES ($1::uuid, $2::uuid)`, [
        current.id,
        queueId,
      ]);
    }
  }
  return getVoiceCampaignSummary(input.tenantId, current.id);
}

// --- Atendente (preview) --------------------------------------------------

/** Campanha visível ao atendente: ativa e sem filas, ou ligada a uma fila em que ele atua. */
const AGENT_VISIBLE = `
  vc.tenant_id = $1::uuid AND vc.status = 'active'
  AND (
    NOT EXISTS (SELECT 1 FROM voice_campaign_queues vq WHERE vq.campaign_id = vc.id)
    OR EXISTS (
      SELECT 1 FROM voice_campaign_queues vq
      JOIN queue_user_permissions qp ON qp.queue_id = vq.queue_id
      WHERE vq.campaign_id = vc.id AND qp.user_id = $2::uuid
    )
  )`;

/**
 * Contato disponível agora para o atendente. Retorno agendado para outro operador só fica livre
 * depois do prazo de tolerância (o dono não puxou a tempo).
 */
function availableNowFor(alias: string, userParam: string): string {
  return `${alias}.status IN ('pending', 'retry')
    AND (${alias}.next_attempt_at IS NULL OR ${alias}.next_attempt_at <= now())
    AND (${alias}.callback_user_id IS NULL OR ${alias}.callback_user_id = ${userParam}
         OR ${alias}.next_attempt_at <= now() - interval '${CALLBACK_OWNER_GRACE_MINUTES} minutes')`;
}

export type AgentVoiceCampaign = {
  id: string;
  name: string;
  queueLabels: string[];
  readyNow: number;
  scheduled: number;
  nextRetryAt: string | null;
  myCallbacks: number;
  nextMyCallbackAt: string | null;
};

export async function listAgentVoiceCampaigns(tenantId: string, userId: string): Promise<AgentVoiceCampaign[]> {
  await ensureTelephonySchema();
  const result = await pool.query(
    `SELECT vc.id, vc.name,
       COALESCE((SELECT array_agg(q.label ORDER BY q.label) FROM voice_campaign_queues vq
                 JOIN service_queues q ON q.id = vq.queue_id WHERE vq.campaign_id = vc.id), '{}') AS queue_labels,
       (SELECT count(*)::int FROM voice_campaign_contacts c WHERE c.campaign_id = vc.id
          AND ${availableNowFor("c", "$2::uuid")}) AS ready_now,
       (SELECT count(*)::int FROM voice_campaign_contacts c WHERE c.campaign_id = vc.id
          AND c.status = 'retry' AND c.next_attempt_at > now()) AS scheduled,
       (SELECT min(c.next_attempt_at) FROM voice_campaign_contacts c WHERE c.campaign_id = vc.id
          AND c.status = 'retry' AND c.next_attempt_at > now()) AS next_retry_at,
       (SELECT count(*)::int FROM voice_campaign_contacts c WHERE c.campaign_id = vc.id
          AND c.status = 'retry' AND c.callback_user_id = $2::uuid) AS my_callbacks,
       (SELECT min(c.next_attempt_at) FROM voice_campaign_contacts c WHERE c.campaign_id = vc.id
          AND c.status = 'retry' AND c.callback_user_id = $2::uuid) AS next_my_callback_at
     FROM voice_campaigns vc
     WHERE ${AGENT_VISIBLE}
     ORDER BY vc.name`,
    [tenantId, userId]
  );
  return result.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    queueLabels: (r.queue_labels as string[]) ?? [],
    readyNow: Number(r.ready_now ?? 0),
    scheduled: Number(r.scheduled ?? 0),
    nextRetryAt: toIso(r.next_retry_at),
    myCallbacks: Number(r.my_callbacks ?? 0),
    nextMyCallbackAt: toIso(r.next_my_callback_at),
  }));
}

export type NextVoiceContact = {
  callId: string;
  dialNumber: string;
  campaign: { id: string; name: string; recordCalls: boolean };
  contact: {
    id: string;
    name: string | null;
    phone: string;
    data: Record<string, string>;
    attempts: number;
    maxAttempts: number;
    lastTabulacaoLabel: string | null;
    lastCallResult: string | null;
    /** Preenchido quando o contato voltou por retorno agendado. */
    callbackAt: string | null;
  };
};

/**
 * Reserva o próximo contato da campanha para o atendente e já registra o pedido de ligação
 * (o navegador disca em seguida). Disparado sempre por clique do atendente — sem discagem automática.
 */
export async function requestNextCampaignContact(input: {
  tenantId: string;
  userId: string;
  campaignId: string;
}): Promise<NextVoiceContact> {
  requireTelephonyConfig();
  await ensureTelephonySchema();
  await assertTelephonyEnabled(input.tenantId, input.userId);
  if (!UUID_RE.test(input.campaignId)) throw new Error("VOICE_CAMPAIGN_NOT_FOUND");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertCanStartCall(client, input.userId);

    const campaign = await client.query(
      `SELECT vc.id, vc.name, vc.max_attempts, vc.record_calls FROM voice_campaigns vc
       WHERE vc.id = $3::uuid AND ${AGENT_VISIBLE}`,
      [input.tenantId, input.userId, input.campaignId]
    );
    const c = campaign.rows[0];
    if (!c) throw new Error("VOICE_CAMPAIGN_NOT_FOUND");

    const picked = await client.query(
      `SELECT ct.id, ct.phone, ct.name, ct.data, ct.attempts, ct.status, ct.last_tabulacao_label,
              ct.callback_user_id, ct.next_attempt_at, ct.last_call_result,
              lc.id AS last_call_id, lc.status AS last_call_status
       FROM voice_campaign_contacts ct
       LEFT JOIN voice_calls lc ON lc.id = ct.last_call_id
       WHERE ct.campaign_id = $1::uuid
         AND (
           (${availableNowFor("ct", "$3::uuid")})
           OR (ct.status = 'in_call' AND (
                (lc.status = 'requested' AND lc.created_at < now() - make_interval(secs => $2))
                OR ct.reserved_at < now() - interval '3 hours'))
         )
       ORDER BY (ct.callback_user_id = $3::uuid) DESC NULLS LAST,
                (ct.callback_user_id IS NOT NULL) DESC,
                COALESCE(ct.next_attempt_at, ct.created_at) ASC, ct.created_at ASC
       LIMIT 1
       FOR UPDATE OF ct SKIP LOCKED`,
      [c.id, REQUEST_AUTHORIZE_WINDOW_SECONDS, input.userId]
    );
    const row = picked.rows[0];
    if (!row) throw new Error("VOICE_CAMPAIGN_NO_CONTACTS");

    // Reserva expirada sem discagem real: encerra o pedido antigo e não conta como tentativa.
    const staleRequest = row.status === "in_call" && row.last_call_status === "requested";
    if (staleRequest && row.last_call_id) {
      await client.query(
        `UPDATE voice_calls SET status = 'failed', ended_at = now() WHERE id = $1::uuid AND ended_at IS NULL`,
        [row.last_call_id]
      );
    }
    const attempts = Number(row.attempts) + (staleRequest ? 0 : 1);
    const callbackAt = row.callback_user_id && row.next_attempt_at ? toIso(row.next_attempt_at) : null;

    const callId = await insertCallRequest(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      phone: String(row.phone),
      campaignId: String(c.id),
      contactId: String(row.id),
    });
    await client.query(
      `UPDATE voice_campaign_contacts
       SET status = 'in_call', attempts = $2, reserved_by = $3::uuid, reserved_at = now(),
           last_call_id = $4::uuid, next_attempt_at = NULL, callback_user_id = NULL, updated_at = now()
       WHERE id = $1::uuid`,
      [row.id, attempts, input.userId, callId]
    );
    await client.query("COMMIT");
    return {
      callId,
      dialNumber: String(row.phone),
      campaign: { id: String(c.id), name: String(c.name), recordCalls: Boolean(c.record_calls) },
      contact: {
        id: String(row.id),
        name: row.name ? String(row.name) : null,
        phone: String(row.phone),
        data: (row.data as Record<string, string>) ?? {},
        attempts,
        maxAttempts: Number(c.max_attempts),
        lastTabulacaoLabel: row.last_tabulacao_label ? String(row.last_tabulacao_label) : null,
        lastCallResult: row.last_call_result ? String(row.last_call_result) : null,
        callbackAt,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
