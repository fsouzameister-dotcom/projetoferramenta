import { pool } from "./db";
import {
  getOutboundWhatsAppContext,
  WHATSAPP_PROVIDER_CLOUD,
  WHATSAPP_PROVIDER_TWILIO,
} from "./whatsapp-channels";
import { sendWhatsAppTextMessage } from "./whatsapp-cloud-api";
import { sendTwilioWhatsAppTextMessage } from "./whatsapp-twilio-api";
import {
  buildTemplateMessageText,
  formatTemplateErrorDescription,
  sendOutboundTemplateMessage,
} from "./agent-template-outbound";

export type AgentConversationStatus = "em_espera" | "em_andamento" | "historico";
export type AgentMessageType = "text" | "contact" | "location";
export type AgentMessageDirection = "in" | "out";
export type AgentMessageDelivery = "sending" | "sent" | "delivered" | "read" | "failed";
export type AgentConversationLifecycleStatus = "open" | "closed_manual" | "closed_window";

export type AgentMessage = {
  id: string;
  provider_message_id?: string;
  type: AgentMessageType;
  direction: AgentMessageDirection;
  sender_name?: string;
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
  lifecycle_status: AgentConversationLifecycleStatus;
  closed_at?: string;
  closed_by?: string;
  last_customer_message_at?: string;
  window_expires_at?: string;
  outside_service_window: boolean;
  requires_template_to_resume: boolean;
  tags?: string[];
  metadata?: {
    queue?: string;
    templateName?: string;
    templateParams?: Record<string, string>;
  };
  messages: AgentMessage[];
};

export class AgentConversationRuleError extends Error {
  code: "CONVERSATION_CLOSED" | "WINDOW_CLOSED_TEMPLATE_REQUIRED";
  constructor(code: "CONVERSATION_CLOSED" | "WINDOW_CLOSED_TEMPLATE_REQUIRED", message: string) {
    super(message);
    this.code = code;
  }
}

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
      ALTER TABLE agent_messages
      ADD COLUMN IF NOT EXISTS sender_name text
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS metadata jsonb
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'open'
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS closed_at timestamptz
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS closed_by text
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS last_customer_message_at timestamptz
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS window_expires_at timestamptz
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_msg_tenant_wamid
      ON agent_messages (tenant_id, provider_message_id)
      WHERE provider_message_id LIKE 'wamid.%'
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

/** wa_id da Meta → mesmo formato amigável (+ e dígitos). */
export function normalizeWaIdToPhone(waId: string): string {
  const d = waId.replace(/\D/g, "");
  return d ? `+${d}` : waId.trim();
}

/** Apenas dígitos (ex.: comparar conversa salva com ou sem máscara). */
export function phoneDigitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
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
    const nowIso = new Date().toISOString();
    await client.query(
      `INSERT INTO agent_messages (conversation_id, tenant_id, type, direction, text_content, delivery_status, created_at)
       VALUES ($1, $2, 'text', 'in', $3, 'read', $4::timestamptz)`,
      [created.rows[0].id, tenantId, "Olá, quero informações sobre o plano.", nowIso]
    );
    await client.query(
      `UPDATE agent_conversations
       SET last_customer_message_at = $1::timestamptz,
           window_expires_at = ($1::timestamptz + interval '24 hours'),
           updated_at = now()
       WHERE id = $2 AND tenant_id = $3`,
      [nowIso, created.rows[0].id, tenantId]
    );
  } finally {
    client.release();
  }
}

