import { pool } from "./db";
import type { AgentConversationStatus, AgentConversationLifecycleStatus } from "./agent-conversations";

export type MonitoringConversationRow = {
  id: string;
  contactName: string;
  phone: string;
  status: AgentConversationStatus;
  lifecycleStatus: AgentConversationLifecycleStatus;
  protocolNumber?: string;
  updatedAt: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastMessageDirection?: "in" | "out";
  lastMessageSource?: "cliente" | "agente" | "bot" | "sistema";
  messageCount: number;
};

export type MonitoringMessageRow = {
  id: string;
  direction: "in" | "out";
  source: "cliente" | "agente" | "bot" | "sistema";
  senderName?: string;
  text?: string;
  type: string;
  createdAt: string;
};

function classifyOutboundSource(senderName?: string | null): "agente" | "bot" | "sistema" {
  const name = senderName?.trim().toLowerCase() ?? "";
  if (!name || name === "sistema") return "sistema";
  if (name === "bot" || name === "cleo" || name.startsWith("bot ")) return "bot";
  return "agente";
}

export async function listMonitoringConversations(input: {
  tenantId: string;
  status?: AgentConversationStatus | "todas";
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: MonitoringConversationRow[]; total: number }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const search = input.search?.trim();
  const params: unknown[] = [input.tenantId];
  let where = "WHERE c.tenant_id = $1::uuid";

  if (input.status && input.status !== "todas") {
    params.push(input.status);
    where += ` AND c.status = $${params.length}`;
  }

  if (search) {
    params.push(`%${search.replace(/\D/g, "")}%`, `%${search}%`);
    const phoneIdx = params.length - 1;
    const textIdx = params.length;
    where += ` AND (
      regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') LIKE $${phoneIdx}
      OR c.contact_name ILIKE $${textIdx}
    )`;
  }

  const countRes = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM agent_conversations c ${where}`,
    params
  );
  const total = Number(countRes.rows[0]?.total ?? 0);

  params.push(limit, offset);
  const rows = await pool.query<{
    id: string;
    contact_name: string;
    phone: string;
    status: AgentConversationStatus;
    lifecycle_status: AgentConversationLifecycleStatus;
    protocol_number: string | null;
    updated_at: string;
    last_message_at: string | null;
    last_preview: string | null;
    last_direction: "in" | "out" | null;
    last_sender_name: string | null;
    message_count: string;
  }>(
    `SELECT c.id, c.contact_name, c.phone, c.status, c.lifecycle_status, c.protocol_number,
            c.updated_at::text,
            lm.created_at::text AS last_message_at,
            left(coalesce(lm.text_content, lm.type), 120) AS last_preview,
            lm.direction AS last_direction,
            lm.sender_name AS last_sender_name,
            (
              SELECT count(*)::text FROM agent_messages m WHERE m.conversation_id = c.id
            ) AS message_count
     FROM agent_conversations c
     LEFT JOIN LATERAL (
       SELECT text_content, type, direction, sender_name, created_at
       FROM agent_messages m
       WHERE m.conversation_id = c.id
       ORDER BY m.created_at DESC
       LIMIT 1
     ) lm ON true
     ${where}
     ORDER BY coalesce(lm.created_at, c.updated_at) DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const items = rows.rows.map((row) => {
    const lastDirection = row.last_direction ?? undefined;
    let lastSource: MonitoringConversationRow["lastMessageSource"];
    if (lastDirection === "in") lastSource = "cliente";
    else if (lastDirection === "out") lastSource = classifyOutboundSource(row.last_sender_name);

    return {
      id: row.id,
      contactName: row.contact_name,
      phone: row.phone,
      status: row.status,
      lifecycleStatus: row.lifecycle_status,
      protocolNumber: row.protocol_number ?? undefined,
      updatedAt: row.updated_at,
      lastMessageAt: row.last_message_at ?? undefined,
      lastMessagePreview: row.last_preview ?? undefined,
      lastMessageDirection: lastDirection,
      lastMessageSource: lastSource,
      messageCount: Number(row.message_count) || 0,
    };
  });

  return { items, total };
}

export async function listMonitoringMessages(
  tenantId: string,
  conversationId: string
): Promise<MonitoringMessageRow[]> {
  const result = await pool.query<{
    id: string;
    direction: "in" | "out";
    sender_name: string | null;
    text_content: string | null;
    type: string;
    created_at: string;
  }>(
    `SELECT m.id, m.direction, m.sender_name, m.text_content, m.type, m.created_at::text
     FROM agent_messages m
     JOIN agent_conversations c ON c.id = m.conversation_id
     WHERE m.tenant_id = $1::uuid AND m.conversation_id = $2::uuid AND c.tenant_id = $1::uuid
     ORDER BY m.created_at ASC`,
    [tenantId, conversationId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    source:
      row.direction === "in"
        ? "cliente"
        : classifyOutboundSource(row.sender_name),
    senderName: row.sender_name ?? undefined,
    text: row.text_content ?? undefined,
    type: row.type,
    createdAt: row.created_at,
  }));
}
