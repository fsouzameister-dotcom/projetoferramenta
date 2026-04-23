import { pool } from "./db";

export type AgentConversationStatus = "em_espera" | "em_andamento" | "historico";
export type AgentMessageType = "text" | "contact" | "location";
export type AgentMessageDirection = "in" | "out";
export type AgentMessageDelivery = "sending" | "sent" | "delivered" | "read" | "failed";

export type AgentMessage = {
  id: string;
  provider_message_id?: string;
  type: AgentMessageType;
  direction: AgentMessageDirection;
  delivery?: AgentMessageDelivery;
  text?: string;
  createdAt: string;
  contact?: { name: string; phone: string };
  location?: { label: string; lat: number; lng: number };
  error_code?: string;
  error_description?: string;
};

export type AgentConversation = {
  id: string;
  contactName: string;
  phone: string;
  status: AgentConversationStatus;
  tags?: string[];
  metadata?: {
    queue?: string;
    templateName?: string;
    templateParams?: Record<string, string>;
  };
  messages: AgentMessage[];
};

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        contact_name text NOT NULL,
        phone text NOT NULL,
        status text NOT NULL DEFAULT 'em_espera',
        tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
        tenant_id uuid NOT NULL,
        type text NOT NULL,
        direction text NOT NULL,
        delivery_status text,
        text_content text,
        contact_payload jsonb,
        location_payload jsonb,
        error_code text,
        error_description text,
        metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      ALTER TABLE agent_messages
      ADD COLUMN IF NOT EXISTS provider_message_id text
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS metadata jsonb
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

function hhmm(isoDate: string) {
  return new Date(isoDate).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function ensureTenantSeed(tenantId: string) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    const exists = await client.query(`SELECT id FROM agent_conversations WHERE tenant_id = $1 LIMIT 1`, [
      tenantId,
    ]);
    if (exists.rows.length > 0) return;

    const created = await client.query<{ id: string }>(
      `INSERT INTO agent_conversations (tenant_id, contact_name, phone, status, tags)
       VALUES ($1, $2, $3, 'em_espera', '["Novo"]'::jsonb)
       RETURNING id`,
      [tenantId, "Lead WhatsApp", "+55 11 98888-1000"]
    );
    await client.query(
      `INSERT INTO agent_messages (conversation_id, tenant_id, type, direction, text_content, delivery_status)
       VALUES ($1, $2, 'text', 'in', $3, 'read')`,
      [created.rows[0].id, tenantId, "Olá, quero informações sobre o plano."]
    );
  } finally {
    client.release();
  }
}

export async function listAgentConversations(tenantId: string): Promise<AgentConversation[]> {
  await ensureTenantSeed(tenantId);
  const client = await pool.connect();
  try {
    const convs = await client.query<{
      id: string;
      contact_name: string;
      phone: string;
      status: AgentConversationStatus;
      tags: string[];
      metadata: {
        queue?: string;
        templateName?: string;
        templateParams?: Record<string, string>;
      } | null;
      updated_at: string;
    }>(
      `SELECT id, contact_name, phone, status, tags, metadata, updated_at
       FROM agent_conversations
       WHERE tenant_id = $1
       ORDER BY updated_at DESC`,
      [tenantId]
    );

    const msgs = await client.query<{
      id: string;
      provider_message_id: string | null;
      conversation_id: string;
      type: AgentMessageType;
      direction: AgentMessageDirection;
      delivery_status: AgentMessageDelivery | null;
      text_content: string | null;
      contact_payload: { name: string; phone: string } | null;
      location_payload: { label: string; lat: number; lng: number } | null;
      error_code: string | null;
      error_description: string | null;
      created_at: string;
    }>(
      `SELECT id, provider_message_id, conversation_id, type, direction, delivery_status, text_content, contact_payload,
              location_payload, error_code, error_description, created_at
       FROM agent_messages
       WHERE tenant_id = $1
       ORDER BY created_at ASC`,
      [tenantId]
    );

    const byConversation = new Map<string, AgentMessage[]>();
    for (const msg of msgs.rows) {
      const list = byConversation.get(msg.conversation_id) ?? [];
      list.push({
        id: msg.id,
        provider_message_id: msg.provider_message_id ?? undefined,
        type: msg.type,
        direction: msg.direction,
        delivery: msg.delivery_status ?? undefined,
        text: msg.text_content ?? undefined,
        createdAt: hhmm(msg.created_at),
        contact: msg.contact_payload ?? undefined,
        location: msg.location_payload ?? undefined,
        error_code: msg.error_code ?? undefined,
        error_description: msg.error_description ?? undefined,
      });
      byConversation.set(msg.conversation_id, list);
    }

    return convs.rows.map((conv) => ({
      id: conv.id,
      contactName: conv.contact_name,
      phone: conv.phone,
      status: conv.status,
      tags: Array.isArray(conv.tags) ? conv.tags : [],
      metadata: conv.metadata ?? undefined,
      messages: byConversation.get(conv.id) ?? [],
    }));
  } finally {
    client.release();
  }
}