async function syncWindowClosure(tenantId: string) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE agent_conversations
       SET lifecycle_status = 'closed_window',
           status = 'historico',
           closed_at = COALESCE(closed_at, now()),
           closed_by = COALESCE(closed_by, 'system:auto_window')
       WHERE tenant_id = $1
         AND lifecycle_status = 'open'
         AND window_expires_at IS NOT NULL
         AND window_expires_at <= now()`,
      [tenantId]
    );
  } finally {
    client.release();
  }
}

export async function listAgentConversations(tenantId: string): Promise<AgentConversation[]> {
  await ensureTenantSeed(tenantId);
  await syncWindowClosure(tenantId);
  const client = await pool.connect();
  try {
    const convs = await client.query<{
      id: string;
      contact_name: string;
      phone: string;
      status: AgentConversationStatus;
      lifecycle_status: AgentConversationLifecycleStatus;
      closed_at: string | null;
      closed_by: string | null;
      last_customer_message_at: string | null;
      window_expires_at: string | null;
      tags: string[];
      metadata: {
        queue?: string;
        templateName?: string;
        templateParams?: Record<string, string>;
      } | null;
      updated_at: string;
    }>(
      `SELECT id, contact_name, phone, status, lifecycle_status, closed_at, closed_by,
              last_customer_message_at, window_expires_at, tags, metadata, updated_at
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
      sender_name: string | null;
      delivery_status: AgentMessageDelivery | null;
      text_content: string | null;
      contact_payload: { name: string; phone: string } | null;
      location_payload: { label: string; lat: number; lng: number } | null;
      error_code: string | null;
      error_description: string | null;
      created_at: string;
    }>(
      `SELECT id, provider_message_id, conversation_id, type, direction, sender_name, delivery_status, text_content, contact_payload,
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
        sender_name: msg.sender_name ?? undefined,
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

    return convs.rows.map((conv) => {
      const outsideServiceWindow = Boolean(
        conv.window_expires_at && new Date(conv.window_expires_at).getTime() <= Date.now()
      );
      return {
        id: conv.id,
        contactName: conv.contact_name,
        phone: conv.phone,
        status: conv.status,
        lifecycle_status: conv.lifecycle_status,
        outside_service_window: outsideServiceWindow,
        requires_template_to_resume: outsideServiceWindow,
        tags: Array.isArray(conv.tags) ? conv.tags : [],
        messages: byConversation.get(conv.id) ?? [],
        ...(conv.closed_at ? { closed_at: conv.closed_at } : {}),
        ...(conv.closed_by ? { closed_by: conv.closed_by } : {}),
        ...(conv.last_customer_message_at
          ? { last_customer_message_at: conv.last_customer_message_at }
          : {}),
        ...(conv.window_expires_at ? { window_expires_at: conv.window_expires_at } : {}),
        ...(conv.metadata ? { metadata: conv.metadata } : {}),
      };
    });
  } finally {
    client.release();
  }
}

async function recordTemplateOutboundMessage(input: {
  conversationId: string;
  tenantId: string;
  phone: string;
  templateName: string;
  templateContentSid?: string;
  templateParams?: Record<string, string>;
  botName?: string;
  metadataExtra?: Record<string, unknown>;
}): Promise<void> {
  const normalizedBotName = input.botName?.trim() || "BOT";
  const sendResult = await sendOutboundTemplateMessage({
    tenantId: input.tenantId,
    phone: input.phone,
    templateName: input.templateName,
    templateContentSid: input.templateContentSid,
    templateParams: input.templateParams,
  });

  const textContent = buildTemplateMessageText({
    botName: normalizedBotName,
    templateName: input.templateName,
    templateContentSid: input.templateContentSid,
    sendOk: sendResult.ok,
  });

  const errorDescription = sendResult.ok
    ? null
    : formatTemplateErrorDescription({
        code: sendResult.code,
        message: sendResult.message,
        details: sendResult.details,
      });

  await pool.query(
    `INSERT INTO agent_messages
     (conversation_id, tenant_id, provider_message_id, type, direction, sender_name,
      delivery_status, text_content, error_code, error_description, metadata)
     VALUES ($1, $2, $3, 'text', 'out', $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      input.conversationId,
      input.tenantId,
      sendResult.ok ? sendResult.messageId : null,
      normalizedBotName,
      sendResult.ok ? "sent" : "failed",
      textContent,
      sendResult.ok ? null : sendResult.code ?? "TEMPLATE_SEND",
      errorDescription,
      JSON.stringify({
        ...(input.metadataExtra ?? {}),
        templateName: input.templateName,
        templateContentSid: input.templateContentSid?.trim() || null,
        templateParams: input.templateParams ?? {},
        templateProvider: sendResult.ok ? sendResult.provider : null,
      }),
    ]
  );
}

