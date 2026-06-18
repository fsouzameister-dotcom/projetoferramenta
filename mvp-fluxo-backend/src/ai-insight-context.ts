import { pool } from "./db";
import { listFlowResponseEvents } from "./flow-response-events";

export type AiInsightAnalysisScope = "agent" | "flow" | "all";

export type AiInsightFilters = {
  dateFrom: string;
  dateTo: string;
  analysisScope?: AiInsightAnalysisScope;
  flowIds?: string[];
  queueIds?: string[];
  agentIds?: string[];
  personaIds?: string[];
  includeVoiceTranscripts?: boolean;
  personaId?: string;
};

export type InsightConversationSample = {
  source: "agent";
  conversationId: string;
  contactName: string;
  phone: string;
  status: string;
  queueKey: string | null;
  assignedUserId: string | null;
  openedAt: string;
  closedAt: string | null;
  tabulacaoLabel: string | null;
  messages: InsightMessageSample[];
};

export type InsightFlowSessionSample = {
  source: "flow";
  sessionKey: string;
  conversationId: string | null;
  phone: string | null;
  flowId: string;
  flowName: string | null;
  responses: Array<{
    questionKey: string;
    promptText: string | null;
    answerType: string;
    variableName: string;
    rawValue: string | null;
    selectedOptions: Array<{ id: string; label: string }>;
    createdAt: string;
  }>;
  messages: InsightMessageSample[];
};

export type InsightMessageSample = {
  direction: string;
  senderName: string | null;
  text: string;
  createdAt: string;
};

export type InsightContextStats = {
  analysisScope: AiInsightAnalysisScope;
  totalAgentConversations: number;
  sampledAgentConversations: number;
  totalFlowSessions: number;
  sampledFlowSessions: number;
  totalMessages: number;
  totalFlowResponses: number;
  agentOpenCount: number;
  agentClosedCount: number;
};

export type InsightContextBundle = {
  stats: InsightContextStats;
  agentConversations: InsightConversationSample[];
  flowSessions: InsightFlowSessionSample[];
  contextText: string;
};

const MAX_AGENT_CONVERSATIONS = 40;
const MAX_FLOW_SESSIONS = 40;
const MAX_MESSAGES_PER_CONVERSATION = 40;
const MAX_CONTEXT_CHARS = 100_000;

function resolveScope(filters: AiInsightFilters): AiInsightAnalysisScope {
  return filters.analysisScope ?? "agent";
}

function parseDateBound(value: string, endOfDay: boolean): Date {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Data inválida");
  }
  return parsed;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "***";
  return `***${digits.slice(-4)}`;
}

function messageText(
  row: {
    text_content: string | null;
    type: string;
    audio_payload: { transcript?: string } | null;
  },
  includeVoiceTranscripts: boolean
): string {
  const text = row.text_content?.trim();
  if (text) return text;
  if (includeVoiceTranscripts && row.type === "audio") {
    const transcript = row.audio_payload?.transcript?.trim();
    if (transcript) return `[áudio transcrito] ${transcript}`;
  }
  if (row.type === "audio") return "[mensagem de áudio]";
  if (row.type === "image") return "[imagem]";
  if (row.type === "document") return "[documento]";
  return "";
}

async function loadMessagesForConversation(
  tenantId: string,
  conversationId: string,
  includeVoiceTranscripts: boolean
): Promise<InsightMessageSample[]> {
  const msgResult = await pool.query<{
    direction: string;
    sender_name: string | null;
    text_content: string | null;
    type: string;
    audio_payload: { transcript?: string } | null;
    created_at: Date;
  }>(
    `SELECT direction, sender_name, text_content, type, audio_payload, created_at
     FROM agent_messages
     WHERE tenant_id = $1::uuid AND conversation_id = $2::uuid
     ORDER BY created_at ASC
     LIMIT $3`,
    [tenantId, conversationId, MAX_MESSAGES_PER_CONVERSATION]
  );

  return msgResult.rows
    .map((msg) => {
      const text = messageText(msg, includeVoiceTranscripts);
      if (!text) return null;
      return {
        direction: msg.direction,
        senderName: msg.sender_name,
        text,
        createdAt: msg.created_at.toISOString(),
      };
    })
    .filter((msg): msg is InsightMessageSample => Boolean(msg));
}

async function loadFlowNameMap(
  tenantId: string,
  flowIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!flowIds.length) return map;
  const result = await pool.query<{ id: string; name: string }>(
    `SELECT id::text, name FROM flows WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])`,
    [tenantId, flowIds]
  );
  for (const row of result.rows) {
    map.set(row.id, row.name);
  }
  return map;
}

