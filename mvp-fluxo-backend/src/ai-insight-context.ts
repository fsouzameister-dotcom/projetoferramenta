import { pool } from "./db";

export type AiInsightFilters = {
  dateFrom: string;
  dateTo: string;
  queueIds?: string[];
  agentIds?: string[];
  personaIds?: string[];
  includeVoiceTranscripts?: boolean;
  personaId?: string;
};

export type InsightConversationSample = {
  conversationId: string;
  contactName: string;
  phone: string;
  status: string;
  queueKey: string | null;
  assignedUserId: string | null;
  openedAt: string;
  closedAt: string | null;
  tabulacaoLabel: string | null;
  messages: Array<{
    direction: string;
    senderName: string | null;
    text: string;
    createdAt: string;
  }>;
};

export type InsightContextStats = {
  totalConversations: number;
  sampledConversations: number;
  totalMessages: number;
  openCount: number;
  closedCount: number;
};

export type InsightContextBundle = {
  stats: InsightContextStats;
  conversations: InsightConversationSample[];
  contextText: string;
};

const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES_PER_CONVERSATION = 40;
const MAX_CONTEXT_CHARS = 100_000;

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

export async function buildAiInsightContext(
  tenantId: string,
  filters: AiInsightFilters
): Promise<InsightContextBundle> {
  const dateFrom = parseDateBound(filters.dateFrom, false);
  const dateTo = parseDateBound(filters.dateTo, true);

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
  const totalConversations = Number(countResult.rows[0]?.total ?? 0);

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
     LIMIT ${MAX_CONVERSATIONS}`,
    params
  );

  const conversations: InsightConversationSample[] = [];
  let totalMessages = 0;

  for (const conv of convResult.rows) {
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
      [tenantId, conv.id, MAX_MESSAGES_PER_CONVERSATION]
    );

    const messages = msgResult.rows
      .map((msg) => {
        const text = messageText(msg, Boolean(filters.includeVoiceTranscripts));
        if (!text) return null;
        return {
          direction: msg.direction,
          senderName: msg.sender_name,
          text,
          createdAt: msg.created_at.toISOString(),
        };
      })
      .filter((msg): msg is NonNullable<typeof msg> => Boolean(msg));

    totalMessages += messages.length;
    conversations.push({
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

  const stats: InsightContextStats = {
    totalConversations,
    sampledConversations: conversations.length,
    totalMessages,
    openCount: Number(countResult.rows[0]?.open_count ?? 0),
    closedCount: Number(countResult.rows[0]?.closed_count ?? 0),
  };

  const payload = { stats, conversations };
  let contextText = JSON.stringify(payload, null, 2);
  if (contextText.length > MAX_CONTEXT_CHARS) {
    contextText = `${contextText.slice(0, MAX_CONTEXT_CHARS)}\n...[contexto truncado]`;
  }

  return { stats, conversations, contextText };
}