export async function createAgentConversation(input: {
  tenantId: string;
  contactName: string;
  phone: string;
  queue?: string;
  templateName?: string;
  /** Twilio Content SID (HX…), quando aplicável. */
  templateContentSid?: string;
  templateParams?: Record<string, string>;
  botName?: string;
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
          templateContentSid: input.templateContentSid?.trim() || null,
          templateParams: input.templateParams ?? {},
        }),
      ]
    );
    createdId = created.rows[0].id;

  } finally {
    client.release();
  }

  if (input.templateName) {
    await recordTemplateOutboundMessage({
      conversationId: createdId,
      tenantId: input.tenantId,
      phone: input.phone,
      templateName: input.templateName,
      templateContentSid: input.templateContentSid,
      templateParams: input.templateParams,
      botName: input.botName,
      metadataExtra: { queue: input.queue ?? null },
    });
  }

  const all = await listAgentConversations(input.tenantId);
  const found = all.find((c) => c.id === createdId);
  if (!found) {
    throw new Error("Failed to create agent conversation");
  }
  return found;
}

export async function patchAgentMessageWhatsAppDelivery(input: {
  tenantId: string;
  messageId: string;
  providerMessageId: string | null;
  deliveryStatus: AgentMessageDelivery;
  errorCode?: string | null;
  errorDescription?: string | null;
}): Promise<void> {
  await ensureSchema();
  await pool.query(
    `UPDATE agent_messages
     SET provider_message_id = $1,
         delivery_status = $2,
         error_code = $3,
         error_description = $4
     WHERE id = $5 AND tenant_id = $6`,
    [
      input.providerMessageId,
      input.deliveryStatus,
      input.errorCode ?? null,
      input.errorDescription ?? null,
      input.messageId,
      input.tenantId,
    ]
  );
}

export async function recordInboundWhatsAppMessage(input: {
  tenantId: string;
  providerMessageId: string;
  fromWaId: string;
  textBody: string;
  contactName?: string;
  timestampIso: string;
}): Promise<{ duplicate: boolean; conversationId?: string }> {
  await ensureSchema();
  await syncWindowClosure(input.tenantId);
  const digits = phoneDigitsOnly(input.fromWaId);
  const displayPhone = normalizeWaIdToPhone(input.fromWaId);
  const client = await pool.connect();
  try {
    let convId: string;
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM agent_conversations
       WHERE tenant_id = $1
         AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [input.tenantId, digits]
    );
    if (existing.rows.length > 0) {
      convId = existing.rows[0].id;
    } else {
      const created = await client.query<{ id: string }>(
        `INSERT INTO agent_conversations (tenant_id, contact_name, phone, status, tags, lifecycle_status)
         VALUES ($1, $2, $3, 'em_espera', '[]'::jsonb, 'open')
         RETURNING id`,
        [input.tenantId, input.contactName?.trim() || displayPhone, displayPhone]
      );
      convId = created.rows[0].id;
    }

    try {
      await client.query(
        `INSERT INTO agent_messages
         (conversation_id, tenant_id, provider_message_id, type, direction, delivery_status, text_content, created_at)
         VALUES ($1, $2, $3, 'text', 'in', 'read', $4, $5::timestamptz)`,
        [convId, input.tenantId, input.providerMessageId, input.textBody, input.timestampIso]
      );
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        return { duplicate: true };
      }
      throw e;
    }

    await client.query(
      `UPDATE agent_conversations
       SET last_customer_message_at = $1::timestamptz,
           window_expires_at = ($1::timestamptz + interval '24 hours'),
           lifecycle_status = 'open',
           status = CASE WHEN status = 'historico' THEN 'em_espera' ELSE status END,
           contact_name = COALESCE($3, contact_name),
           updated_at = now()
       WHERE id = $2 AND tenant_id = $4`,
      [input.timestampIso, convId, input.contactName?.trim() || null, input.tenantId]
    );

    return { duplicate: false, conversationId: convId };
  } finally {
    client.release();
  }
}

