import type { CapturarEntradaAwaiting } from "./capturar-entrada";
import { pool } from "./db";
import { redis } from "./redis";

const SESSION_PREFIX = "inbound:flow:session:";
const SESSION_TTL_SEC = 60 * 60 * 24;

export type StoredInboundFlowSession = {
  flowId: string;
  tenantId: string;
  contactKey: string;
  phone?: string;
  conversationId?: string;
  sessionId: string;
  variables: Record<string, unknown>;
  awaitingInput: CapturarEntradaAwaiting;
  sourceType: string;
  sourceKey: string;
};

function sessionRedisKey(tenantId: string, contactKey: string): string {
  return `${SESSION_PREFIX}${tenantId}:${contactKey}`;
}

function phoneDigitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function inboundFlowContactKeyFromPhone(phone: string): string {
  return `phone:${phoneDigitsOnly(phone)}`;
}

function parseStoredSession(
  raw: unknown,
  fallback: { tenantId: string; phone?: string; conversationId?: string; contactKey?: string }
): StoredInboundFlowSession | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const flowId = typeof s.flowId === "string" ? s.flowId.trim() : "";
  const awaitingInput = s.awaitingInput;
  if (!flowId || !awaitingInput || typeof awaitingInput !== "object") return null;
  const awaiting = awaitingInput as CapturarEntradaAwaiting;
  if (!awaiting.nodeId) return null;

  return {
    flowId,
    tenantId: fallback.tenantId,
    contactKey:
      typeof s.contactKey === "string" && s.contactKey.trim()
        ? s.contactKey.trim()
        : fallback.contactKey ?? "",
    phone: typeof s.phone === "string" ? s.phone : fallback.phone,
    conversationId:
      typeof s.conversationId === "string" ? s.conversationId : fallback.conversationId,
    sessionId: typeof s.sessionId === "string" ? s.sessionId : "",
    variables: (s.variables as Record<string, unknown>) ?? {},
    awaitingInput: awaiting,
    sourceType: typeof s.sourceType === "string" ? s.sourceType : "",
    sourceKey: typeof s.sourceKey === "string" ? s.sourceKey : "",
  };
}

async function saveSessionToRedis(session: StoredInboundFlowSession): Promise<void> {
  try {
    await redis.set(
      sessionRedisKey(session.tenantId, session.contactKey),
      JSON.stringify(session),
      "EX",
      SESSION_TTL_SEC
    );
  } catch (err) {
    console.warn("[inbound-flow-session] Redis save falhou:", err);
  }
}

async function loadSessionFromRedis(
  tenantId: string,
  contactKey: string
): Promise<StoredInboundFlowSession | null> {
  try {
    const raw = await redis.get(sessionRedisKey(tenantId, contactKey));
    if (!raw) return null;
    return parseStoredSession(JSON.parse(raw), { tenantId, contactKey });
  } catch (err) {
    console.warn("[inbound-flow-session] Redis load falhou:", err);
    return null;
  }
}

async function clearSessionFromRedis(tenantId: string, contactKey: string): Promise<void> {
  try {
    await redis.del(sessionRedisKey(tenantId, contactKey));
  } catch {
    /* sessão Redis opcional */
  }
}

async function saveSessionToConversation(session: StoredInboundFlowSession): Promise<void> {
  const convId = session.conversationId?.trim();
  const phone = session.phone?.trim();
  if (!convId && !phone) return;

  const payload = {
    flowId: session.flowId,
    contactKey: session.contactKey,
    phone: session.phone ?? null,
    conversationId: session.conversationId ?? null,
    sessionId: session.sessionId,
    variables: session.variables,
    awaitingInput: session.awaitingInput,
    sourceType: session.sourceType,
    sourceKey: session.sourceKey,
    updatedAt: new Date().toISOString(),
  };

  if (convId) {
    await pool.query(
      `UPDATE agent_conversations
       SET metadata = COALESCE(metadata, '{}'::jsonb)
         || jsonb_build_object('inbound_flow_session', $3::jsonb),
           updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [convId, session.tenantId, JSON.stringify(payload)]
    );
    return;
  }

  const digits = phoneDigitsOnly(phone!);
  await pool.query(
    `UPDATE agent_conversations
     SET metadata = COALESCE(metadata, '{}'::jsonb)
       || jsonb_build_object('inbound_flow_session', $3::jsonb),
         updated_at = now()
     WHERE tenant_id = $1::uuid
       AND lifecycle_status = 'open'
       AND COALESCE(metadata->>'bot_only', 'false') = 'true'
       AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = $2`,
    [session.tenantId, digits, JSON.stringify(payload)]
  );
}

async function loadSessionFromConversation(input: {
  tenantId: string;
  phone?: string;
  conversationId?: string;
  contactKey: string;
}): Promise<StoredInboundFlowSession | null> {
  let row: { id: string; metadata: Record<string, unknown> } | undefined;

  if (input.conversationId?.trim()) {
    const result = await pool.query<{ id: string; metadata: Record<string, unknown> }>(
      `SELECT id, metadata
       FROM agent_conversations
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND lifecycle_status = 'open'
       LIMIT 1`,
      [input.conversationId.trim(), input.tenantId]
    );
    row = result.rows[0];
  } else if (input.phone?.trim()) {
    const digits = phoneDigitsOnly(input.phone);
    const result = await pool.query<{ id: string; metadata: Record<string, unknown> }>(
      `SELECT id, metadata
       FROM agent_conversations
       WHERE tenant_id = $1::uuid
         AND lifecycle_status = 'open'
         AND COALESCE(metadata->>'bot_only', 'false') = 'true'
         AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [input.tenantId, digits]
    );
    row = result.rows[0];
  }

  if (!row) return null;
  const parsed = parseStoredSession(row.metadata?.inbound_flow_session, {
    tenantId: input.tenantId,
    phone: input.phone,
    conversationId: row.id,
    contactKey: input.contactKey,
  });
  if (!parsed) return null;
  return { ...parsed, conversationId: row.id };
}