async function buildAgentInsightSection(
  tenantId: string,
  filters: AiInsightFilters,
  dateFrom: Date,
  dateTo: Date
): Promise<{
  conversations: InsightConversationSample[];
  totalConversations: number;
  openCount: number;
  closedCount: number;
  totalMessages: number;
}> {
  const params: unknown[] = [tenantId, dateFrom.toISOString(), dateTo.toISOString()];
  const conditions = [
    "ac.tenant_id = $1::uuid",
    "COALESCE(ac.metadata->>'bot_only', 'false') <> 'true'",
    "ac.created_at >= $2::timestamptz",
    "ac.created_at <= $3::timestamptz",
  ];

  if (filters.queueIds?.length) {
    params.push(filters.queueIds);
    conditions.push(`COALESCE(ac.metadata->>'queue', '') = ANY($${params.length}::text[])`);
  }
  if (filters.agentIds?.length) {
    params.push(filters.agentIds);
    conditions.push(`ac.assigned_user_id::text = ANY($${params.length}::text[])`);
  }
  if (filters.personaIds?.length) {
    params.push(filters.personaIds);
    conditions.push(`COALESCE(ac.metadata->>'personaId', '') = ANY($${params.length}::text[])`);
  }
  if (filters.flowIds?.length) {
    params.push(filters.flowIds);
    conditions.push(
      `(COALESCE(ac.metadata->>'flowId', '') = ANY($${params.length}::text[])
        OR ac.id IN (
          SELECT DISTINCT conversation_id
          FROM flow_response_events
          WHERE tenant_id = $1::uuid
            AND flow_id = ANY($${params.length}::uuid[])
            AND conversation_id IS NOT NULL
        ))`
    );
  }

  const whereSql = conditions.join(" AND ");

  const countResult = await pool.query<{ total: string; open_count: string; closed_count: string }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE ac.lifecycle_status <> 'closed')::text AS open_count,
       COUNT(*) FILTER (WHERE ac.lifecycle_status = 'closed')::text AS closed_count
     FROM agent_conversations ac
     WHERE ${whereSql}`,
    params
  );

  const convResult = await pool.query<{
    id: string;
    contact_name: string;
    phone: string;
    status: string;
    lifecycle_status: string;
    metadata: { queue?: string } | null;
    assigned_user_id: string | null;
    created_at: Date;
    closed_at: Date | null;
    tabulacao_label: string | null;
  }>(
    `SELECT ac.id, ac.contact_name, ac.phone, ac.status, ac.lifecycle_status,
            ac.metadata, ac.assigned_user_id, ac.created_at, ac.closed_at, ac.tabulacao_label
     FROM agent_conversations ac
     WHERE ${whereSql}
     ORDER BY ac.created_at DESC
     LIMIT ${MAX_AGENT_CONVERSATIONS}`,
    params
  );

  const conversations: InsightConversationSample[] = [];
  let totalMessages = 0;

  for (const conv of convResult.rows) {
    const messages = await loadMessagesForConversation(
      tenantId,
      conv.id,
      Boolean(filters.includeVoiceTranscripts)
    );
    totalMessages += messages.length;
    conversations.push({
      source: "agent",
      conversationId: conv.id,
      contactName: conv.contact_name,
      phone: maskPhone(conv.phone),
      status: conv.lifecycle_status || conv.status,
      queueKey: conv.metadata?.queue ?? null,
      assignedUserId: conv.assigned_user_id,
      openedAt: conv.created_at.toISOString(),
      closedAt: conv.closed_at?.toISOString() ?? null,
      tabulacaoLabel: conv.tabulacao_label,
      messages,
    });
  }

  return {
    conversations,
    totalConversations: Number(countResult.rows[0]?.total ?? 0),
    openCount: Number(countResult.rows[0]?.open_count ?? 0),
    closedCount: Number(countResult.rows[0]?.closed_count ?? 0),
    totalMessages,
  };
}

type FlowSessionRow = {
  session_key: string;
  conversation_id: string | null;
  phone: string | null;
  flow_id: string;
};

async function buildFlowInsightSection(
  tenantId: string,
  filters: AiInsightFilters,
  dateFrom: Date,
  dateTo: Date
): Promise<{
  sessions: InsightFlowSessionSample[];
  totalSessions: number;
  totalResponses: number;
  totalMessages: number;
}> {
  await listFlowResponseEvents({ tenantId, limit: 1 });

  const eventParams: unknown[] = [tenantId, dateFrom.toISOString(), dateTo.toISOString()];
  const eventConditions = [
    "e.tenant_id = $1::uuid",
    "e.created_at >= $2::timestamptz",
    "e.created_at <= $3::timestamptz",
  ];

  if (filters.flowIds?.length) {
    eventParams.push(filters.flowIds);
    eventConditions.push(`e.flow_id = ANY($${eventParams.length}::uuid[])`);
  }

  const eventWhere = eventConditions.join(" AND ");

  const sessionResult = await pool.query<FlowSessionRow>(
    `SELECT
       COALESCE(
         e.conversation_id::text,
         NULLIF(e.session_id, ''),
         CONCAT('phone:', regexp_replace(coalesce(e.phone, ''), '[^0-9]', '', 'g'))
       ) AS session_key,
       e.conversation_id::text AS conversation_id,
       e.phone,
       e.flow_id::text AS flow_id
     FROM flow_response_events e
     WHERE ${eventWhere}
     GROUP BY 1, 2, 3, 4
     ORDER BY MAX(e.created_at) DESC
     LIMIT ${MAX_FLOW_SESSIONS}`,
    eventParams
  );

  const botParams: unknown[] = [tenantId, dateFrom.toISOString(), dateTo.toISOString()];
  const botConditions = [
    "ac.tenant_id = $1::uuid",
    "COALESCE(ac.metadata->>'bot_only', 'false') = 'true'",
    "ac.created_at >= $2::timestamptz",
    "ac.created_at <= $3::timestamptz",
  ];

  if (filters.flowIds?.length) {
    botParams.push(filters.flowIds);
    botConditions.push(
      `(COALESCE(ac.metadata->'inbound_flow_session'->>'flowId', '') = ANY($${botParams.length}::text[])
        OR ac.id IN (
          SELECT DISTINCT conversation_id
          FROM flow_response_events
          WHERE tenant_id = $1::uuid
            AND flow_id = ANY($${botParams.length}::uuid[])
            AND conversation_id IS NOT NULL
        ))`
    );
  }

  const botWhere = botConditions.join(" AND ");
  const botConvResult = await pool.query<{
    id: string;
    phone: string;
    metadata: { inbound_flow_session?: { flowId?: string } } | null;
  }>(
    `SELECT ac.id, ac.phone, ac.metadata
     FROM agent_conversations ac
     WHERE ${botWhere}
     ORDER BY ac.created_at DESC
     LIMIT ${MAX_FLOW_SESSIONS}`,
    botParams
  );

  const sessionMap = new Map<string, FlowSessionRow>();
  for (const row of sessionResult.rows) {
    sessionMap.set(`${row.session_key}:${row.flow_id}`, row);
  }

  for (const conv of botConvResult.rows) {
    const flowId =
      conv.metadata?.inbound_flow_session?.flowId?.trim() ||
      filters.flowIds?.[0] ||
      "unknown";
    if (filters.flowIds?.length && !filters.flowIds.includes(flowId)) {
      const linked = sessionResult.rows.find((r) => r.conversation_id === conv.id);
      if (!linked) continue;
    }
    const key = `${conv.id}:${flowId}`;
    if (!sessionMap.has(key)) {
      sessionMap.set(key, {
        session_key: conv.id,
        conversation_id: conv.id,
        phone: conv.phone,
        flow_id: flowId,
      });
    }
  }

  const sessionRows = [...sessionMap.values()].slice(0, MAX_FLOW_SESSIONS);
  const flowIds = [...new Set(sessionRows.map((s) => s.flow_id).filter((id) => id !== "unknown"))];
  const flowNames = await loadFlowNameMap(tenantId, flowIds);

  const countResult = await pool.query<{ total: string; responses: string }>(
    `SELECT
       COUNT(DISTINCT COALESCE(
         e.conversation_id::text,
         NULLIF(e.session_id, ''),
         CONCAT('phone:', regexp_replace(coalesce(e.phone, ''), '[^0-9]', '', 'g'))
       ))::text AS total,
       COUNT(*)::text AS responses
     FROM flow_response_events e
     WHERE ${eventWhere}`,
    eventParams
  );

  const sessions: InsightFlowSessionSample[] = [];
  let totalMessages = 0;
  let totalResponses = 0;

  for (const session of sessionRows) {
    const responseParams = [...eventParams];
    const responseConditions = [...eventConditions, `e.flow_id = $${responseParams.length + 1}::uuid`];
    responseParams.push(session.flow_id);

    if (session.conversation_id) {
      responseConditions.push(`e.conversation_id = $${responseParams.length + 1}::uuid`);
      responseParams.push(session.conversation_id);
    } else if (session.phone) {
      responseConditions.push(`e.phone = $${responseParams.length + 1}`);
      responseParams.push(session.phone);
    } else {
      responseConditions.push(`COALESCE(e.session_id, '') = $${responseParams.length + 1}`);
      responseParams.push(session.session_key);
    }

    const responsesResult = await pool.query<{
      question_key: string;
      prompt_text: string | null;
      answer_type: string;
      variable_name: string;
      raw_value: string | null;
      selected_options: Array<{ id: string; label: string }>;
      created_at: Date;
    }>(
      `SELECT question_key, prompt_text, answer_type, variable_name, raw_value, selected_options, created_at
       FROM flow_response_events e
       WHERE ${responseConditions.join(" AND ")}
       ORDER BY created_at ASC
       LIMIT 80`,
      responseParams
    );

    const responses = responsesResult.rows.map((row) => ({
      questionKey: row.question_key,
      promptText: row.prompt_text,
      answerType: row.answer_type,
      variableName: row.variable_name,
      rawValue: row.raw_value,
      selectedOptions: Array.isArray(row.selected_options) ? row.selected_options : [],
      createdAt: row.created_at.toISOString(),
    }));
    totalResponses += responses.length;

    let messages: InsightMessageSample[] = [];
    if (session.conversation_id) {
      messages = await loadMessagesForConversation(
        tenantId,
        session.conversation_id,
        Boolean(filters.includeVoiceTranscripts)
      );
      totalMessages += messages.length;
    }

    sessions.push({
      source: "flow",
      sessionKey: session.session_key,
      conversationId: session.conversation_id,
      phone: session.phone ? maskPhone(session.phone) : null,
      flowId: session.flow_id,
      flowName: flowNames.get(session.flow_id) ?? null,
      responses,
      messages,
    });
  }

  const botOnlyCount = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM agent_conversations ac WHERE ${botWhere}`,
    botParams
  );

  const totalSessions = Math.max(
    Number(countResult.rows[0]?.total ?? 0),
    Number(botOnlyCount.rows[0]?.total ?? 0),
    sessionRows.length
  );

  if (totalResponses === 0) {
    totalResponses = Number(countResult.rows[0]?.responses ?? 0);
  }

  return {
    sessions,
    totalSessions,
    totalResponses,
    totalMessages,
  };
}