export async function appendAgentMessage(
  tenantId: string,
  conversationId: string,
  payload: {
    type: AgentMessageType;
    text?: string;
    contact?: { name: string; phone: string };
    location?: { label: string; lat: number; lng: number };
    senderName?: string;
  }
): Promise<AgentConversation | null> {
  await ensureTenantSeed(tenantId);
  await syncWindowClosure(tenantId);
  const waCtx = await getOutboundWhatsAppContext(tenantId);
  const normalizedSender = payload.senderName?.trim() || null;
  const normalizedText =
    payload.type === "text" && payload.text
      ? normalizedSender
        ? `${normalizedSender}:\n${payload.text}`
        : payload.text
      : payload.text;
  const useWhatsApp =
    Boolean(waCtx) &&
    payload.type === "text" &&
    Boolean((normalizedText ?? "").trim());

  let outboundMessageId: string | null = null;
  let customerPhone = "";

  const client = await pool.connect();
  try {
    const exists = await client.query<{
      id: string;
      phone: string;
      lifecycle_status: AgentConversationLifecycleStatus;
      window_expires_at: string | null;
    }>(
      `SELECT id, phone, lifecycle_status, window_expires_at
       FROM agent_conversations
       WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );
    if (exists.rows.length === 0) return null;
    customerPhone = exists.rows[0].phone;
    const conversation = exists.rows[0];
    const outsideWindow = Boolean(
      conversation.window_expires_at &&
        new Date(conversation.window_expires_at).getTime() <= Date.now()
    );
    if (conversation.lifecycle_status !== "open") {
      throw new AgentConversationRuleError(
        "CONVERSATION_CLOSED",
        "Conversa encerrada. Reabra o atendimento para enviar mensagens."
      );
    }
    if (outsideWindow && payload.type === "text") {
      throw new AgentConversationRuleError(
        "WINDOW_CLOSED_TEMPLATE_REQUIRED",
        "Janela da Meta encerrada. Envie template para retomar o atendimento."
      );
    }

    if (useWhatsApp) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO agent_messages
         (conversation_id, tenant_id, provider_message_id, type, direction, sender_name, delivery_status, text_content, contact_payload, location_payload)
         VALUES ($1, $2, NULL, $3, 'out', $4, 'sending', $5, $6::jsonb, $7::jsonb)
         RETURNING id`,
        [
          conversationId,
          tenantId,
          payload.type,
          normalizedSender,
          normalizedText ?? null,
          payload.contact ? JSON.stringify(payload.contact) : null,
          payload.location ? JSON.stringify(payload.location) : null,
        ]
      );
      outboundMessageId = inserted.rows[0].id;
    } else {
      await client.query(
        `INSERT INTO agent_messages
         (conversation_id, tenant_id, provider_message_id, type, direction, sender_name, delivery_status, text_content, contact_payload, location_payload)
         VALUES ($1, $2, $3, $4, 'out', $5, 'sent', $6, $7::jsonb, $8::jsonb)`,
        [
          conversationId,
          tenantId,
          `mock-${Date.now()}`,
          payload.type,
          normalizedSender,
          normalizedText ?? null,
          payload.contact ? JSON.stringify(payload.contact) : null,
          payload.location ? JSON.stringify(payload.location) : null,
        ]
      );
    }

    await client.query(
      `UPDATE agent_conversations
       SET status = 'em_andamento', updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );
  } finally {
    client.release();
  }

  if (useWhatsApp && waCtx && outboundMessageId) {
    const sendResult =
      waCtx.provider === WHATSAPP_PROVIDER_TWILIO
        ? await sendTwilioWhatsAppTextMessage({
            accountSid: waCtx.accountSid,
            authToken: waCtx.authToken,
            fromE164: waCtx.fromE164,
            toDigits: customerPhone,
            textBody: normalizedText ?? "",
          })
        : waCtx.provider === WHATSAPP_PROVIDER_CLOUD
          ? await sendWhatsAppTextMessage({
              phoneNumberId: waCtx.phoneNumberId,
              accessToken: waCtx.accessToken,
              toDigits: customerPhone,
              textBody: normalizedText ?? "",
            })
          : { ok: false as const, message: "Provedor WhatsApp desconhecido" };
    if (sendResult.ok) {
      await patchAgentMessageWhatsAppDelivery({
        tenantId,
        messageId: outboundMessageId,
        providerMessageId: sendResult.messageId,
        deliveryStatus: "sent",
      });
    } else {
      await patchAgentMessageWhatsAppDelivery({
        tenantId,
        messageId: outboundMessageId,
        providerMessageId: null,
        deliveryStatus: "failed",
        errorCode: sendResult.code != null ? String(sendResult.code) : "GRAPH_API",
        errorDescription: [sendResult.message, sendResult.details].filter(Boolean).join(" — "),
      });
    }
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

    const persistError = input.deliveryStatus === "failed";
    await client.query(
      `UPDATE agent_messages
       SET delivery_status = $1,
           error_code = $2,
           error_description = $3
       WHERE id = $4 AND tenant_id = $5`,
      [
        input.deliveryStatus,
        persistError ? input.errorCode ?? null : null,
        persistError ? input.errorDescription ?? null : null,
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

export async function closeAgentConversation(input: {
  tenantId: string;
  conversationId: string;
  closedBy?: string;
}): Promise<AgentConversation | null> {
  await ensureSchema();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE agent_conversations
       SET lifecycle_status = 'closed_manual',
           status = 'historico',
           closed_at = now(),
           closed_by = $3,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [input.conversationId, input.tenantId, input.closedBy?.trim() || "agent"]
    );
    if (result.rows.length === 0) return null;
  } finally {
    client.release();
  }
  const refreshed = await listAgentConversations(input.tenantId);
  return refreshed.find((c) => c.id === input.conversationId) ?? null;
}

export async function reopenAgentConversation(input: {
  tenantId: string;
  conversationId: string;
  reopenedBy?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
  botName?: string;
}): Promise<AgentConversation | null> {
  await ensureSchema();
  await syncWindowClosure(input.tenantId);
  const client = await pool.connect();
  try {
    const convResult = await client.query<{
      id: string;
      phone: string;
      window_expires_at: string | null;
    }>(
      `SELECT id, phone, window_expires_at
       FROM agent_conversations
       WHERE id = $1 AND tenant_id = $2`,
      [input.conversationId, input.tenantId]
    );
    if (convResult.rows.length === 0) return null;
    const outsideWindow = Boolean(
      convResult.rows[0].window_expires_at &&
        new Date(convResult.rows[0].window_expires_at).getTime() <= Date.now()
    );
    if (outsideWindow && !input.templateName?.trim()) {
      throw new AgentConversationRuleError(
        "WINDOW_CLOSED_TEMPLATE_REQUIRED",
        "Para reabrir fora da janela, envie um template aprovado."
      );
    }
    await client.query(
      `UPDATE agent_conversations
       SET lifecycle_status = 'open',
           status = 'em_andamento',
           closed_at = NULL,
           closed_by = NULL,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [input.conversationId, input.tenantId]
    );
  } finally {
    client.release();
  }

  const templateName = input.templateName?.trim();
  if (templateName) {
    const convRow = await pool.query<{ phone: string }>(
      `SELECT phone FROM agent_conversations WHERE id = $1 AND tenant_id = $2`,
      [input.conversationId, input.tenantId]
    );
    const phone = convRow.rows[0]?.phone;
    if (phone) {
      await recordTemplateOutboundMessage({
        conversationId: input.conversationId,
        tenantId: input.tenantId,
        phone,
        templateName,
        templateParams: input.templateParams,
        botName: input.botName,
        metadataExtra: {
          reopenedBy: input.reopenedBy ?? "agent",
          reopen: true,
        },
      });
    }
  }

  const refreshed = await listAgentConversations(input.tenantId);
  return refreshed.find((c) => c.id === input.conversationId) ?? null;
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

/** Handoff disparado pelo executor de fluxo (node transferir_agente). */
export async function applyFlowAgentHandoff(input: {
  tenantId: string;
  conversationId: string;
  queue: string;
  flowId?: string;
  nodeId?: string;
}): Promise<boolean> {
  await ensureSchema();
  const meta = {
    queue: input.queue,
    flowHandoff: true,
    flowId: input.flowId ?? null,
    handoffNodeId: input.nodeId ?? null,
    handoffAt: new Date().toISOString(),
  };
  const result = await pool.query(
    `UPDATE agent_conversations
     SET status = 'em_espera',
         metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
         tags = (
           CASE
             WHEN COALESCE(tags, '[]'::jsonb) @> '["Handoff fluxo"]'::jsonb THEN tags
             ELSE COALESCE(tags, '[]'::jsonb) || '["Handoff fluxo"]'::jsonb
           END
         ),
         updated_at = now()
     WHERE id = $2 AND tenant_id = $3`,
    [JSON.stringify(meta), input.conversationId, input.tenantId]
  );
  return (result.rowCount ?? 0) > 0;
}