async function clearSessionFromConversation(input: {
  tenantId: string;
  phone?: string;
  conversationId?: string;
}): Promise<void> {
  if (input.conversationId?.trim()) {
    await pool.query(
      `UPDATE agent_conversations
       SET metadata = metadata - 'inbound_flow_session'
       WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [input.conversationId.trim(), input.tenantId]
    );
    return;
  }
  if (input.phone?.trim()) {
    const digits = phoneDigitsOnly(input.phone);
    await pool.query(
      `UPDATE agent_conversations
       SET metadata = metadata - 'inbound_flow_session'
       WHERE tenant_id = $1::uuid
         AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = $2
         AND metadata ? 'inbound_flow_session'`,
      [input.tenantId, digits]
    );
  }
}

async function isConversationOpenForSession(input: {
  tenantId: string;
  conversationId: string;
}): Promise<boolean> {
  const result = await pool.query<{ open: boolean }>(
    `SELECT lifecycle_status = 'open' AS open
     FROM agent_conversations
     WHERE id = $1::uuid AND tenant_id = $2::uuid
     LIMIT 1`,
    [input.conversationId.trim(), input.tenantId]
  );
  return result.rows[0]?.open === true;
}

export async function loadInboundFlowSession(input: {
  tenantId: string;
  contactKey: string;
  phone?: string;
  conversationId?: string;
}): Promise<StoredInboundFlowSession | null> {
  const fromRedis = await loadSessionFromRedis(input.tenantId, input.contactKey);
  if (fromRedis) {
    const sessionConversationId = fromRedis.conversationId?.trim();
    if (
      sessionConversationId &&
      !(await isConversationOpenForSession({
        tenantId: input.tenantId,
        conversationId: sessionConversationId,
      }))
    ) {
      await clearSessionFromRedis(input.tenantId, input.contactKey);
      await clearSessionFromConversation({
        tenantId: input.tenantId,
        conversationId: sessionConversationId,
      });
    } else {
      return fromRedis;
    }
  }

  const fromDb = await loadSessionFromConversation(input);
  if (fromDb) {
    console.info(
      `[inbound-flow-session] sessão restaurada do banco para ${input.contactKey}`
    );
  }
  return fromDb;
}

export async function saveInboundFlowSession(session: StoredInboundFlowSession): Promise<void> {
  await saveSessionToRedis(session);
  try {
    await saveSessionToConversation(session);
  } catch (err) {
    console.warn("[inbound-flow-session] DB save falhou:", err);
  }
}

export async function clearInboundFlowSession(input: {
  tenantId: string;
  contactKey: string;
  phone?: string;
  conversationId?: string;
}): Promise<void> {
  await clearSessionFromRedis(input.tenantId, input.contactKey);
  try {
    await clearSessionFromConversation(input);
  } catch {
    /* ignore */
  }
}

/** Remove sessão do fluxo inbound para o telefone (handoff, agente assume, etc.). */
export async function clearInboundFlowSessionForPhone(
  tenantId: string,
  phone: string
): Promise<void> {
  const trimmed = phone.trim();
  if (!trimmed) return;
  const contactKey = inboundFlowContactKeyFromPhone(trimmed);
  await clearInboundFlowSession({ tenantId, contactKey, phone: trimmed });
}