export async function buildAiInsightContext(
  tenantId: string,
  filters: AiInsightFilters
): Promise<InsightContextBundle> {
  const scope = resolveScope(filters);
  const dateFrom = parseDateBound(filters.dateFrom, false);
  const dateTo = parseDateBound(filters.dateTo, true);

  const agentConversations: InsightConversationSample[] = [];
  const flowSessions: InsightFlowSessionSample[] = [];
  let totalMessages = 0;
  let agentStats = {
    totalConversations: 0,
    openCount: 0,
    closedCount: 0,
    totalMessages: 0,
  };
  let flowStats = {
    totalSessions: 0,
    totalResponses: 0,
    totalMessages: 0,
  };

  if (scope === "agent" || scope === "all") {
    const agentSection = await buildAgentInsightSection(tenantId, filters, dateFrom, dateTo);
    agentConversations.push(...agentSection.conversations);
    agentStats = {
      totalConversations: agentSection.totalConversations,
      openCount: agentSection.openCount,
      closedCount: agentSection.closedCount,
      totalMessages: agentSection.totalMessages,
    };
    totalMessages += agentSection.totalMessages;
  }

  if (scope === "flow" || scope === "all") {
    const flowSection = await buildFlowInsightSection(tenantId, filters, dateFrom, dateTo);
    flowSessions.push(...flowSection.sessions);
    flowStats = {
      totalSessions: flowSection.totalSessions,
      totalResponses: flowSection.totalResponses,
      totalMessages: flowSection.totalMessages,
    };
    totalMessages += flowSection.totalMessages;
  }

  const stats: InsightContextStats = {
    analysisScope: scope,
    totalAgentConversations: agentStats.totalConversations,
    sampledAgentConversations: agentConversations.length,
    totalFlowSessions: flowStats.totalSessions,
    sampledFlowSessions: flowSessions.length,
    totalMessages,
    totalFlowResponses: flowStats.totalResponses,
    agentOpenCount: agentStats.openCount,
    agentClosedCount: agentStats.closedCount,
  };

  const payload = {
    stats,
    agentConversations,
    flowSessions,
  };
  let contextText = JSON.stringify(payload, null, 2);
  if (contextText.length > MAX_CONTEXT_CHARS) {
    contextText = `${contextText.slice(0, MAX_CONTEXT_CHARS)}\n...[contexto truncado]`;
  }

  return {
    stats,
    agentConversations,
    flowSessions,
    contextText,
  };
}