export async function createAgentConversation(input: {
  tenantId: string;
  contactName: string;
  phone: string;
  queue?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
}): Promise<AgentConversation> {
  await ensureTenantSeed(input.tenantId);
  const client = await pool.connect();
  let createdId = "";
  try {
    const created = await client.query<{ id: string }>(
      `INSERT INTO agent_conversations (tenant_id, contact_name, phone, status, tags, metadata)
       VALUES ($1, $2, $3, 'em_espera', '["Novo contato"]'::jsonb, $4::jsonb)
       RETURNING id`,
      [
        input.tenantId,
        input.contactName,
        input.phone,
        JSON.stringify({
          queue: input.queue ?? null,
          templateName: input.templateName ?? null,
          templateParams: input.templateParams ?? {},
        }),
      ]
    );
    createdId = created.rows[0].id;

    if (input.templateName) {
      await client.query(
        `INSERT INTO agent_messages
         (conversation_id, tenant_id, provider_message_id, type, direction, delivery_status, text_content, metadata)
         VALUES ($1, $2, $3, 'text', 'out', 'sent', $4, $5::jsonb)`,
        [
          createdId,
          input.tenantId,
          `template-${Date.now()}`,
          `Template "${input.templateName}" enviado`,
          JSON.stringify({
            queue: input.queue ?? null,
            templateName: input.templateName,
            templateParams: input.templateParams ?? {},
          }),
        ]
      );
    }
  } finally {
    client.release();
  }

  const all = await listAgentConversations(input.tenantId);
  const found = all.find((c) => c.id === createdId);
  if (!found) {
    throw new Error("Failed to create agent conversation");
  }
  return found;
}

export async function appendAgentMessage(
  tenantId: string,
  conversationId: string,
  payload: {
    type: AgentMessageType;
    text?: string;
    contact?: { name: string; phone: string };
    location?: { label: string; lat: number; lng: number };
  }
): Promise<AgentConversation | null> {
  await ensureTenantSeed(tenantId);
  const client = await pool.connect();
  try {
    const exists = await client.query(
      `SELECT id FROM agent_conversations WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );
    if (exists.rows.length === 0) return null;

    await client.query(
      `INSERT INTO agent_messages
       (conversation_id, tenant_id, provider_message_id, type, direction, delivery_status, text_content, contact_payload, location_payload)
       VALUES ($1, $2, $3, $4, 'out', 'sent', $5, $6::jsonb, $7::jsonb)`,
      [
        conversationId,
        tenantId,
        `mock-${Date.now()}`,
        payload.type,
        payload.text ?? null,
        payload.contact ? JSON.stringify(payload.contact) : null,
        payload.location ? JSON.stringify(payload.location) : null,
      ]
    );

    await client.query(
      `UPDATE agent_conversations
       SET status = 'em_andamento', updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );
  } finally {
    client.release();
  }

  const refreshed = await listAgentConversations(tenantId);
  return refreshed.find((c) => c.id === conversationId) ?? null;
}

export async function updateAgentMessageStatus(input: {
  tenantId: string;
  messageId: string;
  deliveryStatus: AgentMessageDelivery;
  errorCode?: string | null;
  errorDescription?: string | null;
}): Promise<AgentConversation | null> {
  await ensureSchema();
  const client = await pool.connect();
  let conversationId: string | null = null;
  try {
    const msg = await client.query<{ conversation_id: string }>(
      `SELECT conversation_id
       FROM agent_messages
       WHERE id = $1 AND tenant_id = $2`,
      [input.messageId, input.tenantId]
    );
    if (msg.rows.length === 0) return null;
    conversationId = msg.rows[0].conversation_id;

    await client.query(
      `UPDATE agent_messages
       SET delivery_status = $1,
           error_code = $2,
           error_description = $3
       WHERE id = $4 AND tenant_id = $5`,
      [
        input.deliveryStatus,
        input.errorCode ?? null,
        input.errorDescription ?? null,
        input.messageId,
        input.tenantId,
      ]
    );

    await client.query(
      `UPDATE agent_conversations
       SET updated_at = now(),
           status = CASE
             WHEN $1 = 'failed' THEN status
             ELSE status
           END
       WHERE id = $2 AND tenant_id = $3`,
      [input.deliveryStatus, conversationId, input.tenantId]
    );
  } finally {
    client.release();
  }

  if (!conversationId) return null;
  const refreshed = await listAgentConversations(input.tenantId);
  return refreshed.find((c) => c.id === conversationId) ?? null;
}

export async function updateAgentMessageStatusByProvider(input: {
  tenantId: string;
  providerMessageId: string;
  deliveryStatus: AgentMessageDelivery;
  errorCode?: string | null;
  errorDescription?: string | null;
}): Promise<AgentConversation | null> {
  await ensureSchema();
  const client = await pool.connect();
  let messageId: string | null = null;
  try {
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM agent_messages
       WHERE provider_message_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.providerMessageId, input.tenantId]
    );
    if (result.rows.length === 0) return null;
    messageId = result.rows[0].id;
  } finally {
    client.release();
  }
  if (!messageId) return null;
  return updateAgentMessageStatus({
    tenantId: input.tenantId,
    messageId,
    deliveryStatus: input.deliveryStatus,
    errorCode: input.errorCode,
    errorDescription: input.errorDescription,
  });
}
